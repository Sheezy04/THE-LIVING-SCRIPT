# 字从何来 → 《字启千年》

汉字构形与文明演变互动体验平台

> 2026-09-18 本轮交付：**四项参赛功能 + 生肖凑齐 12 字**——界面中英双语开关（外壳文案 + 核心 42 字一行英文释义，`data/en.js`；内容长文回退中文）、
> 作品墙（字库卡片海报缩略 + 重新导出 PNG）、作品分享链接（`#share=MINE1码`，预览后确认保存）、主题字包（首页按主题给已收录字分组：
> 自然/人体/数字/农耕/动作/生肖——生肖已于同日补齐 兔蛇猴鸡狗猪，目录 128 → 134）。全部离线可用、零后端。
> 最新功能边界、验证结果及用户待办见 [交付与待办.md](交付与待办.md)。
> 下文保留早期开发记录，其中“五模块”“我的造字未完成”和旧浏览器测试结论不代表本轮状态
> （“五模块”这个说法现在至少落后两轮：本轮的模块数是七个）。

---

## 运行

**直接双击 HTML 即可**，不需要装任何东西、不需要本地服务器。

| 页面 | 是什么 |
|---|---|
| `index.html` | **整个作品** —— 七个模块，顶部页签切换 |
| ~~旧 `index.html`~~ | 四模式演示（书写 / 演变 / 拆解 / 挑战）—— 2026-09-16 退役，见 `archive/legacy-app/` |

（刻意用经典 `<script>` 而非 ES module，就是为了让 `file://` 能直接跑——比赛现场最怕的是"装环境装不出来"。）

这个页面是**分层迁移**的产物：Vue 层外挂在原有引擎外面，七个引擎模块
（`positioner` / `stroke-anim` / `components` / `decompose` / `challenge` / `compose` / `evolution`）
一行没动，仍然是**框架无关的 IIFE**。04 是新写的（`quiz.js`），写法照着这个来 ——
逻辑层是能在 Node 里单测的纯 IIFE，Vue 只做薄薄一层。
每迁一个模块，`run-all.mjs` 都要全绿才继续。

当前入口：**首页、汉字探索、千年演变、构形实验室、汉字挑战、我的造字、汉字关系网**。古文字审核与现场实测尚未完成。

> 迁移之前那个四模式的单页应用（`index.html` + `src/app.js`）已于 2026-09-16 退役，
> 移进 `archive/legacy-app/`。它**缺 04/05 两个模块**，所以没有「新栈出问题就退回去」
> 这个兜底价值 —— 退回去照样交不了稿。归档而不是直接删，是因为这个项目没有版本控制。

### 调试用 URL 参数

深链：页面加载时直达指定模块、选字与子页（一次性消费，只解析一次，不监听 hashchange）：

```
index.html#char=休&mod=origin&view=writing    # 01 汉字探索 · 书写页签
index.html#char=安&mod=lab&view=chal           # 03 构形实验室 · 目标拼合
index.html#mod=quiz&level=classic&q=7          # 04 轻松探索 · 固定种子轮
```

| 参数 | 取值 | 说明 |
|---|---|---|
| `char` | CharCatalog 内任意字 | 非法/缺失回退默认「休」 |
| `mod` | `home` `origin` `evo` `lab` `quiz` `mine` `graph` | 非法忽略（留守首页） |
| `view` | origin：`meaning` / `source` / `writing`；evo：`stage` / `pick`；lab：`know` / `chal` | 非白名单忽略 |
| `level` | `mission` / `classic` | 仅 quiz 用 |
| `q` | 正整数 | 04 题种子，与深链参数 `&` 共存 |

深链在跳到目标屏后 `view`/`level` 即失效，再手动切模块回到各模块默认子页，
不会反复弹回链接指定的页。`#q=` 行为不变 —— 同一地址刷新仍出同一套题。

**作品分享链接**：字库卡片「分享」生成 `#share=<MINE1 编码>`（作品编码进 URL，零后端）。
打开链接会先看到作品预览，点「保存到我的字库」才写入；坏码只提示不写库。

旧页面那套 `?char=森&mode=decompose&t=1.5` 查询串深链**已随旧页面一起退役**，
不再兼容；新深链用的是 hash 格式，与上面 `#q=` 同一套。想直接看某一屏，
现在可以直接用深链，不必再点页签逐屏点过去。

### 键盘

旧页面那套快捷键在退役时一起没了，2026-09-16 补了回来，并顺手覆盖了旧页面
没有的 03③ 和 04。实现在 `src/ui/keys.js`（共用件），每个模块各自在 `mounted`
里领自己的键、`beforeUnmount` 里解掉（06 只领 `Esc`，用来返回上一个字）。

| 模块 | `空格` | `←` `→` | `R` | 数字键 |
|---|---|---|---|---|
| 01 汉字探索 | 书写 / 暂停 | — | 重来 | — |
| 03① 认识构形 | 分离 | 选上一个 / 下一个构件（两头绕圈） | 复位 | — |
| 03② 构形挑战 | 提示 / 隐藏底纹 | — | 重开 | — |
| 03③ 自由构字 | 就按…摆 | — | 清空 | — |
| 02 千年演变 | 演进 / 暂停 | 上一期 / 下一期 | 回到第一期 | — |
| 04 汉字挑战 | 提交 / 下一题 | 排序题：把光标那格左右挪 | 再来一轮 | `1`–`4` 选第 n 项（排序题则是把光标移到第 n 格）|
| 05 我的造字 | 就按…摆（创作画布内） | 微调选中构件（＋`Shift` 大步） | 清空（可撤销） | — |
| 06 汉字关系网 | — | — | — | — ；只领 `Esc`：退回上一个看过的字 |

06 这一页没有播放、重来那类动作，所以只领一个键。`Esc` 在别处是关对话框，
这里没有对话框，退的是**图上走过的路** —— 没有它，走进三层就回不去了。

三条「不管」的规矩（`src/ui/keys.js` 里都有长注释）：带 `Ctrl`/`Cmd`/`Alt` 的
一律不碰；按住不放（`e.repeat`）只算一次；焦点在输入控件里时全不碰 ——
而焦点在**按钮**上时只让出 `空格` 和 `回车`（浏览器要拿它们去激活那个按钮），
其余键照常接管，否则鼠标点过按钮后焦点留在按钮上、`R` 和 `←` `→` 会静默失效。

⚠️ 02 的 `←` `→` 不是瞬移：引擎会用 1800ms 做一次淡入淡出，**动画结束才换期名**。
按完立刻看会觉得「没反应」，那是节奏本身，不是卡住了。

验证：`node verify/test-keys.mjs`（真实按键 + 合成事件两路都走，
并且**数 window 上的 keydown 监听器个数**来确认切换模块时旧的那份解掉了）。

---

## 目录

```
index.html              页面
data/chars.js           100 字楷书字形数据（打包为经典 script）
data/catalog.js         128 字教学目录（唯一手改的注册表，勿由脚本覆盖）
data/ancient.js         古文字五期字形数据 ← 生成物，勿手改
data/paths.js           06 的推荐探索路径（手工写的跳转，只引用已经存在的边）
src/
  positioner.js         坐标系变换
  stroke-anim.js        书写动画引擎  ← 核心
  components.js         构件系统（数据层）
  decompose.js          拆解模块（渲染 + 拖拽，不含游戏逻辑）
  challenge.js          构形挑战（游戏层）
  evolution.js          演变模块（六期时间轴 + 淡入淡出 + 并览）
  compose.js            自由构字（纯逻辑：几何定结构 + 查表定字）
  ui/                   ← Vue 层（零构建，用 { template } 对象，不是 .vue 单文件）
    app-shell.js        顶层外壳：只持有「哪个模块」「哪个字」，各模块共用同一个字
    keys.js             键盘快捷键（共用件：各模块各领各的键，卸载时解掉）
    char-picker.js      选字面板（受控组件）
    origin-shell.js     01 汉字探索 —— 左字源卡（现存最早一期）+ 右书写
    mode-write.js       01 的书写 —— 包 StrokeRenderer 引擎
    lab-shell.js        03 构形实验室外壳：只持有「哪个模式」
    mode-decompose.js   03① 认识构形 —— 包 Decompose 引擎
    mode-challenge.js   03② 构形挑战 —— 包 Challenge 引擎
    compose-canvas.js   03③ 自由构字 —— 自己画，不用 Decompose（它没有逐构件缩放）
    mode-evolution.js   02 千年演变 —— 包 Evolution 引擎
    evo-strip.js        02 的六期缩略图条（单独拆出来，见下）
    mode-quiz.js        04 汉字挑战 —— 薄薄一层，判分全在 quiz.js 里
    graph-view.js       06 汉字关系网 —— 自己画 SVG，不包引擎
  graph.js              ← 06 的数据层（两源合并 / 邻域布局，纯逻辑，可在 Node 里单测）
  quiz.js               ← 04 引擎（四型出题 + 判分，纯逻辑，可在 Node 里单测）
  styles.css            设计系统（token 化）
assets/vendor/          零构建依赖（只剩 Vue 3 一个）
  LICENSES.md           第三方资产清单 —— 授权状态、来源、核对日期（答辩材料用）
verify/                 验证脚本与报告
  build-ancient-data.py   生成 data/ancient.js（含逐字逐期归一化）
  ttf-outline.py          从零写的 TrueType 轮廓解析（中研院那批 opentype.js 读不了）
  test-geometry.mjs       几何 + 进度逻辑验证（Node）
  test-components.mjs     构件拆分验证（Node）
  test-challenge.mjs      挑战打散方案验证（Node）
  test-compose.mjs        自由构字算法层：15 个可拆字的往返验证 + 阈值余量（Node）
  test-decomposition-consistency.mjs
                          拆解一致性：catalog ⟷ 拆解表 ⟷ 构件盘 ⟷ 拼合题（Node）
  test-quiz.mjs           04 出题与判分：四型 / 扫 400 轮 / 学术红线（Node）
  test-origin.mjs         01 汉字探索 + 顶层外壳：书写全流程 / 换字两边同步 / rAF 不泄漏（CDP）
  test-evolution.mjs      02 千年演变：六期 / 跳转 / 并览 / 覆盖一览 / 不叠层（CDP）
  test-compose-ui.mjs     自由构字 UI 层：拖拽跟手性 / 坐标 / 学术红线（CDP）
  test-lab-shell.mjs      03 构形实验室：三模式来回切不留旧引擎（CDP）
  test-keys.mjs           键盘快捷键：多模块 / 三条不管 / 切换模块不留监听器（CDP）
  test-graph.mjs          06 关系网数据层：两源合并 / 推荐路径 / 全字表邻域 / 图例举例（Node）
  test-graph-ui.mjs       06 关系网 UI：邻域渲染 / 换中心 / 返回 / 读图图例 / 监听器恒为 1（CDP）
  test-fonts.mjs          字体子集：自己解 woff2 的 cmap / 站点用字零掉落 / 原件仍在（Node）
  test-boot.mjs           冷启动逐帧录制：全新 profile / 可见的那一帧字体已就位（CDP）
  build-font-subset.py    生成三个字体子集 + charset.txt（只在改字体时用，运行时不需要 Python）
  check-page.mjs          通用页面自检 —— 驱动下面那些「自己会跑」的静态页
  run-all.mjs             一条命令跑完全部验证
  test-render.html        渲染隔离测试
  test-progress.html      进度扫描测试
  test-decompose.html     构件分离静态测试
  test-challenge-flow.html 拖拽→吸附→判定→成功 全链路（合成指针事件）
  test-ancient.html       古文字五期 × 全字表归一化自检
  test-evolution-pace.html 演进节奏 停—走—停—走（iframe + rAF 垫片）
  test-quiz-ui.html       04 UI：挂载 / 答题 / 计分 / 换轮
  test-vue-stack.html     零构建栈自检：脚本清单全加载 + Vue + 现有引擎共存
  shot-compose.html       自由构字四种状态的视觉参照
  drive-challenge.mjs     03② 构形挑战在真页面上全链路（象形字 / 重开不泄漏 rAF）
  数据可用性验证报告.md
  字体下载指南.md
```

### `verify/` 清过一次（2026-09-16）

按「有没有人引用」清了一遍：94 个顶层文件里 56 个谁都不提，其中 55 个搬到了
**`archive/verify-debris/`**（12.3 MB —— 一次性截图、退役驱动的产物、空文件、
下载的网页、管线中间物）。搬完 `run-all.mjs` 仍**全绿**。

**是归档不是删除**，和 `archive/legacy-app/` 同一个理由（没有版本控制）。
判据、恢复办法、以及**明知没人引用但故意留下**的 2 个（`fetch-hanzi.mjs`
是「30/30 覆盖」结论的来源脚本，`shot-compose.html` 被本文档引用），
都写在该目录的 `README.md` 里。

### `verify/tmp/` 里留着什么，为什么

2026-09-16 清过一次：**122 MB → 21 MB**。剩下的都不是「杂物」，删了会真的坏：

| 留着 | 大小 | 为什么不能删 |
|---|---|---|
| `cdp/out/*.ttf` | 12 MB | **四个古文字字体的本体**。`build-ancient-data.py:77` 直接读这里 —— 删了 `data/ancient.js` 就再也生成不出来 |
| `cdp/cdpfonts24.exe` | 7.3 MB | 上面那四个的原件。只有它能重新解包（下载那趟很不顺，别赌还能再下一遍） |
| `evobc/` | 740 KB | 已抽好的 36 张古文字参照图（日/休/森 × 六期），人工核对释读用 |
| `unrar/` | 314 KB | 解 `cdpfonts24.exe` 用的工具 —— 记录「当初是怎么解出来的」 |
| `kv.json` `list.json` | 640 KB | EVOBC 的字→ID 索引，`evobc-pick.py` 要用 |
| `opentype.js` | 171 KB | ⚠️ **这个别跟 `assets/vendor/` 那个搞混**。现在是**零引用** —— 2026-09-17 它最后两个用户 `build-ancient.cjs` / `build-cdp.cjs` 已退役（见 `archive/retired-generators/`）。没删，理由同 `cdpfonts24.exe`：下载不易、体积无害。CDP 那条线本来也不该用它（cmap 是 `platform 3 / encoding 4`，它直接抛错），现役全走 `ttf-outline.py` |

**已删掉的**：`cd.bin`（87 MB，EVOBC 中央目录）、重复的字体副本（和 `assets/fonts/` 逐字节相同）、
下载中的临时块、抓下来的网页、一次性脚本。

`cd.bin` 要用时再拉（只拉中央目录，不是那 4.94 GB）：

```bash
curl -L -r 4854769668-4937793391   "https://hf-mirror.com/datasets/HaisuGuan/EVOBC/resolve/main/Data-CN.zip" -o verify/tmp/cd.bin
```

---

## 第三方依赖：只剩 Vue 一个

完整清单见 [`assets/vendor/LICENSES.md`](assets/vendor/LICENSES.md)（含来源、版本、授权、核对日期）。

| | 状态 |
|---|---|
| **Vue 3.5.42** | MIT。含模板编译器的全局构建，`file://` 下直接跑 |
| ~~GSAP 3.15.0~~ | **2026-09-16 移除** |
| ~~opentype.js~~ | **2026-09-16 移除**（171 KB，运行时零引用，死代码） |

### 为什么把 GSAP 删了

不是因为不能用。它现在用的是 Webflow 的 **Standard "No Charge" GSAP License**
（2025-04-30 生效），条款里写着「Permitted Uses = 在任何 website / web application /
digital interface 上实施和使用」，商业用途都免费，参赛更没问题。

删掉的理由是**性价比**：

1. **全项目只有一处调用** —— 03③「就按左右摆」那 0.5 秒补间。而且那个调用本来
   就带 fallback（`if (!global.gsap) { 直接赋值 }`），也就是说不装 GSAP 程序照跑。
2. **它是专有许可，不是 OSI 开源。** 大赛要求「参赛作品不得有知识产权纠纷」，
   多一个需要在答辩时解释的授权条款，收益却是零。
3. **核心动画本来就是自写的。** 书写引擎（`stroke-anim.js`）跟 GSAP 毫无关系 ——
   删掉之后「动画全是我们自己写的」这句话才是干净的、经得起追问的。

替代品是 [`src/ui/compose-canvas.js`](src/ui/compose-canvas.js) 顶部约 30 行自写补间，
缓动按 GSAP 的 `power2.inOut` 逐式复刻（`t<0.5 ? 4t³ : (t-1)(2t-2)²+1`），
观感一致 —— 换掉库之后**观感不能变**，否则「删掉 GSAP」本身就成了一个回归。

⚠️ **补间换成自写之后，「谁来 cancel」变成我们的责任了。** GSAP 自己管调度，
切走时它内部会停；自写 rAF 得自己收尾，所以 `clear()` 和 `beforeUnmount` 里都有
`stopTweens()`。这两处都有断言钉着（见验证表）。

---

## 核心：书写动画引擎

`src/stroke-anim.js`

不是简单的淡入。原理与 hanzi-writer 同款：

1. 每一笔的字形轮廓作为 `clipPath` —— 限定墨只能落在这笔范围内
2. 沿该笔的**中线（median）**画一条很粗的线作为"画笔"
3. 用 `stroke-dasharray` / `stroke-dashoffset` 推进画笔，被 clip 裁剪后就是书写效果

**为什么这么做**：进度可以任意设定，所以时间轴能来回拖动——这正是演变模块需要的（不能只有"播放"）。而且全矢量，任意缩放不失真。

### API

```js
var r = StrokeRenderer.create(svgEl, charData, {
  width: 520, height: 520, padding: 40, ghost: true
});

r.setProgress(0.5);            // 整字进度，按笔画长度加权分配
r.setStrokeProgress(2, 1);     // 单独控制某一笔
r.getProgress();               // 当前各笔进度数组
r.highlightStroke(1);          // 高亮某笔（其余变淡）
r.isolateRadical(true);        // 只显示部首笔画 → 拆字模块用
r.show(); r.clear();

r.strokeCount                  // 笔画数
r.strokeLengths                // 各笔中线长度
r.radStrokes                   // 部首笔画索引
```

**笔画按长度加权**：长笔画占用更多书写时间，视觉节奏才对。

---

## 拆解模块

`src/components.js` + `src/decompose.js`

整字 → 构件分离 → 自由拖拽 → 重组。

**关键设计：构件是原字笔画的子集，坐标不变。**

所以"合起来就是原字"——不需要重新锚定，不会出现拼接错位。分离只是给每个构件加一个 `translate` 偏移。

```
休 = 亻[0,1] + 木[2,3,4,5]      安 = 宀[0,1,2] + 女[3,4,5]
明 = 日[0,1,2,3] + 月[4,5,6,7]  森 = 木[0-3] + 木[4-7] + 木[8-11]
```

15 个可拆字中，13 个的部首部分与数据自带的 `radStrokes` 完全一致；森、众 的余部按构件笔画数等分。
其中 14 个是会意字，第 15 个「李」是**逐字开例外的形声字**（`method: '形声'` + `phonetic: 1`，
声旁那一格不写 `meaning`）—— 理由与范围见 `src/components.js` 文件头，
守卫是 `verify/test-decomposition-consistency.mjs` 的 D 组。

**方位标签由几何推出，不是释读出来的**：各部件互相比较重心（不是跟整字重心比——
整字包围盒是各部件的并集，其中心对左右结构的字恰好落在两部件之间），
一个轴明显主导时只报主导轴。所以 `明` 显示 `日:左 月:右` 而不是 `日:上左 月:下右`。
实测结果：

```
休 亻:左 木:右      森 木:上 木:下左 木:下右
明 日:左 月:右      众 人:上 人:下左 人:下右
林 木:左 木:右      好 女:左 子:右
从 人:左 人:右      安 宀:上 女:下
```

### API

```js
var d = Decompose.create(svgEl, { width, height, padding });
d.load('休', charData);        // 渲染，返回拆分结果或 null
d.explode(); d.collapse(); d.reset();
d.select(0);                   // 选中构件
d.getSelected();
d.getPlacement();              // 各构件偏离原位的程度 — 构形挑战的判定基础
d.onSelect(fn);
d.parts();                     // 底层构件（el / data / offset）
```

**不可拆解的字**（22 个象形字）：整字实心显示，按钮禁用，提示"整体即是一幅图形"。

### ⚠️ 学术风险

**已经避掉的一个坑**：数据表里原本给部件标了 `形旁` / `义旁`。
这是错的 —— 形旁/义旁是**形声字**的分析术语，会意字的各部件都是**意符**，
没有形旁声旁之分。现在该字段已删除，方位改由几何推出（可验证的事实）。

**仍需人工核对的部分**：「会意逻辑」的解释是文字学论断，
当前文案（如"人靠在树旁，是歇息"）供结构演示用，**答辩前必须逐条核对**。
参考核对源：汉典 zdic.net、教育部汉字全息资源应用系统。

---

## 构形挑战

`src/challenge.js`

构件被打散，玩家把每一块拖回它自己的原位。归位即锁定，全部归位则通关，
然后整字以书写动画"写"出来当奖励。

### 打散方式：不是简单推开，而是**位置轮换**

现有的 `Decompose.explode()` 是把每块沿"远离字心"的方向推出去。
拿来当挑战用是不行的——玩家只要往中心推回来就完事了，
**根本不用知道「日该在左、月该在右」**，考不出构形知识。

所以改成**轮换**：日坐到月的位置上，月坐到日的位置上。

```
正确      左:日   右:月
打散后    左:月   右:日      ← 必须知道构形才能拼回来
```

**同形构件（林、森、从、众）不做轮换。** 那些字的两块/三块长得一模一样，
轮换后视觉上"看起来已经拼好了"，但只有一块是真归位——
玩家把另一块拖到最近的空位反而吸附不上，会以为是 bug。
这四个字退回径向推开，任务变成"推回原位"，方向明确。

### 两个几何坑（都是测试逼出来的）

**1. 推开方向必须用轮换之后的落点算。** 用原位方向的话，`亻` 轮到右边后
仍按"原位在左"往左推，正好推回来撞上同样被推过来的 `木`
——实测两块重心间距只剩 **2**。

**2. 轮换本身就可能越界。** 轮换是"把重心挪到别人的重心"，
但各构件宽窄不同：把宽的 `木` 挪到窄的 `亻` 的位置，它自己就伸到画布外了。
这种情况减少推开量没用（越界来自轮换本身），得整体平移挪回来。

另外，"还能往外推多远"要用 `Positioner.visibleBounds()` 而不是 `BOUNDS` ——
画布上还有 padding 那一圈，构件摆到字形框外、padding 以内仍然看得见。
用 `BOUNDS` 会保守太多，`林森从众` 就是因为这个一度被算得几乎推不动（位移只有 27）。

### API

```js
var c = Challenge.create(svgEl, { width, height, padding });
c.start('明', charData);      // 开局；象形字返回 null
c.restart(charData);
c.setHint(true);              // 显示整字底纹（计入提示次数）
c.stats();                    // {placed,total,elapsed,moves,hints,solved,shuffled}
c.isPlaced(i);                // 第 i 块是否已归位
c.onProgress(fn); c.onSolve(fn);
c.view();                     // 底层 Decompose
```

`Decompose` 为此新增的通用能力（都不含游戏逻辑）：
`setOffset` / `setGhostVisible` / `setLock` / `isHome` / `onDrop`。

### 判定时机

`onDrop` 在**松手瞬间**就发，不等吸附动画走完——
"松手时离原位够近"这个事实在松手那一刻就确定了。
挑战层据此直接采信 `snapped` 标志，不再回查 `offset`
（动画途中 `offset` 还没归零，回查会得到 false）。

---

## 坐标系

**关键：Make Me A Hanzi 的所有汉字共用同一个固定包围盒**，所以数据本身不需要逐字归一化。
（唯一例外是演变模块要把楷书和古文字放在同一格比对，那里会额外套一次逐字归一化，
参数来自 `AncientGlyphs.kaiFit()` —— 见下文「归一化」。书写/拆解/挑战三个模式不受影响。）

```
CHARACTER_BOUNDS = [{x:0, y:-124}, {x:1024, y:900}]     // 1024 × 1024
transform = translate(xOffset, height - yOffset) scale(scale, -scale)
```

注意 **y 轴翻转**（scale 第二参数为负）。约定抄自 hanzi-writer 源码。

字形墨迹本身有宽窄差异（实测 `日` 209 vs `从` 410），那是字体设计，不是坐标系问题。

---

## 数据

### 来源与授权

| 项 | 值 |
|---|---|
| 数据 | `hanzi-writer-data` v2.0.1（源自 Make Me A Hanzi） |
| **授权** | **Arphic Public License** |
| 范围 | 100 字，164 KB |

⚠️ **注意：库是 MIT，数据是 Arphic Public License，两者分开授权。**

Arphic 许可允许再分发与修改，但**必须随附许可文件并署名**。提交作品时需：
1. 附上 `ARPHICPL.TXT`
2. 在作品说明/页脚署名

### 字段

```json
{
  "strokes":    ["M 246 517 Q ...", ...],   // SVG path，逐笔字形
  "medians":    [[[291,766],[316,742]], ...], // 笔画中线坐标
  "radStrokes": [0, 1]                       // 部首笔画索引
}
```

### 候选字（起步的 30 字）

- **象形字（22）**：日月人木水山火土目口手心女子田雨云鱼鸟马牛羊 —— 偏演变动画
- **会意字（8）**：休明林森从众好安 —— 偏拆解组字

`radStrokes` 恰好覆盖这 8 个会意字（象形字本就不需要拆解）。

字表后来扩到 **100 字**（`data/chars.js`），其中 33 字带 `radStrokes`。
上面这份 30 字是**扩容的起点**，不是当前规模；当前规模见 `verify/roster.json`
（128 条教学目录 = 36 核心 + 64 扩展 + 28 关联，关联字只进目录、不做字形）。

### 实测统计（当时的 30 字）

| 指标 | min | max | 平均 |
|---|---|---|---|
| 笔画数 | 2（人） | 12（森） | 5.0 |
| 路径锚点数 | 48（人） | 244（森） | 126 |

100 字下的笔画数：最少 1（一），最多 12（森），平均 5.6。

---

## 验证状态

下表**全部由 `node verify/run-all.mjs` 自动跑**（34 项 = 21 项 Node 层 + 8 项浏览器层
+ 5 项静态自检页，约 2 分钟，大头是开无头浏览器）。
以前标着「无头截图」「浏览器直接打开」的那几项，现在也挂进了同一条命令 ——
「手动看一眼」不算验证：没人会每次改完都点开八个页面，点开了也只会看最后一行。

| 项 | 方法 | 结果 |
|---|---|---|
| 字形落画布内 | `verify/test-geometry.mjs` | 100/100 ✓ |
| 重心居中 | 同上 | 水平 227–283 / 垂直 238–275（中心 260）✓ |
| 进度单调性 | 同上 | ✓ |
| p=0 全隐 / p=1 全显 | 同上 | ✓ |
| 构件笔画覆盖无重叠无遗漏 | `verify/test-components.mjs` | 15/15 全覆盖 ✓（「坐」的构件包围盒重叠 100%，因为两个「人」坐在「土」上本来就互相嵌套——这条只打 ⚠️ 不计失败，笔画覆盖本身是过的） |
| 方位标签合理 | 同上 | 15/15 无「全同」异常 ✓ |
| 分离位移不留构件重叠 | 同上 | 最近间距 386–755 ✓ |
| 打散后不越界 | `verify/test-challenge.mjs` | 15/15 全在画布内 ✓ |
| 打散后不重叠 | 同上 | 最大墨迹重叠 25.7%（鸣 口-鸟）✓ |
| 开局无白送（没有块已在原位） | 同上 | 15/15 位移 120–614 ✓ |
| 分离后构型正确 | `verify/test-decompose.html` 无头截图 | ✓ |
| 书写渲染正确 | `verify/test-progress.html` 无头截图 | ✓ |
| 拖拽→吸附→判定→成功 全链路 | `verify/test-challenge-flow.html` | 6/6 字通过 ✓ |
| 真页面上把构件拖回原位 → 拼成功 | `verify/drive-challenge.mjs`（CDP） | 明 2/2 归位、成功面板带字理 ✓ |
| 象形字 / 拼成功后立刻重开 / 提示开关 | 同上 | 象形字不给挑战控件；重开后 rAF 待触发归零 ✓ |
| 古文字五期 × 全字表归一化撑满 | `verify/test-ancient.html` | 484/484 字形撑满；最紧的一格 962.6 ✓ |
| 演进节奏停—走—停—走 + 面板不丢 | `verify/test-evolution-pace.html`（iframe） | 6 期全到 + 周期中位 2850ms ✓ |
| 04 出题与判分（四型 / 扫 400 轮） | `verify/test-quiz.mjs` | 8000 道题全过；构形题 800/800 与 `DECOMPOSITION` 一致 ✓ |
| 04 UI（挂载 / 答题 / 计分 / 换轮） | `verify/test-quiz-ui.html` | 全通过，渲染期零异常 ✓ |
| 键盘：各模块自己的键位 | `verify/test-keys.mjs`（CDP） | 空格 / ← → / R / 数字键逐模块打通，06 的 Esc ✓ |
| 键盘：三条「不管」的规矩 | 同上（合成事件） | 修饰键 / 长按 / 输入控件 / 按钮只让空格回车 ✓ |
| 键盘：切模块不留监听器 | 同上 + `verify/test-graph-ui.mjs`（数 window 上的 keydown 个数） | 每切一次恒为 1，切到首页归 0 ✓ |
| 键盘：焦点在按钮上时谁说了算 | 同上 ⑧ | 空格归按钮（只触发一下）、R / ← → 不被它吞掉 ✓ |
| 零构建栈：每个 `<script>` 都真的加载成功 | `verify/test-vue-stack.html` | 6/6，且 `window.gsap` 已不存在 ✓ |
| 自由构字补间（自写，替代 GSAP） | `verify/test-compose-ui.html` ⑦⑨ | 起手在动 / 中途未到位 / 精确落位 / 卸载当场停手 ✓ |
| 自由构字算法层（15 可拆字往返 / 阈值余量） | `verify/test-compose.mjs` | 15/15 往返全通过；最紧的一对余量 1.28× ✓ |
| 挑战打散方案（不越界 / 不重叠 / 该轮换才轮换） | `verify/test-challenge.mjs` | 15 字全通过；最脏的一对（鸣 口-鸟）真墨迹重叠 25.7% ✓ |
| 拆解一致性（catalog ⟷ 拆解 ⟷ 构件盘 ⟷ 拼合题） | `verify/test-decomposition-consistency.mjs` | 五组断言全通过；10 个定向破坏 10/10 被抓 ✓ |
| 自由构字 UI 层（拖拽/坐标/红线） | `verify/test-compose-ui.mjs` | 拖拽跟手偏差 0.00px ✓ |
| 构形实验室三模式来回切不留旧引擎 | `verify/test-lab-shell.mjs` | 绕一圈后拖拽仍 1:1 ✓ |
| 01 书写全流程（播放/暂停/重来/拖轴/笔画列表/只看部首） | `verify/test-origin.mjs` | 52 项断言全通过 ✓ |
| 01 换字时字源卡与书写画布同步 | 同上 | 两边的 d 与笔画数一起变 ✓ |
| 切走模块时 rAF 停干净 | 同上 | 动画中途切走，待触发回调归零 ✓（见下） |
| 01 / 02 共用一个字 | 同上 | 01 挑「从」→ 02 高亮仍是「从」 ✓ |
| 02 六期都在且缺字形的期照样列出来 | `verify/test-evolution.mjs` | 6 格 / 6 chip，缺的压暗不删 ✓ |
| 02 逐期跳转 / 拖轴 / 并览来回切 | 同上 | 滑块与画面始终一致 ✓ |
| 02 缺字形的字自动落到有字形的那期 | 同上 | 「从」→ 金文，不停在空的甲骨文 ✓ |
| 02 切走再切回不叠层 | 同上 | 画布顶层恒为引擎自己的 4 个图层 ✓ |
| 字体子集没漏字（拆 woff2 的 cmap 验） | `verify/test-fonts.mjs` | 三个字体站点用字零掉落；ZQ Sans 的 GB2312 一级 3755 字全覆盖 ✓ |
| 冷启动不闪字形 | `verify/test-boot.mjs`（全新 profile 逐帧录） | 第 430ms 可见，那一刻三个字体都已加载；之前是 1049ms ✓ |

跑验证 —— 一条命令：

```bash
node verify/run-all.mjs          # 全部 34 项，约 2 分钟（大头是开无头浏览器）
node verify/run-all.mjs --fast   # 只跑 Node 层 21 项，约 5 秒，不需要 Chrome
```

也可以单独跑（要 Chrome 的那几个会自己开无头浏览器）：

```bash
node verify/test-compose.mjs
node verify/test-origin.mjs
node verify/test-evolution.mjs
node verify/test-compose-ui.mjs
node verify/test-lab-shell.mjs
node verify/drive-challenge.mjs
```

带 Chrome 的那几个用 CDP 驱动**真实页面**，在页面里派发真的 `PointerEvent`，
走的代码路径和用户手拖完全一样（`--screenshot` 做不到这点，它没法注入脚本）。

`test-vue-stack.html` 和 `shot-compose.html` 是纯静态页，浏览器直接打开即可：
前者验「零构建栈能不能起来」（含脚本清单完整性），后者是自由构字四种状态的视觉参照。
这两页现在都由 `check-page.mjs` 驱动，挂在 `run-all.mjs` 里，不用手点。

#### 顺带说一个测 rAF 泄漏的办法

`test-origin.mjs` 里最后一段要在页面里装一个 `requestAnimationFrame` 计数器，
验「切走模块时动画链有没有停下」。**这事儿的坑在于 cancel 也必须还账**：
只统计 `requestAnimationFrame` 的话，一个被正常 `cancelAnimationFrame` 掉的回调
永远不会执行、计数也就永远不会减 —— 看起来和泄漏一模一样。所以计数器用一个
`Set` 记住哪些 id 还没兑现，`cancelAnimationFrame` 时只还一次。

写完还得**反过来验一次**：把 `beforeUnmount` 里的 `stop()` 注释掉，这条断言必须变红。
不然它可能只是因为别的原因恒真，等于没测。这条断言这么验过，去掉 `stop()` 确实会红。

#### 驱动脚本必须收 console.error，不能只收未捕获异常

这一条是写 03 的测试时踩出来的，**所有 CDP harness 现在都收了**。

Vue 会把生命周期钩子（`mounted` 等）里抛出的异常**吞掉**，转成一条 `console.error`，
不让它冒泡成 `Runtime.exceptionThrown`。当时 `index.html` 漏引了 `evolution.js`，
整个 03 组件挂载直接失败、画布全空——而驱动脚本打印的是「**异常 0 个**」。

收 `Runtime.consoleAPICalled` 里 `type === 'error'` 的那一类之后，同样的故障会打印：

```
页面未捕获异常：
  console.error: TypeError: Cannot read properties of undefined (reading 'create')
```

断言本身当时也抓到了这个故障（`viewBox === null`），但那是运气——换一个「挂载失败但
DOM 结构仍完整」的坏法就抓不到了。**「没有异常」这句话，只有在你确实收全了异常来源时才有意义。**

#### 静态自检页为什么要 `--allow-file-access-from-files`

`verify/` 下有一批页面是**自包含**的：自己跑，把结论写进 `document.title`
（`PASS` / `FAIL`），明细写进 `#out`。`check-page.mjs` 统一驱动它们，挂进 `run-all.mjs`。

写这个驱动时才发现：`test-switch.html` 和 `test-playback.html`（两个驱动旧页面的 iframe
测试，2026-09-16 已随旧页面退役，`test-playback.html` 的活由 `test-evolution-pace.html` 接着干）
**以前根本没法自动跑**。

它们把 `index.html` 放进 `<iframe>`，再从外面读 `f.contentDocument`。
而 Chrome 默认把**每个 `file://` 当成独立源**——`contentDocument` 是 `null`，
外层脚本一取 `getElementById` 就抛 `TypeError`。页面于是卡在自己的标题上，
**既不是 PASS 也不是 FAIL**：不驱动它，你永远看不出它从来没跑过。

加 `--allow-file-access-from-files` 之后两个页面立刻全绿。以前 README 里写的是
「浏览器直接打开即可」——那句话掩盖了它其实一次都没跑成。

> 顺带：`check-page.mjs` 启动前会先探一下端口。上一次的 Chrome 没退干净时，
> 直接连过去会拿到**上一页的** target，报出来的失败跟这次改的东西毫无关系，
> 能查一晚上。宁可当场报「端口被占用」。

### 未验证（需真人操作）

- **拖拽手感**：无头浏览器不派发真实指针事件，`pointermove` 路径只做了静态偏移验证。
  吸附阈值 `SNAP_DIST = 55` 是估的，**需要上手试一次**再定。
- **触屏**：`touch-action: none` 已加，但未在真机验证。
- **rAF 播放节奏**：无头 Chrome 的 `--virtual-time-budget` **几乎不推进 rAF**
  （实测 2000ms 虚拟时间里 rAF 只触发 2 次，`setInterval` 触发 100 次），
  所以动画时长（`durationFor`、`HOLD_MS` / `FADE_MS`）靠无头截图是看不到的。
  现在 `verify/test-evolution-pace.html` 在 iframe 里给 `requestAnimationFrame` 打了个
  `setTimeout(16ms)` 垫片，把节奏还原成时间轨迹来断言 —— 但这垫片只证明**逻辑**，
  **真实观感仍需在本机双击 `index.html` 亲眼看一遍。**

---

## 古文字层

### 来源之一：战国金文（JFZSK，OFL）

`data/ancient.js` 是**五期合并**的产物，由 `verify/build-ancient-data.py` 生成，
请勿手改。本节只讲其中**战国金文**这一期的来源（其余四期见下方「中研院 2.4」一节）。

> ⚠️ 曾有一个 `verify/build-ancient.cjs` 也写 `data/ancient.js`，但产出的是
> **只有战国金文一期**的旧格式，误跑会把五期数据静默降级（不报错，只是少四期）。
> 已于 2026-09-17 摘除，见 `archive/retired-generators/README.md`。

| 项 | 值 |
|---|---|
| 来源 | **敬峰中山王篆 JFZSKSealScript V3** |
| 仓库 | `github.com/SuperMate-Ai/JFZSKSealScript` |
| **授权** | **SIL OFL 1.1** ✅ 可商用、可嵌入 Web（见 `assets/fonts/OFL-JFZSK.txt`） |
| 字体 | `assets/fonts/JFZSKSealScript_V3.ttf`（2.1 MB） |
| 覆盖 | **29/30**，缺 `森` |
| 坐标系 | 与楷书一致（`x ∈ [0,1024]`，`y ∈ [-124,900]`，y 向上） |

```js
AncientGlyphs.ERA              // '战国金文'
AncientGlyphs.paths('日')      // ['M412.16 270.11L…']
AncientGlyphs.has('森')        // false
```

用 `Positioner.create()` 的 `transform` 直接渲染，和楷书同一套：

```js
g.setAttribute('transform', pos.transform);
AncientGlyphs.paths('日').forEach(d => { /* <path d={d} fill-rule="evenodd"> */ });
```

⚠️ **风格必须如实标注为「战国金文」**。中山王篆出自战国中山王三器铭文，**比小篆早**，
不能写成「小篆」——这是答辩容易被问的点。

### 坐标系里的一个坑（已踩）

**`opentype.js` 的 `glyph.getPath()` 输出的是 y 向下的屏幕坐标**（内部对 y 取了负），
而 `glyph.getBoundingBox()` 给的是原始字体单位（y 向上）。**两者混用会把 y 翻两次**，
字形整个跑到框外面去（实测 `日` 落在 y −486..−152 的位置）。

正确做法是走 `glyph.path.commands` —— 原始轮廓，字体单位，与 `getBoundingBox()` 一致。

#### 归一化：逐字逐期等比缩放（2026-09-16 推翻旧策略）

**旧策略是「同一字体家族共用一个变换，不做逐字归一化」，实测后推翻了。**
理由当时写的是「逐字归一化会把每个字都撑满字形框，抹掉『这个字本来就窄』的信息」——
这个理由**站不住**：逐字**等比**缩放保得住宽高比，被抹掉的只是**绝对大小**，
而古文字字体里的绝对大小是各字体设计者的排版习惯，不是学术事实。
演变模块一次只看一个字，绝对大小零信息量，可读性才是硬需求。

触发这次改动的实测（当时的 30 字，高度以各字体自身 upem 归一）：

| 阶段 | 中位高 | 最大高 | 中位宽 |
|---|---|---|---|
| 甲骨文 | 1000 | 1013 | 778 |
| 金文 | 1000 | 1026 | 712 |
| 楚簡 | 1000 | 1009 | 846 |
| 小篆 | 1003 | 1013 | 628 |
| **戰國金文** | 967 | 1130 | **371** |

`日` 在敬峰中山王篆里只有 383 高 —— 是该字体自身中位数的 **40%**、是它在 CDP 四体里高度的 **45%**。
**家族级变换修不了这个：日小是在 JFZSK 内部就小。** 所以时间轴上戰國金文那一格几乎看不见。

现在的做法（`verify/build-ancient-data.py`）：

- **每个 (字, 阶段) 各自等比缩放到目标框**（`min(宽比, 高比)`，居中，留 6% 白）。
  宽高比留着，绝对大小统一。
- **楷书那层也要一起归一** —— 字形是 app 直接从 `data/chars.js` 读的，不在这份数据里，
  所以参数在 build 时算好写进 `AncientGlyphs.kaiFit(ch)`，由 `evolution.js` 和 `mode-evolution.js` 各套一次。
  不补的话「小篆→楷书」那一幕会突然胀大或缩小。
  实测楷书 `日` 需要 ×1.333、`从` 需要 ×1.008。
- **自检**：`verify/test-ancient.html` 断言 143 个古文字字形的**最长边恰好等于 962.6**
  （= 1024 × 0.94）。哪一格明显偏小，就是归一化漏了。当前 143/143 通过。

**宽高比仍然是各期自己的样子** —— 中山王篆的字形修长（`木` 高宽比 3.2），这是风格，不是 bug。

### 渲染验证

`verify/test-ancient.html` —— 六个阶段 × 全字表全量铺开 + 自检断言，浏览器直接打开即可。
无头跑法（读 `document.title` 就知道过没过）：

```bash
chrome --headless=new --virtual-time-budget=6000 --dump-dom \
  "file:///D:/item2/verify/test-ancient.html" | grep -o '<title>[^<]*'
```

当前结果：**143 个古文字字形全部撑满、无出框、无过窄，PASS。**
段数 51–270，与楷书数据（48–244 锚点）同一量级。

### ⚠️ 古文字层不能直接复用书写动画

`StrokeRenderer` 靠**沿笔画中线推进粗画笔**实现书写效果，而**字体给的是轮廓，没有中线**。
所以古文字层不能照搬同款动画。

当时的设想是「遮罩揭幕式」写出（两期严格不相交，新期从左往右扫出来）。
**实际做下来否掉了**，见下文「演变模块 / 动画设计」第 2 点：
裁切会让字形从中缝被劈开，左半是新期右半是旧期，读起来是个错字。
最后用的是**错开的两拍淡入淡出**。答辩时这一点要说清楚 ——
古文字层是**过渡**，不是真实笔顺。

### 可接入：中研院漢字構形資料庫 2.4 · 四体（已解包验证）

`verify/cdp-outlines.json` — 由 `verify/build-cdp.py` 生成，含四个书体 × 30 字的全部 path。
⚠️ 这份 dump 停在扩容前的 30 字（212 KB），**没有跟着字表扩到 100** —— 下表描述的
是它，所以下表的「N/30」分母都是 30。`data/ancient.js` 走的是同几个 TTF，但覆盖面
是 100 字（五期分别 95/97/94/99/99），两者不是同一份数据，别拿下表当 100 字的结论。

| 文件 | 字体真名 | 本项目覆盖 |
|---|---|---|
| `cdpjiagu.ttf` | 中研院甲骨文 | 28/30（缺 手、从） |
| `cdpbronz.ttf` | 中研院金文 | 29/30（缺 森） |
| `cdpchubs.ttf` | 中研院楚系簡帛文字 | 27/30（缺 休、森、好） |
| `bnucdp.ttf` | 北師大說文小篆 | **30/30** |

**四体齐全 25/30**，且这 30 字已逐字目视核对通过（`verify/cdp-focus.png` / `cdp-b.png` / `cdp-c.png`）。
扩容进来的 70 字**没有做过这道目视核对**，只有 `test-ancient.html` 的自动撑满断言。

#### ⚠️ 三个坑（不用 opentype.js）

1. **cmap 不是 Unicode，是裸 Big5 码位**（段边界 `U+8140–U+817E`… 正是 Big5 双字节布局）。
   查字要先把字转 Big5。用 Unicode 码位查会得到**假阳性**。
   字体只收繁体，只有 `鱼鸟马从众` 这 5 字 Big5 里没有；
   **`云` 不要映射成 `雲`**（`云` 在 Big5 里是独立的字 0xA4AA）。
2. **cmap 子表是 `platform 3 / encoding 4`（非标准）**，`opentype.js` 直接抛
   `No valid cmap sub-tables found.` → 用 `verify/ttf-outline.py`（标准库实现）。
3. **`gid` 非零 ≠ 有字形**，某字在某书体里可能是空轮廓 → 覆盖率必须按轮廓非空统计。

#### ⚠️ 授权状态待确认

字体内部版权串是 **`Proprietary for Sinica, all right reserved.`**（Ver 1.0 / 1997-07）。
网上能查到的 GNU FDL 1.2 + CC BY-SA 2.5 双授权，来自**另一个系统**
（中央研究院漢字部件檢字系統）的释出声明，**不确定是否覆盖这批 2006 年的字体**。

**在确认之前，按「学术引用」处理，不要当作品资产。** 授权最干净的那条路仍是 OFL 的敬峰中山王篆。

### 仍未接入

| 阶段 | 状态 |
|---|---|
| 战国金文 | ✅ 已接入（敬峰中山王篆 29/30） |
| 甲骨文 / 金文 / 楚簡 / 小篆 | ✅ 字形已备好（中研院 2.4，见上），**待接进数据层** |
| 隶书 | ❌ **没有矢量源**。中研院这四体里没有隶书；EVOBC 只有 110 px 图片。<br>若演变模块非要五段，这一段得另想办法，或改四段叙事 |

详见 [字体下载指南.md](verify/字体下载指南.md)。

### ⚠️ 不可外包的一步

古文字字形与楷书的**对应关系必须人工核对**。甲骨文/金文的释读有异体和争议，
机器生成的对应可能看起来合理但学术上是错的。这是本项目最大的学术风险。

参考核对源：汉典 zdic.net、教育部汉字全息资源应用系统。

---

## 演变模块（`src/evolution.js`）

六段：甲骨文 → 金文 → 楚系簡帛 → 戰國金文 → 小篆 → 楷书。
前五段来自 `data/ancient.js`，楷书那段来自 `data/chars.js`（`Evolution.KAI_KEY`）。
一个连续参数 `t ∈ [0, 5]` 驱动，`i = floor(t)` 的那一期淡下去，`i+1` 的那一期淡上来。

### 动画设计：三个坑，都是「看起来一团乱」引起的

1. **播放不能匀速扫。** 原来让 `t` 从 0 匀速走到 5，五段过渡首尾相连 ——
   全程每一个瞬间画面上都是两期混着的，**没有一刻是干净的单期图形**。
   现在是停—走—停—走：`HOLD_MS = 1000` 停住让人看清，`FADE_MS = 1800` 淡过去，
   一段 2.8s，整轮 14s。`verify/test-evolution-pace.html` 断言这个节奏
   （量「相邻两期首次到达的时刻之差」，不量 FADE_MS 本身 —— 原因见那个文件顶部）。

2. **过渡是错开的两拍，不是对称交叉。** 两个阶段，都走过弯路：

   **第一版：揭幕裁切**（新期从左往右扫出来，两期严格不相交）。不重叠是做到了，
   但**字形是从中缝被劈开的** —— 左半是新期、右半是旧期，一眼看过去就是个错字。

   **第二版：对称交叉淡**。两层共用同一段 `f` 区间，`newOp = 1 - oldOp`，
   墨量恒等于 1，不糊也不空。但看着像一次化入化出，**「先走一个、再来一个」的感觉没了**。

   **现在：两拍错开淡。** 旧期先淡（`OUT_FROM=0 → OUT_TO=1`），
   新期等旧期淡掉一多半才起步（`IN_FROM=0.45 → IN_TO=1`）。
   下面是播放时的实际曲线（`u` 是这一段过渡走了多少）：

   ```
     u     f     旧期   新期    合计     耗时    u     f     旧期   新期    合计     耗时
    0%   0.00   1.000  0.000   1.000      0ms   55%  0.60   0.405  0.264   0.669    990ms
   20%   0.08   0.920  0.000   0.920    360ms   65%  0.76   0.245  0.555   0.800   1170ms
   40%   0.32   0.680  0.000   0.680    720ms   80%  0.92   0.080  0.855   0.935   1440ms
   45%   0.41   0.595  0.000   0.595    810ms  100%  1.00   0.000  1.000   1.000   1800ms
   50%   0.50   0.500  0.091   0.591    900ms
   ```

   前 810ms 只有旧期在退（新期一动不动），后 990ms 新期才起来 ——
   两拍分得开，对比就出来了。全程墨量最低 0.59，不糊也不空。

   > ⚠️ **透明度那层不能用 `easeInOut`。** 这是「还是太快」的真正原因：
   > `t` 在 `animateTo` 里已经缓动过一次，透明度再缓一次就成了缓动叠缓动
   > （`1 - easeInOut(easeInOut(u))`），两头平、中间陡得离谱 ——
   > 900ms 的过渡里真正「在变」的只有 450ms，数字看着不小，眼睛还是觉得一闪而过。
   > 所以 `ramp()` 是**线性**的，透明度跟着 `t` 走同一条缓动曲线，正好一次缓动。
   > 拖时间轴时 `t` 是直接设的、没有缓动，线性也是唯一说得通的映射。

   > **两拍不能完全不重叠。** 试过 `IN_FROM = OUT_TO`（旧期淡完新期才起步），
   > 截 `t = 0.5` 那一帧一看，**画布是全空的**（两层都接近 0），
   > 像闪了一下、更像动画崩了。现在最低点 0.59，那一瞬两期都还在。
   > 调手感就动 `IN_FROM`：越大两拍分得越开、越接近空画布，越小越像对称交叉。
   > 中间帧可以直接看：进 03，把时间轴拖到 `t=0.65`（滑块值 650）。

   > 顺带记一个探路时踩到的现象：单纯把新层不透明地画在旧层上面是不够的。
   > 新层是**实心墨**，字形中间的**空白**（「日」的两个口）会漏出下面那一期，
   > 两期笔画互相穿插。当初的揭幕方案得额外加一层反向裁切才能盖住，
   > 换成淡入淡出之后这个问题自然消失了（半透明的两层叠起来本来就读得出来）。

3. **画布是四个模式共用的同一个 `<svg>`，谁建谁清。**
   `stroke-anim.js` / `decompose.js` 都在自己的 `create` 里先 `svg.innerHTML = ''`。
   `Evolution.create` 一开始漏了这一步 —— 从「书写」点进「演变」时，
   上一模式那幅写完的**楷体会整幅留在底下**，和古文字层叠成一坨
   （实测画布上 9 个顶层节点，正常是 7 个）。
   现在盯这件事的是 `test-evolution.mjs` ⑨（切走再切回，画布顶层恒为引擎自己的 4 个图层）
   和 `test-lab-shell.mjs` ⑤（换个模式回来拿到的是全新 `<svg>`，拖拽仍然 1:1）。
   **以后再加模块，记得也在 create 里清场。**（06 关系网没有引擎，画布是
   `render()` 每次从空重建的 —— 它躲开了这条，但那是另一个理由，不是可以不看这条。）

### API

```js
var evo = Evolution.create(svgEl, { width, height, padding, onStage });
evo.load('日', CHARS['日']);   // → false 表示这个字一期字形都没有
evo.setT(1.5);                 // 任意小数
evo.goTo(2, true);             // 平滑跳到第 3 期
evo.play(); evo.stop(); evo.isPlaying();
evo.setOverview(true); evo.isOverview();
evo.stages();                  // 每期的 label / period / cov / available / source
evo.pathsOf(i); evo.char(); evo.destroy();
```

`onStage(info)` **每帧都会来**（过渡时要驱动时间轴滑块和缩略图条高亮），
所以消费方要自己分轻重：面板重建按 `info.index` 变了没挡掉，
缩略图条那 6 个 class 每帧做也无所谓。
`info` 里有 `t / index / label / period / note / source / stages / available / next`。

### 缩略图条的高亮

画布上那一期（整幅铺在底下、`floor(t)` 对应的那层）点**实线金边**（`is-active`）；
正在淡入的下一期点**虚线朱砂边**（`is-next`）。两格在过渡期间同时亮，
和画布上「一期正在退场、一期正在进场」严格对应。
只点亮一格会和右侧「当前阶段」面板打架（面板说的是底下那一期）。

---

## 下一步

1. ~~演变模块的时间轴外壳~~ ✅ 已做：六段（甲骨/金文/楚簡/戰國金文/小篆/楷书），
   淡入淡出演进 + 缩略图条 + 并览 + 键盘 + URL 深链（`?mode=evolution&char=日&t=1.5&view=overview`）
2. ~~把古文字接进 `data/ancient.js` 多阶段结构~~ ✅ 已做（`verify/build-ancient-data.py`）
3. **隶书层**要么另找源，要么确认改六段叙事（现在是六段，没有隶书）
4. 造字模块：从构件库里挑构件组合，导出新字
5. Canvas 海报生成
6. 中研院那批的授权状态去确认（答辩材料要用）
7. **人工核对古文字释读** —— 见下面那条红线，尤其 `戰國金文·日`（渲染成圆圈加一点，最"意外"的一个）

挑战模式还可以再做的（非必需）：计分/评级、提示次数影响评分、
把 22 个象形字也纳入（改成"按笔顺描红"之类）。
