// ==UserScript==
// @name         PDF Embedder: Capturar a PDF (canvas → PDF)
// @namespace    https://saquitodelasalud.com
// @version      1.0.0
// @description  Exporta todas las páginas visibles del visor .pdfemb-viewer capturando sus canvas y generando un PDF válido.
// @match        *://*/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Carga jsPDF desde CDN si no existe
  async function ensureJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
    return window.jspdf.jsPDF;
  }

  function addButton(viewer) {
    if (!viewer || viewer.__pdfcap_btn_added) return;
    viewer.__pdfcap_btn_added = true;

    const btn = document.createElement('button');
    btn.textContent = 'Capturar a PDF';
    btn.title = 'Exportar capturando el canvas de cada página';
    Object.assign(btn.style, {
      position:'absolute', right:'10px', top:'50px', zIndex:9999,
      padding:'8px 12px', borderRadius:'8px', border:'1px solid rgba(0,0,0,.2)',
      background:'white', cursor:'pointer', fontFamily:'system-ui,sans-serif',
      fontSize:'13px', boxShadow:'0 2px 8px rgba(0,0,0,.15)'
    });

    const host = viewer.parentElement || viewer;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(btn);

    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Preparando...';
      try {
        const jsPDF = await ensureJsPDF();

        // Localiza controles/elementos del visor
        const pageNumEl   = viewer.querySelector('.pdfemb-page-num');
        const pageCountEl = viewer.querySelector('.pdfemb-page-count');
        const nextBtn     = viewer.querySelector('.pdfemb-next');
        const prevBtn     = viewer.querySelector('.pdfemb-prev');
        const canvas      = viewer.querySelector('canvas.pdfemb-the-canvas');

        if (!canvas || !pageNumEl || !pageCountEl) {
          alert('No encuentro el canvas o los elementos de paginación del visor.');
          return;
        }

        const totalPages = parseInt(pageCountEl.textContent.trim(), 10) || 1;

        // Helper: espera a que cambie el número de página y el canvas se repinte
        function waitForPage(target) {
          return new Promise(resolve => {
            let tries = 0;
            const tick = () => {
              const current = parseInt(pageNumEl.textContent.trim(), 10) || 1;
              // Espera un par de frames extra para asegurar render
              if (current === target && tries > 2) return resolve();
              tries++;
              requestAnimationFrame(tick);
            };
            tick();
          });
        }

        // Crea el documento (arrancamos sin páginas)
        // Usaremos A4 por defecto y ajustaremos cada imagen manteniendo proporción
        let pdf = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
        let first = true;
        const A4_W = 595.28, A4_H = 841.89; // puntos

        // Asegura empezar en la 1 si hay prev disponible
        try { if (prevBtn && !prevBtn.disabled) prevBtn.click(); } catch {}

        for (let p = 1; p <= totalPages; p++) {
          // Si no es la primera, avanza
          if (p > 1 && nextBtn) {
            nextBtn.click();
            await waitForPage(p);
          } else {
            await waitForPage(p);
          }

          // Captura el canvas actual
          // Para máxima calidad usamos toDataURL a 1:1
          const dataURL = canvas.toDataURL('image/jpeg', 0.95);
          // Dimensiones del canvas en px
          const cw = canvas.width, ch = canvas.height;

          // Ajuste a A4 manteniendo ratio
          const ratioCanvas = cw / ch;
          const ratioA4     = A4_W / A4_H;
          let pw, ph; // tamaño imagen en el PDF (pt)
          if (ratioCanvas > ratioA4) {
            // restringe por ancho
            pw = A4_W;
            ph = pw / ratioCanvas;
          } else {
            // restringe por alto
            ph = A4_H;
            pw = ph * ratioCanvas;
          }
          const x = (A4_W - pw) / 2;
          const y = (A4_H - ph) / 2;

          if (!first) pdf.addPage('a4', 'p');
          pdf.addImage(dataURL, 'JPEG', x, y, pw, ph, undefined, 'FAST');
          first = false;
        }

        // Nombre del archivo
        const filename = (document.title || 'documento') + '.pdf';
        pdf.save(filename);
        btn.textContent = '¡Listo!';
      } catch (e) {
        console.error(e);
        alert('No he podido generar el PDF por captura. Revisa la consola para más detalles.');
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Capturar a PDF'; }, 1200);
      }
    });
  }

  function scan() {
    document.querySelectorAll('.pdfemb-viewer').forEach(addButton);
  }

  const onReady = () => {
    scan();
    new MutationObserver(scan).observe(document.documentElement, { childList:true, subtree:true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', onReady);
  } else {
    onReady();
  }
})();
