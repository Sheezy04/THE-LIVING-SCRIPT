/* 顶层导航：让所有模块共享当前选字与探索进度。 */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {};
  var MODULES = [
    { id: 'home', label: '首页', ready: true, blurb: '从一个字开启探索。' },
    { id: 'origin', label: '01 汉字探索', ready: true, blurb: '观察字义、构形与文化线索。' },
    { id: 'evo', label: '02 千年演变', ready: true, blurb: '沿时间轴观察古今字形。' },
    { id: 'lab', label: '03 构形实验室', ready: true, blurb: '拆解、拼合并亲手构造。' },
    { id: 'quiz', label: '04 汉字挑战', ready: true, blurb: '用四类题型检验理解。' },
    { id: 'mine', label: '05 我的造字', ready: true, blurb: '创作并导出专属数字海报。' },
    // 追加在末尾，不插队：verify/test-evolution.mjs 的 modtab(n) 是按下标点页签的，
    // 插到前面会让它静默点错模块，失败还出现在很远的下游。
    // label 必须恰好是「06 汉字关系网」—— 模板按 slice(0,2)/slice(3) 拆编号和名字。
    { id: 'graph', label: '06 汉字关系网', ready: true, blurb: '沿构形与相关字走过去。' }
  ];

  /* 深链 view/level 白名单：非法值在 applyDeepLink 里直接忽略，
   * 不会一路传进子组件再兜底。view 只对带页签的模块有意义，
   * graph/mine/quiz 没有 view（quiz 用 level 选题池）。 */
  var DEEP_VIEWS = {
    origin: ['meaning', 'source', 'writing'],
    evo: ['stage', 'pick'],
    lab: ['know', 'chal']
  };
  var DEEP_LEVELS = ['mission', 'classic'];

  ZQ.AppShell = {
    name: 'AppShell',
    mixins: [ZQ.i18nMixin],

    template: [
      '<div class="zc-shell" :class="[\'zc-page-\' + mod, { \'is-workbench\': mod !== \'home\', \'is-reading-large\': viewSettings.largeText }]" :lang="lang">',
      '  <nav class="zc-modbar" aria-label="作品模块">',
      '    <div ref="moduleTabs" class="zc-seg zc-modtabs" role="tablist" @keydown="navigateTabs">',
      '      <button v-for="m in modules" :key="m.id" role="tab"',
      '        :aria-selected="mod === m.id" :tabindex="mod === m.id ? 0 : -1" :class="{ \'is-active\': mod === m.id }"',
      '        @click="mod = m.id"><small v-if="m.id !== \'home\'" class="zc-module-number">{{ m.label.slice(0, 2) }}</small><span>{{ modLabel(m) }}</span></button>',
      '    </div>',
      '    <span class="zc-module-indicator"><i></i>{{ mod === \'home\' ? \'字形与时间\' : idx + \' / \' + total }}</span>',
      '    <button class="zc-lang-toggle" :aria-pressed="lang === \'en\'" @click="toggleLang">{{ lang === \'en\' ? tr(\'lang_toggle_cn\') : tr(\'lang_toggle\') }}</button>',
      '    <button class="zc-help-trigger" @click="openHelp">{{ tr(\'help_open\') }}</button>',
      '  </nav>',
      '  <div class="zc-module-content" :key="lang">',
      '  <home-shell v-if="mod === \'home\'" :key="\'home-\' + char"',
      '    :char="char" :explored="explored" :total="totalChars"',
      '    @pick="char = $event" @go="mod = $event" @tour="startTour" />',
      '  <origin-shell v-else-if="mod === \'origin\'" :key="\'origin-\' + char"',
      '    :char="char" :initial-panel="deepView" @pick="char = $event" @go="mod = $event" />',
      '  <mode-evolution v-else-if="mod === \'evo\'" :key="\'evo-\' + char" :char="char" :initial-panel="deepView" @pick="char = $event" />',
      '  <lab-shell v-else-if="mod === \'lab\'" :char="char" :initial-tab="deepView" @pick="char = $event" @create="createFromLab" />',
      '  <mode-quiz v-else-if="mod === \'quiz\'" :initial-level="deepLevel" @learn="learnChar" @go="mod = $event" />',
      // 06 故意**不给 :key** —— 别的模块按 char 重建是为了换掉引擎，
      // 关系网没有引擎（渲染是纯函数），而重建会把「返回上一个字」的历史清掉。
      '  <graph-view v-else-if="mod === \'graph\'" :char="char" @pick="char = $event" />',
      '  <mine-view v-else :creation-request="creationRequest" :share-code="deepShare" @consume-create="creationRequest = null" @consume-share="deepShare = null" />',
      '  </div>',
      '  <div v-if="mod !== \'home\'" class="zc-journey-next zc-statusbar">',
      '    <div class="zc-status-story"><span class="zc-status-character" aria-hidden="true">{{ mod === \'mine\' ? \'创\' : (mod === \'quiz\' ? \'辨\' : char) }}</span><div><span class="zc-status-eyebrow">{{ tour ? tr(\'journey_guided\') : tr(\'journey_own\') }}</span><p :title="journeyText">{{ journeyText }}</p></div></div>',
      '    <div class="zc-status-metrics"><span>{{ tr(\'metric_explored\') }} <b>{{ explored }}</b><small> / {{ totalChars }}</small></span><span>{{ tr(\'metric_parts\') }} <b>{{ unlockedCount }}</b><small> / {{ paletteCount }}</small></span><span>{{ tr(\'metric_works\') }} <b>{{ libraryCount }}</b></span></div>',
      '    <span v-if="!storageAvailable" class="zc-status-session" role="status">{{ tr(\'session_mode\') }}</span>',
      '    <button class="zc-btn is-primary" @click="mod = nextModule.id">{{ nextModule.label }} <span aria-hidden="true">↗</span></button>',
      '  </div>',
      '  <dialog ref="helpDialog" class="zc-help-dialog" aria-labelledby="zc-help-title"><header><div><span class="zc-status-eyebrow">FIELD GUIDE</span><h2 id="zc-help-title">{{ currentGuide.title }}</h2></div><button class="zc-btn" autofocus @click="$refs.helpDialog.close()">{{ tr(\'help_close\') }}</button></header><ol><li v-for="step in currentGuide.steps" :key="step">{{ step }}</li></ol><p class="zc-note">{{ tr(\'help_note_keys\') }}</p><section class="zc-help-settings"><h3>{{ tr(\'help_read_setting\') }}</h3><button class="zc-btn" :aria-pressed="viewSettings.largeText" @click="setLargeText(!viewSettings.largeText)">{{ viewSettings.largeText ? tr(\'help_std_text\') : tr(\'help_large_text\') }}</button><p class="zc-note">{{ tr(\'help_read_note\') }} {{ viewSettings.savedLocally ? tr(\'help_saved_local\') : tr(\'help_session_only\') }}</p></section><details class="zc-help-health"><summary>{{ tr(\'help_health\') }}</summary><p>{{ auditLine }}</p><ul><li>{{ tr(\'help_storage\') }}：{{ audit.storage ? tr(\'help_ok\') : tr(\'help_session\') }}</li><li>{{ tr(\'help_svg\') }}：{{ audit.svg ? tr(\'help_loaded\') : tr(\'help_missing\') }}；{{ tr(\'help_canvas\') }}：{{ audit.canvas ? tr(\'help_ok\') : tr(\'help_session\') }}</li><li>{{ tr(\'help_ptr\') }}：{{ audit.pointer ? tr(\'help_ok\') : tr(\'help_no_ptr\') }}</li><li>{{ tr(\'help_li\') }}：{{ audit.liAvailable ? tr(\'help_ok\') : tr(\'help_li_no\') }}</li></ul><p class="zc-note">{{ tr(\'help_health_note\') }}</p></details></dialog>',
      '</div>'
    ].join('\n'),
    data: function () { return { modules: MODULES, mod: 'home', char: '休', tour:false, lang:(global.ZQ.workspace && global.ZQ.workspace.lang) || 'zh', deepView:null, deepLevel:null, deepShare:null, viewSettings:global.ZQ.workspace || {largeText:false,savedLocally:false}, audit:{}, creationRequest:null }; },
    mounted: function () { this.applyDeepLink(); this.mark(this.mod); if (global.document) global.document.documentElement.lang = this.lang; },
    watch: {
      mod: function (v) {
        this.mark(v);
        this.$nextTick(function () { if (global.scrollTo) global.scrollTo({ top:0, left:0, behavior:'auto' }); });
      },
      lang: function (v) { if (global.document) global.document.documentElement.lang = v; },
      char: function () { this.mark(this.mod); }
    },
    methods: {
      createFromLab: function (ch) {
        var request=global.ZQ.labCreationRequest(ch); if(!request) return;
        this.creationRequest=request; this.mod='mine';
      },
      openHelp: function () {
        this.audit=global.ZQ.projectAudit?global.ZQ.projectAudit():{};
        var dialog=this.$refs.helpDialog; if(dialog && !dialog.open) dialog.showModal();
      },
      setLargeText: function (value) { if(global.ZQ.setLargeText) global.ZQ.setLargeText(value); },
      navigateTabs: function (event) {
        if (event.ctrlKey || event.metaKey || event.altKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        var i = MODULES.findIndex(function (m) { return m.id === this.mod; }, this);
        if (event.key === 'Home') i = 0;
        else if (event.key === 'End') i = MODULES.length - 1;
        else i = (i + (event.key === 'ArrowRight' ? 1 : -1) + MODULES.length) % MODULES.length;
        this.mod = MODULES[i].id;
        this.$nextTick(function () { var buttons = this.$refs.moduleTabs.querySelectorAll('button'); if (buttons[i]) buttons[i].focus(); });
      },
      learnChar: function (ch) { if (Object.prototype.hasOwnProperty.call(global.CharCatalog || {}, ch)) { this.char = ch; this.mod = 'origin'; } },
      modLabel: function (m) { return m.id === 'home' ? this.tr('mod_home') : this.tr('mod_' + m.id); },
      toggleLang: function () {
        var next = this.lang === 'en' ? 'zh' : 'en';
        if (global.ZQ.setLang) global.ZQ.setLang(next); else global.ZQ.workspace.lang = next;
        this.lang = next;
      },
      /* 深链：页面加载时按 URL hash 直达指定模块、选字与子页。
       * 格式 `#char=休&mod=origin&view=writing`（与 #q= 同一套 & 分隔）。
       * char 非法回退默认字；mod 非法忽略（留守首页）；view/level 按白名单过滤。
       * 一次性消费：$nextTick 后清空 deep 字段，之后正常切换模块回到各模块默认子页。
       * 只在加载时解析，不监听 hashchange —— 04 的 writeSeed 会用 replaceState
       * 换掉整个 hash，实时监听会跟它抢地址栏（见 mode-quiz.js initialSeed 的注释）。 */
      applyDeepLink: function () {
        var hash = (global.location && global.location.hash) || '';
        var get = function (name) {
          var m = new RegExp('(?:^|[#&])' + name + '=([^&#]*)').exec(hash);
          return m ? decodeURIComponent(m[1]) : null;
        };
        var ch = get('char');
        if (ch && Object.prototype.hasOwnProperty.call(global.CharCatalog || {}, ch)) this.char = ch;
        var mod = get('mod');
        var okMod = !!mod && MODULES.some(function (m) { return m.id === mod; });
        if (okMod) this.mod = mod;
        var view = get('view');
        if (okMod && view && DEEP_VIEWS[mod] && DEEP_VIEWS[mod].indexOf(view) !== -1) this.deepView = view;
        var level = get('level');
        if (okMod && level && DEEP_LEVELS.indexOf(level) !== -1) this.deepLevel = level;
        var share = get('share');
        if (share) { this.deepShare = share; this.mod = 'mine'; }
        var self = this;
        this.$nextTick(function () { self.deepView = null; self.deepLevel = null; self.deepShare = null; });
      },
      startTour: function () { this.tour = true; this.char = '休'; this.mod = 'origin'; },
      mark: function (mod) {
        // 挑战由实际答对的题目记目标字，不把进入挑战页误计为当前选字的学习。
        // graph 要记：在关系网上点着走过去，本来就是「探索了这些字」。
        // 加进这个白名单还不够 —— store.touch 会拒收 MODS 之外的模块，
        // src/mine.js 的 MODS/MODL/MODR 三处也要一起加，否则在图上探索过的字
        // 导出备份码时会被静默丢掉（见那个文件里「加模块要同步改三处」）。
        if (global.ZQ.store && ['origin', 'evo', 'lab', 'graph'].includes(mod)) global.ZQ.store.touch(this.char, mod);
      }
    },
    computed: {
      currentGuide: function () {
        var t = this.tr;
        var guides={
          home:{key:'guide_home_title',title:t('guide_home_title'),steps:['点击开始探索，或选择休、明、森作为起点。','首页故事可以切换；代表字形不意味着完整演变链。','三分钟体验路线会在底栏提示下一步。']},
          origin:{key:'guide_origin_title',title:t('guide_origin_title'),steps:['切换字义、字源、书写页签，避免把现代拆字当作完整历史。','书写可暂停、拖动进度或点笔画；读音依赖本机中文语音。','选字面板支持汉字、拼音和字义搜索，也可收藏后筛选。']},
          evo:{key:'guide_evo_title',title:t('guide_evo_title'),steps:['拖时间轴或点缩略图，观察字体演示中的某一枚代表字形。','并览展示多个阶段；点击单期会回到单期视图。','用对比模式观察两期的结构与笔画，缺资料时保留缺失提示。','出处与实证另有小学堂 CC0 查询图、著录与汉代隶变资料，可并排对照和选中复制引用；不算作主时间轴已补齐。']},
          lab:{key:'guide_lab_title',title:t('guide_lab_title'),steps:['在认识构形中拆开休、明等例字，拖动并查看构件。','在目标拼合中把构件拖回合理位置，自动吸附；卡住可开启底纹提示。','点击用这些构件去创作，转到我的造字；确认后追加构件，不覆盖已有草稿。']},
          quiz:{key:'guide_quiz_title',title:t('guide_quiz_title'),steps:['轻松探索只含古今相认与字义情境单选；推理挑战含校勘、双字取证、排序与拼合。','推理拼合先从四构件选两个，再拖拽复原；选错可修正，但计入辅助。线索主动展开，无倒计时。','答错或跳过进入本机练习笔记；重练遵从原模式，旧题型会迁移到新题池。']},
          mine:{key:'guide_mine_title',title:t('guide_mine_title'),steps:['先选择构件，再点击画布上的构件进行位置、缩放和旋转调整。','切到赋予含义输入创作说明；海报设置可选择名称与风格。','生成后保存 PNG；正式作品保存到字库，并复制备份码。草稿和练习笔记不在字库备份中。']},
          graph:{key:'guide_graph_title',title:t('guide_graph_title'),steps:['图只画当前字周围一到两层，点任意一个字就换成以它为中心。','画布下方写着实线与虚线各是什么，那是读懂这张图的第一步。','选一条推荐路径会高亮它经过的边；按 Esc 或「返回上一个字」可以退回。','这一页的连线都整理自已收录的字形与释义，不是按相似度算出来的。']}
        }; return guides[this.mod] || guides.home;
      },
      nextModule: function () {
        var i = MODULES.findIndex(function (m) { return m.id === this.mod; }, this);
        var next = MODULES[(i + 1) % MODULES.length];
        return { id: next.id, label: next.id === 'home' ? this.tr('next_go_home') : this.tr('next_stop') + this.modLabel(next) };
      },
      journeyText: function () {
        if (this.tour && this.mod !== 'home') {
          var prompts = { origin:'journey_origin', evo:'journey_evo', lab:'journey_lab', quiz:'journey_quiz', mine:'journey_mine' };
          // 分母从 prompts 表推导，不加模块忘了改这里的话，底栏会显示「体验路线 06/5」。
          if (!prompts[this.mod]) return this.tr('journey_free');
          var base = this.tr(prompts[this.mod]).replace('{{char}}', this.char);
          return this.tr('journey_guided').split('·')[0].trim() + ' ' + Number(this.idx) + '/' + Object.keys(prompts).length + ' · ' + base;
        }
        return this.mod === 'mine' ? this.tr('journey_mine_home') : this.tr('journey_default');
      },
      auditLine: function () {
        return this.tr('help_health_chars')
          .replace('{{n}}', String(this.audit.chars || 0))
          .replace('{{s}}', String(this.audit.ancientSlots || 0))
          .replace('{{a}}', String(this.audit.ancientAvailable || 0))
          .replace('{{m}}', String(this.audit.ancientMissing || 0))
          .replace('{{p}}', String(this.audit.licensePending || 0))
          .replace('{{d}}', String(this.audit.licenseDeclared || 0));
      },
      idx: function () {
        var i = MODULES.findIndex(function (m) { return m.id === this.mod; }, this);
        return ('0' + Math.max(0, i)).slice(-2);
      },
      total: function () { return ('0' + (MODULES.length - 1)).slice(-2); },
      unlockedCount: function () { return global.ZQ.store ? global.ZQ.store.state.unlocked.length : 0; },
      paletteCount: function () { return global.ZQ.store ? global.ZQ.store.palette().length : 0; },
      libraryCount: function () { return global.ZQ.store ? global.ZQ.store.state.library.length : 0; },
      storageAvailable: function () { return !global.ZQ.store || global.ZQ.store.status.available; },
      explored: function () { return global.ZQ.store ? global.ZQ.store.explored() : 0; },
      totalChars: function () { return global.ZQ.store ? global.ZQ.store.total() : 0; }
    }
  };

  /* 放行闸门：字体到位之前，整页保持不显示（见 src/styles.css 那条
     html:not(.zc-ready) .zc-app）。超时兜底 —— 字体拿不到也得放行，
     宁可看到后备字形，也不能永远白屏。 */
  var FONT_GATE_MS = 2000;

  /* 字体族名从 CSS 变量里读，不在 JS 里另抄一份清单：
     --font-title / --font-reading / --font-brand 的首选族就是那三个 @font-face。 */
  ZQ.fontFamilies = function (global) {
    var cs = global.getComputedStyle(global.document.documentElement);
    var out = [], seen = {};
    ['--font-title', '--font-reading', '--font-brand'].forEach(function (name) {
      var v = (cs.getPropertyValue(name) || '').trim();
      var m = v.match(/^\s*"([^"]+)"|^\s*([^,\s]+)/);
      var fam = m && (m[1] || m[2]);
      if (fam && !seen[fam]) { seen[fam] = 1; out.push(fam); }
    });
    return out;
  };

  ZQ.revealWhenReady = function (global) {
    var doc = global.document;
    var done = false;
    function reveal() {
      if (done) { return; }
      done = true;
      doc.documentElement.classList.add('zc-ready');
    }
    var fonts = doc.fonts;
    var families = fonts && fonts.load ? ZQ.fontFamilies(global) : [];
    /* 没有 Font Loading API（或 CSS 变量没读到）就没法闸，直接放行。
       挂载失败也走这里 —— 永远不显示比闪一下更糟。 */
    if (!families.length) { reveal(); return; }
    var timer = global.setTimeout(reveal, FONT_GATE_MS);
    Promise.all(families.map(function (fam) {
      /* 第二参传一个汉字：不传的话字体可能只按拉丁子集去载，回来 still check() 不过。
         失败（文件缺失等）不卡住闸门 —— reject 也要走到 then。 */
      return fonts.load('400 16px "' + fam + '"', '汉字')['catch'](function () {});
    })).then(function () {
      global.clearTimeout(timer);
      /* 再等两帧：让浏览器用真字体把布局重算完，否则「放行」和「换字形」会撞在同一帧，
         那就把刚藏掉的闪一下又放回来了。 */
      global.requestAnimationFrame(function () { global.requestAnimationFrame(reveal); });
    });
  };

  ZQ.mountApp = function (el, opts) {
    var app = global.Vue.createApp(ZQ.AppShell, opts || {});
    app.component('char-picker', ZQ.CharPicker);
    app.component('home-shell', ZQ.HomeShell);
    app.component('origin-shell', ZQ.OriginShell);
    app.component('mode-write', ZQ.ModeWrite);
    app.component('lab-shell', ZQ.LabShell);
    app.component('mode-decompose', ZQ.ModeDecompose);
    app.component('mode-challenge', ZQ.ModeChallenge);
    app.component('compose-canvas', ZQ.ComposeCanvas);
    app.component('evo-strip', ZQ.EvoStrip);
    app.component('evidence-reader', ZQ.EvidenceReader);
    app.component('mode-evolution', ZQ.ModeEvolution);
    app.component('mode-quiz', ZQ.ModeQuiz);
    app.component('mine-view', ZQ.MineView);
    app.component('graph-view', ZQ.GraphView);
    /* 挂载前整个 .zc-app 是藏着的（见 src/styles.css 的 html:not(.zc-ready) 那条）。
       放行放在 finally 里是**故意的** —— 万一挂载真的抛错，页面也得放出来。
       挂在 mountApp 而不是 index.html，是因为全站入口都走这里
       （见 src/ui/lab-shell.js 顶部那条约定）。 */
    try { return app.mount(el); }
    finally { ZQ.revealWhenReady(global); }
  };
})(window);
