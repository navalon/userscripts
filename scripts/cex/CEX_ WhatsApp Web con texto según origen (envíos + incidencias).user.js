// ==UserScript==
// @name         CEX: WhatsApp Web con texto según origen (envíos + incidencias)
// @namespace    https://saquitodelasalud.com
// @version      3.0
// @description  Botón WhatsApp con mensaje personalizado para Temu/Amazon/AliExpress/Web. Funciona en /envios y /envios1.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const DEFAULT_CC = '34';
  const BTN_ID = 'wa-web-open-btn';

  // --- utils DOM ---
  const $id = (id) => document.getElementById(id);
  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const getValById = (id) => {
    const el = $id(id);
    if (!el) return '';
    return ('value' in el ? el.value : el.textContent || '').trim();
  };

  // --- helpers ---
  function normalizePhone(raw) {
    if (!raw) return '';
    let s = String(raw).trim();
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (s.startsWith('+')) s = '+' + s.slice(1).replace(/\D/g, '');
    else s = s.replace(/\D/g, '');
    if (!s.startsWith('+')) {
      if (/^[6789]\d{8}$/.test(s) || /^\d{9,15}$/.test(s)) s = '+' + DEFAULT_CC + s;
    }
    return /^\+\d{8,15}$/.test(s) ? s : '';
  }

  function parseEstado(raw) {
    if (!raw) return '';
    const sinFecha = raw.split(' - ')[0]; // "EN ARRASTRE - 22/08/25 18:59" -> "EN ARRASTRE"
    const partes = sinFecha.split(':');
    return partes.length > 1 ? partes.slice(1).join(':').trim() : sinFecha.trim();
  }

  const firstName = (s) => (s || '').trim().split(/\s+/)[0] || '';

  // --- detectar origen + orderId ---
  function detectOrigin({ observations, email }) {
    const obs = (observations || '').trim();
    const mail = (email || '').trim();

    // TEMU: correo ...@temuemail.com o PO-... en Observaciones
    if (/temuemail\.com/i.test(mail) || /^PO-\d+/i.test(obs)) {
      // Extra PO completa si está en observaciones o en un <a> del dock
      let order = (obs.match(/PO-\d+(?:-\d+)+/i) || [])[0] || '';
      if (!order) {
        const aTemu = $('a[href*="seller-eu.temu.com"][data-po]');
        if (aTemu && aTemu.getAttribute('data-po')) order = aTemu.getAttribute('data-po').trim();
      }
      return { source: 'temu', orderId: order };
    }

    // AMAZON: patrón 3-7-7 (p.ej. 171-6125471-4135519) o texto AMAZON ORDER ID:
    const amzMatch = obs.match(/\b\d{3}-\d{7}-\d{7}\b/);
    if (/AMAZON ORDER ID/i.test(obs) || amzMatch) {
      return { source: 'amazon', orderId: amzMatch ? amzMatch[0] : obs.replace(/.*AMAZON ORDER ID:\s*/i,'').trim() };
    }

    // ALIEXPRESS: número largo (15-20 dígitos) sin guiones; suele venir solo en Observaciones
    const aeMatch = obs.match(/\b\d{15,20}\b/);
    if (aeMatch) {
      return { source: 'aliexpress', orderId: aeMatch[0] };
    }

    // WEB propia (fallback)
    return { source: 'web', orderId: '' };
  }

  // --- recoger campos en ambas vistas ---
  function grabFieldsUniversal() {
    // Teléfono
    let telefono = getValById('destinatarioTelefono') ||
                   getValById('destinatarioTelefonoCons2');
    if (!telefono) {
      const lbl = $$('label').find(l => /tel[eé]fono/i.test(l.textContent || ''));
      if (lbl) {
        const id = lbl.getAttribute('for');
        if (id) telefono = getValById(id);
      }
      if (!telefono) {
        const telInput = $('input[type="tel"], input[placeholder*="Tel"], input[placeholder*="tel"]');
        if (telInput) telefono = (telInput.value || '').trim();
      }
    }

    // Nombre
    let nombre = getValById('destinatarioNombre');
    if (!nombre) {
      const lbl = $$('label').find(l => /nombre/i.test(l.textContent || ''));
      if (lbl) {
        const id = lbl.getAttribute('for');
        if (id) nombre = getValById(id);
      }
    }

    // Email
    const email = getValById('destinatarioEmail');

    // Observaciones (varía id y name entre vistas)
    const observations =
      getValById('observationes') || // /envios
      getValById('observaciones') || // /envios (otra variante)
      getValById('observations');    // /envios1

    // Estado
    let estadoRaw  = getValById('estado');
    if (!estadoRaw) {
      const lblE = $$('label').find(l => /estado/i.test(l.textContent || ''));
      if (lblE) {
        const id = lblE.getAttribute('for');
        if (id) estadoRaw = getValById(id);
      }
    }

    // Nº envío (envíos: numEnvio/nenvio; incidencias: shippingNumber)
    const numEnvio = getValById('numEnvio') || getValById('nenvio') || getValById('shippingNumber') || '';

    // Referencias internas (para web propia, como 97407 / 6432ga)
    const referencia = getValById('referencia') || getValById('numEnvio_cliente') || '';

    return {
      telefono: normalizePhone(telefono),
      nombre, email,
      observations,
      estado: parseEstado(estadoRaw),
      numEnvio, referencia
    };
  }

  // --- plantillas de mensaje ---
  function buildMessage({ origen, nombre, orderId, numEnvio, referencia, estado }) {
    const n = firstName(nombre);
    const base = `Hola ${n || ''}`.trim() + ', le escribimos de Trade Play SLU';

    switch (origen) {
      case 'temu':
        return `${base} por su pedido de Temu ${orderId || ''}. Su envío (nº ${numEnvio}) presenta una incidencia/estado: ${estado || 'Incidencia en el envío'}.`;
      case 'amazon':
        return `${base} por su pedido de Amazon ${orderId || ''}. Su envío (nº ${numEnvio}) presenta el estado: ${estado || 'Incidencia en el envío'}.`;
      case 'aliexpress':
        return `${base} por su pedido de AliExpress ${orderId || ''}. Su envío (nº ${numEnvio}) presenta el estado: ${estado || 'Incidencia en el envío'}.`;
      default: // web
        return `${base} por su pedido en saquitodelasalud.com${referencia ? ` (ref. ${referencia})` : ''}. Su envío (nº ${numEnvio}) presenta el estado: ${estado || 'Incidencia en el envío'}.`;
    }
  }

  // abrir WhatsApp Web con texto
  async function openWhatsAppWithText(e164, text) {
    if (!e164) { alert('No hay teléfono válido'); return; }
    const digits = e164.replace('+', '');
    const webUrl = `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;

    let opened = false;
    try {
      const a = document.createElement('a');
      a.href = webUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      opened = true;
    } catch {}
    if (!opened) {
      try { window.open(webUrl, '_blank', 'noopener,noreferrer'); opened = true; } catch {}
    }
    if (!opened && navigator.clipboard && text) {
      try { await navigator.clipboard.writeText(text); } catch {}
      alert('No pude abrir WhatsApp Web. He copiado el mensaje al portapapeles. Abre web.whatsapp.com y pega (Ctrl+V).');
    }
  }

  function buildAndSend() {
    const f = grabFieldsUniversal();
    const { source, orderId } = detectOrigin({ observations: f.observations, email: f.email });
    const text = buildMessage({
      origen: source,
      nombre: f.nombre || '',
      orderId: orderId || '',
      numEnvio: f.numEnvio || '(sin nº de envío)',
      referencia: f.referencia || '',
      estado: f.estado || 'Incidencia en el envío'
    });
    openWhatsAppWithText(f.telefono, text);
  }

  // --- insertar botón ---
  function mountButton() {
    if ($id(BTN_ID)) return;

    // Preferimos colocarlo junto al teléfono
    const candidates = ['#destinatarioTelefono', '#destinatarioTelefonoCons2'];
    let anchor = null;
    for (const sel of candidates) {
      const el = $(sel);
      if (el) { anchor = el; break; }
    }
    if (!anchor) {
      const lab = $$('label').find(l => /tel[eé]fono/i.test(l.textContent || ''));
      if (lab) {
        const id = lab.getAttribute('for');
        anchor = id ? $(`#${CSS.escape(id)}`) : lab;
      }
    }

    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.textContent = 'WhatsApp (Web)';
    btn.style.cssText = 'margin-left:8px;padding:6px 10px;border-radius:8px;border:1px solid #25D366;background:#25D366;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', buildAndSend);

    if (anchor) {
      try { anchor.insertAdjacentElement('afterend', btn); }
      catch { (anchor.parentElement || anchor).appendChild(btn); }
    } else {
      const floater = document.createElement('div');
      floater.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999';
      floater.appendChild(btn);
      document.body.appendChild(floater);
    }
  }

  function init() {
    mountButton();
    const mo = new MutationObserver(() => { mountButton(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }
  init();
})();
