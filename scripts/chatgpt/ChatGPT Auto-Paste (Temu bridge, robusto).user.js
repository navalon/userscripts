// ==UserScript==
// @name         ChatGPT Auto-Paste (Temu bridge, robusto)
// @namespace    chatgpt-autopaste
// @version      1.2.0
// @description  Reconstruye texto del hash (#apc, ap1..apN), lo pega en la caja de ChatGPT y opcionalmente envía.
// @match        https://chatgpt.com/c/*
// @match        https://chat.openai.com/c/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  'use strict';

  // ===== Config =====
  const AUTO_SEND = false; // pon true si quieres que además haga click en "Enviar"

  // Clave de sessionStorage para persistir el payload aunque el SPA reescriba la URL
  const SS_KEY = 'tm_autopaste_payload_v1';

  // ----- util -----
  function parsePayloadFromURL(u) {
    try {
      const url = new URL(u);
      // soporta tanto hash (#) como query (?)
      const rawHash = url.hash?.replace(/^#/, '') || '';
      const hashParams = new URLSearchParams(rawHash);
      const qParams = url.searchParams;

      // prioriza hash
      let apc = parseInt(hashParams.get('apc') || '0', 10);
      let mode = hashParams.get('mode') || 'hash';

      if (!apc) {
        apc = parseInt(qParams.get('apc') || '0', 10);
        mode = qParams.get('mode') || mode;
      }

      let text = '';
      if (apc > 0) {
        for (let i = 1; i <= apc; i++) {
          text += (hashParams.get(`ap${i}`) || qParams.get(`ap${i}`) || '');
        }
      }
      return { text, mode, apc };
    } catch (e) {
      return { text: '', mode: 'hash', apc: 0 };
    }
  }

  function savePayloadToSS(payload) {
    try { sessionStorage.setItem(SS_KEY, JSON.stringify(payload)); } catch {}
  }
  function readPayloadFromSS() {
    try {
      const v = sessionStorage.getItem(SS_KEY);
      if (!v) return null;
      const o = JSON.parse(v);
      if (o && typeof o.text === 'string') return o;
    } catch {}
    return null;
  }
  function clearPayloadSS() {
    try { sessionStorage.removeItem(SS_KEY); } catch {}
  }

  // Captura inicial (MUY temprano)
  const initial = parsePayloadFromURL(location.href);
  if (initial.text) {
    savePayloadToSS({ text: initial.text, ts: Date.now() });
  }

  // Si cambia el hash (navegación dentro del hilo)
  window.addEventListener('hashchange', () => {
    const p = parsePayloadFromURL(location.href);
    if (p.text) savePayloadToSS({ text: p.text, ts: Date.now() });
  });

  // ----- pega en la caja -----
  function visible(el) {
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && el.offsetParent !== null;
  }

  function findTextarea() {
    // Prueba varios selectores que ChatGPT usa según versión/idioma
    const candidates = [
      'textarea[placeholder*="Message"]',
      'textarea[placeholder*="Escribe"]',
      'textarea[placeholder]',
      'textarea[data-testid="chat-input"]',
      'form textarea'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (visible(el) && !el.disabled) return el;
    }
    // fallback raro: contenido editable (por si cambian textarea)
    const ce = document.querySelector('[contenteditable="true"][role="textbox"]');
    return visible(ce) ? ce : null;
  }

  function setText(el, text) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') {
      el.focus();
      el.value = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
      el.focus();
      return true;
    } else {
      // contenteditable fallback
      el.focus();
      // limpia y pega
      el.innerHTML = '';
      const rng = document.createRange();
      rng.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rng);
      document.execCommand('insertText', false, text);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
      return true;
    }
  }

  function clickSend() {
    // Botón de enviar (paper plane)
    const btn = document.querySelector('button[data-testid="send-button"], form button[type="submit"]');
    if (btn && !btn.disabled) {
      btn.click();
      return true;
    }
    // Fallback: simular Enter en la caja
    const ta = findTextarea();
    if (!ta) return false;
    const evOpts = { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13, which: 13 };
    ['keydown','keypress','keyup'].forEach(type => ta.dispatchEvent(new KeyboardEvent(type, evOpts)));
    return true;
  }

  async function tryPasteLoop() {
    // recupera payload (URL pudo ser reescrita)
    const payload = readPayloadFromSS();
    if (!payload || !payload.text) return;

    const deadline = Date.now() + 20000; // 20s
    while (Date.now() < deadline) {
      const ta = findTextarea();
      if (ta) {
        if (setText(ta, payload.text)) {
          if (AUTO_SEND) clickSend();
          // opcional: limpiar para no re-pegar si re-renderiza
          clearPayloadSS();
          return;
        }
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  // Ejecuta cuando el DOM cambie (SPA)
  const mo = new MutationObserver(() => { tryPasteLoop(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Primer intento directo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryPasteLoop);
  } else {
    tryPasteLoop();
  }
})();
