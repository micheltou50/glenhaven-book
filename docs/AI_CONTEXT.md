# Glenhaven Direct Booking Site — AI Context

> Shared context for AI assistants (Claude, ChatGPT/Codex). Describes what is true in the code at the commit below. Anything not confirmed in the code is marked **Unverified**.

| | |
|---|---|
| Repository | micheltou50/glenhaven-book (public) |
| Default branch | main |
| Verified against | `6fd73c0` (2026-10-24) |
| Last reviewed | 2026-10-25 |
| Related repos | micheltou50/STRManagement (StayOps). Both use the same Supabase project, `stayops`, and share tables (see §6). StayOps writes bookings and Airbnb reviews that this site reads. |

## 1. Purpose

This is the public direct-booking website for one short-term-rental property, Glenhaven (a cottage in Katoomba, Blue Mountains, NSW). Guests can:

- browse the property (home, gallery, amenities, location, house rules, cancellation policy, reviews, contact, terms, privacy);
- choose dates on a live availability calendar;
- pay in full through Stripe Checkout.

The site also handles:

- the confirmation email and the automated pre-arrival, check-in and post-checkout emails;
- guest review collection and moderation;
- a hidden returning-guest discount scheme (`/welcome-back`);
- an iCal export so Airbnb can block dates that were booked direct.

The owner manages it through a password-protected admin panel (`admin.html`). Netlify site `glenhaven-book` serves it at https://glenhaven.stayops.com.au. That URL is also the fallback `SITE_URL` in `netlify/functions/guest-offers.js`.

The site is config-driven. Property name, copy, prices, photos, colours, policies and iCal feeds all come from one JSON row in `site_config`. In principle the same code could serve another property by changing `PROPERTY_ID` (commit `9cc651e` removed the hard-coded property names).

## 2. Technology stack

- **Front end:** static HTML pages and one shared `style.css`. Plain browser ES modules in `js/`, with no framework, bundler or `package.json`.
- **Back end:** 21 Netlify Functions (Node.js, CommonJS) in `netlify/functions/`. `_auth.js`, `site-config-loader.js`, `pricing.js` and `email-templates.js` are shared modules, not endpoints. The functions use only Node built-ins (`crypto`) and the global `fetch`. There are no npm dependencies, and the Stripe, Resend and Supabase calls are raw REST.
- **Database:** Supabase Postgres (project `stayops`, ref `nbeuyypgiipptxlqnhel`, named in `GO-LIVE-AUDIT.md`). It is reached only from the functions, over PostgREST, with the service-role key. Photos go to the Supabase Storage bucket `photos`.
- **Payments:** Stripe Checkout (AUD, card only) plus a signed webhook.
- **Email:** Resend.
- **Hosting:** Netlify (static hosting, functions, one scheduled function).

## 3. System architecture

```
 Browser (static pages + js/ modules)
   │  fetch /api/*  (netlify.toml rewrites /api/* → /.netlify/functions/*)
   ▼
 Netlify Functions ──── service key ───► Supabase (stayops): bookings, properties,
   │   │   │                                  site_config, price_overrides, reviews,
   │   │   │                                  guest_offers, storage bucket "photos"
   │   │   └── Stripe REST (checkout sessions, refunds) ◄── Stripe webhook → /api/webhook
   │   └────── Resend REST (guest + host emails)
   └────────── external iCal feeds (Airbnb/Booking/VRBO) read by /api/availability

 /calendar.ics  → Airbnb imports direct bookings
 StayOps (STRManagement repo) → writes iCal/email-derived bookings + pending Airbnb reviews
                               into the same Supabase tables; may call /api/reservations, /api/refund
```

The browser never talks to Supabase directly. The one exception is the admin photo upload, which does a `PUT` to a Supabase Storage signed URL issued by `/api/upload`.

## 4. Repository layout

| Path | What it is |
|---|---|
| `index.html`, `gallery.html`, `amenities.html`, `location.html`, `house-rules.html`, `cancellation-policy.html`, `reviews.html`, `contact.html`, `terms.html`, `privacy.html` | Public pages. Each loads a `js/pages/*.js` module and usually `js/visual-editor.js`. |
| `booking.html` + `js/pages/booking.js` | Four-step booking flow: dates → guests → details → pay. Includes the promo-code field and the checkbox to accept the terms. |
| `confirmation.html` + `js/pages/confirmation.js` | Landing page after Stripe (`?booking=success` or `?booking=cancelled`). Reads the pending booking from `sessionStorage`. |
| `submit-review.html` | Guest review form, reached from the post-checkout email via `?ref=<return code>`. Has `noindex`. |
| `guest-offer.html` | Hidden returning-guest 5% signup page, served at `/welcome-back` through a rewrite. Has `noindex`. |
| `Welcome-book.html` | Self-contained guest welcome book (about 5 MB, because 12 images are embedded as base64). It is not linked from the site nav and has no `noindex`. It contains sensitive house details; see AI_HANDOFF "Outstanding bugs". |
| `admin.html` + `js/pages/admin.js` | Owner admin panel (about 2,000 lines of JS). See §5.8. |
| `js/config.js` | Client defaults: pricing constants, minimum nights, holiday prices, API URLs. `site_config` overrides them at runtime. |
| `js/site-config.js` | Fetches `/api/config` and applies it to the DOM: text, pricing, colours, fonts, photos, amenities, policy and social links. Caches in `localStorage` for 1 h. Also derives the site rating from approved reviews (cached 30 min). |
| `js/pricing.js` | Client pricing engine. **Must stay identical** to `netlify/functions/pricing.js`. |
| `js/availability.js` | Loads `/api/availability` and caches the blocked ranges and price overrides in `localStorage`. |
| `js/calendar.js` | `MiniCal` date-range picker. |
| `js/ui.js` | Nav, carousel, urgency message, `sendBooking()` (POST `/api/book`), pending-booking store. |
| `js/visual-editor.js` | Inline editor turned on with `?edit=true` on any page. Prompts for the admin password and saves the whole config to `/api/config`. |
| `js/utils.js` | Date and money formatters, `toISO()` (uses local date parts), `escapeHtml()`. |
| `netlify/functions/*.js` | API endpoints; see §5 and §7. |
| `migrations/001–003_*.sql` | Hand-run SQL for `site_config`, `reviews` and `price_overrides`. Incomplete; see §6. |
| `netlify.toml` | Functions dir, the schedule and the redirects. There is no build command. |
| `GO-LIVE-AUDIT.md` | Go-live and security audit dated 22 June 2026. Partly stale; see §12. |
| `robots.txt`, `favicon.*` | Allows all crawlers. There is no sitemap. |

## 5. Key features and how they work

### 5.1 Availability
- `GET /api/availability` (`netlify/functions/availability.js`) returns `{ ranges, priceOverrides }`. `ranges` is built from:
  - all non-cancelled `bookings` for `PROPERTY_ID`. This covers direct, StayOps/iCal-ingested and blocked rows alike.
  - every feed in `site_config.config.icalFeeds`, plus the legacy `AIRBNB_ICAL_URL` env var. Each feed is fetched with an 8 s timeout and parsed for `DTSTART`/`DTEND` dates.
- The client caches the result (`js/availability.js`). Ranges are half-open, `[checkin, checkout)`, so a checkout day can be the next guest's check-in day.

### 5.2 Booking and payment
1. `booking.js` computes the price on the client and POSTs to `/api/book`.
2. `book.js` then does the following:
   - Re-checks for a clash against Supabase `bookings` only. The iCal feeds are not checked.
   - Loads `site_config` and `price_overrides`, and recomputes the price server-side with `calcServerPrice()` (`pricing.js`).
   - Enforces the maximum number of guests.
   - Re-validates any promo code against `guest_offers`.
   - Rejects the request if the browser total differs from the server total by more than $1.
   - Creates a Stripe Checkout Session. The booking details go in the session metadata, and the success and cancel URLs are built from `URL`.
3. Stripe calls `POST /api/webhook` (`webhook.js`) on `checkout.session.completed`:
   - It verifies the `Stripe-Signature` HMAC, with a 5-minute tolerance. **If `STRIPE_WEBHOOK_SECRET` is unset it skips verification**, logging only a warning.
   - It is idempotent on `bookings.confirmation_code = <Stripe session id>`.
   - It inserts the booking: `platform='Direct'`, `source='direct-booking'`, `status='confirmed'`, `user_id=HOST_USER_ID`, and the management fee fields.
   - If that insert fails it returns 500, so Stripe retries.
   - It marks any promo code redeemed.
   - It emails the guest a confirmation and the host a notification through Resend.
4. Nothing re-checks availability between creating the session and the webhook. Two guests could both pay for the same dates.

### 5.3 Pricing (`js/pricing.js` ≡ `netlify/functions/pricing.js`)
Each night is priced in this order of precedence:
1. a per-date override from `price_overrides`;
2. a holiday price keyed by `MM-DD`;
3. the base rate, plus a Friday or Saturday surcharge, multiplied by the season. Peak is December–January (`peakPct`); low is May–August (`lowPct`).

Then:
- An extra-guest fee is added per night for each guest above `baseGuests`.
- A length-of-stay discount applies at 3, 5 and 7+ nights.
- A flat cleaning fee is added.
- A returning-guest promo percentage, if any, is applied to the whole total and rounded.

Defaults are hard-coded in both files and `site_config.config.pricing` overrides them. The client reads dates in local time and the server reads them in UTC, deliberately.

Minimum nights (weekday, weekend and peak) are enforced **only in the browser** (`getMinNights` in `booking.js`). `book.js` does not check them.

### 5.4 Guest emails (`email-templates.js`, `email-sequence.js`)
- **Confirmation** (guest) and **new booking** (host): sent from the webhook.
- **Daily sequence:** the scheduled function `email-sequence` runs at `0 21 * * *` UTC (`netlify.toml`). It only handles `platform='Direct'`, `status='confirmed'` bookings:
  - **Pre-arrival:** check-in in 7 days.
  - **Check-in details:** check-in tomorrow. The access code, wifi details and address come from `properties.check_in_info` in the database, not from the repo.
  - **Post-checkout:** the day after checkout. Includes a review link (`/submit-review.html?ref=<return code>`), a "Come back for 10% off" block that shows the same code, and a Spam Act unsubscribe link plus a `List-Unsubscribe` header.
- Each send is recorded in `bookings.emails_sent` (jsonb) so it is not sent twice.
- The return code is crypto-random, 16 characters, prefixed `<XX>-R`, and stored in `bookings.return_code`.
- Auth: Netlify's scheduled invocation is detected by a `next_run` field in the body. Any other call must send `?secret=` or the `x-cron-secret` header matching `CRON_SECRET`.

### 5.5 Reviews
Reviews come from three sources:
- **Guest-submitted:** `submit-review.html` → `/api/submit-review`. A GET looks up the booking by `return_code` and returns the guest's first name and stay dates. A POST stores the review as `status='pending'`. One review per return code.
- **Imported by the admin:** `/api/reviews` POST, stored as `approved`. The URL scraper `/api/scrape-reviews` accepts only https Airbnb, Booking.com or VRBO hostnames. There is also a paste-in bulk parser in `admin.js`.
- **Captured from email by StayOps:** STRManagement's email scanner parses Airbnb "… left a 5-star review!" emails and inserts them into `reviews` as `pending`, `platform='airbnb'` (comment in `netlify/functions/reviews.js`; STRManagement `CLAUDE.md`).

Moderation and display (latest commit, `6fd73c0`):
- The admin sees a badge with the number of pending reviews.
- The admin can edit the name, rating, stay and text before approving. This is for reviews Airbnb's email cut short at about 200 characters; they end with "…" and show a hint.
- Guest text is HTML-escaped wherever it is rendered.
- `/api/reviews` GET returns only `approved` reviews to the public.
- The public rating (hero, sticky card, booking sidebar) is the average of approved reviews to one decimal, plus the count. If there are no approved reviews it falls back to `property.rating` (`js/site-config.js` `loadReviewStats`).

### 5.6 Returning-guest 5% offer (`/welcome-back`)
- `guest-offer.html` posts to `/api/guest-offers`. The form has a honeypot field named `company`.
- **Auto-verify:** a signup is approved automatically if its email matches a non-cancelled booking, or if it has the same check-in date and a compatible name. In that case the code generates `<XX>-SAVE-<8 chars>` (5%, expires in 12 months) and emails it straight away.
- Otherwise the signup stays `pending`; the guest gets a "we're confirming" email and the owner is asked to review it.
- The Guest Offers tab in the admin approves (minting and emailing a code) or rejects.
- **Redemption:** `/api/validate-promo` is for display only. `book.js` re-validates the code authoritatively, and `webhook.js` sets `status='redeemed'` once the booking row exists. Codes are single-use.

### 5.7 Machine-to-machine control API (for StayOps)
Added in `b9d551a`. Auth is in `_auth.js`:
- Accepts the `x-admin-password` header (`ADMIN_PASSWORD`), or `Authorization: Bearer` / `x-api-key` (`STAYOPS_API_KEY`).
- Compares in constant time on SHA-256 digests.
- Fails closed if neither secret is configured.

Endpoints:
- `POST /api/reservations`, `action` field:
  - `cancel`: sets `status='cancelled'` and `cancelled_at`.
  - `modify`: changes dates (clash-checked), guest count, name, email, phone or notes.
  - `block`: inserts `platform='Blocked'`, `source='manual-block'`, `host_payout=0`, `status='confirmed'`. An optional `idempotencyKey` is folded into `local_id`.
  - Every action is scoped to `PROPERTY_ID`. The clash check is read-then-write, so it has a documented race.
- `POST /api/refund`: full or partial Stripe refund. It:
  - only works on rows with `source='direct-booking'` and a `cs_…` session id;
  - reads the charged amount and any existing refunds from Stripe, so it can never refund more than was paid;
  - sends an idempotency key;
  - reports success only when Stripe returns `status='succeeded'`;
  - can also cancel the booking (`cancel: true`).
- **Unverified:** whether StayOps actually calls these. No caller was found in STRManagement on any fetched branch.

### 5.8 Admin panel (`admin.html`, `js/pages/admin.js`)
- **Login:** the password is checked by `POST /api/config` with `{_ping:true}` and then kept in `sessionStorage`.
- **Tabs:**
  - **Bookings:** read from `/api/bookings`. Has stats, a filter, sorting and CSV export.
  - **Calendar** overview.
  - **Block Dates.**
  - Content editors for the property, house rules, pricing (including a per-date pricing calendar → `/api/price-overrides`), photos (signed-URL upload, drag-to-reorder), amenities, story and highlights, location, contact, cancellation policy (cards, timeline, FAQ), footer and social links, and design (colours, fonts, radius, buttons, navbar).
  - **Reviews.**
  - **Guest Offers.**
  - **iCal:** export URL, and the list of import feeds.
  - **Deploy Checklist.**
- Content changes are published by POSTing the whole config to `/api/config`, which upserts `site_config`.
- **Limitation:** "Block Dates" and the booking "Delete" button only change browser `localStorage` (`js/availability.js` `saveBlock`/`deleteBooking`). They do not write to Supabase, and the next availability load wipes them. Real blocks can only be made through `/api/reservations` (`action: 'block'`), or by StayOps.

### 5.9 iCal export
`/calendar.ics` (`calendar.js`) exports non-cancelled `platform='Direct'` bookings, dates only, for Airbnb to import. Owner blocks (`platform='Blocked'`) are **not** included.

### 5.10 Contact form
`contact.html` → `/api/contact` → Resend email to `HOST_EMAIL`, with `reply_to` set to the guest. See AI_HANDOFF for a likely redirect-order bug.

## 6. Data model and Supabase integration

Project `stayops` (ref `nbeuyypgiipptxlqnhel`, region ap-southeast-2) is shared with StayOps. Every query filters on the `PROPERTY_ID` env var and uses `SUPABASE_SERVICE_KEY`, which bypasses RLS. Access control is enforced in the functions, not by RLS. All of these tables exist in the live `stayops` table list.

| Table | Owner | This site's use |
|---|---|---|
| `bookings` | StayOps (shared) | Read for availability, the admin list, offer verification and review codes. Inserted by `webhook.js` and `reservations.js` (block). Patched by `email-sequence.js` (`emails_sent`, `return_code`), `reservations.js` and `refund.js`. Columns used: `id, user_id, property_id, local_id, checkin, checkout, nights, guest_name, email, phone, guests, host_payout, cleaning_fee, mgmt_fee_raw, mgmt_fee, mgmt_payout, net_payout, platform, confirmation_code, status, source, message, notes, emails_sent, return_code, cancelled_at, updated_at, created_at`. |
| `properties` | StayOps | Read only: `mgmt_fee_rate` (webhook) and `check_in_info` jsonb (check-in email). |
| `site_config` | This site | One row per property: `config` jsonb plus `updated_at`. Read by every page through `/api/config`, and server-side through `site-config-loader.js` (cached 5 min per function instance). |
| `price_overrides` | This site | `(property_id, date)` unique, plus `price`. |
| `reviews` | Shared | Written by this site and by StayOps' email scanner. `status`: `pending`, `approved` or `rejected`. `platform` defaults to `direct`. |
| `guest_offers` | This site | Returning-guest signups and promo codes (`status`: pending, approved, rejected or redeemed). |
| Storage bucket `photos` | This site | Uploaded under `property/<timestamp>-<name>`. Shown through public object URLs. |

Migration gaps:
- `migrations/` only covers `site_config`, `reviews` and `price_overrides`. They are run by hand in the SQL editor; no migration tool is used.
- There is **no migration for `guest_offers`**. Commit `6f003ad` says it was "applied via Supabase".
- `002_reviews.sql` lacks the **`platform`** column, which the code reads and writes.
- Both exist live and appear in STRManagement's `supabase/migrations/0000_baseline_schema.sql`, which is the de-facto schema source of truth for the shared project.
- **Unverified:** that `bookings` has the `UNIQUE (local_id, user_id)` constraint that `reservations.js` relies on for block idempotency. The StayOps baseline deliberately leaves constraints out.

Other live `stayops` tables (cleaners, cleans, expenses, `property_ical_feeds` and so on) are not used by this repo.

## 7. External integrations and APIs

| Service | Used for | Where | Env vars |
|---|---|---|---|
| Supabase PostgREST + Storage | All data and photo storage | every function; `upload.js` (signed upload URLs) | `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PROPERTY_ID`, `HOST_USER_ID` |
| Stripe | Checkout sessions, webhook, refunds | `book.js`, `webhook.js`, `refund.js` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Resend | All transactional and marketing email | `webhook.js`, `email-sequence.js`, `guest-offers.js`, `contact-submit.js` | `RESEND_API_KEY`, `RESEND_FROM` (falls back to the Resend sandbox sender), `HOST_EMAIL` |
| OTA iCal feeds | Blocking dates booked elsewhere | `availability.js` | feeds listed in `site_config.config.icalFeeds`; legacy `AIRBNB_ICAL_URL` |
| Airbnb / Booking.com / VRBO listing pages | One-off review scraping (admin) | `scrape-reviews.js` | none |
| Google Fonts | Fonts the admin can pick | `js/site-config.js` | none |
| StayOps (STRManagement) | Shared DB writer, review capture, M2M API client | see §5.5, §5.7 | `STAYOPS_API_KEY` |

API routes (`/api/<name>` → `netlify/functions/<name>.js`):

| Route | Methods | Auth |
|---|---|---|
| `availability` | GET | public |
| `config` | GET public; POST admin | `ADMIN_PASSWORD` |
| `book` | POST | public |
| `webhook` | POST | Stripe signature |
| `bookings` | GET | admin |
| `price-overrides` | GET public; POST admin | admin |
| `reviews` | GET public (approved only; `?status=all` for admin); POST, PATCH, DELETE admin | admin |
| `submit-review` | GET, POST | return code |
| `scrape-reviews` | POST | admin |
| `upload` | POST | admin |
| `guest-offers` | POST public; GET, PATCH admin | admin |
| `validate-promo` | GET | public |
| `email-sequence` | scheduled, or GET/POST with secret | `CRON_SECRET` |
| `reservations`, `refund` | POST | `_auth.js` (`STAYOPS_API_KEY` or `ADMIN_PASSWORD`) |
| `contact` | POST | public |

Extra rewrites:
- `/calendar.ics` → `calendar`
- `/api/contact` → `contact-submit` (but see the redirect-order note in AI_HANDOFF)
- `/welcome-back` → `/guest-offer.html`

## 8. Important business rules

- **Payment in full** at booking, in AUD, card only. The server-computed price is authoritative and the client figure must match within $1 (`book.js`).
- **Max guests** comes from `pricing.maxGuests` or `property.guests`, and infants don't count. The client caps infants at 4.
- **Management fee** recorded on direct bookings: `(total − cleaning fee) × properties.mgmt_fee_rate %`, with `net_payout = mgmt_payout` (`webhook.js`).
- **Booking reference** shown to guests: the first two letters of the property name plus a time-based suffix, e.g. `GH-…` (`getRefPrefix`). The DB `confirmation_code` is the Stripe session id.
- **Cancelling a booking** means setting `status='cancelled'`, which frees the dates everywhere. Rows are never hard-deleted by this repo.
- **Refunds** only go through Stripe for `source='direct-booking'` rows. Bookings from other channels must be refunded in their own channel.
- **Cancellation policy.** The public page, which the admin can edit, says "full refund 14+ days before check-in, otherwise non-refundable". The confirmation email (`webhook.js`) instead says "free cancellation for 48 hours from booking" if check-in is 14 or more days away, and "non-refundable" otherwise. **These conflict.**
- **Returning-guest code:** 5%, single-use, valid 12 months, applied to the full total including cleaning.
- **Reviews:** only `approved` reviews are public. Reviews from guests and from StayOps start as `pending`.
- **Emails:** the sequence only covers direct bookings (`platform='Direct'`). OTA guests get nothing from this site. The post-checkout email is marketing, so it carries an unsubscribe link (Spam Act 2003). Opt-outs are handled manually by `mailto:`.
- **Legal:** the Terms and Privacy pages state NSW law, Australian Consumer Law guarantees and the Privacy Act. The footer shows the NSW STRA registration. The booking step requires agreement to the Terms, House Rules, Cancellation Policy and Privacy Policy.

## 9. Deployment architecture

- **Host:** Netlify site `glenhaven-book`, primary URL https://glenhaven.stayops.com.au (verified via the Netlify connector). The functions fall back to `https://glenhaven-book.netlify.app` when `URL` is unset.
- **Build:** `netlify.toml` has no build command and no `publish` key. The site is served as-is from the repo root, with functions from `netlify/functions`. **Unverified:** whether the Netlify UI overrides the publish directory or build settings, and whether deploys are triggered automatically from `main`.
- **Scheduled function:** `email-sequence` at `0 21 * * *` UTC. That is 07:00 AEST or 08:00 AEDT on the next Sydney calendar day.
- **CI / tests:** none. There is no `.github/`, no test suite and no `package.json`.
- **Mobile:** not applicable.
- **Stripe webhook endpoint:** must point at `https://<domain>/api/webhook` for `checkout.session.completed`. **Unverified:** whether it is configured in live mode.

## 10. Configuration and environment variables

All are set in Netlify env vars; values are never stored in the repo.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service-role key used by all functions (server-only) |
| `PROPERTY_ID` | UUID of the property; scopes every query |
| `HOST_USER_ID` | `user_id` stamped on bookings and blocks this site inserts (the StayOps owner) |
| `STRIPE_SECRET_KEY` | Stripe API key (checkout and refunds) |
| `STRIPE_WEBHOOK_SECRET` | Verifies the webhook signature; verification is skipped if unset |
| `RESEND_API_KEY` | Sends email |
| `RESEND_FROM` | Sender address on a verified domain |
| `HOST_EMAIL` | Receives booking notifications, contact messages and offer signups |
| `ADMIN_PASSWORD` | Admin panel and the admin endpoints |
| `STAYOPS_API_KEY` | Bearer key for `/api/reservations` and `/api/refund` |
| `CRON_SECRET` | Lets `email-sequence` be triggered manually |
| `URL` | Site origin (set by Netlify) for Stripe redirects, email links and the iCal UID |
| `AIRBNB_ICAL_URL` | Optional legacy extra iCal feed |

Runtime content and config lives in the `site_config.config` JSON. Keys include `property`, `hero`, `pricing`, `colors`, `design`, `photos`, `amenities`, `houseRules`, `contact`, `policy`, `footer`, `social`, `icalFeeds` and `location`. Its shape is defined by `DEFAULT_CONFIG` and `readForm()` in `js/pages/admin.js`.

## 11. Significant design decisions

- **No build step, no framework, no dependencies.** The pages are static, the browser loads ES modules directly, and the functions use raw REST.
- **The server is the only DB client.** The service key stays in the functions, and the browser goes through `/api/*`. As a result RLS does not protect this site's data paths; application-level auth does.
- **Duplicated pricing engine.** `netlify/functions/pricing.js` mirrors `js/pricing.js` so the server can reject a tampered total (`e0cd428`). Any pricing change must be made in both files.
- **Single property per deploy, config-driven content.** Everything that can be edited lives in one `site_config` JSON row, which the admin panel and the `?edit=true` visual editor write as a whole object.
- **Shares tables with StayOps on purpose.** Direct bookings land in StayOps' `bookings` table, so they show up in StayOps operations. DB constraints were deliberately not added, so StayOps' own writers are not disturbed (`reservations.js` header).
- **Webhook robustness.** Duplicate deliveries are detected through `confirmation_code`. A failed DB write returns non-2xx so Stripe retries rather than losing a paid booking (`c10605a`).
- **Fail-closed security** on the M2M auth and promo auto-verification. Comparisons are constant-time, and the review and promo codes are crypto-random (`adec64f`).
- **Two iCal lists.** This site keeps its own import list in `site_config.icalFeeds`, separate from StayOps' `property_ical_feeds` table.

## 12. Current development status

- The site is live on Netlify at the custom domain. The last change was on 2026-10-24: approving email-captured Airbnb reviews and deriving the site rating from them.
- Both remote branches are fully merged into `main` and there are no open PRs (AI_HANDOFF).
- `GO-LIVE-AUDIT.md` (22 June 2026) is **partly stale**. Since it was written:
  - the legal placeholders were filled (`f9f4ceb`);
  - review codes were lengthened to 16 crypto-random characters and PII was removed from the email-sequence logs (`adec64f`);
  - `robots.txt` was added (`0d781dd`);
  - StayOps tightened the `photos` bucket policies (STRManagement migration `20260708_140000`).
  
  Its env-var table also predates `STAYOPS_API_KEY`.
- **Unverified:** whether Stripe is in live mode, the live webhook and `STRIPE_WEBHOOK_SECRET` are set, `RESEND_FROM` is a verified domain, and `ADMIN_PASSWORD` has been rotated (all open items in the audit).

## 13. Known limitations

- Admin "Block Dates" and "Delete booking" only change the browser's local state (§5.8).
- `book.js` checks for clashes against Supabase bookings only, not the iCal feeds, and nothing re-checks between Stripe checkout and the webhook. A double booking is possible in a narrow window.
- Minimum-stay rules are enforced only on the client.
- Owner blocks are not exported in `/calendar.ics`.
- The admin auth is a single shared password held in `sessionStorage`. The admin endpoints use plain `===` comparisons (only `_auth.js` is constant-time). CORS is `*` on the admin endpoints.
- `/api/reviews` PATCH and DELETE filter by `id` only, not by `property_id`, and the `reviews` table is shared.
- Several functions return raw `err.message` or Supabase text to clients.
- The public `/calendar.ics` reveals occupancy without a token.
- The newsletter box in the homepage footer is not wired to anything (`index.html` `.nl-input`).
- The admin Deploy Checklist and the config-error banner still refer to the retired Google Apps Script backend (`APPS_SCRIPT_URL`, `Code.gs`, Drive).
- `Welcome-book.html` is about 5 MB because of its inline base64 images.
- There are no automated tests.

## 14. Planned future improvements

The repo has no PLAN or roadmap docs and no TODO/FIXME comments. The only evidence of planned work is:

- **`GO-LIVE-AUDIT.md` open items:**
  - Stripe live activation, live webhook and secret;
  - one real end-to-end paid test;
  - rotate `ADMIN_PASSWORD`;
  - confirm STRA, insurance and GST;
  - optional Apple Pay, Google Pay and Link;
  - restrict CORS;
  - tidy error messages;
  - rate-limit the review endpoint;
  - a one-click HTTP unsubscribe with a suppression list;
  - a sitemap and analytics.
- **`reservations.js`:** a DB exclusion constraint is mentioned as the fix for the clash race, but it is deliberately not done.

## 15. Unverified / open questions

1. Whether StayOps (or anything else) calls `/api/reservations` or `/api/refund`. No caller was found in STRManagement.
2. Stripe live-mode status, and whether `STRIPE_WEBHOOK_SECRET` and the live webhook endpoint are configured.
3. Whether `/api/contact` actually reaches `contact-submit`. The `/api/*` rule comes first in `netlify.toml` (AI_HANDOFF).
4. Whether the Netlify functions run with a `TZ` setting. If not (UTC), the email-sequence day offsets are shifted by a day relative to Sydney (AI_HANDOFF).
5. Whether `bookings` has the `UNIQUE (local_id, user_id)` constraint relied on by `reservations.js`.
6. Whether StayOps' cleaning, revenue and calendar logic ignores rows with `platform='Blocked'`, as the comment in `reservations.js` expects. No such filter was found in STRManagement.
7. The Netlify build and publish settings in the UI, and whether deploys come automatically from `main`.
