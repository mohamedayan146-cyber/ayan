class ToolError extends Error {
  constructor(message, code = 'tool_error') {
    super(message);
    this.name = 'ToolError';
    this.code = code;
  }
}

const escapeRegex = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const GENRE_ALIASES = {
  'sci-fi': 'Sci-Fi',
  scifi: 'Sci-Fi',
  'sci fi': 'Sci-Fi',
  'science fiction': 'Sci-Fi',
  action: 'Action',
  comedy: 'Comedy',
  drama: 'Drama',
  crime: 'Crime',
  thriller: 'Thriller',
  animation: 'Animation',
  animated: 'Animation',
  cartoon: 'Animation',
};

function canonicalGenre(value) {
  const key = String(value).trim().toLowerCase();
  return GENRE_ALIASES[key] || String(value).trim();
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    const message =
      err.name === 'AbortError'
        ? 'The service took too long to respond.'
        : 'I could not reach the service.';
    throw new ToolError(message, 'api_unreachable');
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { ToolError, escapeRegex, sleep, canonicalGenre, fetchWithTimeout };
const mongoose = require('mongoose');
const { Schema } = mongoose;

const Movie = mongoose.model(
  'Movie',
  new Schema({
    title: { type: String, required: true, trim: true },
    year: Number,
    genre: String,
    rating: Number,
    director: String,
    description: String,
  })
);

const User = mongoose.model(
  'User',
  new Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    age: Number,
    favorite_genre: String,
  })
);

const Review = mongoose.model(
  'Review',
  new Schema({
    movie_id: { type: Schema.Types.ObjectId, ref: 'Movie', required: true },
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, min: 1, max: 10 },
    comment: String,
    date: { type: Date, default: Date.now },
  })
);

const Joke = mongoose.model(
  'Joke',
  new Schema({
    text: { type: String, required: true },
    category: { type: String, enum: ['dad', 'programming', 'general'], default: 'general' },
    source: { type: String, enum: ['api', 'local'], default: 'local' },
    externalId: { type: String, unique: true, sparse: true },
    thumbsUp: { type: Number, default: 0 },
    thumbsDown: { type: Number, default: 0 },
  })
);

// OMDb results are cached for a week, then Mongo removes them automatically
const MovieCache = mongoose.model(
  'MovieCache',
  new Schema({
    key: { type: String, required: true, unique: true },
    data: Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 7 },
  })
);

const ToolStat = mongoose.model(
  'ToolStat',
  new Schema({
    tool: { type: String, required: true, unique: true },
    calls: { type: Number, default: 0 },
    successes: { type: Number, default: 0 },
    failures: { type: Number, default: 0 },
    totalMs: { type: Number, default: 0 },
    lastUsed: Date,
  })
);

module.exports = { Movie, User, Review, Joke, MovieCache, ToolStat };
const { Movie, User, Review } = require('../models');
const { ToolError, escapeRegex, canonicalGenre } = require('../utils');

// The model never writes raw Mongo. It fills in a small query spec, and
// everything in it is checked against this whitelist before it runs.
const COLLECTIONS = {
  movies: {
    model: Movie,
    fields: { title: 'string', year: 'number', genre: 'string', rating: 'number', director: 'string', description: 'string' },
    defaultSort: { rating: -1 },
  },
  users: {
    model: User,
    fields: { name: 'string', email: 'string', age: 'number', favorite_genre: 'string' },
    defaultSort: { name: 1 },
  },
  reviews: {
    model: Review,
    fields: { rating: 'number', comment: 'string', date: 'date' },
    defaultSort: { date: -1 },
  },
};

const GENRE_FIELDS = new Set(['genre', 'favorite_genre']);
const OPERATIONS = ['find', 'count', 'group_count', 'average'];
const OPERATORS = ['eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'];

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const invalid = (message) => new ToolError(message, 'invalid_query');

function toNumber(field, value) {
  const n = Number(value);
  if (value === '' || value === null || Number.isNaN(n)) {
    throw invalid(`"${field}" needs a number, but I got "${value}".`);
  }
  return n;
}

function toDate(field, value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw invalid(`"${field}" needs a valid date, but I got "${value}".`);
  return d;
}

function buildCondition(field, type, op, rawValue) {
  const clean = (v) => (GENRE_FIELDS.has(field) ? canonicalGenre(v) : String(v).trim());

  if (op === 'in') {
    const list = Array.isArray(rawValue) ? rawValue : String(rawValue).split(',');
    const values = list.map((v) => String(v).trim()).filter(Boolean);
    if (!values.length) throw invalid(`Give me at least one value for "${field}".`);
    if (type === 'number') return { $in: values.map((v) => toNumber(field, v)) };
    if (type === 'date') return { $in: values.map((v) => toDate(field, v)) };
    return { $regex: `^(${values.map((v) => escapeRegex(clean(v))).join('|')})$`, $options: 'i' };
  }

  if (op === 'contains') {
    if (type !== 'string') throw invalid(`"contains" only works on text fields, and "${field}" isn't one.`);
    return { $regex: escapeRegex(clean(rawValue)), $options: 'i' };
  }

  if (type === 'string') {
    if (op !== 'eq') throw invalid(`Text fields like "${field}" can only use "eq", "contains" or "in".`);
    return { $regex: `^${escapeRegex(clean(rawValue))}$`, $options: 'i' };
  }

  const value = type === 'number' ? toNumber(field, rawValue) : toDate(field, rawValue);
  return op === 'eq' ? value : { [`$${op}`]: value };
}

function normalizeSpec(raw) {
  if (!raw || typeof raw !== 'object') throw invalid('I need a query to run.');

  const collection = String(raw.collection || '').toLowerCase();
  const def = COLLECTIONS[collection];
  if (!def) throw invalid(`I can search movies, users and reviews, but "${raw.collection}" isn't one of those.`);

  const operation = raw.operation || 'find';
  if (!OPERATIONS.includes(operation)) throw invalid(`I don't know how to "${operation}". Try find, count, group_count or average.`);

  const rawFilters = Array.isArray(raw.filters) ? raw.filters : [];
  if (rawFilters.length > 8) throw invalid('That query has too many conditions. Try narrowing it down.');

  const filters = rawFilters.map((f) => {
    if (!f || !has(def.fields, f.field)) {
      throw invalid(`"${f && f.field}" isn't a field in ${collection}. Available: ${Object.keys(def.fields).join(', ')}.`);
    }
    if (!OPERATORS.includes(f.op)) throw invalid(`I don't know the comparison "${f.op}".`);
    if (f.value === undefined || f.value === null || f.value === '') throw invalid(`I'm missing a value for "${f.field}".`);
    return { field: f.field, op: f.op, value: f.value };
  });

  const limit = Math.min(Math.max(parseInt(raw.limit, 10) || 25, 1), 100);

  let sort = null;
  if (raw.sort && raw.sort.field) {
    if (!has(def.fields, raw.sort.field)) throw invalid(`I can't sort by "${raw.sort.field}".`);
    sort = { field: raw.sort.field, direction: raw.sort.direction === 'asc' ? 1 : -1 };
  }

  let groupBy = null;
  if (raw.groupBy) {
    if (!has(def.fields, raw.groupBy)) throw invalid(`I can't group by "${raw.groupBy}".`);
    groupBy = raw.groupBy;
  }
  if (operation === 'group_count' && !groupBy) throw invalid('Tell me which field to group by, for example genre.');

  let metricField = null;
  if (operation === 'average') {
    metricField = raw.metricField || (collection === 'users' ? 'age' : 'rating');
    if (def.fields[metricField] !== 'number') throw invalid(`I can only average number fields, and "${metricField}" isn't one.`);
  }

  return { collection, def, operation, filters, limit, sort, groupBy, metricField };
}

function buildFilter(spec) {
  const clauses = spec.filters.map((f) => ({
    [f.field]: buildCondition(f.field, spec.def.fields[f.field], f.op, f.value),
  }));
  return clauses.length ? { $and: clauses } : {};
}

function shapeRow(collection, d) {
  const id = String(d._id);
  if (collection === 'movies') {
    return { id, title: d.title, year: d.year ?? null, genre: d.genre ?? null, rating: d.rating ?? null, director: d.director ?? null, description: d.description ?? null };
  }
  if (collection === 'users') {
    return { id, name: d.name, email: d.email, age: d.age ?? null, favorite_genre: d.favorite_genre ?? null };
  }
  return {
    id,
    movie: d.movie_id?.title ?? null,
    user: d.user_id?.name ?? null,
    rating: d.rating ?? null,
    comment: d.comment ?? null,
    date: d.date ?? null,
  };
}

async function runQuery(rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const { model } = spec.def;
  const filter = buildFilter(spec);
  const metadata = { collection: spec.collection, operation: spec.operation, filter, limit: spec.limit };
  let data;

  if (spec.operation === 'count') {
    data = { count: await model.countDocuments(filter) };
  } else if (spec.operation === 'group_count') {
    const rows = await model.aggregate([
      { $match: filter },
      { $group: { _id: `$${spec.groupBy}`, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: spec.limit },
    ]);
    data = rows.map((r) => ({ [spec.groupBy]: r._id, count: r.count }));
  } else if (spec.operation === 'average') {
    const rows = await model.aggregate([
      { $match: filter },
      {
        $group: {
          _id: spec.groupBy ? `$${spec.groupBy}` : null,
          average: { $avg: `$${spec.metricField}` },
          count: { $sum: 1 },
        },
      },
      { $sort: { average: -1 } },
      { $limit: spec.limit },
    ]);
    data = rows.map((r) => ({
      ...(spec.groupBy ? { [spec.groupBy]: r._id } : {}),
      average: r.average === null ? null : Math.round(r.average * 100) / 100,
      count: r.count,
    }));
    metadata.metricField = spec.metricField;
  } else {
    const sort = spec.sort ? { [spec.sort.field]: spec.sort.direction } : spec.def.defaultSort;
    let query = model.find(filter).sort(sort).limit(spec.limit);
    if (spec.collection === 'reviews') {
      query = query.populate('movie_id', 'title').populate('user_id', 'name');
    }
    const [docs, total] = await Promise.all([query.lean(), model.countDocuments(filter)]);
    data = docs.map((d) => shapeRow(spec.collection, d));
    metadata.totalMatches = total;
  }

  metadata.rowCount = Array.isArray(data) ? data.length : 1;
  return { data, metadata };
}

// Used only when the AI model is unavailable: handles the common questions by pattern
function specFromQuestion(question) {
  const text = String(question).toLowerCase().replace(/[?!.]+$/, '').trim();
  let m;

  if (/(count|how many).*movies.*(by|per|each)\s+genre/.test(text) || /movies per genre/.test(text)) {
    return { collection: 'movies', operation: 'group_count', groupBy: 'genre' };
  }
  if ((m = text.match(/users?\s+(?:over|older than|above)\s+(\d+)/))) {
    return { collection: 'users', operation: 'find', filters: [{ field: 'age', op: 'gt', value: m[1] }] };
  }
  if ((m = text.match(/movies?.*rating\s+(?:above|over|greater than|higher than|more than)\s+(\d+(?:\.\d+)?)/))) {
    return {
      collection: 'movies',
      operation: 'find',
      filters: [{ field: 'rating', op: 'gt', value: m[1] }],
      sort: { field: 'rating', direction: 'desc' },
    };
  }
  if ((m = text.match(/(?:show|list|find|get)(?:\s+me)?(?:\s+all)?(?:\s+the)?\s+([a-z-]+(?:\s[a-z]+)?)\s+movies/))) {
    const genre = m[1].trim();
    if (genre !== 'all') {
      return { collection: 'movies', operation: 'find', filters: [{ field: 'genre', op: 'eq', value: genre }] };
    }
  }
  return null;
}

module.exports = { runQuery, specFromQuestion };
const { Movie, MovieCache } = require('../models');
const { ToolError, escapeRegex, sleep, canonicalGenre, fetchWithTimeout } = require('../utils');

const OMDB_URL = 'https://www.omdbapi.com/';
const DAILY_LIMIT = 1000;
const MIN_GAP_MS = 250;
const usage = { day: '', count: 0, lastCall: 0 };

const cleanValue = (v) => (v && v !== 'N/A' ? v : null);

async function omdbRequest(params) {
  const apiKey = process.env.OMDB_API_KEY;
  if (!apiKey) throw new ToolError('The OMDb API key is missing. Add OMDB_API_KEY to your .env file.', 'no_api_key');

  // Stay safely under the free tier's 1000 requests a day, and don't hammer the API
  const day = new Date().toISOString().slice(0, 10);
  if (usage.day !== day) {
    usage.day = day;
    usage.count = 0;
  }
  if (usage.count >= DAILY_LIMIT - 25) throw new ToolError('We are close to the daily OMDb request limit.', 'rate_limit');
  usage.count += 1;

  const wait = usage.lastCall + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  usage.lastCall = Date.now();

  const url = new URL(OMDB_URL);
  for (const [key, value] of Object.entries({ ...params, apikey: apiKey })) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const res = await fetchWithTimeout(url);
  if (res.status === 401) throw new ToolError('OMDb did not accept the API key.', 'bad_api_key');
  if (res.status === 429) throw new ToolError('OMDb says we are sending too many requests.', 'rate_limit');
  if (!res.ok) throw new ToolError(`OMDb answered with HTTP ${res.status}.`, 'api_error');

  const body = await res.json();
  if (body.Response === 'False') {
    const reason = body.Error || 'Movie not found!';
    if (/limit/i.test(reason)) throw new ToolError('The OMDb daily request limit has been reached.', 'rate_limit');
    if (/not found/i.test(reason)) throw new ToolError('Movie not found.', 'not_found');
    throw new ToolError(reason, 'api_error');
  }
  return body;
}

function normalizeMovie(b) {
  return {
    imdbID: b.imdbID,
    title: b.Title,
    year: cleanValue(b.Year),
    rated: cleanValue(b.Rated),
    released: cleanValue(b.Released),
    runtime: cleanValue(b.Runtime),
    genre: cleanValue(b.Genre),
    director: cleanValue(b.Director),
    cast: cleanValue(b.Actors) ? b.Actors.split(',').map((name) => name.trim()) : [],
    plot: cleanValue(b.Plot),
    poster: cleanValue(b.Poster),
    ratings: (b.Ratings || []).map((r) => ({ source: r.Source, value: r.Value })),
    imdbRating: cleanValue(b.imdbRating),
  };
}

const fromLocal = (m) => ({
  imdbID: null,
  title: m.title,
  year: m.year ? String(m.year) : null,
  rated: null,
  released: null,
  runtime: null,
  genre: m.genre || null,
  director: m.director || null,
  cast: [],
  plot: m.description || null,
  poster: null,
  ratings: [],
  imdbRating: m.rating ? String(m.rating) : null,
});

const cacheGet = (key) => MovieCache.findOne({ key }).lean();
const cacheSet = (key, data) =>
  MovieCache.findOneAndUpdate({ key }, { key, data, createdAt: new Date() }, { upsert: true });

async function localFallback(name, year, originalError) {
  const filter = { title: { $regex: escapeRegex(name), $options: 'i' } };
  if (year) filter.year = Number(year);
  const local = await Movie.findOne(filter).sort({ rating: -1 }).lean();

  if (local) {
    return { data: fromLocal(local), metadata: { source: 'local-fallback', warning: originalError.message } };
  }
  if (originalError.code === 'not_found') throw originalError;
  throw new ToolError(
    `${originalError.message} I also couldn't find "${name}" in the local database.`,
    originalError.code
  );
}

async function getMovieDetails({ title, year } = {}) {
  const name = String(title || '').trim();
  if (!name) throw new ToolError('Which movie should I look up?', 'invalid_input');

  const key = `details:${name.toLowerCase()}:${year || ''}`;
  const cached = await cacheGet(key);
  if (cached) return { data: cached.data, metadata: { source: 'cache', cachedAt: cached.createdAt } };

  try {
    let body;
    try {
      body = await omdbRequest({ t: name, y: year, plot: 'full' });
    } catch (err) {
      if (err.code !== 'not_found') throw err;
      // No exact match, so try a partial title search and take the best hit
      const found = await omdbRequest({ s: name, y: year, type: 'movie' });
      body = await omdbRequest({ i: found.Search[0].imdbID, plot: 'full' });
    }
    const data = normalizeMovie(body);
    await cacheSet(key, data);
    return { data, metadata: { source: 'omdb' } };
  } catch (err) {
    return localFallback(name, year, err);
  }
}

async function searchMovies({ query, year, page = 1 } = {}) {
  const term = String(query || '').trim();
  if (!term) throw new ToolError('What title should I search for?', 'invalid_input');

  const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
  const key = `search:${term.toLowerCase()}:${year || ''}:${pageNumber}`;
  const cached = await cacheGet(key);
  if (cached) {
    return { data: cached.data.results, metadata: { source: 'cache', totalResults: cached.data.total, page: pageNumber } };
  }

  try {
    const body = await omdbRequest({ s: term, y: year, type: 'movie', page: pageNumber });
    const results = body.Search.map((m) => ({
      imdbID: m.imdbID,
      title: m.Title,
      year: cleanValue(m.Year),
      poster: cleanValue(m.Poster),
    }));
    const total = Number(body.totalResults) || results.length;
    await cacheSet(key, { results, total });
    return { data: results, metadata: { source: 'omdb', totalResults: total, page: pageNumber } };
  } catch (err) {
    const filter = { title: { $regex: escapeRegex(term), $options: 'i' } };
    if (year) filter.year = Number(year);
    const local = await Movie.find(filter).sort({ rating: -1 }).limit(10).lean();

    if (!local.length) {
      if (err.code === 'not_found') throw err;
      throw new ToolError(`${err.message} Nothing matching "${term}" in the local database either.`, err.code);
    }
    return {
      data: local.map((m) => ({ imdbID: null, title: m.title, year: String(m.year), poster: null })),
      metadata: { source: 'local-fallback', warning: err.message },
    };
  }
}

async function recommendMovies({ genre, year, limit = 6 } = {}) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 6, 1), 12);
  const wantedGenre = genre ? canonicalGenre(genre) : null;
  const wantedYear = year ? Number(year) : null;

  const filter = {};
  if (wantedGenre) filter.genre = { $regex: escapeRegex(wantedGenre), $options: 'i' };
  if (wantedYear) filter.year = { $gte: wantedYear - 5, $lte: wantedYear + 5 };

  const local = await Movie.find(filter).sort({ rating: -1 }).limit(max).lean();
  const picks = local.map((m) => ({
    title: m.title,
    year: String(m.year),
    genre: m.genre,
    rating: m.rating,
    poster: null,
    source: 'local',
  }));

  // Movies we've already looked up on OMDb come with posters, so include them too
  const cachedEntries = await MovieCache.find({ key: /^details:/ }).limit(200).lean();
  for (const entry of cachedEntries) {
    const m = entry.data;
    if (!m || !m.title) continue;
    const movieYear = Number(String(m.year || '').slice(0, 4));
    const yearOk = !wantedYear || Math.abs(movieYear - wantedYear) <= 5;
    const genreOk = !wantedGenre || String(m.genre || '').toLowerCase().includes(wantedGenre.toLowerCase());
    if (yearOk && genreOk) {
      picks.push({ title: m.title, year: m.year, genre: m.genre, rating: Number(m.imdbRating) || null, poster: m.poster, source: 'cache' });
    }
  }

  const unique = [...new Map(picks.map((p) => [p.title.toLowerCase(), p])).values()];
  unique.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  return {
    data: unique.slice(0, max),
    metadata: { genre: wantedGenre, year: wantedYear, source: 'local + cache' },
  };
}

module.exports = { getMovieDetails, searchMovies, recommendMovies };
const { ToolStat } = require('./models');
const { ToolError } = require('./utils');
const { runQuery } = require('./services/nlQuery');
const { searchMovies, getMovieDetails, recommendMovies } = require('./services/omdb');
const { getJoke, searchJokes } = require('./services/jokes');

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Look up data in our own database. Use it for questions about stored movies, users and reviews, including counts, averages and groupings. ' +
        'Fields: movies(title, year, genre, rating, director, description), users(name, email, age, favorite_genre), reviews(rating, comment, date). ' +
        'Genres look like Sci-Fi, Action, Drama, Crime, Comedy, Thriller, Animation.',
      parameters: {
        type: 'object',
        properties: {
          collection: { type: 'string', enum: ['movies', 'users', 'reviews'] },
          operation: {
            type: 'string',
            enum: ['find', 'count', 'group_count', 'average'],
            description: 'find = list records, count = how many, group_count = count per value of groupBy, average = mean of metricField',
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] },
                value: { type: 'string', description: 'Plain text or digits like "8.5". For op "in", comma-separated values.' },
              },
              required: ['field', 'op', 'value'],
            },
          },
          sort: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['field'],
          },
          limit: { type: 'integer', description: 'Max rows to return (default 25)' },
          groupBy: { type: 'string', description: 'Field to group by for group_count or average' },
          metricField: { type: 'string', description: 'Numeric field to average (default rating, or age for users)' },
        },
        required: ['collection', 'operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_details',
      description: 'Get full details for one specific movie from OMDb: plot, cast, ratings, poster and runtime.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          year: { type: 'integer', description: 'Release year, if the user gave one' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_movies',
      description: 'Search OMDb by full or partial title. Use it when the user is not sure of the exact name or wants a list of matches.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          year: { type: 'integer' },
          page: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_movies',
      description: 'Suggest movies by genre and/or around a given year, using stored movies and films looked up before.',
      parameters: {
        type: 'object',
        properties: {
          genre: { type: 'string' },
          year: { type: 'integer', description: 'Looks at films within about 5 years of this' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_joke',
      description: 'Tell a random joke. Categories: dad, programming, general.',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string', enum: ['dad', 'programming', 'general'] } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_jokes',
      description: 'Find jokes that mention a keyword, like "cat" or "bug".',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
        required: ['keyword'],
      },
    },
  },
];

const handlers = {
  query_database: runQuery,
  get_movie_details: getMovieDetails,
  search_movies: searchMovies,
  recommend_movies: recommendMovies,
  get_joke: getJoke,
  search_jokes: searchJokes,
};

function friendlyMessage(err) {
  if (err instanceof ToolError) return err.message;
  console.error('Unexpected tool error:', err);
  return 'Something unexpected went wrong while running that.';
}

async function recordStat(tool, ok, ms) {
  try {
    await ToolStat.findOneAndUpdate(
      { tool },
      {
        $inc: { calls: 1, successes: ok ? 1 : 0, failures: ok ? 0 : 1, totalMs: ms },
        $set: { lastUsed: new Date() },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Could not record tool stats:', err.message);
  }
}

// Always resolves with a structured result: { tool, success, data, metadata } or { tool, success: false, error }
async function runTool(name, args) {
  const started = Date.now();
  const handler = handlers[name];

  if (!handler) {
    return { tool: name, success: false, error: `I don't have a tool called "${name}".`, metadata: {} };
  }

  try {
    const result = await handler(args || {});
    const ms = Date.now() - started;
    await recordStat(name, true, ms);
    return { tool: name, success: true, data: result.data, metadata: { ...result.metadata, executionMs: ms } };
  } catch (err) {
    const ms = Date.now() - started;
    await recordStat(name, false, ms);
    return { tool: name, success: false, error: friendlyMessage(err), metadata: { executionMs: ms } };
  }
}

async function getStats() {
  const rows = await ToolStat.find().sort({ calls: -1 }).lean();
  const tools = rows.map((r) => ({
    tool: r.tool,
    calls: r.calls,
    successes: r.successes,
    failures: r.failures,
    avgMs: r.calls ? Math.round(r.totalMs / r.calls) : 0,
    lastUsed: r.lastUsed,
  }));
  return { tools, totalCalls: tools.reduce((sum, t) => sum + t.calls, 0) };
}

const resetStats = () => ToolStat.deleteMany({});

module.exports = { toolDefinitions, runTool, getStats, resetStats };
const { ToolStat } = require('./models');
const { ToolError } = require('./utils');
const { runQuery } = require('./services/nlQuery');
const { searchMovies, getMovieDetails, recommendMovies } = require('./services/omdb');
const { getJoke, searchJokes } = require('./services/jokes');

const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'query_database',
      description:
        'Look up data in our own database. Use it for questions about stored movies, users and reviews, including counts, averages and groupings. ' +
        'Fields: movies(title, year, genre, rating, director, description), users(name, email, age, favorite_genre), reviews(rating, comment, date). ' +
        'Genres look like Sci-Fi, Action, Drama, Crime, Comedy, Thriller, Animation.',
      parameters: {
        type: 'object',
        properties: {
          collection: { type: 'string', enum: ['movies', 'users', 'reviews'] },
          operation: {
            type: 'string',
            enum: ['find', 'count', 'group_count', 'average'],
            description: 'find = list records, count = how many, group_count = count per value of groupBy, average = mean of metricField',
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'gt', 'gte', 'lt', 'lte', 'contains', 'in'] },
                value: { type: 'string', description: 'Plain text or digits like "8.5". For op "in", comma-separated values.' },
              },
              required: ['field', 'op', 'value'],
            },
          },
          sort: {
            type: 'object',
            properties: {
              field: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['field'],
          },
          limit: { type: 'integer', description: 'Max rows to return (default 25)' },
          groupBy: { type: 'string', description: 'Field to group by for group_count or average' },
          metricField: { type: 'string', description: 'Numeric field to average (default rating, or age for users)' },
        },
        required: ['collection', 'operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_movie_details',
      description: 'Get full details for one specific movie from OMDb: plot, cast, ratings, poster and runtime.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          year: { type: 'integer', description: 'Release year, if the user gave one' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_movies',
      description: 'Search OMDb by full or partial title. Use it when the user is not sure of the exact name or wants a list of matches.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          year: { type: 'integer' },
          page: { type: 'integer' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_movies',
      description: 'Suggest movies by genre and/or around a given year, using stored movies and films looked up before.',
      parameters: {
        type: 'object',
        properties: {
          genre: { type: 'string' },
          year: { type: 'integer', description: 'Looks at films within about 5 years of this' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_joke',
      description: 'Tell a random joke. Categories: dad, programming, general.',
      parameters: {
        type: 'object',
        properties: { category: { type: 'string', enum: ['dad', 'programming', 'general'] } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_jokes',
      description: 'Find jokes that mention a keyword, like "cat" or "bug".',
      parameters: {
        type: 'object',
        properties: { keyword: { type: 'string' } },
        required: ['keyword'],
      },
    },
  },
];

const handlers = {
  query_database: runQuery,
  get_movie_details: getMovieDetails,
  search_movies: searchMovies,
  recommend_movies: recommendMovies,
  get_joke: getJoke,
  search_jokes: searchJokes,
};

function friendlyMessage(err) {
  if (err instanceof ToolError) return err.message;
  console.error('Unexpected tool error:', err);
  return 'Something unexpected went wrong while running that.';
}

async function recordStat(tool, ok, ms) {
  try {
    await ToolStat.findOneAndUpdate(
      { tool },
      {
        $inc: { calls: 1, successes: ok ? 1 : 0, failures: ok ? 0 : 1, totalMs: ms },
        $set: { lastUsed: new Date() },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('Could not record tool stats:', err.message);
  }
}

// Always resolves with a structured result: { tool, success, data, metadata } or { tool, success: false, error }
async function runTool(name, args) {
  const started = Date.now();
  const handler = handlers[name];

  if (!handler) {
    return { tool: name, success: false, error: `I don't have a tool called "${name}".`, metadata: {} };
  }

  try {
    const result = await handler(args || {});
    const ms = Date.now() - started;
    await recordStat(name, true, ms);
    return { tool: name, success: true, data: result.data, metadata: { ...result.metadata, executionMs: ms } };
  } catch (err) {
    const ms = Date.now() - started;
    await recordStat(name, false, ms);
    return { tool: name, success: false, error: friendlyMessage(err), metadata: { executionMs: ms } };
  }
}

async function getStats() {
  const rows = await ToolStat.find().sort({ calls: -1 }).lean();
  const tools = rows.map((r) => ({
    tool: r.tool,
    calls: r.calls,
    successes: r.successes,
    failures: r.failures,
    avgMs: r.calls ? Math.round(r.totalMs / r.calls) : 0,
    lastUsed: r.lastUsed,
  }));
  return { tools, totalCalls: tools.reduce((sum, t) => sum + t.calls, 0) };
}

const resetStats = () => ToolStat.deleteMany({});

module.exports = { toolDefinitions, runTool, getStats, resetStats };