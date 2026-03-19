// ==UserScript==
// @name         ChatGPT - Pegar contenido desde Amazon (ProseMirror compatible)
// @namespace    https://saquitodelasalud.com
// @version      1.2
// @description  Decodifica #from=amazon&payload=... y lo inserta en el editor ProseMirror de ChatGPT automáticamente.
// @match        https://chatgpt.com/c/*
// @match        https://chat.openai.com/c/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // —— utils —— //
  const toast = (msg) => {
    const el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = `
      position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(0,0,0,.85); color: #fff; padding: 8px 12px; border-radius: 8px;
      font: 600 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; z-index: 999999; opacity: 0;
      transition: opacity .2s ease;
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 180); }, 1600);
  };

  const parseHash = () => {
    const h = (location.hash || '').replace(/^#/, '');
    const p = new URLSearchParams(h);
    return { from: p.get('from'), payload: p.get('payload') };
  };

  const b64decodeUTF8 = (b64) => {
    // acepta tanto base64 puro como url-encoded
    try { return decodeURIComponent(escape(atob(b64))); } catch (_e) {}
    try { return atob(decodeURIComponent(b64)); } catch (_e) {}
    try { return decodeURIComponent(b64); } catch (_e) {}
    return null;
  };

  function waitForEditor(timeoutMs = 20000) {
    return new Promise((res, rej) => {
      const pick = () =>
        document.querySelector('#prompt-textarea.ProseMirror[contenteditable="true"]') ||
        document.querySelector('div.ProseMirror[contenteditable="true"]#prompt-textarea') ||
        document.querySelector('div.ProseMirror[contenteditable="true"]');

      const found = pick();
      if (found) return res(found);

      const t0 = Date.now();
      const obs = new MutationObserver(() => {
        const el = pick();
        if (el) { obs.disconnect(); res(el); }
        else if (Date.now() - t0 > timeoutMs) { obs.disconnect(); rej(new Error('Timeout editor')); }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // por si el observer no pilla el primer render
      const iv = setInterval(() => {
        const el = pick();
        if (el) { clearInterval(iv); obs.disconnect?.(); res(el); }
        else if (Date.now() - t0 > timeoutMs) { clearInterval(iv); obs.disconnect?.(); rej(new Error('Timeout editor')); }
      }, 250);
    });
  }

  // Inserción robusta para ProseMirror
  function insertIntoProseMirror(viewEl, text) {
    if (!viewEl || !text) return false;

    // 1) focus + selección al final
    viewEl.focus();
    try {
      const range = document.createRange();
      range.selectNodeContents(viewEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    } catch {}

    // 2) intenta beforeinput con insertText
    try {
      const ev = new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true
      });
      const ok = viewEl.dispatchEvent(ev);
      // algunos setups insertan ya el texto en beforeinput
      if (!ok) {
        // si algún handler canceló, probamos igualmente el siguiente paso
      }
    } catch {}

    // 3) execCommand fallback (aún soportado por ProseMirror en la mayoría de navegadores)
    try {
      const prev = viewEl.textContent || '';
      document.execCommand('insertText', false, text);
      const now = viewEl.textContent || '';
      if (now && now !== prev) {
        viewEl.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    } catch {}

    // 4) último recurso: insertar nodo de texto manual + eventos
    try {
      const tn = document.createTextNode(text);
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        r.insertNode(tn);
        // mover cursor al final del nodo insertado
        r.setStartAfter(tn);
        r.setEndAfter(tn);
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        viewEl.appendChild(tn);
      }
      viewEl.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {}

    return false;
  }

  async function main() {
    const { from, payload } = parseHash();
    if (from !== 'amazon' || !payload) return;

    const text = b64decodeUTF8(payload);
    if (!text) return;

    try {
      const editor = await waitForEditor(20000);
      const ok = insertIntoProseMirror(editor, text);
      if (ok) {
        toast('Conversación pegada desde Amazon');
        // limpiamos hash para no repetir al refrescar
        history.replaceState(null, '', location.pathname + location.search);
      } else {
        toast('No se pudo pegar automáticamente. Pega (Ctrl+V).');
      }
    } catch {
      toast('Editor no disponible. Pega (Ctrl+V).');
    }
  }

  // pequeño delay inicial por si la vista tarda en hidratar
  setTimeout(main, 1200);
})();
