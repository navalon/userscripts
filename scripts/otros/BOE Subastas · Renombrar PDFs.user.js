// ==UserScript==
// @name         BOE Subastas · Renombrar PDFs
// @namespace    tradeplay.boe.renamer
// @version      1.0
// @description  Descarga los PDFs de subastas.boe.es con nombre personalizado (anchor + idSub)
// @match        https://subastas.boe.es/detalleSubasta.php*
// @grant        GM_download
// @connect      subastas.boe.es
// ==/UserScript==

(function () {
  'use strict';

  const q = (sel, el = document) => el.querySelector(sel);
  const qa = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // idSub desde la URL (fiable)
  const url = new URL(location.href);
  const idSub = url.searchParams.get('idSub') || '';

  // Sanitiza nombres de archivo para Windows/macOS
  const sanitize = (s) => s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')  // caracteres ilegales
    .replace(/\.$/, '');            // sin punto final

  // Construye el nombre final
  const buildName = (anchorText, idSub) => {
    const base = `${anchorText} - ${idSub}`.trim();
    return sanitize(base) + '.pdf';
  };

  // Inserta botón “Renombrar” al lado de cada documento PDF
  function enhance() {
    // Lista típica en “Información complementaria de la subasta”
    const links = qa('div.caja.gris ul.enlaces li.puntoPDF a[href^="verDocumento.php"]');
    if (!links.length) return;

    links.forEach((a) => {
      // Evita duplicados si ya hemos añadido botón
      if (a.dataset.renamerAttached === '1') return;
      a.dataset.renamerAttached = '1';

      const btn = document.createElement('button');
      btn.textContent = '⬇️ Descarga y Renombra';
      btn.style.marginLeft = '0.6rem';
      btn.style.padding = '2px 8px';
      btn.style.cursor = 'pointer';

      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const anchorText = a.textContent.trim() || 'documento';
        const fileName = buildName(anchorText, idSub);
        const href = new URL(a.getAttribute('href'), location.origin).href;

        GM_download({
          url: href,
          name: fileName,
          saveAs: false, // ponlo en true si quieres que pregunte cada vez
          onerror: (e) => {
            console.error('Error descargando PDF:', e);
            alert('No se pudo descargar el PDF. Abro la pestaña para que puedas guardarlo manualmente.');
            window.open(href, '_blank');
          }
        });
      });

      a.insertAdjacentElement('afterend', btn);
    });
  }

  // Observa cambios por si la página carga partes dinámicamente
  const obs = new MutationObserver(() => enhance());
  obs.observe(document.documentElement, { childList: true, subtree: true });

  // Primera pasada
  enhance();
})();
