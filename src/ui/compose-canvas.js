/* 字启千年 — 自由构字画布（构形实验室 模式③ 的交互层）
 *
 * 一个 Vue 组件：左边构件盘，右边画布，拖动构件摆结构，松手即判定。
 *
 * 为什么另写一层，不复用模式① 的 Decompose 引擎
 *   Decompose 的构件组只应用 translate，**没有 per-part 缩放** ——
 *   而模式③ 的核心恰恰是「把 口 这种小构件装进它该在的格子」。
 *   给 Decompose 加 scale 要动到它的 build / applyOffset / animatePart，
 *   而 test-decompose / test-challenge-flow / drive-challenge 三个 harness
 *   全压着它。为一个新功能去动三条已验证的路径，不划算。
 *   所以拖动、命中、缩放都在这里自己管，坐标公式与 decompose.js 保持一致。
 *
 * ⚠️ 这里刻意**不**做「每帧不进响应式」的优化。
 *    app.js 时代确实要躲：它的 syncWrite 每帧重算布局、改一大片 DOM，很贵。
 *    但这里每帧重渲染的是 3 个 <g> 加二十来条 path，Vue diff 一遍在微秒级，
 *    远不到一帧的 1%。为了躲开这个并不存在的开销去手写 DOM 补丁，
 *    换来的是「渲染源」和「交互源」两份状态，bug 都藏在它们的缝里。
 *    简单直接写，性能真成问题时再用 shallowRef 收窄，别提前优化。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  var SIZE = 520;        // 画布边长，与模式①②一致
  var PADDING = 40;

  /** 新加的构件怎么摆。
   *  两个的时候直接用 左右 的真实模板（取自 明 的 日/月 实测包围盒），
   *  这样「点 日、点 月」一按就落成 明 的构图 —— 不用动手就能看到结论。
   *  三个以上没有现成模板（15 个可拆字里没有左中右样本），退回等分。 */
  function autoRects(n, area) {
    if (n === 2) {
      var sl = global.Compose.slots('左右', area);
      if (sl) return sl;
    }
    var out = [];
    var pad = area.w * 0.06;
    var cols = Math.min(4, n), rows = Math.ceil(n / cols);
    var w = (area.w - pad * 2) / cols, h = area.h * .92 / rows;
    for (var i = 0; i < n; i++) {
      out.push({
        cx: area.x + pad + w * (i % cols + 0.5), cy: area.y + area.h * .96 - h * (Math.floor(i / cols) + .5),
        w: w * 0.92, h: h * .92
      });
    }
    return out;
  }

  /* ── 一个极小的补间，替代 GSAP ─────────────────────────────────────
   *
   *  tidy() 里那句 gsap.to() 曾经是**全项目唯一**的 GSAP 调用。
   *  为了这 0.5 秒的滑入，引一整条第三方动画依赖不划算：GSAP 用的是
   *  Webflow 的专有「Standard No Charge」许可（不是 MIT），
   *  在参赛材料里就多一个要解释的东西 —— 而我们的核心动画（书写引擎）
   *  本来就是自己写的，跟它无关。删掉，换成下面这二十行。
   *
   *  缓动按 GSAP 的 power2.inOut 复刻（power2 = 三次）：
   *      t < 0.5 ? 4t³ : (t-1)(2t-2)² + 1
   *  观感必须一模一样 —— 否则「删掉 GSAP」这件事本身就成了一个回归。
   *
   *  每帧只把结果写进响应式的 it，渲染仍然交给 Vue，和原先的分工一致。
   */
  function cubicInOut(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  /*  补间集合挂在**实例属性**上（不是 data）—— 它不该触发重渲染，
   *  也不该被 Vue 的响应式代理包一层。 */
  function tweenList(vm) {
    if (!vm.tweens) vm.tweens = [];
    return vm.tweens;
  }

  /** 所有补间共用一条 rAF 循环。
   *
   *  共用而不是每个补间各起一条，是因为销毁时只 cancel 一个 id 就够了 ——
   *  「有几个动画在跑」不是调用方该知道的事。 */
  function startTween(vm, ms, onUpdate, onDone) {
    var t0 = null;
    tweenList(vm).push({
      step: function (now) {
        if (t0 === null) t0 = now;             // 首帧定基准。不用 Date.now()：
        var p = Math.min(1, (now - t0) / ms);  // 那是另一个时钟，和 rAF 的时间轴对不齐
        onUpdate(cubicInOut(p));
        return p < 1;
      },
      done: onDone
    });
    kickTweens(vm);
  }

  function kickTweens(vm) {
    if (vm.tweenRaf) return;                   // 已经有一条在跑
    vm.tweenRaf = global.requestAnimationFrame(function tick(now) {
      vm.tweenRaf = 0;
      var list = tweenList(vm);
      for (var i = list.length - 1; i >= 0; i--) {
        if (list[i].step(now)) continue;
        var d = list[i].done;
        list.splice(i, 1);                     // 先摘掉再回调：回调里可能又开一段
        if (d) d();
      }
      if (list.length) kickTweens(vm);
    });
  }

  /** 停掉全部补间。
   *
   *  ⚠️ 必须真的 cancel，不能只是把数组清空 —— 留着的那条 rAF 还在自我续命，
   *    这就是泄漏。`verify/test-origin.mjs` 里那个 rAF 计数器专门抓这种情况，
   *    它要求 cancelAnimationFrame 把账还上（取消掉的回调永远不跑，计数得手动减）。 */
  function stopTweens(vm) {
    if (vm.tweenRaf) {
      global.cancelAnimationFrame(vm.tweenRaf);
      vm.tweenRaf = 0;
    }
    tweenList(vm).length = 0;
  }

  ZQ.ComposeCanvas = {
    name: 'ComposeCanvas',

    template: [
      '<div class="zc-compose">',
      '  <div class="zc-compose-palette">',
      '    <div class="zc-panel-title">构件',
      '      <span class="zc-compose-hint">点一下放进画布</span></div>',
      '    <div class="zc-compose-grid">',
      '      <button v-for="p in palette" :key="p.glyph"',
      '              class="zc-compbtn"',
      '              :class="{ \'is-derived\': p.derived }"',
      '              :disabled="items.length >= 8 || (unlocked && !unlocked.includes(p.glyph))"',
      '              :title="unlocked && !unlocked.includes(p.glyph) ? (p.glyph + \' · 完成挑战解锁\') : p.derived ? (p.glyph + \'（偏旁，单独不成字）\') : p.glyph"',
      '              @click="add(p.glyph)">{{ p.glyph }}</button>',
      '    </div>',
      '  </div>',
      '',
      '  <div class="zc-compose-main">',
      '    <div class="zc-canvas-wrap">',
      '      <svg ref="svg" class="zc-canvas" :viewBox="\'0 0 \' + size + \' \' + size"',
      '           aria-label="构字画布"',
      '           @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp">',
      '        <g :transform="posTransform">',
      '          <g v-for="it in items" :key="it.id"',
      '             class="zc-comp"',
      '             :class="{ \'is-dragging\': it.id === dragId, \'is-selected\': editable && it.id === selectedId }"',
      '             :transform="xform(it)"',
      '             @pointerdown="onDown($event, it)">',
      '            <rect v-if="editable && it.id === selectedId" class="zc-selection-guide" :x="it.bbox.cx - it.bbox.w / 2 - 12" :y="it.bbox.cy - it.bbox.h / 2 - 12" :width="it.bbox.w + 24" :height="it.bbox.h + 24" />',
      '            <path v-for="(d, k) in it.d" :key="k" :d="d" class="zc-comp-shape" />',
      '            <path v-for="(d, k) in it.d" :key="\'h\' + k" :d="d"',
      '                  class="zc-comp-hit" fill="none" stroke="transparent" stroke-width="70" />',
      '          </g>',
      '        </g>',
      '      </svg>',
      '      <div v-if="!items.length" class="zc-compose-empty">点左边的构件，放进来拼一个字</div>',
      '    </div>',
      '',
      '    <div v-if="editable" v-show="toolsVisible" class="zc-seg zc-compose-tabs"><button :class="{ \'is-active\': panel === \'edit\' }" @click="panel = \'edit\'">编辑工具</button><button :class="{ \'is-active\': panel === \'feedback\' }" @click="panel = \'feedback\'">构形反馈</button></div>',
      '    <div v-if="editable" v-show="toolsVisible && panel === \'edit\'" class="zc-edit-controls">',
      '      <label>选择构件 <select v-model="selectedId"><option value="">请选择</option><option v-for="(it, i) in items" :key="it.id" :value="it.id">{{ i + 1 }} · {{ it.glyph }}</option></select></label>',
      '      <label>布局草案 <select :disabled="items.length < 2" @change="arrange($event.target.value); $event.target.value = \'\'"><option value="">选择布局…</option><option value="row">横向编排</option><option value="column">纵向编排</option><option value="orbit">环形组合</option></select></label>',
      '      <template v-if="selected">',
      '        <label>缩放 {{ Math.round(selected.s * 100) }}%<input type="range" min="0.15" max="1.5" step="0.01" :value="selected.s" @input="editScale($event.target.value, false)" @change="commit"></label>',
      '        <label>旋转 {{ Math.round(selected.a || 0) }}°<input type="range" min="-180" max="180" step="5" :value="selected.a || 0" @input="editAngle($event.target.value, false)" @change="commit"></label>',
      '        <div class="zc-controls"><button class="zc-btn" @click="moveSelected(-30,0)" aria-label="构件向左移动">←</button><button class="zc-btn" @click="moveSelected(30,0)" aria-label="构件向右移动">→</button><button class="zc-btn" @click="moveSelected(0,30)" aria-label="构件向上移动">↑</button><button class="zc-btn" @click="moveSelected(0,-30)" aria-label="构件向下移动">↓</button><button class="zc-btn" @click="removeSelected">删除构件</button></div>',
      '      </template>',
      '      <p v-if="!selected" class="zc-note">点击画布中的构件选中；也可从列表选择，再用按钮调整位置。</p>',
      '    </div>',
      '',
      '    <div v-show="toolsVisible" class="zc-controls">',
      '      <button v-if="editable" class="zc-btn" @click="undo" :disabled="!canUndo">撤销</button>',
      '      <button v-if="editable" class="zc-btn" @click="redo" :disabled="!canRedo">重做</button>',
      '      <button class="zc-btn" @click="clear" :disabled="!items.length">清空</button>',
      '      <button v-if="canTidy" class="zc-btn is-primary" @click="tidy(pendingStructure)">',
      '        就按{{ pendingStructure }}摆',
      '      </button>',
      '      <span v-if="items.length" class="zc-note zc-compose-struct">',
      '        结构：{{ structureText }}</span>',
      '    </div>',
      '',
      '    <div v-show="toolsVisible && (!editable || panel === \'feedback\')" class="zc-verdict" :class="verdictClass" aria-live="polite">',
      '      <template v-if="!verdict">',
      '        <p class="zc-verdict-line">{{ editable && items.length ? \'自由组合中：可调整构件，再赋予自己的含义\' : \'选择构件，开始探索构形\' }}</p>',
      '      </template>',
      '',
      '      <template v-else-if="verdict.kind === \'real\'">',
      '        <div class="zc-verdict-badge">构形成立</div>',
      '        <p class="zc-verdict-line">与 <b class="zc-verdict-char">{{ verdict.char }}</b> 相符',
      '          <span class="zc-verdict-tag">{{ verdict.structure }}</span></p>',
      '        <p class="zc-verdict-relation">字理：{{ verdict.relation }}</p>',
      '      </template>',
      '',
      '      <template v-else-if="verdict.kind === \'near\'">',
      '        <div class="zc-verdict-badge">差一点</div>',
      '        <p class="zc-verdict-line">{{ nearText }}</p>',
      '      </template>',
      '',
      '      <template v-else-if="verdict.kind === \'mine\'">',
      '        <p class="zc-verdict-line"><b>你造的字</b>',
      '          <span class="zc-verdict-tag">{{ verdict.structure }}</span></p>',
      '        <p class="zc-verdict-relation">{{ verdict.glyphs.join(\' + \') }}</p>',
      '        <p class="zc-verdict-warn">这是你的数字构形创作；当前示例库中未匹配到通用汉字。</p>',
      '      </template>',
      '',
      '      <template v-else>',
      '        <p class="zc-verdict-line">{{ noneText }}</p>',
      '      </template>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n'),

    props: {
      area: { type: Object, default: null },
      editable: { type: Boolean, default: false },
      active: { type: Boolean, default: true },
      toolsVisible: { type: Boolean, default: true },
      unlocked: { type: Array, default: null }
    },
    emits: ['change'],

    data: function () {
      return {
        size: SIZE,
        seq: 0,
        history: [[]],
        historyIndex: 0,
        items: [],
        selectedId: '',
        panel:'edit',
        dragId: null,
        drag: null,            // {it, gx, gy, dx0, dy0} —— 指针按下时的锚点
        verdict: null
      };
    },

    computed: {
      canUndo: function () { return this.historyIndex > 0; },
      canRedo: function () { return this.historyIndex < this.history.length - 1; },
      selected: function () { return this.items.find(function (it) { return it.id === this.selectedId; }, this) || null; },
      areaBounds: function () {
        return this.area || global.Positioner.BOUNDS;
      },
      pos: function () {
        return global.Positioner.create(SIZE, SIZE, PADDING);
      },
      posTransform: function () { return this.pos.transform; },
      palette: function () { return global.Compose.palette(); },

      /* ⚠️ 结构名要从 verdict.detail 里取，不是 verdict.structure。
       *    evaluate 在 kind='none' 时返回的是 {kind, code, detail} —— 结构在 detail 里。
       *    写成 verdict.structure 会拿到 undefined：按钮照常显示，点下去 tidy(undefined)
       *    在 slots() 那一步静默返回 null，什么也不发生。UI 上看不出错，功能是死的。
       *    （这个 bug 是被 test-compose-ui.html 第⑦段抓出来的。） */
      pendingStructure: function () {
        return (this.verdict && this.verdict.detail && this.verdict.detail.structure) || null;
      },
      canTidy: function () {
        return this.pendingStructure !== null;
      },
      structureText: function () {
        if (this.items.some(function (it) { return (it.a || 0) !== 0; })) return '自由布局';
        var rec = global.Compose.recognize(this.items, this.areaBounds);
        if (rec.code === 'OK') return rec.structure;
        if (rec.code === 'NOT_CONFIDENT') return rec.structure + '（拿不准）';
        return '还没摆成形';
      },
      verdictClass: function () {
        if (!this.verdict) return 'is-idle';
        return 'is-' + this.verdict.kind;
      },
      noneText: function () {
        var c = this.verdict && this.verdict.code;
        return {
          TOO_FEW: '再放一个构件，两个字才能构形',
          OVERLAP: '构件叠在一起了，先把它们分开',
          OUTSIDE: '有构件拖到框外了',
          NO_STRUCTURE: '看不出稳定的方位 —— 试试并排，或者上下叠',
          NOT_CONFIDENT: '有点斜，说不准是左右还是上下'
        }[c] || '还没摆成形';
      },
      nearText: function () {
        var n = this.verdict.near;
        if (n.reason === 'structure') {
          return '差一点就是「' + n.char + '」—— 不过 ' + n.char +
                 ' 是' + n.want + '结构，你摆成了' + n.got;
        }
        return '构件对了，位置反了 ——「' + n.char + '」是 ' +
               n.want.join('') + '，你摆的是 ' + n.got.join('');
      }
    },

    methods: {
      /* 仅整理已有构件，不添加字形、不识字；一次历史记录，可完整撤销。 */
      arrange: function (kind) {
        if (!['row', 'column', 'orbit'].includes(kind) || this.items.length < 2) return;
        stopTweens(this); this.drag = null; this.dragId = null;
        var a = this.areaBounds, n = this.items.length;
        this.items.forEach(function (it, i) {
          var rect;
          if (kind === 'row') {
            var cols = n > 4 ? Math.ceil(n / 2) : n, rows = Math.ceil(n / cols);
            rect = { cx:a.x + a.w * (i % cols + .5) / cols, cy:a.y + a.h * (1 - (Math.floor(i / cols) + .5) / rows), w:a.w * .86 / cols, h:a.h * .8 / rows };
          } else if (kind === 'column') {
            var rows = n > 4 ? Math.ceil(n / 2) : n, cols = Math.ceil(n / rows);
            rect = { cx:a.x + a.w * (Math.floor(i / rows) + .5) / cols, cy:a.y + a.h * (1 - (i % rows + .5) / rows), w:a.w * .8 / cols, h:a.h * .86 / rows };
          }
          else {
            var angle = Math.PI / 2 - i * Math.PI * 2 / n, side = n <= 3 ? .34 : n <= 6 ? .26 : .19;
            rect = { cx:a.x + a.w * (.5 + .3 * Math.cos(angle)), cy:a.y + a.h * (.5 + .3 * Math.sin(angle)), w:a.w * side, h:a.h * side };
          }
          var fit = global.Compose.fitInto(it, rect);
          it.dx = fit.dx; it.dy = fit.dy; it.s = fit.s; it.a = 0; it.moved = true;
        });
        this.commit();
      },
      remember: function () {
        var snapshot = this.items.map(function (it) { return Object.assign({}, it); });
        var sig = function (items) { return JSON.stringify(items.map(function (it) { return [it.glyph, it.dx, it.dy, it.s, it.a || 0]; })); };
        if (sig(snapshot) === sig(this.history[this.historyIndex])) return;
        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(snapshot);
        if (this.history.length > 50) this.history.shift();
        this.historyIndex = this.history.length - 1;
      },
      restoreHistory: function (index) {
        stopTweens(this); this.drag = null; this.dragId = null;
        this.historyIndex = index;
        this.items = this.history[index].map(function (it) { return Object.assign({}, it); });
        if (!this.items.some(function (it) { return it.id === this.selectedId; }, this)) this.selectedId = this.items.length ? this.items[0].id : '';
        this.commit(false);
      },
      undo: function () { if (this.canUndo) this.restoreHistory(this.historyIndex - 1); },
      redo: function () { if (this.canRedo) this.restoreHistory(this.historyIndex + 1); },
      editAngle: function (value, record) {
        if (!this.selected) return;
        stopTweens(this); this.selected.a = Math.max(-180, Math.min(180, Number(value) || 0));
        this.selected.moved = true; this.commit(record);
      },
      xform: function (it) {
        return 'translate(' + it.dx.toFixed(2) + ',' + it.dy.toFixed(2) +
               ') scale(' + it.s.toFixed(4) + ') rotate(' + (it.a || 0) + ',' + it.bbox.cx + ',' + it.bbox.cy + ')';
      },
      editScale: function (value, record) {
        var it = this.selected; if (!it) return;
        stopTweens(this);
        var cx = it.dx + it.bbox.cx * it.s, cy = it.dy + it.bbox.cy * it.s;
        it.s = Math.max(.15, Math.min(1.5, Number(value) || .15));
        it.dx = cx - it.bbox.cx * it.s; it.dy = cy - it.bbox.cy * it.s;
        it.moved = true; this.commit(record);
      },
      moveSelected: function (x, y) {
        if (!this.selected) return;
        stopTweens(this);
        this.selected.dx += x; this.selected.dy += y; this.selected.moved = true; this.commit();
      },
      removeSelected: function () {
        stopTweens(this);
        this.items = this.items.filter(function (it) { return it.id !== this.selectedId; }, this);
        this.selectedId = this.items.length ? this.items[this.items.length - 1].id : '';
        this.commit();
      },

      /** 客户端坐标 → 字形坐标。
       *
       *  ⚠️ decompose.js 的 clientToViewBox 是「按元素矩形等比换算」。它现在是对的，
       *     但正确性依赖一个没写下来的前提：.zc-canvas-wrap 是 aspect-ratio:1/1
       *     且四边等距 padding，所以内容框（= SVG 元素）恰好是正方形。
       *     一旦哪天布局改成宽扁的，SVG 会在方 viewBox 里被 meet 居中留黑边，
       *     那套等比换算就会把指针位置算偏，而且**不报错**，只是拖起来手感发飘。
       *     这里改用 getScreenCTM 求逆：直接给出 viewBox 用户坐标，不含任何前提。
       *
       *  再取 Positioner 变换的逆：
       *    transform = translate(xOffset, size - yOffset) scale(scale, -scale) */
      clientToGlyph: function (clientX, clientY) {
        var svg = this.$refs.svg;
        var vx, vy;

        if (svg.getScreenCTM && svg.createSVGPoint) {
          var pt = svg.createSVGPoint();
          pt.x = clientX; pt.y = clientY;
          var u = pt.matrixTransform(svg.getScreenCTM().inverse());
          vx = u.x; vy = u.y;
        } else {
          var r = svg.getBoundingClientRect();
          var vb = svg.viewBox.baseVal;
          vx = (clientX - r.left) / r.width * vb.width;
          vy = (clientY - r.top) / r.height * vb.height;
        }

        var p = this.pos;
        return {
          x: (vx - p.xOffset) / p.scale,
          y: ((SIZE - p.yOffset) - vy) / p.scale
        };
      },

      mk: function (glyph, moved) {
        var t = global.Compose.tile(glyph);
        if (!t) return null;
        return {
          id: glyph + '#' + (++this.seq),
          glyph: glyph, d: t.d, bbox: t.bbox,
          dx: 0, dy: 0, s: 1, a: 0,
          moved: moved          // 用户动过的构件，重排时不再跟着走
        };
      },

      add: function (glyph) {
        if (this.unlocked && !this.unlocked.includes(glyph)) return;
        if (this.items.length >= 8) return;
        stopTweens(this);
        var it = this.mk(glyph, false);
        if (!it) return;
        this.items.push(it);
        this.selectedId = it.id;
        this.relayout();
        this.commit();
      },

      /** 学习区批量带入：保留旧构件，一组只增加一次可撤销操作。 */
      appendGlyphs: function (glyphs) {
        var allowed=global.Compose.palette().map(function(p) { return p.glyph; });
        if(!this.editable || !Array.isArray(glyphs) || !glyphs.length || this.items.length+glyphs.length>8 || !glyphs.every(function(g) { return allowed.includes(g) && (!this.unlocked || this.unlocked.includes(g)); },this)) return false;
        stopTweens(this); this.remember();
        var additions=glyphs.map(function(g) { return this.mk(g,false); },this);
        this.items.forEach(function(item) { item.moved=true; });
        this.items.push.apply(this.items,additions); this.relayout();
        this.selectedId=additions[0].id; this.commit();
        return true;
      },

      /** 把还没被用户动过的构件重排一行。连点两下就得到左右结构。 */
      relayout: function () {
        var loose = this.items.filter(function (it) { return !it.moved; });
        if (!loose.length) return;
        var rects = autoRects(loose.length, this.areaBounds);
        loose.forEach(function (it, i) {
          var f = global.Compose.fitInto(it, rects[Math.min(i, rects.length - 1)]);
          it.dx = f.dx; it.dy = f.dy; it.s = f.s;
        });
      },

      keyTidy: function () { if (this.active !== false && this.canTidy) this.tidy(this.pendingStructure); },
      keyClear: function () { if (this.active !== false && this.items.length) this.clear(); },
      keyMove: function (x, y, event) {
        if (this.active === false || !this.editable || !this.selected) return;
        var step = event && event.shiftKey ? 30 : 10;
        this.moveSelected(x * step, y * step);
      },

      clear: function () {
        // 先停补间：否则「就按…摆」还没走完就点清空，那段动画会继续往
        // 已经不在 items 里的对象上写值，末尾还会补一次 commit()。
        stopTweens(this);
        this.items = [];
        this.verdict = null;
        this.drag = null;
        this.dragId = null;
        this.selectedId = '';
        this.commit();
      },

      onDown: function (e, it) {
        if (e.button) return;                 // 只响应左键
        e.preventDefault();
        stopTweens(this);
        this.selectedId = it.id;
        var g = this.clientToGlyph(e.clientX, e.clientY);
        this.drag = { it: it, gx: g.x, gy: g.y, dx0: it.dx, dy0: it.dy };
        this.dragId = it.id;
        // 捕获后 pointerup 一定会回到 svg，拖到画布外面松手也不会丢。
        // 包 try 是因为合成的 PointerEvent（无头测试、部分自动化工具）没有真实
        // pointerId，setPointerCapture 会抛 NotFoundError。拖拽本身不受影响。
        try {
          if (this.$refs.svg.setPointerCapture) {
            this.$refs.svg.setPointerCapture(e.pointerId);
          }
        } catch (err) { /* 合成事件没有可捕获的指针 */ }
      },

      onMove: function (e) {
        var d = this.drag;
        if (!d) return;
        var g = this.clientToGlyph(e.clientX, e.clientY);
        d.it.dx = d.dx0 + (g.x - d.gx);
        d.it.dy = d.dy0 + (g.y - d.gy);
      },

      onUp: function () {
        if (!this.drag) return;
        this.drag.it.moved = true;
        this.drag = null;
        this.dragId = null;
        this.commit();                        // 松手才判定，拖动过程中不打扰
      },

      commit: function (record) {
        if (this.editable && record !== false) this.remember();
        this.verdict = this.items.length
          ? global.Compose.evaluate(this.items, this.areaBounds)
          : null;
        if (this.items.some(function (it) { return (it.a || 0) !== 0; })) this.verdict = null;
        this.$emit('change', this.items.map(function (it) {
          return { id: it.id, glyph: it.glyph, d: it.d, bbox: it.bbox, dx: it.dx, dy: it.dy, s: it.s, a: it.a || 0 };
        }));
      },

      /** 「就按左右摆」—— 把构件整形成某个结构 */
      tidy: function (structure) {
        var targets = global.Compose.tidyTargets(this.items, structure, this.areaBounds);
        if (!targets) return;

        // 连点两下时，第二下要从**当前**位置重新起算，不能和上一段叠着跑 ——
        // tidyTargets 是按构件当前位置分配槽位的，两段并行的话目标会互相打架，
        // 而且两段各自都会调 commit()。停掉旧的那段，只让新的收尾。
        stopTweens(this);

        var self = this;
        var pending = 0;
        this.items.forEach(function (it, i) {
          var t = targets[i];
          if (!t) return;
          it.moved = true;
          var from = { dx: it.dx, dy: it.dy, s: it.s };
          pending++;
          startTween(self, 500, function (k) {
            it.dx = from.dx + (t.dx - from.dx) * k;
            it.dy = from.dy + (t.dy - from.dy) * k;
            it.s  = from.s  + (t.s  - from.s)  * k;
          }, function () {
            if (--pending === 0) self.commit();     // 全部到位才判定，中途不打扰
          });
        });
        if (!pending) this.commit();
      },

      /** 给外部（深链、测试）预置一组构件
       *
       *  ⚠️ 这里**不能**图省事用 tidyTargets 分配槽位。
       *     tidyTargets 是「按构件当前位置决定谁去哪个槽」—— 那是给动画用的，
       *     目的是让构件摆正时不互相穿越。而预置时所有构件都在原点，
       *     谁排第一就取决于排序的稳定性，是个不确定的结果。
       *     预置没有动画，直接按**参数顺序**落槽，语义清楚。
       *     （「就按左右摆」那个按钮仍然走 tidyTargets，两条路各自被覆盖。） */
      preset: function (glyphs, structure) {
        var self = this;
        this.verdict = null;
        this.items = glyphs.map(function (g) { return self.mk(g, true); })
                           .filter(Boolean);
        var sl = structure ? global.Compose.slots(structure, this.areaBounds) : null;
        if (sl) {
          this.items.forEach(function (it, i) {
            var f = global.Compose.fitInto(it, sl[Math.min(i, sl.length - 1)]);
            it.dx = f.dx; it.dy = f.dy; it.s = f.s;
          });
        } else {
          this.items.forEach(function (it) { it.moved = false; });
          this.relayout();
        }
        this.commit();
      }
    },

    mounted: function () {
      // 空格 = 「就按…摆」（模板里那个 is-primary 按钮），R = 清空。
      // 两个都照着按钮的 :disabled / v-if 条件防了一遍 —— 键盘不受 disabled 管。
      this.unbind = global.ZQ.bindKeys({
        space: 'keyTidy',
        r: 'keyClear',
        left: function (event) { this.keyMove(-1, 0, event); },
        right: function (event) { this.keyMove(1, 0, event); },
        up: function (event) { this.keyMove(0, 1, event); },
        down: function (event) { this.keyMove(0, -1, event); }
      }, this);
    },

    /* 补间是这一层唯一自己持有的 rAF —— 切走模式时必须真的停掉。
     * 只清数组不 cancel 等于泄漏：那条回调还在自我续命，下一帧继续往
     * 已经卸载的 items 上写。 */
    beforeUnmount: function () {
      if (this.unbind) this.unbind();
      stopTweens(this);
    }
  };

  /** 供测试/深链使用：挂一个组件实例到页面上 */
  ZQ.mountCompose = function (el, opts) {
    return global.Vue.createApp(ZQ.ComposeCanvas, opts || {}).mount(el);
  };
})(window);
