import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Add it to your .env file.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// gpt-4o-mini-tts is the model that supports the `instructions` option
const MODEL = "gpt-4o-mini-tts";
const OUT_DIR = "output";

// Each speaker has their own voice and base personality/delivery instructions
const SPEAKERS = {
  Narrator: {
    voice: "fable",
    instructions: "Speak like a calm storyteller. Warm, steady pace, slightly mysterious.",
  },
  Maya: {
    voice: "nova",
    instructions: "You are a young, curious scientist. Bright, energetic and expressive.",
  },
  Leo: {
    voice: "onyx",
    instructions: "You are a deep-voiced, cautious engineer. Slow, serious and thoughtful.",
  },
};

// The conversation. Each line can add its own emotion on top of the speaker's base style.
const CONVERSATION = [
  { speaker: "Narrator", emotion: "Calm and atmospheric.", text: "Deep inside an old research lab, two colleagues made a strange discovery." },
  { speaker: "Maya", emotion: "Extremely excited, almost breathless.", text: "Leo, come quickly! The signal is real! We actually picked up a message from space!" },
  { speaker: "Leo", emotion: "Doubtful and suspicious, a little tired.", text: "Maya, that's the third time this week. It's probably just interference from the old radio tower." },
  { speaker: "Maya", emotion: "Hurt, then determined.", text: "No. Look at the pattern. It repeats every seven seconds. Nothing on Earth does that." },
  { speaker: "Leo", emotion: "Shocked, whispering with fear.", text: "You're right... that's impossible. It's... it's answering us." },
  { speaker: "Narrator", emotion: "Slow, dramatic and chilling.", text: "And in that quiet room, for the first time, the universe spoke back." },
];

// Combines the speaker's personality with the line's emotion
function buildInstructions(speaker, emotion) {
  return `${SPEAKERS[speaker].instructions} For this line: ${emotion}`;
}

async function speak(line) {
  const response = await client.audio.speech.create({
    model: MODEL,
    voice: SPEAKERS[line.speaker].voice,
    input: line.text,
    instructions: buildInstructions(line.speaker, line.emotion),
    response_format: "mp3",
  });
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const buffersBySpeaker = {}; // one audio file per speaker
  const fullConversation = []; // all lines in order

  for (const [i, line] of CONVERSATION.entries()) {
    process.stdout.write(`[${i + 1}/${CONVERSATION.length}] ${line.speaker} (${line.emotion}) ... `);
    try {
      const audio = await speak(line);
      (buffersBySpeaker[line.speaker] ??= []).push(audio);
      fullConversation.push(audio);
      console.log("✅");
    } catch (err) {
      console.log(`❌ ${err.message}`);
    }
  }

  // Save each voice as a separate audio file
  for (const [speaker, buffers] of Object.entries(buffersBySpeaker)) {
    const file = path.join(OUT_DIR, `${speaker.toLowerCase()}_${SPEAKERS[speaker].voice}.mp3`);
    await fs.writeFile(file, Buffer.concat(buffers));
    console.log(`💾 ${file}`);
  }

  // Bonus: the whole conversation in order
  if (fullConversation.length) {
    const file = path.join(OUT_DIR, "full_conversation.mp3");
    await fs.writeFile(file, Buffer.concat(fullConversation));
    console.log(`🎧 ${file}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});