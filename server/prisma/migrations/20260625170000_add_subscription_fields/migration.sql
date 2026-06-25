-- Flat ₹2,500/month subscription gate on tenants (replaces per-message wallet billing).
-- Additive + non-destructive: two new columns with safe defaults, then a one-time rollout grant.

ALTER TABLE "tenants" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE "tenants" ADD COLUMN "subscriptionCurrentPeriodEnd" BIGINT NOT NULL DEFAULT 0;

-- Rollout grant: give every currently-active tenant one month (30 days) of access from the
-- moment this migration runs, so switching to subscription billing never cuts anyone off mid-stream.
-- 2592000000 ms = 30 days. EXTRACT(EPOCH ...) * 1000 = "now" in epoch milliseconds.
UPDATE "tenants"
SET "subscriptionStatus" = 'active',
    "subscriptionCurrentPeriodEnd" = (EXTRACT(EPOCH FROM now()) * 1000)::bigint + 2592000000
WHERE "status" = 'active';
