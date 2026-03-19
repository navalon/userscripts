// ==UserScript==
// @name         CEX: Botón Temu en Seguimiento (/envios)
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  En /group/correosexpress/envios añade "Ver pedido Temu" debajo de Observaciones sin alterar el texto.
// @match        https://clientes.correosexpress.com/*/envios*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const REG_PO = /\bPO-\d{3}-\d{8,20}\b/;
  const TEMU_URL = (po) => `https://seller-eu.temu.com/order-detail.html?parent_order_sn=${po}`;
  const BTN_ID = 'temu-link-btn-envios';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function getObservacionesField() {
    // 1) ids típicos
    const byId = $('#observations') || $('#observaciones') || $('#observationes');
    if (byId) return byId;

    // 2) cualquier textarea/input con label "Observaciones"
    const lbl = $$('label').find(l => /observac/i.test(l.textContent || ''));
    if (lbl) {
      const forId = lbl.getAttribute('for');
      if (forId) {
        const byFor = document.getElementById(forId);
        if (byFor) return byFor;
      }
      // si no hay for, intenta hermano inmediato
      let sib = lbl.nextElementSibling;
      while (sib && !(sib.tagName === 'TEXTAREA' || sib.tagName === 'INPUT')) {
        sib = sib.nextElementSibling;
      }
      if (sib) return sib;
    }

    // 3) fallback: textarea que contenga “PO-...”
    const any = $$('textarea, input[type="text"]')
      .find(el => REG_PO.test((el.value || el.textContent || '').trim()));
    return any || null;
  }

  function readFieldValue(el) {
    if (!el) return '';
    // Si es textarea/input, usa .value; si por rareza contiene HTML, usa textContent como respaldo
    const v = (('value' in el && el.value != null) ? String(el.value) : '').trim();
    if (v) return v;
    return (el.textContent || '').trim();
  }

  function ensureButtonBelow(el, po) {
    if (!el || !po) return;
    // Evita duplicados
    const existing = document.getElementById(BTN_ID);
    if (existing && existing.dataset.po === po) return;
    if (existing) existing.remove();

    const a = document.createElement('a');
    a.id = BTN_ID;
    a.dataset.po = po;
    a.href = TEMU_URL(po);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `🔗 Ver pedido Temu (${po})`;

    // Estilo de botón coherente con los otros (mismo “look”)
    a.style.display = 'inline-block';
    a.style.marginTop = '6px';
    a.style.padding = '6px 10px';
    a.style.borderRadius = '6px';
    a.style.border = '1px solid #ff6f00';
    a.style.background = '#ff6f00';
    a.style.color = '#fff';
    a.style.fontWeight = '600';
    a.style.textDecoration = 'none';
    a.style.fontFamily = 'inherit';   // 👈 misma tipografía que el resto
    a.style.fontSize = 'inherit';     // 👈 misma talla que el resto
    a.style.lineHeight = 'inherit';

    // Inserta justo debajo del campo
    try {
      el.insertAdjacentElement('afterend', a);
    } catch {
      (el.parentElement || document.body).appendChild(a);
    }
  }

  function scan() {
    const field = getObservacionesField();
    if (!field) return;
    const val = readFieldValue(field);
    const m = val.match(REG_PO);
    if (!m) {
      const ex = document.getElementById(BTN_ID);
      if (ex) ex.remove();
      return;
    }
    ensureButtonBelow(field, m[0]);
  }

  // Arranque y escucha de cambios de DOM (la página rehidrata a menudo)
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // Si el usuario edita el campo (poco probable por readonly), también reevalúa
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t && (t.id === 'observations' || t.id === 'observaciones' || t.id === 'observationes' || t.tagName === 'TEXTAREA')) {
      scan();
    }
  });
})();
