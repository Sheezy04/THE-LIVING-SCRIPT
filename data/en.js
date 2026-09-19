/* 字启千年 — 核心字一句英文释义（内容级双语）。
 * 范围=教学目录 tier=core 的 36 字，加生肖里最常用的 6 个（兔蛇猴鸡狗猪），共 42 条。
 *
 * ⚠️ 这些是**一行现代常用义**，不是学术字源结论；翻译由 AI 起草，
 * 提交/演示前请人工校对用词。渲染侧回退：lang=en 且本表缺字时显示中文释义。
 * 约束：键必须是 verify/roster.json 里的字（test-i18n.mjs 会钉住）。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  ZQ.CharEN = {
    '日': 'sun — the round sun drawn in a frame',
    '月': 'moon — a crescent that filled into a frame',
    '人': 'person — two strokes shaped like a standing figure',
    '木': 'tree — trunk with branches reaching out',
    '水': 'water — flowing streams',
    '山': 'mountain — three peaks',
    '火': 'fire — flames rising',
    '土': 'earth — a mound of soil',
    '目': 'eye — an eye turned sideways',
    '口': 'mouth — an open mouth',
    '手': 'hand — fingers over a palm',
    '心': 'heart — the organ that feels',
    '女': 'woman — a kneeling figure',
    '子': 'child — a swaddled infant',
    '田': 'field — plots divided by paths',
    '雨': 'rain — drops falling from the sky',
    '云': 'cloud — cloud and breath',
    '鱼': 'fish — a fish with scales and tail',
    '鸟': 'bird — a bird with a beak',
    '马': 'horse — a horse with mane and legs',
    '牛': 'ox — horns on a head',
    '羊': 'sheep — horns and a muzzle',
    '休': 'rest — a person leaning by a tree',
    '明': 'bright — sun and moon together',
    '林': 'grove — a great many trees',
    '森': 'forest — trees dense and deep',
    '从': 'follow — one person behind another',
    '众': 'crowd — many people together',
    '好': 'good — a sense of fondness and care',
    '安': 'peace — calm and settled',
    '石': 'stone — a rock at the foot of a cliff',
    '上': 'up — a mark above the line',
    '下': 'down — a mark below the line',
    '中': 'middle — a banner in the center',
    '果': 'fruit — fruit hanging on a tree',
    '刀': 'knife — a blade with a handle',
    '兔': 'rabbit — long ears and a short tail',
    '蛇': 'snake — a crawling reptile',
    '猴': 'monkey — a later character with a beast radical',
    '鸡': 'chicken — the simplified form pairs “又” with “bird”',
    '狗': 'dog — “beast” radical with a sound part',
    '猪': 'pig — livestock; its old name is “豕”'
  };
})(window);