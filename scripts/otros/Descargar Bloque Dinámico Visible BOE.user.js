// ==UserScript==
// @name         Descargar Bloque Dinámico Visible BOE
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Descarga el bloque visible de la pestaña activa, sin importar el id
// @match        https://subastas.boe.es/detalleSubasta.php*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const tabActivo = document.querySelector('#tabs a.current');
    if (!tabActivo) return;

    // Crear botón siempre
    const boton = document.createElement('button');
    boton.textContent = '📥 Descargar bloque HTML';
    boton.style.position = 'fixed';
    boton.style.top = '20px';
    boton.style.right = '20px';
    boton.style.padding = '10px 15px';
    boton.style.background = '#1976d2';
    boton.style.color = 'white';
    boton.style.border = 'none';
    boton.style.borderRadius = '6px';
    boton.style.cursor = 'pointer';
    boton.style.zIndex = '999999';
    document.body.appendChild(boton);

    boton.addEventListener('click', () => {

        // Buscar el bloque visible
        const bloques = document.querySelectorAll('div[id^="idBloqueDatos"]');
        const bloqueVisible = [...bloques].find(b => b.offsetParent !== null);

        if (!bloqueVisible) {
            alert('No se encontró ningún bloque visible de datos.');
            return;
        }

        const titulo = tabActivo.textContent.trim().replace(/[\\/:*?"<>|]/g, '_');
        const contenido = bloqueVisible.outerHTML;

        const blob = new Blob([contenido], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);

        const enlace = document.createElement("a");
        enlace.href = url;
        enlace.download = `${titulo}.html`;
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
    });

})();
