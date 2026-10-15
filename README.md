# Overlayer - Editor de marcas de agua

Aplicación de escritorio (**React + TypeScript + Tauri**) para estampar marcas de agua sobre
una o varias fotografías: composición libre de logotipo e imágenes + cajas de texto, con
movimiento, rotación, escalado y cambio de color.

El plan funcional y técnico completo vive en
[`docs/spec/overlayer-watermark-editor.md`](docs/spec/overlayer-watermark-editor.md).

## Estado

`v0.2` — **M1–M5 implementados**: carga de fotos (dropzone/diálogos/arrastre + compresión),
lienzo de edición con selección/mover/rotar/escalar, inspector de propiedades, plantilla
común con vincular/desvincular/revertir (dashboard), y exportación `.zip` / individual
(JPEG/PNG). Incluye E2E con Playwright (`tests/overlayer.spec.ts`).
Quedan M6 (pulido) y extensiones futuras del spec.

## Entorno de desarrollo (NixOS)

El proyecto trae un `flake.nix` (Node 22 + Rust + dependencias nativas de Tauri/WebKitGTK)
y un `.envrc` para `direnv`.

```bash
# Opción A: con direnv activado
cd overlayer-watermark-editor

# Opción B: shell manual
nix develop

# Instalar dependencias JS (una sola vez)
npm install
```

Si es la primera vez, genera el lock:

```bash
nix flake lock
```

## Comandos

| Comando               | Descripción                                  |
| --------------------- | -------------------------------------------- |
| `npm run dev`         | Frontend con Vite en `http://localhost:1420` |
| `npm run tauri:dev`   | App Tauri en modo desarrollo                 |
| `npm run build`       | Type-check + build del frontend a `dist/`    |
| `npm run tauri:build` | Bundle de escritorio (AppImage/deb/msi/dmg)  |
| `npm run typecheck`   | `tsc --noEmit`                               |
| `npm run lint`        | ESLint                                       |

Atajos con `make`: `make install`, `make web`, `make dev`, `make build`, `make clean`.

## Iconos de Tauri

El bundle espera iconos en `src-tauri/icons/`. Genéralos una vez a partir del logo:

```bash
npm run tauri icon public/logo_transparent.png
```

## Estructura

```
overlayer-watermark-editor/
├── docs/spec/overlayer-watermark-editor.md   # Plan / especificación
├── public/logo_transparent.png               # Logo por defecto del overlay
├── src/                                      # React + TS (wizard, dashboard, lienzo, motor)
├── src-tauri/                                # Backend Tauri (Rust)
├── tests/overlayer.spec.ts                   # E2E Playwright
├── flake.nix / .envrc                        # Entorno NixOS (incluye Chromium de Playwright)
├── package.json / vite.config.ts / tsconfig  # Configuración del frontend
└── index.html
```

## E2E

```bash
nix develop -c npx playwright test tests/overlayer.spec.ts
```

Cubre el flujo completo de los criterios de aceptación: carga, overlay por defecto,
edición de color con aserción sobre píxeles del canvas, undo, desvincular/revertir y
descarga del JPEG exportado.

## Licencia

Privado. © Christian Velasco.
