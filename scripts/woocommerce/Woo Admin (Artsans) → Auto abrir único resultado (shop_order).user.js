// ==UserScript==
// @name         Woo Admin (Artsans) → Auto abrir único resultado (shop_order)
// @namespace    https://artsans.es
// @version      1.0
// @description  Si una búsqueda de pedidos devuelve 1 único resultado, abre automáticamente el pedido.
// @match        https://artsans.es/wp-admin/edit.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const QS = new URLSearchParams(location.search);
  const isOrdersSearch =
    QS.get('post_type') === 'shop_order' &&
    (QS.get('s') || '').trim().length > 0;

  if (!isOrdersSearch) return;

  const OPEN_IN_NEW_TAB = true;

  function findSingleOrderLink() {
    const rows = Array.from(document.querySelectorAll('#the-list tr'))
      .filter(r => !r.classList.contains('no-items'));

    if (rows.length !== 1) return null;

    const row = rows[0];
    return (
      row.querySelector('td.order_title a.row-title') ||
      row.querySelector('a.row-title') ||
      row.querySelector('a[href*="post.php?post="][href*="action=edit"]')
    );
  }

  function go() {
    const a = findSingleOrderLink();
    if (!a) return;

    // evita bucles en la misma sesión
    const key = 'artsans_woo_auto_opened_once';
    if (sessionStorage.getItem(key) === '1') return;
    sessionStorage.setItem(key, '1');

    if (OPEN_IN_NEW_TAB) window.open(a.href, '_blank', 'noopener,noreferrer');
    else location.href = a.href;
  }

  setTimeout(go, 400);
  setTimeout(go, 900);

  const mo = new MutationObserver(() => go());
  mo.observe(document.body, { childList: true, subtree: true });
})();
