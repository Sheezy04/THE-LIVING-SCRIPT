/* 「我的造字」的状态层（引擎层，框架无关）。
 *
 * 只做一件事：把「用户看过什么、解锁了什么、造过哪些字」这套状态
 * 定义清楚，并且保证**任何来源的脏数据都弄不白站点**。
 *
 * 三条约束（跟 compose.js 一个规矩）：
 *   1. 顶层不读 window / 不读 __CHARS__，函数里才碰 —— 所以 Node 里能直跑
 *      （verify/test-mine.mjs 就是 new Function 加载它）
 *   2. 不依赖 Vue。响应式外壳在 src/ui/store.js，那一层才 import Vue
 *   3. 不依赖 Components / Compose 的具体实现，需要构件盘时**由调用方传入**
 *      （palette 传进来，不在这里 import）—— 这样纯逻辑测试不用连数据文件一起加载
 *
 * ⚠️ migrate() 是唯一的安全阀。localStorage 里的东西可能是上一个版本写的、
 * 可能被用户手改过、可能是别的站点串过来的。任何一条出问题**只丢那一条**，
 * 绝不整体失败 —— 因为整体失败的后果是白屏，现场演示不可接受。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'zq.mine.v1';
  var FORMAT = 'MINE1';          // 导出码的版本前缀，对不上直接拒收

  /* 模块 id 与单字母码的映射。导出码里一个字母顶一个模块，
   * 所以这里加模块要同步改三处（MODS / MODL / MODR），别只改一处。 */
  var MODS = ['home', 'origin', 'evo', 'lab', 'quiz', 'mine', 'graph'];
  var MODL = { home: 'h', origin: 'o', evo: 'e', lab: 'l', quiz: 'q', mine: 'm', graph: 'g' };
  var MODR = { h: 'home', o: 'origin', e: 'evo', l: 'lab', q: 'quiz', m: 'mine', g: 'graph' };

  /* 冷启动就给的六个构件。刻意的：方案文档自己举的例子是「构形：日 + 心」，
   * 所以 日 和 心 必须一进去就能拼出来 —— 否则评委第一次点进 05 看到
   * 一片灰格子（全锁着），演示当场死掉。
   * 这六个都在 Compose.SOLO 里，migrate() 求交时不会被误杀。 */
  var INITIAL_UNLOCKED = ['日', '月', '木', '人', '心', '口'];

  /* 进度口径：「这个字在 ≥2 个不同模块里被看过」。
   * 不选「访问过 01」是因为把选字面板点满一遍就 100%，没含金量；
   * 不选「在 01 里写完字」是因为写字是挂载即自动播放（AUTOPLAY_DELAY），
   * 约等于「在这里待够 260ms」，换了层皮的恒真判定。 */
  var EXPLORED_MIN_MODS = 2;

  var LIMITS = { meaning: 40, name: 12, note: 80, library: 60, undo: 30 };
  var SCALE_MIN = 0.15, SCALE_MAX = 2.2;

  /* 坐标量级上限。画布单位里 1e5 已经是荒谬值，但它有个具体作用：
   * 保证 String(x) 不出现指数写法（|x| < 1e21 才用定点）。
   * 指数写法（'1e+21'）在导出码里会因为没有逗号而被整条丢 —— 那是静默丢数据，
   * 不如在入口就拦掉，让「要么是正常数字、要么这条不算」成为硬规则。 */
  var COORD_MAX = 1e5;
  function coordOk(x) { return typeof x === 'number' && isFinite(x) && Math.abs(x) <= COORD_MAX; }

  var _seq = 0;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function isFiniteNum(x) { return typeof x === 'number' && isFinite(x); }

  /** localStorage 存的是 JSON，但导入码里手填的数字是字符串 —— 两种都收 */
  function num(x) {
    if (isFiniteNum(x)) return x;
    if (typeof x === 'string' && x.trim() !== '') {
      var n = Number(x);
      if (isFinite(n)) return n;
    }
    return NaN;
  }

  /** 单行文本：掐掉换行/制表，避免一处输入把海报排版搞烂 */
  function oneLine(s) {
    return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim();
  }

  /** 边界截断。一张写着 5000 字的海报是坏掉的海报 —— 所以在**入口**截，
   * 不是在渲染时截（渲染时截等于每次画都白算一遍）。 */
  function clip(s, n) {
    var t = oneLine(s);
    return t.length > n ? t.slice(0, n) : t;
  }

  function clampScale(s) {
    s = num(s);
    if (!isFinite(s)) return 1;
    return s < SCALE_MIN ? SCALE_MIN : (s > SCALE_MAX ? SCALE_MAX : s);
  }
  function layoutItem(dx, dy, s, angle) {
    var item = { dx: dx, dy: dy, s: clampScale(s) };
    var a = num(angle);
    if (isFinite(a) && a !== 0) item.a = Math.max(-180, Math.min(180, a));
    return item;
  }

  /** 构件盘里的一项可能是 {glyph:'日',...} 也可能是裸字符串 '日' */
  function glyphOf(item) {
    if (typeof item === 'string') return item;
    return item && typeof item.glyph === 'string' ? item.glyph : '';
  }

  /* ── 状态 ─────────────────────────────────────────────── */

  function defaults() {
    return {
      v: 1,
      seen: {},                          // 字 → 在哪些模块里看过（去重）
      unlocked: INITIAL_UNLOCKED.slice(),
      library: []
    };
  }

  /**
   * 记一笔「这个字在这个模块里被看过」。就地改 seen（Vue.reactive 要就地改），
   * 返回那个字的模块数组。同一模块记两次长度不变。
   */
  function touch(seen, ch, mod) {
    if (!seen || typeof seen !== 'object') return null;
    if (!ch || typeof ch !== 'string' || ch.length !== 1) return null;
    if (MODS.indexOf(mod) < 0) return null;
    var list = has(seen, ch) && Array.isArray(seen[ch]) ? seen[ch] : (seen[ch] = []);
    if (list.indexOf(mod) < 0) list.push(mod);
    return list;
  }

  function isExplored(seen, ch, min) {
    min = min || EXPLORED_MIN_MODS;
    var list = seen && has(seen, ch) ? seen[ch] : null;
    return !!(list && list.length >= min);
  }

  function exploredCount(seen, min) {
    if (!seen || typeof seen !== 'object') return 0;
    var n = 0;
    for (var k in seen) if (has(seen, k) && isExplored(seen, k, min)) n++;
    return n;
  }

  /** 所有「看过」的字（含只看了 1 个模块的），用来给卡片打「看过」标 */
  function seenCount(seen) {
    if (!seen || typeof seen !== 'object') return 0;
    var n = 0;
    for (var k in seen) if (has(seen, k)) n++;
    return n;
  }

  /**
   * 解锁构件。all = 当前已解锁（返回的**不含**它），glyphs = 想解锁的，
   * palette = 构件盘（不在盘里的解锁了也没用，直接滤掉）。
   *
   * ⚠️ 返回值**只含新增**。返回全部的话，UI 每次答对题都会提示「解锁 24 个」，
   * test-mine.mjs 有专门一条钉死这件事。
   */
  function unlock(all, glyphs, palette) {
    var have = {}, ok = {}, added = [], i, g;
    for (i = 0; i < (all || []).length; i++) {
      g = glyphOf(all[i]);
      if (g) have[g] = true;
    }
    var pal = palette || [];
    var usePal = pal.length > 0;
    for (i = 0; i < pal.length; i++) {
      g = glyphOf(pal[i]);
      if (g) ok[g] = true;
    }
    for (i = 0; i < (glyphs || []).length; i++) {
      g = glyphOf(glyphs[i]);
      if (!g || have[g]) continue;
      if (usePal && !ok[g]) continue;     // 不在构件盘里 → 解锁了也摆不出来
      have[g] = true;
      added.push(g);
    }
    return added;
  }

  /* ── 字库条目 ─────────────────────────────────────────── */

  /**
   * 从画布上的 items 造一条字库条目。items 就是 Compose 那一套
   * （{id, glyph, dx, dy, s, moved}），这里只挑存得下的字段。
   * 取不到字形的、坐标不是有限数的 —— 丢，不抛。
   */
  function entryFrom(items, meta) {
    meta = meta || {};
    var glyphs = [], layout = [], i, it;
    for (i = 0; i < (items || []).length; i++) {
      it = items[i];
      if (!it) continue;
      var g = glyphOf(it);
      if (!g) continue;
      var dx = num(it.dx), dy = num(it.dy), s = num(it.s);
      if (!coordOk(dx) || !coordOk(dy) || !isFinite(s)) continue;
      glyphs.push(g);
      layout.push(layoutItem(dx, dy, s, it.a));
    }
    if (!glyphs.length) return null;
    return {
      id: oneLine(meta.id) || ('m' + Date.now().toString(36) + (_seq++).toString(36)),
      glyphs: glyphs,
      layout: layout,
      structure: oneLine(meta.structure),
      matched: oneLine(meta.matched),      // 匹配到的真字，没有就是 ''
      meaning: clip(meta.meaning, LIMITS.meaning),
      name: clip(meta.name, LIMITS.name),
      note: clip(meta.note, LIMITS.note),
      ts: isFiniteNum(meta.ts) ? meta.ts : Date.now()
    };
  }

  /* ── 导出码 ───────────────────────────────────────────── */

  /* 不叫「JSON + base64」是刻意的：那个在演示现场既念不出来也肉眼验不了。
   * 这里是纯文本、可 diff、可以直接贴进记事本。
   * 三个分隔符都要转义（'~' 分段、'-' 分项、',' 分数字）——
   * 先转义再 split 才对，反过来会切坏。 */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\').replace(/~/g, '\\~').replace(/\n/g, '\\n');
  }
  function unesc(s) {
    var out = '', i = 0;
    s = String(s == null ? '' : s);
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\' && i + 1 < s.length) {
        var d = s.charAt(i + 1);
        out += d === 'n' ? '\n' : d;
        i += 2;
      } else { out += c; i++; }
    }
    return out;
  }

  /* 数字压到 3 位小数 —— 肉眼无差，体积省三成。
   * 代价：导出→导入会把坐标精度收到 3 位（只在降级路径上，localStorage 那条不经过这里）。 */
  function n3(x) { return '' + Math.round(x * 1000) / 1000; }

  function encode(state) {
    if (!state || typeof state !== 'object') return '';
    var lines = [FORMAT];

    lines.push('U' + (state.unlocked || []).map(glyphOf).filter(Boolean).join(''));

    var seen = state.seen || {};
    var keys = Object.keys(seen).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var ch = keys[i];
      var mods = seen[ch] || [], letters = '';
      for (var j = 0; j < mods.length; j++) {
        var L = MODL[mods[j]];
        if (L && letters.indexOf(L) < 0) letters += L;
      }
      if (letters) parts.push(ch + ':' + letters);
    }
    lines.push('S' + parts.join(','));

    var lib = state.library || [];
    for (i = 0; i < lib.length; i++) {
      var e = lib[i];
      if (!e || !e.glyphs || !e.glyphs.length) continue;
      var lay = [];
      for (j = 0; j < e.layout.length; j++) {
        var l = e.layout[j];
        lay.push(n3(l.dx) + ',' + n3(l.dy) + ',' + n3(l.s) + (l.a ? ',' + n3(l.a) : ''));
      }
      /* ⚠️ 项之间用 ';' 不能用 '-' —— dy 通常是负数（坐标以中心为原点），
       * 用 '-' 分项的话 '-3.25' 会被切碎。数字里只可能出现 [0-9.e+-]，
       * 所以分隔符要选 ',' ';' 这类数字里绝不会有的。 */
      /* 自由文本放最后三个字段：万一有没转义干净的 '~'，
       * 也是被 note 吸掉（decode 时 p.slice 兜底），不会串到数字上去 */
      lines.push('L' + [
        e.glyphs.join(''), lay.join(';'), esc(e.id), esc(e.structure),
        esc(e.matched), String(num(e.ts) || 0),
        esc(e.meaning), esc(e.name), esc(e.note)
      ].join('~'));
    }
    return lines.join('\n');
  }

  /**
   * 解析导出码。**绝不抛**，也绝不返回半截状态：
   * 失败时 state 仍是一个结构完整的默认状态，可以直接喂给 UI。
   * 行级错误只丢那一行（dropped 计数）。
   */
  function decode(code) {
    var out = { ok: false, dropped: 0, state: defaults() };
    if (typeof code !== 'string') return out;
    var text = code.replace(/\r\n?/g, '\n').replace(/^\s+/, '');
    if (!text) return out;
    var lines = text.split('\n');
    if (lines[0].trim() !== FORMAT) return out;   // 版本前缀不符 —— 拒收

    out.ok = true;
    var st = defaults();
    st.unlocked = [];
    st.seen = {};

    for (var i = 1; i < lines.length; i++) {
      var ln = lines[i];
      if (!ln || !ln.trim()) continue;
      var tag = ln.charAt(0), body = ln.slice(1);

      if (tag === 'U') {
        for (var k = 0; k < body.length; k++) {
          var g = body.charAt(k);
          if (g.trim() && st.unlocked.indexOf(g) < 0) st.unlocked.push(g);
        }
      } else if (tag === 'S') {
        var ents = body ? body.split(',') : [];
        for (var m = 0; m < ents.length; m++) {
          var kv = ents[m].split(':');
          if (kv.length !== 2 || !kv[0]) { out.dropped++; continue; }
          var mods = [];
          for (var n = 0; n < kv[1].length; n++) {
            var full = MODR[kv[1].charAt(n)];
            if (full && mods.indexOf(full) < 0) mods.push(full);
          }
          if (!mods.length) { out.dropped++; continue; }
          if (!has(st.seen, kv[0])) st.seen[kv[0]] = mods;
        }
      } else if (tag === 'L') {
        var p = splitEsc(body, '~');
        var entry = readEntry(p, i);
        if (entry) st.library.push(entry); else out.dropped++;
      } else {
        out.dropped++;
      }
    }
    if (st.library.length > LIMITS.library) {
      st.library = st.library.slice(0, LIMITS.library);
    }
    out.state = st;
    return out;
  }

  /**
   * 按 sep 分段，但**认得反斜杠转义**。
   * 直接 body.split('~') 是错的：转义后的 '~' 写成 '\~'，里面仍然有一个真的 '~'，
   * 照样会被切碎（这个 bug 真出现过，靠「带 ~ 的含义文案」那条断言抓到的）。
   * 这里把转义序列原样保留在片段里，交给 unesc 收尾。
   */
  function splitEsc(s, sep) {
    var out = [], cur = '', esc = false;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (esc) { cur += '\\' + c; esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === sep) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (esc) cur += '\\';           // 尾随的孤立反斜杠
    out.push(cur);
    return out;
  }

  /** L 行 → 条目。任何一个字段不对就整条丢，返回 null */
  function readEntry(p, rowIdx) {
    if (!p || p.length < 6) return null;
    var glyphs = p[0] ? p[0].split('') : [];
    if (!glyphs.length) return null;

    var triples = p[1] ? p[1].split(';') : [];   // 数字里不会有 ';'，这条不用转义
    if (triples.length !== glyphs.length) return null;
    var layout = [];
    for (var i = 0; i < triples.length; i++) {
      var t = triples[i].split(',');
      if (t.length !== 3 && t.length !== 4) return null;
      var dx = num(t[0]), dy = num(t[1]), s = num(t[2]);
      if (!coordOk(dx) || !coordOk(dy) || !isFinite(s)) return null;
      layout.push(layoutItem(dx, dy, s, t[3]));
    }
    /* 自由文本是最后三个字段 —— 多出来的 '~' 全归 note（转义漏了也不至于串位） */
    var tail = p.length > 9 ? p.slice(8).join('~') : (p[8] || '');
    return {
      id: clip(unesc(p[2]), 24) || ('r' + rowIdx),
      glyphs: glyphs,
      layout: layout,
      structure: clip(unesc(p[3]), 24),
      matched: clip(unesc(p[4]), 24),
      ts: num(p[5]) || 0,
      meaning: clip(unesc(p[6]), LIMITS.meaning),
      name: clip(unesc(p[7]), LIMITS.name),
      note: clip(unesc(tail), LIMITS.note)
    };
  }

  /* ── 迁移 ─────────────────────────────────────────────── */

  /**
   * 把任何东西变成「结构完整、能直接进 UI」的状态。
   * 传 null / 'abc' / 42 / 数组 / 上一个版本的对象，都走这里。
   *
   * palette 可选：传了就顺手滤掉盘里没有的幽灵构件（数据改过之后
   * localStorage 里会留着已经不存在的构件），不传就不滤（Node 测试不加载数据文件）。
   */
  function migrate(raw, palette) {
    var out = defaults();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    if (raw.v !== 1) return out;                 // 版本不认识 → 默认，别猜

    var pal = palette || [];
    var usePal = pal.length > 0;
    var ok = {}, i, g;
    for (i = 0; i < pal.length; i++) {
      g = glyphOf(pal[i]);
      if (g) ok[g] = true;
    }

    /* seen：只留「单字 + 已知模块名」，其余丢 */
    var seen = {};
    if (raw.seen && typeof raw.seen === 'object' && !Array.isArray(raw.seen)) {
      for (var ch in raw.seen) {
        if (!has(raw.seen, ch) || ch.length !== 1) continue;
        var list = raw.seen[ch];
        if (!Array.isArray(list)) continue;
        var mods = [];
        for (i = 0; i < list.length; i++) {
          var mm = list[i];
          if (MODS.indexOf(mm) >= 0 && mods.indexOf(mm) < 0) mods.push(mm);
        }
        if (mods.length) seen[ch] = mods;
      }
    }
    out.seen = seen;

    /* unlocked：与构件盘求交。没给盘就不求交（无处可交）。 */
    var unl = [];
    if (Array.isArray(raw.unlocked)) {
      for (i = 0; i < raw.unlocked.length; i++) {
        g = glyphOf(raw.unlocked[i]);
        if (!g || unl.indexOf(g) >= 0) continue;
        if (usePal && !ok[g]) continue;
        unl.push(g);
      }
    }
    /* 初始六个兜底：手改数据 / 版本错乱把冷启动锁死的话，
     * 05 一进去全是灰格子 —— 比「多解锁两个构件」严重得多 */
    for (i = 0; i < INITIAL_UNLOCKED.length; i++) {
      g = INITIAL_UNLOCKED[i];
      if (unl.indexOf(g) >= 0) continue;
      if (usePal && !ok[g]) continue;
      unl.push(g);
    }
    out.unlocked = unl;

    /* library：逐条过，坏哪条丢哪条 */
    var lib = [];
    if (Array.isArray(raw.library)) {
      for (i = 0; i < raw.library.length && lib.length < LIMITS.library; i++) {
        var e = raw.library[i];
        if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
        if (!Array.isArray(e.glyphs) || !e.glyphs.length) continue;
        if (!Array.isArray(e.layout) || e.layout.length !== e.glyphs.length) continue;

        var glyphs = [], layout = [], bad = false;
        for (var j = 0; j < e.glyphs.length; j++) {
          g = glyphOf(e.glyphs[j]);
          if (!g) { bad = true; break; }
          glyphs.push(g);
        }
        if (bad) continue;
        for (j = 0; j < e.layout.length; j++) {
          var l = e.layout[j];
          if (!l || typeof l !== 'object') { bad = true; break; }
          var dx = num(l.dx), dy = num(l.dy), s = num(l.s);
          if (!coordOk(dx) || !coordOk(dy) || !isFinite(s)) { bad = true; break; }
          layout.push(layoutItem(dx, dy, s, l.a));
        }
        if (bad) continue;

        /* id 撞车要不就换一个。**必须由输入决定**，不能用模块级计数器 ——
         * 用计数器的话，同一份脏数据在不同时刻迁出来的 id 不同，
         * 迁移就不再幂等（而每开一次页面都要迁一次）。
         * 字库列表拿 id 当 :key，它只要「唯一 + 迁完就稳定」就够。 */
        var id = oneLine(e.id);
        if (!id) id = 'm' + i.toString(36);
        if (lib.some(function (x) { return x.id === id; })) {
          var base = id, n = 1;
          while (lib.some(function (x) { return x.id === id; })) id = base + '_' + (n++);
        }
        lib.push({
          id: id, glyphs: glyphs, layout: layout,
          structure: clip(e.structure, 24),
          matched: clip(e.matched, 24),
          meaning: clip(e.meaning, LIMITS.meaning),
          name: clip(e.name, LIMITS.name),
          note: clip(e.note, LIMITS.note),
          ts: isFiniteNum(num(e.ts)) ? num(e.ts) : 0
        });
      }
    }
    out.library = lib;

    /* seen 里出现过的字必须在构件盘里？不必 —— 整字本来就不一定是构件。
     * 但保险起见把「一个模块都没记上的」清掉，省得 UI 拿到空数组。 */
    for (var k in out.seen) {
      if (has(out.seen, k) && !out.seen[k].length) delete out.seen[k];
    }
    return out;
  }

  global.Mine = {
    STORAGE_KEY: STORAGE_KEY,
    FORMAT: FORMAT,
    MODS: MODS,
    LIMITS: LIMITS,
    SCALE_MIN: SCALE_MIN,
    SCALE_MAX: SCALE_MAX,
    INITIAL_UNLOCKED: INITIAL_UNLOCKED,
    EXPLORED_MIN_MODS: EXPLORED_MIN_MODS,

    defaults: defaults,
    touch: touch,
    isExplored: isExplored,
    exploredCount: exploredCount,
    seenCount: seenCount,
    unlock: unlock,
    entryFrom: entryFrom,
    clampScale: clampScale,
    clip: clip,
    encode: encode,
    decode: decode,
    migrate: migrate
  };
})(typeof window !== 'undefined' ? window : this);
