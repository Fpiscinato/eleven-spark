import type { Question } from '../db/schemas'
import { buildQuestion, difficultyAt, makeQuestionId } from './common'
import { createRng, hashSeed, type Rng } from './rng'

const BASE_SEED = 20260701

export const COMPASS_TOPICS = [
  'science_data_table',
  'science_variables',
  'history_timeline',
  'geography_climate',
  'computing_flowchart',
  'computing_grid',
  'computing_block_rules',
  'music_rhythm',
  'design_colour',
  'design_proportion',
  'language_deduction',
] as const

export type CompassTopic = (typeof COMPASS_TOPICS)[number]

interface ScienceRow {
  name: string
  first: number
  second: number
}

interface ScienceSet {
  heading: string
  columnFirst: string
  columnSecond: string
  unit: string
  rows: ScienceRow[]
}

const SCIENCE_SETS: readonly ScienceSet[] = [
  {
    heading: 'Four plants were measured at the start of the investigation and again 5 days later.',
    columnFirst: 'Height at the start (cm)',
    columnSecond: 'Height after 5 days (cm)',
    unit: 'cm',
    rows: [
      { name: 'Plant A', first: 10, second: 26 },
      { name: 'Plant B', first: 12, second: 24 },
      { name: 'Plant C', first: 8, second: 25 },
      { name: 'Plant D', first: 15, second: 24 },
    ],
  },
  {
    heading: 'Three cups of water were left on a table and their temperatures were recorded.',
    columnFirst: 'Temperature at 0 minutes (°C)',
    columnSecond: 'Temperature at 10 minutes (°C)',
    unit: '°C',
    rows: [
      { name: 'Cup A', first: 80, second: 60 },
      { name: 'Cup B', first: 80, second: 55 },
      { name: 'Cup C', first: 70, second: 50 },
    ],
  },
  {
    heading: 'The same seedlings were counted on the first day and again a week later.',
    columnFirst: 'Leaves on day 1',
    columnSecond: 'Leaves on day 7',
    unit: 'leaves',
    rows: [
      { name: 'Seedling 1', first: 4, second: 11 },
      { name: 'Seedling 2', first: 6, second: 12 },
      { name: 'Seedling 3', first: 5, second: 12 },
      { name: 'Seedling 4', first: 7, second: 13 },
    ],
  },
]

const TIMELINE_SETS: readonly { title: string; events: readonly { year: number; text: string }[] }[] = [
  {
    title: 'A timeline of British and world events',
    events: [
      { year: 1066, text: 'The Normans arrived in England.' },
      { year: 1176, text: 'The first paper mill in England opened.' },
      { year: 1492, text: 'Columbus set sail across the Atlantic.' },
      { year: 1666, text: 'The Great Fire of London burned for four days.' },
      { year: 1783, text: 'The first hot air balloon flew into the sky.' },
    ],
  },
  {
    title: 'A timeline of castles and inventions',
    events: [
      { year: 1150, text: 'A stone castle was built on a hill near the coast.' },
      { year: 1440, text: 'The first printing press was used in Europe.' },
      { year: 1712, text: 'A new design of steam engine was patented.' },
      { year: 1837, text: 'The first passenger train began its journey.' },
      { year: 1903, text: 'The first powered aircraft flew.' },
    ],
  },
  {
    title: 'A timeline of exploration',
    events: [
      { year: 1400, text: 'A new sea route to Asia was charted.' },
      { year: 1519, text: 'A small ship began a long voyage around the world.' },
      { year: 1600, text: 'A trading post was built beside a harbour.' },
      { year: 1770, text: 'Cook reached the far side of the Pacific Ocean.' },
      { year: 1969, text: 'A spacecraft landed on the Moon.' },
    ],
  },
]

const RAINFALL_SETS: readonly { place: string; month: string; rain: number }[][] = [
  [
    { place: 'Cotswold Hills', month: 'January', rain: 82 },
    { place: 'Cotswold Hills', month: 'February', rain: 54 },
    { place: 'Cotswold Hills', month: 'March', rain: 47 },
    { place: 'Cotswold Hills', month: 'April', rain: 41 },
    { place: 'Cotswold Hills', month: 'May', rain: 38 },
    { place: 'Cotswold Hills', month: 'June', rain: 45 },
  ],
  [
    { place: 'Vale of Gloucester', month: 'January', rain: 71 },
    { place: 'Vale of Gloucester', month: 'February', rain: 66 },
    { place: 'Vale of Gloucester', month: 'March', rain: 52 },
    { place: 'Vale of Gloucester', month: 'April', rain: 44 },
    { place: 'Vale of Gloucester', month: 'May', rain: 40 },
    { place: 'Vale of Gloucester', month: 'June', rain: 49 },
  ],
]

const FLOWCHARTS: readonly { rule: string; yes: string; no: string; probe: number; probeYes: boolean }[] = [
  { rule: 'Is the number bigger than 10?', yes: 'BIG', no: 'SMALL', probe: 7, probeYes: false },
  { rule: 'Is the number even?', yes: 'DOUBLE', no: 'SINGLE', probe: 9, probeYes: false },
  { rule: 'Is the number a multiple of 3?', yes: 'THREE', no: 'OTHER', probe: 12, probeYes: true },
  { rule: 'Is the number less than 5?', yes: 'TINY', no: 'BIG', probe: 3, probeYes: true },
  { rule: 'Is the number odd?', yes: 'ODD', no: 'EVEN', probe: 14, probeYes: false },
]

const BLOCK_RULES: readonly { steps: readonly string[]; example: number; answer: number; wrong: readonly number[] }[] = [
  { steps: ['add 5', 'multiply by 2', 'subtract 3'], example: 4, answer: 15, wrong: [14, 13, 10, 17] },
  { steps: ['double it', 'add 3'], example: 6, answer: 15, wrong: [12, 9, 18, 14] },
  { steps: ['subtract 4', 'multiply by 3'], example: 8, answer: 12, wrong: [16, 4, 20, 10] },
  { steps: ['multiply by 5', 'subtract 7'], example: 6, answer: 23, wrong: [30, 28, 18, 12] },
  { steps: ['add 10', 'halve it'], example: 24, answer: 17, wrong: [14, 12, 22, 20] },
]

const TROLIAN_WORDS: readonly { word: string; meaning: string }[] = [
  { word: 'kel', meaning: 'sky' },
  { word: 'mar', meaning: 'run' },
  { word: 'tul', meaning: 'fish' },
  { word: 'dop', meaning: 'green' },
  { word: 'fim', meaning: 'hill' },
  { word: 'zon', meaning: 'bread' },
]

const COLOUR_RULES = 'In this artist palette: red + yellow = orange, red + blue = purple, blue + yellow = green, and white + any colour makes a lighter version of that colour.'

function formatValue(value: number, unit: string): string {
  return unit === '' ? String(value) : `${value} ${unit}`
}

function numericOptions(
  rng: Rng,
  correctValue: number,
  candidates: readonly number[],
  format: (value: number) => string,
): string[] {
  const correctText = format(correctValue)
  const seen = new Set<string>([correctText])
  const pool = [...candidates]
  const options: string[] = []
  let guard = 0
  while (options.length < 4 && guard < 300) {
    guard += 1
    let value: number
    if (pool.length > 0) {
      const picked = pool.splice(rng.int(0, pool.length - 1), 1)[0]
      value = picked ?? correctValue
    } else {
      const step = rng.int(1, 9)
      value = correctValue + (rng.chance(0.5) ? step : -step)
    }
    const text = format(value)
    if (seen.has(text)) continue
    seen.add(text)
    options.push(text)
  }
  while (options.length < 4) {
    const text = format(correctValue + options.length + 7)
    if (seen.has(text)) continue
    seen.add(text)
    options.push(text)
  }
  return [correctText, ...options]
}

function scienceDataTableQuestion(rng: Rng, index: number, nonce: string): Question {
  const set = rng.pick(SCIENCE_SETS)
  const changes = set.rows.map((row) => ({
    name: row.name,
    change: Math.abs(row.second - row.first),
  }))
  const largest = changes.reduce((best, entry) => (entry.change > best.change ? entry : best))
  const smallest = changes.reduce((best, entry) => (entry.change < best.change ? entry : best))
  const askLargest = index % 2 === 0
  const target = askLargest ? largest : smallest
  const others = changes.filter((entry) => entry.name !== target.name).map((entry) => entry.change)
  const unit = set.unit === '°C' ? '°C' : set.unit

  const stem = [
    set.heading,
    '',
    `Name | ${set.columnFirst} | ${set.columnSecond}`,
    ...set.rows.map((row) => `${row.name} | ${row.first} | ${row.second}`),
    '',
    askLargest
      ? `Which one changed the most?`
      : `Which one changed the least?`,
    'Work out the change for each row, then compare.',
  ].join('\n')

  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'science_data_table', index), {
    topic: 'science_data_table',
    difficulty: difficultyAt(index),
    stem,
    options: numericOptions(rng, target.change, others, (value) => formatValue(value, unit)),
    correctIndex: 0,
    explanation: `Work out the change for each row by subtracting the first number from the second: ${changes
      .map((entry) => `${entry.name} changed by ${entry.change} ${unit}`)
      .join(', ')}. So ${target.name} changed ${
      askLargest ? 'the most' : 'the least'
    } (${target.change} ${unit}).`,
    timeTargetSeconds: 75,
  })
}

interface VariableSetup {
  changed: string
  measured: string
  kept: string
}

const VARIABLE_SETUPS: readonly VariableSetup[] = [
  {
    changed: 'the amount of water given to each pot',
    measured: 'the height of the plant after two weeks',
    kept: 'the type of pot and the room where the pots stood',
  },
  {
    changed: 'the number of minutes the bell was rung for',
    measured: 'how far the sound was heard',
    kept: 'the size of the bell and the person ringing it',
  },
  {
    changed: 'the thickness of the card used',
    measured: 'the weight of the folded paper bridge',
    kept: 'the length of the bridge and the coins used',
  },
  {
    changed: 'the temperature of the water',
    measured: 'how long the ice took to melt',
    kept: 'the size of the ice cube and the container',
  },
]

function scienceVariablesQuestion(rng: Rng, index: number, nonce: string): Question {
  const setup = rng.pick(VARIABLE_SETUPS)
  const mode = index % 3
  const question =
    mode === 0
      ? 'Which is the independent variable, the one the scientist changed on purpose?'
      : mode === 1
        ? 'Which is the dependent variable, the one the scientist measured?'
        : 'Which is a control variable, something kept the same so the test was fair?'

  const correct = mode === 0 ? setup.changed : mode === 1 ? setup.measured : setup.kept
  const wrongPool = [setup.changed, setup.measured, setup.kept].filter((entry) => entry !== correct)
  const wrongOptions = rng.shuffle(wrongPool).map((entry) => capitalise(entry))
  const filler = [
    'the name of the school',
    'the day of the week the test was written',
    'the number of children watching',
  ]
  while (wrongOptions.length < 4) wrongOptions.push(capitalise(rng.pick(filler)))

  const stem = [
    'A scientist set up an investigation.',
    '',
    `They changed ${setup.changed}.`,
    `They measured ${setup.measured}.`,
    `They kept the same ${setup.kept}.`,
    '',
    question,
  ].join('\n')

  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'science_variables', index), {
    topic: 'science_variables',
    difficulty: difficultyAt(index),
    stem,
    options: [capitalise(correct), ...wrongOptions.slice(0, 4)],
    correctIndex: 0,
    explanation:
      mode === 0
        ? `The independent variable is the one the scientist changes on purpose. Here that is ${setup.changed}. ${capitalise(setup.measured)} is what is measured, so it is the dependent variable.`
        : mode === 1
          ? `The dependent variable is what the scientist measures to find out what happened. Here that is ${setup.measured}. ${capitalise(setup.changed)} is what was changed.`
          : `A control variable is kept the same so the test is fair. Here that is ${setup.kept}. ${capitalise(setup.changed)} is what was changed and ${setup.measured} is what was measured.`,
    timeTargetSeconds: 70,
  })
}

function capitalise(text: string): string {
  return text.length === 0 ? text : `${text[0]?.toUpperCase() ?? ''}${text.slice(1)}`
}

function historyTimelineQuestion(rng: Rng, index: number, nonce: string): Question {
  const set = rng.pick(TIMELINE_SETS)
  const events = [...set.events]
  const mode = index % 3

  if (mode === 0) {
    const first = events[0]
    const options = numericOptions(
      rng,
      first?.year ?? 1066,
      events.slice(1).map((event) => event.year),
      (value) => String(value),
    )
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'history_timeline', index), {
      topic: 'history_timeline',
      difficulty: difficultyAt(index),
      stem: [
        set.title,
        '',
        ...events.map((event) => `${event.year} — ${event.text}`),
        '',
        'Which event happened FIRST?',
      ].join('\n'),
      options,
      correctIndex: 0,
      explanation: `Read the years from smallest to biggest. The earliest year is ${first?.year}, which is "${first?.text}". Every other event on the timeline happened later.`,
      timeTargetSeconds: 60,
    })
  }

  if (mode === 1) {
    const last = events[events.length - 1]
    const options = numericOptions(
      rng,
      last?.year ?? 1969,
      events.slice(0, -1).map((event) => event.year),
      (value) => String(value),
    )
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'history_timeline', index), {
      topic: 'history_timeline',
      difficulty: difficultyAt(index),
      stem: [
        set.title,
        '',
        ...events.map((event) => `${event.year} — ${event.text}`),
        '',
        'Which event happened LAST?',
      ].join('\n'),
      options,
      correctIndex: 0,
      explanation: `The biggest year is the latest one. That is ${last?.year}, which is "${last?.text}". All the other events happened earlier in the timeline.`,
      timeTargetSeconds: 60,
    })
  }

  const target = rng.pick(events.slice(0, events.length - 1))
  const position = events.findIndex((event) => event.year === target?.year)
  const next = events[position + 1]
  const stem = [
    set.title,
    '',
    ...events.map((event) => `${event.year} — ${event.text}`),
    '',
    `Which event happened directly AFTER "${target?.text}"?`,
  ].join('\n')
  const correctText = next ? `${next.year} — ${next.text}` : ''
  const wrongOptions = events
    .filter((event) => event.year !== next?.year)
    .map((event) => `${event.year} — ${event.text}`)
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'history_timeline', index), {
    topic: 'history_timeline',
    difficulty: difficultyAt(index),
    stem,
    options: [correctText, ...rng.shuffle(wrongOptions).slice(0, 4)],
    correctIndex: 0,
    explanation: `On the timeline, "${target?.text}" is in ${target?.year}. The next event on the list is ${next?.year} — "${next?.text}".`,
    timeTargetSeconds: 70,
  })
}

function geographyClimateQuestion(rng: Rng, index: number, nonce: string): Question {
  const mode = index % 3

  if (mode === 0) {
    const data = rng.pick(RAINFALL_SETS)
    const wettest = data.reduce((best, entry) => (entry.rain > best.rain ? entry : best))
    const others = data.filter((entry) => entry.month !== wettest.month).map((entry) => entry.rain)
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'geography_climate', index), {
      topic: 'geography_climate',
      difficulty: difficultyAt(index),
      stem: [
        `Here is the rainfall table for ${wettest.place}.`,
        '',
        'Month | Rainfall (mm)',
        ...data.map((entry) => `${entry.month} | ${entry.rain}`),
        '',
        'Which month had the MOST rain?',
      ].join('\n'),
      options: numericOptions(rng, wettest.rain, others, (value) => `${value} mm`),
      correctIndex: 0,
      explanation: `Look down the rainfall column and find the biggest number. That is ${wettest.rain} mm in ${wettest.month}.`,
      timeTargetSeconds: 55,
    })
  }

  if (mode === 1) {
    const data = rng.pick(RAINFALL_SETS)
    const first = data[0]
    const last = data[data.length - 1]
    const difference = (first?.rain ?? 0) - (last?.rain ?? 0)
    const others = data.slice(1).map((entry) => Math.abs(entry.rain - (last?.rain ?? 0)))
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'geography_climate', index), {
      topic: 'geography_climate',
      difficulty: difficultyAt(index),
      stem: [
        `Here is the rainfall table for ${first?.place}.`,
        '',
        'Month | Rainfall (mm)',
        ...data.map((entry) => `${entry.month} | ${entry.rain}`),
        '',
        `How much more rain fell in ${first?.month} than in ${last?.month}?`,
      ].join('\n'),
      options: numericOptions(rng, difference, others, (value) => `${value} mm`),
      correctIndex: 0,
      explanation: `${first?.month} had ${first?.rain} mm and ${last?.month} had ${last?.rain} mm. The difference is ${first?.rain} - ${last?.rain} = ${difference} mm.`,
      timeTargetSeconds: 70,
    })
  }

  const scaleCm = rng.pick([2, 4, 5])
  const distanceCm = rng.pick([3, 4, 5, 6])
  const realKm = scaleCm * distanceCm
  const candidates = [scaleCm, distanceCm, realKm + scaleCm, realKm - scaleCm, scaleCm + distanceCm]
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'geography_climate', index), {
    topic: 'geography_climate',
    difficulty: difficultyAt(index),
    stem: [
      'A map of the district uses this scale:',
      '',
      `1 cm on the map = ${scaleCm} km in real life.`,
      '',
      `On the map, the school and the library are ${distanceCm} cm apart.`,
      '',
      'How far apart are they in real life?',
    ].join('\n'),
    options: numericOptions(rng, realKm, candidates, (value) => `${value} km`),
    correctIndex: 0,
    explanation: `Multiply the map distance by the scale: ${distanceCm} cm x ${scaleCm} km for every 1 cm = ${realKm} km.`,
    timeTargetSeconds: 65,
  })
}

function computingFlowchartQuestion(rng: Rng, index: number, nonce: string): Question {
  const chart = rng.pick(FLOWCHARTS)
  const correctWord = chart.probeYes ? chart.yes : chart.no
  const wrongWords = [chart.yes, chart.no, 'STOP', 'REPEAT', 'ERROR', 'END']
    .filter((word) => word !== correctWord)
  const stem = [
    'A computer program follows this flowchart:',
    '',
    'Start',
    '  v',
    chart.rule,
    `  yes -> write "${chart.yes}" -> End`,
    `  no  -> write "${chart.no}" -> End`,
    '',
    `The number ${chart.probe} is put into the program. What does it write?`,
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'computing_flowchart', index), {
    topic: 'computing_flowchart',
    difficulty: difficultyAt(index),
    stem,
    options: [correctWord, ...rng.shuffle(wrongWords).slice(0, 4)],
    correctIndex: 0,
    explanation: `Follow the flowchart with ${chart.probe}. The question "${chart.rule}" is answered with ${
      chart.probeYes ? 'yes' : 'no'
    }, so the program writes "${correctWord}".`,
    timeTargetSeconds: 65,
  })
}

const GRIDS: readonly { name: string; rows: readonly (readonly string[])[] }[] = [
  {
    name: 'a 3 by 3 grid of letters',
    rows: [
      ['A', 'B', 'C'],
      ['D', 'E', 'F'],
      ['G', 'H', 'I'],
    ],
  },
  {
    name: 'a 3 by 3 grid of letters',
    rows: [
      ['J', 'K', 'L'],
      ['M', 'N', 'O'],
      ['P', 'Q', 'R'],
    ],
  },
  {
    name: 'a 3 by 3 grid of letters',
    rows: [
      ['S', 'T', 'U'],
      ['V', 'W', 'X'],
      ['Y', 'Z', '1'],
    ],
  },
]

function gridDescription(rows: readonly (readonly string[])[]): string {
  const rowNames = ['top row', 'middle row', 'bottom row']
  const columnNames = ['left column', 'middle column', 'right column']
  return rows
    .map((row, rowIndex) => {
      const positions = row.map((cell, columnIndex) => `${columnNames[columnIndex] ?? ''} = ${cell}`).join(', ')
      return `${rowNames[rowIndex] ?? ''}: ${positions}`
    })
    .join('\n')
}

function computingGridQuestion(rng: Rng, index: number, nonce: string): Question {
  const grid = rng.pick(GRIDS)
  const rowIndex = rng.int(0, 2)
  const columnIndex = rng.int(0, 2)
  const rowNames = ['top', 'middle', 'bottom']
  const columnNames = ['left', 'middle', 'right']
  const correct = grid.rows[rowIndex]?.[columnIndex] ?? 'A'
  const all = grid.rows.flat()
  const wrongOptions = all.filter((cell) => cell !== correct)
  const stem = [
    'A robot has to find a letter inside a grid.',
    '',
    `Here is ${grid.name}. Read it like this:`,
    gridDescription(grid.rows),
    '',
    `Which letter is in the ${rowNames[rowIndex]} row, ${columnNames[columnIndex]} column?`,
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'computing_grid', index), {
    topic: 'computing_grid',
    difficulty: difficultyAt(index),
    stem,
    options: [correct, ...rng.shuffle(wrongOptions).slice(0, 4)],
    correctIndex: 0,
    explanation: `Follow the row first: the ${rowNames[rowIndex]} row holds ${
      grid.rows[rowIndex]?.join(', ')
    }. Then the ${columnNames[columnIndex]} column of that row holds ${correct}.`,
    timeTargetSeconds: 55,
  })
}

function computingBlockRulesQuestion(rng: Rng, index: number, nonce: string): Question {
  const rule = rng.pick(BLOCK_RULES)
  const stem = [
    'A coding program is made of these blocks, in this order:',
    '',
    ...rule.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`),
    '',
    `The number ${rule.example} goes in at the start.`,
    'What number comes out at the end?',
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'computing_block_rules', index), {
    topic: 'computing_block_rules',
    difficulty: difficultyAt(index),
    stem,
    options: numericOptions(rng, rule.answer, rule.wrong, (value) => String(value)),
    correctIndex: 0,
    explanation: `Work through the blocks in order: ${rule.steps.join(', then ')}. Starting from ${rule.example} the answer is ${rule.answer}.`,
    timeTargetSeconds: 70,
  })
}

const RHYTHM_SETS: readonly { pattern: readonly string[]; bars: number; clapsPerBar: number }[] = [
  { pattern: ['CLAP', 'CLAP', 'REST', 'CLAP'], bars: 3, clapsPerBar: 3 },
  { pattern: ['CLAP', 'REST', 'CLAP', 'REST'], bars: 4, clapsPerBar: 2 },
  { pattern: ['CLAP', 'CLAP', 'CLAP', 'REST'], bars: 2, clapsPerBar: 3 },
  { pattern: ['CLAP', 'REST', 'REST', 'CLAP'], bars: 5, clapsPerBar: 2 },
]

function musicRhythmQuestion(rng: Rng, index: number, nonce: string): Question {
  const set = rng.pick(RHYTHM_SETS)
  const mode = index % 2
  if (mode === 0) {
    const total = set.bars * set.clapsPerBar
    const wrong = [set.bars, set.clapsPerBar, set.bars + set.clapsPerBar, total - 1]
    const stem = [
      'A drummer repeats this one bar of music over and over:',
      '',
      ...set.pattern.map((beat, beatIndex) => `Beat ${beatIndex + 1}: ${beat}`),
      '',
      `The pattern is played for ${set.bars} bars.`,
      'How many CLAPS are played in that time?',
    ].join('\n')
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'music_rhythm', index), {
      topic: 'music_rhythm',
      difficulty: difficultyAt(index),
      stem,
      options: numericOptions(rng, total, wrong, (value) => `${value} claps`),
      correctIndex: 0,
      explanation: `One bar has ${set.clapsPerBar} claps. Over ${set.bars} bars that is ${set.clapsPerBar} x ${set.bars} = ${total} claps.`,
      timeTargetSeconds: 60,
    })
  }

  const restBeat = set.pattern.findIndex((beat) => beat === 'REST')
  const names = ['first', 'second', 'third', 'fourth']
  const correct = names[restBeat] ?? 'first'
  const otherBeats = names.filter((name) => name !== correct).map((name) => `The ${name} beat`)
  const stem = [
    'A drummer repeats this one bar of music:',
    '',
    ...set.pattern.map((beat, beatIndex) => `Beat ${beatIndex + 1}: ${beat}`),
    '',
    'Which beat of the bar is a rest?',
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'music_rhythm', index), {
    topic: 'music_rhythm',
    difficulty: difficultyAt(index),
    stem,
    options: [`The ${correct} beat`, ...rng.shuffle(otherBeats), 'There is no rest in the bar'],
    correctIndex: 0,
    explanation: `Look through the bar: the rest comes on beat ${(restBeat ?? 0) + 1}, which is the ${correct} beat.`,
    timeTargetSeconds: 50,
  })
}

const COLOUR_QUESTIONS: readonly { question: string; correct: string; wrong: readonly string[]; reason: string }[] = [
  {
    question: 'What do blue and yellow make?',
    correct: 'Green',
    wrong: ['Orange', 'Purple', 'Red', 'Black'],
    reason: 'The rule says blue + yellow = green.',
  },
  {
    question: 'What do red and blue make?',
    correct: 'Purple',
    wrong: ['Orange', 'Green', 'Brown', 'Pink'],
    reason: 'The rule says red + blue = purple.',
  },
  {
    question: 'Which two colours make orange?',
    correct: 'Red and yellow',
    wrong: ['Blue and yellow', 'Red and blue', 'White and black', 'Red and white'],
    reason: 'The rule says red + yellow = orange.',
  },
  {
    question: 'What does white mixed with yellow make?',
    correct: 'A lighter yellow',
    wrong: ['A darker yellow', 'Orange', 'A lighter orange', 'White'],
    reason: 'The rule says white + any colour makes a lighter version of that colour.',
  },
]

function designColourQuestion(rng: Rng, index: number, nonce: string): Question {
  const entry = rng.pick(COLOUR_QUESTIONS)
  const stem = [COLOUR_RULES, '', entry.question].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'design_colour', index), {
    topic: 'design_colour',
    difficulty: difficultyAt(index),
    stem,
    options: [entry.correct, ...rng.shuffle(entry.wrong).slice(0, 4)],
    correctIndex: 0,
    explanation: `${entry.reason} Look at the rules again and check the two colours the question asks for.`,
    timeTargetSeconds: 55,
  })
}

const PROPORTION_SETS: readonly { total: number; unit: string; repeats: number }[] = [
  { total: 20, unit: 'cm', repeats: 4 },
  { total: 24, unit: 'cm', repeats: 3 },
  { total: 15, unit: 'cm', repeats: 5 },
  { total: 18, unit: 'cm', repeats: 6 },
]

function designProportionQuestion(rng: Rng, index: number, nonce: string): Question {
  const set = rng.pick(PROPORTION_SETS)
  const mode = index % 2
  if (mode === 0) {
    const answer = Math.floor(set.total / set.repeats)
    const wrong = [answer + 1, answer - 1, set.repeats, set.total]
    const stem = [
      'A wallpaper pattern repeats along a strip.',
      '',
      `The strip is ${set.total} ${set.unit} long and the same pattern repeats every ${set.repeats} ${set.unit}.`,
      '',
      'How many complete repeats fit along the strip?',
    ].join('\n')
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'design_proportion', index), {
      topic: 'design_proportion',
      difficulty: difficultyAt(index),
      stem,
      options: numericOptions(rng, set.repeats, wrong, (value) => `${value} repeats`),
      correctIndex: 0,
      explanation: `Divide the length of the strip by the length of one repeat: ${set.total} ÷ ${set.repeats} = ${answer}, so ${set.repeats} complete repeats fit along the strip.`,
      timeTargetSeconds: 65,
    })
  }

  const border = rng.pick([2, 3, 4])
  const width = set.total
  const picture = width - border * 2
  const wrong = [picture + 1, picture - 1, width, border]
  const stem = [
    'A poster has a wide border around a picture in the middle.',
    '',
    `The poster is ${width} ${set.unit} wide and the border is ${border} ${set.unit} wide on each side.`,
    '',
      'How wide is the picture in the middle?',
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'design_proportion', index), {
    topic: 'design_proportion',
    difficulty: difficultyAt(index),
    stem,
    options: numericOptions(rng, picture, wrong, (value) => `${value} ${set.unit}`),
    correctIndex: 0,
    explanation: `There are two borders, one on each side: ${border} + ${border} = ${border * 2} ${set.unit}. So the picture is ${width} - ${border * 2} = ${picture} ${set.unit} wide.`,
    timeTargetSeconds: 70,
  })
}

function languageDeductionQuestion(rng: Rng, index: number, nonce: string): Question {
  const picks = rng.shuffle(TROLIAN_WORDS).slice(0, 3)
  const [first, second] = picks
  const mode = index % 2
  if (mode === 0) {
    const stem = [
      'In Trolian, these words are used:',
      '',
      ...picks.map((entry) => `"${entry.word}" means "${entry.meaning}".`),
      '',
      `What does "${first?.word} ${second?.word}" mean?`,
    ].join('\n')
    const correct = `${first?.meaning} ${second?.meaning}`
    const wrong = [
      `${second?.meaning} ${first?.meaning}`,
      `${first?.meaning} and ${second?.meaning}`,
      `one ${first?.meaning}, one ${second?.meaning}`,
      `${first?.meaning}`,
    ]
    return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'language_deduction', index), {
      topic: 'language_deduction',
      difficulty: difficultyAt(index),
      stem,
      options: [correct, ...wrong],
      correctIndex: 0,
      explanation: `Take each Trolian word and swap it for its meaning: "${first?.word}" becomes "${first?.meaning}" and "${second?.word}" becomes "${second?.meaning}". So the phrase means "${correct}".`,
      timeTargetSeconds: 60,
    })
  }

  const target = picks[0]
  const others = TROLIAN_WORDS.filter((entry) => entry.word !== target?.word).map((entry) => entry.word)
  const stem = [
    'In Trolian, these words are used:',
    '',
    ...picks.map((entry) => `"${entry.word}" means "${entry.meaning}".`),
    '',
    `Which Trolian word means "${target?.meaning}"?`,
  ].join('\n')
  return buildQuestion(rng, 'compass', makeQuestionId(nonce, 'compass', 'language_deduction', index), {
    topic: 'language_deduction',
    difficulty: difficultyAt(index),
    stem,
    options: [target?.word ?? 'kel', ...rng.shuffle(others).slice(0, 4)],
    correctIndex: 0,
    explanation: `Look at the list and find the meaning that matches. "${target?.meaning}" is written as "${target?.word}" in Trolian.`,
    timeTargetSeconds: 50,
  })
}

type CompassBuilder = (rng: Rng, index: number, nonce: string) => Question

const BUILDERS: ReadonlyArray<{ topic: CompassTopic; builder: CompassBuilder }> = [
  { topic: 'science_data_table', builder: scienceDataTableQuestion },
  { topic: 'science_variables', builder: scienceVariablesQuestion },
  { topic: 'history_timeline', builder: historyTimelineQuestion },
  { topic: 'geography_climate', builder: geographyClimateQuestion },
  { topic: 'computing_flowchart', builder: computingFlowchartQuestion },
  { topic: 'computing_grid', builder: computingGridQuestion },
  { topic: 'computing_block_rules', builder: computingBlockRulesQuestion },
  { topic: 'music_rhythm', builder: musicRhythmQuestion },
  { topic: 'design_colour', builder: designColourQuestion },
  { topic: 'design_proportion', builder: designProportionQuestion },
  { topic: 'language_deduction', builder: languageDeductionQuestion },
]

export function generateCompassQuestions(nonce: string, countPerType = 12): Question[] {
  const questions: Question[] = []
  BUILDERS.forEach((entry) => {
    for (let index = 0; index < countPerType; index += 1) {
      const rng = createRng(hashSeed(BASE_SEED, entry.topic, nonce, index))
      questions.push(entry.builder(rng, index, nonce))
    }
  })
  return questions
}
