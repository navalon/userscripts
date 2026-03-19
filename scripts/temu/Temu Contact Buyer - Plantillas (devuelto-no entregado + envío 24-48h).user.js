// ==UserScript==
// @name         Temu Contact Buyer - Plantillas (devuelto/no entregado + envío 24/48h)
// @namespace    https://seller-eu.temu.com
// @version      1.1
// @description  Añade botones encima de "Vista previa" para pegar mensajes predefinidos en Contactar al comprador.
// @match        https://seller-eu.temu.com/contact-buyer.html*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // --- Selectores estables (por data-testid) ---
  const TEXTAREA_SEL = 'textarea[data-testid="beast-core-textArea-htmlInput"]';
  const PREVIEW_BTN_SEL = 'button[data-testid="beast-core-button"]';

  // ID único para evitar duplicados
  const WIDGET_ID = 'tm-contactbuyer-templates-widget';

  // =========================
  // Plantillas
  // =========================
  function tplUndeliveredReturned() {
    // Evita pedir explícitamente "reembolso/cancelación" para no chocar con Temu
    return (
`Hola,
Te informamos de que el envío no ha podido entregarse y el paquete nos ha sido devuelto por la mensajería.
Por este motivo, este pedido ya no llegará a tu dirección.

Temu gestionará el cierre del pedido según su proceso (puedes revisar el estado en tu cuenta).
Si necesitas ayuda adicional, por favor contacta con el soporte de Temu desde la app/web.

Gracias.`
    ).trim();
  }

  function tplShipIn24_48() {
    return (
`Hola,
Queremos informarte de que el pedido no se había enviado todavía porque nos faltaba un artículo para completarlo. Ya lo hemos recibido y procedemos al envío.

En condiciones normales, deberías recibirlo en las próximas 24–48 horas laborables.

Gracias por tu paciencia.`
    ).trim();
  }

  // =========================
  // Utilidades
  // =========================
  function isPreviewButton(btn) {
    if (!btn) return false;
    const txt = (btn.innerText || btn.textContent || '').trim().toLowerCase();
    return txt.includes('vista previa') || txt.includes('preview');
  }

  function findPreviewButton() {
    const buttons = Array.from(document.querySelectorAll(PREVIEW_BTN_SEL));
    return buttons.find(isPreviewButton) || null;
  }

  // React-controlled textarea safe set
  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
  }

  function fillTextarea(text) {
    const ta = document.querySelector(TEXTAREA_SEL);
    if (!ta) return false;

    setNativeValue(ta, text);

    // React suele escuchar input/change
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    ta.focus();
    return true;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.zIndex = '999999';
    t.style.right = '18px';
    t.style.bottom = '18px';
    t.style.padding = '8px 10px';
    t.style.borderRadius = '10px';
    t.style.background = 'rgba(0,0,0,0.75)';
    t.style.color = '#fff';
    t.style.fontSize = '12px';
    t.style.fontWeight = '700';
    t.style.boxShadow = '0 8px 20px rgba(0,0,0,0.18)';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1100);
  }

  function pasteWithRetry(text) {
    const ok = fillTextarea(text);
    if (ok) {
      toast('Pegado ✓');
      return;
    }
    // Si aún no existe el textarea, reintenta un poco
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      if (fillTextarea(text) || tries >= 20) {
        if (tries < 20) toast('Pegado ✓');
        else toast('No encuentro la caja…');
        clearInterval(iv);
      }
    }, 250);
  }

  // =========================
  // UI Widget
  // =========================
  function ensureWidget() {
    const previewBtn = findPreviewButton();
    if (!previewBtn) return false;

    // Evitar duplicado
    if (document.getElementById(WIDGET_ID)) return true;

    const container = document.createElement('div');
    container.id = WIDGET_ID;
    container.style.display = 'block';
    container.style.margin = '10px 0';
    container.style.padding = '10px';
    container.style.border = '1px solid rgba(0,0,0,0.12)';
    container.style.borderRadius = '10px';
    container.style.background = 'rgba(0,0,0,0.02)';

    const title = document.createElement('div');
    title.textContent = 'Plantillas rápidas';
    title.style.fontSize = '12px';
    title.style.fontWeight = '700';
    title.style.opacity = '0.8';
    title.style.marginBottom = '8px';

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '10px';
    row.style.alignItems = 'center';
    row.style.flexWrap = 'wrap';

    function makeBtn(label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.style.padding = '8px 10px';
      btn.style.borderRadius = '10px';
      btn.style.border = '0';
      btn.style.cursor = 'pointer';
      btn.style.fontWeight = '700';
      btn.style.background = '#ff6200';
      btn.style.color = '#fff';
      return btn;
    }

    // Botón 1: Devuelto / no entregado
    const btnUndelivered = makeBtn('Devuelto / no entregado');
    btnUndelivered.addEventListener('click', () => pasteWithRetry(tplUndeliveredReturned()));

    // Botón 2: Envío 24/48h
    const btnShip = makeBtn('Envío 24/48h');
    btnShip.addEventListener('click', () => pasteWithRetry(tplShipIn24_48()));

    // Expandidor para ver/editar textos (opcional, sin clicks extra obligatorios)
    const details = document.createElement('details');
    details.style.marginTop = '10px';

    const summary = document.createElement('summary');
    summary.textContent = 'Ver / editar textos';
    summary.style.cursor = 'pointer';
    summary.style.fontWeight = '600';

    const editor1Label = document.createElement('div');
    editor1Label.textContent = 'Devuelto / no entregado:';
    editor1Label.style.marginTop = '10px';
    editor1Label.style.fontSize = '12px';
    editor1Label.style.fontWeight = '600';

    const editor1 = document.createElement('textarea');
    editor1.value = tplUndeliveredReturned();
    editor1.style.width = '100%';
    editor1.style.minHeight = '90px';
    editor1.style.marginTop = '6px';
    editor1.style.padding = '10px';
    editor1.style.borderRadius = '10px';
    editor1.style.border = '1px solid rgba(0,0,0,0.18)';
    editor1.style.fontFamily = 'inherit';
    editor1.style.fontSize = '13px';
    editor1.maxLength = 600;

    const editor2Label = document.createElement('div');
    editor2Label.textContent = 'Envío 24/48h:';
    editor2Label.style.marginTop = '10px';
    editor2Label.style.fontSize = '12px';
    editor2Label.style.fontWeight = '600';

    const editor2 = document.createElement('textarea');
    editor2.value = tplShipIn24_48();
    editor2.style.width = '100%';
    editor2.style.minHeight = '80px';
    editor2.style.marginTop = '6px';
    editor2.style.padding = '10px';
    editor2.style.borderRadius = '10px';
    editor2.style.border = '1px solid rgba(0,0,0,0.18)';
    editor2.style.fontFamily = 'inherit';
    editor2.style.fontSize = '13px';
    editor2.maxLength = 600;

    // Si editas en el expandidor, que los botones peguen lo editado
    btnUndelivered.addEventListener('click', () => pasteWithRetry(editor1.value.trim()));
    btnShip.addEventListener('click', () => pasteWithRetry(editor2.value.trim()));

    details.appendChild(summary);
    details.appendChild(editor1Label);
    details.appendChild(editor1);
    details.appendChild(editor2Label);
    details.appendChild(editor2);

    row.appendChild(btnUndelivered);
    row.appendChild(btnShip);

    const hint = document.createElement('div');
    hint.textContent = 'Un clic: pega el texto en la caja.';
    hint.style.fontSize = '12px';
    hint.style.opacity = '0.7';

    container.appendChild(title);
    container.appendChild(row);
    container.appendChild(hint);
    container.appendChild(details);

    // Insertar justo encima del botón "Vista previa"
    const parent = previewBtn.parentElement;
    if (!parent) return false;

    parent.insertBefore(container, previewBtn);
    return true;
  }

  function boot() {
    ensureWidget();

    // Observa cambios (Temu re-renderiza mucho)
    const mo = new MutationObserver(() => {
      ensureWidget();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  setTimeout(boot, 600);
})();
