import type { NvrFill, NvrFigure, NvrMarkPosition, NvrShape } from '../db/schemas'

/**
 * Rotational symmetry of each outline, in degrees.
 * `0` means the shape looks exactly the same at any angle (a circle).
 * `360` means the shape has no rotational symmetry at all (an arrow).
 */
export const ROTATIONAL_SYMMETRY: Record<NvrShape, number> = {
  triangle: 120,
  square: 90,
  pentagon: 72,
  hexagon: 60,
  circle: 0,
  star: 72,
  arrow: 360,
  cross: 90,
}

export const MARK_OFFSETS: Record<NvrMarkPosition, [number, number]> = {
  center: [0, 0],
  top: [0, -0.26],
  bottom: [0, 0.26],
  left: [-0.26, 0],
  right: [0.26, 0],
  'top-left': [-0.2, -0.2],
  'top-right': [0.2, -0.2],
  'bottom-left': [-0.2, 0.2],
  'bottom-right': [0.2, 0.2],
}

const MARK_LABELS: Record<NvrMarkPosition, string> = {
  center: 'in the middle',
  top: 'at the top',
  bottom: 'at the bottom',
  left: 'on the left',
  right: 'on the right',
  'top-left': 'at the top left',
  'top-right': 'at the top right',
  'bottom-left': 'at the bottom left',
  'bottom-right': 'at the bottom right',
}

const FILL_LABELS: Record<NvrFill, string> = {
  solid: 'solid',
  empty: 'unshaded',
  striped: 'striped',
  shaded: 'shaded',
}

const SHAPE_LABELS: Record<NvrShape, string> = {
  triangle: 'triangle',
  square: 'square',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  circle: 'circle',
  star: 'star',
  arrow: 'arrow',
  cross: 'cross',
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return Math.abs(a * b) / gcd(a, b)
}

/**
 * The smallest turn (in degrees) that leaves the figure looking exactly the
 * same. Striped figures turn their stripes as well, so only a half turn
 * keeps the stripe direction.
 */
export function visualRotationStep(shape: NvrShape, fill: NvrFill | undefined): number {
  const outline = ROTATIONAL_SYMMETRY[shape]
  if (fill === 'striped') {
    if (outline === 0) return 180
    return lcm(outline, 180)
  }
  return outline
}

/**
 * Where a mark ends up after the figure is turned, so two figures that show
 * the mark in the same place are recognised as the same picture.
 */
export function rotateMarkPosition(position: NvrMarkPosition, degrees: number): NvrMarkPosition {
  if (position === 'center' || degrees % 360 === 0) return position
  const [dx, dy] = MARK_OFFSETS[position]
  const radians = (degrees * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const rx = dx * cos - dy * sin
  const ry = dx * sin + dy * cos
  if (Math.abs(rx) < 1e-9 && Math.abs(ry) < 1e-9) return 'center'
  const angle = ((Math.atan2(ry, rx) * 180) / Math.PI + 360) % 360
  const snapped = Math.round(angle / 45) * 45 % 360
  switch (snapped) {
    case 0:
      return 'right'
    case 45:
      return 'bottom-right'
    case 90:
      return 'bottom'
    case 135:
      return 'bottom-left'
    case 180:
      return 'left'
    case 225:
      return 'top-left'
    case 270:
      return 'top'
    default:
      return 'top-right'
  }
}

export function visualRotation(shape: NvrShape, fill: NvrFill | undefined, rotation: number): number {
  const step = visualRotationStep(shape, fill)
  if (step === 0) return 0
  return ((Math.round(rotation) % step) + step) % step
}

/**
 * A stable identity for "what the child sees". Two figures with the same key
 * are impossible to tell apart, so they must never both appear as options.
 */
export function visualFigureKey(figure: NvrFigure): string {
  const fill = figure.fill ?? 'empty'
  const rotation = visualRotation(figure.shape, fill, figure.rotation ?? 0)
  const marks = (figure.marks ?? [])
    .map((mark) => {
      const position = rotateMarkPosition(mark.position, figure.rotation ?? 0)
      return `${mark.kind}:${position}:${mark.symbol ?? ''}`
    })
    .sort()
    .join(',')
  return `${figure.shape}|${fill}|${rotation}|${figure.size ?? 'medium'}|${marks}`
}

/**
 * A spoken description of the figure, used for screen readers and for the
 * practice feedback.
 */
export function describeFigure(figure: NvrFigure): string {
  const fill = figure.fill ?? 'empty'
  const parts: string[] = [`${FILL_LABELS[fill]} ${SHAPE_LABELS[figure.shape]}`]
  if (figure.size === 'small') parts.push('small')
  if (figure.size === 'large') parts.push('large')
  const step = visualRotationStep(figure.shape, fill)
  if (step !== 0) {
    const rotation = visualRotation(figure.shape, fill, figure.rotation ?? 0)
    if (rotation !== 0) parts.push(`turned ${rotation} degrees`)
  }
  for (const mark of figure.marks ?? []) {
    const position = rotateMarkPosition(mark.position, figure.rotation ?? 0)
    parts.push(mark.kind === 'dot' ? `a dot ${MARK_LABELS[position]}` : `the sign ${mark.symbol ?? '+'} ${MARK_LABELS[position]}`)
  }
  return parts.join(' ')
}
