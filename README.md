# 🐾 PawPal — AI-Powered Pet Adoption Management System

NIT3003/NIT3004 IT Capstone · Victoria University
Team: Uniska Sthapit, Pratikshya Bhujel, Pemba Sange Sherpa, Sushrit Phuyal

PawPal is a full-stack web app for animal shelters. Adopters browse pets, take an AI matching quiz or chat with PawPal AI, apply online and track their application. Shelter staff publish pets with AI-written descriptions, review applicants ranked by an AI suitability score, schedule visits, and PawPal emails adopters automatically at every step.

---

## 1. Run it on your computer (5 minutes)

You need **Node.js 20.19 or newer** — download the LTS version from https://nodejs.org.

```bash
cd pawpal
npm install
npm start
```

Open **http://localhost:3000**. That's it — no database, email account or API keys are needed to try everything.

| Account | Email | Password | Opens |
|---|---|---|---|
| Staff (shelter admin) | `admin@pawpal.com` | `Admin@123` | Staff dashboard (use the **Staff Login** tab) |
| Adopter | `user@pawpal.com` | `User@123` | My Applications |

Or create your own adopter account with **Sign Up**. Because no email server is configured yet, the verification email appears in the **dev mailbox** at http://localhost:3000/dev-mailbox.html — open it, click **Verify my email**, then log in.

Other commands:

```bash
npm run dev    # restarts automatically when you edit a file
npm test       # runs 56 end-to-end checks of every feature
npm run seed   # wipes all data and reloads the sample pets/applications
```

---

## 2. What works

### Adopter side
- **Home** — live pet grid from the database, keyword search, filters (dogs, cats, other, active, apartment friendly, good with kids), sorting, favourites (heart).
- **Sign up → email verification → login** — passwords hashed with bcrypt, login blocked until the email is verified, "resend link", "forgot password" with a 1-hour reset link, "remember me".
- **Pet profile** — photo gallery, facts, AI bio, similar pets, apply button that knows whether you're logged in or already applied.
- **AI matching** — 6-step quiz with live top-3 results, plus a **PawPal AI chatbot** that reads your lifestyle from normal sentences and recommends real pets.
- **Adoption inquiry form** — validated, pre-filled from your account, confirmation email.
- **My Applications** — progress tracker (Pending → Shortlisted → Visit Scheduled → Approved → Adopted), visit date, messages from the shelter, withdraw, notification bell.
- **Find a vet** — Google map of clinics by suburb or your location.
- **My Profile** — edit details, change password, saved pets.

### Staff portal (protected — visitors and adopters are redirected)
- **Dashboard** — live stats, recent applications, upcoming visits.
- **Manage Pets** — search/filter, change status inline, edit, delete.
- **Add / Edit Pet** — all details, **Generate Description** (AI), photo upload with automatic resizing, drag & drop, cover photo, staff-only medical and rescue notes, drafts.
- **Applications** — status filter chips, search, filter by pet (auto-ranks applicants by AI score), review window with score ring, line-by-line score breakdown, applicant answers, history timeline, private notes, and status updates that email the applicant. Marking one applicant **Adopted** closes every other open application for that pet and notifies them.
- **Analytics** — date range, visits, searches, inquiries, adoptions with % change, top keywords, inquiries by weekday, AI matches vs adoptions, status chart, "search gaps" (searches that found nothing), CSV export.
- **Settings** — account, password, add staff members (they get an invite email), deactivate staff, system status, reset demo data.

---

## 3. Where each proposal requirement lives

| Req | Feature | Main files |
|---|---|---|
| FR-01 | Add pet + admin dashboard | `public/add-pet.html`, `public/pets.html`, `public/index.html`, `src/routes/pets.js` |
| FR-02 | AI pet description | `src/services/ai.js` → `describePet`, button on Add Pet |
| FR-03 | Hide sensitive pet info | `toPublic()` in `src/routes/pets.js` strips medical/rescue notes for non-staff |
| FR-04 | Keyword search | `GET /api/pets?q=` in `src/routes/pets.js`, search bar on Home |
| FR-05 | AI pet matching | `petMatchScore` in `src/services/scoring.js`, `public/ai-matching.html` |
| FR-06 | Search & inquiry analytics | `src/routes/misc.js` (analytics), `public/analytics.html` |
| FR-07 | Adoption inquiry form | `public/inquiry-form.html`, `POST /api/applications` |
| FR-08 | Adopter suitability ranking | `calculateSuitabilityScore` in `src/services/scoring.js` — follows Pseudocode 1 exactly (25/25/20/15/15, High ≥ 80, Medium ≥ 60) |
| FR-09 | Status tracking | `PATCH /api/applications/:id/status`, `public/my-applications.html` |
| FR-10 | AI chatbot | `chat()` in `src/services/ai.js`, "Chat with AI" tab |
| FR-11 | Nearby vets (Google Maps) | `src/services/maps.js`, `public/vet-finder.html` |
| FR-12 | Automatic closure notifications | Adopted branch in `src/routes/applications.js` + `src/services/mailer.js` |

---

## 4. Connect the real services (all optional)

Copy `.env.example` to `.env`, fill in what you have, and restart with `npm start`. The terminal shows which mode each service is using.

**MongoDB Atlas (database)** — create a free M0 cluster at https://www.mongodb.com/atlas, add a database user, allow your IP (or `0.0.0.0/0` for hosting), then copy the connection string into `MONGODB_URI`. Sample data loads automatically into the empty database. Without it, data is saved to `data/pawpal-db.json`.

**Email (Gmail example)** — turn on 2-Step Verification for the Google account, create an **App Password** at https://myaccount.google.com/apppasswords, then set:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=yourteam@gmail.com
SMTP_PASS=the16characterapppassword
MAIL_FROM="PawPal <yourteam@gmail.com>"
```
Once SMTP is set, the dev mailbox switches off and real emails are sent.

**OpenAI (AI descriptions + chatbot)** — create a key at https://platform.openai.com/api-keys and set `OPENAI_API_KEY`. Without a key, PawPal uses its built-in rule-based AI, so the features still work. If OpenAI fails, it falls back automatically.

**Google Maps (vet list)** — in Google Cloud Console enable **Places API (New)** and **Maps Embed API**, create a key, restrict it to your website address, and set `GOOGLE_MAPS_API_KEY`. Without a key the page shows the free Google map embed.

---

## 5. Put it online (Render + MongoDB Atlas)

1. Push this folder to a GitHub repository (the `.gitignore` already excludes `node_modules`, `.env` and data).
2. At https://render.com choose **New + → Blueprint** and select the repo — `render.yaml` sets everything up.
3. Fill in `MONGODB_URI` (required on Render because its disk resets on every deploy), `APP_URL` (your Render address, e.g. `https://pawpal.onrender.com`) and, ideally, the SMTP settings so users can verify their email.

Railway works the same way: new project from GitHub, start command `npm start`, add the same variables.

---

## 6. Project structure

```
pawpal/
├─ server.js               Express app: security headers, API, page protection, static site
├─ src/
│  ├─ config.js            Reads .env
│  ├─ db/                  Database: MongoDB (Atlas) or file database, same interface
│  ├─ middleware/auth.js   JWT in httpOnly cookie, requireAuth / requireStaff
│  ├─ routes/              auth · pets · applications · misc (AI, analytics, users, vets, system)
│  └─ services/            mailer · scoring (FR-05/08) · ai (FR-02/10) · maps (FR-11) · seed
├─ public/                 The website (your original HTML/CSS design, now dynamic)
│  ├─ js/api.js            All calls to the server
│  ├─ js/ui.js             Shared nav, sidebars, footer, toasts, dialogs, helpers
│  ├─ js/pages/*.js        One script per page
│  └─ css/                 Original styles + app.css (components) + pages.css (page additions)
├─ scripts/smoke-test.js   npm test
└─ render.yaml             Hosting blueprint
```

## 7. Security notes

Passwords are bcrypt-hashed. Login uses a signed JWT in an httpOnly, SameSite cookie (secure in production). Changing or resetting a password signs out every other session. Login, sign-up, reset, AI and contact routes are rate-limited. Staff pages are protected on the server, not just hidden in the browser. All user text is escaped before display. Email-verification and reset tokens are random, stored only as SHA-256 hashes, and expire (24 h / 1 h). Before going live, set a long random `JWT_SECRET` and configure SMTP (the dev mailbox shows every email to anyone who opens it, so it is for local testing only).

## 8. Differences from the proposal's tech stack

The proposal lists React 18 and Python 3.12. This build keeps the team's existing HTML/CSS design with plain JavaScript on the front end, and implements the AI scoring in Node.js instead of Python so the whole system runs as one service. All twelve functional requirements are implemented. Mention this in your report or check with your tutor if a React front end is a marking requirement.

---

## Content added in this update

- **Recent rescue stories** — three demo rescue stories (`public/js/stories.js`) shown on the homepage and the
  About page, each with a photo, outcome tag, excerpt, tags and the full story in a dialog. Reuse them anywhere with
  `<div class="stories-grid" data-stories="3"></div>`.
- **Ending animal cruelty** (`public/ending-animal-cruelty.html`) — help numbers for urgent, non-urgent and
  life-threatening situations; what to include in a report; a written report form; what counts as cruelty; what
  happens after a report; warning signs; prevention and school sessions; demo news updates; and a donation portal
  for cruelty-prevention work.
- **About PawPal** — new "How it started" section with a timeline, "Who we are" (shelter team, volunteers, project
  team), "How we help" (six ways), the rescue stories, and a contact panel with the shelter numbers.
- **Contact us** (`public/contact.html`) — enquiry form posting to the existing `/api/contact`, contact details,
  opening hours, a "who to contact for what" router, and a "coming to the shelter" section. The inline form that used
  to sit on the About page now lives here.
- **Supporting pieces** — `public/css/sections.css` (additive styles for the new sections only, using the existing
  PawPal palette), 42 extra SVG icons in `public/js/ui.js` with a `data-icon` helper, and local pet illustrations in
  `public/images/pets/` used as `onerror` fallbacks so no photo can render broken.

Nothing else in the site was restyled, and the backend is unchanged — `npm test` still passes all 56 checks.
