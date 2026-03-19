// ==UserScript==
// @name         Gmail: Linkear Albarán CEX (hilos y viñetas)
// @namespace    https://saquitodelasalud.com
// @version      2.0
// @description  Convierte el número tras “Albarán:” en enlace a /group/correosexpress/envios#cex_track=<n> aunque esté partido en nodos.
// @match        https://mail.google.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const TRACK_RE = /323\d{13}/; // 16 dígitos empezando por 323
  const CEX_URL = (n) => `https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=${encodeURIComponent(n)}`;

  // ---------- Helpers ----------
  function isTextNode(n){ return n && n.nodeType === Node.TEXT_NODE; }
  function isElementNode(n){ return n && n.nodeType === Node.ELEMENT_NODE; }
  function isSafeContainer(el){
    if (!isElementNode(el)) return false;
    const tag = el.tagName;
    if (el.isContentEditable) return false;
    if (el.closest('.gmail_quote')) return false; // no tocar citas antiguas
    return !/^(A|SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/i.test(tag);
  }

  // Crea <a> y rodea un rango exacto de texto
  function surroundRangeWithLink(range, tracking){
    const a = document.createElement('a');
    a.href = CEX_URL(tracking);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    range.surroundContents(a);
  }

  // Busca “Albarán:” y el PRIMER tracking posterior dentro de un mismo contenedor visual
  function linkifyAlbaranInContainer(container){
    if (!isSafeContainer(container)) return;

    // Evita repetir si ya hay un enlace con cex_track dentro
    if (container.querySelector('a[href*="cex_track="]')) return;

    // Recorremos nodos en orden visual
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) {
      const n = walker.currentNode;
      // Sólo texto en contenedores seguros
      if (isTextNode(n) && isSafeContainer(n.parentNode)) {
        textNodes.push(n);
      }
    }

    // Buscamos el nodo que contiene "Albarán"
    let idxLabel = -1;
    for (let i = 0; i < textNodes.length; i++){
      if (/(^|\s)Albar[aá]n\s*[:：]?(\s|$)/i.test(textNodes[i].textContent)) { idxLabel = i; break; }
    }
    if (idxLabel === -1) return;

    // Desde ahí en adelante, localizamos el primer tracking 323...
    for (let j = idxLabel; j < textNodes.length; j++){
      const tn = textNodes[j];
      const txt = tn.textContent || '';
      const m = txt.match(TRACK_RE);
      if (!m) continue;

      const tracking = m[0];
      // Creamos un rango preciso para ese tramo dentro del textNode
      const startOffset = txt.indexOf(tracking);
      const endOffset = startOffset + tracking.length;

      const range = document.createRange();
      range.setStart(tn, startOffset);
      range.setEnd(tn, endOffset);

      try {
        surroundRangeWithLink(range, tracking);
      } catch {
        // Fallback: si no se puede rodear (nodos solapados), usa reemplazo HTML controlado
        const parent = tn.parentNode;
        const safeHTML = txt.replace(TRACK_RE, `<a href="${CEX_URL(tracking)}" target="_blank" rel="noopener noreferrer">$&</a>`);
        const span = document.createElement('span');
        span.innerHTML = safeHTML;
        parent.replaceChild(span, tn);
      }
      break; // sólo el primero
    }
  }

  function processOneBody(body){
    // 1) Viñetas/UL/LI (como en tu captura)
    body.querySelectorAll('li:not([data-cex-processed])').forEach(li => {
      linkifyAlbaranInContainer(li);
      li.setAttribute('data-cex-processed', '1');
    });

    // 2) Línea-resumen del mensaje (arriba, con guiones “ - Albarán: … - Referencia: …”)
    // En muchos hilos Gmail lo pinta en contenedores <div> o <span> sueltos:
    body.querySelectorAll('div:not([data-cex-processed]), span:not([data-cex-processed]), p:not([data-cex-processed])').forEach(el => {
      // Heurística: sólo si contiene "Albarán" en su texto plano
      const plain = (el.innerText || el.textContent || '').trim();
      if (!plain || !/Albar[aá]n/i.test(plain)) return;
      linkifyAlbaranInContainer(el);
      el.setAttribute('data-cex-processed', '1');
    });
  }

  function scan(){
    // Gmail renderiza el cuerpo en .a3s (pueden ser varios en un hilo)
    document.querySelectorAll('div.a3s').forEach(processOneBody);
  }

  // Arranque y observador (SPA)
  setTimeout(() => {
    scan();
    const mo = new MutationObserver(() => scan());
    mo.observe(document.body, { childList: true, subtree: true });
  }, 1200);
})();
