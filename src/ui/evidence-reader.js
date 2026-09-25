/* 独立出处阅览：公开查询结果的整理字形图，不代替原拓或专业释读。 */
(function (global) {
  'use strict';
  var ZQ=global.ZQ=global.ZQ || {};
  var categoryMap={'甲骨文':'jiaguwen','金文':'jinwen','楚簡':'chuwenzi','小篆':'xiaozhuan','隶书':'lishu','戰國金文':'zhanguo','楷书':'kaishu'};
  /* 三个试点字只加可追溯的解读，不改全字库。教学拆分是看现代结构的入口，
   * 历史释形是字书记录；两者不能相互替代。 */
  var spotlights={
    '木':{
      title:'木 · 从树形到构件',
      teaching:'现代“木”既可独立成字，也可作“休”等字的构件；用树干、枝叶和根来观察字形，便于入门。',
      historical:'教育部《异体字字典》引《说文》以“从屮，下象其根”解释“木”。这是传世字书的释形；具体甲骨、金文字例仍要逐件核对。',
      moeUrl:'https://dict.variants.moe.edu.tw/dictView.jsp?educode=A01853',
      review:'待指导教师或文字学者复核'
    },
    '休':{
      title:'休 · 人与木的教学解释',
      teaching:'把现代“休”拆为“亻”和“木”，联想人在树旁停歇，是帮助记忆字义的教学方法。',
      historical:'教育部《异体字字典》引《说文》“从人依木”，并列有从“广”的异体。这是字书释形，不能据此断言每件早期字例都来自唯一造字路径。',
      moeUrl:'https://dict.variants.moe.edu.tw/dictView.jsp?educode=A00095',
      review:'待指导教师或文字学者复核'
    },
    '明':{
      title:'明 · 现代拆字不等于全部字源',
      teaching:'现代楷书“明”左为“日”、右为“月”；这是观察今天字形的便捷拆分。',
      historical:'教育部《异体字字典》记载：《说文》正篆作“朙”，从月、囧；又收从日的古文。不能把现代“日＋月”直接说成所有古字形的唯一来源。',
      moeUrl:'https://dict.variants.moe.edu.tw/dictView.jsp?ID=19711&la=1',
      review:'待指导教师或文字学者复核'
    }
  };
  var modernSource={id:'MMAH',name:'hanzi-writer-data v2.0.1（Make Me A Hanzi）',url:'https://github.com/chanind/hanzi-writer-data'};
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
      '  <section v-if="spotlight" class="zc-spotlight" aria-label="重点字解读">',
      '    <h3>{{ spotlight.title }}</h3>',
      '    <div class="zc-spotlight-reading"><p><strong>教学拆字</strong>{{ spotlight.teaching }}</p><p><strong>历史字源</strong>{{ spotlight.historical }} <a :href="spotlight.moeUrl" target="_blank" rel="noopener noreferrer">核对教育部字典条目 ↗</a></p></div>',
      '    <p class="zc-spotlight-boundary">下面两列是并行资料：时间轴字形是字体或字形素材绘制的轮廓；独立参考例证是小学堂另采的查询字样与著录。秦系简牍、汉代隶变是时间轴外的补充资料。尚未建立逐格原件对应关系，不能把例证当作时间轴轮廓的同一件出土原件。</p>',
      '    <div class="zc-spotlight-head" aria-hidden="true"><span>阶段</span><span>时间轴字形</span><span>独立参考例证</span></div>',
      '    <div class="zc-spotlight-rows"><div v-for="row in stageRows" :key="row.stage" class="zc-spotlight-row">',
      '      <strong>{{ row.stage }}<small>{{ row.inTimeline ? \'时间轴\' : \'轴外例证\' }}</small></strong>',
      '      <div class="zc-spotlight-cell"><span class="zc-spotlight-mobile-label">时间轴字形 · </span><svg v-if="row.outlinePaths.length" viewBox="0 0 64 64" role="img" :aria-label="selectedChar + row.stage + \'时间轴字形\'"><g :transform="row.outlineTransform"><path v-for="(path, i) in row.outlinePaths" :key="i" :d="path" fill="currentColor" fill-rule="evenodd" /></g></svg><span v-if="row.outlineSource">{{ row.outlineSource.name }} <a v-if="row.outlineSource.url" :href="row.outlineSource.url" target="_blank" rel="noopener noreferrer">素材来源 ↗</a></span><span v-else>{{ row.inTimeline ? \'未收录此期字形\' : \'时间轴未设此阶段\' }}</span></div>',
      '      <div class="zc-spotlight-cell"><span class="zc-spotlight-mobile-label">独立参考例证 · </span><img v-if="row.example && !failedPreview[row.stage]" :src="row.example.image" :alt="selectedChar + row.stage + \'独立参考字样\'" loading="lazy" @error="failedPreview[row.stage] = true"><span v-if="row.example">{{ row.example.refs.join(" / ") }}；字形编号 {{ row.example.glyphId }} <a :href="row.example.pageUrl" target="_blank" rel="noopener noreferrer">核对条目 ↗</a></span><span v-else>未采集，不以邻期冒充</span><small v-if="row.stage === \'小篆\' && row.example">《说文》字样是传世字书资料，非秦代出土原件。</small></div>',
      '    </div></div>',
      '    <p class="zc-spotlight-review">专业复核：{{ spotlight.review }}</p>',
      '  </section>',
      '  <div class="zc-evidence-categories" aria-label="资料分类"><button v-for="cat in categories" :key="cat.key" :aria-pressed="category === cat.key" @click="selectCategory(cat.key)">{{ cat.label }}</button></div>',
      '  <div class="zc-evidence-comparison-tools"><button class="zc-btn" :aria-pressed="compare" @click="compare = !compare">{{ compare ? \'返回单份资料\' : \'并排对照\' }}</button><label v-if="compare">对照资料 <select :value="compareCategory" @change="selectCompare($event.target.value)"><option v-for="cat in categories" :key="cat.key" :value="cat.key">{{ cat.label }}</option></select></label></div>',
      '  <section v-if="compare" class="zc-evidence-compare"><article v-for="(r, i) in [current, comparison]" :key="i"><template v-if="r"><h3>{{ r.label }}</h3><figure><img v-if="!failedCompare[i]" :key="r.image" :src="r.image" :alt="selectedChar + \' · \' + r.label" @error="failedCompare[i] = true"><p v-else role="status">本地图片未能加载。</p><figcaption>{{ r.kind }} · {{ r.displayStyle }}</figcaption></figure><p>{{ r.refs.join(\' / \') }}</p><a :href="r.pageUrl" target="_blank" rel="noopener noreferrer">查看此份条目 ↗</a></template><template v-else><h3>尚未采集</h3><p>此字此类资料保持缺失，不使用其他阶段冒充。</p></template></article></section>',
      '  <section v-else-if="current" class="zc-evidence-record">',
      '   <figure><img v-if="!imageFailed" :key="current.image" :src="current.image" :alt="selectedChar + \' · \' + current.label + \' · \' + current.refs.join(\' / \')" @error="imageFailed = true"><p v-else role="status">本地字形图片未能加载，请检查文件完整性。</p><figcaption>{{ current.kind }} · {{ current.displayStyle }}</figcaption></figure>',
      '   <div><span class="zc-status-eyebrow">{{ current.label }}</span><h3>著录信息</h3><ul><li v-for="ref in current.refs" :key="ref">{{ ref }}</li></ul><p class="zc-evidence-identity">数据库字形编号 {{ current.glyphId }}</p><div class="zc-evidence-links"><a :href="current.pageUrl" target="_blank" rel="noopener noreferrer">查看数据库条目 ↗</a><a :href="licenseUrl" target="_blank" rel="noopener noreferrer">CC0 使用声明 ↗</a></div><p class="zc-note">外部链接需要联网；本页图片和著录可离线阅读。</p></div>',
      '  </section>',
      '  <section v-else class="zc-evidence-empty"><h3>此字此类资料尚未采集</h3><p>{{ emptyNote }}</p><p>可从上方选择已采集的代表字；本地缺资料不等于历史上没有这个字。</p></section>',
      '  <details class="zc-evidence-boundary"><summary>这些资料能证明什么？</summary><p>字形图来自小学堂查询结果，是资料库整理的字样，不是器物、简牍或拓片的原始照片。著录文字按结果页保留，简称需对照数据库引书表；“说文小篆”不是秦代原件，“汉代隶变”保留具体年代。各类字形不构成唯一、必然的线性演变链。</p><p>本批查询图及字形属性依据小学堂 CC0 声明使用；CDP 2.4 字形的使用依据另见各字展签，不从小学堂 CC0 推导。网页字头、著录和下载一致性已核对，专业释读尚未复核。</p></details>',
      '  <details v-if="citation" class="zc-evidence-boundary"><summary>引用记录（可选中复制）</summary><textarea class="zc-evidence-citation" readonly :value="citation" aria-label="所选字形引用记录" rows="5"></textarea></details>',
      '  <p class="zc-evidence-stamp">来源：小学堂文字学资料库 · 采集日期 {{ collectedDate }} · 图像未重新绘制</p>',
      ' </dialog>',
      '</div>'
    ].join('\n'),
    data:function () { return {selectedChar:this.char,category:'jiaguwen',imageFailed:false,message:'',compare:false,compareCategory:'lishu',failedCompare:[false,false],failedPreview:{}}; },
    beforeUnmount:function () { this.close(); },
    methods:{
      open:function () {
        this.selectedChar=this.char; this.category=Object.prototype.hasOwnProperty.call(categoryMap,this.stageKey)?categoryMap[this.stageKey]:'jiaguwen';
        this.openDialog();
      },
      /* 外部点名要看的**某一个字 + 某一类**（02 的隶变节点就这样用：那里列出的
       * 九个字与当前选中的字无关）。字不在资料集里就**一个字都不动**、返回 false，
       * 让调用方自己决定要不要提示 —— 悄悄换掉用户正在看的资料比不打开更糟。 */
      openAt:function (char,category) {
        if (!dataset().characters.includes(char)) return false;
        this.selectedChar=char;
        if (dataset().categories.some(function (c) { return c.key===category; })) this.category=category;
        this.openDialog();
        return true;
      },
      openDialog:function () {
        this.resetImages(); this.message=''; this.compare=false;
        this.compareCategory=this.category==='lishu'?'jiaguwen':'lishu';
        var dialog=this.$refs.dialog;
        if (!dialog || typeof dialog.showModal!=='function') { this.message='当前浏览器不支持资料阅览面板，请使用现代桌面浏览器。'; return false; }
        if (!dialog.open) { dialog.showModal(); this.$emit('open'); }
        return true;
      },
      close:function () { var dialog=this.$refs && this.$refs.dialog; if(dialog && dialog.open && typeof dialog.close==='function') dialog.close(); },
      resetImages:function () { this.imageFailed=false; this.failedCompare=[false,false]; this.failedPreview={}; },
      selectChar:function (char) { if (!dataset().characters.includes(char)) return false; this.selectedChar=char; this.resetImages(); return true; },
      selectCategory:function (key) { if(!dataset().categories.some(function(c) { return c.key===key; })) return false; this.category=key; this.resetImages(); return true; },
      selectCompare:function (key) { if(!dataset().categories.some(function(c) { return c.key===key; })) return false; this.compareCategory=key; this.failedCompare=[false,false]; return true; }
    },
    computed:{
      spotlight:function () { return Object.prototype.hasOwnProperty.call(spotlights,this.selectedChar) ? spotlights[this.selectedChar] : null; },
      stageRows:function () {
        if (!this.spotlight) return [];
        var ch=this.selectedChar, A=global.AncientGlyphs, records=dataset().records;
        if (!A) return [];
        var stages=A.ERAS.map(function (era) { return {stage:era.key,category:categoryMap[era.key] || null,inTimeline:true}; });
        var sealIndex=stages.findIndex(function (item) { return item.stage==='小篆'; });
        stages.splice(sealIndex < 0 ? stages.length : sealIndex,0,{stage:'秦系简牍',category:'qinwenzi',inTimeline:false});
        stages.push({stage:'汉代隶变',category:'lishu',inTimeline:false});
        stages.push({stage:(global.Evolution && global.Evolution.KAI_KEY) || '楷书',category:null,inTimeline:true,modern:true});
        var base=global.Positioner.create(64,64,5).transform;
        return stages.map(function (item) {
          var ancient=item.inTimeline && !item.modern && A.has(ch,item.stage);
          var modernPaths=item.modern && global.__CHARS__ && global.__CHARS__[ch] ? global.__CHARS__[ch].strokes || [] : [];
          var outlinePaths=ancient ? A.paths(ch,item.stage) : modernPaths;
          var outlineSource=ancient ? A.glyphSource(ch,item.stage) : (modernPaths.length ? modernSource : null);
          var fit=item.modern && A.kaiFit(ch);
          var outlineTransform=fit ? base+' translate('+fit[1]+','+fit[2]+') scale('+fit[0]+')' : base;
          var example=item.category ? records.find(function (r) { return r.char===ch && r.category===item.category; }) || null : null;
          return {stage:item.stage,inTimeline:item.inTimeline,outlineSource:outlineSource,outlinePaths:outlinePaths,outlineTransform:outlineTransform,example:example};
        });
      },
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
