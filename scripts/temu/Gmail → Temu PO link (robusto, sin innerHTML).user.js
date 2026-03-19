// ==UserScript==
// @name         Gmail → Temu PO link (robusto, sin innerHTML)
// @namespace    https://artsans.es
// @version      2.0
// @description  Convierte IDs Temu tipo PO-186-0210... en enlaces al pedido en Temu Seller EU (sin romper Gmail)
// @match        https://mail.google.com/mail/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // PO-186-02103725484151685 (formato típico)
  const PO_TEST_RE = /\bPO-\d{3}-\d{10,22}\b/;                // sin /g para test seguro
  const PO_FIND_RE = /\b(PO-\d{3}-\d{10,22})\b/g;             // con /g solo para extraer

  const temuUrl = (po) =>
    `https://seller-eu.temu.com/order-detail.html?parent_order_sn=${encodeURIComponent(po)}`;

  function shouldSkipTextNode(n) {
    const p = n.parentElement;
    if (!p) return true;

    // no tocar links ya existentes o zonas no deseadas
    const tag = p.tagName;
    if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') return true;

    // no tocar el editor de respuesta/compose
    if (p.closest('[contenteditable="true"]')) return true;

    // no tocar si ya lo procesamos (marcamos el padre inmediato)
    if (p.dataset.temuPoLinked === '1') return true;

    return false;
  }

  function linkifyTextNode(textNode) {
    const text = textNode.nodeValue || '';
    if (!text || !PO_TEST_RE.test(text)) return false;

    // construir fragmento sin innerHTML (seguro en Gmail)
    const frag = document.createDocumentFragment();
    let lastIndex = 0;

    // reset lastIndex por seguridad (aunque es un regex nuevo por llamada)
    PO_FIND_RE.lastIndex = 0;
    let match;
    while ((match = PO_FIND_RE.exec(text)) !== null) {
      const po = match[1];
      const start = match.index;
      const end = start + po.length;

      if (start > lastIndex) {
        frag.appendChild(document.createTextNode(text.slice(lastIndex, start)));
      }

      const a = document.createElement('a');
      a.href = temuUrl(po);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = po;
      a.style.textDecoration = 'underline';
      // dejamos el color por defecto de Gmail (no forzamos azul)
      frag.appendChild(a);

      lastIndex = end;
    }

    if (lastIndex < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    }

    const parent = textNode.parentElement;
    textNode.parentNode.replaceChild(frag, textNode);

    if (parent) parent.dataset.temuPoLinked = '1';
    return true;
  }

  function scan(root) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const toProcess = [];
    let n;

    while ((n = walker.nextNode())) {
      if (shouldSkipTextNode(n)) continue;
      const t = n.nodeValue || '';
      if (t && PO_TEST_RE.test(t)) toProcess.push(n);
    }

    for (const tn of toProcess) linkifyTextNode(tn);
  }

  function getMainRoot() {
    // Gmail mete casi todo en role="main"
    return document.querySelector('div[role="main"]') || document.body;
  }

  function init() {
    scan(getMainRoot());

    let timer = null;
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        scan(getMainRoot());
      }, 250);
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 800);
})();
