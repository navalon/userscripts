// ==UserScript==
// @name         Amazon - Copiar trackings UPS (1ZK)
// @namespace    https://tampermonkey.net/
// @version      1.0
// @description  Copia trackings UPS (1ZK) desde la tabla de Send to Amazon
// @match        https://sellercentral.amazon.es/fba/sendtoamazon/enter_tracking_details_step*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const PREFIX = '1ZK';
  const BTN_ID = 'tm-copy-1zk';

  function getTrackings() {
    const root = document.querySelector('[data-testid="spd-tracking-table"]');
    if (!root) return [];

    const rows = root.querySelectorAll('kat-table-row.tracking-id-row');
    const result = [];

    rows.forEach(row => {
      const cells = row.querySelectorAll('kat-table-cell');
      const tracking = cells[2]?.textContent.trim();
      if (tracking && tracking.startsWith(PREFIX)) {
        result.push(tracking);
      }
    });

    return [...new Set(result)];
  }

  function copy(text) {
    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(text);
    } else {
      navigator.clipboard.writeText(text);
    }
  }

  function render() {
    const existing = document.getElementById(BTN_ID);
    const trackings = getTrackings();

    if (!trackings.length) {
      if (existing) existing.remove();
      return;
    }

    if (!existing) {
      const table = document.querySelector('[data-testid="spd-tracking-table"]');

      const container = document.createElement('div');
      container.id = BTN_ID;
      container.style.marginTop = '10px';

      const btn = document.createElement('button');
      btn.textContent = 'Copiar trackings';
      btn.style.padding = '8px 12px';
      btn.style.cursor = 'pointer';

      btn.onclick = () => {
        const csv = getTrackings().join(',');
        copy(csv);
        btn.textContent = '✔ Copiado';
        setTimeout(() => btn.textContent = 'Copiar trackings', 1500);
      };

      container.appendChild(btn);
      table.insertAdjacentElement('afterend', container);
    }
  }

  render();

  const observer = new MutationObserver(() => {
    clearTimeout(window._tmTimer);
    window._tmTimer = setTimeout(render, 200);
  });

  observer.observe(document.body, { childList: true, subtree: true });

})();