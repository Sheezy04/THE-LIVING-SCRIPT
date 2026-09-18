/* 字从何来 — 演变模块
 *
 * 时间轴从「甲骨文」到「楷书」共六段，用一个连续参数 t ∈ [0, N-1] 驱动：
 *   i = floor(t)，f = t - i
 *   第 i 段淡下去的同时，第 i+1 段淡上来，交叠程度由 f 决定。
 *
 * 为什么是淡入淡出而不是书写动画：
 *   StrokeRenderer 靠「沿笔画中线推进粗画笔」实现书写，而字体给的是**轮廓，没有中线**。
 *   楷书那层有中线（hanzi-writer-data 提供），古文字这层没有。
 *   所以古文字只能做透明度过渡 —— 视觉上仍是「新的字形从旧的字形里长出来」，
 *   但不是真实笔顺。这一点在 README 里记着，答辩时要说清楚。
 *
 * 为什么不是揭幕式裁切：
 *   也试过「新期从左往右扫出来、两期严格不相交」，确实没有重叠，
 *   但字形是从中缝被劈开的 —— 左半是新期、右半是旧期，一眼看过去是个错字。
 *   交叉淡入淡出反而更干净，而且不会出现「两层都接近全透明」的空画布瞬间。
 *
 * 数据来源：
 *   古文字五段来自 window.AncientGlyphs（data/ancient.js）
 *   楷书那段来自 charData.strokes（data/chars.js），两者坐标系完全相同，
 *   所以能套同一个 Positioner 变换，直接同框。
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';

  /* 楷书这一期的覆盖率**不能写死**。
   *
   * 它是「有多少个字有楷书字形」，也就是楷书字表的大小 —— 而字表是会长大的
   * （30 → 100）。写死 30 的代价不是报错，是安静地说错话：旁边几期写着
   * 95/97/94/99，只有楷书这期停在 30。
   * （2026-09-17 核实：这个数当时**并没有显示在界面上** —— chip 只渲染 s.label，
   *   它只从 Evolution.info()/stages() 对外暴露。所以没人发现它不对，
   *   但这不等于它对；答辩时若有人读 API 或看 stages()，那就是一句假话。）
   *
   * 只能问数据要，而且要**在 load() 里算**：本模块在 index.html:37 求值，
   * 而 chars.js / ancient.js 在 40 / 42 才加载，顶层读不到（见文件头「数据来源」）。
   */
  var KAI = { key: '楷书', label: '楷书', period: '汉末至今', note: '隶变之后的通行正体',
              src: 'MMAH' };

  /** 楷书覆盖几个字。以古文字集的统计为准 —— 它是照楷书字表逐字建出来的，
   *  stats.chars 就是那个分母；取不到再退回楷书字表的长度。 */
  function kaiCoverage() {
    var A = global.AncientGlyphs;
    if (A && A.stats && A.stats.chars) return A.stats.chars;
    return Object.keys(global.__CHARS__ || {}).length || 0;
  }

  // 播放时每一段的节奏（毫秒）：先停住 HOLD_MS 让人看清，再用 FADE_MS 淡到下一期。
  // 一段 2.8s，整轮 14s —— 慢是故意的，每一期都要留够看的时间。
  var HOLD_MS = 1000;
  var FADE_MS = 1800;

  // 过渡是**两拍**的，不是一次对称交叉：
  //   第一拍 OUT_FROM..OUT_TO：旧期慢慢淡下去，这期间新期还没起来；
  //   第二拍 IN_FROM..IN_TO：  旧期已经淡掉大半，新期才慢慢显出来。
  // 两拍错开（IN_FROM 明显大于 OUT_FROM），眼睛才分得出「先走一个、再来一个」，
  // 对比也就出来了 —— 对称交叉会把两拍糊成一拍，看着就像一次化入化出。
  //
  // 但两拍**不能完全不重叠**：试过 IN_FROM = OUT_TO，旧期淡完新期才起步，
  // 截图一看交汇点前后画布是**全空的**（两层都接近 0），像闪了一下、更像动画崩了。
  // 所以留一段交叠。按现在这组数，全程墨量最低点约 0.55（f≈0.45），
  // 那一瞬两期都还在，只是都比平时淡 —— 既不是糊，也不是空。
  //
  // IN_TO 必须是 1：留一点余量（比如 0.95）的话，新期会提前淡满，
  // 最后那几百毫秒画面是死的 —— 白白占着 FADE_MS 却什么都没发生。
  //
  // 想调手感就动这四个数：IN_FROM 越大两拍分得越开（也越接近空画布），
  // 越小越像对称交叉。
  var OUT_FROM = 0;
  var OUT_TO = 1;
  var IN_FROM = 0.45;
  var IN_TO = 1;

  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function easeInOut(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function create(svg, opts) {
    opts = opts || {};
    var width = opts.width || 520;
    var height = opts.height || 520;
    var padding = opts.padding != null ? opts.padding : 40;
    var onStage = opts.onStage || function () {};

    // ⚠️ 画布是四个模式共用的同一个 <svg>，没有谁负责统一清场 ——
    //    stroke-anim.js / decompose.js 都在自己的 create 里先 svg.innerHTML = ''，
    //    evolution 也必须清。不清的话从「书写」点进「演变」，
    //    上一模式那幅写完的楷体会整幅留在底下，和古文字层叠成一团。
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var pos = global.Positioner.create(width, height, padding);
    var A = global.AncientGlyphs;

    var char = null;
    var charData = null;
    var stages = [];
    var t = 0;
    var overview = false;
    var raf = 0;
    var timer = 0;
    var playing = false;
    var seq = 0;          // 播放/动画的「代」。stop() 自增，异步回调认代不认人

    // ── DOM 骨架 ────────────────────────────────────
    // 两层：gOld 是正在退场的那一期，gNew 是正在进场的那一期。
    // 两期之间是错开的两拍淡（先淡出、后淡入），时间参数见上面 OUT_* / IN_* 那段。
    //
    // 试过揭幕式裁切（新期从左往右扫出来，两期严格不相交）：不重叠了，
    // 但字形是从中缝被劈开的，左半是新期右半是旧期，读起来还是别扭 —— 换成淡。
    var gOld = el('g', { transform: pos.transform });
    var gNew = el('g', { transform: pos.transform });

    var gOverview = el('g');                            // 并览模式的格子
    gOverview.setAttribute('display', 'none');

    var gEmpty = el('g');                               // 「此期未见」提示
    var emptyText = el('text', { x: width / 2, y: height / 2,
                                 'text-anchor': 'middle', 'dominant-baseline': 'middle',
                                 'class': 'zc-evo-miss', 'font-size': 14 });
    emptyText.textContent = '本素材集未收录此期字形';
    gEmpty.appendChild(emptyText);
    gEmpty.setAttribute('display', 'none');

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.appendChild(gOverview);
    svg.appendChild(gOld);
    svg.appendChild(gNew);
    svg.appendChild(gEmpty);

    // ── 内部工具 ────────────────────────────────────
    function clearG(g) {
      while (g.firstChild) g.removeChild(g.firstChild);
    }

    /** 某一阶段要套的变换。
     *
     *  古文字五段的归一化参数已经烘进 path 坐标（见 build-ancient-data.py），
     *  所以只要 Positioner 那一个变换。
     *  楷书那层的字形直接来自 data/chars.js，没被烘过，得在这里补上 ——
     *  不补的话「小篆→楷书」那一幕会突然胀大或缩小。 */
    function stageTransform(stage, base, ch) {
      var f = (stage && stage.key === KAI.key) ? A.kaiFit(ch || char) : null;
      if (!f) return base;
      return base + ' translate(' + f[1] + ',' + f[2] + ') scale(' + f[0] + ')';
    }

    function fillG(g, paths) {
      clearG(g);
      for (var i = 0; i < paths.length; i++) {
        g.appendChild(el('path', { d: paths[i], 'fill-rule': 'evenodd',
                                   'class': 'zc-evo-glyph' }));
      }
    }

    /** 这一段有没有字形 */
    function pathsOf(stage) {
      if (!char || !stage) return [];
      if (stage.key === KAI.key) {
        return charData && charData.strokes ? charData.strokes : [];
      }
      return A.paths(char, stage.key);
    }

    function hasStage(stage) {
      return pathsOf(stage).length > 0;
    }

    function stageAt(i) {
      return stages[Math.max(0, Math.min(stages.length - 1, i))];
    }

    /** f 在 [from, to] 这段里从 0 爬到 1（**线性**）。区间外夹住。
     *
     *  ⚠️ 这里刻意**不**用 easeInOut，尽管别处都在用。
     *     t 在 animateTo 里已经被缓动过一次了，透明度再缓一次就是缓动叠缓动：
     *     oldOp = 1 - easeInOut(easeInOut(u))，两头平、中间陡得离谱 ——
     *     实测 u 从 0.25 走到 0.75 就吃掉了全部可见变化，
     *     900ms 的过渡真正「在变」的只有 450ms，看着就是一闪而过。
     *     线性的话，透明度跟着 t 走同一条缓动曲线，正好一次缓动。
     *
     *     拖时间轴时 t 是直接设的、没有缓动，线性也是唯一说得通的映射。 */
    function ramp(f, from, to) {
      if (f <= from) return 0;
      if (f >= to) return 1;
      return (f - from) / (to - from);
    }

    // ── 渲染：交叉淡入淡出 ───────────────────────────
    function renderScrub() {
      var n = stages.length;
      if (!n) return;

      var tt = Math.max(0, Math.min(n - 1, t));
      var i = Math.floor(tt);
      var f = tt - i;

      // 若正好落在最后一段
      if (i >= n - 1) { i = n - 1; f = 0; }

      var cur = stageAt(i);
      var nxt = stageAt(i + 1);
      var curOk = hasStage(cur);
      var nxtOk = f > 0 && nxt && hasStage(nxt);

      // 旧期：有下一期接得上就淡下去；下一期缺字形就一直留着，别把画布留空
      var oldOp = nxtOk ? 1 - ramp(f, OUT_FROM, OUT_TO) : 1;
      // 新期：这一期本来就没有字形时没什么可交叠的，直接给满 ——
      // 不然它要淡上来的这段里，画布上是空的（前一期已经走完了）。
      var newOp = curOk ? ramp(f, IN_FROM, IN_TO) : 1;

      fillG(gOld, pathsOf(cur));
      gOld.setAttribute('transform', stageTransform(cur, pos.transform));
      gOld.setAttribute('display', curOk && oldOp > 0.002 ? '' : 'none');
      gOld.setAttribute('opacity', oldOp);

      if (nxtOk) {
        fillG(gNew, pathsOf(nxt));
        gNew.setAttribute('transform', stageTransform(nxt, pos.transform));
        gNew.setAttribute('display', newOp > 0.002 ? '' : 'none');
        gNew.setAttribute('opacity', newOp);
      } else {
        clearG(gNew);
        gNew.setAttribute('display', 'none');
      }

      var showEmpty = !curOk && !nxtOk;
      gEmpty.setAttribute('display', showEmpty ? '' : 'none');
      if (showEmpty) {
        emptyText.textContent = cur.label + ' · 本素材集未收录';
      }
    }

    // ── 渲染：并览 ──────────────────────────────────
    function renderOverview() {
      clearG(gOverview);
      var n = stages.length;
      if (!n) return;
      var cols = n <= 3 ? n : 3;
      var rows = Math.ceil(n / cols);
      var cw = width / cols;
      var ch = height / rows;
      var cp = Math.min(cw, ch) * 0.10;

      for (var i = 0; i < n; i++) {
        var st = stages[i];
        var cx = (i % cols) * cw;
        var cy = Math.floor(i / cols) * ch;

        var cell = el('g', { transform: 'translate(' + cx + ',' + cy + ')' });
        cell.appendChild(el('rect', {
          x: 2, y: 2, width: cw - 4, height: ch - 4, 'class': 'zc-evo-cell'
        }));

        var paths = pathsOf(st);
        if (paths.length) {
          var p2 = global.Positioner.create(cw, ch, cp);
          var gi = el('g', { transform: stageTransform(st, p2.transform) });
          for (var j = 0; j < paths.length; j++) {
            gi.appendChild(el('path', {
              d: paths[j], 'fill-rule': 'evenodd', 'class': 'zc-evo-glyph'
            }));
          }
          cell.appendChild(gi);
        } else {
          var tx = el('text', {
            x: cw / 2, y: ch / 2, 'text-anchor': 'middle',
            'dominant-baseline': 'middle', 'class': 'zc-evo-miss', 'font-size': 12
          });
          tx.textContent = '缺素材';
          cell.appendChild(tx);
        }

        var lb = el('text', {
          x: cw / 2, y: ch - 8, 'text-anchor': 'middle', 'font-size': 12,
          'class': i === Math.round(t) ? 'zc-evo-label is-current' : 'zc-evo-label'
        });
        lb.textContent = st.label;
        cell.appendChild(lb);

        gOverview.appendChild(cell);
      }
    }

    function render() {
      gOverview.setAttribute('display', overview ? '' : 'none');
      gOld.setAttribute('display', overview ? 'none' : '');
      gNew.setAttribute('display', overview ? 'none' : '');
      gEmpty.setAttribute('display', 'none');   // 并览时不需要，scrub 里会按需打开

      if (overview) renderOverview();
      else renderScrub();
    }

    // ── 播放 ────────────────────────────────────────
    // 停—走—停—走：每一期先停住让人看清，再淡到下一期。
    //
    // 原来是让 t 从头匀速扫到尾，五段过渡首尾相连 —— 全程每一个瞬间画面上
    // 都是两期混着的，没有一刻是干净的单期图形。看着就是一团乱。
    // 现在过渡只占每段的一半左右，其余时间画面是干净的一期。
    function stop() {
      playing = false;
      seq++;                                   // 让在飞的 rAF / 定时器认不出自己那一代
      if (timer) { clearTimeout(timer); timer = 0; }
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    function animateTo(target, ms, done) {
      var my = seq;
      var from = t;
      var dist = target - from;
      if (Math.abs(dist) < 1e-4 || ms <= 0) {
        t = target; render(); fire(); if (done) done(); return;
      }
      var t0 = 0;
      function step(ts) {
        if (my !== seq) return;                // 被 stop() 或被新动画顶掉了
        if (!t0) t0 = ts;
        var u = Math.min(1, (ts - t0) / ms);
        t = from + dist * easeInOut(u);
        render();
        // 每帧都要通知外部：缩略图条的「下一期」高亮和时间轴滑块都看 t，
        // 只在动画结束时通知的话，过渡全程它们是不动的。
        // 面板重建的开销由 app.js 那边按「阶段变了没」挡掉，见 onStage。
        fire();
        if (u < 1) raf = requestAnimationFrame(step);
        else { raf = 0; if (done) done(); }
      }
      raf = requestAnimationFrame(step);
    }

    function fire() { onStage(info()); }

    /** 每一期的完整清单 —— info() 和 api.stages() 用的是同一份 */
    function stageList() {
      return stages.map(function (s, i) {
        return { index: i, key: s.key, label: s.label, period: s.period,
                 note: s.note, cov: s.cov, available: hasStage(s),
                 source: s.key === KAI.key ? null : A.eraSource(s.key) };
      });
    }

    function info() {
      var i = overview ? Math.round(t) : Math.floor(t);
      var st = stageAt(i) || {};
      var nxt = stageAt(i + 1);
      return {
        index: i,
        t: t,
        key: st.key,
        label: st.label,
        period: st.period,
        note: st.note,
        src: st.src,
        cov: st.cov,
        stages: stageList(),      // renderEvoCoverage 读的是这个，漏了就会把那排 chip 清空
        available: stages.map(function (s) { return hasStage(s); }),
        missingHere: !hasStage(st),
        next: nxt ? nxt.key : null,
        source: st.key === KAI.key ? null : A.eraSource(st.key),
        total: stages.length
      };
    }

    // ── 对外 ────────────────────────────────────────
    var api = {
      /** 装载一个字。返回 false 表示这个字一个字阶段都没有。 */
      load: function (ch, data) {
        char = ch;
        charData = data || null;
        stages = A.ERAS.map(function (e) {
          return { key: e.key, label: e.label, period: e.period,
                   note: e.note, src: e.src, cov: e.cov };
        }).concat([Object.assign({}, KAI, { cov: kaiCoverage() })]);
        t = 0;
        stop();
        render();
        fire();
        return stages.some(hasStage);
      },

      setT: function (v) {
        if (typeof v !== 'number' || !isFinite(v) || !stages.length) return;
        stop();
        t = Math.max(0, Math.min(stages.length - 1, v));
        render(); fire();
      },

      getT: function () { return t; },

      /** 平滑跳到某一段 */
      goTo: function (i, animate) {
        if (typeof i !== 'number' || !isFinite(i) || !stages.length) return;
        i = Math.max(0, Math.min(stages.length - 1, i));
        if (animate === false) { api.setT(i); return; }
        stop();
        playing = true;                        // 跳的动画也算「在播」，再按一次能停
        animateTo(i, FADE_MS, function () { playing = false; fire(); });
      },

      /** 从头演进到尾：停—走—停—走 */
      play: function () {
        stop();
        var n = stages.length;
        if (n < 2) return;
        var i = t >= n - 1 - 1e-6 ? 0 : Math.floor(t + 1e-6);
        t = i; playing = true; render(); fire();

        (function next() {
          if (!playing) return;
          if (i >= n - 1) { playing = false; fire(); return; }
          timer = setTimeout(function () {
            if (!playing) return;
            animateTo(i + 1, FADE_MS, function () {
              if (!playing) return;
              i++; next();
            });
          }, HOLD_MS);
        })();
      },

      stop: stop,
      isPlaying: function () { return playing; },

      setOverview: function (on) {
        overview = !!on;
        render(); fire();
      },

      isOverview: function () { return overview; },

      stages: stageList,

      /** 这个字有哪几段（给缩略图条用） */
      pathsOf: function (i) { return pathsOf(stageAt(i)); },

      char: function () { return char; },
      destroy: function () { stop(); clearG(gOld); clearG(gNew); clearG(gOverview); }
    };

    return api;
  }

  global.Evolution = {
    create: create,
    KAI_KEY: KAI.key,
    // 给测试用：楷书那期覆盖几个字。这个数不进界面（chip 只渲染 label），
    // 而它曾经被写死成 30 —— 不导出就没法在页面上断言它取自数据。
    kaiCoverage: kaiCoverage,
    HOLD_MS: HOLD_MS,
    FADE_MS: FADE_MS
  };
})(window);
