// ==UserScript==
// @name         CEX tools: linkify + botón "Envío Correos" (Amazon metabox)
// @namespace    https://saquitodelasalud.com
// @version      1.4
// @description  1) Enlaza trackings CEX en #tabla_historico 2) Botón para rellenar envío Correos (WP-Lister Amazon metabox)
// @match        https://saquitodelasalud.com/*
// @match        https://artsans.es/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // =========================
  // 1) TRACKINGS EN TABLA (Correos Express 323...)
  // =========================
  const TABLE_ID = 'tabla_historico';
  const TRACK_RE = /\b(323\d{13})\b/; // solo para esta tabla histórica
  const cexUrl = (n) =>
    `https://clientes.correosexpress.com/group/correosexpress/envios#cex_track=${encodeURIComponent(n)}`;

  function parseTrackingFromHref(href) {
    if (!href) return null;
    try {
      const u = new URL(href, location.origin);
      const n = u.searchParams.get('n');
      if (n && TRACK_RE.test(n)) return n.match(TRACK_RE)[1];
    } catch {}
    return null;
  }

  function linkifyRow(tr) {
    if (!tr || tr.dataset.cexLinked === '1') return;

    const tds = tr.querySelectorAll('td');
    if (!tds.length) return;

    const tdSeg = tds[0];
    const aSeg  = tdSeg ? tdSeg.querySelector('a') : null;
    let tracking = null;

    if (aSeg) {
      tracking = parseTrackingFromHref(aSeg.getAttribute('href')) ||
                 (aSeg.textContent || '').match(TRACK_RE)?.[1] || null;
      if (tracking) {
        aSeg.href = cexUrl(tracking);
        aSeg.target = '_blank';
        aSeg.rel = 'noopener noreferrer';
        aSeg.textContent = 'CorreosExpress';
      }
    }

    const tdId = tds[4];
    if (tdId) {
      const text = (tdId.innerText || tdId.textContent || '').trim();
      const m = text.match(TRACK_RE);
      if (m) {
        const num = m[1];
        if (!tdId.querySelector('a')) {
          tdId.innerHTML = text.replace(
            TRACK_RE,
            `<a href="${cexUrl(num)}" target="_blank" rel="noopener noreferrer">$1</a>`
          );
        }
        if (!tracking && aSeg) {
          aSeg.href = cexUrl(num);
          aSeg.target = '_blank';
          aSeg.rel = 'noopener noreferrer';
        }
      }
    }

    tr.dataset.cexLinked = '1';
  }

  function processTable() {
    const table = document.getElementById(TABLE_ID);
    if (!table) return;
    table.querySelectorAll('tbody tr').forEach(linkifyRow);
  }

  // ============================================
  // 2) BOTÓN "ENVÍO CORREOS" EN METABOX AMAZON
  // ============================================
  function isWpOrderEdit() {
    return location.pathname.includes('/wp-admin/') &&
      (location.pathname.endsWith('post.php') || location.pathname.endsWith('post-new.php'));
  }

  function setSelectValue(selectEl, value) {
    if (!selectEl) return false;
    const opt = Array.from(selectEl.options).find(o => o.value === value);
    if (!opt) return false;

    selectEl.value = value;
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  // Select2: abre y escribe texto + TAB (como haces tú)
  function typeIntoSelect2(selectId, textToType) {
    const select = document.getElementById(selectId);
    if (!select) return false;

    const selection = select.parentElement?.querySelector('.select2-selection');
    if (!selection) return false;

    // abrir
    selection.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    selection.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const input = document.querySelector('.select2-container--open .select2-search__field');
    if (!input) return false;

    input.focus();
    input.value = textToType;
    input.dispatchEvent(new Event('input', { bubbles: true }));

    // TAB para confirmar/salir
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));

    return true;
  }

  // Input normal: escribir valor + TAB (por si algún listener depende de blur)
  function setInputAndTab(inputEl, value) {
    if (!inputEl) return false;
    inputEl.focus();
    inputEl.value = value;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    inputEl.dispatchEvent(new KeyboardEvent('keyup',   { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true }));
    inputEl.blur();
    return true;
  }

  function ensureAmazonCorreosButton() {
    const box = document.getElementById('woocommerce-amazon-details');
    if (!box) return;

    const inside = box.querySelector('.inside');
    if (!inside) return;

    if (inside.querySelector('#btn_correos_fill_amazon')) return;

    const btn = document.createElement('a');
    btn.href = '#';
    btn.id = 'btn_correos_fill_amazon';
    btn.className = 'button';
    btn.textContent = 'Envío Correos';
    btn.style.marginRight = '8px';

    const markBtn = inside.querySelector('#btn_update_amazon_shipment');
    if (markBtn && markBtn.parentElement) {
      markBtn.parentElement.insertBefore(btn, markBtn);
    } else {
      inside.appendChild(btn);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();

      // Tracking: sin validar formato (Correos puede variar)
      const tracking = (prompt('Introduce el tracking:', '') || '').trim();
      if (!tracking) {
        alert('No se ha introducido tracking.');
        return;
      }

      // 1) Shipping service: Other
      const provider = document.getElementById('wpla_tracking_provider');
      const okProvider = setSelectValue(provider, 'Other');
      if (!okProvider && provider) {
        const opt = Array.from(provider.options).find(o => (o.textContent || '').trim() === 'Other');
        if (opt) {
          provider.value = opt.value;
          provider.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      // 2) Espera mínima para que se muestre el campo "Service provider" (solo aparece tras Other)
      setTimeout(() => {
        // Service provider (input): aquí quieres poner "Correos"
        const serviceName = document.getElementById('wpla_tracking_service_name');
        if (serviceName) {
          setInputAndTab(serviceName, 'Correos');
        }

        // Shipping method (select2): "Paq Light Internacional" + TAB
        // (esto es lo que tú haces manualmente)
        typeIntoSelect2('wpla_tracking_ship_method', 'Paq Light Internacional');
      }, 200);

      // 3) Tracking ID
      const trk = document.getElementById('wpla_tracking_number');
      if (trk) {
        trk.value = tracking;
        trk.dispatchEvent(new Event('input', { bubbles: true }));
        trk.dispatchEvent(new Event('change', { bubbles: true }));
      }

      // Fecha/hora: NO tocar (se rellenan solas / lo gestionas tú)
      alert('Listo: Shipping service=Other, Service provider=Correos, Shipping method=Paq Light Internacional (TAB), Tracking rellenado.');
    });
  }

  function init() {
    processTable();

    if (isWpOrderEdit()) {
      ensureAmazonCorreosButton();
    }

    let t;
    const mo = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(() => {
        processTable();
        if (isWpOrderEdit()) ensureAmazonCorreosButton();
      }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 800);
})();
