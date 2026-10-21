import { BarChart3, BookOpen, ClipboardList, GraduationCap, Heart, Rocket, ShieldCheck, Users } from 'lucide-react'
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
              Pick a subject (English, Maths or Compass), choose how many questions you want, and answer
              at your own pace. You get friendly feedback after every question, with the explanation
              written out for you.
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
              The Mock screen is your real exam practice. The <strong>Adventure Paper</strong> is English
              first, then Maths. The <strong>Beacon Paper</strong> asks for written answers typed into
              the boxes. The <strong>Compass Paper</strong> works right across the curriculum. Each half
              has its own timer.
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
            <p>• On the Compass Paper, read every table, chart and diagram before you answer — it's about interpretation.</p>
            <p>• On Beacon Paper, show your reasoning clearly and craft your Creative Writing with paragraphs and ambitious vocabulary.</p>
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
              Denmark Road and The Crypt) is the <strong>G7 FSCE (Future Stories Community Enterprise)</strong> — three papers.
            </p>
            <p>
              <strong>Paper 1: Adventure Paper (~45 min):</strong> Multiple choice focused on quick fluency.
              Section A — English Comprehension &amp; Vocabulary (22 min), then a strict section lock.
              Section B — KS2 Maths Fluency (23 min).
            </p>
            <p>
              <strong>Paper 2: Beacon Paper (~45 min - Written &amp; Creative):</strong> Section A (25 min)
              has written answers — type the exact value for maths or complete the word for English in the boxes
              (no guessing options). Then Section B (20 min) is the <strong>Creative Writing Task</strong> —
              continue a story, describe a discovery, or write a persuasive/argumentative piece. Print the
              FSCE lined writing sheet to write by hand or type on screen. After finishing, use the{' '}
              <strong>interactive rubric</strong> (Ideas/Creativity, Paragraphs/Structure, Ambitious Vocabulary,
              Grammar/Sentences, Punctuation/Spelling) scored 1-4 to self-assess.
            </p>
            <p>
              <strong>Paper 3: Compass Paper (~40 min):</strong> Multiple choice Across the Curriculum —
              logical interpretation across Science &amp; Experiments, History &amp; Geography, Computing &amp; Logic,
              Arts, Design, Music &amp; Languages. Read graphs, tables and texts calmly; no need to memorise everything.
            </p>
            <p>
              <strong>Important dates:</strong> Registrations between <strong>February and March of Year 5</strong>,
              and the test in <strong>early July of Year 5</strong>. Sections are strictly timed and locked.
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
              The cloud badge next to the avatar shows the sync status. Everything else — the GitHub
              Gist settings, JSON backup files, automatic snapshots, the parent PIN and the data resets —
              lives in <strong>Settings</strong>, which is protected by a PIN.
            </p>
          </SectionCard>

          <SectionCard
            icon={ShieldCheck}
            title="Safety and snapshots"
            accentClass="bg-emerald-100 text-emerald-700"
          >
            <p>
              Every question and passage is screened by the <strong>Child Safety Seal</strong> before it
              can reach the practice screens, so nothing adult, violent or harmful is ever shown. The
              seal lives in Settings, where a parent can re-run the check on the device at any time.
            </p>
            <p>
              ElevenSpark also takes an <strong>automatic snapshot</strong> of the progress once a day
              and keeps the last 20 days. Today&apos;s snapshot is overwritten automatically, and any
              earlier day can be restored from Settings if something is deleted by accident.
            </p>
            <p>
              Settings locks itself after 5 minutes of inactivity, so the PIN is only needed while a
              parent is actually using the app.
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
