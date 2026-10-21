export interface WritingTask {
  id: string
  title: string
  prompt: string
  targetWords: number
  checklist: readonly string[]
}

export const WRITING_TASKS: readonly WritingTask[] = [
  {
    id: 'bottle',
    title: 'The Message in the Bottle',
    prompt:
      'A message in a bottle washes up on the beach near your school. Write the story of how it got there — and what you would put inside the very next bottle you send out.',
    targetWords: 150,
    checklist: [
      'Every sentence starts with a capital letter',
      'Every sentence ends with a full stop',
      'I used commas to add extra information',
      'I checked my tricky spellings',
    ],
  },
  {
    id: 'allotment',
    title: 'The School Allotment',
    prompt:
      'Your class has been given a strip of land behind the school to grow food. Explain what you would plant, why you chose it, and what could go wrong along the way.',
    targetWords: 150,
    checklist: [
      'Every sentence starts with a capital letter',
      'Every sentence ends with a full stop',
      'I used "because" to explain my reasons',
      'I checked my tricky spellings',
    ],
  },
  {
    id: 'curiosity',
    title: 'Keep the Curiosity Hour',
    prompt:
      'Write a letter to your head teacher explaining why the school should keep the Friday Curiosity Hour. Make your case with clear reasons and a good final sentence.',
    targetWords: 150,
    checklist: [
      'I started the letter properly',
      'Every sentence ends with a full stop',
      'I used paragraphs to organise my ideas',
      'I checked my tricky spellings',
    ],
  },
  {
    id: 'comet',
    title: 'The Night of the Comet',
    prompt:
      'You are the first person in your town to see a comet. Write the story of that night — what you saw, who you told, and what everyone thought had happened.',
    targetWords: 150,
    checklist: [
      'Every sentence starts with a capital letter',
      'Every sentence ends with a full stop',
      'I used time words such as "first", "then" and "finally"',
      'I checked my tricky spellings',
    ],
  },
  {
    id: 'treehouse',
    title: 'The Best Treehouse Ever',
    prompt:
      'Design the best treehouse in the world. Describe it, explain every choice you made, and show how you would build it with the materials you have.',
    targetWords: 150,
    checklist: [
      'Every sentence starts with a capital letter',
      'Every sentence ends with a full stop',
      'I used adjectives to make my description vivid',
      'I checked my tricky spellings',
    ],
  },
  {
    id: 'robot',
    title: 'The Robot on the Beach',
    prompt:
      'A robot washes up on the beach instead of a bottle. Write the story of the day the robot came to school with you.',
    targetWords: 150,
    checklist: [
      'Every sentence starts with a capital letter',
      'Every sentence ends with a full stop',
      'I used speech to bring the story alive',
      'I checked my tricky spellings',
    ],
  },
]

export function countWords(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}
