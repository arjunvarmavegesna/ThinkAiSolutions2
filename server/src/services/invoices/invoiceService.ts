/**
 * Minimal GST invoice generation, one invoice per recharge.
 *
 * TAX SPLIT (CONFIRMED BILLING RULES):
 * - Buyer state = explicit tenant.billing.stateCode if set, else derived from
 *   tenant.billing.gstin via stateCodeFromGstin (or the buyerStateCode/buyerGstin passed in).
 * - Seller GSTIN + state come from config.gst.
 * - If buyer state resolves AND equals the seller state -> intra-state -> CGST + SGST
 *   (split the GST total in half).
 * - If buyer state resolves AND differs from seller state -> inter-state -> IGST.
 * - If neither buyer state nor seller state can be resolved -> taxType 'unspecified',
 *   a single GST line, and we log a warning.
 *
 * IDEMPOTENCY: the invoice doc id is the Razorpay payment id, so webhook redelivery of the
 * same payment.captured event reuses the existing invoice instead of creating a duplicate.
 * Money is integer paise; CGST/SGST halves are computed so they sum back to gstTotal exactly.
 */

import { stateCodeFromGstin } from '@thinkai/shared';
import type { Invoice, InvoiceTaxType, Tenant, TenantBilling } from '@thinkai/shared';
import { Prisma } from '@prisma/client';
import type { Invoice as PInvoice } from '@prisma/client';

import { prisma } from '../../config/db';
import { config } from '../../config/env';
import { msBig, msNum } from '../../db/serde';
import { logger } from '../../lib/logger';

/** Convert a Prisma invoices row into the domain Invoice (number timestamps, no nulls). */
function toInvoice(row: PInvoice): Invoice {
  const out: Invoice = {
    invoiceNumber: row.invoiceNumber,
    tenantId: row.tenantId,
    taxableAmountPaise: row.taxableAmountPaise,
    gstTotalPaise: row.gstTotalPaise,
    taxType: row.taxType as InvoiceTaxType,
    razorpayPaymentId: row.razorpayPaymentId,
    razorpayOrderId: row.razorpayOrderId,
    createdAt: msNum(row.createdAt) as number,
  };
  if (row.cgstPaise !== null) out.cgstPaise = row.cgstPaise;
  if (row.sgstPaise !== null) out.sgstPaise = row.sgstPaise;
  if (row.igstPaise !== null) out.igstPaise = row.igstPaise;
  if (row.sellerGstin !== null) out.sellerGstin = row.sellerGstin;
  if (row.sellerStateCode !== null) out.sellerStateCode = row.sellerStateCode;
  if (row.buyerGstin !== null) out.buyerGstin = row.buyerGstin;
  if (row.buyerStateCode !== null) out.buyerStateCode = row.buyerStateCode;
  return out;
}

/**
 * Build a simple, human-readable invoice number. Phase 1 keeps numbering simple: a fixed
 * prefix plus the recharge timestamp and a short slice of the payment id for uniqueness.
 */
function buildInvoiceNumber(paymentId: string, createdAt: number): string {
  const date = new Date(createdAt);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  // Last 8 chars of the payment id give a stable, unique-enough suffix per payment.
  const suffix = paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();
  return `INV-${yyyy}${mm}-${suffix}`;
}

/** Resolve the buyer's GST state code from explicit inputs or the tenant's billing record. */
function resolveBuyerStateCode(
  tenant: Tenant | undefined,
  explicitStateCode?: string,
  explicitGstin?: string,
): string | null {
  // Priority: explicit stateCode -> tenant.billing.stateCode -> GSTIN-derived (explicit then tenant).
  if (explicitStateCode && explicitStateCode.trim().length > 0) return explicitStateCode;
  const billing = tenant?.billing;
  if (billing?.stateCode && billing.stateCode.trim().length > 0) return billing.stateCode;
  if (explicitGstin) {
    const fromExplicit = stateCodeFromGstin(explicitGstin);
    if (fromExplicit) return fromExplicit;
  }
  if (billing?.gstin) {
    const fromTenant = stateCodeFromGstin(billing.gstin);
    if (fromTenant) return fromTenant;
  }
  return null;
}

/** The tax breakdown derived from buyer vs seller state. */
interface TaxBreakdown {
  taxType: InvoiceTaxType;
  cgstPaise?: number;
  sgstPaise?: number;
  igstPaise?: number;
}

/**
 * Decide the GST split. CGST/SGST split halves the total such that cgst + sgst == gstTotal
 * exactly even when gstTotal is odd (the remainder lands on SGST).
 */
function computeTaxBreakdown(
  gstTotalPaise: number,
  buyerStateCode: string | null,
  sellerStateCode: string | undefined,
  tenantId: string,
): TaxBreakdown {
  const sellerResolved = !!sellerStateCode && sellerStateCode.trim().length > 0;

  if (!buyerStateCode && !sellerResolved) {
    // Cannot determine place of supply on either side — record as unspecified.
    logger.warn(
      { tenantId },
      'invoice: neither buyer nor seller state resolvable; taxType=unspecified',
    );
    return { taxType: 'unspecified' };
  }

  if (buyerStateCode && sellerResolved && buyerStateCode === sellerStateCode) {
    // Intra-state supply: CGST + SGST, each ~half of the GST total.
    const cgstPaise = Math.floor(gstTotalPaise / 2);
    const sgstPaise = gstTotalPaise - cgstPaise; // absorb the odd paise here
    return { taxType: 'cgst_sgst', cgstPaise, sgstPaise };
  }

  // Inter-state supply (or only one side resolvable): IGST on the full GST total.
  return { taxType: 'igst', igstPaise: gstTotalPaise };
}

/**
 * Create (or return the existing) GST invoice for a captured recharge payment.
 * Idempotent: invoices/{paymentId}. Safe to call from the Razorpay webhook on redelivery.
 */
export async function createForRecharge(
  tenantId: string,
  params: {
    paymentId: string;
    orderId: string;
    creditPaise: number;
    gstPaise: number;
    buyerGstin?: string;
    buyerStateCode?: string;
  },
): Promise<Invoice> {
  const { paymentId, orderId, creditPaise, gstPaise, buyerGstin, buyerStateCode } = params;

  // Idempotency: an invoice already exists for this payment -> return it unchanged.
  const existing = await prisma.invoice.findUnique({ where: { razorpayPaymentId: paymentId } });
  if (existing) {
    return toInvoice(existing);
  }

  // Load the tenant for billing identity (buyer GSTIN / state) — tolerate a missing row.
  const tenantRow = await prisma.tenant.findUnique({ where: { id: tenantId } });
  const tenant: Tenant | undefined = tenantRow
    ? ({ billing: tenantRow.billing as TenantBilling } as Tenant)
    : undefined;

  const sellerStateCode = config.gst.sellerStateCode;
  const sellerGstin = config.gst.sellerGstin;

  const resolvedBuyerState = resolveBuyerStateCode(tenant, buyerStateCode, buyerGstin);
  const resolvedBuyerGstin = buyerGstin ?? tenant?.billing?.gstin;

  const breakdown = computeTaxBreakdown(
    gstPaise,
    resolvedBuyerState,
    sellerStateCode,
    tenantId,
  );

  const createdAt = Date.now();

  // Build the invoice document, omitting optional fields that are undefined (Firestore
  // rejects undefined values). Spread the breakdown's defined tax lines only.
  const invoice: Invoice = {
    invoiceNumber: buildInvoiceNumber(paymentId, createdAt),
    tenantId,
    taxableAmountPaise: creditPaise,
    gstTotalPaise: gstPaise,
    taxType: breakdown.taxType,
    ...(breakdown.cgstPaise !== undefined ? { cgstPaise: breakdown.cgstPaise } : {}),
    ...(breakdown.sgstPaise !== undefined ? { sgstPaise: breakdown.sgstPaise } : {}),
    ...(breakdown.igstPaise !== undefined ? { igstPaise: breakdown.igstPaise } : {}),
    ...(sellerGstin ? { sellerGstin } : {}),
    ...(sellerStateCode ? { sellerStateCode } : {}),
    ...(resolvedBuyerGstin ? { buyerGstin: resolvedBuyerGstin } : {}),
    ...(resolvedBuyerState ? { buyerStateCode: resolvedBuyerState } : {}),
    razorpayPaymentId: paymentId,
    razorpayOrderId: orderId,
    createdAt,
  };

  // create fails (P2002) if the row already exists, closing the race with a concurrent redelivery.
  try {
    await prisma.invoice.create({
      data: {
        razorpayPaymentId: paymentId,
        invoiceNumber: invoice.invoiceNumber,
        tenantId,
        taxableAmountPaise: invoice.taxableAmountPaise,
        gstTotalPaise: invoice.gstTotalPaise,
        taxType: invoice.taxType,
        ...(invoice.cgstPaise !== undefined ? { cgstPaise: invoice.cgstPaise } : {}),
        ...(invoice.sgstPaise !== undefined ? { sgstPaise: invoice.sgstPaise } : {}),
        ...(invoice.igstPaise !== undefined ? { igstPaise: invoice.igstPaise } : {}),
        ...(invoice.sellerGstin ? { sellerGstin: invoice.sellerGstin } : {}),
        ...(invoice.sellerStateCode ? { sellerStateCode: invoice.sellerStateCode } : {}),
        ...(invoice.buyerGstin ? { buyerGstin: invoice.buyerGstin } : {}),
        ...(invoice.buyerStateCode ? { buyerStateCode: invoice.buyerStateCode } : {}),
        razorpayOrderId: orderId,
        createdAt: msBig(createdAt),
      },
    });
  } catch (err) {
    // Lost the race — another handler created it first. Return the persisted record.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raced = await prisma.invoice.findUnique({ where: { razorpayPaymentId: paymentId } });
      if (raced) return toInvoice(raced);
    }
    throw new Error('Failed to create invoice');
  }

  return invoice;
}
