/* 字启千年 — 构形实验室 ① 认识构形（Vue 组件）
 *
 * 这一层只做「接线」：引擎（src/decompose.js）仍然自己管 SVG 里的每一个节点，
 * Vue 只管外面这圈按钮、面板和文案。两边互不插手 —— 这是零构建迁移能一步步走
 * 的前提，把引擎重写成 Vue 组件才是真正会出事的那种改动。
 *
 * ⚠️ 换字靠**整个组件重建**（外壳给 :key），不是在同一张 <svg> 上再 create 一次。
 *    Decompose.create() 会往 svg 上挂 pointerdown / pointermove / pointerup。
 *    同一个元素上 create 两次 → 两套监听器同时响应 → 拖一下构件动两倍，
 *    而且第二个引擎的 parts 数组和第一个的指向不同，选中态也会错乱。
 *    :key 一变，Vue 销毁旧组件、建新组件，svg 是**新的元素**，
 *    旧监听器跟着旧元素一起被回收 —— 不需要手写 off()。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SIZE = 520;      // 与 .zc-canvas-wrap 的显示尺寸对齐
  var PAD = 40;

  ZQ.ModeDecompose = {
    name: 'ModeDecompose',

    props: { char: { type: String, required: true } },
    emits: ['pick'],

    template: [
      '<div class="zc-stage">',
      '  <div class="zc-lab-exhibit">',
      '  <div class="zc-canvas-wrap">',
      '    <svg ref="svg" class="zc-canvas" aria-label="汉字构件"></svg>',
      '    <p v-if="err" class="zc-compose-empty">引擎出错：{{ err }}</p>',
      '  </div>',
      '    <slot name="canvas-footer"></slot>',
      '  </div>',
      '',
      '  <aside>',
      '    <div class="zc-seg zc-side-tabs"><button :class="{ \'is-active\': panel === \'structure\' }" @click="panel = \'structure\'">构形操作</button><button :class="{ \'is-active\': panel === \'pick\' }" @click="panel = \'pick\'">选择汉字</button></div>',
      '    <div v-show="panel === \'structure\'">',
      '    <div class="zc-panel">',
      '      <div class="zc-panel-title">构件</div>',
      '      <div class="zc-strokelist">',
      '        <div v-for="(p, i) in parts" :key="i" class="zc-strokeitem is-radical"',
      '             @mouseenter="glow(i, true)" @mouseleave="glow(i, false)"',
      '             @click="select(i)">',
      '          <span class="dot"></span>',
      '          <span>{{ p.glyph }}　{{ p.meaning || p.note }}</span>',
      '          <span class="tag">{{ p.pos }}</span>',
      '        </div>',
      '        <div v-if="!parts.length" class="zc-strokeitem">',
      '          <span class="dot"></span><span>象形 · 不可拆解</span></div>',
      '      </div>',
      '    </div>',
      '',
      '    <div class="zc-compinfo" :class="{ \'is-empty\': !selected }">',
      '      <template v-if="selected">',
      '        <span class="glyph">{{ selected.glyph }}</span>',
      '        <span class="name">{{ selected.name }}</span>',
      '        <span class="meaning">{{ selected.meaning || selected.note }}</span>',
      '        <span class="role">{{ selected.pos }}</span>',
      '      </template>',
      '      <span v-else class="meaning">{{ emptyHint }}</span>',
      '    </div>',
      '',
      '    <p v-if="relation" class="zc-relation">字理：{{ relation }}</p>',
      '',
      '    <div class="zc-controls">',
      '      <button class="zc-btn" :disabled="empty" @click="doExplode">分离</button>',
      '      <button class="zc-btn" :disabled="empty" @click="doCollapse">合拢</button>',
      '      <button class="zc-btn" :disabled="empty" @click="doReset">复位</button>',
      '    </div>',
      '',
      '    </div>',
      '    <char-picker v-show="panel === \'pick\'" :model-value="char"',
      '                 @update:model-value="$emit(\'pick\', $event)" />',
      '  </aside>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        relation: '',
        parts: [],
        empty: true,
        selected: null,
        selIdx: -1,      // 选中构件在 parts 里的下标；-1 = 没选。← → 靠它找邻居
        err: '',
        panel:'structure'
      };
    },

    computed: {
      emptyHint: function () {
        return this.empty
          ? '此字为象形字，整体即是一幅图形，没有可分离的构件。'
          : '点击构件查看说明，或直接拖动它';
      }
    },

    mounted: function () {
      var self = this;
      try {
        // 引擎挂在组件实例上（不在 data 里）—— 它不需要是响应式的，
        // 让它变成响应式代理只会给内部的 raf / DOM 引用套一层没用的 Proxy
        this.eng = global.Decompose.create(this.$refs.svg,
          { width: SIZE, height: SIZE, padding: PAD });

        var d = this.eng.load(this.char, global.__CHARS__[this.char]);
        this.parts = (d && d.parts) || [];
        this.relation = (d && d.relation) || '';
        this.empty = this.parts.length === 0;

        // 引擎回调给的是 (data, index) 两个参数。selected 用来显示信息面板，
        // selIdx 用来让 ← → 知道当前在哪一格 —— 少存一个就得 indexOf，
        // 而 indexOf 依赖 parts 里放的是同一个对象，不如直接把下标记下来。
        this.eng.onSelect(function (p, i) {
          self.selected = p || null;
          self.selIdx = typeof i === 'number' ? i : -1;
        });

        this.unbind = global.ZQ.bindKeys({
          space: 'keyExplode',
          left: 'stepPrev',
          right: 'stepNext',
          r: 'keyReset'
        }, this);
      } catch (e) {
        this.err = e.message;
      }
    },

    beforeUnmount: function () {
      // 监听器挂在 window 上，不跟着 svg 一起回收，必须手动解。
      // 这个组件本来没有 beforeUnmount —— 引擎的 pointer 监听器是绑在 svg 元素上的，
      // 元素没了就跟着没了，所以一直没需要。window 上的这个不一样。
      if (this.unbind) this.unbind();
    },

    methods: {
      /* ── 键盘用的三个壳子 ───────────────────────────
       * 按钮上的 :disabled="empty" 在键盘这边没有等价物（按空格不受 disabled 管），
       * 所以判断要在这里自己补一遍。象形字（日、火…）parts 是空的，
       * 不拦的话会去 explode 一个空的数组。 */
      keyExplode: function () { if (!this.empty) this.doExplode(); },
      keyReset:   function () { if (!this.empty) this.doReset(); },

      /** ← → 在构件之间走。到两头**绕回去**，比停住好 —— 演示时不用记有几个构件。 */
      step: function (d) {
        var n = this.parts.length;
        if (this.empty || n === 0) return;
        var i = (this.selIdx < 0 ? (d > 0 ? -1 : 0) : this.selIdx) + d;
        this.select(((i % n) + n) % n);
      },
      stepPrev: function () { this.step(-1); },
      stepNext: function () { this.step(1); },

      glow: function (i, on) {
        var parts = this.eng && this.eng.parts();
        if (!parts || !parts[i]) return;
        // 与 app.js 里 highlightPart 一致 —— 只是高亮，不改数据
        parts[i].el.style.filter =
          on ? 'drop-shadow(0 0 10px rgba(212,175,106,0.6))' : '';
      },
      select:  function (i) { if (this.eng) this.eng.select(i); },
      doExplode:  function () { if (this.eng) this.eng.explode(); },
      doCollapse: function () { if (this.eng) this.eng.collapse(); },
      doReset:    function () { if (this.eng) this.eng.reset(); }
    }
  };
})(window);
