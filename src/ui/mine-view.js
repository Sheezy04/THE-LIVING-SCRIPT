/* Canvas 使用原始字形轮廓导出，画布通过 change 事件同步。 */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {};
  var DRAFT_KEY = 'zq-creative-draft-v1';
  function clean(s, n) { return String(s || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n); }
  ZQ.creativeDraft = {
    normalize: function (raw) {
      if (!raw || raw.v !== 1) return null;
      var entry = raw.entry && Array.isArray(raw.entry.glyphs) && raw.entry.glyphs.length <= 8
        ? global.Mine.migrate({ v: 1, seen: {}, unlocked: [], library: [raw.entry] }, global.Compose.palette()).library[0] : null;
      return { v: 1, entry: entry || null, meaning: clean(raw.meaning, 40), name: clean(raw.name, 12), editingId: clean(raw.editingId, 24), posterStyle: raw.posterStyle === 'ink' ? 'ink' : 'paper' };
    },
    read: function () {
      if (ZQ.mineSessionDraft) return this.normalize(ZQ.mineSessionDraft);
      try {
        var text = global.localStorage.getItem(DRAFT_KEY);
        return text && text.length < 100000 ? this.normalize(JSON.parse(text)) : null;
      } catch (e) { return null; }
    },
    save: function (draft) {
      ZQ.mineSessionDraft = this.normalize(draft);
      try { global.localStorage.setItem(DRAFT_KEY, JSON.stringify(ZQ.mineSessionDraft)); return true; }
      catch (e) { return false; }
    }
  };
  ZQ.posterLines = function (ctx, text, maxWidth) {
    var lines = [], line = '';
    Array.from(text).forEach(function (ch) {
      if (line && ctx.measureText(line + ch).width > maxWidth) { lines.push(line); line = ch; }
      else line += ch;
    });
    if (line) lines.push(line);
    return lines;
  };
  function xml(value) { return String(value == null?'':value).replace(/[&<>"']/g,function(c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]; }); }
  ZQ.creativeSvg=function(items,meta) {
    if (!Array.isArray(items) || !items.length || items.length>8 || !items.every(function(it) { return it && Array.isArray(it.d) && it.d.length && it.d.every(function(d) { return typeof d==='string'; }) && [it.dx,it.dy,it.s,it.a || 0,it.bbox && it.bbox.cx,it.bbox && it.bbox.cy].every(function(n) { return typeof n==='number' && isFinite(n); }); })) return '';
    meta=meta || {}; var p=global.Positioner.create(1000,1000,1000*40/520);
    return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000"><title>' + xml(meta.name || '我的数字字形') + '</title><desc>' + xml('《字启千年》个人数字汉字创作。构件：' + items.map(function(it) { return it.glyph; }).join(' + ') + '；赋义：' + (meta.meaning || '尚未赋义') + '。不代表真实汉字。现代轮廓来源：Make Me A Hanzi / Arphic Public License。') + '</desc><defs><clipPath id="creation-area"><rect width="1000" height="1000" /></clipPath></defs><g clip-path="url(#creation-area)"><g fill="#2c3930" transform="' + xml(p.transform) + '">' + items.map(function(it) {
      var transform='translate(' + it.dx + ',' + it.dy + ') scale(' + it.s + ') rotate(' + (it.a || 0) + ',' + it.bbox.cx + ',' + it.bbox.cy + ')';
      return '<g transform="' + xml(transform) + '">' + it.d.map(function(d) { return '<path d="' + xml(d) + '" />'; }).join('') + '</g>';
    }).join('') + '</g></g></svg>';
  };
  function fittedText(ctx, text, x, y, maxWidth, fontSize) {
    var size = fontSize;
    do { ctx.font = size + 'px serif'; size--; }
    while (ctx.measureText(text).width > maxWidth && size > 22);
    ctx.fillText(text, x, y, maxWidth);
  }
  ZQ.drawComposedGlyph = function (ctx, items, x, y, size) {
    var p = global.Positioner.create(size, size, size * 40 / 520);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
    ctx.translate(x + p.xOffset, y + size - p.yOffset);
    ctx.scale(p.scale, -p.scale);
    items.forEach(function (it) {
      ctx.save(); ctx.translate(it.dx, it.dy); ctx.scale(it.s, it.s);
      ctx.translate(it.bbox.cx, it.bbox.cy); ctx.rotate((it.a || 0) * Math.PI / 180);
      ctx.translate(-it.bbox.cx, -it.bbox.cy);
      it.d.forEach(function (d) { ctx.fill(new global.Path2D(d)); });
      ctx.restore();
    });
    ctx.restore();
  };
  ZQ.MineView = {
    name: 'MineView',
    mixins: [ZQ.i18nMixin],
    props: {creationRequest:{type:Object,default:null}, shareCode:{type:String,default:''}},
    emits:['consume-create','consume-share'],
    template: `
      <section class="zc-mine">
        <header class="zc-mine-intro">
          <div><span class="zc-gallery-kicker">05 / CREATION</span><h2>我的造字</h2><p>摆放构件，赋予含义，让一次汉字探索成为你的作品。</p></div>
          <div class="zc-mine-nav"><div class="zc-seg" role="tablist" aria-label="创作工作台"><button role="tab" :aria-selected="view === 'create'" :class="{ 'is-active': view === 'create' }" @click="view = 'create'">{{ tr('mine_tab_create') }}</button><button role="tab" :aria-selected="view === 'poster'" :disabled="!posterReady" :class="{ 'is-active': view === 'poster' }" @click="view = 'poster'">{{ tr('mine_tab_poster') }}</button><button role="tab" :aria-selected="view === 'library'" :class="{ 'is-active': view === 'library' }" @click="view = 'library'">{{ tr('mine_tab_library') }} · {{ library.length }}</button><button role="tab" :aria-selected="view === 'backup'" :class="{ 'is-active': view === 'backup' }" @click="view = 'backup'">{{ tr('mine_tab_backup') }}</button></div><span class="zc-note">{{ unlocked.length }} / {{ paletteCount }} {{ tr('mine_unlocked') }}</span></div>
        </header>
        <div v-show="view === 'create'" class="zc-mine-work">
          <div class="zc-seg zc-mine-tool-tabs"><button :class="{ 'is-active': toolTab === 'edit' }" @click="toolTab = 'edit'">{{ tr('mine_tab_edit') }}</button><button :class="{ 'is-active': toolTab === 'meaning' }" @click="toolTab = 'meaning'">{{ tr('mine_tab_meaning') }}</button><button :class="{ 'is-active': toolTab === 'style' }" @click="toolTab = 'style'">{{ tr('mine_tab_style') }}</button></div>
          <div class="zc-mine-composer">
            <compose-canvas ref="composer" editable :active="view === 'create'" :tools-visible="toolTab === 'edit'" :unlocked="unlocked" @change="onDesignChange" />
            <p class="zc-note zc-mine-tools">初始开放日、月、木、人、心、口。挑战可解锁更多，也可从实验室确认带入已观察的构件；画布最多放置 8 个构件。</p>
          </div>
          <aside v-show="toolTab !== 'edit'" class="zc-mine-form zc-panel">
            <div class="zc-panel-title">{{ toolTab === 'style' ? '名称与海报风格' : '给作品赋义' }}</div>
            <label v-show="toolTab === 'meaning'">我的字代表什么？<input v-model="meaning" maxlength="40" placeholder="例如：快乐、勇气、相遇" /></label>
            <div v-show="toolTab === 'style'" class="zc-creation-options">
            <div class="zc-mine-quick"><button v-for="word in quickWords" :key="word" @click="meaning = word">{{ word }}</button></div>
            <label>创作名（可选）<input v-model="name" maxlength="12" placeholder="例如：向阳" /></label>
            <div class="zc-poster-choices"><span>海报风格</span><div><button :aria-pressed="posterStyle === 'paper'" :class="{ 'is-active': posterStyle === 'paper' }" @click="posterStyle = 'paper'">纸白展签</button><button :aria-pressed="posterStyle === 'ink'" :class="{ 'is-active': posterStyle === 'ink' }" @click="posterStyle = 'ink'">深墨夜色</button></div></div>
            </div>
            <div v-show="toolTab === 'meaning'" class="zc-meaning-actions">
            <p class="zc-mine-summary">构形：<b>{{ glyphText || '等待选择构件' }}</b></p>
            <p class="zc-mine-summary">布局：{{ structureText }}</p>
            <button class="zc-btn is-primary zc-mine-generate" :disabled="!canGenerate" @click="generate">{{ tr('mine_generate') }}</button>
            <button class="zc-btn" :disabled="!canGenerate" @click="saveDesign">{{ tr('mine_save') }}</button>
            <p class="zc-note">这是个人数字汉字创作，不宣称创造了真实汉字。</p>
            <p class="zc-draft-status" role="status">{{ draftStatus }}</p>
            </div>
            <p v-show="toolTab === 'style'" class="zc-note">设置后回到「赋予含义」生成海报。</p>
            <button v-show="toolTab === 'style'" class="zc-btn" :disabled="!design.length" @click="downloadSvg">导出当前字形 SVG</button>
            <p v-show="toolTab === 'style'" class="zc-note">透明背景矢量字形，可放大用于排版；导出当前草稿，不是 PNG 海报。</p>
          </aside>
        </div>
        <section v-if="posterReady" v-show="view === 'poster'" class="zc-poster-result">
          <div class="zc-poster-frame"><canvas ref="poster" width="1000" height="1400" aria-label="个人数字汉字海报"></canvas></div>
          <div class="zc-poster-actions">
            <div><p class="zc-panel-title">把这次探索带走</p><p>{{ posterMeta.name || '我的数字汉字' }} · {{ posterMeta.meaning }}</p><p class="zc-note">PNG · 1000 × 1400 像素</p></div>
            <button class="zc-btn is-primary" @click="downloadPoster">保存 PNG</button>
          </div>
        </section>
        <p v-if="notice" class="zc-mine-notice" role="status">{{ notice }}</p>
        <section class="zc-mine-library" v-if="view === 'library'">
          <div class="zc-panel-title">{{ tr('mine_library_title') }} · {{ library.length }} 件作品</div>
          <p v-if="!library.length" class="zc-note">{{ tr('mine_library_empty') }}</p>
          <div class="zc-mine-library-grid">
            <article v-for="entry in pagedLibrary" :key="entry.id" class="zc-mine-card">
              <img class="zc-mine-card-thumb" :src="thumbOf(entry)" alt="作品海报缩略图" title="按海报比例缩略" />
              <div><b>{{ entry.name || tr('mine_untitled') }}</b><p :title="entry.meaning">{{ entry.meaning }}</p><small>{{ entry.glyphs.join(' + ') }}</small><div class="zc-mine-card-actions"><button class="zc-btn" @click="loadDesign(entry)">{{ tr('mine_edit') }}</button><button class="zc-btn" @click="exportEntry(entry)">{{ tr('mine_export_png') }}</button><button class="zc-btn" @click="presentShare(entry)">{{ tr('mine_share') }}</button></div></div>
              <button class="zc-icon-btn" :aria-label="tr('mine_delete') + (entry.name || entry.id)" @click="removeSaved(entry.id)">×</button>
            </article>
          </div>
          <div class="zc-page-controls" v-if="libraryPages > 1"><button class="zc-btn" :disabled="libraryPage === 0" @click="libraryPage--">上一页</button><span>{{ libraryPage + 1 }} / {{ libraryPages }}</span><button class="zc-btn" :disabled="libraryPage >= libraryPages - 1" @click="libraryPage++">下一页</button></div>
        </section>
        <section v-if="view === 'backup'" class="zc-mine-backup">
          <h3>备份与恢复我的作品</h3>
          <p class="zc-note">记录保存在本机浏览器。可复制备份码，在另一台电脑上粘贴恢复；恢复时会合并作品。</p>
          <div class="zc-controls"><button class="zc-btn" @click="backup">生成备份码</button><button class="zc-btn" :disabled="!backupCode" @click="restore">恢复备份</button></div>
          <textarea v-model="backupCode" aria-label="作品备份码" placeholder="点击生成备份码，或粘贴已有的 MINE1 备份码"></textarea>
        </section>
        <dialog ref="incomingDialog" class="zc-help-dialog zc-incoming-dialog" aria-labelledby="zc-incoming-title" @close="dismissIncoming">
          <header><div><span class="zc-status-eyebrow">FROM LAB TO CREATION · 从理解到创作</span><h2 id="zc-incoming-title">把学到的构件，变成你的表达</h2></div></header>
          <template v-if="incoming"><p>来自「{{ incoming.char }}」：{{ incoming.glyphs.join(' + ') }}</p><p>确认后追加 {{ incoming.glyphs.length }} 个构件；保留原草稿的位置、名称与含义，可一步撤销。新构件可能与原布局重叠，请自由调整。</p><p v-if="!canReceiveIncoming">当前已有 {{ design.length }} 个构件，追加后超过画布上限 8 个。请保留草稿，整理画布后从实验室重新带入。</p><div class="zc-controls"><button class="zc-btn is-primary" :disabled="!canReceiveIncoming" @click="acceptIncoming">{{ design.length ? '追加到当前草稿' : '用这些构件开始创作' }}</button><button class="zc-btn" autofocus @click="dismissIncoming">保留草稿，不带入</button></div></template>
        </dialog>
        <dialog ref="shareDialog" class="zc-help-dialog zc-incoming-dialog" aria-labelledby="zc-share-title" @close="dismissShareExport">
          <header><div><span class="zc-status-eyebrow">SHARE · 分享作品</span><h2 id="zc-share-title">分享这份数字汉字创作</h2></div></header>
          <template v-if="shareLink"><p>链接已生成。打开链接的人会先看到作品预览，确认后才保存到自己字库；作品编码进网址，无需服务器。</p><label>分享链接<input ref="shareLinkInput" readonly :value="shareLink" @focus="$event.target.select()" /></label><div class="zc-controls"><button class="zc-btn is-primary" @click="copyShareLink">复制链接</button><button class="zc-btn" autofocus @click="dismissShareExport">关闭</button></div><p class="zc-note" role="status">{{ shareCopyNote }}</p><p class="zc-note">链接只含该件作品的构件与布局，不含草稿与字库备份。</p></template>
        </dialog>
        <dialog ref="sharedDialog" class="zc-help-dialog zc-incoming-dialog" aria-labelledby="zc-shared-title" @close="dismissShared">
          <header><div><span class="zc-status-eyebrow">FROM A SHARED LINK · 来自分享链接</span><h2 id="zc-shared-title">收到的作品</h2></div></header>
          <template v-if="sharedEntry">
            <svg viewBox="0 0 520 520" class="zc-mine-card-glyph" aria-hidden="true"><g :transform="thumbTransform"><g v-for="(glyph, i) in sharedEntry.glyphs" :key="i" :transform="entryTransform(sharedEntry, i)"><path v-for="(d, k) in tile(glyph).d" :key="k" :d="d" fill="currentColor" /></g></g></svg>
            <p><b>{{ sharedEntry.name || '未命名创作' }}</b><template v-if="sharedEntry.meaning"> · {{ sharedEntry.meaning }}</template></p><p class="zc-note">构件：{{ sharedEntry.glyphs.join(' + ') }}。保存后进入你的本机字库（满 60 件时需先清理）；不会改动已保存的作品。</p><div class="zc-controls"><button class="zc-btn is-primary" @click="saveShared">保存到我的字库</button><button class="zc-btn" autofocus @click="dismissShared">关闭</button></div>
          </template>
          <template v-else><p role="status">{{ sharedError }}</p><div class="zc-controls"><button class="zc-btn" autofocus @click="dismissShared">关闭</button></div></template>
        </dialog>
      </section>`,
    data: function () { return { view: 'create', toolTab:'meaning', libraryPage:0, meaning: '', name: '', design: [], editingId: '', posterStyle: 'paper', draftStatus: '草稿会自动保存', draftLoaded: false, posterReady: false, posterMeta: {}, notice: '', backupCode: '', incoming:null, quickWords: ['快乐', '勇气', '相遇', '安宁', '成长'], thumbs:{}, shareLink:'', shareCopyNote:'', sharedEntry:null, sharedError:'' }; },
    watch: {
      creationRequest: function (request) { this.receiveIncoming(request); },
      library: function () { this.thumbs = {}; },
      meaning: function () { this.invalidatePoster(); },
      name: function () { this.invalidatePoster(); },
      posterStyle: function () { this.invalidatePoster(); }
    },
    mounted: function () { this.restoreDraft(); this.draftLoaded = true; this.receiveIncoming(this.creationRequest); if (this.shareCode) this.openShared(this.shareCode); },
    beforeUnmount: function () { if (this.draftTimer) global.clearTimeout(this.draftTimer); this.persistDraft(); },
    computed: {
      canReceiveIncoming: function () { return !!this.incoming && this.design.length+this.incoming.glyphs.length<=8; },
      store: function () { return global.ZQ.store; },
      unlocked: function () { return this.store.state.unlocked; },
      /* 分母是**构件盘的全部格子**（26 = 24 独体 + 2 派生偏旁），不是一个写死的 24。
       * 派生的亻/宀 真的会被解锁 —— 04 答对后没有新构件可给时，就从盘里挑一个还没
       * 解锁的补上（mode-quiz.js）。写死 24 的话这一栏永远差两格到不了头，而同一屏
       * 底部的状态栏按 palette 算出来是 26：两个数并排就是互相打脸。 */
      paletteCount: function () { return global.Compose.palette().length; },
      library: function () { return this.store.state.library; },
      libraryPages: function () { return Math.max(1, Math.ceil(this.library.length / 4)); },
      pagedLibrary: function () { return this.library.slice(this.libraryPage * 4, this.libraryPage * 4 + 4); },
      canGenerate: function () { return this.design.length > 0 && clean(this.meaning, 40).length > 0; },
      glyphText: function () { return this.design.map(function (it) { return it.glyph; }).join(' + '); },
      structureText: function () {
        if (this.design.some(function (it) { return it.a !== 0; })) return '自由布局';
        var rec = global.Compose.recognize(this.design, global.Positioner.BOUNDS);
        return rec.code === 'OK' ? rec.structure : '自由布局';
      },
      thumbTransform: function () { return global.Positioner.create(520, 520, 40).transform; }
    },
    methods: {
      receiveIncoming: function (request) {
        var normalized=request && global.ZQ.labCreationRequest(request.char);
        if(!normalized) return;
        this.incoming=normalized;
        this.$nextTick(function () { var dialog=this.$refs.incomingDialog; if(dialog && !dialog.open) dialog.showModal(); });
      },
      dismissIncoming: function () {
        if(!this.incoming) return;
        this.incoming=null;
        var dialog=this.$refs.incomingDialog; if(dialog && dialog.open) dialog.close();
        this.$emit('consume-create');
      },
      acceptIncoming: function () {
        if(!this.canReceiveIncoming) return;
        var composer=this.$refs.composer;
        if(!composer || composer.items.length+this.incoming.glyphs.length>8) return;
        this.store.unlock(this.incoming.glyphs);
        if(!composer.appendGlyphs(this.incoming.glyphs)) { this.notice='构件未能带入，原草稿保持不变。'; return; }
        this.view='create'; this.toolTab='edit'; this.persistDraft();
        this.notice='已追加实验室构件，原草稿未覆盖；可以自由调整并赋义，或撤销本次带入。';
        this.dismissIncoming();
      },
      downloadSvg: function () {
        var svg=global.ZQ.creativeSvg(this.design,{name:this.name,meaning:this.meaning});
        if(!svg) { this.notice='请先添加有效构件。'; return; }
        try {
          var url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'})), a=document.createElement('a');
          a.download='字启千年-' + (this.name || '我的字形') + '.svg'; a.href=url;
          document.body.appendChild(a); a.click(); a.remove(); setTimeout(function() { URL.revokeObjectURL(url); },1000);
          this.notice='SVG 已开始保存；请随项目保留轮廓来源与许可。';
        } catch(e) { this.notice='SVG 保存失败，请检查浏览器下载权限。'; }
      },
      invalidatePoster: function () { this.posterReady = false; if (this.view === 'poster') this.view = 'create'; this.scheduleDraft(); },
      scheduleDraft: function () {
        if (!this.draftLoaded) return;
        if (this.draftTimer) global.clearTimeout(this.draftTimer);
        var self = this;
        this.draftTimer = global.setTimeout(function () { self.draftTimer = 0; self.persistDraft(); }, 300);
      },
      persistDraft: function () {
        var entry = global.Mine.entryFrom(this.design, { id: 'current-draft' });
        var ok = ZQ.creativeDraft.save({ v: 1, entry: entry, name: this.name, meaning: this.meaning, editingId: this.editingId, posterStyle: this.posterStyle });
        this.draftStatus = ok ? '草稿已自动保存在本机' : '草稿仅保留在本次会话；请保存作品并备份';
      },
      restoreDraft: function () {
        var draft = ZQ.creativeDraft.read(); if (!draft) return;
        this.meaning = draft.meaning; this.name = draft.name; this.posterStyle = draft.posterStyle;
        if (draft.entry) this.applyLayout(draft.entry);
        this.editingId = this.store.getLibrary(draft.editingId) ? draft.editingId : '';
        this.draftStatus = '已恢复上次编辑的草稿';
      },
      applyLayout: function (entry) {
        var c = this.$refs.composer, unlocked = this.unlocked;
        c.clear();
        c.items = entry.glyphs.map(function (glyph, i) {
          if (!unlocked.includes(glyph)) return null;
          var it = c.mk(glyph, true); return it && Object.assign(it, entry.layout[i]);
        }).filter(Boolean).slice(0, 8);
        c.history = [[]]; c.historyIndex = 0;
        c.selectedId = c.items.length ? c.items[0].id : ''; c.commit();
      },
      onDesignChange: function (items) { this.design = items; if (!items.length) this.editingId = ''; this.invalidatePoster(); },
      generate: function () {
        if (!this.canGenerate) return;
        this.posterMeta = { name: clean(this.name, 12), meaning: clean(this.meaning, 40), components: this.glyphText, style: this.posterStyle };
        this.posterReady = true; this.view = 'poster'; this.notice = ''; this.$nextTick(this.drawPoster);
      },
      /* 海报渲染抽成公共：drawPoster 画当前草稿，exportEntry 画已保存作品。
       * 坐标体系固定 1000×1400（与 .zc-poster-frame canvas 一致）。 */
      renderPoster: function (ctx, items, meta) {
        var paper = meta.style !== 'ink';
        var pal = paper ? { bg0:'#faf8f0', bg1:'#e9edde', border:'#b6c8a8', orbit:'rgba(66,102,61,.12)', heading:'#285640', accent:'#55774b', ink:'#213a34', divider:'rgba(40,72,52,.16)', note:'#718168' }
          : { bg0:'#0a1118', bg1:'#132b32', border:'rgba(212,175,106,.5)', orbit:'rgba(117,206,194,.2)', heading:'#d9c796', accent:'#83d7cc', ink:'#f2ece0', divider:'rgba(255,255,255,.16)', note:'rgba(242,236,224,.55)' };
        var grad = ctx.createLinearGradient(0, 0, 1000, 1400);
        grad.addColorStop(0, pal.bg0); grad.addColorStop(1, pal.bg1);
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 1000, 1400);
        ctx.strokeStyle = pal.border; ctx.lineWidth = 2; ctx.strokeRect(55, 55, 890, 1290);
        ctx.strokeStyle = pal.orbit; ctx.lineWidth = 1;
        for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(500, 620, 150 + i * 65, 0, Math.PI * 2); ctx.stroke(); }
        ctx.fillStyle = pal.heading; ctx.font = '34px serif'; ctx.fillText('字 启 千 年', 95, 125);
        ctx.fillStyle = pal.accent; ctx.font = '18px sans-serif'; ctx.fillText('MY DIGITAL GLYPH · 个人数字汉字创作', 95, 168);
        ctx.fillStyle = pal.ink; ZQ.drawComposedGlyph(ctx, items, 110, 220, 780);
        ctx.fillStyle = pal.divider; ctx.fillRect(95, 1015, 810, 1);
        ctx.fillStyle = pal.ink; fittedText(ctx, meta.name || '我的数字汉字', 95, 1070, 810, 40);
        ctx.fillStyle = pal.heading; ctx.font = '20px sans-serif'; ctx.fillText('构形组成', 95, 1120);
        ctx.fillStyle = pal.ink; fittedText(ctx, meta.components, 95, 1175, 810, 36);
        ctx.fillStyle = pal.accent; ctx.font = '20px sans-serif'; ctx.fillText('我赋予它的含义', 95, 1220);
        ctx.fillStyle = pal.ink; ctx.font = '32px "Microsoft YaHei", sans-serif';
        ZQ.posterLines(ctx, meta.meaning, 810).slice(0, 2).forEach(function (line, i) { ctx.fillText(line, 95, 1265 + i * 38); });
        ctx.fillStyle = pal.note; ctx.font = '16px sans-serif'; ctx.fillText('此作品为数字汉字创作，不代表真实汉字。', 95, 1330);
      },
      drawPoster: function () {
        var cv = this.$refs.poster; if (!cv) return;
        this.renderPoster(cv.getContext('2d'), this.design, this.posterMeta);
      },
      downloadPoster: function () {
        var cv = this.$refs.poster; if (!cv) return;
        var self = this;
        cv.toBlob(function (blob) {
          if (!blob) { self.notice = '图片生成失败，请重新生成海报。'; return; }
          var url = URL.createObjectURL(blob), a = document.createElement('a');
          a.download = '字启千年-' + (self.posterMeta.name || '我的字') + '.png'; a.href = url;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          self.notice = 'PNG 已开始保存。';
        }, 'image/png');
      },
      saveDesign: function () {
        if (!this.canGenerate) return;
        var entry = global.Mine.entryFrom(this.design, { id: this.editingId, structure: this.structureText, meaning: clean(this.meaning, 40), name: clean(this.name, 12) });
        if (entry) { this.store.saveLibrary(entry); this.editingId = entry.id; this.persistDraft(); this.notice = this.store.available ? '作品已保存在本机字库。' : '作品保存在本次会话，请使用备份码带走记录。'; }
      },
      tile: function (glyph) { return global.Compose.tile(glyph) || { d: [], bbox: { cx: 0, cy: 0 } }; },
      entryTransform: function (entry, i) {
        var l = entry.layout[i], b = this.tile(entry.glyphs[i]).bbox;
        return 'translate(' + l.dx + ',' + l.dy + ') scale(' + l.s + ') rotate(' + (l.a || 0) + ',' + b.cx + ',' + b.cy + ')';
      },
      loadDesign: function (entry) {
        this.view = 'create';
        this.name = entry.name; this.meaning = entry.meaning;
        this.applyLayout(entry);
        this.editingId = entry.id;
        this.scheduleDraft();
        this.notice = '已载入作品，可继续调整并重新生成海报。';
      },
      removeSaved: function (id) { this.store.removeLibrary(id); this.libraryPage = Math.min(this.libraryPage, this.libraryPages - 1); if (id === this.editingId) this.editingId = ''; this.notice = '已从本机字库移除作品。'; },
      backup: function () { this.backupCode = this.store.exportCode(); this.notice = '请复制并保存备份码。'; },
      restore: function () {
        var r = this.store.importCode(this.backupCode);
        this.notice = r.ok ? '已合并恢复 ' + r.added.library + ' 件作品。' : '备份码无法识别：' + (r.why || '请检查 MINE1 开头。');
      },
      /* ── 作品墙：海报预览 + 重新导出 ─────────────────────── */
      entryItems: function (entry) {
        var out = [];
        (entry.layout || []).forEach(function (l, i) {
          var g = entry.glyphs[i];
          var t = global.Compose.tile && global.Compose.tile(g) || { d: [], bbox: { cx: 0, cy: 0 } };
          if (!t.d || !t.d.length) return;
          out.push(Object.assign({ glyph: g }, l, t));
        });
        return out;
      },
      thumbOf: function (entry) {
        var key = entry && entry.id;
        if (!key) return '';
        if (this.thumbs[key]) return this.thumbs[key];
        var url = '';
        try {
          var cv = global.document.createElement('canvas'); cv.width = 120; cv.height = 168;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#faf8f0'; ctx.fillRect(0, 0, 120, 168);
          ZQ.drawComposedGlyph(ctx, this.entryItems(entry), 10, 24, 100);
          url = cv.toDataURL('image/png');
        } catch (e) { url = ''; }
        this.thumbs[key] = url;
        return url;
      },
      exportEntry: function (entry) {
        if (!entry || !entry.glyphs || !entry.glyphs.length) { this.notice = '该作品没有可导出的构件。'; return; }
        var cv = global.document.createElement('canvas'); cv.width = 1000; cv.height = 1400;
        var meta = { name: entry.name || '', meaning: entry.meaning || '', components: entry.glyphs.join(' + '), style: 'paper' };
        this.renderPoster(cv.getContext('2d'), this.entryItems(entry), meta);
        var self = this;
        cv.toBlob(function (blob) {
          if (!blob) { self.notice = '图片生成失败，请稍后重试。'; return; }
          var url = URL.createObjectURL(blob), a = global.document.createElement('a');
          a.download = '字启千年-' + (entry.name || '我的字') + '.png'; a.href = url;
          global.document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          self.notice = '已开始导出「' + (entry.name || '未命名创作') + '」的 PNG 海报。';
        }, 'image/png');
      },
      /* ── 分享链接：生成 + 复制 ──────────────────────────── */
      presentShare: function (entry) {
        if (!entry || !entry.glyphs || !entry.glyphs.length) { this.notice = '该作品无法生成分享链接。'; return; }
        var code = global.Mine.encode({ unlocked: [], seen: {}, library: [entry] });
        if (!code) { this.notice = '该作品无法编码成分享链接。'; return; }
        /* 相对路径：整包复制到任何一台装有本作品的电脑（或放在任意静态托管）都能打开；
         * 写成绝对 file 路径的话，换设备就失效了。作品数据都在 URL 里，无需后端。 */
        this.shareLink = 'index.html#share=' + encodeURIComponent(code);
        this.shareCopyNote = '';
        var self = this;
        this.$nextTick(function () { var d = self.$refs.shareDialog; if (d && !d.open) d.showModal(); });
      },
      copyShareLink: function () {
        var input = this.$refs.shareLinkInput;
        var self = this;
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(this.shareLink).then(function () { self.shareCopyNote = '已复制到剪贴板。'; }, function () { self._copyFallback(input); });
        } else { this._copyFallback(input); }
      },
      _copyFallback: function (input) {
        var self = this;
        if (!input) { this.shareCopyNote = '请手动选中链接复制。'; return; }
        var ok = false;
        try { input.focus(); input.select(); ok = global.document.execCommand('copy'); } catch (e) { ok = false; }
        this.shareCopyNote = ok ? '已复制到剪贴板。' : '复制失败，请手动选中链接复制。';
      },
      dismissShareExport: function () {
        var d = this.$refs.shareDialog; if (d && d.open) d.close();
        this.shareLink = ''; this.shareCopyNote = '';
      },
      /* ── 打开分享链接：预览 + 确认保存 ───────────────────── */
      openShared: function (code) {
        if (!code) { this.sharedEntry = null; this.sharedError = '分享链接缺少作品内容。'; return; }
        var out = global.Mine.decode(code);
        var e = out.ok && out.state && out.state.library && out.state.library[0];
        this.sharedEntry = e || null;
        this.sharedError = e ? '' : '链接无效或已损坏，无法读取作品。';
        var self = this;
        this.$nextTick(function () { var d = self.$refs.sharedDialog; if (d && !d.open) d.showModal(); });
      },
      saveShared: function () {
        if (!this.sharedEntry) return;
        this.store.saveLibrary(this.sharedEntry);
        this.notice = this.store.available ? '已把分享的作品保存到本机字库。' : '作品保存在本次会话，请使用备份码带走记录。';
        this.dismissShared();
      },
      dismissShared: function () {
        var d = this.$refs.sharedDialog; if (d && d.open) d.close();
        this.sharedEntry = null; this.sharedError = ''; this.$emit('consume-share');
      }
    }
  };
})(window);
