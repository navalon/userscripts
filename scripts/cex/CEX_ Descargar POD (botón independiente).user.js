// ==UserScript==
// @name         CEX: Descargar POD (botón independiente)
// @namespace    https://saquitodelasalud.com
// @version      1.0.1
// @match        https://clientes.correosexpress.com/*/envios*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const POD_ID = 'cex-download-pod-btn';

  function ensurePodButton() {
    if (document.getElementById(POD_ID)) return;

    const btn = document.createElement('button');
    btn.id = POD_ID;
    btn.type = 'button';
    btn.textContent = '📥 Descargar POD';
    // estilos básicos (el dock los sobrescribe, pero así también funciona sin dock)
    btn.style.cssText = 'padding:6px 10px;border:none;border-radius:6px;background:#1f6feb;color:#fff;font-weight:600;cursor:pointer;display:block;';

    btn.addEventListener('click', async () => {
      // 1) abre/lanza el modal de POD si hace falta (simula click en “Comprobante de entrega” si existe)
      const openPod = document.querySelector('a,button,[role="button"]')
        && Array.from(document.querySelectorAll('a,button,[role="button"]'))
             .find(n => /comprobante\s+de\s+entrega|pod\b/i.test(n.textContent||''));
      if (openPod) openPod.click();

      // 2) espera a que aparezca la tabla con el listado de PODs en el modal
      const table = await waitFor(() => document.querySelector('#podListDialog #podSearchResultsTable, #podListDialog table'), 4000);

      // 3) si hay fila con onclick que abre la imagen, lánzala (abre nueva ventana con la imagen)
      const row = table && table.querySelector('tbody tr[onclick]');
      if (row) {
        row.click();               // abre la ventana “POD Image”
        return;
      }

      alert('No pude localizar el enlace del POD en el modal.');
    });

    // lo insertamos al final del <body> para que NO quede como hijo del botón de “Copiar”
    document.body.appendChild(btn);
  }

  function waitFor(fn, timeout=4000, int=120) {
    return new Promise(resolve => {
      const t0 = Date.now();
      const tick = () => {
        const v = fn();
        if (v) return resolve(v);
        if (Date.now() - t0 > timeout) return resolve(null);
        setTimeout(tick, int);
      };
      tick();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensurePodButton, { once:true });
  } else {
    ensurePodButton();
  }
})();
