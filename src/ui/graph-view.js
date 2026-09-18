/* 字启千年 — 06 汉字关系网（Vue 组件）
 *
 * 画的是 src/graph.js 算出来的邻域布局 —— 这一层只负责画和点，
 * **一个坐标都不自己算**，一条关系都不自己造。所以换字不需要重建引擎：
 * 渲染是纯函数（邻域对象进、SVG 子节点出），没有 rAF、没有定时器、
 * 也没有挂到 window 上的监听器：整张图只靠 <svg> 上的一个委托 @click，
 * 由 Vue 在卸载时收走。这是它和 02/03 那些引擎组件最大的不同 ——
 * 那些必须靠外壳给 :key 才能换字，这个不需要，而且**不能**给：
 * 一旦按 char 重建，返回上一级的历史就没了。
 *
 * ⚠️ 颜色一律走 class，不写 fill="var(--x)"。CSS 变量在 SVG 表现属性里
 *    不生效，这条规矩在 src/styles.css:709 那一带有原话。
 *
 * ⚠️ 实线 = 构形事实，虚线 = 语义/推荐。这是 data/catalog.js 文件头
 *    早就定下的约定（[8] 那一节），不是这里新发明的：图中「这条边是不是
 *    构形」由 src/graph.js 机械判定，不靠读的人猜。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var SVGNS = 'http://www.w3.org/2000/svg';

  var TEXT_ATTRS = { 'text-anchor': 'middle', 'dominant-baseline': 'central' };

  function svgEl(name, attrs) {
    var node = global.document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) node.setAttribute(k, attrs[k]);
    return node;
  }
  /* 居中用**属性**而不是 CSS：dominant-baseline 当 CSS 属性时在 Safari 上
   * 有过不生效的年份，写成表现属性是老浏览器也认的那一种。 */
  function svgText(cls, value, extra) {
    var attrs = { 'class': cls }, k;
    for (k in TEXT_ATTRS) attrs[k] = TEXT_ATTRS[k];
    if (extra) for (k in extra) attrs[k] = extra[k];
    var node = svgEl('text', attrs);
    node.textContent = value;      /* 用 textContent 而不是拼字符串：没有注入面 */
    return node;
  }

  ZQ.GraphView = {
    name: 'GraphView',
    mixins: [ZQ.i18nMixin],

    props: { char: { type: String, required: true } },
    emits: ['pick'],

    template: [
      '<div class="zc-stage zc-graph-stage">',
      // 标题横跨两栏、放在整页最前：窄屏回落成单列时它仍然在画布上方，
      // 不像原先放在右栏那样会跟到画布后面，变成「看完图才看见页名」。
      '  <div class="zc-gallery-heading"><span>06 / RELATIONS</span><h2>汉字关系网</h2></div>',
      '',
      '  <div class="zc-graph-main">',
      '    <div class="zc-canvas-wrap">',
      '      <svg ref="svg" class="zc-canvas zc-graph-canvas" role="img"',
      '           :aria-label="\'汉字关系网：以「\' + center + \'」为中心的关系邻域\'"',
      '           @click="onCanvasClick"></svg>',
      '      <p v-if="graph.empty" class="zc-graph-empty">此字暂无关联，换个字看看。</p>',
      '    </div>',
      '    <div class="zc-controls zc-graph-controls">',
      '      <button class="zc-btn" :disabled="!history.length" @click="back">← <span>{{ tr(\'graph_back\') }}</span></button>',
      '      <div class="zc-seg zc-graph-hops" role="group" aria-label="展开层数">',
      '        <button v-for="h in [1, 2]" :key="h" :aria-pressed="hops === h" :class="{ \'is-active\': hops === h }"',
      '          @click="setHops(h)">{{ h }} 层</button>',
      '      </div>',
      '      <p class="zc-note">点图上任意一个字，以它为中心重新展开；按 Esc 返回上一个字。</p>',
      '    </div>',
      '',
      '    <section class="zc-panel zc-graph-paths">',
      '      <div class="zc-panel-title">推荐探索路径</div>',
      '      <button v-for="p in paths" :key="p.id" class="zc-graph-path" :class="{ \'is-active\': p.id === pathId }"',
      '        :aria-pressed="p.id === pathId" @click="choosePath(p)">',
      '        <b>{{ p.title }}</b><small>{{ p.note }}</small>',
      '      </button>',
      '      <p class="zc-note">这些路径不是新造的关系，只是把图上已经存在的边按造字思路排出来：路径里的每一步在邻域图上都能连起来。</p>',
      '    </section>',
      '',
      // 图例。原先这里写的是「这张图的实话」——一串替数据辩护的统计（「128 字，其中 128 字
      // 有至少一条关系」是同义反复，「没有连上的字…不是画不出来」在替一个空集辩护：全站早已
      // 没有孤立字）。那些话解决的是**作者的**顾虑，不是读者的问题；读者第一次看到这两色线，
      // 要的是「实线虚线分别是什么」。所以换成图例 + 一句统计。
      // 例子是核对过边类型的：木—林 是实线（林由木构成），水—川 才是虚线。别按印象写。
      '    <section class="zc-panel zc-graph-legend">',
      '      <div class="zc-panel-title">关于这张图</div>',
      '      <p class="zc-graph-key">',
      '        <span class="zc-graph-key-line is-component" aria-hidden="true"></span>',
      '        <span><b>实线</b>是构形关系：一个字由另一个字拼出来，「休」就是「人」加「木」。</span>',
      '      </p>',
      '      <p class="zc-graph-key">',
      '        <span class="zc-graph-key-line is-related" aria-hidden="true"></span>',
      '        <span><b>虚线</b>是相关字：字义或字源上有关联，比如「水」与「川」。</span>',
      '      </p>',
      '      <p class="zc-note">',
      '        本字这一圈有 {{ neighborTotal }} 个字（{{ hops }} 层）。',
      '        全站 {{ stats.chars }} 个字之间，共有 {{ stats.edges }} 条这样的连线。',
      '      </p>',
      '    </section>',
      '  </div>',
      '',
      // 右栏只留「关于这个字」的两块：中心字 + 本字的关系。
      // 推荐路径和统计讲的是**这张图**，不是这个字，所以挪到画布下面去了。
      '  <aside class="zc-graph-tools">',
      '    <section class="zc-panel zc-graph-center">',
      '      <div class="zc-panel-title">中心字</div>',
      '      <div class="zc-graph-center-head">',
      '        <span class="zc-graph-center-char" aria-hidden="true">{{ center }}</span>',
      '        <div>',
      '          <b>{{ info.pinyin || \'—\' }}</b>',
      '          <small>{{ info.meaning || \'此字暂未收录释义。\' }}</small>',
      '        </div>',
      '      </div>',
      '      <div class="zc-graph-chips">',
      '        <span class="zc-chip">{{ tierLabel }}</span>',
      '        <span v-if="info.method" class="zc-chip">{{ info.method }}</span>',
      '        <span v-if="info.structure" class="zc-chip">{{ info.structure }}结构</span>',
      '        <span v-if="componentsText" class="zc-chip">构件 {{ componentsText }}</span>',
      '      </div>',
      '      <p v-if="info.culture" class="zc-note">{{ info.culture }}</p>',
      '      <p v-if="!selectable" class="zc-note zc-graph-locked">',
      '        此字为关联字，暂未收录楷书字形与古文字，因此不能作为全站选字。',
      '        <template v-if="anchor">点「进入 {{ anchor }}」可查看它的楷书字形。</template>',
      '      </p>',
      '      <button v-if="!selectable && anchor" class="zc-btn is-primary" @click="focus(anchor)">进入 {{ anchor }}</button>',
      '    </section>',
      '',
      '    <section class="zc-panel zc-graph-nb">',
      '      <div class="zc-panel-title">本字的关系（{{ neighborTotal }}）</div>',
      '      <p v-if="!neighborTotal" class="zc-note">此字暂无关联。</p>',
      '      <div v-if="componentNeighbors.length" class="zc-graph-group">',
      '        <span class="zc-graph-group-label">构形关系 · 实线</span>',
      '        <button v-for="n in componentNeighbors" :key="n.ch" class="zc-graph-link" @click="focus(n.ch)">',
      '          <b>{{ n.ch }}</b><small>{{ n.reason }}</small>',
      '        </button>',
      '      </div>',
      '      <div v-if="relatedNeighbors.length" class="zc-graph-group">',
      '        <span class="zc-graph-group-label">相关字 · 虚线</span>',
      '        <button v-for="n in relatedNeighbors" :key="n.ch" class="zc-graph-link" @click="focus(n.ch)">',
      '          <b>{{ n.ch }}</b><small>{{ n.reason }}</small>',
      '        </button>',
      '      </div>',
      '    </section>',
      '  </aside>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        /* center 是本组件自己的状态，**不从 props.char 派生**（只在挂载时取一次初值）：
         * 关联字没有楷书字形、不能当全站选字，但完全可以当图的中心 ——
         * 两件事混成一个变量的话，走到关联字上就没法再走下去了。 */
        center: this.char,
        history: [],
        hops: 2,
        pathId: null
      };
    },

    computed: {
      graph: function () { return global.ZQ.Graph.neighborhood(this.center, this.hops); },
      stats: function () { return global.ZQ.Graph.stats(); },
      paths: function () { return global.ZQ.Graph.paths().list; },
      info: function () { return (global.CharCatalog || {})[this.center] || {}; },
      selectable: function () { return Object.prototype.hasOwnProperty.call(global.__CHARS__ || {}, this.center); },
      anchor: function () { return global.ZQ.Graph.anchorOf(this.center); },
      tierLabel: function () {
        var t = global.ZQ.Graph.tierOf(this.center);
        return { core: '核心字', extended: '扩展字', related: '关联字' }[t] || '表外构件';
      },
      componentsText: function () {
        var list = this.info.components || [];
        return list.length > 1 ? list.join(' + ') : '';
      },
      /* 邻域里除中心以外的字，按边类型分组 —— 侧栏列表与图上的线是一回事 */
      links: function () {
        var nb = this.graph, adj = global.ZQ.Graph.adjacency(), out = [];
        for (var i = 1; i < nb.nodes.length; i++) {
          var n = nb.nodes[i], hit = null, list = adj[n.ch] || [];
          for (var j = 0; j < list.length; j++) if (list[j].ch === this.center) { hit = list[j]; break; }
          out.push({ ch: n.ch, kind: n.kind, ring: n.ring, from: hit && hit.edge ? hit.edge.from : '' });
        }
        return out;
      },
      neighborTotal: function () { return Math.max(0, this.graph.nodes.length - 1); },
      componentNeighbors: function () { return this.withReason('component'); },
      relatedNeighbors: function () { return this.withReason('related'); },
      /* 高亮集合：选中一条推荐路径后，属于它的点与边 */
      highlight: function () {
        var p = null, list = this.paths;
        for (var i = 0; i < list.length; i++) if (list[i].id === this.pathId) p = list[i];
        var chars = {}, edges = {};
        if (p) {
          for (i = 0; i < p.chars.length; i++) chars[p.chars[i]] = 1;
          for (i = 0; i < p.hops.length; i++) edges[global.ZQ.Graph.pairKey(p.hops[i][0], p.hops[i][1])] = 1;
        }
        return { chars: chars, edges: edges, on: !!p };
      }
    },

    mounted: function () {
      this.render();
      /* 只注册一个监听器、只认 Esc —— 与 01—05 同一个规矩（见 src/ui/keys.js） */
      this.unbind = global.ZQ.bindKeys({ escape: 'back' }, this);
    },

    beforeUnmount: function () { if (this.unbind) this.unbind(); },

    watch: {
      center: function () { this.render(); },
      hops: function () { this.render(); },
      pathId: function () { this.render(); }
    },

    methods: {
      /* 「由谁拆出来」和「出现在谁里」是两句话，方向不能反 ——
       * 边的 from 字段记的是被拆的那个字（休 = 亻 + 木 的 from 是 休）。 */
      withReason: function (kind) {
        var self = this;
        return this.links.filter(function (l) { return l.kind === kind; }).map(function (l) {
          var reason;
          if (kind === 'component') {
            reason = l.from === self.center ? '「' + self.center + '」由「' + l.ch + '」构成'
                                           : '「' + l.ch + '」由「' + self.center + '」构成';
          } else {
            reason = '教学目录里与「' + self.center + '」同列的相关字';
          }
          return { ch: l.ch, reason: reason, ring: l.ring };
        });
      },

      setHops: function (h) { this.hops = h; },

      choosePath: function (p) {
        if (this.pathId === p.id) { this.pathId = null; return; }
        this.pathId = p.id;
        /* 跳到路径的第一个字，整条路径就都在 2 层之内（四条路径都验过） */
        if (p.chars.length && p.chars[0] !== this.center) {
          this.history = this.history.concat([this.center]);
          this.center = p.chars[0];
        }
      },

      focus: function (ch) {
        var target = ch;
        var nb = this.graph, i;
        for (i = 0; i < nb.nodes.length; i++) if (nb.nodes[i].ch === ch) target = nb.nodes[i].anchor || ch;
        if (ch !== this.center) {
          this.history = this.history.concat([this.center]);
          this.center = ch;
          this.pathId = null;
        }
        /* 全站选字只能落在有楷书字形的字上 —— 否则切到 01/02/03 会空转。
         * center 仍然停在关联字上，用户在图上继续往下走不受影响。 */
        if (target) this.$emit('pick', target);
      },

      back: function () {
        if (!this.history.length) return;
        var prev = this.history[this.history.length - 1];
        this.history = this.history.slice(0, -1);
        this.center = prev;
        this.pathId = null;
        this.focus(prev);
      },

      onCanvasClick: function (event) {
        var node = event.target.closest ? event.target.closest('[data-ch]') : null;
        if (!node) return;
        var ch = node.getAttribute('data-ch');
        if (ch && ch !== this.center) this.focus(ch);
      },

      /* 邻域对象 → SVG 子节点。纯函数式的重建：先清空再按数据画一遍，
       * 没有增量更新，也就没有「上一次的状态没清干净」这一类问题。 */
      render: function () {
        var svg = this.$refs.svg;
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        var G = global.ZQ.Graph, nb = this.graph;
        svg.setAttribute('viewBox', '0 0 ' + G.VIEW + ' ' + G.VIEW);

        var pos = {}, i, n, e;
        for (i = 0; i < nb.nodes.length; i++) pos[nb.nodes[i].ch] = nb.nodes[i];
        var hl = this.highlight;

        /* 线画在字底下 —— 否则线会压在字上，读起来是糊的 */
        var edgeLayer = svgEl('g', { 'class': 'zc-graph-edges' });
        for (i = 0; i < nb.edges.length; i++) {
          e = nb.edges[i];
          var a = pos[e.a], b = pos[e.b];
          if (!a || !b) continue;
          var line = svgEl('line', {
            'class': 'zc-graph-edge is-' + e.kind + (hl.on && hl.edges[e.key] ? ' is-path' : ''),
            x1: a.x, y1: a.y, x2: b.x, y2: b.y
          });
          edgeLayer.appendChild(line);
        }
        svg.appendChild(edgeLayer);

        var nodeLayer = svgEl('g', { 'class': 'zc-graph-nodes' });
        for (i = 0; i < nb.nodes.length; i++) {
          n = nb.nodes[i];
          var cls = 'zc-graph-node is-' + n.tier;
          if (n.ring === 0) cls += ' is-center';
          if (!n.selectable) cls += ' is-locked';
          if (hl.on && hl.chars[n.ch]) cls += ' is-path';
          var g = svgEl('g', { 'class': cls, 'data-ch': n.ch, transform: 'translate(' + n.x + ',' + n.y + ')' });
          if (n.ring > 0) g.setAttribute('role', 'button');
          g.setAttribute('aria-label', n.ch + (n.inCatalog ? '' : '（暂未收录）'));
          g.appendChild(svgEl('circle', { r: n.r }));
          g.appendChild(svgText('zc-graph-glyph', n.ch));
          if (n.ring > 0 && !n.selectable && n.anchor) {
            /* 「点它其实去的是这个字」—— 不写出来的话，点在关联字上突然换到
             * 另一个字，用户会以为点错了。 */
            g.appendChild(svgText('zc-graph-anchor', '→' + n.anchor, { y: n.r + 11 }));
          }
          nodeLayer.appendChild(g);
        }
        svg.appendChild(nodeLayer);
      }
    }
  };
})(window);
