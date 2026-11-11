/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };

export default nextConfig;
import { z } from 'zod';

const notes = z
  .string()
  .trim()
  .min(50, 'Paste at least a few sentences of notes (50+ characters).')
  .max(12000, 'Please keep your notes under 12,000 characters.');

// What the browser sends us
export const summarizeRequest = z.object({
  notes,
  length: z.enum(['brief', 'standard', 'detailed']).default('standard'),
});

export const quizRequest = z.object({
  notes,
  count: z.number().int().min(3).max(10).default(5),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
});

// What we expect back from the model
export const summarySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1).max(12),
  keyTerms: z.array(z.object({ term: z.string().min(1), definition: z.string().min(1) })).max(10),
});

export const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).length(4),
        answerIndex: z.number().int().min(0).max(3),
        explanation: z.string().min(1),
      })
    )
    .min(1),
});

export type Summary = z.infer<typeof summarySchema>;
export type QuizQuestion = z.infer<typeof quizSchema>['questions'][number];
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export class AiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Created on first use so a missing key doesn't break `next build`
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new AiError('The OPENAI_API_KEY is missing. Add it to .env.local and restart the dev server.', 500);
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function askJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AiError('The AI sent back an empty answer. Please try again.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError('The AI answer was not readable. Please try again.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) throw new AiError('The AI answer was not in the shape I expected. Please try again.');
  return result.data;
}

export function errorResponse(err: unknown) {
  if (err instanceof AiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  const status = (err as { status?: number })?.status;
  if (status === 401) {
    return NextResponse.json({ error: 'OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local.' }, { status: 500 });
  }
  if (status === 404) {
    return NextResponse.json({ error: 'That OpenAI model is not available. Check OPENAI_MODEL in .env.local.' }, { status: 500 });
  }
  if (status === 429) {
    return NextResponse.json({ error: 'The AI service is busy or out of quota. Try again in a moment.' }, { status: 429 });
  }

  console.error('AI request failed:', err);
  return NextResponse.json({ error: 'Something went wrong while talking to the AI. Please try again.' }, { status: 502 });
}
import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export class AiError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'AiError';
    this.status = status;
  }
}

export const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Created on first use so a missing key doesn't break `next build`
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new AiError('The OPENAI_API_KEY is missing. Add it to .env.local and restart the dev server.', 500);
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function askJson<T>(system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const completion = await getClient().chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new AiError('The AI sent back an empty answer. Please try again.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AiError('The AI answer was not readable. Please try again.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) throw new AiError('The AI answer was not in the shape I expected. Please try again.');
  return result.data;
}
import { NextResponse } from 'next/server';

// Simple in-memory limiter. Fine for one server; use a shared store (Redis, etc.) if you scale out.
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(req: Request, max = 12, windowMs = 60_000) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now();

  if (hits.size > 1000) {
    for (const [key, entry] of hits) {
      if (entry.reset <= now) hits.delete(key);
    }
  }

  const entry = hits.get(ip);
  if (!entry || entry.reset <= now) {
    hits.set(ip, { count: 1, reset: now + windowMs });
    return null;
  }

  entry.count += 1;
  if (entry.count > max) {
    return NextResponse.json(
      { error: "You're going a little fast. Give it a moment and try again." },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((entry.reset - now) / 1000)) } }
    );
  }
  return null;
}
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Study Buddy',
  description: 'Turn your notes into a summary and a practice quiz.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
'use client';

import { useState } from 'react';
import Quiz from './Quiz';
import type { QuizQuestion, Summary } from '@/lib/schemas';

const MAX_CHARS = 12000;
const MIN_CHARS = 50;

const SAMPLE_NOTES = `Photosynthesis is how plants, algae and some bacteria turn light energy into chemical energy. It happens mostly in the chloroplasts of leaf cells, which contain a green pigment called chlorophyll. Chlorophyll absorbs light, mainly red and blue wavelengths, and reflects green, which is why leaves look green.

The process has two stages. In the light-dependent reactions, light energy splits water molecules, releasing oxygen and producing the energy carriers ATP and NADPH. In the Calvin cycle, which doesn't need light directly, the plant uses ATP and NADPH to turn carbon dioxide into glucose. The overall equation is: 6CO2 + 6H2O + light energy -> C6H12O6 + 6O2.

Photosynthesis matters because it produces the oxygen we breathe and forms the base of most food chains. Factors that affect its rate include light intensity, carbon dioxide concentration and temperature.`;

type Task = 'summary' | 'quiz' | null;
type Length = 'brief' | 'standard' | 'detailed';
type Difficulty = 'easy' | 'medium' | 'hard';

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
  return data as T;
}

export default function StudyBuddy() {
  const [notes, setNotes] = useState('');
  const [length, setLength] = useState<Length>('standard');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const [task, setTask] = useState<Task>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizKey, setQuizKey] = useState(0);

  const busy = task !== null;
  const tooShort = notes.trim().length < MIN_CHARS;

  async function run<T>(which: Exclude<Task, null>, url: string, body: unknown, onDone: (data: T) => void) {
    setTask(which);
    setError(null);
    try {
      onDone(await post<T>(url, body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setTask(null);
    }
  }

  const summarize = () => run<Summary>('summary', '/api/summarize', { notes, length }, setSummary);

  const makeQuiz = () =>
    run<{ questions: QuizQuestion[] }>('quiz', '/api/quiz', { notes, count, difficulty }, (data) => {
      setQuestions(data.questions);
      setQuizKey((k) => k + 1);
    });

  function clearAll() {
    setNotes('');
    setSummary(null);
    setQuestions(null);
    setError(null);
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <label htmlFor="notes" className="label">Your notes</label>
          <button type="button" className="link" onClick={() => setNotes(SAMPLE_NOTES)} disabled={busy}>
            Try sample notes
          </button>
        </div>

        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, MAX_CHARS))}
          placeholder="Paste a chapter, lecture notes, or anything you're studying…"
          rows={10}
          disabled={busy}
        />
        <div className="row between small muted">
          <span>{tooShort && notes.length > 0 ? `Add a little more (${MIN_CHARS}+ characters).` : ' '}</span>
          <span>{notes.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}</span>
        </div>

        <div className="options">
          <label>
            Summary length
            <select value={length} onChange={(e) => setLength(e.target.value as Length)} disabled={busy}>
              <option value="brief">Brief</option>
              <option value="standard">Standard</option>
              <option value="detailed">Detailed</option>
            </select>
          </label>
          <label>
            Questions
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} disabled={busy}>
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty)} disabled={busy}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>

        <div className="row gap">
          <button type="button" className="primary" onClick={summarize} disabled={busy || tooShort}>
            Summarize
          </button>
          <button type="button" className="primary" onClick={makeQuiz} disabled={busy || tooShort}>
            Quiz me
          </button>
          <button type="button" className="ghost" onClick={clearAll} disabled={busy || (!notes && !summary && !questions)}>
            Clear
          </button>
        </div>
      </section>

      {busy && (
        <p className="status" role="status">
          <span className="spinner" aria-hidden="true" />
          {task === 'summary' ? 'Summarizing your notes…' : 'Writing your quiz…'}
        </p>
      )}

      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}

      {summary && (
        <section className="card">
          <h2>{summary.title}</h2>
          <p className="summary">{summary.summary}</p>

          <h3>Key points</h3>
          <ul>
            {summary.keyPoints.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>

          {summary.keyTerms.length > 0 && (
            <>
              <h3>Key terms</h3>
              <dl>
                {summary.keyTerms.map((item, i) => (
                  <div key={i} className="term">
                    <dt>{item.term}</dt>
                    <dd>{item.definition}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </section>
      )}

      {questions && <Quiz key={quizKey} questions={questions} onNewQuiz={makeQuiz} busy={busy} />}
    </div>
  );
}

