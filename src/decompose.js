/* 字从何来 — 拆解模块（交互层）
 *
 * 整字 → 构件分离 → 自由拖拽 → 重组
 *
 * 关键设计：构件是原字笔画的子集，坐标不变。
 * 所以「合起来就是原字」，不需要重新锚定，也不会出现拼接错位。
 * 分离只是给每个构件加一个 translate 偏移。
 */
(function (global) {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var EXPLODE_DIST = 150;   // 分离距离（字形坐标单位）
  var SNAP_DIST = 55;       // 吸附判定阈值（字形坐标单位）

  function svgEl(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  function easeInOut(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function create(svg, opts) {
    opts = opts || {};
    var width = opts.width || 520;
    var height = opts.height || 520;
    var padding = opts.padding == null ? 40 : opts.padding;

    var pos = global.Positioner.create(width, height, padding);
    var parts = [];        // 渲染出来的构件
    var state = {
      char: null,
      exploded: false,
      selected: -1,
      raf: 0,
      ghostEl: null
    };
    var listeners = { select: [], drop: [] };

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    /* ── 坐标换算 ───────────────────────────── */

    // 客户端坐标 → SVG viewBox 坐标
    function clientToViewBox(clientX, clientY) {
      var r = svg.getBoundingClientRect();
      var vb = svg.viewBox.baseVal;
      return {
        x: (clientX - r.left) / r.width * vb.width,
        y: (clientY - r.top) / r.height * vb.height
      };
    }

    // 屏幕位移 → 字形坐标位移
    // 外层变换是 translate(xo, H-yo) scale(s, -s)：y 被翻转，
    // 所以屏幕向下 = 字形 y 减小。
    function screenDeltaToGlyph(dxScreen, dyScreen) {
      return { dx: dxScreen / pos.scale, dy: -dyScreen / pos.scale };
    }

    /* ── 渲染 ───────────────────────────────── */

    function build(charData, decomposed) {
      svg.innerHTML = '';
      parts = [];

      var root = svgEl('g', { transform: pos.transform });
      svg.appendChild(root);

      // 整字底纹：分离后仍能看见原字轮廓，知道该拼回哪里
      if (decomposed.parts.length > 0) {
        var ghost = svgEl('g', { 'class': 'zc-decomp-ghost' });
        charData.strokes.forEach(function (d) {
          ghost.appendChild(svgEl('path', { d: d }));
        });
        root.appendChild(ghost);
        state.ghostEl = ghost;
      } else {
        // 不可拆解（象形字）：整字实心显示，否则只剩几乎看不见的底纹
        var solid = svgEl('g', { 'class': 'zc-decomp-solid' });
        charData.strokes.forEach(function (d) {
          solid.appendChild(svgEl('path', { d: d }));
        });
        root.appendChild(solid);
        state.ghostEl = null;
      }

      decomposed.parts.forEach(function (p, i) {
        var g = svgEl('g', {
          'class': 'zc-comp',
          'data-index': String(i),
          transform: 'translate(0,0)'
        });

        // 可见字形
        p.d.forEach(function (d) {
          g.appendChild(svgEl('path', { d: d, 'class': 'zc-comp-shape' }));
        });

        // 透明加粗描边 —— 扩大可抓取范围，否则细笔画很难拖
        p.d.forEach(function (d) {
          g.appendChild(svgEl('path', {
            d: d, 'class': 'zc-comp-hit', fill: 'none',
            stroke: 'transparent', 'stroke-width': '70'
          }));
        });

        root.appendChild(g);

        parts.push({
          el: g,
          data: p,
          index: i,
          offset: { dx: 0, dy: 0 },   // 当前偏移
          target: { dx: 0, dy: 0 },   // 动画目标
          locked: false,              // 归位后锁定（挑战模式用）
          raf: 0
        });

        bindDrag(parts[i]);
      });

      state.char = decomposed.char;
      state.exploded = false;
      state.selected = -1;
      return root;
    }

    /* ── 拖拽 ───────────────────────────────── */

    function bindDrag(part) {
      var dragging = false;
      var start = null;

      part.el.addEventListener('pointerdown', function (e) {
        if (part.locked) return;    // 已归位的构件不再可拖
        e.preventDefault();
        // setPointerCapture 在指针不活跃时会抛 NotFoundError（合成事件、
        // 指针已被系统取消等）。抛了不该导致整个拖拽失效 —— 包起来继续。
        try { part.el.setPointerCapture(e.pointerId); } catch (err) { /* 无捕获也能拖 */ }
        dragging = true;

        var v = clientToViewBox(e.clientX, e.clientY);
        start = { vx: v.x, vy: v.y, ox: part.offset.dx, oy: part.offset.dy };

        part.el.classList.add('is-dragging');
        bringToFront(part);
        select(part.index);
      });

      part.el.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        var v = clientToViewBox(e.clientX, e.clientY);

        // viewBox 位移 → 字形坐标位移（viewBox 已是屏幕空间的等比映射）
        var g1 = screenDeltaToGlyph(v.x - start.vx, v.y - start.vy);
        part.offset.dx = start.ox + g1.dx;
        part.offset.dy = start.oy + g1.dy;

        applyOffset(part);
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        part.el.classList.remove('is-dragging');
        try { part.el.releasePointerCapture(e.pointerId); } catch (err) { /* 已释放 */ }

        // 松手后：靠近原位则吸附回去。
        // 事件**立刻**发，不等吸附动画走完 —— 判定用的是"松手时离原位够近"，
        // 这个事实在松手一瞬间就确定了，没必要拖 260ms 再报。
        // （等动画的话，订阅方还得自己处理"动画途中又被拖动"的时序问题。）
        var nearHome = offsetDist(part) < SNAP_DIST;
        if (nearHome) animatePart(part, { dx: 0, dy: 0 }, 260);
        emitDrop(part, nearHome);
      }

      part.el.addEventListener('pointerup', endDrag);
      part.el.addEventListener('pointercancel', endDrag);
    }

    function applyOffset(part) {
      part.el.setAttribute(
        'transform',
        'translate(' + part.offset.dx.toFixed(2) + ',' + part.offset.dy.toFixed(2) + ')'
      );
    }

    function bringToFront(part) {
      part.el.parentNode.appendChild(part.el);
    }

    /* ── 动画 ───────────────────────────────── */

    function animatePart(part, target, dur, onDone) {
      var from = { dx: part.offset.dx, dy: part.offset.dy };
      var t0 = performance.now();
      part.target = target;

      // 同一构件上若有未完成的动画，先取消 —— 否则旧的 rAF 会继续写 offset，
      // 和新的动画互相打架（快速连点"分离/重组"时能直接看出来）
      if (part.raf) cancelAnimationFrame(part.raf);

      function tick(now) {
        var t = Math.min(1, (now - t0) / dur);
        var e = easeInOut(t);
        part.offset.dx = from.dx + (target.dx - from.dx) * e;
        part.offset.dy = from.dy + (target.dy - from.dy) * e;
        applyOffset(part);
        if (t < 1) {
          part.raf = requestAnimationFrame(tick);
        } else {
          part.raf = 0;
          if (onDone) onDone();
        }
      }
      part.raf = requestAnimationFrame(tick);
    }

    function emitDrop(part, snapped) {
      listeners.drop.forEach(function (fn) { fn(part, snapped); });
    }

    /** 构件偏离原位的距离 */
    function offsetDist(part) {
      return Math.sqrt(
        part.offset.dx * part.offset.dx + part.offset.dy * part.offset.dy
      );
    }

    /* ── 选中 ───────────────────────────────── */

    function select(i) {
      state.selected = i;
      parts.forEach(function (p, k) {
        p.el.classList.toggle('is-selected', k === i);
      });
      listeners.select.forEach(function (fn) {
        fn(i >= 0 ? parts[i].data : null, i);
      });
    }

    /* ── 公开接口 ───────────────────────────── */

    return {
      /** 载入一个字；若能拆解则渲染构件，否则显示整字 */
      load: function (ch, charData) {
        var d = global.Components.decompose(ch, charData);
        if (!d) {
          // 不可拆解：退化为整字显示
          build(charData, {
            char: ch, parts: [], relation: '', valid: true, coverage: ''
          });
          state.decomposable = false;
          return null;
        }
        build(charData, d);
        state.decomposable = true;
        return d;
      },

      /** 是否可拆解 */
      isDecomposable: function () { return !!state.decomposable; },

      /** 构件分离 */
      explode: function () {
        if (!state.exploded || parts.length === 0) {
          var offs = global.Components.separationOffsets(
            parts.map(function (p) { return p.data; }), EXPLODE_DIST
          );
          parts.forEach(function (p, i) {
            // 已手动拖开的构件不再移动
            if (offsetDist(p) > 20) return;
            animatePart(p, offs[i], 520);
          });
          state.exploded = true;
        }
        return state.exploded;
      },

      /**
       * 程序化摆放某个构件（挑战模式打散用）。
       * animate 为真时走过去，否则瞬移。
       */
      setOffset: function (i, off, animate) {
        var p = parts[i];
        if (!p) return;
        if (animate) animatePart(p, { dx: off.dx, dy: off.dy }, 520);
        else {
          if (p.raf) { cancelAnimationFrame(p.raf); p.raf = 0; }
          p.offset = { dx: off.dx, dy: off.dy };
          p.target = { dx: off.dx, dy: off.dy };
          applyOffset(p);
        }
      },

      /** 底纹显隐 —— 挑战模式的「提示」开关 */
      setGhostVisible: function (on) {
        if (state.ghostEl) state.ghostEl.style.display = on ? '' : 'none';
      },

      /** 锁定 / 解锁构件 */
      setLock: function (i, locked) {
        var p = parts[i];
        if (!p) return;
        p.locked = !!locked;
        p.el.classList.toggle('is-locked', !!locked);
      },

      /** 构件是否已在原位 */
      isHome: function (i, tol) {
        var p = parts[i];
        if (!p) return false;
        return offsetDist(p) <= (tol == null ? 1.5 : tol);
      },

      /** 拖拽落位回调：(part, 是否吸附归位) => void */
      onDrop: function (fn) { listeners.drop.push(fn); },

      /** 重组 */
      collapse: function () {
        parts.forEach(function (p) {
          p.locked = false;
          p.el.classList.remove('is-locked');
          animatePart(p, { dx: 0, dy: 0 }, 460);
        });
        state.exploded = false;
      },

      /** 回到初始状态 */
      reset: function () {
        parts.forEach(function (p) {
          if (p.raf) { cancelAnimationFrame(p.raf); p.raf = 0; }
          p.offset = { dx: 0, dy: 0 };
          p.target = { dx: 0, dy: 0 };
          p.locked = false;
          p.el.classList.remove('is-locked');
          applyOffset(p);
        });
        state.exploded = false;
        select(-1);
      },

      /** 选中的构件数据 */
      getSelected: function () {
        return state.selected >= 0 ? parts[state.selected].data : null;
      },

      /** 当前各构件偏离原位的程度（构形挑战的判定基础） */
      getPlacement: function () {
        return parts.map(function (p) {
          return {
            glyph: p.data.glyph,
            dx: p.offset.dx,
            dy: p.offset.dy,
            dist: Math.sqrt(p.offset.dx * p.offset.dx + p.offset.dy * p.offset.dy)
          };
        });
      },

      onSelect: function (fn) { listeners.select.push(fn); },
      select: select,
      parts: function () { return parts; }
    };
  }

  global.Decompose = { create: create };
})(window);
