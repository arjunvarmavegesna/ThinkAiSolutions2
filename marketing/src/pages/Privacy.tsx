import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_TEL } from '../lib/config';

const LAST_UPDATED = 'June 2026';

/** A titled policy section with a stable anchor id. */
function Clause({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function Privacy() {
  useDocumentTitle('Privacy Policy');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-slate-600">Last updated: {LAST_UPDATED}</p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl space-y-10">
          <p className="text-[15px] leading-relaxed text-slate-700">
            This Privacy Policy explains how <strong>ThinkAiSolutions</strong> (“ThinkAiSolutions”,
            “we”, “us”) collects, uses, shares, and protects information in connection with our
            WhatsApp Business messaging platform (the “Service”), available at
            thinkaisolutions.com and console.thinkaisolutions.com. The Service is built on the
            Meta WhatsApp Cloud API, and our use of information received from Meta complies with
            Meta&apos;s Platform Terms and Developer Policies.
          </p>

          <Clause id="who-we-are" title="1. Who we are">
            <p>
              ThinkAiSolutions provides a software service that lets businesses (our “Clients”)
              send and receive WhatsApp messages through the official Meta WhatsApp Cloud API. We
              act as a WhatsApp Tech Provider: Clients onboard their own WhatsApp Business
              Accounts and phone numbers onto our platform and use our dashboard to manage
              templates, campaigns, a team inbox, billing, and analytics.
            </p>
            <p>
              {BUSINESS.name} is a {BUSINESS.type.toLowerCase()} ({BUSINESS.registration}) based in
              India, with its registered address at {BUSINESS.fullAddress}. For privacy matters,
              the data controller is {BUSINESS.name}, reachable at the contact details in section
              13.
            </p>
          </Clause>

          <Clause id="roles" title="2. Our role: controller and processor">
            <p>
              For information about our Clients and their account users (sign-up details, billing
              records), we act as a <strong>data controller</strong>.
            </p>
            <p>
              For the contents of WhatsApp conversations between a Client and that Client&apos;s
              own customers (“End Customers”), the Client is the controller and we act as a{' '}
              <strong>data processor</strong> — we process those messages on the Client&apos;s
              behalf and under their instructions, only to provide the Service.
            </p>
          </Clause>

          <Clause id="data-we-collect" title="3. Information we collect">
            <p>
              <strong>Client &amp; account data.</strong> Business name, contact name, email
              address, and authentication details for users who sign in to the console; WhatsApp
              Business Account and phone number identifiers captured during onboarding; and
              billing data such as wallet transactions, recharges, and GST details.
            </p>
            <p>
              <strong>Messaging data (on behalf of Clients).</strong> The content and metadata of
              WhatsApp messages sent and received through the Service — including phone numbers,
              message text and media, message templates, timestamps, and delivery/read status —
              processed so the Client can communicate with their End Customers.
            </p>
            <p>
              <strong>Technical data.</strong> Standard server logs (such as IP address, request
              metadata, and error logs) used to operate, secure, and debug the Service.
            </p>
          </Clause>

          <Clause id="how-we-use" title="4. How we use information">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>To deliver the Service — sending and receiving messages, templates, and campaigns.</li>
              <li>To operate the shared inbox, conversation history, and delivery analytics.</li>
              <li>To process wallet recharges and generate GST invoices.</li>
              <li>To authenticate users, enforce tenant isolation, and secure accounts.</li>
              <li>To provide support and to maintain, monitor, and improve the Service.</li>
              <li>To comply with legal obligations and Meta&apos;s platform requirements.</li>
            </ul>
            <p>
              We do not sell personal information, and we do not use the contents of End Customer
              conversations for advertising.
            </p>
          </Clause>

          <Clause id="meta" title="5. WhatsApp & the Meta Cloud API">
            <p>
              Messages are transmitted through the Meta WhatsApp Cloud API. Meta processes this
              data as described in its own privacy and platform policies. We access Client WhatsApp
              Business Accounts using permissions granted through Meta&apos;s onboarding
              (Embedded Signup); we never store a Client&apos;s Meta password.
            </p>
          </Clause>

          <Clause id="sub-processors" title="6. Sub-processors & sharing">
            <p>We share data only with service providers that help us run the Service:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                <strong>Meta Platforms</strong> — WhatsApp message delivery via the Cloud API.
              </li>
              <li>
                <strong>Google Cloud / Firebase</strong> — hosting, database, and authentication.
              </li>
              <li>
                <strong>Razorpay</strong> — payment processing for wallet recharges.
              </li>
            </ul>
            <p>
              We may also disclose information if required by law, or to protect the rights,
              safety, and security of our users and the Service.
            </p>
          </Clause>

          <Clause id="retention" title="7. Data retention">
            <p>
              We retain Client and account data for as long as an account is active and as needed
              to provide the Service, meet legal and tax obligations (such as GST invoice records),
              and resolve disputes. Messaging data processed on behalf of a Client is retained
              according to that Client&apos;s use of the Service and is deleted on request as
              described below.
            </p>
          </Clause>

          <Clause id="security" title="8. Security">
            <p>
              We protect data with encryption in transit, access controls, role-based permissions,
              and strict per-tenant data isolation. Secrets and access tokens are held server-side
              and are never exposed to the browser. No system is perfectly secure, but we work to
              protect your information using industry-standard safeguards.
            </p>
          </Clause>

          <Clause id="your-rights" title="9. Your rights & choices">
            <p>
              Depending on your location, you may have rights to access, correct, or delete your
              personal information. Clients can manage much of their data directly in the console.
              For requests we can&apos;t fully serve in-product, contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
                {CONTACT_EMAIL}
              </a>
              . End Customers should contact the relevant business (our Client) for requests about
              their conversations; we will assist that Client as their processor.
            </p>
          </Clause>

          <Clause id="deletion" title="10. Data deletion">
            <p>
              You can request deletion of your data at any time. See our{' '}
              <Link to="/data-deletion" className="font-semibold text-brand-700 hover:underline">
                Data Deletion
              </Link>{' '}
              page for how to make a request and how our deletion process works, including the
              automated Meta deauthorization and data-deletion callbacks.
            </p>
          </Clause>

          <Clause id="children" title="11. Children">
            <p>
              The Service is intended for businesses and is not directed to children. We do not
              knowingly collect personal information from children.
            </p>
          </Clause>

          <Clause id="changes" title="12. Changes to this policy">
            <p>
              We may update this Privacy Policy from time to time. We will revise the “Last
              updated” date above and, where appropriate, notify Clients of material changes.
            </p>
          </Clause>

          <Clause id="contact" title="13. Contact us">
            <p>Questions about this policy or your data? Reach the data controller:</p>
            <ul className="list-none space-y-1">
              <li>
                <strong>{BUSINESS.name}</strong> ({BUSINESS.type}, {BUSINESS.registration})
              </li>
              <li>{BUSINESS.fullAddress}</li>
              <li>
                Email:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>
                Phone:{' '}
                <a href={`tel:${CONTACT_PHONE_TEL}`} className="text-brand-700 hover:underline">
                  {CONTACT_PHONE}
                </a>
              </li>
            </ul>
          </Clause>
        </div>
      </Section>
    </>
  );
}
