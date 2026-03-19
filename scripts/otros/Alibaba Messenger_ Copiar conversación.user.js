// ==UserScript==
// @name         Alibaba Messenger: Copiar conversación
// @namespace    https://saquitodelasalud.com
// @version      1.0.0
// @description  Copia la conversación actual (texto, citas, imágenes, vídeos) desde message.alibaba.com Messenger
// @match        https://message.alibaba.com/message/messenger.htm*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'ali-copy-chat-btn';

  // ---------- utils ----------
  const q  = (sel, root=document) => root.querySelector(sel);
  const qq = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function tstr(el) {
    return (el?.textContent || '').replace(/\s+/g,' ').trim();
  }

  function gmCopy(text) {
    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
        return Promise.resolve();
      }
    } catch {}
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  // ---------- estilos ----------
  GM_addStyle(`
    #${BTN_ID}{
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999999;
      padding: 10px 14px;
      border-radius: 10px;
      border: 0;
      background: #1677ff;
      color: #fff;
      font-weight: 700;
      box-shadow: 0 6px 16px rgba(0,0,0,.2);
      cursor: pointer;
    }
    #${BTN_ID}[disabled]{ opacity:.6; cursor:not-allowed; }
    .ali-toast{
      position: fixed; left: 50%; bottom: 80px; transform: translateX(-50%);
      background: rgba(0,0,0,.85); color:#fff; padding: 10px 14px; border-radius: 8px;
      z-index: 999999; font-size: 13px; max-width: 80vw; text-align:center;
    }
  `);

  function toast(msg, ms=2000){
    const el = document.createElement('div');
    el.className = 'ali-toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), ms);
  }

  // ---------- localizadores (según DOM de Alibaba Messenger) ----------
  function getChatRoot(){
    // contenedor de flujo de mensajes
    const root = q('#im-chat .message-flow-wrapper') || q('.im-message-flow') || document;
    return root;
  }

  function getChatHeaderInfo() {
    const contact = tstr(q('.content-header .contact-name')) || '(Contacto)';
    const localTime = tstr(q('.content-header .local-time')) || '';
    const title = `=== Alibaba Messenger ===`;
    const stamp = `Fecha exportación: ${new Date().toLocaleString()}`;
    return { header: [title, `Contacto: ${contact}`, localTime && `(${localTime})`, stamp].filter(Boolean).join('\n') };
  }

  // Extrae texto “rico” del bloque de contenido del mensaje
  function extractContentBlock(scope) {
    // texto normal
    const text = tstr(q('.session-rich-content.text', scope));

    // citas (cuando responden a un mensaje)
    let quote = '';
    const quoteBox = q('.quote-container', scope);
    if (quoteBox) {
      const qName = tstr(q('.quote-container .name', quoteBox));
      const qTxt  = tstr(q('.quote-container .content', quoteBox)) || tstr(quoteBox);
      if (qName || qTxt) quote = `> ${qName ? (qName + ': ') : ''}${qTxt}`;
    }

    // imágenes
    const imgs = qq('.session-rich-content.media img', scope)
      .map(img => img.getAttribute('src') || img.src)
      .filter(Boolean)
      .map(url => `📷 ${url}`);

    // vídeos (src directo o <video src=...>)
    const vids = qq('.session-rich-content.media video', scope)
      .map(v => v.getAttribute('src') || '')
      .filter(Boolean)
      .map(url => `🎬 ${url}`);

    // algunos mensajes traen “data-original” con HTML; si no encontramos nada, usamos eso como fallback
    let fallback = '';
    if (!text && !quote && !imgs.length && !vids.length) {
      const raw = scope.closest('.message-item-wrapper')?.getAttribute('data-original') || '';
      if (raw) {
        // quitar etiquetas básicas y entidades puntuales
        fallback = raw
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
      }
    }

    const blocks = [];
    if (quote) blocks.push(quote);
    if (text) blocks.push(text);
    if (fallback) blocks.push(fallback);
    imgs.forEach(u => blocks.push(u));
    vids.forEach(u => blocks.push(u));

    return blocks.join('\n');
  }

  // Extrae cada mensaje del flujo
  function extractMessages() {
    const root = getChatRoot();
    if (!root) return [];

    // Cada mensaje suele ser .message-item-wrapper
    const items = qq('.message-item-wrapper', root);
    const lines = [];

    items.forEach(item => {
      const who   = item.classList.contains('item-right') ? 'Yo' : (tstr(q('.item-base-info .name', item)) || 'Contacto');
      const time  = tstr(q('.item-base-info span:last-child', item)) || '';
      const body  = extractContentBlock(item) || '(sin contenido)';

      const head = [time, who].filter(Boolean).join(' | ');
      const one  = (head ? head + ': ' : '') + body;
      lines.push(one);
    });

    return lines;
  }

  // Intenta forzar que se cargue lo visible (ayuda con scroll virtual)
  function nudgeVirtualScroll() {
    const scroller = q('.message-flow-wrapper .scrollbar-box, .message-flow-wrapper .scrollbar, .message-flow-wrapper');
    if (!scroller) return;
    try {
      scroller.scrollTop = scroller.scrollHeight;
      scroller.scrollTop = 0;
      scroller.scrollTop = scroller.scrollHeight;
    } catch {}
  }

  async function copyConversation() {
    const { header } = getChatHeaderInfo();
    nudgeVirtualScroll();
    // pequeña espera a que hidrate
    await new Promise(r => setTimeout(r, 300));

    const lines = extractMessages();
    const payload = [header, ...lines].join('\n');

    await gmCopy(payload);
    toast('✅ Conversación copiada');
  }

  // ---------- botón flotante ----------
  function ensureButton() {
    if (document.getElementById(BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = 'Copiar conversación';
    btn.addEventListener('click', copyConversation);
    document.body.appendChild(btn);
  }

  function init() {
    ensureButton();

    // Si la SPA cambia el DOM, mantenemos el botón
    const mo = new MutationObserver(() => ensureButton());
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
