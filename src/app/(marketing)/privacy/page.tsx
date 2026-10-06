import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal";

export const metadata: Metadata = { title: "Privacy policy", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="6 October 2026">
      <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
        This policy describes how the QuoteFlow software handles data. The business operating this QuoteFlow service should review it with a legal adviser and add its company name, address and ICO registration number before launch.
      </p>
      <section>
        <h2>Who we are</h2>
        <p>QuoteFlow is the data controller for account data (your name, email and billing details) and a data processor for the customer data you add or that we detect in your mailbox on your behalf.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>Account details: name, business name, email address and a securely hashed password.</li>
          <li>Business settings: address, phone, website, logo, signature and follow-up preferences.</li>
          <li>Quote data: customer names, email addresses, phone numbers (optional), job descriptions and amounts.</li>
          <li>Email data, if you connect a mailbox: we read sent emails to detect quotes and incoming emails to detect customer replies. We store only the messages linked to your quotes (sender, recipient, subject, date and the message text), never your whole inbox.</li>
          <li>Billing data is handled by Stripe. We never see or store your full card number.</li>
          <li>Technical data: IP address and browser type for security, rate limiting and audit logs.</li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>Only to provide the service: detecting quotes, sending the follow-ups you’ve configured, stopping them when customers reply, notifying you, and billing. Our lawful bases are performance of a contract and legitimate interests. We never sell data or use it for advertising.</p>
      </section>
      <section>
        <h2>Google and Microsoft data</h2>
        <p>QuoteFlow’s use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements. Mailbox access tokens are encrypted at rest (AES-256-GCM). You can disconnect a mailbox at any time in Settings → Email, which deletes the stored tokens.</p>
      </section>
      <section>
        <h2>Sub-processors</h2>
        <ul>
          <li>Stripe — payments</li>
          <li>Resend — transactional email delivery</li>
          <li>Our hosting and database providers</li>
          <li>Google and Microsoft — only when you connect a mailbox</li>
        </ul>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>We keep your data while your account is open. You can export all your data or permanently delete your account and every record linked to it from Settings → Account. Backups are overwritten within 30 days.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>Under UK GDPR you can access, correct, export, restrict or delete your data, and object to processing. You can also complain to the Information Commissioner’s Office (ico.org.uk).</p>
      </section>
      <section>
        <h2>Cookies</h2>
        <p>We use a single essential cookie to keep you signed in, plus a short-lived cookie during email connection. We don’t use advertising or tracking cookies.</p>
      </section>
    </LegalPage>
  );
}
