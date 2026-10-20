import type { Difficulty, Passage, Question } from '../db/schemas'
import { buildQuestion, difficultyAt, makeQuestionId } from './common'
import { createRng, hashSeed } from './rng'

const BASE_SEED = 20261020

type EnglishTopic = 'comprehension' | 'vocabulary' | 'word_classes' | 'spelling' | 'punctuation' | 'best_word'

interface QuestionSpec {
  topic: EnglishTopic
  stem: string
  options: string[]
  correctIndex?: number
  explanation: string
  timeTargetSeconds: number
}

interface PassageSpec {
  title: string
  content: string
  questions: QuestionSpec[]
}

function makePassageId(nonce: string, index: number): string {
  const prefix = nonce === '' ? '' : `${nonce}-`
  return `${prefix}p-english-${String(index + 1).padStart(2, '0')}`
}

const PASSAGE_SPECS: readonly PassageSpec[] = [
  {
    title: 'The Last Light at Start Point',
    content: `Nobody in the village could remember a storm quite like it. The wind arrived just after tea, rattling the windows of the harbour café and turning the sea the colour of dishwater. Grandad said it was the kind of night the lifeboat crew trained for in the dark, so they would not panic when it came.

Maya was helping him stack chairs when the power went out. The café went black, the fridge fell silent, and somewhere down the hill the harbour light blinked twice and went dark too. "That light guides the boats home," Grandad said, pulling on his oilskin. "If it stays out, the trawlers cannot find the channel."

Maya wanted to help, but the rain came sideways and the road down to the harbour was a river. So she did the only thing she could think of: she climbed to the top of the church tower with a torch, unlocked the old emergency lamp, and turned it towards the sea. It was not bright. It was not clever. But it was a light, and a light is a promise.

Two hours later the power returned, and the harbour light roared back to life. Below, the trawlers were already safe in the harbour, their crews waving up at the small figure in the tower window.

The next day the harbour master came to the café with a letter. "We saw your light," he said. "It was the wrong colour and the wrong shape, but it was there. That was enough."`,
    questions: [
      {
        topic: 'comprehension',
        stem: 'Why did Grandad say the lifeboat crew trained in the dark?',
        options: [
          'So they would not panic when a real storm came',
          'So they could see the stars more clearly',
          'Because the training room had no windows',
          'To save money on electric light',
          'Because the lifeboat only sailed at night',
        ],
        correctIndex: 0,
        explanation: 'Grandad says it was "the kind of night the lifeboat crew trained for in the dark, so they would not panic when it came."',
        timeTargetSeconds: 45,
      },
      {
        topic: 'comprehension',
        stem: 'What happened to the harbour light during the storm?',
        options: [
          'It blinked twice and went out',
          'It shone more brightly than usual',
          'It changed colour to red',
          'It was broken by a falling tree',
          'It was switched off by the harbour master',
        ],
        correctIndex: 0,
        explanation: 'The text says "somewhere down the hill the harbour light blinked twice and went dark too."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'Why could the trawlers not find the channel without the light?',
        options: [
          'The light showed them the safe route into the harbour',
          'The wind pushed them off course',
          'Their engines had stopped working',
          'The channel had been filled in',
          'They were waiting for permission to dock',
        ],
        correctIndex: 0,
        explanation: 'Grandad explains: "That light guides the boats home. If it stays out, the trawlers cannot find the channel."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'Why was it difficult for Maya to walk down to the harbour?',
        options: [
          'The rain blew sideways and the road had flooded',
          'The road was blocked by fallen trees',
          'She was not allowed out after dark',
          'The hill was too steep for her',
          'She had hurt her ankle earlier that day',
        ],
        correctIndex: 0,
        explanation: '"The rain came sideways and the road down to the harbour was a river."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'Why did the harbour master come to the café the next day?',
        options: [
          'To deliver a letter about Maya\'s light',
          'To complain about the wrong kind of light',
          'To ask Grandad for more chairs',
          'To warn the village about another storm',
          'To sell lifeboat tickets',
        ],
        correctIndex: 0,
        explanation: '"The next day the harbour master came to the café with a letter" about the light Maya had shown.',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'What does the story suggest about helping other people?',
        options: [
          'An imperfect effort can still make a real difference',
          'Only trained crews should try to help',
          'Torches are not as useful as lighthouses',
          'Storms are more dangerous at night',
          'Villages should buy brighter lamps',
        ],
        correctIndex: 0,
        explanation: 'Maya\'s light "was the wrong colour and the wrong shape, but it was there. That was enough." The story shows that trying your best still matters.',
        timeTargetSeconds: 50,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "rattling" mean in "rattling the windows"?',
        options: [
          'Shaking with a loud knocking sound',
          'Covering the windows with wooden boards',
          'Cleaning the windows very quickly',
          'Measuring the windows carefully',
          'Decorating the windows with lights',
        ],
        correctIndex: 0,
        explanation: 'In the storm the wind shakes the windows noisily, like something knocking against them.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "oilskin" suggest about Grandad\'s coat?',
        options: [
          'It keeps out the rain',
          'It is made of wool',
          'It is very expensive',
          'It has many pockets',
          'It is bright orange',
        ],
        correctIndex: 0,
        explanation: 'An oilskin is a waterproof coat worn by people who work at sea in bad weather.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "channel" mean in this passage?',
        options: [
          'The safe marked route into the harbour',
          'A television station',
          'A wooden dock for tying up boats',
          'A type of fishing net',
          'A bucket on the lifeboat',
        ],
        correctIndex: 0,
        explanation: 'Here the channel is the safe route through the water that the trawlers follow to get into harbour.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'word_classes',
        stem: 'In "The wind arrived just after tea", which word is a verb?',
        options: ['arrived', 'wind', 'just', 'after', 'tea'],
        correctIndex: 0,
        explanation: '"Arrived" tells us what the wind did, so it is the verb.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "Two hours later the power returned", which word is an adverb?',
        options: ['later', 'two', 'hours', 'power', 'returned'],
        correctIndex: 0,
        explanation: '"Later" tells us when something happened, so it is an adverb.',
        timeTargetSeconds: 25,
      },
    ],
  },
  {
    title: 'The Secret Language of Bees',
    content: `When a honeybee finds a good patch of flowers, she does not simply head home and keep the news to herself. She performs a dance on the vertical face of the hive, and the dance tells her sisters exactly where to go.

The dance is shaped like a figure of eight. The angle of the straight run in the middle shows the direction of the flowers relative to the sun. If the bee runs straight up, the flowers are towards the sun. If she runs at an angle to the right, the flowers lie that many degrees away from it.

The length of the waggling run tells the distance. A longer waggling means a longer flight. Other bees crowd close, feeling the vibrations with their antennae, and then fly out along the route the dancer described.

Scientists call it the waggle dance, and it was first decoded by a researcher called Karl von Frisch in the 1940s. He showed that bees do not simply wander randomly; they communicate with a precision that rivals any map.

Yet this remarkable system depends on one thing: a sun the bees can trust. On cloudy days they navigate by polarised light invisible to human eyes, and inside a dark hive they keep dancing as though the sun still shines.

Flowers, it seems, are not the only thing worth dancing about.`,
    questions: [
      {
        topic: 'comprehension',
        stem: 'What does the angle of the straight run tell the other bees?',
        options: [
          'The direction of the flowers from the sun',
          'The colour of the flowers',
          'How sweet the nectar is',
          'How many bees should go',
          'Whether the flowers are open',
        ],
        correctIndex: 0,
        explanation: '"The angle of the straight run in the middle shows the direction of the flowers relative to the sun."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'What does a longer waggling run tell the bees?',
        options: [
          'The flowers are further away',
          'The flowers are closer',
          'The flowers are dangerous',
          'The dancing bee is tired',
          'The sun has moved',
        ],
        correctIndex: 0,
        explanation: '"The length of the waggling run tells the distance. A longer waggling means a longer flight."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'How do the other bees receive the message?',
        options: [
          'They feel the vibrations with their antennae',
          'They watch the dancer\'s wings',
          'They listen to a buzzing sound',
          'They read marks on the hive',
          'They follow the dancer outside',
        ],
        correctIndex: 0,
        explanation: '"Other bees crowd close, feeling the vibrations with their antennae."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'Who decoded the waggle dance, and when?',
        options: [
          'Karl von Frisch in the 1940s',
          'Charles Darwin in the 1800s',
          'Marie Curie in the 1920s',
          'Karl von Frisch in the 1990s',
          'A farmer in the 1700s',
        ],
        correctIndex: 0,
        explanation: 'The text says it "was first decoded by a researcher called Karl von Frisch in the 1940s."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'How do bees navigate on cloudy days?',
        options: [
          'By polarised light humans cannot see',
          'By following the river home',
          'By listening to the queen bee',
          'By smelling the flowers from far away',
          'They stay inside until it clears',
        ],
        correctIndex: 0,
        explanation: '"On cloudy days they navigate by polarised light invisible to human eyes."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'Why does the writer end with "Flowers, it seems, are not the only thing worth dancing about"?',
        options: [
          'To suggest the dance itself is as remarkable as the flowers',
          'To say that bees prefer dancing to flowers',
          'To explain that bees only dance when it rains',
          'To criticise scientists who study bees',
          'To show that flowers are disappearing',
        ],
        correctIndex: 0,
        explanation: 'The closing line playfully points out that the bees\' communication is wonderful in its own right, not just the flowers they visit.',
        timeTargetSeconds: 50,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "performs" mean in "she performs a dance"?',
        options: [
          'Carries out or does something',
          'Watches something carefully',
          'Paints a picture of something',
          'Breaks something by accident',
          'Hides something from view',
        ],
        correctIndex: 0,
        explanation: 'To perform an action means to carry it out.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "decoded" mean?',
        options: [
          'Worked out the meaning of something hidden',
          'Copied something exactly',
          'Destroyed something completely',
          'Measured something precisely',
          'Painted something brightly',
        ],
        correctIndex: 0,
        explanation: 'Von Frisch worked out what the dance meant, in the same way you might break a secret code.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "rivals" mean in "rivals any map"?',
        options: [
          'Is as good as',
          'Is older than',
          'Is larger than',
          'Is cheaper than',
          'Is simpler than',
        ],
        correctIndex: 0,
        explanation: 'To rival something means to be as good as it.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "She performs a dance on the vertical face of the hive", which word is an adjective?',
        options: ['vertical', 'performs', 'dance', 'face', 'hive'],
        correctIndex: 0,
        explanation: '"Vertical" describes the face, so it is an adjective.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "they navigate by polarised light", which word is a verb?',
        options: ['navigate', 'they', 'by', 'polarised', 'light'],
        correctIndex: 0,
        explanation: '"Navigate" tells us what the bees do, so it is the verb.',
        timeTargetSeconds: 25,
      },
    ],
  },
  {
    title: 'The Clock in the Crypt',
    content: `The old clock in St Mary's crypt had not struck the hour in living memory, but on the morning of the school fair, it struck thirteen.

Fen raised her head from the packing boxes. Thirteen was not a number clocks were supposed to manage. She waited. Nothing. Then, from above the vestry door, came a single chime, thin and dusty, like a cough in an empty room.

She told Mr Adeyemi, the caretaker, who told the vicar, who laughed politely and blamed the wind. But Fen had been in the tower when the wind blew, and the clock had been silent then.

Over the next week she visited the crypt every day after school. The clock's case was oak, carved with grapes and wheat, and behind its door was a mess of brass wheels, each one bigger than her thumb. On the fifth day she found it: a bird, no bigger than a sparrow, wedged between two gears, its feathers worn thin with struggling. Every time someone above stamped across the vestry floor, the bird kicked, the gears turned a fraction, and the clock chimed.

Fen fetched Mr Adeyemi and a pair of gardening gloves. They freed the bird in under a minute, and it shot out of the crypt window into the churchyard rain.

The clock has not struck thirteen since. But sometimes, when the fair is being set up, Fen swears she hears one quiet chime from the tower — not thirteen, just one, as if someone is saying thank you.`,
    questions: [
      {
        topic: 'comprehension',
        stem: 'Why was Fen surprised when the clock struck?',
        options: [
          'Clocks are not supposed to be able to strike thirteen',
          'The clock had been broken for years',
          'Thirteen is a very lucky number',
          'Nobody else heard the strike',
          'The clock usually strikes twice',
        ],
        correctIndex: 0,
        explanation: '"Thirteen was not a number clocks were supposed to manage."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'Why did the vicar not take Fen seriously?',
        options: [
          'He blamed the wind and laughed politely',
          'He was hard of hearing',
          'He did not like children',
          'He had fixed the clock himself',
          'He was busy preparing the fair',
        ],
        correctIndex: 0,
        explanation: 'The vicar "laughed politely and blamed the wind."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'What did Fen remember about the day she was in the tower?',
        options: [
          'The clock stayed silent even in the wind',
          'The clock struck thirteen in the tower',
          'The vicar was in the tower with her',
          'The bird flew out of the tower window',
          'She found a brass wheel in the tower',
        ],
        correctIndex: 0,
        explanation: '"Fen had been in the tower when the wind blew, and the clock had been silent then."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'What was making the clock chime?',
        options: [
          'A small bird kicking between the gears',
          'The wind rattling the vestry door',
          'A loose hammer inside the case',
          'Mr Adeyemi winding the clock',
          'The fair organisers testing bells',
        ],
        correctIndex: 0,
        explanation: 'A bird was "wedged between two gears". Every time someone stamped above, "the bird kicked, the gears turned a fraction, and the clock chimed."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'How did Fen and Mr Adeyemi free the bird?',
        options: [
          'With gardening gloves, in under a minute',
          'By oiling the gears overnight',
          'By taking the whole clock apart',
          'They waited for it to fly out alone',
          'By calling the animal rescue service',
        ],
        correctIndex: 0,
        explanation: '"Fen fetched Mr Adeyemi and a pair of gardening gloves. They freed the bird in under a minute."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'What does the single quiet chime at the end suggest?',
        options: [
          'The bird still remembers being rescued',
          'The clock is broken again',
          'The fair has started early',
          'Fen imagined the whole story',
          'Mr Adeyemi is knocking on the door',
        ],
        correctIndex: 0,
        explanation: 'The one chime "as if someone is saying thank you" reads like a gentle message from the freed bird.',
        timeTargetSeconds: 50,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "wedged" mean?',
        options: [
          'Stuck tightly between two things',
          'Painted a bright colour',
          'Cut into small pieces',
          'Weighed down with stones',
          'Wrapped in soft cloth',
        ],
        correctIndex: 0,
        explanation: 'The bird was jammed fast between two gears, with no room to move.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "struggling" mean?',
        options: [
          'Fighting hard to get free',
          'Sleeping very soundly',
          'Singing very loudly',
          'Growing very quickly',
          'Eating very greedily',
        ],
        correctIndex: 0,
        explanation: 'The bird\'s feathers were worn thin by fighting to escape from the gears.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "swears" mean in "Fen swears she hears"?',
        options: [
          'Insists firmly that something is true',
          'Says something rude',
          'Whispers very quietly',
          'Shouts very angrily',
          'Asks a question',
        ],
        correctIndex: 0,
        explanation: 'Here "swears" means Fen insists very firmly that the chime is real.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'word_classes',
        stem: 'In "The old clock had not struck the hour in living memory", which word is a verb?',
        options: ['struck', 'old', 'clock', 'hour', 'living'],
        correctIndex: 0,
        explanation: '"Struck" tells us what the clock had not done, so it is the verb.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "the bird kicked, the gears turned a fraction", which word is a noun?',
        options: ['gears', 'kicked', 'the', 'turned', 'a'],
        correctIndex: 0,
        explanation: '"Gears" names a thing inside the clock, so it is a noun.',
        timeTargetSeconds: 25,
      },
    ],
  },
  {
    title: 'The River That Came Back',
    content: `For forty years, the River Evenlode flowed mostly out of sight. Where it should have tumbled through the valley, a dual carriageway hummed instead, and the water ran in a concrete pipe beneath it, unseen and unloved.

Then, in 2019, the council made an unusual decision: they would bring the river back.

Engineers lifted the road, moved thousands of tonnes of gravel, and re-dug a channel that followed the river's old course as closely as survey maps allowed. Freshwater shrimps were moved to safety in buckets. Willow cuttings were pushed into the banks to hold the soil while roots took hold.

Within a year, the results were unmistakable. Kingfishers were seen on the new banks. Mayflies drifted over the shallows. Children from the primary school counted eleven species of water insect in a single net sweep — more than the local nature reserve managed in the same week.

Not everyone was convinced at first. Nearby shopkeepers worried about months of diggers and diversions. But the coffee shop at the top of the hill now sells a "Kingfisher Latte", and the queue in summer stretches out of the door.

The river, it turns out, had not forgotten its way home. It only needed someone to clear the road.`,
    questions: [
      {
        topic: 'comprehension',
        stem: 'Where had the River Evenlode been flowing for forty years?',
        options: [
          'In a concrete pipe under the road',
          'Through a tunnel under the hill',
          'Beneath the primary school',
          'In a lake near the valley',
          'Underground in a cave system',
        ],
        correctIndex: 0,
        explanation: '"The water ran in a concrete pipe beneath it, unseen and unloved."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'What did the council decide to do in 2019?',
        options: [
          'Lift the road and re-dig the river\'s old course',
          'Build a new dual carriageway',
          'Move the river further from the valley',
          'Open a brand new nature reserve',
          'Drain the river permanently',
        ],
        correctIndex: 0,
        explanation: 'They decided to "bring the river back" by lifting the road and re-dug a channel along the old course.',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'Why were willow cuttings pushed into the banks?',
        options: [
          'To hold the soil while roots took hold',
          'To provide food for the shrimps',
          'To mark the boundary of the reserve',
          'To attract kingfishers to nest',
          'To stop children falling in',
        ],
        correctIndex: 0,
        explanation: '"Willow cuttings were pushed into the banks to hold the soil while roots took hold."',
        timeTargetSeconds: 35,
      },
      {
        topic: 'comprehension',
        stem: 'Which of these returned to the new channel within a year?',
        options: [
          'Kingfishers and mayflies',
          'Salmon and otters',
          'Ducks and geese only',
          'No animals at all',
          'Crabs and small sharks',
        ],
        correctIndex: 0,
        explanation: '"Kingfishers were seen on the new banks. Mayflies drifted over the shallows." Crabs and sharks live in the sea, not in a river.',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'How can you tell the project became popular nearby?',
        options: [
          'The coffee shop sells a Kingfisher Latte to long queues',
          'The council won a national award',
          'The road was closed for ever',
          'The school moved closer to the river',
          'The shopkeepers all moved away',
        ],
        correctIndex: 0,
        explanation: 'The coffee shop "now sells a \'Kingfisher Latte\', and the queue in summer stretches out of the door."',
        timeTargetSeconds: 40,
      },
      {
        topic: 'comprehension',
        stem: 'What does the last line, "It only needed someone to clear the road", suggest?',
        options: [
          'The river had always remembered its old course',
          'The river was blocked by rubbish',
          'Roads should never have been built',
          'The council acted far too late',
          'Rivers cannot find their own way',
        ],
        correctIndex: 0,
        explanation: 'The closing line means the river never forgot its route; people only had to remove the obstacle on top of it.',
        timeTargetSeconds: 50,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "unseen and unloved" suggest about the water in the pipe?',
        options: [
          'Nobody noticed or cared about it',
          'It was dangerous to drink',
          'It was very clean and clear',
          'It was full of fish',
          'It moved very quickly',
        ],
        correctIndex: 0,
        explanation: '"Unseen" means nobody noticed it, and "unloved" means nobody cared about it.',
        timeTargetSeconds: 30,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "unmistakeable" mean?',
        options: [
          'Impossible to doubt or mistake',
          'Easy to forget',
          'Dangerous to approach',
          'Expensive to repair',
          'Slow to discover',
        ],
        correctIndex: 0,
        explanation: 'The results were so clear that nobody could doubt them.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'vocabulary',
        stem: 'What does "convinced" mean in "Not everyone was convinced"?',
        options: [
          'Sure that something is right',
          'Tired from working hard',
          'Frightened of change',
          'Asked a difficult question',
          'Paid for something',
        ],
        correctIndex: 0,
        explanation: 'To convince someone is to make them sure that something is right.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "Children from the primary school counted eleven species", which word is an adjective?',
        options: ['primary', 'children', 'from', 'counted', 'eleven'],
        correctIndex: 0,
        explanation: '"Primary" describes which school, so it is an adjective.',
        timeTargetSeconds: 25,
      },
      {
        topic: 'word_classes',
        stem: 'In "the queue in summer stretches out of the door", which word is a verb?',
        options: ['stretches', 'queue', 'summer', 'out', 'door'],
        correctIndex: 0,
        explanation: '"Stretches" tells us what the queue does, so it is the verb.',
        timeTargetSeconds: 25,
      },
    ],
  },
]

const STANDALONE_SPECS: readonly QuestionSpec[] = [
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['separate', 'seperate', 'separete', 'sepparate', 'seperrate'],
    correctIndex: 0,
    explanation: 'Separate is spelled sep-a-rate. A helpful trick: there is "a rat" in sep-a-rate.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['necessary', 'neccessary', 'necesary', 'necassary', 'neccesary'],
    correctIndex: 0,
    explanation: 'Necessary has one c and two s letters: nec-es-sary.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['beginning', 'begining', 'beggining', 'beginig', 'beginninng'],
    correctIndex: 0,
    explanation: 'Beginning doubles the n in the middle and ends -ing.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['receive', 'recieve', 'receeve', 'reecieve', 'receiv'],
    correctIndex: 0,
    explanation: 'Receive follows the rule "i before e except after c".',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['believe', 'beleive', 'belive', 'beleave', 'bilieve'],
    correctIndex: 0,
    explanation: 'Believe follows "i before e except after c".',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['friend', 'freind', 'frend', 'freend', 'friemd'],
    correctIndex: 0,
    explanation: 'Friend has the letters i and e in that order: fr-i-end.',
    timeTargetSeconds: 15,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['sentence', 'sentance', 'sence', 'sentense', 'sentanse'],
    correctIndex: 0,
    explanation: 'Sentence ends -ence, like fence and dense.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['special', 'spechial', 'speshial', 'speciall', 'sepcial'],
    correctIndex: 0,
    explanation: 'Special has a c before the -ial ending: spe-c-ial.',
    timeTargetSeconds: 15,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['different', 'diferent', 'differant', 'diffrent', 'diffferent'],
    correctIndex: 0,
    explanation: 'Different has two f letters and ends -ent.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['important', 'importent', 'imporant', 'impottant', 'importannt'],
    correctIndex: 0,
    explanation: 'Important ends -ant, like elephant and distant.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['favourite', 'favorit', 'favoritte', 'favrite', 'favorite'],
    correctIndex: 0,
    explanation: 'In British English favourite keeps the u: fa-vour-ite.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['vegetable', 'vegtable', 'vegerable', 'vegatable', 'vedgetable'],
    correctIndex: 0,
    explanation: 'Vegetable keeps its middle letters: veg-e-ta-ble.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['temperature', 'temprature', 'temperiture', 'tempiture', 'temerature'],
    correctIndex: 0,
    explanation: 'Temperature keeps the e after the r: tempera-ture.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['occasion', 'ocassion', 'ocasion', 'occasoin', 'occassion'],
    correctIndex: 0,
    explanation: 'Occasion has two c letters and one s: oc-ca-sion.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'spelling',
    stem: 'Which word is spelled correctly?',
    options: ['length', 'lenth', 'legnth', 'lenght', 'lenngth'],
    correctIndex: 0,
    explanation: 'Length keeps the g before th: leng-th.',
    timeTargetSeconds: 15,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      '"Where are you going?" asked Sam.',
      '"Where are you going" asked Sam.',
      'Where are you going? asked Sam.',
      '"Where are you going?" Sam asked',
      '"Where are you going?" asked sam.',
    ],
    correctIndex: 0,
    explanation: 'Direct speech needs quotation marks, a comma before the reporting clause, a capital letter for the name, and a full stop at the end.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'My brother, who is six, still sleeps with a night light.',
      'My brother who is six still sleeps with a night light.',
      'My brother who is six, still sleeps with a night light.',
      'My brother, who is six still sleeps with a night light.',
      'My brother, who is six. Still sleeps with a night light.',
    ],
    correctIndex: 0,
    explanation: 'The extra detail "who is six" needs a comma before and after it.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      "We're going to the park, the library and the swimming pool.",
      'Were going to the park the library and the swimming pool.',
      "We're going to the park the library, and the swimming pool.",
      "Were going to the park, the library and the swimming pool.",
      "We're going to park, the library and the swimming pool.",
    ],
    correctIndex: 0,
    explanation: "The apostrophe in We're shows a missing letter, and commas separate the items in the list.",
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      "It's raining again, so we stayed indoors.",
      'Its raining again, so we stayed indoors.',
      "It's raining again so we stayed indoors.",
      "Its' raining again, so we stayed indoors.",
      "It's raining again, so we stayed indoors,",
    ],
    correctIndex: 0,
    explanation: "It's means 'it is'. The comma joins the two parts joined by 'so', and the sentence ends with a full stop.",
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      "The dog's bowl was empty.",
      'The dogs bowl was empty.',
      "The dogs' bowl was empty.",
      "The dog's bowl, was empty.",
      'The dog s bowl was empty.',
    ],
    correctIndex: 0,
    explanation: "The bowl belongs to one dog, so the apostrophe goes before the s.",
    timeTargetSeconds: 30,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      '"Stop!" yelled Mrs Chen.',
      '"Stop!" Yelled Mrs Chen.',
      '"Stop," yelled Mrs Chen!',
      'Stop!" yelled Mrs Chen.',
      '"Stop!" yelled mrs chen.',
    ],
    correctIndex: 0,
    explanation: 'The exclamation mark goes inside the quotation marks, the reporting verb stays lowercase, and names keep their capitals.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'I bought apples, pears and bananas.',
      'I bought apples pears and bananas.',
      'I bought, apples, pears and bananas.',
      'I bought apples, pears, and, bananas.',
      'I bought apples; pears and bananas.',
    ],
    correctIndex: 0,
    explanation: 'Commas separate the items in a list of three. A semicolon is too strong for a simple list.',
    timeTargetSeconds: 30,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'After the storm, the sky cleared.',
      'After the storm the sky cleared.',
      'After, the storm, the sky cleared.',
      'After the storm, the sky, cleared.',
      'after the storm, the sky cleared.',
    ],
    correctIndex: 0,
    explanation: 'A fronted adverbial at the start of the sentence needs a comma after it, and sentences start with a capital letter.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      "The children's coats were soaked.",
      'The childrens coats were soaked.',
      "The childrens' coats were soaked.",
      "The children's coats, were soaked.",
      "The childrens's coats were soaked.",
    ],
    correctIndex: 0,
    explanation: "Children is already plural, so the possessive is children's — no s after the apostrophe.",
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'Dad asked, "Have you finished your homework?"',
      'Dad asked "Have you finished your homework?"',
      'Dad asked, "Have you finished your homework".',
      'Dad asked, "Have you finished you\'re homework?"',
      'Dad Asked, "Have you finished your homework?"',
    ],
    correctIndex: 0,
    explanation: 'There is a comma after "asked", the question mark sits inside the quotation marks, and "your" shows belonging.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      "She couldn't find her shoes.",
      "She could'nt find her shoes.",
      'She couldnt find her shoes.',
      "She couldn,t find her shoes.",
      "She couldn't find her shoes,",
    ],
    correctIndex: 0,
    explanation: "The apostrophe in couldn't replaces the o in could not, and the sentence ends with a full stop.",
    timeTargetSeconds: 30,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'Although it rained, we played outside.',
      'Although it rained we played outside.',
      'Although, it rained, we played outside.',
      'Although it rained, we played, outside.',
      'although it rained, we played outside.',
    ],
    correctIndex: 0,
    explanation: 'A sentence starting with "Although" needs a comma after the opening clause, and a capital letter to begin.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'My favourite colours are blue and green.',
      'My favourite colours are blue and, green.',
      'My favourite colours, are blue and green.',
      'My favourite colours are blue; and green.',
      'My favourite colours are blue & green.',
    ],
    correctIndex: 0,
    explanation: 'Two items joined by "and" need no comma, and the ampersand & does not belong in careful writing.',
    timeTargetSeconds: 30,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'We spent Easter in Whitby with Aunt Lucy.',
      'we spent Easter in Whitby with Aunt Lucy.',
      'We spent easter in Whitby with Aunt Lucy.',
      'We spent Easter in whitby with Aunt Lucy.',
      'We spent Easter in Whitby with aunt lucy.',
    ],
    correctIndex: 0,
    explanation: 'Days, places and names all begin with capital letters, and so does the first word of a sentence.',
    timeTargetSeconds: 30,
  },
  {
    topic: 'punctuation',
    stem: 'Which sentence is punctuated correctly?',
    options: [
      'The museum is open; the café closes at five.',
      'The museum is open, the café closes at five.',
      'The museum is open; the café closes at five',
      'The museum is open: the café; closes at five.',
      'the museum is open; the café closes at five.',
    ],
    correctIndex: 0,
    explanation: 'Two complete sentences joined by a semicolon need a semicolon, not a comma, and the sentence needs a full stop and a capital letter to start.',
    timeTargetSeconds: 35,
  },
  {
    topic: 'best_word',
    stem: 'Which word means the same as "enormous"?',
    options: ['vast', 'medium', 'tidy', 'narrow', 'square'],
    correctIndex: 0,
    explanation: 'Vast means extremely large, just like enormous.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'best_word',
    stem: 'Which word is the opposite of "ancient"?',
    options: ['modern', 'elderly', 'historical', 'timely', 'aged'],
    correctIndex: 0,
    explanation: 'Ancient means very old, so its opposite is modern — new and current.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'best_word',
    stem: 'Which word means the same as "brave"?',
    options: ['fearless', 'gentle', 'quiet', 'lucky', 'tidy'],
    correctIndex: 0,
    explanation: 'Fearless means not afraid, which is what brave means.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'best_word',
    stem: 'The glass was so ___ that it broke when the cat brushed against it.',
    options: ['fragile', 'sturdy', 'heavy', 'solid', 'thick'],
    correctIndex: 0,
    explanation: 'Fragile means easily broken, which is why the cat broke it so easily.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'best_word',
    stem: 'Which word is the opposite of "scarce"?',
    options: ['common', 'rare', 'precious', 'hidden', 'costly'],
    correctIndex: 0,
    explanation: 'Scarce means there is very little of something, so the opposite is common — there is a lot of it.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'best_word',
    stem: 'The instructions were so ___ that nobody could follow them.',
    options: ['confusing', 'helpful', 'simple', 'brief', 'clear'],
    correctIndex: 0,
    explanation: 'If nobody could follow them, the instructions were confusing — hard to understand.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'best_word',
    stem: 'Which word means the same as "investigate"?',
    options: ['examine', 'ignore', 'celebrate', 'avoid', 'repair'],
    correctIndex: 0,
    explanation: 'To investigate means to examine something carefully to find out about it.',
    timeTargetSeconds: 20,
  },
  {
    topic: 'best_word',
    stem: 'She spoke so ___ that we could hear every word from across the road.',
    options: ['loudly', 'gently', 'quietly', 'slowly', 'softly'],
    correctIndex: 0,
    explanation: 'If everyone across the road could hear her, she must have spoken loudly.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'best_word',
    stem: 'Which word is the opposite of "assemble"?',
    options: ['scatter', 'gather', 'collect', 'build', 'join'],
    correctIndex: 0,
    explanation: 'To assemble means to bring things together, so the opposite is scatter — to throw things apart.',
    timeTargetSeconds: 25,
  },
  {
    topic: 'best_word',
    stem: 'The soup tasted ___, so we added salt and pepper.',
    options: ['bland', 'spicy', 'salty', 'bitter', 'peppery'],
    correctIndex: 0,
    explanation: 'If you add salt and pepper, the soup must have tasted bland — with hardly any flavour.',
    timeTargetSeconds: 25,
  },
]

function difficultyFor(index: number): Difficulty {
  return difficultyAt(index)
}

export interface EnglishQuestionBank {
  passages: Passage[]
  questions: Question[]
}

export function generateEnglishQuestions(nonce: string): EnglishQuestionBank {
  const passages: Passage[] = []
  const questions: Question[] = []
  let runningIndex = 0

  PASSAGE_SPECS.forEach((spec, passageIndex) => {
    const passageId = makePassageId(nonce, passageIndex)
    passages.push({ id: passageId, title: spec.title, content: spec.content })
    spec.questions.forEach((questionSpec) => {
      const rng = createRng(hashSeed(BASE_SEED, 'english', nonce, runningIndex))
      const question = buildQuestion(rng, 'english', makeQuestionId(nonce, 'english', questionSpec.topic, runningIndex), {
        topic: questionSpec.topic,
        difficulty: difficultyFor(runningIndex),
        stem: questionSpec.stem,
        options: questionSpec.options,
        correctIndex: questionSpec.correctIndex ?? 0,
        explanation: questionSpec.explanation,
        timeTargetSeconds: questionSpec.timeTargetSeconds,
        passageId,
      })
      questions.push(question)
      runningIndex += 1
    })
  })

  STANDALONE_SPECS.forEach((questionSpec) => {
    const rng = createRng(hashSeed(BASE_SEED, 'english', nonce, runningIndex))
    const question = buildQuestion(rng, 'english', makeQuestionId(nonce, 'english', questionSpec.topic, runningIndex), {
      topic: questionSpec.topic,
      difficulty: difficultyFor(runningIndex),
      stem: questionSpec.stem,
      options: questionSpec.options,
      correctIndex: questionSpec.correctIndex ?? 0,
      explanation: questionSpec.explanation,
      timeTargetSeconds: questionSpec.timeTargetSeconds,
    })
    questions.push(question)
    runningIndex += 1
  })

  return { passages, questions }
}
