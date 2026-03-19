// ==UserScript==
// @name         Amazon Messaging - Copiar + Abrir ChatGPT (visible-only)
// @namespace    https://saquitodelasalud.com
// @version      1.3
// @description  Copia cliente + historial + metadatos del hilo ACTIVO y abre tu conversación de ChatGPT con el payload.
// @match        https://sellercentral.amazon.es/messaging*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ⚠️ Usa tu URL real del hilo en chatgpt.com
  const CHATGPT_CONV_URL = 'https://chatgpt.com/g/g-p-69bb901c50308191806829c0cc3bc66d-att-cliente/c/69bb98ee-e714-8390-be1a-de7793ccdc10';

  const BTN_ID = 'copyConversationBtn';
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const raf = () => new Promise(r => requestAnimationFrame(r));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const isVisible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return (r.width > 0 || r.height > 0);
  };
  const qVisible = (sel, root=document) => Array.from(root.querySelectorAll(sel)).find(isVisible) || null;
  const qqVisible = (sel, root=document) => Array.from(root.querySelectorAll(sel)).filter(isVisible);

  function getActiveRoot() {
    const header = qVisible('.case-message-view-header');
    if (!header) return document.body;
    let p = header;
    for (let i = 0; i < 5 && p; i++) {
      if (qVisible('.case-message-view-messages', p)) return p;
      p = p.parentElement;
    }
    return header;
  }

  function collectConversation() {
    const root = getActiveRoot();
    const out = [];

    const name  = qVisible('.buyer-name', root)?.innerText?.trim();
    const email = qVisible('#buyerProxyEmail', root)?.innerText?.trim();
    if (name)  out.push(`👤 Cliente: ${name}`);
    if (email) out.push(`📧 Email proxy: ${email}`);
    out.push('');

    const msgsRoot = qVisible('.case-message-view-messages', root);
    const msgs = msgsRoot ? qqVisible('.message-component', msgsRoot) : [];
    out.push('💬 Conversación:');
    msgs.forEach(m => {
      const date = qVisible('.case-message-view-message-date', m)?.innerText?.trim();
      const body = qVisible('.message-body-text', m)?.innerText?.trim();
      const who  = m.classList.contains('sent-message-component') ? '📤 Vendedor' : '📥 Cliente';
      if (date && body) out.push(`[${date}] ${who}: ${body}`);
    });
    out.push('');

    const orderKat = qVisible('kat-link[data-ph-capture-attribute-order-id]', root);
    const order = orderKat?.getAttribute('label') || orderKat?.getAttribute('data-ph-capture-attribute-order-id');
    if (order) out.push(`📦 Pedido: ${order}`);

    const metaRoot = qVisible('.context-field-container', root);
    const metaItems = metaRoot ? qqVisible('.linked-context-field-items', metaRoot) : [];
    if (metaItems.length) {
      out.push('');
      out.push('📑 Metadatos del pedido:');
      metaItems.forEach(it => {
        const label = qVisible('.linked-context-field-item-label', it)?.innerText?.trim();
        const val   = qVisible('.gray', it)?.innerText?.trim();
        if (label && val) out.push(`${label}: ${val}`);
      });
    }

    return out.join('\n');
  }

  function addCopyButton() {
    if (document.getElementById(BTN_ID)) return;
    const header = qVisible('.case-message-view-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '📋 Copiar y abrir ChatGPT';
    btn.style.cssText = 'margin-left:12px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', async () => {
      // pequeño respiro por si acabas de cambiar de hilo
      await raf(); await sleep(60);
      const text = collectConversation();
      try { GM_setClipboard(text); } catch {}
      const url = `${CHATGPT_CONV_URL}#from=amazon&payload=${encodeURIComponent(b64(text))}`;
      window.open(url, '_blank', 'noopener,noreferrer'); // SIEMPRE nueva pestaña
      btn.textContent = '✅ Copiado y abriendo...';
      setTimeout(() => { btn.textContent = '📋 Copiar y abrir ChatGPT'; }, 1600);
    });

    header.appendChild(btn);
  }

  function init() {
    addCopyButton();
    // Recolocar botón cuando cambia el hilo
    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        const header = qVisible('.case-message-view-header');
        const btn = document.getElementById(BTN_ID);
        if (header && (!btn || btn.parentElement !== header)) {
          btn?.remove();
          addCopyButton();
        }
      }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 1200);
})();
