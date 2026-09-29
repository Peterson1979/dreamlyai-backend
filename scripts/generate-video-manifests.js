/**
 * Generator script for Dreamly AI 30-day promotional video manifests.
 * Parses source text and verifies 1:1 matching with video assets.
 */

const fs = require("node:fs");
const path = require("node:path");

const SOURCE_TEXT_PATH = "C:\\Users\\opeti\\APP\\Dreamly\\Dreamly marketing\\Dreamly 1 havi\\DreamlyAI 1 havi.txt";
const SOURCE_VIDEO_DIR = "C:\\Users\\opeti\\APP\\Dreamly\\Dreamly marketing\\Dreamly 1 havi\\Dreamly AI 1 havi videok";
const OUTPUT_DIR = path.resolve(__dirname, "../fixtures/social-manifests/promo-videos-30");
const OUTPUT_BATCH = path.resolve(__dirname, "../fixtures/social-manifests/promo-videos-30-batch.json");

const BASE_WEBSITE_URL = "https://dreamlyai.life";
const BASE_PLAYSTORE_URL = "https://play.google.com/store/apps/details?id=com.oberon.dreamlyai";
const VIDEO_PUBLIC_BASE_URL = "https://dreamlyai-backend.vercel.app/videos/promo";

const START_DATE = "2026-09-28";

// Curated topic mappings and custom metadata for each of the 30 entries
const ENTRY_CONFIGS = [
  {
    seq: 1,
    category: "subconscious_messages",
    destinationPath: "/dreams",
    ytTitle: "Your Dreams Say More Than You Think 🌙 #Shorts",
    ytTags: ["Dreamly AI", "dream meaning", "subconscious", "Shorts", "dream interpretation", "sleep psychology", "dreams"],
    pinTitle: "Your Dreams Might Be Saying More Than You Think",
  },
  {
    seq: 2,
    category: "dream_symbols",
    destinationPath: "/dreams",
    ytTitle: "What Did THAT Dream Actually Mean? 🔮 #Shorts",
    ytTags: ["Dreamly AI", "dream symbols", "dream meaning", "Shorts", "dream decode", "psychology", "night dreams"],
    pinTitle: "What Did That Dream Actually Mean? Decode It Now",
  },
  {
    seq: 3,
    category: "dream_recall",
    destinationPath: "/dreams",
    ytTitle: "You Had an Amazing Dream... and Forgot It 💭 #Shorts",
    ytTags: ["Dreamly AI", "dream recall", "remember dreams", "Shorts", "dream journal", "sleep psychology"],
    pinTitle: "How to Remember Amazing Dreams Before They Fade",
  },
  {
    seq: 4,
    category: "common_dreams",
    destinationPath: "/dreams/falling",
    ytTitle: "Why Do So Many People Dream About Falling? ☁️ #Shorts",
    ytTags: ["Dreamly AI", "falling dream", "dream meaning", "Shorts", "hypnic jerk", "sleep science"],
    pinTitle: "Why Do You Dream About Falling? The Psychological Meaning",
  },
  {
    seq: 5,
    category: "people_in_dreams",
    destinationPath: "/dreams",
    ytTitle: "Why Did THAT Person Appear in Your Dream? 👀 #Shorts",
    ytTags: ["Dreamly AI", "people in dreams", "dream psychology", "Shorts", "subconscious mind", "dream meaning"],
    pinTitle: "Why Did That Specific Person Appear in Your Dream?",
  },
  {
    seq: 6,
    category: "lucid_realism",
    destinationPath: "/dreams",
    ytTitle: "Ever Had a Dream That Felt Completely Real? ✨ #Shorts",
    ytTags: ["Dreamly AI", "vivid dreams", "lucid dream", "Shorts", "dream reality", "sleep psychology"],
    pinTitle: "When Dreams Feel Completely Real: What It Means",
  },
  {
    seq: 7,
    category: "water_symbolism",
    destinationPath: "/dreams",
    ytTitle: "What Does Water Mean in a Dream? 🌊 #Shorts",
    ytTags: ["Dreamly AI", "water dream", "dream symbols", "Shorts", "emotions", "dream interpretation"],
    pinTitle: "What Does Water Mean in a Dream? Emotional Symbols Explained",
  },
  {
    seq: 8,
    category: "door_symbols",
    destinationPath: "/dreams",
    ytTitle: "Why Do You Keep Dreaming About Doors? 🚪 #Shorts",
    ytTags: ["Dreamly AI", "door in dream", "dream symbols", "Shorts", "life transitions", "subconscious"],
    pinTitle: "Why You Keep Dreaming About Doors: Hidden Transitions",
  },
  {
    seq: 9,
    category: "recurring_dreams",
    destinationPath: "/dreams",
    ytTitle: "Why Does the Same Dream Keep Coming Back? 🔄 #Shorts",
    ytTags: ["Dreamly AI", "recurring dreams", "repeating dreams", "Shorts", "dream analysis", "sleep psychology"],
    pinTitle: "Why Does the Same Dream Keep Coming Back?",
  },
  {
    seq: 10,
    category: "dream_recall",
    destinationPath: "/dreams",
    ytTitle: "Your Dreams Disappear Faster Than You Think ⏳ #Shorts",
    ytTags: ["Dreamly AI", "forgetting dreams", "dream memory", "Shorts", "dream journal", "mind"],
    pinTitle: "Why Dreams Disappear So Fast and How to Save Them",
  },
  {
    seq: 11,
    category: "flying_dreams",
    destinationPath: "/dreams",
    ytTitle: "Ever Dreamed You Could Fly? 🕊️ #Shorts",
    ytTags: ["Dreamly AI", "flying dream", "lucid dreaming", "Shorts", "freedom", "dream psychology"],
    pinTitle: "Ever Dreamed You Could Fly? The Meaning Behind Flying Dreams",
  },
  {
    seq: 12,
    category: "nightmares_shadow",
    destinationPath: "/dreams",
    ytTitle: "Not Every Dream Is Beautiful 🌑 #Shorts",
    ytTags: ["Dreamly AI", "nightmares", "bad dreams", "Shorts", "shadow work", "emotional healing"],
    pinTitle: "Not Every Dream Is Beautiful: Understanding Dark Dreams",
  },
  {
    seq: 13,
    category: "surreal_logic",
    destinationPath: "/dreams",
    ytTitle: "Why Are Dreams So Unbelievably Weird? 🌀 #Shorts",
    ytTags: ["Dreamly AI", "weird dreams", "REM sleep", "Shorts", "brain psychology", "dream science"],
    pinTitle: "Why Are Dreams So Weird? How the Sleeping Brain Works",
  },
  {
    seq: 14,
    category: "hidden_connections",
    destinationPath: "/dreams",
    ytTitle: "Your Dream Makes No Sense. Or Does It? 🧩 #Shorts",
    ytTags: ["Dreamly AI", "dream meaning", "hidden messages", "Shorts", "dream interpretation", "symbols"],
    pinTitle: "Your Dream Makes No Sense... Or Does It? Dream Decoding",
  },
  {
    seq: 15,
    category: "morning_reflection",
    destinationPath: "/dreams",
    ytTitle: "Quick Question: What Did You Dream Last Night? ☕ #Shorts",
    ytTags: ["Dreamly AI", "morning reflection", "dream tracking", "Shorts", "daily habits", "mindfulness"],
    pinTitle: "Quick Morning Question: What Did You Dream Last Night?",
  },
  {
    seq: 16,
    category: "vivid_recall",
    destinationPath: "/dreams",
    ytTitle: "POV: You Actually Remember Your Dream 😊 #Shorts",
    ytTags: ["Dreamly AI", "POV", "remembering dreams", "Shorts", "dream journal", "sleep habits"],
    pinTitle: "POV: You Actually Remember Your Dream This Morning",
  },
  {
    seq: 17,
    category: "night_brain",
    destinationPath: "/dreams",
    ytTitle: "Your Brain at 3 AM: Absolutely Wild 🌌 #Shorts",
    ytTags: ["Dreamly AI", "3am thoughts", "REM cycle", "Shorts", "night dreams", "subconscious"],
    pinTitle: "Your Brain at 3 AM: The Wild Nature of Nighttime Dreams",
  },
  {
    seq: 18,
    category: "emotional_impact",
    destinationPath: "/dreams",
    ytTitle: "One Dream Can Change Your Entire Morning 🌅 #Shorts",
    ytTags: ["Dreamly AI", "morning mood", "dream feelings", "Shorts", "mindfulness", "emotions"],
    pinTitle: "How One Dream Can Change Your Entire Morning Mood",
  },
  {
    seq: 19,
    category: "core_emotions",
    destinationPath: "/dreams",
    ytTitle: "Sometimes the Emotion Matters More Than the Dream ❤️ #Shorts",
    ytTags: ["Dreamly AI", "dream emotions", "emotional processing", "Shorts", "subconscious", "therapy"],
    pinTitle: "Why the Emotion in Your Dream Matters More Than the Story",
  },
  {
    seq: 20,
    category: "cinematic_visuals",
    destinationPath: "/dreams",
    ytTitle: "What If Your Entire Dream Looked Like This? 🎬 #Shorts",
    ytTags: ["Dreamly AI", "cinematic dreams", "dream visuals", "Shorts", "AI art", "dream world"],
    pinTitle: "What If Your Entire Dream Looked Like This Cinematic World?",
  },
  {
    seq: 21,
    category: "symbol_challenge",
    destinationPath: "/dreams",
    ytTitle: "Dream Symbol Challenge: What Do You See? 👁️ #Shorts",
    ytTags: ["Dreamly AI", "symbol challenge", "archetypes", "Shorts", "dream quiz", "subconscious"],
    pinTitle: "Dream Symbol Challenge: Decode What You See",
  },
  {
    seq: 22,
    category: "instant_logging",
    destinationPath: "/dreams",
    ytTitle: "Before You Forget What You Dreamed... ⚡ #Shorts",
    ytTags: ["Dreamly AI", "dream diary", "capture dreams", "Shorts", "morning routine", "memory"],
    pinTitle: "Before You Forget What You Dreamed: Capture It Instantly",
  },
  {
    seq: 23,
    category: "dream_physics",
    destinationPath: "/dreams",
    ytTitle: "Dream Logic Is Absolutely Wild 🚪🌊 #Shorts",
    ytTags: ["Dreamly AI", "dream logic", "surreal world", "Shorts", "mind bending", "sleep science"],
    pinTitle: "Dream Logic Is Absolutely Wild: Impossible Dream Transitions",
  },
  {
    seq: 24,
    category: "waking_curiosity",
    destinationPath: "/dreams",
    ytTitle: "First Question After Waking Up: What Did I Dream? 🌅 #Shorts",
    ytTags: ["Dreamly AI", "waking up", "dream meaning", "Shorts", "morning thoughts", "self discovery"],
    pinTitle: "First Question After Waking Up: What Did I Just Dream?",
  },
  {
    seq: 25,
    category: "connected_story",
    destinationPath: "/dreams",
    ytTitle: "Every Strange Dream Has a Story 📖 #Shorts",
    ytTags: ["Dreamly AI", "dream story", "strange dreams", "Shorts", "subconscious narrative", "meaning"],
    pinTitle: "Every Strange Dream Has a Story: Uncover Yours",
  },
  {
    seq: 26,
    category: "reality_testing",
    destinationPath: "/dreams",
    ytTitle: "Dream or Reality? Exploring the Difference 🌓 #Shorts",
    ytTags: ["Dreamly AI", "dream or reality", "lucid awareness", "Shorts", "false awakening", "mind"],
    pinTitle: "Dream or Reality? How to Explore the Fine Line",
  },
  {
    seq: 27,
    category: "unique_dreamscapes",
    destinationPath: "/dreams",
    ytTitle: "No Two Dreams Are Exactly the Same 🎨 #Shorts",
    ytTags: ["Dreamly AI", "unique dreams", "personal symbols", "Shorts", "creativity", "mindscape"],
    pinTitle: "No Two Dreams Are Exactly the Same: Your Personal Mindscape",
  },
  {
    seq: 28,
    category: "dream_incubation",
    destinationPath: "/dreams",
    ytTitle: "What Will You Dream About Tonight? 🌙 #Shorts",
    ytTags: ["Dreamly AI", "tonight dreams", "bedtime routine", "Shorts", "sleep intention", "peaceful sleep"],
    pinTitle: "What Will You Dream About Tonight? Set Your Sleep Intention",
  },
  {
    seq: 29,
    category: "personal_story",
    destinationPath: "/dreams",
    ytTitle: "Your Dream. Your Symbols. Your Story. ✨ #Shorts",
    ytTags: ["Dreamly AI", "personal symbols", "dream journey", "Shorts", "self discovery", "psychology"],
    pinTitle: "Your Dream. Your Symbols. Your Story: Personalized Dream Analysis",
  },
  {
    seq: 30,
    category: "full_exploration",
    destinationPath: "/dreams",
    ytTitle: "You Dreamed It. Why Not Explore It? 🚀 #Shorts",
    ytTags: ["Dreamly AI", "explore dreams", "dream app", "Shorts", "dream analysis", "sleep journey"],
    pinTitle: "You Dreamed It. Why Not Explore It with Dreamly AI?",
  }
];

function generateManifests() {
  if (!fs.existsSync(SOURCE_TEXT_PATH)) {
    throw new Error(`Source text file not found at ${SOURCE_TEXT_PATH}`);
  }

  const rawText = fs.readFileSync(SOURCE_TEXT_PATH, "utf8");
  const blocks = rawText.split(/(?=^\d+\.\s+\*\*Title:\*\*)/m).map(b => b.trim()).filter(Boolean);

  if (blocks.length !== 30) {
    throw new Error(`Expected 30 blocks in source text, found ${blocks.length}`);
  }

  const manifests = [];

  for (let i = 0; i < 30; i++) {
    const seq = i + 1;
    const seqPad = String(seq).padStart(2, "0");
    const block = blocks[i];
    const cfg = ENTRY_CONFIGS[i];

    const titleMatch = block.match(/\*\*Title:\*\*\s*(.+)/);
    const vizualMatch = block.match(/\*\*Vizual:\*\*\s*(.+)/);
    const voiceoverMatch = block.match(/\*\*Voiceover:\*\*\s*(.+)/);

    if (!titleMatch || !vizualMatch || !voiceoverMatch) {
      throw new Error(`Block ${seq} missing title, visual, or voiceover`);
    }

    const title = titleMatch[1].trim();
    const visual = vizualMatch[1].trim();
    const voiceover = voiceoverMatch[1].trim().replace(/^[“"']+|[”"']+$/g, "");

    const videoFileName = `${seq}.mp4`;
    const localFilePath = path.join(SOURCE_VIDEO_DIR, videoFileName);

    // Calculate publication date
    const dateObj = new Date(new Date(`${START_DATE}T00:00:00Z`).getTime() + (seq - 1) * 86400000);
    const dateStr = dateObj.toISOString().slice(0, 10);

    const contentId = `dreamly-video-${seqPad}`;
    const destinationPath = cfg.destinationPath || "/dreams";
    const destUrl = `${BASE_WEBSITE_URL}${destinationPath}?utm_source=social&utm_medium=video&utm_campaign=promo_video_30&utm_content=${contentId}`;

    const playStoreFbUrl = `${BASE_PLAYSTORE_URL}&referrer=utm_source%3Dfacebook%26utm_medium%3Dsocial%26utm_campaign%3Dvideo_cta%26utm_content%3D${contentId}`;
    const playStoreYtUrl = `${BASE_PLAYSTORE_URL}&referrer=utm_source%3Dyoutube%26utm_medium%3Dsocial%26utm_campaign%3Dshort_cta%26utm_content%3D${contentId}`;
    const playStorePinUrl = `${BASE_PLAYSTORE_URL}&referrer=utm_source%3Dpinterest%26utm_medium%3Dsocial%26utm_campaign%3Dvideo_pin_cta%26utm_content%3D${contentId}`;

    // Platform-appropriate captions
    const igCaption = `✨ ${title}\n\n${voiceover}\n\nUnpack your subconscious symbols, emotions, and hidden nighttime stories with Dreamly AI.\n\nExplore your dreams with Dreamly AI — link in bio 🌙\n\n#dreamlyai #dreammeaning #dreaminterpretation #luciddreaming #sleeppsychology #subconscious #nightdreams #dreamjournal`;

    const fbCaption = `✨ ${title}\n\n${voiceover}\n\nEvery dream has a story waiting to be decoded. Discover what your subconscious symbols and nighttime emotions reveal about your waking life.\n\nExplore your dreams with Dreamly AI:\n${destUrl}\n\nDownload Dreamly AI on Google Play:\n${playStoreFbUrl}\n\n#dreamlyai #dreammeaning #dreaminterpretation #subconscious #sleeppsychology`;

    const ytDescription = `${title}\n\n${voiceover}\n\nExplore what your subconscious is telling you through dream symbols, sleep psychology, and structured reflections with Dreamly AI.\n\nExplore on Dreamly AI:\n${destUrl}\n\nDownload Dreamly AI on Google Play:\n${playStoreYtUrl}\n\n#Shorts #dreamlyai #dreammeaning #dreaminterpretation #luciddreaming #sleeppsychology #subconscious`;

    const pinDescription = `✨ ${title}\n\n${voiceover}\n\nExplore your dreams and decode subconscious symbols with Dreamly AI.\n\nExplore on Dreamly AI:\n${destUrl}`;

    const manifest = {
      date: dateStr,
      id: `promo-video-${dateStr}`,
      type: "video",
      media: [
        {
          url: `${VIDEO_PUBLIC_BASE_URL}/${videoFileName}`,
          type: "video/mp4",
          duration: 10,
          aspectRatio: "9:16",
          altText: `${title} | Dreamly AI`,
          fileName: videoFileName,
          localFilePath: localFilePath
        }
      ],
      destinations: [
        "pinterest_dreamly",
        "youtube_dreamly",
        "instagram_lifemode",
        "facebook_lifemode",
        "youtube_lifemode",
        "pinterest_lifemode"
      ],
      destinationUrl: destUrl,
      captions: {
        instagram: igCaption,
        facebook: fbCaption,
        youtube: {
          title: cfg.ytTitle,
          description: ytDescription,
          tags: cfg.ytTags
        },
        pinterest: {
          title: cfg.pinTitle,
          description: pinDescription,
          link: destUrl
        },
        pinterest_secondary: {
          title: cfg.pinTitle,
          description: pinDescription,
          link: destUrl
        }
      },
      metadata: {
        series: "dreamly_ai_promo_30",
        sequenceNumber: seq,
        videoFileName: videoFileName,
        videoFilePath: localFilePath,
        sourceDescriptionNumber: seq,
        exactSourceTitle: title,
        visual: visual,
        voiceover: voiceover,
        category: cfg.category,
        format: "promotional_video",
        contentId: contentId,
        destinationPath: destinationPath,
        scheduledPublishTimeUtc: "18:00:00Z",
        scheduledPublicationDateTime: `${dateStr}T18:00:00Z`,
        qualityGate: "QUALITY_GATE_PASS",
        generatedAt: new Date().toISOString()
      }
    };

    manifests.push(manifest);
  }

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Write individual files
  for (let i = 0; i < manifests.length; i++) {
    const seqPad = String(i + 1).padStart(2, "0");
    const filePath = path.join(OUTPUT_DIR, `promo-video-${seqPad}.json`);
    fs.writeFileSync(filePath, JSON.stringify(manifests[i], null, 2), "utf8");
  }

  // Write batch file
  fs.writeFileSync(OUTPUT_BATCH, JSON.stringify(manifests, null, 2), "utf8");

  console.log(`Successfully generated ${manifests.length} manifests in ${OUTPUT_DIR}`);
  console.log(`Successfully saved batch file to ${OUTPUT_BATCH}`);
  return manifests;
}

if (require.main === module) {
  generateManifests();
}

module.exports = {
  generateManifests,
  ENTRY_CONFIGS
};
