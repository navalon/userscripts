// ==UserScript==
// @name         AliExpress - Exportar pedidos última semana, descargar y abrir confirmación masiva
// @namespace    https://gsp.aliexpress.com/
// @version      1.3.1
// @description  Selecciona la última semana, fija desplegables, exporta, descarga el archivo y abre la pestaña de confirmación masiva.
// @match        https://gsp.aliexpress.com/m_apps/biz_local/order-manage/orderExport*
// @grant        GM_openInTab
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/otros/AliExpress%20-%20Exportar%20pedidos%20%C3%BAltima%20semana%2C%20descargar%20y%20abrir%20confirmaci%C3%B3n%20masiva.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/otros/AliExpress%20-%20Exportar%20pedidos%20%C3%BAltima%20semana%2C%20descargar%20y%20abrir%20confirmaci%C3%B3n%20masiva.user.js
// ==/UserScript==
(function () {
    'use strict';

    const SHIPMENT_URL =
        'https://gsp.aliexpress.com/m_apps/biz_local/logistic_local_supply_gsp/shipment?statusCode=ALL';

    /* ---------- utilidades ---------- */
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const pad = n => String(n).padStart(2, '0');
    const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    function getReactProps(el) {
        if (!el) return null;
        const k = Object.keys(el).find(k => k.startsWith('__reactProps'));
        return k ? el[k] : null;
    }

    // Placeholders aceptados (ES/EN) para los inputs del rango de fechas
    const START_PLACEHOLDERS = ['Start Time', 'Hora de inicio', 'Start time', 'Start date', 'Fecha de inicio'];
    const END_PLACEHOLDERS   = ['End Time',   'Hora de fin',    'End time',   'End date',   'Fecha de fin'];

    function findInputByPlaceholders(candidates) {
        // 1) match exacto
        for (const ph of candidates) {
            const el = document.querySelector(`input[placeholder="${ph}"]`);
            if (el) return el;
        }
        // 2) match parcial (case-insensitive) sobre el placeholder real
        const all = [...document.querySelectorAll('input[placeholder]')];
        for (const el of all) {
            const p = (el.placeholder || '').toLowerCase();
            if (candidates.some(c => p.includes(c.toLowerCase()))) return el;
        }
        // 3) fallback genérico: input dentro de un picker conocido (primero=start, segundo=end)
        const pickerInputs = document.querySelectorAll(
            '.ait-picker input, .next-range-picker input, .next-date-picker input'
        );
        if (pickerInputs.length >= 2) {
            return candidates === START_PLACEHOLDERS ? pickerInputs[0] : pickerInputs[1];
        }
        return null;
    }

    function dumpDiagnostics(reason) {
        try {
            console.group('[AE Export] Diagnóstico (' + reason + ')');
            const inputs = [...document.querySelectorAll('input')];
            console.log('inputs con placeholder:', inputs
                .filter(i => i.placeholder)
                .map(i => i.placeholder));
            ['ait-picker','ait-picker-dropdown','next-date-picker','next-range-picker',
             'next-time-picker','order-export-time-select','order-export-status-select',
             'order-export-reason-select']
                .forEach(c => console.log('.' + c + ':', document.querySelectorAll('.' + c).length));
            console.log('botones visibles:', [...document.querySelectorAll('button')]
                .map(b => b.innerText.trim()).filter(Boolean).slice(0, 30));
            console.groupEnd();
        } catch (_) { /* noop */ }
    }

    function openShipmentTab() {
        try {
            if (typeof GM_openInTab === 'function') {
                GM_openInTab(SHIPMENT_URL, { active: true, insert: true });
            } else {
                window.open(SHIPMENT_URL, '_blank');
            }
        } catch (e) {
            window.open(SHIPMENT_URL, '_blank');
        }
    }

    /* ---------- dropdowns next-select ---------- */
    async function pickOption(triggerSelector, optionTexts) {
        const candidates = Array.isArray(optionTexts) ? optionTexts : [optionTexts];
        const trigger = document.querySelector(triggerSelector);
        if (!trigger) return;
        const current = trigger.innerText.trim().toLowerCase();
        if (candidates.some(t => current.startsWith(t.toLowerCase()))) return;
        trigger.click();
        await sleep(300);
        const items = document.querySelectorAll('.next-menu-item, li[role="option"]');
        for (const it of items) {
            const txt = it.innerText.trim();
            if (candidates.some(t => txt.toLowerCase() === t.toLowerCase())) {
                it.click();
                await sleep(200);
                return;
            }
        }
        document.body.click();
    }

    /* ---------- abrir picker invocando handlers React ---------- */
    async function openPicker() {
        const input = findInputByPlaceholders(START_PLACEHOLDERS);
        if (!input) {
            dumpDiagnostics('openPicker: input de fecha inicio no encontrado');
            throw new Error('Input de "Start Time / Hora de inicio" no encontrado');
        }
        const props = getReactProps(input);
        if (!props) throw new Error('No se pudieron leer reactProps del input');
        const fakeEvt = {
            preventDefault() {}, stopPropagation() {},
            target: input, currentTarget: input,
            type: 'mousedown', button: 0
        };
        props.onMouseDown && props.onMouseDown(fakeEvt);
        props.onFocus && props.onFocus({ target: input });
        // Esperar a que aparezca el dropdown
        for (let i = 0; i < 30; i++) {
            await sleep(100);
            const dd = document.querySelector('.ait-picker-dropdown');
            if (dd && dd.offsetWidth > 0) return;
        }
        dumpDiagnostics('openPicker: dropdown no apareció');
        throw new Error('No se abrió el picker de fechas');
    }

    const MONTH_NAMES_EN = ['January','February','March','April','May','June',
                            'July','August','September','October','November','December'];
    const MONTH_NAMES_ES = ['enero','febrero','marzo','abril','mayo','junio',
                            'julio','agosto','septiembre','octubre','noviembre','diciembre'];

    function findCellByDate(isoDateStr) {
        // 1) por title ISO
        let cell = document.querySelector(`.ait-picker-cell[title="${isoDateStr}"]`);
        if (cell) return cell;
        // 2) por title en formatos locales
        const [y, m, d] = isoDateStr.split('-').map(Number);
        const altTitles = [
            `${MONTH_NAMES_EN[m-1]} ${d}, ${y}`,
            `${d} ${MONTH_NAMES_EN[m-1]} ${y}`,
            `${d} de ${MONTH_NAMES_ES[m-1]} de ${y}`,
            `${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y}`,
            `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`,
        ];
        for (const t of altTitles) {
            cell = document.querySelector(`.ait-picker-cell[title="${t}"]`);
            if (cell) return cell;
        }
        return null;
    }

    function findPrevMonthBtn() {
        // El dropdown del picker normalmente tiene una flecha "mes anterior"
        const root = document.querySelector('.ait-picker-dropdown') || document;
        return root.querySelector(
            '.ait-picker-header-prev-month-btn, ' +
            '.ait-picker-prev-month, ' +
            'button[aria-label*="prev" i], ' +
            'button[aria-label*="anterior" i], ' +
            '.next-icon-arrow-left'
        ) || [...root.querySelectorAll('button, a, span, i')]
            .find(el => /^<|‹|◀|prev/i.test((el.innerText || el.getAttribute('aria-label') || '').trim()));
    }

    async function clickCell(isoDateStr) {
        let cell = findCellByDate(isoDateStr);
        if (cell) { cell.click(); return; }
        // Navegar atrás meses hasta encontrarla (máx. 24 = 2 años)
        for (let i = 0; i < 24; i++) {
            const prev = findPrevMonthBtn();
            if (!prev) break;
            prev.click();
            await sleep(220);
            cell = findCellByDate(isoDateStr);
            if (cell) { cell.click(); return; }
        }
        dumpDiagnostics('clickCell: celda no encontrada para ' + isoDateStr);
        const sampleTitles = [...document.querySelectorAll('.ait-picker-cell')]
            .slice(0, 8).map(c => c.title || c.innerText.trim());
        console.log('[AE Export] Sample picker cell titles:', sampleTitles);
        throw new Error('No se encontró la celda ' + isoDateStr);
    }

    async function clickAceptarDropdown() {
        // Botón "Aceptar" / "OK" / "Confirm" dentro del dropdown abierto
        for (let i = 0; i < 30; i++) {
            const btn = [...document.querySelectorAll('.ait-picker-dropdown button')]
                .find(b => /^(aceptar|ok|confirm|confirmar)$/i.test(b.innerText.trim()) && !b.disabled);
            if (btn) { btn.click(); return; }
            await sleep(100);
        }
        // Fallback: no había botón -> el componente confirmará solo
    }

    async function setDateRange() {
        // Cerrar cualquier picker abierto y limpiar
        document.body.click();
        await sleep(300);
        const clearBtn = document.querySelector('.ait-picker-clear');
        if (clearBtn && clearBtn.offsetParent !== null) {
            clearBtn.click();
            await sleep(300);
        }

        const today = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(today.getDate() - 7);
        const startIso = isoDate(weekAgo);
        const endIso = isoDate(today);

        // Abrir picker
        await openPicker();
        await sleep(200);

        // Click fecha inicio
        await clickCell(startIso);
        await sleep(400);

        // Confirmar hora de inicio
        await clickAceptarDropdown();
        await sleep(500);

        // Click fecha fin
        await clickCell(endIso);
        await sleep(400);

        // Confirmar hora de fin
        await clickAceptarDropdown();
        await sleep(300);

        document.body.click();
        await sleep(200);

        // Verificación
        const startInput = findInputByPlaceholders(START_PLACEHOLDERS);
        const endInput   = findInputByPlaceholders(END_PLACEHOLDERS);
        if (!startInput || !endInput || !startInput.value || !endInput.value) {
            dumpDiagnostics('setDateRange: inputs sin valor');
            throw new Error(`Fechas no rellenadas (start="${startInput && startInput.value}", end="${endInput && endInput.value}")`);
        }
    }

    /* ---------- exportar ---------- */
    const EXPORT_BUTTON_TEXTS = ['Export', 'Orden de exportación', 'Export order', 'Exportar'];
    async function clickExport() {
        const btn = [...document.querySelectorAll('button')]
            .find(b => {
                const t = b.innerText.trim().toLowerCase();
                return EXPORT_BUTTON_TEXTS.some(c => t === c.toLowerCase());
            });
        if (!btn) {
            dumpDiagnostics('clickExport: botón de exportar no encontrado');
            throw new Error('Botón "Export / Orden de exportación" no encontrado');
        }
        btn.click();
    }

    /* ---------- esperar fila finalizada y descargar ---------- */
    const REFRESH_TEXTS  = ['Refrescar', 'Refresh', 'Actualizar'];
    const COMPLETE_TEXTS = ['Finalizado', 'Complete', 'Completed', 'Finalizada', 'Completado'];

    async function waitAndDownload(previousFirstId) {
        const refrescar = () => {
            const r = [...document.querySelectorAll('a, button, span')]
                .find(el => el.innerText && REFRESH_TEXTS.includes(el.innerText.trim()));
            if (r) r.click();
        };

        const start = Date.now();
        const TIMEOUT = 5 * 60 * 1000;

        while (Date.now() - start < TIMEOUT) {
            await sleep(5000);
            refrescar();
            await sleep(1500);

            const rows = document.querySelectorAll('.next-table-body tr, table tbody tr');
            if (!rows.length) continue;

            const firstRow = rows[0];
            const cells = firstRow.querySelectorAll('td');
            if (cells.length < 2) continue;

            const taskId = cells[1]?.innerText.trim();
            const rowText = firstRow.innerText;
            const estado = COMPLETE_TEXTS.some(t => rowText.includes(t));
            const downloadLink = firstRow.querySelector('a[href*=".xlsx"]');

            if (taskId && taskId !== previousFirstId && estado && downloadLink) {
                const url = downloadLink.href;
                console.log('[Exportador] Descargando:', url);
                const a = document.createElement('a');
                a.href = url;
                a.download = `pedidos_${taskId}.xlsx`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                return true;
            }
        }
        throw new Error('Tiempo agotado esperando la exportación.');
    }

    /* ---------- botón flotante ---------- */
    function addButton() {
        if (document.getElementById('ae-export-week-btn')) return;
        const b = document.createElement('button');
        b.id = 'ae-export-week-btn';
        b.textContent = '⬇ Exportar última semana';
        Object.assign(b.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 99999,
            padding: '10px 16px', background: '#ff4747', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
            fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,.25)'
        });
        b.addEventListener('click', run);
        document.body.appendChild(b);
    }

    async function run() {
        const btn = document.getElementById('ae-export-week-btn');
        try {
            btn.disabled = true; btn.textContent = '⏳ Procesando...';

            const firstRow = document.querySelector('.next-table-body tr, table tbody tr');
            const previousFirstId = firstRow
                ? firstRow.querySelectorAll('td')[1]?.innerText.trim()
                : null;

            await pickOption('.order-export-status-select', ['Pendiente de envío', 'Unshipped', 'Pending shipment']);
            await pickOption('.order-export-time-select',   ['Fecha de pedido', 'Order date', 'Order time']);
            await pickOption('.order-export-reason-select', ['Envío de mercancía', 'Shipping', 'Goods shipment']);

            await setDateRange();
            await clickExport();
            btn.textContent = '⏳ Esperando archivo...';

            await waitAndDownload(previousFirstId);

            btn.textContent = '✅ Descargado, abriendo confirmación...';
            await sleep(800);
            openShipmentTab();

            btn.textContent = '✅ Listo';
        } catch (e) {
            console.error(e);
            alert('Error: ' + e.message);
            btn.textContent = '❌ Error - reintentar';
        } finally {
            setTimeout(() => {
                btn.disabled = false;
                btn.textContent = '⬇ Exportar última semana';
            }, 4000);
        }
    }

    const obs = new MutationObserver(addButton);
    obs.observe(document.body, { childList: true, subtree: true });
    addButton();
})();