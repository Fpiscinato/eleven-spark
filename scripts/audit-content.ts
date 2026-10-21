import { generateQuestionBank } from '../src/generators'
import { visualFigureKey } from '../src/utils/nvrFigures'

interface Issue {
  id: string
  topic: string
  reason: string
  detail: string
}

function canMoveOneLetter(from: string, to: string): boolean {
  if (from.length !== to.length) return false
  for (let i = 0; i < from.length; i += 1) {
    const rest = from.slice(0, i) + from.slice(i + 1)
    for (let j = 0; j <= rest.length; j += 1) {
      if (rest.slice(0, j) + from[i] + rest.slice(j) === to) return true
    }
  }
  return false
}

function checkQuestion(question: {
  id: string
  subject: string
  topic: string
  stem: string
  options: string[]
  correctIndex: number
  explanation: string
  svgConfig?: { optionFigures?: unknown[] }
}): Issue[] {
  const issues: Issue[] = []
  const push = (reason: string, detail: string) => {
    issues.push({ id: question.id, topic: question.topic, reason, detail })
  }

  if (question.stem.trim().length === 0) push('empty stem', 'the question text is blank')
  if (question.explanation.trim().length === 0) push('empty explanation', 'no explanation shown')
  if (question.options.length !== 5) {
    push('wrong option count', `${question.options.length} options`)
    return issues
  }
  if (question.correctIndex < 0 || question.correctIndex > 4) {
    push('bad correctIndex', String(question.correctIndex))
  }

  const figures = question.svgConfig?.optionFigures ?? []
  const hasFigures = figures.length > 0
  if (hasFigures && figures.length !== 5) {
    push('wrong figure count', `${figures.length} option figures`)
  }

  const seen = new Set<string>()
  question.options.forEach((option, index) => {
    const text = option.trim()
    if (text.length === 0 && !(hasFigures && figures[index])) {
      push('blank option', `option ${index + 1} has no text and no figure`)
    }
    const key = question.subject === 'english' ? text : text.toLowerCase()
    if (key.length > 0) {
      if (seen.has(key)) push('duplicate option', `option ${index + 1} repeats "${text}"`)
      seen.add(key)
    }
  })

  if (hasFigures) {
    const keys = figures.map((figure) => visualFigureKey(figure as never))
    if (question.topic === 'odd_one_out') {
      const answerKey = keys[question.correctIndex]
      const answerCount = keys.filter((key) => key === answerKey).length
      if (answerCount !== 1) {
        push('odd answer not unique', `the odd figure looks like ${answerCount} options`)
      }
    } else if (new Set(keys).size !== keys.length) {
      push('duplicate figures', `${new Set(keys).size} distinct of ${keys.length}`)
    }
  }

  if (question.topic === 'move_one_letter') {
    const stemWord = /of ([A-Z]+)/.exec(question.stem)?.[1] ?? ''
    if (stemWord) {
      const answer = question.options[question.correctIndex]?.trim().toUpperCase() ?? ''
      if (!canMoveOneLetter(stemWord, answer)) {
        push('wrong answer', `"${answer}" cannot be made by moving one letter of ${stemWord}`)
      }
      question.options.forEach((option, index) => {
        if (index === question.correctIndex) return
        const word = option.trim().toUpperCase()
        if (word.length === 0) return
        if (canMoveOneLetter(stemWord, word)) {
          push('ambiguous answer', `option ${index + 1} "${word}" also works for ${stemWord}`)
        }
      })
    }
  }

  return issues
}

function main(): void {
  const batches = Number(process.argv[2] ?? 12)
  const issues: Issue[] = []
  let questionCount = 0
  for (let batch = 0; batch < batches; batch += 1) {
    const bank = generateQuestionBank(`audit-${batch}-${Math.random().toString(36).slice(2, 8)}`)
    questionCount += bank.questions.length
    for (const question of bank.questions) {
      issues.push(...checkQuestion(question))
    }
  }

  const byTopic = new Map<string, Map<string, number>>()
  for (const issue of issues) {
    const topicMap = byTopic.get(issue.topic) ?? new Map<string, number>()
    topicMap.set(issue.reason, (topicMap.get(issue.reason) ?? 0) + 1)
    byTopic.set(issue.topic, topicMap)
  }

  console.log(`questions checked: ${questionCount}`)
  console.log(`issues: ${issues.length}`)
  for (const [topic, reasons] of [...byTopic.entries()].sort()) {
    console.log(`  ${topic}: ${[...reasons.entries()].map(([reason, count]) => `${reason} x${count}`).join(', ')}`)
  }
  const samples = issues.slice(0, 12)
  for (const issue of samples) {
    console.log(`  - [${issue.topic}] ${issue.reason}: ${issue.detail} (${issue.id})`)
  }
}

main()
