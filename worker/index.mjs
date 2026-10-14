/* 「可选在线问答」的 Cloudflare Worker 适配层：一个域同时给网页和 /api/。
 *
 * ── 它在整条链上的位置 ────────────────────────────────────────
 *   worker/index.mjs（本文件）  ← 只做三件平台相关的事：收请求、发响应、取访客 IP
 *   server/ask-core.mjs         ← 校验 / 限流 / 上游调用 / 错误码，与 Node 侧同一份
 *   静态资源                    ← 由 Cloudflare 的 assets 绑定的 env.ASSETS 直接给
 *
 * ── 为什么知识层这里是 import，Node 侧是 node:vm ───────────────
 * 那 9 个文件是给浏览器写的经典 <script>（末尾 `})(window)`、
 * 或 `window.__CHARS__ = …`），Worker 里没有 vm，所以改成一个真 window：
 * 先挂 `globalThis.window`，再按**与 Node 侧同一份清单**的顺序 import。
 * 已核实它们严格模式安全（无隐式全局、无 with/eval/new Function）。
 *
 * ── 说清楚的边界 ──────────────────────────────────────────────
 * 1. **限流是每实例内存计数**。Workers 会按机房与负载起多个实例，每个实例各记各的，
 *    所以日配额不是全站精确值（Node 单进程那侧才是）。要精确就得换 Durable Object，
 *    本轮没做 —— 真正的硬闸是在 DeepSeek 控制台设消费上限。
 * 2. **`?v=` 那套缓存号不经过这里**：静态资源由 assets 直接发。
 * 3. 这一层不碰 fs、不碰 node: 模块，所以 wrangler.jsonc 里**不需要 nodejs_compat**。
 */

import { KNOWLEDGE_FILES, MAX_BODY, MAX_QUESTION, ApiError, Limiter, readConfig,
  originAllowed, publicError, runAsk, SECURITY_HEADERS } from '../server/ask-core.mjs';

/* 每个文件一条**字面量** import：打包器要能静态看见路径才会把它打进 Worker 包，
 * 拼字符串的 import('../' + file) 在这里会直接失败。
 * 键必须覆盖 KNOWLEDGE_FILES —— 少一个就在 loadKnowledge 里立刻报错，
 * 而不是等到某个字的资料卡莫名少一段。 */
const LOADERS = {
  'src/components.js': () => import('../src/components.js'),
  'src/graph.js': () => import('../src/graph.js'),
  'src/stats.js': () => import('../src/stats.js'),
  'src/ask.js': () => import('../src/ask.js'),
  'data/chars.js': () => import('../data/chars.js'),
  'data/catalog.js': () => import('../data/catalog.js'),
  'data/ancient.js': () => import('../data/ancient.js'),
  'data/evidence.js': () => import('../data/evidence.js'),
  'data/gap-notes.js': () => import('../data/gap-notes.js')
};

async function loadKnowledge() {
  const window = {};
  globalThis.window = window;
  for (const file of KNOWLEDGE_FILES) {
    const load = LOADERS[file];
    if (!load) throw new Error('worker/index.mjs 缺少 ' + file + ' 的加载器（KNOWLEDGE_FILES 与 LOADERS 必须一致）');
    await load();
  }
  return window;
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) {
    throw new ApiError(415, 'CONTENT_TYPE', '请使用 JSON 格式提问。');
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY) {
    throw new ApiError(413, 'TOO_LARGE', '对话内容过长，请开始新对话。');
  }
  let text;
  try { text = await request.text(); }
  catch { throw new ApiError(400, 'BODY', '提问未完整发送，请重试。'); }
  if (text.length > MAX_BODY) throw new ApiError(413, 'TOO_LARGE', '对话内容过长，请开始新对话。');
  try { return JSON.parse(text); }
  catch { throw new ApiError(400, 'JSON', '提问格式有误，请重新发送。'); }
}

function json(value, status = 200, retry = 0) {
  const headers = { ...SECURITY_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (retry) headers['Retry-After'] = String(retry);
  return new Response(JSON.stringify(value), { status, headers });
}

/** 知识层按**模块**缓存，不按 createWorker 缓存。
 *  理由：ESM 的 import 在一个进程／一个实例里只求值一次 —— 第二次 createWorker
 *  再 import 同一批文件时文件体不会重跑，新 window 只会是空的。一个实例加载一次，
 *  正是 Worker 的真实语义。 */
let knowledgePromise = null;

function knowledge() {
  if (!knowledgePromise) knowledgePromise = loadKnowledge();
  return knowledgePromise;
}

/** 工厂形式与 server/app.mjs 的 createAppServer 同构：测试可以注入 fetch 与时钟，
 *  并拿到一份**互不干扰的**限流状态。 */
export function createWorker({ fetchImpl = globalThis.fetch, now = Date.now } = {}) {
  let limiter = null;
  let limiterKey = '';

  /* 限流器要跨请求活着，否则每个请求一条新记录，等于没有限流。
   * 配额变了（改环境变量重新部署）就换一份。 */
  function limiterFor(config) {
    const key = [config.minuteLimit, config.dailyLimit, config.concurrency].join('|');
    if (!limiter || limiterKey !== key) {
      limiter = new Limiter({ ...config, now });
      limiterKey = key;
    }
    return limiter;
  }

  async function fetch(request, env) {
    const environment = env || {};
    const config = readConfig(environment);
    const url = new URL(request.url);
    try {
      if (url.pathname === '/api/health') {
        if (request.method !== 'GET') throw new ApiError(405, 'METHOD', '该地址不接受此操作。');
        return json({ available: !!config.key, model: config.model, mode: 'worker', questionMax: MAX_QUESTION });
      }
      if (url.pathname !== '/api/ask') {
        if (!environment.ASSETS) return json({ error: { code: 'NO_ASSETS', message: '静态资源绑定缺失。' } }, 500);
        return await environment.ASSETS.fetch(request);
      }
      if (request.method !== 'POST') throw new ApiError(405, 'METHOD', '请通过提问按钮发送问题。');
      if (!originAllowed(request.headers.get('origin'), url.host, environment.PUBLIC_ORIGIN) ||
        request.headers.get('sec-fetch-site') === 'cross-site') {
        throw new ApiError(403, 'ORIGIN', '请在本站页面内使用问答。');
      }
      if (!config.key) throw new ApiError(503, 'NOT_CONFIGURED', '在线问答暂未开放，可以先查看下方资料卡。');
      /* Worker 上不存在「不可信代理」：这个头由 Cloudflare 自己写，
       * 所以不读 TRUST_PROXY，也不看 X-Forwarded-For。 */
      const ip = String(request.headers.get('CF-Connecting-IP') || 'unknown').slice(0, 80);
      const result = await runAsk({ knowledge: await knowledge(), config, limiter: limiterFor(config),
        fetchImpl, ip, body: await readJson(request), externalSignal: request.signal });
      return json(result);
    } catch (error) {
      const safe = publicError(error);
      return json({ error: { code: safe.code, message: safe.message } }, safe.status, safe.retry);
    }
  }

  return { fetch };
}

/* 模块级单例：状态（知识层与限流）必须跨请求保留。
 * 每个请求新建一个就等于关掉限流 —— 见上面「边界」第 1 条。 */
const worker = createWorker();

export default { fetch: (request, env, ctx) => worker.fetch(request, env, ctx) };
