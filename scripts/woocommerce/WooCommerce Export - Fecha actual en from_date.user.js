// ==UserScript==
// @name         WooCommerce Export - Fecha actual en from_date
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Establece la fecha de hoy automáticamente en el campo #from_date al abrir la configuración del perfil de exportación de pedidos en WooCommerce Exporter Plugin.
// @author       Tú
// @match        https://artsans.es/wp-admin/admin.php?page=wc-order-export&tab=profiles&wc_oe=edit_profile&profile_id=2*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function formatFechaHoy() {
        const hoy = new Date();
        const year = hoy.getFullYear();
        const month = String(hoy.getMonth() + 1).padStart(2, '0');
        const day = String(hoy.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function establecerFecha() {
        const input = document.querySelector('#from_date');
        if (!input) {
            console.warn('❌ No se encontró el campo #from_date. Reintentando...');
            setTimeout(establecerFecha, 500);
            return;
        }

        const hoy = formatFechaHoy();
        input.value = hoy;

        // Si hay algún evento conectado (por ejemplo jQuery datepicker), lanzarlo
        ['input', 'change'].forEach(eventType => {
            input.dispatchEvent(new Event(eventType, { bubbles: true }));
        });

        console.log(`📅 Fecha establecida automáticamente en #from_date: ${hoy}`);
    }

    window.addEventListener('load', () => {
        setTimeout(establecerFecha, 1000); // espera por si la fecha es cargada dinámicamente
    });
})();
