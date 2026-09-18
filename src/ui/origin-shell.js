/* 字启千年 — 01 字源探索（Vue 组件）
 *
 * 左边「这个字最初长什么样」，右边「怎么写」。
 * 右边那半是原 app.js 的书写模式，整体交给 <mode-write>，这里不碰它。
 *
 * 这里只显示**现存最早的一期**，一期。不是不想多给 —— 是把「六期并排、逐期过渡」
 * 留给 03 千年演变：那边是看它**怎么变**，这边是看它**从哪儿来**。
 * 两个模块都摆一条时间轴的话，03 就没有存在理由了。
 *
 * ⚠️ 字形本身来自 data/ancient.js（中研院 CDP 光盘解包 + 敬峰中山王篆），
 *    我对这些对应关系的学术正确性**不做任何保证** —— 古文字释读必须人工对照
 *    汉典 zdic.net / 教育部汉字全息资源应用系统核验。见 README「红线」一节。
 *    授权有疑问的来源会在这里实打实地标出来，不藏。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SRC_SIZE = 300;   // 字源卡里那个小画布
  var SRC_PAD = 24;

  ZQ.OriginShell = {
    name: 'OriginShell',
    mixins: [ZQ.i18nMixin],

    props: { char: { type: String, required: true }, initialPanel: { type: String, default: '' } },
    emits: ['pick', 'go'],

    template: [
      '<div class="zc-origin-view">',
      '  <header class="zc-origin-tabs"><div class="zc-gallery-heading"><span>01 / EXPLORATION</span><h2>汉字探索</h2></div><div class="zc-seg" role="tablist" aria-label="汉字探索内容"><button v-for="t in panels" :key="t.id" role="tab" :aria-selected="panel === t.id" :class="{ \'is-active\': panel === t.id }" @click="panel = t.id">{{ tr(\'origin_tab_\' + t.id) }}</button></div></header>',
      '  <section v-show="panel !== \'source\'" class="zc-character-detail">',
      '    <div class="zc-detail-title"><strong>{{ char }}</strong><div><p>{{ info.pinyin }}</p><h2>{{ displayMeaning }}</h2></div></div>',
      '    <div class="zc-detail-facts"><span>{{ info.method }}</span><span>{{ info.structure }}结构</span><span>现代构件 · {{ (info.components || []).join(\' + \') }}</span></div>',
      '    <p>{{ info.culture }}</p>',
      '    <div class="zc-controls zc-char-extras"><button class="zc-btn" @click="speak">{{ tr(\'origin_speak\') }}</button><button class="zc-btn" :aria-pressed="favorite" @click="toggleFavorite">{{ favorite ? tr(\'origin_fav_remove\') + \' ★\' : tr(\'origin_fav_add\') + \' ☆\' }}</button></div>',
      '    <evidence-reader :char="char" @open="pauseForEvidence" />',
      '    <p v-if="speechMessage" class="zc-note" role="status">{{ speechMessage }}</p>',
      '    <div class="zc-controls"><button class="zc-btn is-primary" @click="$emit(\'go\', \'lab\')">拆解这个字</button><span class="zc-note" v-if="info.related && info.related.length">关联汉字</span><button class="zc-btn" v-for="c in info.related" :key="c" @click="$emit(\'pick\', c)">{{ c }}</button></div>',
      '  </section>',
      '  <section class="zc-origin-exhibit" aria-label="书写画布与选字">',
      '    <mode-write ref="writer" :key="char" :char="char" :tools-visible="panel === \'writing\'" :show-picker="false" @pick="$emit(\'pick\', $event)" />',
      '    <div class="zc-exhibit-caption"><span>{{ char }} · {{ info.pinyin }}</span><span>现代字形 · 一笔一画</span></div>',
      '    <char-picker class="zc-origin-picker" :model-value="char" @update:model-value="$emit(\'pick\', $event)" />',
      '  </section>',
      '  <div class="zc-origin">',
      '',
      '    <section v-show="panel === \'source\'" class="zc-panel zc-origin-src">',
      '      <div class="zc-panel-title">字源</div>',
      '',
      '      <div class="zc-origin-glyph">',
      '        <svg viewBox="0 0 300 300" aria-label="古文字字形">',
      '          <g :transform="srcPos.transform">',
      '            <path v-for="(d, i) in paths" :key="i" :d="d"',
      '                  class="zc-evo-glyph" fill-rule="evenodd" />',
      '          </g>',
      '        </svg>',
      '      </div>',
      '',
      '      <template v-if="era">',
      '        <div class="zc-origin-head">',
      '          <span class="zc-origin-era">{{ era.label }}</span>',
      '          <span class="zc-origin-period">{{ era.period }}</span>',
      '        </div>',
      '        <p class="zc-origin-note">{{ era.note }}</p>',
      '        <p class="zc-origin-cap">{{ tr(\'origin_note_glyph\') }}</p>',
      '        <details class="zc-origin-source-details"><summary>来源与授权{{ srcWarn ? \' · 待确认\' : \'\' }}</summary><p class="zc-origin-cap">{{ caption }}</p><p class="zc-origin-credit">',
      '          来源：{{ srcName }}',
      // 授权文案自己带 ⚠️，这里不再补一个，否则会出现「⚠️ ⚠️ 待确认」
      '          <br><span v-if="srcWarn" class="warn">{{ srcWarn }}</span>',
      '        </p></details>',
      '      </template>',
      '      <p v-else class="zc-origin-note">{{ tr(\'origin_note_none\') }}</p>',
      '    </section>',
      '',
      '  </div>',
      '</div>'
    ].join('\n'),

    data: function () { return { panel:'meaning', speechMessage:'', panels:[{id:'meaning',label:'字义与构形'},{id:'source',label:'字源展签'},{id:'writing',label:'书写操作'}] }; },
    /* 深链一次性消费：initialPanel 只在挂载时生效，之后手动切页签不受影响 */
    created: function () { if (this.initialPanel) this.panel = this.initialPanel; },
    methods: {
      pauseForEvidence: function () { var writer=this.$refs && this.$refs.writer; if(writer && typeof writer.stop==='function') writer.stop(); },
      speak: function () { var self = this; global.ZQ.speakChar(this.char, function (message) { self.speechMessage = message; }); },
      toggleFavorite: function () { global.ZQ.toggleFavorite(this.char); if (!global.ZQ.preferences.savedLocally) this.speechMessage = this.tr('origin_fav_session'); }
    },
    computed: {
      favorite: function () { return global.ZQ.preferences.favorites.includes(this.char); },
      /* 内容级双语：lang=en 且本字有 CharEN 一行释义时用它，否则回退中文释义 */
      displayMeaning: function () {
        var lang = (global.ZQ.workspace && global.ZQ.workspace.lang) || 'zh';
        if (lang === 'en') {
          var en = (global.ZQ.CharEN || {})[this.char];
          if (en) return en;
        }
        var info = global.CharCatalog[this.char]; return info ? info.meaning : '';
      },
      info: function () { return (global.CharCatalog || {})[this.char] || {}; },
      /** 古文字数据层。没加载出来就退化成「什么都没有」，不抛 */
      A: function () {
        return global.AncientGlyphs || null;
      },

      /** 此字现存最早的**一期**（ERAS 本来就是从早到晚排的，过滤后仍保持次序） */
      era: function () {
        var A = this.A;
        if (!A) return null;
        var list = A.erasOf(this.char) || [];
        if (!list.length) return null;
        var key = list[0];
        var all = A.ERAS || [];
        for (var i = 0; i < all.length; i++) {
          if (all[i].key === key) return all[i];
        }
        return null;
      },

      paths: function () {
        var A = this.A;
        if (!A || !this.era) return [];
        return A.paths(this.char, this.era.key) || [];
      },

      /** 变换固定不随字变 —— 归一化参数已经烘进 path 坐标（见 data/ancient.js 头注释） */
      srcPos: function () {
        return global.Positioner.create(SRC_SIZE, SRC_SIZE, SRC_PAD);
      },

      caption: function () {
        var A = this.A;
        if (!A || !this.era) return '';
        return this.era.key === '甲骨文'
          ? '本素材集中较早的代表字形；不等同于完整考古记录。'
          : '本素材集未收录该字的甲骨文，此处展示已收录的较早字形。';
      },

      srcName: function () {
        var A = this.A;
        if (!A || !this.era) return '';
        var s = A.eraSource(this.era.key);
        return (s && s.name) || this.era.src || '';
      },

      /** 授权没落实的，明说 —— 这几个字形的来源本来就还在核实中 */
      srcWarn: function () {
        var A = this.A;
        if (!A || !this.era) return '';
        var s = A.eraSource(this.era.key);
        return (s && s.license_ok === false) ? (s.license || '授权待确认') : '';
      }
    }
  };
})(window);
