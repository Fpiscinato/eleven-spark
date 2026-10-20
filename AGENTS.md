# ElevenSpark - Gloucestershire 11+ Grammar School Prep PWA

## Architecture & Deployment Context
- Target User: 9-year-old student (Year 5 UK) preparing for the Gloucestershire Grammar Schools Entrance Test (Pate's, Stroud High, Ribston Hall, Denmark Road, Crypt).
- Hosting & CI/CD: GitHub repository deployed as a static PWA on Cloudflare Pages / Workers (`wrangler.toml` compatible, SPA routing fallback).
- Tech Stack: React 18+, TypeScript, Vite, Tailwind CSS, Lucide React, Dexie.js (IndexedDB), KaTeX (math formulas), Zod (schema validation), Vite PWA plugin.

## Exam Rules (GL Assessment Standard for Gloucestershire)
1. Every question MUST have exactly 5 options (`A`, `B`, `C`, `D`, `E`).
2. Four Core Subjects: `english`, `vr` (Verbal Reasoning), `maths`, `nvr` (Non-Verbal Reasoning).
3. Real Mock Exam Format (Gloucestershire Two-Paper System):
   - Paper 1 (~50 mins): Section A (English Comprehension, Spelling, Punctuation, Best Word) -> Strict Section Lock -> Section B (Verbal Reasoning).
   - Paper 2 (~50 mins): Section A (Non-Verbal & Spatial Reasoning) -> Strict Section Lock -> Section B (KS2 Year 6 Maths).
   - Section Lock Rule: Once a student finishes Section A or the timer expires, they advance to Section B and CANNOT go back to view or edit Section A.

## Coding Standards
- Strictly typed TypeScript (no `any`).
- Never leave `TODO` placeholders or incomplete functions.
- UI must be child-friendly, high-contrast, tablet touch-friendly, with encouraging feedback in Practice Mode and realistic exam discipline in Mock Mode.
