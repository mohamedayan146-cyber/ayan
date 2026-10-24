import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createContent } from "./src/content.js";
import { createHeader, createThumbnail, toReport } from "./src/visuals.js";
import { createNarration, VOICES } from "./src/audio.js";
import { exportSuite } from "./src/exporter.js";

async function askOptions() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  let topic = "";
  while (!topic) topic = (await rl.question("📝 Topic: ")).trim();

  const tone = (await rl.question("🎯 Tone [informative and engaging]: ")).trim() || "informative and engaging";

  console.log(`🎙️  Voices: ${VOICES.join(", ")}`);
  let voice = (await rl.question("   Narration voice [nova]: ")).trim().toLowerCase();
  if (!VOICES.includes(voice)) voice = "nova";

  const emotion = (await rl.question("   Narration emotion [warm and enthusiastic]: ")).trim() || "warm and enthusiastic";

  rl.close();
  return { topic, tone, voice, emotion };
}

async function main() {
  console.log("=== Content Suite Generator ===\n");
  const { topic, tone, voice, emotion } = await askOptions();

  // Step 1: Content (required)
  console.log("\n✍️  Writing article, summary and social posts...");
  const content = await createContent(topic, tone);
  console.log(`   Title: ${content.title}`);

  // Steps 2 + 3: images and narration run in parallel; each has its own fallbacks
  console.log("\n🎨🎧 Creating header, thumbnail and narration...");
  const [header, thumbnail, narration] = await Promise.all([
    createHeader(content.title, topic),
    createThumbnail(content.title, topic),
    createNarration(content.article, { voice, emotion }),
  ]);

  // Step 5: Export whatever succeeded
  console.log("\n📦 Packaging suite...");
  const result = await exportSuite({
    topic,
    tone,
    voice,
    emotion,
    content,
    assets: { header: header.value, thumbnail: thumbnail.value, audio: narration.value },
    report: { header: toReport(header), thumbnail: toReport(thumbnail), narration: toReport(narration) },
  });

  // Step 4: Final quality report
  console.log("\n📊 Report:");
  for (const [step, r] of Object.entries(result.report)) {
    console.log(`   ${r.status === "ok" ? "✅" : "❌"} ${step.padEnd(10)} ${r.used ?? "FAILED"}`);
  }
  console.log(`\n📁 Folder: ${result.folder}`);
  console.log(`🗜️  Zip:    ${result.zipPath}`);
  console.log("🌐 Open index.html in the folder to preview everything.");
}

main().catch((err) => {
  console.error("\nFatal error:", err.message);
  process.exit(1);
});