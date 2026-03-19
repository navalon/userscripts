// ==UserScript==
// @name         Idealista - Top bar + histórico + señal por percentil (Lazy stats FIX v0.7)
// @namespace    https://tus-scripts.local/
// @version      0.7
// @description  Top bar sticky con visitas/contactos/favs, histórico local y demanda. Soporta lazy-load de estadísticas (favoritos)
// @match        https://www.idealista.com/inmueble/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // =========================
  // Config
  // =========================
  const STORE_KEY = "idealista_metrics_store_v1";
  const MAX_SNAPSHOTS_PER_AD = 60;
  const MIN_HOURS_BETWEEN_SNAPSHOTS = 4;

  const WEIGHTS = {
    visitsPerDay: 1,
    favsPerDay: 6,
    contactsPerDay: 20,
  };

  // Reintento corto inicial
  const RETRY_COUNT = 8;
  const RETRY_DELAY_MS = 450;

  // Si Idealista lo carga “solo” al bajar, aquí lo pillamos al vuelo
  const LAZY_OBSERVER_TIMEOUT_MS = 60_000; // 1 min escuchando cambios

  // =========================
  // Helpers
  // =========================
  const $ = (sel, root = document) => root.querySelector(sel);

  function getAdIdFromUrl() {
    const m =
      location.pathname.match(/\/inmueble\/(\d+)\//) ||
      location.pathname.match(/\/inmueble\/(\d+)/);
    return m ? m[1] : null;
  }

  function monthEsToIndex(m) {
    const map = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
    };
    const key = (m || "").toLowerCase().trim();
    return map[key] ?? null;
  }

  function parseEsDayMonthYear(text) {
    const re = /(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?/i;
    const m = (text || "").match(re);
    if (!m) return null;

    const day = Number(m[1]);
    const mi = monthEsToIndex(m[2]);
    if (mi === null) return null;

    const now = new Date();
    const year = m[3] ? Number(m[3]) : now.getFullYear();

    let d = new Date(year, mi, day);
    if (!m[3] && d.getTime() > now.getTime() + 24 * 3600 * 1000) {
      d = new Date(year - 1, mi, day);
    }
    return d;
  }

  function fmtDate(d) {
    if (!d) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = d.getFullYear();
    return `${dd}/${mm}/${yy}`;
  }

  function numFromMatch(str) {
    if (!str) return null;
    const cleaned = String(str)
      .replace(/\./g, "")
      .replace(/\s+/g, "")
      .replace(/\u00A0/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }

  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); }
    catch { return {}; }
  }

  function saveStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function hoursBetween(aIso, bIso) {
    const a = new Date(aIso).getTime();
    const b = new Date(bIso).getTime();
    return Math.abs(b - a) / (3600 * 1000);
  }

  function daysBetweenIso(aIso, bIso) {
    const a = new Date(aIso).getTime();
    const b = new Date(bIso).getTime();
    return Math.max(0.001, Math.abs(b - a) / (24 * 3600 * 1000));
  }

  function percentileRank(values, x) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    let idx = 0;
    while (idx < sorted.length && sorted[idx] <= x) idx++;
    return Math.round((idx / sorted.length) * 100);
  }

  // =========================
  // UI
  // =========================
  function buildBar() {
    const bar = document.createElement("div");
    bar.id = "ide-topbar-stats";
    bar.innerHTML = `
      <div class="ide-topbar-left">
        <span class="pill" id="pill-id">ID —</span>
        <span class="pill" id="pill-updated">Actualizado —</span>
        <span class="pill" id="pill-contacts">Contactos —</span>
        <span class="pill" id="pill-visits">Visitas —</span>
        <span class="pill" id="pill-favs">Favoritos —</span>
        <span class="pill" id="pill-growth">Crecimiento —</span>
        <span class="pill" id="pill-signal">Demanda —</span>
      </div>
      <div class="ide-topbar-right">
        <button id="ide-topbar-refresh" type="button">Refrescar</button>
        <button id="ide-topbar-force" type="button" title="Baja un momento a Estadísticas y vuelve">Forzar carga</button>
        <button id="ide-topbar-clear" type="button" title="Borra el histórico de este anuncio">Borrar este</button>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #ide-topbar-stats{
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 999999;
        display:flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 12px;
        background: rgba(0,0,0,.85);
        backdrop-filter: blur(6px);
        color: #fff;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        font-size: 14px;
      }
      #ide-topbar-stats .ide-topbar-left{display:flex; gap:10px; flex-wrap: wrap; align-items:center;}
      #ide-topbar-stats .pill{
        display:inline-flex;
        align-items:center;
        gap:8px;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.10);
        border: 1px solid rgba(255,255,255,.12);
        white-space: nowrap;
      }
      #ide-topbar-stats .dot{
        width:10px; height:10px; border-radius:50%;
        display:inline-block;
        background: #999;
        box-shadow: 0 0 0 2px rgba(153,153,153,.15);
      }
      #ide-topbar-refresh, #ide-topbar-clear, #ide-topbar-force{
        background:#fff; color:#000;
        border:0; border-radius:12px;
        padding:8px 12px; font-weight:600;
        cursor:pointer;
      }
      #ide-topbar-clear{background: rgba(255,255,255,.75);}
      #ide-topbar-force{background: rgba(255,255,255,.60);}
      #ide-topbar-refresh:active, #ide-topbar-clear:active, #ide-topbar-force:active{transform: translateY(1px);}
      body{ padding-top: 76px !important; }
    `;
    document.documentElement.appendChild(style);
    document.body.appendChild(bar);
  }

  function setPill(id, label, value) {
    const el = $(`#${id}`);
    if (!el) return;
    el.textContent = `${label} ${value ?? "—"}`;
  }

  function setSignal(label, score, pct, dotColor) {
    const el = $("#pill-signal");
    if (!el) return;
    const pctTxt = (pct == null) ? "" : ` | P${pct}`;
    el.innerHTML =
      `Demanda <span class="dot" style="background:${dotColor}; box-shadow:0 0 0 2px ${dotColor}33;"></span> ` +
      `${label} (${score.toFixed(2)})${pctTxt}`;
  }

  // =========================
  // Fetch stats (ondemand)
  // =========================
  async function fetchStatsHtml(adId) {
    const ondemand = $("#stats-ondemand");
    const path = ondemand?.dataset?.ondemandHtml || `/ajax/detailstatsview/${adId}/`;
    const url = new URL(path, location.origin);
    url.searchParams.set("_", String(Date.now()));
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) throw new Error(`No se pudo cargar stats (${res.status})`);
    return await res.text();
  }

  // =========================
  // Robust parsing (search anywhere)
  // =========================
  function getAllCandidateTexts(ondemandHtmlText) {
    const texts = [];
    try { texts.push((document.body?.innerText || "").trim()); } catch {}
    try { texts.push((document.body?.textContent || "").trim()); } catch {}

    const statsEl = document.getElementById("stats-ondemand");
    if (statsEl) {
      try { texts.push((statsEl.innerText || "").trim()); } catch {}
      try { texts.push((statsEl.textContent || "").trim()); } catch {}
    }

    if (ondemandHtmlText) {
      const doc = new DOMParser().parseFromString(ondemandHtmlText, "text/html");
      texts.push((doc.body?.innerText || "").trim());
      texts.push((doc.body?.textContent || "").trim());
    }

    // dedupe
    const uniq = [];
    const seen = new Set();
    for (const t of texts) {
      if (!t || t.length < 10) continue;
      const key = t.slice(0, 2500);
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(t);
    }
    return uniq;
  }

  function firstMatchNumber(texts, regexes) {
    for (const txt of texts) {
      for (const re of regexes) {
        const m = txt.match(re);
        const n = numFromMatch(m?.[1]);
        if (n != null) return n;
      }
    }
    return null;
  }

  function firstMatchDate(texts) {
    for (const txt of texts) {
      const m = txt.match(/anuncio\s+actualizado\s+el\s+(.+?)(?:\n|$)/i);
      if (m) {
        const d = parseEsDayMonthYear(m[1]);
        if (d) return d;
      }
    }
    return null;
  }

  function parseStatsRobust(ondemandHtmlText) {
    const texts = getAllCandidateTexts(ondemandHtmlText);

    const visitas = firstMatchNumber(texts, [/(\d[\d\.\s\u00A0]*)\s*visitas?/i]);
    const contactos = firstMatchNumber(texts, [/(\d[\d\.\s\u00A0]*)\s*contactos?/i]);

    const favs = firstMatchNumber(texts, [
      /(\d[\d\.\s\u00A0]*)\s*(?:veces\s*)?guardad[oa]s?\s+como\s+favorit[oa]s?/i,
      /(\d[\d\.\s\u00A0]*)\s*(?:veces\s*)?guardad[oa]s?/i,
      /(\d[\d\.\s\u00A0]*)\s*favorit[oa]s?/i,
    ]);

    const updatedDate = firstMatchDate(texts);

    return { visitas, contactos, favs, updatedDate };
  }

  // =========================
  // Histórico y scoring
  // =========================
  function upsertSnapshot(store, adId, snap) {
    store[adId] = store[adId] || { snapshots: [] };
    const arr = store[adId].snapshots;

    const last = arr[arr.length - 1];
    if (last && hoursBetween(last.t, snap.t) < MIN_HOURS_BETWEEN_SNAPSHOTS) {
      arr[arr.length - 1] = snap;
    } else {
      arr.push(snap);
      if (arr.length > MAX_SNAPSHOTS_PER_AD) arr.splice(0, arr.length - MAX_SNAPSHOTS_PER_AD);
    }
  }

  function computeDeltas(adEntry) {
    const arr = adEntry?.snapshots || [];
    if (arr.length < 2) return null;

    const a = arr[arr.length - 2];
    const b = arr[arr.length - 1];

    const dDays = daysBetweenIso(a.t, b.t);
    const dv = (b.visitas ?? 0) - (a.visitas ?? 0);
    const dc = (b.contactos ?? 0) - (a.contactos ?? 0);
    const df = (b.favs ?? 0) - (a.favs ?? 0);

    return {
      dDays,
      dv,
      dc,
      df,
      vpd: dv / dDays,
      cpd: dc / dDays,
      fpd: df / dDays,
    };
  }

  function computeScoreFromRates(rates) {
    if (!rates) return null;
    const v = Math.max(0, rates.vpd);
    const c = Math.max(0, rates.cpd);
    const f = Math.max(0, rates.fpd);
    return v * WEIGHTS.visitsPerDay + f * WEIGHTS.favsPerDay + c * WEIGHTS.contactsPerDay;
  }

  function computeGlobalPercentile(store, score) {
    const scores = [];
    for (const k of Object.keys(store)) {
      const deltas = computeDeltas(store[k]);
      const s = computeScoreFromRates(deltas);
      if (s != null && Number.isFinite(s)) scores.push(s);
    }
    if (!scores.length || score == null) return null;
    return percentileRank(scores, score);
  }

  function labelByPercentile(pct) {
    if (pct == null) return { label: "Sin histórico", color: "#999" };
    if (pct >= 90) return { label: "Muy alta", color: "#FF5C5C" };
    if (pct >= 70) return { label: "Alta", color: "#FFB020" };
    if (pct >= 40) return { label: "Media", color: "#7CFF6B" };
    return { label: "Baja", color: "#6FA8FF" };
  }

  // =========================
  // Lazy observer: cuando aparezcan favoritos, actualiza
  // =========================
  let lazyObserver = null;
  function startLazyObserver(onUpdate) {
    if (lazyObserver) return;

    const startedAt = Date.now();
    lazyObserver = new MutationObserver(() => {
      // En cuanto el DOM cambie, intentamos leer favs
      const stats = parseStatsRobust(null);
      if (stats.favs != null) {
        stopLazyObserver();
        onUpdate(stats);
        return;
      }
      // timeout
      if (Date.now() - startedAt > LAZY_OBSERVER_TIMEOUT_MS) {
        stopLazyObserver();
      }
    });

    lazyObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopLazyObserver() {
    try { lazyObserver?.disconnect(); } catch {}
    lazyObserver = null;
  }

  // =========================
  // Forzar carga: baja a “Estadísticas” y vuelve
  // =========================
  async function forceLoadStats() {
    const y0 = window.scrollY;

    // intentamos localizar el bloque “Estadísticas”
    let target = null;
    const all = Array.from(document.querySelectorAll("h1,h2,h3,div,section,article"));
    for (const el of all) {
      const t = (el.innerText || "").trim().toLowerCase();
      if (t === "estadísticas" || t.includes("\nestadísticas") || t.startsWith("estadísticas")) {
        target = el;
        break;
      }
      if (t.includes("estadísticas") && t.includes("visitas")) { // por si el texto va junto
        target = el;
        break;
      }
    }

    if (target) {
      target.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise(r => setTimeout(r, 900));
      window.scrollTo({ top: y0, behavior: "instant" });
      await new Promise(r => setTimeout(r, 350));
    } else {
      // fallback: scroll medio y volver
      window.scrollTo({ top: Math.max(0, y0 + 1200), behavior: "instant" });
      await new Promise(r => setTimeout(r, 900));
      window.scrollTo({ top: y0, behavior: "instant" });
      await new Promise(r => setTimeout(r, 350));
    }
  }

  // =========================
  // Main refresh
  // =========================
  async function refresh(adId) {
    setPill("pill-id", "ID", adId);
    setPill("pill-updated", "Actualizado", "Cargando…");
    setPill("pill-contacts", "Contactos", "—");
    setPill("pill-visits", "Visitas", "—");
    setPill("pill-favs", "Favoritos", "— (lazy)");
    setPill("pill-growth", "Crecimiento", "—");
    setSignal("Cargando…", 0, null, "#999");

    try {
      const html = await fetchStatsHtml(adId);

      let stats = parseStatsRobust(html);

      // reintento corto inicial
      for (let i = 0; i < RETRY_COUNT && stats.favs == null; i++) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        stats = parseStatsRobust(html);
      }

      // Pintamos lo que tengamos
      setPill("pill-updated", "Actualizado", stats.updatedDate ? fmtDate(stats.updatedDate) : "—");
      setPill("pill-contacts", "Contactos", stats.contactos ?? "—");
      setPill("pill-visits", "Visitas", stats.visitas ?? "—");
      setPill("pill-favs", "Favoritos", stats.favs ?? "— (esperando)");

      // Si no hay favs todavía, arrancamos observer para que se actualice cuando bajes
      if (stats.favs == null) {
        startLazyObserver((stats2) => {
          // Actualiza solo favs (y si visitas/contactos vienen, también)
          setPill("pill-favs", "Favoritos", stats2.favs ?? "—");
          if (stats2.visitas != null) setPill("pill-visits", "Visitas", stats2.visitas);
          if (stats2.contactos != null) setPill("pill-contacts", "Contactos", stats2.contactos);

          // Guardamos snapshot en cuanto se complete
          const store2 = loadStore();
          const snap2 = {
            t: new Date().toISOString(),
            visitas: Number(stats2.visitas ?? stats.visitas ?? 0),
            contactos: Number(stats2.contactos ?? stats.contactos ?? 0),
            favs: Number(stats2.favs ?? 0),
            updated: (stats2.updatedDate || stats.updatedDate) ? (stats2.updatedDate || stats.updatedDate).toISOString() : null,
          };
          upsertSnapshot(store2, adId, snap2);
          saveStore(store2);
        });
      }

      // Guardar snapshot (aunque falten favs)
      const store = loadStore();
      const snap = {
        t: new Date().toISOString(),
        visitas: Number(stats.visitas ?? 0),
        contactos: Number(stats.contactos ?? 0),
        favs: Number(stats.favs ?? 0),
        updated: stats.updatedDate ? stats.updatedDate.toISOString() : null,
      };
      upsertSnapshot(store, adId, snap);
      saveStore(store);

      // Deltas / Señal
      const deltas = computeDeltas(store[adId]);
      if (!deltas) {
        setPill("pill-growth", "Crecimiento", "Necesita 2 lecturas");
        setSignal("Sin histórico", 0, null, "#999");
        return;
      }

      const score = computeScoreFromRates(deltas);
      const pct = computeGlobalPercentile(store, score);
      const lab = labelByPercentile(pct);

      const growthTxt = `+${deltas.dv}v, +${deltas.dc}c, +${deltas.df}f en ${deltas.dDays.toFixed(1)}d`;
      setPill("pill-growth", "Crecimiento", growthTxt);
      setSignal(lab.label, score, pct, lab.color);

    } catch (e) {
      console.error("[Idealista TopBar] Error:", e);
      setPill("pill-updated", "Actualizado", "Error");
      setSignal("Sin datos", 0, null, "#999");
    }
  }

  function clearThis(adId) {
    const store = loadStore();
    delete store[adId];
    saveStore(store);
  }

  // =========================
  // Boot
  // =========================
  const adId = getAdIdFromUrl();
  if (!adId) return;

  buildBar();

  $("#ide-topbar-refresh")?.addEventListener("click", () => refresh(adId));
  $("#ide-topbar-force")?.addEventListener("click", async () => {
    await forceLoadStats();
    // tras forzar, re-leemos del DOM (ya debería estar)
    const s = parseStatsRobust(null);
    if (s.favs != null) setPill("pill-favs", "Favoritos", s.favs);
  });
  $("#ide-topbar-clear")?.addEventListener("click", () => { clearThis(adId); refresh(adId); });

  refresh(adId);
})();
