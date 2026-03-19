// ==UserScript==
// @name         Linkificar pedidos Temu → Seller (Observaciones fijo)
// @namespace    https://saquitodelasalud.com
// @version      1.2
// @description  Añade botón Temu bajo Observaciones sin borrar contenido
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @match        https://web.whatsapp.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const REG_TEST = /\bPO-\d{3}-\d{8,20}\b/;
  const TEMU_URL = (po) => `https://seller-eu.temu.com/order-detail.html?parent_order_sn=${po}`;

  function handleObservaciones() {
    const obs = document.querySelector('#observations');
    if (!obs) return;

    // 📌 leer texto aunque el <textarea> tenga HTML
    const val = (obs.value && obs.value.trim()) || (obs.textContent && obs.textContent.trim()) || "";
    if (!val) return;

    const match = val.match(REG_TEST);
    if (!match) return;

    if (document.querySelector('#temu-link-btn')) return; // ya existe

    const po = match[0];
    const url = TEMU_URL(po);

    const btn = document.createElement('a');
    btn.id = 'temu-link-btn';
    btn.href = url;
    btn.target = '_blank';
    btn.textContent = `🔗 Ver pedido Temu (${po})`;
    btn.style.cssText = 'display:block;margin-top:6px;padding:4px 8px;background:#ff6f00;color:#fff;border-radius:4px;text-decoration:none;font-weight:600;';

    // Insertar debajo del campo
    obs.insertAdjacentElement('afterend', btn);
  }

  function scan() {
    handleObservaciones();
  }

  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
})();
