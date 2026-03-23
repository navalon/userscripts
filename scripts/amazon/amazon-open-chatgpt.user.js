// ==UserScript==
// @name         Amazon Messaging → Abrir ChatGPT (dinámico)
// @namespace    https://github.com/navalon/userscripts
// @version      2.4.0
// @description  Copia la conversación del hilo activo de Amazon Messaging y abre el chat
//               destino de ChatGPT configurado con chatgpt-router-manager.
// @match        https://sellercentral.amazon.es/messaging*
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/amazon/amazon-open-chatgpt.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/amazon/amazon-open-chatgpt.user.js
// @grant        GM_setClipboard
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ── Configuración ──
  const STORE_KEY = 'chatgpt_target_url';
  const BTN_ID    = 'tm-amazon-chatgpt-btn';

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
      GM_setValue(STORE_KEY, url.split('#')[0]); // limpiar hash si lo tiene
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

  // ── Helpers ──
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
  const qVisible  = (sel, root = document) => Array.from(root.querySelectorAll(sel)).find(isVisible) || null;
  const qqVisible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).filter(isVisible);

  // ── Extraer conversación ──
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

    // ── Tema del caso ──
    const topicDropdown = document.querySelector('.case-topic-name');
    const topic = topicDropdown?.getAttribute('placeholder') || '';
    if (topic) out.push(`📌 Tema: ${topic}`);

    // ── Datos del producto (panel lateral .case-context) ──
    // El panel de contexto es sibling del panel de mensajes, buscar en document
    const ctxPanel = qVisible('.case-context') || document;

    const orderKat = qVisible('kat-link[data-ph-capture-attribute-order-id]', ctxPanel)
                  || qVisible('kat-link[data-ph-capture-attribute-order-id]', root);
    const order = orderKat?.getAttribute('label') || orderKat?.getAttribute('data-ph-capture-attribute-order-id');
    if (order) out.push(`📦 Pedido: ${order}`);

    // Producto
    const productDetails = qVisible('.case-context-product-details', ctxPanel);
    if (productDetails) {
      const titleEl = productDetails.querySelector('kat-link');
      const title = titleEl?.textContent?.trim();
      const productUrl = titleEl?.getAttribute('href') || '';
      if (title) out.push(`🏷️ Producto: ${title}`);
      if (productUrl) out.push(`🔗 URL producto: ${productUrl}`);

      const qtyEl = productDetails.querySelector('.case-context-order-quantity');
      const qty = qtyEl?.textContent?.replace('Cantidad:', '').trim();
      if (qty) out.push(`📦 Cantidad: ${qty}`);

      const asinEl = productDetails.querySelector('.case-context-asin-id');
      const asin = asinEl?.textContent?.replace('Id.:', '').trim();
      if (asin) out.push(`🔖 ASIN: ${asin}`);
    }

    const metaRoot  = qVisible('.context-field-container', ctxPanel)
                   || qVisible('.context-field-container', root);
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

  // ── Botón ──
  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const header = qVisible('.case-message-view-header');
    if (!header) return;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '📋 Copiar y abrir ChatGPT';
    btn.style.cssText = 'margin-left:12px;padding:6px 10px;border-radius:6px;border:none;' +
      'background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';

    btn.addEventListener('click', async () => {
      let targetURL = getTargetURL();
      if (!targetURL) {
        targetURL = askForTargetURL();
        if (!targetURL) return;
      }

      await raf(); await sleep(60);
      const text = collectConversation();
      try { GM_setClipboard(text); } catch {}

      const url = `${targetURL}#from=amazon&payload=${encodeURIComponent(b64(text))}`;
      window.open(url, '_blank', 'noopener,noreferrer');
      btn.textContent = '✅ Copiado y abriendo...';
      setTimeout(() => { btn.textContent = '📋 Copiar y abrir ChatGPT'; }, 1600);
    });

    header.appendChild(btn);
  }

  // ── Init ──
  function init() {
    addButton();
    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        const header = qVisible('.case-message-view-header');
        const btn = document.getElementById(BTN_ID);
        if (header && (!btn || btn.parentElement !== header)) {
          btn?.remove();
          addButton();
        }
      }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 1200);
})();

