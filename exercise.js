import "dotenv/config";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Add it to your .env file.");
  process.exit(1);
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const QUICK = process.argv.includes("--quick"); // square only = cheaper test

// Each model supports different sizes and options
const MODELS = {
  "gpt-image-1": {
    sizes: { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" },
    styles: [null], // gpt-image-1 has no vivid/natural style option
    extra: { quality: "medium" },
  },
  "dall-e-3": {
    sizes: { square: "1024x1024", landscape: "1792x1024", portrait: "1024x1792" },
    styles: ["vivid", "natural"],
    extra: { quality: "standard", response_format: "b64_json" },
  },
};

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

const escapeHtml = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Step 2-4: build every combination of model x size x style
function buildJobs(theme) {
  const jobs = [];
  for (const [model, cfg] of Object.entries(MODELS)) {
    const sizeEntries = Object.entries(cfg.sizes).filter(([name]) => !QUICK || name === "square");
    for (const [sizeName, size] of sizeEntries) {
      for (const style of cfg.styles) {
        jobs.push({ model, sizeName, size, style, extra: cfg.extra, theme });
      }
    }
  }
  return jobs;
}

// Generate one image and save it; never throws so one failure doesn't stop the rest
async function runJob(job, outDir) {
  const { model, sizeName, size, style, extra, theme } = job;
  const fileName = `${model}_${sizeName}${style ? `_${style}` : ""}.png`;
  const started = Date.now();

  const meta = {
    model,
    prompt: theme,
    sizeName,
    size,
    style: style ?? "n/a",
    quality: extra.quality,
    file: fileName,
    createdAt: new Date().toISOString(),
  };

  try {
    const res = await client.images.generate({
      model,
      prompt: theme,
      n: 1,
      size,
      ...extra,
      ...(style && { style }),
    });

    const image = res.data[0];
    const buffer = Buffer.from(image.b64_json, "base64");
    await fs.writeFile(path.join(outDir, fileName), buffer);

    return {
      ...meta,
      status: "ok",
      durationMs: Date.now() - started,
      fileSizeKB: Math.round(buffer.length / 1024),
      revisedPrompt: image.revised_prompt ?? null, // DALL-E 3 rewrites your prompt
    };
  } catch (err) {
    return { ...meta, status: "error", durationMs: Date.now() - started, error: err.message };
  }
}

// Step 6: build an HTML gallery grouped by model
function buildGallery(theme, results) {
  const byModel = {};
  for (const r of results) (byModel[r.model] ??= []).push(r);

  const sections = Object.entries(byModel)
    .map(([model, items]) => {
      const cards = items
        .map((r) =>
          r.status === "ok"
            ? `<figure class="card">
  <img src="${escapeHtml(r.file)}" alt="${escapeHtml(r.theme)}" loading="lazy">
  <figcaption>
    <strong>${escapeHtml(r.sizeName)}</strong> · ${escapeHtml(r.size)}<br>
    Style: ${escapeHtml(r.style)} · Quality: ${escapeHtml(r.quality)}<br>
    ${(r.durationMs / 1000).toFixed(1)}s · ${r.fileSizeKB} KB
    ${r.revisedPrompt ? `<details><summary>Revised prompt</summary>${escapeHtml(r.revisedPrompt)}</details>` : ""}
  </figcaption>
</figure>`
            : `<figure class="card error"><figcaption><strong>${escapeHtml(r.sizeName)}${r.style !== "n/a" ? " / " + escapeHtml(r.style) : ""}</strong><br>Failed: ${escapeHtml(r.error)}</figcaption></figure>`
        )
        .join("\n");
      return `<h2>${escapeHtml(model)}</h2><div class="grid">${cards}</div>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gallery: ${escapeHtml(theme)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#111;color:#eee;margin:0;padding:24px}
  h1{margin-top:0} h2{border-bottom:1px solid #333;padding-bottom:8px;margin-top:32px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px}
  .card{background:#1c1c1c;border-radius:10px;overflow:hidden;margin:0}
  .card img{width:100%;display:block}
  figcaption{padding:12px;font-size:13px;line-height:1.5;color:#bbb}
  .error{border:1px solid #a33}
  details{margin-top:6px} summary{cursor:pointer;color:#8ab4ff}
</style></head><body>
<h1>🎨 ${escapeHtml(theme)}</h1>
<p>${results.filter((r) => r.status === "ok").length} of ${results.length} images generated</p>
${sections}
</body></html>`;
}

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  let theme = "";
  while (!theme) {
    theme = (await rl.question(' Enter a theme (e.g. "cyberpunk cityscape"): ')).trim();
  }
  rl.close();

  // Each run gets its own folder
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join("output", `${slugify(theme)}_${stamp}`);
  await fs.mkdir(outDir, { recursive: true });

  const jobs = buildJobs(theme);
  console.log(`\nGenerating ${jobs.length} images${QUICK ? " (quick mode)" : ""}...\n`);

  const results = [];
  for (const [i, job] of jobs.entries()) {
    const label = `${job.model} | ${job.sizeName}${job.style ? ` | ${job.style}` : ""}`;
    stdout.write(`[${i + 1}/${jobs.length}] ${label} ... `);
    const result = await runJob(job, outDir);
    console.log(result.status === "ok" ? `✅ ${(result.durationMs / 1000).toFixed(1)}s` : `❌ ${result.error}`);
    results.push(result);
  }

  // Step 5: metadata
  await fs.writeFile(
    path.join(outDir, "metadata.json"),
    JSON.stringify({ theme, generatedAt: new Date().toISOString(), results }, null, 2)
  );

  // Step 6: gallery
  await fs.writeFile(path.join(outDir, "gallery.html"), buildGallery(theme, results));

  console.log(`\n📁 Saved to ${outDir}`);
  console.log(`🖼️  Open ${path.join(outDir, "gallery.html")} in your browser`);
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});