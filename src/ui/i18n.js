/* 字启千年 — 界面外壳双语（zh / en）。
 *
 * 只覆盖**界面文案**（导航 / 按钮 / 标签 / 帮助 / 状态栏 / 空态提示）；
 * 内容级双语（每字一句英文释义）在 data/en.js（ZQ.CharEN）。
 * 英文缺键自动回退中文；tr() 只回显，无副作用。接入方式：组件混入
 * ZQ.i18nMixin，模板里用 {{ tr('key') }}。详情见 index.html 的加载顺序。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  var zh = {
    /* 顶部导航 */
    mod_home: '首页', mod_origin: '汉字探索', mod_evo: '千年演变', mod_lab: '构形实验室',
    mod_quiz: '汉字挑战', mod_mine: '我的造字', mod_graph: '汉字关系网',
    help_open: '使用帮助', help_close: '关闭', lang_toggle: 'EN', lang_toggle_cn: '中',
    next_go_home: '回到首页', next_stop: '下一站 · ',
    /* 状态栏 */
    metric_explored: '探索', metric_parts: '构件', metric_works: '作品',
    session_mode: '会话模式 · 请备份字库',
    journey_guided: 'GUIDED JOURNEY · 体验路线', journey_own: 'YOUR SCRIPT JOURNEY · 探索记录',
    journey_origin: '认识「{{char}}」的构形与字义', journey_evo: '观察古今字形的变化',
    journey_lab: '拖开构件，再试一次拼字', journey_quiz: '通过挑战解锁创作构件',
    journey_mine: '组合构件，赋义并生成海报', journey_free: '自由探索 · 关系网不计入体验路线',
    journey_mine_home: '探索、理解、创作。一个字的新故事，从你开始。', journey_default: '继续这次探索，让一个字成为你的创作元素。',
    /* 首页 */
    home_start: '开始探索', home_tour: '3 分钟体验路线', home_progress: '探索足迹',
    home_from: '从这个字开始', home_kicker_lead: 'A JOURNEY THROUGH CHARACTERS',
    home_story_title: '一个字，如何走过千年？', home_story_pre: '先看一个故事，再亲手探索',
    home_story_pick: '选择字形故事', home_story_more: '继续观察「{{char}}」的演变',
    home_story_ref: '文字说明参考 · 教育部《异体字字典》', home_story_label: '字形小故事',
    home_family_label: '构形的另一种可能', home_note_stage: '代表字形演示 · 非完整字源记录',
    home_note_story: '以上为代表字形选览，省略了部分阶段，并非完整或唯一的线性演变链；素材来自外部字形资料，逐格来源与使用依据可在展签查看。',
    home_note_family: '这是构形联系，不是「木」逐渐变成「森」的历史演变。',
    home_collect_pre: '第一辑 · 从自然形象到构件组合', home_bg: '全站背景：',
    home_themes_kicker: 'THEME PACKS · 主题字包', home_themes_title: '沿着一个主题，读一组字',
    home_themes_sub: '给已收录的字分组，不是新增内容', home_themes_pick: '选择主题',
    home_themes_partial: '{{label}}主题暂收录 {{count}} 个字，其余待资料收齐后补充。',
    play: '播放', pause: '暂停', play_label: '播放首页字形动画', pause_label: '暂停首页字形动画',
    /* 01 汉字探索 */
    origin_tab_meaning: '字义与构形', origin_tab_source: '字源展签', origin_tab_writing: '书写操作',
    origin_note_none: '此字暂无古文字字形。', origin_note_glyph: '代表字形展示 · 非完整考古记录',
    origin_speak: '朗读', origin_speak_fallback: '朗读不可用，显示拼音', origin_fav_add: '收藏', origin_fav_remove: '取消收藏',
    origin_fav_session: '收藏仅在本次会话保留。',
    /* 02 千年演变 */
    evo_tab_stage: '阶段说明', evo_tab_pick: '选择汉字', evo_overview: '并览', evo_compare: '对比',
    evo_play: '播放演变', evo_pause: '暂停演变', evo_prev: '上一期', evo_next: '下一期', evo_reset: '回到第一期',
    /* 03 构形实验室 */
    lab_tab_know: '认识构形', lab_tab_chal: '目标拼合', lab_to_create: '用这些构件去创作',
    /* 04 汉字挑战 */
    quiz_level_classic: '轻松探索', quiz_level_mission: '推理挑战',
    quiz_submit: '提交', quiz_next: '下一题', quiz_score: '看成绩', quiz_again: '再来一轮',
    quiz_learn: '回到这个字', quiz_to_create: '前往创作', quiz_need_hint: '需要一条线索？', quiz_more_hint: '再看一条线索',
    quiz_answer_ok: '答对了', quiz_answer_no: '答错了', quiz_answer_skip: '本题跳过', quiz_answer: '正确答案',
    quiz_unlock: '解锁新构件', quiz_dialog_still: '继续', quiz_done: '完成',
    /* 05 我的造字 */
    mine_tab_create: '创作', mine_tab_poster: '海报', mine_tab_library: '字库', mine_tab_backup: '备份',
    mine_tab_edit: '构件编辑', mine_tab_meaning: '赋予含义', mine_tab_style: '海报设置',
    mine_name_style: '名称与海报风格', mine_give_meaning: '给作品赋义', mine_mean_label: '我的字代表什么？',
    mine_name_label: '创作名（可选）', mine_style_label: '海报风格', mine_style_paper: '纸白展签', mine_style_ink: '深墨夜色',
    mine_summary_glyphs: '构形：', mine_summary_layout: '布局：', mine_wait: '等待选择构件',
    mine_free_layout: '自由布局', mine_generate: '生成数字海报', mine_save: '保存到我的字库',
    mine_export_png: '重新导出 PNG', mine_share: '分享', mine_edit: '继续编辑', mine_delete: '删除作品：',
    mine_untitled: '未命名创作', mine_library_title: '我的字库', mine_library_empty: '还没有保存的作品，回到「创作」组合构件并赋予含义。',
    mine_prev_page: '上一页', mine_next_page: '下一页', mine_unlocked: '构件已解锁',
    mine_draft_saved: '草稿已自动保存在本机', mine_draft_session: '草稿仅保留在本次会话；请保存作品并备份',
    mine_draft_restored: '已恢复上次编辑的草稿', mine_draft_auto: '草稿会自动保存',
    mine_backup_title: '备份与恢复我的作品', mine_backup_note: '记录保存在本机浏览器。可复制备份码，在另一台电脑上粘贴恢复；恢复时会合并作品。',
    mine_backup_btn: '生成备份码', mine_restore_btn: '恢复备份',
    mine_logo: '个人数字汉字创作', mine_mine_intro: '摆放构件，赋予含义，让一次汉字探索成为你的作品。',
    mine_notice_saved: '作品已保存在本机字库。', mine_notice_session: '作品保存在本次会话，请使用备份码带走记录。',
    mine_share_title: '分享这份数字汉字创作', mine_share_desc: '链接已生成。打开链接的人会先看到作品预览，确认后才保存到自己字库；作品编码在网址里，无需服务器。',
    mine_share_label: '分享链接', mine_share_copy: '复制链接', mine_share_copied: '已复制到剪贴板。',
    mine_share_copy_manual: '复制失败，请手动选中链接复制。', mine_share_copy_manual2: '请手动选中链接复制。',
    mine_share_note: '链接是相对路径 `index.html#share=…`：把整个项目文件夹复制到任何一台电脑，或放到任意静态托管上打开即可；只含该件作品的构件与布局，不含草稿与字库备份。',
    mine_shared_title: '收到的作品', mine_shared_parts: '构件：',
    mine_shared_save: '保存到我的字库', mine_shared_note: '来自分享链接，确认后才写入你的本机字库。',
    mine_shared_bad: '链接无效或已损坏，无法读取作品。', mine_shared_empty: '分享链接缺少作品内容。',
    /* 06 汉字关系网 */
    graph_back: '返回上一个字', graph_legend_line: '实线是构形关系', graph_legend_dash: '虚线是相关字',
    graph_none: '此字暂无关联', graph_read_first: '画布下方写着实线与虚线各是什么',
    /* 选字面板 */
    pick_search: '搜索汉字 / 拼音 / 字义', pick_cancel: '取消', pick_fav_only: '只看收藏',
    pick_title: '选择一个字',
    /* 帮助 */
    help_title: '体验指南', help_note_keys: '书写与演变：空格播放/暂停，R 回到起点；挑战：空格提交/继续；创作：方向键微调，Shift + 方向键大步移动，R 清空（可撤销）。输入文字与打开对话面板时，底层快捷键暂停。',
    help_read_setting: '阅读设置', help_large_text: '使用大字阅读', help_std_text: '恢复标准字号',
    help_read_note: '只调整说明与工具字号，不改变画布尺寸和背景浓度。',
    help_saved_local: '设置保存于本机。', help_session_only: '设置仅在本次会话生效。',
    help_health: '运行环境与资料自检', help_health_note: '接口可用不等于实际拖拽、下载或跨浏览器验收通过；资料统计不等于内容与许可审核通过。',
    /* 许可统计仅是来源条款状态，不等于第三方权利或专业释读已通过审核。 */
    help_health_chars: '检测 {{n}} 字；现有 {{s}} 个古文字资料槽位中 {{a}} 个有字形，{{m}} 个缺失；{{d}} 个已有使用依据说明，{{p}} 个仍待核对。',
    help_storage: '本机作品保存', help_ok: '可用', help_session: '会话模式，请使用字库备份',
    help_svg: 'SVG 书写引擎', help_loaded: '已加载', help_missing: '缺少引擎',
    help_canvas: 'Canvas 轮廓接口', help_ptr: '指针接口', help_no_ptr: '未检测到，请检查浏览器',
    help_li: '隶书', help_li_no: '尚未收录，不以其他阶段冒充',
    guide_home_title: '从一个字开始', guide_origin_title: '观察一个字', guide_evo_title: '比较，而不只记顺序',
    guide_lab_title: '理解已有字，再去创作', guide_quiz_title: '两条路线，两种体验', guide_mine_title: '让构件表达你的含义',
    guide_graph_title: '沿关系走过去'
  };

  var en = {
    mod_home: 'Home', mod_origin: 'Explore', mod_evo: 'Evolution', mod_lab: 'Structure Lab',
    mod_quiz: 'Challenge', mod_mine: 'Create', mod_graph: 'Character Web',
    help_open: 'Help', help_close: 'Close', lang_toggle: '中', lang_toggle_cn: 'ZH',
    next_go_home: 'Back to Home', next_stop: 'Next · ',
    metric_explored: 'Explored', metric_parts: 'Parts', metric_works: 'Works',
    session_mode: 'Session mode · back up your library',
    journey_guided: 'GUIDED JOURNEY · 3-minute route', journey_own: 'YOUR SCRIPT JOURNEY · exploration log',
    journey_origin: 'Learn the structure and meaning of “{{char}}”', journey_evo: 'Watch how the shape changed over time',
    journey_lab: 'Pull the parts apart, then compose once more', journey_quiz: 'Unlock parts through challenges',
    journey_mine: 'Combine parts, give meaning, make a poster', journey_free: 'Free exploration · the web is not on the guided route',
    journey_mine_home: 'Explore, understand, create. A new story for a character begins with you.',
    journey_default: 'Continue this journey and let a character become your creation.',
    home_start: 'Start Exploring', home_tour: '3-minute route', home_progress: 'Footprints',
    home_from: 'Start with', home_kicker_lead: 'A JOURNEY THROUGH CHARACTERS',
    home_story_title: 'How did one character walk across a thousand years?', home_story_pre: 'Read a story, then explore it yourself',
    home_story_pick: 'Pick a story', home_story_more: 'Keep observing “{{char}}” through time',
    home_story_ref: 'Reference · MOE Dictionary of Chinese Character Variants', home_story_label: 'Story of a character',
    home_family_label: 'Another way structure works', home_note_stage: 'Representative glyphs · not a full textual record',
    home_note_story: 'A selection of representative glyphs with stages omitted — not a complete or single line of evolution. Source and use-basis details appear on each glyph card.',
    home_note_family: 'A structural link, not a history of “wood” gradually becoming “forest”.',
    home_collect_pre: 'Series one · from natural forms to composed ones', home_bg: 'Background:',
    home_themes_kicker: 'THEME PACKS', home_themes_title: 'Read a set of characters through one theme',
    home_themes_sub: 'Grouping characters already in the collection — no new content',
    home_themes_pick: 'Pick a theme',
    home_themes_partial: 'The “{{label}}” theme currently covers {{count}} characters; the rest will be added once sources are collected.',
    play: 'Play', pause: 'Pause', play_label: 'Play the homepage glyph animation', pause_label: 'Pause the homepage glyph animation',
    origin_tab_meaning: 'Meaning & Structure', origin_tab_source: 'Origin Label', origin_tab_writing: 'Writing',
    origin_note_none: 'No ancient glyph for this character yet.', origin_note_glyph: 'Representative glyph · not a full archaeological record',
    origin_speak: 'Read aloud', origin_speak_fallback: 'Speech unavailable, showing pinyin', origin_fav_add: 'Favorite', origin_fav_remove: 'Unfavorite',
    origin_fav_session: 'Favorites last only for this session.',
    evo_tab_stage: 'Stages', evo_tab_pick: 'Pick Character', evo_overview: 'Overview', evo_compare: 'Compare',
    evo_play: 'Play evolution', evo_pause: 'Pause evolution', evo_prev: 'Previous stage', evo_next: 'Next stage', evo_reset: 'Back to first stage',
    lab_tab_know: 'Learn the parts', lab_tab_chal: 'Compose it', lab_to_create: 'Use these parts to create',
    quiz_level_classic: 'Easy Explore', quiz_level_mission: 'Reasoning Challenge',
    quiz_submit: 'Submit', quiz_next: 'Next', quiz_score: 'Results', quiz_again: 'New round',
    quiz_learn: 'Learn this character', quiz_to_create: 'Go create', quiz_need_hint: 'Need a clue?', quiz_more_hint: 'One more clue',
    quiz_answer_ok: 'Correct', quiz_answer_no: 'Wrong', quiz_answer_skip: 'Skipped', quiz_answer: 'Correct answer',
    quiz_unlock: 'New part unlocked!', quiz_dialog_still: 'Continue', quiz_done: 'Done',
    mine_tab_create: 'Create', mine_tab_poster: 'Poster', mine_tab_library: 'Library', mine_tab_backup: 'Backup',
    mine_tab_edit: 'Arrange Parts', mine_tab_meaning: 'Give Meaning', mine_tab_style: 'Poster Style',
    mine_name_style: 'Name & Poster Style', mine_give_meaning: 'Give your work meaning', mine_mean_label: 'What does your character mean?',
    mine_name_label: 'Work name (optional)', mine_style_label: 'Poster style', mine_style_paper: 'Paper', mine_style_ink: 'Night Ink',
    mine_summary_glyphs: 'Composition: ', mine_summary_layout: 'Layout: ', mine_wait: 'Choose parts first',
    mine_free_layout: 'Free layout', mine_generate: 'Generate Poster', mine_save: 'Save to My Library',
    mine_export_png: 'Re-export PNG', mine_share: 'Share', mine_edit: 'Edit', mine_delete: 'Delete work: ',
    mine_untitled: 'Untitled', mine_library_title: 'My Library', mine_library_empty: 'No saved works yet — go to Create, combine parts and give them meaning.',
    mine_prev_page: 'Previous', mine_next_page: 'Next', mine_unlocked: 'parts unlocked',
    mine_draft_saved: 'Draft auto-saved on this device', mine_draft_session: 'Draft only lasts for this session; save your work and back it up',
    mine_draft_restored: 'Last editing draft restored', mine_draft_auto: 'Draft auto-saves',
    mine_backup_title: 'Backup & Restore My Works', mine_backup_note: 'Records are kept in this browser. Copy the backup code to restore on another computer; restoring merges works.',
    mine_backup_btn: 'Generate Backup Code', mine_restore_btn: 'Restore',
    mine_logo: 'MY DIGITAL GLYPH · 个人数字汉字创作', mine_mine_intro: 'Arrange parts, give meaning, and turn an exploration into your work.',
    mine_notice_saved: 'Work saved to your local library.', mine_notice_session: 'Work kept for this session — use the backup code to carry it away.',
    mine_share_title: 'Share This Digital Character', mine_share_desc: 'Link ready. Whoever opens it sees a preview first and only saves it after confirming; the work travels inside the URL — no server needed.',
    mine_share_label: 'Share link', mine_share_copy: 'Copy Link', mine_share_copied: 'Copied to clipboard.',
    mine_share_copy_manual: 'Copy failed — select the link and copy manually.', mine_share_copy_manual2: 'Select the link and copy manually.',
    mine_share_note: 'The link is a relative path: copy the whole project folder to any machine (or open a hosted copy) and it works. Only this work\'s parts and layout travel in the URL — not drafts or the full library.',
    mine_shared_title: 'A Shared Work', mine_shared_parts: 'Parts: ',
    mine_shared_save: 'Save to My Library', mine_shared_note: 'From a shared link — it joins your local library only after you confirm.',
    mine_shared_bad: 'This link is invalid or damaged.', mine_shared_empty: 'The shared link has no work in it.',
    graph_back: 'Back to previous character', graph_legend_line: 'Solid line = structural link', graph_legend_dash: 'Dashed line = related character',
    graph_none: 'No relations for this character yet', graph_read_first: 'Read what the solid and dashed lines mean below the canvas',
    pick_search: 'Search character / pinyin / meaning', pick_cancel: 'Cancel', pick_fav_only: 'Favorites only',
    pick_title: 'Pick a character',
    help_title: 'Field Guide', help_note_keys: 'Writing & evolution: Space plays/pauses, R restarts. Challenge: Space submits/advances. Create: arrow keys nudge, Shift + arrows nudge big, R clears (undoable). While typing or with a dialog open, shortcut keys pause.',
    help_read_setting: 'Reading Settings', help_large_text: 'Use large text', help_std_text: 'Standard size',
    help_read_note: 'Adjusts captions and tool text only; canvas size and background stay unchanged.',
    help_saved_local: 'Settings saved on this device.', help_session_only: 'Settings last only for this session.',
    help_health: 'Runtime & Data Self-Check', help_health_note: 'Interface availability is not a pass on real dragging, downloads, or cross-browser checks; data stats are not a content or licensing review.',
    help_health_chars: '{{n}} characters checked. Of {{s}} ancient-glyph slots, {{a}} have glyphs, {{m}} are missing; {{d}} have a documented use basis, and {{p}} remain under review.',
    help_storage: 'Local work storage', help_ok: 'Available', help_session: 'Session mode — use the library backup code',
    help_svg: 'SVG writing engine', help_loaded: 'Loaded', help_missing: 'Missing',
    help_canvas: 'Canvas outline API', help_ptr: 'Pointer API', help_no_ptr: 'Not detected — check your browser',
    help_li: 'Lishu script', help_li_no: 'Not yet collected; no other stage stands in for it',
    guide_home_title: 'Start with one character', guide_origin_title: 'Study one character', guide_evo_title: 'Compare rather than memorize order',
    guide_lab_title: 'Understand existing characters before creating', guide_quiz_title: 'Two routes, two experiences', guide_mine_title: 'Let parts express your meaning',
    guide_graph_title: 'Walk across the relationships'
  };

  ZQ.I18N = { zh: zh, en: en };

  /* 无副作用回显：en 缺键回退 zh，再缺回退 key 本身。 */
  ZQ.i18n = function (key, lang) {
    if (key == null) return '';
    var d = (ZQ.I18N[lang || 'zh'] || {})[key];
    if (typeof d === 'string' && d) { return d; }
    var f = (ZQ.I18N.zh || {})[key];
    return typeof f === 'string' && f ? f : key;
  };

  /* 供模板使用：{{ tr('key') }}。混入到各组件。 */
  ZQ.i18nMixin = {
    methods: {
      tr: function (key) {
        var lang = (global.ZQ.workspace && global.ZQ.workspace.lang) || 'zh';
        return ZQ.i18n(key, lang);
      }
    }
  };
})(window);
