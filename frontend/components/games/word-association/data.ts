export interface ItemWithEmoji {
  word: string;
  emoji: string;
  synonyms: string[];
  sameCategory?: boolean;
}

export interface AssociationPair {
  id: string;
  category: string;
  cue: { word: string; emoji: string };
  target: ItemWithEmoji;
  hint: string;
  distractors: ItemWithEmoji[];
}

/**
 * 18 strictly unambiguous everyday pairs using standard cross-platform Unicode emojis.
 *
 * Dropped / removed:
 * - diya / matchbox (no standard matchbox emoji exists; flame was confusing)
 * - candle / flame (ambiguous / circular lighting partners)
 * - rice / curry bowl (ambiguous pairings)
 * - cricket bat / ball (baseball emoji was inaccurate for cricket)
 * - idli / sambar, rangoli / doorstep, bangles / wrist, temple / prasad (no standard emoji)
 *
 * Invariant: No distractor in any pair equals any pair's target word.
 */
export const WORD_ASSOCIATION_PAIRS: AssociationPair[] = [
  {
    id: "chai-biscuit",
    category: "food",
    cue: { word: "Cup of tea", emoji: "☕" },
    target: { word: "Biscuit", emoji: "🍪", synonyms: ["biscuit", "cookie", "rusk", "biskut", "chai biscuit", "tea biscuit", "चाय बिस्कुट", "চাহ বিস্কুট"] },
    hint: "Think about what is dipped into hot tea.",
    distractors: [
      { word: "Toast", emoji: "🍞", sameCategory: true, synonyms: ["toast", "bread"] },
      { word: "Samosa", emoji: "🥟", sameCategory: true, synonyms: ["samosa"] },
      { word: "Sweet", emoji: "🍬", sameCategory: true, synonyms: ["sweet", "mithai", "candy"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "lock-key",
    category: "hardware",
    cue: { word: "Lock", emoji: "🔒" },
    target: { word: "Key", emoji: "🔑", synonyms: ["key", "chabi", "lock key", "tala chabi"] },
    hint: "Think about what opens a locked door.",
    distractors: [
      { word: "Chain", emoji: "⛓️", sameCategory: true, synonyms: ["chain", "zanjeer"] },
      { word: "Door", emoji: "🚪", sameCategory: true, synonyms: ["door", "darwaza"] },
      { word: "Hammer", emoji: "🔨", sameCategory: true, synonyms: ["hammer", "hathoda"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
  {
    id: "umbrella-rain",
    category: "weather",
    cue: { word: "Umbrella", emoji: "☂️" },
    target: { word: "Rain", emoji: "🌧️", synonyms: ["rain", "barish", "rain shower", "umbrella rain", "chhatri barish"] },
    hint: "Think about the weather when you open an umbrella.",
    distractors: [
      { word: "Cloud", emoji: "☁️", sameCategory: true, synonyms: ["cloud", "badal"] },
      { word: "Rainbow", emoji: "🌈", sameCategory: true, synonyms: ["rainbow", "indradhanush"] },
      { word: "Snow", emoji: "❄️", sameCategory: true, synonyms: ["snow", "baraf"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["bicycle", "cycle"] },
      { word: "Pencil", emoji: "✏️", sameCategory: false, synonyms: ["pencil", "kalam"] },
    ],
  },
  {
    id: "tawa-roti",
    category: "food",
    cue: { word: "Tawa pan", emoji: "🍳" },
    target: { word: "Roti", emoji: "🫓", synonyms: ["roti", "chapati", "flatbread", "bread", "tawa roti"] },
    hint: "Think about the hot bread puffed up on a tawa pan.",
    distractors: [
      { word: "Banana", emoji: "🍌", sameCategory: true, synonyms: ["banana", "kela"] },
      { word: "Apple", emoji: "🍎", sameCategory: true, synonyms: ["apple", "seb"] },
      { word: "Sweet", emoji: "🍬", sameCategory: true, synonyms: ["sweet", "mithai"] },
      { word: "Umbrella", emoji: "☂️", sameCategory: false, synonyms: ["umbrella", "chhatri"] },
      { word: "Bed", emoji: "🛏️", sameCategory: false, synonyms: ["bed", "bistar"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
    ],
  },
  {
    id: "needle-thread",
    category: "tailoring",
    cue: { word: "Needle", emoji: "🪡" },
    target: { word: "Thread", emoji: "🧵", synonyms: ["thread", "dhaga", "needle thread", "sui dhaga"] },
    hint: "Think about what is passed through the eye of a needle.",
    distractors: [
      { word: "Scissors", emoji: "✂️", sameCategory: true, synonyms: ["scissors", "kainchi"] },
      { word: "Shirt", emoji: "👕", sameCategory: true, synonyms: ["shirt", "kurta"] },
      { word: "Button", emoji: "🔘", sameCategory: true, synonyms: ["button"] },
      { word: "Car", emoji: "🚗", sameCategory: false, synonyms: ["car", "gadi"] },
      { word: "Banana", emoji: "🍌", sameCategory: false, synonyms: ["banana", "kela"] },
      { word: "Moon", emoji: "🌙", sameCategory: false, synonyms: ["moon", "chand"] },
    ],
  },
  {
    id: "train-ticket",
    category: "travel",
    cue: { word: "Train", emoji: "🚆" },
    target: { word: "Ticket", emoji: "🎟️", synonyms: ["ticket", "rail ticket", "pass", "train ticket"] },
    hint: "Think about what you show the ticket collector.",
    distractors: [
      { word: "Luggage", emoji: "🧳", sameCategory: true, synonyms: ["bag", "luggage", "suitcase"] },
      { word: "Station", emoji: "🚉", sameCategory: true, synonyms: ["station", "platform"] },
      { word: "Bus", emoji: "🚌", sameCategory: true, synonyms: ["bus"] },
      { word: "Soap bar", emoji: "🧼", sameCategory: false, synonyms: ["soap", "sabun"] },
      { word: "Comb", emoji: "🪮", sameCategory: false, synonyms: ["comb", "kanghi"] },
      { word: "Camera", emoji: "📷", sameCategory: false, synonyms: ["camera"] },
    ],
  },
  {
    id: "shoes-socks",
    category: "footwear",
    cue: { word: "Shoes", emoji: "👞" },
    target: { word: "Socks", emoji: "🧦", synonyms: ["socks", "moja", "shoes socks", "juta moja"] },
    hint: "Think about what you wear on your feet before your shoes.",
    distractors: [
      { word: "Slippers", emoji: "🩴", sameCategory: true, synonyms: ["slippers", "chappal"] },
      { word: "Pants", emoji: "👖", sameCategory: true, synonyms: ["pants", "trouser"] },
      { word: "Coat", emoji: "🧥", sameCategory: true, synonyms: ["coat", "jacket"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
      { word: "Book", emoji: "📖", sameCategory: false, synonyms: ["book", "kitab"] },
    ],
  },
  {
    id: "pen-paper",
    category: "stationery",
    cue: { word: "Pen", emoji: "🖊️" },
    target: { word: "Paper", emoji: "📄", synonyms: ["paper", "page", "kagas", "notebook", "pen paper", "kalam kagaz"] },
    hint: "Think about what you write upon with a pen.",
    distractors: [
      { word: "Pencil", emoji: "✏️", sameCategory: true, synonyms: ["pencil"] },
      { word: "Book", emoji: "📖", sameCategory: true, synonyms: ["book", "kitab"] },
      { word: "Folder", emoji: "📁", sameCategory: true, synonyms: ["folder", "file"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["cycle", "bicycle"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "flower-garland",
    category: "nature",
    cue: { word: "Flower", emoji: "🌸" },
    target: { word: "Garland", emoji: "💐", synonyms: ["garland", "mala", "bouquet", "haar", "phool mala"] },
    hint: "Think about stringing fresh flowers together.",
    distractors: [
      { word: "Tree", emoji: "🌳", sameCategory: true, synonyms: ["tree", "ped"] },
      { word: "Leaf", emoji: "🍃", sameCategory: true, synonyms: ["leaf", "patta"] },
      { word: "Rose", emoji: "🌹", sameCategory: true, synonyms: ["rose", "gulab"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Door", emoji: "🚪", sameCategory: false, synonyms: ["door", "darwaza"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
  {
    id: "spoon-plate",
    category: "dining",
    cue: { word: "Spoon", emoji: "🥄" },
    target: { word: "Plate", emoji: "🍽️", synonyms: ["plate", "thali", "dish", "spoon plate", "chamach thali"] },
    hint: "Think about the dinner plate used with a spoon.",
    distractors: [
      { word: "Cup", emoji: "☕", sameCategory: true, synonyms: ["cup", "pyali"] },
      { word: "Glass of milk", emoji: "🥛", sameCategory: true, synonyms: ["glass", "tumbler", "doodh"] },
      { word: "Steamed pot", emoji: "🍲", sameCategory: true, synonyms: ["pot", "curry"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "soap-water",
    category: "hygiene",
    cue: { word: "Soap bar", emoji: "🧼" },
    target: { word: "Water drop", emoji: "💧", synonyms: ["water", "pani", "tap water", "soap water", "sabun pani"] },
    hint: "Think about washing your hands with soap and water.",
    distractors: [
      { word: "Lotion", emoji: "🧴", sameCategory: true, synonyms: ["lotion", "oil"] },
      { word: "Comb", emoji: "🪮", sameCategory: true, synonyms: ["comb", "kanghi"] },
      { word: "Mirror", emoji: "🪞", sameCategory: true, synonyms: ["mirror", "sheesha"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
      { word: "Car", emoji: "🚗", sameCategory: false, synonyms: ["car", "gadi"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "book-spectacles",
    category: "reading",
    cue: { word: "Book", emoji: "📖" },
    target: { word: "Spectacles", emoji: "👓", synonyms: ["glasses", "spectacles", "chashma", "book glasses"] },
    hint: "Think about what helps you read small print clearly.",
    distractors: [
      { word: "Pen", emoji: "🖊️", sameCategory: true, synonyms: ["pen", "kalam"] },
      { word: "Clock", emoji: "⏰", sameCategory: true, synonyms: ["clock", "ghadi"] },
      { word: "Flashlight", emoji: "🔦", sameCategory: true, synonyms: ["torch", "flashlight"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
    ],
  },
  {
    id: "tree-mango",
    category: "nature",
    cue: { word: "Tree", emoji: "🌳" },
    target: { word: "Mango", emoji: "🥭", synonyms: ["mango", "aam", "fruit", "tree mango"] },
    hint: "Think about the sweet yellow mango growing on a tree.",
    distractors: [
      { word: "Flower", emoji: "🌸", sameCategory: true, synonyms: ["flower", "phool"] },
      { word: "Leaf", emoji: "🍃", sameCategory: true, synonyms: ["leaf", "patta"] },
      { word: "Green seedling", emoji: "🌱", sameCategory: true, synonyms: ["seed", "plant", "paudha"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Bed", emoji: "🛏️", sameCategory: false, synonyms: ["bed", "bistar"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: false, synonyms: ["tea", "chai"] },
    ],
  },
  {
    id: "postbox-letter",
    category: "mail",
    cue: { word: "Postbox", emoji: "📮" },
    target: { word: "Letter", emoji: "✉️", synonyms: ["letter", "envelope", "chithi", "dak", "postbox letter"] },
    hint: "Think about what you post inside the red letterbox.",
    distractors: [
      { word: "Stamp", emoji: "🏷️", sameCategory: true, synonyms: ["stamp", "tag"] },
      { word: "Package", emoji: "📦", sameCategory: true, synonyms: ["package", "parcel", "box"] },
      { word: "Diary", emoji: "📔", sameCategory: true, synonyms: ["diary", "notebook"] },
      { word: "Slippers", emoji: "🩴", sameCategory: false, synonyms: ["slippers", "chappal"] },
      { word: "Umbrella", emoji: "☂️", sameCategory: false, synonyms: ["umbrella", "chhatri"] },
      { word: "Car", emoji: "🚗", sameCategory: false, synonyms: ["car", "gadi"] },
    ],
  },
  {
    id: "bicycle-bell",
    category: "transport",
    cue: { word: "Bicycle", emoji: "🚲" },
    target: { word: "Bicycle bell", emoji: "🔔", synonyms: ["bell", "ghanti", "cycle bell", "bicycle bell"] },
    hint: "Think about what rings on a bicycle handlebar.",
    distractors: [
      { word: "Car", emoji: "🚗", sameCategory: true, synonyms: ["car", "gadi"] },
      { word: "Train", emoji: "🚆", sameCategory: true, synonyms: ["train", "rail"] },
      { word: "Bus", emoji: "🚌", sameCategory: true, synonyms: ["bus"] },
      { word: "Toast", emoji: "🍞", sameCategory: false, synonyms: ["toast"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
      { word: "Hat", emoji: "🧢", sameCategory: false, synonyms: ["hat", "cap"] },
    ],
  },
  {
    id: "moon-stars",
    category: "sky",
    cue: { word: "Crescent moon", emoji: "🌙" },
    target: { word: "Shining star", emoji: "⭐", synonyms: ["star", "tara", "sitara", "moon star", "chand tara"] },
    hint: "Think about what twinkles beside the moon at night.",
    distractors: [
      { word: "Cloud", emoji: "☁️", sameCategory: true, synonyms: ["cloud", "badal"] },
      { word: "Sun", emoji: "☀️", sameCategory: true, synonyms: ["sun", "suraj"] },
      { word: "Rainbow", emoji: "🌈", sameCategory: true, synonyms: ["rainbow", "indradhanush"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: false, synonyms: ["tea", "chai"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "toothbrush-teeth",
    category: "hygiene",
    cue: { word: "Toothbrush", emoji: "🪥" },
    target: { word: "Tooth", emoji: "🦷", synonyms: ["tooth", "teeth", "dant", "toothbrush tooth"] },
    hint: "Think about what you clean gently with a toothbrush.",
    distractors: [
      { word: "Soap bar", emoji: "🧼", sameCategory: true, synonyms: ["soap", "sabun"] },
      { word: "Comb", emoji: "🪮", sameCategory: true, synonyms: ["comb", "kanghi"] },
      { word: "Mirror", emoji: "🪞", sameCategory: true, synonyms: ["mirror", "sheesha"] },
      { word: "Book", emoji: "📖", sameCategory: false, synonyms: ["book", "kitab"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
    ],
  },
  {
    id: "scissors-cloth",
    category: "tailoring",
    cue: { word: "Scissors", emoji: "✂️" },
    target: { word: "Cloth dress", emoji: "👗", synonyms: ["dress", "cloth", "kapda", "scissors dress"] },
    hint: "Think about what a tailor cuts to stitch clothes.",
    distractors: [
      { word: "Shirt", emoji: "👕", sameCategory: true, synonyms: ["shirt", "kurta"] },
      { word: "Pants", emoji: "👖", sameCategory: true, synonyms: ["pants", "trouser"] },
      { word: "Coat", emoji: "🧥", sameCategory: true, synonyms: ["coat", "jacket"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["cycle"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
];
