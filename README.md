# Userscripts

Repositorio maestro de userscripts para Tampermonkey. Automatizaciones de atención al cliente, logística y productividad.

## Objetivo

- Centralizar todos los userscripts en un solo repositorio versionado.
- Reducir duplicados y lógica repetida.
- Facilitar el mantenimiento y la evolución.
- Escalar flujos entre Amazon, Temu, Correos Express (CEX), ChatGPT y otros servicios.

## Principios

1. Un único origen de verdad (Git).
2. Configuración separada de lógica.
3. Módulos reutilizables cuando sea posible.
4. Refactor incremental, no reescrituras masivas.
5. Simplicidad primero.

## MVP 1 — Alcance actual

- Estructura base del repositorio.
- Clasificación de scripts por área.
- Configuración centralizada de la URL activa de ChatGPT.
- Amazon y Temu usan la URL dinámica en lugar de hardcodeada.

## Estructura

```
scripts/        → Código fuente de los userscripts
  amazon/       → Scripts para Amazon Seller Central / Messaging
  temu/         → Scripts para Temu Seller
  chatgpt/      → Scripts para ChatGPT (router, auto-paste)
  cex/          → Scripts para Correos Express
  whatsapp/     → Scripts para WhatsApp Web
  woocommerce/  → Scripts para WooCommerce Admin
  shared/       → Lógica o patrones compartidos
  otros/        → Scripts auxiliares (Canva, BOE, Idealista, etc.)
archive/        → Scripts antiguos o duplicados (no activos)
dist/           → Versiones finales listas para Tampermonkey
docs/           → Documentación del proyecto
```

## Siguientes fases

Consultar [docs/roadmap.md](docs/roadmap.md) para el plan completo.

