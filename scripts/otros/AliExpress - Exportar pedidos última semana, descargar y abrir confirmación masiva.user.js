// ==UserScript==
// @name         AliExpress - Exportar pedidos última semana, descargar y abrir confirmación masiva
// @namespace    https://gsp.aliexpress.com/
// @version      1.2.1
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
    async function pickOption(triggerSelector, optionText) {
        const trigger = document.querySelector(triggerSelector);
        if (!trigger) return;
        if (trigger.innerText.trim().startsWith(optionText)) return;
        trigger.click();
        await sleep(300);
        const items = document.querySelectorAll('.next-menu-item, li[role="option"]');
        for (const it of items) {
            if (it.innerText.trim() === optionText) {
                it.click();
                await sleep(200);
                return;
            }
        }
        document.body.click();
    }

    /* ---------- abrir picker invocando handlers React ---------- */
    async function openPicker() {
        const input = document.querySelectorAll('input[placeholder*="Hora"]')[0];
        if (!input) throw new Error('Input "Hora de inicio" no encontrado');
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
        throw new Error('No se abrió el picker de fechas');
    }

    function clickCell(isoDateStr) {
        const cell = document.querySelector(`.ait-picker-cell[title="${isoDateStr}"]`);
        if (!cell) throw new Error('No se encontró la celda ' + isoDateStr);
        cell.click();
    }

    async function clickAceptarDropdown() {
        // Botón "Aceptar" / "OK" dentro del dropdown abierto
        for (let i = 0; i < 20; i++) {
            const btn = [...document.querySelectorAll('.ait-picker-dropdown button')]
                .find(b => /aceptar|ok/i.test(b.innerText.trim()) && !b.disabled);
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
        clickCell(startIso);
        await sleep(400);

        // Confirmar hora de inicio
        await clickAceptarDropdown();
        await sleep(500);

        // Click fecha fin
        clickCell(endIso);
        await sleep(400);

        // Confirmar hora de fin
        await clickAceptarDropdown();
        await sleep(300);

        document.body.click();
        await sleep(200);

        // Verificación
        const inputs = document.querySelectorAll('input[placeholder*="Hora"]');
        if (!inputs[0].value || !inputs[1].value) {
            throw new Error(`Fechas no rellenadas (start="${inputs[0].value}", end="${inputs[1].value}")`);
        }
    }

    /* ---------- exportar ---------- */
    async function clickExport() {
        const btn = [...document.querySelectorAll('button')]
            .find(b => b.innerText.trim() === 'Orden de exportación');
        if (!btn) throw new Error('Botón "Orden de exportación" no encontrado');
        btn.click();
    }

    /* ---------- esperar fila finalizada y descargar ---------- */
    async function waitAndDownload(previousFirstId) {
        const refrescar = () => {
            const r = [...document.querySelectorAll('a, button, span')]
                .find(el => el.innerText && el.innerText.trim() === 'Refrescar');
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
            const estado = firstRow.innerText.includes('Finalizado');
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

            await pickOption('.order-export-status-select', 'Pendiente de envío');
            await pickOption('.order-export-time-select',  'Fecha de pedido');
            await pickOption('.order-export-reason-select','Envío de mercancía');

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