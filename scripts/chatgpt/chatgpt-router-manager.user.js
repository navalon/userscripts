// ==UserScript==
// @name         ChatGPT Router Manager
// @namespace    https://github.com/navalon/userscripts
// @version      1.2.0
// @description  Botón flotante en ChatGPT para marcar la conversación actual como "chat destino".
//               Al pulsar, copia la URL al portapapeles para pegarla en los scripts de marketplace.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/chatgpt/chatgpt-router-manager.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/chatgpt/chatgpt-router-manager.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'chatgpt_active_url';
  const BTN_ID    = 'tm-router-set-btn';
  const BADGE_ID  = 'tm-router-badge';

  // ── Estilos ──
  GM_addStyle(`
    #${BTN_ID} {
      position: fixed; bottom: 16px; right: 16px; z-index: 999999;
      padding: 10px 14px; border-radius: 10px; border: 0;
      background: #10a37f; color: #fff; font-weight: 600; font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,.25); cursor: pointer;
      transition: background .2s, transform .1s;
    }
    #${BTN_ID}:hover  { background: #0d8c6d; transform: scale(1.04); }
    #${BTN_ID}:active { transform: scale(.97); }
    #${BTN_ID}.is-active { background: #6c47ff; }
    #${BADGE_ID} {
      position: fixed; bottom: 60px; right: 16px; z-index: 999999;
      padding: 6px 10px; border-radius: 8px; font-size: 11px;
      background: rgba(0,0,0,.75); color: #ccc;
      max-width: 280px; word-break: break-all;
      pointer-events: none; opacity: .85;
    }
  `);

  // ── Helpers ──
  function currentConvURL() {
    // Solo devuelve URL si estamos dentro de una conversación (/c/... o /g/.../c/...)
    const path = location.pathname;
    if (/\/c\/[a-f0-9-]+/.test(path)) return location.origin + path;
    return null;
  }

  function isCurrentActive() {
    const stored = GM_getValue(STORE_KEY, '');
    const current = currentConvURL();
    return stored && current && stored === current;
  }

  // ── UI ──
  let _updating = false;
  function updateUI() {
    if (_updating) return;
    _updating = true;

    const btn   = document.getElementById(BTN_ID);
    const badge = document.getElementById(BADGE_ID);
    if (!btn) { _updating = false; return; }

    const stored  = GM_getValue(STORE_KEY, '');
    const current = currentConvURL();
    const active  = stored && current && stored === current;

    btn.classList.toggle('is-active', active);
    btn.textContent = active
      ? '✅ Este chat es el destino'
      : '🎯 Usar este chat como destino';
    btn.disabled = !current; // desactivar si no estamos en /c/...

    if (badge) {
      badge.textContent = stored
        ? `Destino actual: ${stored.replace(/https:\/\/chatgpt\.com/, '')}`
        : 'Sin destino configurado';
    }
    _updating = false;
  }

  function createUI() {
    if (document.getElementById(BTN_ID)) { updateUI(); return; }

    // Badge informativo
    const badge = document.createElement('div');
    badge.id = BADGE_ID;
    document.body.appendChild(badge);

    // Botón principal
    const btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.addEventListener('click', () => {
      const url = currentConvURL();
      if (!url) return;
      GM_setValue(STORE_KEY, url);
      try { GM_setClipboard(url); } catch (_) {}
      updateUI();
      // Feedback visual de que se copió
      const orig = btn.textContent;
      btn.textContent = '📋 URL copiada al portapapeles!';
      setTimeout(() => updateUI(), 1800);
    });
    document.body.appendChild(btn);

    updateUI();
  }

  // ── Init ──
  function ensureUI() {
    // Si React eliminó nuestro botón, lo re-creamos
    if (!document.getElementById(BTN_ID)) {
      createUI();
    } else {
      updateUI();
    }
  }

  function init() {
    createUI();
    // Re-evalúa al navegar dentro del SPA (debounced)
    let _debounce;
    const mo = new MutationObserver(() => {
      clearTimeout(_debounce);
      _debounce = setTimeout(ensureUI, 400);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  // Espera a que la app esté lista — con reintentos
  if (document.readyState === 'complete') setTimeout(init, 1000);
  else window.addEventListener('load', () => setTimeout(init, 1500));

  // Navegación SPA: escucha cambios de URL + garantiza que el botón existe
  let lastHref = location.href;
  setInterval(() => {
    ensureUI();
    if (location.href !== lastHref) {
      lastHref = location.href;
    }
  }, 1500);
})();

