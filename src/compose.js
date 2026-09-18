/* 字启千年 — 自由构字（我的造字）
 *
 * 纯逻辑模块：不碰 DOM，可以像 components.js 一样被 Node harness 直接测。
 * 它只回答两个问题：
 *   ① 你摆的这几个构件，构成了什么结构？（左右 / 上下 / 品字 / 左中右）
 *   ② 这个结构 + 构件序列，对得上哪个真实会意字？（对不上就是「你造的字」）
 *
 * ⚠️ 学术红线（本模块最重要的一条）
 *    本模块只做几何判断和查表匹配，**不产生任何文字学论断**。
 *      匹配到 15 个可拆字之一 → 字理文案直接取自 Components.DECOMPOSITION（人工核对过的）
 *      匹配不到            → 一律说「你造的字」，绝不说「这是汉字」「这个字的字理是…」
 *    用户给自造字起的名字叫「你给它的意思」，**不叫「字理」**。这两个词在代码里
 *    必须始终是分开的字段（label vs relation），别图省事合并。
 *
 * 构件从哪来（实测结论，2026-09-16）
 *    data/chars.js 里只有整字，**亻 和 宀 没有独立条目** ——
 *    它们只是 DECOMPOSITION 里的字形标签，实际笔画是宿主字的子集：
 *      亻 = 休 的第 0–1 笔      宀 = 安 的第 0–2 笔
 *    所以构件盘 = 24 个「本来就能独立成字」的 + 2 个「只能从整字里切」的。
 *    后者在模块初始化时算一次并缓存，不要每次拖拽都重算。
 *
 * 依赖：window.Components（bboxOfStrokes / decompose）、window.__CHARS__
 *       —— 全部在函数体内运行时读取，模块顶层不碰全局，保证 Node 里能直接 import。
 */
(function (global) {
  'use strict';

  /* ── 构件盘 ──────────────────────────────────────── */

  /* 24 个独体字。它们恰好就是历史上会意字的合法意符池 ——
   * 这句话可以直接当模块文案：「会意字，是用独体字拼出来的」。
   *
   * ⚠️ 这是**人工挑的**，不等于「chars.js 里所有象形字」（100 字的字表里远不止这些）。
   *    扩容时按「15 个可拆字用得上」补了两个：石（岩）、力（男）。
   *    再动它要同时改 verify/test-compose.mjs 与 verify/test-mine.mjs 的构件盘计数。 */
  var SOLO = ('日月人木水山石火土目口手心女子田力雨云鱼鸟马牛羊').split('');

  // 2 个派生偏旁：没有独立字形，只能从宿主字里切。
  // part 是 DECOMPOSITION[from].parts 的下标。
  var DERIVED = {
    '亻': { from: '休', part: 0 },
    '宀': { from: '安', part: 0 }
  };

  var _tiles = null;

  /** 取一个构件的字形：笔画 path 数组 + 包围盒。结果缓存。 */
  function tile(glyph) {
    if (!_tiles) _tiles = {};
    if (_tiles[glyph]) return _tiles[glyph];

    var C = global.__CHARS__;
    var K = global.Components;
    var t;

    if (C && C[glyph]) {
      // 本来就能独立成字：直接用它的笔画
      t = { glyph: glyph, d: C[glyph].strokes, origin: glyph, derived: false };
    } else if (DERIVED[glyph]) {
      // 派生偏旁：从宿主字里切一段笔画出来
      var src = DERIVED[glyph];
      var d = K.decompose(src.from, C[src.from]);
      t = { glyph: glyph, d: d.parts[src.part].d, origin: src.from, derived: true };
    } else {
      return null;
    }

    t.bbox = K.bboxOfStrokes(t.d);
    _tiles[glyph] = t;
    return t;
  }

  /** 构件盘清单（给 UI 渲染用） */
  function palette() {
    return SOLO.map(function (g) { return { glyph: g, derived: false }; })
      .concat(Object.keys(DERIVED).map(function (g) {
        return { glyph: g, derived: true, note: '偏旁，单独不成字' };
      }));
  }

  /* ── 槽位模板 ────────────────────────────────────── */

  /* 模板从**真实字反推**，不是拍脑袋画的。
   *
   * 这是给「美术弱」开的药方：构图难看是必然的 —— 如果槽位是我们自己画的。
   * 但真实会意字里有现成的答案：Components.decompose('明') 吐出来的 日/月 包围盒，
   * 就是「左右结构该怎么分」的经验解。照抄它，构图像字靠的是排版常识，不是审美。
   *
   * 归一化：把构件包围盒换算成整字框的比例（0..1），与具体字的尺寸无关。
   */
  /* 品字用 森（上一下二），倒品字用 坐（上二下一）—— 构型不同，所以是两个模板，
   * 不能像从前那样把倒品字也退回等分。
   * 「左中右」仍然没有样本（见下）。
   *
   * ⚠️ 倒品字**不能直接照抄** 坐 的包围盒，是这套模板里唯一的例外 —— 原因见
   *    templateOf() 里那段裁剪，别把那段当成优化删掉。 */
  var TEMPLATE_FROM = { '左右': '明', '上下': '安', '品字': '森', '倒品字': '坐' };

  var _tmpl = null;

  function templateOf(structure) {
    if (!_tmpl) _tmpl = {};
    if (_tmpl[structure]) return _tmpl[structure];

    var C = global.__CHARS__;
    var K = global.Components;
    var ch = TEMPLATE_FROM[structure];

    if (!ch) {
      // 「左中右」在 15 个可拆字里没有样本 —— 退化成「左右」的三等分。
      // ⚠️ 这一格是唯一没有数据支撑的，答辩时别把它说成「由真实字形推导」。
      if (structure === '左中右') {
        var third = [];
        for (var k = 0; k < 3; k++) {
          third.push({ x: k / 3, y: 0, w: 1 / 3, h: 1 });
        }
        _tmpl[structure] = third;
        return third;
      }
      return null;
    }

    var box = K.bboxOfStrokes(C[ch].strokes);
    var parts = K.decompose(ch, C[ch]).parts;

    // ⚠️ 不能按 parts 下标排 —— 森 的三个木在数据里顺序是任意的。
    //    按几何排：先从上到下（字形坐标 y 越大越靠上，所以降序），再从左到右。
    var sorted = parts.slice().sort(function (a, b) {
      return (b.bbox.cy - a.bbox.cy) || (a.bbox.cx - b.bbox.cx);
    });

    var rects = sorted.map(function (p) {
      return {
        x: (p.bbox.x - box.x) / box.w,
        y: (p.bbox.y - box.y) / box.h,
        w: p.bbox.w / box.w,
        h: p.bbox.h / box.h
      };
    });

    /* 倒品字是**唯一**一个不能拿样本字包围盒直接当槽位的结构，理由不是「差一点」，
     * 是包围盒在这个字上根本不代表那块地：
     *
     *   坐 的「土」那一竖从两个人**中间**穿上去，一直顶到字顶。所以土的墨迹
     *   包围盒是 758×819（满字高），而且**整个包住**了两个「人」（源字里的重叠
     *   人-土 = 0.93 / 1.00 —— 重叠是样本字自带的，不是模板失准）。
     *   拿它当槽位 → fitInto 把土放大到满画布 → 识别器自己判 OVERLAP，
     *   「帮你摆正」摆出来的位置它自己都不认。
     *
     * 裁剪只动一面：把最下面那个槽的**上沿**压到上排墨迹的上沿。裁掉的是那条
     * 穿插上去的竖笔，土该占的那块地一寸没少（裁完 353/360/415，两个「人」
     * 大小一致 —— 这一点比对 品字模板取垂直镜像更好，森 的两个木本来就不等大，
     * 镜像会把这不对称一并继承成两个人不一样大）。
     *
     * 另外三个模板仍然是直接推导：它们的样本字里没有这种穿插。 */
    if (structure === '倒品字' && rects.length === 3) {
      var cut = (Math.min(sorted[0].bbox.y, sorted[1].bbox.y) - box.y) / box.h;
      rects[2].h = cut - rects[2].y;
    }

    _tmpl[structure] = rects;
    return rects;
  }

  /** 把模板比例换算成字形坐标系里的矩形（给 fitInto 用） */
  function slots(structure, area) {
    var t = templateOf(structure);
    if (!t) return null;
    return t.map(function (f) {
      return {
        cx: area.x + (f.x + f.w / 2) * area.w,
        cy: area.y + (f.y + f.h / 2) * area.h,
        w: f.w * area.w,
        h: f.h * area.h
      };
    });
  }

  /* ── 缩放：装得下，不是填满 ──────────────────────── */

  /* ⚠️ 必须用 min 而不是分别拉伸填满。
   *    口 只有一点点墨，按填充算会被放大到荒谬；真实汉字里 口 在 明 里就是小的。
   *    0.92 是视觉留白 —— 贴着槽边会显得挤。
   *    上下限是为了不让极端比例的字（比如细长的 月）缩到看不见或撑破格子。 */
  function fitInto(t, rect) {
    // raw = 「刚好装下」的缩放（再乘 0.92 留白），所以任何 s ≤ raw 都保证不溢出画布。
    var raw = Math.min(rect.w / t.bbox.w, rect.h / t.bbox.h) * 0.92;
    var s = Math.min(raw, 1.15);          // 上限：小构件别被撑得过满
    // ⚠️ 下限只在 raw 本来就够大时才生效。
    //    无脑取 max(0.28, …) 的话，一个比格子还大的构件会被放大到 0.28 —— 捅出 BOUNDS，
    //    然后 recognize 把它报成「有构件在框外」。用户看到的是一个假故障，
    //    而且是我们自己造的，不是他摆错的。
    if (raw >= 0.28) s = Math.max(s, 0.28);
    // 组变换 translate(dx,dy) scale(s) 把点 p 映到 p*s + (dx,dy)，
    // 所以包围盒中心正好落到槽心：bbox.cx*s + dx = rect.cx
    return { s: s, dx: rect.cx - t.bbox.cx * s, dy: rect.cy - t.bbox.cy * s };
  }

  /** 一个已摆放构件的实际包围盒（it = {bbox, dx, dy, s}） */
  function placedBox(it) {
    return {
      cx: it.bbox.cx * it.s + it.dx,
      cy: it.bbox.cy * it.s + it.dy,
      w: it.bbox.w * it.s,
      h: it.bbox.h * it.s
    };
  }

  /* ── 第一步：几何定结构 ──────────────────────────── */

  /* 阈值怎么来的（2026-09-17 用 15 个真字的实际拆解重量的 —— 8 字时代的表已作废）
   *
   * 量法是量**几何量本身**：把每个字摆回自己的槽位，取相邻构件的 |Δcy|/构件高中位数
   * （纵向）与 |Δcx|/构件宽中位数（横向），再和真实阈值（含地板）比。
   *
   * ⚠️ 别想着二分「每个字的临界值」—— 判据在这两个常量上**不单调**：比值调小，
   *    两个构件并成一列 → 形状 '1' → STRUCT 里没有；比值调大，左右结构的两个字
   *    并成一行一列 → 也是 '1'。两端都失败，二分的前提根本不成立。
   *
   * 最紧的几对（余量 = 比值 / 阈值）：
   *   从   纵向 join   0.313 / 0.401 = 1.28×   ← 全表最紧，靠地板 0.16 撑着
   *   好   横向 split  0.762 / 0.400 = 1.90×   （林/从/鸣 同为 0.762）
   *   炎   纵向 split  0.820 / 0.400 = 2.05×   （岩/男/李 同为 0.820）
   *   森   纵向 join   0.069 / 0.400 = 5.78×   ← 全表最松
   * 8 字时这里写的是「两边各留 2 倍以上余量」。**扩到 15 字后这句话不再成立** ——
   * 从 只剩 1.28×。所以这张余量表进了断言（test-compose.mjs ⑤），不只是写在这里：
   * 以后再加字，坐在 1.1× 上的那个字会被测出来，而不是等演示时误报中间态。
   *
   * 上界由细网格扫描独立确认，与量出来的一致：
   *   GAP_RATIO 0.40 → 可行区 [0, 0.76]，0.77 起 从/林/好/鸣 横向并簇 → NO_STRUCTURE
   *   GAP_FLOOR 0.16 → 可行区 [0, 0.40]，0.41 起 坐 的土被地板撑得过高 → NO_STRUCTURE
   *   DOMINATE  1.5  → 可行区 (1, 3.30]，3.32 起 左右字全被当成斜着摆
   * 三个都是**上界卡住、下界扫到 0 都通过**。所以别拿「可行区的算术中点」当选值依据
   * （那么算会得到 0.38，纯属自欺）；也正因为下界不是悬崖，这三个值没有一个是被
   * 逼到墙角的 —— 真正的风险全在**上界**，往大调永远比往小调危险。
   *
   * DOMINATE 的下界尤其不是数据定的：比值 < 1 没有意义，1.0 是数学下界而非实测悬崖。
   * 1.5 是**主动保守** —— 离真实上界 3.30 还有 2.2 倍余量，用来少收一点斜着摆的
   * 中间态。往小调 = 更宽容（更容易判成「说得准」），往大调 = 更容易弹
   * 「拿不准，要不要帮你摆正」。
   *
   * ⚠️ 这里不用 Components.positionsOf 做主判据。它是为「显示」设计的 ——
   *    12% 阈值 + 2× 主导轴规则是为了把 明 的垂直噪音压掉、输出好看的「左」「右」。
   *    在自由摆放里直接拿它判结构，会因为阈值不匹配而频繁给出「上左/下右」这种中间态。
   *    所以主判据用这里的行/列聚类，positionsOf 退居为「人话标签」（面板上显示用）。
   */
  var GAP_RATIO = 0.40;
  var GAP_FLOOR = 0.16;       // 地板：防止构件特别小时阈值退化成 0（从、坐 都靠它）
  var DOMINATE = 1.5;         // 主导轴要比另一轴大这么多倍，结构才算「说得准」

  function median(xs) {
    var a = xs.slice().sort(function (p, q) { return p - q; });
    var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function contains(area, box) {
    return box.cx - box.w / 2 >= area.x &&
           box.cx + box.w / 2 <= area.x + area.w &&
           box.cy - box.h / 2 >= area.y &&
           box.cy + box.h / 2 <= area.y + area.h;
  }

  /** 两个包围盒的重叠面积占较小者的比例 */
  function overlapRatio(a, b) {
    var ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
    var oy = Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2);
    if (ox <= 0 || oy <= 0) return 0;
    var inter = ox * oy;
    var smaller = Math.min(a.w * a.h, b.w * b.h);
    return smaller > 0 ? inter / smaller : 0;
  }

  function worstOverlap(boxes) {
    var worst = 0;
    for (var i = 0; i < boxes.length; i++) {
      for (var j = i + 1; j < boxes.length; j++) {
        var r = overlapRatio(boxes[i], boxes[j]);
        if (r > worst) worst = r;
      }
    }
    return worst;
  }

  /* 把一批已摆放构件聚成「行 × 列」。
   * 沿一个轴排序后线性扫描，相邻间距超过阈值就断开。
   *
   * ⚠️ 断开和没断开的间隙必须**分开装**。
   *    一开始把两者混在一个 gaps 数组里，结果「拿不准」判断把每一对相邻构件
   *    都算进去了一遍 —— 明明是清清楚楚的一行，也报「有点斜」。
   *    两类间隙的含义完全相反：split 是「我决定分开」，join 是「我决定不分开」，
   *    各自才谈得上「是否勉强」。 */
  function cluster(items, key, descending, threshold) {
    var sorted = items.slice().sort(function (a, b) {
      return descending ? key(b) - key(a) : key(a) - key(b);
    });
    var groups = [], splitGaps = [], joinGaps = [];
    for (var i = 0; i < sorted.length; i++) {
      if (!groups.length) { groups.push([sorted[i]]); continue; }
      var gap = Math.abs(key(sorted[i]) - key(sorted[i - 1]));
      if (gap > threshold) {
        groups.push([sorted[i]]);
        splitGaps.push(gap);        // 勉强越过阈值 → 可能是斜着摆的
      } else {
        groups[groups.length - 1].push(sorted[i]);
        joinGaps.push(gap);         // 快接近阈值了 → 也许其实是两行
      }
    }
    return { groups: groups, splitGaps: splitGaps, joinGaps: joinGaps };
  }

  var STRUCT = {
    '2': '左右', '3': '左中右',
    '1-1': '上下', '1-1-1': '上中下',
    '1-2': '品字', '2-1': '倒品字'
  };

  /**
   * 几何定结构。**不判断是不是字**，只判断构件摆成了什么形状。
   *
   * @param items [{id, glyph, bbox, dx, dy, s}]
   * @param area  {x,y,w,h} —— 用 Positioner.BOUNDS
   * @returns {code, structure?, ordered?, labels?, grid?, outside?, detail?}
   *   code: OK | TOO_FEW | OVERLAP | OUTSIDE | NO_STRUCTURE | NOT_CONFIDENT
   */
  function recognize(items, area) {
    if (!items || !items.length) return { code: 'TOO_FEW' };

    var placed = items.map(function (it) {
      return { id: it.id, glyph: it.glyph, box: placedBox(it) };
    });

    var outside = placed.filter(function (p) { return !contains(area, p.box); });
    if (outside.length) {
      return { code: 'OUTSIDE', outside: outside.map(function (p) { return p.id; }) };
    }

    if (placed.length < 2) return { code: 'TOO_FEW' };

    var boxes = placed.map(function (p) { return p.box; });
    var ov = worstOverlap(boxes);
    if (ov > 0.5) return { code: 'OVERLAP', detail: ov };

    // 竖向分行：字形坐标 y 越大越靠上，所以降序
    var gapV = Math.max(area.h * GAP_FLOOR, median(boxes.map(function (b) { return b.h; })) * GAP_RATIO);
    var rows = cluster(placed, function (p) { return p.box.cy; }, true, gapV);

    var gapH = Math.max(area.w * GAP_FLOOR, median(boxes.map(function (b) { return b.w; })) * GAP_RATIO);
    var cols = rows.groups.map(function (r) {
      return cluster(r, function (p) { return p.box.cx; }, false, gapH);
    });
    var grid = cols.map(function (c) { return c.groups; });

    var shape = grid.map(function (r) { return r.length; }).join('-');
    var structure = STRUCT[shape];
    if (!structure) {
      return { code: 'NO_STRUCTURE', shape: shape, grid: grid };
    }

    // 拿不准：用户可能是斜着摆的。这时候硬猜一个结构然后判否，用户会以为是 bug；
    // 正确做法是把选择权交回用户（UI 上给两个按钮，点了直接摆正）。
    //
    // ⚠️ 判据是**两轴谁占主导**，不是「某个间隙离阈值近不近」。
    //    一开始写成后者，结果 [从] 误报了：它的两个 人 被装进宽窄悬殊的槽
    //    （来自 明 的日槽 423 宽、月槽 781 宽），缩放差一倍，重心被拉开 128。
    //    那个 128 离纵向阈值不算远，就被误判成斜着摆 —— 可它明明是一目了然的左右。
    //    看主导轴就不会错：横向拉开 422 对纵向 128，3.3 倍，毫无悬念。
    var cxs = boxes.map(function (b) { return b.cx; });
    var cys = boxes.map(function (b) { return b.cy; });
    var spreadX = Math.max.apply(null, cxs) - Math.min.apply(null, cxs);
    var spreadY = Math.max.apply(null, cys) - Math.min.apply(null, cys);

    var confident;
    if (structure === '左右' || structure === '左中右') {
      confident = spreadX > spreadY * DOMINATE;
    } else if (structure === '上下' || structure === '上中下') {
      confident = spreadY > spreadX * DOMINATE;
    } else {
      // 品字 / 倒品字：两轴都铺开本来就是应该的（森 spreadX 444 / spreadY 453），
      // 所以不能要求某一轴主导，只要求两轴都真的撑得开。
      confident = spreadX > gapH && spreadY > gapV;
    }
    if (!confident) {
      return { code: 'NOT_CONFIDENT', structure: structure, grid: grid,
               spreadX: spreadX, spreadY: spreadY };
    }

    // 行（上→下）× 列（左→右）展平成有序序列
    var ordered = [];
    grid.forEach(function (row) {
      row.forEach(function (col) {
        col.forEach(function (p) { ordered.push(p); });
      });
    });

    // 人话标签交给 Components.positionsOf —— 它措辞和模式①一致，且是人工核对过的口径
    var labels = global.Components.positionsOf(
      ordered.map(function (p) { return { bbox: p.box }; }), area
    );

    return {
      code: 'OK',
      structure: structure,
      shape: shape,
      ordered: ordered,
      glyphs: ordered.map(function (p) { return p.glyph; }),
      labels: labels,
      grid: grid
    };
  }

  /* ── 第二步：查表定字 ────────────────────────────── */

  /* 查表规则**从 Components.DECOMPOSITION 派生**，不在这里手抄第二份。
   *
   * 从前这里是一张手写的 8 行表，与 components.js 的 DECOMPOSITION 各写各的。
   * 加了新字却忘补这张表，症状是「拆得开、拼不出」—— 用户在 ①认识构形 里看得见
   * 某字的构件，在 ③自由构字 里却永远拼不出它，而且两个模块都不报错。
   * 派生之后这种脱节结构性地不可能发生。守卫见 verify/test-decomposition-consistency.mjs。
   *
   * parts 的**次序就是部件的阅读序**（左→右 / 上→下），matchRule 拿它当答案；
   * DECOMPOSITION 各条目的 parts 次序本来就是按这个定的。
   * 构件名用 DECOMPOSITION 里的字形标签（亻 不是 人）。
   */
  var _rules = null;
  function rules() {
    if (_rules) return _rules;
    var D = (global.Components && global.Components.DECOMPOSITION) || {};
    _rules = Object.keys(D).map(function (ch) {
      return {
        char: ch,
        structure: D[ch].structure,
        parts: D[ch].parts.map(function (p) { return p.glyph; })
      };
    });
    return _rules;
  }

  function sameMultiset(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(), y = b.slice().sort();
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }

  /**
   * 查表。命中返回规则；没命中但「差一点」返回 nearMiss（有教学价值）。
   *
   * 位置序对**异形**构件有意义，这件事本身就是教学内容：
   *   木 + 亻   不匹配休（亻 必须居左）→ 提示「左右换一下」
   *   子 / 女   左右不匹配好（好 是女左子右）
   *   女 / 子   上下不匹配（好 不是上下结构）
   *   木×3 并排 不匹配森（森 是上一下二）
   * 这几条反馈比「匹配成功」更有教学价值，而且全建立在几何事实上，
   * **不需要任何文字学论断**。
   */
  function matchRule(glyphs, structure) {
    var all = rules(), i, r;
    for (i = 0; i < all.length; i++) {
      r = all[i];
      if (r.structure !== structure || r.parts.length !== glyphs.length) continue;
      // 林/森/从/众：构件全同，位置序没有意义
      var identical = r.parts.every(function (g) { return g === r.parts[0]; });
      var hit = identical
        ? glyphs.every(function (g) { return g === r.parts[0]; })
        : r.parts.every(function (g, k) { return g === glyphs[k]; });
      if (hit) return { hit: r };
    }

    // 差在哪：构件集合对得上，但结构或顺序不对
    for (i = 0; i < all.length; i++) {
      r = all[i];
      if (!sameMultiset(r.parts, glyphs)) continue;
      if (r.parts.length !== glyphs.length) continue;

      var identicalToo = r.parts.every(function (g) { return g === r.parts[0]; });
      if (identicalToo) {
        // 构件相同、个数相同，那就只能是结构摆错了
        return { nearMiss: { char: r.char, reason: 'structure',
                             want: r.structure, got: structure } };
      }
      // 结构本身就不对 → 先让用户改结构，别一上来就纠顺序
      // （女+子 摆成上下，第一反应该是「好 不是上下结构」，而不是「顺序反了」）
      if (r.structure !== structure) {
        return { nearMiss: { char: r.char, reason: 'structure',
                             want: r.structure, got: structure } };
      }
      return { nearMiss: { char: r.char, reason: 'order', want: r.parts, got: glyphs } };
    }
    return {};
  }

  /* ── 合起来：一次判定 ────────────────────────────── */

  /**
   * 完整判定。这是 UI 唯一需要调的入口。
   *
   * @returns {kind, ...}
   *   kind = 'real'    命中真实会意字 → 可以展示 relation（字理）
   *   kind = 'mine'    结构成立但不是字 → 只能说「你造的字」，没有 relation
   *   kind = 'near'    差一点 → 给出可操作的提示
   *   kind = 'none'    结构不成立 → 分诊文案
   */
  function evaluate(items, area) {
    var rec = recognize(items, area);
    if (rec.code !== 'OK') {
      return { kind: 'none', code: rec.code, detail: rec };
    }

    var m = matchRule(rec.glyphs, rec.structure);

    if (m.hit) {
      var C = global.__CHARS__;
      var d = global.Components.decompose(m.hit.char, C[m.hit.char]);
      return {
        kind: 'real',
        char: m.hit.char,
        structure: rec.structure,
        glyphs: rec.glyphs,
        labels: rec.labels,
        // 字理只从人工核对过的 DECOMPOSITION 取，绝不在这里现编
        relation: d ? d.relation : '',
        parts: d ? d.parts : []
      };
    }

    if (m.nearMiss) {
      return {
        kind: 'near',
        near: m.nearMiss,
        structure: rec.structure,
        glyphs: rec.glyphs,
        labels: rec.labels
      };
    }

    return {
      kind: 'mine',
      structure: rec.structure,
      glyphs: rec.glyphs,
      labels: rec.labels,
      // ⚠️ 注意这里**没有** relation 字段，是刻意的。
      //    「字理」是文字学术语，只能用于真实存在的字。
      //    用户给自造字起的名走 label 字段，UI 上叫「你给它的意思」。
      disclaimer: '拟造字 · 非通用汉字'
    };
  }

  /** 把已经摆好的构件整形成某个结构（「帮你摆正」按钮用）
   *
   *  ⚠️ 返回数组与传入的 items **下标一一对应**，不是排序后的顺序。
   *     内部确实要排序（按当前位置决定谁去哪个槽，这样摆正时构件不会互相穿越），
   *     但排完必须按原下标装回去。直接返回排序结果的话，调用方 targets[i] 会
   *     对到另一个构件身上 —— 实测就是把 月 的目标位置套给了 日，摆完跑出画布。
   */
  function tidyTargets(items, structure, area) {
    var sl = slots(structure, area);
    if (!sl) return null;

    var order = items.map(function (_, i) { return i; }).sort(function (ia, ib) {
      var ba = placedBox(items[ia]), bb = placedBox(items[ib]);
      return (bb.cy - ba.cy) || (ba.cx - bb.cx);
    });

    var out = new Array(items.length);
    order.forEach(function (origIdx, slotIdx) {
      var it = items[origIdx];
      var rect = sl[Math.min(slotIdx, sl.length - 1)];
      var f = fitInto(it, rect);
      out[origIdx] = { id: it.id, dx: f.dx, dy: f.dy, s: f.s };
    });
    return out;
  }

  global.Compose = {
    SOLO: SOLO,
    DERIVED: DERIVED,
    rules: rules,
    STRUCT: STRUCT,
    GAP_RATIO: GAP_RATIO,
    GAP_FLOOR: GAP_FLOOR,
    DOMINATE: DOMINATE,
    palette: palette,
    tile: tile,
    templateOf: templateOf,
    slots: slots,
    fitInto: fitInto,
    placedBox: placedBox,
    recognize: recognize,
    matchRule: matchRule,
    evaluate: evaluate,
    tidyTargets: tidyTargets
  };

  /* RULES 是派生的，而且**不能在这里就求值** —— 本模块的约定是顶层不碰全局
   * （见文件头），而派生要读 global.Components。所以用取值器：谁读谁触发，只算一次。
   * 名字仍叫 RULES，是因为 test-compose 等用例在遍历 C.RULES。 */
  Object.defineProperty(global.Compose, 'RULES', { get: rules });
})(window);
