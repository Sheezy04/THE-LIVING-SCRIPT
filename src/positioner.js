/* 字从何来 — 坐标系模块
 *
 * Make Me A Hanzi / hanzi-writer-data 的所有汉字共用同一个固定包围盒，
 * 字形墨迹的宽窄差异是字体设计本身，不是坐标系不统一。
 * 因此渲染不需要"归一化"，只需套用同一个变换。
 *
 * 约定来源：hanzi-writer 源码
 *   const CHARACTER_BOUNDS = [{x:0, y:-124}, {x:1024, y:900}]
 *   transform = translate(xOffset, height - yOffset) scale(scale, -scale)
 * 注意 y 轴是翻转的（scale 的第二参数为负）。
 */
(function (global) {
  'use strict';

  // 所有字共用的坐标系：x ∈ [0,1024]，y ∈ [-124,900]
  var BOUNDS = { x: 0, y: -124, w: 1024, h: 1024, right: 1024, bottom: 900 };

  /**
   * 计算把字形映射到目标画布的变换。
   * @param {number} width  画布宽（px 或 viewBox 单位）
   * @param {number} height 画布高
   * @param {number} padding 内边距
   */
  function createPositioner(width, height, padding) {
    var effW = width - 2 * padding;
    var effH = height - 2 * padding;
    var scale = Math.min(effW / BOUNDS.w, effH / BOUNDS.h);

    var xBuf = padding + (effW - scale * BOUNDS.w) / 2;
    var yBuf = padding + (effH - scale * BOUNDS.h) / 2;

    var xOffset = -BOUNDS.x * scale + xBuf;
    var yOffset = -BOUNDS.y * scale + yBuf;

    return {
      scale: scale,
      xOffset: xOffset,
      yOffset: yOffset,
      // 直接可用的 SVG transform 字符串
      transform:
        'translate(' + xOffset + ', ' + (height - yOffset) + ') ' +
        'scale(' + scale + ', ' + -scale + ')'
    };
  }

  /**
   * 把字形坐标系中的点换算到画布坐标（用于命中测试、锚点定位）。
   */
  function toCanvas(point, pos, height) {
    return {
      x: point.x * pos.scale + pos.xOffset,
      y: height - (point.y * pos.scale + pos.yOffset)
    };
  }

  /**
   * 实际可见的字形坐标范围。
   *
   * BOUNDS 是字形框，但画布上还有 padding 那一圈 ——
   * 构件摆到字形框外、padding 以内，仍然看得见。
   * 算"还能往外推多远"时要用这个范围；用 BOUNDS 会保守太多
   * （林森从众 就是因为这个被算得几乎推不动）。
   */
  function visibleBounds(width, height, padding) {
    var p = createPositioner(width, height, padding);
    var halfW = (width / p.scale) / 2;
    var halfH = (height / p.scale) / 2;
    var cx = (BOUNDS.x + BOUNDS.right) / 2;
    var cy = (BOUNDS.y + BOUNDS.bottom) / 2;
    return {
      x: cx - halfW, right: cx + halfW,
      y: cy - halfH, bottom: cy + halfH
    };
  }

  global.Positioner = {
    BOUNDS: BOUNDS,
    create: createPositioner,
    toCanvas: toCanvas,
    visibleBounds: visibleBounds
  };
})(window);
