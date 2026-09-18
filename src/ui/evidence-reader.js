/* 独立出处阅览：公开查询结果的整理字形图，不代替原拓或专业释读。 */
(function (global) {
  'use strict';
  var ZQ=global.ZQ=global.ZQ || {};
  var categoryMap={'甲骨文':'jiaguwen','金文':'jinwen','楚簡':'chuwenzi','小篆':'xiaozhuan','隶书':'lishu','戰國金文':'zhanguo','楷书':'kaishu'};
  function dataset() { return global.XiaoxueEvidence || {characters:[],categories:[],records:[],queries:[]}; }
  ZQ.EvidenceReader={
    name:'EvidenceReader',
    props:{char:{type:String,required:true},stageKey:{type:String,default:''}},
    emits:['open'],
    template:[
      '<div class="zc-evidence-entry">',
      ' <button class="zc-btn" @click="open">出处与实证 <span aria-hidden="true">↗</span></button>',
      ' <span>字形、著录与使用许可</span>',
      ' <p v-if="message" class="zc-note" role="status">{{ message }}</p>',
      ' <dialog ref="dialog" class="zc-help-dialog zc-evidence-dialog" aria-label="出处与实证阅览">',
      '  <header><div><span class="zc-status-eyebrow">GLYPH ARCHIVE · 字形档案</span><h2>「{{ selectedChar }}」的出处与实证</h2></div><button class="zc-btn" autofocus @click="close">关闭</button></header>',
      '  <p class="zc-note">独立资料集：{{ characters.length }} 个代表字，{{ recordCount }} 张查询字形图；{{ liCount }} 个字有汉代隶变资料。不会把此数计入旧字体时间轴的完成率。</p>',
      '  <div class="zc-evidence-charlist" aria-label="已采集的代表字"><button v-for="ch in characters" :key="ch" :aria-pressed="selectedChar === ch" @click="selectChar(ch)">{{ ch }}</button></div>',
      '  <div class="zc-evidence-categories" aria-label="资料分类"><button v-for="cat in categories" :key="cat.key" :aria-pressed="category === cat.key" @click="selectCategory(cat.key)">{{ cat.label }}</button></div>',
      '  <div class="zc-evidence-comparison-tools"><button class="zc-btn" :aria-pressed="compare" @click="compare = !compare">{{ compare ? \'返回单份资料\' : \'并排对照\' }}</button><label v-if="compare">对照资料 <select :value="compareCategory" @change="selectCompare($event.target.value)"><option v-for="cat in categories" :key="cat.key" :value="cat.key">{{ cat.label }}</option></select></label></div>',
      '  <section v-if="compare" class="zc-evidence-compare"><article v-for="(r, i) in [current, comparison]" :key="i"><template v-if="r"><h3>{{ r.label }}</h3><figure><img v-if="!failedCompare[i]" :key="r.image" :src="r.image" :alt="selectedChar + \' · \' + r.label" @error="failedCompare[i] = true"><p v-else role="status">本地图片未能加载。</p><figcaption>{{ r.kind }} · {{ r.displayStyle }}</figcaption></figure><p>{{ r.refs.join(\' / \') }}</p><a :href="r.pageUrl" target="_blank" rel="noopener noreferrer">查看此份条目 ↗</a></template><template v-else><h3>尚未采集</h3><p>此字此类资料保持缺失，不使用其他阶段冒充。</p></template></article></section>',
      '  <section v-else-if="current" class="zc-evidence-record">',
      '   <figure><img v-if="!imageFailed" :key="current.image" :src="current.image" :alt="selectedChar + \' · \' + current.label + \' · \' + current.refs.join(\' / \')" @error="imageFailed = true"><p v-else role="status">本地字形图片未能加载，请检查文件完整性。</p><figcaption>{{ current.kind }} · {{ current.displayStyle }}</figcaption></figure>',
      '   <div><span class="zc-status-eyebrow">{{ current.label }}</span><h3>著录信息</h3><ul><li v-for="ref in current.refs" :key="ref">{{ ref }}</li></ul><p class="zc-evidence-identity">数据库字形编号 {{ current.glyphId }}</p><div class="zc-evidence-links"><a :href="current.pageUrl" target="_blank" rel="noopener noreferrer">查看数据库条目 ↗</a><a :href="licenseUrl" target="_blank" rel="noopener noreferrer">CC0 使用声明 ↗</a></div><p class="zc-note">外部链接需要联网；本页图片和著录可离线阅读。</p></div>',
      '  </section>',
      '  <section v-else class="zc-evidence-empty"><h3>此字此类资料尚未采集</h3><p>{{ emptyNote }}</p><p>可从上方选择已采集的代表字；本地缺资料不等于历史上没有这个字。</p></section>',
      '  <details class="zc-evidence-boundary"><summary>这些资料能证明什么？</summary><p>字形图来自小学堂查询结果，是资料库整理的字样，不是器物、简牍或拓片的原始照片。著录文字按结果页保留，简称需对照数据库引书表；“说文小篆”不是秦代原件，“汉代隶变”保留具体年代。各类字形不构成唯一、必然的线性演变链。</p><p>本批查询图及字形属性依据小学堂 CC0 声明使用；旧 CDP 2.4 字体文件的授权状态没有因此改变。网页字头、著录和下载一致性已核对，专业释读尚未复核。</p></details>',
      '  <details v-if="citation" class="zc-evidence-boundary"><summary>引用记录（可选中复制）</summary><textarea class="zc-evidence-citation" readonly :value="citation" aria-label="所选字形引用记录" rows="5"></textarea></details>',
      '  <p class="zc-evidence-stamp">来源：小学堂文字学资料库 · 采集日期 {{ collectedDate }} · 图像未重新绘制</p>',
      ' </dialog>',
      '</div>'
    ].join('\n'),
    data:function () { return {selectedChar:this.char,category:'jiaguwen',imageFailed:false,message:'',compare:false,compareCategory:'lishu',failedCompare:[false,false]}; },
    beforeUnmount:function () { this.close(); },
    methods:{
      open:function () {
        this.selectedChar=this.char; this.category=Object.prototype.hasOwnProperty.call(categoryMap,this.stageKey)?categoryMap[this.stageKey]:'jiaguwen'; this.resetImages(); this.message=''; this.compare=false; this.compareCategory=this.category==='lishu'?'jiaguwen':'lishu';
        var dialog=this.$refs.dialog;
        if (!dialog || typeof dialog.showModal!=='function') { this.message='当前浏览器不支持资料阅览面板，请使用现代桌面浏览器。'; return; }
        if (!dialog.open) { dialog.showModal(); this.$emit('open'); }
      },
      close:function () { var dialog=this.$refs && this.$refs.dialog; if(dialog && dialog.open && typeof dialog.close==='function') dialog.close(); },
      resetImages:function () { this.imageFailed=false; this.failedCompare=[false,false]; },
      selectChar:function (char) { if (!dataset().characters.includes(char)) return false; this.selectedChar=char; this.resetImages(); return true; },
      selectCategory:function (key) { if(!dataset().categories.some(function(c) { return c.key===key; })) return false; this.category=key; this.resetImages(); return true; },
      selectCompare:function (key) { if(!dataset().categories.some(function(c) { return c.key===key; })) return false; this.compareCategory=key; this.failedCompare=[false,false]; return true; }
    },
    computed:{
      characters:function () { return dataset().characters; },
      categories:function () { return dataset().categories; },
      recordCount:function () { return dataset().records.length; },
      liCount:function () { return new Set(dataset().records.filter(function(r) { return r.category==='lishu'; }).map(function(r) { return r.char; })).size; },
      current:function () { var self=this; return dataset().records.find(function(r) { return r.char===self.selectedChar && r.category===self.category; }) || null; },
      comparison:function () { var self=this; return dataset().records.find(function(r) { return r.char===self.selectedChar && r.category===self.compareCategory; }) || null; },
      citation:function () { var records=this.compare?[this.current,this.comparison]:[this.current], self=this; return records.filter(Boolean).map(function(r) { return ['字：'+r.char+'；类别：'+r.label,'著录：'+r.refs.join(' / '),'来源：小学堂文字学资料库；字形编号：'+r.glyphId,'条目：'+r.pageUrl,'许可：CC0 1.0；'+self.licenseUrl,'采集日期：'+self.collectedDate,'说明：'+r.kind+'；专业释读未复核'].join('\n'); }).join('\n\n'); },
      emptyNote:function () { var self=this, query=dataset().queries.find(function(q) { return q.char===self.selectedChar && q.category===self.category; }); return query ? query.note : '当前资料集只采集了部分代表字，其他字继续保持未采集状态。'; },
      licenseUrl:function () { return dataset().licenseUrl || 'https://xiaoxue.iis.sinica.edu.tw/License/License'; },
      collectedDate:function () { return (dataset().retrievedAt || '').slice(0,10); }
    }
  };
})(window);
