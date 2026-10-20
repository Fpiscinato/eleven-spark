# ElevenSpark

A child-friendly Progressive Web App for Gloucestershire 11+ grammar school preparation (Year 5), built for the GL Assessment standard used by Pate's, Stroud High, Ribston Hall, Denmark Road and The Crypt.

## Features

- **Four core subjects**: English, Verbal Reasoning (VR), Maths and Non-Verbal Reasoning (NVR).
- **Real mock format**: the Gloucestershire two-paper system with strict section lock (Paper 1: English → VR; Paper 2: NVR → Maths).
- **Practice Mode**: instant encouraging feedback, pace targets and a Mistake Clinic for anything answered wrongly or too slowly.
- **Parent Mode**: a PIN-protected dashboard (`1126` by default) for profile management, granular progress resets and cloud sync settings.
- **3-phase roadmap**: Foundation (Oct–Mar), Speed (Apr–Jun) and Stamina (Jul–Sep), with a daily "20-Minute Spark".
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
```

## Deployment

Hosted as a static PWA on Cloudflare Workers (`wrangler.jsonc`, SPA fallback via `assets.not_found_handling`).

```bash
npm run deploy        # build and deploy to production
npm run deploy:preview # build and upload a preview version
```

Requires an authenticated Wrangler session (`npx wrangler login`) with access to the `eleven-spark` Worker.
