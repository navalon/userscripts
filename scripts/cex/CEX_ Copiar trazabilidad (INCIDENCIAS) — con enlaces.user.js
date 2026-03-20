// ==UserScript==
// @name         CEX: Copiar trazabilidad (INCIDENCIAS) — con enlaces
// @namespace    https://saquitodelasalud.com
// @version      2.1
// @description  Copia Detalle del envío, Destinatario, Datos del Envío, Seguimientos, Gestiones y Comunicaciones desde la vista de Incidencias y añade enlaces (Pedido y CEX)
// @match        https://clientes.correosexpress.com/*/incidencias*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';

  // ==== CONFIG ENLACES ====
  const WP_BASE   = 'https://saquitodelasalud.com';
  const ORDERS_URL_FROM_REF = (ref) =>
    `${WP_BASE}/wp-admin/edit.php?s=${encodeURIComponent(ref)}&post_type=shop_order`;
  const CEX_TRACK_URL = (ship) =>
    `https://clientes.correosexpress.com/seguimiento?shippingNumber=${encodeURIComponent(ship)}`;

  const BTN_ID='cex-copy-inc-btn';
  const q=(s,r=document)=>r.querySelector(s);
  const qq=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const T=(el)=> (el?.textContent||'').replace(/\s+/g,' ').trim();
  const V=(el)=> ('value' in (el||{}) ? String(el.value||'').trim() : T(el));
  const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

  function copy(text){
    try{ if(typeof GM_setClipboard==='function'){ GM_setClipboard(text); return; } }catch{}
    if(navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.left='-9999px';
    document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch{} ta.remove();
  }

  function getRoot(){
    const el=q('#shippingNumber')||q('[id*="shippingNumber"]')||q('[data-col="shippingNumber"]');
    return (el && (el.closest('form, .portlet, .container, main, #content')||document.body))||document.body;
  }

  const TITLE_SEL = [
    'h1','h2','h3','h4','legend',
    '.portlet-title','.portlet-header','.section-title',
    '.titulo','.title','.header','.cabecera'
  ].join(',');
  const norm = s=> (s||'').toLowerCase().replace(/\s+/g,' ').trim();

  function findTitle(root, pats){
    const titles=qq(TITLE_SEL, root).map(el=>({el,txt:norm(T(el))})).filter(o=>o.txt);
    const regs=pats.map(p=>p instanceof RegExp?p:new RegExp(`\\b${p}\\b`,'i'));
    const hit=titles.find(t=>regs.some(r=>r.test(t.txt)));
    return hit?.el||null;
  }

  function sectionBox(titleEl){
    if(!titleEl) return null;
    const containers=['section','.portlet','.panel','.box','.card','.content','.container'];
    let p=titleEl;
    for(let i=0;i<3 && p;i++){
      if(containers.some(sel=>p.matches?.(sel))) return p;
      p=p.parentElement;
    }
    let sib=titleEl.nextElementSibling; while(sib && !T(sib)) sib=sib.nextElementSibling;
    return sib||titleEl.parentElement||titleEl;
  }

  function extractPairs(container){
    const out=[];
    qq('table',container).forEach(tb=>{
      qq('tr',tb).forEach(tr=>{
        const ths=qq('th',tr).map(T).filter(Boolean);
        const tds=qq('td',tr).map(T).filter(Boolean);
        if(ths.length && tds.length) out.push(`${ths.join(' / ')}: ${tds.join(' | ')}`);
        else if(tds.length>=2) out.push(`${tds[0]}: ${tds.slice(1).join(' | ')}`);
      });
    });
    qq('dl',container).forEach(dl=>{
      qq('dt',dl).forEach(dt=>{
        const dd=dt.nextElementSibling?.tagName==='DD' ? dt.nextElementSibling : null;
        const k=T(dt), v=T(dd); if(k&&v) out.push(`${k}: ${v}`);
      });
    });
    qq('label',container).forEach(lb=>{
      const k=T(lb); if(!k) return;
      const id=lb.getAttribute('for');
      let v='';
      if(id){ v=V(q(`#${CSS.escape(id)}`,container)||q(`[name="${id}"]`,container)); }
      else{
        let n=lb.nextElementSibling;
        if(n && !/^(INPUT|SELECT|TEXTAREA)$/i.test(n.tagName)) n=q('input,select,textarea', lb.parentElement||container);
        v=V(n);
      }
      if(v) out.push(`${k}: ${v}`);
    });
    qq('.row',container).forEach(r=>{
      const cols=qq('.col,[class*="col-"]',r).map(T).filter(Boolean);
      if(cols.length===2) out.push(`${cols[0]}: ${cols[1]}`);
    });
    return Array.from(new Set(out));
  }

  function extractRows(container){
    const out=[];
    const tables=qq('table',container);
    if(tables.length){
      tables.forEach(t=>{
        const headers=qq('th',t).map(T);
        qq('tbody tr',t).forEach(tr=>{
          const cells=qq('td,th',tr).map(T).filter(Boolean);
          if(!cells.length) return;
          if(headers.length && cells.length===headers.length) out.push('• '+cells.join(' — '));
          else if(cells.length>=3) out.push(`• ${cells[0]} — ${cells[1]} — ${cells[2]}`);
          else out.push('• '+cells.join(' — '));
        });
      });
      if(out.length) return out;
    }
    const list=q('ul,ol',container);
    if(list){ qq('li',list).forEach(li=>{const t=T(li); if(t) out.push('• '+t);}); if(out.length) return out; }
    qq('.evento,.event,.line,.registro,.item,.row',container).forEach(n=>{
      const t=T(n); if(t && t.length>3) out.push('• '+t);
    });
    return Array.from(new Set(out));
  }

  function extractBlock(titleEl){
    const out=[]; if(!titleEl) return out;
    let n=titleEl.nextElementSibling;
    while(n){
      if(n.matches(TITLE_SEL)) break;
      const txt=T(n);
      if(txt){
        const parts=txt.split(/(?:\s*[•\-–]\s+|\n+)/).map(s=>s.trim()).filter(Boolean);
        if(parts.length>1) parts.forEach(p=>out.push(p.startsWith('•')?p:'• '+p));
        else out.push('• '+txt);
      }
      n=n.nextElementSibling;
    }
    return out;
  }

  function byTitle(root, pats, mode='smart'){
    const t=findTitle(root, pats); if(!t) return [];
    const box=sectionBox(t)||t;
    let lines=[];
    if(mode==='pairs') lines=extractPairs(box);
    else if(mode==='rows') lines=extractRows(box);
    else { lines=extractPairs(box); if(!lines.length) lines=extractRows(box); if(!lines.length) lines=extractBlock(t); }
    return lines.map(s=>s.replace(/\s{2,}/g,' ').trim()).filter(Boolean);
  }

  // Nota: en Incidencias a veces hay un sub-bloque “Seguimientos”.
  function extractSeguimientos(root){
    return byTitle(root, [/seguimient/i,/tracking/i], 'rows');
  }

  function build(){
    const root=getRoot();
    const out=[];

    const ship = V(q('#shippingNumber,[id*="shippingNumber"],[data-col="shippingNumber"]',root));
    const ref  = ([
      '#reference','[id*="reference"]','[name*="reference"]','[data-col="reference"]'
    ].map(s=>V(q(s,root))).find(Boolean)) || '';

    if(ship){ out.push(`Número de envío: ${ship}`); }
    if(ref){  out.push(`Referencia: ${ref}`); }
    if(ship||ref){ out.push(''); }

    const detalle = byTitle(root, [/detalle.*env[ií]o/i], 'smart');
    if(detalle.length){ out.push('Detalle del envío:'); out.push(...detalle.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    const dest = byTitle(root, [/destinatari/i,/receptor/i], 'smart');
    if(dest.length){ out.push('Destinatario:'); out.push(...dest.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    const datos = byTitle(root, [/datos.*env[ií]o/i,/informaci[oó]n.*env[ií]o/i], 'smart');
    if(datos.length){ out.push('Datos del Envío:'); out.push(...datos.map(l=>l.startsWith('•')?l:'• '+l)); out.push(''); }

    const segs = extractSeguimientos(root);
    if(segs.length){ out.push('Seguimientos:'); out.push(...segs); out.push(''); }

    const gest = byTitle(root, [/gestiones?/i,/incidenc/i,/acciones/i], 'rows');
    if(gest.length){ out.push('Gestiones:'); out.push(...gest); out.push(''); }

    const com = byTitle(root, [/comunicaci[oó]n/i,/mensaj/i], 'rows');
    if(com.length){ out.push('Comunicaciones:'); out.push(...com); out.push(''); }

    // Comunicaciones del envío (#shippingCommunications)
    const scEl = q('#shippingCommunications', root) || document.getElementById('shippingCommunications');
    if (scEl) {
      let scLines = extractRows(scEl);
      if (!scLines.length) scLines = extractPairs(scEl);
      if (!scLines.length) {
        const raw = T(scEl);
        if (raw) scLines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => '• ' + l);
      }
      if (scLines.length) { out.push('Comunicaciones del envío:'); out.push(...scLines); out.push(''); }
    }

    if(ship || ref){
      out.push('Enlaces:');
      if(ref)  out.push(`• Pedido (ref): ${ORDERS_URL_FROM_REF(ref)}`);
      if(ship) out.push(`• Seguimiento CEX: ${CEX_TRACK_URL(ship)}`);
      out.push('');
    }

    if(!out.join('').trim()){
      const fp=extractPairs(root), fr=extractRows(root);
      if(fp.length || fr.length){ out.push('Detalle (fallback):'); out.push(...fp.map(l=>'• '+l), ...fr); }
      else out.push('No se pudo localizar ninguna sección reconocible.');
    }
    return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function addBtn(){
    if(document.getElementById(BTN_ID)) return;
    const root=getRoot();
    const anchor = q('#shippingNumber,[id*="shippingNumber"],[data-col="shippingNumber"]',root)?.parentElement
                || q('legend,.portlet-title,h1,h2',root) || root;
    const btn=document.createElement('button');
    btn.id=BTN_ID; btn.type='button';
    btn.textContent='📋 Copiar trazabilidad (incidencia)';
    btn.style.cssText='margin-left:10px;padding:6px 10px;border-radius:6px;border:none;background:#1a73e8;color:#fff;font-weight:600;cursor:pointer;';
    btn.addEventListener('click', async ()=>{
      await sleep(60);
      copy(build());
      btn.textContent='✅ Copiado';
      setTimeout(()=>btn.textContent='📋 Copiar trazabilidad (incidencia)',1200);
    });
    anchor.appendChild(btn);
  }

  function init(){
    addBtn();
    const mo=new MutationObserver(()=>{ if(!document.getElementById(BTN_ID)) addBtn(); });
    mo.observe(document.body,{childList:true,subtree:true});
  }

  setTimeout(init,500);
})();
