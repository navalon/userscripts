// ==UserScript==
// @name         Temu → Uploader Sliplane (BOTÓN MANUAL)
// @namespace    https://tampermonkey.net/
// @version      3.1.1
// @description  Al pulsar el botón: marca "No enviado", solicita reporte (acepta modal 5s), espera nuevo lote, descarga y envía al uploader.
// @match        https://seller-eu.temu.com/order-reports.html*
// @match        https://seller.temu.com/order-reports.html*
// @match        https://seller-us.temu.com/order-reports.html*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_openInTab
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20%E2%86%92%20Uploader%20Sliplane%20%28BOT%C3%93N%20MANUAL%29.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/temu/Temu%20%E2%86%92%20Uploader%20Sliplane%20%28BOT%C3%93N%20MANUAL%29.user.js
// ==/UserScript==
(function () {
    'use strict';

    const ESTADOS_A_DESMARCAR = [
        'Todos', 'Pendiente', 'Enviado', 'Envío parcial',
        'Entregado', 'Entregado parcialmente', 'Cancelado'
    ];
    const ESTADO_A_MARCAR = 'No enviado';
    const TIMEOUT_REPORTE_MS = 5 * 60 * 1000;

    const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    let enEjecucion = false;

    /* ---------- UI overlay ---------- */
    function overlay(msg, color = '#fb7701') {
        let el = document.getElementById('temu-auto-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'temu-auto-overlay';
            Object.assign(el.style, {
                position: 'fixed', bottom: '20px', right: '20px', zIndex: 999999,
                padding: '12px 18px', color: '#fff', borderRadius: '8px',
                fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
                fontFamily: 'sans-serif', maxWidth: '300px'
            });
            document.body.appendChild(el);
        }
        el.style.background = color;
        el.textContent = msg;
    }

    /* ---------- Botón flotante ---------- */
    function crearBoton() {
        if (document.getElementById('temu-auto-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'temu-auto-btn';
        btn.textContent = '▶ Iniciar Temu Auto';
        Object.assign(btn.style, {
            position: 'fixed', bottom: '70px', right: '20px', zIndex: 999999,
            padding: '12px 18px', background: '#fb7701', color: '#fff',
            border: 'none', borderRadius: '8px', fontWeight: 'bold',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,.3)',
            fontFamily: 'sans-serif', fontSize: '14px'
        });
        btn.addEventListener('click', () => {
            if (enEjecucion) {
                overlay('⚠ Ya hay un flujo en ejecución', '#666');
                return;
            }
            flujo();
        });
        document.body.appendChild(btn);
    }

    /* ---------- Click "humano" robusto ---------- */
    function clickHumano(el) {
        const rect = el.getBoundingClientRect();
        const x = rect.x + rect.width / 2;
        const y = rect.y + rect.height / 2;
        const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 };

        const fire = (Ctor, type, extra = {}) => {
            try {
                el.dispatchEvent(new Ctor(type, { ...base, ...extra }));
            } catch (e) { /* ignore */ }
        };

        if (typeof PointerEvent === 'function') {
            fire(PointerEvent, 'pointerover', { pointerType: 'mouse' });
            fire(PointerEvent, 'pointerenter', { pointerType: 'mouse' });
            fire(PointerEvent, 'pointerdown', { pointerType: 'mouse' });
        }
        fire(MouseEvent, 'mouseover');
        fire(MouseEvent, 'mousemove');
        fire(MouseEvent, 'mousedown');
        if (typeof PointerEvent === 'function') {
            fire(PointerEvent, 'pointerup', { pointerType: 'mouse' });
        }
        fire(MouseEvent, 'mouseup');
        fire(MouseEvent, 'click');

        try { el.click(); } catch (e) { /* ignore */ }
    }

    function buscarClicablePorTexto(texto, exacto = true) {
        const t0 = norm(texto);
        const candidatos = document.querySelectorAll(
            'button, div[role="button"], span[role="button"], a[role="button"]'
        );
        for (const c of candidatos) {
            const t = norm(c.textContent);
            const match = exacto ? (t === t0) : (t.includes(t0));
            if (match) {
                const rect = c.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) return c;
            }
        }
        return null;
    }

    /* ---------- 1. MARCADO ---------- */
    const estaMarcado = (l) => l.getAttribute('data-checked') === 'true';
    const toggleCb = (l) => { const i = l.querySelector('input[type="checkbox"]'); if (i) i.click(); };

    function obtenerLabels() {
        const labels = document.querySelectorAll('label[data-testid="beast-core-checkbox"]');
        let noEnviado = null;
        const mapa = {};
        labels.forEach(l => {
            const t = norm(l.innerText);
            if (!t) return;
            if (t === norm(ESTADO_A_MARCAR)) noEnviado = l;
            else if (ESTADOS_A_DESMARCAR.some(e => norm(e) === t)) mapa[t] = l;
        });
        return { noEnviado, mapa };
    }

    async function marcarSoloNoEnviado() {
        const inicio = Date.now();
        let labels;
        while (Date.now() - inicio < 20000) {
            labels = obtenerLabels();
            if (labels.noEnviado && labels.mapa['todos']) break;
            await sleep(300);
        }
        if (!labels.noEnviado || !labels.mapa['todos']) throw new Error('Checkboxes no aparecieron');

        const { noEnviado, mapa } = labels;
        if (estaMarcado(mapa['todos'])) { toggleCb(mapa['todos']); await sleep(150); }
        if (!estaMarcado(noEnviado))    { toggleCb(noEnviado);     await sleep(100); }
        for (const k of Object.keys(mapa)) {
            if (estaMarcado(mapa[k])) { toggleCb(mapa[k]); await sleep(80); }
        }
        if (!estaMarcado(noEnviado)) { toggleCb(noEnviado); await sleep(80); }
        for (const k of Object.keys(mapa)) {
            if (estaMarcado(mapa[k])) { toggleCb(mapa[k]); await sleep(80); }
        }
    }

    /* ---------- 2. SOLICITAR + MODAL OK (5s) ---------- */
    function buscarContenedoresModal() {
        const sels = [
            '.beast-core-dialog',
            '.beast-core-modal',
            '[role="dialog"]',
            '[role="alertdialog"]',
            '[class*="Dialog"]',
            '[class*="Modal"]',
            '[class*="dialog"]',
            '[class*="modal"]'
        ];
        const out = [];
        for (const s of sels) {
            document.querySelectorAll(s).forEach(d => {
                const r = d.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) out.push(d);
            });
        }
        return out;
    }

    // Busca el div[role="button"] cuyo texto sea exactamente "OK" (el de Temu)
    function buscarBotonOk() {
        // 1) Buscar dentro de modales primero
        const ambitos = buscarContenedoresModal();
        if (ambitos.length === 0) ambitos.push(document);

        for (const ambito of ambitos) {
            const cands = ambito.querySelectorAll('div[role="button"], button, [role="button"]');
            for (const c of cands) {
                const t = norm(c.textContent);
                // Acepta "ok", "ok (5s)", "ok 5s", "ok 5 s", etc.
                if (/^ok(\s*[\(\[]?\s*\d+\s*s\s*[\)\]]?)?$/i.test(t)) {
                    const rect = c.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) return c;
                }
            }
        }
        return null;
    }

    // Click muy agresivo: dispara eventos sobre el span interior, el div padre,
    // y simula también keydown Enter por si el componente lo escucha.
    async function clickFuerteOk(divBoton) {
        // 1) Click humano sobre el div
        clickHumano(divBoton);
        await sleep(200);

        // 2) Click sobre el span interior <span>OK</span> si existe
        const spanOk = Array.from(divBoton.querySelectorAll('span')).find(s => /^ok$/i.test(norm(s.textContent)));
        if (spanOk) {
            clickHumano(spanOk);
            await sleep(200);
        }

        // 3) Foco + Enter / Space
        try { divBoton.focus(); } catch (e) {}
        ['Enter', ' '].forEach(k => {
            try {
                divBoton.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === ' ' ? 'Space' : 'Enter', bubbles: true }));
                divBoton.dispatchEvent(new KeyboardEvent('keyup',   { key: k, code: k === ' ' ? 'Space' : 'Enter', bubbles: true }));
            } catch (e) {}
        });
        await sleep(200);

        // 4) Click directo nativo
        try { divBoton.click(); } catch (e) {}
    }

    async function aceptarModalSiAparece() {
        // 1) Esperar a que aparezca el botón OK (hasta 15s)
        const inicio = Date.now();
        let ok = null;
        while (Date.now() - inicio < 15000) {
            ok = buscarBotonOk();
            if (ok) break;
            await sleep(250);
        }
        if (!ok) {
            console.warn('[Temu] Modal con botón OK no apareció');
            return false;
        }

        // 2) Esperar a que termine el contador (siempre esperamos ~6.5s desde que apareció)
        overlay('⏳ Esperando contador 5s del modal...');
        await sleep(6500);

        // 3) Intentar clicar varias veces hasta que el modal desaparezca
        for (let i = 0; i < 8; i++) {
            const actual = buscarBotonOk();
            if (!actual) {
                overlay('✓ Modal cerrado');
                return true;
            }
            overlay(`✓ Pulsando OK (intento ${i + 1})...`);
            await clickFuerteOk(actual);
            await sleep(700);
            if (!buscarBotonOk()) {
                overlay('✓ Modal cerrado');
                return true;
            }
        }
        console.warn('[Temu] No conseguí cerrar el modal tras varios intentos');
        return false;
    }

    async function clickSolicitarReporte() {
        const inicio = Date.now();
        while (Date.now() - inicio < 10000) {
            const el = buscarClicablePorTexto('solicitar reporte');
            if (el) {
                clickHumano(el);
                await sleep(800);
                await aceptarModalSiAparece();
                return true;
            }
            await sleep(300);
        }
        throw new Error('No encontré botón "Solicitar reporte"');
    }

    /* ---------- 3. INTERCEPTOR ---------- */
    let capturaPendiente = null;
    (function instalarInterceptorFetch() {
        const origFetch = window.fetch;
        window.fetch = async function (...args) {
            const resp = await origFetch.apply(this, args);
            try {
                if (capturaPendiente) {
                    const clon = resp.clone();
                    const ct = clon.headers.get('content-type') || '';
                    const cd = clon.headers.get('content-disposition') || '';
                    const url = (args[0]?.url) || (typeof args[0] === 'string' ? args[0] : '');
                    const esArchivo =
                        cd.includes('attachment') ||
                        /\.(csv|xlsx)/i.test(cd) ||
                        /\.(csv|xlsx)/i.test(String(url)) ||
                        ct.includes('csv') || ct.includes('spreadsheet') ||
                        ct.includes('octet-stream');
                    if (esArchivo) {
                        const blob = await clon.blob();
                        let nombre = 'temu-report.csv';
                        const m = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i);
                        if (m) nombre = decodeURIComponent(m[1]);
                        else {
                            const um = String(url).match(/([^\/?#]+\.(?:csv|xlsx))/i);
                            if (um) nombre = um[1];
                        }
                        const cb = capturaPendiente;
                        capturaPendiente = null;
                        cb({ blob, nombre });
                    }
                }
            } catch (e) { /* ignore */ }
            return resp;
        };
    })();

    function siguienteDescarga(timeoutMs = 90000) {
        return new Promise((resolve, reject) => {
            const to = setTimeout(() => {
                capturaPendiente = null;
                reject(new Error('Timeout descarga'));
            }, timeoutMs);
            capturaPendiente = (data) => { clearTimeout(to); resolve(data); };
        });
    }

    /* ---------- 4. ESPERAR Y DESCARGAR ---------- */
    function idPrimerLote() {
        const filas = document.querySelectorAll('table tbody tr');
        if (!filas.length) return null;
        const c = filas[0].querySelector('td');
        return c ? c.innerText.trim() : null;
    }

    function primerDisponible() {
        const filas = document.querySelectorAll('table tbody tr');
        if (!filas.length) return false;
        return /disponible/i.test(filas[0].innerText);
    }

    async function esperarYDescargar() {
        const idInicial = idPrimerLote();
        const inicio = Date.now();
        overlay('⏳ Esperando que aparezca el nuevo lote...');
        while (Date.now() - inicio < TIMEOUT_REPORTE_MS) {
            const idActual = idPrimerLote();
            if (idActual && idActual !== idInicial) break;
            await sleep(2500);
        }
        if (Date.now() - inicio >= TIMEOUT_REPORTE_MS) throw new Error('No apareció nuevo lote');

        overlay('⏳ Esperando que el reporte esté disponible...');
        while (Date.now() - inicio < TIMEOUT_REPORTE_MS) {
            if (primerDisponible()) break;
            await sleep(2500);
        }
        if (!primerDisponible()) throw new Error('Reporte no llegó a "Disponible"');

        overlay('⏳ Esperando botón Descargar...');
        let btn = null;
        const inicioBtn = Date.now();
        while (Date.now() - inicioBtn < 30000) {
            const filas = document.querySelectorAll('table tbody tr');
            if (filas.length) {
                const candidatos = filas[0].querySelectorAll('button, div[role="button"], span[role="button"], a[role="button"]');
                btn = Array.from(candidatos).find(b => /descargar/i.test(b.textContent || ''));
                if (btn) {
                    const rect = btn.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) break;
                }
            }
            await sleep(1000);
        }
        if (!btn) throw new Error('No apareció botón Descargar');

        overlay('⏬ Descargando archivo...');
        const promesa = siguienteDescarga(90000);
        clickHumano(btn);
        return await promesa;
    }

    /* ---------- 5. ENVIAR ---------- */
    function blobABase64(blob) {
        return new Promise(r => {
            const fr = new FileReader();
            fr.onloadend = () => r(fr.result);
            fr.readAsDataURL(blob);
        });
    }

    async function enviarYAbrir({ blob, nombre }) {
        const dataUrl = await blobABase64(blob);
        GM_setValue('temu_report_payload', JSON.stringify({
            dataUrl, nombre, ts: Date.now()
        }));
        GM_openInTab('https://aliexpress-artsans.sliplane.app/', { active: true });
    }

    /* ---------- 6. FLUJO ---------- */
    async function flujo() {
        if (enEjecucion) return;
        enEjecucion = true;

        const btn = document.getElementById('temu-auto-btn');
        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.6';
            btn.style.cursor = 'not-allowed';
            btn.textContent = '⏳ Procesando...';
        }

        try {
            overlay('✓ Marcando "No enviado"...');
            await marcarSoloNoEnviado();
            await sleep(700);

            overlay('✓ Solicitando reporte...');
            await clickSolicitarReporte();
            await sleep(1500);

            const archivo = await esperarYDescargar();
            if (!archivo) throw new Error('Sin archivo');

            overlay('📤 Enviando al uploader...');
            await enviarYAbrir(archivo);
            overlay('✅ Enviado. Abriendo uploader...', '#22c55e');
        } catch (e) {
            console.error('[Temu MANUAL]', e);
            overlay('❌ ' + e.message, '#dc2626');
        } finally {
            enEjecucion = false;
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.textContent = '▶ Iniciar Temu Auto';
            }
        }
    }

    /* ---------- 7. CREAR BOTÓN ---------- */
    if (document.body) {
        crearBoton();
    } else {
        document.addEventListener('DOMContentLoaded', crearBoton);
    }
    setInterval(() => {
        if (!document.getElementById('temu-auto-btn') && document.body) {
            crearBoton();
        }
    }, 3000);
})();