// ==UserScript==
// @name         CEX: Dock flotante unificado + POD descargador (Woo/Amazon/AliExpress/Temu/WA)
// @namespace    https://saquitodelasalud.com
// @version      2.5.0
// @description  Dock vertical. El botón POD no mueve el original; abre el modal, toma la URL del POD y la descarga con nombre controlado.
// @match        https://clientes.correosexpress.com/*/envios*
// @match        https://clientes.correosexpress.com/*/envios1*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function(){
  'use strict';

  const DOCK_ID = 'cex-floating-dock';
  const isIncidencias = location.pathname.includes('/envios1');

  const IDS = {
    wa:'wa-web-open-btn',
    temu:'temu-link-btn',
    copyInc:'cex-copy-trace-inc-btn',
    copyEnv:'cex-copy-trace-btn',
    viewWoo:'cex-view-woo-btn',
    viewAmz:'cex-view-amz-btn',
    viewAe:'cex-view-ae-btn',
    pod:'cex-download-pod-btn'
  };

  const FALLBACK = {
    temuByHref:'a[href*="seller-eu.temu.com/order-detail.html"]',
    temuByText:n=>/temu/i.test(n.textContent||''),
    waByText:n=>/(whatsapp|abrir whatsapp|wa)/i.test(n.textContent||''),
    copyByText:n=>/copiar.*traza|copiar.*trazabilidad/i.test(n.textContent||''),
    viewWooHref:'a[href*="/wp-admin/post.php?post="]',
    viewWooText:n=>/ver en (web|artsans|saquitodelasalud(\.com)?)/i.test(n.textContent||''),
    viewAmzHref:'a[href*="sellercentral.amazon"][href*="/orders-v3/order/"]',
    viewAmzText:n=>/ver en amazon/i.test(n.textContent||''),
    viewAeHref:'a[href*="aliexpress.com"][href*="orderDetail"], a[href*="gsp.aliexpress.com"][href*="orderDetail"]',
    viewAeText:n=>/ver en aliexpress/i.test(n.textContent||''),
    podByText:n=>/(descargar\s*pod|comprobante\s*de\s*entrega|^pod$)/i.test(n.textContent||'')
  };

  // ---------- helpers ----------
  const q=(s,r=document)=>r.querySelector(s);
  function ensureDock(){
    let d=document.getElementById(DOCK_ID);
    if(d) return d;
    d=document.createElement('div');
    d.id=DOCK_ID;
    d.style.cssText=[
      'position:fixed','left:16px','bottom:16px','z-index:999999',
      'display:flex','flex-direction:column','gap:10px',
      'padding:12px','background:rgba(0,0,0,0.06)',
      'backdrop-filter:saturate(140%) blur(2px)',
      'border:1px solid rgba(0,0,0,0.08)','border-radius:12px',
      'box-shadow:0 6px 18px rgba(0,0,0,0.15)','max-width:42vw'
    ].join(';');
    const title=document.createElement('div');
    title.textContent=isIncidencias?'Acciones (Incidencia)':'Acciones (Envío)';
    title.style.cssText='font:600 12px/1.2 system-ui,Arial; color:#333; opacity:.8;';
    d.appendChild(title);

    const style=document.createElement('style');
style.textContent = `
  .cex-dup-hidden { display:none !important; }
  #${DOCK_ID} a, #${DOCK_ID} button {
    display:block !important;
    width:100%;
    margin:0 !important;
    background:#1a73e8;
    color:#fff;
    border:none;
    border-radius:10px;
    padding:8px 12px;
    font:600 13px system-ui,Arial;
    text-decoration:none;
    box-shadow:0 2px 8px rgba(0,0,0,.12);
    cursor:pointer;
    text-align:center;     /* <-- centrado horizontal */
  }
  #observations ~ a[href*="seller-eu.temu.com"],
  textarea[name="observations"] ~ a[href*="seller-eu.temu.com"] { display:none !important; }
`;
    document.head.appendChild(style);

    document.body.appendChild(d);
    return d;
  }

  function mkBtn(label,bg,onClick,id){
    const a=document.createElement('button');
    if(id) a.id=id;
    a.type='button';
    a.textContent=label;
    a.style.cssText=[
      `background:${bg}`,'color:#fff','border:none','border-radius:10px',
      'padding:8px 12px','font:600 13px system-ui,Arial',
      'text-decoration:none','box-shadow:0 2px 8px rgba(0,0,0,.12)','cursor:pointer'
    ].join(';');
    a.addEventListener('click',onClick);
    const wrap=document.createElement('div');
    wrap.appendChild(a);
    return wrap;
  }

  function styleAsDockButton(el,bg){
    if(!el) return;
    el.style.display='block';
    el.style.background=bg||el.style.background||'#1a73e8';
    el.style.color='#fff';
    el.style.border='none';
    el.style.borderRadius='10px';
    el.style.padding='8px 12px';
    el.style.font='600 13px system-ui,Arial';
    el.style.textDecoration='none';
    el.style.boxShadow='0 2px 8px rgba(0,0,0,.12)';
    el.style.cursor='pointer';
  }

  function wrapIntoDock(el,bg){
    const dock=ensureDock();
    if(!el || el.closest('#'+DOCK_ID)) return;
    styleAsDockButton(el,bg);
    const wrap=document.createElement('div');
    wrap.appendChild(el);
    dock.appendChild(wrap);
  }

  // small toast
  function toast(msg, ms=2200){
    const t=document.createElement('div');
    t.textContent=msg;
    t.style.cssText=[
      'position:fixed','left:50%','bottom:80px','transform:translateX(-50%)',
      'background:rgba(0,0,0,.85)','color:#fff','padding:8px 12px',
      'border-radius:8px','z-index:999999','font:13px system-ui'
    ].join(';');
    document.body.appendChild(t);
    setTimeout(()=>t.remove(), ms);
  }

  // download helpers
  function downloadBlob(filename, blob){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2500);
  }

  function suggestPodFilename(pod){
    const envio = (q('#shippingNumber')?.value || q('[id*="shippingNumber"]')?.value || q('#shippingNumber')?.textContent || '').trim();
    const base = envio || pod || 'POD';
    return `POD_${base}${pod && envio ? '_' + pod : ''}.jpg`;
  }

  // ---------- finders ----------
  function findTemu(){ return document.getElementById(IDS.temu) || q(FALLBACK.temuByHref) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.temuByText); }
  function findWA(){ return document.getElementById(IDS.wa) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.waByText); }
  function findCopy(){
    if(isIncidencias && document.getElementById(IDS.copyInc)) return document.getElementById(IDS.copyInc);
    if(!isIncidencias && document.getElementById(IDS.copyEnv)) return document.getElementById(IDS.copyEnv);
    return Array.from(document.querySelectorAll('a,button')).find(FALLBACK.copyByText);
  }
  function findWoo(){ return document.getElementById(IDS.viewWoo) || q(FALLBACK.viewWooHref) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.viewWooText); }
  function findAmz(){ return document.getElementById(IDS.viewAmz) || q(FALLBACK.viewAmzHref) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.viewAmzText); }
  function findAe(){ return document.getElementById(IDS.viewAe) || q(FALLBACK.viewAeHref) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.viewAeText); }
  function findPodOriginal(){ return document.getElementById(IDS.pod) ||
    Array.from(document.querySelectorAll('a,button')).find(FALLBACK.podByText); }

  // ---------- POD flow ----------
  function waitForPodModal(timeout=6000){
    return new Promise((resolve,reject)=>{
      const start=Date.now();
      (function tick(){
        const modal=document.getElementById('podListDialog');
        const row = modal && modal.querySelector('#podSearchResultsTable tbody tr');
        if(row) { resolve({modal,row}); return; }
        if(Date.now()-start>timeout) { reject(new Error('No apareció la lista de POD')); return; }
        requestAnimationFrame(tick);
      })();
    });
  }

  function parsePodUrlFromRow(row){
    const on = row.getAttribute('onclick') || '';
    // busca window.open('URL'
    const m = on.match(/window\.open\('([^']+)'/);
    return m ? m[1] : null;
  }

  function parsePodNumberFromRow(row){
    const td = row.querySelector('td');
    const txt = (td?.textContent||'').trim();
    const num = txt.match(/\d{6,}/)?.[0] || '';
    return num;
  }

  async function handlePodFlow(clickOriginal){
    try{
      // dispara el original para que CEX abra el modal
      clickOriginal();

      const {row}=await waitForPodModal(8000);
      const podUrl = parsePodUrlFromRow(row);
      const podNum = parsePodNumberFromRow(row);

      if(podUrl){
        // descargamos nosotros y nombramos el archivo
        toast('Descargando POD…');
        const resp = await fetch(podUrl, { credentials:'include' });
        if(!resp.ok) throw new Error('HTTP '+resp.status);
        const ct = resp.headers.get('content-type') || '';
        const blob = await resp.blob();

        let filename = suggestPodFilename(podNum);
        // si es PDF, ajusta extensión
        if (/pdf/i.test(ct)) filename = filename.replace(/\.jpg$/i, '.pdf');

        downloadBlob(filename, blob);
        toast('POD descargado');
      }else{
        // fallback: clic normal (abre pop-up con la imagen)
        row.dispatchEvent(new MouseEvent('click',{bubbles:true}));
        toast('No pude leer la URL; abrí la ventana del POD.');
      }
    }catch(e){
      console.warn('[POD]', e);
      alert('No se pudo descargar automáticamente el POD.\n\nMotivo: '+ (e.message||e));
    }
  }

  // ---------- mover/crear en dock ----------
  function moveKnown(){
    const dock=ensureDock();

    const wa=findWA(); if(wa) wrapIntoDock(wa,'#22c55e');
    const temu=findTemu(); if(temu) wrapIntoDock(temu,'#6b7280');
    const copy=findCopy(); if(copy) wrapIntoDock(copy,'#2563eb');
    const woo=findWoo(); if(woo) wrapIntoDock(woo,'#6b7280');
    const amz=findAmz(); if(amz) wrapIntoDock(amz,'#f59e0b');
    const ae=findAe(); if(ae) wrapIntoDock(ae,'#ef4444');

    // POD proxy (no movemos el original)
    const podOriginal=findPodOriginal();
    if(podOriginal && !document.getElementById('cex-pod-proxy')){
      const proxy = mkBtn('Descargar POD', '#1f6feb', ()=>handlePodFlow(()=>podOriginal.click()), 'cex-pod-proxy');
      dock.appendChild(proxy);
    }

    // ocultar duplicados (excepto el botón POD original)
    const candidates=[wa,temu,copy,woo,amz,ae]
      .filter(Boolean)
      .concat(Array.from(document.querySelectorAll('a,button')).filter(n =>
        FALLBACK.temuByText(n)||FALLBACK.copyByText(n)||FALLBACK.viewWooText(n)||
        FALLBACK.viewAmzText(n)||FALLBACK.viewAeText(n)
      ));
    const seen=new Set();
    candidates.forEach(n=>{
      if(!n || seen.has(n)) return;
      seen.add(n);
      if(!n.closest('#'+DOCK_ID)) n.classList.add('cex-dup-hidden');
    });
  }

  const mo=new MutationObserver(()=>{
    clearTimeout(moveKnown._t);
    moveKnown._t=setTimeout(moveKnown,200);
  });

  function init(){
    ensureDock();
    moveKnown();
    mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init,{once:true});
  }else{
    setTimeout(init,250);
  }
})();
