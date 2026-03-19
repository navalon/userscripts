// ==UserScript==
// @name         Amazon Seller Central - Marcar botones "Ver" (cambia color al clicar)
// @namespace    https://sellercentral.amazon.es
// @version      1.0
// @description  Cambia de color el botón cuando se hace clic y recuerda el estado con localStorage.
// @match        https://sellercentral.amazon.es/tax/seller-fee-invoices*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'tm_amz_fee_invoices_clicked_v1';

  // ---- CSS del estado "marcado" ----
  const style = document.createElement('style');
  style.textContent = `
    button.tm-clicked,
    .tm-clicked {
      background: #2ecc71 !important;
      border-color: #27ae60 !important;
      color: #ffffff !important;
      border-radius: 6px !important;
    }
    button.tm-clicked:hover {
      filter: brightness(0.95) !important;
    }
  `;
  document.head.appendChild(style);

  // ---- helpers almacenamiento ----
  function loadSet() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(arr);
    } catch (e) {
      return new Set();
    }
  }

  function saveSet(set) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    } catch (e) {
      // si falla, no hacemos nada
    }
  }

  // Identificador único del botón/factura
  function getInvoiceId(btn) {
    // Prioridad: data-invoice (tu ejemplo)
    const inv = btn.getAttribute('data-invoice');
    if (inv) return inv;

    // Fallbacks por si Amazon cambia algo
    return (
      btn.getAttribute('value') ||
      btn.getAttribute('id') ||
      btn.textContent.trim()
    );
  }

  const clicked = loadSet();

  // ---- pinta los ya clicados ----
  function paintExisting() {
    const buttons = document.querySelectorAll('button[data-invoice], button[id^="view_invoice_button"]');
    buttons.forEach(btn => {
      const id = getInvoiceId(btn);
      if (clicked.has(id)) btn.classList.add('tm-clicked');
    });
  }

  // ---- captura clics (delegación) ----
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-invoice], button[id^="view_invoice_button"]');
    if (!btn) return;

    const id = getInvoiceId(btn);
    clicked.add(id);
    saveSet(clicked);
    btn.classList.add('tm-clicked');
  }, true);

  // ---- SPAs: repinta cuando cambie el DOM ----
  const mo = new MutationObserver(() => paintExisting());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Primera pintura
  paintExisting();
})();
