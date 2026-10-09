# PawPal — go-live checklist

## 1. MongoDB Atlas (required)
1. Create a free M0 cluster at https://www.mongodb.com/atlas.
2. **Database Access** → add a user and password. **Network Access** → allow `0.0.0.0/0` (Render IPs change).
3. **Connect → Drivers** → copy the `mongodb+srv://…` string into `MONGODB_URI`.
   On first start PawPal loads demo data into an empty database, or upgrades an existing PawPal database in place.

## 2. Owner account and email (required)
Set `ADMIN_EMAIL=pawpaladmin@gmail.com`. On start-up PawPal makes this account the administrator and emails it a
link to choose a password (valid 24 hours; afterwards use *Forgot password*).

PawPal sends from that address over HTTPS (Render's free plan blocks SMTP). The first configured option is used.

### Option A — Gmail API (recommended)
Google sends the mail itself, so it passes Gmail's checks and lands in inboxes. Limit: about 500 emails a day.
1. https://console.cloud.google.com → create a project (e.g. "PawPal").
2. **APIs & Services → Library → Gmail API → Enable**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): app name "PawPal", user support email and
   developer contact `pawpaladmin@gmail.com`, audience **External**. Under **Audience**, click **Publish app**
   (status *In production*). Apps left in *Testing* have refresh tokens that expire after 7 days.
4. **Clients → Create client → Web application**. Under *Authorised redirect URIs* add
   `https://developers.google.com/oauthplayground`. Copy the **Client ID** and **Client secret**.
5. Open https://developers.google.com/oauthplayground → gear icon → tick **Use your own OAuth credentials** →
   paste the Client ID and secret. In *Step 1* type the scope `https://www.googleapis.com/auth/gmail.send`,
   click **Authorize APIs** and sign in as `pawpaladmin@gmail.com` (Google warns the app isn't verified —
   choose *Advanced → Go to PawPal*, it's your own app). In *Step 2* click **Exchange authorization code for
   tokens** and copy the **Refresh token**.
6. In Render set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN`. The startup log shows
   `Email: Gmail API`, and `/api/config` shows `"emailMode":"gmail"`. Other email keys can stay; Gmail is used first.

If emails start failing with `invalid_grant`, the token was revoked (e.g. the Google password changed) — repeat
step 5 and update `GMAIL_REFRESH_TOKEN`.

### Keeping Gmail healthy
Google can rate-limit or lock a Gmail account that sends too much, bounces a lot or looks automated. PawPal protects
`pawpaladmin@gmail.com` like this — and you should do the same:
- **Publish the OAuth app** (Google Auth Platform → Audience → *Publish app*). Apps left in *Testing* get refresh
  tokens that expire after 7 days, and then every email fails with `invalid_grant`. If that happens, every admin page
  shows *"Gmail sign-in expired — create a new refresh token"*: repeat step 5 above and update `GMAIL_REFRESH_TOKEN`.
- **Daily limit:** PawPal sends at most `MAIL_DAILY_LIMIT` emails a day (default 300; Google's own limit for a normal
  Gmail account is about 500). Further emails that day are logged as *deferred*, in-app notifications still arrive, and
  admins see a banner. The counter resets at midnight Melbourne time. *Settings → System status* shows "sent today".
- **Only real addresses on the live site.** Demo and test addresses (`example.com`, `*.test`, `*.invalid`, the demo
  `pawpal.com` accounts) and obvious typos (`gmial.com`, `gmail.con` …) are never sent to — bounces are the fastest way
  to get an account blocked. Use your own real addresses when you test on the live site.
- **Never run the automated tests against production.** `npm test` and `npm run test:ui` use their own throwaway
  database and the dev mailbox; don't point them at the live `MONGODB_URI` or give them the Gmail keys.
- Duplicate emails (the same email about the same application within 2 minutes, e.g. a double click) are sent once.
  Temporary failures are retried once after 3 seconds; permanent ones (4xx) never are.
- Every email has a plain-text part as well as HTML, and `Reply-To` is your `MAIL_FROM` address. No attachments are sent.

### Option B — Brevo
1. Create a free account at https://www.brevo.com (300 emails/day).
2. **Senders & IPs → Senders → Add a sender** → `pawpaladmin@gmail.com` → click the confirmation email Brevo sends.
3. **SMTP & API → API keys → Generate a new API key** → put it in `BREVO_API_KEY`.

Deliverability tip: mail sent "from" a Gmail address by another service can land in spam for some recipients.
If you later buy a domain, verify it in Brevo (or Resend) and switch `MAIL_FROM` to e.g. `hello@yourdomain.com`.

## 3. SMS phone verification (optional)
1. https://console.twilio.com → copy the **Account SID** and **Auth Token**.
2. Buy or use an SMS-capable number → `TWILIO_FROM_NUMBER` (E.164, e.g. `+61…`). Trial accounts can only text
   verified numbers.
Without these, phone verification is switched off in production (the UI says so) — nothing is faked.

## 4. AI (optional)
Pick **one**:
- **Free — Google Gemini:** https://aistudio.google.com/apikey → **Create API key** (no card) → `GEMINI_API_KEY`.
  Free-tier limits are modest, and Google may use free-tier prompts to improve its products (PawPal only sends public
  pet data and what people type into the assistant). If the free limit is hit, PawPal falls back to its rules engine.
- **Paid — Anthropic:** https://console.anthropic.com → add credit (min US$5) → **API keys** → `ANTHROPIC_API_KEY`.
- **Paid — OpenAI:** `OPENAI_API_KEY`.

If several keys are set, the order is Anthropic → OpenAI → Gemini. The startup log shows which one is active
(e.g. `AI: Google Gemini (gemini-flash-latest)`). With no key, the rules engine answers from live data.

## 5. Deploy on Render
1. Push this repo to GitHub (`.env` is git-ignored).
2. Render → **New + → Blueprint** → choose the repo. `render.yaml` creates the service and generates `JWT_SECRET`.
3. Fill in `APP_URL` (your Render URL), `MONGODB_URI`, `ADMIN_EMAIL`, the `GMAIL_*` values (or `BREVO_API_KEY`), your AI key (`GEMINI_API_KEY` or `ANTHROPIC_API_KEY`), and any optional keys.
4. After the first deploy, fix `APP_URL` if the real URL differs, then redeploy.

## 6. After going live
- Open the set-password email sent to `ADMIN_EMAIL`, choose a password and log in with the **Shelter staff** tab.
- In production, demo accounts that still use their published passwords are deactivated automatically on every
  start. Invite your real staff from **Users & shelters**.
- Edit the shelters (names, addresses, phone numbers, hours) to your real details.
- Keep `ALLOW_DEMO_RESET=false` in production.
- Have the privacy policy and terms reviewed and add your organisation's legal details.
- Free Render instances sleep when idle — the first request can take ~50 seconds.

## 7. Extras: what to know when deploying
Nothing new is required: the extras use the same keys as above. The existing database is upgraded automatically on
the next start (schema v4 gives every pet an adoption fee if it had none; new collections and indexes are created).

- **Email settings (optional):** `MAIL_DAILY_LIMIT` (default 300) and `MAIL_RETRY_DELAY_MS` (default 3000) — see
  *Keeping Gmail healthy* above. They are already in `render.yaml`.
- **Two-factor login:** staff and admins can turn it on under *Settings → Two-factor authentication*. To make it
  mandatory, an administrator turns it on for themselves first, then switches on *Users & shelters → Security →
  Require two-factor login for staff*. 2FA secrets are encrypted with a key derived from `JWT_SECRET`, so **don't
  change `JWT_SECRET`** once people use 2FA (if you must, reset their 2FA from *Users & shelters*).
- **AI features** (social posts, compare, translation, care plans) use the same AI key. Without one, captions,
  comparisons and care plans come from PawPal's templates, and translation shows the page in English with a notice.
  Translations are cached in the database, so each text uses the AI only once per language.
- **Adoption fee payments are a simulation.** No payment provider is connected and no real money is taken; only the
  published test cards work. Every checkout page and receipt says so. Set each pet's real fee on the pet form.
- **Top 5 vets with Google ratings:** set `GOOGLE_MAPS_API_KEY` in Render. In your Google Cloud project (the same one as Gmail), go to
  *APIs & Services → Library → Places API (New) → Enable*, then *Credentials → Create credentials → API key*. Restrict it to
  *Places API (New)*. Google needs a billing account on the project, but it includes a free monthly allowance that is far
  more than a small site uses. Each vet search makes one Places request (with ratings and reviews). Without the key,
  the vet finder still shows the map and a link to the top-rated vets on Google Maps.
- **Adoption categories** are added to existing pets automatically on the next start (schema v5), along with 12 new
  demo animals across the four categories. Their photos are PawPal illustrations; upload real photos from *Pets → Edit*.
- **Flyers and short links** use `APP_URL` for the QR code and `/p/<petId>` links — make sure it is your real URL.
- **Meet & greet times** are entered in the browser's local time; set your shelters' availability under
  *Availability* after deploying (the demo times only exist in the demo data).
