import { ChevronRight, HelpCircle } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import type { NvrFigure, NvrLayout, NvrMark, SvgConfig } from '../../db/schemas'
import { MARK_OFFSETS, describeFigure } from '../../utils/nvrFigures'

const SIZE_UNITS = { small: 34, medium: 50, large: 66 } as const

const LAYOUT_CAPACITY: Record<NvrLayout, number> = {
  single: 1,
  sequence: 5,
  matrix2: 4,
  matrix3: 9,
}

const STROKE = 'var(--nvr-stroke)'

type Point = [number, number]

function regularPolygonPoints(cx: number, cy: number, radius: number, sides: number): string {
  const points: Point[] = []
  for (let i = 0; i < sides; i += 1) {
    const angle = ((-90 + (360 / sides) * i) * Math.PI) / 180
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}

function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const points: Point[] = []
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = ((-90 + 36 * i) * Math.PI) / 180
    points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)])
  }
  return points.map(([x, y]) => `${round(x)},${round(y)}`).join(' ')
}

function scaleAboutCentre(points: Point[], scale: number): string {
  return points
    .map(([x, y]) => {
      const nx = 50 + (x - 50) * scale
      const ny = 50 + (y - 50) * scale
      return `${round(nx)},${round(ny)}`
    })
    .join(' ')
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

const ARROW_UNIT: Point[] = [
  [50, 8],
  [72, 40],
  [59, 40],
  [59, 92],
  [41, 92],
  [41, 40],
  [28, 40],
]

const CROSS_UNIT: Point[] = [
  [38, 10],
  [62, 10],
  [62, 38],
  [90, 38],
  [90, 62],
  [62, 62],
  [62, 90],
  [38, 90],
  [38, 62],
  [10, 62],
  [10, 38],
  [38, 38],
]

function MarkLayer({ marks, units }: { marks: NvrMark[]; units: number }) {
  return (
    <>
      {marks.map((mark, index) => {
        const [dx, dy] = MARK_OFFSETS[mark.position]
        const cx = 50 + dx * units
        const cy = 50 + dy * units
        if (mark.kind === 'dot') {
          return <circle key={index} cx={round(cx)} cy={round(cy)} r={Math.max(2.6, units * 0.08)} fill={STROKE} />
        }
        return (
          <text
            key={index}
            x={round(cx)}
            y={round(cy)}
            fontSize={round(units * 0.34)}
            fontWeight={800}
            textAnchor="middle"
            dominantBaseline="central"
            fill={STROKE}
          >
            {mark.symbol ?? '+'}
          </text>
        )
      })}
    </>
  )
}

function FigureArtwork({ figure }: { figure: NvrFigure }) {
  const rawId = useId()
  const patternId = `stripe-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`
  const units = SIZE_UNITS[figure.size ?? 'medium']
  const rotation = figure.rotation ?? 0
  const fillKind = figure.fill ?? 'empty'

  let fill = 'var(--nvr-fill)'
  let defs: ReactNode = null
  if (fillKind === 'solid') {
    fill = STROKE
  } else if (fillKind === 'shaded') {
    fill = 'var(--nvr-muted)'
  } else if (fillKind === 'striped') {
    fill = `url(#${patternId})`
    defs = (
      <defs>
        <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="var(--nvr-fill)" />
          <line x1="0" y1="0" x2="0" y2="8" stroke={STROKE} strokeWidth="3" />
        </pattern>
      </defs>
    )
  }

  const shapeProps = {
    fill,
    stroke: STROKE,
    strokeWidth: 2.5,
    strokeLinejoin: 'round' as const,
  }

  let body: ReactNode
  switch (figure.shape) {
    case 'circle':
      body = <circle cx={50} cy={50} r={units / 2} {...shapeProps} />
      break
    case 'square':
      body = <rect x={round(50 - units / 2)} y={round(50 - units / 2)} width={units} height={units} {...shapeProps} />
      break
    case 'triangle':
      body = <polygon points={regularPolygonPoints(50, 50, units / 2, 3)} {...shapeProps} />
      break
    case 'pentagon':
      body = <polygon points={regularPolygonPoints(50, 50, units / 2, 5)} {...shapeProps} />
      break
    case 'hexagon':
      body = <polygon points={regularPolygonPoints(50, 50, units / 2, 6)} {...shapeProps} />
      break
    case 'star':
      body = <polygon points={starPoints(50, 50, units / 2, units / 4.2)} {...shapeProps} />
      break
    case 'arrow':
      body = <polygon points={scaleAboutCentre(ARROW_UNIT, units / 50)} {...shapeProps} />
      break
    case 'cross':
      body = <polygon points={scaleAboutCentre(CROSS_UNIT, units / 50)} {...shapeProps} />
      break
  }

  return (
    <g>
      {defs}
      <g transform={`rotate(${rotation} 50 50)`}>
        {body}
        <MarkLayer marks={figure.marks ?? []} units={units} />
      </g>
    </g>
  )
}

export function NvrFigureSvg({
  figure,
  className,
  title,
}: {
  figure: NvrFigure
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label={title ?? describeFigure(figure)}
    >
      <FigureArtwork figure={figure} />
    </svg>
  )
}

function CellBox({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid aspect-square place-items-center rounded-xl border-2 border-slate-800 bg-white ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

function SequenceRow({ cells }: { cells: (NvrFigure | '?' | null)[] }) {
  const showArrows = cells[cells.length - 1] === '?'
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {cells.map((cell, index) => (
        <div key={index} className="flex items-center gap-2">
          <CellBox className="h-20 w-20 md:h-24 md:w-24">
            {cell === '?' ? (
              <HelpCircle className="h-10 w-10 text-slate-400" strokeWidth={2.5} aria-hidden="true" />
            ) : cell === null ? (
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
            ) : (
              <NvrFigureSvg figure={cell} className="h-14 w-14 md:h-16 md:w-16" />
            )}
          </CellBox>
          {showArrows && index < cells.length - 1 ? (
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  )
}

function MatrixGrid({ cells, cols, rows }: { cells: (NvrFigure | '?' | null)[]; cols: number; rows: number }) {
  const width = cols * 100
  const height = rows * 100
  const lines: ReactNode[] = []
  for (let col = 1; col < cols; col += 1) {
    lines.push(
      <line key={`v${col}`} x1={col * 100} y1={0} x2={col * 100} y2={height} stroke={STROKE} strokeWidth={3} />,
    )
  }
  for (let row = 1; row < rows; row += 1) {
    lines.push(
      <line key={`h${row}`} x1={0} y1={row * 100} x2={width} y2={row * 100} stroke={STROKE} strokeWidth={3} />,
    )
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full max-w-md"
      role="img"
      aria-label="Non-verbal matrix"
    >
      <rect x={1.5} y={1.5} width={width - 3} height={height - 3} fill="none" stroke={STROKE} strokeWidth={3} />
      {lines}
      {cells.map((cell, index) => {
        const col = index % cols
        const row = Math.floor(index / cols)
        const cx = col * 100 + 50
        const cy = row * 100 + 50
        return (
          <g key={index} transform={`translate(${col * 100} ${row * 100})`}>
            {cell === '?' ? (
              <text
                x={50}
                y={54}
                fontSize={48}
                fontWeight={800}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--nvr-muted)"
              >
                ?
              </text>
            ) : cell === null ? null : (
              <FigureArtwork figure={cell} />
            )}
            {cell === null ? (
              <text
                x={cx - col * 100}
                y={cy - row * 100 + 4}
                fontSize={28}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--nvr-muted)"
              >
                ·
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function NvrSvgRenderer({ config, className }: { config: SvgConfig; className?: string }) {
  const capacity = LAYOUT_CAPACITY[config.layout]
  const cells: (NvrFigure | '?' | null)[] = []
  for (let i = 0; i < capacity; i += 1) {
    const figure = config.cells[i]
    if (figure) {
      cells.push(figure)
    } else if (i === capacity - 1) {
      cells.push('?')
    } else {
      cells.push(null)
    }
  }

  return (
    <div className={`flex justify-center ${className ?? ''}`}>
      {config.layout === 'single' ? (
        <div className="w-full max-w-[160px]">
          <CellBox className="h-36 w-36 md:h-44 md:w-44">
            {cells[0] && cells[0] !== '?' ? <NvrFigureSvg figure={cells[0]} className="h-24 w-24 md:h-32 md:w-32" /> : null}
          </CellBox>
        </div>
      ) : config.layout === 'sequence' ? (
        <SequenceRow cells={cells} />
      ) : (
        <MatrixGrid cells={cells} cols={config.layout === 'matrix2' ? 2 : 3} rows={config.layout === 'matrix2' ? 2 : 3} />
      )}
    </div>
  )
}
