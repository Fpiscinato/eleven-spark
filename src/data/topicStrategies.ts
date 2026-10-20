import type { Subject } from '../db/schemas'

export interface TopicStrategy {
  attention: string
  trap: string
  steps: [string, string, string]
}

const SUBJECT_FALLBACK: Record<Subject, TopicStrategy> = {
  english: {
    attention: 'Read the question first, then hunt for the answer in the text. Answers are always hiding in the words on the page.',
    trap: 'Picking an option that "sounds nice" instead of one you can prove from the passage.',
    steps: [
      'Read the question and underline the key words.',
      'Scan the passage for those words or their synonyms.',
      'Prove each option against the text before you choose.',
    ],
  },
  vr: {
    attention: 'Verbal reasoning is pattern-finding with letters and words. Say the pattern in your head before you look at the options.',
    trap: 'Rushing into an option that is almost right — the traps are usually one letter or one step out.',
    steps: [
      'Work out the rule using the first example.',
      'Apply the rule slowly to the question.',
      'Check your answer against every option before committing.',
    ],
  },
  maths: {
    attention: 'Spot the operation the question wants (add, subtract, multiply, divide, or a fraction/percentage of an amount) before calculating.',
    trap: 'Answering with the right number but the wrong units — cm vs cm², hours vs minutes, £ vs p.',
    steps: [
      'Write down what you know and what you need.',
      'Choose the operation and calculate carefully.',
      'Check the answer makes sense in real life.',
    ],
  },
  nvr: {
    attention: 'Use S.P.A.N.S.: Shape, Position, Angle, Number, Shading. Check one letter at a time until the pattern clicks.',
    trap: 'Following the first pattern you see when the picture actually changes in two ways at once.',
    steps: [
      'Name what changes between the pictures (S.P.A.N.S.).',
      'Predict the next picture in words before looking at options.',
      'Eliminate options that break any single rule.',
    ],
  },
}

const TOPIC_STRATEGIES: Record<string, TopicStrategy> = {
  'vr:letter_codes': {
    attention:
      'Write the alphabet ruler A–Z above your paper and slide your finger along it. Every letter in the code moves the same number of places, so find the shift once and reuse it.',
    trap: 'Forgetting to keep the same direction — letters can move forward (+) or backward (−), and mixing them up costs the whole question.',
    steps: [
      'Compare the first letter of the real word with the first letter of the code to find the shift.',
      'Apply that shift letter by letter, saying each new letter aloud.',
      'Read your decoded word — if it is not a real word, check the direction again.',
    ],
  },
  'vr:move_one_letter': {
    attention:
      'Exactly one letter is picked up and moved somewhere else; the other letters keep their order. Test every letter as the "mover" until a real word appears.',
    trap: 'Swapping two letters or reversing the word — that is moving two letters, which is not allowed.',
    steps: [
      'Cover each letter in turn and see what is left.',
      'Try moving that letter to the front, the end, and between the others.',
      'Stop as soon as the leftover letters plus the mover spell a real word.',
    ],
  },
  'vr:hidden_words': {
    attention:
      'The hidden word runs straight through the letters without jumping. Run your finger left to right looking for a real four-letter word inside the string.',
    trap: 'Reading letters backwards or skipping letters — GL only hides words in order, so "KLOUFD" hiding CLOUD would be cheating.',
    steps: [
      'Look for common starting letters (S, C, T, B, ST...).',
      'Cover the letters before and after your guess to isolate it.',
      'Say the word aloud to confirm it is real.',
    ],
  },
  'vr:letter_series': {
    attention:
      'Write the alphabet underneath and count the jumps twice: the jump inside each pair, and the jump from one pair to the next. Both jumps stay the same.',
    trap: 'Only counting one of the two patterns — GL loves series where the letters inside a pair jump by 2, while the pairs themselves jump by 3.',
    steps: [
      'Write A–Z and mark the letters given.',
      'Count the gap inside a pair, then the gap between pairs.',
      'Carry both patterns on one more step and read off your answer.',
    ],
  },
  'vr:number_sequences': {
    attention:
      'Find the difference between neighbours first. If the difference itself changes, look for a second rule (squares, ×2 each time, or +2 then +3 then +4).',
    trap: 'Stopping at the first rule you find — "2, 4, 8, 16" could be ×2, but "2, 4, 8, 14" hides +2, +4, +6.',
    steps: [
      'Write the gaps between the numbers.',
      'Decide whether the gaps are steady, multiplying, or growing by a fixed amount.',
      'Apply the rule once more and sanity-check your number.',
    ],
  },
  'vr:synonyms_antonyms': {
    attention:
      'Cover the options and think of your own word first. A synonym means the same; an antonym means the opposite. Year 6 favourites: ancient/modern, fragile/sturdy, abundant/scarce.',
    trap: 'Choosing a word from the same topic rather than the same meaning — "doctor" and "hospital" go together, but they are not synonyms.',
    steps: [
      'Cover the options and invent your own answer word.',
      'Uncover the options and match meaning, not topic.',
      'Read the whole sentence with your choice to hear if it fits.',
    ],
  },
  'vr:letter_number_algebra': {
    attention:
      'Each letter is a mask over a digit. Write the value of every letter above the word before you calculate anything.',
    trap: 'Adding the digits when the question wants them written together (AB with A = 3, B = 5 is 35, not 8) — read carefully which one is asked.',
    steps: [
      'Write each letter’s number above the word.',
      'Decide whether to join the digits or add them.',
      'Check the place values: hundreds, tens, units.',
    ],
  },
  'maths:fractions': {
    attention:
      'Of means multiply. "¾ of 48" is ¾ × 48: divide by the bottom first, then multiply by the top.',
    trap: 'Multiplying before dividing — with big numbers that almost always goes wrong.',
    steps: [
      'Divide the amount by the bottom number (the denominator).',
      'Multiply by the top number (the numerator).',
      'Check the answer is smaller than the whole amount (unless the fraction is bigger than 1).',
    ],
  },
  'maths:decimals_percentages': {
    attention:
      'Percent means "out of 100". Convert with friendliest anchors: 50% is half, 25% is a quarter, 10% is divide by ten — then build up (15% = 10% + 5%).',
    trap: 'Mixing pounds and pence. £3.50 is 350p, and 10% of £3.50 is 35p, not £3.5p in your answer.',
    steps: [
      'Find a friendly percentage (10%, 25%, 50%) of the amount.',
      'Build the target percentage from your friendly pieces.',
      'Write the answer with the right unit (£ or p).',
    ],
  },
  'maths:ratio_proportion': {
    attention:
      'Add the ratio parts, then find the value of one part. Sharing £60 in the ratio 2:1 means 3 parts, so one part is £20.',
    trap: 'Forgetting to include the total number of people or parts when scaling a recipe up or down.',
    steps: [
      'Add the parts of the ratio.',
      'Divide the total amount by that sum to get one part.',
      'Multiply one part by what the question asks for.',
    ],
  },
  'maths:algebra_sequences': {
    attention:
      'In an nth term rule like 3n + 2, the n is the position (1st, 2nd, 3rd...). Plug the position in; do not multiply the terms themselves.',
    trap: 'Sign slips when moving terms across the equals sign — "5x − 7 = 38" becomes 5x = 45, not 31.',
    steps: [
      'Work out the difference between terms to spot the multiplier.',
      'Find what is added or subtracted after multiplying.',
      'Test your rule on the first two terms before using it.',
    ],
  },
  'maths:geometry': {
    attention:
      'Interior angles of a regular polygon: add 180° × (sides − 2), then divide by the number of sides. Angles on a straight line add to 180°; around a point, 360°.',
    trap: 'Area needs square units (length × width) while perimeter needs single units (add all the sides) — keep them apart.',
    steps: [
      'Name the rule you need (angles on a line, polygon interior, area, perimeter...).',
      'Write the formula and substitute the numbers carefully.',
      'Check the size makes sense: acute, obtuse, or reflex.',
    ],
  },
  'maths:timetables_speed': {
    attention:
      'Speed = distance ÷ time. For timetables, count on from the departure time in sensible jumps (15, 30, 45 minutes) and always write 24-hour times the same way.',
    trap: 'Mixing hours and minutes — 1 hour 40 minutes is 100 minutes, not 140, when you divide.',
    steps: [
      'Write the journey length by subtracting departure from arrival.',
      'Convert hours and minutes into total minutes if dividing.',
      'Apply speed = distance ÷ time and label the answer.',
    ],
  },
  'maths:averages': {
    attention:
      'Mean = total ÷ how many. Median = middle value once they are in order. Mode = most frequent. Range = biggest minus smallest.',
    trap: 'Finding the median from an unordered list — always sort first, and if there are two middle numbers, average them.',
    steps: [
      'Check which average the question wants (mean, median, mode, range).',
      'Sort or total the data as needed.',
      'Add the unit (cm, kg, £) to your final answer.',
    ],
  },
  'nvr:matrices': {
    attention:
      'Matrices change in two directions at once. Across a row, watch the columns; down a column, watch the rows. Use S.P.A.N.S.: Shape, Position, Angle, Number, Shading.',
    trap: 'Fixing on only one rule — most traps are a figure that is right about the shape but wrong about the shading or dots.',
    steps: [
      'Compare the first two cells of a row to name the row rule.',
      'Compare the first two cells of a column to name the column rule.',
      'Build the missing figure in your head, then eliminate mismatches.',
    ],
  },
  'nvr:sequences': {
    attention:
      'Step through the sequence one picture at a time and ask S.P.A.N.S. what changed. Common steps: quarter turns, +1 dot, grow one size, one more side.',
    trap: 'Assuming the rule keeps going the same way when it bounces (clockwise, then anticlockwise).',
    steps: [
      'Write the change between pictures 1→2 and 2→3.',
      'Confirm the change is identical both times.',
      'Apply the same step once more and pick the match.',
    ],
  },
  'nvr:odd_one_out': {
    attention:
      'Test the four classic rules in order: symmetry, same shape family, same shading, same number of sides or dots. The odd figure breaks exactly one rule.',
    trap: 'Stopping at "they look similar" — the odd one often looks almost identical but fails a precise rule like even vs odd sides.',
    steps: [
      'Check shading — is one figure a different fill?',
      'Check sides, dots and rotation invariants.',
      'Pick the figure that breaks the rule the other four share.',
    ],
  },
  'nvr:reflection_rotation': {
    attention:
      'Rotation turns around a point (the shape keeps left-right order); reflection mirrors it (left becomes right). Track a marked corner to tell them apart.',
    trap: 'Calling a half-turn a mirror — if the whole shape spins and no left-right flip happens, it is rotation.',
    steps: [
      'Pick one corner or dot to track through the change.',
      'Ask: did it spin (rotation) or flip (reflection)?',
      'Apply the same kind of change to the last figure.',
    ],
  },
  'nvr:cube_folding': {
    attention:
      'Every fold doubles the number of layers, so one punch through two folds makes 2 × 2 = 4 holes — unless you punch on a fold line, where layers share the hole.',
    trap: 'Punching the folded corner is not 4 holes — that corner is the centre of the original sheet, so it is only 1 hole.',
    steps: [
      'Count the folds to know the layers (1 fold = 2, 2 folds = 4).',
      'Check whether the punch is on a crease or the folded corner.',
      'Multiply layers by punches, then adjust for shared holes.',
    ],
  },
  'english:comprehension': {
    attention:
      'Underline the key words in the question, then find the matching line in the passage. The answer is always proved by a quote, never by guesswork.',
    trap: 'Choosing an option that is true in real life but not stated (or implied) in the passage.',
    steps: [
      'Read the question and box the key words.',
      'Find the evidence lines in the passage.',
      'Prove each option against that evidence before choosing.',
    ],
  },
  'english:vocabulary': {
    attention:
      'Read the whole sentence with the word in place, then substitute each option. The best answer keeps both the meaning and the tone of the sentence.',
    trap: 'Picking a synonym that fits the topic but not the sentence — "quiet" and "library" go together, but quiet does not mean library.',
    steps: [
      'Re-read the sentence around the tricky word.',
      'Cover the options and think of your own replacement.',
      'Test each option in the sentence and keep the best fit.',
    ],
  },
  'english:word_classes': {
    attention:
      'Noun = person, place, thing or idea. Verb = action or being. Adjective describes a noun. Adverb supercharges a verb (often -ly). Preposition shows position/time (in, on, under). Pronoun replaces a noun (he, she, it, they).',
    trap: 'Calling every -ly word an adverb — friendly and lonely are adjectives!',
    steps: [
      'Cover the options and name the word’s job yourself.',
      'Test it: can you put "the" in front (noun) or "very" before it (adjective)?',
      'Check the option matches the job, not just the ending.',
    ],
  },
  'english:spelling': {
    attention:
      'Hunt for the tricky part: double letters (accommodation, embarrassing), soft c/c (receive, calendar), and ending rules (-able vs -ible).',
    trap: 'Trusting how a word sounds — "definitely" sounds like "definately", but the correct spelling ends -itely.',
    steps: [
      'Say the word slowly and notice the stressed syllable.',
      'Look for double letters or silent letters.',
      'Read the full sentence with each spelling before choosing.',
    ],
  },
  'english:punctuation': {
    attention:
      'Check the five big marks: full stop, capital letter, apostrophe (possession or contraction), comma (lists and clauses), and inverted commas for speech.',
    trap: 'Apostrophes for plurals — "the dog’s bones" is possession, but "three dog’s" should be "three dogs".',
    steps: [
      'Read the sentence aloud and listen for pauses and ends.',
      'Check capitals at the start and after speech.',
      'Test each option’s punctuation mark one by one.',
    ],
  },
  'english:best_word': {
    attention:
      'The "best word" fits the meaning AND the register of the sentence. Read it twice: once for sense, once for sound.',
    trap: 'Choosing a word with the right meaning but wrong grammar — "The rain was heavy" works, but "The rain was strongly" does not.',
    steps: [
      'Read the sentence with the gap and predict the meaning.',
      'Rule out options that break the grammar.',
      'Read the finished sentence aloud to hear the best fit.',
    ],
  },
}

export function getTopicStrategy(subject: Subject, topic: string): TopicStrategy {
  return TOPIC_STRATEGIES[`${subject}:${topic}`] ?? SUBJECT_FALLBACK[subject]
}
