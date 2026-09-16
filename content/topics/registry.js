/**
 * Curated Dream Topic Registry for DreamlyAI Content Engine
 *
 * Provides initial curated registry of high-value dream topics, symbols,
 * and psychological/sleep-science themes.
 */

const { createDreamTopic } = require("../models/dreamTopic");

const RAW_TOPICS = Object.freeze([
  // 1. Recurring Dreams
  {
    id: "recurring-dreams",
    title: "Recurring Dreams: Why the Same Dream Keeps Happening",
    category: "common_dreams",
    keywords: [
      "recurring dreams",
      "same dream over and over",
      "why do i have repeating dreams",
      "recurring dream patterns",
      "recurring nightmare meaning"
    ],
    searchIntent: "Understanding why identical or thematic dreams recur and how waking life triggers loop nighttime narratives.",
    socialAngles: [
      "Why your brain replays the exact same dream scenario",
      "The psychological loop behind recurring dreams",
      "3 practical ways to decode repeating dream patterns"
    ],
    priority: 1,
    appCTA: {
      headline: "Track Recurring Dream Themes",
      body: "Discover repeating symbols and patterns across your sleep logs with Dreamly AI's pattern discovery calendar.",
      buttonText: "Explore Dreamly AI"
    }
  },

  // 2. Falling Dreams
  {
    id: "falling-dreams",
    title: "Falling in Dreams: What Sudden Drops & Hypnic Jerks Mean",
    category: "common_dreams",
    keywords: [
      "falling dream meaning",
      "dream of falling from high place",
      "waking up from falling dream",
      "hypnic jerk falling sensation",
      "falling dream psychology"
    ],
    searchIntent: "Exploring the physiological (hypnic jerk) and emotional (loss of control, stress) causes of falling sensations in sleep.",
    socialAngles: [
      "Why you suddenly jerk awake when falling in a dream",
      "Loss of control or sleep transition? The truth about falling dreams",
      "What falling from cliffs vs. flying down means for stress levels"
    ],
    priority: 2,
    appCTA: {
      headline: "Log Nighttime Sensations",
      body: "Record vivid sensory dreams and wake-up reactions instantly using Dreamly AI's fast voice journal.",
      buttonText: "Download Dreamly AI"
    }
  },

  // 3. Being Chased
  {
    id: "being-chased",
    title: "Being Chased in Dreams: Fear, Avoidance & Fight-or-Flight",
    category: "common_dreams",
    keywords: [
      "being chased in a dream",
      "dream of someone running after me",
      "chase dream meaning psychology",
      "running away from danger dream",
      "hiding in dreams"
    ],
    searchIntent: "Investigating avoidance behaviors, unresolved stress, and fight-or-flight responses manifested during REM sleep.",
    socialAngles: [
      "What are you running from? The hidden trigger behind chase dreams",
      "Why you can't run fast enough in dreams: REM motor inhibition explained",
      "Turning chase dreams into empowering reflections"
    ],
    priority: 3,
    appCTA: {
      headline: "Reflect on Stress Triggers",
      body: "Unpack emotional intensity and nighttime anxiety with structured 6-part AI reflections in Dreamly AI.",
      buttonText: "Try Dreamly AI Free"
    }
  },

  // 4. Dreams About an Ex
  {
    id: "dreams-about-an-ex",
    title: "Dreams About an Ex: Unresolved Feelings vs Memory Processing",
    category: "emotions_themes",
    keywords: [
      "dreaming about an ex",
      "why did i dream about my ex years later",
      "dreaming of ex partner meaning",
      "closure dreams about ex",
      "romantic ex dream psychology"
    ],
    searchIntent: "Clarifying why past romantic partners reappear in dreams, distinguishing memory consolidation from active romantic desire.",
    socialAngles: [
      "Dreamed about your ex? Here is why it rarely means you want them back",
      "The brain's emotional filing system: why past relationships resurface",
      "3 questions to ask yourself after dreaming of an ex"
    ],
    priority: 4,
    appCTA: {
      headline: "Make Sense of Relationship Dreams",
      body: "Tag relationship moods and unpack emotional narratives privately in your Dreamly AI dream journal.",
      buttonText: "Get Dreamly AI"
    }
  },

  // 5. Dreams About Someone You Know
  {
    id: "dreams-about-someone-you-know",
    title: "Dreams About People You Know: Projection, Social Bonds & Memory",
    category: "emotions_themes",
    keywords: [
      "dreaming about a friend",
      "why do people you know appear in dreams",
      "dream about coworker or acquaintance",
      "people in dreams psychology",
      "social dream meaning"
    ],
    searchIntent: "Understanding how the brain uses familiar acquaintances as archetypes or emotional mirrors during sleep.",
    socialAngles: [
      "Why someone you barely talk to just starred in your dream",
      "Are people in your dreams actually about them—or about you?",
      "How your social brain processes connections overnight"
    ],
    priority: 5,
    appCTA: {
      headline: "Discover Character Patterns",
      body: "Track recurring people and social dynamics across your dream history with Dreamly AI.",
      buttonText: "Start Journaling"
    }
  },

  // 6. Teeth Falling Out
  {
    id: "teeth-falling-out",
    title: "Teeth Falling Out in Dreams: Stress, Control & Life Transitions",
    category: "dream_symbols",
    keywords: [
      "teeth falling out dream",
      "dream of losing teeth meaning",
      "crumbling teeth dream",
      "teeth falling out stress",
      "dental dreams psychology"
    ],
    searchIntent: "Deconstructing one of the world's most common dream symbols: examining dental irritation, vulnerability, and transition stress.",
    socialAngles: [
      "Why teeth falling out is the #1 most common dream worldwide",
      "Communication anxiety vs. physical jaw clenching: why teeth dreams happen",
      "What your brain is trying to tell you during tooth-loss dreams"
    ],
    priority: 6,
    appCTA: {
      headline: "Decode Symbolic Dream Imagery",
      body: "Get balanced symbolic interpretations and psychological insights directly inside Dreamly AI.",
      buttonText: "Explore Symbol Insights"
    }
  },

  // 7. Flying Dreams
  {
    id: "flying-dreams",
    title: "Flying Dreams: Freedom, Perspective & Lucid Awareness",
    category: "lucid_vivid",
    keywords: [
      "flying dream meaning",
      "floating in dreams",
      "soaring dream psychology",
      "lucid flying dreams",
      "flying over cities dream"
    ],
    searchIntent: "Exploring uplifting dream experiences, feelings of liberation, mastery, and early transitions into lucid dreaming.",
    socialAngles: [
      "The exhilarating psychology behind flying dreams",
      "How to turn a flying dream into a fully lucid experience",
      "Why flying dreams leave us feeling energized all morning"
    ],
    priority: 7,
    appCTA: {
      headline: "Log Lucid & Vivid Experiences",
      body: "Rate dream vividness and track your lucid dreaming milestones in Dreamly AI.",
      buttonText: "Track Lucid Dreams"
    }
  },

  // 8. Water Dreams
  {
    id: "water-dreams",
    title: "Water in Dreams: Oceans, Tidal Waves, Rain & Emotional Currents",
    category: "dream_symbols",
    keywords: [
      "water dream meaning",
      "dreaming of tidal waves",
      "swimming in clear water dream",
      "drowning in dreams psychology",
      "ocean and flood dream symbolism"
    ],
    searchIntent: "Analyzing water as a universal dream symbol reflecting subconscious emotional state, calm clarity, or overwhelming change.",
    socialAngles: [
      "Clear lakes vs. giant tsunamis: what water in your dreams reveals",
      "Why turbulent water dreams spike during life transitions",
      "How to interpret water symbols without superstition"
    ],
    priority: 8,
    appCTA: {
      headline: "Reflect on Emotional Flow",
      body: "Tag emotions like peace, wonder, or anxiety alongside dream symbols in Dreamly AI.",
      buttonText: "Try Dreamly AI"
    }
  },

  // 9. Nightmares & Bad Dreams
  {
    id: "nightmares",
    title: "Nightmares & Bad Dreams: Stress Processing vs REM Sleep Health",
    category: "dream_science",
    keywords: [
      "why do i have bad dreams",
      "nightmare causes psychology",
      "frequent nightmares adults",
      "how to stop nightmares",
      "stress and bad dreams"
    ],
    searchIntent: "Scientific insights into nightmare etiology, sleep disruption, emotional regulation, and healthy sleep hygiene practices.",
    socialAngles: [
      "The biological purpose of bad dreams: emotional safety valves",
      "When late-night snacks and stress trigger intense nightmares",
      "Simple evening routines to reduce nightmare frequency"
    ],
    priority: 9,
    appCTA: {
      headline: "Turn Bad Dreams into Calm Insights",
      body: "Process intense dreams safely with objective, non-judgmental AI reflections in Dreamly AI.",
      buttonText: "Reflect with Dreamly AI"
    }
  },

  // 10. Deceased Loved Ones in Dreams
  {
    id: "deceased-loved-ones",
    title: "Dreams of Deceased Loved Ones: Grief, Comfort & Memory Recall",
    category: "reflection",
    keywords: [
      "dreaming of deceased relatives",
      "visitation dreams deceased parents",
      "talking to dead person in dream meaning",
      "grief dreams psychology",
      "vivid dreams of passed loved ones"
    ],
    searchIntent: "Compassionate exploration of grief, emotional healing, and how memory networks preserve bonds with departed loved ones.",
    socialAngles: [
      "Why dreams of lost loved ones feel astonishingly real",
      "The role of grief dreams in emotional healing and memory",
      "How to capture and preserve comforting visitation memories"
    ],
    priority: 10,
    appCTA: {
      headline: "Preserve Meaningful Memories",
      body: "Store heartfelt dream memories securely and privately on your device with Dreamly AI.",
      buttonText: "Create a Dream Journal"
    }
  },

  // 11. Relationship Dreams
  {
    id: "relationship-dreams",
    title: "Relationship & Romance Dreams: Bonds, Insecurities & Desires",
    category: "emotions_themes",
    keywords: [
      "relationship dreams meaning",
      "dreaming partner cheated",
      "romantic dreams with stranger",
      "falling in love in a dream",
      "marriage and breakup dreams"
    ],
    searchIntent: "Exploring how nighttime thoughts process intimacy, attachment security, trust, and relationship communication.",
    socialAngles: [
      "Woke up upset with your partner? Here is what your dream actually means",
      "Why we dream of falling in love with strangers",
      "Attachment styles and their impact on romantic dreams"
    ],
    priority: 11,
    appCTA: {
      headline: "Explore Relationship Patterns",
      body: "Gain clarity on love, trust, and interpersonal feelings with Dreamly AI's balanced reflections.",
      buttonText: "Download Dreamly AI"
    }
  },

  // 12. Strange & Bizarre Dreams
  {
    id: "strange-dreams",
    title: "Strange & Bizarre Dreams: How the REM Brain Creates Surreal Narratives",
    category: "dream_science",
    keywords: [
      "why are my dreams so weird",
      "bizarre dream causes",
      "surreal dreams science",
      "random nonsensical dreams",
      "dorsolateral prefrontal cortex sleep"
    ],
    searchIntent: "Neuroscientific explanation for surreal dream logic—deactivation of the prefrontal cortex and hyper-associative REM memory.",
    socialAngles: [
      "Why your dream logic makes perfect sense until you wake up",
      "The brain chemistry behind your weirdest dreams",
      "Why surreal dreams can spark daytime creativity"
    ],
    priority: 12,
    appCTA: {
      headline: "Capture Your Surreal Ideas",
      body: "Record eccentric and imaginative dreams before morning logic fades with Dreamly AI voice notes.",
      buttonText: "Try Voice Journaling"
    }
  },

  // 13. Emotional Dreams
  {
    id: "emotional-dreams",
    title: "Emotional Dreams: Waking Up Crying, Anxious, or Overjoyed",
    category: "emotions_themes",
    keywords: [
      "waking up crying from a dream",
      "intense emotional dreams",
      "waking up feeling sad or happy after dream",
      "emotional hangover from dreams",
      "why do dreams feel so intense emotionally"
    ],
    searchIntent: "Understanding the amygdala's role in dream emotion and why intense nighttime feelings linger well into waking hours.",
    socialAngles: [
      "Ever woken up with an 'emotional dream hangover'?",
      "Why dream feelings feel 10x stronger than waking emotions",
      "How to reset your mood after an emotionally charged dream"
    ],
    priority: 13,
    appCTA: {
      headline: "Track Emotional Trends",
      body: "Tag dominant feelings across joy, peace, anxiety, and wonder over time with Dreamly AI.",
      buttonText: "Track Your Moods"
    }
  },

  // 14. Common Dream Symbols
  {
    id: "common-dream-symbols",
    title: "Common Dream Symbols: Archetypes, Imagery & Personal Context",
    category: "dream_symbols",
    keywords: [
      "common dream symbols and meanings",
      "dream symbol dictionary",
      "top dream symbols",
      "how to interpret dream symbols",
      "universal dream symbols psychology"
    ],
    searchIntent: "A grounded guide to interpreting personal and archetypal dream imagery without rigid fortune-telling definitions.",
    socialAngles: [
      "Why dream dictionaries get it wrong: context is everything",
      "The 5 most frequent dream symbols and how to interpret them",
      "How to build your own personal dream symbol catalog"
    ],
    priority: 14,
    appCTA: {
      headline: "Build Your Personal Symbol Guide",
      body: "Discover recurring personal symbols unique to your life story in Dreamly AI.",
      buttonText: "Start Symbol Logging"
    }
  },

  // 15. Being Unprepared or Late
  {
    id: "being-unprepared",
    title: "Being Unprepared or Late in Dreams: Performance Anxiety & Expectations",
    category: "common_dreams",
    keywords: [
      "dreaming of being late",
      "unprepared for exam dream years after school",
      "missing a flight in dream",
      "performance anxiety dreams",
      "imposter syndrome dreams"
    ],
    searchIntent: "Understanding why adults frequently dream about school exams, forgotten presentations, and missed deadlines.",
    socialAngles: [
      "Why 40-year-olds still dream about high school math tests",
      "The link between imposter syndrome and being late in dreams",
      "How to quiet performance anxiety before sleep"
    ],
    priority: 15,
    appCTA: {
      headline: "Untangle Performance Stress",
      body: "Reflect on perfectionism and daytime pressures with mindful journaling in Dreamly AI.",
      buttonText: "Reflect on Dreams"
    }
  },

  // 16. Snakes in Dreams
  {
    id: "snakes-in-dreams",
    title: "Snakes in Dreams: Transformation, Hidden Fears & Ancient Instincts",
    category: "dream_symbols",
    keywords: [
      "snake in dream meaning",
      "dream of green or black snake",
      "snake biting in dream psychology",
      "snake dream transformation",
      "biblical and psychological snake dreams"
    ],
    searchIntent: "Examining the evolutionary psychology, cultural archetypes, and renewal symbolism behind snake encounters in dreams.",
    socialAngles: [
      "Why the human brain is hardwired to dream about snakes",
      "Threat or shedding old skin? How to interpret snake dreams",
      "What a snake bite in a dream signifies about personal boundaries"
    ],
    priority: 16,
    appCTA: {
      headline: "Decode Animal Symbols",
      body: "Log encounters with wildlife and powerful archetypes with Dreamly AI's detailed symbol reflections.",
      buttonText: "Explore Dreamly AI"
    }
  },

  // 17. Sleep Paralysis & Waking Awareness
  {
    id: "sleep-paralysis",
    title: "Sleep Paralysis: Biology, Shadow Figures & How to Stay Calm",
    category: "dream_science",
    keywords: [
      "sleep paralysis causes",
      "waking up unable to move",
      "shadow person sleep paralysis",
      "how to break out of sleep paralysis",
      "hypnopompic hallucinations science"
    ],
    searchIntent: "Demystifying sleep paralysis through neurobiology—explaining REM atonia overlap, hallucinations, and safety techniques.",
    socialAngles: [
      "The terrifying science of waking up frozen",
      "Why sleep paralysis creates 'shadow figures' in the room",
      "The easiest physical trick to break sleep paralysis in seconds"
    ],
    priority: 17,
    appCTA: {
      headline: "Learn Safe Sleep Science",
      body: "Gain clear educational insights into sleep cycles and nighttime phenomena with Dreamly AI.",
      buttonText: "Learn Sleep Insights"
    }
  },

  // 18. Unable to Speak or Run
  {
    id: "unable-to-speak-or-run",
    title: "Unable to Speak or Run in Dreams: REM Motor Atonia Explained",
    category: "dream_science",
    keywords: [
      "cant scream in dream",
      "cant run fast in dream",
      "slow motion running dream",
      "losing voice in dream meaning",
      "muscle paralysis during dreams"
    ],
    searchIntent: "Explaining the physical disconnect between the motor cortex and paralyzed sleep muscles during active dream states.",
    socialAngles: [
      "Ever tried to scream in a dream and no sound came out?",
      "Why you run like you are underwater in dreams",
      "How your brain paralyzes your body to keep you safe at night"
    ],
    priority: 18,
    appCTA: {
      headline: "Understand Dream Biology",
      body: "Distinguish fascinating sleep science facts from interpretive reflections with Dreamly AI.",
      buttonText: "Download Dreamly AI"
    }
  },

  // 19. Driving Out of Control
  {
    id: "driving-out-of-control",
    title: "Driving Out of Control in Dreams: Brakes Failing & Life Direction",
    category: "common_dreams",
    keywords: [
      "brakes not working in dream",
      "driving car out of control dream",
      "car sliding backwards dream",
      "passenger in runaway car dream",
      "car crash dream psychology"
    ],
    searchIntent: "Investigating autonomy, life pacing, career pressure, and loss of directional agency represented through vehicular dreams.",
    socialAngles: [
      "Brakes failing in your dream? What your subconscious is navigating",
      "Who is in the driver seat? The psychology of vehicle dreams",
      "How to regain a sense of direction when waking up from car dreams"
    ],
    priority: 19,
    appCTA: {
      headline: "Steer Your Life Reflections",
      body: "Log your thoughts and regain clarity through structured dream reflections in Dreamly AI.",
      buttonText: "Try Dreamly AI Free"
    }
  },

  // 20. Discovering Hidden Rooms
  {
    id: "discovering-hidden-rooms",
    title: "Discovering Hidden Rooms in Dreams: Untapped Potential & Exploration",
    category: "reflection",
    keywords: [
      "dreaming of extra rooms in house",
      "discovering hidden doors in dream",
      "secret room dream meaning",
      "house dream psychology",
      "expanding house dream symbolism"
    ],
    searchIntent: "Exploring architectural dream metaphors—the house as the self, and secret rooms as emerging talents, passions, or memories.",
    socialAngles: [
      "Dreaming of finding secret rooms in your house? Here is why",
      "The house as the psyche: what new doors represent",
      "How discovering hidden rooms signals personal growth"
    ],
    priority: 20,
    appCTA: {
      headline: "Explore Your Inner World",
      body: "Uncover new perspectives and personal growth insights with Dreamly AI dream reflections.",
      buttonText: "Start Exploring"
    }
  },

  // 21. Lucid Dreaming Triggers
  {
    id: "lucid-dreaming",
    title: "Lucid Dreaming: How to Recognize You Are Dreaming and Take Awareness",
    category: "lucid_vivid",
    keywords: [
      "how to lucid dream",
      "lucid dream triggers",
      "reality checks for dreaming",
      "recognizing you are in a dream",
      "lucid dream techniques beginners"
    ],
    searchIntent: "Practical methods (reality checks, dream signs, journaling) to cultivate conscious awareness inside the dream world.",
    socialAngles: [
      "3 simple reality checks to trigger your first lucid dream",
      "How keeping a dream journal triples your lucid dream chances",
      "What to do the moment you realize you are dreaming"
    ],
    priority: 21,
    appCTA: {
      headline: "Develop Lucid Dreaming Habits",
      body: "Build a consistent morning dream journaling habit with Dreamly AI to boost dream recall and lucidity.",
      buttonText: "Start Lucid Journaling"
    }
  }
]);

// Initialize and freeze all topic models
const DREAM_TOPIC_REGISTRY = Object.freeze(RAW_TOPICS.map(createDreamTopic));
const TOPIC_ID_MAP = Object.freeze(
  new Map(DREAM_TOPIC_REGISTRY.map((topic) => [topic.id, topic]))
);

/**
 * Returns all registered dream topics.
 * @returns {ReadonlyArray<object>}
 */
function getAllTopics() {
  return DREAM_TOPIC_REGISTRY;
}

/**
 * Returns a topic by its unique ID slug or undefined if not found.
 * @param {string} id
 * @returns {object|undefined}
 */
function getTopicById(id) {
  if (typeof id !== "string") return undefined;
  return TOPIC_ID_MAP.get(id.trim().toLowerCase());
}

/**
 * Returns topics belonging to a specific category.
 * @param {string} category
 * @returns {object[]}
 */
function getTopicsByCategory(category) {
  if (typeof category !== "string") return [];
  const cleanCat = category.trim().toLowerCase();
  return DREAM_TOPIC_REGISTRY.filter(
    (topic) => topic.category.toLowerCase() === cleanCat
  );
}

/**
 * Returns topics filtered and sorted by priority (1 = highest priority).
 * @param {number} [maxPriority=100] Maximum priority rank to include
 * @returns {object[]}
 */
function getTopicsByPriority(maxPriority = 100) {
  return DREAM_TOPIC_REGISTRY.filter((t) => t.priority <= maxPriority).sort(
    (a, b) => a.priority - b.priority
  );
}

/**
 * Searches topics across title, keywords, and description.
 * @param {string} query
 * @returns {object[]}
 */
function searchTopics(query) {
  if (typeof query !== "string" || query.trim().length === 0) return [];
  const normalizedQuery = query.trim().toLowerCase();
  return DREAM_TOPIC_REGISTRY.filter((topic) => {
    return (
      topic.title.toLowerCase().includes(normalizedQuery) ||
      topic.id.toLowerCase().includes(normalizedQuery) ||
      topic.searchIntent.toLowerCase().includes(normalizedQuery) ||
      topic.keywords.some((k) => k.toLowerCase().includes(normalizedQuery)) ||
      topic.socialAngles.some((a) => a.toLowerCase().includes(normalizedQuery))
    );
  });
}

module.exports = {
  RAW_TOPICS,
  DREAM_TOPIC_REGISTRY,
  getAllTopics,
  getTopicById,
  getTopicsByCategory,
  getTopicsByPriority,
  searchTopics
};
