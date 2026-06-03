// ==UserScript==
// @name         Packlink Pro - Autoflow envio
// @namespace    https://pro.packlink.es/
// @version      1.0.0
// @description  Rellena email, marca NO_INSURANCE, acepta T&C y avanza por el flujo de creacion de envio.
// @match        https://pro.packlink.es/private/shipments/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/packlink/Packlink%20Pro%20-%20Autoflow%20envio.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/packlink/Packlink%20Pro%20-%20Autoflow%20envio.user.js
// ==/UserScript==

(function () {
    'use strict';

    const EMAIL = 'soporte@saquitodelasalud.com';
    const ADDRESS_RE = /\/private\/shipments\/[^/]+\/create\/address/;
    const PAYMENT_RE = /\/private\/shipments\/[^/]+\/create\/payment/;

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function setNativeValue(el, value) {
        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');
        if (desc && desc.set) desc.set.call(el, value);
        else el.value = value;
    }

    async function waitFor(selector, timeout = 12000) {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(200);
        }
        return null;
    }

    function getShipmentId() {
        const m = location.pathname.match(/\/shipments\/([^/]+)/);
        return m ? m[1] : null;
    }

    function findButton(...regexes) {
        return [...document.querySelectorAll('button')].find(b => {
            const t = (b.innerText || '').trim();
            return regexes.some(rx => rx.test(t)) && !b.disabled;
        });
    }

    async function handleAddress() {
        const emailInput = await waitFor('#to\\.email, input[name="to.email"]', 15000);
        if (!emailInput) {
            console.log('[Packlink] Input email no encontrado en /address');
            return;
        }

        if (!emailInput.value) {
            console.log('[Packlink] Rellenando email:', EMAIL);
            emailInput.focus();
            await sleep(80);
            setNativeValue(emailInput, EMAIL);
            emailInput.dispatchEvent(new Event('input', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
            emailInput.blur();
            await sleep(400);
        }

        // Esperar a que React procese cualquier cambio de estado tras el input
        await sleep(600);

        // El radio de seguro solo aparece tras elegir servicio (segunda visita).
        // En primera visita: dejamos al usuario que pulse "Ir a pago" manualmente.
        const noInsurance = document.querySelector('input[name="hasInsurance"][value="NO_INSURANCE"]');
        if (!noInsurance) {
            console.log('[Packlink] Primera visita: email rellenado, esperando accion del usuario');
            return;
        }

        if (!noInsurance.checked) {
            console.log('[Packlink] Marcando NO_INSURANCE');
            noInsurance.click();
            await sleep(300);
        }

        const submitBtn = findButton(/^ir a pago$/i);
        if (submitBtn) {
            console.log('[Packlink] Click "Ir a pago"');
            submitBtn.click();
        } else {
            console.log('[Packlink] Boton "Ir a pago" no encontrado');
        }
    }

    async function handlePayment() {
        const tc = await waitFor(
            'input[name="TermsAndConditions"], input[data-id="terms-and-conditions-checkbox"]',
            15000
        );
        if (tc && !tc.checked) {
            console.log('[Packlink] Marcando Terminos y Condiciones');
            tc.click();
            await sleep(300);
        }

        const payBtn = findButton(/realizar pago/i, /pay now/i);
        if (payBtn) {
            console.log('[Packlink] Click "Realizar pago"');
            payBtn.click();
        } else {
            console.log('[Packlink] Boton "Realizar pago" no encontrado');
        }
    }

    let lastHandled = '';
    async function route() {
        const path = location.pathname;
        if (path === lastHandled) return;
        lastHandled = path;
        await sleep(500);

        if (ADDRESS_RE.test(path)) handleAddress();
        else if (PAYMENT_RE.test(path)) handlePayment();
    }

    // Deteccion de cambios de URL en SPA (Packlink usa React)
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function () {
        const r = origPush.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
        return r;
    };
    history.replaceState = function () {
        const r = origReplace.apply(this, arguments);
        window.dispatchEvent(new Event('locationchange'));
        return r;
    };
    window.addEventListener('popstate', () => window.dispatchEvent(new Event('locationchange')));
    window.addEventListener('locationchange', route);

    route();
})();
