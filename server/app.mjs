import http from 'node:http';
import { readFileSync, createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { KNOWLEDGE_FILES, MAX_BODY, MAX_QUESTION, ApiError, Limiter, readConfig,
  originAllowed, publicError, runAsk, SECURITY_HEADERS } from './ask-core.mjs';

const PROJECT = fileURLToPath(new URL('../', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

/* Node 侧的知识层加载：把 9 个经典 <script> 丢进一个空沙箱里执行。
 * 沙箱里只有一个 window 指向它自己 —— 那些文件末尾是 })(window) 或 window.__CHARS__ = …。
 * Worker 侧走的是 ESM import（worker/index.mjs），清单同为 KNOWLEDGE_FILES。 */
function loadKnowledge(root) {
  const context = {};
  context.window = context;
  vm.createContext(context);
  for (const file of KNOWLEDGE_FILES) {
    vm.runInContext(readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  return context;
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
  const config = readConfig(env);
  const limiter = new Limiter({ ...config, now });

  const server = http.createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    /* 客户端断开时取消上游请求，占位由 runAsk 的 finally 释放。 */
    const clientGone = new AbortController();
    const disconnected = () => { if (!res.writableEnded) clientGone.abort(); };
    req.on('aborted', disconnected); res.on('close', disconnected);
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/api/health') {
        sendJson(res, 200, { available: !!config.key, model: config.model, mode: 'server', questionMax: MAX_QUESTION });
        return;
      }
      if (url.pathname !== '/api/ask') {
        if (req.method !== 'GET' && req.method !== 'HEAD') throw new ApiError(405, 'METHOD', '该地址不接受此操作。');
        await serveStatic(req, res, root, url); return;
      }
      if (req.method !== 'POST') throw new ApiError(405, 'METHOD', '请通过提问按钮发送问题。');
      const origin = req.headers.origin;
      if (!originAllowed(origin, req.headers.host, env.PUBLIC_ORIGIN) ||
        req.headers['sec-fetch-site'] === 'cross-site') {
        throw new ApiError(403, 'ORIGIN', '请在本站页面内使用问答。');
      }
      if (!config.key) throw new ApiError(503, 'NOT_CONFIGURED', '在线问答暂未开放，可以先查看下方资料卡。');
      const forwarded = env.TRUST_PROXY === 'true' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '';
      const ip = (forwarded || req.socket.remoteAddress || 'unknown').slice(0, 80);
      const result = await runAsk({ knowledge, config, limiter, fetchImpl, ip,
        body: await readJson(req), externalSignal: clientGone.signal });
      sendJson(res, 200, result);
    } catch (error) {
      const safe = publicError(error);
      sendJson(res, safe.status, { error: { code: safe.code, message: safe.message } }, safe.retry);
    } finally {
      req.off('aborted', disconnected); res.off('close', disconnected);
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
