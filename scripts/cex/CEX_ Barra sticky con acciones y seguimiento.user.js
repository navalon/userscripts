// ==UserScript==
// @name        CEX: Barra sticky con acciones y seguimiento
// @match       https://saquitodelasalud.com/wp-admin/post.php*
// @match       https://www.saquitodelasalud.com/wp-admin/post.php*
// @match       https://artsans.es/wp-admin/post.php*
// @match       https://www.artsans.es/wp-admin/post.php*
// @run-at      document-end
// @grant       none
// ==/UserScript==
(function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('cex-sticky-topbar-style')) return;
    const style = document.createElement('style');
    style.id = 'cex-sticky-topbar-style';
    style.textContent = `
      #cex-sticky-topbar {
        position: sticky;
        top: 96px;
        z-index: 9998;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 18px;
        background: #f4f8fd;
        border-bottom: 1px solid #d0dff3;
        box-shadow: 0 2px 4px rgba(0,0,0,0.06);
        margin-bottom: 10px;
      }
      #cex-sticky-topbar-label {
        font-size: 13px;
        font-weight: 600;
        color: #003366;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-right: 10px;
      }
      #cex-sticky-topbar .cex-top-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 20px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        line-height: 1.3;
        border: 1px solid transparent;
        cursor: pointer;
        text-decoration: none;
        box-shadow: 0 1px 2px rgba(0,0,0,0.15);
        transition: background-color .15s ease, color .15s ease,
                    box-shadow .15s ease, transform .05s ease;
        white-space: nowrap;
      }
      #cex-sticky-topbar .cex-top-btn--primary {
        background-color: #ffb000;
        border-color: #e09300;
        color: #1f2833;
      }
      #cex-sticky-topbar .cex-top-btn--primary:hover {
        background-color: #ffc53b;
        box-shadow: 0 2px 4px rgba(0,0,0,0.18);
        transform: translateY(-1px);
      }
      #cex-sticky-topbar .cex-top-btn--secondary {
        background-color: #ffffff;
        border-color: #0073aa;
        color: #0073aa;
      }
      #cex-sticky-topbar .cex-top-btn--secondary:hover {
        background-color: #e6f4ff;
        box-shadow: 0 2px 4px rgba(0,0,0,0.18);
        transform: translateY(-1px);
      }
      #cex-sticky-topbar .cex-top-btn:focus {
        outline: 2px solid #0065d1;
        outline-offset: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  function findAlbaranButton() {
    const nodes = document.querySelectorAll(
      '#wpbody-content a.button, #wpbody-content button.button, #wpbody-content a, #wpbody-content button'
    );
    for (const el of nodes) {
      const txt = (el.textContent || '').trim().toLowerCase();
      if (!txt) continue;
      if (txt.includes('albar\u00e1n') || txt.includes('albaran') || txt.includes('packing slip')) {
        return el;
      }
    }
    return null;
  }

  function getLatestCexIdentifier() {
    const table = document.getElementById('tabla_historico');
    if (!table) return null;

    const rows = table.querySelectorAll('tbody tr');
    let best = null;

    rows.forEach(row => {
      const tds = row.querySelectorAll('td');
      if (tds.length < 5) return;

      const fechaTxt = (tds[1].textContent || '').trim();
      const tipoTxt  = (tds[3].textContent || '').trim().toLowerCase();
      const idTxt    = (tds[4].textContent || '').trim();

      if (!fechaTxt || !idTxt) return;
      const d = new Date(fechaTxt);
      if (isNaN(d)) return;

      const prioridad = (tipoTxt === 'envio') ? 2 : 1;

      if (!best ||
          d > best.date ||
          (d.getTime() === best.date.getTime() && prioridad > best.priority)) {
        best = { date: d, id: idTxt, priority: prioridad };
      }
    });

    return best ? best.id : null;
  }

  function createButton(label, variant, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'cex-top-btn ' +
      (variant === 'primary' ? 'cex-top-btn--primary' : 'cex-top-btn--secondary');
    btn.textContent = label;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  function setup() {
    if (!document.body.classList.contains('post-type-shop_order')) return;
    if (document.getElementById('cex-sticky-topbar')) return;

    const grabarOrig = document.getElementById('grabar_envio');
    if (!grabarOrig) return; // si no hay módulo de CEX, no hacemos nada

    // Layout nuevo (wc-admin) o clásico
    const headerWrapper = document.querySelector('.woocommerce-layout__header-wrapper');
    const classicWrap   = document.querySelector('#wpbody-content .wrap');
    const bodyContent   = document.querySelector('#wpbody-content');

    const anchor = headerWrapper || classicWrap || bodyContent;
    if (!anchor) return;

    const albaranOrig = findAlbaranButton();
    const latestId    = getLatestCexIdentifier();

    injectStyles();

    const bar = document.createElement('div');
    bar.id = 'cex-sticky-topbar';

    const label = document.createElement('span');
    label.id = 'cex-sticky-topbar-label';
    label.textContent = 'Acciones de envío:';
    bar.appendChild(label);

    const grabarBtn = createButton('Grabar envío', 'primary', () => grabarOrig.click());
    bar.appendChild(grabarBtn);

    if (albaranOrig) {
      const albaranBtn = createButton('PDF Albarán', 'secondary', () => albaranOrig.click());
      bar.appendChild(albaranBtn);
    }

    if (latestId) {
      const segClienteBtn = createButton('Seguimiento cliente', 'secondary', () => { window.open('https://s.correosexpress.com/c?n=' + encodeURIComponent(latestId), '_blank', 'noopener'); });
      bar.appendChild(segClienteBtn);
      const segCexBtn = createButton('Seguimiento CEX', 'secondary', () => { window.open('https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=' + encodeURIComponent(latestId), '_blank', 'noopener'); });
      bar.appendChild(segCexBtn);
    }
    // Insertar: después del header nuevo, o al principio del contenedor clásico
    if (headerWrapper && anchor === headerWrapper && headerWrapper.parentNode) {
      headerWrapper.parentNode.insertBefore(bar, headerWrapper.nextSibling);
    } else {
      anchor.insertBefore(bar, anchor.firstChild);
    }
  }

  function start() {
    let tries = 0;
    const maxTries = 30; // ~15s
    const timer = setInterval(function () {
      tries++;
      try {
        setup();
        if (document.getElementById('cex-sticky-topbar') || tries >= maxTries) {
          clearInterval(timer);
        }
      } catch (e) {
        clearInterval(timer);
      }
    }, 500);
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    start();
  } else {
    window.addEventListener('DOMContentLoaded', start);
  }
})();