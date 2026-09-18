# 全站背景图来源

本目录用于本地离线图片，不在运行时请求远程服务器。

全屏铺满：图片使用固定视口层、等比 cover，并向四边扩展 4vmax 以裁掉原图浅色纸边；背景不受正文最大宽度限制。首页取消左右泛白遮罩。没有把图片拉伸变形，也没有把内容区改成 100vw。

首页与 01—06 模块各用一张不同的馆藏原图，共七张，不是同一图片改名或换取景。保持用户确认的不透明度：首页 22%，探索 44%、演变 40%、实验室 42%、挑战 44%、造字 42%、关系网 42%；小屏首页 16%、工作台 28%。覆盖层透明参数不变，保留恢复饱和度、适度对比及全屏裁边，不使用模糊处理。正文与工具不整体透明。图像固定在底层，不参与拖拽。桌面主画布独立固定，说明和工具随页面自然滚动。

## 页面分配

| 页面 | 本地文件 | 原图尺寸 | 内容 |
|---|---|---|---|
| 首页 | `met-autumn-foliage.jpg` | 1950 × 1275 | 秋景山水 |
| 01 汉字探索 | `met-pavilion-willows.jpg` | 3873 × 2553 | 柳岸亭榭 |
| 02 千年演变 | `met-mount-yi-rubbing.jpg` | 1880 × 3521 | 篆书碑拓局部；不是秦代原碑照片 |
| 03 构形实验室 | `met-bamboo.jpg` | 4000 × 2394 | 竹石与题款 |
| 04 汉字挑战 | `met-moonlight-calligraphy.jpg` | 2000 × 1532 | 行书诗册的一页展开照片 |
| 05 我的造字 | `met-xiao-xiang-album.jpg` | 3164 × 3342 | 仿文徵明册页中的书法页 |
| 06 汉字关系网 | `met-dragon-jar.jpg` | 3000 × 4000 | 青花云龙纹罐的器物照片；不是绘画，也不是文字资料 |

竖向原图在宽屏中采用局部取景，不压扁、不拼接、不伪装成完整原作展示。七张原图均逐张查看过；这不等于浏览器页面的视觉验收。

## 首页来源

- 文件：`met-autumn-foliage.jpg`
- 作品：Landscape with Autumn Foliage
- 馆方作者标注：Attributed to Shen Zhou（传沈周；不确定归属，不宣称为已确认真迹）
- 年代：Ming or Qing dynasty（明或清）
- 馆藏：The Metropolitan Museum of Art
- 馆藏编号：69.131.9；Object ID：51858
- 作品页：https://www.metmuseum.org/art/collection/search/51858
- 官方图像入口：https://collectionapi.metmuseum.org/api/collection/v1/iiif/51858/152593/main-image
- 下载图像：https://images.metmuseum.org/CRDImages/as/original/DP156825.jpg
- 许可依据：作品页标为 Public Domain；馆方 Open Access 将公共领域作品开放图像以 CC0 发布。
- 官方政策：https://www.metmuseum.org/hubs/open-access
- CC0：https://creativecommons.org/publicdomain/zero/1.0/
- 核查日期：2026-09-17

## 六个模块来源

以下全部出自 The Metropolitan Museum of Art。2026-09-17 核对官方作品页 Public Domain 标识，同时读取官方 API 的 `isPublicDomain: true` 并确认下载地址属于该作品的 `primaryImage` 或 `additionalImages`。

### 01 柳岸亭榭

- 文件：`met-pavilion-willows.jpg`
- 作品：Landscape with Pavilion and Willows
- 作者：Attributed to Shen Zhou（传沈周；不宣称已确认真迹）
- 年代：明或清；馆藏编号：69.131.10；Object ID：53601
- 作品页：https://www.metmuseum.org/art/collection/search/53601
- 原图：https://images.metmuseum.org/CRDImages/as/original/DP156826.jpg

### 02 嶧山碑拓本

- 文件：`met-mount-yi-rubbing.jpg`
- 作品：Inscriptions from the Stele of Mount Yi
- 书者标注：After Xu Xuan（仿徐铉）
- 馆方媒材为 Modern rubbings（现代拓本），碑的年代标为宋代；不是秦代原碑，也不是项目某个汉字演变阶段的直接证据。
- 馆藏编号：1977.375.7a, b；Object ID：64022
- 作品页：https://www.metmuseum.org/art/collection/search/64022
- 原图：https://images.metmuseum.org/CRDImages/as/original/DP-12237-001.jpg

### 03 竹石

- 文件：`met-bamboo.jpg`
- 作品：Bamboo
- 作者：Unidentified artist / After Guan Daosheng（佚名，仿管道昇；不宣称为管道昇真迹）
- 年代：明至清；馆藏编号：13.220.99d；Object ID：51497
- 作品页：https://www.metmuseum.org/art/collection/search/51497
- 原图：https://images.metmuseum.org/CRDImages/as/original/DP154410.jpg

### 04 行书诗册

- 文件：`met-moonlight-calligraphy.jpg`
- 作品：Poem on Strolling in the Moonlight（选册页展开照片，而非封面照片）
- 作者：Wen Zhengming（文徵明）
- 年代：1543；馆藏编号：1982.229a–ff；Object ID：51865
- 作品页：https://www.metmuseum.org/art/collection/search/51865
- 原图：https://images.metmuseum.org/CRDImages/as/original/1982_229b.jpg

### 05 瀟湘诗画册中的书法页

- 文件：`met-xiao-xiang-album.jpg`
- 作品：Eight Songs of the Xiao and Xiang Rivers（选书法页）
- 作者：Unidentified artist / After Wen Zhengming（佚名，仿文徵明；不宣称为文徵明真迹）
- 年代：16 或 17 世纪；馆藏编号：1972.278.9a–t；Object ID：36103
- 作品页：https://www.metmuseum.org/art/collection/search/36103
- 原图：https://images.metmuseum.org/CRDImages/as/original/DP161038.jpg

### 06 青花云龙纹罐

- 文件：`met-dragon-jar.jpg`
- 作品：Jar with dragon（云龙纹罐）
- 作者：未署款；馆方记录 culture 为 China
- 年代：明宣德（Xuande mark and period, 1426–35），馆方年代栏写 early 15th century
- 媒材：Porcelain painted with cobalt blue under transparent glaze（景德镇窑青花）
- 尺寸：高 48.3 cm，径 48.3 cm
- 馆藏编号：37.191.1；Object ID：39666
- 作品页：https://www.metmuseum.org/art/collection/search/39666
- 原图：https://images.metmuseum.org/CRDImages/as/original/DP-32251-001.jpg
- 选图理由：这一页画的是字与字之间的连线，云龙纹本身就是一圈圈互相勾连的线条；青花的蓝也与其他六张水墨、拓本、设色的色调区分得开。
- 如实说明：这是**器物照片**，其余六张都是纸绢绘画或拓本；张冠李戴地说成「明代绘画」是不对的。器物上的龙纹与本项目的古文字释读无关。

许可统一依据馆方 Open Access 的 CC0 政策：https://www.metmuseum.org/hubs/open-access 。下载维护脚本为 `verify/download-backgrounds.mjs`，网页不调用它，运行时不需要网络。

网页仅通过 CSS 裁切、饱和度、对比度和透明覆盖调整展示；本地 JPEG 未重新绘制或提高分辨率。图片是氛围背景，不是项目古文字释读的资料，也不代表博物馆对本项目背书。本图片的许可不覆盖项目内其他待核对的古文字素材。
