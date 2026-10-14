/* 「可选在线问答」的**平台无关层**：Node 服务（server/app.mjs）与
 * Cloudflare Worker（worker/index.mjs）共用这一份。
 *
 * ── 为什么要有这一层 ─────────────────────────────────────────
 * 两个运行时的差别只有三处：怎么收请求（node:http ↔ fetch）、怎么发响应、
 * 怎么从地址里拿到访客 IP。除此之外的**判定逻辑必须只有一份** ——
 * 输入白名单、限流、日配额、上游状态码映射、错误码与文案，
 * 两处各写一遍就迟早会出现「本机能拦、线上拦不住」。
 *
 * ── 这一层不碰什么 ───────────────────────────────────────────
 *   1. **不 import 任何 `node:` 模块** —— 碰了 Worker 侧就要挂
 *      `nodejs_compat`（构建更大、冷启动更慢），而这里一行都用不上。
 *   2. **不加载知识层**：Node 侧用 node:vm、Worker 侧用 ESM import，
 *      两边各自加载（KNOWLEDGE_FILES 保证**清单同一份**，顺序也一样）。
 *   3. **不碰 res / Response**：只返回结果对象或抛 ApiError，
 *      由各自的适配层决定怎么发出去。
 */

/** 知识层文件清单 —— 两个运行时共用，顺序必须一致。
 *  与 index.html 的 script 顺序**不同**：那是浏览器的加载顺序（src/*.js 在 data/*.js 之前），
 *  这里是服务端的加载顺序（data/*.js 在后）。两种顺序都成立，因为顶层都不读数据，
 *  函数里才碰 —— 见 src/ask.js 文件头的第 1 条约束。 */
export const KNOWLEDGE_FILES = [
  'src/components.js', 'src/graph.js', 'src/stats.js', 'src/ask.js',
  'data/chars.js', 'data/catalog.js', 'data/ancient.js', 'data/evidence.js', 'data/gap-notes.js'
];

export const MAX_BODY = 24000;          // 请求体上限（字节）
export const MAX_QUESTION = 300;        // 问题字数上限，与界面提示同一口径
export const MAX_HISTORY = 6;           // 最近三轮（user/assistant 成对）
export const UPSTREAM_MAX = 64000;      // 上游响应上限（字节）
export const UPSTREAM_URL = 'https://api.deepseek.com/chat/completions';
export const DEFAULT_MODEL = 'deepseek-flash';

export class ApiError extends Error {
  constructor(status, code, message, retry = 0) {
    super(message); this.status = status; this.code = code; this.retry = retry;
  }
}

export function integer(value, fallback, min = 1, max = 1000000) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

/** 从环境变量读服务端配置。两个运行时传进来的都是「名字 → 值」的普通对象
 *  （Node 的 process.env、Worker 的 env 与 vars/secret 合并结果）。 */
export function readConfig(env) {
  const source = env || {};
  return {
    key: String(source.DEEPSEEK_API_KEY || '').trim(),
    model: /^[\w.:-]{1,80}$/.test(source.DEEPSEEK_MODEL || '') ? source.DEEPSEEK_MODEL : DEFAULT_MODEL,
    minuteLimit: integer(source.ASK_RATE_LIMIT, 8),
    dailyLimit: integer(source.ASK_DAILY_LIMIT, 200),
    concurrency: integer(source.ASK_CONCURRENCY, 4, 1, 32),
    timeout: integer(source.ASK_TIMEOUT_MS, 40000, 10, 120000)
  };
}

/** 限流与日配额。**单进程内存计数** —— Node 上是单进程，Worker 上是单实例
 *  （同一实例以外的请求各记各的，见 docs/公网部署与AI问答.md 里写明的边界）。 */
export class Limiter {
  constructor({ minuteLimit, dailyLimit, concurrency, now = Date.now }) {
    this.minuteLimit = minuteLimit;
    this.dailyLimit = dailyLimit;
    this.concurrency = concurrency;
    this.now = now;
    this.buckets = new Map();
    this.inFlight = new Set();
    this.active = 0;
    this.day = -1;
    this.daily = 0;
  }

  reserve(ip) {
    const time = this.now();
    const currentDay = Math.floor(time / 86400000);
    if (this.day !== currentDay) { this.day = currentDay; this.daily = 0; }
    for (const [address, bucket] of this.buckets) if (bucket.until <= time) this.buckets.delete(address);
    if (this.active >= this.concurrency || this.inFlight.has(ip)) {
      throw new ApiError(429, 'BUSY', '问答正在处理中，请稍后再试。', 5);
    }
    if (this.daily >= this.dailyLimit) {
      throw new ApiError(429, 'DAILY_LIMIT', '今日问答次数已用完，学习与资料查看仍可使用。',
        Math.ceil(((currentDay + 1) * 86400000 - time) / 1000));
    }
    const bucket = this.buckets.get(ip) || { count: 0, until: time + 60000 };
    if (bucket.count >= this.minuteLimit || (!this.buckets.has(ip) && this.buckets.size >= 5000)) {
      throw new ApiError(429, 'RATE_LIMIT', '提问太频繁，请稍后再试。',
        Math.max(1, Math.ceil((bucket.until - time) / 1000)));
    }
    bucket.count++; this.buckets.set(ip, bucket); this.daily++; this.active++; this.inFlight.add(ip);
  }

  release(ip) {
    this.inFlight.delete(ip);
    this.active--;
  }
}

/** 同源判据。两侧各用自己那份 host（Node 取 Host 头，Worker 取 URL），
 *  但**判断本身**只写一遍。 */
export function originAllowed(origin, host, publicOrigin) {
  if (!origin) return true;
  try {
    return publicOrigin ? origin === new URL(publicOrigin).origin : new URL(origin).host === host;
  } catch { return false; }
}

/* 只接受当前汉字、问题、对话记录。多一个键都拒绝 ——
 * 免得有人塞 messages / model / apiKey / system 进来改服务端的规矩。 */
export function validateInput(input, catalog) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(key => !['char', 'question', 'history'].includes(key))) {
    throw new ApiError(400, 'INPUT', '只接受当前汉字、问题和对话记录。');
  }
  if (typeof input.char !== 'string' || !catalog || !Object.hasOwn(catalog, input.char)) {
    throw new ApiError(400, 'CHARACTER', '请先选择资料库中的汉字。');
  }
  if (typeof input.question !== 'string' || !input.question.trim() || input.question.length > MAX_QUESTION) {
    throw new ApiError(400, 'QUESTION', '问题需为 1 至 300 字。');
  }
  const history = input.history === undefined ? [] : input.history;
  if (!Array.isArray(history) || history.length > MAX_HISTORY || history.length % 2 ||
    history.some((message, i) => !message || message.role !== (i % 2 ? 'assistant' : 'user') ||
      typeof message.content !== 'string' || !message.content.trim() ||
      message.content.length > (i % 2 ? 4000 : MAX_QUESTION))) {
    throw new ApiError(400, 'HISTORY', '对话记录有误，请开始新对话后重试。');
  }
  return { char: input.char, question: input.question.trim(), history };
}

/** 读上游响应体。用 Web Stream 的 getReader，Node 22 与 Workers 都有；
 *  不用 node:stream 的 async 迭代，也不碰 Buffer。 */
async function readBodyText(response, limit) {
  if (!response.body) throw new ApiError(502, 'EMPTY', '模型没有返回内容，请重试。');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      throw new ApiError(502, 'RESPONSE_SIZE', '模型返回内容过长，请缩短问题后重试。');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(all);
}

export async function readUpstream(response) {
  const text = await readBodyText(response, UPSTREAM_MAX);
  try { return JSON.parse(text); }
  catch { throw new ApiError(502, 'RESPONSE_FORMAT', '模型返回格式异常，请重试。'); }
}

/** 走完一次问答：校验 → 限流占位 → 调模型 → 抽取 → 抹掉可能出现的密钥。
 *  AbortSignal 由适配层传进来（Node 挂在 req/res 的断开上，Worker 挂在 request.signal 上）。
 *  超时与外部取消**共用**同一个 controller，所以取消一定会释放并发占位。 */
export async function runAsk({ knowledge, config, limiter, fetchImpl, ip, body, externalSignal }) {
  const input = validateInput(body, knowledge.CharCatalog);
  limiter.reserve(ip);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeout);
  const onAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', onAbort);
  }
  try {
    const prepared = knowledge.ZQ.Ask.prepare(input.char, input.question, input.history);
    const upstream = await fetchImpl(UPSTREAM_URL, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.key },
      body: JSON.stringify({ model: config.model, messages: prepared.messages, stream: false,
        temperature: 0, thinking: { type: 'disabled' }, max_tokens: 1024 })
    });
    if (!upstream.ok) {
      if (upstream.body) await upstream.body.cancel().catch(() => {});
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
    return {
      answer: knowledge.ZQ.Ask.redact(content.trim().slice(0, 8000), config.key),
      sources: prepared.sources, model: config.model, truncated: choice.finish_reason === 'length'
    };
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof ApiError)) {
      throw new ApiError(504, 'TIMEOUT', '等待回答超时，请稍后重试。');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) externalSignal.removeEventListener('abort', onAbort);
    limiter.release(ip);
  }
}

/** 错误一律走这张表出去：上游正文、凭据、异常细节、访客对话都不外泄。 */
export function publicError(error) {
  return error instanceof ApiError ? error
    : new ApiError(502, 'UNAVAILABLE', '问答连接暂时不可用，请稍后重试。');
}

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
