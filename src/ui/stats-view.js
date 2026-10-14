/* 字启千年 — 07 语料数据看板（Vue 组件）
 *
 * 画的是 src/stats.js 数出来的东西 —— 这一层**一个数字都不自己算**，
 * 跟 06 关系网同一个规矩：数据层出数，这里只负责把它摆出来、让人点得动。
 * 所以看板上的数与已发布的《项目数据摘要》同源（两边都调 ZQ.Stats）。
 *
 * ⚠️ 颜色一律走 class，不写 fill="var(--x)"（CSS 变量在 SVG 表现属性里不生效，
 *    原话在 src/styles.css:709 那一带）。四个角色各自的取值与实测对比度见
 *    src/stats-exhibit.css 文件头 —— 那一处是**对真实纸面**量的，不是对墨底。
 *
 * ⚠️ 本模块**不领全局快捷键**（不调 ZQ.bindKeys）。唯一的键盘交互是点阵里的
 *    方向键游标，它只在点阵自己被聚焦时才有意义；keys.js 绑在 window 上，
 *    那样会让用户在任何位置按 ← → 都去挪一个看不见的游标。所以用元素级的
 *    @keydown。test-keys.mjs 只按名字进它访问的那几个模块，不数这一页。
 *
 * ⚠️ 两张表是点阵的**等价读法**（无障碍要求：值不许只藏在悬停提示里）。
 *    点阵本身是可悬停/可键盘走查的增强层，格子里的字·期·来源与缺口说明，
 *    在「缺口明细」与「字表明细」里逐行都有。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  /* 点阵几何（viewBox 单位）。整张图按 viewBox 等比缩放铺满容器，
   * 所以这里只要保证**格距与格边的关系**：3px 空当 ≥ 规范要求的 2px。
   * 106 列在 900px 宽的容器里约 8px 一格 —— 这正是「不做逐格命中区、
   * 改用最近格指针层」的理由：那点尺寸当热区太小，当剪影刚好。 */
  var G = { pitch: 10, size: 7, row: 14, gutter: 64, padTop: 4, padRight: 6 };

  var TIER_LABEL = { core: '核心', extended: '扩展', related: '关联' };

  ZQ.StatsView = {
    name: 'StatsView',
    mixins: [ZQ.i18nMixin],
    emits: ['pick', 'go'],

    template: [
      '<div class="zc-stage zc-stats-stage" ref="stage">',
      '  <div class="zc-stats-heading"><div class="zc-gallery-heading"><span>07 / CORPUS</span><h2>语料数据看板</h2></div><div class="zc-controls"><button class="zc-btn" @click="toggleFullscreen">{{ fullscreen ? \'退出全屏\' : \'全屏展示\' }}</button><button class="zc-btn" :disabled="!mining.analyzed" @click="exportMining">导出分析 CSV</button></div></div>',
      '  <p v-if="notice" class="zc-note" role="status">{{ notice }}</p>',
      '',
      /* ── ① 概览：评委三秒看懂量级 ─────────────────────────────── */
      '  <section class="zc-panel zc-stats-overview">',
      '    <div class="zc-panel-title">全站概览 · 不随下方筛选变化</div>',
      '    <div class="zc-stats-hero">',
      '      <b class="zc-stats-hero-figure">{{ s.ancient.available }}</b>',
      '      <div class="zc-stats-hero-copy">',
      '        <span class="zc-stats-hero-label">已收录古文字字形</span>',
      '        <span class="zc-stats-hero-sub">共 {{ s.ancient.slots }} 格（{{ s.modern }} 字 × {{ s.erasTotal }} 期）· 缺 {{ s.ancient.missing }} 格 · 五期齐全 {{ s.ancient.full }} 字</span>',
      '      </div>',
      '    </div>',
      '    <ul class="zc-stats-tiles">',
      '      <li v-for="t in tiles" :key="t.label"><b>{{ t.value }}</b><span>{{ t.label }}</span></li>',
      '    </ul>',
      '    <p class="zc-note zc-stats-src">',
      '      字形来源：<b>CDP 2.4</b> {{ s.ancient.sources[\'CDP 2.4\'] }} 格 · ',
      '      <b>敬峰中山王篆</b> {{ s.ancient.sources[\'敬峰中山王篆\'] }} 格 · ',
      '      <b>汉典</b> {{ s.ancient.sources[\'汉典\'] }} 格。',
      '      逐格来源见字源展签；所缺 {{ s.ancient.missing }} 格逐格保留查证说明，不按推测补字形。',
      '    </p>',
      '  </section>',
      '',
      /* ── 筛选：一行，管住下面所有会变的图；上面的概览是全站常量，不参与 ── */
      '  <div class="zc-stats-filters" role="group" aria-label="筛选当前切片">',
      '    <span class="zc-stats-slice" role="status">当前切片 <b>{{ slice.length }}</b> 字</span>',
      '    <label class="zc-stats-field">层级',
      '      <select v-model="f.tier"><option value="">全部（{{ s.catalog }}）</option>',
      '        <option v-for="t in tierOptions" :key="t.key" :value="t.key">{{ t.label }}（{{ t.count }}）</option>',
      '      </select></label>',
      '    <label class="zc-stats-field">六书',
      '      <select v-model="f.scriptType"><option value="">全部</option>',
      '        <option v-for="x in s.scriptTypes" :key="x.key" :value="x.key">{{ x.key }}（{{ x.count }}）</option>',
      '      </select></label>',
      '    <label class="zc-stats-field">语义场',
      '      <select v-model="f.category"><option value="">全部</option>',
      '        <option v-for="x in s.categories" :key="x.key" :value="x.key">{{ x.key }}（{{ x.count }}）</option>',
      '      </select></label>',
      '    <label class="zc-stats-check"><input type="checkbox" v-model="f.gapsOnly">只看有缺口</label>',
      '    <button v-if="filtered" class="zc-text-btn" @click="reset">清除筛选</button>',
      '  </div>',
      '',
      '  <section class="zc-panel zc-stats-mining">',
      '    <h3>从构件发现一组字</h3>',
      '    <p class="zc-note">当前 {{ mining.population }} 条目录中，{{ mining.analyzed }} 条有可分析的合体构件。按现代构件统计，每字只计一次；独体字与未细拆记录不计入分母。这里的关联只描述本素材集。</p>',
      '    <p v-if="!mining.analyzed" class="zc-note">当前筛选没有可分析的合体字，清除筛选或选择另一类字即可继续。</p>',
      '    <div v-else class="zc-stats-discovery">',
      '      <div><h4>高频构件</h4><ul class="zc-stats-component-bars">',
      '        <li v-for="item in mining.components.slice(0, 8)" :key="item.component"><button :aria-pressed="family && family.component === item.component" @click="activePart = item.component"><b>{{ item.component }}</b><span class="zc-stats-frequency-track"><i :style="{ width: (item.count / mining.components[0].count * 100) + \'%\' }"></i></span><span>{{ item.count }} 字</span></button></li>',
      '      </ul><div v-if="family" class="zc-stats-family"><p>带有「{{ family.component }}」的 {{ family.count }} 字 · 占合体样本 {{ percent(family.share) }}</p><div class="zc-controls"><button v-for="ch in family.chars" :key="ch" class="zc-btn" @click="exploreChar(ch)">{{ ch }}</button></div></div></div>',
      '      <div class="zc-stats-similarity"><h4>构件相似推荐</h4><label class="zc-stats-field">比较起点 <select :value="seed" @change="similarSeed = $event.target.value"><option v-for="ch in mining.recordChars" :key="ch" :value="ch">{{ ch }}</option></select></label>',
      '        <p class="zc-note">共同构件次数 / 合并后的构件次数。重复构件保留数量，分数不代表字义相同。</p>',
      '        <ul v-if="similarities.length" class="zc-stats-similar-list"><li v-for="row in similarities" :key="row.ch"><button @click="exploreChar(row.ch)"><b>{{ row.ch }}</b><span>共同构件 {{ row.shared.join(\'、\') }}<small>{{ row.components.join(\' + \') }}</small></span><strong>{{ percent(row.score) }}</strong></button></li></ul>',
      '        <p v-else class="zc-note">当前切片没有共享构件的其他字。</p>',
      '      </div>',
      '    </div>',
      '    <div class="zc-stats-rule-heading"><h4>构件共现规则</h4><label class="zc-stats-field">最少共现 <select v-model.number="minCount"><option :value="2">2 字（默认）</option><option :value="3">3 字</option><option :value="1">1 字（探索）</option></select></label></div>',
      '    <p class="zc-note">置信度至少 50%；支持度 = 同现字数 / 合体样本数，置信度 = 同现字数 / 前项字数，提升度 = 置信度 / 后项占比。提升度大于 1 表示本样本中共现更集中。</p>',
      '    <p v-if="minCount === 1" class="zc-stats-exploratory">探索模式包含单字样本，100% 置信度也不能视为普遍规律。</p>',
      '    <p v-if="!mining.rules.length" class="zc-note">没有达到当前阈值的规则。可以扩大切片，或切换到 1 字探索模式查看样本。</p>',
      '    <div v-else class="zc-stats-table-scroll"><table class="zc-stats-table zc-stats-rule-table"><thead><tr><th>构件规则</th><th>同现字数</th><th>支持度</th><th>置信度</th><th>提升度</th><th>样本汉字</th></tr></thead><tbody><tr v-for="r in mining.rules.slice(0, 8)" :key="r.from + r.to"><td>{{ r.from }} → {{ r.to }}</td><td>{{ r.count }}</td><td>{{ percent(r.support) }}</td><td>{{ percent(r.confidence) }}</td><td>{{ r.lift.toFixed(2) }}</td><td><button v-for="ch in r.chars" :key="ch" class="zc-text-btn" @click="exploreChar(ch)">{{ ch }}</button></td></tr></tbody></table></div>',
      '  </section>',
      '',
      /* ── ② 每期缺口：条长 = 这一期缺的字形格数（值域 1–8，真正在变的量）── */
      '  <section class="zc-panel zc-stats-bars">',
      '    <div class="zc-panel-title">每期缺口 · 当前切片 {{ eras.length }} 期</div>',
      '    <p v-if="!barHasRange" class="zc-note">当前切片里每一期都没有缺口。</p>',
      '    <ul v-else class="zc-stats-barlist">',
      '      <li v-for="e in eras" :key="e.key">',
      '        <span class="zc-stats-bar-era">{{ e.label }}</span>',
      '        <span class="zc-stats-bar-track">',
      '          <i class="zc-stats-bar-fill" :style="{ width: barWidth(e) }"></i>',
      '        </span>',
      '        <b class="zc-stats-bar-missing">缺 {{ e.missing }}</b>',
      '        <span class="zc-stats-bar-cover">{{ e.available }}/{{ e.total }}</span>',
      '      </li>',
      '    </ul>',
      '    <p class="zc-note">条长是缺失格数，右边的分数是已收录数。现代楷书是时间轴的第六段，但它来自另一套现代字形数据，不在上面这 {{ s.ancient.slots }} 格里，所以不并进同一张图。</p>',
      '  </section>',
      '',
      /* ── ③ 规模点阵 ④ 缺口明细 ──────────────────────────────── */
      '  <section class="zc-panel zc-stats-matrix">',
      '    <div class="zc-panel-title">规模点阵 · {{ matrix.chars.length }} 字 × {{ s.erasTotal }} 期</div>',
      '    <p v-if="!matrix.cols" class="zc-note">当前筛选下没有带字形的字（关联字本来就没有古文字字形数据）。</p>',
      '    <div v-else class="zc-stats-matrix-wrap" ref="wrap">',
      '      <div class="zc-stats-matrix-scroll">',
      '        <svg ref="svg" class="zc-stats-canvas" :viewBox="viewBox" tabindex="0" role="img"',
      '             :aria-label="canvasLabel" @pointermove="onMove" @pointerleave="onLeave" @keydown="onKey">',
      '          <g v-for="(row, r) in matrix.rows" :key="row.era">',
      '            <text class="zc-stats-era" text-anchor="end" dominant-baseline="central" :x="g.gutter - 10" :y="cellY(r) + g.size / 2">{{ row.label }}</text>',
      '            <rect v-for="(cell, c) in row.cells" :key="row.era + cell.ch"',
      '                  :class="[\'zc-stats-cell\', cell.has ? \'is-on\' : \'is-off\']"',
      '                  :data-ch="cell.ch" :data-era="row.era"',
      '                  :x="cellX(c)" :y="cellY(r)" :width="g.size" :height="g.size" rx="1"></rect>',
      '          </g>',
      '          <rect v-if="active" class="zc-stats-cursor" :x="cellX(active.c) - 2" :y="cellY(active.r) - 2"',
      '                :width="g.size + 4" :height="g.size + 4" rx="2"></rect>',
      '        </svg>',
      '      </div>',
      '      <div v-if="tip" class="zc-stats-tip" :style="tipStyle" role="status">',
      '        <b>{{ tip.ch }}</b><span class="zc-stats-tip-meta">{{ tip.era }}<template v-if="tip.has"> · {{ tip.source }}</template></span>',
      '        <span v-if="tip.gap" class="zc-stats-tip-note">{{ tip.note || \'本素材集未收录\' }}</span>',
      '      </div>',
      '    </div>',
      '    <p class="zc-note zc-stats-key">',
      '      <span class="zc-stats-key-item"><i class="zc-stats-swatch is-on"></i>实心 = 已收录</span>',
      '      <span class="zc-stats-key-item"><i class="zc-stats-swatch is-off"></i>空心朱环 = 缺口</span>',
      '      悬停任一格看字 · 期 · 来源；按 Tab 聚焦点阵后用方向键逐格走查。同一份数据在下面两张表里逐行可读。',
      '    </p>',
      '    <p class="zc-stats-live" aria-live="polite">{{ liveText }}</p>',
      '',
      '    <div class="zc-panel-title zc-stats-subtitle">缺口明细 · {{ gapRows.length }} 格</div>',
      '    <p class="zc-note">',
      '      每个缺口都附有查证说明，可逐条查看。',
      '    </p>',
      '    <p v-if="!gapRows.length" class="zc-note">当前切片没有缺口。</p>',
      '    <table v-else class="zc-stats-table zc-stats-gaptable">',
      '      <thead><tr><th>字</th><th>期</th><th>查证说明</th></tr></thead>',
      '      <tbody><tr v-for="g in gapRows" :key="g.ch + g.era">',
      '        <td class="zc-stats-ch">{{ g.ch }}</td><td>{{ g.eraLabel }}</td><td class="zc-stats-note-cell">{{ g.note }}</td>',
      '      </tr></tbody>',
      '    </table>',
      '  </section>',
      '',
      /* ── ⑤ 字表明细（可下钻）────────────────────────────────── */
      '  <section class="zc-panel zc-stats-roster">',
      '    <div class="zc-panel-title">字表明细 · {{ roster.length }} 字</div>',
      '    <p class="zc-note">点一行进入这个字的千年演变；关联字没有字形数据，不可选。</p>',
      '    <p v-if="!roster.length" class="zc-note">没有符合条件的字。</p>',
      '    <table v-else class="zc-stats-table zc-stats-rostertable">',
      '      <thead><tr><th>字</th><th>层级</th><th>六书</th><th>语义场</th><th>构件</th><th>期覆盖</th><th>笔画</th></tr></thead>',
      '      <tbody><tr v-for="r in roster" :key="r.ch" :class="r.selectable ? \'is-open\' : \'is-locked\'"',
      '        :tabindex="r.selectable ? 0 : -1" @click="openChar(r.ch)" @keydown.enter.prevent="openChar(r.ch)">',
      '        <td class="zc-stats-ch">{{ r.ch }}</td>',
      '        <td>{{ r.tier }}</td><td>{{ r.method || \'—\' }}</td><td>{{ r.category || \'—\' }}</td>',
      '        <td>{{ r.components || \'—\' }}</td>',
      '        <td class="zc-stats-cover-cell" :class="{ \'has-gap\': r.gapCount }">{{ r.cover }}</td>',
      '        <td>{{ r.strokes }}</td>',
      '      </tr></tbody>',
      '    </table>',
      '  </section>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        f: { tier: '', scriptType: '', category: '', gapsOnly: false },
        activePart: '木', similarSeed: '林', minCount: 2, fullscreen: false, notice: '', fullscreenListener: null,
        g: G,
        active: null,      /* {r,c} 当前高亮的格（鼠标或键盘）*/
        keyOn: false,      /* 高亮是不是键盘给的 —— 是的话鼠标移开也不撤 */
        tipAt: null,       /* 提示框相对 .zc-stats-matrix-wrap 的像素位置 */
        liveText: ''
      };
    },

    mounted: function () {
      var self = this;
      this.fullscreenListener = function () { self.fullscreen = global.document.fullscreenElement === self.$refs.stage; };
      global.document.addEventListener('fullscreenchange', this.fullscreenListener);
    },
    beforeUnmount: function () { global.document.removeEventListener('fullscreenchange', this.fullscreenListener); },
    computed: {
      s: function () { return global.ZQ.Stats.summary(); },
      mining: function () { return global.ZQ.Stats.mine(this.slice, { minCount: this.minCount }); },
      family: function () { var part = this.activePart; return this.mining.components.find(function (row) { return row.component === part; }) || this.mining.components[0]; },
      seed: function () { return this.mining.recordChars.indexOf(this.similarSeed) !== -1 ? this.similarSeed : this.mining.recordChars[0] || ''; },
      similarities: function () { return global.ZQ.Stats.similar(this.seed, this.slice, 4); },

      /* 字@期 → 格子。整份摘要只扫一遍就够，之后全是 O(1) 查。 */
      index: function () {
        var out = {}, rows = this.s.ancient.rows, r, c;
        for (r = 0; r < rows.length; r++) for (c = 0; c < rows[r].cells.length; c++) {
          out[rows[r].cells[c].ch + '@' + rows[r].era] = rows[r].cells[c];
        }
        return out;
      },

      /* 有缺口的字（只算有关键格缺的那几个）——「只看有缺口」用 */
      gapChars: function () {
        var out = {}, g = this.s.gaps;
        for (var i = 0; i < g.length; i++) out[g[i].ch] = 1;
        return out;
      },

      slice: function () {
        var cat = global.CharCatalog || {}, out = [], ch;
        for (ch in cat) if (Object.prototype.hasOwnProperty.call(cat, ch) && this.passes(ch)) out.push(ch);
        return out;
      },

      /* 点阵只放带楷书字形的字：28 个关联字本就没有古文字数据，
       * 把它们塞进列里只会得到一整列空点，读起来像「缺得厉害」。 */
      matrixChars: function () { return this.slice.filter(this.hasGlyph); },

      matrix: function () {
        var chars = this.matrixChars, eras = this.s.ancient.eras, self = this;
        var rows = eras.map(function (e) {
          var key = e.key;
          return { era: key, label: e.label, cells: chars.map(function (ch) {
            var cell = self.index[ch + '@' + key];
            return cell || { ch: ch, has: false, source: '', note: '' };
          }) };
        });
        return { chars: chars, rows: rows, cols: chars.length };
      },

      /* 顶点的已收录/缺口是对当前切片重算的 —— 它是筛选器作用域内的图 */
      eras: function () {
        var chars = this.matrixChars, self = this;
        return this.s.ancient.eras.map(function (e) {
          var has = 0;
          for (var i = 0; i < chars.length; i++) if (self.cellFor(chars[i], e.key).has) has++;
          return { key: e.key, label: e.label, available: has, total: chars.length, missing: chars.length - has };
        });
      },
      barMax: function () {
        var m = 0, list = this.eras;
        for (var i = 0; i < list.length; i++) if (list[i].missing > m) m = list[i].missing;
        return m;
      },
      barHasRange: function () { return this.barMax > 0; },

      gapRows: function () {
        var inSlice = {}, list = this.slice;
        for (var i = 0; i < list.length; i++) inSlice[list[i]] = 1;
        return this.s.gaps.filter(function (g) { return inSlice[g.ch]; });
      },

      roster: function () {
        var self = this, cat = global.CharCatalog || {};
        return this.slice.map(function (ch) {
          var info = cat[ch] || {}, glyphs = self.hasGlyph(ch);
          var missing = [], i;
          if (glyphs) for (i = 0; i < self.s.ancient.eras.length; i++) {
            if (!self.cellFor(ch, self.s.ancient.eras[i].key).has) missing.push(self.s.ancient.eras[i].label);
          }
          var comps = info.components || [];
          return {
            ch: ch,
            tier: TIER_LABEL[info.tier || 'core'] || info.tier,
            method: global.ZQ.Stats.normalizeMethod(info.method),
            category: info.category || '',
            components: comps.length ? comps.join('+') : '',
            cover: !glyphs ? '—（关联字无字形）'
              : (missing.length ? (self.s.ancient.eras.length - missing.length) + '/' + self.s.ancient.eras.length + ' · 缺' + missing.join('、')
                                : self.s.ancient.eras.length + '/' + self.s.ancient.eras.length + ' 齐'),
            gapCount: missing.length,
            strokes: glyphs ? (((global.__CHARS__ || {})[ch] || {}).strokes || []).length : '—',
            selectable: glyphs
          };
        });
      },

      filtered: function () { return !!(this.f.tier || this.f.scriptType || this.f.category || this.f.gapsOnly); },

      tierOptions: function () {
        var t = this.s.tiers;
        return ['core', 'extended', 'related'].map(function (k) { return { key: k, label: TIER_LABEL[k], count: t[k] || 0 }; });
      },

      tiles: function () {
        var s = this.s;
        return [
          { value: s.catalog, label: '教学目录' },
          { value: s.modern, label: '可交互字形' },
          { value: s.related, label: '关联字' },
          { value: s.ancient.full, label: '五期齐全' },
          { value: Object.keys(s.ancient.sources).length, label: '字形来源' },
          { value: s.decomposition, label: '可拆解字' },
          { value: s.creativeParts, label: '创作构件' },
          { value: s.graph ? s.graph.edges : 0, label: '关系连线' }
        ];
      },

      viewBox: function () { return '0 0 ' + this.vbw + ' ' + this.vbh; },
      vbw: function () { return G.gutter + this.matrix.cols * G.pitch + G.padRight; },
      vbh: function () { return G.padTop + this.s.ancient.eras.length * G.row + G.padTop; },

      canvasLabel: function () {
        var has = 0, t = 0, list = this.matrixChars, i, e;
        var eras = this.s.ancient.eras;
        for (i = 0; i < list.length; i++) for (e = 0; e < eras.length; e++) { t++; if (this.cellFor(list[i], eras[e].key).has) has++; }
        return '古文字覆盖点阵：' + list.length + ' 字 × ' + eras.length + ' 期，共 ' + t +
          ' 格，已收录 ' + has + ' 格、缺 ' + (t - has) + ' 格。逐行明细见下方缺口明细表与字表明细表。';
      },

      tip: function () {
        var a = this.active;
        if (!a) return null;
        var ch = this.matrix.chars[a.c], row = this.matrix.rows[a.r];
        if (!ch || !row) return null;
        var cell = this.cellFor(ch, row.era);
        return { ch: ch, era: row.label, has: cell.has, source: cell.source, note: cell.note, gap: !cell.has };
      },
      tipStyle: function () {
        return this.tipAt ? { left: this.tipAt.x + 'px', top: this.tipAt.y + 'px' } : null;
      }
    },

    methods: {
      percent: function (value) { return (Math.round(value * 1000) / 10) + '%'; },
      exploreChar: function (ch) { this.$emit('pick', ch); this.$emit('go', this.hasGlyph(ch) ? 'origin' : 'graph'); },
      toggleFullscreen: async function () {
        this.notice = '';
        try {
          if (global.document.fullscreenElement) await global.document.exitFullscreen();
          else if (this.$refs.stage.requestFullscreen) await this.$refs.stage.requestFullscreen();
          else this.notice = '当前浏览器不支持全屏，可使用浏览器的全屏功能。';
        } catch (error) { this.notice = '未能进入全屏，可使用浏览器的全屏功能。'; }
      },
      exportMining: function () {
        var m = this.mining;
        var rows = [['类型', '构件或规则', '字数', '支持度', '置信度', '提升度', '涉及汉字'],
          ['样本', '当前目录 / 合体样本', m.population + ' / ' + m.analyzed, '', '', '', '']];
        m.components.forEach(function (r) { rows.push(['构件', r.component, r.count, r.share, '', '', r.chars.join('、')]); });
        m.rules.forEach(function (r) { rows.push(['共现', r.from + ' → ' + r.to, r.count, r.support, r.confidence, r.lift, r.chars.join('、')]); });
        var csv = '\uFEFF' + rows.map(function (row) { return row.map(function (cell) { return '"' + String(cell).replace(/"/g, '""') + '"'; }).join(','); }).join('\r\n');
        var url = global.URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        var a = global.document.createElement('a'); a.href = url; a.download = '字启千年-构件分析.csv'; a.click();
        setTimeout(function () { global.URL.revokeObjectURL(url); }, 1000);
      },
      hasGlyph: function (ch) { return Object.prototype.hasOwnProperty.call(global.__CHARS__ || {}, ch); },
      cellFor: function (ch, era) { return this.index[ch + '@' + era] || { ch: ch, has: false, source: '', note: '' }; },
      passes: function (ch) {
        var info = (global.CharCatalog || {})[ch] || {}, f = this.f;
        if (f.tier && (info.tier || 'core') !== f.tier) return false;
        if (f.scriptType && global.ZQ.Stats.normalizeMethod(info.method) !== f.scriptType) return false;
        if (f.category && info.category !== f.category) return false;
        if (f.gapsOnly && !this.gapChars[ch]) return false;
        return true;
      },
      reset: function () { this.f = { tier: '', scriptType: '', category: '', gapsOnly: false }; },

      /* 条长按**本期缺失数**归一 —— 五期覆盖都在 92%–99% 之间，
       * 拿「已收录」当条长会得到五根一样长的条，等于没画。 */
      barWidth: function (e) {
        return this.barMax ? Math.round(e.missing / this.barMax * 100) + '%' : '0%';
      },

      cellX: function (c) { return G.gutter + c * G.pitch + (G.pitch - G.size) / 2; },
      cellY: function (r) { return G.padTop + r * G.row + (G.row - G.size) / 2; },
      cellAt: function (clientX, clientY) {
        var svg = this.$refs.svg;
        if (!svg || !this.vbw) return null;
        var r = svg.getBoundingClientRect();
        if (!r.width) return null;
        var k = r.width / this.vbw;
        var vx = (clientX - r.left) / k, vy = (clientY - r.top) / k;
        var c = Math.floor((vx - G.gutter) / G.pitch), row = Math.floor((vy - G.padTop) / G.row);
        if (c < 0 || row < 0 || c >= this.matrix.cols || row >= this.matrix.rows.length) return null;
        return { r: row, c: c };
      },
      /* 提示框的像素位置：相对 .zc-stats-matrix-wrap（它不滚动，滚动的是内层）。 */
      offsetOf: function (clientX, clientY) {
        var w = this.$refs.wrap;
        if (!w) return { x: 0, y: 0 };
        var r = w.getBoundingClientRect();
        return { x: clientX - r.left, y: clientY - r.top + 14 };
      },
      /* 键盘游标那格的中心，换算成同一套像素坐标 */
      offsetOfCell: function (a) {
        var svg = this.$refs.svg, w = this.$refs.wrap;
        if (!svg || !w) return { x: 0, y: 0 };
        var r = svg.getBoundingClientRect(), wr = w.getBoundingClientRect();
        var k = r.width / this.vbw;
        return { x: r.left - wr.left + (this.cellX(a.c) + G.size / 2) * k,
                 y: r.top - wr.top + (this.cellY(a.r) + G.size) * k + 6 };
      },

      onMove: function (event) {
        var a = this.cellAt(event.clientX, event.clientY);
        if (!a) { this.onLeave(); return; }
        this.active = a;
        this.keyOn = false;
        this.tipAt = this.offsetOf(event.clientX, event.clientY);
      },
      onLeave: function () {
        if (this.keyOn) return;
        this.active = null; this.tipAt = null;
      },

      /* 方向键走查。点阵自己聚焦时才算 —— 所以是元素级监听，不是 window 级。 */
      onKey: function (event) {
        var k = event.key, rows = this.matrix.rows.length, cols = this.matrix.cols;
        if (!rows || !cols) return;
        var a = this.active || { r: 0, c: 0 }, moved = true;
        if (k === 'ArrowRight') a = { r: a.r, c: (a.c + 1) % cols };
        else if (k === 'ArrowLeft') a = { r: a.r, c: (a.c - 1 + cols) % cols };
        else if (k === 'ArrowDown') a = { r: (a.r + 1) % rows, c: a.c };
        else if (k === 'ArrowUp') a = { r: (a.r - 1 + rows) % rows, c: a.c };
        else if (k === 'Home') a = { r: a.r, c: 0 };
        else if (k === 'End') a = { r: a.r, c: cols - 1 };
        else moved = false;
        if (!moved) return;
        event.preventDefault();
        this.active = a;
        this.keyOn = true;
        this.tipAt = this.offsetOfCell(a);
        var ch = this.matrix.chars[a.c], row = this.matrix.rows[a.r];
        var cell = ch && row ? this.cellFor(ch, row.era) : null;
        this.liveText = ch && row
          ? ch + '，' + row.label + '，' + (cell.has ? '已收录，来源 ' + cell.source : '缺口' + (cell.note ? '，' + cell.note : ''))
          : '';
      },

      openChar: function (ch) {
        if (!this.hasGlyph(ch)) return;
        this.$emit('pick', ch);
        this.$emit('go', 'evo');
      }
    }
  };
})(window);
