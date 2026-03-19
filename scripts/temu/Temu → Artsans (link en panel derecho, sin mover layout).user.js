// ==UserScript==
// @name         Temu → Artsans (link en panel derecho, sin mover layout)
// @namespace    http://tampermonkey.net/
// @version      6.0
// @description  Añade 1 link "Ver en web" en el panel derecho de acciones (botones), sin alterar el layout.
// @match        https://seller-eu.temu.com/return-refund-list.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const ARTSANS_SEARCH_BASE =
    "https://artsans.es/wp-admin/edit.php?post_type=shop_order&s=";

  const RETURN_LABEL = "ID de la devolución:";
  const ORDER_LABEL  = "ID de pedido:";
  const PO_RE = /PO-\d+-\d+/;

  // Textos típicos del panel derecho
  const ACTION_TEXTS = [
    "Emitir reembolso",
    "Denegar todos los reembolsos",
    "Comunícate con el comprador",
    "Ver detalles de la devolución",
  ];

  let isInjecting = false;
  const txt = (el) => (el?.textContent || "").trim();

  function countOccurrences(haystack, needle) {
    if (!haystack || !needle) return 0;
    let count = 0, pos = 0;
    while (true) {
      const idx = haystack.indexOf(needle, pos);
      if (idx === -1) break;
      count++;
      pos = idx + needle.length;
    }
    return count;
  }

  // Encontrar la tarjeta individual (evitar coger un contenedor gigante)
  function findCardFromNode(node) {
    let cur = node;
    while (cur && cur !== document.documentElement) {
      if (cur.nodeType === 1) {
        const t = txt(cur);
        if (
          t.includes(RETURN_LABEL) &&
          t.includes(ORDER_LABEL) &&
          countOccurrences(t, RETURN_LABEL) === 1 &&
          countOccurrences(t, ORDER_LABEL) >= 1
        ) {
          return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function extractOrderPO(cardEl) {
    // Preferimos el bloque "ID de pedido"
    const orderNode = Array.from(cardEl.querySelectorAll("div,span,p,li,td"))
      .find(el => txt(el).includes(ORDER_LABEL));

    if (orderNode) {
      const m1 = txt(orderNode).match(PO_RE);
      if (m1) return m1[0];
      const a = orderNode.querySelector("a");
      if (a && PO_RE.test(txt(a))) return txt(a);
    }

    // Fallback: cualquier PO en el card
    const m2 = txt(cardEl).match(PO_RE);
    return m2 ? m2[0] : null;
  }

  function findActionsPanel(cardEl) {
    // Buscamos un botón/link de acción por texto
    const actionEl = Array.from(cardEl.querySelectorAll("button, a, div, span"))
      .find(el => ACTION_TEXTS.some(s => txt(el) === s));

    if (!actionEl) return null;

    // Subimos hasta encontrar un contenedor que agrupe varias acciones
    let cur = actionEl;
    while (cur && cur !== cardEl) {
      const t = txt(cur);
      const hits = ACTION_TEXTS.filter(s => t.includes(s)).length;

      // heurística: si el contenedor contiene al menos 2 acciones, es el panel
      if (hits >= 2) return cur;

      // otra heurística: contenedor con varios botones
      if (cur.querySelectorAll && cur.querySelectorAll("button").length >= 2) return cur;

      cur = cur.parentElement;
    }

    // si no lo encontramos, usamos el parent inmediato del botón
    return actionEl.parentElement || null;
  }

  function removeOldInCard(cardEl) {
    cardEl.querySelectorAll(".artsans-link-container").forEach(el => el.remove());
  }

  function buildLink(po) {
    const wrap = document.createElement("div");
    wrap.className = "artsans-link-container";

    // Importante: NO tocar flex del panel, solo un bloque con alineación derecha
    wrap.style.display = "block";
    wrap.style.marginTop = "8px";
    wrap.style.textAlign = "right";

    const link = document.createElement("a");
    link.textContent = "Ver en web";
    link.href = ARTSANS_SEARCH_BASE + encodeURIComponent(po);
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.style.color = "#ff6b00";
    link.style.fontWeight = "700";
    link.style.textDecoration = "underline";

    wrap.appendChild(link);
    return wrap;
  }

  function inject() {
    if (isInjecting) return;
    isInjecting = true;

    try {
      // 1) localizar tarjetas a partir de nodos que contengan "ID de la devolución"
      const returnNodes = Array.from(document.querySelectorAll("div,span,p,li,td"))
        .filter(el => txt(el).includes(RETURN_LABEL));

      const cards = new Set();
      for (const n of returnNodes) {
        const card = findCardFromNode(n);
        if (card) cards.add(card);
      }

      // 2) procesar cada tarjeta
      for (const cardEl of cards) {
        // si ya hay 1 link nuestro en esa tarjeta, no hacemos nada
        const existing = cardEl.querySelectorAll(".artsans-link-container");
        if (existing.length === 1) continue;
        if (existing.length > 1) {
          // deja solo el primero
          existing.forEach((el, idx) => { if (idx > 0) el.remove(); });
          continue;
        }

        const po = extractOrderPO(cardEl);
        if (!po) continue;

        // Limpiar restos por si había scripts anteriores
        removeOldInCard(cardEl);

        // Panel de botones (derecha)
        const panel = findActionsPanel(cardEl);
        if (!panel) continue; // si aún no está renderizado, lo intentará en la siguiente mutación

        panel.appendChild(buildLink(po));
      }
    } finally {
      setTimeout(() => { isInjecting = false; }, 0);
    }
  }

  // debounce para React
  let timer = null;
  const observer = new MutationObserver(() => {
    if (isInjecting) return;
    clearTimeout(timer);
    timer = setTimeout(inject, 250);
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });

  inject();
  setTimeout(inject, 800);
  setTimeout(inject, 1800);
})();
