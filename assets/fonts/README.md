# assets/fonts —— 字体与子集

## 页面上真正加载的三个

| 文件 | 大小 | 用在哪 | 许可 |
|---|---|---|---|
| `NotoSansSC-Subset.woff2` | 1.04 MB | `--font-reading` → 「ZQ Sans」，正文 / 按钮 / 说明 | OFL 1.1 |
| `NotoSerifSC-Subset.woff2` | 1.38 MB | `--font-brand` → 「ZQ Display」，模块标题 | OFL 1.1 |
| `LongCang-Subset.woff2` | 1.49 MB | `--font-title` → 「ZQ Long Cang」，左上角「字启千年」 | OFL 1.1 |

`@font-face` 声明在 `src/workbench.css`（前两个）与 `src/gallery.css`（龙藏）。
加起来 **3.91 MB**。许可原文是同目录的 `OFL-NotoSansSC.txt` / `OFL-NotoSerifSC.txt` /
`OFL-LongCang.txt` —— 子集是 OFL 允许的「修改版本」，这些声明必须跟着走，不要删。

## 为什么要子集化

原件三个是 **45.8 MB**，而 CSS 写的是 `font-display:swap`。swap 的机制是：浏览器
**先用后备字形把整页画一遍**（Windows 上落到雅黑 / 宋体），等字体下完再整体换掉。
45.8 MB 下完要 370 ms 起（本机 SSD，真机带实时防护更久），用户看到的就是刷新后
「弹出来一秒别的样式的网站界面」。

子集到 3.91 MB 后，字体在冷启动第 295 ms 就全部到位（实测，见 `verify/test-boot.mjs`），
那 1 秒的窗口消失。

## 字符集是什么

`charset.txt`（4010 个字符）= 下面两部分的并集，由脚本推导，不手工维护：

1. **站点自己用到的字** —— 扫 `index.html` 与 `src/`、`data/` 下的 js/css。
   加新的界面文案后**必须重跑构建脚本**，否则新字会掉回后备字形。
   漏字**不会报错**，只表现为「那一个字长得不一样」，所以有 `verify/test-fonts.mjs` 钉着。
2. **GB2312 一级常用字**（3755 个）—— 「05 我的造字」里用户手打的创作说明是**字表外的
   任意文字**，只按第 1 部分子集的话那些字全部掉字形。

二级字（次常用 3008 个）没有收：几乎不会被手打，收进来体积要翻一倍。

## 怎么重新生成

```bash
python -m pip install fonttools brotli     # 只有重新生成字体时才需要
python verify/build-font-subset.py         # 重新生成三个子集 + charset.txt
python verify/build-font-subset.py --check # 只验「原件有的字子集有没有丢」，不写文件
```

**仓库平时运行不需要 Python**，零构建那条线不受影响；脚本只在改字体时用。

生成完请跑 `node verify/run-all.mjs --fast`，其中 `test-fonts.mjs` 会独立地
（纯 Node，自己解 woff2 的 cmap）确认站点用字一个都没掉、原件还在、`@font-face` 指对了。

## 原件为什么留着

**一个字节都没动**，仍在原地。本仓库没有版本控制，规矩是**归档，绝不删除** ——
子集是新增文件，不是替换。要改回原件，把两个 CSS 里那三行 `src:url(...)` 指回
`NotoSansSC-Variable.ttf` / `NotoSerifSC-Variable.ttf` / `LongCang-Regular.ttf` 即可。

### 打包提交时要排除的文件

提交包按「二进制瘦身」处理时，**下面这六个文件可以排除**，其余一律保留：

```
assets/fonts/NotoSansSC-Variable.ttf     16.95 MB   ← 有 Subset 版
assets/fonts/NotoSerifSC-Variable.ttf    23.96 MB   ← 有 Subset 版
assets/fonts/LongCang-Regular.ttf         4.92 MB   ← 有 Subset 版
assets/fonts/LXGWWenKai-Regular.ttf      24.39 MB   ← 页面零引用（见下）
assets/fonts/JFZSKSealScript_V3.ttf       2.04 MB   ← 只被构建脚本读，运行时不加载
assets/fonts/LXGWSeal-Regular.ttf         0.19 MB   ← 同上
```

**但排除前先想清楚代价**：排掉前三个就**无法再重新生成子集**（`build-font-subset.py`
读的就是它们），排掉后三个就**无法再重新生成 `data/ancient.js` 的古文字轮廓**。
如果提交的是完整作品而不只是运行包，就一个都别排 —— 这 72.5 MB 换的是「评审拿到的东西
是可复现的」。这一条没有标准答案，是本项目的取舍，登记在此以免下次重新讨论。

**绝不能排除的**：`*.woff2`、`charset.txt`、`OFL-*.txt`、以及 `verify/` 下的两个脚本。
前三个是运行与授权必需，`charset.txt` 是复现子集所需的输入清单。

## 另外三个字体（页面不加载）

| 文件 | 用途 | 说明 |
|---|---|---|
| `JFZSKSealScript_V3.ttf` | 战國金文轮廓 | `verify/build-ancient-data.py` 读取，产出 `data/ancient.js` 里的 SVG 路径 |
| `LXGWSeal-Regular.ttf` | 篆书轮廓 | 同上 |
| `LXGWWenKai-Regular.ttf` | 标题候选 | **零引用**。曾作为标题字体候选（`verify/preview-title-fonts.py`），最终选定龙藏体。没删，理由同「归档」 |

这三个**不进 `@font-face`、浏览器不会请求**，所以不参与子集化。
它们的来源与授权见 `verify/字体下载指南.md`。
