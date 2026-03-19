// ==UserScript==
// @name         CEX: Copiar trazabilidad (incidencias /envios1)
// @namespace    https://saquitodelasalud.com
// @version      1.1
// @description  Copia todos los datos útiles de la incidencia (envío, incidencia, destino y seguimientos) en /group/correosexpress/envios1
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const BTN_ID = 'cex-copy-trace-inc-btn';

  // -------- utils --------
  const q  = (sel, root=document) => root.querySelector(sel);
  const qq = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function textFrom(el) {
    if (!el) return '';
    if ('value' in el && el.value != null) return String(el.value).trim();
    return (el.textContent || '').trim();
  }

  function toTitleCase(str='') {
    return str
      .toLowerCase()
      .replace(/([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)|(\s+|[’'\-]+)/g, (m, word, sep) => sep ? sep : word.charAt(0).toUpperCase() + word.slice(1))
      .replace(/\b(De|Del|La|Las|El|Los|Y|O|A|En|Por|Para|Con|Al)\b/g, s => s.toLowerCase());
  }

  function getMainRoot() {
    const el = q('#shippingNumber');
    if (el) {
      return el.closest('form, .portlet, .portlet-boundary, .content, .container, main, #content') || document.body;
    }
    return document.body;
  }

  // -------- extractores --------
  function extractDatosEnvio(root) {
    const out = [];
    const envio   = textFrom(q('#shippingNumber', root));
    const ref     = textFrom(q('#reference', root));
    const fecha   = textFrom(q('#dateShipping', root));

    out.push('Datos del Envío:');
    if (envio) out.push(`• Envío: ${envio}`);
    if (ref)   out.push(`• Referencia: ${ref}`);
    if (fecha) out.push(`• Fecha: ${fecha}`);

    return out;
  }

  function extractDatosIncidencia(root) {
    const out = [];
    const incidencia = textFrom(q('#incidence', root));
    const fechaInc   = textFrom(q('#incidenceDateComplete', root)) ||
                       [textFrom(q('#incidenceDate', root)), textFrom(q('#incidenceDateHour', root))].filter(Boolean).join(' ');
    const delegacion = textFrom(q('#delegation', root));

    out.push('');
    out.push('Datos de la incidencia:');
    if (incidencia) out.push(`• Incidencia: ${incidencia}`);
    if (fechaInc)  out.push(`• Fecha incidencia: ${fechaInc}`);
    if (delegacion) out.push(`• Delegación: ${delegacion}`);

    return out;
  }

  function extractDatosDestino(root) {
    const out = [];
    const contacto = toTitleCase(textFrom(q('#contact', root)));
    const telefono = textFrom(q('#phone', root));
    const email    = textFrom(q('#email', root));
    const nombre   = toTitleCase(textFrom(q('#name', root)));

    let pais = '';
    const selPais = q('#country', root);
    if (selPais) {
      const opt = selPais.options[selPais.selectedIndex];
      pais = opt ? (opt.text || opt.value || '').trim() : '';
    }

    const cpCity = textFrom(q('#cpCity', root));
    const cp     = textFrom(q('#cp', root));
    const city   = textFrom(q('#city', root));

    const calle  = textFrom(q('#addressStreet', root));
    const numero = textFrom(q('#addressNumber', root));
    const rest   = textFrom(q('#addressRest', root));
    const direccion = [calle, numero, rest].filter(Boolean).join(', ');

    const observ = textFrom(q('#observations', root));

    out.push('');
    out.push('Datos de destino:');
    if (contacto) out.push(`• Contacto: ${contacto}`);
    if (telefono) out.push(`• Teléfono: ${telefono}`);
    if (email)    out.push(`• Correo Electrónico: ${email}`);
    if (nombre)   out.push(`• Nombre: ${nombre}`);
    if (pais)     out.push(`• País: ${pais}`);
    if (cpCity)   out.push(`• CP/Población (visual): ${cpCity}`);
    if (cp || city) out.push(`• CP: ${cp || '(s/d)'} — Población: ${city || '(s/d)'}`);
    if (direccion) out.push(`• Dirección: ${direccion}`);
    if (observ)    out.push(`• Observaciones: ${observ}`);

    return out;
  }

  // --- NUEVO: Seguimientos específicos de incidencias (fieldset#manageTracingList / table#manageTracingListTable)
  function extractSeguimiento(root) {
    // 1) Prioriza la tabla con ID específico que nos pasaste
    const t = q('#manageTracingListTable', root);
    if (t) {
      const rows = [];
      qq('tbody tr', t).forEach(tr => {
        const tds = qq('td', tr).map(td => (td.textContent || '').trim());
        if (tds.length >= 3) {
          const [fecha, usuario, texto] = tds;
          rows.push(`• ${fecha} — ${usuario} — ${texto}`);
        } else if (tds.length === 2) {
          rows.push(`• ${tds[0]} — ${tds[1]}`);
        } else if (tds.length === 1) {
          rows.push(`• ${tds[0]}`);
        }
      });
      return rows;
    }

    // 2) Fallback genérico (por si en otras incidencias cambia la estructura)
    let generic = null;
    for (const tab of qq('table', root)) {
      const hdrs = qq('th', tab).map(th => (th.textContent || '').trim().toLowerCase());
      if (hdrs.includes('fecha') && (hdrs.includes('usuario') || hdrs.some(h => /situaci[oó]n/.test(h)))) {
        generic = tab; break;
      }
    }
    if (!generic) return [];

    const out = [];
    qq('tbody tr, tr[data-row], tr', generic).forEach(tr => {
      const tds = qq('td', tr).map(td => (td.textContent || '').trim());
      if (tds.length >= 3) out.push(`• ${tds[0]} — ${tds[1]} — ${tds[2]}`);
      else if (tds.length === 2) out.push(`• ${tds[0]} — ${tds[1]}`);
      else if (tds.length === 1) out.push(`• ${tds[0]}`);
    });
    return out;
  }

  function buildPayload() {
    const root = getMainRoot();
    const lines = [];

    const numEnvio = textFrom(q('#shippingNumber', root));
    if (numEnvio) {
      lines.push(`Número de envío: ${numEnvio}`);
      lines.push('');
    }

    lines.push(...extractDatosEnvio(root));
    lines.push(...extractDatosIncidencia(root));
    lines.push(...extractDatosDestino(root));

    const seg = extractSeguimiento(root);
    if (seg.length) {
      lines.push('');
      lines.push('Seguimiento del envío:');
      lines.push(...seg);
    }

    return lines.join('\n');
  }

  function copyText(text) {
    if (!text) return;
    try {
      if (typeof GM_setClipboard === 'function') { GM_setClipboard(text); return true; }
    } catch {}
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text).catch(()=>{}); return true; }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
    return true;
  }

  // -------- UI --------
  function addButton() {
    if (document.getElementById(BTN_ID)) return;

    const root = getMainRoot();
    const anchor = q('#shippingNumber', root)?.parentElement ||
                   q('legend, .portlet-title, h1, h2', root) ||
                   root;

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = '📋 Copiar trazabilidad (incidencia)';
    btn.style.cssText = 'margin-left:10px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';

    btn.addEventListener('click', async () => {
      await sleep(60);
      const payload = buildPayload();
      copyText(payload);
      btn.textContent = '✅ Copiado';
      setTimeout(() => { btn.textContent = '📋 Copiar trazabilidad (incidencia)'; }, 1400);
    });

    anchor.appendChild(btn);
  }

  function init() {
    addButton();
    const mo = new MutationObserver(() => {
      if (!document.getElementById(BTN_ID)) addButton();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(init, 600);
})();
