// ==UserScript==
// @name         Amazon Order IDs → Enlace a Seller Central (Gmail + CEX + saquitodelasalud)
// @namespace    https://saquitodelasalud.com
// @version      1.1
// @description  Hace clicables los IDs de pedido de Amazon (171-XXXXXXX-XXXXXXX) y, si están en <textarea>, añade un enlace al lado sin tocar el valor.
// @match        https://mail.google.com/*
// @match        https://clientes.correosexpress.com/*
// @match        https://saquitodelasalud.com/*
// @match        https://*.saquitodelasalud.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Patrón: 3-7-7 dígitos
  const REG_TEST = /\b\d{3}-\d{7}-\d{7}\b/;
  const REG_REPL = /\b(\d{3}-\d{7}-\d{7})\b/g;
  const urlAmazon = (id) => `https://sellercentral.amazon.es/orders-v3/order/${id}`;
  const LINK_CLASS = 'amz-order-link';
  const AREA_DONE  = 'data-amz-texarea-linked';
  const NODE_DONE  = 'data-amz-node-linked';

  // Utilidad: ¿está dentro de un <a> ya?
  function isInsideAnchor(node) {
    let n = node;
    while (n) { if (n.nodeType === 1 && n.tagName === 'A') return true; n = n.parentNode; }
    return false;
  }

  // Linkificar nodos de texto (evita inputs/textarea/contenteditable)
  function linkifyTextNodes(root) {
    if (!root || root.getAttribute?.(NODE_DONE) === '1') return;

    // Ámbitos específicos para Gmail (cuerpos del correo)
    const scopes = (location.host.startsWith('mail.google.com'))
      ? root.querySelectorAll('div.a3s:not([' + NODE_DONE + '])')
      : [root];

    scopes.forEach(scope => {
      // No procesar si es un campo editable
      if (scope.isContentEditable) return;

      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
        acceptNode: n => {
          if (!n.nodeValue) return NodeFilter.FILTER_REJECT;
          const p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.nodeType === 1 ? p.tagName : '';
          // Evitar inputs/textarea/script/style/pre/code y enlaces existentes
          if (tag === 'A' || tag === 'TEXTAREA' || tag === 'INPUT' ||
              tag === 'SCRIPT' || tag === 'STYLE' || tag === 'PRE' || tag === 'CODE') {
            return NodeFilter.FILTER_REJECT;
          }
          return REG_TEST.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });

      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);

      nodes.forEach(tn => {
        const txt = tn.nodeValue;
        if (!REG_TEST.test(txt) || isInsideAnchor(tn)) return;

        const frag = document.createDocumentFragment();
        let last = 0;
        txt.replace(REG_REPL, (match, id, offset) => {
          if (offset > last) frag.appendChild(document.createTextNode(txt.slice(last, offset)));
          const a = document.createElement('a');
          a.href = urlAmazon(id);
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.className = LINK_CLASS;
          a.textContent = match;
          a.style.textDecoration = 'underline';
          a.style.color = '#1a73e8';
          frag.appendChild(a);
          last = offset + match.length;
          return match;
        });
        if (last < txt.length) frag.appendChild(document.createTextNode(txt.slice(last)));

        if (tn.parentNode) tn.parentNode.replaceChild(frag, tn);
      });

      scope.setAttribute(NODE_DONE, '1');
    });
  }

  // Detecta textareas con el ID y añade un enlace al lado (sin tocar value)
  function linkifyTextareas(root) {
    const areas = root.querySelectorAll('textarea:not([' + AREA_DONE + ']), input[type="text"]:not([' + AREA_DONE + '])');
    areas.forEach(area => {
      const val = ('value' in area ? area.value : area.textContent) || '';
      const m = val.match(REG_REPL);
      if (!m) { area.setAttribute(AREA_DONE, '1'); return; }

      // Si ya hay un enlace hermano, no duplicar
      const maybeNext = area.nextElementSibling;
      if (maybeNext && maybeNext.classList && maybeNext.classList.contains(LINK_CLASS)) {
        area.setAttribute(AREA_DONE, '1');
        return;
      }

      // Crea enlace(s) para el/los IDs encontrados
      const wrap = document.createElement('div');
      wrap.style.marginTop = '6px';

      const ids = [...new Set(val.match(REG_REPL))]; // únicos
      ids.forEach(id => {
        const a = document.createElement('a');
        a.href = urlAmazon(id);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className = LINK_CLASS;
        a.textContent = `Abrir pedido Amazon: ${id}`;
        a.style.display = 'inline-block';
        a.style.marginRight = '10px';
        a.style.textDecoration = 'underline';
        a.style.color = '#1a73e8';
        wrap.appendChild(a);
      });

      // Inserta justo después del textarea/input
      area.insertAdjacentElement('afterend', wrap);
      area.setAttribute(AREA_DONE, '1');
    });
  }

  function scan() {
    // 1) No tocar el valor del textarea (ej. #observations en CEX); solo añadir enlace al lado
    linkifyTextareas(document);

    // 2) En el resto de contenidos, linkificar in-place
    linkifyTextNodes(document);
  }

  // Primer pase y observador para contenidos dinámicos (Gmail, CEX)
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });
})();
