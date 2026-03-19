// ==UserScript==
// @name         CEX: Autorellenar tracking desde hash (#cex_track)
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Si llega con #cex_track=<n>, rellena refTrackingShipment y pulsa Buscar.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/group/correosexpress/envios*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  function getHashParam(name) {
    const h = location.hash || '';
    const m = h.match(new RegExp(`[?#&]${name}=([^&]+)`)) || h.match(new RegExp(`${name}=([^&]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function waitFor(sel, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(sel);
      if (el) return resolve(el);
      const t0 = Date.now();
      const obs = new MutationObserver(() => {
        const node = document.querySelector(sel);
        if (node) { obs.disconnect(); resolve(node); }
        else if (Date.now() - t0 > timeoutMs) { obs.disconnect(); reject(new Error('Timeout')); }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
    });
  }

  async function run() {
    const track = getHashParam('cex_track');
    if (!track) return;

    try {
      const input = await waitFor('#refTrackingShipment');
      input.value = track;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      // Clic en "Buscar"
      const btn = document.querySelector('#quickSearchButton, a.btn#quickSearchButton');
      if (btn) btn.click();

      // limpia el hash para evitar búsquedas repetidas al refrescar
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {
      console.warn('CEX autofill error:', e);
    }
  }

  run();
})();
