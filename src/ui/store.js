/* 字启千年 — 全局状态（05 我的造字 + 进度）
 *
 * 放进 src/ui/ 而不是 app-shell.js 里的理由：app-shell.js 自己的头注释写着
 * 「这一层只做两件事」，而现在有 **六个**消费者 —— 01/02/03 记「这个字看过」、
 * 04 解锁构件、05 读写字库、外壳显示进度。再往 app-shell 里塞就不是它了。
 * （共享件放 src/ui/ 的先例是 keys.js。）
 *
 * ══ 持久化：内存是真相，localStorage 只是写穿缓存 ══
 *
 * 三条现场风险一条都不在我们控制之内：
 *   · 赛场可能不是 Chrome（360 / QQ 浏览器都是 Chromium 壳）
 *   · 有人开过「关闭窗口清除站点数据」
 *   · 企业策略可能整个禁用 file:// 存储
 * 所以**降级路径是必需功能，不是保险**。任何一步失败，整场走内存，
 * UI 一个字都不提（现场报「存储不可用」只会吓到评委），
 * 但「导出 / 导入我的字库」那段始终在 —— 那是用户把作品带走的唯一办法。
 *
 * ⚠️ 探针**必须真写一次**。`typeof localStorage !== 'undefined'` 不够：
 * 在「访问才抛」的配置下它照样是 true（有些浏览器就是读取属性时抛 SecurityError），
 * 而且 setItem 静默失败（配额 0 / 早期 Safari 无痕）也测不出来 —— 只有
 * 「写进去、读出来、擦掉」这一套能测出来。
 *
 * ⚠️ 导出码**不写进 location.hash**：`#q=` 已经是 04 的地盘（mode-quiz.js），
 * 两个写同一个 hash 会互相覆盖。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var Vue = global.Vue;
  var Mine = global.Mine;

  var PROBE_KEY = '__zq_probe__';

  /* ── 探针 ─────────────────────────────────────────────── */

  function probe() {
    try {
      var ls = global.localStorage;
      if (!ls) return { available: false, why: '没有 localStorage' };
      ls.setItem(PROBE_KEY, '1');
      var back = ls.getItem(PROBE_KEY);
      ls.removeItem(PROBE_KEY);
      if (back !== '1') return { available: false, why: '写进去读出来不是原值（静默失败）' };
      return { available: true, why: '' };
    } catch (e) {
      /* 读取 localStorage 属性本身就可能抛 SecurityError */
      return { available: false, why: (e && (e.name || e.message)) || '抛了' };
    }
  }

  /* ⚠️ 探针要在**读数据之前**跑。反过来的话，第一次访问 localStorage 就是
   * 去取用户数据 —— 在「访问才抛」的配置下，那一下抛在 try 里被吃掉了，
   * 结果看起来「什么都没坏」，但也就永远不知道存储是不可用的，
   * 「导出 / 导入」那段降级入口不会被摆出来，用户的作品当场就带不走了。 */
  var p = probe();
  var status = Vue && Vue.reactive
    ? Vue.reactive({ available: p.available, why: p.why })
    : { available: p.available, why: p.why };

  /* ── 读回来 ───────────────────────────────────────────── */

  /* 惰性取 + 记忆：palette() 要走 tile()，而 tile 读 __CHARS__。
   * 记一下省得每次 migrate 都重算 24 个构件。
   * ⚠️ _pal 的声明必须在 palette() 之前 —— 写后面的话 `var` 提升成 undefined，
   * 而哨兵判断写的是 `=== null`，第一次调用就会返回 undefined。 */
  var _pal = null;
  function palette() {
    if (_pal === null) {
      try {
        _pal = (global.Compose && global.Compose.palette) ? global.Compose.palette() : [];
      } catch (e) { _pal = []; }
    }
    return _pal;
  }

  function readRaw() {
    if (!status.available) return null;      // 探针说不行就别去碰它
    try {
      var txt = global.localStorage.getItem(Mine.STORAGE_KEY);
      return txt ? JSON.parse(txt) : null;
    } catch (e) {
      return null;      // JSON 坏了 / 读不动 —— 都当没有，Mine.migrate 会兜
    }
  }

  var _state = Mine.migrate(readRaw(), palette());
  var state = Vue && Vue.reactive ? Vue.reactive(_state) : _state;

  /* ── 写回去 ───────────────────────────────────────────── */

  /**
   * 把 state 写进 localStorage。**任何失败都不抛** —— 失败了就把
   * available 翻成 false（UI 于是把「导出 / 导入」摆到明处），然后继续。
   * 内存里的 state 不受影响：它才是真相。
   */
  function save() {
    if (!status.available) return false;
    try {
      global.localStorage.setItem(Mine.STORAGE_KEY, JSON.stringify({
        v: state.v, seen: state.seen, unlocked: state.unlocked, library: state.library
      }));
      return true;
    } catch (e) {
      status.available = false;
      status.why = '写入失败：' + ((e && (e.name || e.message)) || '');
      if (global.console && console.warn) console.warn('[字启千年] 存储写入失败，改用内存：', e);
      return false;
    }
  }

  /* ── 进度 ─────────────────────────────────────────────── */

  /** 分母。**不写死 30** —— 数据改了、加了形声字，这里跟着变 */
  function total() {
    var C = global.__CHARS__;
    return C ? Object.keys(C).length : 0;
  }

  function explored() {
    return Mine.exploredCount(state.seen);
  }

  function isExplored(ch) {
    return Mine.isExplored(state.seen, ch);
  }

  /**
   * 记一笔「这个字在这个模块里被看过」。
   * 没变就不写盘 —— 外壳的 watcher 每次切模块都会调它，
   * 每次都写一遍 localStorage 是白费（虽然不致命）。
   */
  function touch(ch, mod) {
    var before = state.seen[ch] ? state.seen[ch].length : -1;
    Mine.touch(state.seen, ch, mod);
    var after = state.seen[ch] ? state.seen[ch].length : 0;
    if (after !== before && after > before) save();
    return after;
  }

  /* ── 构件解锁 ─────────────────────────────────────────── */

  /** 返回**新增**的构件（空数组 = 没新东西，UI 不要弹提示） */
  function unlock(glyphs) {
    var added = Mine.unlock(state.unlocked, glyphs, palette());
    if (added.length) {
      for (var i = 0; i < added.length; i++) state.unlocked.push(added[i]);
      save();
    }
    return added;
  }

  function isUnlocked(g) {
    return state.unlocked.indexOf(g) >= 0;
  }

  /* ── 字库 ─────────────────────────────────────────────── */

  /** 存一条。加在最前面（字库列表是「最近造的在前」） */
  function saveLibrary(entry) {
    if (!entry || !entry.id) return null;
    var i = state.library.findIndex(function (e) { return e.id === entry.id; });
    if (i >= 0) state.library.splice(i, 1, entry);
    else state.library.unshift(entry);
    if (state.library.length > Mine.LIMITS.library) {
      state.library.splice(Mine.LIMITS.library);      // 超了丢最旧的
    }
    save();
    return entry;
  }

  function removeLibrary(id) {
    var i = state.library.findIndex(function (e) { return e.id === id; });
    if (i < 0) return false;
    state.library.splice(i, 1);
    save();
    return true;
  }

  function getLibrary(id) {
    return state.library.filter(function (e) { return e.id === id; })[0] || null;
  }

  function clearLibrary() {
    state.library.splice(0);
    save();
  }

  /* ── 导出 / 导入（降级路径，也是「把作品带走」的正路） ── */

  function exportCode() {
    return Mine.encode(state);
  }

  /**
   * 导入。**合并，不替换** —— 替换会把用户当前的作品清掉，
   * 而用户点「导入」时想的是「把另一个码里的东西也拿过来」。
   * 返回收成，交给 UI 报数。
   */
  function importCode(code) {
    if (typeof code !== 'string' || code.length > 1_000_000) return { ok:false, why:'备份码为空、类型不正确或过长', added:{unlocked:0,seen:0,library:0}, dropped:0 };
    var r;
    try { r = Mine.decode(code); }
    catch (e) { return { ok:false, why:'备份码无法解析', added:{unlocked:0,seen:0,library:0}, dropped:0 }; }
    if (!r.ok) return { ok: false, why: '码的版本前缀不对', added: { unlocked: 0, seen: 0, library: 0 }, dropped: 0 };
    // 先清洗导入数据，再合并；constructor 等继承属性不能进入现有 seen。
    var s = Mine.migrate(r.state,palette()), added = { unlocked: 0, seen: 0, library: 0 }, i, j, ch, mods;

    for (i = 0; i < s.unlocked.length; i++) {
      if (state.unlocked.indexOf(s.unlocked[i]) < 0) { state.unlocked.push(s.unlocked[i]); added.unlocked++; }
    }
    for (ch in s.seen) {
      if (!Object.prototype.hasOwnProperty.call(s.seen, ch)) continue;
      mods = s.seen[ch];
      if (!Object.prototype.hasOwnProperty.call(state.seen,ch) || !Array.isArray(state.seen[ch])) state.seen[ch] = [];
      for (j = 0; j < mods.length; j++) {
        if (state.seen[ch].indexOf(mods[j]) < 0) { state.seen[ch].push(mods[j]); added.seen++; }
      }
    }
    for (i = 0; i < s.library.length; i++) {
      var e = s.library[i];
      if (getLibrary(e.id)) continue;
      state.library.push(e);
      added.library++;
    }
    if (state.library.length > Mine.LIMITS.library) state.library.splice(Mine.LIMITS.library);

    /* 导进来的坐标可能不合法 —— 过一遍 migrate 收拾干净 */
    var clean = Mine.migrate({
      v: state.v, seen: state.seen, unlocked: state.unlocked, library: state.library
    }, palette());
    state.seen = clean.seen;
    state.unlocked = clean.unlocked;
    state.library = clean.library;

    save();
    return { ok: true, added: added, dropped: r.dropped };
  }

  /** 全部重来（留给「清空我的数据」按钮 / 排查用） */
  function reset() {
    var d = Mine.defaults();
    state.seen = d.seen;
    state.unlocked = d.unlocked;
    state.library = d.library;
    save();
  }

  /* ── 启动收尾 ─────────────────────────────────────────── */

  if (!status.available && global.console && console.info) {
    /* 只在控制台说一声，页面上一个字都不提 */
    console.info('[字启千年] 本机存储不可用（' + status.why + '），本次记录只存在内存里。'
      + '需要留存请用「导出我的字库」。');
  }

  ZQ.store = {
    state: state,
    status: status,
    /** 存储可用吗 —— 不可用时 UI 把「导出 / 导入」摆到明处 */
    get available() { return status.available; },

    save: save,
    total: total,
    explored: explored,
    isExplored: isExplored,
    touch: touch,

    unlock: unlock,
    isUnlocked: isUnlocked,
    palette: palette,

    saveLibrary: saveLibrary,
    removeLibrary: removeLibrary,
    getLibrary: getLibrary,
    clearLibrary: clearLibrary,

    exportCode: exportCode,
    importCode: importCode,
    reset: reset
  };
})(typeof window !== 'undefined' ? window : this);
