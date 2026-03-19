// ==UserScript==
// @name         Amazon Seller Central → "Ver en web" (Woo search Saquito)
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Añade un enlace "Ver en web" junto al Nº de pedido en Seller Central para buscar el pedido en Woo (saquitodelasalud.com)
// @match        https://sellercentral.amazon.es/orders-v3/order/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const WOO_SEARCH = (orderId) =>
    `https://saquitodelasalud.com/wp-admin/edit.php?post_type=shop_order&s=${encodeURIComponent(orderId)}`;

  const ORDER_ID_ANCHOR_SEL = '[data-test-id="order-id-value"] a';
  const INSERT_AFTER_SEL = '[data-test-id="order-id-value"]'; // ponemos el link a continuación de este span

  const MARKER_ATTR = 'data-woo-ver-en-web-added';

  function getOrderId() {
    const a = document.querySelector(ORDER_ID_ANCHOR_SEL);
    const id = (a?.textContent || '').trim();
    // Formato típico: 402-8727394-1027527
    if (!/^\d{3}-\d{7}-\d{7}$/.test(id)) return null;
    return id;
  }

  function ensureLink() {
    const host = document.querySelector(INSERT_AFTER_SEL);
    if (!host) return false;

    // Evitar duplicados
    if (host.getAttribute(MARKER_ATTR) === '1') return true;

    const orderId = getOrderId();
    if (!orderId) return false;

    // Contenedor del separador + link
    const wrap = document.createElement('span');
    wrap.style.marginLeft = '10px';
    wrap.style.whiteSpace = 'nowrap';

    // separador tipo " | "
    const sep = document.createElement('span');
    sep.textContent = ' | ';
    sep.style.opacity = '0.6';

    const link = document.createElement('a');
    link.href = WOO_SEARCH(orderId);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver en web';
    link.style.textDecoration = 'underline';
    link.style.fontWeight = '600';

    wrap.appendChild(sep);
    wrap.appendChild(link);

    // Insertar justo después del span del order-id-value
    host.insertAdjacentElement('afterend', wrap);

    host.setAttribute(MARKER_ATTR, '1');
    return true;
  }

  function init() {
    ensureLink();

    let t = null;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(ensureLink, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 600);
})();
