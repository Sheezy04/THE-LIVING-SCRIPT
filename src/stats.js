/* 「语料统计」的数据层（引擎层，框架无关）。
 *
 * 只做一件事：把**已经存在的运行数据**数一遍，交出一份摘要。
 * 它自己**不产生任何新事实** —— 跟 graph.js 一样，这是本模块最要紧的约束。
 *
 * ── 为什么单独一层（别把这段搬进看板组件里）──────────────────
 * 这份数字有两个消费者：
 *   · 07 数据看板（src/ui/stats-view.js）
 *   · verify/project-summary.mjs —— 生成已发布的《项目数据摘要》
 * 两个消费者必须同数。各算一遍就是两份真相，迟早有一处报错，
 * 而且是在答辩材料上被发现。所以算法只写在这里，两边都调它。
 *
 * ── 三条约束（跟 graph.js / compose.js 一个规矩）──────────────
 *   1. **顶层不读 window / 不读 __CHARS__ / 不读 CharCatalog**，函数里才碰 ——
 *      所以 Node 里能直跑（verify/test-stats.mjs 与 project-summary.mjs 都是这么加载的）。
 *      index.html 里 src/*.js 在 data/*.js **之前**加载，顶层读会读到 undefined。
 *   2. 不依赖 Vue，不碰 DOM。SVG 由 src/ui/stats-view.js 画。
 *   3. **不碰网络**。看板要在 file:// 离线跑，这一层连一个网络原语都不许有
 *      （verify/test-stats.mjs 会扫这条）。
 *   4. 不缓存。530 格的重算成本远低于一份会因为数据换了而变旧的缓存带来的麻烦。
 *
 * ── ⚠️ 数字一律从运行时对象取，**不许从注释取** ────────────────
 * 同仓多处注释是旧的、和实际不符：
 *   data/gap-notes.js:3,36   写「22 格」（实为 23）
 *   src/evolution.js:133     写「缺 31 格」（实为 23）
 *   verify/test-roster.mjs:31 写「36/64/28」（实为 36/70/28）
 *   verify/test-graph.mjs:97  写「128 字」
 * 这一层只认 __CHARS__ / CharCatalog / AncientGlyphs 里的值。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  /* 来源短码 → 界面上的名字。短码取自 data/ancient.js 的 SOURCES[x].id，
   * 不靠对 JSON 做正则匹配（那个写法在 project-summary 里有过，等价但脆）。 */
  var SOURCE_LABEL = { CDP: 'CDP 2.4', JFZSK: '敬峰中山王篆', ZDIC: '汉典' };

  function chars()  { return global.__CHARS__ || {}; }
  function catalog(){ return global.CharCatalog || {}; }
  function A()      { return global.AncientGlyphs || null; }

  /** 六书归一化。'象形字源' → '象形'，'会意（教学参考）' → '会意'
   *  ⚠️ 必须与 verify/build-roster.mjs 的 normalizeMethod **逐字一致**，
   *  否则看板的六书筛选轴会与 roster.json 分家。 */
  function normalizeMethod(m) {
    return String(m || '').replace(/字源$/, '').replace(/（.*?）$/, '');
  }

  /** 目录级元信息里那个「不是语义场」的值（'会意·形声'）。
   *  它是**构形轴**，不是题材：轴上只有一个值，筛了等于没筛。
   *  build-roster.mjs 特意把它排除在 categories 之外，这里同一个理由。 */
  function structureCategory() {
    var meta = global.CharCatalogMeta || {};
    return meta.structureCategory || '会意·形声';
  }

  /* ── 目录：层级 / 六书 / 语义场 ─────────────────────────── */

  /** 层级计数。catalog.js 每行第 [9] 位省略时算 core（见那里的 rows 定义）。 */
  function tiers() {
    var cat = catalog(), out = { core: 0, extended: 0, related: 0 };
    for (var ch in cat) {
      if (!Object.prototype.hasOwnProperty.call(cat, ch)) continue;
      var t = cat[ch].tier || 'core';
      out[t] = (out[t] || 0) + 1;
    }
    return out;
  }

  /** 六书计数。顺序按**首次出现**（= 界面上该显示的顺序），与 roster.json 同规矩。 */
  function scriptTypes() {
    var cat = catalog(), counts = {}, order = [];
    for (var ch in cat) {
      if (!Object.prototype.hasOwnProperty.call(cat, ch)) continue;
      var m = normalizeMethod(cat[ch].method);
      if (!m) continue;
      if (!(m in counts)) { counts[m] = 0; order.push(m); }
      counts[m]++;
    }
    return order.map(function (k) { return { key: k, count: counts[k] }; });
  }

  /** 语义场计数。**排除**那个构形轴的值（见 structureCategory）。 */
  function categories() {
    var cat = catalog(), skip = structureCategory(), counts = {}, order = [];
    for (var ch in cat) {
      if (!Object.prototype.hasOwnProperty.call(cat, ch)) continue;
      var c = cat[ch].category;
      if (!c || c === skip) continue;
      if (!(c in counts)) { counts[c] = 0; order.push(c); }
      counts[c]++;
    }
    return order.map(function (k) { return { key: k, count: counts[k] }; });
  }

  /* ── 古文字：格 / 覆盖率 / 来源 / 缺口 ───────────────────── */

  /** 每个 (字, 期) 格的来源短码；没有字形时返回 null。 */
  function sourceKey(ch, era) {
    var ag = A();
    if (!ag || !ag.has(ch, era)) return null;
    var s = ag.glyphSource(ch, era);
    return (s && s.id) || 'unknown';
  }

  /** 古文字部分的全量统计。
   *
   *  分母只算**有现代字形的字**（106）：28 个关联字本来就不做字形，
   *  把它们计进覆盖率分母会凭空拉低一切。 */
  function ancient() {
    var ag = A(), list = Object.keys(chars());
    if (!ag || !list.length) {
      return { slots: 0, available: 0, missing: 0, full: 0, eras: [], sources: {}, unknownSources: [], rows: [], chars: [] };
    }
    var eraDefs = ag.ERAS, total = list.length;
    var sources = {}, unknown = [];
    var rows = eraDefs.map(function (e) {
      return { era: e.key, label: e.label || e.key, period: e.period || '', note: e.note || '', available: 0, total: total, cells: [] };
    });
    var byEra = {};
    rows.forEach(function (r) { byEra[r.era] = r; });

    var available = 0, full = 0;
    var notes = (ZQ.GapNotes && ZQ.GapNotes.notes) || {};
    for (var i = 0; i < list.length; i++) {
      var ch = list[i], all = true;
      for (var j = 0; j < eraDefs.length; j++) {
        var era = eraDefs[j].key, has = ag.has(ch, era);
        if (!has) all = false;
        var sk = has ? sourceKey(ch, era) : null;
        if (sk) {
          if (SOURCE_LABEL[sk]) sources[sk] = (sources[sk] || 0) + 1;
          else unknown.push(ch + '@' + era);
          available++;
          byEra[era].available++;
        }
        byEra[era].cells.push({
          ch: ch, has: !!has,
          source: sk ? (SOURCE_LABEL[sk] || sk) : '',
          note: has ? '' : (notes[ch + '@' + era] || '')
        });
      }
      if (all) full++;
    }

    /* 来源表按固定顺序给全，值为 0 的也留着 —— 界面要显示「3 家来源」，
     * 缺一家时显示 0 比缺一行清楚。 */
    var sourcesOut = {};
    Object.keys(SOURCE_LABEL).forEach(function (k) { sourcesOut[SOURCE_LABEL[k]] = sources[k] || 0; });

    return {
      slots: total * eraDefs.length,
      available: available,
      missing: total * eraDefs.length - available,
      full: full,
      /* 楷书那层不在这份数据里（它来自 data/chars.js），所以这里是**五**期。
       * 界面要把楷书当第六段说的时候，自己说清楚它不在这 507 格里。 */
      eras: rows.map(function (r) {
        return { key: r.era, label: r.label, period: r.period, available: r.available, total: r.total };
      }),
      sources: sourcesOut,
      unknownSources: unknown,
      rows: rows,
      chars: list
    };
  }

  /** 缺口双向自查（与 verify/test-gap-notes.mjs 同一套算法）。
   *  两边的漂移都要抓：写了说明的格必须真是缺口，缺口也必须都有说明。 */
  function gapsSelfCheck(ancientData) {
    var ag = A(), notes = (ZQ.GapNotes && ZQ.GapNotes.notes) || {};
    if (!ag) return { ok: false, notedButNotGap: [], gapWithoutNote: [], noted: 0, gaps: 0 };
    var a = ancientData || ancient();
    var notedKeys = Object.keys(notes), real = {};
    a.rows.forEach(function (r) {
      /* 键序是 **字@期**，与 data/gap-notes.js 的 notes 同序（那里 of() 也是这么拼的）*/
      r.cells.forEach(function (c) { if (!c.has) real[c.ch + '@' + r.era] = c.ch; });
    });
    var realKeys = Object.keys(real);
    var notedButNotGap = notedKeys.filter(function (k) { return !(k in real); });
    var gapWithoutNote = realKeys.filter(function (k) { return !(k in notes); });
    return {
      ok: notedButNotGap.length === 0 && gapWithoutNote.length === 0,
      notedButNotGap: notedButNotGap,
      gapWithoutNote: gapWithoutNote,
      noted: notedKeys.length,
      gaps: realKeys.length
    };
  }

  /** 23 处缺口的明细（带查证说明），按「期 → 字表顺序」排。
   *  这是缺口真正有价值的地方 —— 点阵里的一格给不了「查过哪些来源」。 */
  function gapList(ancientData) {
    var a = ancientData || ancient(), out = [];
    a.rows.forEach(function (r) {
      r.cells.forEach(function (c) {
        if (!c.has) out.push({ ch: c.ch, era: r.era, eraLabel: r.label, note: c.note || '' });
      });
    });
    return out;
  }

  /* ── 字表：笔画 ──────────────────────────────────────── */

  function strokes() {
    var C = chars(), list = Object.keys(C), total = 0, min = null, max = 0;
    for (var i = 0; i < list.length; i++) {
      var n = (C[list[i]].strokes || []).length;
      total += n;
      if (min === null || n < min) min = n;
      if (n > max) max = n;
    }
    return {
      total: total,
      min: min === null ? 0 : min,
      max: max,
      avg: list.length ? +(total / list.length).toFixed(2) : 0
    };
  }

  /* ── 其他分项 ────────────────────────────────────────── */

  function decomposition() {
    var C = global.Components;
    return (C && C.DECOMPOSITION) ? Object.keys(C.DECOMPOSITION).length : 0;
  }

  /** 创作构件盘的条目数。
   *  直接问 Compose（数据层），不绕 ZQ.store —— 那一层是 UI 的一件外套，
   *  而且它在 index.html 里**加载得比本文件晚**。store 里那份也只是转调 Compose。 */
  function creativeParts() {
    var C = global.Compose;
    if (C && C.palette) return C.palette().length;
    var S = ZQ.store;
    return (S && S.palette) ? S.palette().length : 0;
  }

  function evidence() {
    var E = global.XiaoxueEvidence;
    var records = (E && E.records) || [];
    var seen = {};
    records.forEach(function (r) { if (r && r.char) seen[r.char] = 1; });
    return { chars: Object.keys(seen).length, images: records.length };
  }

  /** 关系网：连通块、枢纽字。度数已由 ZQ.Graph.stats() 算好，这里只排序。
   *  注意 nodes 含「宀」这种只作为构件的节点，chars 才是字表里的字数，两者分开报。
   *  ⚠️ Graph.stats() 里 nodes/chars 是**计数**、extra/isolated 却是**数组**（那里自己就不齐），
   *  这一层统一成计数，并另存 `*List` 给需要逐项的人。 */
  function graph() {
    var G = ZQ.Graph;
    if (!G || !G.stats) return null;
    var s = G.stats();
    var extra = s.extra || [], isolated = s.isolated || [];
    var hubs = Object.keys(s.degree).map(function (k) { return { ch: k, degree: s.degree[k] }; })
      .sort(function (a, b) { return b.degree - a.degree || (a.ch < b.ch ? -1 : a.ch > b.ch ? 1 : 0); })
      .slice(0, 8);
    return {
      nodes: s.nodes, chars: s.chars, edges: s.edges,
      extra: extra.length, extraList: extra,
      isolated: isolated.length, isolatedList: isolated,
      components: s.components, componentSizes: s.componentSizes,
      hubs: hubs
    };
  }

  // Frequent itemsets from modern components. Repeated 木 in 林/森 counts once per record.
  // Independent characters are excluded from the denominator; associations are sample facts.
  function mine(charList, options) {
    var minCount = options && Number.isInteger(options.minCount) && options.minCount >= 1 ? options.minCount : 2;
    var cat = catalog(), seen = {}, records = [], population = 0, singles = {}, pairs = {};
    (Array.isArray(charList) ? charList : Object.keys(cat)).forEach(function (ch) {
      if (!Object.prototype.hasOwnProperty.call(cat, ch) || seen[ch]) return;
      seen[ch] = true; population++;
      var components = Array.from(new Set((cat[ch].components || []).filter(function (part) {
        return typeof part === 'string' && part.length;
      }))).sort();
      if (!components.length || (components.length === 1 && components[0] === ch)) return;
      records.push({ ch: ch, components: components });
      components.forEach(function (part) {
        if (!singles[part]) singles[part] = [];
        singles[part].push(ch);
      });
      for (var i = 0; i < components.length; i++) for (var j = i + 1; j < components.length; j++) {
        var key = components[i] + '|' + components[j];
        if (!pairs[key]) pairs[key] = { a: components[i], b: components[j], chars: [] };
        pairs[key].chars.push(ch);
      }
    });
    var n = records.length, rules = [];
    Object.keys(pairs).forEach(function (key) {
      var pair = pairs[key], count = pair.chars.length;
      if (count < minCount || !n) return;
      [[pair.a, pair.b], [pair.b, pair.a]].forEach(function (direction) {
        var confidence = count / singles[direction[0]].length;
        if (confidence < 0.5) return;
        rules.push({ from: direction[0], to: direction[1], count: count, support: count / n,
          confidence: confidence, lift: confidence / (singles[direction[1]].length / n), chars: pair.chars.slice() });
      });
    });
    rules.sort(function (a, b) { return b.lift - a.lift || b.count - a.count || b.confidence - a.confidence ||
      (a.from + a.to < b.from + b.to ? -1 : 1); });
    return { population: population, analyzed: n, recordChars: records.map(function (record) { return record.ch; }),
      components: Object.keys(singles).map(function (part) {
        return { component: part, count: singles[part].length, share: n ? singles[part].length / n : 0, chars: singles[part].slice() };
      }).sort(function (a, b) { return b.count - a.count || (a.component < b.component ? -1 : 1); }),
      rules: rules };
  }

  // Multiset Jaccard: intersection/union of component counts, preserving repetition.
  function similar(ch, charList, limit) {
    var cat = catalog(), source = cat[ch];
    if (!source || !source.components || !source.components.length) return [];
    function counts(parts) {
      var out = {};
      parts.forEach(function (part) { if (part) out[part] = (out[part] || 0) + 1; });
      return out;
    }
    var a = counts(source.components), rows = [], seen = {};
    (Array.isArray(charList) ? charList : Object.keys(cat)).forEach(function (other) {
      if (other === ch || seen[other] || !cat[other]) return;
      seen[other] = true;
      var parts = cat[other].components || [];
      if (!parts.length || (parts.length === 1 && parts[0] === other)) return;
      var b = counts(parts), all = Array.from(new Set(Object.keys(a).concat(Object.keys(b))));
      var intersection = 0, union = 0, shared = [];
      all.forEach(function (part) {
        intersection += Math.min(a[part] || 0, b[part] || 0);
        union += Math.max(a[part] || 0, b[part] || 0);
        if (a[part] && b[part]) shared.push(part);
      });
      if (intersection) rows.push({ ch: other, score: intersection / union, shared: shared,
        components: parts.slice() });
    });
    rows.sort(function (a, b) { return b.score - a.score || (a.ch < b.ch ? -1 : 1); });
    return rows.slice(0, typeof limit === 'number' ? Math.max(0, limit) : 6);
  }

  /* ── 摘要 ────────────────────────────────────────────── */

  /** 一份完整摘要。看板与 project-summary.mjs 都调这个。 */
  function summary() {
    var an = ancient(), ag = A();
    return {
      catalog: Object.keys(catalog()).length,
      modern: Object.keys(chars()).length,
      related: Object.keys(catalog()).length - Object.keys(chars()).length,
      tiers: tiers(),
      scriptTypes: scriptTypes(),
      categories: categories(),
      structureCategory: structureCategory(),
      ancient: an,
      gaps: gapList(an),
      gapsSelfCheck: gapsSelfCheck(an),
      strokes: strokes(),
      decomposition: decomposition(),
      creativeParts: creativeParts(),
      evidence: evidence(),
      graph: graph(),
      /* 有字形也无缺口的自检：来源短码全部认得出来时为空数组。 */
      unknownSources: an.unknownSources,
      /* 运行时 AI 的口径。**这里说的是主流程**：七个模块全部本机算，零网络请求。
       * 01 里另有一块**可选的**在线问答（用户自备 Key，不填就不发任何请求），
       * 它不在主流程里 —— 所以这个 false 不会因为它上线而变假，但**不能**被读成
       * 「本作品没有用到任何模型」。要让机器读的那句话在 runtimeAINote，
       * 给评委看的那句话在 参赛准备/2026最终交付口径与发布核对.md，三处一起改。 */
      runtimeAI: false,
      runtimeAINote: '七个学习模块可离线使用；AI 汉字问答通过 DeepSeek 回答含义与构件问题，并附参考资料',
      /* 楷书是时间轴第六段，但它来自 data/chars.js、不在上面那 507 格里。 */
      kai: { available: Object.keys(chars()).length, total: Object.keys(chars()).length, inAncientSet: false },
      erasTotal: ag ? ag.ERAS.length : 0
    };
  }

  ZQ.Stats = {
    summary: summary,
    tiers: tiers,
    scriptTypes: scriptTypes,
    categories: categories,
    ancient: ancient,
    gapList: gapList,
    gapsSelfCheck: gapsSelfCheck,
    strokes: strokes,
    graph: graph,
    mine: mine,
    similar: similar,
    normalizeMethod: normalizeMethod,
    SOURCE_LABEL: SOURCE_LABEL
  };
})(typeof window !== 'undefined' ? window : this);
