> Superseded by the user's later 2026-09-25 decision. The glyph-replacement tasks below are no longer the active plan. Current delivery retains authentic CDP 2.4 glyphs and version labels with an entrant-confirmed public-use basis. See README.md and assets/vendor/LICENSES.md for current status.

# 古文字字形来源替换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用逐格可核验的汉典 SVG 替换参赛版中 396 格 CDP 2.4 衍生字形，查不到或不合格的格位留空，并使页面、统计和资料说明与实际产物一致。

**Architecture:** 一次性、限速的离线采集把公开字条的代表 SVG 与逐格出处清单存入 `assets/evidence/zdic/`；生成器只读取已验证的本地清单和敬峰中山王篆字体，生成现有 `AncientGlyphs` 运行时接口。浏览器不向汉典请求素材。逐格证据及缺格由生成数据驱动，不能回退 CDP。

**Tech Stack:** Node.js 内置 `fetch`/`assert`/`crypto`、Python 现有 `verify/zdic-outline.py`、原生浏览器脚本、现有 Vue 3 页面。

**Spec:** [古文字字形来源替换设计](../specs/2026-09-25-ancient-glyph-source-replacement-design.md)

## Global Constraints

- 保留 106 字目录与五阶段接口；103 格敬峰中山王篆及原有 9 格汉典来源不丢失。
- 旧 CDP 2.4 文件可留作内部比对，但不得作为新生成器输入、缺格回退或参赛版分发内容。
- 只有同字头、同阶段、原 SVG、URL、SHA-256 和可解析路径全部核实时才生成字形。
- HTTP 403、429、访问限制、未知页面或非 SVG 停止采集，不绕过；每个请求间隔至少 700 ms，最多一次失败重试。
- 汉典的 CC0 是该站的公开声明；小学堂 CC0 仅覆盖小学堂查询图片，不相互外推。
- 当前工作树已有未提交改动；不重置、不清理、不将无关改动混入提交。`verify/` 被 `.gitignore` 排除，本地测试可留在该目录，不强制纳入部署仓库。
- 不把不同异体的形状差异自动判作文字学错误；疑似拓片、黑底或异常署名进入人工复核，不冒充描摹矢量。

## Review Focus

1. 字条跳转到别字或站点模板变化：采集应拒绝，而不是把别字配给本字；Task 1 的 canonical 测试覆盖。
2. 同一 SVG URL 被错误配给不同字／阶段：清单应拒绝重复配对；Task 1 的唯一性测试覆盖。
3. 缓存 SVG 被改动：生成前哈希失败，旧产物不得被覆盖；Task 2 的篡改测试覆盖。
4. 原来存在但汉典查不到的格：运行时 `has` 为 false，来源与路径不假报；Task 2 的缺格测试覆盖。
5. 页面许可计数和文字仍按旧 396 格写死：审计与浏览器测试应基于实际格位；Task 3 的统计测试覆盖。

---

### Task 1: 汉典代表图采集与逐格清单

**Files:**
- Create: `verify/zdic-collector.mjs`（本地维护脚本；不进入公开部署集）
- Create: `verify/test-zdic-collector.mjs`（本地测试）
- Create/Update: `assets/evidence/zdic/manifest.json`、`assets/evidence/zdic/*.svg`、`assets/evidence/zdic/README.md`
- Read: `verify/roster.json`、`verify/tmp/zdic-collect.mjs`（仅参考旧解析）

**Interfaces:**
- Produces: `parseEvolutionStrip(html, char)` → `{甲骨文?: url, 金文?: url, 楚簡?: url, 小篆?: url}`；`validateSvg(svg)` → 抛错或返回 `{paths, viewBox}`；`assertUniqueRecords(records)` → 无返回或抛错；`collect({roster, root, fetchImpl, pause})` → `{records, missing, blocked}`。
- Manifest: `{provider:'ZDIC', retrievedAt, licenseUrl, records:[{char,era,pageUrl,imageUrl,file,sha256,paths,viewBox,status}], missing:[{char,era,reason}]}`；仅 `status:'verified'` 的记录可供 Task 2 使用。

- [ ] **Step 1: 先写解析与校验失败测试**

```js
import assert from 'node:assert/strict';
import {parseEvolutionStrip, validateSvg, assertUniqueRecords} from './zdic-collector.mjs';
const page = '<link rel="canonical" href="https://zdic.net/hans/日">' +
  '<h3 class="dict-sub-title">字源演变</h3>' +
  '<img src="https://img.zdic.net/zy/jiaguwen/42_ED44.svg" alt="甲骨文">' +
  '<h3 class="dict-sub-title">字形对比</h3>';
assert.equal(parseEvolutionStrip(page,'日').甲骨文,
  'https://img.zdic.net/zy/jiaguwen/42_ED44.svg');
assert.throws(()=>parseEvolutionStrip(page,'月'),/字头/);
assert.throws(()=>parseEvolutionStrip(page.replace('img.zdic.net','elsewhere.test'),'日'),/图像域名/);
assert.throws(()=>validateSvg('<html>denied</html>'),/SVG/);
assert.throws(()=>validateSvg('<svg viewBox="0 0 400 400"></svg>'),/path/);
assert.throws(()=>validateSvg('<svg viewBox="0 0 400 400" onload="alert(1)"><path d="M0 0L1 1"/></svg>'),/脚本/);
```

- [ ] **Step 2: 跑 RED** — `node verify/test-zdic-collector.mjs`；预期因导出函数缺失而失败。
- [ ] **Step 3: 实现最小采集器** — 仅解析 canonical 与 `字源演变` 至 `字形对比` 的区间，标签映射为 `甲骨文→甲骨文`、`金文→金文`、`楚系简帛→楚簡`、`说文→小篆`；`https://img.zdic.net/zy/` 之外拒绝。`validateSvg` 验证 `<svg`、400×400 画布及非空 `<path d=...>`，并拒绝脚本、事件属性、`foreignObject` 与外链；源文件上限 1 MB。Task 2 的 `zo.convert` 是最终可解析校验。采集使用非关联字目录，按字一次请求页面；已存文件校验哈希后续跑；逐格写入证据。模块导入只提供函数，只有直接运行脚本才开始联网。遇限制停止，不制造空记录来掩盖失败。

```js
const ERA_MAP={'甲骨文':'甲骨文','金文':'金文','楚系简帛':'楚簡','说文':'小篆'};
const canonical='https://zdic.net/hans/'+char;
if(!html.includes('rel="canonical" href="'+canonical+'"')) throw Error('字头不符');
const strip=html.slice(html.indexOf('字源演变'),html.indexOf('字形对比'));
for(const m of strip.matchAll(/<img\s+src="([^"]+)"\s+alt="([^"]+)"/g)) {
  if(ERA_MAP[m[2]]) result[ERA_MAP[m[2]]]=checkImageUrl(m[1]);
}
```
- [ ] **Step 4: 加唯一性与续跑测试，观察 RED 再实现 GREEN**

```js
assert.throws(()=>assertUniqueRecords([
  {char:'日',era:'甲骨文',imageUrl:'https://img.zdic.net/zy/a.svg'},
  {char:'月',era:'金文',imageUrl:'https://img.zdic.net/zy/a.svg'}
]),/重复/);
```

- [ ] **Step 5: 本地限速采集与核对** — `node verify/zdic-collector.mjs`。预期每字打印已核验与缺失数；完成后 `node verify/test-zdic-collector.mjs` 通过，`manifest.json` 的每条 `file` 均存在且哈希匹配。若服务器限制，保留进度并报告，不继续绕过。对疑似拓片单列 `review`，不标 verified。
- [ ] **Step 6: 记录结果** — 在 `assets/evidence/zdic/README.md` 写实测总数、缺源和人工复核清单；只阶段性提交新证据文件，不提交已有无关工作树改动。命令：`git add -- assets/evidence/zdic/`，先 `git diff --cached --name-only` 审核，再用 `git -c user.name=Codex -c user.email=codex@openai.com commit -m "data: archive verified ZDIC glyph sources"`；若旧文件已含用户改动，改用选择性暂存或保留未提交。

### Task 2: 生成器移除 CDP 2.4 输入与回退

**Files:**
- Modify: `verify/build-ancient-data.py`、`verify/zdic-outline.py`（仅源图出现现有解析器不支持的已验证指令时扩展）
- Create: `verify/test-zdic-build.mjs`（本地测试）
- Regenerate: `data/ancient.js`
- Consumes: Task 1 的 `assets/evidence/zdic/manifest.json`、已验证 SVG。

**Interfaces:**
- Produces: 保持 `AncientGlyphs.has(ch,era)`、`paths(ch,era)`、`erasOf(ch)`、`missingOf(ch)`、`glyphSource(ch,era)`；新增 `glyphEvidence(ch,era)` → `{pageUrl,imageUrl,sha256}` 或 `null`。`SOURCES` 只含实际用到的 ZDIC 与 JFZSK，四个非战国金文阶段的 `ERAS[i].src` 为 ZDIC。

- [ ] **Step 1: 先写旧版残留失败测试**

```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const c={}; c.window=c; vm.createContext(c);
vm.runInContext(fs.readFileSync(new URL('../data/ancient.js',import.meta.url),'utf8'),c);
const A=c.AncientGlyphs;
assert.equal(Object.values(A.SOURCES).some(s=>s.id==='CDP'),false);
for(const ch of Object.keys(A.chars)) for(const era of A.ERAS) if(A.has(ch,era.key)) {
  assert.ok(A.glyphSource(ch,era.key)?.license_ok===true);
  if(era.key!=='戰國金文') assert.ok(A.glyphEvidence(ch,era.key)?.sha256);
}
```

- [ ] **Step 2: 跑 RED** — `node verify/test-zdic-build.mjs`；预期当前 `SOURCES.CDP` 仍在或无 `glyphEvidence`。
- [ ] **Step 3: 改生成器** — 删除 CDP 字体列表、Big5/S2T 覆盖门禁和 CDP 来源定义；只从 manifest 中 `verified` 且哈希匹配的 SVG 调用 `zo.convert`，不读取 `verify/tmp/cdp/out`。保留 JFZSK 字体一路及楷书 fit。为每格输出 `GLYPH_EVIDENCE`，让缺格的 `glyphSource` 返回 `null` 而非阶段默认来源；`glyphEvidence` 仅存在格返回证据。保留旧的五阶段顺序与已有 `KAI_FIT`。

```python
import hashlib

def verify_zdic_record(record, root):
    source = os.path.join(root, record['file'])
    data = open(source, 'rb').read()
    if hashlib.sha256(data).hexdigest() != record['sha256']:
        raise ValueError('SHA-256 不匹配: ' + record['char'] + '@' + record['era'])
    return zo.convert(data.decode('utf-8'), BOX, MARGIN)[0]
```

- [ ] **Step 4: 增加篡改与缺格失败测试，观察 RED 再实现 GREEN** — 在 `verify/test-zdic-manifest.py` 中通过 `importlib` 装载生成器，在临时目录放最小 SVG 与 manifest，篡改源图一个字节后调用 `verify_zdic_record(record,root)`，预期抛 `ValueError` 且包含 `SHA-256`；对未收录格 `A.has` 为 false、`A.paths` 为 `[]`、`A.glyphSource` 与 `A.glyphEvidence` 为 `null`。
- [ ] **Step 5: 重新生成并运行测试** — `python verify/build-ancient-data.py`、`node verify/test-zdic-build.mjs`、`python verify/test-zdic-manifest.py`；预期 0 个 CDP 来源、0 个无证据的汉典格，统计来自实际路径。若 `zdic-outline.py` 遇新指令，先给该指令写 Python 失败测试再扩解析。
- [ ] **Step 6: 核对改动** — 对照 `git diff -- data/ancient.js`、manifest、生成报告，确认旧版路径真的被新轮廓替换，绝不只是改元数据；`data/ancient.js` 已有预存改动，只有可分离本任务差异时才选择性暂存提交，不能把此前用户改动一起纳入。

### Task 3: 页面、审计与缺格说明同步

**Files:**
- Modify: `src/ui/experience.js`、`src/ui/origin-shell.js`、`src/ui/mode-evolution.js`、`src/ui/app-shell.js`、`data/gap-notes.js`
- Modify: `verify/test-finishing.mjs`、`verify/test-evidence.mjs`、`verify/test-gap-notes.mjs`、`verify/test-origin.mjs`、`verify/test-evolution.mjs`（本地测试）
- Consumes: Task 2 的 `glyphSource`／`glyphEvidence` 与实际 `has`。

**Interfaces:**
- `ZQ.projectAudit()` 保持现有字段，但 `licensePending===0` 且 `licenseDeclared===ancientAvailable`；`licenseUnstated` 只在实际来源未声明时计数，不写死 9。来源展签优先给出该格字条直链；缺格显示“本素材集未选得可核实字形”。

- [ ] **Step 1: 先改断言，观察 RED** — 新增对当前界面尚未提供的逐格字条直链的 DOM 断言，及以下来源计数断言。

```js
const audit=c.ZQ.projectAudit();
assert.equal(audit.licensePending,0,'参赛版不得仍显示 CDP 2.4 待许可格');
assert.equal(audit.licenseDeclared,audit.ancientAvailable);
assert.equal(audit.licenseUnstated,0);
for(const ch of Object.keys(c.CharCatalog)) for(const e of c.AncientGlyphs.ERAS) {
  if(!c.AncientGlyphs.has(ch,e.key)) assert.equal(c.AncientGlyphs.glyphSource(ch,e.key),null);
}
```

- [ ] **Step 2: 跑 RED** — `node verify/test-origin.mjs` 对逐格字条直链失败；`node verify/test-finishing.mjs` 与 `node verify/test-evidence.mjs` 的当前旧 396/405 断言也应按新数据失败。
- [ ] **Step 3: 同步页面逻辑** — 所有来源按格取 `glyphSource`，缺格不渲染来源链接；有证据的汉典格显示字条 URL 与 CC0 声明。删去专指 CDP 2.4 待确认的展签和首页警告；保留第三方权利与释读未复核的通用限定。`data/gap-notes.js` 只记录新生成数据中的真实缺格，逐格说明“未选得”而非“历史不存在”。
- [ ] **Step 4: 动态断言 GREEN** — 将 `test-gap-notes.mjs` 从固定 22 格／9 格扩为与 `AncientGlyphs` 实测缺口双向对照；浏览器用日、月、明及至少一个新缺格检查可见字形、阶段、来源链接和空态。运行 `node verify/test-finishing.mjs`、`node verify/test-evidence.mjs`、`node verify/test-gap-notes.mjs`、`node verify/test-origin.mjs`、`node verify/test-evolution.mjs`；预期全部通过。
- [ ] **Step 5: 记录结果** — 对每个已脏文件用 `git diff -- <file>` 审核；可独立暂存的本任务差异才提交，无法安全分离的旧改动留未提交并在交付说明中指出。

### Task 4: 资料审查与全项目验收

**Files:**
- Modify: `assets/vendor/LICENSES.md`、`README.md`、`参赛准备/古文字资料盘点.md`、`参赛准备/古文字出处与许可核查.md`、`参赛准备/竞争力评估与申报草稿.md`、`verify/run-all.mjs`
- Create: `参赛准备/汉典逐格替换核查表.md`（本地参赛资料）
- Test: `verify/run-all.mjs`、`verify/test-ancient.html`、`verify/test-origin.mjs`、`verify/test-evolution.mjs`

**Interfaces:**
- 从 manifest 和 `AncientGlyphs` 计算各阶段格数、实际替换数、人工待复核数、缺源数、CDP 残留数；材料不手写未经核验的“396 格已替换”。

- [ ] **Step 1: 写文档统计校验测试并跑 RED** — `verify/test-zdic-report.mjs` 读取 manifest、`data/ancient.js` 和参赛核查表；至少断言报告包含运行时算出的 `ancientAvailable`、`ancientMissing`、`CDP 残留 0`，且每个非战国金文可用格有 manifest 记录。
- [ ] **Step 2: 更新文档并跑 GREEN** — 逐格核查表列出成功、缺失与待复核；更新许可清单和作品说明，汉典 CC0 与小学堂 CC0 分开表述。`node verify/test-zdic-report.mjs` 通过。
- [ ] **Step 3: 全量验证** — 将 `test-zdic-collector.mjs`、`test-zdic-build.mjs`、`test-zdic-report.mjs` 接入 `verify/run-all.mjs`；运行 `node verify/run-all.mjs` 并读取完整结果。跑 `python verify/build-ancient-data.py` 后比对产物哈希或 `git diff`，确认重复构建确定性；在浏览器抽查至少 12 字 × 四个汉典阶段的清晰度、边框、站方署名与空态。测试失败先复现并按 TDD 修复，再重跑全套。
- [ ] **Step 4: 最终核账** — 报告 396 个旧格中实得替换、缺源、待复核各数；全项目仍有多少可用格；旧 CDP 运行时残留是否为零。检查 `git status --short`，不删除旧字体或用户资料。只选择性提交可分离的任务文件，未提交的重叠改动如实说明。
