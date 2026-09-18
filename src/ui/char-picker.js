/* 字启千年 — 选字面板（Vue 组件）
 *
 * 一个受控组件：父层拿着 char，这里只负责列出来 + 冒泡选中。
 * 不自己存状态 —— 否则外壳和面板会各有一份「当前是哪个字」，
 * 切换模式时两边不同步。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  ZQ.CharPicker = {
    name: 'CharPicker',
    mixins: [ZQ.i18nMixin],

    props: {
      modelValue: { type: String, default: '' },
      only: { type: Array, default: null }   // 只列这些字；不传就全列
    },

    emits: ['update:modelValue'],

    template: [
      '<div class="zc-panel zc-picker">',
      '  <label class="zc-picker-label">{{ tr(\'pick_title\') }}<select class="zc-search-input zc-picker-select" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="c in choices" :key="c" :value="c">{{ c }} · {{ info(c).pinyin }} · {{ pickMeaning(c) }}</option></select></label>',
      '  <button class="zc-picker-more zc-text-btn" @click="openSearch">{{ tr(\'pick_search\') }} · {{ choices.length }} ↑</button>',
      '  <dialog ref="searchDialog" class="zc-picker-dialog" aria-label="搜索和收藏汉字"><header><h2>{{ tr(\'pick_search\') }}</h2><button class="zc-text-btn" @click="closeSearch" :aria-label="tr(\'pick_cancel\')">{{ tr(\'pick_cancel\') }} ×</button></header>',
      '  <input class="zc-search-input" v-model="search" type="search" :placeholder="tr(\'pick_search\')" aria-label="搜索汉字或拼音">',
      '  <select class="zc-search-input" v-model="category" aria-label="汉字分类"><option value="">全部分类</option><option v-for="c in categories" :key="c">{{ c }}</option></select>',
      '  <button class="zc-text-btn" :aria-pressed="favoritesOnly" @click="favoritesOnly = !favoritesOnly">{{ favoritesOnly ? \'★ \' + tr(\'pick_fav_only\') : \'☆ 全部汉字\' }}</button>',
      '  <div class="zc-chargrid">',
      '    <button v-for="c in list" :key="c" class="zc-charbtn"',
      '            :class="{ \'is-active\': c === modelValue }"',
      '            :title="info(c).meaning" @click="choose(c)">{{ c }}</button>',
      '  </div>',
      '  <p v-if="!list.length" class="zc-note">没有匹配的汉字，试试其他关键词。</p>',
      '  </dialog>',
      '</div>'
    ].join('\n'),

    data: function () { return { search: '', category: '', favoritesOnly:false }; },
    methods: {
      info: function (c) { return (global.CharCatalog || {})[c] || {}; },
      /* 列表选项的一行说明：en 模式优先 CharEN，缺字回退中文 */
      pickMeaning: function (c) {
        var lang = (global.ZQ.workspace && global.ZQ.workspace.lang) || 'zh';
        if (lang === 'en') {
          var en = (global.ZQ.CharEN || {})[c];
          if (en) return en;
        }
        return (this.info(c).meaning || '').split('；')[0];
      },
      openSearch: function () { var dialog = this.$refs.searchDialog; if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); } },
      closeSearch: function () { var dialog = this.$refs.searchDialog; if (dialog && dialog.open) { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); } },
      choose: function (ch) { this.closeSearch(); this.$emit('update:modelValue', ch); }
    },
    computed: {
      choices: function () { var only = this.only; return Object.keys(global.__CHARS__ || {}).filter(function (c) { return !only || only.includes(c); }); },

      /* 分类下拉**从数据派生**，不写死选项表。
       * 写死的版本在扩容时会安静地漏字：新加的语义场（植物/器物/数字·抽象/颜色）
       * 在数据里有、在下拉里没有，用户只能靠搜索找到它们 —— 不报错，只是「少了」。
       * 「会意·形声」是结构轴上的值，不算语义场，所以这里要排掉（见 catalog.js 文件头 [3]）。 */
      categories: function () {
        var struct = ((global.CharCatalogMeta || {}).structureCategory) || '';
        var seen = [], self = this;
        this.choices.forEach(function (c) {
          var cat = self.info(c).category || '';
          if (cat && cat !== struct && seen.indexOf(cat) < 0) seen.push(cat);
        });
        return seen;
      },
      list: function () {
        var all = this.choices;
        var only = this.only;
        var self = this, query = this.search.trim().toLowerCase();
        return all.filter(function (c) {
          if (only && only.indexOf(c) < 0) return false;
          var info = self.info(c);
          if (self.favoritesOnly && !global.ZQ.preferences.favorites.includes(c)) return false;
          if (self.category && info.category !== self.category) return false;
          var text = c + ' ' + (info.pinyin || '') + ' ' + (info.meaning || '');
          var plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          return !query || text.includes(query) || plain.includes(query);
        });
      }
    }
  };
})(window);
