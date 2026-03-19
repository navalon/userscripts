// ==UserScript==
// @name         ChatGPT - Pegar contenido (WhatsApp / Amazon)
// @namespace    https://saquitodelasalud.com
// @version      1.3
// @description  Si la URL trae #from=whatsapp|amazon&payload=<b64>, lo decodifica y pega en el editor (ProseMirror).
// @match        https://chatgpt.com/c/*
// @match        https://chat.openai.com/c/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';
  const FIRST_DELAY = 1000;

  function getHashParam(name) {
    const h = location.hash || '';
    const m = h.match(new RegExp(`[?#&]${name}=([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
    }
  const b64decodeUTF8 = (s) => decodeURIComponent(escape(atob(s)));

  function proseMirrorEl() {
    // editor visible (ProseMirror)
    return document.querySelector('div.ProseMirror[contenteditable="true"]');
  }

  function insertTextInProseMirror(text) {
    const el = proseMirrorEl();
    if (!el) return false;
    el.focus();
    // Limpia placeholder
    try { document.execCommand('selectAll', false, null); document.getSelection().collapseToEnd(); } catch {}
    // Usa Clipboard API si existe para mayor fidelidad
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(() => {
        // simula pegar
        const pasteEvt = new ClipboardEvent('paste', {dataType: 'text/plain', data: text, bubbles: true});
        el.dispatchEvent(pasteEvt);
        // fallback: inserción directa
        if (!el.innerText || el.innerText.trim().length === 0) {
          el.innerHTML = text.replace(/\n/g, '<br>');
        }
        el.focus();
        return true;
      }).catch(() => {
        el.innerHTML = text.replace(/\n/g, '<br>');
        el.focus();
        return true;
      });
    } else {
      el.innerHTML = text.replace(/\n/g, '<br>');
      el.focus();
      return true;
    }
  }

  function run() {
    const from = getHashParam('from');
    const payload = getHashParam('payload');
    if (!from || !payload) return;

    let text = '';
    try { text = b64decodeUTF8(payload); } catch (e) { return; }

    insertTextInProseMirror(text);

    // Limpia el hash para que no vuelva a pegar al refrescar
    history.replaceState(null, '', location.pathname);
  }

  setTimeout(run, FIRST_DELAY);

  // Por si la app react rehidrata más tarde
  const mo = new MutationObserver(() => run());
  mo.observe(document.body, { childList: true, subtree: true });
})();
