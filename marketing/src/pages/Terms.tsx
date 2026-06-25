import { Link } from 'react-router-dom';
import Section from '../components/Section';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { BUSINESS, CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_TEL } from '../lib/config';

const LAST_UPDATED = 'June 2026';

/** A titled terms section with a stable anchor id. */
function Clause({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display text-xl font-bold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function Terms() {
  useDocumentTitle('Terms of Service');

  return (
    <>
      <Section className="bg-hero-mesh">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-slate-600">Last updated: {LAST_UPDATED}</p>
        </div>
      </Section>

      <Section>
        <div className="mx-auto max-w-3xl space-y-10">
          <p className="text-[15px] leading-relaxed text-slate-700">
            These Terms of Service (“Terms”) govern your access to and use of the WhatsApp Business
            messaging platform (the “Service”) operated by <strong>{BUSINESS.name}</strong> (“
            {BUSINESS.name}”, “we”, “us”), a {BUSINESS.type.toLowerCase()} ({BUSINESS.registration})
            based in {BUSINESS.region}, India, available at thinkaisolutions.com and
            console.thinkaisolutions.com. Our{' '}
            <Link to="/privacy" className="font-semibold text-brand-700 hover:underline">
              Privacy Policy
            </Link>{' '}
            is incorporated into these Terms by reference. Please read them carefully.
          </p>

          <Clause id="acceptance" title="1. Acceptance of terms">
            <p>
              By accessing or using the Service, you agree to be bound by these Terms. If you are
              using the Service on behalf of a business or other organization, you represent that
              you are authorized to bind that organization, and “you” refers to that organization.
              If you do not agree to these Terms, do not use the Service.
            </p>
          </Clause>

          <Clause id="service" title="2. Description of service">
            <p>
              {BUSINESS.name} provides a WhatsApp Business messaging platform built on the official
              Meta WhatsApp Cloud API. The Service lets businesses — such as clinics, hospitals,
              and hotels — send template messages, create and manage WhatsApp message templates,
              run campaigns, handle conversations from a shared team inbox, and view delivery
              analytics. We act as a WhatsApp Tech Provider; you connect your own WhatsApp Business
              Account and phone number through Meta&apos;s onboarding and use our dashboard to
              operate it.
            </p>
          </Clause>

          <Clause id="registration" title="3. Accounts, credentials &amp; API keys">
            <p>
              You must be at least <strong>18 years old</strong> and able to form a legally binding
              contract to use the Service. You agree to provide accurate, current, and complete
              information when you register and to keep it up to date.
            </p>
            <p>
              You are responsible for safeguarding your login credentials and for all activity that
              occurs under your account. Notify us promptly at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-700 hover:underline">
                {CONTACT_EMAIL}
              </a>{' '}
              if you suspect any unauthorized use.
            </p>
            <p>
              The Service may issue you <strong>scoped API keys</strong> so your own systems can
              send messages and access your account programmatically. These keys act on your behalf
              and carry the same authority as signing in. Keep them <strong>secret</strong> — never
              embed them in browser or client-side code, share them publicly, or commit them to a
              public repository — and rotate them promptly if they may have been exposed. You are
              responsible for all activity carried out with your credentials and API keys.
            </p>
          </Clause>

          <Clause id="acceptable-use" title="4. Acceptable use">
            <p>When using the Service, you agree that you will:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Comply with the{' '}
                <a
                  href="https://business.whatsapp.com/policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  WhatsApp Business Messaging Policy
                </a>
                , the{' '}
                <a
                  href="https://www.whatsapp.com/legal/commerce-policy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 hover:underline"
                >
                  WhatsApp Commerce Policy
                </a>
                , and Meta&apos;s Business Terms and other applicable Meta platform, commerce, and
                business policies. We may suspend or disable accounts that violate them.
              </li>
              <li>
                Send messages only to recipients who have given valid consent / opted in to hear
                from you.
              </li>
              <li>Not send spam, bulk unsolicited messages, or use purchased contact lists.</li>
              <li>
                Not send any content that is illegal, fraudulent, deceptive, abusive, harassing, or
                that infringes the rights of others.
              </li>
              <li>
                Not attempt to disrupt, overload, reverse-engineer, or gain unauthorized access to
                the Service or its underlying systems.
              </li>
            </ul>
            <p>
              Violating these rules — or causing your WhatsApp number quality to fall or your
              templates/account to be restricted by Meta — may lead to suspension or termination.
            </p>
          </Clause>

          <Clause id="fees" title="5. Fees, billing & wallet">
            <p>
              The Service is billed on a <strong>prepaid wallet</strong> basis. You top up your
              wallet in advance, and outbound messages are charged against that balance. Wallet
              recharges are processed through <strong>Razorpay</strong>, and applicable GST (18%) is
              added once at the time of recharge.
            </p>
            <p>
              Outbound messages are charged per message according to their category (for example,
              marketing, utility, or authentication) at the rates shown in your console. Replies you
              send to a customer within WhatsApp&apos;s 24-hour service window are free. The
              applicable charge is deducted from your wallet before a message is sent, and a send
              will be blocked if your balance is insufficient.
            </p>
            <p>
              Charges for messages that have already been sent are <strong>non-refundable</strong>.
              If a message fails to send, the charge for that message is automatically credited back
              to your wallet. Refunds of any unused wallet balance are at our discretion and subject
              to applicable law. We may change our prices, with notice through the Service.
            </p>
          </Clause>

          <Clause id="client-responsibilities" title="6. Client responsibilities">
            <p>
              You own and are solely responsible for the content of the messages you send and for
              your contact lists. You are responsible for obtaining and maintaining valid consent
              from your recipients and for ensuring that your use of the Service complies with all
              laws that apply to you and to your recipients, including data-protection and anti-spam
              laws.
            </p>
            <p>
              You are responsible for the accuracy of the information you send to your customers
              (such as appointment, booking, or order details) and for handling your customers&apos;
              requests and communications.
            </p>
          </Clause>

          <Clause id="data" title="7. Data &amp; privacy">
            <p>
              How we collect, use, share, retain, and protect personal information — and the
              sub-processors we rely on (Meta / WhatsApp, Google Cloud / Firebase, and Razorpay) —
              is described in our{' '}
              <Link to="/privacy" className="font-semibold text-brand-700 hover:underline">
                Privacy Policy
              </Link>
              , which forms part of these Terms.
            </p>
            <p>
              For the WhatsApp conversations between you and your own customers, you are the data
              controller and we act as your processor: we handle that message data only to provide
              the Service and under your instructions. You remain responsible for having a lawful
              basis and the necessary consents for the personal data you process through the
              Service.
            </p>
          </Clause>

          <Clause id="third-party" title="8. Third-party services">
            <p>
              The Service relies on third-party providers — in particular{' '}
              <strong>Meta / WhatsApp</strong> (message delivery via the Cloud API) and{' '}
              <strong>Razorpay</strong> (payments). Your use of those services is also subject to
              their own terms.
            </p>
            <p>
              Their availability, features, policies, and pricing are outside our control. We are
              not responsible or liable for their outages, changes, decisions, or actions — for
              example, template approvals or rejections, number bans or quality changes imposed by
              Meta, or payment-gateway downtime.
            </p>
          </Clause>

          <Clause id="ip" title="9. Intellectual property">
            <p>
              The Service, including its software, dashboard, and the {BUSINESS.name} name and logo,
              is owned by {BUSINESS.name} and protected by applicable laws. We grant you a limited,
              non-exclusive, non-transferable right to use the Service while these Terms are in
              effect.
            </p>
            <p>
              You retain all rights to your own content and data. You may not copy, resell,
              sublicense, or create derivative works of the platform, or remove any proprietary
              notices.
            </p>
          </Clause>

          <Clause id="liability" title="10. Limitation of liability & disclaimer">
            <p>
              The Service is provided <strong>“as is” and “as available”</strong>, without
              warranties of any kind, whether express or implied, including fitness for a particular
              purpose and uninterrupted or error-free operation. We do not guarantee that any
              message will be delivered, as delivery depends on Meta/WhatsApp and the recipient.
            </p>
            <p>
              To the maximum extent permitted by law, {BUSINESS.name} will not be liable for any
              indirect, incidental, special, or consequential damages, or for lost profits or
              business. Our total liability for any claim relating to the Service will not exceed
              the amount you paid to us for the Service in the three (3) months before the event
              giving rise to the claim.
            </p>
          </Clause>

          <Clause id="termination" title="11. Termination">
            <p>
              You may stop using the Service and close your account at any time. We may suspend or
              terminate your access if you breach these Terms or the acceptable-use rules, violate
              the WhatsApp/Meta policies, fail to pay applicable charges, or where required to
              protect the Service or comply with law.
            </p>
            <p>
              On termination, your right to use the Service ends. Certain records may be retained as
              described in our{' '}
              <Link to="/privacy" className="font-semibold text-brand-700 hover:underline">
                Privacy Policy
              </Link>{' '}
              or as required by law (such as GST invoice records).
            </p>
          </Clause>

          <Clause id="governing-law" title="12. Governing law &amp; jurisdiction">
            <p>
              These Terms are governed by and construed in accordance with the laws of India,
              without regard to its conflict-of-laws rules. You agree that the courts at{' '}
              <strong>West Godavari District, {BUSINESS.region}</strong>, India, will have exclusive
              jurisdiction over any dispute arising out of or relating to these Terms or the
              Service.
            </p>
          </Clause>

          <Clause id="changes" title="13. Changes to terms">
            <p>
              We may update these Terms from time to time. We will revise the “Last updated” date
              above and, for material changes, take reasonable steps to notify you. Your continued
              use of the Service after changes take effect means you accept the updated Terms.
            </p>
          </Clause>

          <Clause id="contact" title="14. Contact us">
            <p>Questions about these Terms? Reach us:</p>
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
