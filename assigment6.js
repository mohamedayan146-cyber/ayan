require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const conversationRoutes = require('./routes/conversations');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/ai_chat';

app.disable('x-powered-by');
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

app.use('/api/conversations', conversationRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'That endpoint does not exist.' }));

// The same page serves a fresh chat (/) and any saved conversation (/chat/:id)
app.get(['/', '/chat/:id'], (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'That request was not valid JSON.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That message is too large.' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on our side.' });
});

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT, () => console.log(`Chat is running at http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
const crypto = require('crypto');
const mongoose = require('mongoose');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

// Short, URL-friendly ids like C5dJucOGjexV6cfipIZ6J
const newId = (length = 21) =>
  Array.from({ length }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    _id: { type: String, default: () => newId() },
    title: { type: String, default: 'New Conversation', trim: true, maxlength: 80 },
    messages: [messageSchema],
  },
  { timestamps: true }
);

module.exports = { Conversation: mongoose.model('Conversation', conversationSchema), newId };
// A small in-memory limiter, enough to stop accidental request floods on a single server
module.exports = function rateLimit({ windowMs, max }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.reset <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const entry = hits.get(req.ip);

    if (!entry || entry.reset <= now) {
      hits.set(req.ip, { count: 1, reset: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: "You're sending messages a little too fast. Give it a moment and try again." });
    }
    return next();
  };
};
const express = require('express');
const OpenAI = require('openai');
const { Conversation } = require('../models/Conversation');
const rateLimit = require('../middleware/rateLimit');

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const MAX_CONTEXT_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 4000;
const DEFAULT_TITLE = 'New Conversation';
const ID_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

const SYSTEM_PROMPT =
  "You are a helpful, friendly AI assistant. Answer clearly and accurately. Use Markdown when it helps: short lists, bold for key terms, and code blocks with a language tag. Keep simple answers short. If you're not sure about something, say so instead of guessing.";

const messageLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.param('id', (_req, res, next, id) => {
  if (!ID_PATTERN.test(id)) return res.status(400).json({ error: 'That conversation id is not valid.' });
  return next();
});

function makeTitle(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 50 ? `${clean.slice(0, 50).trimEnd()}…` : clean;
}

function friendlyError(err) {
  if (err.status === 401) return 'The OpenAI API key was rejected. Check OPENAI_API_KEY in your .env file.';
  if (err.status === 429) return 'The AI service is rate limited or out of quota right now. Please try again shortly.';
  if (err.status === 404) return 'That OpenAI model is not available. Check OPENAI_MODEL in your .env file.';
  return 'I ran into a problem reaching the AI model. Please try again.';
}

// List recent conversations for the sidebar
router.get('/', wrap(async (_req, res) => {
  const items = await Conversation.find({}, 'title updatedAt').sort({ updatedAt: -1 }).limit(50).lean();
  res.json(items.map((c) => ({ id: c._id, title: c.title, updatedAt: c.updatedAt })));
}));

router.post('/', wrap(async (_req, res) => {
  const convo = await Conversation.create({});
  res.status(201).json({ id: convo._id, title: convo.title });
}));

router.get('/:id', wrap(async (req, res) => {
  const convo = await Conversation.findById(req.params.id).lean();
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json({
    id: convo._id,
    title: convo.title,
    messages: convo.messages.map(({ role, content }) => ({ role, content })),
  });
}));

router.patch('/:id', wrap(async (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  if (!title || title.length > 80) {
    return res.status(400).json({ error: 'A title needs to be between 1 and 80 characters.' });
  }
  const convo = await Conversation.findByIdAndUpdate(req.params.id, { title }, { new: true }).lean();
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json({ id: convo._id, title: convo.title });
}));

router.delete('/:id', wrap(async (req, res) => {
  const convo = await Conversation.findByIdAndDelete(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
  return res.json({ ok: true });
}));

// Send a message and stream the reply back as server-sent events
router.post('/:id/messages', messageLimiter, wrap(async (req, res) => {
  const content = typeof req.body.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: 'Type a message first.' });
  if (content.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Messages can be up to ${MAX_MESSAGE_LENGTH} characters long.` });
  }

  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found.' });

  convo.messages.push({ role: 'user', content });
  if (convo.messages.length === 1) convo.title = makeTitle(content);
  await convo.save();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  let reply = '';
  let aborted = false;
  let failed = false;
  let stream;

  // If the user hits stop or closes the tab, stop paying for tokens
  res.on('close', () => {
    if (!res.writableEnded) {
      aborted = true;
      if (stream) stream.controller.abort();
    }
  });

  try {
    const context = convo.messages.slice(-MAX_CONTEXT_MESSAGES).map(({ role, content: text }) => ({ role, content: text }));
    stream = await client.chat.completions.create({
      model: MODEL,
      stream: true,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...context],
    });
    if (aborted) stream.controller.abort();

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        reply += text;
        send({ type: 'delta', text });
      }
    }
  } catch (err) {
    if (!aborted) {
      failed = true;
      console.error('OpenAI request failed:', err.message);
      send({ type: 'error', message: friendlyError(err) });
    }
  }

  // Keep whatever was generated (even a partial answer). If nothing came back,
  // drop the user message so a retry doesn't leave a dangling question behind.
  if (reply.trim()) {
    convo.messages.push({ role: 'assistant', content: reply });
  } else {
    convo.messages.pop();
    if (!convo.messages.length) convo.title = DEFAULT_TITLE;
  }
  await convo.save();

  if (!aborted) {
    if (!failed) send({ type: 'done', title: convo.title });
    res.end();
  }
  return undefined;
}));

module.exports = router;
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Assistant</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div class="layout">
    <aside id="sidebar" class="sidebar">
      <button id="new-chat" class="new-chat" type="button">＋ New chat</button>
      <nav id="history" class="history" aria-label="Conversations"></nav>
    </aside>
    <div id="scrim" class="scrim"></div>

    <section class="chat">
      <header class="chat-header">
        <button id="menu" class="menu-btn" type="button" aria-label="Show conversations">☰</button>
        <div class="avatar brand">AI</div>
        <div class="titles">
          <h1 id="chat-title" title="Click to rename">New Conversation</h1>
          <p>Chat with AI Assistant</p>
        </div>
      </header>

      <main id="messages" class="messages" aria-live="polite"></main>

      <form id="composer" class="composer" autocomplete="off">
        <textarea id="input" rows="1" maxlength="4000" placeholder="Type your message..." aria-label="Type your message"></textarea>
        <button id="send" class="send" type="submit" aria-label="Send message"></button>
      </form>
    </section>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js"></script>
  <script src="/app.js"></script>
</body>
</html>
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const layout = document.querySelector('.layout');
  const els = {
    messages: $('messages'),
    form: $('composer'),
    input: $('input'),
    send: $('send'),
    title: $('chat-title'),
    history: $('history'),
    newChat: $('new-chat'),
    menu: $('menu'),
    scrim: $('scrim'),
  };

  const DEFAULT_TITLE = 'New Conversation';
  const ID_ROUTE = /^\/chat\/([A-Za-z0-9_-]{10,40})\/?$/;
  const STARTERS = ['What is Python?', 'Explain how the internet works', 'Give me a simple dinner idea'];

  const ICONS = {
    send: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  const state = { id: null, streaming: false, controller: null };

  /* ---------- Helpers ---------- */

  // Small DOM builder. Strings always become text nodes, never HTML.
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  async function api(path, options = {}) {
    const res = await fetch(`/api/conversations${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Request failed (${res.status}).`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  if (window.DOMPurify) {
    window.DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }

  function addCopyButton(pre) {
    const code = pre.querySelector('code');
    const btn = h('button', {
      class: 'copy-btn',
      type: 'button',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(code ? code.innerText : pre.innerText);
          btn.textContent = 'Copied';
        } catch {
          btn.textContent = 'Failed';
        }
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      },
    }, 'Copy');
    pre.append(btn);
  }

  function renderMarkdown(el, text) {
    if (window.marked && window.DOMPurify) {
      el.innerHTML = window.DOMPurify.sanitize(window.marked.parse(text, { gfm: true, breaks: true }));
      el.querySelectorAll('pre').forEach(addCopyButton);
    } else {
      el.textContent = text; // CDN scripts didn't load, so fall back to plain text
    }
  }

  const nearBottom = () => els.messages.scrollHeight - els.messages.scrollTop - els.messages.clientHeight < 120;
  const scrollToBottom = () => { els.messages.scrollTop = els.messages.scrollHeight; };

  function setTitle(title) {
    els.title.textContent = title;
    document.title = title === DEFAULT_TITLE ? 'AI Assistant' : `${title} · AI Assistant`;
  }

  function autoGrow() {
    els.input.style.height = 'auto';
    els.input.style.height = `${Math.min(els.input.scrollHeight, 160)}px`;
  }

  const typingDots = () => h('span', { class: 'dots', 'aria-label': 'The assistant is typing' }, h('i'), h('i'), h('i'));

  /* ---------- Messages ---------- */

  function messageRow(role) {
    const body = h('div', { class: role === 'user' ? 'bubble' : 'prose' });
    const avatar = h('div', { class: `avatar ${role}` }, role === 'user' ? 'U' : 'AI');
    const row = h('div', { class: `msg ${role}` }, role === 'user' ? [body, avatar] : [avatar, body]);
    els.messages.append(row);
    return { row, body };
  }

  function addMessage(role, text) {
    const { row, body } = messageRow(role);
    if (role === 'user') body.textContent = text;
    else renderMarkdown(body, text);
    return row;
  }

  function addNotice(message, onRetry) {
    const notice = h('div', { class: 'notice', role: 'alert' }, message);
    if (onRetry) {
      notice.append(h('button', { type: 'button', onClick: () => { notice.remove(); onRetry(); } }, 'Try again'));
    }
    els.messages.append(notice);
    scrollToBottom();
  }

  function showEmpty() {
    els.messages.replaceChildren(
      h('div', { class: 'empty' },
        h('h2', {}, 'How can I help you today?'),
        h('p', {}, 'Ask me anything, or try one of these:'),
        h('div', { class: 'starters' },
          STARTERS.map((text) => h('button', { class: 'starter', type: 'button', onClick: () => sendMessage(text) }, text))))
    );
  }

  function setStreaming(on) {
    state.streaming = on;
    els.send.innerHTML = on ? ICONS.stop : ICONS.send;
    els.send.setAttribute('aria-label', on ? 'Stop generating' : 'Send message');
  }

  async function readStream(res, onEvent) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop();
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (line.startsWith('data:')) onEvent(JSON.parse(line.slice(5).trim()));
      }
    }
  }

  async function ensureConversation() {
    if (state.id) return state.id;
    const created = await api('', { method: 'POST', body: '{}' });
    state.id = created.id;
    history.pushState({}, '', `/chat/${created.id}`);
    return state.id;
  }

  async function sendMessage(raw) {
    const text = raw.trim();
    if (!text || state.streaming) return;

    els.input.value = '';
    autoGrow();
    els.messages.querySelector('.empty')?.remove();
    els.messages.querySelectorAll('.notice').forEach((n) => n.remove());

    const userRow = addMessage('user', text);
    const { row: replyRow, body } = messageRow('assistant');
    body.replaceChildren(typingDots());
    scrollToBottom();
    setStreaming(true);

    let reply = '';
    let frame = null;
    const paint = () => {
      frame = null;
      const stick = nearBottom();
      renderMarkdown(body, reply);
      if (stick) scrollToBottom();
    };

    try {
      const id = await ensureConversation();
      state.controller = new AbortController();

      const res = await fetch(`/api/conversations/${id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
        signal: state.controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status}).`);
      }

      await readStream(res, (event) => {
        if (event.type === 'delta') {
          reply += event.text;
          if (!frame) frame = requestAnimationFrame(paint);
        } else if (event.type === 'done') {
          setTitle(event.title);
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      });
    } catch (err) {
      // Pressing stop aborts the request on purpose, so only real failures get a notice
      if (err.name !== 'AbortError') {
        addNotice(err.message || 'Something went wrong.', () => {
          userRow.remove();
          sendMessage(text);
        });
      }
    } finally {
      if (frame) cancelAnimationFrame(frame);
      if (reply) paint();
      else replyRow.remove();
      state.controller = null;
      setStreaming(false);
      els.input.focus();
      loadHistory();
    }
  }

  const stopStreaming = () => { if (state.controller) state.controller.abort(); };

  /* ---------- Sidebar ---------- */

  async function loadHistory() {
    try {
      const items = await api('');
      els.history.replaceChildren(...items.map(historyRow));
      if (!items.length) els.history.append(h('p', { class: 'muted' }, 'No conversations yet.'));
    } catch {
      // The sidebar is a nice extra, so a failure here shouldn't get in the way of chatting
    }
  }

  function historyRow(convo) {
    const link = h('a', {
      class: 'history-link',
      href: `/chat/${convo.id}`,
      onClick: (event) => { event.preventDefault(); navigate(`/chat/${convo.id}`); },
    }, h('span', {}, convo.title));

    const remove = h('button', {
      class: 'history-delete',
      type: 'button',
      title: 'Delete conversation',
      'aria-label': `Delete ${convo.title}`,
      onClick: () => deleteConversation(convo),
    }, '✕');

    return h('div', { class: `history-row${convo.id === state.id ? ' active' : ''}` }, link, remove);
  }

  async function deleteConversation(convo) {
    if (!window.confirm(`Delete "${convo.title}"? This can't be undone.`)) return;
    try {
      await api(`/${convo.id}`, { method: 'DELETE' });
      if (convo.id === state.id) navigate('/');
      else loadHistory();
    } catch (err) {
      addNotice(err.message);
    }
  }

  const closeSidebar = () => layout.classList.remove('open');

  /* ---------- Routing ---------- */

  async function route() {
    const match = ID_ROUTE.exec(location.pathname);
    state.id = match ? match[1] : null;

    if (!state.id) {
      setTitle(DEFAULT_TITLE);
      showEmpty();
      loadHistory();
      return;
    }

    try {
      const convo = await api(`/${state.id}`);
      setTitle(convo.title);
      els.messages.replaceChildren();
      if (convo.messages.length) convo.messages.forEach((m) => addMessage(m.role, m.content));
      else showEmpty();
      scrollToBottom();
    } catch (err) {
      if (err.status === 404 || err.status === 400) {
        // That conversation doesn't exist (anymore), so start fresh
        history.replaceState({}, '', '/');
        state.id = null;
        setTitle(DEFAULT_TITLE);
        showEmpty();
      } else {
        addNotice(err.message);
      }
    }
    loadHistory();
  }

  async function navigate(path) {
    stopStreaming();
    history.pushState({}, '', path);
    closeSidebar();
    await route();
  }

  /* ---------- Events ---------- */

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.streaming) stopStreaming();
    else sendMessage(els.input.value);
  });

  els.input.addEventListener('input', autoGrow);
  els.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!state.streaming) els.form.requestSubmit();
    }
  });

  els.title.addEventListener('click', async () => {
    if (!state.id) return;
    const next = window.prompt('Rename this conversation', els.title.textContent);
    if (next === null || !next.trim()) return;
    try {
      const updated = await api(`/${state.id}`, { method: 'PATCH', body: JSON.stringify({ title: next.trim() }) });
      setTitle(updated.title);
      loadHistory();
    } catch (err) {
      addNotice(err.message);
    }
  });

  els.newChat.addEventListener('click', () => navigate('/'));
  els.menu.addEventListener('click', () => layout.classList.toggle('open'));
  els.scrim.addEventListener('click', closeSidebar);
  window.addEventListener('popstate', route);

  setStreaming(false);
  route();
})();