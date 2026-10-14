/* Local practice analysis. Pure data functions: no network, DOM, or storage. */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {};
  var MAX = 200;
  var GROUPS = [
    { id: 'glyph', label: '字形辨认', kinds: ['glyph'], module: 'evo', tip: '对照同一个字的古今代表字形，再练习辨认。' },
    { id: 'structure', label: '构件组合', kinds: ['parts', 'meaning', 'build', 'layout'], module: 'lab', tip: '先分离构件，再观察方向、位置与组合关系。' },
    { id: 'evidence', label: '证据比较', kinds: ['evidence'], module: 'origin', tip: '先阅读字源展签，再区分材料里能证明和不能证明的结论。' },
    { id: 'context', label: '字义语境', kinds: ['context'], module: 'origin', tip: '把字放回词句，比较不同语境中的含义。' },
    { id: 'timeline', label: '时期顺序', kinds: ['order'], module: 'evo', tip: '观察时期与书写材料，再整理代表字形的顺序。' }
  ];
  function groupOf(kind) { return GROUPS.find(function (g) { return g.kinds.indexOf(kind) !== -1; }); }
  function known(ch) { return typeof ch === 'string' && Object.prototype.hasOwnProperty.call(global.CharCatalog || {}, ch); }
  function normalizeAttempts(rows) {
    return (Array.isArray(rows) ? rows : []).slice(-MAX).filter(function (row) {
      return row && typeof row.id === 'string' && row.id.length <= 100 && !!groupOf(row.kind) && known(row.char) && typeof row.correct === 'boolean';
    }).map(function (row) {
      return { id: row.id, kind: row.kind, char: row.char, correct: row.correct, assisted: row.assisted === true, level: row.level === 'classic' ? 'classic' : 'mission' };
    });
  }
  function summary(attempts, notebook) {
    var rows = normalizeAttempts(attempts);
    var pending = (Array.isArray(notebook) ? notebook : []).filter(function (item) {
      return item && item.resolved !== true && groupOf(item.kind) && known(item.char);
    }).slice().sort(function (a, b) { return (Number(b.count) || 1) - (Number(a.count) || 1); });
    var groups = GROUPS.map(function (g) {
      var sample = rows.filter(function (r) { return g.kinds.indexOf(r.kind) !== -1; });
      var correct = sample.filter(function (r) { return r.correct; }).length;
      return { id: g.id, label: g.label, tip: g.tip, module: g.module, total: sample.length, correct: correct,
        independent: sample.filter(function (r) { return r.correct && !r.assisted; }).length,
        rate: sample.length ? correct / sample.length : null };
    });
    var item = pending[0] || null;
    var group = item ? groupOf(item.kind) : GROUPS[0];
    var ch = item ? item.char : rows.length ? rows[rows.length - 1].char : '休';
    var count = item ? Math.max(1, Math.min(1000, Math.floor(Number(item.count) || 1))) : 0;
    var practiceKind = item && (item.kind === 'parts' || item.kind === 'meaning' ? 'build' : item.kind);
    var practiceLevel = practiceKind === 'glyph' || practiceKind === 'context' ? 'classic' : 'mission';
    var practiceItem = item ? Object.assign({}, item, { kind: practiceKind, level: practiceLevel }) : null;
    var recommendation = { item: practiceItem, migrated: !!item && (item.kind !== practiceKind || item.level !== practiceLevel), char: ch, module: group.module, label: group.label,
      title: item ? '先巩固「' + ch + '」的' + group.label : rows.length ? '继续观察，再试一组新题' : '从一次汉字挑战开始',
      reason: item ? '这条任务累计需巩固 ' + count + ' 次，目前还未完成巩固。' : rows.length ? '当前没有未巩固的笔记，可以尝试其他题型。' : '完成几道题后，这里会根据实际作答给出下一步建议。',
      tip: group.tip };
    return { total: rows.length, correct: rows.filter(function (r) { return r.correct; }).length,
      independent: rows.filter(function (r) { return r.correct && !r.assisted; }).length,
      pending: pending.length, groups: groups, recommendation: recommendation,
      question: (item ? '我在「' + ch + '」的' + group.label + '任务中需要再巩固。' : '我正在学习「' + ch + '」。') + group.tip + '请结合资料讲解，并给我一个自我检查的问题。请区分现代构形与历史字源，不补写未收录的资料。' };
  }
  ZQ.LearningInsights = { MAX: MAX, READ_LIMIT: MAX * (100 * 6 + 256) + 4096, normalizeAttempts: normalizeAttempts, summary: summary };
})(window);
