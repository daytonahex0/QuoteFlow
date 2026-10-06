import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";
import { TRIAL_DAYS } from "@/lib/plans";

export const metadata: Metadata = { title: "Terms of service", alternates: { canonical: "/terms" } };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="6 October 2026">
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        These terms are a starting point and should be reviewed by a legal adviser, with the operating company’s details added, before launch.
      </p>
      <section>
        <h2>The service</h2>
        <p>QuoteFlow helps businesses follow up on quotes by sending emails on their behalf. You’re responsible for the content of messages you configure and for having a legitimate reason to contact each customer (normally, that they asked you for a quote).</p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>Keep your login details secure. You’re responsible for activity under your account and for the people you invite to it.</p>
      </section>
      <section>
        <h2>Free trial and billing</h2>
        <p>New accounts get a {TRIAL_DAYS}-day free trial. After that, a paid plan is needed to keep sending follow-ups. Plans are billed monthly in advance through Stripe and renew automatically until cancelled. You can upgrade, downgrade or cancel at any time; cancellations take effect at the end of the current billing period. If a payment fails, automation keeps running for a short grace period while payment is retried.</p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>No unsolicited bulk email, spam or marketing to people who haven’t requested a quote.</li>
          <li>No unlawful, misleading or abusive content.</li>
          <li>No attempts to access other customers’ data or disrupt the service.</li>
        </ul>
      </section>
      <section>
        <h2>Availability</h2>
        <p>We work hard to keep QuoteFlow running reliably, but we can’t guarantee uninterrupted service. Email delivery also depends on third parties such as Google, Microsoft and the recipient’s provider.</p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>To the extent permitted by law, our total liability is limited to the fees you paid in the 12 months before the claim. Nothing in these terms limits liability that can’t be limited under English law.</p>
      </section>
      <section>
        <h2>Governing law</h2>
        <p>These terms are governed by the laws of England and Wales.</p>
      </section>
    </LegalPage>
  );
}
