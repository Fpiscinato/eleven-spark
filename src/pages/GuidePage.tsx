import { BarChart3, BookOpen, ClipboardList, GraduationCap, Heart, Rocket, Users } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ScreenHeader, btnPrimaryClass, btnSecondaryClass, cardClass } from '../components/ui'
import type { ScreenId } from '../types'

interface GuidePageProps {
  onNavigate: (screen: ScreenId) => void
}

type GuideTab = 'students' | 'parents'

function SectionCard({
  icon: Icon,
  title,
  accentClass,
  children,
}: {
  icon: typeof BookOpen
  title: string
  accentClass: string
  children: ReactNode
}) {
  return (
    <section className={cardClass}>
      <div className="mb-3 flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-2xl ${accentClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
      </div>
      <div className="space-y-2 text-base font-semibold leading-relaxed text-slate-700">{children}</div>
    </section>
  )
}

export function GuidePage({ onNavigate }: GuidePageProps) {
  const [tab, setTab] = useState<GuideTab>('students')

  return (
    <div className="mx-auto max-w-3xl">
      <ScreenHeader
        title="Guide"
        subtitle="How ElevenSpark works — for students and for parents."
      />

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Guide audience">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'students'}
          onClick={() => setTab('students')}
          className={`min-h-[48px] flex-1 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
            tab === 'students'
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          For Students
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'parents'}
          onClick={() => setTab('parents')}
          className={`min-h-[48px] flex-1 rounded-2xl border-2 px-4 text-sm font-extrabold transition ${
            tab === 'parents'
              ? 'border-indigo-600 bg-indigo-600 text-white'
              : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          For Parents
        </button>
      </div>

      {tab === 'students' ? (
        <div className="space-y-4">
          <SectionCard
            icon={Rocket}
            title="Quick Practice"
            accentClass="bg-indigo-100 text-indigo-700"
          >
            <p>
              Pick a subject (English, Verbal Reasoning, Maths or Non-Verbal Reasoning), choose how many
              questions you want, and answer at your own pace. You get friendly feedback after every
              question, with the explanation written out for you.
            </p>
            <p>
              Every question has five options: A, B, C, D and E. Always pick the one you think is best —
              there is no penalty for a wrong guess, so never leave a question blank.
            </p>
          </SectionCard>

          <SectionCard
            icon={Heart}
            title="Mistake Clinic"
            accentClass="bg-rose-100 text-rose-700"
          >
            <p>
              After a few sessions, open <strong>Mistake Clinic</strong> on the Progress screen. It
              collects questions you answered wrongly, or answered slower than the target time, and gives
              them to you again in a short run. Fixing your mistakes is the fastest way to climb your
              score.
            </p>
          </SectionCard>

          <SectionCard
            icon={ClipboardList}
            title="Mock Exams"
            accentClass="bg-amber-100 text-amber-800"
          >
            <p>
              The Mock screen is your real exam practice. Paper 1 is English first, then Verbal
              Reasoning. Paper 2 is Non-Verbal &amp; Spatial Reasoning first, then Maths. Each half has
              its own timer.
            </p>
            <p>
              <strong>Section lock:</strong> once you finish Section A (or the timer runs out) you move
              to Section B and you cannot go back — exactly like the real Gloucestershire test.
            </p>
            <p>
              The clock shows how long is left, with gentle reminders at 5 minutes and 1 minute. You can
              print an OMR answer sheet with the printer button if you want to practise filling bubbles
              with a pencil.
            </p>
          </SectionCard>

          <SectionCard
            icon={GraduationCap}
            title="Exam day tips"
            accentClass="bg-emerald-100 text-emerald-700"
          >
            <p>• Read the whole question twice before looking at the options.</p>
            <p>• In maths, check the sign and the units — that is where easy marks are lost.</p>
            <p>• In NVR, find what changes first (shape, rotation, colour), then check the pattern.</p>
            <p>• Never leave a question empty: there is no negative marking.</p>
            <p>• If you are stuck, flag it, pick your best guess, and come back if there is time.</p>
          </SectionCard>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onNavigate('practice')} className={btnPrimaryClass}>
              Start a Quick Practice
            </button>
            <button type="button" onClick={() => onNavigate('mock')} className={btnSecondaryClass}>
              Open Mock Exams
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <SectionCard
            icon={GraduationCap}
            title="The Gloucestershire test"
            accentClass="bg-indigo-100 text-indigo-700"
          >
            <p>
              The entrance test for Gloucestershire grammar schools (Pate's, Stroud High, Ribston Hall,
              Denmark Road and The Crypt) is a two-paper GL Assessment test of about 50 minutes per
              paper.
            </p>
            <p>
              <strong>Paper 1:</strong> Section A — English comprehension, spelling, punctuation and
              best word; Section B — Verbal Reasoning.
            </p>
            <p>
              <strong>Paper 2:</strong> Section A — Non-Verbal &amp; Spatial Reasoning; Section B —
              KS2 Year 6 Maths.
            </p>
            <p>
              Sections are strictly timed and locked: finishing Section A (or running out of time) moves
              the student to Section B with no way back. ElevenSpark reproduces this rule so the format
              feels familiar on the day.
            </p>
          </SectionCard>

          <SectionCard
            icon={BarChart3}
            title="Following progress"
            accentClass="bg-emerald-100 text-emerald-700"
          >
            <p>
              The <strong>Dashboard</strong> shows streaks, today's activity and a subject snapshot. The{' '}
              <strong>Progress</strong> screen lists recent sessions, per-topic accuracy and open
              mistakes, with the Mistake Clinic for re-doing weak questions.
            </p>
            <p>
              The <strong>Analytics</strong> screen plots every completed mock against the two usual
              thresholds — <strong>75%</strong> for the qualifying score and <strong>85%</strong> for
              the top-school target — and groups every topic into Mastered, Needs Speed, Developing,
              Rushing-Guessing or Needs Study, with a direct "Practise Topic" shortcut.
            </p>
          </SectionCard>

          <SectionCard
            icon={Users}
            title="Profiles and backup"
            accentClass="bg-amber-100 text-amber-800"
          >
            <p>
              Use the avatar menu (top right) to switch profiles, edit a name/avatar/target school, or
              create a separate profile for a sibling — each profile keeps its own sessions, mistakes
              and analytics.
            </p>
            <p>
              The cloud badge next to the avatar syncs progress automatically to a private GitHub Gist
              (settings inside the badge). You can also download or upload a JSON backup file from the
              same menu for offline copies.
            </p>
          </SectionCard>

          <SectionCard
            icon={Heart}
            title="Keeping it calm"
            accentClass="bg-rose-100 text-rose-700"
          >
            <p>
              Short, regular sessions beat long cramming: 15–20 minutes of Quick Practice most days,
              plus one mini-mock at the weekend. Praise effort rather than scores, and keep mock exams
              for when the child is rested.
            </p>
          </SectionCard>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button type="button" onClick={() => onNavigate('analytics')} className={btnPrimaryClass}>
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              Open Analytics
            </button>
            <button type="button" onClick={() => onNavigate('progress')} className={btnSecondaryClass}>
              See Progress
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
