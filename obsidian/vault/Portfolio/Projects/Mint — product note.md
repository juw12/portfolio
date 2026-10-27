---
id: mint-product-note
app: mint
type: product-note
status: live
date: 2026-10-26
tags: [template-marketplace, excel, google-sheets, affiliate, creator-economy, cloudflare-workers, workers-ai, android, capacitor]
aliases: [Sheetmint]
---

# Mint — product note

Project card: [[Mint]] (renamed from Sheetmint). Stackup was retired on 2026-10-26.

- Live app: https://juw12.github.io/projects/mint/
- API: https://mint-api.juw12.workers.dev/api/health
- Code: https://github.com/juw12/projects/tree/main/apps/mint

## Why

Selling Sheets / Excel templates still works, but the generic "budget template on Etsy" market is
saturated. The money is in:

- **niche systems**, such as toko stock, kos-kosan rental, arisan, UMKM invoicing in rupiah;
- **bundles**;
- **distribution**: creators and affiliates who post about the template.

Sellers struggle with the build (formulas, dropdowns, a dashboard that doesn't break) and with
marketing. Mint covers the whole loop: **prompt → AI template → tweak → publish → affiliates
promote with a generated content kit → buyer pays the seller → file unlocks.**

## Users

1. **Template creators.** They want a working, good-looking sheet in minutes and a place to sell it.
2. **Buyers.** Small business owners, freelancers and students who need a sheet that works in Excel
   and Google Sheets, with local currency.
3. **Affiliates / content creators.** They want something to promote, with copy ready to post and a
   clear way to get paid.

## Money flow

- The seller sets the price and an affiliate commission $c$ (0–50%). The platform fee $f$ is 0%
  at launch and configurable.
- Per confirmed sale:

  $$\text{seller keeps} = P\,(1 - f - c) \qquad \text{affiliate earns} = P\,c$$

  Example: $P = \text{Rp }49.000$, $c = 30\%$. The affiliate earns Rp 14.700 and the seller keeps
  Rp 34.300 at $f = 0$, or Rp 29.400 at $f = 10\%$. The 10% case is covered by the API and browser
  tests.
- The buyer pays the seller directly through the seller's payment link, quoting the order reference.
  The seller confirms the payment and the file unlocks. The seller pays the affiliate to the payout
  details the affiliate saved, then marks it paid. Mint never holds funds.

## Status

- **Live:**
  - the PWA on GitHub Pages, plus an Android app (Capacitor shell, `Mint-android.apk` on the
    `mint-android` release) and an iPhone home-screen app (Add to Home Screen);
  - the API on Cloudflare: Worker plus a SQLite Durable Object, Workers AI — live at `https://mint-api.juw12.workers.dev` (v2.2.0);
  - accounts that work across devices, with recovery codes, password change and account deletion;
  - the marketplace, orders (expire after 14 days), affiliate ledger and payouts;
  - formula-free previews of paid templates, listing reports with auto-hide, notification badges;
  - Mint AI generation, the content kit, 7 guides, Privacy and Terms pages;
  - **v2.2:** automatic payments — the seller connects their own Midtrans (Snap), Xendit (Invoice)
    or Stripe (Checkout) key (stored AES-GCM encrypted); the order is re-checked against the
    provider API and unlocks instantly; webhooks are only a hint;
  - **v2.2:** Web Push notifications (new order, paid, sold, commission paid); email via Resend is
    coded but off until `RESEND_API_KEY` + `MAIL_FROM` are set.
- **Verified:**
  - 23 end-to-end API checks on local `workerd` (incl. recovery, password change, delete, reports,
    counts, preview stripping).
  - A 40-check real-browser flow with separate seller, affiliate and buyer profiles: publish →
    preview + report → affiliate link → order → badges → confirm → .xlsx download → review → ledger
    → commission paid → change password → forgot password with recovery code → delete account →
    install page → offline fallback.
  - 160 static and JS-core checks.
  - v2.2: 30/30 API checks and 47/47 browser checks against mock Midtrans/Xendit/Stripe; on the
    live API, fake keys were correctly rejected by all three real providers and a dead push
    subscription was pruned. No real paid transaction yet.
  - The Android APK is built and signed locally; it has not been run on a physical phone.

## Next decisions

1. **Platform fee on automatic payments.** Done for the seller's own account (v2.2). Collecting a
   Mint fee needs xenPlatform or Stripe Connect (split payments).
2. **Fee.** Stay at 0% to attract sellers, or turn on 5–10% once payments are automatic.
3. **Email.** Push is live. Email needs a Resend key and a verified sending domain.
4. **Store listings.** Google Play ($25 once) and the App Store (Apple Developer, $99/year + Xcode).
5. **Custom domain** and a lawyer review of the Privacy and Terms pages before marketing.

## Open to-dos

- [x] Deploy the API once (done, v2.2.0): move `apps/mint/cloud/github-workflow.yml` to `.github/workflows/mint-api.yml` and push, or run `npx wrangler login` + `npx wrangler deploy` in `apps/mint/cloud`.
- [ ] Install `Mint-android.apk` on a real phone and check login, buy → checkout in browser, .xlsx share sheet.
- [x] Back up the Android signing key (done, stored privately in more than one place).
- [x] Automatic payments (seller's own Midtrans / Xendit / Stripe) and Web Push — v2.2.
- [ ] Run one real paid order end-to-end with a sandbox/live provider key.
- [ ] Email: `npx wrangler secret put RESEND_API_KEY` + `MAIL_FROM` var after verifying a domain.
- [x] Desktop Excel check: 104/104 formula and dashboard values in the 14 seed templates match Mint (27 Oct 2026).
- [x] Play prerequisites: web account-deletion page, UU PDP privacy update, terms for auto-payments, store listing kit in `apps/mint/store/` (v2.2.1).
- [ ] Play developer account ($25), build AAB (`./gradlew bundleRelease`), closed test with 12 testers × 14 days, then production.
- [ ] Lawyer review of the updated privacy/terms.
- [x] v2.3 (27 Oct 2026): seller coupons (5–90%, per template or store-wide, max uses, expiry, coupon links), listing views + 30-day insights (views, sales, conversion, earnings, daily chart), Open Graph share previews via `/s/<id>` (affiliate + coupon links show title/price on WhatsApp/X/Facebook). API 38/38, browser e2e 55/55, live check 9/9.
- [x] v2.4 (27 Oct 2026): English / Bahasa Indonesia switch (EN/ID button in the top bar; `js/i18n.js` translates the rendered UI from a ~570-phrase dictionary + rules, choice saved per device, first visit follows browser language). User content, typed chat and sheet previews never translate; `<option>` values stay English so filters/publishing keep working. Fallback is English for anything not in the dictionary; legal pages and .xlsx stay English. test_core passed, API 38/38, browser e2e 57/57, live check 6/6.
