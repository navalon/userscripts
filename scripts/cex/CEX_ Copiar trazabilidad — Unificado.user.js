// ==UserScript==
// @name         CEX: Copiar trazabilidad — Unificado
// @namespace    https://saquitodelasalud.com
// @version      1.0
// @description  Extrae toda la trazabilidad de CEX (seguimiento, incidencias, gestiones, comunicaciones) y la copia al portapapeles en texto plano para ChatGPT. Funciona en las vistas de envíos e incidencias.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @match        https://clientes.correosexpress.com/*/incidencias*
// @grant        GM_setClipboard
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/cex/CEX_%20Copiar%20trazabilidad%20%E2%80%94%20Unificado.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/cex/CEX_%20Copiar%20trazabilidad%20%E2%80%94%20Unificado.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ==== CONFIG ====
  const WP_BASE = 'https://saquitodelasalud.com';
  const ORDERS_URL = (ref) => `${WP_BASE}/wp-admin/edit.php?s=${encodeURIComponent(ref)}&post_type=shop_order`;
  const CEX_TRACK  = (ship) => `https://clientes.correosexpress.com/seguimiento?shippingNumber=${encodeURIComponent(ship)}`;
  const BTN_ID = 'cex-copy-trace-unified-btn';

  // ==== UTILS ====
  const q  = (sel, r = document) => r.querySelector(sel);
  const qq = (sel, r = document) => Array.from(r.querySelectorAll(sel));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const V = el => {
    if (!el) return '';
    if (el.tagName === 'SELECT') {
      const opt = el.options?.[el.selectedIndex];
      return opt ? opt.text.trim() : '';
    }
    if ('value' in el && el.value != null) return String(el.value).trim();
    return (el.textContent || '').trim();
  };

  function copyText(text) {
    if (!text) return;
    try { if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); return; } } catch {}
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(() => {}); return; }
    const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch {} ta.remove();
  }

  // Detect view
  function detectView() {
    if (q('#manageIncidenceDetailForm')) return 'incidencias';
    if (q('#trackingShipmentDetailForm')) return 'seguimiento';
    if (q('#shippingNumber') || location.pathname.includes('incidencias')) return 'incidencias';
    return 'seguimiento';
  }

  // Read labelled inputs inside a fieldset / container by reading all label→input pairs
  function readFieldset(container) {
    if (!container) return [];
    const out = [];
    qq('label', container).forEach(lb => {
      const k = (lb.textContent || '').replace(/\s+/g, ' ').trim();
      if (!k) return;
      const forId = lb.getAttribute('for');
      let val = '';
      if (forId) {
        const inp = q(`#${CSS.escape(forId)}`);
        val = V(inp);
      }
      if (!val) {
        // try sibling or parent input
        const inp = lb.nextElementSibling;
        if (inp && /^(INPUT|SELECT|TEXTAREA)$/i.test(inp?.tagName)) val = V(inp);
      }
      if (val) out.push(`${k} ${val}`);
    });
    return out;
  }

  // Extract table rows (Seguimiento / Gestiones)
  function readTable(container) {
    if (!container) return [];
    const out = [];
    qq('table', container).forEach(t => {
      qq('tbody tr', t).forEach(tr => {
        const cells = qq('td', tr).map(td => (td.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
        if (cells.length) out.push('• ' + cells.join(' — '));
      });
    });
    return out;
  }

  // ===== BUILD PAYLOAD =====
  function buildPayload() {
    const view = detectView();
    const out = [];

    if (view === 'seguimiento') {
      // -- Detalle del envío --
      const resume = q('#resume');
      if (resume) {
        out.push('Detalle del envío:');
        out.push(...readFieldset(resume).map(l => '• ' + l));
        out.push('');
      }
      // -- Remitente --
      const sender = q('#sender');
      if (sender) {
        out.push('Remitente:');
        out.push(...readFieldset(sender).map(l => '• ' + l));
        out.push('');
      }
      // -- Destinatario --
      const consignee = q('#consignee');
      if (consignee) {
        out.push('Destinatario:');
        out.push(...readFieldset(consignee).map(l => '• ' + l));
        out.push('');
      }
      // -- Datos del Envío --
      const data = q('#data');
      if (data) {
        out.push('Datos del Envío:');
        out.push(...readFieldset(data).map(l => '• ' + l));
        out.push('');
      }
      // -- Seguimiento --
      const status = q('#shippingStatus');
      if (status) {
        const rows = readTable(status);
        if (rows.length) { out.push('Seguimiento:'); out.push(...rows); out.push(''); }
      }
      // -- Gestiones --
      const mgmt = q('#management');
      if (mgmt) {
        const rows = readTable(mgmt);
        if (rows.length) { out.push('Gestiones:'); out.push(...rows); out.push(''); }
      }

    } else {
      // INCIDENCIAS view (envios1 / incidencias)
      // -- Datos del Envío --
      const resumeShip = q('#resumeShipping');
      if (resumeShip) {
        out.push('Datos del Envío:');
        out.push(...readFieldset(resumeShip).map(l => '• ' + l));
        out.push('');
      }
      // -- Datos de la incidencia --
      const resumeInc = q('#resumeIncidence');
      if (resumeInc) {
        out.push('Datos de la incidencia:');
        out.push(...readFieldset(resumeInc).map(l => '• ' + l));
        out.push('');
      }
      // -- Datos de destino --
      const resumeSender = q('#resumeSender');
      if (resumeSender) {
        out.push('Datos de destino:');
        out.push(...readFieldset(resumeSender).map(l => '• ' + l));
        out.push('');
      }
      // -- Seguimientos --
      const tracingList = q('#manageTracingList');
      if (tracingList) {
        const rows = readTable(tracingList);
        if (rows.length) { out.push('Seguimientos:'); out.push(...rows); out.push(''); }
      }
    }

    // ==== COMMON: Comunicaciones del envío (#shippingCommunications) ====
    const scEl = document.getElementById('shippingCommunications');
    if (scEl) {
      const rows = readTable(scEl);
      if (rows.length) {
        out.push('Comunicaciones del envío:');
        out.push(...rows);
        out.push('');
      } else {
        const raw = (scEl.textContent || '').replace(/\s+/g, ' ').trim();
        if (raw) { out.push('Comunicaciones del envío:'); out.push('• ' + raw); out.push(''); }
      }
    }

    // ==== COMMON: Enlaces ====
    const ship = V(q('#numEnvio')) || V(q('#shippingNumber')) || V(q('[id*="shippingNumber"]'));
    const ref  = V(q('#referencia')) || V(q('#reference')) || V(q('[id*="reference"]'));
    if (ship || ref) {
      out.push('Enlaces:');
      if (ref)  out.push(`• Pedido (ref): ${ORDERS_URL(ref)}`);
      if (ship) out.push(`• Seguimiento CEX: ${CEX_TRACK(ship)}`);
      out.push('');
    }

    if (!out.join('').trim()) out.push('No se pudo localizar ninguna sección reconocible.');
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ==== UI ====
  function addButton() {
    if (document.getElementById(BTN_ID)) return;
    const anchor =
      q('#resume legend')?.parentElement ||
      q('#resumeShipping legend')?.parentElement ||
      q('#shippingNumber')?.parentElement ||
      q('legend')?.parentElement ||
      q('h1, h2, .portlet-title') ||
      document.body;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '📋 Copiar trazabilidad';
    btn.style.cssText = 'margin-left:10px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', async () => {
      await sleep(60);
      copyText(buildPayload());
      btn.textContent = '✅ Copiado';
      setTimeout(() => { btn.textContent = '📋 Copiar trazabilidad'; }, 1400);
    });
    anchor.appendChild(btn);
  }

  function init() {
    addButton();
    const mo = new MutationObserver(() => { if (!document.getElementById(BTN_ID)) addButton(); });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 400);
})();
