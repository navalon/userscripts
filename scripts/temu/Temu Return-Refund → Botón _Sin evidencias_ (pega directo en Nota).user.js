// ==UserScript==
// @name         Temu Return/Refund → Botón "Sin evidencias" (pega directo en Nota)
// @namespace    https://seller-eu.temu.com
// @version      1.3
// @description  Inserta botón "Sin evidencias" debajo de Enviar y al pulsarlo pega el texto directamente en el textarea Nota para el comprador.
// @match        https://seller-eu.temu.com/return-refund-list.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const WIDGET_ID = 'tm-sin-evidencias-btn';

  const TEMPLATE =
`Hola,
Hemos revisado tu solicitud, pero por el momento no podemos aceptar el reembolso porque no se han aportado evidencias suficientes que permitan verificar la incidencia (por ejemplo, fotos claras del producto y del embalaje, o material que respalde lo indicado).
Si puedes, por favor envíanos fotografías y detalles adicionales, y lo revisaremos de nuevo.
Gracias por tu comprensión.`;

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function isVisible(el) {
    if (!el) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function findSendButton() {
    const btns = Array.from(document.querySelectorAll('div[role="button"]')).filter(isVisible);
    return btns.find(b => norm(b.textContent) === 'enviar') || null;
  }

  function findTargetTextarea(sendBtn) {
    // Prioriza el textarea dentro del mismo form del botón Enviar
    const form = sendBtn?.closest('form');
    if (form) {
      const inside = Array.from(form.querySelectorAll('textarea[data-testid="beast-core-textArea-htmlInput"]'))
        .filter(isVisible);
      if (inside.length) return inside[inside.length - 1]; // suele ser el de "Nota para el comprador"
    }

    // fallback: el más cercano visible
    const candidates = Array.from(document.querySelectorAll('textarea[data-testid="beast-core-textArea-htmlInput"]'))
      .filter(isVisible);

    if (candidates.length === 1) return candidates[0];

    if (candidates.length > 1) {
      const sRect = sendBtn.getBoundingClientRect();
      candidates.sort((a, b) => Math.abs(a.getBoundingClientRect().top - sRect.top) - Math.abs(b.getBoundingClientRect().top - sRect.top));
      return candidates[0];
    }

    return null;
  }

  function toastNear(el, msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.zIndex = '999999';
    t.style.right = '18px';
    t.style.bottom = '18px';
    t.style.padding = '8px 10px';
    t.style.borderRadius = '10px';
    t.style.background = 'rgba(0,0,0,0.75)';
    t.style.color = '#fff';
    t.style.fontSize = '12px';
    t.style.fontWeight = '700';
    t.style.boxShadow = '0 8px 20px rgba(0,0,0,0.18)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1100);
  }

  function buildButton(sendBtn) {
    const btn = document.createElement('button');
    btn.id = WIDGET_ID;
    btn.type = 'button';
    btn.textContent = 'Sin evidencias';
    btn.style.marginTop = '10px';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '10px';
    btn.style.border = '1px solid rgba(0,0,0,0.15)';
    btn.style.background = '#fff';
    btn.style.cursor = 'pointer';
    btn.style.fontWeight = '800';
    btn.style.fontSize = '12px';

    btn.addEventListener('click', () => {
      const ta = findTargetTextarea(sendBtn);
      if (!ta) {
        toastNear(sendBtn, 'No encuentro la caja de nota…');
        return;
      }
      ta.focus();
      setNativeValue(ta, TEMPLATE.trim());
      toastNear(sendBtn, 'Pegado ✓');
    });

    return btn;
  }

  function ensureInjected() {
    const sendBtn = findSendButton();
    if (!sendBtn) return false;

    // Evitar duplicado
    if (document.getElementById(WIDGET_ID)) return true;

    const btn = buildButton(sendBtn);

    // Debajo de Enviar
    sendBtn.insertAdjacentElement('afterend', btn);
    return true;
  }

  function init() {
    ensureInjected();

    let t = null;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(ensureInjected, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 800);
})();
