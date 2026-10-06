# QuoteFlow

**Turn more quotes into booked jobs.** QuoteFlow automatically follows up with customers who haven't responded to a quote — and stops the moment they reply.

A mobile-first B2B SaaS for trades and service businesses, built with Next.js 15 (App Router), TypeScript, Tailwind CSS 4, PostgreSQL + Prisma, Stripe, Resend, and Gmail / Microsoft Graph OAuth.

## What's in the box

| Area | Details |
|---|---|
| Marketing | `/`, `/features`, `/pricing`, `/privacy`, `/terms` with metadata, sitemap and robots |
| Auth | Email + password (bcrypt), DB-backed sessions (hashed tokens, httpOnly cookies), email verification, password reset, Google / Microsoft sign-in, team invitations |
| Onboarding | 5-step wizard: business type → how you send quotes → follow-up timing → connect email → first message style |
| Quotes | Search, status/date filters, sort, mobile cards, manual entry, detail page with timeline, conversation and actions (pause, resume, won, lost, customer replied, send now, change/edit sequence, delete) |
| Follow-ups | Sequences with editable delay / subject / message, `{{variables}}`, live preview, **Save template** and **Send test** |
| Automation | Scheduling within sending hours and time zone, weekends on/off, daily cap, retries with backoff, row-locked claiming (safe with multiple workers), stale-lock recovery, overdue detection |
| Email integration | Gmail API and Microsoft Graph: detects sent quotes (recipient, amount, description), sends follow-ups from your own mailbox in the original thread, detects replies |
| Reply safety | Replies are checked during every mailbox sync **and** just before each send; a reply cancels all pending follow-ups atomically |
| Notifications | In-app and email: customer replied, quote won, overdue, automation failed, email connection expired, billing |
| Billing | Stripe Checkout, plan changes with proration, cancel/resume, customer portal, webhooks (signature-verified, idempotent), payment-failure grace period, server-side plan limits |
| Analytics | Quotes sent, followed up, reply rate, won, quote value, revenue recovered, average response time; 7/30/90 days and custom ranges; CSV export on Pro |
| Settings | Business (logo, address, website, phone, signature), email accounts, follow-up rules, notifications, billing, team, account (profile, password, data export, delete) |

## Quick start

```bash
cp .env.example .env          # fill in DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY
npm install
npx prisma migrate deploy     # create tables
npm run dev                   # http://localhost:3000
npm run worker                # in a second terminal: background automation
```

Without `RESEND_API_KEY`, development mode writes emails (verification links, follow-ups, tests) to the server log instead of sending them. In production, the app refuses to pretend: follow-ups need a connected mailbox or Resend, and the UI says so.

## Background jobs

All background work runs in `runTick()` (`src/lib/automation/tick.ts`): sync mailboxes → send due follow-ups → flag overdue quotes → periodic cleanup. Run it either way:

- **Long-running worker:** `npm run worker` (Railway, Render, Fly, a VM, etc.).
- **Scheduled HTTP:** call `GET /api/cron/tick` every minute with `Authorization: Bearer $CRON_SECRET`. `vercel.json` configures this for Vercel (per-minute crons need a Pro plan).

Running both at once is safe; follow-ups are claimed with `FOR UPDATE SKIP LOCKED`.

## Integrations setup

### Gmail
1. In Google Cloud Console, enable the Gmail API and create an OAuth client (Web application).
2. Redirect URI: `${APP_URL}/api/oauth/google/callback`.
3. Scopes: `openid email profile gmail.readonly gmail.send`. `gmail.readonly` is a restricted scope, so public use needs Google's OAuth verification and security assessment.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Outlook / Microsoft 365
1. Register an app in Microsoft Entra ID (multi-tenant + personal accounts).
2. Web redirect URI: `${APP_URL}/api/oauth/microsoft/callback`.
3. Delegated permissions: `Mail.Read`, `Mail.Send`, `User.Read`, `offline_access`.
4. Set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`.

The same callback URLs also handle "Continue with Google / Microsoft" sign-in.

### Stripe
1. Create three monthly GBP prices (£39, £79, £149) and set `STRIPE_PRICE_STARTER/GROWTH/PRO`.
2. Add a webhook endpoint at `${APP_URL}/api/webhooks/stripe` for: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`, `invoice.paid`. Set `STRIPE_WEBHOOK_SECRET`.
3. Enable the Customer Portal (plan switching, cancellation, payment methods) in the Stripe dashboard.

New organisations get a 14-day app trial with Growth features and no card. Choosing a plan during the trial carries the remaining trial days into Stripe.

### Resend
Set `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain). Optionally, for reply detection on follow-ups that QuoteFlow sends on a business's behalf (no mailbox connected), configure Resend inbound email on `INBOUND_DOMAIN`, point its `email.received` webhook at `/api/webhooks/inbound`, and set `RESEND_WEBHOOK_SECRET`. Replies go to signed `reply+<quote>.<sig>@INBOUND_DOMAIN` addresses.

## Security notes

- Every page and server action calls `requireOrg()`, and every query is scoped by `organisationId`. Records owned by another organisation return "not found".
- Roles: owner / admin / member. Billing, email connections, business settings and team management need owner or admin.
- Sessions use random 256-bit tokens. The database stores only SHA-256 hashes. Cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.
- Server actions get Next.js's built-in Origin check (CSRF). OAuth uses `state` + PKCE in a signed, short-lived cookie.
- OAuth tokens are encrypted at rest with AES-256-GCM (`ENCRYPTION_KEY`).
- Rate limits are Postgres-backed, so they work across instances: login, signup, password reset, verification, test emails, invites, sync.
- Webhooks are signature-verified: Stripe via `constructEvent`, inbound via Svix HMAC with replay window. Stripe events are idempotent.
- All user content in emails is HTML-escaped, MIME headers are sanitised against injection, and CSV exports neutralise formula injection.
- Logo uploads accept PNG/JPEG/WebP only, are checked by magic bytes, and are served with `nosniff` and a locked-down CSP.
- Microsoft sign-in never links to an existing account by email (prevents "nOAuth" takeover).
- Security headers: CSP, HSTS (production), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.
- Structured JSON logs with secrets redacted. `audit.*` events cover sign-ins, password changes, connections, exports and deletions.

## GDPR

Only messages linked to quotes are stored, never whole inboxes. Disconnecting a mailbox deletes its tokens and revokes Google access. **Settings → Account** offers a full JSON data export and permanent account deletion, which cascades through all organisation data and cancels Stripe. The privacy policy and terms are templates: have them reviewed and add your company details before launch.

## Testing

```bash
createdb quoteflow_test       # or set TEST_DATABASE_URL
npm test                      # unit + DB-backed integration tests (vitest)
npm run typecheck && npm run lint
```

The integration suite runs the real automation engine against Postgres with a fake mailbox. It covers scheduling, sending, the stop-on-reply guarantee (including a reply that arrives after a send is claimed), just-in-time reply checks, pause/resume, won/lost, send-now, sending windows and the daily cap, retries, expired mailboxes, concurrent workers, quote detection and threading, plan limits, trial expiry, Stripe sync, and cross-organisation isolation.

## Project layout

```
prisma/schema.prisma          data model + migrations
src/app/(marketing)           public site
src/app/(auth)                login, signup, reset, verify, invite
src/app/onboarding            setup wizard
src/app/(app)                 dashboard, quotes, follow-ups, analytics, notifications, settings
src/app/actions               server actions (validated, authorised, friendly errors)
src/app/api                   OAuth, webhooks, cron, export, reports, health
src/lib/automation            follow-up engine, reply handling, tick
src/lib/email                 Gmail/Graph clients, quote detection, sync, Resend, MIME
src/lib/billing               Stripe + entitlements
scripts/worker.ts             background worker
tests/                        vitest suites
```
