/* 字启千年 — 构形实验室 ② 构形挑战（Vue 组件）
 *
 * 与 ① 同构：引擎（src/challenge.js）自己管 SVG，Vue 管外面这圈。
 * 换字同样靠外壳给 :key 重建整个组件（原因见 mode-decompose.js 顶部注释）。
 *
 * 拼对之后的奖励动画：在**同一张 svg** 上换成 StrokeRenderer 把整字写一遍。
 * 这是安全的 —— StrokeRenderer 会清空 svg 的子节点，但 svg 元素本身没换，
 * Challenge/Decompose 的监听器还挂在上面，所以「重开」直接 restart() 就行，
 * 不用把引擎拆掉重建（app.js 里那条注释说的就是这件事）。
 *
 * ⚠️ 但要**记住这个定时器**：奖励动画延迟 420ms 才起播，玩家完全可能在这
 *    420ms 内就点了「重开」，那时 svg 已被重建，再播就是在操作一堆脱离文档的
 *    元素。app.js 里踩过这个坑，这里 beforeUnmount / restart 都要先取消。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SIZE = 520;
  var PAD = 40;
  var REWARD_DELAY = 420;
  var TICK_MS = 100;      // 计时的刷新频率（只影响看着的数字，不影响判定）

  /** 整字写完要多久 —— 与 app.js 的 durationFor 保持一致 */
  function durationFor(r) {
    return Math.max(1100, Math.min(3000, 600 + r.totalLength * 0.6));
  }

  ZQ.ModeChallenge = {
    name: 'ModeChallenge',

    props: { char: { type: String, required: true }, embedded: { type: Boolean, default: false } },
    emits: ['pick', 'solved', 'hint'],

    template: [
      '<div class="zc-stage">',
      '  <div class="zc-lab-exhibit">',
      '  <div class="zc-canvas-wrap">',
      '    <svg ref="svg" class="zc-canvas" aria-label="拼合构件"></svg>',
      '    <p v-if="err" class="zc-compose-empty">引擎出错：{{ err }}</p>',
      '  </div>',
      '    <slot name="canvas-footer"></slot>',
      '  </div>',
      '',
      // 同 mode-decompose：标题与页签落在 aside 外面，窄屏才拎得回画布前面。
      '  <div class="zc-lab-side">',
      '    <slot name="side-head"></slot>',
      '    <aside>',
      '      <div v-if="!embedded" class="zc-seg zc-side-tabs"><button :class="{ \'is-active\': panel === \'game\' }" @click="panel = \'game\'">拼字操作</button><button :class="{ \'is-active\': panel === \'pick\' }" @click="panel = \'pick\'">选择汉字</button></div>',
      '      <div v-show="panel === \'game\'">',
      '      <div v-if="!playable" class="zc-compinfo">',
      '        <span class="meaning">此字为象形字，整体即是一幅图形，没有可拼合的构件。</span>',
      '      </div>',
      '  ',
      '      <template v-else-if="!solved">',
      '        <div class="zc-chalstat">',
      '          <span class="zc-panel-title">已归位</span>',
      '          <b>{{ placed }} / {{ total }}</b>',
      '        </div>',
      '        <div class="zc-chalstat">',
      '          <span class="zc-panel-title">用时</span>',
      '          <b>{{ (elapsed / 1000).toFixed(1) }} 秒</b>',
      '        </div>',
      '  ',
      '        <div class="zc-panel">',
      '          <div class="zc-panel-title">已归位</div>',
      '          <div class="zc-strokelist">',
      '            <div v-for="(p, i) in placedParts" :key="i" class="zc-strokeitem is-radical"',
      '                 @mouseenter="glow(p.index, true)" @mouseleave="glow(p.index, false)">',
      '              <span class="dot"></span>',
      '              <span>{{ p.glyph }}　{{ p.meaning || p.note }}</span>',
      '              <span class="tag">{{ p.pos }}</span>',
      '            </div>',
      '            <div v-if="!placedParts.length" class="zc-strokeitem">',
      '              <span class="dot"></span><span>把构件拖回它该在的位置</span></div>',
      '          </div>',
      '        </div>',
      '  ',
      '        <div class="zc-controls">',
      '          <button class="zc-btn" @click="doRestart">重开</button>',
      '          <button class="zc-btn" :class="{ \'is-primary\': hintOn }"',
      '                  @click="doHint">{{ hintOn ? \'隐藏底纹\' : \'提示\' }}</button>',
      '        </div>',
      '      </template>',
      '  ',
      '      <div v-if="solved" class="zc-solved">',
      '        <div class="zc-solved-badge">拼合成功</div>',
      '        <p class="zc-solved-relation">{{ relationText }}</p>',
      '        <p class="zc-solved-stats">{{ solvedText }}</p>',
      '        <p v-if="unlockNotice" class="zc-note">{{ unlockNotice }}</p>',
      '        <button class="zc-btn is-primary" @click="doRestart">再来一次</button>',
      '      </div>',
      '  ',
      '      </div>',
      '      <char-picker v-if="!embedded" v-show="panel === \'pick\'" :model-value="char"',
      '                   @update:model-value="$emit(\'pick\', $event)" />',
      '    </aside>',
      '  </div>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        playable: true,
        placed: 0,
        total: 0,
        elapsed: 0,
        hintOn: false,
        panel:'game',
        solved: null,
        err: '',
        unlockNotice: ''
      };
    },

    computed: {
      /** 侧栏只列**已经归位**的构件 —— 开局就把「日 左 / 月 右」摆出来等于报答案 */
      placedParts: function () {
        var placed = this.placed; // 读取响应式进度，归位后重新计算非响应式引擎的列表。
        var eng = this.eng;
        if (!eng || !placed) return [];
        return eng.view().parts()
          .filter(function (p) { return eng.isPlaced(p.index); })
          .map(function (p) { return Object.assign({},p.data,{index:p.index}); });
      },
      relationText: function () {
        var spec = global.Components.DECOMPOSITION[this.char];
        return spec ? '字理：' + spec.relation : '';
      },
      solvedText: function () {
        var s = this.solved;
        if (!s) return '';
        return '用时 ' + (s.elapsed / 1000).toFixed(1) + ' 秒' +
               '　拖动 ' + s.moves + ' 次' +
               '　提示 ' + s.hints + ' 次' +
               (s.shuffled ? '　（构件已互换位置）' : '');
      }
    },

    mounted: function () {
      this.start();
      // 空格 = 提示（演示时给台下看底纹）。这里**没有**「分离」那种主操作，
      // 挑战的本体就是拖，所以空格给提示，不硬凑一个动作。
      this.unbind = global.ZQ.bindKeys({ space: 'doHint', r: 'doRestart' }, this);
    },

    beforeUnmount: function () {
      if (this.unbind) this.unbind();
      this.stopTimer();
      this.cancelReward();
      if (this.eng) { this.eng.view().reset(); this.eng = null; }
    },

    methods: {
      start: function () {
        var self = this;
        try {
          this.eng = global.Challenge.create(this.$refs.svg,
            { width: SIZE, height: SIZE, padding: PAD });

          var d = this.eng.start(this.char, global.__CHARS__[this.char]);
          this.playable = !!(d && d.parts.length);
          this.solved = null;
          this.hintOn = false;

          this.eng.onProgress(function (s) { self.placed = s.placed; self.total = s.total; });
          this.eng.onSolve(function (s) { self.onSolved(s); });

          if (this.playable) {
            var s0 = this.eng.stats();
            this.placed = s0.placed; this.total = s0.total; this.elapsed = 0;
            this.startTimer();
          }
        } catch (e) {
          this.err = e.message;
        }
      },

      startTimer: function () {
        var self = this;
        this.stopTimer();
        this.timer = setInterval(function () {
          if (self.eng) self.elapsed = self.eng.stats().elapsed;
        }, TICK_MS);
      },

      stopTimer: function () {
        if (this.timer) clearInterval(this.timer);
        this.timer = 0;
      },

      doRestart: function () {
        this.stopTimer();
        this.cancelReward();
        if (!this.eng) return;
        var d = this.eng.restart(global.__CHARS__[this.char]);
        this.playable = !!(d && d.parts.length);
        this.solved = null;
        this.unlockNotice = '';
        this.hintOn = false;
        this.elapsed = 0;
        this.startTimer();
      },

      doHint: function () {
        this.hintOn = !this.hintOn;
        if (this.hintOn && this.$emit) this.$emit('hint');
        if (this.eng) this.eng.setHint(this.hintOn);
      },

      glow: function (i, on) {
        var parts = this.eng && this.eng.view().parts();
        if (!parts || !parts[i]) return;
        parts[i].el.style.filter =
          on ? 'drop-shadow(0 0 10px rgba(212,175,106,0.6))' : '';
      },

      onSolved: function (s) {
        this.stopTimer();
        this.elapsed = s.elapsed;
        this.placed = s.placed;
        this.solved = s;
        var S = global.ZQ.store, spec = global.Components.DECOMPOSITION[this.char];
        if (S && spec) {
          var added = S.unlock(spec.parts.map(function (p) { return p.glyph; }));
          this.unlockNotice = added.length ? '已解锁创作构件：' + added.join('、') : '这些构件已经可以在「我的造字」使用。';
        }
        this.reward();
        this.$emit('solved', s);
      },

      /** 奖励：把整字「写」一遍。先等一下，让「拼对了」的反馈先落地。 */
      reward: function () {
        var self = this;
        this.r = global.StrokeRenderer.create(this.$refs.svg, global.__CHARS__[this.char],
          { width: SIZE, height: SIZE, padding: PAD, ghost: false });
        this.r.setProgress(0);
        this.rewardTimer = setTimeout(function () { self.animate(); }, REWARD_DELAY);
      },

      animate: function () {
        var self = this;
        var r = this.r;
        if (!r) return;
        var dur = durationFor(r);
        var t0 = performance.now();
        function tick(now) {
          var t = Math.min(1, (now - t0) / dur);
          // 起笔慢、行笔快、收笔慢
          r.setProgress(-(Math.cos(Math.PI * t) - 1) / 2);
          self.raf = t < 1 ? requestAnimationFrame(tick) : 0;
        }
        this.raf = requestAnimationFrame(tick);
      },

      cancelReward: function () {
        if (this.rewardTimer) clearTimeout(this.rewardTimer);
        if (this.raf) cancelAnimationFrame(this.raf);
        this.rewardTimer = 0;
        this.raf = 0;
      }
    }
  };
})(window);
