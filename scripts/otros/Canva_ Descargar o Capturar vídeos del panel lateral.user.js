// ==UserScript==
// @name         Canva: Descargar o Capturar vídeos del panel lateral
// @namespace    https://saquitodelasalud.com
// @version      1.2.0
// @description  Añade botones "Descargar" (MP4 si existe) y "Capturar (HLS)" (graba la reproducción en WebM) en miniaturas de vídeo de Canva.
// @match        https://www.canva.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Red hooks para detectar URLs (sirve a "Descargar") ----------
  let lastVideoUrl = null;

  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    try {
      const url = (args && args[0] && args[0].url) || (typeof args[0] === 'string' ? args[0] : null);
      const ct  = res.headers && res.headers.get && res.headers.get('content-type');
      if (url && /\.(mp4|m3u8)(\?|#|$)/i.test(url)) lastVideoUrl = url;
      if (!lastVideoUrl && ct && /(video\/mp4|application\/vnd\.apple\.mpegurl|application\/x-mpegURL)/i.test(ct)) lastVideoUrl = url;
      if (!lastVideoUrl && url && /^blob:/i.test(url)) lastVideoUrl = url;
    } catch {}
    return res;
  };

  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__url = url;
    return _open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader && this.getResponseHeader('content-type');
        if (this.__url && /\.(mp4|m3u8)(\?|#|$)/i.test(this.__url)) lastVideoUrl = this.__url;
        if (!lastVideoUrl && ct && /(video\/mp4|application\/vnd\.apple\.mpegurl|application\/x-mpegURL)/i.test(ct)) lastVideoUrl = this.__url || lastVideoUrl;
        if (!lastVideoUrl && this.__url && /^blob:/i.test(this.__url)) lastVideoUrl = this.__url;
      } catch {}
    });
    return _send.apply(this, args);
  };

  // ---------- Utils comunes ----------
  function makeBtn(text) {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      position:'absolute', right:'6px', zIndex:9999,
      padding:'4px 8px', fontSize:'12px', borderRadius:'6px',
      border:'1px solid rgba(0,0,0,.2)', background:'#fff',
      cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,.15)',
      fontFamily:'system-ui, sans-serif'
    });
    return b;
  }
  function headOk(url){ return fetch(url,{method:'HEAD',credentials:'include'}).then(r=>r.ok).catch(()=>false); }
  function filenameFromThumb(url, ext='mp4'){
    try{ const u=new URL(url,location.href); let base=u.pathname.split('/').pop()||'video'; base=base.replace(/\.(jpg|jpeg|png|webp)$/i,''); return `${base}.${ext}`;}catch{return `video.${ext}`;}
  }
  async function downloadBinary(url, name, forceType){
    if(url.startsWith('blob:')){
      const blob=await fetch(url).then(r=>r.blob());
      const aurl=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=aurl; a.download=name;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(aurl); return;
    }
    const res=await fetch(url,{credentials:'include'}); if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob=await res.blob();
    const aurl=URL.createObjectURL(new Blob([blob],{type: forceType||blob.type||'video/mp4'}));
    const a=document.createElement('a'); a.href=aurl; a.download=name; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(aurl);
  }

  // Heurística desde miniatura Canva -> candidatos MP4 (no siempre existen)
  function candidatesFromThumb(thumb){
    const out=[]; try{
      const u=new URL(thumb,location.href);
      if(u.hostname.includes('video-public.canva.com')){
        const parts=u.pathname.split('/').filter(Boolean); const id=parts[0];
        if(id){
          out.push(`https://video-public.canva.com/${id}/H264/1080p.mp4`);
          out.push(`https://video-public.canva.com/${id}/H264/720p.mp4`);
          out.push(`https://video-public.canva.com/${id}/original.mp4`);
          out.push(`https://video-public.canva.com/${id}/${(parts[2]||'').replace(/\.(jpg|jpeg|png|webp)$/i,'.mp4')}`);
        }
      }
    }catch{} return out;
  }
  async function findMp4(thumbUrl){
    for(const u of candidatesFromThumb(thumbUrl)){ if(await headOk(u)) return u; }
    return lastVideoUrl;
  }

  // ---------- Cargador HLS.js + captura MediaRecorder ----------
  let hlsReady=false;
  async function ensureHls(){
    if(hlsReady) return true;
    await new Promise((res,rej)=>{ const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    hlsReady=true; return true;
  }

  async function captureHlsToWebm({m3u8Url, durationSec=10, filename='video.webm'}){
    await ensureHls();

    // Crea overlay discreto con el <video>
    const overlay=document.createElement('div');
    Object.assign(overlay.style,{ position:'fixed', left:'-99999px', top:'-99999px' });
    const video=document.createElement('video');
    video.muted=true; video.playsInline=true; video.controls=false; video.width=1280; video.height=720;
    overlay.appendChild(video); document.body.appendChild(overlay);

    // Monta HLS.js o currentSrc directo si el navegador soporta HLS nativo
    let usingHls=false;
    if(window.Hls && window.Hls.isSupported()){
      const hls=new window.Hls({ enableWorker:true, lowLatencyMode:false });
      await new Promise((res,rej)=>{
        hls.on(window.Hls.Events.MEDIA_ATTACHED, ()=>{ hls.loadSource(m3u8Url); });
        hls.on(window.Hls.Events.MANIFEST_PARSED, ()=>res());
        hls.on(window.Hls.Events.ERROR, (e,d)=>{ if(d && d.fatal) rej(d); });
        hls.attachMedia(video);
      });
      usingHls=true;
    } else if(video.canPlayType('application/vnd.apple.mpegurl')){
      video.src=m3u8Url;
      await video.play().catch(()=>{});
    } else {
      document.body.removeChild(overlay);
      throw new Error('HLS no soportado');
    }

    // Espera a que empiece a reproducir
    await video.play();

    // Duración: si podemos leerla del DOM (badge), mejor
    if (!isFinite(durationSec) || durationSec<=0) durationSec = Math.max(10, Math.floor(video.duration)||10);

    // Empieza a grabar
    const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream();
    const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9,opus' });
    const chunks=[];
    rec.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
    rec.start();

    // Reproduce durante durationSec (o hasta ended)
    const stopPromise = new Promise(resolve => {
      const timer=setTimeout(()=>resolve('time'), durationSec*1000);
      video.addEventListener('ended', ()=>{ clearTimeout(timer); resolve('ended'); }, { once:true });
    });

    await stopPromise; rec.stop();
    await new Promise(r=> rec.onstop = r);

    // Guardar
    const blob = new Blob(chunks, { type:'video/webm' });
    const aurl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=aurl; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(aurl);

    // Limpieza
    if (usingHls && window.Hls) try { /* hls.stopLoad(); hls.detachMedia(); */ } catch {}
    document.body.removeChild(overlay);
  }

  function parseDurationFromItem(item){
    // En tu HTML, el badge mostraba "13.0 s", "20.0 s", etc. selector approx:
    const badge = item.querySelector('.dfv3Cw, .LuBWVA, .Iv_bJA'); // tolerante
    if (!badge) return NaN;
    const t = badge.textContent || '';
    const m = t.match(/([\d.,]+)\s*s/i);
    if (m) return parseFloat(m[1].replace(',','.'));
    return NaN;
  }

  // ---------- Inyección de UI ----------
  function attachButtons(scope=document){
    // Contenedores de vídeo similares a los de tu snippet: .BE2rWg / [role="group"] con <img src="https://video-public.canva.com/...">
    const items = scope.querySelectorAll('div.BE2rWg, div[role="group"]');
    items.forEach(item=>{
      if(item.__dl_injected) return;
      const img = item.querySelector('img[src]');
      const looksVideo = img && /video-public\.canva\.com/i.test(img.src);
      const hasDuration = !!item.querySelector('.dfv3Cw, .LuBWVA, .Iv_bJA');
      if(!looksVideo && !hasDuration) return;

      item.__dl_injected=true;
      const style=getComputedStyle(item); if(style.position==='static') item.style.position='relative';

      // Botón Descargar (MP4 directo si hay)
      const btnDown = makeBtn('Descargar');
      btnDown.style.top='6px';
      item.appendChild(btnDown);

      btnDown.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        btnDown.disabled=true; const old=btnDown.textContent; btnDown.textContent='Buscando...';
        try{
          let url = img?.src ? await findMp4(img.src) : null;
          if(!url){
            const detailsBtn = item.querySelector('button[aria-label*="detalles"],button[aria-label*="details"]');
            if(detailsBtn){ detailsBtn.click(); await new Promise(r=>setTimeout(r,1200)); url = lastVideoUrl; }
          }
          if(!url) throw new Error('no-url');
          if(/\.m3u8/i.test(url)){ // no MP4; intenta suponer hermano MP4
            const guess = url.replace(/\.m3u8(\?|#|$)/i,'.mp4$1').replace(/HLS|hls/,'H264');
            if(await headOk(guess)) url=guess; else throw new Error('hls-only');
          }
          btnDown.textContent='Descargando...';
          const name = filenameFromThumb(img?.src||'video.jpg','mp4');
          await downloadBinary(url, name, 'video/mp4');
          btnDown.textContent='¡Listo!';
        }catch(e){
          alert('No he podido descargar este vídeo (puede estar protegido o servir solo HLS).');
          btnDown.textContent=old;
        }finally{
          setTimeout(()=>{ btnDown.disabled=false; btnDown.textContent='Descargar'; }, 1200);
        }
      });

      // Botón Capturar (HLS → WebM por MediaRecorder)
      const btnCap = makeBtn('Capturar (HLS)');
      btnCap.style.top='34px';
      item.appendChild(btnCap);

      btnCap.addEventListener('click', async (ev)=>{
        ev.stopPropagation();
        btnCap.disabled=true; const old=btnCap.textContent; btnCap.textContent='Preparando...';
        try{
          // Intenta obtener una URL m3u8: si tenemos lastVideoUrl y es m3u8, perfecto.
          let url = null;

          // Abre detalles para que Canva cargue la preview (dispara red)
          const detailsBtn = item.querySelector('button[aria-label*="detalles"],button[aria-label*="details"]');
          if(detailsBtn){ detailsBtn.click(); await new Promise(r=>setTimeout(r,1200)); url = lastVideoUrl; }

          if(!url || !/\.m3u8/i.test(url)){
            // Heurística: algunas thumbs permiten construir HLS directo
            if(img && /video-public\.canva\.com/.test(img.src)){
              const u = new URL(img.src, location.href);
              const id = u.pathname.split('/').filter(Boolean)[0];
              if(id) url = `https://video-public.canva.com/${id}/HLS/master.m3u8`;
            }
          }

          if(!url || !/\.m3u8/i.test(url)) throw new Error('No HLS URL');

          const secs = parseDurationFromItem(item) || 10;
          btnCap.textContent='Capturando...';
          const name = filenameFromThumb(img?.src||'video.jpg','webm').replace(/\.mp4$/i,'.webm');
          await captureHlsToWebm({ m3u8Url:url, durationSec:secs, filename:name });
          btnCap.textContent='¡Listo!';
        }catch(e){
          console.warn(e);
          alert('No he podido capturar este vídeo (HLS no accesible en esta vista).');
          btnCap.textContent=old;
        }finally{
          setTimeout(()=>{ btnCap.disabled=false; btnCap.textContent='Capturar (HLS)'; }, 1500);
        }
      });
    });
  }

  function observe(){
    attachButtons(document);
    const mo=new MutationObserver(muts=>{
      for(const m of muts){
        if(m.addedNodes) m.addedNodes.forEach(n=>{ if(n.nodeType===1) attachButtons(n); });
      }
    });
    mo.observe(document.documentElement,{childList:true,subtree:true});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', observe);
  else observe();
})();
