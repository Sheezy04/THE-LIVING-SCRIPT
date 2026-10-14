/* Shared local practice feedback. Suggestions never submit an AI request automatically. */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {};
  ZQ.LearningProfile = {
    name: 'LearningProfile', props: { compact: { type: Boolean, default: false } },
    emits: ['practice', 'ask', 'review'],
    template: [
      '<section class="zc-learning-profile" :class="{ \'is-compact\': compact }" aria-label="练习表现与学习建议">',
      ' <div class="zc-learning-intro"><h3>下一步怎么学</h3><p v-if="report.total">最近 {{ report.total }} 次作答，答对 {{ report.correct }} 次，其中 {{ report.independent }} 次未使用线索。</p><p v-else>先尝试一次挑战，逐步发现值得巩固的地方。</p><p class="zc-note">待巩固任务 {{ report.pending }} 条 · {{ saved ? \'记录保存在当前浏览器\' : \'记录仅保留在本次页面\' }}</p></div>',
      ' <div v-if="!compact" class="zc-learning-performance"><h4>我的练习表现</h4><ul>',
      '  <li v-for="g in report.groups" :key="g.id"><span>{{ g.label }}</span><span class="zc-learning-track" aria-hidden="true"><i :style="{ width: g.rate === null ? \'0%\' : Math.round(g.rate * 100) + \'%\' }"></i></span><span>{{ g.total ? g.correct + \' / \' + g.total + \' 答对\' : \'尚未练习\' }}</span></li>',
      ' </ul><p class="zc-note">仅统计本机最近 200 次作答；少量练习不代表完整知识水平。</p></div>',
      ' <div class="zc-learning-recommendation"><h4>{{ report.recommendation.title }}</h4><p>{{ report.recommendation.reason }}</p><p v-if="report.recommendation.item" class="zc-note">{{ report.recommendation.tip }}</p><div class="zc-controls">',
      '  <button class="zc-btn is-primary" @click="$emit(\'practice\', report.recommendation.item)">{{ report.recommendation.item ? \'同类巩固\' : \'开始挑战\' }}</button>',
      '  <button v-if="report.recommendation.item" class="zc-btn" @click="$emit(\'review\', report.recommendation)">先回看资料</button>',
      '  <button class="zc-text-btn" @click="$emit(\'ask\', { char: report.recommendation.char, question: report.question })">让 AI 帮我理解</button>',
      ' </div><p v-if="report.recommendation.item" class="zc-note">{{ report.recommendation.migrated ? \'旧任务将按当前题型继续练习，原笔记保留供回看。\' : \'同类巩固可能换字，原笔记会保留到对应任务答对。\' }}</p></div>',
      '</section>'
    ].join('\n'),
    computed: {
      report: function () { var learning = ZQ.learning || {}; return ZQ.LearningInsights.summary(learning.attempts, learning.mistakes); },
      saved: function () { return !!(ZQ.learning && ZQ.learning.attemptsSaved && ZQ.learning.savedLocally); }
    }
  };
})(window);
