# ElevenSpark

A child-friendly Progressive Web App for Gloucestershire 11+ grammar school preparation (Year 5), built for the G7 FSCE standard used by Pate's, Stroud High, Ribston Hall, Denmark Road and The Crypt.

## Features

- **Three core subjects**: English, Maths and Compass (Across the Curriculum), plus an optional Brain Gym (VR/NVR).
- **Real mock format**: three papers with a strict section lock.
  - **Adventure Paper** (~45 min): Section A (English Comprehension & Vocabulary) → Section B (KS2 Maths Fluency).
  - **Beacon Paper** (~45 min): Section A (English & Maths written answers) → Section B (Creative Writing Task with a live rubric).
  - **Compass Paper** (~40 min): Section A across 11 KS2 disciplines.
  - **Mini-Mock** (20 min): 12 + 12 mixed core questions.
- **Practice Mode**: a no-scroll screen, instant encouraging feedback, two levels of help (💡 Quick Explanation and 🧠 Learn How to Solve) and a Mistake Clinic for anything answered wrongly or too slowly.
- **Guided creative writing**: a 3-step Beacon flow (Read → Write → Check) with a real interactive checklist.
- **Parent Mode**: a PIN-protected dashboard (`1126` by default) for profile management, granular progress resets and cloud sync settings.
- **3-phase roadmap**: Foundation (Oct–Jan), Speed (Feb–Apr) and Stamina (May–Jul), with a daily "20-Minute Spark".
- **Offline-first**: all data lives in IndexedDB (Dexie) and syncs to a private GitHub Gist when configured.

## Tech stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · Lucide React · Dexie.js (IndexedDB) · KaTeX · Zod · vite-plugin-pwa.

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check (tsc -b) and build for production
npm run lint     # oxlint
npm run preview  # preview the production build
npm run audit    # child-safety + maths + content audits
```

## Deployment

Hosted as a static PWA on Cloudflare Workers (`wrangler.jsonc`, SPA fallback via `assets.not_found_handling`).

### Automatic (recommended)

Every push to `main` runs `.github/workflows/deploy.yml`, which audits, builds and publishes to the `eleven-spark` Worker. For it to work, add these two secrets in **GitHub → Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with *Workers Scripts: Edit* and *Account Settings: Read* for the account. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID (Settings → Account → Account ID). |

The run is visible in the **Actions** tab of the repository, and the workflow summary confirms the commit that went live.

### Manual

```bash
npm run deploy        # build and deploy to production
npm run deploy:preview # build and upload a preview version
```

Requires an authenticated Wrangler session (`npx wrangler login`) with access to the `eleven-spark` Worker.

## How to tell which version is running

- **Settings → App version**: shows the app version (`v1.7.1`), the question bank version (`Bank v6`) and what is new in that version.
- **Sidebar (desktop) / bottom of the page (mobile)**: the version seal `v1.7.1 • Glos FSCE Edition`.
- **A banner appears at the top** as soon as a new version has been downloaded and is ready: *“A new version of ElevenSpark is ready… Tap to update.”* Tap **Update now** and the app reloads with the new code.
- The **question bank** re-seeds itself whenever `QUESTION_BANK_VERSION` changes, so a new version also means new questions.
