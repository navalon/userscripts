// ==UserScript==
// @name         Temu Chat → Abrir ChatGPT (dinámico)
// @namespace    https://github.com/navalon/userscripts
// @version      2.2.0
// @description  Copia la conversación del chat activo de Temu Seller y abre el chat
//               destino de ChatGPT configurado con chatgpt-router-manager.
// @match        https://seller-eu.temu.com/*
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/temu-open-chatgpt.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/temu-open-chatgpt.user.js
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Configuración ──
  const STORE_KEY = 'chatgpt_target_url';
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

  // ── URL destino (guardada localmente, se pide una vez) ──
  function getTargetURL() {
    return GM_getValue(STORE_KEY, '');
  }

  function askForTargetURL() {
    const url = prompt(
      '🎯 Pega aquí la URL del chat destino de ChatGPT.\n\n' +
      '(Ve a ChatGPT → pulsa "Usar este chat como destino" → se copia al portapapeles → pégala aquí con Ctrl+V)'
    );
    if (url && url.startsWith('https://chat')) {
      GM_setValue(STORE_KEY, url.split('#')[0]);
      return url.split('#')[0];
    }
    return '';
  }

  // Menú de Tampermonkey para reconfigurar
  GM_registerMenuCommand('🎯 Cambiar chat destino de ChatGPT', () => {
    const current = getTargetURL();
    const msg = current
      ? `URL actual: ${current}\n\nPega la nueva URL:`
      : 'Pega la URL del chat destino de ChatGPT:';
    const url = prompt(msg, current);
    if (url && url.startsWith('https://chat')) {
      GM_setValue(STORE_KEY, url.split('#')[0]);
      alert('✅ Chat destino actualizado.');
    }
  });

  // ── Estilos ──
  GM_addStyle(`
    #tm-temu-copy-btn, #tm-temu-chatgpt-btn {
      position: fixed; left: 16px; z-index: 999999;
      padding: 10px 14px; border-radius: 10px; border: 0; color: #fff;
      font-weight: 600; box-shadow: 0 6px 16px rgba(0,0,0,.2); cursor: pointer;
    }
    #tm-temu-copy-btn    { bottom: 16px; background: #ff6200; }
    #tm-temu-chatgpt-btn { bottom: 62px; background: #10a37f; }
    #tm-temu-copy-btn[disabled], #tm-temu-chatgpt-btn[disabled] {
      opacity: .5; cursor: not-allowed;
    }
    .tm-toast {
      position: fixed; left: 50%; bottom: 110px; transform: translateX(-50%);
      background: rgba(0,0,0,.85); color: #fff; padding: 10px 14px; border-radius: 8px;
      z-index: 999999; font-size: 13px; max-width: 80vw; text-align: center;
    }
  `);

  // ── Utils ──
  const qs  = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function toast(msg, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'tm-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  function gmCopy(text) {
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; } } catch {}
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); return; }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ── Lógica Temu ──
  function openFirstChatIfNoneSelected() {
    const panel = qs('#mms-chat-msg-resize-area');
    if (panel && qs('.msg-item', panel)) return;
    const first = qs('div[data-index] ._3OURwMjG');
    if (first) first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function waitForMessages(timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const container = qs('#mms-chat-msg-resize-area');
      if (!container) return reject(new Error('No encuentro el panel de mensajes'));
      if (qs('.msg-item', container)) return resolve();
      const obs = new MutationObserver(() => {
        if (qs('.msg-item', container)) { obs.disconnect(); resolve(); }
      });
      obs.observe(container, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout')); }, timeoutMs);
    });
  }

  function extractConversation() {
    const panel = qs('#mms-chat-msg-resize-area');
    if (!panel) return 'No se encontró el panel de chat.';
    const header = [
      '=== Chat Temu (vendedor) ===',
      'Fecha exportación: ' + new Date().toLocaleString()
    ].join('\n');
    const items = qsa('.msg-item', panel);
    const lines = items.map(item => {
      const name = qs('._2PtrJ_c7 .jPzlbNSE', item)?.textContent?.trim()
                || qs('._2Q3AbD-o ._1RJ8Mlhs', item)?.textContent?.trim() || '';
      const time = qs('._2PtrJ_c7 ._31BHZhsc', item)?.textContent?.trim()
                || qs('._2Q3AbD-o ._2GZo3j-F', item)?.textContent?.trim() || '';
      let text = qs('._2STuiKsl', item)?.textContent?.trim()
              || qs('.Gtm4E-I2', item)?.textContent?.trim() || '';
      if (!text) { const c = qs('.center-msg_text, .mall-privacy-policy-card', item); if (c) text = c.textContent.trim(); }
      if (!text && qs('.order-with-count-from-consumer', item)) {
        const id = qs('[title^="PO-"]', item)?.getAttribute('title') || 'Pedido';
        const st = qs('._1GTFCB6F', item)?.textContent?.trim() || '';
        const pr = qs('._2Pqw9l_0', item)?.textContent?.trim() || '';
        text = `[${id}] ${st} ${pr}`.trim();
      }
      if (!text) text = (item.innerText || '').trim();
      const left = [time, name].filter(Boolean).join(' | ');
      return (left ? left + ': ' : '') + text;
    });
    return [header, ...lines].join('\n');
  }

  // ── Acciones ──
  async function copyChat() {
    try {
      openFirstChatIfNoneSelected();
      const sc = qs('#mms-chat-msg-resize-area');
      if (sc) { sc.scrollTop = sc.scrollHeight; }
      await waitForMessages(8000);
      gmCopy(extractConversation());
      toast('✅ Conversación copiada');
    } catch (e) { toast('⚠️ ' + (e?.message || e)); }
  }

  async function openChatGPT() {
    let targetURL = getTargetURL();
    if (!targetURL) {
      targetURL = askForTargetURL();
      if (!targetURL) return;
    }
    try {
      openFirstChatIfNoneSelected();
      await waitForMessages(8000);
      const txt = extractConversation();
      gmCopy(txt);
      const payload = encodeURIComponent(b64(txt));
      let url = `${targetURL}#from=temu&payload=${payload}`;
      if (url.length > 8000) url = `${targetURL}#from=temu&mode=clipboard`;
      window.open(url, '_blank', 'noopener,noreferrer');
      toast('Abriendo ChatGPT…');
    } catch (e) { toast('⚠️ ' + (e?.message || e)); }
  }

  // ── UI ──
  function ensureButtons() {
    if (!qs('#tm-temu-chatgpt-btn')) {
      const btn2 = document.createElement('button');
      btn2.id = 'tm-temu-chatgpt-btn'; btn2.type = 'button';
      btn2.textContent = 'Abrir en ChatGPT';
      btn2.addEventListener('click', openChatGPT);
      document.body.appendChild(btn2);
    }
    if (!qs('#tm-temu-copy-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tm-temu-copy-btn'; btn.type = 'button';
      btn.textContent = 'Copiar chat';
      btn.addEventListener('click', copyChat);
      document.body.appendChild(btn);
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('div[data-index] ._3OURwMjG')) {
      setTimeout(() => {
        const b1 = qs('#tm-temu-copy-btn');    if (b1) b1.disabled = false;
        const b2 = qs('#tm-temu-chatgpt-btn'); if (b2) b2.disabled = false;
      }, 300);
    }
  }, true);

  // ── Boot ──
  const boot = () => { ensureButtons(); setTimeout(openFirstChatIfNoneSelected, 600); };
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('DOMContentLoaded', boot);

  const bodyObs = new MutationObserver(() => ensureButtons());
  bodyObs.observe(document.documentElement || document.body, { childList: true, subtree: true });
})();
