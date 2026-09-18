/* 字启千年 — 01 首页
 *
 * 方案文档要的第一屏：作品名 + 一句话简介 + **会呼吸的古文字** +
 * 「开始探索」主按钮 + 字形故事展览 + 「已探索 N / 30」与细进度条。
 *
 * 「会呼吸」是**复用 evolution.js**，不新写动画 —— 那一层已经解决了
 * 「字形从一期过渡到另一期」（两拍淡入淡出、旧期先走新期后到），
 * 首页再来一套就是第二个实现，两套迟早不一致。
 *
 * 循环周期是**算出来的**，不是写死的：play() 从第 1 期走到第 n 期，每期
 * 停 HOLD_MS + 走 FADE_MS，所以一轮 = (n-1) × (HOLD + FADE)。
 * 写死秒数的话，将来接隶书变成七期，首页就会在演到一半时被打断重来。
 *
 * ⚠️ 首页读到的字是**当前挑的那个字**（外壳传下来的），不是自己挑的 ——
 *    和 02/03 共用同一个字是这个作品的一条主线。
 *
 * 风格按方案文档「现代数字东方」：**唯一允许的古风元素是真实的古文字形本身**。
 * 不要祥云 / 回纹 / 描金 / 红金那一套 —— 那些会让作品看起来像节庆海报。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  var SIZE = 260;      // 主视觉那块 svg 的边长
  var PAD = 26;
  var STORIES = [
    { char:'木', tag:'一棵树的线条', title:'枝干与根，藏进一个字。', text:'《说文》对「木」篆形的解释，提到了下部的根。对照这些代表字形，试着找到纵向的主干，再观察分向两侧的线条。', prompt:'从古文字到楷书，哪些线条的位置还保留着？', source:'https://dict.variants.moe.edu.tw/dictView.jsp?ID=20632' },
    { char:'日', tag:'太阳的轮廓', title:'从太阳的形象，到熟悉的方框。', text:'「日」以太阳的形象构字。轮廓和内部标记在不同写法中呈现不同形态；今天的楷书，则以方整的笔画写出这个熟悉的字。', prompt:'留意外轮廓，也留意字形中央的标记。', source:'https://dict.variants.moe.edu.tw/dictView.jsp?ID=19589&la=0' },
    { char:'人', tag:'人的线条', title:'两笔之间，看见人的形象。', text:'《说文》把「人」的构形联系到人的臂与腿。比较古今字形：线条的弯曲、长短和比例虽有不同，表示人的意义仍延续下来。', prompt:'古文字的线条，与今天的一撇一捺有何不同？', source:'https://dict.variants.moe.edu.tw/dictView.jsp?ID=747&la=1' }
  ];

  ZQ.HomeShell = {
    name: 'HomeShell',
    mixins: [ZQ.i18nMixin],

    props: {
      char: { type: String, default: '明' },
      explored: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },

    emits: ['pick', 'go', 'tour'],
    template: `
      <div class="zc-home">
        <section class="zc-home-hero">
          <div class="zc-home-copy">
            <p class="zc-home-kicker"><span></span> A JOURNEY THROUGH CHARACTERS</p>
            <h2 class="zc-home-lead">让汉字，<br><em>不止于看见。</em></h2>
            <p class="zc-home-sub">从一笔一画走进千年。拆开一个字，读懂它的构形，<br class="zc-desktop-break">再用自己的想象，写下一个新的故事。</p>
            <div class="zc-home-start">
              <button class="zc-btn is-primary zc-home-cta" @click="$emit('go', 'origin')"><span>{{ tr('home_start') }}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15M13 6l6 6-6 6" /></svg></button>
              <button class="zc-tour-link" @click="$emit('tour')">{{ tr('home_tour') }} <span aria-hidden="true">↗</span></button>
              <div class="zc-home-progress" v-if="total > 0">
                <span class="zc-home-progress-text">{{ tr('home_progress') }} <strong>{{ explored }}</strong><span> / {{ total }}</span></span>
                <span class="zc-home-bar" role="progressbar" :aria-label="tr('home_progress')" :aria-valuenow="explored" :aria-valuemin="0" :aria-valuemax="total"><i :style="{ width: pct + '%' }"></i></span>
              </div>
            </div>
            <div class="zc-home-suggestions"><span>{{ tr('home_from') }}</span><button v-for="c in ['休','明','森']" :key="c" :class="{ 'is-active': char === c }" :aria-pressed="char === c" @click="$emit('pick', c)">{{ c }}</button></div>
          </div>
          <figure class="zc-home-breath">
            <div class="zc-home-exhibit-top"><span>字形展签 / {{ char }}</span><button @click="toggleMotion" :aria-label="motionPaused ? tr('play_label') : tr('pause_label')">{{ motionPaused ? tr('play') : tr('pause') }}</button></div>
            <div class="zc-home-glyph-frame"><span class="zc-home-orbit"></span><svg ref="svg" :width="size" :height="size" :viewBox="'0 0 ' + size + ' ' + size" class="zc-canvas" aria-hidden="true"></svg></div>
            <figcaption><span>{{ stageLabel || '代表字形' }}</span><small>{{ currentMeaning }}</small></figcaption>
            <span class="zc-home-exhibit-note">代表字形演示 · 非完整字源记录</span>
          </figure>
        </section>
        <section class="zc-home-stories" aria-labelledby="story-title">
          <header class="zc-home-section-head"><div><p class="zc-home-kicker">ONE CHARACTER, MANY STORIES</p><h3 id="story-title">{{ tr('home_story_title') }}</h3></div><span>{{ tr('home_story_pre') }}</span></header>
          <div class="zc-story-selector" role="group" aria-label="选择字形故事"><button v-for="s in stories" :key="s.char" :aria-pressed="storyChar === s.char" :class="{ 'is-active': storyChar === s.char }" @click="storyChar = s.char"><b>{{ s.char }}</b><span>{{ s.tag }}</span></button></div>
          <article class="zc-story-exhibit" :key="storyChar">
            <div class="zc-story-copy"><p class="zc-story-label">字形小故事 / {{ story.char }}</p><h4>{{ story.title }}</h4><p>{{ story.text }}</p><a :href="story.source" target="_blank" rel="noopener noreferrer">文字说明参考 · 教育部《异体字字典》 ↗</a></div>
            <div class="zc-story-gallery"><figure v-for="g in storyGlyphs" :key="g.key"><svg viewBox="0 0 160 160" :aria-label="story.char + ' · ' + g.label"><g v-if="g.available" :transform="g.transform"><path v-for="(d, i) in g.paths" :key="i" :d="d" fill-rule="evenodd" /></g></svg><figcaption><b>{{ g.label }}</b><span>{{ g.available ? g.caption : '本素材集未收录' }}</span></figcaption></figure></div>
            <div class="zc-story-foot"><p>{{ story.prompt }}</p><button class="zc-story-link" @click="exploreStory">继续观察「{{ story.char }}」的演变 <span aria-hidden="true">→</span></button></div>
            <p class="zc-story-disclaimer">以上为代表字形选览，省略了部分阶段，并非完整或唯一的线性演变链；古文字素材的版本授权仍待核对。</p>
          </article>
          <article class="zc-story-family"><div><p class="zc-story-label">构形的另一种可能</p><h4>一个木，是树；重复组合，写出繁茂。</h4><p>「林」表示成片的树木，「森」描述树木繁密。同一个构件，通过数量与位置的变化，可以参与构成不同的字。</p><a href="https://dict.variants.moe.edu.tw/dictView.jsp?ID=20787&la=1" target="_blank" rel="noopener noreferrer">参考：林</a><a href="https://dict.variants.moe.edu.tw/dictView.jsp?ID=21425&la=1" target="_blank" rel="noopener noreferrer">参考：森 ↗</a></div><div class="zc-family-glyphs"><figure v-for="(c, i) in ['木','林','森']" :key="c"><b>{{ c }}</b><figcaption>{{ ['树木','成片的树木','树木繁密'][i] }}</figcaption></figure></div><p class="zc-family-note">这是构形联系，不是「木」逐渐变成「森」的历史演变。</p></article>
          <div class="zc-home-collection"><p><b>{{ total }} 个精选汉字</b><span>第一辑 · 从自然形象到构件组合</span></p><p><b>15 个拆解样例</b><span>不只认识，更能亲手操作</span></p><p><b>26 个创作构件</b><span>让学习成为你的数字作品</span></p></div>
          <p class="zc-background-credit">全站背景：<a href="https://www.metmuseum.org/art/collection/search/51858" target="_blank" rel="noopener noreferrer">Landscape with Autumn Foliage · 传沈周 · 大都会艺术博物馆馆藏 69.131.9 ↗</a> · Public Domain / CC0 开放图像；仅作氛围展示。</p>
        </section>
        <section class="zc-home-themes" aria-labelledby="theme-title">
          <header class="zc-home-section-head"><div><p class="zc-home-kicker">THEME PACKS · 主题字包</p><h3 id="theme-title">{{ tr('home_themes_title') }}</h3></div><span>{{ tr('home_themes_sub') }}</span></header>
          <div class="zc-theme-selector" role="group" aria-label="选择主题"><button v-for="t in themeRows" :key="t.id" :aria-pressed="themeId === t.id" :class="{ 'is-active': themeId === t.id }" @click="themeId = t.id">{{ t.label }}<small v-if="t.note">{{ t.note }}</small></button></div>
          <div class="zc-theme-grid">
            <button v-for="c in theme.chars" :key="c" class="zc-theme-char" :class="{ 'is-active': char === c }" :aria-pressed="char === c" @click="pickThemeChar(c)">
              <b>{{ c }}</b><span>{{ shortMeaning(c) }}</span>
            </button>
          </div>
          <p v-if="theme.note" class="zc-note">{{ themeNote }}</p>
        </section>
      </div>`,

    data: function () {
      return { size: SIZE, stageLabel: '', timer: 0, eng: null, motionPaused: false, stories: STORIES, storyChar: '木', themeId: 'nature' };
    },

    computed: {
      story: function () { return this.stories.find(function (s) { return s.char === this.storyChar; }, this) || this.stories[0]; },
      /* 主题字包：数据在 data/themes.js，只读不改；theme 取不到时回退第一个 */
      theme: function () {
        var rows = this.themeRows;
        for (var i = 0; i < rows.length; i++) if (rows[i].id === this.themeId) return rows[i];
        return rows[0] || { label: '', note: '', chars: [] };
      },
      themeRows: function () {
        var map = (global.ZQ && global.ZQ.Themes) || {};
        return Object.keys(map).map(function (id) { return { id: id, label: map[id].label || id, note: map[id].note || '', chars: map[id].chars || [] }; });
      },
      themeNote: function () {
        return this.tr('home_themes_partial')
          .replace('{{label}}', this.theme.label)
          .replace('{{count}}', String(this.theme.chars.length));
      },
      storyGlyphs: function () {
        var ch = this.story.char, A = global.AncientGlyphs, pos = global.Positioner.create(160, 160, 20);
        var labels = ['甲骨文','金文','小篆','楷书'], captions = ['龟甲兽骨上的刻写','青铜器上的铭文','篆体代表字形','现代规范字形'];
        return labels.map(function (label, i) {
          var modern = label === '楷书', data = global.__CHARS__ && global.__CHARS__[ch];
          var paths = modern ? (data ? data.strokes : []) : (A ? A.paths(ch, label) || [] : []);
          var tf = pos.transform, fit = modern && A ? A.kaiFit(ch) : null;
          if (fit) tf += ' translate(' + fit[1] + ',' + fit[2] + ') scale(' + fit[0] + ')';
          return { key:label, label:label, paths:paths, available:paths.length > 0, transform:tf, caption:captions[i] };
        });
      },
      currentMeaning: function () { var info = (global.CharCatalog || {})[this.char]; return info ? info.meaning.split('；')[0] : ''; },
      shortMeaning: function () {
        return function (ch) {
          var info = (global.CharCatalog || {})[ch];
          var m = info ? (info.meaning || '').split('；')[0] : '';
          return m.slice(0, 8) + (m.length > 8 ? '…' : '');
        };
      },
      pct: function () {
        if (!this.total) return 0;
        return Math.round(Math.min(1, this.explored / this.total) * 100);
      }
    },

    mounted: function () {
      this.build();
    },

    beforeUnmount: function () {
      /* ⚠️ 定时器和引擎都要还账。首页是第一个被挂上又被切走的模块，
       *    漏掉这里的话切到 02 之后那把古文字还在后台每 16 秒跑一轮 ——
       *    看不见但一直在烧 CPU，正是 README 里记的那类 rAF 泄漏事故。 */
      if (this.timer) { clearInterval(this.timer); this.timer = 0; }
      if (this.eng) { this.eng.destroy(); this.eng = null; }
    },

    methods: {
      exploreStory: function () { this.$emit('pick', this.story.char); this.$emit('go', 'evo'); },
      /* 主题字包点字：先选中，再进入 01 探索（与「继续观察」同一个跨模块跳转模式） */
      pickThemeChar: function (c) { this.$emit('pick', c); this.$emit('go', 'origin'); },
      toggleMotion: function () {
        if (!this.eng) return;
        this.motionPaused = !this.motionPaused;
        if (this.motionPaused) this.eng.stop(); else this.eng.play();
      },
      build: function () {
        var self = this;
        var svg = this.$refs.svg;
        if (!svg || !global.Evolution || !global.AncientGlyphs) return;

        var data = global.__CHARS__ ? global.__CHARS__[this.char] : null;
        if (!data) return;

        this.eng = global.Evolution.create(svg, {
          width: SIZE, height: SIZE, padding: PAD,
          onStage: function (info) {
            /* 期名变化才写 data —— 每帧都写会让 Vue 每帧重渲染一次 */
            if (info.label !== self.stageLabel) self.stageLabel = info.label;
          }
        });
        this.eng.load(this.char, data);
        this.motionPaused = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
        if (!this.motionPaused) this.eng.play();

        var n = Math.max(2, this.eng.stages().length);
        var cycle = (n - 1) * (global.Evolution.HOLD_MS + global.Evolution.FADE_MS);
        /* 一轮演完多停一拍再重来，不然衔接处看着像卡了一下 */
        this.timer = setInterval(function () {
          if (self.eng && !self.motionPaused) self.eng.play();
        }, cycle + 1200);
      }
    }
  };
})(window);
