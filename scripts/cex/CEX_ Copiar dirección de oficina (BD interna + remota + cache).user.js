// ==UserScript==
// @name         CEX: Copiar dirección de oficina (BD interna + remota + cache)
// @namespace    https://saquitodelasalud.com
// @version      2.0
// @description  Dado un código de oficina (7 dígitos), genera texto formateado listo para copiar. Soporta BD embebida, remota (JSON/CSV) y cache local.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ======= CONFIGURACIÓN RÁPIDA =======
  // Si tienes una BD remota (JSON o CSV publicado), pon aquí la URL:
  const REMOTE_DB_URL = ''; // ej: 'https://raw.githubusercontent.com/tuusuario/tu-repo/main/oficinas_correos.json'

  // BD embebida (ejemplos; amplíala cuando quieras)
  const EMBED_DB = {
    // Fuengirola – Plaza Chinorros
    "2964002": {
      direccion: "Pl. Chinorros 5, 29640 Fuengirola (Málaga)",
      horario:   "Lunes a viernes 08:30–20:30; sábados y festivos cerrado",
      telefono:  "952 474 384",
      etiqueta:  "OF. CORREOS FUENGIROLA"
    }
    // añade más: "XXXXXXX": {direccion:"", horario:"", telefono:"", etiqueta:""}
  };

  const LS_KEY = 'cex_offices_db_v1'; // cache local
  // ====================================

  // Estilos UI
  const style = document.createElement('style');
  style.textContent = `
    .sds-copy-office-btn {
      display:inline-block; margin-top:8px;
      padding:6px 10px; border-radius:8px;
      border:1px solid #0d6efd; background:#e7f1ff; color:#0d6efd;
      font-weight:600; cursor:pointer; user-select:none;
    }
    .sds-copy-ok { color:#198754 !important; border-color:#198754 !important; background:#eaf7ef !important; }
    .sds-db-btn {
      display:inline-block; margin-left:8px; margin-top:8px;
      padding:6px 10px; border-radius:8px; border:1px solid #6c757d; background:#f0f0f0; color:#333; font-weight:600; cursor:pointer;
    }
    .sds-db-modal {
      position:fixed; z-index:999999; inset:0; background:rgba(0,0,0,.4);
      display:flex; align-items:center; justify-content:center;
    }
    .sds-db-card {
      width:min(800px, 90vw); background:#fff; border-radius:12px; padding:16px; box-shadow:0 10px 30px rgba(0,0,0,.2);
      font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .sds-db-card h3 { margin:0 0 8px 0; }
    .sds-db-card textarea { width:100%; height:300px; border:1px solid #ccc; border-radius:8px; padding:8px; font-family:ui-monospace, SFMono-Regular, Consolas, monospace; }
    .sds-row { display:flex; gap:8px; margin-top:8px; }
    .sds-row button { padding:6px 10px; border-radius:8px; border:1px solid #ccc; background:#f7f7f7; cursor:pointer; }
    .sds-note { color:#555; font-size:12px; margin-top:6px; }
  `;
  document.head.appendChild(style);

  // Utilidades
  const q = (sel, root=document) => root.querySelector(sel);
  const qa = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  // Cache local
  function loadCache() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
  }
  function saveCache(db) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(db || {})); } catch {}
  }

  // Parser CSV (sep ';') -> objeto por código
  function parseCSV(text) {
    const out = {};
    const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    for (const line of lines) {
      // codigo;direccion;horario;telefono;etiqueta
      const parts = line.split(';');
      if (parts.length < 2) continue;
      const codigo = (parts[0] || '').trim();
      if (!/^\d{7}$/.test(codigo)) continue;
      out[codigo] = {
        direccion: parts[1]?.trim() || '',
        horario:   parts[2]?.trim() || '',
        telefono:  parts[3]?.trim() || '',
        etiqueta:  parts[4]?.trim() || ''
      };
    }
    return out;
  }

  // Detecta popups con oficinas (el cuadro que muestra "Seleccionar" y el código)
  function findOfficePopups() {
    return qa('div, section, article')
      .filter(el => /Seleccionar/i.test(el.textContent || ''))
      .filter(el => /\b\d{7}\b/.test(el.textContent || ''));
  }

  // Extrae {codigo, nombreLine, line1, line2} del popup
  function extractFromPopup(container) {
    const raw = container.innerText || container.textContent || '';
    const codeMatch = raw.match(/\b(\d{7})\b/);
    const codigo = codeMatch ? codeMatch[1] : '';
    const lines = raw.split('\n').map(s => s.trim()).filter(Boolean);

    let nombre = '';
    let linea1 = '';
    let linea2 = '';
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i];
      if (!nombre && /OF\.?\s*CORREOS|OFICINA/i.test(s)) { nombre = s; continue; }
      if (!linea1 && /\d/.test(s) && /[A-ZÁÉÍÓÚÜÑ]/i.test(s)) { linea1 = s; continue; } // calle + num
      if (!linea2 && /-\s*\d{5}$/.test(s)) { linea2 = s; }                                // ciudad - CP
    }
    return { codigo, nombre, linea1, linea2 };
  }

  // Carga BD remota si REMOTE_DB_URL está definido (JSON o CSV)
  async function fetchRemoteDB() {
    if (!REMOTE_DB_URL) return {};
    try {
      const res = await fetch(REMOTE_DB_URL, { cache: 'no-store' });
      const txt = await res.text();
      // JSON?
      try {
        const parsed = JSON.parse(txt);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        // CSV
        return parseCSV(txt);
      }
    } catch { return {}; }
  }

  // Construye texto final con prioridad: cache > embed > remoto > popup
  function buildOfficeText(codigo, popupFallback) {
    const cache = loadCache();
    const dbItem = cache[codigo] || EMBED_DB[codigo] || null;

    if (dbItem) {
      return [
        `${dbItem.etiqueta ? dbItem.etiqueta : 'Oficina de Correos'} (${codigo})`,
        `Dirección: ${dbItem.direccion || '(sin datos)'}`,
        dbItem.horario ? `Horario: ${dbItem.horario}` : null,
        dbItem.telefono ? `Teléfono: ${dbItem.telefono}` : null
      ].filter(Boolean).join('\n');
    }

    // Fallback con lo que ve el usuario en el popup
    const { nombre, linea1, linea2 } = popupFallback || {};
    const basicDir = [linea1, (linea2 || '').replace(/\s*-\s*/, ', ')].filter(Boolean).join(', ');
    return [
      `${nombre || 'Oficina de Correos'} (${codigo})`,
      basicDir ? `Dirección: ${basicDir}` : null
    ].filter(Boolean).join('\n');
  }

  // UI: botón de copiar + botón de BD
  function attachButtons(container) {
    if (!container || container.querySelector('.sds-copy-office-btn')) return;

    const data = extractFromPopup(container);
    if (!/^\d{7}$/.test(data.codigo)) return;

    // Botón Copiar
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'sds-copy-office-btn';
    copyBtn.textContent = 'Copiar dirección oficina';

    copyBtn.addEventListener('click', async () => {
      // Construye con prioridad cache/embebida; si no, intenta remota y recopia
      let texto = buildOfficeText(data.codigo, data);

      // Si no estaba en cache/embebida, mira remota una vez
      if (!loadCache()[data.codigo] && !EMBED_DB[data.codigo] && REMOTE_DB_URL) {
        try {
          const remote = await fetchRemoteDB();
          if (remote && remote[data.codigo]) {
            const merged = { ...loadCache(), ...remote };
            saveCache(merged);
            texto = buildOfficeText(data.codigo, data); // reconstruye con remota
          }
        } catch {}
      }

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(texto);
        } else {
          const ta = document.createElement('textarea');
          ta.value = texto;
          ta.style.position = 'fixed'; ta.style.top = '-1000px';
          document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
        copyBtn.textContent = '¡Copiado!';
        copyBtn.classList.add('sds-copy-ok');
        setTimeout(() => { copyBtn.textContent = 'Copiar dirección oficina'; copyBtn.classList.remove('sds-copy-ok'); }, 1600);
      } catch {
        alert('No se pudo copiar automáticamente. Texto:\n\n' + texto);
      }
    });

    // Botón BD (cargar/pegar CSV/JSON)
    const dbBtn = document.createElement('button');
    dbBtn.type = 'button';
    dbBtn.className = 'sds-db-btn';
    dbBtn.textContent = '⚙️ BD';

    dbBtn.addEventListener('click', () => openDBModal());

    // Inserta botones: justo antes del botón "Seleccionar" si existe; si no, al final
    const seleccionar = qa('button, a', container).find(el => /Seleccionar/i.test(el.textContent || ''));
    if (seleccionar && seleccionar.parentElement) {
      seleccionar.parentElement.insertBefore(copyBtn, seleccionar);
      seleccionar.parentElement.insertBefore(dbBtn, seleccionar);
    } else {
      container.appendChild(copyBtn);
      container.appendChild(dbBtn);
    }
  }

  // Modal para pegar CSV/JSON y guardar en cache
  function openDBModal() {
    const modal = document.createElement('div');
    modal.className = 'sds-db-modal';
    modal.innerHTML = `
      <div class="sds-db-card">
        <h3>Base de datos de oficinas</h3>
        <div class="sds-note">Pega JSON (formato objeto { "2964002": {direccion, horario, telefono, etiqueta}, ... }) o CSV con columnas:
        <br><code>codigo;direccion;horario;telefono;etiqueta</code></div>
        <textarea placeholder='{"2964002":{"direccion":"Pl. Chinorros 5, 29640 Fuengirola (Málaga)","horario":"L-V 08:30–20:30; sáb/fest cerrado","telefono":"952 474 384","etiqueta":"OF. CORREOS FUENGIROLA"}}'></textarea>
        <div class="sds-row">
          <button data-act="save">Guardar en cache</button>
          <button data-act="export">Exportar cache</button>
          <button data-act="clear">Vaciar cache</button>
          <button data-act="close">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const ta = q('textarea', modal);

    q('button[data-act="save"]', modal).onclick = () => {
      const txt = ta.value.trim();
      if (!txt) { alert('Pega JSON o CSV primero.'); return; }
      let obj = {};
      try {
        if (txt.startsWith('{')) {
          obj = JSON.parse(txt);
        } else {
          obj = parseCSV(txt);
        }
      } catch (e) { alert('No se pudo parsear. Revisa el formato.'); return; }
      const merged = { ...loadCache(), ...obj };
      saveCache(merged);
      alert('Guardado. Oficinas en cache: ' + Object.keys(merged).length);
    };

    q('button[data-act="export"]', modal).onclick = () => {
      const data = loadCache();
      ta.value = JSON.stringify(data, null, 2);
      ta.select(); document.execCommand('copy');
      alert('Cache exportada al portapapeles.');
    };

    q('button[data-act="clear"]', modal).onclick = () => {
      if (confirm('¿Vaciar cache local?')) { saveCache({}); alert('Cache vaciada.'); }
    };

    q('button[data-act="close"]', modal).onclick = () => { modal.remove(); };
  }

  // Bucle de inserción en los popups
  function scan() { findOfficePopups().forEach(attachButtons); }

  // Inicial + observer (el mapa re-renderiza)
  scan();
  const mo = new MutationObserver(() => scan());
  mo.observe(document.body, { childList: true, subtree: true });

})();
