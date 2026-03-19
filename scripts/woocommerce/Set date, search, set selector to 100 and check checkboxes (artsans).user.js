// ==UserScript==
// @name         Set date, search, set selector to 100 and check checkboxes (artsans)
// @namespace    http://tampermonkey.net/
// @version      0.4
// @description  Set date in input field, perform search, set selector to 100, and check 'procesando' checkboxes in artsans.es
// @author       You
// @match        https://*/wp-admin/admin.php?page=correosexpress-utilidades
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function formatDate(date) {
        let dd = String(date.getDate()).padStart(2, '0');
        let mm = String(date.getMonth() + 1).padStart(2, '0');
        let yyyy = date.getFullYear();
        return dd + '/' + mm + '/' + yyyy;
    }

    function setSelectorTo100AndCheckCheckboxes() {
        let select = document.querySelector('select[name="grabacionMasiva_length"]');
        if (select && select.value !== '100') {
            select.value = '100';
            select.dispatchEvent(new Event('change'));

            // Espera a que la tabla se actualice después de cambiar el selector
            setTimeout(checkCheckboxesForProcesando, 1000); // Ajusta el timeout según sea necesario
        }
    }

    function checkCheckboxesForProcesando() {
        let rows = document.querySelectorAll('#grabacionMasiva tbody tr');
        rows.forEach(row => {
            let statusCell = row.querySelector('td:nth-child(3)'); // Asumiendo que "ESTADO" es la tercera columna
            if (statusCell && statusCell.textContent.trim().toLowerCase() === 'procesando') {
                let checkbox = row.querySelector('input[type="checkbox"].marcarPedidos');
                if (checkbox) {
                    checkbox.checked = true;
                }
            }
        });
    }

    function adjustDateForMondays(today) {
        if (today.getDay() === 1) {
            today.setDate(today.getDate() - 3);
        } else {
            today.setDate(today.getDate() - 1);
        }
        return today;
    }

    let calendarIcon = document.querySelector('div.input-group-text');
    if (calendarIcon) {
        calendarIcon.click();
    }

    let today = new Date();
    let adjustedDate = adjustDateForMondays(today);
    let formattedDate = formatDate(adjustedDate);

    let dayElement = document.querySelector(`td[data-day="${formattedDate}"]`);
    if (dayElement) {
        dayElement.click();

        // Modificación para el botón "Buscar Envíos" de clase "CEX-button-yellow"
        let searchButton = document.querySelector('button.CEX-btn.CEX-button-yellow');
        if (searchButton) {
            searchButton.addEventListener('click', function() {
                setTimeout(setSelectorTo100AndCheckCheckboxes, 2000); // Espera 2 a 3 segundos después de hacer clic en buscar
            });
            searchButton.click();
        }
    }
})();
