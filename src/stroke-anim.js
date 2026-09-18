/* 字从何来 — 书写动画引擎
 *
 * 原理（与 hanzi-writer 同款技法）：
 *   1. 每一笔的字形轮廓 path 作为 clipPath —— 限定"墨"只能落在这一笔的范围内
 *   2. 沿该笔的 median（中线）画一条很粗的线作为"画笔"，用 stroke-dasharray/offset 推进
 *   3. 画笔被 clip 裁剪后，视觉上就是这一笔被一笔一笔写出来
 *
 * 相比简单的淡入，这种做法的好处：
 *   - 有真实的运笔方向感
 *   - 完全矢量化，任意缩放不失真
 *   - 进度可任意设定 → 时间轴可以来回拖动（这正是演变模块需要的能力）
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var uidSeq = 0;

  // 画笔宽度：需粗到能覆盖最粗的笔画。因为被 clip 裁剪，
  // 过粗不会溢出字形轮廓，所以取一个宽裕值最安全。
  var BRUSH_WIDTH = 240;
  var EPS = 0.5;

  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  /** median 点列 → SVG path 字符串 */
  function medianToPath(pts) {
    if (!pts || !pts.length) return '';
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length; i++) {
      d += ' L ' + pts[i][0] + ' ' + pts[i][1];
    }
    return d;
  }

  /** median 折线长度（纯 JS 计算，不依赖 DOM，便于提前排期） */
  function medianLength(pts) {
    if (!pts || pts.length < 2) return 0;
    var len = 0;
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i][0] - pts[i - 1][0];
      var dy = pts[i][1] - pts[i - 1][1];
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }

  /**
   * 创建一个字的渲染器。
   *
   * @param {SVGElement} svg    目标 <svg>
   * @param {Object} charData   { strokes:[pathStr], medians:[[[x,y],...]], radStrokes:[i,...] }
   * @param {Object} opts       { width, height, padding, ghost, brushWidth }
   */
  function create(svg, charData, opts) {
    opts = opts || {};
    var width = opts.width || 400;
    var height = opts.height || 400;
    var padding = opts.padding == null ? 24 : opts.padding;
    var brushWidth = opts.brushWidth || BRUSH_WIDTH;
    var showGhost = opts.ghost !== false;

    var uid = 'zc' + (++uidSeq);
    var pos = global.Positioner.create(width, height, padding);

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.innerHTML = '';

    var defs = svgEl('defs');
    svg.appendChild(defs);

    // 字形坐标 → 画布坐标 的统一变换
    var g = svgEl('g', { transform: pos.transform });
    svg.appendChild(g);

    // 底纹层：整字淡淡地显示，让用户知道要写的是什么
    if (showGhost) {
      var ghostLayer = svgEl('g', { 'class': 'zc-ghost' });
      for (var s = 0; s < charData.strokes.length; s++) {
        ghostLayer.appendChild(svgEl('path', { d: charData.strokes[s] }));
      }
      g.appendChild(ghostLayer);
    }

    var inkLayer = svgEl('g', { 'class': 'zc-ink' });
    g.appendChild(inkLayer);

    var strokes = [];   // { shape, brush, len, clipId }
    var totalLen = 0;

    for (var i = 0; i < charData.strokes.length; i++) {
      var outline = charData.strokes[i];
      var median = charData.medians[i];

      // 1) 该笔的形状 → clipPath
      var clipId = uid + '-c' + i;
      var clip = svgEl('clipPath', { id: clipId });
      clip.appendChild(svgEl('path', { d: outline }));
      defs.appendChild(clip);

      // 2) 画笔：沿中线推进，被 clip 裁剪后就是"写出来"的效果
      var len = medianLength(median);
      var brush = svgEl('path', {
        d: medianToPath(median),
        'class': 'zc-brush',
        'stroke-width': brushWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'fill': 'none',
        'clip-path': 'url(#' + clipId + ')'
      });
      // 零长度虚线仍可能绘制 round 端点；未开写的笔画必须显式隐藏。
      brush.style.visibility = 'hidden';

      if (len <= EPS) {
        // 点画（如 丶）：没有长度可推进，退化为整体淡入
        brush.setAttribute('stroke-linecap', 'round');
        brush.style.opacity = '0';
      } else {
        brush.setAttribute('stroke-dasharray', len + ' ' + len);
        brush.setAttribute('stroke-dashoffset', len);
      }

      inkLayer.appendChild(brush);

      strokes.push({ brush: brush, len: len, index: i });
      totalLen += len;
    }

    // 累计长度前缀和 —— 用于把"整字进度"映射到"第几笔写到哪"
    var prefix = [0];
    for (var p = 0; p < strokes.length; p++) {
      prefix.push(prefix[p] + strokes[p].len);
    }

    /** 设置所有笔画的进度数组 */
    function render(progressArr) {
      for (var k = 0; k < strokes.length; k++) {
        var st = strokes[k];
        var pr = progressArr[k];
        if (pr == null) pr = 0;
        pr = pr < 0 ? 0 : pr > 1 ? 1 : pr;
        st.brush.style.visibility = pr > 0 ? 'visible' : 'hidden';

        if (st.len <= EPS) {
          st.brush.style.opacity = String(pr);
        } else {
          st.brush.setAttribute('stroke-dashoffset', String(st.len * (1 - pr)));
        }
      }
    }

    var current = new Array(strokes.length).fill(0);

    return {
      /** 笔画总数 */
      strokeCount: strokes.length,
      /** 全部笔画的总长度（用于时间轴配速） */
      totalLength: totalLen,
      /** 每笔的长度数组 */
      strokeLengths: strokes.map(function (s) { return s.len; }),
      /** 该笔是否属于部首（拆字模块会用） */
      radStrokes: charData.radStrokes || [],
      /** 坐标系信息 */
      positioner: pos,

      /**
       * 按整字进度渲染。p ∈ [0,1]
       * 笔画按长度加权分配 —— 长笔画占用的"书写时间"更多，视觉上更自然。
       */
      setProgress: function (p) {
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        var target = p * totalLen;
        for (var k = 0; k < strokes.length; k++) {
          var start = prefix[k], end = prefix[k + 1];
          var seg = end - start;
          if (seg <= EPS) {
            // 点画：在前一笔完成时瞬间出现
            current[k] = p > 0 && target >= end ? 1 : 0;
          } else if (target >= end) {
            current[k] = 1;
          } else if (target <= start) {
            current[k] = 0;
          } else {
            current[k] = (target - start) / seg;
          }
        }
        render(current);
        return current.slice();
      },

      /** 单独设定某一笔的进度（拆字模块逐步高亮用） */
      setStrokeProgress: function (i, p) {
        if (i < 0 || i >= strokes.length) return;
        current[i] = p < 0 ? 0 : p > 1 ? 1 : p;
        render(current);
      },

      /** 当前各笔进度快照 */
      getProgress: function () { return current.slice(); },

      /** 全部显示 / 全部隐藏 */
      show: function () { current.fill(1); render(current); },
      clear: function () { current.fill(0); render(current); },

      /** 高亮某一笔（其余变淡） */
      highlightStroke: function (i) {
        for (var k = 0; k < strokes.length; k++) {
          strokes[k].brush.classList.toggle('zc-dim', k !== i);
        }
      },
      clearHighlight: function () {
        for (var k = 0; k < strokes.length; k++) {
          strokes[k].brush.classList.remove('zc-dim');
        }
      },

      /** 拆解模式：只显示属于部首的笔画 */
      isolateRadical: function (on) {
        var rad = this.radStrokes;
        for (var k = 0; k < strokes.length; k++) {
          var isRad = rad.indexOf(k) >= 0;
          strokes[k].brush.classList.toggle('zc-hidden', on && !isRad);
        }
      }
    };
  }

  global.StrokeRenderer = {
    create: create,
    medianToPath: medianToPath,
    medianLength: medianLength
  };
})(window);
