# Roadmap

## MVP 1 — Estructura y router ChatGPT
- [x] Crear estructura base del repositorio.
- [x] Clasificar scripts por área.
- [x] Centralizar URL activa de ChatGPT (`GM_setValue` / `GM_getValue`).
- [x] Script `chatgpt-router-manager.user.js`.
- [x] Script `amazon-open-chatgpt.user.js`.
- [x] Script `temu-open-chatgpt.user.js`.

## MVP 2 — Refactor de extracción de conversación
- [ ] Mejorar extracción de conversación en Amazon Messaging.
- [ ] Mejorar extracción de conversación en Temu Chat.
- [ ] Mejor composición del bloque a pegar en ChatGPT.

## MVP 3 — Integración con Correos Express
- [ ] Refactor de scripts CEX (trazabilidad, linkify, POD).
- [ ] Integración inicial: desde Amazon/Temu → abrir CEX con tracking.
- [ ] Copiar trazabilidad completa incluyendo eventos, estados, fechas.

## MVP 4 — Extracción de SMS, PUDO y PIN
- [ ] Extraer SMS enviados al cliente desde CEX.
- [ ] Detectar entrega en PUDO.
- [ ] Detectar PIN de recogida.
- [ ] Componer bloque completo con toda la información.

## MVP 5 — Extensión y estabilización
- [ ] Extensión a Miravia y AliExpress.
- [ ] Refactors generales.
- [ ] Estabilización y documentación final.

