# Glenhaven — Go‑Live Audit & Readiness Checklist

_Audit date: 22 June 2026_

This document covers everything still standing between you and accepting real,
paid bookings: **Stripe**, **environment/config**, **security**, and **legal /
Australian‑law compliance**. Items marked ✅ were fixed in this change set;
items marked ⬜ are actions for you (some need decisions or external accounts I
can't touch).

> **Verdict:** Not safe to flip to "live" yet. There is **1 critical data leak
> now fixed**, **1 high‑risk payment‑integrity bug still open**, and a handful
> of Stripe/legal items below. Work the **🚦 Final checklist** at the bottom in
> order.

---

## 1. Stripe — what's missing to take real payments

Your Stripe integration is **already built correctly** (Checkout session in
`netlify/functions/book.js`, signed webhook in `netlify/functions/webhook.js`,
AUD currency, idempotency, confirmation + host emails). What's missing is the
**go‑live configuration**, not code:

| # | Action | Why it matters |
|---|--------|----------------|
| ⬜ | **Activate your Stripe account** (business details + bank account for payouts). | You can't accept live charges until Stripe verifies you. |
| ⬜ | **Switch `STRIPE_SECRET_KEY` to your live key** (`sk_live_…`, not `sk_test_…`) in Netlify env vars. | Test keys don't move real money. |
| ⬜ | **Create a live‑mode webhook** in the Stripe Dashboard → Developers → Webhooks. Endpoint: `https://YOURDOMAIN/api/webhook`. Event: **`checkout.session.completed`**. | This is the **only** thing that writes the confirmed booking to your database and blocks the dates. |
| ⬜ | **Copy that webhook's signing secret to `STRIPE_WEBHOOK_SECRET`** (`whsec_…`). | Without it, `webhook.js` logs a warning and **skips signature verification** (`webhook.js:45‑47`) — anyone could POST fake "paid" bookings. |
| ⬜ | **Do one real end‑to‑end test** (book a date with a real card for a cheap night, or use a live test). Confirm: row appears in Supabase `bookings`, guest gets the confirmation email, you get the host email, and the date shows as unavailable. | Proves the live keys, webhook, email (Resend) and availability all line up. |
| ⬜ | **Confirm the success/cancel URLs** resolve on your real domain. `book.js` uses `process.env.URL` and falls back to `glenhaven-book.netlify.app` (`book.js:8`). Set Netlify's `URL`/domain correctly. | Otherwise guests land on the wrong domain after paying. |

⚠️ **Failure mode to understand:** if the webhook is missing or its secret is
wrong, **guests will be charged but no booking is recorded and the dates stay
"available"** → double‑bookings. Test the webhook before announcing.

**Optional Stripe niceties (not blockers):** enable Apple Pay / Google Pay /
Link (today only `card` is offered — `book.js:49`); add your logo + brand colour
in Stripe Checkout branding settings.

---

## 2. 🔴 HIGH — Payment amount is trusted from the browser (open)

`book.js` charges whatever total the browser sends:

```
const chargeAmount = totalAmount || total;          // book.js:23
... 'unit_amount': String(Math.round(chargeAmount * 100))  // book.js:51
```

The price is computed client‑side (`js/pricing.js`) and POSTed to `/api/book`.
A user can edit that request and **pay $1 for any stay** — the server never
recomputes the price. Availability is checked server‑side (good), but the
amount is not.

**Recommended fix:** recompute the price on the server from `checkIn`,
`checkOut`, guest count, your `site_config` pricing rules and `price_overrides`,
and charge that — ignore any client‑supplied total (or reject if they disagree
beyond rounding). This needs the pricing logic mirrored in the function. I can
implement this next if you want; I left it out of this pass because it must be
done carefully and tested against your real pricing rules.

---

## 3. Environment variables (Netlify → Site settings → Environment variables)

Consolidated from every function. Make sure all of these are set for
**production**:

| Variable | Used by | Notes |
|----------|---------|-------|
| `SUPABASE_URL` | almost all functions | Your project: `nbeuyypgiipptxlqnhel` (stayops, Sydney). |
| `SUPABASE_SERVICE_KEY` | almost all functions | **Service‑role key — keep secret. Never expose to the browser.** |
| `PROPERTY_ID` | most functions | The property UUID. |
| `HOST_USER_ID` | webhook.js | Owner of the booking rows. |
| `STRIPE_SECRET_KEY` | book.js | Use the **live** key for go‑live. |
| `STRIPE_WEBHOOK_SECRET` | webhook.js | From the live webhook. **Set this.** |
| `RESEND_API_KEY` | webhook, email‑sequence, contact | Email sending. |
| `RESEND_FROM` | (via site‑config‑loader) | Must be a **verified domain** sender, e.g. `Glenhaven <bookings@yourdomain>`. Falls back to the Resend sandbox `noreply@resend.dev` if unset — that will look untrustworthy / may not deliver. |
| `HOST_EMAIL` | webhook, contact | Where host notifications + contact form go. |
| `ADMIN_PASSWORD` | config, bookings, price‑overrides, reviews, upload, scrape‑reviews | Admin auth. Use a long, random value. |
| `URL` | book, webhook, calendar, email‑sequence | Netlify usually sets this; verify it's your real domain. |
| `AIRBNB_ICAL_URL` | availability.js | Optional/legacy; iCal feeds can also live in site config. |
| `CRON_SECRET` | _referenced but not implemented_ | See §4.3. |

> `js/pages/admin.js` also references `APPS_SCRIPT_URL` in its built‑in checklist
> — that looks like a leftover from an older Google‑Apps‑Script backend and is
> not used by the current functions. Safe to ignore / clean up later.

---

## 4. Security audit

### 4.1 ✅ FIXED this change set
- **🔴 CRITICAL — `/api/bookings` exposed all guest PII with no auth.** It
  returned every booking's name, email, phone and amount to anyone on the
  internet (CORS `*`). Now requires the admin password
  (`netlify/functions/bookings.js`); the admin page was updated to send it
  (`js/pages/admin.js`). **Action for you:** because this was public, treat the
  guest list as potentially already exposed (see §5.5 on the Notifiable Data
  Breaches scheme) and rotate `ADMIN_PASSWORD`.

### 4.2 🔴/🟠 Still open — recommended before go‑live
- **🔴 HIGH — Client‑trusted payment amount.** See §2.
- **🟠 HIGH — `/api/email-sequence` has no auth.** The header comment claims a
  `CRON_SECRET` check but none is implemented, so anyone can trigger your email
  routine. _Caveat:_ it's also your scheduled (cron) function, so the fix must
  allow Netlify's scheduled invocation while rejecting anonymous HTTP calls —
  don't just bolt on a required secret or you'll break the daily send. Happy to
  implement this safely.
- **🟠 HIGH — `/api/scrape-reviews` SSRF.** Fetches an admin‑supplied URL
  server‑side with no host/scheme allow‑list. Admin‑gated, so lower urgency, but
  add an allow‑list (airbnb/booking/vrbo hosts, `https` only) — or drop the
  feature for launch.
- **🟠 MEDIUM — Public review enumeration.** `/api/submit-review?ref=…` returns a
  guest's name + stay dates for any return code; codes are short, `Math.random`‑
  based and unthrottled, so they're brute‑forceable. Add rate limiting and/or
  longer, crypto‑random codes.

### 4.3 🟡 Medium / Low
- **PostgREST filter injection** via un‑encoded interpolation in
  `price-overrides.js` (`date`) and `reviews.js` (`id`) — admin‑gated, but wrap
  values in `encodeURIComponent`.
- **Unbounded loop** in `price-overrides.js` (one DELETE per array item, no cap).
- **PII in logs** — `email-sequence.js` logs full booking objects (names/emails).
- **Internal error messages** (`err.message`, raw Supabase text) are returned to
  clients on 5xx across several functions — fine to tidy.
- **CORS `*`** on admin‑write endpoints — consider restricting to your domain.
- **Public `.ics` feed** reveals occupancy with no secret token (low).

### 4.4 Supabase posture (checked live)
- ✅ **Row‑Level Security is ON for every table** — good. (The functions use the
  service key, which bypasses RLS, so app‑layer auth like §4.1 is what matters.)
- 🟡 Advisor warnings (non‑blocking): a couple of `SECURITY DEFINER` functions
  (`expenses_soft_delete`, `platform_payouts_soft_delete`) are callable by
  `anon` — these belong to the separate BookKeeper app, not this site, but worth
  locking down. Public `photos` bucket allows listing. "Leaked password
  protection" is disabled in Supabase Auth. Function `search_path` not pinned.
  See Supabase → Advisors for one‑click remediation links.

---

## 5. Legal & Australian‑law compliance

### 5.1 ✅ Terms & Conditions — added (`terms.html`)
Drafted to sit correctly with Australian law: NSW governing law, the **Australian
Consumer Law** non‑excludable‑guarantees clause (you can't and don't try to
contract out of consumer guarantees), cancellation/refunds, occupancy & house
rules, damage recovery, assumption of risk, force majeure, STRA Code of Conduct,
privacy link. **You must:** fill the placeholders — `[Operator legal name]`,
`[ABN]`, `[registered/contact address]`, GST line — and have a lawyer review it.

### 5.2 ✅ Privacy Policy — added (`privacy.html`)
Required by the **Privacy Act 1988 (Cth)** because you collect names, emails and
phones — and required by Stripe. Covers the Australian Privacy Principles: what
you collect, why, who you share with (Stripe/Resend/Netlify/Supabase/cleaners/
OTAs), overseas disclosure, security, access & correction, direct‑marketing
opt‑out, OAIC complaints. Same placeholders to fill.

### 5.3 ✅ Legal links wired site‑wide
The footer "Privacy"/"Terms" links were dead (`href="#"`). Now every page links
to the new pages, and the **booking page requires agreement** to Terms / House
Rules / Cancellation / Privacy at checkout (improves enforceability).

### 5.4 🟠 Spam Act 2003 — unsubscribe still required
Your post‑checkout email includes a **"come back for 10% off" marketing offer**
(`email-templates.js`) but **no unsubscribe**. The Spam Act requires a functional
unsubscribe on commercial/marketing email. **Action:** add a `List-Unsubscribe`
header + a visible unsubscribe link (even a `mailto:` opt‑out is acceptable if
you honour it within 5 business days). Transactional emails (confirmation,
access code) are fine as‑is. I can add this.

### 5.5 🟠 Privacy Act — breach‑readiness
Because `/api/bookings` was world‑readable (now fixed), be aware of the
**Notifiable Data Breaches** scheme: if personal info has likely been accessed in
a way likely to cause serious harm, you may need to notify affected guests and
the OAIC. Realistically the risk is low (the URL wasn't advertised), but
document the fix date and rotate `ADMIN_PASSWORD`.

### 5.6 ⬜ Things only you can confirm
- **Operator entity & ABN** — who the guest contracts with (you personally, or a
  company / StayOps as agent). This drives the legal pages.
- **GST registration** — adjust the GST line in `terms.html` accordingly.
- **NSW STRA compliance** — registration `PID-STRA-82540` is shown; confirm it's
  current, that the property meets the **STRA fire‑safety standard**, and you're
  within any day caps for non‑hosted lettings.
- **Insurance** — short‑term‑letting / public‑liability cover.
- **Security deposit/bond** — you currently take none; the Terms instead let you
  recover damage costs. Decide if that's enough for you.

---

## 6. Functional / operational notes (non‑blocking)
- `confirmation.html` has some hard‑coded "Glenhaven" text while the rest of the
  site is config‑driven — cosmetic.
- Newsletter signup box in the homepage footer isn't wired to anything.
- Social icons in footers link to `#`.
- Consider a `robots.txt` + sitemap and an analytics tool.

---

## 🚦 Final go‑live checklist (in order)

1. ⬜ Activate Stripe; set **live** `STRIPE_SECRET_KEY`.
2. ⬜ Create live webhook → set `STRIPE_WEBHOOK_SECRET`.
3. ⬜ Set/verify **all** env vars in §3 (esp. `RESEND_FROM` verified domain, `URL`).
4. ⬜ **Fix the client‑trusted price** (§2) — or accept the risk knowingly.
5. ⬜ Decide on `/api/email-sequence` auth + Spam Act unsubscribe (§4.2, §5.4).
6. ⬜ Fill legal placeholders in `terms.html` + `privacy.html`; lawyer review.
7. ⬜ Rotate `ADMIN_PASSWORD` (was effectively exposed via the bookings leak).
8. ⬜ Do one **real end‑to‑end paid booking test** and verify DB + emails + calendar.
9. ⬜ Confirm STRA registration, insurance, GST status.
10. ✅ Critical PII leak closed · Terms + Privacy live · legal links wired · checkout consent added.
