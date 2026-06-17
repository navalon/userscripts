// ==UserScript==
// @name         Temu Order Detail → Ver en web (Laherbera Woo)
// @namespace    https://seller-eu.temu.com
// @version      1.1.0
// @description  Añade "Ver en web" junto al PO en Temu Order Detail para buscarlo en laherbera.com; si hay un único resultado, auto-abre ese pedido.
// @match        https://seller-eu.temu.com/order-detail.html*
// @match        https://laherbera.com/wp-admin/edit.php*
// @match        https://laherbera.com/wp-admin/admin.php*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Order%20Detail%20%E2%86%92%20Ver%20en%20web%20%28Artsans%20Woo%29.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Order%20Detail%20%E2%86%92%20Ver%20en%20web%20%28Artsans%20Woo%29.user.js
// ==/UserScript==

(function () {
  'use strict';

  const MARK = 'data-laherbera-verenweb-added';

  // ---- Lado laherbera.com: auto-abrir el pedido si solo hay 1 resultado ----
  if (/(^|\.)laherbera\.com$/.test(location.hostname)) {
    if (!location.hash.includes('aopen=1')) return;
    const tryOpen = () => {
      const rows = [...document.querySelectorAll('table.wp-list-table tbody tr')]
        .filter(tr => !tr.classList.contains('no-items') && tr.offsetParent !== null);
      if (rows.length !== 1) return false;
      const link = rows[0].querySelector(
        'a.row-title, ' +
        'a[href*="post.php?post="][href*="action=edit"], ' +
        'a[href*="admin.php?page=wc-orders"][href*="action=edit"]'
      );
      if (!link) return false;
      location.replace(link.href);
      return true;
    };
    let n = 0;
    const iv = setInterval(() => {
      if (tryOpen() || ++n > 40) clearInterval(iv);
    }, 300);
    return;
  }

  // ---- Lado Temu: insertar "Ver en web" junto al PO ----
  const laherberaSearchUrl = (po) =>
    `https://laherbera.com/wp-admin/edit.php?post_type=shop_order&s=${encodeURIComponent(po)}#aopen=1`;

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
    link.href = laherberaSearchUrl(po);
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
