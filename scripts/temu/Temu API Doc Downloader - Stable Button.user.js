// ==UserScript==
// @name         Temu API Doc Downloader - Stable Button
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Descarga la documentación REAL desde la API interna de Temu usando menu_code.
// @match        https://partner-eu.temu.com/documentation*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
  'use strict';

  function insertButton() {
    if (document.getElementById("temuDocButton")) return;

    const btn = document.createElement("button");
    btn.id = "temuDocButton";
    btn.textContent = "⬇️ Descargar API (JSON)";

    Object.assign(btn.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "999999999",
      background: "#ff6b00",
      color: "#fff",
      border: "none",
      padding: "10px 14px",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "600",
    });

    btn.onclick = async () => {
      const menuCode = new URLSearchParams(location.search).get("menu_code");
      if (!menuCode) { alert("No menu_code detectado en la URL."); return; }

      const url = `https://partner-eu.temu.com/api/merchant/documentation/getDocumentationDetail?menuCode=${menuCode}`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = menuCode + ".json";
      a.click();
    };

    document.documentElement.appendChild(btn);
  }

  // Reintentar hasta que la página monte React
  const observer = new MutationObserver(insertButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  insertButton();
})();
