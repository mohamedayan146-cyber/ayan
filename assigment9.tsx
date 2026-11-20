asc
export type Language = 'en' | 'so';

// Inngest's step tools, typed loosely so the agents can use them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StepLike = { run: (...args: any[]) => Promise<any> };

export type Plan = {
  isShoppingRequest: boolean;
  clarification: string | null;
  product: string;
  condition: 'new' | 'used' | 'any';
  country: string | null;
  currency: string | null;
  queries: string[];
};

export type SearchHit = { title: string; url: string; snippet: string };

export type Candidate = { url: string; title: string; store: string; snippet: string };

export type Offer = {
  url: string;
  store: string;
  title: string;
  price: number | null;
  currency: string | null;
  condition: 'new' | 'used' | 'refurbished' | 'unknown';
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  shipping: string | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
  isProductPage: boolean;
  matchesRequest: boolean;
  source: 'page' | 'snippet' | 'none';
};

export type RankedOffer = Offer & { rank: number; flags: string[]; trusted: boolean };

export type Comparison = {
  currency: string | null;
  ranking: RankedOffer[];
  unranked: { url: string; store: string; reason: string }[];
  stats: {
    count: number;
    cheapest: number;
    highest: number;
    average: number;
    savings: number;
    savingsPercent: number;
  } | null;
  bestPick: RankedOffer | null;
  report: { headline: string; recommendation: string; insights: string[]; warnings: string[] };
};

export type SearchStatus = 'queued' | 'routing' | 'searching' | 'reading' | 'analyzing' | 'done' | 'error';

export type SearchState = {
  id: string;
  query: string;
  status: SearchStatus;
  message: string;
  plan?: Plan;
  candidates?: Candidate[];
  readCount?: number;
  result?: Comparison;
  clarification?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};
import OpenAI from 'openai';
import type { z } from 'zod';

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

let client: OpenAI | null = null;
export function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// Pulls the first JSON object out of a model answer, even if it is wrapped in text or code fences
export function parseJsonLoose(text: string | null | undefined): unknown {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Returns null (instead of throwing) when the model's answer isn't usable
export async function askJson<T>(
  system: string,
  user: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>
): Promise<T | null> {
  const res = await getOpenAI().chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  const parsed = schema.safeParse(parseJsonLoose(res.choices[0]?.message?.content));
  return parsed.success ? parsed.data : null;
}
import type { SearchState } from './types';

// One shared Map, even if Next.js loads this file more than once in dev.
// Fine for local use. In production, keep results in a database (MongoDB, Redis...).
const globalStore = globalThis as unknown as { __priceSearches?: Map<string, SearchState> };
const searches = (globalStore.__priceSearches ??= new Map<string, SearchState>());

const MAX_ITEMS = 200;
const MAX_AGE_MS = 60 * 60 * 1000;

export function createSearch(id: string, query: string): SearchState {
  const now = Date.now();
  for (const [key, value] of searches) {
    if (now - value.updatedAt > MAX_AGE_MS) searches.delete(key);
  }
  while (searches.size >= MAX_ITEMS) {
    const oldest = searches.keys().next().value;
    if (oldest === undefined) break;
    searches.delete(oldest);
  }

  const state: SearchState = {
    id,
    query,
    status: 'queued',
    message: 'Waiting to start…',
    createdAt: now,
    updatedAt: now,
  };
  searches.set(id, state);
  return state;
}

export function updateSearch(id: string, patch: Partial<SearchState>) {
  const current = searches.get(id);
  if (!current) return;
  searches.set(id, { ...current, ...patch, updatedAt: Date.now() });
}

export const getSearch = (id: string) => searches.get(id);
import type { SearchHit } from '../types';

export async function webSearch(query: string, maxResults = 8): Promise<SearchHit[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error('TAVILY_API_KEY is missing. Get a free key at tavily.com.');

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', include_answer: false }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Web search failed (HTTP ${res.status}).`);

  const data = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title ?? '',
      url: r.url as string,
      snippet: (r.content ?? '').slice(0, 400),
    }));
}
export type PageRead = { ok: boolean; text: string; via: 'tavily' | 'fetch' | 'none'; error?: string };

const MAX_CHARS = 9000;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$)/i;

// Search results are untrusted, so never open internal addresses
export function isSafeUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    const host = url.hostname;
    return !PRIVATE_HOST.test(host) && !host.endsWith('.local') && !host.endsWith('.internal');
  } catch {
    return false;
  }
}

function htmlToText(html: string): string {
  // Many shops put the price in structured data, so keep it
  const jsonLd = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => m[1].trim())
    .join('\n')
    .slice(0, 5000);

  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  return jsonLd ? `STRUCTURED DATA:\n${jsonLd}\n\nPAGE TEXT:\n${body}` : body;
}

async function viaTavily(url: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ urls: [url] }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { raw_content?: string }[] };
    return data.results?.[0]?.raw_content?.trim() || null;
  } catch {
    return null;
  }
}

async function viaFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PriceFinderBot/1.0)', Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const html = (await res.text()).slice(0, 1_500_000);
    const text = htmlToText(html);
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

export async function readWebpage(url: string): Promise<PageRead> {
  if (!isSafeUrl(url)) return { ok: false, text: '', via: 'none', error: 'That address is not allowed.' };

  const extracted = await viaTavily(url);
  if (extracted) return { ok: true, text: extracted.slice(0, MAX_CHARS), via: 'tavily' };

  const fetched = await viaFetch(url);
  if (fetched) return { ok: true, text: fetched.slice(0, MAX_CHARS), via: 'fetch' };

  return { ok: false, text: '', via: 'none', error: 'The page could not be opened (it may block automated visits).' };
}
import { z } from 'zod';
import { askJson } from '../llm';
import type { Plan } from '../types';

const planSchema = z.object({
  isShoppingRequest: z.boolean().catch(true),
  clarification: z.string().nullable().catch(null),
  product: z.string().catch(''),
  condition: z.enum(['new', 'used', 'any']).catch('new'),
  country: z.string().nullable().catch(null),
  currency: z.string().nullable().catch(null),
  queries: z.array(z.string()).catch([]),
});

const SYSTEM = `You are the Router Agent of a price-comparison system. Read the user's message (it may be in Somali, English, Arabic or any other language) and decide what to do.

Reply with JSON only, in exactly this shape:
{"isShoppingRequest": boolean, "clarification": string | null, "product": string, "condition": "new" | "used" | "any", "country": string | null, "currency": string | null, "queries": string[]}

Rules:
- isShoppingRequest is true when the user wants to buy, price-check or compare prices of a product.
- If it is a shopping request, put the product in English in "product", as specific as the user was. Never invent a model, storage size or color the user did not mention.
- condition is "new" unless the user clearly asks for used or refurbished.
- country and currency stay null unless the user mentions a place or a currency.
- queries: exactly 3 different English web searches that would surface online STORE pages showing a price, for example "buy {product} price", "{product} in stock online store", "{product} lowest price". Add the country to the queries if one was mentioned.
- If it is NOT a shopping request: set isShoppingRequest to false, leave queries empty, and write a short friendly reply in the user's own language in "clarification", asking what they would like to buy.`;

export async function runRouterAgent(query: string): Promise<Plan> {
  const plan = await askJson(SYSTEM, query, planSchema);

  // If the model's answer is unusable, assume a shopping request and search for the raw text
  if (!plan) {
    return {
      isShoppingRequest: true,
      clarification: null,
      product: query,
      condition: 'new',
      country: null,
      currency: null,
      queries: [`buy ${query} price`, `${query} online store`, `${query} lowest price`],
    };
  }

  const product = plan.product.trim() || query;
  const queries = plan.queries.map((q) => q.trim()).filter(Boolean).slice(0, 4);
  return {
    ...plan,
    product,
    queries: queries.length ? queries : [`buy ${product} price`, `${product} online store`, `${product} lowest price`],
  };
}
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';
import { MODEL, getOpenAI, parseJsonLoose } from '../llm';
import { webSearch } from '../tools/webSearch';
import type { Candidate, Plan, SearchHit, StepLike } from '../types';

const MAX_ROUNDS = 5;
const NOT_STORES = /(youtube\.com|youtu\.be|reddit\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|wikipedia\.org|quora\.com|pinterest\.)/i;

const SEARCH_PROMPT = (max: number) => `You are the Search Agent of a price-comparison system. Your only job is to find web pages where the requested product is SOLD, so other agents can read their prices.

You have one tool: web_search(query). Use it.

How to work:
1. Run the planned queries you are given, one at a time.
2. Look at the results. If most of them are reviews, news, forums, videos, blogs or price-history articles, refine the query (add words like "buy", "price", "in stock", "add to cart", or a store name) and search again.
3. Aim for pages from DIFFERENT online stores (Amazon, eBay, Walmart, Best Buy, official brand stores, local retailers, marketplaces, and so on).
4. Prefer direct product or listing pages over category pages, search pages or home pages.
5. Stop searching once you have enough good pages, or after a few searches.

Rules:
- Only return URLs that appeared in tool results. Never invent or guess a URL.
- Skip reviews, news, forums, social media, videos, comparison blogs and price-history sites.
- Return at most ${max} pages, and at most two from the same store.

When you are done, reply with JSON only, no other text:
{"candidates": [{"url": string, "title": string, "store": string, "reason": string}]}`;

const SEARCH_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: 'Search the web. Returns page titles, URLs and short snippets.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'The search query' } },
      required: ['query'],
    },
  },
};

type Reply = { content: string | null; toolCalls: { id: string; name: string; arguments: string }[] };

const canon = (url: string) => url.split('#')[0].replace(/\/$/, '');

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export async function runSearchAgent({
  step,
  plan,
  maxCandidates,
}: {
  step: StepLike;
  plan: Plan;
  maxCandidates: number;
}): Promise<Candidate[]> {
  const seen = new Map<string, SearchHit>();
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: SEARCH_PROMPT(maxCandidates) },
    {
      role: 'user',
      content: JSON.stringify({
        product: plan.product,
        condition: plan.condition,
        country: plan.country,
        plannedQueries: plan.queries,
      }),
    },
  ];

  let finalText = '';

  // Think, call the tool, read the results, repeat. Every LLM call and every search is its own Inngest step.
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const reply = (await step.run(`search-agent-think-${round}`, async () => {
      const res = await getOpenAI().chat.completions.create({
        model: MODEL,
        messages,
        tools: [SEARCH_TOOL],
        tool_choice: 'auto',
      });
      const message = res.choices[0].message;
      return {
        content: message.content,
        toolCalls: (message.tool_calls ?? []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        })),
      };
    })) as Reply;

    if (!reply.toolCalls.length) {
      finalText = reply.content ?? '';
      break;
    }

    messages.push({
      role: 'assistant',
      content: reply.content,
      tool_calls: reply.toolCalls.map((call) => ({
        id: call.id,
        type: 'function' as const,
        function: { name: call.name, arguments: call.arguments },
      })),
    });

    for (const [i, call] of reply.toolCalls.entries()) {
      let query = '';
      try {
        query = String(JSON.parse(call.arguments).query ?? '').trim();
      } catch {
        query = '';
      }

      const hits = query
        ? ((await step.run(`search-agent-search-${round}-${i}`, () => webSearch(query))) as SearchHit[])
        : [];
      for (const hit of hits) seen.set(canon(hit.url), hit);

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(hits.map((h) => ({ title: h.title, url: h.url, snippet: h.snippet.slice(0, 250) }))),
      });
    }
  }

  // Keep only URLs the tool really returned, so a made-up link can never get through
  const parsed = parseJsonLoose(finalText) as {
    candidates?: { url?: string; title?: string; store?: string }[];
  } | null;

  const picked: Candidate[] = [];
  const used = new Set<string>();

  for (const item of parsed?.candidates ?? []) {
    const hit = item.url ? seen.get(canon(item.url)) : undefined;
    if (!hit || used.has(canon(hit.url))) continue;
    used.add(canon(hit.url));
    picked.push({
      url: hit.url,
      title: item.title || hit.title,
      store: item.store || hostOf(hit.url),
      snippet: hit.snippet,
    });
  }

  // If the agent didn't finish properly, fall back to the raw search results (one per store)
  if (!picked.length) {
    const hosts = new Set<string>();
    for (const hit of seen.values()) {
      const host = hostOf(hit.url);
      if (NOT_STORES.test(host) || hosts.has(host)) continue;
      hosts.add(host);
      picked.push({ url: hit.url, title: hit.title, store: host, snippet: hit.snippet });
    }
  }

  return picked.slice(0, maxCandidates);
}
import { z } from 'zod';
import { askJson } from '../llm';
import { readWebpage } from '../tools/readWebpage';
import type { Candidate, Offer, Plan } from '../types';

// Accepts 899.99, "899.99" or "$899.99", and turns anything else into null
const priceField = z.preprocess((value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = parseFloat(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const offerSchema = z.object({
  isProductPage: z.boolean().catch(true),
  matchesRequest: z.boolean().catch(true),
  store: z.string().catch(''),
  title: z.string().catch(''),
  price: priceField,
  currency: z.string().nullable().catch(null),
  condition: z.enum(['new', 'used', 'refurbished', 'unknown']).catch('unknown'),
  availability: z.enum(['in_stock', 'out_of_stock', 'unknown']).catch('unknown'),
  shipping: z.string().nullable().catch(null),
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  notes: z.string().catch(''),
});

const READER_PROMPT = `You are a Reader Agent in a price-comparison system. You receive the text of ONE web page (or a short search snippet when the page could not be opened) and the product the user wants. Extract the offer.

Reply with JSON only, in exactly this shape:
{"isProductPage": boolean, "matchesRequest": boolean, "store": string, "title": string, "price": number | null, "currency": string | null, "condition": "new" | "used" | "refurbished" | "unknown", "availability": "in_stock" | "out_of_stock" | "unknown", "shipping": string | null, "confidence": "high" | "medium" | "low", "notes": string}

Rules:
- Use ONLY the text you were given. Never guess a price. If you cannot find one, set price to null.
- price is a plain number with no symbols (899.99). currency is an ISO code like "USD" or "EUR".
- Report the current selling price of ONE unit. Ignore monthly installments ("$25/mo"), trade-in deals, accessories, warranties and prices of other products.
- If the page lists several variants (storage, color), use the one that best matches the request; otherwise use the lowest price and say which variant in notes.
- isProductPage is false for category pages, search pages, review articles and blogs. matchesRequest is false when the product is clearly different from what was requested.
- confidence is "high" only when the page clearly shows the price next to the product title.
- Keep notes short (one sentence).`;

export async function runReaderAgent(candidate: Candidate, plan: Plan): Promise<Offer> {
  const page = await readWebpage(candidate.url);
  const source: Offer['source'] = page.ok ? 'page' : candidate.snippet ? 'snippet' : 'none';
  const text = page.ok ? page.text : candidate.snippet;

  const base: Offer = {
    url: candidate.url,
    store: candidate.store,
    title: candidate.title,
    price: null,
    currency: null,
    condition: 'unknown',
    availability: 'unknown',
    shipping: null,
    confidence: 'low',
    notes: page.ok ? '' : page.error ?? 'Could not open the page.',
    isProductPage: true,
    matchesRequest: true,
    source,
  };
  if (!text) return base;

  const extracted = await askJson(
    READER_PROMPT,
    JSON.stringify({
      request: { product: plan.product, condition: plan.condition },
      url: candidate.url,
      source,
      text,
    }),
    offerSchema
  );
  if (!extracted) return { ...base, notes: 'The page could not be understood.' };

  const fromSnippet = source === 'snippet';
  return {
    ...base,
    ...extracted,
    store: extracted.store || candidate.store,
    title: extracted.title || candidate.title,
    // A search snippet is weaker evidence than the real page
    confidence: fromSnippet && extracted.confidence === 'high' ? 'medium' : extracted.confidence,
    notes: [extracted.notes, fromSnippet ? 'Price comes from a search snippet, so check it on the store page.' : '']
      .filter(Boolean)
      .join(' '),
  };
}
import { z } from 'zod';
import { askJson } from '../llm';
import type { Comparison, Language, Offer, Plan, RankedOffer } from '../types';

const reportSchema = z.object({
  headline: z.string().catch(''),
  recommendation: z.string().catch(''),
  insights: z.array(z.string()).catch([]),
  warnings: z.array(z.string()).catch([]),
});

const LANGUAGE_NAME: Record<Language, string> = { en: 'English', so: 'Somali (Soomaali)' };

const ANALYST_PROMPT = (language: Language) => `You are the Analyst Agent of a price-comparison system. You receive offers that other agents already found, read and ranked from cheapest to most expensive. Write a short, useful report for the shopper.

Write in ${LANGUAGE_NAME[language]}. Reply with JSON only, in exactly this shape:
{"headline": string, "recommendation": string, "insights": string[], "warnings": string[]}

Rules:
- Use ONLY the data you were given. Copy store names and prices exactly. Never invent offers, prices or stores, and only do math with the numbers provided.
- headline: one sentence naming the cheapest store and its price, and how many stores were compared.
- recommendation: say which offer to buy and why. "bestPickStore" is the cheapest offer that looks trustworthy. If it is not the cheapest overall, explain why (for example the cheaper one is used, out of stock, or suspiciously low).
- insights: 2 to 4 short points (price spread, savings versus the most expensive store, condition or shipping differences).
- warnings: short cautions, for example prices that came from search snippets, low confidence, mixed currencies, or a vague product name (different models can have very different prices). Also remind the shopper once to confirm the price on the store page before paying.
- If there are no ranked offers, say clearly that no reliable prices were found and suggest searching with a more specific product name.`;

const round2 = (n: number) => Math.round(n * 100) / 100;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Plain code (not AI) does the ranking, so the numbers can never be invented
export function compareOffers(offers: Offer[], plan: Plan): Omit<Comparison, 'report'> {
  const unranked: Comparison['unranked'] = [];
  const usable: Offer[] = [];

  for (const offer of offers) {
    const skip = (reason: string) => unranked.push({ url: offer.url, store: offer.store, reason });
    if (!offer.isProductPage) skip('Not a product page');
    else if (!offer.matchesRequest) skip('Different product than requested');
    else if (offer.price === null || offer.price <= 0) skip('No price found on the page');
    else usable.push(offer);
  }

  // Compare like with like: use the most common currency
  const counts = new Map<string, number>();
  for (const offer of usable) {
    const code = (offer.currency ?? 'UNKNOWN').toUpperCase();
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const currency = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const sameCurrency = usable.filter((o) => (o.currency ?? 'UNKNOWN').toUpperCase() === currency);
  for (const offer of usable) {
    if (!sameCurrency.includes(offer)) {
      unranked.push({
        url: offer.url,
        store: offer.store,
        reason: `Price in ${offer.currency ?? 'an unknown currency'} (not converted)`,
      });
    }
  }

  const prices = sameCurrency.map((o) => o.price as number);
  const middle = prices.length ? median(prices) : 0;

  const ranking: RankedOffer[] = [...sameCurrency]
    .sort((a, b) => (a.price as number) - (b.price as number))
    .map((offer, index) => {
      const flags: string[] = [];
      if (prices.length >= 3 && (offer.price as number) < middle * 0.5) flags.push('suspiciously_low');
      if (offer.condition === 'used' || offer.condition === 'refurbished') flags.push(offer.condition);
      if (offer.availability === 'out_of_stock') flags.push('out_of_stock');
      if (offer.confidence === 'low') flags.push('low_confidence');
      if (offer.source !== 'page') flags.push('price_from_snippet');

      const wrongCondition =
        plan.condition === 'new'
          ? offer.condition === 'used' || offer.condition === 'refurbished'
          : plan.condition === 'used'
            ? offer.condition === 'new'
            : false;

      const trusted =
        !wrongCondition &&
        !flags.includes('suspiciously_low') &&
        !flags.includes('out_of_stock') &&
        !flags.includes('low_confidence');

      return { ...offer, rank: index + 1, flags, trusted };
    });

  let stats: Comparison['stats'] = null;
  if (ranking.length) {
    const cheapest = ranking[0].price as number;
    const highest = ranking[ranking.length - 1].price as number;
    stats = {
      count: ranking.length,
      cheapest,
      highest,
      average: round2(prices.reduce((sum, p) => sum + p, 0) / prices.length),
      savings: round2(highest - cheapest),
      savingsPercent: highest ? Math.round(((highest - cheapest) / highest) * 100) : 0,
    };
  }

  return { currency, ranking, unranked, stats, bestPick: ranking.find((o) => o.trusted) ?? ranking[0] ?? null };
}

export async function writeReport(
  comparison: Omit<Comparison, 'report'>,
  plan: Plan,
  language: Language
): Promise<Comparison['report']> {
  const data = {
    request: { product: plan.product, condition: plan.condition },
    currency: comparison.currency,
    stats: comparison.stats,
    bestPickStore: comparison.bestPick?.store ?? null,
    offers: comparison.ranking.map((o) => ({
      rank: o.rank,
      store: o.store,
      price: o.price,
      condition: o.condition,
      availability: o.availability,
      shipping: o.shipping,
      flags: o.flags,
      trusted: o.trusted,
      notes: o.notes,
    })),
    notRanked: comparison.unranked.map((u) => ({ store: u.store, reason: u.reason })),
  };

  const report = await askJson(ANALYST_PROMPT(language), JSON.stringify(data), reportSchema);
  if (report && report.headline) return report;

  const best = comparison.bestPick;
  return {
    headline: best ? `${best.store}: ${best.price} ${comparison.currency ?? ''}`.trim() : 'No reliable prices were found.',
    recommendation: '',
    insights: [],
    warnings: ['Confirm the price on the store page before paying.'],
  };
}
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "ai-price-finder" });
import { inngest } from "../client";
import { runRouterAgent } from "@/lib/agents/router";
import { runSearchAgent } from "@/lib/agents/searchAgent";
import { runReaderAgent } from "@/lib/agents/readerAgent";
import { compareOffers, writeReport } from "@/lib/agents/analyst";
import { getSearch, updateSearch } from "@/lib/store";
import type { Comparison, Language, Offer, Plan, Candidate } from "@/lib/types";

type RequestData = {
  searchId: string;
  query: string;
  language: Language;
  maxStores: number;
};

export const priceComparison = inngest.createFunction(
  {
    id: "price-comparison",
    retries: 2,
    onFailure: async ({ event }) => {
      const data = event.data as unknown as { event?: { data?: { searchId?: string } } };
      const searchId = data.event?.data?.searchId;
      if (searchId) {
        updateSearch(searchId, {
          status: "error",
          message: "Something went wrong.",
          error: "The comparison failed. Check your API keys and try again.",
        });
      }
    },
  },
  { event: "shopping/compare.requested" },
  async ({ event, step }) => {
    const { searchId, query, language, maxStores } = event.data as RequestData;

    // 1) Router Agent: understand the request and plan the searches
    const plan = (await step.run("router-agent", async () => {
      updateSearch(searchId, { status: "routing", message: "Understanding your request…" });
      const result = await runRouterAgent(query);
      updateSearch(searchId, { plan: result });
      return result;
    })) as Plan;

    if (!plan.isShoppingRequest) {
      await step.run("ask-for-details", async () => {
        updateSearch(searchId, {
          status: "done",
          message: "I need a bit more detail.",
          clarification: plan.clarification ?? "What would you like to buy?",
        });
      });
      return { searchId, status: "needs-details" };
    }

    // 2) Search Agent: find pages that sell the product
    await step.run("progress-searching", async () => {
      updateSearch(searchId, { status: "searching", message: `Searching the web for “${plan.product}”…` });
    });

    const candidates: Candidate[] = await runSearchAgent({ step, plan, maxCandidates: maxStores });

    await step.run("save-candidates", async () => {
      updateSearch(searchId, {
        candidates,
        status: "reading",
        readCount: 0,
        message: `Reading ${candidates.length} store pages…`,
      });
    });

    // 3) Reader Agents: one per page, all running in parallel
    const offers = (await Promise.all(
      candidates.map((candidate, i) =>
        step.run(`reader-agent-${i}`, async () => {
          const offer = await runReaderAgent(candidate, plan);
          updateSearch(searchId, { readCount: (getSearch(searchId)?.readCount ?? 0) + 1 });
          return offer;
        })
      )
    )) as Offer[];

    // 4) Analyst Agent: rank the prices and write the recommendation
    const result = (await step.run("analyst-agent", async () => {
      updateSearch(searchId, { status: "analyzing", message: "Comparing prices…" });
      const comparison = compareOffers(offers, plan);
      const report = await writeReport(comparison, plan, language);
      return { ...comparison, report };
    })) as Comparison;

    await step.run("save-result", async () => {
      updateSearch(searchId, { status: "done", message: "Done.", result });
    });

    return {
      searchId,
      storesCompared: result.ranking.length,
      cheapest: result.stats?.cheapest ?? null,
    };
  }
);
import { serve } from "inngest/next";
import { inngest } from "@/app/inngest/client";
import { priceComparison } from "@/app/inngest/functions/price-comparison";

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [priceComparison],
});
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { inngest } from "@/app/inngest/client";
import { createSearch } from "@/lib/store";

const bodySchema = z.object({
  query: z.string().trim().min(3, "Tell me what you want to buy.").max(300),
  language: z.enum(["en", "so"]).default("en"),
  maxStores: z.number().int().min(3).max(8).default(5),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const missing = ["OPENAI_API_KEY", "TAVILY_API_KEY"].filter((key) => !process.env[key]);
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing ${missing.join(" and ")} in .env.local. Add it and restart the dev server.` },
      { status: 500 }
    );
  }

  const id = randomUUID();
  createSearch(id, parsed.data.query);

  try {
    await inngest.send({ name: "shopping/compare.requested", data: { searchId: id, ...parsed.data } });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Could not reach Inngest. Start the Dev Server with "npm run inngest" and try again.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ id });
}
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Price Finder",
  description: "AI agents search the web and compare prices for you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
import PriceFinder from "@/components/PriceFinder";

export default function Home() {
  return (
    <main className="page">
      <header className="hero">
        <h1>🛒 AI Price Finder</h1>
        <p>Tell the agents what you want to buy. They search the web, read the store pages and rank the prices.</p>
      </header>
      <PriceFinder />
    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import type { Language, RankedOffer, SearchState } from "@/lib/types";

const STAGES = [
  { key: "routing", label: "Router Agent", hint: "Understands your request" },
  { key: "searching", label: "Search Agent", hint: "Finds stores that sell it" },
  { key: "reading", label: "Reader Agents", hint: "Open each page and read the price" },
  { key: "analyzing", label: "Analyst Agent", hint: "Compares and recommends" },
];
const ORDER = ["queued", "routing", "searching", "reading", "analyzing", "done"];
const EXAMPLES = ["iPhone 15 128GB", "MacBook Air M2 13-inch", "PlayStation 5 console"];

const FLAG_LABELS: Record<string, string> = {
  suspiciously_low: "Suspiciously low price",
  used: "Used",
  refurbished: "Refurbished",
  out_of_stock: "Out of stock",
  low_confidence: "Low confidence",
  price_from_snippet: "Price from search snippet",
};

function money(value: number, currency: string | null) {
  if (!currency) return value.toFixed(2);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

const safeHref = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");

function stageState(stage: string, status: SearchState["status"] | undefined) {
  if (!status) return "todo";
  if (status === "done") return "done";
  const current = ORDER.indexOf(status);
  const index = ORDER.indexOf(stage);
  if (current === -1) return "todo";
  return index < current ? "done" : index === current ? "active" : "todo";
}

export default function PriceFinder() {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [maxStores, setMaxStores] = useState(5);
  const [searchId, setSearchId] = useState<string | null>(null);
  const [search, setSearch] = useState<SearchState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask the server how the agents are doing every 1.5 seconds
  useEffect(() => {
    if (!searchId) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();

    async function poll() {
      try {
        const res = await fetch(`/api/compare/${searchId}`, { cache: "no-store" });
        const data = await res.json();
        if (stopped) return;
        if (!res.ok) {
          setError(data.error ?? "Lost track of this search.");
          setBusy(false);
          return;
        }
        setSearch(data);
        if (data.status === "done" || data.status === "error") {
          setBusy(false);
          return;
        }
      } catch {
        // network hiccup, try again
      }
      if (Date.now() - startedAt > 180_000) {
        setError("This is taking too long. Check the Inngest Dev Server for details.");
        setBusy(false);
        return;
      }
      timer = setTimeout(poll, 1500);
    }

    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [searchId]);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy || query.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setSearch(null);
    setSearchId(null);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, language, maxStores }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setSearchId(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  const result = search?.result;

  return (
    <div className="stack">
      <form className="card" onSubmit={start}>
        <label htmlFor="query" className="label">What do you want to buy?</label>
        <input
          id="query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. iPhone 15 128GB"
          maxLength={300}
          disabled={busy}
        />
        <div className="chips">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="chip" onClick={() => setQuery(example)} disabled={busy}>
              {example}
            </button>
          ))}
        </div>

        <div className="options">
          <label>
            Report language
            <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} disabled={busy}>
              <option value="en">English</option>
              <option value="so">Soomaali</option>
            </select>
          </label>
          <label>
            Stores to check
            <select value={maxStores} onChange={(e) => setMaxStores(Number(e.target.value))} disabled={busy}>
              {[3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        </div>

        <button type="submit" className="primary" disabled={busy || query.trim().length < 3}>
          {busy ? "Agents are working…" : "Find the best price"}
        </button>
      </form>

      {error && <div className="alert" role="alert">{error}</div>}
      {search?.status === "error" && <div className="alert" role="alert">{search.error}</div>}

      {search && !search.clarification && (
        <section className="card">
          <ol className="stages">
            {STAGES.map((stage) => {
              const state = stageState(stage.key, search.status);
              return (
                <li key={stage.key} className={state}>
                  <span className="dot">{state === "done" ? "✓" : state === "active" ? <i className="spin" /> : ""}</span>
                  <span>
                    <strong>{stage.label}</strong>
                    <small>
                      {stage.hint}
                      {stage.key === "reading" && state === "active" && search.candidates
                        ? ` (${search.readCount ?? 0}/${search.candidates.length})`
                        : ""}
                    </small>
                  </span>
                </li>
              );
            })}
          </ol>
          {busy && <p className="muted">{search.message}</p>}
        </section>
      )}

      {search?.clarification && <div className="card">{search.clarification}</div>}

      {result && (
        <>
          <section className="card">
            <h2>{result.report.headline}</h2>
            {result.report.recommendation && <p>{result.report.recommendation}</p>}

            {result.stats && (
              <div className="stats">
                <div><span>Cheapest</span><strong>{money(result.stats.cheapest, result.currency)}</strong></div>
                <div><span>Most expensive</span><strong>{money(result.stats.highest, result.currency)}</strong></div>
                <div><span>You could save</span><strong>{money(result.stats.savings, result.currency)} ({result.stats.savingsPercent}%)</strong></div>
              </div>
            )}

            {result.bestPick && (
              <div className="best">
                <div>
                  <span className="muted">Best pick</span>
                  <h3>{result.bestPick.store}</h3>
                  <p className="muted">{result.bestPick.title}</p>
                </div>
                <div className="best-price">
                  <strong>{money(result.bestPick.price as number, result.currency)}</strong>
                  <a className="primary link" href={safeHref(result.bestPick.url)} target="_blank" rel="noopener noreferrer">
                    Open store page
                  </a>
                </div>
              </div>
            )}
          </section>

          {result.ranking.length > 0 && (
            <section className="card">
              <h3>All prices, cheapest first</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Store</th><th>Price</th><th>Condition</th><th>Stock</th><th>Notes</th><th></th></tr>
                  </thead>
                  <tbody>
                    {result.ranking.map((offer: RankedOffer) => (
                      <tr key={offer.url} className={offer.rank === 1 ? "first" : ""}>
                        <td>{offer.rank}</td>
                        <td>{offer.store}</td>
                        <td><strong>{money(offer.price as number, offer.currency)}</strong></td>
                        <td>{offer.condition}</td>
                        <td>{offer.availability.replace("_", " ")}</td>
                        <td>
                          {offer.flags.map((flag) => (
                            <span key={flag} className="flag">{FLAG_LABELS[flag] ?? flag}</span>
                          ))}
                        </td>
                        <td>
                          <a href={safeHref(offer.url)} target="_blank" rel="noopener noreferrer">Open</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {result.report.insights.length > 0 && (
            <section className="card">
              <h3>Insights</h3>
              <ul>{result.report.insights.map((item, i) => <li key={i}>{item}</li>)}</ul>
            </section>
          )}

          {(result.report.warnings.length > 0 || result.unranked.length > 0) && (
            <section className="card warn">
              <h3>Good to know</h3>
              <ul>
                {result.report.warnings.map((item, i) => <li key={`w${i}`}>{item}</li>)}
                {result.unranked.map((item) => (
                  <li key={item.url}>
                    {item.store}: {item.reason} (<a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer">open</a>)
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
:root {
  --bg: #f4f7f6;
  --panel: #ffffff;
  --text: #16211f;
  --muted: #5f6f6b;
  --accent: #0f766e;
  --accent-dark: #115e59;
  --on-accent: #ffffff;
  --soft: #e6f4f1;
  --border: #dbe5e2;
  --bad: #b42318;
  --bad-bg: #fdecea;
  --warn-bg: #fff7e6;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0e1413;
    --panel: #151d1c;
    --text: #e6efed;
    --muted: #93a5a1;
    --accent: #2dd4bf;
    --accent-dark: #5eead4;
    --on-accent: #062a26;
    --soft: #12302c;
    --border: #26332f;
    --bad: #ff9a8f;
    --bad-bg: #3a1d1a;
    --warn-bg: #2d2615;
  }
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.55; }
button, input, select { font: inherit; color: inherit; }
a { color: var(--accent); }

.page { max-width: 820px; margin: 0 auto; padding: 32px 16px 48px; }
.hero { text-align: center; margin-bottom: 24px; }
.hero h1 { margin: 0 0 6px; font-size: 2rem; }
.hero p { margin: 0; color: var(--muted); }

.stack { display: flex; flex-direction: column; gap: 16px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 20px; }
.card h2 { margin: 0 0 8px; font-size: 1.25rem; }
.card h3 { margin: 0 0 8px; font-size: 1.05rem; }
.card ul { margin: 0; padding-left: 20px; }
.card.warn { background: var(--warn-bg); }
.muted { color: var(--muted); }
.label { font-weight: 600; display: block; margin-bottom: 8px; }

input, select { width: 100%; padding: 11px 13px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); }
input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; }

.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 14px; }
.chip { padding: 5px 12px; border: 1px solid var(--border); border-radius: 999px; background: var(--panel); cursor: pointer; font-size: 0.85rem; }
.chip:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

.options { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
.options label { display: flex; flex-direction: column; gap: 4px; font-size: 0.85rem; color: var(--muted); }

button:disabled { opacity: 0.55; cursor: not-allowed; }
.primary { display: inline-block; padding: 11px 20px; border: none; border-radius: 12px; background: var(--accent); color: var(--on-accent); font-weight: 600; cursor: pointer; text-decoration: none; }
.primary:hover:not(:disabled) { background: var(--accent-dark); }
form .primary { width: 100%; }

.alert { padding: 12px 16px; border: 1px solid var(--bad); border-radius: 12px; background: var(--bad-bg); color: var(--bad); }

.stages { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.stages li { display: flex; align-items: center; gap: 12px; opacity: 0.5; }
.stages li.active, .stages li.done { opacity: 1; }
.stages small { display: block; color: var(--muted); }
.dot { flex: none; width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--border); display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
.stages li.done .dot { background: var(--accent); border-color: var(--accent); color: var(--on-accent); }
.stages li.active .dot { border-color: var(--accent); }
.spin { width: 12px; height: 12px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 14px 0; }
.stats div { background: var(--soft); border-radius: 12px; padding: 10px 12px; }
.stats span { display: block; font-size: 0.8rem; color: var(--muted); }

.best { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; border: 2px solid var(--accent); border-radius: 14px; padding: 14px 16px; }
.best h3 { margin: 0; font-size: 1.2rem; }
.best p { margin: 2px 0 0; }
.best-price { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.best-price strong { font-size: 1.6rem; color: var(--accent); }

.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--muted); font-weight: 600; white-space: nowrap; }
tr.first { background: var(--soft); }
.flag { display: inline-block; margin: 0 4px 4px 0; padding: 2px 8px; border-radius: 999px; background: var(--warn-bg); border: 1px solid var(--border); font-size: 0.75rem; white-space: nowrap; }

@media (max-width: 560px) {
  .options, .stats { grid-template-columns: 1fr; }
  .best-price { align-items: flex-start; }
}