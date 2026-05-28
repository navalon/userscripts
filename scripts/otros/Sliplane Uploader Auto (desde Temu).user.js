// ==UserScript==
// @name         Sliplane Uploader Auto (desde Temu)
// @namespace    https://tampermonkey.net/
// @version      1.0.1
// @description  Recibe el reporte desde Temu, lo carga en el input, pulsa Detectar y Procesar.
// @match        https://aliexpress-artsans.sliplane.app/*
// @grant        GM_getValue
// @grant        GM_deleteValue
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/otros/Sliplane%20Uploader%20Auto%20%28desde%20Temu%29.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/otros/Sliplane%20Uploader%20Auto%20%28desde%20Temu%29.user.js
// ==/UserScript==
(function () {
    'use strict';
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function dataUrlToFile(dataUrl, nombre) {
        const [meta, b64] = dataUrl.split(',');
        const mime = meta.match(/data:([^;]+);base64/)[1];
        const bin = atob(b64);
        const u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        return new File([u8], nombre, { type: mime });
    }

    async function esperarSelector(sel, timeout = 15000) {
        const inicio = Date.now();
        while (Date.now() - inicio < timeout) {
            const el = document.querySelector(sel);
            if (el) return el;
            await sleep(150);
        }
        throw new Error('No apareció: ' + sel);
    }

    async function esperarBotonHabilitado(sel, timeout = 120000) {
        const inicio = Date.now();
        while (Date.now() - inicio < timeout) {
            const el = document.querySelector(sel);
            if (el && !el.disabled) return el;
            await sleep(300);
        }
        throw new Error('Botón nunca se habilitó: ' + sel);
    }

    async function ejecutar() {
        const raw = GM_getValue('temu_report_payload', null);
        if (!raw) return;
        let payload;
        try { payload = JSON.parse(raw); } catch { return; }

        // Limpiar para no repetir en futuras visitas
        GM_deleteValue('temu_report_payload');

        const file = dataUrlToFile(payload.dataUrl, payload.nombre || 'temu-report.csv');

        // 1) Inyectar archivo en el input
        const input = await esperarSelector('input#file');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(500);

        // 2) Click en "Detectar y previsualizar"
        const btnDetectar = await esperarSelector('button#detect-btn');
        btnDetectar.click();

        // 3) Esperar a que "Procesar pedidos" se habilite (cuando termine la detección)
        const btnProcesar = await esperarBotonHabilitado('button#submit');
        // Pequeña pausa por si el render aún está estabilizando
        await sleep(800);
        btnProcesar.click();

        // Feedback visual
        const aviso = document.createElement('div');
        aviso.textContent = '✅ Archivo subido, detectado y procesado automáticamente';
        Object.assign(aviso.style, {
            position: 'fixed', top: '20px', right: '20px', zIndex: 99999,
            background: '#22c55e', color: '#fff', padding: '12px 18px',
            borderRadius: '8px', fontWeight: 'bold', boxShadow: '0 2px 8px rgba(0,0,0,.3)'
        });
        document.body.appendChild(aviso);
        setTimeout(() => aviso.remove(), 6000);
    }

    ejecutar().catch(e => {
        console.error('[Sliplane Script]', e);
        alert('Error en uploader automático: ' + e.message);
    });
})();