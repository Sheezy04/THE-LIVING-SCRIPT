/* 字启千年 — 03 千年演变 · 阶段缩略图条
 *
 * 六格（甲骨文 → 楷书），点哪格跳哪期。没有字形的期压暗、名字加删除线，
 * 但仍然可点 —— 点进去画布会显示「本素材集未收录此期字形」，并在第二行给出
 * 查证依据（data/gap-notes.js），那本身就是信息。
 *
 * 单独拆成组件，是因为它和主画布的**刷新频率差着两个数量级**：
 * 主画布那边拖时间轴时每帧都要更新（滑块要跟手、「下一期」的虚线要高亮），
 * 而这一条只在「当前期 / 下一期」真的变了才有必要重画。
 * 塞进主组件模板里就是每帧 diff 六个缩略图；拆出来，Vue 比完 props 没变
 * 就直接跳过整棵子树 —— 这个是 diff 层面省掉的，不是靠手写缓存。
 *
 * 所有坐标计算（Positioner 变换 + 楷书归一化）都在父组件里做完再传进来 ——
 * 这里只负责画。缩略图不该知道 AncientGlyphs 或者 kaiFit 的存在。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  ZQ.EvoStrip = {
    name: 'EvoStrip',

    props: {
      /** [{ key, label, period, available, paths, transform }] —— 建好就不再变 */
      items: { type: Array, default: function () { return []; } },
      active: { type: Number, default: -1 },
      next: { type: Number, default: -1 }
    },
    emits: ['pick'],

    template: [
      '<div class="zc-evostrip">',
      '  <button type="button" v-for="(s, i) in items" :key="s.key" class="zc-evostage" :aria-pressed="i === active"',
      '       :class="{ \'is-absent\': !s.available, \'is-active\': i === active,',
      '                 \'is-next\': i === next }"',
      '       :title="s.label + \' · \' + s.period + (s.available ? \'\' : \' · 本素材集未收录\') + (s.gapNote ? \' · \' + s.gapNote : \'\')"',
      '       :aria-label="s.label + (s.available ? \'\' : \'，本素材集未收录\' + (s.gapNote ? \'；\' + s.gapNote : \'\'))"',
      '       @click="$emit(\'pick\', i)">',
      '    <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">',
      '      <g :transform="s.transform">',
      // 没有字形的期不是不画 —— 还是画，但压到 0.25。空着的话那一格
      // 和「加载失败」长得一样，压暗的画法能看出「有这么一期，只是没这个字」
      '        <path v-for="(d, k) in s.paths" :key="k" :d="d"',
      '              :opacity="s.available ? null : 0.25" />',
      '      </g>',
      '    </svg>',
      // 格名是短的（这一列窄，CSS 是 nowrap + ellipsis，写长了会被截掉半句，
      // 反而比短标签更难读）。所以这里用「未收录」—— 与 title / 舞台信息那句
      // 「本素材集未收录」同一个口径，只是缩写；完整依据在 title 里。
      '    <span class="zc-evostage-name">{{ s.available ? s.label : s.label + \'·未收录\' }}</span>',
      '  </button>',
      '</div>'
    ].join('\n')
  };
})(window);
