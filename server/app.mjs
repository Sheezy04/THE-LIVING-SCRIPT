import http from 'node:http';
import { readFileSync, createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const MAX_BODY = 24000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

function loadKnowledge(root) {
  const context = {};
  context.window = context;
  vm.createContext(context);
  for (const file of ['src/components.js', 'src/graph.js', 'src/stats.js', 'src/ask.js',
    'data/chars.js', 'data/catalog.js', 'data/ancient.js', 'data/evidence.js', 'data/gap-notes.js']) {
    vm.runInContext(readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context;
}

class ApiError extends Error {
  constructor(status, code, message, retry = 0) { super(message); this.status = status; this.code = code; this.retry = retry; }
}

function integer(value, fallback, min = 1, max = 1000000) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function sendJson(res, status, value, retry = 0) {
  if (res.destroyed || res.writableEnded) return;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (retry) res.setHeader('Retry-After', String(retry));
  res.writeHead(status);
  res.end(JSON.stringify(value));
}

function readJson(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) {
    throw new ApiError(415, 'CONTENT_TYPE', '请使用 JSON 格式提问。');
  }
  if (Number(req.headers['content-length'] || 0) > MAX_BODY) {
    req.resume();
    throw new ApiError(413, 'TOO_LARGE', '对话内容过长，请开始新对话。');
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    const cleanup = () => { req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const error = () => { cleanup(); reject(new ApiError(400, 'BODY', '提问未完整发送，请重试。')); };
    const aborted = error;
    const data = chunk => {
      size += chunk.length;
      if (size > MAX_BODY) {
        cleanup(); req.resume(); reject(new ApiError(413, 'TOO_LARGE', '对话内容过长，请开始新对话。'));
      } else chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new ApiError(400, 'JSON', '提问格式有误，请重新发送。')); }
    };
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', aborted);
  });
}

function validateInput(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(key => !['char', 'question', 'history'].includes(key))) {
    throw new ApiError(400, 'INPUT', '只接受当前汉字、问题和对话记录。');
  }
  if (typeof input.char !== 'string' || !Object.hasOwn(catalog, input.char)) {
    throw new ApiError(400, 'CHARACTER', '请先选择资料库中的汉字。');
  }
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > 300) {
    throw new ApiError(400, 'QUESTION', '问题需为 1 至 300 字。');
  }
  const history = input.history === undefined ? [] : input.history;
  if (!Array.isArray(history) || history.length > 6 || history.length % 2 || history.some((message, i) =>
    !message || message.role !== (i % 2 ? 'assistant' : 'user') || typeof message.content !== 'string' ||
    !message.content.trim() || message.content.length > (i % 2 ? 4000 : 300))) {
    throw new ApiError(400, 'HISTORY', '对话记录有误，请开始新对话后重试。');
  }
  return { char: input.char, question: input.question.trim(), history };
}

async function readUpstream(response) {
  if (!response.body) throw new ApiError(502, 'EMPTY', '模型没有返回内容，请重试。');
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 64000) throw new ApiError(502, 'RESPONSE_SIZE', '模型返回内容过长，请缩短问题后重试。');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ApiError(502, 'RESPONSE_FORMAT', '模型返回格式异常，请重试。'); }
}

async function serveStatic(req, res, root, url) {
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { throw new ApiError(400, 'PATH', '地址格式有误。'); }
  if (pathname === '/') pathname = '/index.html';
  if (!(pathname === '/index.html' || /^\/(assets|src|data)\//.test(pathname)) ||
    pathname.includes('\\') || pathname.split('/').some(segment => segment.startsWith('.')) ||
    !Object.hasOwn(MIME, path.extname(pathname).toLowerCase())) {
    throw new ApiError(404, 'NOT_FOUND', '页面不存在。');
  }
  const allowed = pathname === '/index.html' ? root : path.join(root, pathname.split('/')[1]);
  let file, info;
  try {
    file = await realpath(path.join(root, pathname.slice(1)));
    const relative = path.relative(allowed, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('outside static directory');
    info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
  } catch { throw new ApiError(404, 'NOT_FOUND', '文件不存在。'); }
  res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()]);
  res.setHeader('Content-Length', info.size);
  res.setHeader('Cache-Control', pathname === '/index.html' ? 'no-cache' : 'public, max-age=3600');
  res.writeHead(200);
  if (req.method === 'HEAD') res.end();
  else createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

export function createAppServer({ root = PROJECT, env = process.env, fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  const knowledge = loadKnowledge(root);
  const key = String(env.DEEPSEEK_API_KEY || '').trim();
  const model = /^[\w.:-]{1,80}$/.test(env.DEEPSEEK_MODEL || '') ? env.DEEPSEEK_MODEL : 'deepseek-flash';
  const minuteLimit = integer(env.ASK_RATE_LIMIT, 8);
  const dailyLimit = integer(env.ASK_DAILY_LIMIT, 200);
  const concurrency = integer(env.ASK_CONCURRENCY, 4, 1, 32);
  const timeout = integer(env.ASK_TIMEOUT_MS, 40000, 10, 120000);
  const buckets = new Map();
  const inFlight = new Set();
  let active = 0, day = -1, daily = 0;

  function reserve(ip) {
    const time = now();
    const currentDay = Math.floor(time / 86400000);
    if (day !== currentDay) { day = currentDay; daily = 0; }
    for (const [address, bucket] of buckets) if (bucket.until <= time) buckets.delete(address);
    if (active >= concurrency || inFlight.has(ip)) throw new ApiError(429, 'BUSY', '问答正在处理中，请稍后再试。', 5);
    if (daily >= dailyLimit) throw new ApiError(429, 'DAILY_LIMIT', '今日问答次数已用完，学习与资料查看仍可使用。', Math.ceil(((currentDay + 1) * 86400000 - time) / 1000));
    const bucket = buckets.get(ip) || { count: 0, until: time + 60000 };
    if (bucket.count >= minuteLimit || (!buckets.has(ip) && buckets.size >= 5000)) {
      throw new ApiError(429, 'RATE_LIMIT', '提问太频繁，请稍后再试。', Math.max(1, Math.ceil((bucket.until - time) / 1000)));
    }
    bucket.count++; buckets.set(ip, bucket); daily++; active++; inFlight.add(ip);
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { available: !!key, model, mode: 'server', questionMax: 300 }); return;
      }
      if (url.pathname !== '/api/ask') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'METHOD', '该地址不接受此操作。');
        await serveStatic(req, res, root, url); return;
      }
      if (req.method !== 'POST') throw new ApiError(405, 'METHOD', '请通过提问按钮发送问题。');
      const origin = req.headers.origin;
      let originAllowed = !origin;
      if (origin) {
        try { originAllowed = env.PUBLIC_ORIGIN ? origin === new URL(env.PUBLIC_ORIGIN).origin : new URL(origin).host === req.headers.host; }
        catch { originAllowed = false; }
      }
      if (!originAllowed || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403, 'ORIGIN', '请在本站页面内使用问答。');
      if (!key) throw new ApiError(503, 'NOT_CONFIGURED', '在线问答暂未开放，可以先查看下方资料卡。');
      const input = validateInput(await readJson(req), knowledge.CharCatalog);
      const forwarded = env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
      const ip = (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 80);
      reserve(ip);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      req.on('aborted', disconnected); res.on('close', disconnected);
      try {
        const prepared = knowledge.ZQ.Ask.prepare(input.char, input.question, input.history);
        const upstream = await fetchImpl('https://api.deepseek.com/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
          body: JSON.stringify({ model, messages: prepared.messages, stream: false, temperature: 0,
            thinking: { type: 'disabled' }, max_tokens: 1024 })
        });
        if (!upstream.ok) {
          if (upstream.body) await upstream.body.cancel();
          if (upstream.status === 429) throw new ApiError(429, 'PROVIDER_BUSY', '模型服务繁忙，请稍后重试。', 30);
          if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
            throw new ApiError(503, 'PROVIDER_CONFIG', '问答服务暂不可用，请联系站点维护者。');
          }
          throw new ApiError(502, 'PROVIDER_ERROR', '模型服务暂时不可用，请稍后重试。');
        }
        const data = await readUpstream(upstream);
        const choice = data.choices && data.choices[0];
        const content = choice && choice.message && choice.message.content;
        if (typeof content !== 'string' || !content.trim()) throw new ApiError(502, 'EMPTY', '模型没有返回回答，请重试。');
        sendJson(res, 200, { answer: knowledge.ZQ.Ask.redact(content.trim().slice(0, 8000), key),
          sources: prepared.sources, model, truncated: choice.finish_reason === 'length' });
      } catch (error) {
        if (controller.signal.aborted) throw new ApiError(504, 'TIMEOUT', '等待回答超时，请稍后重试。');
        throw error;
      } finally {
        clearTimeout(timer); req.off('aborted', disconnected); res.off('close', disconnected);
        inFlight.delete(ip); active--;
      }
    } catch (error) {
      // Never expose upstream bodies, credentials, exception details, or user conversation in logs.
      const safe = error instanceof ApiError ? error : new ApiError(502, 'UNAVAILABLE', '问答连接暂时不可用，请稍后重试。');
      sendJson(res, safe.status, { error: { code: safe.code, message: safe.message } }, safe.retry);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
