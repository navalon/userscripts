# Arquitectura

## Principios

1. **Un único origen de verdad** — Git es la referencia, no los scripts sueltos en Tampermonkey.
2. **Configuración centralizada** — Las URLs, claves y opciones se gestionan desde un punto común.
3. **Módulos reutilizables** — Lógica compartida documentada en `scripts/shared/`.
4. **Refactor incremental** — No se reescribe todo de golpe; se mejora por fases.
5. **Scripts finales en `/dist`** — Lo que se instala en Tampermonkey sale de ahí.

## Almacenamiento compartido (MVP 1)

Para el MVP 1, la comunicación entre scripts se hace con el almacenamiento de Tampermonkey:

- `GM_setValue(key, value)` — guarda un valor.
- `GM_getValue(key, default)` — lee un valor.

Esto funciona **dentro del mismo navegador y perfil**. No sincroniza entre equipos.

### Claves usadas

| Clave | Descripción | Script que escribe | Scripts que leen |
|---|---|---|---|
| `chatgpt_active_url` | URL de la conversación activa de ChatGPT | chatgpt-router-manager | amazon-open-chatgpt, temu-open-chatgpt |

## Evolución prevista

- **MVP 1**: `GM_setValue` / `GM_getValue` (local al navegador).
- **Futuro**: Backend ligero o Google Apps Script para sincronizar entre equipos.

## Módulos previstos

| Módulo | Carpeta | Estado |
|---|---|---|
| Router ChatGPT (manager) | `scripts/chatgpt/` | MVP 1 |
| Amazon → ChatGPT | `scripts/amazon/` | MVP 1 |
| Temu → ChatGPT | `scripts/temu/` | MVP 1 |
| Trazabilidad CEX | `scripts/cex/` | MVP 3 |
| Extracción SMS/PUDO/PIN | `scripts/cex/` | MVP 4 |
| Shared utilities | `scripts/shared/` | Progresivo |

