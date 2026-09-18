/* 字启千年 — 键盘快捷键（Vue 层共用）
 *
 * 旧页面（src/app.js）本来有一整套快捷键：空格 / ← → / R。2026-09-16 它退役时
 * 新页面是纯鼠标的，这套东西跟着没了 —— 这是个**功能缺口**，不是取舍，
 * 演示时讲师习惯性地按空格却不响应，很难看。这里补回来，并顺手覆盖旧页面
 * 没有的 02③ 和 04。
 *
 * 为什么可以「每个模块各装各的监听器」而不会打架：
 *   app-shell.js 用 v-if / v-else-if 串挂模块，**同一时刻只有一个模块组件活着**，
 *   所以两个组件同时监听 keydown 这件事在结构上不可能发生。
 *   （这和「切模块要卸干净」是两回事 —— 那条由 beforeUnmount 里的 unbind 保证。）
 *
 * 三条「不管」的规矩，缺一条都会出毛病：
 *   ① 带 ctrl / meta / alt 的不碰 —— 那是浏览器和系统的地盘（Ctrl+R 刷新、
 *      Cmd+← 回退），抢过来会把用户的浏览器搞坏
 *   ② e.repeat 不碰 —— 按住不放只算一次。不然按住 R 会连着触发几十次重开
 *   ③ 焦点在**输入类**控件上时一个键都不碰；焦点在按钮 / 链接上时，
 *      只把 `空格` 和 `回车` 让出去 —— 见下面 nativeOwns() 的长注释，这条最讲究
 *
 * 用法（组件里）：
 *     mounted:        this.unbind = ZQ.bindKeys({ space: 'toggle', r: 'reset' }, this);
 *     beforeUnmount:  if (this.unbind) this.unbind();
 *
 *   值是**方法名字符串**时按方法调；是函数时，this 绑到 ctx，收到事件对象当参数。
 */
(function (global) {
  'use strict';

  var ZQ = global.ZQ = global.ZQ || {};

  /* e.key → 我们内部的名字。只收「有约定俗成名」的几个；
   * 数字和字母走下面 toLowerCase() 的兜底，不在这里列。 */
  var NAMES = {
    ' ': 'space',
    'Spacebar': 'space',        // 老 Firefox / 老 Edge
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'Enter': 'enter',
    'Escape': 'escape',
    'Esc': 'escape'
  };

  function nameOf(e) {
    if (NAMES[e.key]) return NAMES[e.key];
    // 字母键：e.key 是 'r' 或 'R'（按住 shift 时）。'1' 这种数字键原样返回。
    return String(e.key || '').toLowerCase();
  }

  /**
   * 这个元素是不是「这个键本来就归它管」，轮不到我们插手。
   *
   * 两类要分开看，因为**分寸完全不同**：
   *
   * ① 输入类（input / textarea / select / contenteditable）—— 一个键都别碰。
   *    里面打什么字都是用户的事；滑块也一样，焦点在时间轴上时 ← → 应该是
   *    精细拖动而不是跳期，跟原生控件的行为一致。
   *
   * ② 按钮 / 链接 —— **只让 `空格` 和 `回车`**，别的键照旧接管。
   *
   *    为什么这两个键要让：浏览器用它们「激活」焦点控件，而焦点**会留在**
   *    刚点过的按钮上（Chrome 的行为）。所以鼠标点过「◀ 上一期」之后，
   *    空格在浏览器眼里就是「再点一次 ◀」。这时候如果我们抢过来去跑本模块
   *    给空格安排的活儿（03 里是播放/暂停），用户 Tab 到「重开」再按空格
   *    得到的就是别的东西 —— 焦点控件的动作必须优先，这是网页的契约。
   *
   *    ⚠️ 为什么**不**顺手防一个「一次触发两下」：那是另一回事，而且已经防住了。
   *      下面 onKey 里接了键就 `preventDefault()`（本来是为了不让空格滚屏），
   *      而**在 keydown 上 preventDefault 会一并掐掉按钮的激活**。实测过：
   *      同一个处理器不调 preventDefault 时，焦点按钮上按一次空格，按钮的
   *      动作和处理器各跑一次（两下，开关动作正好抵消，现象是「按空格没反应」）；
   *      调了就只跑一次。也就是说这条规矩管的是「**谁的动作说了算**」，
   *      不是「跑几下」—— 别把它记成后者（verify/test-keys.mjs ⑧ 两条都钉着）。
   *
   *    ⚠️ 但**只让这两个**。按钮不认 R 和 ← →，那些键它抢不走；
   *       早先写成「焦点在按钮上就全部撒手」，结果是：鼠标点过按钮之后焦点一直
   *       留在按钮上，于是 R / ← → **整个静默失效** —— 用户点一下「演进」，
   *       此后按 R 再无反应。这比上面那条更容易挨骂。两条界线都是实测出来的。
   */
  function nativeOwns(el, name) {
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
    if (/^(BUTTON|A)$/.test(el.tagName)) return name === 'space' || name === 'enter';
    return false;
  }

  /**
   * map: { 键名: '方法名' | function(e) }
   * ctx: 方法挂在谁身上
   * 返回解绑函数 —— 组件 beforeUnmount 必须调，否则旧模块的处理器会一直挂着，
   * 但因为同一时刻只有一个模块活着，那点泄漏不会立刻显形，只会等着某天两套
   * 逻辑同时响应才爆。这类账不能欠。
   */
  ZQ.bindKeys = function (map, ctx) {
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // ①
      if (e.repeat) return;                             // ②
      // 搜索等模态面板打开时，底层画布快捷键暂停；Escape 仍由浏览器关闭对话框。
      if (global.document && global.document.querySelector && global.document.querySelector('dialog[open]')) return;

      var name = nameOf(e);
      if (nativeOwns(e.target, name)) return;            // ③

      var fn = map[name];
      if (!fn) return;

      // 只在我们真的接了键的时候拦。否则页面滚动、Tab、F5 全被搞坏。
      // （空格尤其必须拦：不拦的话页面会往下滚一屏，演示时非常难看。）
      e.preventDefault();

      if (typeof fn === 'string') ctx[fn]();
      else fn.call(ctx, e);
    }

    global.addEventListener('keydown', onKey);
    return function () { global.removeEventListener('keydown', onKey); };
  };
})(window);
