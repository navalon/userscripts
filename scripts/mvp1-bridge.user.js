// ==UserScript==
// @name         MVP1 Bridge — ChatGPT + Amazon + Temu
// @namespace    https://github.com/navalon/userscripts
// @version      3.2.0
// @description  Script unificado MVP1: en ChatGPT muestra botón "Usar como destino",
//               en Amazon/Temu extrae conversación y abre el chat destino. Comparte
//               almacenamiento GM_setValue entre dominios (mismo script = mismo storage).
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @match        https://sellercentral.amazon.es/messaging*
// @match        https://seller-eu.temu.com/*
// @updateURL    https://raw.githubusercontent.com/navalon/userscripts/main/scripts/mvp1-bridge.user.js
// @downloadURL  https://raw.githubusercontent.com/navalon/userscripts/main/scripts/mvp1-bridge.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_setClipboard
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const STORE_KEY = 'chatgpt_active_url';
  const host = location.hostname;

  // ── Detectar dominio ──
  if (host.includes('chatgpt.com') || host.includes('chat.openai.com')) {
    initChatGPT();
  } else if (host.includes('sellercentral.amazon')) {
    initAmazon();
  } else if (host.includes('seller-eu.temu.com')) {
    initTemu();
  }

  // ═══════════════════════════════════════════════
  //  CHATGPT — Botón "Usar este chat como destino"
  // ═══════════════════════════════════════════════
  function initChatGPT() {
    const BTN_ID = 'tm-router-set-btn';
    const BADGE_ID = 'tm-router-badge';

    GM_addStyle(`
      #${BTN_ID} {
        position:fixed;bottom:16px;right:16px;z-index:999999;
        padding:10px 14px;border-radius:10px;border:0;
        background:#10a37f;color:#fff;font-weight:600;font-size:13px;
        box-shadow:0 4px 12px rgba(0,0,0,.25);cursor:pointer;
        transition:background .2s,transform .1s;
      }
      #${BTN_ID}:hover{background:#0d8c6d;transform:scale(1.04)}
      #${BTN_ID}:active{transform:scale(.97)}
      #${BTN_ID}.is-active{background:#6c47ff}
      #${BADGE_ID}{
        position:fixed;bottom:60px;right:16px;z-index:999999;
        padding:6px 10px;border-radius:8px;font-size:11px;
        background:rgba(0,0,0,.75);color:#ccc;
        max-width:280px;word-break:break-all;pointer-events:none;opacity:.85;
      }
    `);

    function currentConvURL() {
      const path = location.pathname;
      if (/\/c\/[a-f0-9-]+/.test(path)) return location.origin + path;
      return null;
    }

    let _skip = false; // evita que el observer re-dispare al cambiar el DOM nosotros

    function updateUI() {
      const btn = document.getElementById(BTN_ID);
      const badge = document.getElementById(BADGE_ID);
      if (!btn) return;
      const stored = GM_getValue(STORE_KEY, '');
      const current = currentConvURL();
      const active = stored && current && stored === current;
      const newText = active ? '✅ Este chat es el destino' : '🎯 Usar este chat como destino';
      // Solo tocar el DOM si algo cambió (evita bucle con MutationObserver)
      if (btn.textContent !== newText) {
        _skip = true;
        btn.classList.toggle('is-active', active);
        btn.textContent = newText;
        btn.disabled = !current;
        _skip = false;
      }
      if (badge) {
        const badgeText = stored
          ? `Destino actual: ${stored.replace(/https:\/\/chatgpt\.com/, '')}`
          : 'Sin destino configurado';
        if (badge.textContent !== badgeText) {
          _skip = true;
          badge.textContent = badgeText;
          _skip = false;
        }
      }
    }

    function createUI() {
      if (document.getElementById(BTN_ID)) { updateUI(); return; }
      _skip = true;
      const badge = document.createElement('div');
      badge.id = BADGE_ID;
      document.body.appendChild(badge);

      const btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const url = currentConvURL();
        if (!url) return;
        GM_setValue(STORE_KEY, url);
        _skip = true;
        btn.textContent = '📋 URL guardada!';
        _skip = false;
        setTimeout(() => updateUI(), 1800);
      });
      document.body.appendChild(btn);
      _skip = false;
      updateUI();
    }

    function ensureUI() {
      if (!document.getElementById(BTN_ID)) createUI();
      else updateUI();
    }

    function init() {
      createUI();
      let _d;
      const mo = new MutationObserver(() => {
        if (_skip) return;
        clearTimeout(_d);
        _d = setTimeout(ensureUI, 500);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'complete') setTimeout(init, 1000);
    else window.addEventListener('load', () => setTimeout(init, 1500));
    // Solo comprueba si cambió la URL (navegación SPA), no re-renderiza si no hace falta
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        ensureUI();
      }
    }, 1500);

    // ── Auto-paste: si llegamos con #from=amazon/temu&payload=... ──
    function tryAutoPaste() {
      const hash = location.hash;
      if (!hash || !hash.includes('from=')) return;
      const params = new URLSearchParams(hash.slice(1));
      const from = params.get('from');
      const payloadB64 = params.get('payload');
      if (!from || !payloadB64) return;

      // Decodificar payload (base64 → texto)
      let text;
      try {
        text = decodeURIComponent(escape(atob(decodeURIComponent(payloadB64))));
      } catch (e) {
        console.warn('[MVP1 Bridge] Error decodificando payload:', e);
        return;
      }
      if (!text) return;

      // Limpiar el hash para que no se re-pegue
      history.replaceState(null, '', location.pathname);

      // Esperar a que el editor ProseMirror esté listo y pegar
      const maxAttempts = 30;
      let attempts = 0;
      const tryPaste = setInterval(() => {
        attempts++;
        const editor = document.querySelector('#prompt-textarea, [contenteditable="true"].ProseMirror, div[contenteditable="true"]');
        if (editor) {
          clearInterval(tryPaste);
          // ProseMirror: insertar como párrafos
          editor.focus();
          const lines = text.split('\n');
          editor.innerHTML = lines.map(l => `<p>${l || '<br>'}</p>`).join('');
          // Disparar evento input para que React lo detecte
          editor.dispatchEvent(new Event('input', { bubbles: true }));
          // Feedback visual
          const toast = document.createElement('div');
          toast.textContent = `✅ Conversación de ${from === 'amazon' ? 'Amazon' : 'Temu'} pegada (${lines.length} líneas)`;
          toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);background:#10a37f;color:#fff;padding:10px 16px;border-radius:8px;z-index:999999;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,.3);';
          document.body.appendChild(toast);
          setTimeout(() => toast.remove(), 3000);
        }
        if (attempts >= maxAttempts) clearInterval(tryPaste);
      }, 500);
    }

    // Ejecutar auto-paste tras un breve delay para que la SPA cargue
    setTimeout(tryAutoPaste, 2000);
  }

  // ═══════════════════════════════════════════════
  //  AMAZON — Copiar conversación + abrir ChatGPT
  // ═══════════════════════════════════════════════
  function initAmazon() {
    const BTN_ID = 'tm-amazon-chatgpt-btn';
    const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
    const raf = () => new Promise(r => requestAnimationFrame(r));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const isVisible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
      const r = el.getBoundingClientRect();
      return (r.width > 0 || r.height > 0);
    };
    const qVisible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).find(isVisible) || null;
    const qqVisible = (sel, root = document) => Array.from(root.querySelectorAll(sel)).filter(isVisible);

    function getActiveRoot() {
      const header = qVisible('.case-message-view-header');
      if (!header) return document.body;
      let p = header;
      for (let i = 0; i < 5 && p; i++) {
        if (qVisible('.case-message-view-messages', p)) return p;
        p = p.parentElement;
      }
      return header;
    }

    function collectConversation() {
      const root = getActiveRoot();
      const out = [];
      const name = qVisible('.buyer-name', root)?.innerText?.trim();
      const email = qVisible('#buyerProxyEmail', root)?.innerText?.trim();
      if (name) out.push(`👤 Cliente: ${name}`);
      if (email) out.push(`📧 Email proxy: ${email}`);
      out.push('');
      const msgsRoot = qVisible('.case-message-view-messages', root);
      const msgs = msgsRoot ? qqVisible('.message-component', msgsRoot) : [];
      out.push('💬 Conversación:');
      msgs.forEach(m => {
        const date = qVisible('.case-message-view-message-date', m)?.innerText?.trim();
        const body = qVisible('.message-body-text', m)?.innerText?.trim();
        const who = m.classList.contains('sent-message-component') ? '📤 Vendedor' : '📥 Cliente';
        if (date && body) out.push(`[${date}] ${who}: ${body}`);
      });
      out.push('');
      const orderKat = qVisible('kat-link[data-ph-capture-attribute-order-id]', root);
      const order = orderKat?.getAttribute('label') || orderKat?.getAttribute('data-ph-capture-attribute-order-id');
      if (order) out.push(`📦 Pedido: ${order}`);
      const metaRoot = qVisible('.context-field-container', root);
      const metaItems = metaRoot ? qqVisible('.linked-context-field-items', metaRoot) : [];
      if (metaItems.length) {
        out.push('');
        out.push('📑 Metadatos del pedido:');
        metaItems.forEach(it => {
          const label = qVisible('.linked-context-field-item-label', it)?.innerText?.trim();
          const val = qVisible('.gray', it)?.innerText?.trim();
          if (label && val) out.push(`${label}: ${val}`);
        });
      }
      return out.join('\n');
    }

    function addButton() {
      if (document.getElementById(BTN_ID)) return;
      const header = qVisible('.case-message-view-header');
      if (!header) return;
      const btn = document.createElement('button');
      btn.id = BTN_ID;
      btn.type = 'button';
      btn.textContent = '📋 Copiar y abrir ChatGPT';
      btn.style.cssText = 'margin-left:12px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';
      btn.addEventListener('click', async () => {
        const targetURL = GM_getValue(STORE_KEY, '');
        if (!targetURL) {
          alert('⚠️ No hay chat destino configurado.\nAbre ChatGPT y pulsa "🎯 Usar este chat como destino".');
          return;
        }
        await raf(); await sleep(60);
        const text = collectConversation();
        try { GM_setClipboard(text); } catch {}
        const url = `${targetURL}#from=amazon&payload=${encodeURIComponent(b64(text))}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        btn.textContent = '✅ Copiado y abriendo...';
        setTimeout(() => { btn.textContent = '📋 Copiar y abrir ChatGPT'; }, 1600);
      });
      header.appendChild(btn);
    }

    function initAmz() {
      addButton();
      let t;
      const mo = new MutationObserver(() => {
        clearTimeout(t);
        t = setTimeout(() => {
          const header = qVisible('.case-message-view-header');
          const btn = document.getElementById(BTN_ID);
          if (header && (!btn || btn.parentElement !== header)) { btn?.remove(); addButton(); }
        }, 200);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    setTimeout(initAmz, 1200);
  }

  // ═══════════════════════════════════════════════
  //  TEMU — Copiar chat + abrir ChatGPT
  // ═══════════════════════════════════════════════
  function initTemu() {
    const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

    GM_addStyle(`
      #tm-temu-chatgpt-btn {
        position:fixed;left:16px;bottom:16px;z-index:999999;
        padding:10px 14px;border-radius:10px;border:0;color:#fff;
        font-weight:600;box-shadow:0 6px 16px rgba(0,0,0,.2);cursor:pointer;
        background:#10a37f;
      }
      #tm-temu-chatgpt-btn[disabled]{opacity:.5;cursor:not-allowed}
      .tm-toast{
        position:fixed;left:50%;bottom:70px;transform:translateX(-50%);
        background:rgba(0,0,0,.85);color:#fff;padding:10px 14px;border-radius:8px;
        z-index:999999;font-size:13px;max-width:80vw;text-align:center;
      }
    `);

    const qs = (sel, root = document) => root.querySelector(sel);
    const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function toast(msg, ms = 2200) {
      const t = document.createElement('div');
      t.className = 'tm-toast'; t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), ms);
    }

    function gmCopy(text) {
      try { GM_setClipboard(text, 'text'); return; } catch {}
      if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(text); return; }
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy');
      document.body.removeChild(ta);
    }

    function openFirstChatIfNoneSelected() {
      const panel = qs('#mms-chat-msg-resize-area');
      if (panel && qs('.msg-item', panel)) return;
      const first = qs('div[data-index] ._3OURwMjG');
      if (first) first.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    function waitForMessages(timeoutMs = 8000) {
      return new Promise((resolve, reject) => {
        const container = qs('#mms-chat-msg-resize-area');
        if (!container) return reject(new Error('No encuentro el panel de mensajes'));
        if (qs('.msg-item', container)) return resolve();
        const obs = new MutationObserver(() => {
          if (qs('.msg-item', container)) { obs.disconnect(); resolve(); }
        });
        obs.observe(container, { childList: true, subtree: true });
        setTimeout(() => { obs.disconnect(); reject(new Error('Timeout')); }, timeoutMs);
      });
    }

    function extractConversation() {
      const panel = qs('#mms-chat-msg-resize-area');
      if (!panel) return 'No se encontró el panel de chat.';
      const header = ['=== Chat Temu (vendedor) ===', 'Fecha exportación: ' + new Date().toLocaleString()].join('\n');
      const items = qsa('.msg-item', panel);
      const lines = items.map(item => {
        const name = qs('._2PtrJ_c7 .jPzlbNSE', item)?.textContent?.trim()
                  || qs('._2Q3AbD-o ._1RJ8Mlhs', item)?.textContent?.trim() || '';
        const time = qs('._2PtrJ_c7 ._31BHZhsc', item)?.textContent?.trim()
                  || qs('._2Q3AbD-o ._2GZo3j-F', item)?.textContent?.trim() || '';
        let text = qs('._2STuiKsl', item)?.textContent?.trim()
                || qs('.Gtm4E-I2', item)?.textContent?.trim() || '';
        if (!text) { const c = qs('.center-msg_text, .mall-privacy-policy-card', item); if (c) text = c.textContent.trim(); }
        if (!text && qs('.order-with-count-from-consumer', item)) {
          const id = qs('[title^="PO-"]', item)?.getAttribute('title') || 'Pedido';
          const st = qs('._1GTFCB6F', item)?.textContent?.trim() || '';
          const pr = qs('._2Pqw9l_0', item)?.textContent?.trim() || '';
          text = `[${id}] ${st} ${pr}`.trim();
        }
        if (!text) text = (item.innerText || '').trim();
        const left = [time, name].filter(Boolean).join(' | ');
        return (left ? left + ': ' : '') + text;
      });
      return [header, ...lines].join('\n');
    }

    async function openChatGPT() {
      const targetURL = GM_getValue(STORE_KEY, '');
      if (!targetURL) {
        alert('⚠️ No hay chat destino configurado.\nAbre ChatGPT y pulsa "🎯 Usar este chat como destino".');
        return;
      }
      try {
        openFirstChatIfNoneSelected();
        await waitForMessages(8000);
        const txt = extractConversation();
        gmCopy(txt);
        const payload = encodeURIComponent(b64(txt));
        let url = `${targetURL}#from=temu&payload=${payload}`;
        if (url.length > 8000) url = `${targetURL}#from=temu&mode=clipboard`;
        window.open(url, '_blank', 'noopener,noreferrer');
        toast('Abriendo ChatGPT…');
      } catch (e) { toast('⚠️ ' + (e?.message || e)); }
    }

    function ensureButtons() {
      if (!qs('#tm-temu-chatgpt-btn')) {
        const btn = document.createElement('button');
        btn.id = 'tm-temu-chatgpt-btn'; btn.type = 'button';
        btn.textContent = '🤖 Abrir en ChatGPT';
        btn.addEventListener('click', openChatGPT);
        document.body.appendChild(btn);
      }
    }

    document.addEventListener('click', (e) => {
      if (e.target.closest('div[data-index] ._3OURwMjG')) {
        setTimeout(() => {
          const b = qs('#tm-temu-chatgpt-btn'); if (b) b.disabled = false;
        }, 300);
      }
    }, true);

    const boot = () => { ensureButtons(); setTimeout(openFirstChatIfNoneSelected, 600); };
    if (document.readyState === 'complete' || document.readyState === 'interactive') boot();
    else window.addEventListener('DOMContentLoaded', boot);
    const bodyObs = new MutationObserver(() => ensureButtons());
    bodyObs.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

})();

