// ==UserScript==
// @name         Canva Editor: Descargar/Capturar vídeo seleccionado
// @namespace    https://saquitodelasalud.com
// @version      1.0.0
// @description  En el editor de Canva, intenta descargar el MP4 del clip seleccionado o capturar su reproducción a WebM si no hay MP4 y no hay DRM.
// @match        https://www.canva.com/design/*/editor*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --- Captura de URLs por red para "Descargar MP4" ---
  let lastVideoUrl = null;
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await _fetch.apply(this, args);
    try {
      const url = (args?.[0] && args[0].url) || (typeof args?.[0] === 'string' ? args[0] : null);
      const ct  = res.headers?.get?.('content-type') || '';
      if (url && /\.(mp4)(\?|#|$)/i.test(url)) lastVideoUrl = url;
      else if (/video\/mp4/i.test(ct)) lastVideoUrl = url;
    } catch {}
    return res;
  };

  // --- Utilidades ---
  function makePanel(){
    const d=document.createElement('div');
    Object.assign(d.style,{
      position:'fixed', right:'16px', top:'88px', zIndex:999999,
      background:'#fff', border:'1px solid rgba(0,0,0,.15)', borderRadius:'10px',
      boxShadow:'0 6px 18px rgba(0,0,0,.15)', padding:'10px'
    });
    d.innerHTML = `
      <div style="font:600 12px system-ui, sans-serif; margin-bottom:6px">Vídeo detectado</div>
      <button id="cex-dl" style="display:block;width:100%;margin:4px 0;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2);cursor:pointer;background:#fff">Descargar MP4</button>
      <button id="cex-cap" style="display:block;width:100%;margin:4px 0;padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2);cursor:pointer;background:#fff">Capturar reproducción (WebM)</button>
      <div id="cex-note" style="color:#666;font:11px system-ui, sans-serif; margin-top:6px">Si hay DRM/HLS protegido, no se podrá capturar.</div>
    `;
    return d;
  }

  function filename(ext='mp4'){
    const t = document.title.replace(/[^\p{L}\p{N}\-_ ]/gu,'').trim().replace(/\s+/g,'_') || 'canva_video';
    return `${t}.${ext}`;
  }

  async function downloadBinary(url, name){
    const res = await fetch(url, { credentials:'include' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const aurl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=aurl; a.download=name;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(aurl);
  }

  async function captureElementToWebM(video, secs){
    // Si el navegador/stream no permiten capturar, esto fallará (p.ej. DRM).
    const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
    if (!stream) throw new Error('captureStream no disponible');
    const rec = new MediaRecorder(stream, { mimeType:'video/webm;codecs=vp9,opus' });
    const chunks=[];
    rec.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    rec.start();
    // Asegura reproducción
    video.muted = true;
    await video.play().catch(()=>{});
    // Determinar duración
    let duration = secs && isFinite(secs) ? secs : (isFinite(video.duration) ? video.duration : 10);
    duration = Math.max(3, Math.min(duration, 600)); // 3s–10min
    await new Promise(r => setTimeout(r, duration*1000));
    rec.stop();
    await new Promise(r => rec.onstop = r);
    const blob = new Blob(chunks, { type:'video/webm' });
    const aurl = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=aurl; a.download = filename('webm');
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(aurl);
  }

  // Heurística para localizar el <video> “grande” del editor
  function findEditorVideo(){
    // Muchos clips se renderizan en un <video> dentro del canvas/preview a la derecha/centro
    // Buscamos el <video> con mayor área visible
    const vids = Array.from(document.querySelectorAll('video'));
    if (!vids.length) return null;
    let best=null, area=0;
    for (const v of vids){
      const r = v.getBoundingClientRect();
      const a = Math.max(0, r.width*r.height);
      if (a > area) { area=a; best=v; }
    }
    return best;
  }

  // Obtener duración aproximada desde UI (si hay badge) como respaldo
  function readUiDuration(){
    const badge = document.querySelector('[class*="LuBWVA"], [class*="dfv3Cw"], [data-testid*="duration"]');
    if (!badge) return NaN;
    const t = badge.textContent || '';
    const m = t.match(/([\d.,]+)\s*s/i) || t.match(/(\d+):(\d{2})/); // “13.0 s” o “0:13”
    if (m && m.length===3) return parseInt(m[1])*60 + parseInt(m[2]);
    if (m && m.length===2) return parseFloat(m[1].replace(',','.'));
    return NaN;
  }

  // UI + lógica
  function install(){
    const panel = makePanel();
    document.body.appendChild(panel);
    const btnDl  = panel.querySelector('#cex-dl');
    const btnCap = panel.querySelector('#cex-cap');

    btnDl.onclick = async () => {
      btnDl.disabled = true; const old = btnDl.textContent; btnDl.textContent = 'Buscando MP4...';
      try{
        // 1) URL detectada por red (cuando entras al clip, Canva suele pedir el media)
        let url = lastVideoUrl;
        if (!url || !/\.mp4(\?|#|$)/i.test(url)) throw new Error('No hay MP4 visible');
        await downloadBinary(url, filename('mp4'));
        btnDl.textContent = '¡Descargado!';
      }catch(e){
        alert('No hay MP4 directo disponible para este clip.');
        btnDl.textContent = old;
      }finally{
        setTimeout(()=>{ btnDl.disabled=false; btnDl.textContent='Descargar MP4'; }, 1200);
      }
    };

    btnCap.onclick = async () => {
      btnCap.disabled = true; const old = btnCap.textContent; btnCap.textContent = 'Preparando...';
      try{
        const video = findEditorVideo();
        if (!video) throw new Error('No encuentro el reproductor del editor.');
        const secs = readUiDuration();
        btnCap.textContent = 'Capturando...';
        await captureElementToWebM(video, secs);
        btnCap.textContent = '¡Listo!';
      }catch(e){
        console.warn(e);
        alert('No he podido capturar este clip. Puede estar protegido (DRM) o el navegador no permite capturarlo.');
        btnCap.textContent = old;
      }finally{
        setTimeout(()=>{ btnCap.disabled=false; btnCap.textContent='Capturar reproducción (WebM)'; }, 1500);
      }
    };
  }

  function startWhenReady(){
    // Canva es SPA: espera a que haya DOM del editor
    const check = setInterval(()=>{
      // Señal muy laxa: existencia de algún video o la barra superior de editor
      if (document.querySelector('video') || document.querySelector('[data-testid*="topbar"]')) {
        clearInterval(check); install();
      }
    }, 800);
    setTimeout(()=>clearInterval(check), 20000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startWhenReady);
  else startWhenReady();
})();
