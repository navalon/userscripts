// ==UserScript==
// @name         Temu Seller: Linkify tracking CEX → /envios#cex_track
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  En Temu Seller (order-detail), convierte tracking 323… en enlace a Correos Express (con #cex_track)
// @match        https://seller-eu.temu.com/order-detail.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- Config ---
  const FIRST_DELAY = 3500;    // Temu SPA tarda en hidratar
  const OBS_DEBOUNCE = 400;    // evitar trabajo excesivo al mutar
  const TRACK_RE_INLINE = /\b(323\d{13})\b/g; // 16 dígitos empezando por 323
  const CEX_URL = (n) =>
    `https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=${encodeURIComponent(n)}`;

  // --- Helpers ---
  const isText = (n) => n && n.nodeType === Node.TEXT_NODE;
  const isEl   = (n) => n && n.nodeType === Node.ELEMENT_NODE;
  function isSafeContainer(el){
    if (!isEl(el)) return false;
    if (el.isContentEditable) return false;
    const tag = el.tagName;
    return !/^(A|SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/i.test(tag);
  }

  // Envuelve un rango exacto con <a>
  function surroundRangeWithLink(range, tracking) {
    const a = document.createElement('a');
    a.href = CEX_URL(tracking);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    range.surroundContents(a);
  }

  // Reemplaza textNode por HTML con el <a> (fallback)
  function replaceTextNodeWithLink(node, tracking) {
    const parent = node.parentNode;
    if (!parent) return;
    const txt = node.textContent || '';
    const html = txt.replace(
      TRACK_RE_INLINE,
      (m) => m === tracking
        ? `<a href="${CEX_URL(tracking)}" target="_blank" rel="noopener noreferrer">${m}</a>`
        : m
    );
    const span = document.createElement('span');
    span.innerHTML = html;
    parent.replaceChild(span, node);
  }

  // Linkifica el primer tracking que encuentre dentro de un contenedor dado
  function linkifyFirstTrackingIn(container) {
    if (!isSafeContainer(container)) return;

    // evita duplicar si ya hay enlaces cex_track dentro
    if (container.querySelector('a[href*="cex_track="]')) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    while (walker.nextNode()) {
      const n = walker.currentNode;
      if (!isText(n) || !isSafeContainer(n.parentNode)) continue;
      const txt = n.textContent || '';
      const m = txt.match(TRACK_RE_INLINE);
      if (!m) continue;

      const tracking = m[0];
      // intento 1: Range exacto en el mismo textNode
      const start = txt.indexOf(tracking);
      const end = start + tracking.length;
      const range = document.createRange();
      range.setStart(n, start);
      range.setEnd(n, end);
      try {
        surroundRangeWithLink(range, tracking);
      } catch {
        // fallback si no se puede rodear (nodos superpuestos)
        replaceTextNodeWithLink(n, tracking);
      }
      break; // sólo el primero
    }
  }

  // Caso específico: bloque “Número de seguimiento”
  function processNumeroDeSeguimiento() {
    // Buscamos un elemento cuyo texto contenga exactamente "Número de seguimiento"
    const candidates = Array.from(document.querySelectorAll('div, span, label'))
      .filter(el => /Número de seguimiento/i.test(el.textContent || ''));

    candidates.forEach(labelEl => {
      // subimos al contenedor lógico (hasta 4 niveles) y linkificamos dentro
      let root = labelEl;
      for (let i = 0; i < 4 && root; i++) {
        // si en este root aparece un número 323… visible, nos vale
        if (TRACK_RE_INLINE.test(root.textContent || '')) break;
        root = root.parentElement;
      }
      if (root) linkifyFirstTrackingIn(root);
    });
  }

  // Linkifica también cualquier 323… que aparezca fuera del bloque “Número de seguimiento”
  function processAnyVisibleTracking() {
    // zonas candidatas típicas en Temu (derecha de timeline, cabeceras, etc.)
    const zones = document.querySelectorAll('div, p, span, li');
    zones.forEach(z => {
      if (!isSafeContainer(z)) return;
      if (!TRACK_RE_INLINE.test(z.textContent || '')) return;
      linkifyFirstTrackingIn(z);
    });
  }

  function scan() {
    processNumeroDeSeguimiento();
    processAnyVisibleTracking();
  }

  function start() {
    scan();
    let timer = null;
    const obs = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, OBS_DEBOUNCE);
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  setTimeout(start, FIRST_DELAY);
})();
