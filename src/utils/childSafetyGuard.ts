import type { Passage, Question } from '../db/schemas'

export interface SafetyViolation {
  field: string
  term: string
  context: string
}

export interface SafetyResult {
  safe: boolean
  violations: SafetyViolation[]
}

const BLOCKED_TERMS: readonly string[] = [
  // Profanity, sexual, intimate, adult romance (EN)
  'sex', 'sexy', 'sexual', 'porn', 'porno', 'nude', 'nudes', 'naked', 'boob', 'boobs',
  'breast', 'breasts', 'nipple', 'nipples', 'penis', 'vagina', 'vulva', 'genital', 'genitals',
  'erotic', 'orgasm', 'orgasms', 'condom', 'condoms', 'bra', 'panties', 'underwear',
  'bastard', 'bitch', 'whore', 'slut', 'rape', 'raped', 'molest', 'incest',
  'fuck', 'fucking', 'fucked', 'shit', 'shitting', 'bullshit', 'damn', 'damned',
  'asshole', 'arse', 'arsehole', 'crap', 'piss', 'pissed', 'wank', 'wanker',
  'dick', 'cock', 'pussy', 'tits', 'titties', 'boner', 'horny', 'kinky',
  'romance', 'romantic', 'lover', 'boyfriend', 'girlfriend', 'kissing', 'flirt',
  'dating', 'mistress', 'seduce', 'seduction',
  // Alcohol / tobacco / drugs (EN)
  'alcohol', 'alcoholic', 'beer', 'whisky', 'whiskey', 'vodka',
  'drunk', 'drunken', 'brewery', 'booze', 'brandy',
  'lager', 'cocktail', 'cocktails', 'champagne', 'tequila', 'sherry',
  'smoking', 'smoker', 'cigarette', 'cigarettes', 'cigar', 'cigars', 'tobacco',
  'vaping', 'nicotine', 'hookah', 'shisha',
  'drug', 'drugs', 'cocaine', 'heroin', 'cannabis', 'marijuana', 'weed',
  'poison', 'poisoned', 'poisonous', 'overdose', 'meth', 'ecstasy', 'steroids',
  // Violence, weapons, death, crime, terror (EN)
  'killed', 'killing', 'murder', 'murdered', 'murderer', 'slaughter',
  'blood', 'bloody', 'bleeding', 'wounded', 'stabbed', 'stabbing',
  'gun', 'guns', 'pistol', 'pistols', 'rifle', 'rifles', 'shotgun', 'weapon', 'weapons',
  'knife', 'knives', 'dagger', 'bomb', 'bombs', 'grenade', 'explosive',
  'exploded', 'explosion', 'dead', 'death', 'died', 'dying', 'corpse',
  'suicide', 'suicidal', 'strangle',
  'crime', 'criminal', 'criminals', 'thief', 'thieves', 'stolen', 'robbery',
  'robbed', 'prison', 'prisoner', 'jail', 'kidnap', 'hostage', 'terror', 'terrorist',
  'terrorism', 'abuse', 'abused', 'abuser', 'torture', 'tortured', 'assault', 'violence',
  'violent', 'warfare', 'slaughtered', 'fighter',
  // Gambling (EN)
  'gamble', 'gambling', 'gambler', 'casino', 'casinos', 'betting',
  'lottery', 'jackpot', 'roulette',
  // Profanity / sexual / adult (PT)
  'sexo', 'sexual', 'pornô', 'porno', 'pelado', 'pelada', 'nudez', 'peito', 'peitos',
  'seio', 'seios', 'mamilo', 'pênis', 'penis', 'vagina', 'genital', 'genitais', 'erótico',
  'orgasmo', 'camisinha', 'sutiã', 'calcinha', 'cueca', 'puta', 'putaria', 'prostituta',
  'estupro', 'pedofilia', 'incesto', 'porra', 'merda', 'bosta', 'caralho', 'foder',
  'transar', 'trepar', 'buceta', 'piroca', 'tesão', 'tarado', 'safada', 'safado',
  'namoro', 'namorado', 'namorada', 'paquera', 'amante',
  // Alcohol / tobacco / drugs (PT)
  'álcool', 'alcool', 'bebida', 'bebidas', 'cerveja', 'vinho', 'cachaça', 'pinga', 'uísque',
  'bêbado', 'bebado', 'bêbada', 'boteco', 'balada',
  'cigarro', 'cigarros', 'tabaco', 'nicotina', 'narguilé',
  'droga', 'drogas', 'cocaína', 'cocaina', 'heroína', 'maconha', 'veneno',
  'anfetamina', 'esteroide',
  // Violence / weapons / death / crime (PT)
  'matar', 'matou', 'morte', 'morrer', 'morreu', 'morrido', 'assassino', 'assassinato',
  'sangue', 'sangrento', 'sangrar', 'ferida', 'esfaquear', 'facada',
  'pistola', 'revólver', 'espingarda', 'punhal',
  'bomba', 'bombas', 'granada', 'explosão', 'explodir', 'cadáver',
  'suicídio', 'suicidio', 'crime', 'criminoso', 'ladrão', 'ladrao', 'roubado',
  'prisão', 'prisao', 'gangue', 'sequestro', 'refém', 'refem', 'terror', 'terrorista',
  'terrorismo', 'abuso', 'tortura', 'assalto', 'violência', 'violencia', 'guerra', 'batalha',
  // Gambling (PT)
  'aposta', 'apostas', 'apostar', 'cassino', 'loteria', 'pôquer', 'roleta',
]

// Stems that are blocked even when they hide inside a longer word
// ("shitty", "drugs", "murders"...). Words such as "heroines", "arsenal",
// "method" or "analysis" are deliberately NOT stems so that ordinary
// reading passages are never caught by accident.
const BLOCKED_STEMS: readonly string[] = [
  'fuck', 'shit', 'bitch', 'whore', 'slut', 'porn', 'cocaine', 'nazi', 'hitler',
  'cunt', 'wank', 'boob', 'nipple', 'penis', 'vagina', 'orgasm', 'paedophil',
  'pedophil', 'suicid', 'terror', 'tortur', 'murder', 'prostitut', 'piss', 'crap',
  'damn', 'drug', 'alcohol', 'rape',
]

const SAFE_CONSONANTS = 'BCDFGHJKLMNPQRSTVWXZ'
const SAFE_VOWELS = 'AEIOU'

function normalize(text: string): string {
  return text
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const BLOCKED_WORDS: readonly string[] = BLOCKED_TERMS.map(normalize)
const BLOCKED_WORD_SET = new Set(BLOCKED_WORDS)
const BLOCKED_STEM_SET: readonly string[] = [...new Set(BLOCKED_STEMS.map(normalize))].sort(
  (a, b) => b.length - a.length,
)

const BIGRAM_PATTERNS: readonly { label: string; pattern: RegExp }[] = [
  { label: 'self-harm', pattern: /\bself\s+harm\b/i },
  { label: 'hard drug', pattern: /\bhard\s+drug\b/i },
  { label: 'blood alcohol', pattern: /\bblood\s+alcohol\b/i },
  { label: 'drug abuse', pattern: /\bdrug\s+abuse\b/i },
]

function tokenize(text: string): string[] {
  return normalize(text).match(/[a-z]+/g) ?? []
}

function contextAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + length + 40)
  return text.slice(start, end).replace(/\s+/g, ' ').trim()
}

function scanText(field: string, text: string, out: SafetyViolation[]): void {
  const lower = normalize(text)
  const tokens = tokenize(text)
  const matched = new Set<string>()

  for (const token of tokens) {
    if (BLOCKED_WORD_SET.has(token) && !matched.has(token)) {
      matched.add(token)
      const index = lower.indexOf(token)
      out.push({
        field,
        term: token,
        context: index >= 0 ? contextAround(text, index, token.length) : text.slice(0, 140),
      })
      return
    }
    const stem = BLOCKED_STEM_SET.find((candidate) => token.startsWith(candidate) && token.length > candidate.length)
    if (stem && !matched.has(stem)) {
      matched.add(stem)
      const index = lower.indexOf(token)
      out.push({
        field,
        term: `${stem}*`,
        context: index >= 0 ? contextAround(text, index, token.length) : text.slice(0, 140),
      })
    }
  }

  for (const bigram of BIGRAM_PATTERNS) {
    const match = bigram.pattern.exec(text)
    if (match && !matched.has(bigram.label)) {
      matched.add(bigram.label)
      out.push({ field, term: bigram.label, context: contextAround(text, match.index, match[0].length) })
    }
  }
}

export function scanForUnsafeContent(field: string, text: string): SafetyViolation[] {
  const out: SafetyViolation[] = []
  scanText(field, text, out)
  return out
}

export function isTextSafe(text: string): boolean {
  return scanForUnsafeContent('text', text).length === 0
}

export function validateQuestion(question: Question): SafetyResult {
  const violations: SafetyViolation[] = []
  scanText('stem', question.stem, violations)
  scanText('explanation', question.explanation, violations)
  question.options.forEach((option, index) => {
    scanText(`options[${index}]`, option, violations)
  })
  if (question.svgConfig) {
    for (const cell of question.svgConfig.cells) {
      for (const mark of cell.marks ?? []) {
        if (mark.symbol) scanText('svgConfig.cell.symbol', mark.symbol, violations)
      }
    }
    for (const figure of question.svgConfig.optionFigures ?? []) {
      for (const mark of figure.marks ?? []) {
        if (mark.symbol) scanText('svgConfig.option.symbol', mark.symbol, violations)
      }
    }
  }
  return { safe: violations.length === 0, violations }
}

export function validatePassage(passage: Passage): SafetyResult {
  const violations: SafetyViolation[] = []
  scanText('title', passage.title, violations)
  scanText('content', passage.content, violations)
  return { safe: violations.length === 0, violations }
}

// Roots that are never innocent inside another word: they are blocked wherever
// they appear inside a code (accidental letter combinations such as "KASEXO").
const CODE_BLOCKED_ROOTS: readonly string[] = [
  'fuck', 'shit', 'bitch', 'whore', 'slut', 'rape', 'porn', 'cocaine', 'heroin',
  'nazi', 'hitler', 'cunt', 'penis', 'vagin', 'bucet', 'piroca', 'caralh', 'maconh',
  'assassin', 'esfaqu', 'prostitut', 'pedophil', 'tortur', 'suicid', 'terror',
  'crap', 'piss', 'wank', 'boob', 'sex', 'orgy', 'orgasm',
]

// Roots that are only blocked when they start the code (or are the whole code),
// so innocent words such as "CLASS" or "AWARD" are never caught.
const CODE_BLOCKED_PREFIXES: readonly string[] = [
  'ass', 'war', 'gun', 'die', 'drug', 'bar', 'pub', 'ale', 'gin', 'rum', 'kill',
  'dead', 'shot', 'hate', 'dope', 'nigg', 'beer', 'wine', 'booze',
]

// Consonant-only spellings of blocked words ("FCK", "SHT", "CNT").
const CODE_BLOCKED_SKELETONS: readonly string[] = [
  'fck', 'fuk', 'sht', 'bch', 'slt', 'cnt', 'pssy', 'dck', 'whre', 'prn',
  'wtf', 'kms', 'dmn', 'wtch', 'slv',
]

const CODE_ROOT_PATTERN = new RegExp(CODE_BLOCKED_ROOTS.map(escapeRegExp).join('|'))
const CODE_SKELETON_PATTERN = new RegExp(CODE_BLOCKED_SKELETONS.map(escapeRegExp).join('|'))

export function lettersOnly(code: string): string {
  return normalize(code).replace(/[^a-z]/g, '')
}

/**
 * Finds the first blocked fragment inside a coded string.
 * Returns null when the code is safe to show to a child.
 */
export function findUnsafeCodeFragment(code: string): string | null {
  const letters = lettersOnly(code)
  if (letters.length < 3) return 'short-code'

  const rootMatch = CODE_ROOT_PATTERN.exec(letters)
  if (rootMatch) return rootMatch[0]

  for (const prefix of CODE_BLOCKED_PREFIXES) {
    if (letters === prefix || letters.startsWith(prefix)) return prefix
  }

  const withoutVowels = letters.replace(/[aeiou]/g, '')
  if (withoutVowels.length >= 3 && withoutVowels.length === letters.length) {
    const skeletonMatch = CODE_SKELETON_PATTERN.exec(withoutVowels)
    if (skeletonMatch) return skeletonMatch[0]
  }

  return null
}

export function isCodeSafe(code: string): boolean {
  return findUnsafeCodeFragment(code) === null
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max)
}

export function buildSafeCode(length: number): string {
  let code = ''
  for (let i = 0; i < length; i += 1) {
    const alphabet = i % 2 === 0 ? SAFE_CONSONANTS : SAFE_VOWELS
    code += alphabet[randomInt(alphabet.length)]
  }
  return code
}

export interface SafeCodeOptions {
  length: number
  attempts?: number
  allowVowels?: boolean
}

export function generateSafeCode(options: SafeCodeOptions): string {
  const attempts = options.attempts ?? 20
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidate = buildSafeCode(options.length)
    if (isCodeSafe(candidate)) return candidate
  }
  let fallback = buildSafeCode(options.length)
  let guard = 0
  while (!isCodeSafe(fallback) && guard < 200) {
    fallback = buildSafeCode(options.length)
    guard += 1
  }
  return fallback.replace(/[AEIOU]/g, (vowel) => {
    const index = SAFE_VOWELS.indexOf(vowel)
    return SAFE_CONSONANTS[(index + 3) % SAFE_CONSONANTS.length] ?? 'X'
  })
}

export { SAFE_CONSONANTS, SAFE_VOWELS }
