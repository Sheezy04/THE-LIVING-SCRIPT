/* 「06 汉字关系网」的数据层（引擎层，框架无关）。
 *
 * 只做一件事：把**已经存在的两份关系数据**派生成一张图，并算出一份
 * 可复现的邻域布局。它自己**不产生任何新事实** —— 这是本模块最要紧的约束。
 *
 * 关系只有两个来源，没有第三个：
 *   · 构件关系  src/components.js 的 DECOMPOSITION（经 part.name 归一到整字）
 *   · 相关字关系 data/catalog.js 每行的 [8] related
 *   · 「人工推荐路径」data/paths.js —— 但那条**只是一串指向上面两条边的 hop**，
 *     引用不存在的边就会在 paths().invalid 里现形，绝不自带新关系。
 *     见 verify/test-graph.mjs 第 4 条。
 *
 * 三条约束（跟 compose.js / mine.js 一个规矩）：
 *   1. 顶层不读 window / 不读 __CHARS__ / 不读 CharCatalog，函数里才碰 ——
 *      所以 Node 里能直跑（verify/test-graph.mjs 就是这么加载它的）。
 *      index.html 里 src/*.js 在 data/*.js **之前**加载，顶层读会读到 undefined。
 *   2. 不依赖 Vue，也不碰 DOM。SVG 由 src/ui/graph-view.js 画。
 *   3. 不缓存派生结果。图很小（129 点 = 128 字 + 宀 / 174 边），每次重算的成本远低于
 *      一份会因为数据换了而变旧的缓存带来的麻烦（测试里会换着数据加载）。
 *
 * ⚠️ 合并规则不是优化，是必需：25 条构件边里有 23 条与 related 已经写过的边重合
 *    （休→人 木、明→日 月、好→女 子…），只有「安—宀」「李—子」是构件独有的。
 *    不合并就是同一对字画两条线，而且偏偏叠在 木（13 度）、人（6 度）、
 *    子/身/上/马（各 5 度）这些**度数最高的枢纽**周围 —— 也就是每一张邻域图的中心区。
 */
(function (global) {
  'use strict';

  /* 画布几何。写在这一层而不是 UI 层，是为了让坐标**可复现**：
   * 纯函数、不依赖窗口尺寸、不用随机数、不用力导向，测试才能断言位置。
   * VIEW 必须与 src/ui/graph-view.js 里 <svg> 的 viewBox 一致。 */
  var VIEW = 560, CX = 280, CY = 280;
  /* 第 k 跳的环半径；0 环是中心自己。
   * ⚠️ 最外环的半径不能用满 —— 关联字（related，r=20）在圈底下还要挂一行
   *    11px 的「→X」，那一行也算进画布。按最坏情况（节点正下方）算：
   *    CY + RING + 20 + 11 + 半行高(≈8) ≤ VIEW，即 RING ≤ 241。
   *    取 236 留一点余量，免得换台机器字体度量略不同就被切掉半个字。
   *    取 250 的话最下面那一行会**正好被 viewBox 切掉**，而按「圆心 ± 半径」
   *    写的断言查不出这件事 —— 它只量圈，不量那行小字。 */
  var RING = [0, 150, 236];
  var NODE_R = { core: 25, extended: 22, related: 20, unknown: 18 };
  var HOPS_DEFAULT = 2;

  var KIND_RANK = { component: 0, related: 1 };

  function catalog() { return global.CharCatalog || {}; }
  function glyphs() { return global.__CHARS__ || {}; }
  function parts() { return (global.Components && global.Components.DECOMPOSITION) || {}; }

  function key(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  /* 图上的节点 = 字表里的字 ∪ 出现在 DECOMPOSITION 里的构件名。
   * 后一半只为了 宀 —— 它是 安 的构件，但不在字表内。它是**允许的孤例**：
   * 把 安—宀 这条边丢掉，屏幕上「安」的构形就会少写一个部件，那是错的。
   * 但也不能放开成「任意字都能进图」，所以只认 DECOMPOSITION 用过的构件名。 */
  function componentNames() {
    var set = Object.create(null), source = parts(), ch, list, i;
    for (ch in source) {
      if (!Object.prototype.hasOwnProperty.call(source, ch)) continue;
      list = (source[ch] && source[ch].parts) || [];
      for (i = 0; i < list.length; i++) if (list[i] && list[i].name) set[list[i].name] = 1;
    }
    return set;
  }

  /* 课程顺序 = CharCatalog 的键顺序（data/catalog.js 的行序，Object.keys 继承它）。
   * 用它而不是拼音/笔画排序：环上的次序要跟 01 的选字顺序对得上，
   * 而且必须是**稳定**的 —— 换个排序函数就会让测试里的坐标全变。 */
  function orderIndex() {
    var map = Object.create(null), keys = Object.keys(catalog());
    for (var i = 0; i < keys.length; i++) map[keys[i]] = i;
    return map;
  }

  function tierOf(ch) {
    var entry = catalog()[ch];
    return (entry && entry.tier) || 'core';   /* catalog 省略 tier 即 core */
  }

  /* ── 两源 ───────────────────────────────────────────────────────────── */

  /* 构件边：安→宀 女 这种。parts() 的每个 part 都已经带 name 字段
   * （亻 的 name 是 人），**不要另造映射表** —— 那正是「第二份真相」的开头。 */
  function componentPairs() {
    var out = [], source = parts(), ch, list, i, j, part, name;
    for (ch in source) {
      if (!Object.prototype.hasOwnProperty.call(source, ch)) continue;
      list = (source[ch] && source[ch].parts) || [];
      for (i = 0; i < list.length; i++) {
        part = list[i]; name = part && part.name;
        if (!name || name === ch) continue;        /* 独体字自己指向自己，不是边 */
        out.push({ a: ch, b: name, kind: 'component', from: ch });
      }
    }
    /* 同一个字重复用同一构件（林 = 木+木、森 = 木×3）只留一条边 */
    var seen = Object.create(null), unique = [];
    for (j = 0; j < out.length; j++) {
      var k = key(out[j].a, out[j].b);
      if (seen[k]) continue;
      seen[k] = 1; unique.push(out[j]);
    }
    return unique;
  }

  /* 相关字边：按**无向**处理。catalog 里大量单向（明→日 而 日 一行曾经是空的），
   * 图不该因为数据只写了一个方向就把这条关系画丢。 */
  function relatedPairs() {
    var out = [], cat = catalog(), ch, list, i;
    for (ch in cat) {
      if (!Object.prototype.hasOwnProperty.call(cat, ch)) continue;
      list = (cat[ch] && cat[ch].related) || [];
      for (i = 0; i < list.length; i++) {
        if (!list[i] || list[i] === ch) continue;
        out.push({ a: ch, b: list[i], kind: 'related', from: ch });
      }
    }
    return out;
  }

  /* 合并两源。同一对字两条都命中时留一条，构件优先 —— 「X 由 Y 构成」是
   * 比「相关」更强的说法，强的不该被弱的盖掉。 */
  /* 字表 ∪ 构件名 —— 图上的全部节点 */
  function knownNodes() {
    var set = componentNames(), cat = catalog(), ch;
    for (ch in cat) if (Object.prototype.hasOwnProperty.call(cat, ch)) set[ch] = 1;
    return set;
  }

  function edges() {
    var known = knownNodes(), byKey = Object.create(null), merged = [], i, list;
    function push(a, b, kind, from) {
      if (!known[a] || !known[b]) return;          /* 表外且不是构件的字不进图 */
      var k = key(a, b), prior = byKey[k];
      if (prior) {
        /* 构件压过相关；同为构件时保留先出现的 */
        if (kind === 'component' && prior.kind !== 'component') {
          prior.kind = 'component'; prior.from = from;
        }
        return;
      }
      byKey[k] = { key: k, a: a, b: b, kind: kind, from: from };
      merged.push(byKey[k]);
    }
    list = relatedPairs();
    for (i = 0; i < list.length; i++) push(list[i].a, list[i].b, 'related', list[i].from);
    list = componentPairs();
    for (i = 0; i < list.length; i++) push(list[i].a, list[i].b, 'component', list[i].from);
    return merged;
  }

  function adjacency() {
    var map = Object.create(null), list = edges(), i, e;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      (map[e.a] = map[e.a] || []).push({ ch: e.b, kind: e.kind, edge: e });
      (map[e.b] = map[e.b] || []).push({ ch: e.a, kind: e.kind, edge: e });
    }
    return map;
  }

  /* ── 邻域布局 ───────────────────────────────────────────────────────── */

  /* 以 ch 为中心、向外 hops 跳的邻域图。返回同心环布局：
   *   nodes[i] = { ch, ring, x, y, r, tier, kind, inCatalog, selectable, anchor }
   *   ring 0 是中心；第 k 环内的每个节点都恰好 k 跳可达（测试断言这一条）。
   * 环内顺序 = 构件关系在前，再按课程顺序 —— 稳定且可复现。 */
  function neighborhood(ch, hops) {
    hops = (typeof hops === 'number' && isFinite(hops)) ? Math.max(0, Math.min(4, Math.floor(hops))) : HOPS_DEFAULT;
    var adj = adjacency(), idx = orderIndex(), glyph = glyphs();
    var cat = catalog(), known = knownNodes();
    if (!known[ch]) return { center: null, hops: hops, nodes: [], edges: [], empty: true };

    var dist = Object.create(null), frontier = [ch], d = 0, i, j, next, node;
    dist[ch] = 0;
    while (frontier.length && d < hops) {
      next = [];
      for (i = 0; i < frontier.length; i++) {
        node = frontier[i];
        var links = adj[node] || [];
        for (j = 0; j < links.length; j++) {
          if (dist[links[j].ch] !== undefined) continue;
          dist[links[j].ch] = d + 1;
          next.push(links[j].ch);
        }
      }
      frontier = next; d++;
    }

    /* 按 (跳数, 边类型, 课程序) 分组排序 */
    var members = Object.keys(dist);
    function kindToCenter(c) {
      var links = adj[ch] || [];
      for (var q = 0; q < links.length; q++) if (links[q].ch === c) return links[q].kind;
      return 'related';
    }
    members.sort(function (p, q) {
      if (dist[p] !== dist[q]) return dist[p] - dist[q];
      var kp = KIND_RANK[kindToCenter(p)] || 0, kq = KIND_RANK[kindToCenter(q)] || 0;
      if (kp !== kq) return kp - kq;
      var op = idx[p] === undefined ? 9999 : idx[p], oq = idx[q] === undefined ? 9999 : idx[q];
      return op - oq;
    });

    /* 环内等分角度，起点在正上方（-90°），顺时针 */
    var rings = Object.create(null), out = [], byRing, k;
    for (i = 0; i < members.length; i++) (rings[dist[members[i]]] = rings[dist[members[i]]] || []).push(members[i]);
    for (i = 0; i <= hops; i++) {
      byRing = rings[i] || [];
      var radius = RING[Math.min(i, RING.length - 1)];
      for (j = 0; j < byRing.length; j++) {
        var c = byRing[j];
        var angle = -Math.PI / 2 + (2 * Math.PI * (byRing.length ? j : 0)) / (byRing.length || 1);
        out.push({
          ch: c,
          ring: i,
          x: Math.round((CX + radius * Math.cos(angle)) * 10) / 10,
          y: Math.round((CY + radius * Math.sin(angle)) * 10) / 10,
          r: NODE_R[cat[c] ? tierOf(c) : 'unknown'] || NODE_R.unknown,
          tier: cat[c] ? tierOf(c) : 'unknown',
          kind: i === 0 ? 'center' : kindToCenter(c),
          inCatalog: !!cat[c],
          /* selectable：能不能作为**中心**再展开。不在 __CHARS__ 里的字
           * （28 个关联字、以及 宀 这种表外构件）没有楷书字形，
           * 01/02/03 拿它当选中字都会空转，所以只能「跳到它的锚点」。 */
          selectable: !!glyph[c],
          anchor: anchorOf(c, adj, glyph, idx)
        });
      }
    }

    var inside = Object.create(null);
    for (i = 0; i < out.length; i++) inside[out[i].ch] = 1;
    var keep = [], all = edges();
    for (i = 0; i < all.length; i++) if (inside[all[i].a] && inside[all[i].b]) keep.push(all[i]);

    return { center: ch, hops: hops, nodes: out, edges: keep, empty: out.length <= 1 };
  }

  /* ch 能不能直接当选中字？不能的话，给一个最近的能当的。
   * 关联字在设计上只做图鉴/关系网/题池，没有古文字与楷书笔画数据，
   * 所以「点它」的含义是「带你去它对应的核心或扩展字」。 */
  function anchorOf(ch, adj, glyph, idx) {
    adj = adj || adjacency(); glyph = glyph || glyphs(); idx = idx || orderIndex();
    if (glyph[ch]) return ch;
    var seen = Object.create(null), queue = [ch], head = 0;
    seen[ch] = 1;
    while (head < queue.length) {
      var node = queue[head++], links = adj[node] || [], best = null;
      links = links.slice().sort(function (p, q) {
        var op = idx[p.ch] === undefined ? 9999 : idx[p.ch], oq = idx[q.ch] === undefined ? 9999 : idx[q.ch];
        return op - oq;
      });
      for (var i = 0; i < links.length; i++) if (glyph[links[i].ch]) return links[i].ch;
      for (i = 0; i < links.length; i++) if (!seen[links[i].ch]) { seen[links[i].ch] = 1; queue.push(links[i].ch); }
    }
    return null;
  }

  /* ── 人工推荐路径 ───────────────────────────────────────────────────── */

  /* data/paths.js 只写 hop，不写关系。这里逐 hop 到 edges() 里核对：
   * 引用不存在的边就记进 invalid —— **不在浏览器里抛错**（那会白屏），
   * 但 verify/test-graph.mjs 会断言 invalid 为空。两边的严格程度不一样，
   * 是故意的：线上要能降级，测试要能拦住。 */
  function paths() {
    var declared = global.ZQGraphPaths || [], list = [], invalid = [];
    var have = Object.create(null), all = edges(), i, j, p, pair;
    for (i = 0; i < all.length; i++) have[all[i].key] = all[i];
    for (i = 0; i < declared.length; i++) {
      p = declared[i];
      if (!p || !p.id || !Array.isArray(p.hops)) continue;
      var bad = [], chars = [], seen = Object.create(null);
      for (j = 0; j < p.hops.length; j++) {
        pair = p.hops[j];
        if (!Array.isArray(pair) || pair.length !== 2) { bad.push(String(pair)); continue; }
        if (!have[key(pair[0], pair[1])]) bad.push(pair[0] + '—' + pair[1]);
        if (!seen[pair[0]]) { seen[pair[0]] = 1; chars.push(pair[0]); }
        if (!seen[pair[1]]) { seen[pair[1]] = 1; chars.push(pair[1]); }
      }
      if (bad.length) { invalid.push({ id: p.id, hops: bad }); continue; }
      list.push({ id: p.id, title: p.title, note: p.note, hops: p.hops, chars: chars });
    }
    return { list: list, invalid: invalid };
  }

  /* ── 盘点 ───────────────────────────────────────────────────────────── */

  /* 如实报出图的真实状态：有几个连通分量、哪些字一条边都没有。
   * 这两个数是**内容的读数**，不是渲染指标 —— 度数 0 的字在任何视图里
   * 都是隐形的，所以界面上必须有个地方说出来。 */
  function stats() {
    var cat = catalog(), nodes = knownNodes(), all = edges(), par = Object.create(null), ch, i;
    function find(x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; }
    for (ch in nodes) if (Object.prototype.hasOwnProperty.call(nodes, ch)) par[ch] = ch;
    for (i = 0; i < all.length; i++) {
      var ra = find(all[i].a), rb = find(all[i].b);
      if (ra !== rb) par[ra] = rb;
    }
    var deg = Object.create(null), roots = Object.create(null);
    for (i = 0; i < all.length; i++) { deg[all[i].a] = (deg[all[i].a] || 0) + 1; deg[all[i].b] = (deg[all[i].b] || 0) + 1; }
    var isolated = [], extra = [];
    for (ch in nodes) {
      if (!Object.prototype.hasOwnProperty.call(nodes, ch)) continue;
      if (!cat[ch]) extra.push(ch);          /* 图上的节点但不是字表里的字（目前只有 宀） */
      if (!deg[ch]) isolated.push(ch);
      roots[find(ch)] = (roots[find(ch)] || 0) + 1;
    }
    var sizes = [];
    for (var r in roots) if (Object.prototype.hasOwnProperty.call(roots, r)) sizes.push(roots[r]);
    sizes.sort(function (p, q) { return q - p; });
    /* nodes 数的是**图上的全部节点**（含 宀 这种构件），chars 数的是字表里的字。
     * 分开报是必须的：componentSizes 之和要等于 nodes，而「本站收了多少字」
     * 问的是 chars —— 一个数兼两个意思，迟早会有一处报错。 */
    return {
      nodes: Object.keys(nodes).length, chars: Object.keys(cat).length, extra: extra,
      edges: all.length, degree: deg, isolated: isolated,
      components: sizes.length, componentSizes: sizes
    };
  }

  global.ZQ = global.ZQ || {};
  global.ZQ.Graph = {
    VIEW: VIEW, CX: CX, CY: CY, RING: RING, NODE_R: NODE_R, HOPS_DEFAULT: HOPS_DEFAULT,
    componentPairs: componentPairs,
    relatedPairs: relatedPairs,
    edges: edges,
    adjacency: adjacency,
    neighborhood: neighborhood,
    anchorOf: anchorOf,
    paths: paths,
    stats: stats,
    tierOf: tierOf,
    /* 无向边的标识。UI 拿它做高亮集合的键 —— 导出是为了让 UI 不必再写一遍
     * 「a<b 就换位」这个约定，那种重复迟早会有一边写错。 */
    pairKey: key,
    /* 给 UI 与测试共用：环号 → 半径，越界时钳到最后一环 */
    radiusOf: function (ring) { return RING[Math.min(Math.max(ring, 0), RING.length - 1)]; }
  };
})(typeof window !== 'undefined' ? window : this);
