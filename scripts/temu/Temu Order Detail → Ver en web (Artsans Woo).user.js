// ==UserScript==
// @name         Temu Order Detail → Ver en web (Artsans Woo)
// @namespace    https://seller-eu.temu.com
// @version      1.0
// @description  Añade "Ver en web" junto al PO en Temu Order Detail para buscarlo en artsans.es
// @match        https://seller-eu.temu.com/order-detail.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const MARK = 'data-artsans-verenweb-added';

  const getPO = () => {
    // anchor que contiene el PO (tu ejemplo)
    const a = document.querySelector('a[href*="order-detail.html?parent_order_sn=PO-"]');
    const po = (a?.textContent || '').trim();
    if (!/^PO-\d{3}-\d{10,22}$/.test(po)) return null;
    return po;
  };

  const artsansSearchUrl = (po) =>
    `https://artsans.es/wp-admin/edit.php?post_type=shop_order&s=${encodeURIComponent(po)}`;

  function ensureLink() {
    const a = document.querySelector('a[href*="order-detail.html?parent_order_sn=PO-"]');
    if (!a) return false;

    // Evitar duplicados: marcamos el contenedor inmediato del link del PO
    const host = a.closest('span') || a.parentElement;
    if (!host) return false;
    if (host.getAttribute(MARK) === '1') return true;

    const po = (a.textContent || '').trim();
    if (!/^PO-\d{3}-\d{10,22}$/.test(po)) return false;

    const wrap = document.createElement('span');
    wrap.style.marginLeft = '10px';
    wrap.style.whiteSpace = 'nowrap';

    const sep = document.createElement('span');
    sep.textContent = ' | ';
    sep.style.opacity = '0.6';

    const link = document.createElement('a');
    link.href = artsansSearchUrl(po);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver en web';
    link.style.textDecoration = 'underline';
    link.style.fontWeight = '600';

    wrap.appendChild(sep);
    wrap.appendChild(link);

    // Insertar justo después del link del PO
    a.insertAdjacentElement('afterend', wrap);

    host.setAttribute(MARK, '1');
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

  setTimeout(init, 700);
})();
