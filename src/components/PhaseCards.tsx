import type { RoadmapSnapshot } from '../utils/roadmapCalculator'
import { cardClass } from './ui'

export function PhaseCards({ roadmap }: { roadmap: RoadmapSnapshot }) {
  return (
    <section aria-labelledby="phases-heading">
      <h2 id="phases-heading" className="mb-3 text-lg font-black text-slate-900">
        Your 3-phase roadmap
      </h2>
      <div className="grid gap-3 lg:grid-cols-3">
        {roadmap.phases.map((phase) => {
          const current = phase.id === roadmap.currentPhaseId
          return (
            <div
              key={phase.id}
              className={`${cardClass} flex flex-col gap-3 ${current ? 'border-2 border-indigo-400 bg-indigo-50' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-base font-black text-slate-900">{phase.title}</p>
                  <p className="text-xs font-bold text-slate-500">{phase.window}</p>
                </div>
                {current ? (
                  <span className="rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                    Now
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-semibold text-slate-600">{phase.headline}</p>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${phase.percent}%` }} />
              </div>
              <p className="text-sm font-black text-indigo-700">{phase.percent}% complete</p>
              <ul className="flex flex-col gap-1.5">
                {phase.goals.map((goal) => (
                  <li key={goal.label} className="flex items-center justify-between gap-2 text-xs font-bold">
                    <span className={goal.met ? 'text-emerald-700' : 'text-slate-600'}>
                      {goal.met ? '✓' : '○'} {goal.label}
                    </span>
                    <span className="tabular-nums text-slate-500">
                      {goal.unit === 'percent'
                        ? `${goal.achieved}% / ${goal.value}%`
                        : `${goal.achieved} / ${goal.value}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
