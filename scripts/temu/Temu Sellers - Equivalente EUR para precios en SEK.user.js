// ==UserScript==
// @name         Temu Sellers - Equivalente EUR para precios en SEK
// @namespace    https://seller-eu.temu.com
// @version      1.0.0
// @description  Anade el equivalente en euros junto a precios en SEK (kr) en el mercado sueco de Temu (lista de pedidos).
// @match        https://seller-eu.temu.com/orders.html*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.frankfurter.app
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Sellers%20-%20Equivalente%20EUR%20para%20precios%20en%20SEK.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Sellers%20-%20Equivalente%20EUR%20para%20precios%20en%20SEK.user.js
// ==/UserScript==

(function () {
    'use strict';

    const RATE_KEY = 'tm_sek_eur_rate';
    const RATE_TS_KEY = 'tm_sek_eur_rate_ts';
    const TTL_MS = 6 * 60 * 60 * 1000;
    const FALLBACK_RATE = 0.087;
    const PRICE_RE = /(\d{1,3}(?:[\s\u00A0]\d{3})*(?:[,.]\d{1,2})?)\s*kr\b/i;
    const ANNOT_CLASS = 'tm-eur-equiv';

    let rate = FALLBACK_RATE;

    function loadCachedRate() {
        try {
            const r = parseFloat(GM_getValue(RATE_KEY, ''));
            const ts = GM_getValue(RATE_TS_KEY, 0);
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
                    url: 'https://api.frankfurter.app/latest?from=SEK&to=EUR',
                    timeout: 8000,
                    onload: (resp) => {
                        try {
                            const data = JSON.parse(resp.responseText);
                            const r = data && data.rates && data.rates.EUR;
                            if (r && isFinite(r)) {
                                rate = r;
                                GM_setValue(RATE_KEY, String(r));
                                GM_setValue(RATE_TS_KEY, Date.now());
                                console.log('[Temu SEK->EUR] Tasa actualizada:', r);
                                return resolve(true);
                            }
                        } catch (_) {}
                        console.log('[Temu SEK->EUR] Respuesta invalida, fallback', FALLBACK_RATE);
                        resolve(false);
                    },
                    onerror: () => { console.log('[Temu SEK->EUR] Error fetch'); resolve(false); },
                    ontimeout: () => { console.log('[Temu SEK->EUR] Timeout'); resolve(false); },
                });
            } catch (e) { resolve(false); }
        });
    }

    function parseSek(str) {
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

        const sek = parseSek(m[1]);
        if (!isFinite(sek)) return;
        const eur = sek * rate;
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

    async function init() {
        if (loadCachedRate()) {
            console.log('[Temu SEK->EUR] Tasa cacheada:', rate);
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
