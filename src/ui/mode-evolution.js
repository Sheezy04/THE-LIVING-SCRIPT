/* 字启千年 — 03 千年演变（Vue 组件）
 *
 * 从 src/app.js 的 evolution 模式搬过来。搬的是**接线**，不是引擎：
 * src/evolution.js 一行没改，两层淡入淡出、并览、逐期跳转的逻辑都还在它自己手里。
 * 而且它不往 DOM 上挂任何监听器（只有 StrokeRenderer 和 Decompose 挂），
 * 所以 :key 换字重建这条路照样干净。
 *
 * ⚠️ onStage 是**每帧**都来的，这里必须自己分轻重。app.js 当年用 evoLastStage
 *    挡住重复的 renderEvoPanel，因为那是 innerHTML 重建；Vue 这边则是：
 *      · t 每帧写 —— 滑块和「下一期」高亮得跟着动
 *      · stage 只在**期真的换了**才整体换一个对象，模板里那些面板绑定就不动
 *    判等必须比 index，不能比 t：t 每帧都在变，比它等于没挡。
 *
 * ⚠️ 并览（overview）和单期视图的滑块是同一个。app.js 定下的规矩：在并览状态下
 *    拖时间轴 = 想回到单期，先把并览关掉再定位。漏掉这一步的话滑块动了、画面不动。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SIZE = 520;          // 与 .zc-canvas-wrap 的显示尺寸对齐
  var PAD = 40;
  var THUMB = 64;          // 缩略图格：和 app.js 的 buildEvoStrip 同尺寸
  var THUMB_PAD = 8;

  ZQ.ModeEvolution = {
    name: 'ModeEvolution',
    mixins: [ZQ.i18nMixin],

    props: { char: { type: String, required: true }, initialPanel: { type: String, default: '' } },
    emits: ['pick'],

    template: [
      '<div class="zc-stage">',
      '  <div class="zc-evo-main">',
      '    <div v-show="!compare" class="zc-canvas-wrap">',
      // is-overview 只是给画布换个底色（CSS），真正的并览排版在引擎里
      '      <svg ref="svg" class="zc-canvas" :class="{ \'is-overview\': overview }"',
      '           aria-label="汉字演变"></svg>',
      '    </div>',
      '    <section v-if="compare" class="zc-evo-compare">',
      '      <div v-for="(n, side) in [compareA, compareB]" :key="side" class="zc-evo-compare-cell">',
      '        <select :value="n" @change="setCompare(side, $event)" :aria-label="side ? \'右侧对比时期\' : \'左侧对比时期\'">',
      '          <option v-for="(s, i) in stages" :key="s.key" :value="i">{{ s.label }}</option>',
      '        </select>',
      '        <svg viewBox="0 0 64 64" :aria-label="items[n] ? items[n].label : \'字形\'"><g v-if="items[n] && items[n].available" :transform="items[n].transform"><path v-for="(d, k) in items[n].paths" :key="k" :d="d" fill="currentColor" fill-rule="evenodd" /></g></svg>',
      '        <p class="zc-note">{{ stages[n] && stages[n].available ? stages[n].note : \'本素材集未收录此期字形\' }}</p>',
      '      </div>',
      '    </section>',
      '    <div class="zc-evo-playback">',
      '      <input class="zc-timeline" type="range" min="0" :max="maxT" step="1" :value="Math.round(t * 1000)" @input="onSlide" aria-label="演变时间轴">',
      '      <evo-strip :items="items" :active="floorT" :next="nextIdx" @pick="goTo" />',
      '      <div class="zc-controls">',
      '        <button class="zc-btn is-primary" @click="togglePlay">{{ playing ? tr(\'evo_pause\') : tr(\'evo_play\') }}</button>',
      '        <button class="zc-btn" :title="tr(\'evo_prev\')" :aria-label="tr(\'evo_prev\')" @click="prev">‹ <span>{{ tr(\'evo_prev\') }}</span></button>',
      '        <button class="zc-btn" :title="tr(\'evo_next\')" :aria-label="tr(\'evo_next\')" @click="next"><span>{{ tr(\'evo_next\') }}</span> ›</button>',
      '        <button class="zc-btn" :aria-pressed="overview" @click="toggleOverview">{{ tr(\'evo_overview\') }}</button>',
      '        <button class="zc-btn" :aria-pressed="compare" @click="toggleCompare">{{ tr(\'evo_compare\') }}</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '',
      '  <aside class="zc-evo-tools">',
      '    <div class="zc-gallery-heading"><span>02 / EVOLUTION</span><h2>千年演变</h2></div>',
      '    <div class="zc-seg zc-evo-tabs" role="group" aria-label="演变内容"><button :aria-pressed="panel === \'stage\'" :class="{ \'is-active\': panel === \'stage\' }" @click="panel = \'stage\'">{{ tr(\'evo_tab_stage\') }}</button><button :aria-pressed="panel === \'pick\'" :class="{ \'is-active\': panel === \'pick\' }" @click="panel = \'pick\'">{{ tr(\'evo_tab_pick\') }}</button></div>',
      '    <evidence-reader ref="evidence" :char="char" :stage-key="stage.key" @open="pauseForEvidence" />',
      '    <div v-show="panel === \'stage\'" class="zc-panel">',
      '      <div class="zc-panel-title">阶段</div>',
      '      <div class="zc-stageinfo-head">',
      '        <span class="zc-stageinfo-name">{{ stage.label }}</span>',
      '        <span class="zc-stageinfo-period">{{ stage.period }}</span>',
      '      </div>',
      '      <p class="zc-stageinfo-note">{{ stage.note }}</p>',
      '      <div class="zc-stageinfo-src">',
'        <template v-if="isKai">',
'          字形源 <b>hanzi-writer-data</b>（Make Me A Hanzi）<br>',
'          授权 <b>Arphic Public License</b>',
'        </template>',
'        <template v-else-if="stage.source && !stage.missingHere">',
'          字形源 <b>{{ stage.source.name }}</b><br>',
'          <template v-if="stage.source.license_ok">',
'            {{ stage.source.license_kind || \'授权\' }} <b>{{ stage.source.license }}</b> <a v-if="stage.source.license_url" :href="stage.source.license_url" target="_blank" rel="noopener noreferrer">查看原文</a>',
'          </template>',
/* 若日后接入未公开许可的来源，走此兜底；汉典现行条款已公开 CC0，不走这里。 */
'          <template v-else-if="stage.source.license_stated === false">',
'            <span class="warn">来源未声明授权</span><br>',
'            <span>当前未查到适用于此字形的公开使用条款，请核对原始来源。</span>',
'          </template>',
'          <template v-else>',
'            <span class="warn">本地许可标记：待确认</span><br>',
'            <span>许可核对状态：尚未完成</span><br>',
'            <span>说明：当前来源的使用条件尚未核对，请查看具体文件和权利声明。</span>',
'          </template>',
'        </template>',
'        <template v-else-if="stage.missingHere">',
'          字形源 <b>{{ stage.source ? stage.source.name : \'\' }}</b> · 本素材集未收录此期字形',
'        </template>',
'      </div>',
      '      <div class="zc-stagecov">',
      '        <span v-for="(s, i) in stages" :key="s.key" class="zc-covchip"',
      '              :class="[s.available ? \'has\' : \'no\', i === stage.index ? \'is-now\' : \'\']"',
      '              :title="s.period + (s.available ? \' · 有字形\' : \' · 本素材集未收录此期字形\')"',
      '        >{{ s.label }}</span>',
      '      </div>',
      /* 隶变节点。时间轴上**没有**这一期（本地素材集没有隶书字形，不拿小篆或楷书
       * 冒充），但它的资料其实另有 CC0 采集 —— 所以它落在这里，作为「时间轴之外」
       * 的一段叙事，而不是往六期里塞一个空期：那样每个字都会多出一格永远画不出
       * 东西的缩略图，`ERAS` 是六期这件事也是 data/ancient.js 与覆盖统计的基准。
       * 列出的九个字与当前选中的字无关（那批资料是按字采集的），所以点字走
       * openAt 直接点名，见 evidence-reader.js。 */
      '      <div class="zc-li-node">',
      '        <div class="zc-panel-title">时间轴之外 · 隶变</div>',
      '        <p class="zc-stageinfo-note">小篆到楷书之间隔着约四百年。字形在这一段从「用线条描画物象」转向「用笔画记录语素」：圆转的弧线拉直、折出方角，象形意味进一步脱落，今天通行的笔画结构基本在这时定型。本地素材集没有这一期的字形，时间轴便直接从「小篆」跳到「楷书」，不拿相邻阶段顶替。</p>',
      '        <p class="zc-note">下列 {{ liChars.length }} 个代表字的汉代隶变字样与著录已单独采集（CC0），点字可直接查看该字的隶变资料：</p>',
      '        <div class="zc-li-chars">',
      '          <button v-for="ch in liChars" :key="ch" class="zc-li-chip"',
      '                  :class="{ \'is-active\': ch === char }" :aria-pressed="ch === char"',
      '                  :title="\'查看「\' + ch + \'」的汉代隶变资料\'" @click="openLi(ch)">{{ ch }}</button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      '',
      '    <char-picker v-show="panel === \'pick\'" :model-value="char"',
      '                 @update:model-value="$emit(\'pick\', $event)" />',
      '  </aside>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        t: 0,             // 连续参数，∈ [0, 期数-1]；每帧都写
        playing: false,
        overview: false,
        compare: false,
        panel:'stage',
        compareA: 0,
        compareB: 5,
        stages: [],       // 各期元信息（哪些期有字形），建好就不变
        items: [],        // 缩略图数据，建好就不变
        stage: {          // 当前期 —— 只在换期时整体替换，见文件头
          index: 0, label: '—', period: '', note: '', key: '',
          source: null, missingHere: false
        }
      };
    },

    /* 深链一次性消费：initialPanel 只在挂载时生效 */
    created: function () { if (this.initialPanel) this.panel = this.initialPanel; },

    computed: {
      floorT: function () { return Math.floor(this.t); },
      /** 过渡到一半时其实有两期同时在场，所以「下一期」得单独算出来给缩略图条点虚线 */
      nextIdx: function () {
        return this.t - this.floorT > 0.001 ? this.floorT + 1 : -1;
      },
      maxT: function () { return Math.max(0, (this.stages.length - 1) * 1000); },
      /** 资料集里有汉代隶变字样的代表字（九个）。**从数据里数**，不写死 ——
       *  这批资料是按字采集的，将来补采一个字，这里跟着变。 */
      liChars: function () {
        var d = global.XiaoxueEvidence;
        if (!d || !Array.isArray(d.records) || !Array.isArray(d.characters)) return [];
        var seen = {}, out = [];
        d.records.forEach(function (r) {
          if (r && r.category === 'lishu' && !seen[r.char] && d.characters.indexOf(r.char) >= 0) { seen[r.char] = true; out.push(r.char); }
        });
        return out;
      },
      isKai: function () {
        return this.stage.key === (global.Evolution && global.Evolution.KAI_KEY);
      }
    },

    mounted: function () {
      this.build();
      this.unbind = global.ZQ.bindKeys({
        space: 'togglePlay',
        left: 'prev',
        right: 'next',
        // R = 回到第一期。goTo 要参数，所以这条是函数而不是方法名。
        // bindKeys 会把它 call 到本组件上，this 是对的。
        r: function () { this.goTo(0); }
      }, this);
    },

    beforeUnmount: function () {
      if (this.unbind) this.unbind();
      // 引擎自己会 stop() 掉定时器和 rAF，还会清三个图层 —— 不调它就会留一条
      // 在飞的动画往已经不要了的 <svg> 上写
      if (this.eng) { this.eng.destroy(); this.eng = null; }
    },

    methods: {
      pauseForEvidence: function () { if(this.eng) this.eng.stop(); this.playing=false; },
      /* 隶变节点点字：把阅览面板**直接定位**到那个字的汉代隶变上。
       * 播放的暂停交给 @open（它本来就是干这个的）—— 这里自己再停一次，
       * 万一将来 @open 那条线断了，两处都停也没坏处，但重复停会让「谁负责」
       * 变得看不出来，所以只留一条路。 */
      openLi: function (ch) {
        var reader = this.$refs.evidence;
        if (reader && typeof reader.openAt === 'function') reader.openAt(ch, 'lishu');
      },
      toggleCompare: function () { this.compare = !this.compare; if (this.compare && this.eng) { this.eng.stop(); this.playing = false; } },
      setCompare: function (side, event) {
        var i = Number(event.target.value);
        if (side) this.compareB = i; else this.compareA = i;
      },
      build: function () {
        var self = this;
        var svg = this.$refs.svg;
        // Evolution.create 自己会清空 svg（四个模式共用画布的约定），这里不重复

        this.eng = global.Evolution.create(svg, {
          width: SIZE, height: SIZE, padding: PAD,
          onStage: function (info) {
            // 换期才换这个对象。判等比的是 index —— 比 t 的话每帧都"变了"，
            // 面板里那几个绑定就会跟着每帧重算，白做
            if (self.stage.index !== info.index) {
              self.stage = {
                index: info.index, label: info.label, period: info.period,
                note: info.note, key: info.key, source: info.source,
                missingHere: info.missingHere
              };
            }
            self.t = info.t;
            // 播放状态以引擎为准：play/stop/goTo 三条路都会让 playing 变，
            // 在外面各写一遍迟早漏一条（goTo 的动画结束时就是引擎自己收的尾）
            self.playing = self.eng.isPlaying();
          }
        });

        this.eng.load(this.char, global.__CHARS__[this.char]);
        var list = this.eng.stages();
        this.stages = list;
        this.compareA = Math.max(0, list.findIndex(function (s) { return s.available; }));
        this.compareB = list.length - 1;

        // 缩略图建一次就够 —— 它们不随 t 变，而 t 每帧都在变
        var pos = global.Positioner.create(THUMB, THUMB, THUMB_PAD);
        var kf = (global.AncientGlyphs && global.AncientGlyphs.kaiFit)
          ? global.AncientGlyphs.kaiFit(this.char) : null;
        // 缺格的查证依据（data/gap-notes.js）。挂在这里而不是 evo-strip 里，
        // 是因为 evo-strip 只负责画 —— 它的文件头写着「不该知道 AncientGlyphs
        // 的存在」，同理它也不该知道 GapNotes。父组件查好再传进去。
        var GN = global.ZQ && global.ZQ.GapNotes;
        this.items = list.map(function (s, i) {
          // 楷书那格没被 build-ancient-data.py 归一化过（它的字形是直接从
          // chars.js 读的），得在这里补上，否则和古文字那几格大小对不上
          var tf = pos.transform;
          if (s.key === global.Evolution.KAI_KEY && kf) {
            tf += ' translate(' + kf[1] + ',' + kf[2] + ') scale(' + kf[0] + ')';
          }
          return { key: s.key, label: s.label, period: s.period,
                   available: s.available, paths: self.eng.pathsOf(i),
                   transform: tf,
                   // 只给缺格；有字形的期一律空串（模板里当它不存在）
                   gapNote: (!s.available && GN) ? GN.of(self.char, s.key) : '' };
        });

        this.t = this.eng.getT();
        this.playing = false;
        this.overview = false;
        this.stage = {
          index: 0, label: list[0].label, period: list[0].period,
          note: list[0].note, key: list[0].key, source: list[0].source,
          missingHere: !list[0].available
        };

        // 第一期就没有字形的话，直接跳到第一个有字形的期。
        // 停在空的第一期，用户看到的只有一个「此期未见此字」，会以为坏了。
        // （setT 会 fire 一次 onStage，上面那个 stage 对象会被覆盖成正确的）
        //
        // ⚠️ 判据是「**第 0 期**有没有字形」，不是「这个字有没有任何字形」。
        //    app.js 那里写的是后者（`load()` 的返回值 ok —— 它等于 stages.some(hasStage)，
        //    只要有任意一期有字形就是 true），所以那个 if 实际上从不生效：
        //    「从」这类最早一期是金文的字，一进来还是停在空的甲骨文期上。
        //    注释写的是「若这个字第一期就没有字形」，代码写的是别的事 —— 以注释为准。
        //    index.html 里那版同样有这个问题，没动它（它在迁移完成后就退役了）。
        if (!list[0].available) {
          for (var i = 1; i < list.length; i++) {
            if (list[i].available) { this.eng.setT(i); break; }
          }
        }
      },

      onSlide: function (e) {
        this.compare = false;
        // 并览状态下拖时间轴 = 想回到单期视图，先把并览关掉再定位。
        // 顺序不能反：setT 在并览态下会去驱动并览的排版，定位就丢了
        if (this.overview) { this.overview = false; this.eng.setOverview(false); }
        this.eng.setT(Number(e.target.value) / 1000);
      },

      togglePlay: function () {
        if (!this.eng) return;
        this.compare = false;
        if (this.eng.isPlaying()) { this.eng.stop(); this.playing = false; return; }
        if (this.overview) { this.overview = false; this.eng.setOverview(false); }
        this.eng.play();
        this.playing = this.eng.isPlaying();
      },

      prev: function () { if (this.eng) this.goTo(Math.floor(this.eng.getT() - 0.001)); },
      next: function () { if (this.eng) this.goTo(Math.floor(this.eng.getT() + 1.001)); },
      goTo: function (i) {
        if (!this.eng || typeof i !== 'number' || !isFinite(i)) return;
        this.compare = false; this.overview = false; this.eng.setOverview(false);
        this.eng.goTo(i, true);
      },

      toggleOverview: function () {
        if (!this.eng) return;
        this.compare = false;
        this.overview = !this.overview;
        this.eng.setOverview(this.overview);
      }
    }
  };
})(window);
