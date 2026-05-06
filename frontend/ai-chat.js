/**
 * ai-chat.js — BCL Analytics Interface
 *
 * Floating chat panel available on every page.
 * CEO/managers ask natural-language questions, get instant AI analysis.
 * Built on Claude claude-sonnet-4-5 with full Citia Group business context.
 */

(function () {
  'use strict';

  // ── Session ID for conversation continuity ──────────────────────────────────
  const SESSION_ID = 'cfo_' + (sessionStorage.getItem('mis_user') || 'anon');

  // ── Inject styles ────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #ai-fab {
      position: fixed; bottom: 28px; right: 28px; z-index: 9999;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #1F4E79, #2E75B6);
      color: #fff; border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(31,78,121,.5);
      font-size: 24px; display: flex; align-items: center; justify-content: center;
      transition: transform .2s, box-shadow .2s;
    }
    #ai-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(31,78,121,.7); }
    #ai-fab .badge {
      position: absolute; top: -4px; right: -4px;
      background: #C00000; color: #fff; border-radius: 50%;
      width: 18px; height: 18px; font-size: 10px; display: none;
      align-items: center; justify-content: center; font-weight: 700;
    }

    #ai-panel {
      position: fixed; bottom: 96px; right: 28px; z-index: 9998;
      width: 400px; max-height: 600px;
      background: var(--bg-elev, #1a1d27); border: 1px solid var(--border, #2a2d3e);
      border-radius: 16px; display: flex; flex-direction: column;
      box-shadow: 0 12px 48px rgba(0,0,0,.5);
      transform: scale(0.95) translateY(10px); opacity: 0;
      transition: transform .25s cubic-bezier(.34,1.56,.64,1), opacity .2s;
      pointer-events: none;
    }
    #ai-panel.open {
      transform: scale(1) translateY(0); opacity: 1; pointer-events: all;
    }

    #ai-header {
      background: linear-gradient(135deg, #1F4E79, #2E75B6);
      color: #fff; padding: 14px 18px; border-radius: 16px 16px 0 0;
      display: flex; align-items: center; justify-content: space-between;
    }
    #ai-header .title { font-weight: 700; font-size: 15px; }
    #ai-header .sub { font-size: 11px; opacity: .8; margin-top: 2px; }
    #ai-header button {
      background: rgba(255,255,255,.15); border: none; color: #fff;
      border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px;
    }
    #ai-header button:hover { background: rgba(255,255,255,.25); }

    #ai-quick-btns {
      display: flex; gap: 6px; padding: 10px 12px; flex-wrap: wrap;
      border-bottom: 1px solid var(--border, #2a2d3e);
    }
    .ai-quick-btn {
      background: rgba(46,117,182,.15); border: 1px solid rgba(46,117,182,.3);
      color: #60a5fa; border-radius: 20px; padding: 4px 12px;
      cursor: pointer; font-size: 11px; white-space: nowrap;
      transition: background .15s;
    }
    .ai-quick-btn:hover { background: rgba(46,117,182,.3); }

    #ai-messages {
      flex: 1; overflow-y: auto; padding: 14px 16px;
      display: flex; flex-direction: column; gap: 12px;
      min-height: 200px; max-height: 360px;
    }
    .ai-msg { max-width: 90%; line-height: 1.5; font-size: 13px; }
    .ai-msg.user {
      align-self: flex-end;
      background: rgba(46,117,182,.2); border: 1px solid rgba(46,117,182,.3);
      color: var(--t-primary, #e2e8f0);
      padding: 8px 14px; border-radius: 14px 14px 4px 14px;
    }
    .ai-msg.assistant {
      align-self: flex-start;
      background: var(--bg-card, #13151f); border: 1px solid var(--border, #2a2d3e);
      color: var(--t-primary, #e2e8f0);
      padding: 10px 14px; border-radius: 14px 14px 14px 4px;
      white-space: pre-wrap;
    }
    .ai-msg.thinking {
      align-self: flex-start; color: #60a5fa; font-style: italic; font-size: 12px;
    }
    .ai-msg strong { color: #60a5fa; }
    .ai-msg code {
      background: rgba(255,255,255,.08); padding: 1px 5px;
      border-radius: 4px; font-family: monospace; font-size: 12px;
    }

    #ai-input-row {
      padding: 10px 12px; border-top: 1px solid var(--border, #2a2d3e);
      display: flex; gap: 8px; align-items: flex-end;
    }
    #ai-input {
      flex: 1; background: var(--bg-input, #0f111a);
      border: 1px solid var(--border, #2a2d3e); color: var(--t-primary, #e2e8f0);
      border-radius: 10px; padding: 8px 12px; font-size: 13px;
      resize: none; outline: none; font-family: inherit; max-height: 100px;
      min-height: 36px; line-height: 1.4;
    }
    #ai-input:focus { border-color: #2E75B6; }
    #ai-send {
      background: linear-gradient(135deg, #1F4E79, #2E75B6);
      color: #fff; border: none; border-radius: 10px;
      padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 600;
      height: 36px; white-space: nowrap;
    }
    #ai-send:disabled { opacity: .5; cursor: not-allowed; }
    #ai-send:hover:not(:disabled) { filter: brightness(1.1); }

    #ai-footer {
      padding: 6px 14px; font-size: 10px; color: var(--t-muted, #6b7280);
      text-align: center; border-top: 1px solid var(--border, #2a2d3e);
    }
  `;
  document.head.appendChild(style);

  // ── Build HTML ───────────────────────────────────────────────────────────────
  const fab = document.createElement('button');
  fab.id = 'ai-fab';
  fab.title = 'BCL Analytics';
  fab.innerHTML = `🤖<span class="badge" id="ai-badge"></span>`;

  const panel = document.createElement('div');
  panel.id = 'ai-panel';
  panel.innerHTML = `
    <div id="ai-header">
      <div>
        <div class="title">📊 BCL Analytics — Citia Group</div>
        <div class="sub">BCL Intelligence Engine · March 2026 data</div>
      </div>
      <div style="display:flex;gap:6px">
        <button onclick="window._aiCFO.generateReport()">📄 Report</button>
        <button onclick="window._aiCFO.clearHistory()">🗑</button>
      </div>
    </div>
    <div id="ai-quick-btns">
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('What is our total net revenue this month?')">Net revenue</span>
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('Which territory has the highest leakage rate?')">Leakage risk</span>
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('Show me the top 5 SKUs by gross profit')">Top SKUs</span>
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('Which gateway has the highest MDR fee rate?')">Fee rates</span>
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('Generate a checklist status report for Leon based on available data')">Checklist status</span>
      <span class="ai-quick-btn" onclick="window._aiCFO.ask('What are the top 3 anomalies I should investigate this month?')">Anomalies</span>
    </div>
    <div id="ai-messages">
      <div class="ai-msg assistant">👋 Hello! I'm BCL Analytics — your intelligent financial reporting engine. I have full access to March 2026 data across all 14 territories and 8 Citia Group entities.

Ask me anything — P&amp;L analysis, gateway reconciliation status, SKU performance, cash positions, anomalies, or generate the management accounts. I can also tell you which bookkeeper checklist items are auto-completed based on the data.

What would you like to know?</div>
    </div>
    <div id="ai-input-row">
      <textarea id="ai-input" placeholder="Ask anything... e.g. 'Why is Europe's fee rate higher than Korea?'" rows="1"></textarea>
      <button id="ai-send">Send</button>
    </div>
    <div id="ai-footer">BCL Analytics · Citia Group · March 2026 · Confidential</div>
  `;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  // ── Logic ────────────────────────────────────────────────────────────────────
  let isOpen = false;
  let isThinking = false;

  function togglePanel() {
    isOpen = !isOpen;
    panel.classList.toggle('open', isOpen);
    fab.textContent = isOpen ? '✕' : '🤖';
    if (isOpen) {
      document.getElementById('ai-badge').style.display = 'none';
      document.getElementById('ai-input').focus();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    const msgs = document.getElementById('ai-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function addMessage(role, text) {
    const msgs = document.getElementById('ai-messages');
    const div = document.createElement('div');
    div.className = `ai-msg ${role}`;
    // Simple markdown: **bold**, `code`
    div.innerHTML = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/✅/g, '<span style="color:#70AD47">✅</span>')
      .replace(/⚠️/g, '<span style="color:#FFC000">⚠️</span>')
      .replace(/🔴/g, '<span style="color:#C00000">🔴</span>')
      .replace(/🟡/g, '<span style="color:#FFC000">🟡</span>');
    msgs.appendChild(div);
    scrollToBottom();
    return div;
  }

  async function sendMessage(text) {
    if (!text?.trim() || isThinking) return;
    isThinking = true;

    addMessage('user', text);
    const thinking = addMessage('thinking', '⏳ Analyzing Citia Group data...');
    document.getElementById('ai-send').disabled = true;
    document.getElementById('ai-input').value = '';
    document.getElementById('ai-input').style.height = 'auto';

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: SESSION_ID }),
      });
      const data = await res.json();
      thinking.remove();
      if (data.reply) {
        addMessage('assistant', data.reply);
        if (!isOpen) {
          document.getElementById('ai-badge').style.display = 'flex';
          document.getElementById('ai-badge').textContent = '1';
        }
      } else {
        addMessage('assistant', '⚠️ Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      thinking.remove();
      addMessage('assistant', '⚠️ Connection error. Is the server running?');
    } finally {
      isThinking = false;
      document.getElementById('ai-send').disabled = false;
      document.getElementById('ai-input').focus();
    }
  }

  async function generateReport() {
    isOpen = true;
    panel.classList.add('open');
    addMessage('user', '📄 Generate Monthly Management Report for March 2026');
    const thinking = addMessage('thinking', '⏳ Generating management accounts...');
    document.getElementById('ai-send').disabled = true;

    try {
      const res = await fetch('/api/ai/report', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType: 'monthly_management' }),
      });
      const data = await res.json();
      thinking.remove();
      if (data.report) addMessage('assistant', data.report);
    } catch (err) {
      thinking.remove();
      addMessage('assistant', '⚠️ Report generation failed');
    } finally {
      document.getElementById('ai-send').disabled = false;
    }
  }

  function clearHistory() {
    fetch('/api/ai/chat', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'clear', sessionId: SESSION_ID, clearHistory: true }),
    }).catch(() => {});
    const msgs = document.getElementById('ai-messages');
    msgs.innerHTML = '<div class="ai-msg assistant">🗑 Conversation cleared. Ask BCL Analytics anything about Citia Group\'s financials.</div>';
  }

  // ── Event listeners ──────────────────────────────────────────────────────────
  fab.addEventListener('click', togglePanel);

  document.getElementById('ai-send').addEventListener('click', () => {
    sendMessage(document.getElementById('ai-input').value);
  });

  document.getElementById('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e.target.value);
    }
    // Auto-resize
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  });

  // ── Expose API globally ──────────────────────────────────────────────────────
  window._aiCFO = {
    ask: (q) => {
      if (!isOpen) togglePanel();
      document.getElementById('ai-input').value = q;
      sendMessage(q);
    },
    generateReport,
    clearHistory,
    toggle: togglePanel,
  };

  // Auto-open with a greeting flash on first load
  if (!sessionStorage.getItem('ai_cfo_seen')) {
    sessionStorage.setItem('ai_cfo_seen', '1');
    setTimeout(() => {
      document.getElementById('ai-badge').style.display = 'flex';
      document.getElementById('ai-badge').textContent = '!';
    }, 3000);
  }

})();
