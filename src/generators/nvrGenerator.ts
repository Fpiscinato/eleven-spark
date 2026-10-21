import type { NvrFigure, NvrFill, NvrShape, Question, SvgConfig } from '../db/schemas'
import { visualFigureKey } from '../utils/nvrFigures'
import { buildQuestion, difficultyAt, makeQuestionId, type QuestionDraft } from './common'
import { createRng, hashSeed, type Rng } from './rng'

const BASE_SEED = 20261020

const FILLS: readonly NvrFill[] = ['empty', 'striped', 'solid', 'shaded']
const POLYGON_SHAPES: readonly NvrShape[] = ['triangle', 'square', 'pentagon', 'hexagon']
const ALL_SHAPES: readonly NvrShape[] = ['triangle', 'square', 'pentagon', 'hexagon', 'circle', 'star', 'arrow', 'cross']

function figure(shape: NvrShape, fill: NvrFill = 'empty', extra: Partial<NvrFigure> = {}): NvrFigure {
  return { shape, fill, ...extra }
}

function nextIn<T>(list: readonly T[], value: T, steps = 1): T {
  const index = list.indexOf(value)
  return list[(index + steps + list.length * 4) % list.length] ?? list[0] ?? value
}

function figureKey(fig: NvrFigure): string {
  return visualFigureKey(fig)
}

function differsOnlyBySize(correct: NvrFigure, candidate: NvrFigure): boolean {
  return (
    candidate.shape === correct.shape &&
    (candidate.fill ?? 'empty') === (correct.fill ?? 'empty') &&
    (candidate.rotation ?? 0) === (correct.rotation ?? 0) &&
    (candidate.marks ?? []).length === (correct.marks ?? []).length
  )
}

/**
 * Every option must look different on the page. A square turned by 90 degrees
 * still looks like the same square, so the distractors are compared by what
 * the child actually sees, not by the raw numbers.
 */
function fallbackFigures(correct: NvrFigure): NvrFigure[] {
  const out: NvrFigure[] = []
  const baseFill = correct.fill ?? 'empty'
  for (const shape of ALL_SHAPES) {
    if (shape === correct.shape) continue
    for (const fill of FILLS) {
      if (fill === baseFill) continue
      out.push({ ...correct, shape, fill })
    }
    out.push({ ...correct, shape })
  }
  for (const fill of FILLS) {
    if (fill === baseFill) continue
    out.push({ ...correct, fill })
  }
  for (const rotation of [45, 90, 135, 180, 225, 270, 315]) {
    out.push({ ...correct, rotation })
  }
  return out
}

function distinctDistractors(correct: NvrFigure, pool: NvrFigure[]): NvrFigure[] {
  const seen = new Set([figureKey(correct)])
  const picked: NvrFigure[] = []
  for (const candidate of pool) {
    const key = figureKey(candidate)
    if (seen.has(key)) continue
    if (differsOnlyBySize(correct, candidate)) continue
    seen.add(key)
    picked.push(candidate)
    if (picked.length === 4) break
  }
  if (picked.length < 4) {
    for (const candidate of fallbackFigures(correct)) {
      if (picked.length >= 4) break
      const key = figureKey(candidate)
      if (seen.has(key)) continue
      if (differsOnlyBySize(correct, candidate)) continue
      seen.add(key)
      picked.push(candidate)
    }
  }
  return picked
}

function optionFiguresFor(correct: NvrFigure, distractors: NvrFigure[]): {
  draftOptions: string[]
  correctIndex: number
  optionFigures: NvrFigure[]
} {
  return {
    draftOptions: [' ', ' ', ' ', ' ', ' '],
    correctIndex: 0,
    optionFigures: [correct, ...distractors],
  }
}

function numericOptions(answer: number): string[] {
  const distractors: number[] = []
  for (const delta of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
    const candidate = answer + delta
    if (candidate > 0 && candidate !== answer && !distractors.includes(candidate)) {
      distractors.push(candidate)
    }
    if (distractors.length === 4) break
  }
  return [answer, ...distractors].map(String)
}

function matrixQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 7
  let cells: NvrFigure[]
  let answer: NvrFigure
  let explanation: string
  let layout: SvgConfig['layout'] = 'matrix2'

  if (kind === 0) {
    const fills = rng.shuffle([...FILLS])
    const start = rng.int(0, 3)
    const shapes = [0, 1, 2].map((step) => POLYGON_SHAPES[(start + step) % 4] ?? 'square')
    cells = shapes.map((shape) => figure(shape, fills[0]))
    answer = figure(POLYGON_SHAPES[(start + 3) % 4] ?? 'triangle', fills[0])
    explanation = 'Each step along the row adds one more side to the shape: triangle (3 sides), square (4), pentagon (5), hexagon (6). The missing figure has one more side than the one before it.'
  } else if (kind === 1) {
    const shape = rng.pick(POLYGON_SHAPES)
    const start = rng.int(0, 3)
    cells = [0, 1, 2].map((step) => figure(shape, FILLS[(start + step) % 4]))
    answer = figure(shape, FILLS[(start + 3) % 4])
    explanation = 'The shape stays the same and the shading moves along the cycle: empty, striped, solid, shaded. The next figure continues that shading cycle.'
  } else if (kind === 2) {
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    const sizes = ['small', 'medium', 'large'] as const
    const start = rng.int(0, 2)
    cells = [0, 1, 2].map((step) => figure(shape, fill, { size: sizes[(start + step) % 3] }))
    answer = figure(shape, fill, { size: sizes[(start + 3) % 3] })
    explanation = 'The shape and shading stay the same while the size grows one step at a time: small, medium, large, then the cycle restarts.'
  } else if (kind === 3) {
    layout = 'matrix3'
    const rows: number[][] = []
    const start = rng.int(0, 3) * 90
    for (let row = 0; row < 3; row += 1) {
      rows.push([0, 1, 2].map((step) => (start + row * 90 + step * 90) % 360))
    }
    cells = rows.slice(0, 2).flat().map((rotation) => figure('arrow', 'solid', { rotation }))
    cells.push(figure('arrow', 'solid', { rotation: rows[2]?.[0] ?? 0 }))
    cells.push(figure('arrow', 'solid', { rotation: rows[2]?.[1] ?? 0 }))
    answer = figure('arrow', 'solid', { rotation: rows[2]?.[2] ?? 0 })
    explanation = 'Across each row the arrow turns 90 degrees clockwise. The third row starts where the pattern continues, so the missing arrow is rotated one more quarter-turn.'
    const pool: NvrFigure[] = [
      { ...answer, rotation: ((answer.rotation ?? 0) + 180) % 360 },
      { ...answer, rotation: ((answer.rotation ?? 0) + 270) % 360 },
      { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty') },
      { ...answer, shape: nextIn(ALL_SHAPES, answer.shape) },
      figure('cross', 'solid', { rotation: answer.rotation }),
    ]
    const distractors = distinctDistractors(answer, rng.shuffle(pool))
    const optionFigures = [answer, ...distractors]
    return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'matrices', index), {
      topic: 'matrices',
      difficulty: difficultyAt(index),
      stem: 'Which figure completes the matrix?\n\nLook at how the arrow turns in each row.',
      options: [' ', ' ', ' ', ' ', ' '],
      correctIndex: 0,
      explanation,
      timeTargetSeconds: 40,
      svgConfig: { layout: 'matrix3', cells, optionFigures },
    })
  } else if (kind === 4) {
    layout = 'matrix3'
    const shapeRowStart = rng.int(0, 3)
    const fillsByRow = [rng.pick(FILLS), rng.pick(FILLS), rng.pick(FILLS)]
    cells = []
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        cells.push(figure(POLYGON_SHAPES[(shapeRowStart + col) % 4] ?? 'square', fillsByRow[row] ?? 'empty'))
      }
    }
    cells.push(figure(POLYGON_SHAPES[shapeRowStart] ?? 'triangle', fillsByRow[2] ?? 'empty'))
    cells.push(figure(POLYGON_SHAPES[(shapeRowStart + 1) % 4] ?? 'square', fillsByRow[2] ?? 'empty'))
    answer = figure(POLYGON_SHAPES[(shapeRowStart + 2) % 4] ?? 'pentagon', fillsByRow[2] ?? 'empty')
    explanation = 'Each column always shows the same shape, and each row always shows the same shading. The missing corner keeps the column shape and the row shading.'
    const pool: NvrFigure[] = [
      { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty') },
      { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty', 2) },
      { ...answer, shape: nextIn(ALL_SHAPES, answer.shape) },
      { ...answer, shape: nextIn(POLYGON_SHAPES, answer.shape, 2) },
      figure(nextIn(ALL_SHAPES, answer.shape), nextIn(FILLS, answer.fill ?? 'empty')),
    ]
    const distractors = distinctDistractors(answer, rng.shuffle(pool))
    const optionFigures = [answer, ...distractors]
    return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'matrices', index), {
      topic: 'matrices',
      difficulty: difficultyAt(index),
      stem: 'Which figure completes the matrix?\n\nColumns share a shape and rows share a shading.',
      options: [' ', ' ', ' ', ' ', ' '],
      correctIndex: 0,
      explanation,
      timeTargetSeconds: 45,
      svgConfig: { layout: 'matrix3', cells, optionFigures },
    })
  } else if (kind === 5) {
    const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    cells = [0, 1, 2].map((step) => figure(shape, fill, { marks: [{ kind: 'dot', position: positions[step] }] }))
    answer = figure(shape, fill, { marks: [{ kind: 'dot', position: positions[3] }] })
    explanation = 'The dot walks one corner at a time in reading order: top-left, top-right, bottom-left, then bottom-right.'
  } else {
    const shapes = [rng.pick(ALL_SHAPES), rng.pick(ALL_SHAPES), rng.pick(ALL_SHAPES)]
    const distinctShapes = [...new Set(shapes)]
    if (distinctShapes.length < 3) {
      shapes[1] = nextIn(ALL_SHAPES, shapes[0] ?? 'square')
      shapes[2] = nextIn(ALL_SHAPES, shapes[1] ?? 'circle')
    }
    const fillCycle = rng.shuffle([...FILLS])
    cells = (shapes as NvrShape[]).map((shape, i) => figure(shape, fillCycle[i % fillCycle.length]))
    answer = figure(nextIn(ALL_SHAPES, shapes[2] ?? 'circle'), fillCycle[3 % fillCycle.length])
    explanation = 'Both the shape and the shading change at every step — the shape moves to the next family and the shading follows its own cycle.'
  }

  layout = layout ?? 'matrix2'
  const pool: NvrFigure[] = [
    { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty') },
    { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty', 2) },
    { ...answer, shape: nextIn(ALL_SHAPES, answer.shape) },
    { ...answer, shape: nextIn(POLYGON_SHAPES, answer.shape) },
    { ...answer, shape: nextIn(ALL_SHAPES, answer.shape), fill: nextIn(FILLS, answer.fill ?? 'empty') },
    { ...answer, rotation: ((answer.rotation ?? 0) + 90) % 360 },
    figure(nextIn(ALL_SHAPES, answer.shape), nextIn(FILLS, answer.fill ?? 'empty')),
  ]
  const distractors = distinctDistractors(answer, rng.shuffle(pool))
  const { draftOptions, correctIndex, optionFigures } = optionFiguresFor(answer, distractors)
  const draft: QuestionDraft = {
    topic: 'matrices',
    difficulty: difficultyAt(index),
    stem: 'Which figure completes the matrix?',
    options: draftOptions,
    correctIndex,
    explanation,
    timeTargetSeconds: 40,
    svgConfig: { layout, cells, optionFigures },
  }
  return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'matrices', index), draft)
}

function sequenceQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 5
  let cells: NvrFigure[]
  let answer: NvrFigure
  let explanation: string

  if (kind === 0) {
    const shape = rng.pick(ALL_SHAPES)
    const start = rng.int(0, 3)
    cells = [0, 1, 2, 3].map((step) => figure(shape, FILLS[(start + step) % 4]))
    answer = figure(shape, FILLS[(start + 4) % 4])
    explanation = 'The shading cycles through empty, striped, solid and shaded, then repeats. The next figure restarts the cycle.'
  } else if (kind === 1) {
    const step = rng.pick([45, 90, 135])
    const start = rng.int(0, 1) * 90
    cells = [0, 1, 2, 3].map((stepIndex) => figure('arrow', 'solid', { rotation: (start + stepIndex * step) % 360 }))
    answer = figure('arrow', 'solid', { rotation: (start + 4 * step) % 360 })
    explanation = `The arrow turns ${step} degrees clockwise at every step, so the next arrow turns one more ${step} degrees.`
  } else if (kind === 2) {
    const shape = rng.pick(POLYGON_SHAPES)
    const fill = rng.pick(FILLS)
    const sizes = ['small', 'medium', 'large'] as const
    const start = rng.int(0, 2)
    cells = [0, 1, 2, 3].map((step) => figure(shape, fill, { size: sizes[(start + step) % 3] }))
    answer = figure(shape, fill, { size: sizes[(start + 4) % 3] })
    explanation = 'The size grows one step each time: small, medium, large, then the pattern restarts.'
  } else if (kind === 3) {
    const positions = ['left', 'right'] as const
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    cells = [0, 1, 2, 3].map((step) =>
      figure(shape, fill, { marks: [{ kind: 'dot', position: positions[step % 2] ?? 'left' }] }),
    )
    answer = figure(shape, fill, { marks: [{ kind: 'dot', position: positions[4 % 2] ?? 'left' }] })
    explanation = 'The dot mirrors left to right at every step, like a reflection in a mirror. The next figure mirrors back again.'
  } else {
    const shapeStart = rng.int(0, 3)
    cells = [0, 1, 2, 3].map((step) => figure(POLYGON_SHAPES[(shapeStart + step) % 4] ?? 'square', 'empty'))
    answer = figure(POLYGON_SHAPES[(shapeStart + 4) % 4] ?? 'triangle', 'empty')
    explanation = 'The shape gains one side at every step: triangle, square, pentagon, hexagon, then the cycle starts again with a triangle.'
  }

  const pool: NvrFigure[] = [
    { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty') },
    { ...answer, rotation: ((answer.rotation ?? 0) + 90) % 360 },
    { ...answer, shape: nextIn(ALL_SHAPES, answer.shape) },
    { ...answer, shape: nextIn(POLYGON_SHAPES, answer.shape) },
    figure(nextIn(ALL_SHAPES, answer.shape), nextIn(FILLS, answer.fill ?? 'empty')),
  ]
  const distractors = distinctDistractors(answer, rng.shuffle(pool))
  const { draftOptions, correctIndex, optionFigures } = optionFiguresFor(answer, distractors)
  return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'sequences', index), {
    topic: 'sequences',
    difficulty: difficultyAt(index),
    stem: 'Which figure comes next in the sequence?',
    options: draftOptions,
    correctIndex,
    explanation,
    timeTargetSeconds: 35,
    svgConfig: { layout: 'sequence', cells, optionFigures },
  })
}

function oddOneOutQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 5
  const figures: NvrFigure[] = []
  let oddIndex: number
  let explanation: string

  if (kind === 0) {
    const shape = rng.pick(ALL_SHAPES)
    const commonFill = rng.pick(FILLS)
    const oddFill = nextIn(FILLS, commonFill, rng.int(1, 3))
    for (let i = 0; i < 5; i += 1) figures.push(figure(shape, i === 4 ? oddFill : commonFill))
    oddIndex = 4
    explanation = 'Four figures share the same shading, so the odd one out is the figure shaded differently.'
  } else if (kind === 1) {
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    const commonSize = rng.pick(['small', 'medium', 'large'] as const)
    const oddSize = commonSize === 'large' ? 'small' : 'large'
    oddIndex = rng.int(0, 4)
    for (let i = 0; i < 5; i += 1) figures.push(figure(shape, fill, { size: i === oddIndex ? oddSize : commonSize }))
    explanation = 'Four figures are exactly the same size. The odd one out is the figure that is a different size from the rest.'
  } else if (kind === 2) {
    const common = rng.pick(POLYGON_SHAPES)
    let oddShape = nextIn(POLYGON_SHAPES, common, rng.int(1, 3))
    if (oddShape === common) oddShape = nextIn(ALL_SHAPES, common)
    const fill = rng.pick(FILLS)
    for (let i = 0; i < 5; i += 1) figures.push(figure(i === 2 ? oddShape : common, fill))
    oddIndex = 2
    explanation = `Four figures are ${common}s. The odd one out is the ${oddShape}, which does not belong with the others.`
  } else if (kind === 3) {
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    for (let i = 0; i < 5; i += 1) {
      figures.push(figure(shape, fill, { marks: [{ kind: i === 3 ? 'symbol' : 'dot', position: 'center', symbol: i === 3 ? '+' : undefined }] }))
    }
    oddIndex = 3
    explanation = 'Four figures carry the same dot in the middle. The odd one out carries a different mark, so it cannot belong.'
  } else {
    const fill = rng.pick(FILLS)
    const start = rng.int(0, 3) * 90
    const patternRotations = [0, 90, 180, 270]
    oddIndex = rng.int(0, 4)
    let patternStep = 0
    for (let i = 0; i < 5; i += 1) {
      if (i === oddIndex) {
        figures.push(figure('arrow', fill, { rotation: (start + 45) % 360 }))
      } else {
        figures.push(figure('arrow', fill, { rotation: (start + (patternRotations[patternStep] ?? 0)) % 360 }))
        patternStep += 1
      }
    }
    explanation = 'Four arrows turn in a regular quarter-turn pattern. The odd one out breaks that turning pattern by half a turn.'
  }

  oddIndex = Math.min(Math.max(oddIndex, 0), 4)
  const figuresInOrder = figures
  return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'odd_one_out', index), {
    topic: 'odd_one_out',
    difficulty: difficultyAt(index),
    stem: 'Which figure is the odd one out?\n\nFour of the figures share something in common. One does not.',
    options: [' ', ' ', ' ', ' ', ' '],
    correctIndex: oddIndex,
    explanation,
    timeTargetSeconds: 30,
    svgConfig: { layout: 'sequence', cells: [], optionFigures: figuresInOrder },
  })
}

function reflectionRotationQuestion(rng: Rng, index: number, nonce: string): Question {
  const kind = index % 4
  let cells: NvrFigure[]
  let answer: NvrFigure
  let explanation: string

  if (kind === 0) {
    const start = rng.int(0, 3) * 90
    cells = [0, 1, 2, 3].map((step) => figure('arrow', 'solid', { rotation: (start + step * 90) % 360 }))
    answer = figure('arrow', 'solid', { rotation: start })
    explanation = 'The arrow rotates a quarter-turn (90 degrees) clockwise each step. After four quarter-turns it points the same way as the first arrow.'
  } else if (kind === 1) {
    const start = rng.int(0, 3) * 90
    cells = [0, 1, 2, 3].map((step) => figure('arrow', 'shaded', { rotation: (start + step * 135) % 360 }))
    answer = figure('arrow', 'shaded', { rotation: (start + 4 * 135) % 360 })
    explanation = 'Each arrow turns 135 degrees further round. The next arrow turns one more 135 degrees from the last one.'
  } else if (kind === 2) {
    const shape = rng.pick(['square', 'circle'] as const)
    const fill = rng.pick(FILLS)
    const positions = ['left', 'right'] as const
    cells = [0, 1, 2, 3].map((step) =>
      figure(shape, fill, { marks: [{ kind: 'dot', position: positions[step % 2] ?? 'left' }] }),
    )
    answer = figure(shape, fill, { marks: [{ kind: 'dot', position: 'left' }] })
    explanation = 'The dot reflects in a vertical mirror: left, right, left, right. The next figure mirrors the dot back to the left.'
  } else {
    const shape = rng.pick(ALL_SHAPES)
    const fill = rng.pick(FILLS)
    const positions = ['top', 'bottom'] as const
    cells = [0, 1, 2, 3].map((step) =>
      figure(shape, fill, { marks: [{ kind: 'dot', position: positions[step % 2] ?? 'top' }] }),
    )
    answer = figure(shape, fill, { marks: [{ kind: 'dot', position: 'top' }] })
    explanation = 'The dot reflects in a horizontal mirror: top, bottom, top, bottom. The next figure mirrors the dot back to the top.'
  }

  const pool: NvrFigure[] = [
    { ...answer, rotation: ((answer.rotation ?? 0) + 90) % 360 },
    { ...answer, rotation: ((answer.rotation ?? 0) + 180) % 360 },
    { ...answer, fill: nextIn(FILLS, answer.fill ?? 'empty') },
    { ...answer, shape: nextIn(ALL_SHAPES, answer.shape) },
    figure(nextIn(ALL_SHAPES, answer.shape), nextIn(FILLS, answer.fill ?? 'empty')),
  ]
  const distractors = distinctDistractors(answer, rng.shuffle(pool))
  const { draftOptions, correctIndex, optionFigures } = optionFiguresFor(answer, distractors)
  return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'reflection_rotation', index), {
    topic: 'reflection_rotation',
    difficulty: difficultyAt(index),
    stem: kind <= 1 ? 'Which figure comes next in the turning sequence?' : 'Which figure comes next in the mirrored sequence?',
    options: draftOptions,
    correctIndex,
    explanation,
    timeTargetSeconds: 40,
    svgConfig: { layout: 'sequence', cells, optionFigures },
  })
}

interface DiceScenario {
  stem: string
  options: string[]
  correctIndex: number
  explanation: string
}

function diceScenario(index: number): DiceScenario {
  const kind = index % 5
  if (kind === 0) {
    const top = [1, 2, 3, 4, 5, 6][index % 6] ?? 6
    const bottom = 7 - top
    return {
      stem: `A standard dice is sitting on the table. The face showing ${top} is on top.\n\nWhat number is on the bottom? (On a real dice, opposite faces always add up to 7.)`,
      options: numericOptions(bottom),
      correctIndex: 0,
      explanation: `Opposite faces of a standard dice add up to 7, so the bottom face is 7 − ${top} = ${bottom}.`,
    }
  }
  if (kind === 1) {
    const faces = [
      { stem: 'A dice shows 2 on top and 5 at the front. What number is at the back?', answer: 2 },
      { stem: 'A dice shows 4 on top and 1 at the front. What number is at the back?', answer: 6 },
      { stem: 'A dice shows 6 on top and 3 at the front. What number is at the back?', answer: 4 },
    ]
    const pick = faces[index % faces.length] ?? faces[0]
    const answer = pick?.answer ?? 2
    return {
      stem: `${pick?.stem ?? ''}\n\n(Remember: front and back are opposite faces, so they add up to 7.)`,
      options: numericOptions(answer),
      correctIndex: 0,
      explanation: 'Front and back are opposite faces, and opposite faces add up to 7. So the back face is 7 minus the front face.',
    }
  }
  if (kind === 2) {
    const n = [3, 4, 5][index % 3] ?? 3
    const twoFaces = 12 * (n - 2)
    const oneFaces = 6 * (n - 2) * (n - 2)
    const zeroFaces = (n - 2) * (n - 2) * (n - 2)
    const variants = [
      { question: 'exactly two faces painted', answer: twoFaces },
      { question: 'exactly one face painted', answer: oneFaces },
      { question: 'no faces painted at all', answer: zeroFaces },
    ]
    const pick = variants[index % variants.length] ?? variants[0]
    const answer = pick?.answer ?? twoFaces
    return {
      stem: `A large ${n} × ${n} × ${n} cube is painted all over, then cut into ${n * n * n} small unit cubes.\n\nHow many small cubes have ${pick?.question ?? 'exactly two faces painted'}?`,
      options: numericOptions(answer),
      correctIndex: 0,
      explanation:
        n === 3
          ? 'On a 3 × 3 × 3 cube the 12 edge cubes have two painted faces, the 6 centre-of-face cubes have one, and the single middle cube has none.'
          : 'Count by position: corner cubes have 3 painted faces (always 8), edge cubes have 2, face-centre cubes have 1, and the inner cubes have none.',
    }
  }
  if (kind === 3) {
    const pairs = [
      { stem: 'On a standard dice net, the face with 1 pip is opposite the face with 6 pips. Which face is opposite 3 pips?', answer: 4 },
      { stem: 'On a standard dice, opposite faces add to 7. Which number is opposite 5 pips?', answer: 2 },
      { stem: 'On a standard dice net in the cross shape, 2 is opposite 5. Which number is opposite 1?', answer: 6 },
    ]
    const pick = pairs[index % pairs.length] ?? pairs[0]
    const answer = pick?.answer ?? 4
    return {
      stem: pick?.stem ?? '',
      options: numericOptions(answer),
      correctIndex: 0,
      explanation: 'On a standard dice the opposite pairs are always 1–6, 2–5 and 3–4, because each pair adds up to 7.',
    }
  }
  const symbols = [
    { stem: 'A cube has one symbol on each face: star, moon, sun, cloud, leaf and wave. Star is opposite moon, and sun is opposite cloud.\n\nWhat is opposite the leaf?', answer: 'wave', wrong: ['star', 'moon', 'sun', 'cloud'] },
    { stem: 'On a special cube, red is opposite blue, and green is opposite yellow. What colour is opposite purple?', answer: 'orange', wrong: ['red', 'blue', 'green', 'yellow'] },
    { stem: 'Six different stickers cover a cube: A, B, C, D, E and F. A is opposite D, and B is opposite E.\n\nWhich sticker is opposite C?', answer: 'F', wrong: ['A', 'B', 'D', 'E'] },
  ]
  const pick = symbols[index % symbols.length] ?? symbols[0]
  const correct = pick?.answer ?? 'wave'
  const uniqueWrong = [...new Set((pick?.wrong ?? ['star', 'moon', 'sun', 'cloud']).filter((value) => value !== correct))].slice(0, 4)
  return {
    stem: pick?.stem ?? '',
    options: [correct, ...uniqueWrong],
    correctIndex: 0,
    explanation: 'Each face has a unique partner. Once five pairs are accounted for, only one sticker or colour is left for the final pair.',
  }
}

function cubeFoldingQuestion(rng: Rng, index: number, nonce: string): Question {
  const scenario = diceScenario(index)
  const indexed = scenario.options.map((text, i) => ({ text, correct: i === scenario.correctIndex }))
  const shuffled = rng.shuffle(indexed)
  return buildQuestion(rng, 'nvr', makeQuestionId(nonce, 'nvr', 'cube_folding', index), {
    topic: 'cube_folding',
    difficulty: difficultyAt(index),
    stem: scenario.stem,
    options: shuffled.map((entry) => entry.text),
    correctIndex: shuffled.findIndex((entry) => entry.correct),
    explanation: scenario.explanation,
    timeTargetSeconds: 45,
  })
}

export function generateNvrQuestions(nonce: string, countPerType = 10): Question[] {
  const questions: Question[] = []
  const builders: ReadonlyArray<(rng: Rng, index: number, nonce: string) => Question> = [
    matrixQuestion,
    sequenceQuestion,
    oddOneOutQuestion,
    reflectionRotationQuestion,
    cubeFoldingQuestion,
  ]
  const seeds = ['nvr-matrix', 'nvr-seq', 'nvr-odd', 'nvr-reflect', 'nvr-cube']
  builders.forEach((builder, builderIndex) => {
    for (let i = 0; i < countPerType; i += 1) {
      const rng = createRng(hashSeed(BASE_SEED, seeds[builderIndex] ?? 'nvr', nonce, i))
      questions.push(builder(rng, i, nonce))
    }
  })
  return questions
}
