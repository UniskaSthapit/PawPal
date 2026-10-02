# 🐾 PawPal — AI-assisted pet adoption

NIT3003/NIT3004 IT Capstone · Victoria University
Team: Uniska Sthapit, Pratikshya Bhujel, Pemba Sange Sherpa, Sushrit Phuyal

PawPal connects rescue pets with the right homes. Adopters describe their lifestyle in plain English and get
explained, compatibility-ranked matches from real shelter data, then apply online and follow every step on a
timeline. Shelter staff manage listings, a full adoption pipeline, enquiries and analytics — with AI helpers
that only ever work from data they're allowed to see.

---

## Run it locally (5 minutes)

Requires **Node.js 20.19+**.

```bash
npm install
npm start          # http://localhost:3000
```

No database, email, SMS or AI keys are needed to try everything: PawPal uses a file database, a **dev mailbox**
(`/dev-mailbox.html`) for emails and SMS codes, and its built-in **rules engine** for AI features.

| Role | Email | Password |
|---|---|---|
| Administrator | `admin@pawpal.com` | `Admin@123` |

These demo logins are for local use. In production they are deactivated automatically while they still use these
passwords; set `ADMIN_EMAIL` to create your real administrator account.
| Shelter staff (Melbourne) | `staff@pawpal.com` | `Staff@123` |
| Adopter | `user@pawpal.com` | `User@123` |

```bash
npm run dev        # auto-restart on changes
npm test           # 115 end-to-end API checks (throwaway database)
npm run test:ui    # 28 real-browser journeys (needs Playwright — see the script header)
npm run seed       # wipe and reload the demo data
```

---

## What's in it

### Adopters
- **Landing page** — photo slideshow (auto-play, swipe, pause, reduced-motion aware), quick species/age/location
  search, natural-language search, live stats computed from the database, featured pets, a *live* matching example,
  how-it-works, rescue stories, FAQ.
- **Adopt** — filters for species, age, size, sex, activity, apartment/kids/other pets/first-time owner, location,
  breed and availability (synced to the URL), plus natural-language search ("calm dog for an apartment") that shows
  how PawPal interpreted it and relaxes criteria transparently when nothing matches.
- **Many kinds of animal** — dogs, cats, rabbits, guinea pigs, hamsters, birds, reptiles (snakes and lizards), fish and
  farm animals (goats and cows), each filterable on its own. The newer species come with a written profile, species-appropriate
  health notes and a **care guide** (lifespan, setup, diet, routine, licence/PIC notes). Existing databases receive them
  automatically on the next start (schema v3).
- **Pet profiles** — gallery, key facts, "good with", health, shelter details, adoption steps, similar pets,
  favourite, **Ask the shelter** (real enquiry) and **Ask AI about this pet**. Shelter facts and PawPal's
  interpretation are always labelled separately.
- **Find My PawPal** — describe your life; PawPal extracts home, schedule, activity, experience, household,
  species/size/age/temperament preferences and location, then ranks real pets with a match %, reasons and
  things to consider. Scores are capped at 97% — guidance, never a guarantee.
- **Chat assistant** on every public page — recommends real pets (as linked cards), answers questions about a
  specific pet, explains the process/FAQ, explains *why* it recommended a pet, and reports the signed-in adopter's
  own application status. Conversations are saved to the account.
- **Accounts** — sign-up, email verification (24h single-use link, resend), login with "remember me", forgot/reset
  password (1h single-use link), **SMS phone verification** (6-digit code, 10-min expiry, 5 attempts, rate-limited).
- **Application** — 5-step form with draft autosave, conditional questions, review step and declaration. A
  **question helper** explains any question on request and never suggests answers.
- **Dashboard** — nudges (info requested, upcoming appointments, verify phone), recommendations from the saved
  lifestyle, active applications with progress, favourites, shelter replies, notifications, saved AI chats.
- **Adoption timeline** — every stage with dates and shelter notes, appointment card with *Add to calendar* (.ics),
  "action needed" reply box, message thread with the shelter, withdraw.
- **Notifications** — bell with unread count, mark one/all read, full history page; all triggered by real events.

### Shelter staff (scoped to their shelter) and administrators (everything)
- **Overview** — KPIs, pipeline counts, latest applications, upcoming appointments, assistant shortcut, insights.
- **Pets** — list by status with inline status changes; **add/edit** with photo upload (resized in the browser,
  stored in the database), AI-drafted description from public fields only, and clearly separated internal notes.
  Archive / mark adopted notifies everyone who saved the pet. New listings notify adopters whose saved lifestyle is
  a ≥80% match.
- **Applications** — pipeline tabs, search/sort/filter by pet, suitability score with line-by-line breakdown,
  rank among applicants, **AI summary**, status changes with appointment scheduling and a message (emailed),
  message thread, private staff notes, full history. Completing an adoption automatically closes and notifies the
  other applicants.
- **Enquiries** — answer adopter questions (emailed + in-app) or close them.
- **Analytics** — date range, KPIs with period-on-period change, weekly trends, adoption funnel (views → enquiries
  → applications → approved → adopted), interest by age/species/size, status mix, top and zero-result searches,
  CSV exports and **AI insights** generated only from those numbers.
- **AI assistant** — "Which applications need review?", "…are incomplete?", "Which pets have the most / no
  enquiries?", "What's booked this week?" — answered from a permission-scoped snapshot.
- **Administration** — users (role, shelter assignment, deactivate/reactivate — takes effect immediately),
  staff invitations, shelter management, system status, demo reset.

### Adoption workflow
`Submitted → Under Review → (Info Requested) → Interview → Meet & Greet → Approved → Adoption Scheduled → Adopted`,
or `Declined` / `Withdrawn`. Interview, Meet & Greet and Adoption Scheduled require a date. The pet is placed
**On Hold** from Meet & Greet onwards and released automatically if no one is progressing. Every change is stored in
the status history, emailed and posted as an in-app notification.

---

## Connecting real services

Copy `.env.example` to `.env` and fill in what you have — every variable is documented there. The startup log
shows which mode each service is in.

| Service | Variables | Without it |
|---|---|---|
| MongoDB Atlas | `MONGODB_URI`, `MONGODB_DB` | File database `data/pawpal-db.json` |
| Owner admin | `ADMIN_EMAIL` | Demo admin only (local) |
| Contact links | `CONTACT_EMAIL` (email), `APP_URL` (website) | `ADMIN_EMAIL`, then `pawpaladmin@gmail.com`; `http://localhost:3000` |
| Email | `BREVO_API_KEY` (single verified sender, e.g. Gmail) **or** `RESEND_API_KEY` (own domain) **or** `SMTP_*` | Dev mailbox (local only) |
| SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Codes in dev mailbox locally; disabled in production |
| AI | `GEMINI_API_KEY` (free tier) **or** `ANTHROPIC_API_KEY` **or** `OPENAI_API_KEY` | Rules engine on the same live data |
| Maps | `GOOGLE_MAPS_API_KEY` | Keyless Google Maps embed |

Existing databases are upgraded automatically on start (versioned migration): legacy statuses
(Pending/Shortlisted/Visit Scheduled/Rejected) are mapped to the new workflow, shelters are created and assigned,
inline photos move to the images collection, and the first staff account becomes an administrator.

See **DEPLOY.md** for Render + MongoDB Atlas.

---

## Architecture

```
server.js                 Express: security headers (CSP), API, server-side page protection, static site
src/
  config.js               Environment settings
  constants.js            Roles, pet statuses, adoption workflow
  db/                     MongoDB or file database behind the same interface (+ indexes)
  middleware/auth.js      JWT in httpOnly cookie; adopter / staff / admin; shelter scoping
  routes/                 auth · pets · images · applications · favourites · enquiries · ai · admin · misc
  services/
    matching.js           Lifestyle parser + explainable compatibility engine
    ai.js / llm.js        AI features (Anthropic/OpenAI/Gemini) with grounded prompts and rules fallback
    knowledge.js          FAQ + application question explanations
    mailer.js / sms.js    Email (Resend/Brevo/SMTP/dev) and SMS (Twilio/dev)
    bootstrap.js          Owner administrator (ADMIN_EMAIL) and production demo-account lockout
    notify.js             In-app notifications
    migrate.js / seed.js  Schema upgrades and demo data
public/                   Vanilla HTML/CSS/JS (no build step)
  css/pawpal.css          The design system
  js/ui.js · chat.js      Shared layout, components, assistant widget
  js/pages/*.js           One script per page
  fonts/                  Self-hosted Fraunces + Plus Jakarta Sans (OFL)
scripts/                  smoke-test.js · ui-test.js · reset-data.js
```

**Collections:** users, shelters, pets, images, applications (with history + messages), favourites, enquiries,
notifications, conversations, matches, phoneCodes, emails, sms, searches, events, messages, meta.

## Design system (v6 "Hearth")

The interface is a premium redesign built on the same pages, scripts, API and data as before.

- **Palette** — cream paper, terracotta, soft brown, peach and honey gold, defined once as CSS tokens at the top of
  `public/css/pawpal.css` (sage, sky and red are kept only for status meaning).
- **Type** — Fraunces, used light and tightly tracked for headings with italic terracotta accents, and Plus Jakarta Sans
  for the interface. Both are self-hosted, so the strict Content-Security-Policy is unchanged.
- **Shape** — organic radii, pill controls, floating "island" sections, morphing blob shapes and soft, warm,
  layered shadows.
- **Motion** — a small vanilla toolkit in `public/js/ui.js` (no libraries):
  - `PawPal.reveal()`: staggered scroll reveals.
  - `PawPal.hscroll()`: the home page's pet rail. It pins on desktop and vertical scrolling moves it sideways; on touch
    devices it becomes a swipe carousel.
  - `PawPal.carousel()`: a momentum carousel with mouse-drag inertia, buttons and dots.
  - `PawPal.countUp()`: animated stat numbers.
  - `PawPal.accordion()`: smooth FAQ open and close.

  Every effect is progressive. Content is readable without JavaScript, and `prefers-reduced-motion` turns animation off.
- **Interactions** — pet cards lift with a soft shadow on hover, filter chips show a check when selected, and the
  favourite heart pops when tapped. The Adopt page also has a species category bar that stays in sync with the
  Species filter.

## Security & data safety
- bcrypt password hashes; signed JWT in an httpOnly, SameSite cookie (Secure in production); changing/resetting a
  password or changing access signs out other sessions.
- Verification/reset tokens are random, stored only as SHA-256 hashes, single-use and expiring; phone codes are
  hashed, expire in 10 minutes, allow 5 attempts and are rate-limited.
- Role checks on every API route; staff are scoped to their own shelter's pets, applications and enquiries;
  adopters only ever see their own applications (never scores or staff notes).
- Internal pet fields (medical, rescue, behaviour notes) are stripped from every public response and never sent
  to AI. AI prompts contain only public pet data and, when asked, the user's own application statuses. Any pet a
  model mentions is validated against the database.
- Strict Content-Security-Policy (no inline scripts), rate limits on auth, AI, contact, SMS and events, input
  length caps and output escaping everywhere. The dev mailbox is disabled in production.
