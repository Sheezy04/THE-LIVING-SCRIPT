/* 字启千年 — 01 字源探索 · 书写（Vue 组件）
 *
 * 从 src/app.js 的 write 模式原样搬过来。搬的是**接线**，不是引擎：
 * StrokeRenderer（src/stroke-anim.js）一行没改，它照旧自己管 SVG 里的每一条笔画，
 * Vue 只管外面这圈按钮、滑块和笔画列表。
 *
 * ⚠️ 换字靠**整个组件重建**（外壳给 :key），不是在同一张 <svg> 上再 create 一次。
 *    StrokeRenderer.create() 会把 svg 里的节点全部重建，但只要旧实例还活着，
 *    它的 rAF 循环就还在往旧节点上写 —— 两张字会叠在一起动。
 *    :key 一变，Vue 销毁旧组件（beforeUnmount 里 stop() 掉 rAF）、建新组件，
 *    svg 是**新的元素**，旧的一整套跟着被回收。
 *
 * ⚠️ progress / active 放在 data 里，每帧都会触发一次重渲染 —— 这是**故意的**。
 *    实测这个模板一次 patch 大约十几个节点，60fps 下可以忽略；
 *    换成「直接改 DOM、绕过响应式」（app.js 时代的 syncWrite 就是那么写的），
 *    代价是多出一份和 data 平行的真相，改到后来两边对不上。
 *    app.js 当年手写 DOM 是因为它没有框架可依，不是因为那样更快。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SIZE = 520;              // 与 .zc-canvas-wrap 的显示尺寸对齐
  var PAD = 40;
  var AUTOPLAY_DELAY = 260;    // 进场后停顿一下再起笔，别一进来就动

  /** 按总笔画长度定速：笔画多的字给更多时间，各字观感更一致。
   *  和 app.js 完全一致 —— 这里换个系数，两个字的手感就对不上了。 */
  function durationFor(r) {
    var base = 600 + r.totalLength * 0.6;
    return Math.max(1100, Math.min(3000, base));
  }

  ZQ.ModeWrite = {
    name: 'ModeWrite',

    props: { char: { type: String, required: true }, toolsVisible:{type:Boolean,default:true}, showPicker:{type:Boolean,default:true} },
    emits: ['pick'],

    template: [
      '<div class="zc-stage">',
      '  <div class="zc-canvas-wrap">',
      '    <svg ref="svg" class="zc-canvas" aria-label="汉字书写"></svg>',
      '  </div>',
      '',
      '  <aside v-show="toolsVisible" class="zc-writing-tools">',
      '    <div class="zc-seg"><button :class="{ \'is-active\': toolPanel === \'play\' }" @click="toolPanel = \'play\'">播放与进度</button><button :class="{ \'is-active\': toolPanel === \'strokes\' }" @click="toolPanel = \'strokes\'">笔画列表</button></div>',
      '    <div v-show="toolPanel === \'strokes\'" class="zc-panel">',
      '      <details open class="zc-stroke-details"><summary>笔画列表 · {{ strokes.length }} 笔 <span v-if="active >= 0"> / 当前第 {{ active + 1 }} 笔</span></summary>',
      '      <div class="zc-strokelist">',
      '        <div v-for="s in visibleStrokes" :key="s.i" class="zc-strokeitem"',
      '             :class="{ \'is-radical\': s.isRad, \'is-active\': s.i === active }"',
      '             @mouseenter="hover(s.i)" @mouseleave="unhover"',
      '             @click="jumpTo(s.i)">',
      '          <span class="dot"></span><span>第 {{ s.i + 1 }} 笔</span>',
      '          <span v-if="s.isRad" class="tag">部首</span>',
      '        </div>',
      '      </div>',
      '      </details>',
      '      <div class="zc-page-controls" v-if="strokePages > 1"><button class="zc-btn" :disabled="strokePage === 0" @click="strokePage--">上一页</button><span>{{ strokePage + 1 }} / {{ strokePages }}</span><button class="zc-btn" :disabled="strokePage >= strokePages - 1" @click="strokePage++">下一页</button></div>',
      '    </div>',
      '',
      '    <div v-show="toolPanel === \'play\'" class="zc-panel">',
      '      <div class="zc-panel-title">书写</div>',
      '      <div class="zc-controls">',
      '        <button class="zc-btn is-primary" @click="toggle">{{ playing ? \'暂停\' : \'书写\' }}</button>',
      '        <button class="zc-btn" @click="reset">重来</button>',
      '        <button class="zc-btn" :class="{ \'is-primary\': radOnly }"',
      '                @click="toggleRad">只看部首</button>',
      '      </div>',
      // 值绑在 progress 上，拖动本身走 @input —— 拖动时 setProgress 会先 stop()，
      // 所以动画和拖动不会同时去写这个滑块
      '      <input class="zc-timeline" type="range" min="0" max="1000"',
      '             :value="Math.round(progress * 1000)" @input="onSlide"',
      '             aria-label="书写进度">',
      '    </div>',
      '',
      '    <char-picker v-if="showPicker" :model-value="char"',
      '                 @update:model-value="$emit(\'pick\', $event)" />',
      '  </aside>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        progress: 0,     // 从空白开始，不在自动播放前闪现完整字形
        playing: false,
        radOnly: false,
        active: -1,      // 正在写的那一笔（0<进度<1）；-1 = 没有
        toolPanel:'play', strokePage:0,
        strokes: []      // [{ i, isRad }]，建好就不再变
      };
    },

    computed: {
      visibleStrokes: function () { return this.strokes.slice(this.strokePage * 6, this.strokePage * 6 + 6); },
      strokePages: function () { return Math.ceil(this.strokes.length / 6); }
    },
    mounted: function () {
      this.build();
      this.unbind = global.ZQ.bindKeys({ space: 'toggle', r: 'reset' }, this);
    },

    beforeUnmount: function () {
      if (this.unbind) this.unbind();
      this.stop();
      if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
    },

    methods: {
      /** 建引擎。只在 mounted 里调 —— 换字一律走 :key 重建，不在这里重入。 */
      build: function () {
        var self = this;
        var d = global.__CHARS__[this.char];
        var svg = this.$refs.svg;
        while (svg.firstChild) svg.removeChild(svg.firstChild);

        // eng / raf / timer 都挂在实例上、**不放进 data**：
        // 它们不需要是响应式的，放进去反而每帧都在给自己做依赖追踪
        this.eng = global.StrokeRenderer.create(svg, d, {
          width: SIZE, height: SIZE, padding: PAD, ghost: false
        });
        this.eng.setProgress(0);
        this.progress = 0;
        this.active = -1;

        var rad = this.eng.radStrokes;
        var list = [];
        for (var i = 0; i < this.eng.strokeCount; i++) {
          list.push({ i: i, isRad: rad.indexOf(i) >= 0 });
        }
        this.strokes = list;

        this.timer = setTimeout(function () { self.timer = 0; self.play(); }, AUTOPLAY_DELAY);
      },

      /** 只写进度，不打断播放 —— rAF 循环每帧调它 */
      setProgressRaw: function (p) {
        p = Math.max(0, Math.min(1, p));
        this.progress = p;
        if (!this.eng) return;
        var cur = this.eng.setProgress(p);
        // app.js syncWrite 的原逻辑：正在被写的那一笔高亮，其余都不亮。
        // 找**第一个**写了一半的 —— 同一时刻至多有一笔处于这个状态
        var a = -1;
        for (var i = 0; i < cur.length; i++) {
          if (cur[i] > 0 && cur[i] < 1) { a = i; break; }
        }
        this.active = a;
        if (a >= 0 && this.playing) this.strokePage = Math.floor(a / 6);
      },

      play: function () {
        if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
        var self = this;
        if (!this.eng || this.playing) return;
        if (this.progress >= 1) this.setProgressRaw(0);   // 写完了再点就是从零重写

        this.playing = true;
        var from = this.progress;
        var dur = durationFor(this.eng) * (1 - from);
        var t0 = performance.now();

        function tick(now) {
          if (!self.playing) return;      // 被打断（暂停/拖动/换字）就直接退出
          var t = Math.min(1, (now - t0) / dur);
          var e = -(Math.cos(Math.PI * t) - 1) / 2;   // 起笔慢、行笔快、收笔慢
          self.setProgressRaw(from + (1 - from) * e);
          if (t < 1) self.raf = requestAnimationFrame(tick);
          else { self.playing = false; self.setProgressRaw(1); }
        }
        this.raf = requestAnimationFrame(tick);
      },

      stop: function () {
        if (this.timer) { clearTimeout(this.timer); this.timer = 0; }
        this.playing = false;
        if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      },

      /** 用户主动定位（滑块 / 重来）—— 先停播，否则动画会把值拽回去 */
      setProgress: function (p) {
        this.stop();
        this.setProgressRaw(p);
      },

      toggle: function () {
        if (this.playing) this.stop(); else this.play();
      },

      reset: function () { this.setProgress(0); },

      onSlide: function (e) { this.setProgress(Number(e.target.value) / 1000); },

      toggleRad: function () {
        this.stop();
        this.radOnly = !this.radOnly;
        if (this.eng) this.eng.isolateRadical(this.radOnly);
      },

      hover: function (i) { if (this.eng) this.eng.highlightStroke(i); },
      unhover: function () { if (this.eng) this.eng.clearHighlight(); },

      /** 点第 i 笔 → 直接跳到「刚写完这一笔」的位置 */
      jumpTo: function (i) {
        if (!this.eng) return;
        var lens = this.eng.strokeLengths, total = this.eng.totalLength, acc = 0;
        for (var j = 0; j <= i; j++) acc += lens[j];
        this.setProgress(total > 0 ? acc / total : 1);
      }
    }
  };
})(window);
