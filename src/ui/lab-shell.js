/* 字启千年 — 构形实验室：学习已有构形，创作统一转交「我的造字」。
 *
 * 认识构形与目标拼合各自管理引擎；切换时卸载，避免旧监听器残留。
 * 当前选字由 AppShell 共享。创作只传递例字的可信构件，不传入学习画布位置。
 * MineView 恢复原草稿后显式确认追加；实验室不再渲染第二套自由编辑器。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  // 插槽落在画布下方，说明与创作转交仍使用父层状态，不重建学习引擎。
  var CANVAS_FOOTER = '<template #canvas-footer><div class="zc-lab-hint"><div class="zc-exhibit-caption"><span>{{ char }} · 现代构形观察</span><span>{{ tab === \'know\' ? \'拖开 · 查看 · 合拢\' : \'观察 · 拼合 · 验证\' }}</span></div><p>{{ hint }}</p><div class="zc-lab-create-link"><span>理解已有构形，再去表达自己的含义。</span><button class="zc-btn" :disabled="!creation" @click="$emit(\'create\', char)">{{ tr(\'lab_to_create\') }} ↗</button><small v-if="creation">带入：{{ creation.glyphs.join(\' + \') }} · 确认后追加，不覆盖草稿</small></div></div></template>';

  /* 页签整块**并进右栏**，不再留在 .zc-lab 自己的网格里。
   *
   * 原先页签与右栏面板各占一行、展台跨这两行 —— 跨行项的高度按网格规范只能
   * 平分给两条自动轨道，展台 656px 就把页签那行从 138px 撑到 240.7px，
   * 页签下面白出一段空洞（画布顶到 560px 上限时更糟）。现在右栏是一条竖列、
   * 展台只占一行，没有跨行项，空洞在任何一个窗口尺寸下都出不来。
   * 实测与理由写在 gallery.css 的同名注释里；形状也由那里定。 */
  var SIDE_HEAD = '<template #side-head><header class="zc-lab-tabs"><div class="zc-gallery-heading"><span>03 / STRUCTURE LAB</span><h2>构形实验室</h2></div><div class="zc-seg" role="tablist" aria-label="构形实验室玩法">' +
    '<button v-for="m in modes" :key="m.id" role="tab"' +
    '        :aria-selected="tab === m.id"' +
    '        :class="{ \'is-active\': tab === m.id }"' +
    '        @click="tab = m.id">{{ labModeName(m) }}</button>' +
    '</div></header></template>';

  var MODES = [
    { id: 'know',  label: '① 认识构形',
      hint: '拖开构件看它由什么组成。点击或用鼠标划过构件列表可以高亮。' },
    { id: 'chal',  label: '② 目标拼合',
      hint: '把构件拖回它该在的位置。拼对了会把整字写一遍。' }
  ];
  ZQ.labCreationRequest = function (ch) {
    if (typeof ch !== 'string' || !Object.prototype.hasOwnProperty.call(global.CharCatalog || {},ch)) return null;
    var table=global.Components.DECOMPOSITION;
    var spec=Object.prototype.hasOwnProperty.call(table,ch)?table[ch]:null;
    var glyphs=spec?spec.parts.map(function(p) { return p.glyph; }):[ch];
    var allowed=global.Compose.palette().map(function(p) { return p.glyph; });
    if(!glyphs.length || glyphs.length>8 || !glyphs.every(function(g) { return allowed.includes(g); })) return null;
    return {char:ch,glyphs:glyphs};
  };

  ZQ.LabShell = {
    name: 'LabShell',
    mixins: [ZQ.i18nMixin],

    props: { char: { type: String, default: '明' }, initialTab: { type: String, default: '' } },
    emits: ['pick', 'create'],

    template: [
      '<div class="zc-lab">',
      '  <mode-decompose v-if="tab === \'know\'" :key="\'know-\' + char"',
      '                  :char="char" @pick="$emit(\'pick\', $event)">',
      SIDE_HEAD,
      CANVAS_FOOTER,
      '  </mode-decompose>',
      '  <mode-challenge v-else-if="tab === \'chal\'" :key="\'chal-\' + char"',
      '                  :char="char" @pick="$emit(\'pick\', $event)">',
      SIDE_HEAD,
      CANVAS_FOOTER,
      '  </mode-challenge>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        modes: MODES,
        tab: 'know'
      };
    },

    /* 深链一次性消费：initialTab 只在挂载时生效 */
    created: function () { if (this.initialTab) this.tab = this.initialTab; },

    computed: {
      creation: function () { return ZQ.labCreationRequest(this.char); },
      hint: function () {
        for (var i = 0; i < MODES.length; i++) {
          if (MODES[i].id === this.tab) return MODES[i].hint;
        }
        return '';
      }
    },
    methods: {
      /* MODES.label 带编号（①/②）+ 中文名；双语下只用编号 + tr 名 */
      labModeName: function (m) {
        var no = (m.label || '').slice(0, 2);
        var name = m.id === 'know' ? this.tr('lab_tab_know') : this.tr('lab_tab_chal');
        return no + ' ' + name;
      }
    }
  };

  // 这里**没有** mountLab。
  // index.html 是整站入口，统一走 app-shell.js 的 ZQ.mountApp ——
  // 02 只是它底下的一个模块，不再是独立页面。留着第二个挂载入口的话，
  // 它就没人测了，组件注册表也会和 mountApp 那份悄悄分家。
})(window);
