// ==UserScript==
// @name         Temu Sellers - Equivalente EUR para precios en SEK/DKK/NOK
// @namespace    https://seller-eu.temu.com
// @version      1.1.0
// @description  Anade el equivalente en euros junto a precios en "kr" (SEK/DKK/NOK) en Temu Sellers (lista de pedidos y detalle). Moneda activa configurable desde el menu de Tampermonkey.
// @match        https://seller-eu.temu.com/orders.html*
// @match        https://seller-eu.temu.com/order-detail.html*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      api.frankfurter.app
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Sellers%20-%20Equivalente%20EUR%20para%20precios%20en%20SEK.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Sellers%20-%20Equivalente%20EUR%20para%20precios%20en%20SEK.user.js
// ==/UserScript==

(function () {
    'use strict';

    const TTL_MS = 6 * 60 * 60 * 1000;
    const FALLBACK_RATES = { SEK: 0.087, DKK: 0.134, NOK: 0.085 };
    const SUPPORTED = ['SEK', 'DKK', 'NOK'];
    const CURRENCY_KEY = 'tm_kr_currency';
    const PRICE_RE = /(\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,.]\d{1,2})?)\s*kr\b/i;
    const ANNOT_CLASS = 'tm-eur-equiv';

    let currency = GM_getValue(CURRENCY_KEY, 'SEK');
    if (!SUPPORTED.includes(currency)) currency = 'SEK';
    let rate = FALLBACK_RATES[currency];

    const rateKey = (cur) => `tm_${cur.toLowerCase()}_eur_rate`;
    const rateTsKey = (cur) => `tm_${cur.toLowerCase()}_eur_rate_ts`;

    function loadCachedRate() {
        try {
            const r = parseFloat(GM_getValue(rateKey(currency), ''));
            const ts = GM_getValue(rateTsKey(currency), 0);
            if (isFinite(r) && r > 0 && (Date.now() - ts) < TTL_MS) {
                rate = r;
                return true;
            }
        } catch (_) {}
        return false;
    }

    function fetchRate() {
        return new Promise(resolve => {
            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `https://api.frankfurter.app/latest?from=${currency}&to=EUR`,
                    timeout: 8000,
                    onload: (resp) => {
                        try {
                            const data = JSON.parse(resp.responseText);
                            const r = data && data.rates && data.rates.EUR;
                            if (r && isFinite(r)) {
                                rate = r;
                                GM_setValue(rateKey(currency), String(r));
                                GM_setValue(rateTsKey(currency), Date.now());
                                console.log(`[Temu ${currency}->EUR] Tasa actualizada:`, r);
                                return resolve(true);
                            }
                        } catch (_) {}
                        console.log(`[Temu ${currency}->EUR] Respuesta invalida, fallback`, FALLBACK_RATES[currency]);
                        resolve(false);
                    },
                    onerror: () => { console.log(`[Temu ${currency}->EUR] Error fetch`); resolve(false); },
                    ontimeout: () => { console.log(`[Temu ${currency}->EUR] Timeout`); resolve(false); },
                });
            } catch (e) { resolve(false); }
        });
    }

    function parseKr(str) {
        const cleaned = str.replace(/[\s\u00A0]/g, '');
        if (cleaned.includes('.') && cleaned.includes(',')) {
            return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
        }
        if (cleaned.includes(',') && !cleaned.includes('.')) {
            return parseFloat(cleaned.replace(',', '.'));
        }
        const m = cleaned.match(/^(\d+)\.(\d{3})$/);
        if (m) return parseFloat(m[1] + m[2]);
        return parseFloat(cleaned);
    }

    function formatEur(n) {
        return n.toFixed(2).replace('.', ',') + ' €';
    }

    function annotateTextNode(textNode) {
        const m = textNode.nodeValue.match(PRICE_RE);
        if (!m) return;
        const parent = textNode.parentNode;
        if (!parent) return;
        const next = textNode.nextSibling;
        if (next && next.nodeType === 1 && next.classList && next.classList.contains(ANNOT_CLASS)) return;

        const amount = parseKr(m[1]);
        if (!isFinite(amount)) return;
        const eur = amount * rate;
        const span = document.createElement('span');
        span.className = ANNOT_CLASS;
        span.style.cssText = 'color:#2563eb;font-size:0.9em;margin-left:4px;white-space:nowrap;';
        span.textContent = `(≈ ${formatEur(eur)})`;
        parent.insertBefore(span, textNode.nextSibling);
    }

    function annotateAll(root) {
        const target = root || document.body;
        if (!target) return;
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
            acceptNode: (n) => {
                if (!n.nodeValue || !/kr\b/i.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
                if (!PRICE_RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
                if (n.parentElement && n.parentElement.classList &&
                    n.parentElement.classList.contains(ANNOT_CLASS)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(annotateTextNode);
    }

    function removeAnnotations() {
        document.querySelectorAll('.' + ANNOT_CLASS).forEach(el => el.remove());
    }

    async function reloadCurrency(newCur) {
        if (!SUPPORTED.includes(newCur) || newCur === currency) return;
        currency = newCur;
        GM_setValue(CURRENCY_KEY, currency);
        rate = FALLBACK_RATES[currency];
        removeAnnotations();
        if (!loadCachedRate()) await fetchRate();
        annotateAll();
        console.log(`[Temu kr->EUR] Moneda activa: ${currency} (tasa ${rate})`);
    }

    function registerMenu() {
        try {
            SUPPORTED.forEach(cur => {
                const label = cur === currency ? `Moneda: ${cur} ✓` : `Cambiar a ${cur}`;
                GM_registerMenuCommand(label, () => reloadCurrency(cur));
            });
            GM_registerMenuCommand('Forzar refresco de tasa', async () => {
                GM_setValue(rateTsKey(currency), 0);
                await fetchRate();
                removeAnnotations();
                annotateAll();
            });
        } catch (_) {}
    }

    async function init() {
        registerMenu();
        if (loadCachedRate()) {
            console.log(`[Temu ${currency}->EUR] Tasa cacheada:`, rate);
        } else {
            await fetchRate();
        }

        annotateAll();
        let t = null;
        const mo = new MutationObserver(() => {
            clearTimeout(t);
            t = setTimeout(() => annotateAll(), 300);
        });
        mo.observe(document.body, { childList: true, subtree: true });
    }

    setTimeout(init, 800);
})();
