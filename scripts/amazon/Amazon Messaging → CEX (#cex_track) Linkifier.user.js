// ==UserScript==
// @name         Amazon Messaging → CEX (#cex_track) Linkifier
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  En /messaging de Seller Central, convierte el “Número de seguimiento” (CEX) en enlace a /group/correosexpress/envios#cex_track=<n>
// @match        https://sellercentral.amazon.es/messaging*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // Regex de tracking CEX típico (16 dígitos empezando por 323)
  const CEX_RE = /^323\d{13}$/;

  // Construye la URL correcta para que el otro script (autofill) actúe
  const cexUrl = (n) => `https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=${encodeURIComponent(n)}`;

  function linkifyInContextBlocks(root = document) {
    // Buscamos bloques de contexto que tengan el label “Número de seguimiento”
    const items = root.querySelectorAll('.linked-context-field-items');
    items.forEach(item => {
      const label = item.querySelector('.linked-context-field-item-label');
      if (!label) return;
      if (!/número de seguimiento/i.test(label.textContent || '')) return;

      const valEl = item.querySelector('.gray');
      if (!valEl || valEl.dataset.cexLinked === '1') return;

      const raw = (valEl.textContent || '').trim();
      if (!CEX_RE.test(raw)) return; // solo CEX 323 + 13 dígitos

      // Sustituimos por <a> clicable hacia /group/correosexpress/envios#cex_track=<n>
      valEl.textContent = '';
      const a = document.createElement('a');
      a.href = cexUrl(raw);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = raw;
      a.style.textDecoration = 'underline';
      a.style.color = '#1a73e8';
      valEl.appendChild(a);

      valEl.dataset.cexLinked = '1';
    });
  }

  // Primer pase con espera (Amazon tarda en renderizar el panel)
  setTimeout(() => {
    linkifyInContextBlocks();

    // Observer con debounce para re-aplicar al cambiar de conversación
    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => linkifyInContextBlocks(), 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }, 5000);
})();
