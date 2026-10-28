export type Story = {
  title: string;
  sentences: [string, string, string, string];
  blanks: { sentence: number; answer: string; options: string[]; kind?: "person" | "place" | "weekday" }[];
  personal?: { weekday: string; place: string; person: string; activity: string };
};

export const stories: Story[] = [
  {
    title: "Morning Chai",
    sentences: [
      "Priya boiled fresh tea with ginger and cardamom.",
      "She poured the hot chai into two clay cups.",
      "Her grandfather sat on the porch drinking tea.",
      "They enjoyed the cool morning breeze together.",
    ],
    blanks: [
      { sentence: 0, answer: "ginger", options: ["ginger", "sugar", "mint"] },
      { sentence: 1, answer: "cups", options: ["glasses", "cups", "bowls"] },
      { sentence: 2, answer: "porch", options: ["roof", "porch", "garden"] },
    ],
  },
  {
    title: "Fresh Vegetables",
    sentences: [
      "Ramesh took a cloth bag to the busy market.",
      "He picked fresh spinach and green chillies.",
      "The vendor weighed the vegetables on his scale.",
      "Ramesh paid with coins and walked home.",
    ],
    blanks: [
      { sentence: 0, answer: "bag", options: ["bag", "box", "tray"] },
      { sentence: 1, answer: "spinach", options: ["spinach", "mango", "rice"] },
      { sentence: 2, answer: "scale", options: ["table", "scale", "shelf"] },
    ],
  },
  {
    title: "Temple Visit",
    sentences: [
      "Sunita walked to the temple near the river.",
      "She bought a garland of yellow marigolds.",
      "She offered sweet prasadam at the altar.",
      "Sunita rang the brass bell before leaving.",
    ],
    blanks: [
      { sentence: 0, answer: "river", options: ["lake", "river", "well"] },
      { sentence: 1, answer: "marigolds", options: ["roses", "marigolds", "lilies"] },
      { sentence: 3, answer: "bell", options: ["drum", "bell", "whistle"] },
    ],
  },
  {
    title: "Cooking Dosa",
    sentences: [
      "Ankit spread batter on a hot iron tawa.",
      "He drizzled golden ghee around the thin pancake.",
      "He served the crisp dosa with coconut chutney.",
      "His sister finished her plate in five minutes.",
    ],
    blanks: [
      { sentence: 0, answer: "tawa", options: ["pan", "tawa", "pot"] },
      { sentence: 1, answer: "ghee", options: ["milk", "ghee", "water"] },
      { sentence: 2, answer: "chutney", options: ["pickle", "chutney", "soup"] },
    ],
  },
  {
    title: "Diwali Lights",
    sentences: [
      "Lakshmi hung bright orange marigolds on the door.",
      "She drew a colorful rangoli on the floor.",
      "She lit small clay diyas along the balcony.",
      "The house sparkled brightly in the evening.",
    ],
    blanks: [
      { sentence: 0, answer: "marigolds", options: ["ribbons", "marigolds", "leaves"] },
      { sentence: 1, answer: "rangoli", options: ["picture", "rangoli", "poster"] },
      { sentence: 2, answer: "diyas", options: ["candles", "diyas", "lamps"] },
    ],
  },
  {
    title: "Bus Journey",
    sentences: [
      "Rajesh bought a ticket from the bus conductor.",
      "He found a window seat near the front.",
      "The conductor blew his whistle to start moving.",
      "The bus traveled past green paddy fields.",
    ],
    blanks: [
      { sentence: 0, answer: "conductor", options: ["driver", "conductor", "guard"] },
      { sentence: 2, answer: "whistle", options: ["horn", "whistle", "bell"] },
      { sentence: 3, answer: "fields", options: ["fields", "hills", "shops"] },
    ],
  },
  {
    title: "Family Dinner",
    sentences: [
      "Meena prepared spicy curry for her family.",
      "She baked warm flat rotis on the stove.",
      "Everyone sat together on the dining mat.",
      "Meena served sweet rice pudding for dessert.",
    ],
    blanks: [
      { sentence: 0, answer: "curry", options: ["soup", "curry", "rice"] },
      { sentence: 1, answer: "rotis", options: ["rotis", "breads", "cakes"] },
      { sentence: 3, answer: "pudding", options: ["fruit", "pudding", "ice"] },
    ],
  },
  {
    title: "Sunday Market",
    sentences: [
      "Suresh bought sweet mangos at the fruit stall.",
      "He picked a bunch of ripe yellow bananas.",
      "The shopkeeper packed everything in a jute bag.",
      "Suresh carried the heavy bundle home carefully.",
    ],
    blanks: [
      { sentence: 0, answer: "mangos", options: ["mangos", "apples", "grapes"] },
      { sentence: 1, answer: "bananas", options: ["lemons", "bananas", "melons"] },
      { sentence: 3, answer: "bundle", options: ["box", "bundle", "basket"] },
    ],
  },
  {
    title: "Afternoon Rest",
    sentences: [
      "Geeta closed the wooden shutters against the heat.",
      "She laid a cotton sheet on the woven cot.",
      "She rested under the slow ceiling fan.",
      "She woke up refreshed after an hour.",
    ],
    blanks: [
      { sentence: 0, answer: "shutters", options: ["doors", "shutters", "blinds"] },
      { sentence: 1, answer: "sheet", options: ["quilt", "sheet", "mat"] },
      { sentence: 2, answer: "fan", options: ["cooler", "fan", "breeze"] },
    ],
  },
  {
    title: "Making Samosas",
    sentences: [
      "Vikram kneaded dough for savory potato snacks.",
      "He filled the crusts with spiced peas and potatoes.",
      "He fried the samosas in hot oil until golden.",
      "His friends ate them with sweet tamarind sauce.",
    ],
    blanks: [
      { sentence: 0, answer: "dough", options: ["dough", "rice", "flour"] },
      { sentence: 1, answer: "peas", options: ["beans", "peas", "corn"] },
      { sentence: 3, answer: "tamarind", options: ["mint", "tamarind", "tomato"] },
    ],
  },
  {
    title: "Visiting Aunt",
    sentences: [
      "Kavita boarded an autorickshaw to visit her aunt.",
      "Her aunt greeted her warmly with a glass of lassi.",
      "They talked about family news for two hours.",
      "Kavita gave her aunt a box of sweet pedas.",
    ],
    blanks: [
      { sentence: 0, answer: "autorickshaw", options: ["taxi", "autorickshaw", "train"] },
      { sentence: 1, answer: "lassi", options: ["juice", "lassi", "milk"] },
      { sentence: 3, answer: "pedas", options: ["pedas", "fruits", "cakes"] },
    ],
  },
  {
    title: "Evening Walk",
    sentences: [
      "Mohan walked along the peaceful neighborhood park.",
      "He met his old neighbor sitting on a bench.",
      "They watched children playing with a rubber ball.",
      "Mohan returned home as the streetlights turned on.",
    ],
    blanks: [
      { sentence: 0, answer: "park", options: ["road", "park", "street"] },
      { sentence: 1, answer: "neighbor", options: ["neighbor", "brother", "cousin"] },
      { sentence: 2, answer: "ball", options: ["kite", "ball", "hoop"] },
    ],
  },
  {
    title: "Pongal Harvest",
    sentences: [
      "Aarti woke up early on the festival morning.",
      "She boiled fresh milk and rice in a new pot.",
      "The sweet dish bubbled over as everyone cheered.",
      "She shared the harvest meal with all neighbors.",
    ],
    blanks: [
      { sentence: 0, answer: "festival", options: ["festival", "birthday", "weekend"] },
      { sentence: 1, answer: "pot", options: ["bowl", "pot", "bucket"] },
      { sentence: 3, answer: "neighbors", options: ["strangers", "neighbors", "friends"] },
    ],
  },
  {
    title: "Tailor Shop",
    sentences: [
      "Deepa took green silk fabric to the local tailor.",
      "The tailor measured her with a flexible tape.",
      "He promised to stitch her blouse by Thursday.",
      "Deepa left a small cash advance on the counter.",
    ],
    blanks: [
      { sentence: 0, answer: "fabric", options: ["paper", "fabric", "thread"] },
      { sentence: 1, answer: "tape", options: ["ruler", "tape", "string"] },
      { sentence: 2, answer: "blouse", options: ["dress", "blouse", "shirt"] },
    ],
  },
  {
    title: "Train Journey",
    sentences: [
      "Sanjay waited at the platform for the express train.",
      "He bought a newspaper from the station stall.",
      "The train arrived with a loud iron rumble.",
      "Sanjay boarded quickly and stored his suitcase.",
    ],
    blanks: [
      { sentence: 0, answer: "platform", options: ["gate", "platform", "street"] },
      { sentence: 1, answer: "newspaper", options: ["magazine", "newspaper", "book"] },
      { sentence: 3, answer: "suitcase", options: ["bag", "suitcase", "box"] },
    ],
  },
];

// Validation check at module load time
stories.forEach((story, sIdx) => {
  story.blanks.forEach((b, bIdx) => {
    const sentenceText = story.sentences[b.sentence];
    const regex = new RegExp(`\\b${b.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (!regex.test(sentenceText)) {
      throw new Error(`Story ${sIdx} (${story.title}): Blank answer "${b.answer}" not found as a whole word in sentence: "${sentenceText}"`);
    }
    const count = b.options.filter((opt) => opt.toLowerCase() === b.answer.toLowerCase()).length;
    if (count !== 1) {
      throw new Error(`Story ${sIdx} (${story.title}): Blank answer "${b.answer}" must appear exactly once in options`);
    }
  });
});

export const storyBuilderConfig = { level: 1, sentences: 4, blanksPerStory: 3, storiesPerSession: 2, totalBlanks: 6 } as const;
