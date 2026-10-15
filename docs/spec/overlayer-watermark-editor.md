# Overlayer — Editor de marcas de agua

> Especificación funcional y técnica del proyecto `overlayer-watermark-editor`.
> Estado: borrador de plan (v0.1). Stack objetivo: **React + TypeScript + Tauri**.

---

## 1. Resumen

**Overlayer** es una aplicación de escritorio para **estampar marcas de agua sobre fotografías**,
tanto en una sola foto como en lotes completos (carpetas). Permite componer un *overlay*
(elementos superpuestos: logotipo e imágenes + cajas de texto libres), colocarlos libremente
sobre la foto, y exportar el resultado como archivos individuales o como un `.zip`.

La estética por defecto de los elementos (tipografía, color amarillo `#FFD700`, contorno negro,
sombra, logotipo) toma como referencia la funcionalidad de marca de agua existente en
`site-survey-gen/src/pages/ReportEdit/ReportEditStep4.tsx` y su motor
`site-survey-gen/src/utils/watermark.ts`.

La diferencia clave respecto a la referencia: aquí la experiencia de usuario es
**un asistente (Wizard) elegante y amable**, complementado por **un pequeño panel de control
(dashboard) que permite retomar procesos** (reeditar una foto concreta, reaplicar un ajuste a
todo el lote, desvincular una foto, reexportar, etc.).

### Objetivos
- Marcar de agua **una** foto o **muchas**.
- Superponer **texto libre** e **imágenes** (por defecto el logo `logo_transparent.png`).
- Mover, rotar y escalar cada elemento de forma individual.
- Cambiar color (y demás propiedades) de las cajas de texto.
- Aplicar la edición de la primera foto al resto, con posibilidad de **desvincular** fotos para
  editarlas individualmente.
- Exportar el lote como `.zip` o cada foto por separado.

### No objetivos (por ahora)
- Reconocimiento automático de metadatos EXIF / GPS para autogenerar texto (queda como extensión
  futura inspirada en las líneas de la referencia).
- Edición no destructiva sobre el archivo original (siempre se comprime y se exporta una copia).
- Sincronización en la nube / multiusuario.

---

## 2. Stack técnico

| Capa | Elección | Notas |
|------|----------|-------|
| UI | **React 19 + TypeScript** | La referencia usa Preact; aquí se pide React. |
| Bundler | **Vite** | Dev server puerto fijo `1420`. |
| Componentes | **Mantine v8** | Misma librería que `site-survey-gen` para heredar estilos. |
| Iconos | `@tabler/icons-react` | Igual que la referencia. |
| Shell nativo | **Tauri v2** | Empaquetado de escritorio, acceso a FS y diálogos. |
| Render | **Canvas 2D** | Motor propio para componer la foto + overlay. |
| Compresión | `browser-image-compression` | Igual que la referencia (`maxSizeMB: 0.5`, `maxWidthOrHeight: 1920`, JPEG). |
| Empaquetado zip | `jszip` | Misma dependencia que `site-survey-gen`. |

Fuente de verdad de estilos: `site-survey-gen/src/pages/ReportEdit/ReportEditStep4.tsx`
+ `site-survey-gen/src/utils/watermark.ts`.

---

## 3. Experiencia de usuario

### 3.1 Concepto
**Wizard + Dashboard.**

- El **Wizard** guía el flujo lineal de la primera vez: cargar → editar overlay → revisar →
  exportar.
- El **Dashboard** es el punto de retorno: lista las fotos cargadas con su estado
  (pendiente / editada / vinculada / individual), y permite **retomar cualquier proceso**
  sin repetir todo el asistente.

### 3.2 Flujo de pantallas

1. **Cabecera (siempre visible)**
   - Título de la aplicación: **"Overlayer - Editor de marcas de agua"**.
   - Acciones contextuales (volver al dashboard, exportar, ayuda).

2. **Paso 1 — Carga (Dropzone)**
   - Zona de arrastre elegante, minimalista y centrada, con el texto:
     > "Arrastra aquí la foto o fotos, o busca la carpeta en el sistema de archivos"
   - Acepta:
     - Archivos de imagen sueltos arrastrados (Tauri drag-drop).
     - Selección mediante diálogo nativo de **archivos** o de **carpeta** (Tauri `dialog`).
   - Filtra extensiones de imagen válidas (`jpg`, `jpeg`, `png`, `webp`, `heic` → pendiente).

3. **Paso 2 — Edición del overlay**
   - Se carga el lote; **la primera foto** pasa a ser la foto que se edita.
   - Se aplica automáticamente el **estilo por defecto** (ver §6):
     - **Logo** (`logo_transparent.png`) en la **esquina superior izquierda**.
     - **Caja de texto amarilla** en la **esquina inferior derecha**.
     - Tamaño por defecto *ni muy grande ni muy pequeño* (proporcional al lienzo).
   - El **lienzo** muestra la foto a tamaño de ajuste con los elementos superpuestos.
   - Cada elemento superpuesto se puede **seleccionar individualmente**.
   - Sobre el elemento seleccionado: **mover**, **rotar**, **escalar**.
   - Para elementos de texto: **cambiar color** (y opcionalmente fuente, tamaño, alineación,
     interlineado, contorno/sombra).
   - Añadir nuevos elementos: **texto** o **imagen**.
   - Barra de herramientas tipo `ImageEditor` de la referencia
     (seleccionar, agregar texto, agregar imagen, borrar seleccionado, deshacer/rehacer, zoom).

4. **Paso 3 — Revisión / aplicado al lote (Dashboard)**
   - Lista (grid) de todas las fotos del lote con miniatura y estado.
   - Acciones globales: **"Aplicar esta edición a todas"**, **"Exportar"**,
     y **"Sincronizar carpeta"** (lotes de carpeta en Tauri): relee la carpeta de
     origen y empareja contra el lote: **nuevas** → añadidas al final como
     pendientes y vinculadas; **quitadas** (el archivo ya no está) → removidas del
     lote con aviso amarillo (su edición se descarta); **reemplazadas** (cambió el
     contenido del archivo, detectado por huella tamaño+mtime) → releídas y
     recomprimidas conservando id, nombre de salida, vínculo y plantilla
     propia; su estado vuelve a «pendiente» porque la imagen editada ya no es
     la misma; **renombradas dentro de la carpeta** → emparejadas por nombre con su
     edición intacta. Avisa si no hay cambios o si la carpeta ya no se puede leer.
   - Acciones por foto:
     - **Reeditar** (abre el lienzo con esa foto).
     - **Desvincular** (la foto deja de seguir la plantilla común y se edita individualmente).
     - **Revertir** a la plantilla común.
     - **Renombrar**: el nombre de archivo de salida es editable por foto.
   - Acciones de renombrado en grupo:
     - Selección de fotos mediante casillas (o "Seleccionar todo"); si no hay selección, el
       renombrado aplica a todo el lote.
     - Nombre base + número inicial + dígitos de relleno; en grupos se añade un **número de
       secuencia al final** (`base-01`, `base-02`, …). Con una sola foto se usa el nombre tal cual.
   - Indicador de vínculo: 🔗 *vinculada* vs 🔓 *individual*.

5. **Paso 4 — Exportación**
   - Si el origen fue una **carpeta**: exportar **un `.zip`** con todas las imágenes marcadas.
   - Si fueron **fotos sueltas**: **descarga individual** por foto (o zip, opción del usuario).
   - Elección de carpeta destino con el diálogo nativo de Tauri.
   - Formato de salida configurable: JPEG (calidad) o PNG.
   - El nombre de cada archivo de salida es su `outputName` (editable); si dos coinciden se
     desambiguan con un sufijo numérico.

### 3.3 Puntos clave de UX
- Selección visual del elemento con recuadro y handles (escala) / modo rotación, reutilizando el
  patrón de `ImageEditor.tsx` (rectángulo con línea discontinua, esquinas, doble clic para
  alternar escala↔rotación).
- Feedback de progreso durante compresión y exportación (procesos por lotes).
- El dashboard evita que "marcar terminado" sea irreversible: siempre se puede retomar.

### 3.4 Navegación principal y Espacios guardados

La cabecera ofrece un menú de dos secciones (segmentado junto al título):

- **Asistente**: el flujo clásico (carga → editar → revisar → exportar) con el stepper visible.
  Los accesos contextuales (dashboard, exportar) solo se muestran en esta sección.
- **Espacios guardados**: listado de sesiones persistidas, para retomar o reexportar un lote
  sin repetir el asistente. Es la **vista de bienvenida**: al abrir la app (escritorio) se
  muestran los espacios guardados; en el navegador se abre directamente el asistente porque
  el guardado no está disponible.

**Persistencia (solo lotes basados en carpeta).** Cuando el origen es una carpeta y la app
corre en Tauri, la sesión se **autoguarda** (con retardo de ~0,9 s tras cada cambio) en
`appDataDir()/overlayer-workspaces.json`. Se guarda el *recetario*: plantilla común con sus
elementos, fotos con su ruta de origen, nombres de salida, estados, vínculo/plantilla propia y
el paso del asistente donde quedó el usuario. **No se guardan los datos de imagen**: al
reanudar se releen y recomprimen desde la carpeta original. Los lotes de fotos sueltas no se
guardan.

**Feedback al usuario:**
- Badge «Sesión guardada» en la cabecera con la hora del último autoguardado.
- Nota en la dropzone: cargar una carpeta guarda la sesión en «Espacios guardados».
- Ayuda (paso 5) explicando el guardado automático.

**Nueva sesión:** botón visible en la cabecera (vista asistente, con proyecto activo) y en la
página de Espacios guardados. Cierra la sesión en memoria y vuelve al paso de carga; los
espacios guardados no se modifican. Pide confirmación solo si la sesión activa es de fotos
sueltas (no queda guardada); si es de carpeta, avisa que ya quedó persistida y que la nueva
carpeta creará su propio espacio.

**Reanudación:** al pulsar *Reanudar* se verifica la carpeta y se empareja el espacio con el
contenido vigente:
1. Primero por ruta exacta; si la foto desapareció, por nombre de archivo (una foto renombrada
   dentro de la carpeta conserva su edición, nombre de salida y estado).
2. La carpeta **no existe o es ilegible** → modal con la ruta y el número de fotos afectadas,
   con opción de «Eliminar espacio» (aclarando que las fotos no se borran). No se puede
   reanudar: las imágenes se releen de esa carpeta.
3. Fotos **faltantes** (borradas o movidas fuera) → aviso amarillo con la lista (truncada) y
   se omiten del lote.
4. Fotos **nuevas** en la carpeta → aviso azul con lista y un interruptor para incluirlas al
   final del lote como pendientes (opcional).
5. Imágenes **dañadas** al releer → notificación amarilla por foto con la razón («dañada u
   omitida»).
6. Reanudación limpia (sin cambios) → carga directa con notificación verde.

Cada tarjeta del listado muestra: nombre de carpeta, ruta, nº de fotos (editadas/exportadas),
fecha de actualización, paso donde quedó, y acciones: *Reanudar*, *Abrir carpeta* y *Eliminar*
(con confirmación; solo borra el registro, no las fotos).

---

## 4. Modelo de datos (propuesto)

```ts
// Identificadores
type Id = string;

/** Propiedades comunes a todo elemento superpuesto. */
interface OverlayBase {
  id: Id;
  /** Centro del elemento, normalizado 0..1 respecto al lienzo. */
  x: number;
  y: number;
  /** Escala uniforme (1 = tamaño base). */
  scale: number;
  /** Rotación en radianes. */
  rotation: number;
  /** Opacidad 0..1. */
  opacity: number;
  name?: string;
  locked?: boolean;
}

/** Caja de texto libre. */
interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  color: string;            // por defecto '#FFD700'
  fontFamily: string;       // por defecto 'Roboto, Arial, sans-serif'
  fontSize: number;         // px en espacio de lienzo
  fontWeight: number;       // por defecto 700
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  strokeColor?: string;     // por defecto '#000000'
  strokeWidth?: number;
  shadow?: { color: string; blur: number; dx: number; dy: number };
}

/** Imagen superpuesta (logo u otra). */
interface ImageOverlay extends OverlayBase {
  kind: 'image';
  /** data URL o asset embebido. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Ancho base en px de lienzo (alto derivado del aspect ratio). */
  width: number;
}

type OverlayElement = TextOverlay | ImageOverlay;

/** Plantilla de overlay reutilizable por varias fotos. */
interface OverlayTemplate {
  elements: OverlayElement[];
  /** Sistema de coordenadas: normalizado al lienzo. */
  coordinateSpace: 'normalized';
}

/** Estado de cada foto del lote. */
type PhotoStatus = 'pending' | 'edited' | 'exported';

interface PhotoAsset {
  id: Id;
  /** Nombre/ruta de origen. */
  sourcePath: string;
  /** Nombre original del archivo (solo lectura). */
  fileName: string;
  /**
   * Nombre de archivo de salida, sin extensión. Editable individual o en
   * grupo; determina el nombre al exportar.
   */
  outputName: string;
  /** Imagen comprimida lista para render (data URL blob). */
  workingSrc: string;
  width: number;
  height: number;
  status: PhotoStatus;
  /** true = sigue la plantilla común; false = editada individualmente. */
  linked: boolean;
  /** Solo presente si `linked === false`. */
  ownTemplate?: OverlayTemplate;
}

/** Estado global del proyecto/lote. */
interface ProjectState {
  id: Id;
  sourceKind: 'files' | 'folder';
  folderPath?: string;
  template: OverlayTemplate;      // plantilla común (de la primera foto)
  photos: PhotoAsset[];
  exportFormat: 'jpeg' | 'png';
  jpegQuality: number;            // 0..1
}
```

**Persistencia (espacios guardados)**

```ts
interface WorkspacePhotoMeta {
  sourcePath: string;
  fileName: string;
  outputName: string;
  status: PhotoStatus;
  linked: boolean;
  ownTemplate?: OverlayTemplate;   // solo si linked === false
}

// Guardado en appDataDir()/overlayer-workspaces.json (array, más reciente primero)
interface WorkspaceSnapshot {
  id: string;                      // slug + hash del folderPath
  name: string;                    // nombre de la carpeta
  folderPath: string;              // clave de fusión: re-guardar la misma carpeta actualiza
  createdAt: string;               // ISO
  updatedAt: string;               // ISO
  lastStep: 'upload' | 'edit' | 'review' | 'export';
  template: OverlayTemplate;       // incluye elementos con imágenes embebidas (data URL)
  photos: WorkspacePhotoMeta[];    // sin workingSrc: se relee de la carpeta al reanudar
  exportFormat: 'jpeg' | 'png';
  jpegQuality: number;
}
```

**Reglas de vinculación**
- Mientras `photo.linked === true`, la foto **hereda** `project.template`.
- Al **desvincular** (`linked = false`) se clona la plantilla vigente en `photo.ownTemplate` y se
  pasa a editar esa copia.
- Al **revertir** (`linked = true`) se descarta `ownTemplate`.
- Editar la plantilla común re-renderiza todas las fotos vinculadas.

---

## 5. Motor de render (Canvas)

Portado y generalizado desde `site-survey-gen/src/utils/watermark.ts`.

- **Entrada:** una imagen base ya cargada (data URL / blob) + `OverlayTemplate` + opciones de
  salida.
- **Proceso:**
  1. Crear `canvas` con las dimensiones del lienzo de trabajo (la foto).
  2. `drawImage` de la foto base.
  3. Por cada elemento, aplicar `ctx.save()` → trasladar al centro (`x,y` normalizados ×
     dimensiones) → `ctx.rotate(rotation)` → `ctx.scale(scale)` → `globalAlpha` → dibujar.
  4. Texto: `font` = `fontWeight fontSize px fontFamily`, `letterSpacing`, `textAlign`,
     contorno con `strokeText` y relleno con `fillText`, sombra vía `shadow*`.
  5. Imagen: `drawImage(logo, -w/2, -h/2, w, h)`.
  6. `ctx.restore()`.
  7. `toDataURL` (jpeg con calidad configurable, o png).
- **Escala por defecto** (derivada de la referencia):
  `fontSize = clamp(18, 28, round(min(w,h) * 0.028))` como punto de partida, ajustada al
  tamaño de la caja.
- El motor es **puro** (sin React) para poder ejecutarse en workers/por lotes.

---

## 6. Estilos por defecto (según `site-survey-gen`)

| Propiedad | Valor por defecto |
|-----------|-------------------|
| Color de texto | `#FFD700` (amarillo) |
| Contorno de texto | `#000000`, grosor `max(2, round(fontSize * 0.12))` |
| Fuente | `Roboto, Arial, sans-serif`, peso 700 |
| Interletrado | `max(1, round(fontSize * 0.08))px` |
| Sombra | `rgba(0,0,0,0.7)`, blur 2, offset (2,2) |
| Interlineado | `round(fontSize * 1.25)` |
| Logo por defecto | `logo_transparent.png` |
| Posición logo | esquina **superior izquierda** |
| Posición texto | esquina **inferior derecha** |
| Tamaño | proporcional al lienzo (ni muy grande ni muy pequeño) |

> Nota: en la referencia el logo y el texto comparten el bloque inferior; en Overlayer se
> separan a esquinas opuestas por decisión de UX, manteniendo la misma estética visual.

---

## 7. Integración Tauri

| Necesidad | Plugin / API |
|-----------|--------------|
| Arrastrar y soltar archivos | `tauri::WindowEvent::DragDrop` + `onDragDropEvent` |
| Seleccionar archivos/carpeta | `@tauri-apps/plugin-dialog` (`open`) |
| Leer/escribir archivos | `@tauri-apps/plugin-fs` |
| Abrir carpeta destino | `@tauri-apps/plugin-opener` |
| Crear `.zip` | `jszip` en el frontend |
| Empaquetado | `tauri build` (bundle AppImage/deb/msi/dmg) |

**Permisos (capabilities):** `dialog:allow-open`, `fs:allow-read-file`, `fs:allow-write-file`,
`fs:allow-read-dir` (listado de carpetas al soltar/seleccionar una carpeta) + `fs:scope` con
`/**` (lectura/escrita resuelven contra el scope; sin él falla con `PathForbidden`),
`opener:allow-open-path`, drag-drop habilitado en la ventana. Para los **espacios guardados**
se añaden `fs:allow-read-text-file`, `fs:allow-write-text-file`, `fs:allow-mkdir` y
`fs:allow-remove` (índice JSON en `appDataDir()`).

---

## 8. Estructura de carpetas propuesta

```
overlayer-watermark-editor/
├── docs/
│   └── spec/
│       └── overlayer-watermark-editor.md   # este documento
├── public/
│   └── logo_transparent.png
├── src/                     # React + TS
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── theme.ts             # tema Mantine (hereda estilo de site-survey-gen)
│   ├── components/
│   │   ├── Header.tsx       # cabecera + stepper del wizard
│   │   ├── Wizard/          # pasos del asistente (carga, editor, export)
│   │   ├── Dashboard/       # panel de retrabajo
│   │   ├── OverlayCanvas/   # lienzo de edición
│   │   └── OverlayInspector/# panel de propiedades del elemento
│   ├── core/
│   │   ├── renderWatermark.ts
│   │   ├── defaults.ts      # estilo por defecto
│   │   ├── textMeasure.ts   # medición de bloques de texto
│   │   ├── logo.ts          # carga del logo por defecto
│   │   └── loadPhotos.ts    # lectura + compresión del lote
│   ├── types/
│   │   └── overlay.ts
│   ├── state/               # store del proyecto/lote
│   └── tauri/               # bridges fs/dialog/drop
├── tests/
│   └── overlayer.spec.ts    # E2E (Playwright)
├── src-tauri/
│   ├── Cargo.toml
│   ├── build.rs
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── src/
│       ├── main.rs
│       └── lib.rs
├── flake.nix
├── .envrc
├── index.html
├── package.json
├── postcss.config.cjs
├── playwright.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── Makefile
├── AGENTS.md
└── README.md
```

---

## 9. Entorno de desarrollo (NixOS)

El proyecto incluye un `flake.nix` con un dev shell que provee Node + Rust + las dependencias de
Tauri (WebKitGTK 4.1, GTK3, libsoup3, etc.), más `direnv`/`.envrc`.

**Primer uso**
```bash
nix develop        # o simplemente `cd` con direnv activado
npm install
```

**Desarrollo**
```bash
npm run dev            # Vite (frontend) en http://localhost:1420
npm run tauri:dev      # app Tauri en modo desarrollo
```

**Calidad**
```bash
npm run typecheck      # tsc --noEmit
npm run lint           # eslint
npm run build          # build del frontend -> dist/
npm run tauri:build    # bundle de escritorio
```

**E2E (Playwright)**
```bash
nix develop -c npx playwright test tests/overlayer.spec.ts
```
El `flake.nix` expone los navegadores de `playwright-driver.browsers` y exporta
`PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH` apuntando a su Chromium (los bins oficiales de
Playwright no corren en NixOS por faltas de `libatk`).

**Makefile**
```bash
make dev          # npm run tauri:dev
make web          # npm run dev
make build        # npm run tauri:build
make install      # npm install
make clean        # limpia dist/, dist-electron, src-tauri/target
```

---

## 10. Hitos (roadmap)

| # | Hito | Entregable |
|---|------|-----------|
| M0 | Scaffold + entorno | Config, flake, este spec. ✅ |
| M1 | Carga de fotos | Dropzone + diálogos Tauri + compresión + estado del lote. ✅ |
| M2 | Lienzo y elementos | Overlay por defecto (logo arriba-izq, texto abajo-der), selección, mover/rotar/escalar. ✅ |
| M3 | Inspector | Edición de texto (color, fuente, tamaño, contorno), añadir/quitar elementos. ✅ |
| M4 | Aplicado al lote | Plantilla común, dashboard, vincular/desvincular/revertir. ✅ |
| M5 | Exportación | ZIP + individual, formatos, selección de carpeta destino. ✅ |
| M6 | Pulido | Undo/redo, atajos, estados de progreso, atractivo final y accesibilidad. *(parcial: undo/redo + atajos + progreso incluidos; pulido final pendiente)* |
| M7 | Nombres de archivo | Renombrado individual y en grupo (con secuencia numérica) integrado en el dashboard y aplicado a la exportación. ✅ |
| M8 | Persistencia | Menú Asistente/Espacios guardados; autoguardado de sesiones por carpeta; reanudación con validación de carpeta y fotos (faltantes/dañadas/nuevas). ✅ |
| M9 | Sincronización de carpeta | Botón «Sincronizar carpeta» en el dashboard que empareja el lote con la carpeta: añade nuevas, quita borradas, recarga reemplazadas (huella tamaño+mtime) y re-empareja renombradas. ✅ |

---

## 11. Criterios de aceptación

1. Al abrir la app se ve la cabecera "Overlayer - Editor de marcas de agua" y la dropzone con el
   texto indicado.
2. Al cargar una o varias fotos, se edita la **primera** y aparece el overlay por defecto
   (logo arriba-izquierda, texto amarillo abajo-derecha) con tamaño equilibrado.
3. Se puede seleccionar cada elemento por separado y mover, rotar y escalar; el texto permite
   cambiar su color.
4. Se puede aplicar la edición de la primera foto al resto del lote.
5. Se puede **desvincular** una foto para editarla individualmente y revertirla después.
6. Al marcar como terminado se puede exportar como `.zip` (lote/carpeta) o por foto individual.
7. El nombre de archivo de salida de cada foto se puede editar individualmente y en grupo
   (nombre base + número de secuencia al final), y los archivos exportados usan ese nombre.
8. `npm run tauri:dev` funciona dentro del dev shell de NixOS.
9. Al terminar una sesión sobre **carpeta**, aparece «Sesión guardada» en la cabecera y el
   espacio aparece en «Espacios guardados» (incluso tras cerrar y reabrir la app). Al
   reanudar: si la carpeta ya no existe se muestra un aviso claro con acción de eliminar; si
   faltan fotos, están dañadas o hay nuevas, se avisa al usuario antes de continuar.
