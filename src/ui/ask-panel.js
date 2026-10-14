/* Visitor-facing character Q&A uses the same-origin backend.
 * Conversation stays in component memory; credentials and connection settings belong on the server.
 * Request generations guard cancellation, character changes, and late responses.
 */
(function (global) {
  'use strict';
  var ZQ = global.ZQ = global.ZQ || {};
  var TIMEOUT_MS = 45000;
  ZQ.AskPanel = {
    name: 'AskPanel', mixins: [ZQ.i18nMixin],
    props: { char: { type: String, required: true }, entryVisible: { type: Boolean, default: true } },
    emits: ['open', 'pick', 'go', 'source'],
    template: [
      "<div class=\"zc-ask-entry\" :class=\"{ 'is-contextual': !entryVisible }\">",
      " <template v-if=\"entryVisible\"><button class=\"zc-btn\" @click=\"open\">{{ tr('ask_entry') }}</button><span>{{ tr('ask_hint') }}</span></template>",
      " <dialog ref=\"dialog\" class=\"zc-help-dialog zc-ask-dialog\" aria-labelledby=\"zc-ask-title\" @cancel=\"abort\" @close=\"onDialogClose\">",
      "  <header><div><h2 id=\"zc-ask-title\">与「{{ char }}」聊一聊</h2><p class=\"zc-note\">从含义到构件，从一个字到一组字</p></div><button class=\"zc-btn\" autofocus @click=\"close\">关闭</button></header>",
      "  <p class=\"zc-ask-boundary\">AI 回答仅供参考，请结合资料核对。</p>",
      "  <div v-if=\"!ready\" class=\"zc-ask-connection zc-ask-locked\" role=\"status\">",
      "   <span>{{ serverState === 'checking' ? '正在准备问答…' : '问答暂时无法使用，可以先查看资料卡。' }}</span>",
      "   <button v-if=\"serverState !== 'checking'\" class=\"zc-text-btn\" @click=\"checkServer\">重试</button>",
      "  </div>",
      "  <template v-if=\"ready\">",
      "   <div class=\"zc-ask-question-heading\"><h3>{{ turns.length ? '继续追问' : '从一个问题开始' }}</h3><button v-if=\"turns.length\" class=\"zc-text-btn\" @click=\"newConversation\">新对话</button></div>",
      "   <div class=\"zc-controls zc-ask-presets\"><button v-for=\"q in presets\" :key=\"q\" class=\"zc-btn\" :disabled=\"busy\" @click=\"ask(q)\">{{ q }}</button></div>",
      "   <div class=\"zc-ask-transcript\" v-if=\"turns.length\">",
      "    <div v-for=\"(turn, i) in turns\" :key=\"i\" class=\"zc-ask-turn\">",
      "     <p class=\"zc-ask-user\"><span>你的问题</span>{{ turn.question }}</p>",
      "     <article class=\"zc-ask-answer\"><h3>AI 回答</h3><p>{{ turn.answer }}</p>",
      "      <p v-if=\"turn.truncated\" class=\"zc-note\">回答达到长度限制，可以继续追问。</p>",
      "      <div v-if=\"turn.sources.length\" class=\"zc-ask-sources\"><h4>参考资料</h4>",
      "       <details v-for=\"source in turn.sources\" :key=\"source.id\"><summary>[{{ source.id }}] {{ source.title }}<span>{{ source.reason }}</span></summary>",
      "        <pre>{{ source.text }}</pre><button class=\"zc-text-btn\" @click=\"viewSource(source)\">{{ source.kind === 'corpus' ? '打开语料看板' : source.ch === char ? '查看字源展签' : '探索这个字' }}</button>",
      "       </details>",
      "      </div>",
      "     </article>",
      "    </div>",
      "   </div>",
      "   <form class=\"zc-ask-form\" @submit.prevent=\"ask()\">",
      "    <label class=\"zc-ask-input\">自己问 <input ref=\"question\" v-model=\"question\" maxlength=\"300\" :disabled=\"busy\" :placeholder=\"askPlaceholder\"></label>",
      "    <div class=\"zc-controls\"><button class=\"zc-btn is-primary\" type=\"submit\" :disabled=\"busy || !question.trim()\">{{ busy ? '正在整理回答…' : turns.length ? '追问' : '提问' }}</button>",
      "     <button v-if=\"busy\" type=\"button\" class=\"zc-btn\" @click=\"abort\">停止回答</button>",
      "     <span class=\"zc-note\">{{ question.length }}/300</span>",
      "    </div>",
      "   </form>",
      "  </template>",
      "  <p v-if=\"message\" class=\"zc-ask-message\" :class=\"{ 'is-bad': error }\" :role=\"error ? 'alert' : 'status'\">{{ message }}</p>",
      "  <details class=\"zc-ask-card\"><summary>「{{ char }}」的资料卡</summary><pre class=\"zc-ask-cardtext\">{{ card }}</pre></details>",
      " </dialog>",
      "</div>"
    ].join('\n'),
    data: function () {
      return { serverState: 'idle', question: '', answer: '', turns: [], message: '', error: false,
        busy: false, controller: null, timer: null, requestId: 0,
        connectionController: null, connectionId: 0 };
    },
    beforeUnmount: function () { this.abort(); this.stopCheck(); },
    watch: {
      char: function () { this.reset(); }
    },
    computed: {
      ready: function () { return this.serverState === 'ready'; },
      card: function () { return ZQ.Ask.buildContext(this.char).text; },
      presets: function () { return ZQ.Ask.presetQuestions(this.char).slice(0, 5); },
      askPlaceholder: function () { return this.turns.length ? '可以接着问，也可以比较另一个字…' : '关于「' + this.char + '」，你想问什么？'; }
    },
    methods: {
      openWithQuestion: function (question) {
        this.reset(); this.question = String(question || '').trim().slice(0, 300); this.open();
      },
      open: function () {
        this.$emit('open');
        var dialog = this.$refs.dialog;
        if (dialog && !dialog.open) dialog.showModal();
        this.checkServer();
      },
      close: function () {
        this.abort(); this.stopCheck();
        var dialog = this.$refs.dialog;
        if (dialog && dialog.open) dialog.close();
      },
      onDialogClose: function () { this.abort(); this.stopCheck(); },
      stopCheck: function () {
        this.connectionId++;
        if (this.connectionController) this.connectionController.abort();
        this.connectionController = null;
        if (this.serverState === 'checking') this.serverState = 'idle';
      },
      checkServer: async function () {
        if (this.serverState === 'checking') return;
        if (!global.location || !/^https?:$/.test(global.location.protocol)) { this.serverState = 'unavailable'; return; }
        this.stopCheck();
        var id = this.connectionId, controller = new global.AbortController();
        this.connectionController = controller; this.serverState = 'checking';
        var timer = setTimeout(function () { controller.abort(); }, 6000);
        try {
          var response = await global.fetch('/api/health', { signal: controller.signal, credentials: 'same-origin', cache: 'no-store' });
          var status = response.ok ? await response.json() : null;
          if (id !== this.connectionId) return;
          this.serverState = status && status.available === true ? 'ready' : 'unavailable';
        } catch (error) { if (id === this.connectionId) this.serverState = 'unavailable'; }
        finally { clearTimeout(timer); if (id === this.connectionId) this.connectionController = null; }
      },
      abort: function () {
        this.requestId++;
        if (this.controller) this.controller.abort();
        this.controller = null; clearTimeout(this.timer); this.timer = null;
        if (this.busy) { this.busy = false; this.error = false; this.message = '已停止回答，可以重新提问。'; }
      },
      reset: function () { this.abort(); this.answer = ''; this.turns = []; this.message = ''; this.error = false; this.question = ''; },
      newConversation: function () { this.reset(); if (this.$refs.question) this.$refs.question.focus(); },
      viewSource: function (source) {
        this.close();
        if (source.kind === 'corpus') { this.$emit('go', 'stats'); return; }
        if (source.ch === this.char) { this.$emit('source'); return; }
        this.$emit('pick', source.ch);
        this.$emit('go', (global.__CHARS__ || {})[source.ch] ? 'origin' : 'graph');
      },
      ask: async function (preset) {
        if (this.busy || !this.ready) return;
        var text = String(typeof preset === 'string' ? preset : this.question || '').trim().slice(0, 300);
        if (!text) return;
        var history = ZQ.Ask.cleanHistory(this.turns.reduce(function (all, turn) {
          return all.concat([{ role: 'user', content: turn.question }, { role: 'assistant', content: turn.answer }]);
        }, []));
        var id = ++this.requestId, controller = new global.AbortController(), self = this;
        this.controller = controller; this.busy = true; this.error = false; this.message = '正在根据资料整理回答…';
        this.timer = setTimeout(function () {
          if (id !== self.requestId) return;
          self.abort(); self.error = true; self.message = '等待回答超时，请稍后重试。';
        }, TIMEOUT_MS);
        try {
          var response = await global.fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ char: this.char, question: text, history: history }), signal: controller.signal, credentials: 'same-origin' });
          var raw = await response.text(), data;
          if (id !== this.requestId) return;
          try { data = JSON.parse(raw); } catch (error) { throw new Error('暂时无法获取回答，请稍后重试。'); }
          if (!response.ok) {
            var code = data.error && data.error.code;
            var guidance = code === 'DAILY_LIMIT' ? '今日问答次数已用完，可以继续探索汉字和查看资料。' :
              code === 'HISTORY' || code === 'TOO_LARGE' ? '对话内容过长，请开始新对话后重试。' :
              code === 'QUESTION' ? '请输入 1 至 300 字的问题。' :
              response.status === 429 ? '提问太频繁或问答繁忙，请稍后重试。' : '暂时无法获取回答，请稍后重试。';
            throw new Error(guidance);
          }
          var content = data.answer;
          if (typeof content !== 'string' || !content.trim()) throw new Error('暂时没有收到回答，请重试。');
          this.answer = ZQ.Ask.redact(content.trim().slice(0, 8000));
          this.turns.push({ question: text, answer: this.answer,
            sources: Array.isArray(data.sources) ? data.sources : [],
            truncated: !!data.truncated });
          if (this.turns.length > 8) this.turns.shift();
          this.question = ''; this.message = '';
        } catch (error) {
          if (id !== this.requestId) return;
          this.error = true;
          this.message = error && error.name === 'TypeError' ? '暂时无法连接，请检查网络后重试。' : ZQ.Ask.redact(error);
        } finally {
          if (id === this.requestId) { clearTimeout(this.timer); this.timer = null; this.controller = null; this.busy = false; }
        }
      }
    }
  };
})(window);
