// ==UserScript==
// @name         WhatsApp Web - Copiar chat y abrir ChatGPT
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Copia la conversación visible y abre tu hilo de ChatGPT con el contenido listo para pegar (auto-pegado con el script B).
// @match        https://web.whatsapp.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ⚠️ PON AQUÍ el hilo de ChatGPT donde quieres pegar
  const CHATGPT_CONV_URL = 'https://chatgpt.com/c/68a41be1-08e4-8329-8a6e-ab56919b56cd';

  const BTN_ID = 'wa2gpt-copy-btn';
  const MAX_MSGS = 200;     // límite de mensajes a exportar (últimos visibles)
  const FIRST_DELAY = 2000; // WhatsApp tarda en hidratar

  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function addFloatingButton() {
    if (document.getElementById(BTN_ID)) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '📋 Copiar chat → ChatGPT';
    btn.style.cssText = `
      position: fixed; z-index: 999999; right: 16px; top: 16px;
      padding: 8px 12px; border: none; border-radius: 8px;
      background: #1a73e8; color: #fff; font-weight: 700; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,.15);
    `;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const text = collectConversation();
      try { if (typeof GM_setClipboard === 'function') GM_setClipboard(text); } catch {}
      const url = `${CHATGPT_CONV_URL}#from=whatsapp&payload=${encodeURIComponent(b64(text))}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      btn.textContent = '✅ Copiado y abriendo…';
      await sleep(1200);
      btn.textContent = '📋 Copiar chat → ChatGPT';
      btn.disabled = false;
    });

    document.body.appendChild(btn);
  }

  function getChatHeaderInfo() {
    // Intento 1: título del chat (nombre/contacto) — está en el header del panel de conversación
    let title = '';
    const header = document.querySelector('[role="button"][data-tab], header, [data-testid="conversation-header"]') || document.querySelector('header');
    if (header) {
      // muchos headers tienen un span con el nombre
      const nameEl = header.querySelector('h1, h2, [title], [aria-label], span[dir="auto"], div[dir="auto"]');
      if (nameEl) {
        title = (nameEl.getAttribute('title') || nameEl.getAttribute('aria-label') || nameEl.textContent || '').trim();
      }
    }
    // Fallback: si no hay nada, se infiere del primer mensaje entrante (data-pre-plain-text incluye número)
    let phone = '';
    const firstIncoming = document.querySelector('.message-in [data-pre-plain-text]');
    if (firstIncoming) {
      const pre = firstIncoming.getAttribute('data-pre-plain-text') || '';
      // Ej: "[14:34, 21/8/2025] +34 670 71 81 34: "
      const m = pre.match(/\]\s*(.+?):\s*$/);
      if (m) phone = m[1].trim();
    }
    return { title, phone };
  }

  function parseMessageNode(msgEl) {
    // El contenedor fiable es .copyable-text con data-pre-plain-text
    const wrapper = msgEl.querySelector('.copyable-text');
    if (!wrapper) return null;

    const meta = wrapper.getAttribute('data-pre-plain-text') || '';
    // Ej meta: "[14:02, 21/8/2025] El Saquito de la Salud: "
    //          "[14:34, 21/8/2025] +34 670 71 81 34: "
    const metaMatch = meta.match(/^\[(.+?)\]\s*(.+?):\s*$/);
    const when = metaMatch ? metaMatch[1] : '';
    const who  = metaMatch ? metaMatch[2] : (msgEl.classList.contains('message-out') ? 'Vendedor' : 'Cliente');

    // Texto del mensaje (puede estar fragmentado en spans)
    const textEl = wrapper.querySelector('.selectable-text') || wrapper;
    let body = (textEl.innerText || textEl.textContent || '').trim();

    // Evitar capturar la hora que WhatsApp redibuja fuera del texto
    // (ya vamos a incluir when del meta)
    body = body.replace(/\s*\d{1,2}:\d{2}\s*$/, '').trim();

    return { when, who, body };
  }

  function collectConversation() {
    const out = [];

    // Encabezado chat
    const { title, phone } = getChatHeaderInfo();
    if (title) out.push(`👤 Contacto: ${title}`);
    if (phone) out.push(`📱 Número: ${phone}`);
    out.push('');

    // Mensajes visibles (orden DOM)
    const nodes = Array.from(document.querySelectorAll('.message-in, .message-out'));
    // nos quedamos con los últimos MAX_MSGS para no cargar demasiado
    const slice = nodes.slice(-MAX_MSGS);

    out.push('💬 Conversación:');
    slice.forEach(el => {
      const m = parseMessageNode(el);
      if (!m || !m.body) return;
      const who = el.classList.contains('message-out') ? '📤 Nosotros' : '📥 Cliente';
      const when = m.when ? `[${m.when}] ` : '';
      out.push(`${when}${who}: ${m.body}`);
    });

    return out.join('\n');
  }

  async function init() {
    await sleep(FIRST_DELAY);
    addFloatingButton();

    // Si se cambia de chat o WhatsApp rehidrata, recolocamos el botón si desaparece
    const mo = new MutationObserver(() => {
      if (!document.getElementById(BTN_ID)) addFloatingButton();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
