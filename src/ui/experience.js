/* 收藏、朗读、练习笔记与阅读设置：独立本机记录，不改写造字备份格式。 */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {}, key = 'zq-favorites-v1', saved = [];
  try { saved = JSON.parse(global.localStorage.getItem(key) || '[]'); } catch (e) {}
  /* 收藏去重、按教学目录白名单过滤。**不设条数上限** —— 白名单本身就把结果钉在
   * 目录大小以内（每条是一个汉字字符串，128 条也就几百字节），再叠一个 30 只是
   * 让第 31 个收藏在下次打开时安静消失。原来那个 slice(0,30) 是字表还只有 30 字
   * 时写的，字表长到 128 之后它就从「上限」变成了「静默丢数据」。 */
  function normalize(items) { return Array.isArray(items) ? Array.from(new Set(items)).filter(function (c) { return typeof c === 'string' && Object.prototype.hasOwnProperty.call(global.CharCatalog || {}, c); }) : []; }
  ZQ.preferences = global.Vue.reactive({ favorites:normalize(saved), savedLocally:true });
  var notebookKey='zq-practice-notebook-v1', viewKey='zq-workspace-view-v1';
  var taskKinds=['glyph','parts','build','order','evidence','layout','context'];

  /* ── 笔记容量：三个数必须一起动 ─────────────────────────────────────────
   * 条数上限、单条体积上界、读入守卫。原来它们是 30 / （没写）/ 200000 三个
   * 各写各的数 —— 字表只有 30 字时看不出问题，字表到 128 之后 30 条就成了
   * 静默丢数据，而**更糟的是**：一旦自己写出去的那份超过读入守卫，readLocal
   * 会连整本笔记一起丢掉，紧接着 persistNotebook 再把空数组写回去，
   * 用户的笔记就在一次打开里没了。所以守卫这里改成**从上限推导**，
   * 而不是手填 —— 推导出来的守卫容得下我们自己写的最大一份，也就永远不会
   * 对我们自己的数据开火。test-experience.mjs 会真造 120 条满字段记录验这一点。
   * 规模按 100~120 条设计，不再往上做。 */
  var NB_MAX=120;
  var NB_TEXT={label:30,title:180,response:300,answer:300,explain:700};
  var NB_OVERHEAD=256;   /* id(≤100)/kind/level/count/resolved 等短字段 + JSON 键名、引号、逗号 */
  var NB_ENTRY_BOUND=NB_TEXT.label+NB_TEXT.title+NB_TEXT.response+NB_TEXT.answer+NB_TEXT.explain+NB_OVERHEAD;
  var NB_READ_LIMIT=NB_MAX*NB_ENTRY_BOUND+4096;

  function text(value,n) { return typeof value==='string'?value.replace(/[\r\n\t]+/g,' ').slice(0,n):''; }
  function normalizeNotebook(raw) {
    if (!Array.isArray(raw)) return [];
    var ids=new Set();
    /* 先只看最新 NB_MAX 条再过滤：写入端一直是「新的 unshift 到头部」，
     * 所以超出上限时要丢的是尾部那些旧的。两个 slice 都取 NB_MAX ——
     * 原来写的是 60 和 30，上限提到 120 之后那个 60 会变成新的截断点。 */
    return raw.slice(0,NB_MAX).filter(function (item) {
      if (!item || typeof item!=='object' || typeof item.id!=='string' || item.id.length>100 || ids.has(item.id) || !taskKinds.includes(item.kind) || typeof item.char!=='string' || !Object.prototype.hasOwnProperty.call(global.CharCatalog || {},item.char)) return false;
      ids.add(item.id); return true;
    }).slice(0,NB_MAX).map(function (item) {
      var count=typeof item.count==='number' && isFinite(item.count)?item.count:1;
      return {id:item.id,kind:item.kind,char:item.char,level:item.level==='classic'?'classic':'mission',label:text(item.label,NB_TEXT.label),title:text(item.title,NB_TEXT.title),response:text(item.response,NB_TEXT.response),answer:text(item.answer,NB_TEXT.answer),explain:text(item.explain,NB_TEXT.explain),count:Math.max(1,Math.min(1000,Math.floor(count))),resolved:item.resolved===true};
    });
  }
  function readLocal(key,fallback,limit) {
    try { var raw=global.localStorage.getItem(key); return raw && raw.length<(limit||200000)?JSON.parse(raw):fallback; } catch(e) { return fallback; }
  }
  var localOK=!!(ZQ.store && ZQ.store.status.available);
  ZQ.learning=global.Vue.reactive({mistakes:normalizeNotebook(readLocal(notebookKey,[],NB_READ_LIMIT)),savedLocally:localOK});
  var view=readLocal(viewKey,{});
  ZQ.workspace=global.Vue.reactive({largeText:!!(view && view.largeText===true),lang:view && view.lang==='en'?'en':'zh',savedLocally:localOK});
  function persistNotebook() {
    try { var raw=JSON.stringify(ZQ.learning.mistakes); global.localStorage.setItem(notebookKey,raw); ZQ.learning.savedLocally=global.localStorage.getItem(notebookKey)===raw; }
    catch(e) { ZQ.learning.savedLocally=false; }
  }
  ZQ.logQuizAttempt=function (q,attempt,level) {
    if (!q || !attempt || typeof q.id!=='string' || !taskKinds.includes(q.kind) || typeof attempt.char!=='string' || !Object.prototype.hasOwnProperty.call(global.CharCatalog || {},attempt.char)) return;
    var list=ZQ.learning.mistakes, index=list.findIndex(function (item) { return item.id===q.id; });
    if (attempt.correct) { if(index>=0) { list[index].resolved=true; persistNotebook(); } return; }
    var prior=index>=0?list.splice(index,1)[0]:null;
    list.unshift({id:q.id,kind:q.kind,char:attempt.char,level:level,label:q.label,title:q.title,response:attempt.response,answer:attempt.answer,explain:attempt.explain,count:prior?Math.min(1000,prior.count+1):1,resolved:false});
    ZQ.learning.mistakes=normalizeNotebook(list); persistNotebook();
  };
  ZQ.setLargeText=function (value) {
    ZQ.workspace.largeText=value===true;
    try { var raw=JSON.stringify({largeText:ZQ.workspace.largeText}); global.localStorage.setItem(viewKey,raw); ZQ.workspace.savedLocally=global.localStorage.getItem(viewKey)===raw; }
    catch(e) { ZQ.workspace.savedLocally=false; }
  };
  /* 界面语言（zh/en）：随 workspace 持久化，与 setLargeText 同一套本地存储。 */
  ZQ.setLang=function (value) {
    var lang = value==='en'?'en':'zh';
    ZQ.workspace.lang=lang;
    try { var raw=JSON.stringify({largeText:ZQ.workspace.largeText,lang:ZQ.workspace.lang}); global.localStorage.setItem(viewKey,raw); ZQ.workspace.savedLocally=global.localStorage.getItem(viewKey)===raw; }
    catch(e) { ZQ.workspace.savedLocally=false; }
  };
  ZQ.projectAudit=function () {
    /* 分母只数**非关联字** —— 就是 data/chars.js 的那一集（verify/test-roster.mjs 的 A）。
     * tier=related 的字按设计不产古文字（只做图鉴、关系网与题池），算进来会凭空多出
     * 一批「本来就该缺」的缺口，把健康读数变成噪声。 */
    var chars=Object.keys(global.CharCatalog || {}).filter(function (ch) {
      var entry=global.CharCatalog[ch]; return !entry || entry.tier!=='related';
    }), A=global.AncientGlyphs, eras=A?A.ERAS:[], available=0, unresolved=0;
    chars.forEach(function(ch) { eras.forEach(function(era) { if(A.has(ch,era.key)) { available++; var source=A.eraSource(era.key); if(!source || source.license_ok!==true) unresolved++; } }); });
    var evidence=global.XiaoxueEvidence, records=evidence && Array.isArray(evidence.records)?evidence.records:[];
    return {chars:chars.length,ancientSlots:chars.length*eras.length,ancientAvailable:available,ancientMissing:chars.length*eras.length-available,licensePending:unresolved,liAvailable:!!(A && chars.some(function(ch) { return A.has(ch,'隶书'); })),
      evidenceRecords:records.length,evidenceChars:new Set(records.map(function(r) { return r.char; })).size,evidenceLiChars:new Set(records.filter(function(r) { return r.category==='lishu'; }).map(function(r) { return r.char; })).size,
      storage:!!(ZQ.store && ZQ.store.status.available),svg:!!global.Positioner && !!global.StrokeRenderer,canvas:typeof global.Path2D==='function',pointer:typeof global.PointerEvent==='function'};
  };
  ZQ.toggleFavorite = function (ch) {
    if (typeof ch !== 'string' || !Object.prototype.hasOwnProperty.call(global.CharCatalog || {}, ch)) return false;
    var list = ZQ.preferences.favorites, n = list.indexOf(ch);
    if (n >= 0) list.splice(n, 1); else list.push(ch);
    try { global.localStorage.setItem(key, JSON.stringify(list)); ZQ.preferences.savedLocally = true; }
    catch (e) { ZQ.preferences.savedLocally = false; }
    return list.includes(ch);
  };
  ZQ.speakChar = function (ch, report) {
    report = report || function () {};
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) { report('此浏览器不支持朗读，请参考拼音。'); return false; }
    var voice = global.speechSynthesis.getVoices().find(function (v) { return v.localService === true && /^zh(?:$|-|_)/i.test(v.lang); });
    if (!voice) { report('未找到本机中文语音，请参考拼音；无需联网。'); return false; }
    var speech = new global.SpeechSynthesisUtterance(ch);
    speech.voice = voice; speech.lang = voice.lang; speech.rate = .75;
    speech.onend = function () { report(''); }; speech.onerror = function () { report('朗读未完成，请参考拼音。'); };
    global.speechSynthesis.cancel(); global.speechSynthesis.speak(speech); report('正在朗读「' + ch + '」'); return true;
  };
})(window);
