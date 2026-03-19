// ==UserScript==
// @name         Set date, search, and set selector to 100 and check checkboxes
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Set the date in the input field, perform search for shipments, automatically set the selector value to 100, and check checkboxes for 'procesando'
// @author       You
// @match        https://artsans.es/wp-admin/admin.php?page=correosexpress-utilidades
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
        console.log("Executing setSelectorTo100AndCheckCheckboxes");
        let select = document.querySelector('select[name="grabacionMasiva_length"]');
        if (select && select.value !== '100') {
            select.value = '100';
            select.dispatchEvent(new Event('change'));
            console.log("Changed select value to 100");

            // Wait for the table to update after changing the selector
            setTimeout(checkCheckboxesForProcesando, 1000); // Adjust the timeout as needed
        }
    }

    function checkCheckboxesForProcesando() {
        console.log("Checking for 'procesando' status to check checkboxes");
        let rows = document.querySelectorAll('#grabacionMasiva tbody tr');
        rows.forEach(row => {
            let statusCell = row.querySelector('td:nth-child(3)'); // Asumiendo que "ESTADO" es la tercera columna
            if (statusCell && statusCell.textContent.trim().toLowerCase() === 'procesando') {
                let checkbox = row.querySelector('input[type="checkbox"].marcarPedidos');
                if (checkbox) {
                    checkbox.checked = true;
                    console.log("Checkbox checked for 'procesando'");
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

        let searchButton = document.querySelector('button.CEX-btn.CEX-button-blue');
        if (searchButton) {
            searchButton.addEventListener('click', function() {
                setTimeout(setSelectorTo100AndCheckCheckboxes, 2000); // Wait 2 to 3 seconds after clicking search
            });
            searchButton.click();
        }
    }
})();
