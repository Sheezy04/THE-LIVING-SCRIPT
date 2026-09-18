# 第三方资产清单

本清单记录项目依赖与素材来源，不证明项目代码的全部原创性。
参赛者应按实际开发过程、引用来源及比赛的 AI 辅助规则填写原创性声明，不得把外部字形宣称为自己的原创素材。

最后核对日期：**2026-09-16**

---

## 一、代码依赖

### Vue 3 — ✅ 可用

| | |
|---|---|
| 版本 | **3.5.42** |
| 文件 | `assets/vendor/vue.global.prod.js` |
| 来源 | https://unpkg.com/vue@3.5.42/dist/vue.global.prod.js |
| 授权 | **MIT** |
| 用途 | UI 层（`src/ui/` 下的组件） |

MIT 允许商用、允许再分发，只需保留版权声明 —— 文件头部的注释就是它，**不要删**。

> 用的是**含模板编译器**的 `vue.global.prod.js`，不是 runtime-only 构建。
> 组件写的是 `{ template: '...' }` 字符串，runtime-only 构建编译不了。

### GSAP — ❌ 已移除（2026-09-16）

曾经引入过 GSAP 3.15.0，**现已删除**，不再随作品分发。

```
删除原因：
  · 全项目只有一处调用（compose-canvas.js 的「就按…摆」0.5 秒补间）。
    为这一处引一整条动画依赖不划算。
  · 它用的是 Webflow 的 Standard "No Charge" GSAP License ——
    免费、允许商用，但**是专有许可，不是 OSI 开源**。
    大赛规则要求「参赛作品不得有知识产权纠纷」，多一个需要解释的授权
    就多一分答辩风险，收益却是零。
  · 核心动画（书写引擎 stroke-anim.js）本来就是自写的，与 GSAP 无关。
```

替代实现：`src/ui/compose-canvas.js` 顶部约 30 行的自写补间，
缓动按 GSAP 的 `power2.inOut` 复刻，观感逐帧一致。

### opentype.js — ❌ 已移除（2026-09-16）

曾是 `assets/vendor/opentype.min.js`（171 KB），**运行时零引用**，属于死代码。

原本打算用它解析中研院漢字構形資料庫的字体，但读不了 ——
那批字体的 cmap 子表是 `platform 3 / encoding 4`（非标准标签），opentype.js 不认。
改用自写的 `verify/ttf-outline.py` 解析 glyf 表。详见 `verify/build-ancient-data.py` 顶部注释。

---

## 二、字形数据

### 楷书字形 — ✅ 可用

| | |
|---|---|
| 数据 | `data/chars.js`（30 字） |
| 来源 | **hanzi-writer-data**（Make Me A Hanzi） |
| 上游 | https://github.com/chanind/hanzi-writer-data |
| 授权 | **Arphic Public License** |
| 用途 | 书写动画、构件拆解、构形挑战 |

⚠️ 注意是 **Arphic Public License，不是 MIT**。它允许再分发和修改，
但有传递性条款（衍生的字形数据仍需同样授权）和署名要求。
作品页脚已署名。

### 古文字字形 — ⚠️ 授权待确认

| | |
|---|---|
| 数据 | `data/ancient.js`（甲骨 / 金文 / 楚簡 / 戰國金文 / 小篆 五期） |
| 来源 A | **中央研究院 漢字構形資料庫 2.4 版**（光盘 `cdpfonts24.exe`） |
| 来源 B | **敬峰中山王篆 JFZSKSealScript**（戰國金文部分） |
| 用途 | 01 字源探索、03 千年演变 |

**2026-09-16 核查更正**：中研院官方的[漢字構形資料庫釋出聲明](https://cdp.sinica.edu.tw/cdphanzi/declare.htm)
确实为该系统的字体提供 GFDL 1.2 / CC BY-SA 2.5 TW 双授权，不是仅指「小學堂」。
页面中文标题是 2.65 版，部分附件及英文说明标为 2.62 版；本项目素材提取自更早的 **2.4 版**，
目前还没有证据证明本地这批文件及衍生 SVG 可直接适用上述声明，因此仍保留「授权待确认」。
应向发布方确认版本范围、署名与衍生字形的分享要求，或重新从授权明确的版本提取替换。

在确认之前：

1. 作品界面上的字源卡**已经照实标出「⚠️ 授权待确认」**，不藏
2. 正式公开演示、宣传或分发前，完成版本授权核对；否则移除或替换这些素材
3. 目前**未代用户发函**。如需询问，请由用户向 `cdpservice@iis.sinica.edu.tw` 发信，并保留真实的沟通记录

本清单不是法律意见，也不能代替比赛规则和权利人的具体许可。不要将资料来源描述为本项目的背书方。

---

## 三、字体（界面用）

左上角「字启千年」按用户选定的 6 号字体使用本地 **Long Cang Regular / 龙藏体**（`assets/fonts/LongCang-Regular.ttf`），官方来源为 [Google Fonts / Long Cang](https://github.com/google/fonts/tree/main/ofl/longcang)，字体未修改，SIL OFL 1.1 完整许可保留于 `assets/fonts/OFL-LongCang.txt`。字体与真实预览文件内容一致。仅通过 `--font-title` 用于品牌标题，不改变按钮、说明或其他模块标题。采用原生 400 字重，桌面工作台字号从 40px 提升为 48px，首页响应式 42–52px，小屏 40px；不使用伪粗体或描边改变行草笔触。运行时仅从本地加载。

按用户要求恢复改版前的字体：按钮、说明与英文标签使用本地 **Noto Sans SC**（`assets/fonts/NotoSansSC-Variable.ttf`），标题使用 **Noto Serif SC**（`assets/fonts/NotoSerifSC-Variable.ttf`）。Noto 文件直接来自 Google Fonts 官方仓库的 [Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc) / [Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc)，均为未修改的原版可变字体。完整版权与 SIL Open Font License 1.1 分别保留于 `assets/fonts/OFL-NotoSansSC.txt` 与 `assets/fonts/OFL-NotoSerifSC.txt`。运行时不通过在线 CDN 加载；字符缺失或加载失败时回退至系统字体。

霞鹜文楷文件保留但当前 CSS 不再引用；来源为作者[官方仓库](https://github.com/lxgw/LxgwWenKai)，许可证为 SIL Open Font License 1.1，完整许可保留于 `assets/fonts/OFL-LXGWWenKai.txt`。字体定义见 `src/workbench.css`，当前字体选择与展廊布局配置见最后加载的 `src/gallery.css`。现代界面字体仅用于排版，不作为古文字字形资料。

---

## 四、项目内实现部分

### 小学堂查询字形图片与字形属性（2026-09-17 新增）

`assets/evidence/xiaoxue/` 的 53 张 PNG 与 `data/evidence.js` 中对应的著录属性，通过小学堂公开查询界面取得，依据其[官方 CC0 声明](https://xiaoxue.iis.sinica.edu.tw/License/License)使用。该范围不扩大到整站文章、网页代码、第三方数据库或本地旧 CDP 2.4 字体包。图像是数据库整理字样，不是完整原拓；专业释读未复核。查询与许可页面快照仅供核验留档，不作为本项目页面内容；公开运行成品无需附这些快照。来源、哈希、编号与复查方法见 `assets/evidence/xiaoxue/README.md`。

### 全站背景图片

`assets/backgrounds/` 的六张 JPEG 分别用于首页和五个模块，均来源于大都会艺术博物馆标为 Public Domain 的开放馆藏。馆方 [Open Access 政策](https://www.metmuseum.org/hubs/open-access)以 CC0 发布该类开放图像；已逐项核对官方 API 的公共领域标记与图片地址。原图本地保存，网页只用 CSS 等比裁切、适度对比及透明覆盖，不模糊、不重新绘制。涉及传沈周、仿管道昇、仿文徵明的图片不宣称已确认真迹；嶧山碑图片是现代拓本，不是秦代原碑。完整作品名称、作者归属、编号、下载地址及核查日期见 `assets/backgrounds/README.md`。背景仅为装饰，不是古文字证据，也不代表博物馆背书；该许可不解决项目中其他古文字文件的授权问题。

以下是项目内的实现文件；具体署名、开发过程及原创性声明由参赛者按事实确认：

| 模块 | 说明 |
|---|---|
| `src/stroke-anim.js` | 书写动画引擎（clipPath + 中线 stroke-dashoffset 推进） |
| `src/positioner.js` | 坐标系变换 |
| `src/components.js` | 构件系统与拆分数据 |
| `src/decompose.js` | 构件分离与拖拽 |
| `src/challenge.js` | 构形挑战（位置轮换打散方案） |
| `src/compose.js` | 自由构字（几何定结构 + 查表定字） |
| `src/evolution.js` | 演变时间轴 |
| `src/ui/compose-canvas.js` | 含自写补间（替代 GSAP） |
| `verify/ttf-outline.py` | 自写 TrueType 轮廓解析 |
| `verify/build-ancient-data.py` | 古文字数据生成管线 |
