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
 * Invariants & design rules:
 * - Every pair has at least 3 same-category distractors for Knob 4.
 * - No distractor equals any target word anywhere in the dataset.
 * - No distractor is an equally valid answer or association for the cue.
 * - Emojis render cleanly across Windows 11, Android, iOS, and macOS.
 */
export const WORD_ASSOCIATION_PAIRS: AssociationPair[] = [
  {
    id: "chai-biscuit",
    category: "food",
    cue: { word: "Cup of tea", emoji: "☕" },
    target: { word: "Biscuit", emoji: "🍪", synonyms: ["biscuit", "cookie", "rusk", "biskut", "chai biscuit", "tea biscuit", "चाय बिस्कुट", "চাহ বিস্কুট"] },
    hint: "Think about what is dipped into hot tea.",
    distractors: [
      { word: "Ice cream", emoji: "🍦", sameCategory: true, synonyms: ["ice cream", "kulfi"] },
      { word: "Apple", emoji: "🍎", sameCategory: true, synonyms: ["apple", "seb"] },
      { word: "Watermelon", emoji: "🍉", sameCategory: true, synonyms: ["watermelon", "tarbooz"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
  {
    id: "lock-key",
    category: "hardware",
    cue: { word: "Lock", emoji: "🔒" },
    target: { word: "Key", emoji: "🔑", synonyms: ["key", "chabi", "lock key", "tala chabi"] },
    hint: "Think about what opens a locked door.",
    distractors: [
      { word: "Hammer", emoji: "🔨", sameCategory: true, synonyms: ["hammer", "hathoda"] },
      { word: "Wrench", emoji: "🔧", sameCategory: true, synonyms: ["wrench", "panah"] },
      { word: "Nut and bolt", emoji: "🔩", sameCategory: true, synonyms: ["bolt", "nut"] },
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
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
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
      { word: "Ice cream", emoji: "🍦", sameCategory: true, synonyms: ["ice cream", "kulfi"] },
      { word: "Umbrella", emoji: "☂️", sameCategory: false, synonyms: ["umbrella", "chhatri"] },
      { word: "Bed", emoji: "🛏️", sameCategory: false, synonyms: ["bed", "bistar"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["bicycle", "cycle"] },
    ],
  },
  {
    id: "needle-thread",
    category: "tailoring",
    cue: { word: "Needle", emoji: "🪡" },
    target: { word: "Thread", emoji: "🧵", synonyms: ["thread", "dhaga", "needle thread", "sui dhaga"] },
    hint: "Think about what is passed through the eye of a needle.",
    distractors: [
      { word: "Safety pin", emoji: "🧷", sameCategory: true, synonyms: ["safety pin", "pin"] },
      { word: "Yarn ball", emoji: "🧶", sameCategory: true, synonyms: ["yarn", "wool", "oon"] },
      { word: "Ribbon", emoji: "🎀", sameCategory: true, synonyms: ["ribbon", "feeta"] },
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
      { word: "Bus", emoji: "🚌", sameCategory: true, synonyms: ["bus"] },
      { word: "Car", emoji: "🚗", sameCategory: true, synonyms: ["car", "gadi"] },
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
      { word: "Hat", emoji: "🧢", sameCategory: true, synonyms: ["hat", "cap", "topi"] },
      { word: "Gloves", emoji: "🧤", sameCategory: true, synonyms: ["gloves", "dastana"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
      { word: "Flower", emoji: "🌸", sameCategory: false, synonyms: ["flower", "phool"] },
      { word: "Book", emoji: "📖", sameCategory: false, synonyms: ["book", "kitab"] },
    ],
  },
  {
    id: "pen-paper",
    category: "stationery",
    cue: { word: "Pen", emoji: "🖊️" },
    target: { word: "Paper", emoji: "📄", synonyms: ["paper", "page", "kagaz", "notebook", "pen paper", "kalam kagaz"] },
    hint: "Think about what you write upon with a pen.",
    distractors: [
      { word: "Ruler", emoji: "📏", sameCategory: true, synonyms: ["ruler", "scale"] },
      { word: "Folder", emoji: "📁", sameCategory: true, synonyms: ["folder", "file"] },
      { word: "Paperclip", emoji: "📎", sameCategory: true, synonyms: ["clip", "paperclip"] },
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
      { word: "Herb", emoji: "🌿", sameCategory: true, synonyms: ["herb", "plant"] },
      { word: "Cactus", emoji: "🌵", sameCategory: true, synonyms: ["cactus"] },
      { word: "Mushroom", emoji: "🍄", sameCategory: true, synonyms: ["mushroom"] },
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
      { word: "Teapot", emoji: "🫖", sameCategory: true, synonyms: ["teapot", "ketli"] },
      { word: "Salt shaker", emoji: "🧂", sameCategory: true, synonyms: ["salt", "namak"] },
      { word: "Chopsticks", emoji: "🥢", sameCategory: true, synonyms: ["chopsticks"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["bicycle"] },
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
      { word: "Lotion", emoji: "🧴", sameCategory: true, synonyms: ["lotion", "cream"] },
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
      { word: "Backpack", emoji: "🎒", sameCategory: true, synonyms: ["bag", "backpack", "basta"] },
      { word: "Desk lamp", emoji: "💡", sameCategory: true, synonyms: ["lamp", "bulb", "light"] },
      { word: "Flashlight", emoji: "🔦", sameCategory: true, synonyms: ["torch", "flashlight"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Spoon", emoji: "🥄", sameCategory: false, synonyms: ["spoon", "chamach"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["bicycle"] },
    ],
  },
  {
    id: "bee-honey",
    category: "nature",
    cue: { word: "Honeybee", emoji: "🐝" },
    target: { word: "Honey pot", emoji: "🍯", synonyms: ["honey", "shahad", "madhu", "bee honey", "madhumakkhi shahad"] },
    hint: "Think about the sweet golden honey made by bees.",
    distractors: [
      { word: "Ant", emoji: "🐜", sameCategory: true, synonyms: ["ant", "chinti"] },
      { word: "Butterfly", emoji: "🦋", sameCategory: true, synonyms: ["butterfly", "titli"] },
      { word: "Spider", emoji: "🕷️", sameCategory: true, synonyms: ["spider", "makdi"] },
      { word: "Train", emoji: "🚆", sameCategory: false, synonyms: ["train", "rail"] },
      { word: "Bed", emoji: "🛏️", sameCategory: false, synonyms: ["bed", "bistar"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
    ],
  },
  {
    id: "postbox-letter",
    category: "mail",
    cue: { word: "Postbox", emoji: "📮" },
    target: { word: "Letter", emoji: "✉️", synonyms: ["letter", "envelope", "chithi", "dak", "postbox letter"] },
    hint: "Think about what you post inside the red letterbox.",
    distractors: [
      { word: "Briefcase", emoji: "💼", sameCategory: true, synonyms: ["briefcase", "bag"] },
      { word: "Desk calendar", emoji: "📅", sameCategory: true, synonyms: ["calendar"] },
      { word: "Pushpin", emoji: "📌", sameCategory: true, synonyms: ["pin", "pushpin"] },
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
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
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
      { word: "Rainbow", emoji: "🌈", sameCategory: true, synonyms: ["rainbow", "indradhanush"] },
      { word: "Snow", emoji: "❄️", sameCategory: true, synonyms: ["snow", "baraf"] },
      { word: "Shoe", emoji: "👞", sameCategory: false, synonyms: ["shoe", "juta"] },
      { word: "Chair", emoji: "🪑", sameCategory: false, synonyms: ["chair", "kursi"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
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
    id: "cow-milk",
    category: "animals",
    cue: { word: "Cow", emoji: "🐄" },
    target: { word: "Glass of milk", emoji: "🥛", synonyms: ["milk", "doodh", "cow milk", "gai ka doodh"] },
    hint: "Think about the fresh milk given by a cow.",
    distractors: [
      { word: "Horse", emoji: "🐎", sameCategory: true, synonyms: ["horse", "ghoda"] },
      { word: "Rooster", emoji: "🐓", sameCategory: true, synonyms: ["rooster", "murgi"] },
      { word: "Duck", emoji: "🦆", sameCategory: true, synonyms: ["duck", "battakh"] },
      { word: "Apple", emoji: "🍎", sameCategory: false, synonyms: ["apple", "seb"] },
      { word: "Bicycle", emoji: "🚲", sameCategory: false, synonyms: ["bicycle"] },
      { word: "Clock", emoji: "⏰", sameCategory: false, synonyms: ["clock", "ghadi"] },
    ],
  },
];
