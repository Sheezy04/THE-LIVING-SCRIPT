/* 字从何来 — 构形挑战（游戏层）
 *
 * 玩法：构件被打散到**别人的位置**上，玩家要把每一块拖回它自己的原位。
 *
 * 为什么不直接用现有的 explode()：
 *   explode() 是把每块沿"远离字心"的方向推出去。玩家只要往中心推回来就完事了，
 *   根本不用知道「日该在左、月该在右」——考不出构形知识。
 *   所以这里改成**位置轮换**：日坐到月的位置上，月坐到日的位置上。
 *   要拼对，就必须知道这个字左右/上下是什么部件。
 *
 * 同形构件（林、森、从、众）**不做轮换**：
 *   那些字的两块/三块长得一模一样，轮换后视觉上"看起来已经拼好了"，
 *   但只有一块是真归位，玩家把另一块拖到最近的空位反而不会吸附 —— 会让人困惑。
 *   这类字退回普通径向分离，任务变成"推回原位"，语义清晰。
 *
 * 游戏层与渲染层的分工：
 *   decompose.js 负责渲染、拖拽、吸附，并通过 onDrop 汇报状态；
 *   本文件只订阅事件、判定归位、锁块、计时。decompose.js 不认识"游戏"。
 */
(function (global) {
  'use strict';

  var PUSH = 210;       // 轮换后沿离心方向再推开的距离（会自动收敛到不越界）
  var TOL = 1.5;        // 判定"已归位"的容差（字形坐标单位）

  /**
   * 取构件的包围盒。
   * 注意是 part.data.bbox —— Decompose 返回的 part 是
   * { el, data, index, offset, target, locked, raf }，bbox 挂在 data 上。
   */
  function boxOf(part) { return part.data.bbox; }

  /** 各构件重心的平均 —— 也就是"字心" */
  function centroidOf(parts) {
    var n = parts.length;
    var cx = 0, cy = 0;
    parts.forEach(function (p) {
      var b = boxOf(p);
      cx += b.cx; cy += b.cy;
    });
    return { cx: cx / n, cy: cy / n };
  }

  /**
   * 从字心指向"摆好之后的落点"的单位向量。
   *
   * 关键：必须用**轮换之后**的落点算，不能用原位。
   * 用原位的话，亻 轮换到右边之后仍按"原位在左"往左推，
   * 正好推回来撞上同样被推过来的 木 —— 实测两块间距只剩 2。
   */
  function pushDirs(parts, base, center) {
    return parts.map(function (p, i) {
      var b = boxOf(p);
      var tx = b.cx + base[i].dx - center.cx;
      var ty = b.cy + base[i].dy - center.cy;
      var len = Math.sqrt(tx * tx + ty * ty);
      if (len < 1e-6) return { dx: 0, dy: 1 };   // 落在字心上：向上推
      return { dx: tx / len, dy: ty / len };
    });
  }

  /**
   * 在不越界的前提下，求实际能推多远。
   * 返回 0–1 的系数，乘到 PUSH 上。
   */
  function safePushFactor(parts, offs, dirs, want, B) {
    var t = 1;
    parts.forEach(function (p, i) {
      var b = boxOf(p);
      var x = b.x + offs[i].dx;
      var y = b.y + offs[i].dy;
      var ux = dirs[i].dx, uy = dirs[i].dy;   // 已是单位向量

      // 原始坐标里 y 越大越靠上（渲染时 scale(s,-s) 翻转过）
      if (ux > 1e-6) t = Math.min(t, (B.right - (x + b.w)) / (ux * want));
      if (ux < -1e-6) t = Math.min(t, (B.x - x) / (ux * want));
      if (uy > 1e-6) t = Math.min(t, (B.bottom - (y + b.h)) / (uy * want));
      if (uy < -1e-6) t = Math.min(t, (B.y - y) / (uy * want));
    });
    return Math.max(0, Math.min(1, t));
  }

  /**
   * 整体平移，把打散后的构件群挪进可见范围。
   *
   * 必要性：轮换是"把重心挪到别人的重心"，但各构件宽窄不同 ——
   * 把宽的 木 挪到窄的 亻 的位置，它自己就伸到画布外了。
   * 这种情况减少推开量也没用（越界来自轮换本身），只能整体挪回来。
   */
  function fitIntoBounds(parts, offs, vis) {
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    parts.forEach(function (p, i) {
      var b = boxOf(p);
      var x = b.x + offs[i].dx, y = b.y + offs[i].dy;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x + b.w);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y + b.h);
    });

    var dx = 0, dy = 0;
    if (minX < vis.x) dx = vis.x - minX;
    else if (maxX > vis.right) dx = vis.right - maxX;
    if (minY < vis.y) dy = vis.y - minY;
    else if (maxY > vis.bottom) dy = vis.bottom - maxY;

    if (!dx && !dy) return offs;
    return offs.map(function (o) { return { dx: o.dx + dx, dy: o.dy + dy }; });
  }

  /**
   * 打散方案。
   * @returns {{offsets: Array, shuffled: boolean}}
   */
  function scatterPlan(parts, visible) {
    var n = parts.length;
    var glyphs = parts.map(function (p) { return p.data.glyph; });
    // 只有"各构件字形都不同"时才轮换 —— 同形构件轮换会让人困惑，理由见文件头
    var distinct = glyphs.every(function (g, i) { return glyphs.indexOf(g) === i; });
    var shuffled = distinct && n > 1;

    var base = parts.map(function (p) { return { dx: 0, dy: 0 }; });

    if (shuffled) {
      // 位置轮换：构件 i 坐到构件 (i+1) 的原位
      for (var i = 0; i < n; i++) {
        var bi = boxOf(parts[i]), bj = boxOf(parts[(i + 1) % n]);
        base[i] = { dx: bj.cx - bi.cx, dy: bj.cy - bi.cy };
      }
    }

    var dirs = pushDirs(parts, base, centroidOf(parts));
    var k = safePushFactor(parts, base, dirs, PUSH, visible);

    var offs = base.map(function (o, i) {
      return {
        dx: o.dx + dirs[i].dx * PUSH * k,
        dy: o.dy + dirs[i].dy * PUSH * k
      };
    });

    return { shuffled: shuffled, offsets: fitIntoBounds(parts, offs, visible) };
  }

  function create(svg, opts) {
    var view = global.Decompose.create(svg, opts);
    var B = global.Positioner.BOUNDS;

    var st = {
      char: null,
      total: 0,
      placed: 0,
      solved: false,
      shuffled: false,
      t0: 0,           // 首次操作时刻；0 = 还没开始
      elapsed: 0,
      moves: 0,
      hints: 0
    };
    var listeners = { progress: [], solve: [] };
    // 已归位的构件下标。
    // 不靠 view.isHome() 现算 —— 吸附动画还在走时 offset 尚未归零，
    // 那一刻查会得到 false。以"松手即判定"的结果为准。
    var placedSet = {};

    function emitProgress() {
      var s = stats();
      listeners.progress.forEach(function (fn) { fn(s); });
    }

    function stats() {
      return {
        char: st.char,
        total: st.total,
        placed: st.placed,
        solved: st.solved,
        shuffled: st.shuffled,
        elapsed: st.t0 ? (st.elapsed + (performance.now() - st.t0)) : st.elapsed,
        moves: st.moves,
        hints: st.hints
      };
    }

    function markPlaced(i) {
      if (placedSet[i]) return;
      placedSet[i] = true;
      view.setLock(i, true);
      st.placed++;
      emitProgress();
      if (st.placed >= st.total && !st.solved) {
        st.solved = true;
        st.elapsed = st.t0 ? st.elapsed + (performance.now() - st.t0) : st.elapsed;
        st.t0 = 0;
        listeners.solve.forEach(function (fn) { fn(stats()); });
      }
    }

    // snapped 为真 = 松手时离原位在吸附距离内 = 它必然会归位。
    // 直接采信，不再现算 offset。
    view.onDrop(function (part, snapped) {
      st.moves++;
      if (snapped && !part.locked) markPlaced(part.index);
      else emitProgress();
    });

    // 首次触碰构件时才开始计时 —— 页面加载时间不该算进成绩
    view.onSelect(function () {
      if (!st.t0 && !st.solved) st.t0 = performance.now();
    });

    function layout(charData) {
      var d = view.load(st.char, charData);
      if (!d || !d.parts.length) {
        st.total = st.placed = 0;
        st.solved = false;
        st.shuffled = false;
        return null;
      }

      var plan = scatterPlan(view.parts(), B);
      st.total = d.parts.length;
      st.placed = 0;
      st.solved = false;
      st.shuffled = plan.shuffled;
      st.t0 = 0;
      st.elapsed = 0;
      st.moves = 0;
      st.hints = 0;
      st.hintOn = false;
      placedSet = {};

      view.parts().forEach(function (p, i) {
        view.setLock(i, false);
        view.setOffset(i, plan.offsets[i], false);
      });
      view.setGhostVisible(false);

      // 兜底：若某块打散后恰好仍在原位（理论上不该发生），直接判它已归位
      view.parts().forEach(function (p, i) {
        if (view.isHome(i, TOL)) markPlaced(i);
      });

      emitProgress();
      return d;
    }

    return {
      /** 开始一局；不可拆解的字返回 null */
      start: function (ch, charData) {
        st.char = ch;
        return layout(charData);
      },

      /** 重开一局 */
      restart: function (charData) { return layout(charData); },

      /** 提示：显示整字底纹，让人看见"该拼成什么形状" */
      setHint: function (on) {
        st.hintOn = !!on;
        view.setGhostVisible(st.hintOn);
        st.hints = st.hintOn ? st.hints + 1 : st.hints;
        emitProgress();
      },

      isSolved: function () { return st.solved; },
      isShuffled: function () { return st.shuffled; },
      /** 该构件是否已归位（以判定结果为准，非实时 offset） */
      isPlaced: function (i) { return !!placedSet[i]; },
      stats: stats,
      view: function () { return view; },

      onProgress: function (fn) { listeners.progress.push(fn); },
      onSolve: function (fn) { listeners.solve.push(fn); }
    };
  }

  global.Challenge = { create: create, scatterPlan: scatterPlan };
})(window);
