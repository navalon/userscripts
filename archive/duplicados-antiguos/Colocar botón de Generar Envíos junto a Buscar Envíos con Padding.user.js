// ==UserScript==
// @name         Colocar botón de Generar Envíos junto a Buscar Envíos con Padding
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Coloca un clon del botón de "Generar Envíos" junto al botón de "Buscar Envíos" en el mismo contenedor y le aplica padding.
// @author       TuNombre
// @match        https://saquitodelasalud.com/wp-admin/admin.php?page=correosexpress-utilidades
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function clonarYColocarBoton() {
        // Buscamos el botón original de "Generar Envíos"
        var botonGenerarEnvios = document.querySelector('.CEX-btn.CEX-button-success');
        if (botonGenerarEnvios) {
            // Clonamos el botón de Generar Envíos
            var clonBoton = botonGenerarEnvios.cloneNode(true);

            // Aplicamos padding-left al botón clonado
            clonBoton.style.marginLeft = '15px'; // Ajusta el valor según necesites

            // Encuentra el botón de "Buscar Envíos"
            var botonBuscarEnvios = document.querySelector('.CEX-btn.CEX-button-blue');

            if (botonBuscarEnvios) {
                // Inserta el botón clonado justo después del botón de "Buscar Envíos" en el mismo contenedor
                botonBuscarEnvios.parentNode.insertBefore(clonBoton, botonBuscarEnvios.nextSibling);
                clearInterval(intervalo); // Detiene el intervalo una vez que el botón se ha insertado
            }
        }
    }

    var intervalo = setInterval(clonarYColocarBoton, 1000); // Intenta clonar y colocar el botón cada segundo
})();
