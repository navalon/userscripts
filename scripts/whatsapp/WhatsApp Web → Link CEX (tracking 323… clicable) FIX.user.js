// ==UserScript==
// @name         WhatsApp Web → Link CEX (tracking 323… clicable) FIX
// @namespace    https://saquitodelasalud.com
// @version      1.1
// @description  Convierte números de seguimiento de Correos Express en enlaces a CEX con búsqueda autocargada.
// @match        https://web.whatsapp.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Patrón CEX: 323 + 13 dígitos = 16 dígitos en total
  const REG_TEST = /(323\d{13})/;      // sin /g para test()
  const REG_REPL = /\b(323\d{13})\b/g;  // con /g para reemplazo
  const TARGET   = 'https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=';

  // Devuelve la burbuja de mensaje (in/out)
  function getMessageBubble(node) {
    return node.closest('div.message-in, div.message-out');
  }

  // ¿Ya procesamos esta burbuja?
  function isProcessed(bubble) {
    return bubble && bubble.dataset.cexProcessed === '1';
  }
  function markProcessed(bubble) {
    if (bubble) bubble.dataset.cexProcessed = '1';
  }

  function linkifyTextNode(tn) {
    const txt = tn.nodeValue;
    if (!REG_TEST.test(txt)) return;

    const frag = document.createDocumentFragment();
    let last = 0;

    txt.replace(REG_REPL, (match, track, offset) => {
      // previo
      if (offset > last) frag.appendChild(document.createTextNode(txt.slice(last, offset)));

      // enlace
      const a = document.createElement('a');
      a.href = TARGET + encodeURIComponent(track);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = match;
      a.style.color = 'inherit';           // respeta tema claro/oscuro
      a.style.textDecoration = 'underline';
      frag.appendChild(a);

      last = offset + match.length;
      return match;
    });

    // resto
    if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));

    // reemplaza el nodo de texto
    if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
  }

  function processBubble(bubble) {
    if (!bubble || isProcessed(bubble)) return;

    // En WhatsApp Web el texto va en spans/divs con dir="auto" y clases .selectable-text .copyable-text
    const textHolders = bubble.querySelectorAll('span[dir="auto"], div[dir="auto"], span.selectable-text.copyable-text');
    textHolders.forEach(holder => {
      // Recorremos solo nodos de texto (no usar /g en test)
      const walker = document.createTreeWalker(holder, NodeFilter.SHOW_TEXT, {
        acceptNode: n => REG_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach(linkifyTextNode);
    });

    markProcessed(bubble);
  }

  function scan() {
    // Procesa solo las burbujas visibles nuevas
    document.querySelectorAll('#main div.message-in, #main div.message-out').forEach(processBubble);
  }

  // Escaneo inicial y observer para nuevos mensajes / cambio de chat
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
})();
