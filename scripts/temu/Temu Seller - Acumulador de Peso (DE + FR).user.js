// ==UserScript==
// @name         Temu Seller - Acumulador de Peso (DE + FR)
// @namespace    https://temu.com/
// @version      1.2.1
// @description  Extrae el peso total de la página de etiquetas de envío de Temu y permite acumular el peso de los mercados Alemán y Francés
// @match        https://seller-eu.temu.com/manage-shipping-labels.html*
// @match        https://seller-fr.temu.com/manage-shipping-labels.html*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Seller%20-%20Acumulador%20de%20Peso%20%28DE%20%2B%20FR%29.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20Seller%20-%20Acumulador%20de%20Peso%20%28DE%20%2B%20FR%29.user.js
// ==/UserScript==
(function () {
    'use strict';

    /* =========================================================
       0. UTILIDADES (debounce, throttle)
       ========================================================= */
    function debounce(fn, delay) {
        let t = null;
        return function (...args) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    /* =========================================================
       1. DETECCIÓN DEL MERCADO
       ========================================================= */
    function detectMarket() {
        const url = window.location.href;
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('market');
        if (forced) return forced.toUpperCase();
        if (/seller-fr|fr\.temu|france/i.test(url)) return 'FR';
        if (/seller-eu|de\.temu|aleman|germany/i.test(url)) return 'DE';
        return 'DE';
    }

    let currentMarket = GM_getValue('lastMarket', detectMarket());

    /* =========================================================
       2. EXTRACCIÓN DEL PESO TOTAL — OPTIMIZADA
       =========================================================
       Mejoras:
       - Solo busca dentro del <table> principal (no toda la página)
       - Usa una sola consulta querySelectorAll en lugar de recorrer
         miles de nodos genéricos
       - Cachea el resultado durante 1 segundo para evitar trabajo
         repetido cuando el MutationObserver dispara seguido
       ========================================================= */
    let _cache = { total: 0, count: 0, ts: 0 };
    const CACHE_MS = 1000;

    function extractTotalWeight(force = false) {
        const now = Date.now();
        if (!force && now - _cache.ts < CACHE_MS) {
            return { total: _cache.total, count: _cache.count };
        }

        let total = 0;
        let count = 0;

        // 🔑 Limitamos la búsqueda a las tablas del contenido principal
        const scope = document.querySelector('main') || document.body;
        const tables = scope.querySelectorAll('table');

        tables.forEach(table => {
            // Solo cogemos celdas de la tabla; no recorremos toda la página
            const cells = table.querySelectorAll('td, .package-weight, span, div');
            // Buscamos pares "Peso del paquete:" + valor "X kg"
            const text = table.innerText || '';
            // Regex sobre el texto completo de la tabla — mucho más rápido
            const regex = /Peso del paquete[^0-9]*([\d.,]+)\s*kg/gi;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const v = parseFloat(m[1].replace(',', '.'));
                if (!isNaN(v)) {
                    total += v;
                    count++;
                }
            }
        });

        _cache = { total: +total.toFixed(3), count, ts: now };
        return { total: _cache.total, count: _cache.count };
    }

    /* =========================================================
       3. GESTIÓN DEL ACUMULADOR
       ========================================================= */
    function getAccumulated() {
        return {
            DE: parseFloat(GM_getValue('accum_DE', 0)) || 0,
            FR: parseFloat(GM_getValue('accum_FR', 0)) || 0,
        };
    }
    function saveAccumulated(acc) {
        GM_setValue('accum_DE', acc.DE);
        GM_setValue('accum_FR', acc.FR);
    }
    function addToAccumulator(market, value) {
        const acc = getAccumulated();
        acc[market] = +(acc[market] + value).toFixed(3);
        saveAccumulated(acc);
        refreshPanel(true);
    }
    function resetMarket(market) {
        const acc = getAccumulated();
        acc[market] = 0;
        saveAccumulated(acc);
        refreshPanel(true);
    }
    function resetAll() {
        saveAccumulated({ DE: 0, FR: 0 });
        refreshPanel(true);
    }

    /* =========================================================
       4. PANEL FLOTANTE
       ========================================================= */
    const PANEL_ID = 'temu-weight-panel';

    function createPanel() {
        if (document.getElementById(PANEL_ID)) return;

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="twp-header">
                📦 Acumulador de Peso
                <span class="twp-close" title="Minimizar">_</span>
            </div>
            <div class="twp-body">
                <div class="twp-row">
                    <label>Mercado activo:</label>
                    <select id="twp-market">
                        <option value="DE">🇩🇪 Alemania</option>
                        <option value="FR">🇫🇷 Francia</option>
                    </select>
                </div>

                <div class="twp-row twp-current">
                    <span>Peso detectado en esta página:</span>
                    <strong id="twp-current-weight">0,000 kg</strong>
                    <small id="twp-current-count">(0 paquetes)</small>
                </div>

                <button id="twp-add" class="twp-btn twp-btn-primary">
                    ➕ Añadir al mercado activo
                </button>

                <hr/>

                <div class="twp-row">
                    <span>🇩🇪 Total Alemania:</span>
                    <strong id="twp-accum-DE">0,000 kg</strong>
                    <button class="twp-btn-mini" data-reset="DE" title="Reiniciar Alemania">🗑</button>
                </div>
                <div class="twp-row">
                    <span>🇫🇷 Total Francia:</span>
                    <strong id="twp-accum-FR">0,000 kg</strong>
                    <button class="twp-btn-mini" data-reset="FR" title="Reiniciar Francia">🗑</button>
                </div>
                <div class="twp-row twp-grand">
                    <span>∑ Total combinado:</span>
                    <strong id="twp-accum-total">0,000 kg</strong>
                </div>

                <button id="twp-reset-all" class="twp-btn twp-btn-danger">
                    🔄 Reiniciar todo
                </button>
                <button id="twp-refresh" class="twp-btn">
                    ↻ Actualizar detección
                </button>
                <div class="twp-foot" id="twp-foot">listo</div>
            </div>
        `;
        document.body.appendChild(panel);

        injectStyles();
        attachEvents();
        refreshPanel(true);
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #${PANEL_ID} {
                position: fixed; top: 90px; right: 20px;
                width: 300px; background:#fff;
                border:1px solid #d9d9d9; border-radius:10px;
                box-shadow:0 4px 16px rgba(0,0,0,.15);
                font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
                font-size:13px; color:#222; z-index:999999;
            }
            #${PANEL_ID} .twp-header {
                background:linear-gradient(135deg,#fb7701,#ff9a3c);
                color:#fff; padding:8px 12px;
                border-radius:10px 10px 0 0; font-weight:bold;
                display:flex; justify-content:space-between; align-items:center;
                cursor:move;
            }
            #${PANEL_ID} .twp-close { cursor:pointer; padding:0 6px; }
            #${PANEL_ID} .twp-body { padding:10px 12px; }
            #${PANEL_ID} .twp-row {
                display:flex; align-items:center; justify-content:space-between;
                margin:6px 0; gap:6px;
            }
            #${PANEL_ID} .twp-current {
                background:#fff7ec; padding:6px; border-radius:6px; flex-wrap:wrap;
            }
            #${PANEL_ID} .twp-grand {
                border-top:1px dashed #ccc; padding-top:6px; font-size:14px;
            }
            #${PANEL_ID} select { padding:3px 6px; border:1px solid #ccc; border-radius:4px; }
            #${PANEL_ID} .twp-btn {
                width:100%; padding:6px 8px; margin-top:6px;
                border:1px solid #ccc; background:#f5f5f5;
                border-radius:5px; cursor:pointer;
            }
            #${PANEL_ID} .twp-btn:hover { background:#ececec; }
            #${PANEL_ID} .twp-btn-primary {
                background:#fb7701; color:#fff; border-color:#fb7701;
            }
            #${PANEL_ID} .twp-btn-primary:hover { background:#e36a00; }
            #${PANEL_ID} .twp-btn-danger {
                background:#ffecec; color:#c0392b; border-color:#f5b5b5;
            }
            #${PANEL_ID} .twp-btn-mini {
                background:transparent; border:none; cursor:pointer; font-size:14px;
            }
            #${PANEL_ID} hr { border:none; border-top:1px solid #eee; margin:8px 0; }
            #${PANEL_ID} .twp-foot {
                margin-top:6px; font-size:11px; color:#888; text-align:right;
            }
            #${PANEL_ID}.collapsed .twp-body { display:none; }
        `;
        document.head.appendChild(style);
    }

    function formatKg(v) {
        return v.toFixed(3).replace('.', ',') + ' kg';
    }

    function attachEvents() {
        const panel = document.getElementById(PANEL_ID);

        panel.querySelector('.twp-close').addEventListener('click', () => {
            panel.classList.toggle('collapsed');
        });

        const sel = panel.querySelector('#twp-market');
        sel.value = currentMarket;
        sel.addEventListener('change', (e) => {
            currentMarket = e.target.value;
            GM_setValue('lastMarket', currentMarket);
        });

        panel.querySelector('#twp-add').addEventListener('click', () => {
            const { total, count } = extractTotalWeight(true);
            if (total <= 0) {
                alert('No se ha detectado ningún peso en esta página.');
                return;
            }
            const nombre = currentMarket === 'DE' ? 'Alemania' : 'Francia';
            if (!confirm(`¿Añadir ${formatKg(total)} (${count} paquetes) al mercado de ${nombre}?`)) return;
            addToAccumulator(currentMarket, total);
        });

        panel.querySelectorAll('[data-reset]').forEach(btn => {
            btn.addEventListener('click', () => {
                const m = btn.getAttribute('data-reset');
                const nombre = m === 'DE' ? 'Alemania' : 'Francia';
                if (confirm(`¿Reiniciar el total de ${nombre} a 0?`)) resetMarket(m);
            });
        });

        panel.querySelector('#twp-reset-all').addEventListener('click', () => {
            if (confirm('¿Reiniciar todos los totales (Alemania + Francia)?')) resetAll();
        });

        panel.querySelector('#twp-refresh').addEventListener('click', () => refreshPanel(true));

        makeDraggable(panel, panel.querySelector('.twp-header'));
    }

    function refreshPanel(force = false) {
        const { total, count } = extractTotalWeight(force);
        const acc = getAccumulated();
        const grand = +(acc.DE + acc.FR).toFixed(3);

        const cw = document.getElementById('twp-current-weight');
        const cc = document.getElementById('twp-current-count');
        const de = document.getElementById('twp-accum-DE');
        const fr = document.getElementById('twp-accum-FR');
        const tt = document.getElementById('twp-accum-total');
        const ft = document.getElementById('twp-foot');

        if (cw) cw.textContent = formatKg(total);
        if (cc) cc.textContent = `(${count} paquetes)`;
        if (de) de.textContent = formatKg(acc.DE);
        if (fr) fr.textContent = formatKg(acc.FR);
        if (tt) tt.textContent = formatKg(grand);
        if (ft) ft.textContent = 'actualizado ' + new Date().toLocaleTimeString();
    }

    // Versión "lenta" del refresh para el observer
    const refreshPanelDebounced = debounce(() => refreshPanel(true), 800);

    /* =========================================================
       5. ARRASTRAR EL PANEL
       ========================================================= */
    function makeDraggable(el, handle) {
        let ox = 0, oy = 0, sx = 0, sy = 0, dragging = false;
        handle.addEventListener('mousedown', (e) => {
            dragging = true;
            sx = e.clientX; sy = e.clientY;
            const r = el.getBoundingClientRect();
            ox = r.left; oy = r.top;
            e.preventDefault();
        });
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;
            el.style.left = (ox + e.clientX - sx) + 'px';
            el.style.top = (oy + e.clientY - sy) + 'px';
            el.style.right = 'auto';
        });
        document.addEventListener('mouseup', () => dragging = false);
    }

    /* =========================================================
       6. INICIALIZACIÓN + OBSERVACIÓN DOM CONTROLADA
       =========================================================
       Mejoras:
       - Observamos SOLO el contenedor <main>, no todo el body
       - El refresco es debounced (800 ms) -> no se ejecuta en bucle
       - Se filtran las mutaciones irrelevantes
       ========================================================= */
    let observer = null;

    function startObserver() {
        if (observer) observer.disconnect();
        const target = document.querySelector('main') || document.body;

        observer = new MutationObserver((mutations) => {
            // Solo reaccionamos si hay cambios significativos
            let relevant = false;
            for (const m of mutations) {
                if (m.addedNodes.length || m.removedNodes.length) {
                    relevant = true;
                    break;
                }
            }
            if (relevant) refreshPanelDebounced();
        });

        observer.observe(target, {
            childList: true,
            subtree: true,
            // ❌ NO observamos attributes ni characterData (muy ruidosos)
            attributes: false,
            characterData: false,
        });
    }

    function init() {
        createPanel();
        startObserver();

        // Fallback: refresco periódico ligero cada 5 s por si el observer
        // se desconecta o el DOM cambia sin notificaciones
        setInterval(() => refreshPanel(false), 5000);
    }

    if (document.readyState === 'complete') init();
    else window.addEventListener('load', init);
})();