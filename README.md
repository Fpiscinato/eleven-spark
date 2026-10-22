# ElevenSpark

A child-friendly Progressive Web App for Gloucestershire 11+ grammar school preparation (Year 5), built for the G7 FSCE standard used by Pate's, Stroud High, Ribston Hall, Denmark Road and The Crypt.

## Features

- **Three core subjects**: English, Maths and Compass (Across the Curriculum), plus an optional Brain Gym (VR/NVR).
- **Real mock format**: three papers with a strict section lock.
  - **Adventure Paper** (~45 min): Section A (English Comprehension & Vocabulary) → Section B (KS2 Maths Fluency).
  - **Beacon Paper** (~45 min): Section A (English & Maths written answers) → Section B (Creative Writing Task with a live rubric).
  - **Compass Paper** (~40 min): Section A across 11 KS2 disciplines.
  - **Mini-Mock** (20 min): 12 + 12 mixed core questions.
- **Practice Mode**: an "action first" screen (▶️ Start Practice and ⚡ Quick 10 Mix at the top, everything else folded into three collapsible cards), a no-scroll question screen, instant encouraging feedback, two levels of help (💡 Quick Explanation and 🧠 Learn How to Solve) and a Mistake Clinic for anything answered wrongly or too slowly. The Mistake Clinic and the Mistake Bank use the exact same runner as Practice.
- **Guided creative writing**: a 3-step Beacon flow (Read → Write → Check) with a real interactive checklist.
- **Parent Mode**: a PIN-protected dashboard (`1126` by default) for profile management, granular progress resets and cloud sync settings.
- **3-phase roadmap**: Phase 1 — Core KS2 Mastery (Oct–Jan), Phase 2 — Beacon Written Precision & Speed (Feb–Apr) and Phase 3 — Full FSCE 3-Paper Stamina (May–early July), with a daily "20-Minute Spark".
- **Offline-first**: all data lives in IndexedDB (Dexie) and syncs to a private GitHub Gist when configured.
- **Backup in two layers**: a JSON backup you can download and restore (`BackupRestoreCard`), plus local snapshots kept on the device (`LocalSnapshotsCard`).
- **Analytics and Guide screens**: a dedicated progress breakdown (`AnalyticsPage`) and an in-app guide (`GuidePage`).

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Lucide React · Dexie.js (IndexedDB) · KaTeX · Zod · vite-plugin-pwa.

**Live site:** <https://eleven-spark.f-piscinato.workers.dev>

## Project layout

```
src/
  App.tsx              routes and the app shell
  config/version.ts    APP_VERSION, question bank version, release notes
  pages/               Dashboard, Practice, Mock exam, Progress, Analytics, Guide, Settings
  screens/             Dashboard and Progress screens
  components/          AppShell, exam runner, brand/update banner, parent-mode cards
  db/                  Dexie schema and queries
  generators/          question generators (Compass and friends)
  services/            Gist sync, local snapshots, PWA registration, data reset
  utils/               roadmap calculator, scoring and other pure helpers
  data/                the question bank
```

## Development

```bash
npm install
npm run dev           # start the dev server
npm run build         # type-check (tsc -b) and build for production
npm run lint          # oxlint
npm run preview       # preview the production build
npm run audit         # safety + maths + content + FSCE model + visibility audits
npm run version:bump  # bump the app version (base-10, digit by digit)
npm run icons         # regenerate the PWA icons for the new version
```

### Version numbering

The version is `major.minor.patch` and every part is a single base-10 digit (0-9). `npm run version:bump` always follows the decimal rule, digit by digit:

```
1.7.5 -> 1.7.6 -> ... -> 1.7.9 -> 1.8.0 -> ... -> 1.9.9 -> 2.0.0
```

After bumping, run `npm run icons` so the PWA icons are regenerated into `public/app-icons/vX.Y.Z/`. The version itself is only ever shown in **Settings**.

## Deployment

Hosted as a static PWA on Cloudflare Workers (`wrangler.jsonc`, SPA fallback via `assets.not_found_handling`). The live site is <https://eleven-spark.f-piscinato.workers.dev>.

### Automatic (recommended)

Every push to `main` is published by **Cloudflare Workers Builds** (the repository is connected
to the Cloudflare account, same as the other projects). In **Cloudflare → Workers & Pages →
eleven-spark → Settings → Builds**, the build configuration must be:

| Setting | Value |
| --- | --- |
| Build command | `npm run ci` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |
| Node version | `22` |

`npm run ci` runs the five audits **before** the build, so a broken question bank is never
published. The build history is visible in the Cloudflare dashboard.

> There is **no GitHub Actions workflow** in this repository. The old
> `.github/workflows/deploy.yml` was removed: it needed `CLOUDFLARE_API_TOKEN` and
> `CLOUDFLARE_ACCOUNT_ID` secrets that were never configured, so every push produced a red
> failed run and a failure email. Cloudflare Builds does the same job with no secrets.

### Manual

```bash
npm run deploy        # build and deploy to production
npm run deploy:preview # build and upload a preview version
```

Requires an authenticated Wrangler session (`npx wrangler login`) with access to the `eleven-spark` Worker.

## How to tell which version is running

- **Settings → App version**: the only place that shows the version (`v1.7.6`), the question bank version (`Bank v6`) and what is new in that version.
- **A banner appears at the top** as soon as a new version has been downloaded and is ready: *“A new version of ElevenSpark is ready… Tap to update.”* Tap **Update now** and the app reloads with the new code.
- The **question bank** re-seeds itself whenever `QUESTION_BANK_VERSION` changes, so a new version also means new questions.
