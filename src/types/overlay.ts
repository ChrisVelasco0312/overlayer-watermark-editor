/** Identificador opaco de elemento o foto. */
export type Id = string;

/** Propiedades comunes a todo elemento superpuesto. */
export interface OverlayBase {
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

export interface TextShadow {
  color: string;
  blur: number;
  dx: number;
  dy: number;
}

/** Caja de texto libre. */
export interface TextOverlay extends OverlayBase {
  kind: 'text';
  text: string;
  color: string; // por defecto '#FFD700'
  fontFamily: string; // por defecto 'Roboto, Arial, sans-serif'
  fontSize: number; // px en el espacio de la foto de referencia
  fontWeight: number; // por defecto 700
  letterSpacing: number;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  strokeColor?: string; // por defecto '#000000'
  strokeWidth?: number;
  shadow?: TextShadow;
}

/** Imagen superpuesta (logo u otra). */
export interface ImageOverlay extends OverlayBase {
  kind: 'image';
  /** data URL o asset embebido. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Ancho base en px de la foto de referencia (alto derivado del aspect ratio). */
  width: number;
}

export type OverlayElement = TextOverlay | ImageOverlay;

/** Plantilla de overlay reutilizable por varias fotos. */
export interface OverlayTemplate {
  elements: OverlayElement[];
  /** Sistema de coordenadas: normalizado al lienzo. */
  coordinateSpace: 'normalized';
  /**
   * min(w,h) de la foto usada como referencia de los tamaños en px
   * (fontSize, width, strokeWidth...). Al renderizar en otra foto se
   * escala por min(w,h)/referenceMin.
   */
  referenceMin?: number;
}

/** Estado de cada foto del lote. */
export type PhotoStatus = 'pending' | 'edited' | 'exported';

export interface PhotoAsset {
  id: Id;
  /** Nombre/ruta de origen. */
  sourcePath: string;
  /** Nombre original del archivo (solo lectura). */
  fileName: string;
  /**
   * Nombre de archivo de salida, sin extensión. Editable individualmente o en
   * grupo; se usa al exportar (la extensión la aporta el formato de salida).
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
export interface ProjectState {
  id: Id;
  sourceKind: 'files' | 'folder';
  folderPath?: string;
  template: OverlayTemplate; // plantilla común (de la primera foto)
  photos: PhotoAsset[];
  exportFormat: 'jpeg' | 'png';
  jpegQuality: number; // 0..1
}

/** Clona una plantilla (deep copy seguro, los elementos son JSON puros). */
export function cloneTemplate(template: OverlayTemplate): OverlayTemplate {
  return JSON.parse(JSON.stringify(template)) as OverlayTemplate;
}

/** Plantilla vigente de una foto (común si está vinculada, propia si no). */
export function photoTemplate(project: ProjectState, photo: PhotoAsset): OverlayTemplate {
  if (photo.linked) return project.template;
  return photo.ownTemplate ?? project.template;
}
