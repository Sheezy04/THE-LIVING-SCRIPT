/* 字从何来 — 构件系统（数据层）
 *
 * 把一个会意字拆成构形部件。每个部件 = 原字笔画的一个子集，
 * 坐标不变 —— 所以合起来就是原字，分开就是构件，不需要重新锚定。
 *
 * ⚠️ 学术说明：构件的笔画归属可由几何验证（见 verify 脚本），
 *    但「会意逻辑」的解释属于文字学论断，需人工核对后定稿。
 *    参考核对源：汉典 zdic.net、教育部汉字全息资源应用系统。
 */
(function (global) {
  'use strict';

  /* 会意字构件拆分表（另有一个逐字开例外的形声字，见下）
   *
   * strokes 用原字的笔画索引，与 hanzi-writer-data 的 strokes 数组一一对应。
   * 经验证：本表中 13 个字的部首部分与数据自带的 radStrokes 完全一致；
   * 森、众 的余部按构件笔画数等分得到。
   * （新增的 7 条逐字核过 radStrokes：鸣[0-2]=口、相[4-8]=目、炎[0-3]=上火、
   *   岩[0-2]=山、男[0-4]=田、坐[4-6]=土、李[0-3]=木。）
   *
   * structure 抄自 data/catalog.js 的第 [6] 列，**不是这里自己定的**。
   * src/compose.js 的 RULES 由本表派生（char / structure / parts 三个字段），
   * 所以「拆得开却拼不出」那种两份手抄表脱节的结构性故障不会再发生。
   * 有测试守着这些：verify/test-decomposition-consistency.mjs。
   *
   * ⚠️ 不设 role 字段，是刻意的。
   *    会意字的各部件都是「意符」，没有形旁/声旁之分 ——
   *    形旁/义旁是形声字的分析术语，套到会意字上是分类错误。
   *    部件在字中的方位改由几何自动推出（见 positionOf），那是可验证的事实。
   *
   * ⚠️ 形声字是**逐字开例外**收进来的，机制在字段上（2026-09-17 收「李」时定的）：
   *    「李」的 catalog [4] 写的是「形声」—— 它的「子」是**声旁**不是意符，
   *    按会意字的格式给它写 meaning:'幼儿' 就是上面那条红线说的分类错误。
   *    所以例外不是「破一次例」，是三个字段：
   *      · method: '形声'（省略即 '会意' —— 与 catalog 的 tier 同一套写法）
   *      · phonetic: 声旁是第几个 part（下标）
   *      · **声旁那一格不许写 meaning**。对声旁说「它是什么意思」正是分类错误本身；
   *        decompose() 会给那一格填 note:'声旁，不表意' 交给 UI。
   *    ⚠️ 注意范围是**声旁那一格**，不是「形声条目的 parts 全部」。
   *       李 的「木」是**意符**，写 meaning:'树' 是对的 —— 它和会意字的构件
   *       是同一回事。删掉它换来的不是严谨，是面板上多一个空格
   *       （UI 显示的是 {{ p.meaning || p.note }}）。
   *       这里一开始写的就是「全部」，是测试把这条过宽的规则顶回来的（2026-09-17）。
   *    role 仍然不设 —— 那是在**会意字**上套形声术语，与「在形声字上用形声术语」
   *    是两回事。
   *    守卫：verify/test-decomposition-consistency.mjs（会意条目不许有 phonetic、
   *    每个构件都要有 meaning / 形声条目必须有一个合法下标 phonetic、声旁那一格
   *    无 meaning 且带「声旁，不表意」、其余构件照常有 meaning）。
   */
  var DECOMPOSITION = {
    '休': {
      structure: '左右',
      relation: '人靠在树旁，是歇息',
      parts: [
        { glyph: '亻', name: '人', strokes: [0, 1], meaning: '侧身的人形' },
        { glyph: '木', name: '木', strokes: [2, 3, 4, 5], meaning: '树' }
      ]
    },
    '明': {
      structure: '左右',
      relation: '现代构件为日与月，可联想光明；古文字构形并不只有这一种',
      parts: [
        { glyph: '日', name: '日', strokes: [0, 1, 2, 3], meaning: '太阳' },
        { glyph: '月', name: '月', strokes: [4, 5, 6, 7], meaning: '月亮' }
      ]
    },
    '林': {
      structure: '左右',
      relation: '两木并立，成片为林',
      parts: [
        { glyph: '木', name: '木', strokes: [0, 1, 2, 3], meaning: '树' },
        { glyph: '木', name: '木', strokes: [4, 5, 6, 7], meaning: '树' }
      ]
    },
    '森': {
      structure: '品字',
      relation: '三木叠加，树木极多',
      parts: [
        { glyph: '木', name: '木', strokes: [0, 1, 2, 3], meaning: '树' },
        { glyph: '木', name: '木', strokes: [4, 5, 6, 7], meaning: '树' },
        { glyph: '木', name: '木', strokes: [8, 9, 10, 11], meaning: '树' }
      ]
    },
    '从': {
      structure: '左右',
      relation: '一人随一人，是跟从',
      parts: [
        { glyph: '人', name: '人', strokes: [0, 1], meaning: '侧身的人形' },
        { glyph: '人', name: '人', strokes: [2, 3], meaning: '侧身的人形' }
      ]
    },
    '众': {
      structure: '品字',
      relation: '现代简化字由三个人组成，可联想众多；古文字另有不同构形',
      parts: [
        { glyph: '人', name: '人', strokes: [0, 1], meaning: '侧身的人形' },
        { glyph: '人', name: '人', strokes: [2, 3], meaning: '侧身的人形' },
        { glyph: '人', name: '人', strokes: [4, 5], meaning: '侧身的人形' }
      ]
    },
    '好': {
      structure: '左右',
      relation: '现代构件为女与子，字义包括美好；这里不据拆字推定古代文化含义',
      parts: [
        { glyph: '女', name: '女', strokes: [0, 1, 2], meaning: '女性' },
        { glyph: '子', name: '子', strokes: [3, 4, 5], meaning: '幼儿' }
      ]
    },
    '安': {
      structure: '上下',
      relation: '现代构件为宀与女，字义是安宁；历史字源需结合文献理解',
      parts: [
        { glyph: '宀', name: '宀', strokes: [0, 1, 2], meaning: '房屋' },
        { glyph: '女', name: '女', strokes: [3, 4, 5], meaning: '女性' }
      ]
    },

    /* ── 扩容新增的 7 字（2026-09-17）────────────────────────
     * relation 逐字取自 data/catalog.js 的第 [7] 列（文化说明），
     * **不是这里新写的文字学论断** —— 那几句已经是人工核对过的口径。
     * structure 同样取自第 [6] 列。parts 的笔画切分见文件头。
     */
    '鸣': {
      structure: '左右',
      relation: '「口」与「鸟」组合，表示鸟的鸣叫',
      parts: [
        { glyph: '口', name: '口', strokes: [0, 1, 2], meaning: '嘴，也指开口' },
        { glyph: '鸟', name: '鸟', strokes: [3, 4, 5, 6, 7], meaning: '鸟' }
      ]
    },
    '相': {
      structure: '左右',
      relation: '「目」在「木」旁，表示察看的动作',
      parts: [
        { glyph: '木', name: '木', strokes: [0, 1, 2, 3], meaning: '树' },
        { glyph: '目', name: '目', strokes: [4, 5, 6, 7, 8], meaning: '眼睛' }
      ]
    },
    '炎': {
      structure: '上下',
      relation: '两个「火」上下相叠，表示火势旺盛',
      parts: [
        { glyph: '火', name: '火', strokes: [0, 1, 2, 3], meaning: '火' },
        { glyph: '火', name: '火', strokes: [4, 5, 6, 7], meaning: '火' }
      ]
    },
    '岩': {
      structure: '上下',
      relation: '「山」与「石」组合，表示山崖上的岩石',
      parts: [
        { glyph: '山', name: '山', strokes: [0, 1, 2], meaning: '山' },
        { glyph: '石', name: '石', strokes: [3, 4, 5, 6, 7], meaning: '石头' }
      ]
    },
    '男': {
      structure: '上下',
      relation: '「田」与「力」组合，表示在田里出力的人',
      parts: [
        { glyph: '田', name: '田', strokes: [0, 1, 2, 3, 4], meaning: '田地' },
        { glyph: '力', name: '力', strokes: [5, 6], meaning: '农具，也指用力' }
      ]
    },
    '坐': {
      structure: '倒品字',
      relation: '两人相对而坐于土上，表示坐下',
      parts: [
        { glyph: '人', name: '人', strokes: [0, 1], meaning: '侧身的人形' },
        { glyph: '人', name: '人', strokes: [2, 3], meaning: '侧身的人形' },
        { glyph: '土', name: '土', strokes: [4, 5, 6], meaning: '土堆，地面' }
      ]
    },
    /* 本表唯一的形声字 —— 逐字开例外的机制见文件头。
     * phonetic:1 是说「子」是声旁。 */
    '李': {
      method: '形声',
      phonetic: 1,
      structure: '上下',
      relation: '「木」与「子」组合，本义为果树之名；「子」在这里表音，不作意符解',
      parts: [
        { glyph: '木', name: '木', strokes: [0, 1, 2, 3], meaning: '树' },
        // ⚠️ 这一格**没有 meaning，是刻意的**，别给它补上 —— 见文件头那条红线
        { glyph: '子', name: '子', strokes: [4, 5, 6] }
      ]
    }
  };

  /**
   * 由几何推出各部件的相对方位。
   *
   * 关键：拿各部件互相比较，而不是跟「整字重心」比。
   * 整字包围盒是各部件的并集，它的中心对左右结构的字来说
   * 恰好落在两部件之间 —— 拿它当基准会把右边的部件also 判成"中"。
   *
   * 输出是数组，与 parts 下标一一对应。
   * 这是可验证的几何事实，不是文字学论断，所以可以放心显示。
   */
  function positionsOf(parts, charBox) {
    var n = parts.length;
    if (n === 0) return [];
    if (n === 1) return ['中'];

    var cxs = parts.map(function (p) { return p.bbox.cx; });
    var cys = parts.map(function (p) { return p.bbox.cy; });
    var mx = cxs.reduce(function (a, b) { return a + b; }, 0) / n;
    var my = cys.reduce(function (a, b) { return a + b; }, 0) / n;

    var spreadX = Math.max.apply(null, cxs) - Math.min.apply(null, cxs);
    var spreadY = Math.max.apply(null, cys) - Math.min.apply(null, cys);

    // 该轴上部件要拉开足够距离，方位才有意义（否则如 安 的 宀/女 应判"中"）
    var useX = spreadX > charBox.w * 0.12;
    var useY = spreadY > charBox.h * 0.12;

    // 一个轴明显主导时，只报主导轴。
    // 否则 明 会显示成"日:上左 月:下右"—— 垂直那点偏移是字体设计使然，
    // 报出来只是噪音，反而盖住了"左右结构"这个真正的信息。
    if (spreadX > spreadY * 2) useY = false;
    else if (spreadY > spreadX * 2) useX = false;

    var tolX = spreadX * 0.2, tolY = spreadY * 0.2;

    return parts.map(function (p) {
      var h = !useX ? '' : p.bbox.cx < mx - tolX ? '左'
                    : p.bbox.cx > mx + tolX ? '右' : '';
      // 原始坐标为 y 向上为正；渲染时 scale(s,-s) 翻转，
      // 所以 y 越大在屏幕上越靠上。
      var v = !useY ? '' : p.bbox.cy > my + tolY ? '上'
                    : p.bbox.cy < my - tolY ? '下' : '';
      if (!h && !v) return '中';
      return v + h;
    });
  }

  /** 从 path 字符串里抽出所有坐标点 */
  function pathPoints(d) {
    var nums = (d.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    var pts = [];
    for (var i = 0; i + 1 < nums.length; i += 2) {
      pts.push([nums[i], nums[i + 1]]);
    }
    return pts;
  }

  /** 一组笔画的包围盒（在字形坐标系中） */
  function bboxOfStrokes(strokePaths) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var s = 0; s < strokePaths.length; s++) {
      var pts = pathPoints(strokePaths[s]);
      for (var i = 0; i < pts.length; i++) {
        var x = pts[i][0], y = pts[i][1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
    return {
      x: minX, y: minY, w: maxX - minX, h: maxY - minY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2
    };
  }

  /** 该字是否可拆 */
  function canDecompose(ch) {
    return Object.prototype.hasOwnProperty.call(DECOMPOSITION, ch);
  }

  /**
   * 拆解一个字。
   * @returns {null|{char, relation, parts:[{glyph,name,meaning,pos,strokes,d,bbox}]}}
   */
  function decompose(ch, charData) {
    if (!charData || !canDecompose(ch)) return null;
    var spec = DECOMPOSITION[ch];

    var charBox = bboxOfStrokes(charData.strokes);

    // 形声字是逐字开例外收的，默认会意 —— 与 catalog 的 tier 同一套写法
    var method = spec.method || '会意';
    var phonetic = typeof spec.phonetic === 'number' ? spec.phonetic : -1;

    var parts = spec.parts.map(function (p, i) {
      // 取出该构件的笔画 path（坐标保持原样）
      var d = p.strokes.map(function (k) { return charData.strokes[k]; });
      return {
        glyph: p.glyph,
        name: p.name,
        // 声旁在表里就不许写 meaning，这里也**不给它编一个** ——
        // 对声旁说「它是什么意思」正是那条红线要防的分类错误。
        // 只给一句 note 让 UI 有话说，位置由 phonetic 推出，不靠各条目自己写。
        meaning: p.meaning || '',
        note: i === phonetic ? '声旁，不表意' : '',
        pos: '',                         // 下面统一算，需互相比较
        strokes: p.strokes.slice(),
        d: d,
        bbox: bboxOfStrokes(d)
      };
    });

    // 方位必须互相比较才能定，所以放在所有部件都算完之后
    positionsOf(parts, charBox).forEach(function (pos, i) {
      parts[i].pos = pos;
    });

    // 自检：构件笔画必须覆盖全部笔画且不重叠
    var seen = {};
    var dup = false, oob = false;
    parts.forEach(function (p) {
      p.strokes.forEach(function (i) {
        if (seen[i]) dup = true;
        seen[i] = true;
        if (i < 0 || i >= charData.strokes.length) oob = true;
      });
    });
    var covered = Object.keys(seen).length;

    return {
      char: ch,
      method: method,
      phonetic: phonetic,
      relation: spec.relation,
      parts: parts,
      valid: !dup && !oob && covered === charData.strokes.length,
      coverage: covered + '/' + charData.strokes.length
    };
  }

  /**
   * 计算构件分离时的位移。
   * 每个构件沿"从整字重心指向自身重心"的方向推开，
   * 这样分离方向符合直觉，且不会互相穿越。
   */
  function separationOffsets(parts, distance) {
    var all = parts.map(function (p) { return p.bbox; });
    var gx = all.reduce(function (a, b) { return a + b.cx; }, 0) / all.length;
    var gy = all.reduce(function (a, b) { return a + b.cy; }, 0) / all.length;

    // 重心完全重合的构件（纯上下或纯左右叠置时可能发生）会推不开，
    // 记录出现次数，按下标交替给左右方向的兜底位移。
    var tied = parts.map(function (p) {
      var dx = p.bbox.cx - gx, dy = p.bbox.cy - gy;
      return Math.sqrt(dx * dx + dy * dy) < 1e-6;
    });
    var tieSeen = 0;

    return parts.map(function (p, i) {
      var dx = p.bbox.cx - gx;
      var dy = p.bbox.cy - gy;
      var len = Math.sqrt(dx * dx + dy * dy);

      if (len < 1e-6) {
        if (!tied[i]) return { dx: 0, dy: 0 };
        // 兜底：沿水平方向交替分开，保证一定能看见分离
        var side = (tieSeen++ % 2 === 0) ? -1 : 1;
        return { dx: side * distance, dy: 0 };
      }
      return {
        dx: (dx / len) * distance,
        dy: (dy / len) * distance
      };
    });
  }

  global.Components = {
    DECOMPOSITION: DECOMPOSITION,
    decompose: decompose,
    canDecompose: canDecompose,
    bboxOfStrokes: bboxOfStrokes,
    separationOffsets: separationOffsets,
    positionsOf: positionsOf,
    pathPoints: pathPoints
  };
})(window);
