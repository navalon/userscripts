// ==UserScript==
// @name         Linkify Orders (Amazon, Temu, Artsans, Saquito) - Safe SPA
// @namespace    https://saquitodelasalud.com
// @version      1.1
// @description  Convierte IDs de pedido en enlaces clicables con esperas y protección SPA.
// @match        https://sellercentral.amazon.es/*
// @match        https://seller-eu.temu.com/*
// @match        https://artsans.es/*
// @match        https://saquitodelasalud.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Delays por host (ms)
  const HOST = location.hostname;
  const HOST_DELAY =
    /sellercentral\.amazon\.es$/.test(HOST) ? 5000 :
    /seller-eu\.temu\.com$/.test(HOST)      ? 4000 :
    0;

  // Regex
  const RX_AMZ = /(\d{3}-\d{7}-\d{7})/g;      // Amazon order IDs
  const RX_TEMU = /(PO-\d{3}-\d{8,20})/g;     // Temu: PO-186-...
  const RX_ARTS = /(ARTS-\d+)/g;              // Artsans (ejemplo)
  const RX_SAQ  = /(SAQ-\d+)/g;               // Saquito (ejemplo)

  function linkifyText(txt) {
    let out = txt;

    out = out.replace(RX_AMZ,
      `<a href="https://sellercentral.amazon.es/orders-v3/order/$1" target="_blank" rel="noopener noreferrer">$1</a>`);

    out = out.replace(RX_TEMU,
      `<a href="https://seller-eu.temu.com/order-detail.html?parent_order_sn=$1" target="_blank" rel="noopener noreferrer">$1</a>`);

    out = out.replace(RX_ARTS,
      `<a href="https://artsans.es/?s=$1" target="_blank" rel="noopener noreferrer">$1</a>`);

    out = out.replace(RX_SAQ,
      `<a href="https://saquitodelasalud.com/?s=$1" target="_blank" rel="noopener noreferrer">$1</a>`);

    return out;
  }

  function isSkippableNode(node) {
    if (!node || !node.parentNode) return true;
    // No tocar si está dentro de un enlace
    for (let n = node.parentNode; n; n = n.parentNode) {
      if (n.nodeType === 1) {
        const tag = n.tagName;
        if (tag === 'A' || tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'IFRAME' || tag === 'TEMPLATE') return true;
        if (n.isContentEditable) return true;
        // Evita inputs/textarea o textos dentro de ellos
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true;
      }
    }
    return false;
  }

  function linkifyTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const original = node.nodeValue;
    if (!original || !original.trim()) return;
    if (isSkippableNode(node)) return;

    const replaced = linkifyText(original);
    if (replaced !== original) {
      const span = document.createElement('span');
      span.innerHTML = replaced;
      node.parentNode.replaceChild(span, node);
    }
  }

  function walkAndLinkify(root) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        // filtra rápido: si no hay ningún patrón, no aceptar
        const t = n.nodeValue || '';
        if (!RX_AMZ.test(t) && !RX_TEMU.test(t) && !RX_ARTS.test(t) && !RX_SAQ.test(t)) return NodeFilter.FILTER_REJECT;
        // reset regex lastIndex (por si)
        RX_AMZ.lastIndex = RX_TEMU.lastIndex = RX_ARTS.lastIndex = RX_SAQ.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(linkifyTextNode);
  }

  function safeScan(target) {
    try { walkAndLinkify(target || document.body); } catch (e) { /* silenciar para no romper SPA */ }
  }

  function init() {
    safeScan();

    // Observer con debounce
    let t;
    const obs = new MutationObserver((mutList) => {
      clearTimeout(t);
      t = setTimeout(() => {
        // Procesa solo nodos añadidos para minimizar trabajo
        const added = [];
        mutList.forEach(m => m.addedNodes && m.addedNodes.forEach(n => {
          if (n.nodeType === 1) added.push(n);
          else if (n.nodeType === 3) added.push(n.parentNode);
        }));
        if (added.length) added.forEach(n => safeScan(n));
        else safeScan();
      }, 600);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // Espera a que la SPA acabe de pintar
  const start = () => {
    // run once now (por si ya está listo)
    safeScan();
    // y tras el delay por host
    setTimeout(init, HOST_DELAY);
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();
