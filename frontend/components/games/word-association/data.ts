export interface ItemWithEmoji {
  word: string;
  emoji: string;
  synonyms: string[];
  sameCategory?: boolean;
}

export interface AssociationPair {
  id: string;
  cue: { word: string; emoji: string };
  target: ItemWithEmoji;
  hint: string;
  distractors: ItemWithEmoji[];
}

/**
 * 20 authentic everyday pairs using standard Unicode 12 or older emojis
 * that render cleanly across Windows 11, Android, and iOS.
 *
 * (Dropped pairs without standard Unicode emojis: idli/sambar, rangoli/doorstep,
 * bangles/wrist, temple/prasad).
 */
export const WORD_ASSOCIATION_PAIRS: AssociationPair[] = [
  {
    id: "chai-biscuit",
    cue: { word: "Cup of tea", emoji: "☕" },
    target: { word: "Biscuit", emoji: "🍪", synonyms: ["biscuit", "cookie", "rusk", "biskut"] },
    hint: "Think about what is dipped into hot tea.",
    distractors: [
      { word: "Toast", emoji: "🍞", sameCategory: true, synonyms: ["toast", "bread"] },
      { word: "Samosa", emoji: "🥟", sameCategory: true, synonyms: ["samosa"] },
      { word: "Sweet", emoji: "🍬", sameCategory: true, synonyms: ["sweet", "mithai", "candy"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Key", emoji: "🔑", sameCategory: false, synonyms: ["key", "chabi"] },
    ],
  },
  {
    id: "diya-matchbox",
    cue: { word: "Diya", emoji: "🪔" },
    target: { word: "Matchbox", emoji: "🔥", synonyms: ["matchbox", "matchstick", "flame", "fire", "match", "machis"] },
    hint: "Think about what lights an oil lamp.",
    distractors: [
      { word: "Candle", emoji: "🕯️", sameCategory: true, synonyms: ["candle", "mombatti"] },
      { word: "Sun", emoji: "☀️", sameCategory: true, synonyms: ["sun", "suraj"] },
      { word: "Flashlight", emoji: "🔦", sameCategory: true, synonyms: ["torch", "flashlight"] },
      { word: "Book", emoji: "📖", sameCategory: false, synonyms: ["book", "kitab"] },
      { word: "Comb", emoji: "🪮", sameCategory: false, synonyms: ["comb", "kanghi"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
    ],
  },
  {
    id: "lock-key",
    cue: { word: "Lock", emoji: "🔒" },
    target: { word: "Key", emoji: "🔑", synonyms: ["key", "chabi"] },
    hint: "Think about what opens a locked door.",
    distractors: [
      { word: "Chain", emoji: "⛓️", sameCategory: true, synonyms: ["chain", "zanjeer"] },
      { word: "Bell", emoji: "🔔", sameCategory: true, synonyms: ["bell", "ghanti"] },
      { word: "Door", emoji: "🚪", sameCategory: true, synonyms: ["door", "darwaza"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
  {
    id: "umbrella-rain",
    cue: { word: "Umbrella", emoji: "☂️" },
    target: { word: "Rain", emoji: "🌧️", synonyms: ["rain", "barish", "rain shower"] },
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
    cue: { word: "Tawa pan", emoji: "🍳" },
    target: { word: "Roti", emoji: "🫓", synonyms: ["roti", "chapati", "flatbread", "bread"] },
    hint: "Think about the hot bread puffed up on a tawa pan.",
    distractors: [
      { word: "Rice", emoji: "🍚", sameCategory: true, synonyms: ["rice", "chawal", "bhat"] },
      { word: "Curry bowl", emoji: "🥣", sameCategory: true, synonyms: ["curry", "bowl", "katori"] },
      { word: "Steamed pot", emoji: "🍲", sameCategory: true, synonyms: ["pot", "curry"] },
      { word: "Umbrella", emoji: "☂️", sameCategory: false, synonyms: ["umbrella", "chhatri"] },
      { word: "Bed", emoji: "🛏️", sameCategory: false, synonyms: ["bed", "bistar"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
    ],
  },
  {
    id: "needle-thread",
    cue: { word: "Needle", emoji: "🪡" },
    target: { word: "Thread", emoji: "🧵", synonyms: ["thread", "dhaga"] },
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
    cue: { word: "Train", emoji: "🚆" },
    target: { word: "Ticket", emoji: "🎟️", synonyms: ["ticket", "rail ticket", "pass"] },
    hint: "Think about what you show the ticket collector.",
    distractors: [
      { word: "Luggage", emoji: "🧳", sameCategory: true, synonyms: ["bag", "luggage", "suitcase"] },
      { word: "Station", emoji: "🚉", sameCategory: true, synonyms: ["station", "platform"] },
      { word: "Bus", emoji: "🚌", sameCategory: true, synonyms: ["bus"] },
      { word: "Soap bar", emoji: "🧼", sameCategory: false, synonyms: ["soap", "sabun"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
      { word: "Comb", emoji: "🪮", sameCategory: false, synonyms: ["comb", "kanghi"] },
    ],
  },
  {
    id: "cricket-ball",
    cue: { word: "Cricket bat", emoji: "🏏" },
    target: { word: "Ball", emoji: "⚾", synonyms: ["ball", "cricket ball", "gend"] },
    hint: "Think about what the bowler bowls to the batsman.",
    distractors: [
      { word: "Trophy", emoji: "🏆", sameCategory: true, synonyms: ["cup", "trophy"] },
      { word: "Cap", emoji: "🧢", sameCategory: true, synonyms: ["cap", "hat", "topi"] },
      { word: "Medal", emoji: "🥇", sameCategory: true, synonyms: ["medal"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: false, synonyms: ["tea", "chai"] },
      { word: "Key", emoji: "🔑", sameCategory: false, synonyms: ["key", "chabi"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
    ],
  },
  {
    id: "shoes-socks",
    cue: { word: "Shoes", emoji: "👞" },
    target: { word: "Socks", emoji: "🧦", synonyms: ["socks", "moja"] },
    hint: "Think about what you wear on your feet before your shoes.",
    distractors: [
      { word: "Slippers", emoji: "🩴", sameCategory: true, synonyms: ["slippers", "chappal"] },
      { word: "Pants", emoji: "👖", sameCategory: true, synonyms: ["pants", "trouser"] },
      { word: "Coat", emoji: "🧥", sameCategory: true, synonyms: ["coat", "jacket"] },
      { word: "Plate", emoji: "🍽️", sameCategory: false, synonyms: ["plate", "thali"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
    ],
  },
  {
    id: "pen-paper",
    cue: { word: "Pen", emoji: "🖊️" },
    target: { word: "Paper", emoji: "📄", synonyms: ["paper", "page", "kagas", "notebook"] },
    hint: "Think about what you write upon with a pen.",
    distractors: [
      { word: "Pencil", emoji: "✏️", sameCategory: true, synonyms: ["pencil"] },
      { word: "Book", emoji: "📖", sameCategory: true, synonyms: ["book", "kitab"] },
      { word: "Letter", emoji: "✉️", sameCategory: true, synonyms: ["letter", "envelope", "chithi"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["cycle", "bicycle"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Rain", emoji: "🌧️", sameCategory: false, synonyms: ["rain", "barish"] },
    ],
  },
  {
    id: "flower-garland",
    cue: { word: "Flower", emoji: "🌸" },
    target: { word: "Garland", emoji: "💐", synonyms: ["garland", "mala", "bouquet", "haar"] },
    hint: "Think about stringing fresh flowers together.",
    distractors: [
      { word: "Tree", emoji: "🌳", sameCategory: true, synonyms: ["tree", "ped"] },
      { word: "Leaf", emoji: "🍃", sameCategory: true, synonyms: ["leaf", "patta"] },
      { word: "Rose", emoji: "🌹", sameCategory: true, synonyms: ["rose", "gulab"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Door", emoji: "🚪", sameCategory: false, synonyms: ["door", "darwaza"] },
      { word: "Lock", emoji: "🔒", sameCategory: false, synonyms: ["lock", "tala"] },
    ],
  },
  {
    id: "spoon-plate",
    cue: { word: "Spoon", emoji: "🥄" },
    target: { word: "Plate", emoji: "🍽️", synonyms: ["plate", "thali", "dish"] },
    hint: "Think about the dinner plate used with a spoon.",
    distractors: [
      { word: "Curry bowl", emoji: "🥣", sameCategory: true, synonyms: ["bowl", "katori"] },
      { word: "Glass of milk", emoji: "🥛", sameCategory: true, synonyms: ["glass", "tumbler", "doodh"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: true, synonyms: ["cup", "pyali"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
      { word: "Bell", emoji: "🔔", sameCategory: false, synonyms: ["bell", "ghanti"] },
    ],
  },
  {
    id: "soap-water",
    cue: { word: "Soap bar", emoji: "🧼" },
    target: { word: "Water drop", emoji: "💧", synonyms: ["water", "pani", "tap water"] },
    hint: "Think about washing your hands with soap and water.",
    distractors: [
      { word: "Lotion", emoji: "🧴", sameCategory: true, synonyms: ["lotion", "oil"] },
      { word: "Comb", emoji: "🪮", sameCategory: true, synonyms: ["comb", "kanghi"] },
      { word: "Mirror", emoji: "🪞", sameCategory: true, synonyms: ["mirror", "sheesha"] },
      { word: "Lock", emoji: "🔒", sameCategory: false, synonyms: ["lock", "tala"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
      { word: "Car", emoji: "🚗", sameCategory: false, synonyms: ["car", "gadi"] },
    ],
  },
  {
    id: "book-spectacles",
    cue: { word: "Book", emoji: "📖" },
    target: { word: "Spectacles", emoji: "👓", synonyms: ["glasses", "spectacles", "chashma"] },
    hint: "Think about what helps you read small print clearly.",
    distractors: [
      { word: "Pen", emoji: "🖊️", sameCategory: true, synonyms: ["pen", "kalam"] },
      { word: "Paper", emoji: "📄", sameCategory: true, synonyms: ["paper", "kagas"] },
      { word: "Clock", emoji: "⏰", sameCategory: true, synonyms: ["clock", "ghadi"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Rain", emoji: "🌧️", sameCategory: false, synonyms: ["rain", "barish"] },
    ],
  },
  {
    id: "tree-fruit",
    cue: { word: "Tree", emoji: "🌳" },
    target: { word: "Fruit", emoji: "🍎", synonyms: ["fruit", "apple", "fal", "seb"] },
    hint: "Think about what grows sweet on the branches of a tree.",
    distractors: [
      { word: "Flower", emoji: "🌸", sameCategory: true, synonyms: ["flower", "phool"] },
      { word: "Leaf", emoji: "🍃", sameCategory: true, synonyms: ["leaf", "patta"] },
      { word: "Green seedling", emoji: "🌱", sameCategory: true, synonyms: ["seed", "plant", "paudha"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Key", emoji: "🔑", sameCategory: false, synonyms: ["key", "chabi"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: false, synonyms: ["tea", "chai"] },
    ],
  },
  {
    id: "postbox-letter",
    cue: { word: "Postbox", emoji: "📮" },
    target: { word: "Letter", emoji: "✉️", synonyms: ["letter", "envelope", "chithi", "dak"] },
    hint: "Think about what you post inside the red letterbox.",
    distractors: [
      { word: "Ticket", emoji: "🎟️", sameCategory: true, synonyms: ["ticket"] },
      { word: "Paper", emoji: "📄", sameCategory: true, synonyms: ["paper", "kagas"] },
      { word: "Book", emoji: "📖", sameCategory: true, synonyms: ["book", "kitab"] },
      { word: "Socks", emoji: "🧦", sameCategory: false, synonyms: ["socks", "moja"] },
      { word: "Plate", emoji: "🍽️", sameCategory: false, synonyms: ["plate", "thali"] },
      { word: "Umbrella", emoji: "☂️", sameCategory: false, synonyms: ["umbrella", "chhatri"] },
    ],
  },
  {
    id: "bicycle-bell",
    cue: { word: "Bicycle", emoji: "🚲" },
    target: { word: "Bicycle bell", emoji: "🔔", synonyms: ["bell", "ghanti", "cycle bell"] },
    hint: "Think about what rings on a bicycle handlebar.",
    distractors: [
      { word: "Car", emoji: "🚗", sameCategory: true, synonyms: ["car", "gadi"] },
      { word: "Train", emoji: "🚆", sameCategory: true, synonyms: ["train", "rail"] },
      { word: "Bus", emoji: "🚌", sameCategory: true, synonyms: ["bus"] },
      { word: "Biscuit", emoji: "🍪", sameCategory: false, synonyms: ["biscuit"] },
      { word: "Lock", emoji: "🔒", sameCategory: false, synonyms: ["lock", "tala"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
    ],
  },
  {
    id: "candle-flame",
    cue: { word: "Candle", emoji: "🕯️" },
    target: { word: "Flame", emoji: "🔥", synonyms: ["flame", "fire", "aag", "jyoti"] },
    hint: "Think about the warm glow burning on a candle.",
    distractors: [
      { word: "Diya", emoji: "🪔", sameCategory: true, synonyms: ["diya", "deepak"] },
      { word: "Sun", emoji: "☀️", sameCategory: true, synonyms: ["sun", "dhoop"] },
      { word: "Shining star", emoji: "⭐", sameCategory: true, synonyms: ["star", "tara"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Tree", emoji: "🌳", sameCategory: false, synonyms: ["tree", "ped"] },
    ],
  },
  {
    id: "rice-bowl",
    cue: { word: "Steamed rice", emoji: "🍚" },
    target: { word: "Curry bowl", emoji: "🥣", synonyms: ["bowl", "dal", "curry", "katori"] },
    hint: "Think about the bowl of warm dal served with rice.",
    distractors: [
      { word: "Roti", emoji: "🫓", sameCategory: true, synonyms: ["roti", "chapati"] },
      { word: "Plate", emoji: "🍽️", sameCategory: true, synonyms: ["plate", "thali"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: true, synonyms: ["tea", "chai"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["cycle"] },
      { word: "Lock", emoji: "🔒", sameCategory: false, synonyms: ["lock", "tala"] },
      { word: "Needle", emoji: "🪡", sameCategory: false, synonyms: ["needle", "sui"] },
    ],
  },
  {
    id: "moon-stars",
    cue: { word: "Crescent moon", emoji: "🌙" },
    target: { word: "Shining star", emoji: "⭐", synonyms: ["star", "tara", "sitara"] },
    hint: "Think about what twinkles beside the moon at night.",
    distractors: [
      { word: "Cloud", emoji: "☁️", sameCategory: true, synonyms: ["cloud", "badal"] },
      { word: "Sun", emoji: "☀️", sameCategory: true, synonyms: ["sun", "suraj"] },
      { word: "Rainbow", emoji: "🌈", sameCategory: true, synonyms: ["rainbow", "indradhanush"] },
      { word: "Key", emoji: "🔑", sameCategory: false, synonyms: ["key", "chabi"] },
      { word: "Cup of tea", emoji: "☕", sameCategory: false, synonyms: ["tea", "chai"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
    ],
  },
];
