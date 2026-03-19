// ==UserScript==
// @name         CEX: Copiar trazabilidad — Incidencias
// @namespace    https://saquitodelasalud.com
// @version      2.0
// @description  Copia Detalle del envío, Destinatario, Datos del Envío, Seguimiento, Gestiones y Comunicaciones en la vista de incidencias
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';

  const BTN_ID = 'cex-copy-trace-inc-btn';
  const q  = (s, r=document)=>r.querySelector(s);
  const qq = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const sleep = ms => new Promise(r=>setTimeout(r, ms));
  const T = el => (el?.textContent || '').replace(/\s+/g,' ').trim();
  const N = s  => (s||'').replace(/\s+/g,' ').trim().toLowerCase();

  function textFrom(el){ if(!el) return ''; if('value' in el && el.value!=null) return String(el.value).trim(); return (el.textContent||'').trim(); }
  function copyText(text){
    if (!text) return;
    try{ if(typeof GM_setClipboard==='function'){ GM_setClipboard(text); return; } } catch{}
    if (navigator.clipboard?.writeText){ navigator.clipboard.writeText(text).catch(()=>{}); return; }
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch{} ta.remove();
  }

  function getRoot(){
    const el = q('#manageIncidenceDetailForm') || q('form[action*="manageIncidents_detail"]') || document.body;
    return el.closest('form, .portlet, .portlet-boundary, main, #content') || document.body;
  }

  const TITLE_SEL = 'h1,h2,h3,h4,legend,.portlet-title,.section-title,.titulo,.title,.header,.cabecera';

  function findTitle(root, patterns){
    const pats = patterns.map(p => p instanceof RegExp ? p : new RegExp(`\\b${p}\\b`, 'i'));
    return qq(TITLE_SEL, root).find(el => pats.some(r => r.test(N(el.textContent))));
  }
  function blockFromTitle(titleEl){
    if(!titleEl) return null;
    const containers=['section','.portlet','.panel','.box','.card','.content','.container','fieldset'];
    let p=titleEl;
    for(let i=0;i<3 && p;i++){ if(containers.some(sel=>p.matches?.(sel))) return p; p=p.parentElement; }
    let sib=titleEl.nextElementSibling; while(sib && T(sib)==='') sib=sib.nextElementSibling;
    return sib || titleEl.parentElement || titleEl;
  }

  function extractPairs(container){
    const out=[];
    qq('table', container).forEach(tb=>{
      qq('tr', tb).forEach(tr=>{
        const ths=qq('th', tr).map(T).filter(Boolean);
        const tds=qq('td', tr).map(T).filter(Boolean);
        if (ths.length && tds.length) out.push(`${ths.join(' / ')}: ${tds.join(' | ')}`);
        else if (tds.length>=2) out.push(`${tds[0]}: ${tds.slice(1).join(' | ')}`);
      });
    });
    qq('dl', container).forEach(dl=>{
      qq('dt', dl).forEach(dt=>{
        const dd=dt.nextElementSibling?.tagName==='DD'?dt.nextElementSibling:null;
        const k=T(dt), v=T(dd); if(k&&v) out.push(`${k}: ${v}`);
      });
    });
    qq('label', container).forEach(lb=>{
      const k=T(lb); if(!k) return;
      let v=''; const forId=lb.getAttribute('for');
      if(forId){ const inpt=q(`#${CSS.escape(forId)}`, container)||q(`[name="${forId}"]`, container); v=textFrom(inpt); }
      else{ let inpt=lb.nextElementSibling; if(inpt && !/^(INPUT|SELECT|TEXTAREA)$/i.test(inpt.tagName)){ inpt=q('input,select,textarea', lb.parentElement||container); } v=textFrom(inpt); }
      if(v) out.push(`${k}: ${v}`);
    });
    qq('.row', container).forEach(row=>{
      const cols=qq('.col,[class*="col-"]', row).map(T).filter(Boolean);
      if(cols.length===2) out.push(`${cols[0]}: ${cols[1]}`);
    });
    return Array.from(new Set(out.filter(Boolean)));
  }

  function extractRows(container){
    const out=[];
    qq('table', container).forEach(t=>{
      const headers=qq('thead th', t).map(T);
      qq('tbody tr', t).forEach(tr=>{
        const cells = qq('td,th', tr).map(T).filter(Boolean);
        if(!cells.length) return;
        if(headers.length && cells.length===headers.length) out.push('• '+cells.join(' — '));
        else if(cells.length>=3) out.push(`• ${cells[0]} — ${cells[1]} — ${cells[2]}`);
        else out.push('• '+cells.join(' — '));
      });
    });
    if(out.length) return out;

    const list=q('ul,ol', container);
    if(list){ qq('li', list).forEach(li=>{ const txt=T(li); if(txt) out.push('• '+txt); }); }

    qq('.evento,.event,.line,.registro,.item,.row', container).forEach(n=>{
      const txt=T(n); if(txt && txt.length>3) out.push('• '+txt);
    });
    return Array.from(new Set(out));
  }

  function extractGeneric(root, titlePatterns){
    const title = findTitle(root, titlePatterns);
    if(!title) return [];
    const box = blockFromTitle(title) || title;
    let lines = extractPairs(box);
    if(!lines.length) lines = extractRows(box);
    if(!lines.length){
      let n=title.nextElementSibling;
      while(n && !n.matches(TITLE_SEL)){ const txt=T(n); if(txt) lines.push('• '+txt); n=n.nextElementSibling; }
    }
    return lines.map(s=>s.replace(/\s{2,}/g,' ').trim()).filter(Boolean);
  }

  function buildPayload(){
    const root=getRoot();
    const out=[];

    // Número de envío si está en inputs ocultos o visibles
    const num = textFrom(q('#numEnvio,[name="trackingShipment.numEnvio"],[name="shippingNumber"],[name*="numEnvio"]', root));
    if(num){ out.push(`Número de envío: ${num}`); out.push(''); }

    // Detalle del envío (suele existir también en incidencias)
    const detalle = extractGeneric(root, [/detalle.*env[ií]o/i,/detalle/i]);
    if(detalle.length){ out.push('Detalle del envío:'); out.push(...detalle.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    // Destinatario
    const dest = extractGeneric(root, [/destinatari/i,/receptor/i,/entrega en oficina/i,/destino/i]);
    if(dest.length){ out.push('Destinatario:'); out.push(...dest.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    // Datos del Envío
    const datos = extractGeneric(root, [/datos.*env[ií]o/i,/informaci[oó]n.*env[ií]o/i,/producto|bultos|peso|portes/i]);
    if(datos.length){ out.push('Datos del Envío:'); out.push(...datos.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    // Seguimiento (si lo embeben en incidencias)
    const seg = extractGeneric(root, [/seguimient/i,/tracking/i,/hist[oó]rico.*mov/i]);
    if(seg.length){ out.push('Seguimiento:'); out.push(...seg); out.push(''); }

    // Gestiones (núcleo de Incidencias)
    const gest = extractGeneric(root, [/gestiones?/i,/incidenc/i,/acciones/i,/gesti[oó]n/i]);
    if(gest.length){ out.push('Gestiones:'); out.push(...gest); out.push(''); }

    // Comunicaciones
    const comm = extractGeneric(root, [/comunicaci[oó]n/i,/comunicacion/i,/mensaj/i,/contacto/i]);
    if(comm.length){ out.push('Comunicaciones:'); out.push(...comm); out.push(''); }

    if(!out.join('').trim()) out.push('No se pudo localizar ninguna sección reconocible.');
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function addButton(){
    if (document.getElementById(BTN_ID)) return;
    const root=getRoot();
    const anchor = q('legend, h1, h2, .portlet-title', root)?.parentElement || root;

    const btn=document.createElement('button');
    btn.id=BTN_ID; btn.type='button';
    btn.textContent='📋 Copiar trazabilidad (incidencia)';
    btn.style.cssText='margin-left:10px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', async ()=>{
      await sleep(60);
      copyText(buildPayload());
      btn.textContent='✅ Copiado';
      setTimeout(()=>{ btn.textContent='📋 Copiar trazabilidad (incidencia)'; }, 1400);
    });
    anchor.appendChild(btn);
  }

  function init(){
    addButton();
    const mo=new MutationObserver(()=>{ if(!document.getElementById(BTN_ID)) addButton(); });
    mo.observe(document.body, { childList:true, subtree:true });
  }
  setTimeout(init, 400);
})();
