import "dotenv/config";
import OpenAI from "openai";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const MODEL = "gpt-4o-mini";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Add it to your .env file.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rl = readline.createInterface({ input: stdin, output: stdout });

// Bonus: temperature control (creative = more random, factual = more precise)
const MODES = {
  1: { name: "Factual", temperature: 0.2 },
  2: { name: "Balanced", temperature: 0.7 },
  3: { name: "Creative", temperature: 1.0 },
};

// Streams the response to the terminal token-by-token and returns the full text
async function streamChat(messages, temperature) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature,
    stream: true,
  });

  let fullText = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    stdout.write(token);
    fullText += token;
  }
  stdout.write("\n");
  return fullText;
}

async function askTopic() {
  let topic = "";
  while (!topic) {
    topic = (await rl.question(" Enter a blog topic: ")).trim();
  }
  return topic;
}

async function askMode() {
  console.log("\nChoose a style:");
  Object.entries(MODES).forEach(([key, m]) =>
    console.log(`  ${key}. ${m.name} (temperature ${m.temperature})`)
  );
  const choice = (await rl.question("Your choice [1-3, default 2]: ")).trim();
  return MODES[choice] ?? MODES[2];
}

async function main() {
  console.log("=== Smart Content Assistant ===\n");

  const topic = await askTopic();
  const mode = await askMode();

  // Conversation history lets the model remember context for follow-ups
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful content assistant and expert blog writer. Be clear and well-organized.",
    },
  ];

  try {
    // Steps 2 + 3: generate outline with streaming
    console.log(`\n Generating outline (${mode.name} mode)...\n`);
    messages.push({
      role: "user",
      content: `Create a detailed blog post outline about: ${topic}. Include a title, introduction, 4-6 main sections with sub-points, and a conclusion.`,
    });
    const outline = await streamChat(messages, mode.temperature);
    messages.push({ role: "assistant", content: outline });

    // Step 4: summarize in exactly 2 sentences
    console.log("\n Summary:\n");
    messages.push({
      role: "user",
      content: "Summarize this outline in exactly 2 sentences.",
    });
    const summary = await streamChat(messages, 0.2);
    messages.push({ role: "assistant", content: summary });

    // Step 5: follow-up questions loop
    console.log("\n Ask follow-up questions about the topic (type 'exit' to quit).\n");
    while (true) {
      const question = (await rl.question("You: ")).trim();
      if (!question) continue;
      if (["exit", "quit"].includes(question.toLowerCase())) break;

      messages.push({ role: "user", content: question });
      stdout.write("\nAssistant: ");
      const answer = await streamChat(messages, mode.temperature);
      messages.push({ role: "assistant", content: answer });
      console.log();
    }
  } catch (err) {
    console.error("\n Error:", err.message);
  } finally {
    rl.close();
    console.log("Goodbye! ");
  }
}

main();import "dotenv/config";
import OpenAI from "openai";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

const MODEL = "gpt-4o-mini";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Add it to your .env file.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const rl = readline.createInterface({ input: stdin, output: stdout });

// Bonus: temperature control (creative = more random, factual = more precise)
const MODES = {
  1: { name: "Factual", temperature: 0.2 },
  2: { name: "Balanced", temperature: 0.7 },
  3: { name: "Creative", temperature: 1.0 },
};

// Streams the response to the terminal token-by-token and returns the full text
async function streamChat(messages, temperature) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    temperature,
    stream: true,
  });

  let fullText = "";
  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content ?? "";
    stdout.write(token);
    fullText += token;
  }
  stdout.write("\n");
  return fullText;
}

async function askTopic() {
  let topic = "";
  while (!topic) {
    topic = (await rl.question(" Enter a blog topic: ")).trim();
  }
  return topic;
}

async function askMode() {
  console.log("\nChoose a style:");
  Object.entries(MODES).forEach(([key, m]) =>
    console.log(`  ${key}. ${m.name} (temperature ${m.temperature})`)
  );
  const choice = (await rl.question("Your choice [1-3, default 2]: ")).trim();
  return MODES[choice] ?? MODES[2];
}

async function main() {
  console.log("=== Smart Content Assistant ===\n");

  const topic = await askTopic();
  const mode = await askMode();

  // Conversation history lets the model remember context for follow-ups
  const messages = [
    {
      role: "system",
      content:
        "You are a helpful content assistant and expert blog writer. Be clear and well-organized.",
    },
  ];

  try {
    // Steps 2 + 3: generate outline with streaming
    console.log(`\n Generating outline (${mode.name} mode)...\n`);
    messages.push({
      role: "user",
      content: `Create a detailed blog post outline about: ${topic}. Include a title, introduction, 4-6 main sections with sub-points, and a conclusion.`,
    });
    const outline = await streamChat(messages, mode.temperature);
    messages.push({ role: "assistant", content: outline });

    // Step 4: summarize in exactly 2 sentences
    console.log("\n Summary:\n");
    messages.push({
      role: "user",
      content: "Summarize this outline in exactly 2 sentences.",
    });
    const summary = await streamChat(messages, 0.2);
    messages.push({ role: "assistant", content: summary });

    // Step 5: follow-up questions loop
    console.log("\n Ask follow-up questions about the topic (type 'exit' to quit).\n");
    while (true) {
      const question = (await rl.question("You: ")).trim();
      if (!question) continue;
      if (["exit", "quit"].includes(question.toLowerCase())) break;

      messages.push({ role: "user", content: question });
      stdout.write("\nAssistant: ");
      const answer = await streamChat(messages, mode.temperature);
      messages.push({ role: "assistant", content: answer });
      console.log();
    }
  } catch (err) {
    console.error("\n Error:", err.message);
  } finally {
    rl.close();
    console.log("Goodbye! ");
  }
}

main();