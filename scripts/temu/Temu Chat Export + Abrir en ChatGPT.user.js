// ==UserScript==
// @name         Temu Chat Export + Abrir en ChatGPT
// @namespace    http://tampermonkey.net/
// @version      0.2.0
// @description  Abre el primer chat por defecto, copia/abre ChatGPT con la conversación actual
// @author       tú
// @match        https://seller-eu.temu.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @grant        GM_notification
// ==/UserScript==

(function() {
  'use strict';

  // ======= Config =======
  const CHATGPT_TARGET_URL = 'https://chatgpt.com/c/68a41be1-08e4-8329-8a6e-ab56919b56cd';

  // ---------- Estilos ----------
  GM_addStyle(`
    #tm-copy-chat-btn, #tm-open-chatgpt-btn {
      position: fixed; left: 16px; z-index: 999999;
      padding: 10px 14px; border-radius: 10px; border: 0; color: #fff;
      font-weight: 600; box-shadow: 0 6px 16px rgba(0,0,0,.2); cursor: pointer;
    }
    #tm-copy-chat-btn { bottom: 16px; background: #ff6200; }
    #tm-open-chatgpt-btn { bottom: 62px; background: #10a37f; }
    #tm-copy-chat-btn[disabled], #tm-open-chatgpt-btn[disabled]{ opacity:.5; cursor:not-allowed; }
    .tm-toast {
      position: fixed; left: 50%; bottom: 110px; transform: translateX(-50%);
      background: rgba(0,0,0,.85); color: #fff; padding: 10px 14px; border-radius: 8px;
      z-index: 999999; font-size: 13px; max-width: 80vw; text-align: center;
    }
  `);

  // ---------- Utils ----------
  const qs  = (sel, root=document)=>root.querySelector(sel);
  const qsa = (sel, root=document)=>Array.from(root.querySelectorAll(sel));
  const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));

  function toast(msg, ms=2200){
    const t = document.createElement('div');
    t.className = 'tm-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(()=>{ t.remove(); }, ms);
  }

  function gmCopy(text){
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
        return Promise.resolve();
      }
    } catch(e){}
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function chunkString(str, n=1200) {
    const out=[]; for (let i=0;i<str.length;i+=n) out.push(str.slice(i,i+n)); return out;
  }

  function openChatGPTWithMessage(fullText){
    const chunks = chunkString(fullText, 1200);
    let params = new URLSearchParams();
    params.set('apc', String(chunks.length));
    chunks.forEach((c,i)=>params.set(`ap${i+1}`, c));
    let urlWithHash = CHATGPT_TARGET_URL + '#' + params.toString();

    // Si la URL se hace enorme, usa portapapeles
    if (urlWithHash.length > 8000) {
      try {
        if (typeof GM_setClipboard === 'function') GM_setClipboard(fullText, 'text');
        urlWithHash = CHATGPT_TARGET_URL + '#apc=0&mode=clipboard';
      } catch(e){
        // Fallback: primeros 5 trozos
        const first = chunks.slice(0,5);
        params = new URLSearchParams();
        params.set('apc', String(first.length));
        first.forEach((c,i)=>params.set(`ap${i+1}`, c));
        urlWithHash = CHATGPT_TARGET_URL + '#' + params.toString();
      }
    }

    window.open(urlWithHash, '_blank', 'noopener,noreferrer');
    if (typeof GM_notification === 'function') {
      GM_notification({ text: 'Abrí ChatGPT y mandé el texto. Revisa la caja y dale a Enviar.', title: 'Temu → ChatGPT', timeout: 2500 });
    } else {
      toast('Abrí ChatGPT y mandé el texto.');
    }
  }

  // ---------- Lógica Temu ----------
  function openFirstChatIfNoneSelected() {
    const panel = qs('#mms-chat-msg-resize-area');
    const hasMessages = panel && qs('.msg-item', panel);
    if (hasMessages) return;
    const firstClickable = qs('div[data-index] ._3OURwMjG');
    if (firstClickable) firstClickable.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

      setTimeout(() => { obs.disconnect(); reject(new Error('Timeout esperando mensajes')); }, timeoutMs);
    });
  }

  function extractConversation() {
    const panel = qs('#mms-chat-msg-resize-area');
    if (!panel) return 'No se encontró el panel de chat.';

    const header = [
      '=== Chat Temu (vendedor) ===',
      'Pedido: (s/d)',
      'Fecha exportación: ' + new Date().toLocaleString()
    ].join('\n');

    const items = qsa('.msg-item', panel);

    const lines = items.map(item => {
      const name =
        qs('._2PtrJ_c7 .jPzlbNSE', item)?.textContent?.trim() ||
        qs('._2Q3AbD-o ._1RJ8Mlhs', item)?.textContent?.trim() || '';
      const time =
        qs('._2PtrJ_c7 ._31BHZhsc', item)?.textContent?.trim() ||
        qs('._2Q3AbD-o ._2GZo3j-F', item)?.textContent?.trim() || '';
      let text =
        qs('._2STuiKsl', item)?.textContent?.trim() ||
        qs('.Gtm4E-I2', item)?.textContent?.trim() || '';

      if (!text) {
        const center = qs('.center-msg_text, .mall-privacy-policy-card', item);
        if (center) text = center.textContent.trim();
      }

      if (!text && qs('.order-with-count-from-consumer', item)) {
        const id = qs('[title^="PO-"]', item)?.getAttribute('title') ||
                   qs('[title^="PO-"]', item)?.textContent?.trim() || 'Pedido';
        const status = qs('._1GTFCB6F', item)?.textContent?.trim() || '';
        const price = qs('._2Pqw9l_0', item)?.textContent?.trim() || '';
        text = `[${id}] ${status} ${price}`.trim();
      }

      if (!text) text = (item.innerText || '').trim();

      const left = [time, name].filter(Boolean).join(' | ');
      return (left ? left + ': ' : '') + text;
    });

    return [header, ...lines].join('\n');
  }

  async function copyCurrentChat() {
    try {
      openFirstChatIfNoneSelected();

      const sc = qs('#mms-chat-msg-resize-area');
      if (sc) { sc.scrollTop = 0; sc.scrollTop = sc.scrollHeight; }

      await waitForMessages(8000);
      const txt = extractConversation();
      await gmCopy(txt);
      toast('✅ Conversación copiada al portapapeles');
    } catch (e) {
      console.error(e);
      toast('⚠️ No se pudo copiar: ' + (e?.message || e));
    }
  }

  async function openChatGPTFlow() {
    try {
      openFirstChatIfNoneSelected();
      await waitForMessages(8000);
      const txt = extractConversation();
      openChatGPTWithMessage(txt);
    } catch (e) {
      console.error(e);
      toast('⚠️ No se pudo abrir ChatGPT: ' + (e?.message || e));
    }
  }

  // ---------- UI: botones ----------
  function ensureButtons() {
    if (!qs('#tm-open-chatgpt-btn')) {
      const btn2 = document.createElement('button');
      btn2.id = 'tm-open-chatgpt-btn';
      btn2.type = 'button';
      btn2.textContent = 'Abrir en ChatGPT';
      btn2.addEventListener('click', openChatGPTFlow);
      document.body.appendChild(btn2);
    }
    if (!qs('#tm-copy-chat-btn')) {
      const btn = document.createElement('button');
      btn.id = 'tm-copy-chat-btn';
      btn.type = 'button';
      btn.textContent = 'Copiar chat';
      btn.addEventListener('click', copyCurrentChat);
      document.body.appendChild(btn);
    }
  }

  // Delegación para habilitar botones tras seleccionar un chat
  document.addEventListener('click', (e) => {
    const item = e.target.closest('div[data-index] ._3OURwMjG');
    if (item) {
      setTimeout(() => {
        const b1 = qs('#tm-copy-chat-btn'); if (b1) b1.disabled = false;
        const b2 = qs('#tm-open-chatgpt-btn'); if (b2) b2.disabled = false;
      }, 300);
    }
  }, true);

  // Boot
  const boot = () => {
    ensureButtons();
    setTimeout(openFirstChatIfNoneSelected, 600);
  };
  if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
  else window.addEventListener('DOMContentLoaded', boot);

  const bodyObs = new MutationObserver(() => ensureButtons());
  bodyObs.observe(document.documentElement || document.body, { childList: true, subtree: true });

})();
