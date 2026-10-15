import type { OverlayTemplate, PhotoStatus, ProjectState } from './overlay';

/** Pasos del asistente (debe mantenerse sincronizado con `projectStore.Step`). */
export type WizardStep = 'upload' | 'edit' | 'review' | 'export';

/** Meta de una foto guardada (sin datos de imagen: se releen de la carpeta). */
export interface WorkspacePhotoMeta {
  sourcePath: string;
  fileName: string;
  outputName: string;
  status: PhotoStatus;
  linked: boolean;
  /** Solo presente si `linked === false`. */
  ownTemplate?: OverlayTemplate;
}

/** Espacio de trabajo persistible: un lote basado en carpeta. */
export interface WorkspaceSnapshot {
  id: string;
  /** Nombre para mostrar (el de la carpeta). */
  name: string;
  folderPath: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  /** Paso del asistente donde quedó el usuario. */
  lastStep: WizardStep;
  /** Plantilla común (contiene los elementos, incluidas imágenes embebidas). */
  template: OverlayTemplate;
  photos: WorkspacePhotoMeta[];
  exportFormat: 'jpeg' | 'png';
  jpegQuality: number;
}

/** Construye el snapshot persistible desde el estado del proyecto. */
export function workspaceFromProject(project: ProjectState, lastStep: WizardStep): WorkspaceSnapshot {
  return {
    id: workspaceIdForPath(project.folderPath ?? ''),
    name: workspaceNameForPath(project.folderPath ?? ''),
    folderPath: project.folderPath ?? '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastStep,
    template: project.template,
    photos: project.photos.map((p) => ({
      sourcePath: p.sourcePath,
      fileName: p.fileName,
      outputName: p.outputName,
      status: p.status,
      linked: p.linked,
      ownTemplate: p.ownTemplate,
    })),
    exportFormat: project.exportFormat,
    jpegQuality: project.jpegQuality,
  };
}

export function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'ws';
}

/** Hash corto (djb2) para desambiguar carpetas con el mismo slug. */
export function shortHash(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

export function workspaceIdForPath(folderPath: string): string {
  return `ws-${slugify(folderPath)}.${shortHash(folderPath)}`;
}

export function workspaceNameForPath(folderPath: string): string {
  const clean = folderPath.replace(/[\\/]+$/, '');
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  const name = idx >= 0 ? clean.slice(idx + 1) : clean;
  return name || 'Carpeta sin nombre';
}
