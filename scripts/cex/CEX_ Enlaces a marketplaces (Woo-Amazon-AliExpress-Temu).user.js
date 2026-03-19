// ==UserScript==
// @name         CEX: Enlaces a marketplaces (Woo/Amazon/AliExpress/Temu)
// @namespace    https://saquitodelasalud.com
// @version      1.3
// @description  Botones: Ver en Woo, Ver en Amazon, Ver en AliExpress y Ver en Temu (si hay PO-...). Funciona en /envios y /envios1.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const IDS = {
    woo: 'cex-view-woo-btn',
    amz: 'cex-view-amz-btn',
    ali: 'cex-view-ae-btn',
    temu: 'temu-link-btn'
  };

  // ---------- utils ----------
  const $id = (id) => document.getElementById(id);
  const $  = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const getValById = (id) => {
    const el = $id(id);
    if (!el) return '';
    return ('value' in el ? el.value : el.textContent || '').trim();
  };

  // Lee referencia en ambas vistas:
  //  - Incidencias (/envios1):   #reference
  //  - Seguimiento (/envios):    #referencia o #numEnvio_cliente
  function grabFields() {
    const referencia =
      getValById('reference') ||         // incidencias
      getValById('referencia') ||        // seguimiento
      getValById('numEnvio_cliente') || '';

    const email = getValById('destinatarioEmail') || '';
    const observations =
      getValById('observationes') ||
      getValById('observaciones') ||
      getValById('observations') || '';
    return { referencia, email, observations };
  }

  function detectOrigin({ observations, email }) {
    const obs = (observations || '').trim();
    const mail = (email || '').trim();
    if (/temuemail\.com/i.test(mail) || /\bPO-\d{3}-\d{8,20}\b/i.test(obs)) return 'temu';
    if (/\b\d{3}-\d{7}-\d{7}\b/.test(obs) || /AMAZON ORDER ID/i.test(obs)) return 'amazon';
    if (/\b\d{15,20}\b/.test(obs)) return 'aliexpress';
    return 'web';
  }

  // Woo ID: primer bloque de 3–10 dígitos dentro de referencias tipo "ga97709", "97709ga", "GA- 97709", etc.
  function extractWooId(refRaw='') {
    const m = (refRaw || '').match(/\d{3,10}/);
    return m ? m[0] : '';
  }

  const originToDomain = (o) => (o === 'temu' || o === 'aliexpress') ? 'artsans.es' : 'saquitodelasalud.com';
  const buildWooUrl = (origin, id) => id ? `https://${originToDomain(origin)}/wp-admin/post.php?post=${encodeURIComponent(id)}&action=edit` : '';

  const extractOrderIdAmazon = (obs) => (obs.match(/\b\d{3}-\d{7}-\d{7}\b/) || [null])[0];
  const extractOrderIdAli    = (obs) => (obs.match(/\b\d{15,20}\b/) || [null])[0];
  const extractPO            = (obs) => (obs.match(/\bPO-\d{3}-\d{8,20}\b/i) || [null])[0];

  const buildAmazonUrl = (id) => id ? `https://sellercentral.amazon.es/orders-v3/order/${id}` : '';
  const buildAliUrl    = (id) => id ? `https://gsp.aliexpress.com/m_apps/order-manage/orderDetail?orderId=${id}` : '';
  const buildTemuUrl   = (po) => po ? `https://seller-eu.temu.com/order-detail.html?parent_order_sn=${po}` : '';

  function btn(label, id, href, color) {
    const a = document.createElement('a');
    a.id = id;
    a.textContent = label;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = `margin-left:8px;padding:6px 10px;border-radius:6px;border:none;background:${color};color:#fff;font-weight:600;cursor:pointer;display:inline-block;text-decoration:none;`;
    if (href) { a.href = href; }
    else { a.href = '#'; a.style.opacity = '.65'; a.addEventListener('click', e => { e.preventDefault(); alert('No se pudo construir la URL de destino (revisa “Referencia”).'); }); }
    return a;
  }

  function mount() {
    // evita duplicados si CEX re-renderiza
    if ($id('cex-view-buttons-wrapper')) return;

    const { referencia, email, observations } = grabFields();
    const origin = detectOrigin({ observations, email });

    const wrapper = document.createElement('div');
    wrapper.id = 'cex-view-buttons-wrapper';
    wrapper.style.marginTop = '8px';

    // Woo
    const wooId = extractWooId(referencia);
    const wooLabel = (origin === 'temu' || origin === 'aliexpress') ? 'Ver en artsans.es' : 'Ver en saquitodelasalud.com';
    wrapper.appendChild(btn(wooLabel, IDS.woo, buildWooUrl(origin, wooId), '#6b7280'));

    // Amazon
    if (origin === 'amazon') {
      const amzId = extractOrderIdAmazon(observations);
      wrapper.appendChild(btn('Ver en Amazon', IDS.amz, buildAmazonUrl(amzId), '#FF9900'));
    }

    // AliExpress
    if (origin === 'aliexpress') {
      const aliId = extractOrderIdAli(observations);
      wrapper.appendChild(btn('Ver en AliExpress', IDS.ali, buildAliUrl(aliId), '#E62E04'));
    }

    // Temu
    const po = extractPO(observations);
    if (po) {
      const a = btn('Ver en Temu', IDS.temu, buildTemuUrl(po), '#7c3aed');
      a.setAttribute('data-po', po);
      wrapper.appendChild(a);
    }

    // Anclar junto al campo de referencia correcto en ambas vistas
    let anchor = $id('reference') || $id('referencia') || $id('numEnvio_cliente');
    if (!anchor) {
      const lab = $$('label').find(l => /referenc/i.test(l.textContent || ''));
      anchor = lab ? ($id(lab.getAttribute('for')) || lab) : null;
    }
    (anchor || document.body).insertAdjacentElement('afterend', wrapper);
  }

  function init() {
    mount();
    const mo = new MutationObserver(() => { mount(); });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  init();
})();
