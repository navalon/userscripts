// ==UserScript==
// @name         Woo Admin → Auto abrir único resultado de búsqueda (shop_order)
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Si una búsqueda de pedidos devuelve 1 único resultado, abre automáticamente el pedido.
// @match        https://saquitodelasalud.com/wp-admin/edit.php*
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

  // Cambia esto si prefieres abrir en la MISMA pestaña:
  const OPEN_IN_NEW_TAB = true;

  function findSingleOrderLink() {
    // Tabla de WP list table: suele ser #the-list
    const rows = Array.from(document.querySelectorAll('#the-list tr'));
    // Filas reales (descarta "no items" / placeholders)
    const realRows = rows.filter(r => !r.classList.contains('no-items'));

    if (realRows.length !== 1) return null;

    const row = realRows[0];

    // En Woo, el link al pedido suele estar en la columna "order_title"
    // y es un <a> hacia post.php?post=<id>&action=edit
    const a =
      row.querySelector('td.order_title a.row-title') ||
      row.querySelector('a.row-title') ||
      row.querySelector('a[href*="post.php?post="][href*="action=edit"]');

    return a || null;
  }

  function go() {
    const a = findSingleOrderLink();
    if (!a) return;

    // Evitar bucles si vuelves atrás
    if (sessionStorage.getItem('woo_auto_opened_once') === '1') return;
    sessionStorage.setItem('woo_auto_opened_once', '1');

    const href = a.href;

    if (OPEN_IN_NEW_TAB) {
      window.open(href, '_blank', 'noopener,noreferrer');
    } else {
      location.href = href;
    }
  }

  // Espera a que pinte la tabla (a veces tarda)
  setTimeout(go, 400);
  setTimeout(go, 900);

  // Si hay plugins que re-renderizan, observa cambios
  const mo = new MutationObserver(() => {
    // intenta una vez más cuando aparezcan filas
    go();
  });
  mo.observe(document.body, { childList: true, subtree: true });
})();
