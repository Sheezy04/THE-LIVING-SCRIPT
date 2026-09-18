/* 字启千年 — 04 汉字挑战（算法层）
 *
 * 和前面七个引擎模块不一样：01/02/03 都是「把 app.js 里已有的引擎包起来」，
 * 这里没有现成的可包 —— 四题型问答的逻辑是**新写的**。所以它照旧写成
 * 不碰 DOM 的 IIFE，就能像 test-compose.mjs 那样在 Node 里直接跑，
 * Vue 层只负责画和点。
 *
 * 四型（与页签上的说明一致）：
 *   glyph    字形寻踪    给一个古文字形，认出它是今天的哪个字
 *   parts    构形猜字    给出几个构件，猜它们能拼成哪个字
 *   meaning  字义猜构形  给出字理，猜它由哪些构件构成
 *   order    时间线排序  把打乱的几期字形排回正确的时间顺序
 *
 * ⚠️ 学术红线（和 02③ 同一条，这里更要紧，因为是要判对错的）：
 *    parts / meaning 两型**只从 Components.DECOMPOSITION 出题**，
 *    解析里的字理直接取那条记录，一个字都不现编。
 *    没有把握的构形关系宁可不考，也不能编一个「听起来对」的答案出来。
 *    古文字形本身的释读对应关系仍需人工核对（见 README 红线一节）。
 */
(function (global) {
  'use strict';

  var KINDS = ['glyph', 'parts', 'meaning', 'order'];

  var KIND_LABEL = {
    glyph: '字形寻踪',
    parts: '构形猜字',
    meaning: '字义猜构形',
    order: '时间线排序'
  };

  var OPTIONS = 4;          // 每题选项数
  var MIN_ORDER_TILES = 3;  // 排序题至少几格 —— 两格只有「正/反」两种排法，等于抛硬币
  /* 排序题**只排这三期**。楚系简帛与战国金文同属战国，跨地域强行判先后是伪知识，
   * 所以 mode-quiz 会把它们滤掉，再补一格「楷书」收尾。
   *
   * ⚠️ 这个列表**只有这一份**，mode-quiz 从 global.Quiz.ORDER_RANK 读。两份的下场
   * 就在下面那次事故里：候选门槛一度按**过滤前**的期数算，于是选出了「坐」——
   * 它的期是 楚簡/戰國金文/小篆，总数 3 过关，可落在排序集合里的只有小篆一格，
   * 题目最后只剩「小篆 + 楷书」两格，正是 MIN_ORDER_TILES 要避免的抛硬币题。 */
  var ORDER_RANK = ['甲骨文', '金文', '小篆'];
  /* 拼合行动的靶字。两个名单是**策展决定**，不是从 DECOMPOSITION 机械推的 ——
   * 但能进 BUILD_TARGETS 的必须满足两条硬约束，由界面的形状决定：
   *   ① 恰好 2 个构件 —— mode-quiz 的文案与门槛写死了「选择两个必要构件」
   *      （`buildSelection.length !== 2`），3 构件的字（坐）进不来；
   *   ② 2 个构件**互不相同** —— 否则两张牌长得一样，「换个次序」这个考点不存在，
   *      而且 componentBank 去重后会少一格（林 森 从 众 炎）。
   * 15 个可拆字里满足这两条的是 9 个，全在班上；其余 6 个进 EXCLUDED_TARGETS。
   * 它们仍然出现在别处（①认识构形、04 的字义猜构形），只是不做拖拽靶字。
   *
   * ⚠️ 扩容新增 7 字时，计划里写的是「BUILD_TARGETS 4→11」。**那是错的** ——
   *    11 会把 坐（3 构件）和 炎（同形构件）也算进来，上面的两条约束直接不成立。 */
  var EXCLUDED_TARGETS = ['林', '森', '从', '众', '炎', '坐'];
  var BUILD_TARGETS = ['休', '明', '好', '安', '鸣', '相', '岩', '男', '李'];
  var EXPLORE_TARGETS = ['日','月','山','水','木','火','人','口','目','田','雨','牛','羊'];

  /* ── 随机数：要的是**可复现**，不是「随机性够好」 ──────────────
   * 用带种子的 xorshift32，不用 Math.random()。理由只有两条，但都硬：
   *   · 演示时刷新页面应该还是同一套题，讲稿才对得上
   *   · 测试能对**具体的某一轮**断言，而不是只能断言「看起来还行」
   *
   * 种子给 0 的话 xorshift 会永远停在 0，所以兜一个非零常数。
   */
  function rng(seed) {
    var s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }
  function taskRng(seed) {
    var rnd=rng(seed);
    // 连续小种子的首个 xorshift 输出相关，预热后再抽目标，避免长期只出同一个字。
    for(var i=0;i<4;i++) rnd();
    return rnd;
  }

  /** Fisher-Yates。原地打乱并返回同一个数组 */
  function shuffle(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /**
   * 从候选里抽一个，优先抽「最近没出过的」。
   *
   * ⚠️ 刻意**不写成「抽到合格为止」的循环**。那种写法在候选池小的时候会转不出来，
   *    而这里正好有这种情况：能进拼合题的靶字一共 9 个，`avoid` 攒够就再也抽不到新的了。
   *    先过滤、空了就退回全集，一次抽定，不存在转不出来的分支。
   */
  function draw(cands, rnd, avoid, idOf) {
    if (!cands.length) return null;
    var fresh = cands;
    if (avoid && avoid.length) {
      var f = cands.filter(function (x) { return avoid.indexOf(idOf(x)) < 0; });
      if (f.length) fresh = f;
    }
    return fresh[Math.floor(rnd() * fresh.length)];
  }

  /** 选项顺序也要打乱 —— 答案永远排最后一个的话，蒙对了也不知道是不是真会 */
  function withAnswer(distractors, answer) {
    var opts = distractors.slice(0, OPTIONS - 1);
    opts.push(answer);
    return opts;
  }

  /* ── 数据源：全部**惰性读取** ─────────────────────────────
   * 模块加载时就去摸 window.__CHARS__ 的话，script 标签的先后顺序就成了隐式依赖。
   * 引擎模块向来在函数体里读，这里照旧。 */
  function AN() { return global.AncientGlyphs || null; }
  function DEC() { return (global.Components && global.Components.DECOMPOSITION) || {}; }
  function charPool() { return Object.keys(global.__CHARS__ || {}).filter(function(ch) { return !EXCLUDED_TARGETS.includes(ch); }); }
  function buildPool() { return BUILD_TARGETS.filter(function(ch) { return DEC()[ch] && global.__CHARS__ && global.__CHARS__[ch]; }); }

  function eraMeta(A, key) {
    var all = A.ERAS || [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].key === key) return all[i];
    }
    return null;
  }

  /* ── ① 字形寻踪 ─────────────────────────────────────────── */

  function buildGlyph(rnd, avoid, config) {
    var A = AN();
    if (!A) return null;

    var cands = [];
    (A.ERAS || []).forEach(function (e) {
      if (config && config.eras && !config.eras.includes(e.key)) return;
      (config && config.chars ? config.chars : charPool()).forEach(function (c) {
        if (A.has(c, e.key)) cands.push({ era: e, char: c });
      });
    });
    if (!cands.length) return null;

    var pick = draw(cands, rnd, avoid, function (x) {
      return 'glyph:' + x.era.key + ':' + x.char;
    });
    var era = pick.era, answer = pick.char;

    // 干扰项优先取「这一期也有字形」的字 —— 否则会出现「某个选项在这一期
    // 根本没有字形」，那不是干扰项，那是一条捷径
    var same = charPool().filter(function (c) { return c !== answer && A.has(c, era.key); });
    var rest = charPool().filter(function (c) { return c !== answer && same.indexOf(c) < 0; });
    var pool = same.concat(rest);

    var options = withAnswer(shuffle(pool.slice(), rnd), answer);
    shuffle(options, rnd);

    return {
      id: 'glyph:' + era.key + ':' + answer,
      kind: 'glyph',
      label: KIND_LABEL.glyph,
      // 期名**写在题干里**。这场考的是「这是哪个字」，不是「这是哪一期」——
      // 把期藏起来会变成同时在考两件事，答错了也说不清是栽在哪一件上
      title: '这是「' + era.label + '」（' + era.period + '）的写法。它是今天的哪个字？',
      glyph: { char: answer, era: era.key, paths: A.paths(answer, era.key) || [] },
      options: options.map(function (c) { return { key: c, text: c }; }),
      answer: answer,
      explain: '「' + answer + '」的' + era.label + '写法。' + era.note + '。'
    };
  }

  /* ── ② 构形猜字 ─────────────────────────────────────────── */

  function buildParts(rnd, avoid) {
    var D = DEC();
    var keys = buildPool();
    if (keys.length < OPTIONS) return null;

    var answer = draw(keys, rnd, avoid, function (k) { return 'parts:' + k; });
    var glyphs = D[answer].parts.map(function (p) { return p.glyph; });

    // 干扰项取**别的会意字**，不是从整个字库里随便抓：
    // 「亻木」摆在那里，「日」和「鱼」扫一眼就能排除，等于没有干扰项
    var others = keys.filter(function (k) { return k !== answer; });
    var options = withAnswer(shuffle(others.slice(), rnd), answer);
    shuffle(options, rnd);

    return {
      id: 'parts:' + answer,
      kind: 'parts',
      label: KIND_LABEL.parts,
      title: '这几个构件摆在一起，是今天的哪个字？',
      parts: glyphs,
      options: options.map(function (c) { return { key: c, text: c }; }),
      answer: answer,
      explain: glyphs.join(' + ') + ' = ' + answer + '。' + D[answer].relation + '。'
    };
  }

  /* ── ③ 字义猜构形 ───────────────────────────────────────── */

  function buildMeaning(rnd, avoid) {
    var D = DEC();
    var keys = buildPool();
    if (keys.length < OPTIONS) return null;

    var answer = draw(keys, rnd, avoid, function (k) { return 'meaning:' + k; });
    var want = D[answer].parts.map(function (p) { return p.glyph; });

    // 干扰项分两拨，**第一拨是定死的**：把正确次序反过来。
    // 那才是这道题真正的考点 —— 构件一样、次序不同就不是同一个字
    //（明 是日左月右，写成月左日右就不是明）。02③ 里 recognize 的 'order'
    // 近失误判说的也是这件事，两处对得上。
    // 随机的干扰项偶尔会漏掉它，考点就跟着漏掉了，所以不让它靠运气。
    var wantKey = want.join('');
    var rev = want.length > 1 ? want.slice().reverse() : null;
    var dist = [];
    // 反转等于原序的（林 的两木、从 的两人）本来就没有次序可言，不加
    if (rev && rev.join('') !== wantKey) dist.push(rev);

    var others = [];
    keys.forEach(function (k) {
      if (k !== answer) others.push(D[k].parts.map(function (p) { return p.glyph; }));
    });
    shuffle(others, rnd).forEach(function (c) {
      if (dist.length >= OPTIONS - 1) return;
      var kk = c.join('');
      if (kk === wantKey) return;
      for (var i = 0; i < dist.length; i++) if (dist[i].join('') === kk) return;
      dist.push(c);
    });

    var options = withAnswer(dist, want);
    shuffle(options, rnd);

    return {
      id: 'meaning:' + answer,
      kind: 'meaning',
      label: KIND_LABEL.meaning,
      title: '这句话说的是哪个字的构形？它由哪些构件组成？',
      relation: D[answer].relation,
      options: options.map(function (c) { return { key: c.join(''), glyphs: c }; }),
      answer: wantKey,
      explain: '「' + answer + '」：' + D[answer].relation +
               '。构件次序是 ' + want.join(' + ') + '。'
    };
  }

  /* ── ④ 时间线排序 ───────────────────────────────────────── */

  function buildOrder(rnd, avoid) {
    var A = AN();
    if (!A) return null;

    /* 门槛按**过滤后**的期数算，再减掉 mode-quiz 会补的那一格「楷书」。
     * 按过滤前的总数算就会选出「坐」那种过滤完只剩一期的字，题目退化成两格。 */
    var cands = charPool().filter(function (c) {
      return (A.erasOf(c) || []).filter(function (k) {
        return ORDER_RANK.indexOf(k) >= 0;
      }).length >= MIN_ORDER_TILES - 1;
    });
    if (!cands.length) return null;

    var ch = draw(cands, rnd, avoid, function (c) { return 'order:' + c; });

    // erasOf 已经按 ERAS 的次序给出来了，而 ERAS 是从早到晚排的 —— 那就是答案
    var answer = A.erasOf(ch);
    var tiles = answer.map(function (k) {
      var m = eraMeta(A, k);
      return {
        key: k,
        label: m ? m.label : k,
        period: m ? m.period : '',
        note: m ? m.note : '',
        paths: A.paths(ch, k) || []
      };
    });

    // 打乱，但**不能打成原序** —— 运气不好原样端出来，那题就成了送分题。
    // 重试有上限，超了就用「整体右移一格」兜底，那是确定不等于原序的
    var shown = tiles.slice();
    var moved = function () {
      return shown.some(function (t, i) { return t.key !== answer[i]; });
    };
    for (var i = 0; i < 20 && !moved(); i++) shuffle(shown, rnd);
    if (!moved()) shown = tiles.slice(1).concat([tiles[0]]);

    return {
      id: 'order:' + ch,
      kind: 'order',
      label: KIND_LABEL.order,
      title: '把下面几期字形，按时间从早到晚排好。',
      char: ch,
      // 答题时**只给材质说明不给期名**（刻于龟甲兽骨 / 书写于竹简…）。
      // 直接把「甲骨文」印在格子上，这道题就退化成念字了；
      // 而材质说明是 03 里讲过的线索，记得的人推得出来，是公平的难度
      tiles: shown,
      answer: answer,
      explain: '正确顺序：' + tiles.map(function (t) { return t.label; }).join(' → ') +
               '（' + tiles[0].period + ' → ' + tiles[tiles.length - 1].period + '）。'
    };
  }

  var BUILDERS = {
    glyph: buildGlyph,
    parts: buildParts,
    meaning: buildMeaning,
    order: buildOrder
  };

  /** 出一道某一型的题。做不出（缺数据）返回 null */
  function build(kind, rnd, avoid) {
    var f = BUILDERS[kind];
    return f ? f(rnd, avoid) : null;
  }

  /**
   * 出一整轮：四型各一道，题序打乱。
   *
   * 刻意的「各一道」而不是「随机抽四道」：随机抽某一轮可能连出两道同型，
   * 演示的时候看着像「这个模块只会出这一类题」。
   *
   * @param seed  整数种子。同一个种子 + 同一个 avoid → 同一套题
   * @param opts  { avoid: [题目 id]，最近出过的，尽量避开 }
   */
  function round(seed, opts) {
    opts = opts || {};
    var rnd = rng(seed);
    var avoid = (opts.avoid || []).slice();
    var questions = [];

    KINDS.forEach(function (k) {
      var q = build(k, rnd, avoid);
      if (!q) return;
      questions.push(q);
      // 同一轮里也别重复。四型的 id 前缀本来就不同，这一句现在不起作用 ——
      // 留着是为了「某型出两道」这种改法不会悄悄退化成出两道一模一样的题
      avoid.push(q.id);
    });

    shuffle(questions, rnd);
    return { seed: seed, questions: questions };
  }

  /* 推理任务仅考本地现代字形中可验证的构件与布局，不推断未经审核的字源。 */
  var EVIDENCE_CASES = [
    { pair:['休','明'], facts:['两字都是左右构件布局','两字都由两种不同构件组合'], traps:['两字都有「木」构件','两字都有「月」构件'], why:'相同的结构类型，不等于使用了相同的构件。' },
    { pair:['好','安'], facts:['两字都含「女」构件','「好」左右组合，「安」上下组合'], traps:['两字都含「子」构件','两字都把「女」放在左侧'], why:'同一个构件可以出现在不同位置；这里比较现代布局，不据此推定古代文化含义。' },
    { pair:['明','好'], facts:['两字都是左右布局','两字都组合了两种不同构件'], traps:['两字都重复同一种构件','两字都含「日」构件'], why:'布局相同，组成不同；不要把结构类型当成唯一的认字线索。' },
    { pair:['休','好'], facts:['两字都是左右布局','「休」左侧是亻，「好」左侧是女'], traps:['两字右侧构件相同','两字左侧都是亻'], why:'先分别确认左右构件，再比较哪些关系相同、哪些不同。' },
    { pair:['休','安'], facts:['「休」左右组合，「安」上下组合','两字都由两个不同构件组成'], traps:['两字的构件位置可以直接互换','两字都把宀放在顶部'], why:'两构件并不总用左右结构；数量相同不等于空间关系相同。' },
    { pair:['明','安'], facts:['「明」左右组合，「安」上下组合','两字没有相同的现代构件'], traps:['两字都有月构件','两字的构件都左右并排'], why:'同时检查构件身份与结构，不能只凭一个共同特征下结论。' }
  ];

  function buildEvidence(rnd, avoid) {
    var cases = EVIDENCE_CASES.filter(function (c) { return c.pair.every(function (ch) { return global.__CHARS__ && global.__CHARS__[ch]; }); });
    var c = draw(cases, rnd, avoid, function (x) { return 'evidence:' + x.pair.join(':'); });
    if (!c) return null;
    var options = c.facts.map(function (text,i) { return {key:'fact-' + i,text:text}; })
      .concat(c.traps.map(function (text,i) { return {key:'trap-' + i,text:text}; }));
    return { id:'evidence:' + c.pair.join(':'), kind:'evidence', label:'双字取证', char:c.pair[1],
      title:'别急着猜字。找出两条能从这两枚现代字形直接验证的证据。',
      exhibits:c.pair.map(function (ch) { return {char:ch,paths:global.__CHARS__[ch].strokes}; }),
      options:shuffle(options,rnd), answer:['fact-0','fact-1'],
      hints:['先数清构件，再观察左右或上下关系。','每条证据都必须对两枚展示字形成立，不能只检查其中一个。'],
      explain:c.facts.join('；') + '。' + c.why + ' 本题只讨论所展示的现代字形。' };
  }

  function buildLayout(rnd, avoid) {
    var keys = buildPool();
    var ch = draw(keys,rnd,avoid,function (x) { return 'layout:' + x; });
    if (!ch) return null;
    var dec = global.Components.decompose(ch,global.__CHARS__[ch]);
    if (!dec || !dec.valid) return null;
    var index = Math.floor(rnd()*dec.parts.length), p = dec.parts[index], box=p.bbox;
    var identity = dec.parts.map(function () { return ''; });
    var variants = [
      {key:'restore', transforms:identity.slice(), issue:'构件位置、方向和比例与本地规范字形一致。'},
      {key:'tilt', transforms:identity.slice(), issue:'一个构件被斜置，方向发生了改变。'},
      {key:'shift', transforms:identity.slice(), issue:'一个构件被挪动，破坏了原有的空间关系。'},
      {key:'scale', transforms:identity.slice(), issue:'一个构件被放大，挤占了其他构件的空间。'}
    ];
    // 使用斜置而非镜像；对称构件镜像可能无变化。
    variants[1].transforms[index]='rotate(12 ' + box.cx + ' ' + box.cy + ')';
    variants[1].issue='一个构件被斜置，方向与展示的现代规范字形不一致。';
    variants[2].transforms[index]='translate(' + (box.cx<512?80:-80) + ',' + (box.cy<388?65:-65) + ')';
    variants[3].transforms[index]='translate(' + box.cx + ',' + box.cy + ') scale(1.18) translate(' + (-box.cx) + ',' + (-box.cy) + ')';
    var options=shuffle(variants,rnd).map(function (v,i) {
      return {key:v.key,text:'草稿 ' + String.fromCharCode(65+i),issue:v.issue,
        fragments:dec.parts.map(function (part,k) { return {paths:part.d,transform:v.transforms[k]}; })};
    });
    return {id:'layout:' + ch,kind:'layout',label:'构形校勘',char:ch,
      title:'四份草稿用了同样的构件。哪份恢复了现代「' + ch + '」的规范布局？',
      options:options,answer:'restore',hints:['不只看构件有没有，还要看方向、位置与比例。','逐一检查每个构件；偏斜、挤压或位移都可能是破绽。'],
      explain:'构件相同，不等于布局正确。' + DEC()[ch].relation + '。本题匹配本地现代规范字形，不判断其他组合是否为真实汉字。'};
  }

  /* 干扰构件**派生**，不手写。
   *
   * 从前这里是一张逐字字典 {休:['女','日'], 明:['木','子'], …}。扩容时每多一个
   * 靶字都得记得补一行，漏了就是 `recipe.concat(undefined)` —— componentBank 里
   * 混进一个 undefined，界面上是一个点了没反应的空白按钮（test-quiz-levels 那条
   * 「componentBank 四个互不相同」会抓到，但那要等到用例恰好抽中那个靶字）。
   * 改成从**全部可拆字的构件池**里按种子抽两个：加多少字都不用维护，
   * 且抽出来的必然是真实出现过的意符，不会是「木」旁边配一个「丿」。
   */
  function distractorsFor(recipe, rnd) {
    var D = DEC(), pool = [];
    Object.keys(D).forEach(function (ch) {
      D[ch].parts.forEach(function (p) {
        if (pool.indexOf(p.glyph) < 0) pool.push(p.glyph);
      });
    });
    var cands = pool.filter(function (g) { return recipe.indexOf(g) < 0; });
    var out = [];
    while (out.length < 2 && cands.length) {
      out.push(cands.splice(Math.floor(rnd() * cands.length), 1)[0]);
    }
    return out;
  }

  function mission(seed, opts) {
    opts=opts || {};
    var rnd=taskRng(seed ^ 0x7b31), avoid=(opts.avoid || []).slice();
    var questions=[buildLayout(rnd,avoid),buildEvidence(rnd,avoid),buildOrder(rnd,avoid),buildMeaning(rnd,avoid)].filter(Boolean).map(function(q) {
      if (q.kind==='layout' || q.kind==='evidence') return Object.assign({},q,{difficulty:'reason'});
      var target=q.id.split(':').pop(), recipe=q.kind==='meaning'?DEC()[target].parts.map(function(p) { return p.glyph; }):null;
      return Object.assign({},q,{label:q.kind==='order'?'时间档案':'拼合行动',
        difficulty:'reason',
        requiredParts:recipe,
        componentBank:recipe?shuffle(recipe.concat(distractorsFor(recipe,rnd)),rnd):null,
        hints:q.kind==='order'?['结合载体、书写方式和方整程度判断，不只猜图案。','未收录阶段不参与排序；同一大时期的地域字形不强行排先后。']:['先判断构件应当并排还是上下组合，再调整位置。'],
        title:q.kind==='meaning'?'复原现代「' + target + '」：先从四个构件中选出需要的两个，再拖拽恢复布局。':q.title});
    });
    return {seed:seed,questions:shuffle(questions,rnd)};
  }

  /* 轻松探索独立题池：只做单步单选，不混入校勘、取证、排序或拖拽。 */
  var CONTEXT_CASES = [
    {char:'山',scene:'旅行日记写着：登上高峰，俯瞰群岭。哪一个字最适合作为这页的主题标签？',others:['水','雨','田'],why:'高峰与群岭对应山。'},
    {char:'水',scene:'展签描述：溪流汇入江河，沿河道流动。哪一个字最贴切？',others:['火','山','土'],why:'溪流与江河都以水为主体。'},
    {char:'月',scene:'夜晚记录写着：抬头看见一弯新月。哪一个字适合作为画面的主角？',others:['日','目','田'],why:'这里观察的是月亮，而不是太阳或眼睛。'},
    {char:'日',scene:'摄影说明写着：太阳刚升起，白天开始了。哪一个字同时关联太阳与白天？',others:['月','火','心'],why:'日的现代字义包括太阳、白天。'},
    {char:'木',scene:'材料标签写着：取自树干，可以加工为木材。应该选择哪个字？',others:['土','水','山'],why:'木既表示树木，也表示木材。'},
    {char:'火',scene:'观察笔记写着：燃料正在燃烧，火焰不断跃动。哪一个字最贴切？',others:['日','雨','水'],why:'燃烧产生的火焰对应火，发光并不都意味着太阳。'},
    {char:'目',scene:'图标要表达：用眼睛观察、看清细节。哪一个字最适合作为标签？',others:['口','手','心'],why:'目表示眼睛；口、手和心分别对应其他身体或内心概念。'},
    {char:'心',scene:'创作说明要表达：内心的情感与想法，而不是身体的动作。哪一个字最贴切？',others:['手','目','口'],why:'心的现代字义包含内心，也用于思想和情感的表达。'},
    {char:'田',scene:'地图图例标注的是：耕种作物的一片土地。应该选择哪个字？',others:['山','水','木'],why:'田表示耕种的田地；不是所有地形都属于田。'},
    {char:'雨',scene:'天气记录写着：水滴从天空落下，地面渐渐湿了。哪一个字最贴切？',others:['云','水','日'],why:'从天空落下的水滴形成雨，云与地面的水不等于降雨本身。'},
    {char:'口',scene:'构件标签要表达：嘴或开口，而不是眼睛。应该选择哪个字？',others:['目','心','手'],why:'口的现代字义包含嘴和开口。'},
    {char:'手',scene:'创作说明写着：亲手触摸、抓握和操作。哪一个字与这些动作最直接关联？',others:['目','心','口'],why:'手表示手部，也用于亲自操作等表达。'}
  ];
  function buildContext(rnd,avoid) {
    var item=draw(CONTEXT_CASES.filter(function(x) { return global.__CHARS__ && global.__CHARS__[x.char]; }),rnd,avoid,function(x) { return 'context:'+x.char; });
    if(!item) return null;
    return {id:'context:'+item.char,kind:'context',char:item.char,label:'字义入境',difficulty:'explore',title:item.scene,
      guide:'结合这段现代生活情境选择一个字，不需要猜古代字源。',
      options:shuffle(withAnswer(item.others,item.char),rnd).map(function(ch) { return {key:ch,text:ch}; }),answer:item.char,explain:item.why};
  }
  function buildExploreGlyph(rnd,avoid) {
    var q=buildGlyph(rnd,avoid,{chars:EXPLORE_TARGETS.filter(function(ch) { return global.__CHARS__ && global.__CHARS__[ch]; }),eras:['甲骨文','金文']});
    if(!q) return null;
    return Object.assign({},q,{difficulty:'explore',label:'古今相认',guide:'观察整体轮廓，找到相应的现代字；这里只做一次单选，不要求判断演变顺序。'});
  }
  function explore(seed,opts) {
    var rnd=taskRng(seed ^ 0x41c9),avoid=((opts || {}).avoid || []).slice(),questions=[];
    [buildExploreGlyph,buildContext,buildExploreGlyph,buildContext].forEach(function(builder) { var q=builder(rnd,avoid); if(q) { questions.push(q); avoid.push(q.id); } });
    return {seed:seed,questions:shuffle(questions,rnd)};
  }

  /**
   * 判分。
   * @param q     题目
   * @param ans   选择题 = 选中项的 key；排序题 = 期 key 的数组
   * @returns {correct, answer, marks?, explain}
   *          marks 只有排序题有：逐格对不对，UI 拿它上色
   */
  function grade(q, ans) {
    if (!q) return { correct: false, answer: null, explain: '' };

    if (q.kind==='evidence') {
      var selected=Array.isArray(ans)?ans:[];
      return {correct:selected.length===q.answer.length && new Set(selected).size===selected.length && q.answer.every(function (key) { return selected.includes(key); }),answer:q.answer.slice(),explain:q.explain};
    }

    if (q.kind==='layout') {
      var choice=q.options.find(function (o) { return o.key===ans; });
      return {correct:ans===q.answer,answer:q.answer,explain:(choice?'你选择的' + choice.text + '：' + choice.issue + ' ':'') + q.explain};
    }

    if (q.kind === 'order') {
      var want = q.answer.slice();
      var got = (ans || []).slice();
      var marks = want.map(function (k, i) { return got[i] === k; });
      var all = got.length === want.length && marks.every(Boolean);
      return { correct: all, answer: want, marks: marks, explain: q.explain };
    }

    return { correct: ans === q.answer, answer: q.answer, explain: q.explain };
  }

  global.Quiz = {
    KINDS: KINDS,
    KIND_LABEL: KIND_LABEL,
    MIN_ORDER_TILES: MIN_ORDER_TILES,
    ORDER_RANK: ORDER_RANK.slice(),
    rng: rng,
    shuffle: shuffle,
    build: build,
    round: round,
    mission: mission,
    explore: explore,
    BUILD_TARGETS: BUILD_TARGETS.slice(),
    EXCLUDED_TARGETS: EXCLUDED_TARGETS.slice(),
    practice: function (kind,seed,opts) {
      var rnd=taskRng(seed),level=(opts || {}).level,q;
      if(level==='classic') q=kind==='glyph'?buildExploreGlyph(rnd,[]):buildContext(rnd,[]);
      else if(level==='mission') {
        var targetKind=kind==='evidence'?'evidence':kind==='order'?'order':kind==='build'||kind==='meaning'?'meaning':'layout';
        q=mission(seed).questions.find(function(item) { return item.kind===targetKind; });
      }
      else q=kind==='context'?buildContext(rnd,[]):kind==='evidence'?buildEvidence(rnd,[]):kind==='layout'?buildLayout(rnd,[]):build(kind==='build'?'meaning':kind,rnd,[]);
      return {seed:seed,questions:q?[q]:[]};
    },
    grade: grade,
    // 给 UI 用：题目里那一格的元信息
    tileOf: function (q, key) {
      var t = (q && q.tiles) || [];
      for (var i = 0; i < t.length; i++) if (t[i].key === key) return t[i];
      return null;
    }
  };
})(window);
