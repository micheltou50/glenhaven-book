# Glenhaven Direct Booking Site — AI Handoff

**Date of last update:** 2026-10-25
**Based on:** `main` @ `6fd73c0` (2026-10-24)
**Updated by:** Claude (initial documentation audit)

## Latest known development status

- The site is live on Netlify at https://glenhaven.stayops.com.au (Netlify site `glenhaven-book`).
- The latest work, on 2026-10-24, made the admin ready to approve Airbnb reviews that StayOps captures from email, and made the public star rating come from approved reviews instead of a hard-coded number.
- Before that, on 2026-08-01, a machine-to-machine API was added (`/api/reservations`, `/api/refund`) so StayOps can control this property's bookings.
- No work is in progress: both remote branches are already merged into `main`, and there are no open PRs.
- `GO-LIVE-AUDIT.md` (22 June 2026) is partly stale; see AI_CONTEXT §12.
- **Unverified:** the Stripe live-mode and webhook setup and the other go-live checklist items.

## Recently completed features

Newest first, from `git log origin/main`.

- **2026-10-24 — Email-captured Airbnb reviews** (`6fd73c0`).
  - Admin: pending-count badge, edit-before-approve (name, rating, stay, text) and a hint when a review looks truncated.
  - `/api/reviews` PATCH now edits fields as well as status.
  - Guest text is HTML-escaped wherever it is rendered.
  - The site rating is the average of approved reviews (cached 30 min), falling back to `property.rating`.
- **2026-08-01 — M2M control API** (`b9d551a`): `_auth.js` (admin password or `STAYOPS_API_KEY`, constant-time, fails closed), `reservations.js` (cancel, modify, block) and `refund.js` (Stripe full or partial refund with an over-refund guard).
- **2026-07-11 — Favicon and `robots.txt`** (`0d781dd`).
- **2026-06-27 — Guest Welcome Book page** (`054b6f7`): `Welcome-book.html`.
- **2026-06-25 — Returning-guest 5% offer** (`6f003ad`, `07e6cb9`, `30b72f8`, `eb5b705`):
  - hidden `/welcome-back` signup page, plus admin approval;
  - auto-verify against real bookings;
  - branded emails;
  - promo validation at checkout, redeemed by the webhook.
- **2026-06-24 — Hardening and fixes:**
  - crypto-random 16-character review codes, and no PII in logs (`adec64f`);
  - the webhook returns 500 when the DB write fails, so Stripe retries (`c10605a`);
  - timezone off-by-one in `toISO()` fixed (`a452b72`);
  - mobile calendar and menu fixes (`962d641`, `86073de`);
  - legal page details filled in (`f9f4ceb`);
  - default logo text (`c76d08b`).
- **2026-06-22 — Go-live pass** (`062545f`, `e0cd428`):
  - Terms and Privacy pages, and consent at checkout;
  - `/api/bookings` now needs the admin password (it previously leaked guest PII);
  - server-side pricing (`netlify/functions/pricing.js`);
  - `email-sequence` auth, plus a fix for an `emailFrom` bug that silently stopped all sends;
  - Spam Act unsubscribe;
  - SSRF allow-list on the review scraper;
  - PostgREST filter validation.
- **2026-05-09 to 2026-05-16 — Config-driven site and admin build-out** (`601bfdb` … `002ebcf`):
  - `site_config`-driven content on every page;
  - photo upload (signed URL) and drag-to-reorder;
  - design customiser and `?edit=true` visual editor;
  - multi-platform iCal feed manager;
  - review import (bulk paste parser, URL scraper);
  - pricing calendar overrides;
  - editable 14-day cancellation policy;
  - shared backend `site-config-loader.js`.
- **2026-03-09 to 2026-04-01 — Initial site** with a Google Apps Script / Google Sheets backend. It was replaced by Netlify Functions + Supabase; `Code.gs` was deleted in `699dda7`.

## Current work in progress

| Branch | Commits not on `main` | Last commit | Assessment |
|---|---|---|---|
| `origin/claude/gallant-archimedes-nnmgqz` | 0 (its tip `f9f4ceb` is an ancestor of `main`; `main` has 13 newer commits) | 2026-06-24 | Fully merged and stale. Safe to delete. |
| `origin/claude/glenhaven-airbnb-integration-67p8kt` | 0 (its tip is `main` HEAD `6fd73c0`) | 2026-10-24 | The branch the latest commit was made on. Fully merged; can be deleted. |

There are no open PRs (GitHub API, 2026-10-25).

## Outstanding bugs

1. **Security / privacy: sensitive house details are published.** `Welcome-book.html` is served publicly at `/Welcome-book.html`, has no `noindex`, and is committed to this public repo. It contains:
   - the property's wifi network name and password;
   - the street address;
   - a host phone number.
   
   These details should be removed or put behind access control, and the wifi password should be changed, because it stays in git history (`054b6f7`).
2. **Security (low): retired backend file in history.** The deleted `Code.gs`, still in git history before `699dda7`, contains a Google Sheet ID and a personal contact email. Neither is a credential. Just be aware they are there.
3. **The contact form probably never sends.** In `netlify.toml` the `/api/*` → `/.netlify/functions/:splat` rule comes before `/api/contact` → `contact-submit`. Netlify applies the first match, so `/api/contact` resolves to a function named `contact`, which does not exist. On top of that, `js/pages/contact.js` shows "success" on any response because it never checks `res.ok`. **Unverified:** not tested against the live site.
4. **The "Come back for 10% off" code in the post-checkout email cannot be redeemed.** `email-templates.js` `postCheckoutEmail` shows the review return code (`<XX>-R…`) as a 10% booking code. But `validate-promo.js` and `book.js` only accept `guest_offers` promo codes (5%), so that code is rejected at checkout.
5. **The cancellation policy conflicts.** The confirmation email (`webhook.js` and `email-templates.js`) offers "free cancellation for 48 hours from booking" when check-in is 14 or more days away, and "non-refundable" otherwise. The public policy page and the admin default say "full refund 14+ days before check-in".
6. **Admin "Block Dates" and "Delete" are local-only.** `js/pages/admin.js` → `js/availability.js` writes only to `localStorage`. Nothing reaches Supabase, guests still see the dates as available, and the next availability fetch wipes the change. The server path for blocks exists (`/api/reservations`, `action: 'block'`) but the admin UI does not use it.
7. **Owner blocks are missing from `/calendar.ics`.** It exports only `platform='Direct'` rows, so blocks made through `/api/reservations` are not pushed to Airbnb.
8. **Possible double booking:**
   - `book.js` checks only Supabase bookings, not the iCal feeds;
   - the minimum stay is enforced only in the browser;
   - the webhook inserts the booking without re-checking for a clash after payment.
9. **Possible timezone shift in the email sequence.** `email-sequence.js` works out today, tomorrow and so on using the server's local time. If Netlify runs in UTC, the 21:00 UTC run is already the next day in Sydney. The "check-in tomorrow" email would then arrive on the morning of check-in, pre-arrival 6 days before, and post-checkout about 2 days after. **Unverified:** depends on the function runtime's `TZ`.
10. **Review moderation is not scoped to the property.** `/api/reviews` PATCH and DELETE filter by `id` only. The `reviews` table is shared with StayOps, so this matters if StayOps ever holds more than one property.
11. **Admin auth is weak** (`GO-LIVE-AUDIT.md` §4.3, still true):
    - plain `===` password comparison in most admin functions (only `_auth.js` is constant-time);
    - CORS `*` on the admin endpoints;
    - raw `err.message` returned to clients in several functions.
12. **The webhook skips signature checks when `STRIPE_WEBHOOK_SECRET` is unset** (`webhook.js`). **Unverified:** whether it is set in production.
13. **Stale admin UI.** The Deploy Checklist and the config-error banner in `js/pages/admin.js` still reference `APPS_SCRIPT_URL`, `Code.gs` and Drive from the old backend. The checklist's Stripe webhook URL uses `glenhaven-book.netlify.app`, not the custom domain.
14. **Smaller issues:**
    - The homepage newsletter input does nothing.
    - Footer social icons can be `#`.
    - `confirmation.html` has some hard-coded property text.
    - `admin.html` has no `noindex`.
    - `.DS_Store` files are tracked.

## Planned changes

The repo has no roadmap, PLAN docs or TODO/FIXME comments. Evidence of planned work:

- **`GO-LIVE-AUDIT.md` open checklist:**
  - Stripe live keys and live webhook;
  - one real end-to-end paid test;
  - rotate `ADMIN_PASSWORD`;
  - verified `RESEND_FROM`;
  - confirm STRA, insurance and GST;
  - optional `CRON_SECRET`;
  - rate limiting;
  - CORS tightening;
  - Apple Pay, Google Pay and Link;
  - sitemap and analytics.
- **`reservations.js`:** a DB exclusion constraint would remove the clash race. It was deliberately postponed so StayOps' writers are not affected.

## Important decisions made

- **Supabase moved behind the functions.** The site went from Google Apps Script + Sheets to Netlify Functions + Supabase, with the service key held server-side and no Supabase client in the browser.
- **Shared tables with StayOps.** Direct bookings go into the shared `bookings` table as `platform='Direct'`, `source='direct-booking'`, with the Stripe session id as `confirmation_code`. StayOps sees them without any sync.
- **The server is authoritative for price and promo codes.** The browser total must match the server figure within $1 (`e0cd428`, `07e6cb9`).
- **Single-use promo codes.** A code is redeemed only after the booking row is written, so an abandoned checkout doesn't use it up.
- **The M2M API accepts the existing admin password** as well as `STAYOPS_API_KEY`, so the admin panel keeps working. No DB constraints were added, to avoid disturbing StayOps (`b9d551a`).
- **All guest and StayOps reviews start as `pending`.** Only approved reviews are public, and the public rating is derived from them (`6fd73c0`).

## Pending tests

- **No automated tests or CI.** There is no `package.json`, no test runner and no `.github/` workflows.
- **Manual end-to-end checks needed on production:**
  1. A real paid booking. Check that the row appears in `bookings`, the guest and host emails arrive, the dates are blocked on the site, and they appear in `/calendar.ics`.
  2. The contact form actually delivers to `HOST_EMAIL` (see bug 3).
  3. The email-sequence timing against Sydney dates (bug 9). This can be triggered manually with `CRON_SECRET`.
  4. Returning-guest signup: both the auto-verified and the manual-review paths, then redeeming the code at checkout and confirming it is marked redeemed.
  5. Review flow: a guest submission through the post-checkout link, a StayOps-captured Airbnb review, editing and approving it in the admin, and the public rating updating.
  6. `/api/reservations` (cancel, modify, block) and `/api/refund` (partial, then full; a second refund is rejected) using `STAYOPS_API_KEY`.
- **Pricing parity:** `js/pricing.js` and `netlify/functions/pricing.js` must give the same result. A small fixture test covering weekends, seasons, holidays, overrides, length-of-stay discounts and extra guests would catch drift.

## Recommended next development tasks

1. **Remove the sensitive house details from `Welcome-book.html`.** Take out the wifi credentials, street address and phone, or serve the page only to booked guests (for example with a token link from the check-in email). Add `noindex`, and change the wifi password.
2. **Fix the contact form.** Put the `/api/contact` redirect above `/api/*`, or rename `contact-submit.js` to `contact.js`. Make `contact.js` check `res.ok`.
3. **Fix the post-checkout "10% off" offer.** Either let `validate-promo.js` and `book.js` accept `bookings.return_code` at a configured percentage, or change the email to point guests to `/welcome-back`.
4. **Align the confirmation email's cancellation text** with the 14-day policy. Better still, read it from `site_config.policy`.
5. **Make admin Block Dates and Delete persistent.** Call `/api/reservations` (block or cancel) from the admin, and include `platform='Blocked'` rows in `/calendar.ics`.
6. **Close the double-booking gaps.**
   - In `book.js`: enforce the minimum stay and check the iCal feeds.
   - In `webhook.js`: re-check for a clash after payment and alert the host or auto-refund.
7. **Work through the open go-live items and confirm them on production:**
   - Stripe live mode, plus `STRIPE_WEBHOOK_SECRET`;
   - a verified `RESEND_FROM`;
   - rotate `ADMIN_PASSWORD`;
   - the function `TZ`, then fix `email-sequence.js` to use Australia/Sydney dates.
8. **Harden the admin endpoints.**
   - Reuse `_auth.js` (constant-time) in every admin function.
   - Scope `reviews` PATCH and DELETE by `property_id`.
   - Restrict CORS to the site origin.
   - Return generic error messages.
9. **Fill the schema gaps.** Add migrations for `guest_offers` and `reviews.platform`, or point `migrations/` at STRManagement's `supabase/migrations/0000_baseline_schema.sql` as the source of truth. Confirm the `UNIQUE (local_id, user_id)` constraint exists.
10. **Clean up stale material.** Remove the Apps Script leftovers from the admin checklist, refresh `GO-LIVE-AUDIT.md`, untrack `.DS_Store`, and delete the two merged remote branches.

## Update log
- 2026-10-25 — Initial AI_CONTEXT/AI_HANDOFF created from codebase audit.
