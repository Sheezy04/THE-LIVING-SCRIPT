/* 字启千年 — 04 汉字挑战（Vue 组件）
 *
 * 薄薄一层：出题和判分全在 src/quiz.js 里（那是能在 Node 里跑的纯逻辑），
 * 这里只管呈现、作答、复盘与跳转。键盘监听器在 beforeUnmount 解绑；
 * 构形拖拽题的引擎生命周期由子组件管理。
 *
 * 单选点即判；双字取证选齐两条再提交；时间排序先排列再提交；
 * 拼合行动需实际拖拽。推理由 Quiz.mission 出题，轻松由独立 Quiz.explore 出题。
 *
 * ⚠️ 组合题解析来自 Components.DECOMPOSITION 的现代构件教学示例，
 *    不据此断言全部历史字源；正式参赛前仍须外部内容审核。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};
  var BIG = 200, BIG_PAD = 14;      // 题干里待认的那个字形
  var TILE = 108, TILE_PAD = 8;     // 排序题的格子

  ZQ.ModeQuiz = {
    name: 'ModeQuiz',
    mixins: [ZQ.i18nMixin],
    props: { initialLevel: { type: String, default: '' } },
    emits: ['learn', 'go'],

    template: [
      '<div class="zc-quiz">',
      '  <header class="zc-gallery-heading"><span>04 / CHARACTER CHALLENGE</span><h2>汉字挑战</h2></header>',
      '  <div class="zc-quiz-modes"><div><span class="zc-status-eyebrow">CHARACTER CASE FILES · 字形任务</span><p>{{ modeDescription }}</p></div><div class="zc-seg" role="group" aria-label="挑战模式"><button :aria-pressed="level === \'mission\'" :class="{ \'is-active\': level === \'mission\' }" @click="changeLevel(\'mission\')">{{ tr(\'quiz_level_mission\') }}</button><button :aria-pressed="level === \'classic\'" :class="{ \'is-active\': level === \'classic\' }" @click="changeLevel(\'classic\')">{{ tr(\'quiz_level_classic\') }}</button></div><button class="zc-text-btn" :aria-expanded="notebookOpen" @click="notebookOpen = !notebookOpen">练习笔记 · {{ notebook.length }}</button><small>两套独立题池 · 切换开启新一轮，已解锁构件保留。</small><section v-if="notebookOpen" class="zc-notebook"><h3>把卡住的地方，变成下一条线索</h3><p v-if="!notebook.length">暂时没有待巩固的任务。答错或跳过后会自动记录在这里。</p><article v-for="item in notebook.slice(0, notebookLimit)" :key="item.id"><div><span>{{ item.level === \'classic\' ? tr(\'quiz_level_classic\') : tr(\'quiz_level_mission\') }} · {{ item.label }} · {{ item.char }} · {{ item.resolved ? \'已巩固\' : \'待巩固\' }}</span><h4>{{ item.title }}</h4><p>上次作答：{{ item.response }}</p><p>参考：{{ item.answer }}</p><details><summary>回看解析</summary><p>{{ item.explain }}</p></details></div><div class="zc-controls"><button class="zc-btn" @click="practice(item)">同类再练</button><button class="zc-btn" @click="$emit(\'learn\', item.char)">探索这个字</button></div></article><button v-if="notebookLimit < notebook.length" class="zc-text-btn" @click="notebookLimit += 20">展开更多</button><small>{{ notebookSaved ? \'笔记保存于本机，最多 120 条，不包含在造字备份码中。\' : \'笔记仅存于本次会话，本机存储不可用。\' }} 同类再练可能换字；旧题型会迁移到所属模式的新题池。</small></section></div>',

      // ── 题头：进度 / 题型 / 得分 ──────────────────────
      '  <div class="zc-quiz-head">',
      '    <span class="zc-quiz-step">',
      '      <template v-if="done">本轮结束</template>',
      '      <template v-else>第 {{ i + 1 }} / {{ questions.length }} 题</template>',
      '    </span>',
      '    <span class="zc-quiz-kind">{{ done ? \'成绩\' : (q ? q.label : \'\') }}</span>',
      '    <span class="zc-quiz-score">答对 {{ score }} / {{ answeredCount }}</span>',
      '    <span class="zc-quiz-score">连续答对 {{ streak }}</span>',
      '    <span class="zc-quiz-score">{{ scoreLabel }} {{ points }}</span>',
      '  </div>',
      '  <div class="zc-quiz-bar"><i :style="{ width: barPct }"></i></div>',
      '',
      // ── 成绩 ─────────────────────────────────────────
      '  <section v-if="done" class="zc-panel zc-quiz-card zc-quiz-done">',
      '    <div class="zc-quiz-result-summary"><div class="zc-quiz-final">{{ score }}<span> / {{ questions.length }}</span></div>',
      '    <p class="zc-quiz-verdict">{{ verdict }}</p>',
      '    <p class="zc-note">{{ scoreLabel }} {{ points }} / {{ questions.length * 100 }} · 最高连续答对 {{ bestStreak }} 题；获得的构件可在「我的造字」使用。</p>',
      '    <div class="zc-controls">',
      '      <button class="zc-btn is-primary" @click="restart">{{ tr(\'quiz_again\') }}</button>',
      '      <button class="zc-btn" @click="$emit(\'go\', \'mine\')">用构件创作 ↗</button>',
      '    </div>',
      '    <p class="zc-note">本轮复盘，不是汉字知识水平的专业测评。</p></div>',
      '    <div class="zc-quiz-review" v-if="reviewItem">',
      '      <div class="zc-quiz-review-tabs" aria-label="本轮题目复盘"><button v-for="(item, k) in history" :key="item.id" :aria-pressed="reviewIndex === k" :class="{ \'is-active\': reviewIndex === k, \'is-missed\': !item.correct }" @click="reviewIndex = k">{{ k + 1 }} <span>{{ item.correct ? \'✓\' : \'—\' }}</span></button></div>',
      '      <span class="zc-status-eyebrow">{{ reviewItem.label }} · {{ reviewItem.correct ? \'已答对\' : \'再巩固\' }}</span>',
      '      <h3>{{ reviewItem.title }}</h3>',
      '      <p class="zc-review-response">你的作答：{{ reviewItem.response }}</p>',
      '      <p class="zc-review-answer">参考答案：{{ reviewItem.answer }}</p>',
      '      <p class="zc-review-explain">{{ reviewItem.explain }}</p>',
      '      <p class="zc-note">本题 {{ reviewItem.points }} 分 · {{ reviewItem.assisted ? \'使用过线索\' : \'未使用线索\' }}</p>',
      '      <button class="zc-btn" @click="$emit(\'learn\', reviewItem.char)">再探索「{{ reviewItem.char }}」 ↗</button>',
      '    </div>',
      '  </section>',
      '',
      // ── 题目 ─────────────────────────────────────────
      '  <section v-else-if="q" class="zc-panel zc-quiz-card" :class="[\'is-\' + q.kind]">',
      '    <p class="zc-quiz-ask">{{ q.title }}</p>',
      '    <p v-if="q.guide" class="zc-quiz-guide">{{ q.guide }}</p>',
      '',
      // ① 字形寻踪 —— 给字形，猜字
      '    <div v-if="q.kind === \'glyph\'" class="zc-quiz-glyph">',
      '      <svg viewBox="0 0 200 200" aria-label="待辨认的古文字形">',
      '        <g :transform="tf">',
      '          <path v-for="(d, k) in q.glyph.paths" :key="k" :d="d"',
      '                class="zc-evo-glyph" fill-rule="evenodd" />',
      '        </g>',
      '      </svg>',
      '    </div>',
      '',
      // ② 构形猜字 —— 给构件，猜字
      '    <div v-else-if="q.kind === \'parts\'" class="zc-quiz-parts">',
      '      <span v-for="(g, k) in q.parts" :key="k" class="zc-quiz-part">{{ g }}</span>',
      '    </div>',
      '',
      // ③ 构形拖拽题 —— 复用实验室的吸附判定，不靠选择答案替代操作
      '    <div v-if="q.kind === \'evidence\'" class="zc-quiz-exhibits"><figure v-for="item in q.exhibits" :key="item.char"><svg viewBox="0 0 200 200" :aria-label="\'现代字形\' + item.char"><g :transform="tf"><path v-for="(d,k) in item.paths" :key="k" :d="d" class="zc-evo-glyph" /></g></svg><figcaption>{{ item.char }} · 现代字形</figcaption></figure><p>选择两条证据，不要求猜测历史字源。</p></div>',
      '    <div v-if="q.kind === \'layout\'" class="zc-quiz-layout-intro">检查构件的方向、位置和比例。点击恢复正确的一份草稿。</div>',
      '    <div v-else-if="q.kind === \'build\'" class="zc-quiz-build">',
      '      <section v-if="!answered && q.componentBank && !buildReady" class="zc-quiz-build-bank"><span class="zc-status-eyebrow">01 · 筛选构件</span><p>目标「{{ q.target }}」。选择两个必要构件，干扰构件不应进入字形。</p><div class="zc-quiz-bank-options"><button v-for="glyph in q.componentBank" :key="glyph" class="zc-btn" :aria-pressed="buildSelection.includes(glyph)" :class="{ \'is-primary\': buildSelection.includes(glyph) }" @click="toggleBuildPart(glyph)">{{ glyph }}</button></div><button class="zc-btn is-primary" :disabled="buildSelection.length !== 2" @click="prepareBuild">确认构件 · {{ buildSelection.length }} / 2</button><p v-if="buildGateMessage" role="status">{{ buildGateMessage }}</p><small>筛选错误可以重新选择，但本题会记为使用辅助。</small></section>',
      '      <p v-if="!answered && buildReady && q.componentBank" class="zc-quiz-guide">02 · 构件已选齐。现在判断左右或上下关系，拖拽复原。</p>',
      '      <mode-challenge v-if="!answered && (!q.componentBank || buildReady)" :key="q.id" :char="q.target" embedded @solved="completeBuild" @hint="useBuildHint" />',
      '      <p v-if="answered" class="zc-quiz-relation">目标汉字：{{ q.target }}</p>',
      '    </div>',
      '',
      // ④ 时间线排序 —— 答题时格子上只写材质（刻于龟甲兽骨…），判完才揭期名
      '    <div v-else-if="q.kind === \'order\'" class="zc-quiz-order">',
      '      <div v-for="(k, idx) in tiles" :key="k" class="zc-quiz-tile" :class="tileClass(idx)" :draggable="!answered" @dragstart="dragIndex = idx" @dragover.prevent @drop.prevent="dropTile(idx)">',
      '        <svg viewBox="0 0 108 108" aria-hidden="true">',
      '          <g :transform="tileTf + (tileOf(k).fit || \'\')">',
      '            <path v-for="(d, j) in tileOf(k).paths" :key="j" :d="d"',
      '                  class="zc-evo-glyph" fill-rule="evenodd" />',
      '          </g>',
      '        </svg>',
      '        <div class="zc-quiz-tile-cap">{{ answered ? tileOf(k).label : tileOf(k).note }}</div>',
      '        <div v-if="!answered" class="zc-quiz-tile-move">',
      '          <button class="zc-btn" :disabled="idx === 0" aria-label="往前挪"',
      '                  @click="nudge(idx, -1)">◀</button>',
      '          <button class="zc-btn" :disabled="idx === tiles.length - 1" aria-label="往后挪"',
      '                  @click="nudge(idx, 1)">▶</button>',
      '        </div>',
      '      </div>',
      '    </div>',
      '',
      // ── 作答区 ───────────────────────────────────────
      '    <div v-if="q.kind === \'order\'" class="zc-quiz-submit">',
      '      <button class="zc-btn is-primary" :disabled="answered" @click="submit">提交</button>',
      '      <span class="zc-quiz-tip">拖动或用 ◀ ▶ 把字形排成从早到晚</span>',
      '    </div>',
      '    <div v-else-if="q.kind === \'build\'" class="zc-quiz-submit"><button class="zc-btn" :disabled="answered" @click="skipBuild">暂时跳过（本题不得分）</button></div>',
      '    <div v-if="q.kind === \'evidence\'" class="zc-quiz-submit"><button class="zc-btn is-primary" :disabled="answered || selections.length !== 2" @click="submit">提交证据 · {{ selections.length }} / 2</button></div>',
      '    <div v-if="q.options && q.kind !== \'build\'" class="zc-quiz-options">',
      '      <button v-for="o in q.options" :key="o.key" class="zc-quiz-opt"',
      '              :class="optClass(o)" :aria-pressed="q.kind === \'evidence\' ? selections.includes(o.key) : null" :disabled="answered" @click="pick(o.key)">',
      '        <svg v-if="o.fragments" viewBox="0 0 200 200" :aria-label="o.text + \'字形草稿\'"><g :transform="tf"><g v-for="(part,k) in o.fragments" :key="k" :transform="part.transform"><path v-for="(d,j) in part.paths" :key="j" :d="d" class="zc-evo-glyph" /></g></g></svg>',
      '        <span v-for="(g, j) in (o.glyphs || [o.text])" :key="j"',
      '              :class="q.kind === \'evidence\' || q.kind === \'layout\' ? \'zc-quiz-opt-text\' : \'zc-quiz-opt-g\'">{{ g }}</span>',
      '      </button>',
      '    </div>',
      '',
      // ── 解析 ─────────────────────────────────────────
      '    <div v-if="!answered && q.hints" class="zc-quiz-hints"><button class="zc-text-btn" :disabled="hintCount >= q.hints.length" @click="showHint">{{ hintCount ? \'再看一条线索\' : \'需要一条线索？\' }}</button><small>答对 100 分；用过线索答对 60 分，无倒计时。</small><p v-for="(hint,k) in q.hints.slice(0, hintCount)" :key="k" role="status">{{ hint }}</p></div>',
      '    <div v-if="answered" class="zc-quiz-feedback" :class="result.correct ? \'is-ok\' : \'is-no\'">',
      '      <div class="zc-quiz-mark">{{ result.correct ? \'答对了\' : (picked === \'__skip_build__\' ? \'本题跳过\' : \'答错了\') }}</div>',
      '      <p v-if="!result.correct && q.kind !== \'order\'" class="zc-quiz-answer">',
      '        正确答案 <b>{{ answerText }}</b>',
      '      </p>',
      '      <p class="zc-quiz-explain">{{ result.explain }}</p>',
      '      <p class="zc-note">本题 +{{ result.correct ? (assisted ? 60 : 100) : 0 }} {{ scoreLabel }}</p>',
      '      <p v-if="unlockNotice" class="zc-note">{{ unlockNotice }}</p>',
      '      <div class="zc-controls">',
      '        <button class="zc-btn is-primary" @click="next">{{ last ? tr(\'quiz_score\') : tr(\'quiz_next\') }}</button>',
      '      </div>',
      '    </div>',
      '  </section>',
      '</div>'
    ].join('\n'),

    data: function () {
      return {
        seed: 1,
        level:'mission',
        notebookOpen:false,
        /* 笔记上限提到 120 条（见 experience.js 的 NB_MAX），每页还是 6 条的话
         * 要翻 19 次才能看到最后一条 —— 分页本来是为了别一次渲染上百张详情卡，
         * 不是为了让人点 19 下。首屏 10 条，每次再展开 20 条，120 条四下有找。 */
        notebookLimit:10,
        points:0,
        selections:[],
        buildSelection:[],
        buildReady:false,
        buildGateMessage:'',
        hintCount:0,
        assisted:false,
        questions: [],
        i: 0,
        picked: '',        // 选择题选了哪一项
        tiles: [],         // 排序题当前的次序（期 key 数组）
        marks: null,       // 排序题判完的逐格对错
        answered: false,
        result: null,
        score: 0,
        streak: 0,
        bestStreak: 0,
        unlockNotice: '',
        dragIndex: null,
        done: false,
        history: [],
        reviewIndex: 0,
        sel: 0,            // 排序题里键盘光标停在第几格（见下面 keyNudge 的注释）
        seen: []           // 最近出过的题 id，下一轮尽量避开
      };
    },

    computed: {
      modeDescription: function () { return this.level === 'classic' ? '轻松探索 · 古今相认与字义入境，四题均为单步单选，不含排序或拼字。' : '推理挑战 · 校勘、取证、排序、拖拽各一题，考察证据与空间关系。'; },
      scoreLabel: function () { return this.level==='classic'?'探索分':'推理分'; },
      notebook: function () { return global.ZQ.learning?global.ZQ.learning.mistakes:[]; },
      notebookSaved: function () { return !global.ZQ.learning || global.ZQ.learning.savedLocally; },
      reviewItem: function () { return this.history[this.reviewIndex] || null; },
      q: function () { return this.questions[this.i] || null; },
      last: function () { return this.i >= this.questions.length - 1; },
      answeredCount: function () { return this.i + (this.answered ? 1 : 0); },
      barPct: function () {
        var n = this.questions.length || 1;
        return Math.round((Math.min(this.answeredCount, n) / n) * 100) + '%';
      },

      /** 古文字形已经各自归一化到同一个框里，所以这一个变换对四型通用 */
      tf: function () { return global.Positioner.create(BIG, BIG, BIG_PAD).transform; },
      tileTf: function () { return global.Positioner.create(TILE, TILE, TILE_PAD).transform; },

      answerText: function () {
        var q = this.q;
        if (!q || q.kind === 'order') return '';
        if (q.kind === 'build') return q.target;
        if (q.kind === 'evidence') return q.options.filter(function (o) { return q.answer.includes(o.key); }).map(function (o) { return o.text; }).join('；');
        for (var i = 0; i < q.options.length; i++) {
          var o = q.options[i];
          if (o.key === q.answer) return o.glyphs ? o.glyphs.join(' ') : o.text;
        }
        return q.answer;
      },

      verdict: function () {
        var n = this.questions.length || 1;
        var r = this.score / n;
        if (r === 1) return '本轮全对。把这次理解，变成自己的数字汉字。';
        if (r >= 0.75) return '就差一题。查看本轮复盘，再探索对应的汉字。';
        if (r >= 0.5) return '过半了。再看看汉字探索与构形实验室，回来继续挑战。';
        return '先探索字形、观察演变并练习构形，再回来挑战。';
      }
    },

    /* 深链一次性消费：initialLevel 在 mounted→start 之前生效，start 才会用到 level */
    created: function () { if (this.initialLevel) this.level = this.initialLevel; },

    mounted: function () {
      // 不在 data 里取种子：data 会被反复求值，种子必须只定一次
      this.start(this.initialSeed());

      // 数字键四型通吃：选择题里 = 点第 n 个选项（pick 点即判），
      // 排序题里 = 把光标移到第 n 格。两种都读作「选第 n 个」。
      this.unbind = global.ZQ.bindKeys({
        '1': function () { this.nth(1); },
        '2': function () { this.nth(2); },
        '3': function () { this.nth(3); },
        '4': function () { this.nth(4); },
        left:  function () { this.keyNudge(-1); },
        right: function () { this.keyNudge(1); },
        space: 'advance',
        enter: 'advance',
        r: 'restart'
      }, this);
    },

    beforeUnmount: function () {
      // 这个组件一直没写过 beforeUnmount：它自己不持有 rAF / 定时器，
      // 引擎那边的账在 quiz.js 里没有需要还的。键盘监听器是第一个必须手动解的东西。
      if (this.unbind) this.unbind();
    },

    methods: {
      /* ── 轮次 ─────────────────────────────────────── */

      /**
       * 种子优先从地址栏里读。这样**刷新页面还是同一套题** —— 演示时手一抖
       * 按了 F5 不会当场换题，讲稿和屏幕还对得上。顺便还能把某一轮直接发给别人。
       * 没有就按时间起一个，然后写回地址栏。
       */
      initialSeed: function () {
        var hash = (global.location && global.location.hash) || '';
        var m = /(?:^|[#&])q=(\d+)/.exec(hash);
        var s = m ? Number(m[1]) : (Math.floor(Date.now() / 1000) % 999983) + 1;
        this.writeSeed(s);
        return s;
      },

      writeSeed: function (s) {
        try {
          if (global.history && global.history.replaceState) {
            global.history.replaceState(null, '', '#q=' + s);
          }
        } catch (e) {
          // file:// 下个别浏览器会拦 replaceState。拦了只是「刷新会换一套题」，
          // 不影响答题，所以不往上抛
        }
      },

      /** 换个种子。**不是 +1** —— xorshift 相邻种子的头几个输出很像，+1 的话两轮题会撞脸 */
      nextSeed: function () {
        return ((this.seed * 1103515245 + 12345) % 2147483647) || 1;
      },

      start: function (seed, practiceKind) {
        this.seed = seed;
        var r = practiceKind?global.Quiz.practice(practiceKind,seed,{level:this.level}):global.Quiz[this.level === 'mission' ? 'mission' : 'explore'](seed, { avoid: this.seen });
        var rnd = global.Quiz.rng(seed ^ 0x51e7);
        this.questions = r.questions.map(function (q) {
          if (q.kind === 'order') {
            // 楚系简帛与战国金文属于同一大时期，不强行判定两者的先后。
            // 列表从 Quiz 读 —— 候选字的门槛也得按同一个列表算，两份必然脱节。
            var rank = global.Quiz.ORDER_RANK;
            var tiles = q.tiles.filter(function (tile) { return rank.includes(tile.key); });
            tiles.sort(function (a, b) { return rank.indexOf(a.key) - rank.indexOf(b.key); });
            var kf = global.AncientGlyphs.kaiFit(q.char);
            tiles.push({ key: '楷书', label: '楷书', period: '现代规范字形', note: '方整的规范笔画', paths: global.__CHARS__[q.char].strokes,
              fit: kf ? ' translate(' + kf[1] + ',' + kf[2] + ') scale(' + kf[0] + ')' : '' });
            var answer = tiles.map(function (tile) { return tile.key; });
            var shown = global.Quiz.shuffle(tiles.slice(), rnd);
            if (shown.every(function (tile, i) { return tile.key === answer[i]; })) shown.push(shown.shift());
            return Object.assign({}, q, { tiles: shown, answer: answer,
              explain: '本题代表字形顺序：' + answer.join(' → ') + '。未收录的阶段不参与排序；同属战国的地域字形不强行判先后。' });
          }
          if (q.kind !== 'meaning') return q;
          var target = q.id.split(':').pop();
          return Object.assign({}, q, { kind: 'build', target: target, label: '拼合行动', title: this.level === 'mission' ? q.title + ' 拖动构件完成复原。' : '请拖动构件组成「' + target + '」。' });
        },this);
        this.i = 0;
        this.score = 0;
        this.points = 0;
        this.streak = 0;
        this.bestStreak = 0;
        this.done = false;
        this.history = [];
        this.reviewIndex = 0;
        this.reset();
        this.seen = this.seen
          .concat(r.questions.map(function (q) { return q.id; }))
          .slice(-12);
      },

      restart: function () {
        var s = this.nextSeed();
        this.writeSeed(s);
        this.start(s);
      },

      /** 换到下一题时要把作答状态清干净 —— 漏一个就会出现「上一题的绿勾留在这一题上」 */
      changeLevel: function (level) {
        if (!['mission','classic'].includes(level) || this.level === level) return;
        this.level=level; this.restart();
      },
      practice: function (item) {
        if (!item || !['glyph','parts','build','order','evidence','layout','context'].includes(item.kind)) return;
        this.level=item.level==='classic'?'classic':'mission'; this.notebookOpen=false;
        var seed=this.nextSeed(); this.writeSeed(seed); this.start(seed,item.kind);
      },
      showHint: function () {
        if (this.answered || !this.q || !this.q.hints || this.hintCount >= this.q.hints.length) return;
        this.hintCount++; this.assisted=true;
      },
      useBuildHint: function () { if (!this.answered && this.q && this.q.kind==='build') this.assisted=true; },
      reset: function () {
        this.picked = '';
        this.buildSelection=[]; this.buildReady=false; this.buildGateMessage='';
        this.selections=[]; this.hintCount=0; this.assisted=false;
        this.marks = null;
        this.answered = false;
        this.result = null;
        this.unlockNotice = '';
        this.dragIndex = null;
        this.sel = 0;      // 光标回第一格，不然会从上一题的位置接着算
        var q = this.q;
        this.tiles = (q && q.kind === 'order') ? q.tiles.map(function (t) { return t.key; }) : [];
      },

      /* ── 键盘 ─────────────────────────────────────── */

      /** 数字键。越界的直接吞掉，不报错 —— 按 4 而这道题只有 3 个选项很常见。 */
      nth: function (n) {
        if (this.done || this.answered) return;
        var q = this.q;
        if (!q) return;
        if (q.kind === 'build') return;
        if (q.kind === 'order') {
          if (n >= 1 && n <= this.tiles.length) this.sel = n - 1;
          return;
        }
        var o = q.options[n - 1];
        if (o) this.pick(o.key);
      },

      /**
       * ← → ：把**光标那一格**跟邻居换位 —— 等价于点那一格上的 ◀ ▶。
       *
       * 为什么是「换位」而不是「移动光标」：如果 ← → 只走光标，排序题就没有
       * 任何键能真正改次序了，键盘等于半残。光标改用数字键定位（选第 n 格），
       * 和选择题的「按 1 就是选第一项」共用一个心智模型。
       *
       * 换完之后光标跟着被挪的那一格走（sel = j），所以连按 → 能把同一格
       * 一路推到末尾，跟连点 ◀ ▶ 是同一种手感。
       */
      keyNudge: function (d) {
        if (this.done || this.answered) return;
        var q = this.q;
        if (!q || q.kind !== 'order') return;
        var n = this.tiles.length;
        if (this.sel < 0 || this.sel >= n) return;
        var j = this.sel + d;
        if (j < 0 || j >= n) return;
        this.nudge(this.sel, d);
        this.sel = j;
      },

      /** 空格 / 回车：没作答就提交，作答了就下一题。 */
      advance: function () {
        if (this.done) return;          // 成绩页没有「下一题」，回到 04 开头只能按 R
        if (this.answered) this.next();
        else this.submit();
      },

      /* ── 作答 ─────────────────────────────────────── */

      toggleBuildPart: function (glyph) {
        var q=this.q;
        if(this.answered || this.buildReady || !q || q.kind!=='build' || !q.componentBank || !q.componentBank.includes(glyph)) return;
        var i=this.buildSelection.indexOf(glyph);
        if(i>=0) this.buildSelection.splice(i,1);
        else if(this.buildSelection.length<2) this.buildSelection.push(glyph);
        this.buildGateMessage='';
      },
      prepareBuild: function () {
        var q=this.q;
        if(this.answered || this.buildReady || !q || q.kind!=='build' || !q.requiredParts || this.buildSelection.length!==2) return;
        if(new Set(this.buildSelection).size===2 && q.requiredParts.every(function(glyph) { return this.buildSelection.includes(glyph); },this)) {
          this.buildReady=true; this.buildGateMessage='';
        } else {
          this.assisted=true; this.buildGateMessage='这组构件不能复原目标。请取消不需要的构件，再检查目标字的结构；本题已记为使用辅助。';
        }
      },

      completeBuild: function () {
        if (!this.q || this.q.kind !== 'build' || this.answered) return;
        if(this.q.componentBank && !this.buildReady) return;
        this.pick(this.q.answer);
      },
      skipBuild: function () {
        if (!this.q || this.q.kind !== 'build' || this.answered) return;
        this.pick('__skip_build__');
      },

      pick: function (key) {
        if (this.answered) return;
        if(this.q && this.q.kind==='build' && key!== '__skip_build__' && this.q.componentBank && !this.buildReady) return;
        if (!this.q || !this.q.options || !this.q.options.some(function (o) { return o.key===key; })) {
          if (!this.q || this.q.kind!=='build' || ![this.q.answer,'__skip_build__'].includes(key)) return;
        }
        if (this.q.kind==='evidence') {
          var index=this.selections.indexOf(key);
          if (index>=0) this.selections.splice(index,1);
          else if (this.selections.length<2) this.selections.push(key);
          return;
        }
        this.picked = key;
        this.submit();          // 点即判，少一个「确认」状态
      },

      submit: function () {
        if (this.answered || !this.q) return;
        if(this.q.kind==='build' && this.q.componentBank && !this.buildReady && this.picked!=='__skip_build__') return;

        var ans;
        if (this.q.kind === 'order') {
          if (this.tiles.length !== this.q.tiles.length) return;
          ans = this.tiles.slice();
        } else if (this.q.kind==='evidence') {
          if (this.selections.length!==2) return;
          ans=this.selections.slice();
        } else {
          if (!this.picked) return;
          ans = this.picked;
        }

        var r = global.Quiz.grade(this.q, ans);
        this.result = r;
        this.marks = r.marks || null;
        this.answered = true;
        var q = this.q, response;
        if (q.kind === 'order') response = ans.join(' → ');
        else if (q.kind === 'evidence') response=q.options.filter(function (o) { return ans.includes(o.key); }).map(function (o) { return o.text; }).join('；');
        else if (q.kind === 'build') response = r.correct ? '已完成拖拽构形' : '暂时跳过';
        else {
          var chosen = q.options.find(function (o) { return o.key === ans; });
          response = chosen ? (chosen.glyphs ? chosen.glyphs.join(' + ') : chosen.text) : String(ans);
        }
        this.history.push({ id:q.id, char:q.target || q.char || q.id.split(':').pop(), label:q.label, title:q.title,
          correct:r.correct, response:response, answer:q.kind === 'order' ? q.answer.join(' → ') : this.answerText, explain:r.explain,
          points:r.correct?(this.assisted?60:100):0,assisted:this.assisted });
        if (global.ZQ.logQuizAttempt) global.ZQ.logQuizAttempt(q,this.history[this.history.length-1],this.level);
        if (r.correct) {
          this.points+=this.assisted?60:100;
          this.score++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak);
          var S = global.ZQ.store;
          if (S) {
            var target = this.q.target || this.q.char || this.q.id.split(':').pop();
            var spec = global.Components.DECOMPOSITION[target];
            var glyphs = (spec ? spec.parts.map(function (p) { return p.glyph; }) : []).concat([target]);
            var added = S.unlock(glyphs);
            if (!added.length) {
              var extra = S.palette().find(function (p) { return !S.isUnlocked(p.glyph); });
              if (extra) added = S.unlock([extra.glyph]);
            }
            S.touch(target, 'quiz');
            this.unlockNotice = added.length ? '解锁新构件：' + added.join('、') + '。前往「我的造字」使用。' : '所有构件都已解锁。';
          }
        } else this.streak = 0;
      },

      next: function () {
        if (!this.answered) return;
        if (this.last) { this.done = true; this.reviewIndex = Math.max(0, this.history.findIndex(function (item) { return !item.correct; })); return; }
        this.i++;
        this.reset();
      },

      /** 排序题：跟邻居换位。比拖拽好在两处 —— 键盘能用，测试里也是确定的两次点击 */
      nudge: function (idx, dir) {
        if (this.answered) return;
        var j = idx + dir;
        if (j < 0 || j >= this.tiles.length) return;
        var a = this.tiles[idx], b = this.tiles[j];
        this.tiles.splice(idx, 1, b);
        this.tiles.splice(j, 1, a);
      },
      dropTile: function (idx) {
        if (this.answered || this.dragIndex === null) return;
        var item = this.tiles.splice(this.dragIndex, 1)[0];
        this.tiles.splice(idx, 0, item); this.sel = idx; this.dragIndex = null;
      },

      /* ── 取数据 ───────────────────────────────────── */

      /**
       * 排序题格子的元信息。查不到时给一个**空壳**而不是 null ——
       * 返回 null 的话模板里 `tileOf(k).paths` 会当场抛，而 Vue 会把渲染期的异常
       * 吞成 console.error，页面直接白掉，报错还很难找。宁可少画一格。
       */
      tileOf: function (key) {
        return global.Quiz.tileOf(this.q, key) ||
               { key: key, label: key, period: '', note: '', paths: [] };
      },

      optClass: function (o) {
        if (this.q.kind==='evidence') {
          if (!this.answered) return {'is-picked':this.selections.includes(o.key)};
          if (this.q.answer.includes(o.key)) return 'is-ok';
          return this.selections.includes(o.key)?'is-no':'';
        }
        if (!this.answered) return { 'is-picked': o.key === this.picked };
        if (o.key === this.q.answer) return 'is-ok';    // 答错时也把正确答案标绿
        if (o.key === this.picked) return 'is-no';
        return '';
      },

      tileClass: function (idx) {
        var cls = [];
        // 光标只在还没判的时候画 —— 判完格子是金/红，再叠一个光标环就分不清了
        if (!this.answered && this.q && this.q.kind === 'order' && this.sel === idx) {
          cls.push('is-cursor');
        }
        if (this.answered && this.marks) cls.push(this.marks[idx] ? 'is-ok' : 'is-no');
        return cls;
      }
    }
  };
})(window);
