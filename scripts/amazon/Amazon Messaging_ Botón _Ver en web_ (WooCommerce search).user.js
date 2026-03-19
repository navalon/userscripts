// ==UserScript==
// @name         Amazon Messaging: Botón "Ver en web" (WooCommerce search)
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Añade un botón junto a "Reembolsar pedido" que abre la búsqueda del pedido en el admin de saquitodelasalud.com
// @match        https://sellercentral.amazon.es/messaging*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ⚙️ URL base de WooCommerce (modifica el dominio si usas otro ambiente)
  const WOOC_BASE =
    'https://saquitodelasalud.com/wp-admin/edit.php?post_status=all&post_type=shop_order&action=-1&m=0&_created_via&_customer_user&customer_role&payment_method&paged=1&action2=-1&s=';

  const BTN_ID = 'btn-ver-en-web-saquito';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const isVisible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const qVis = (sel, root = document) => Array.from(root.querySelectorAll(sel)).find(isVisible) || null;

  // Encuentra el contenedor "context-buttons-container" del hilo activo
  function getActiveButtonsContainer() {
    // Subimos desde el panel de cabecera visible para mantenernos en el hilo actual
    const header = qVis('.case-message-view-header');
    if (!header) return null;
    let root = header;
    for (let i = 0; i < 6 && root; i++) {
      const btns = qVis('.context-buttons-container', root);
      if (btns) return btns;
      root = root.parentElement;
    }
    // Fallback: cualquiera visible
    return qVis('.context-buttons-container');
  }

  // Obtiene el Amazon Order ID del panel activo
  function getAmazonOrderId() {
    // kat-link con data-ph-capture-attribute-order-id suele estar presente
    const orderKat = qVis('kat-link[data-ph-capture-attribute-order-id]');
    if (orderKat) {
      return orderKat.getAttribute('data-ph-capture-attribute-order-id') ||
             orderKat.getAttribute('label') ||
             (orderKat.textContent || '').trim();
    }
    // Fallback: buscar texto con patrón 171-XXXXXXX-XXXXXXX en el bloque de contexto
    const ctx = qVis('.case-context-content') || document.body;
    const m = (ctx.textContent || '').match(/\b\d{3}-\d{7}-\d{7}\b/);
    return m ? m[0] : null;
  }

  function addButton() {
    const btns = getActiveButtonsContainer();
    if (!btns) return;

    // Evita duplicar si ya existe en este contenedor
    const existing = btns.querySelector(`#${CSS.escape(BTN_ID)}`);
    if (existing) return;

    const orderId = getAmazonOrderId();
    if (!orderId) return;

    const url = WOOC_BASE + encodeURIComponent(orderId);

    // Intenta imitar el estilo "kat-link variant=button"
    const wrapper = document.createElement('div');
    wrapper.className = 'context-button-item';

    const a = document.createElement('a');
    a.id = BTN_ID;
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'Ver en web';
    // Estilo básico por si no hereda clases
    a.style.cssText = 'display:inline-block;padding:6px 12px;border-radius:6px;background:#1a73e8;color:#fff;text-decoration:none;font-weight:600;';

    // Si existe un botón kat-link, copia algunas clases para integrarlo visualmente
    const anyKatBtn = btns.querySelector('kat-link[variant="button"], a.kat-button, a[variant="button"]');
    if (anyKatBtn) {
      a.className = anyKatBtn.className || '';
    }

    wrapper.appendChild(a);
    btns.appendChild(wrapper);
  }

  async function init() {
    // pequeña espera: Amazon SPA tarda en hidratar el panel y los botones
    await sleep(1200);
    addButton();

    // Observa cambios (cambio de conversación, recargas del panel)
    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(addButton, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  init();
})();
