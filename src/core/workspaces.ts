import { appDataDir } from '@tauri-apps/api/path';
import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { defaultOutputName, newId } from './defaults';
import { baseNameOfPath, isTauri, listImagePathsInFolder } from '../tauri/bridge';
import { loadPhotoAssets, type LoadProgress, type PhotoSource, type SkippedPhoto } from './loadPhotos';
import type { PhotoAsset, ProjectState } from '../types/overlay';
import type { WorkspacePhotoMeta, WorkspaceSnapshot } from '../types/workspace';
import { workspaceFromProject } from '../types/workspace';
import type { WizardStep } from '../types/workspace';

const INDEX_FILE = 'overlayer-workspaces.json';

export function isWorkspacesSupported(): boolean {
  return isTauri();
}

async function indexFilePath(): Promise<string> {
  return `${await appDataDir()}/${INDEX_FILE}`;
}

export async function listWorkspaces(): Promise<WorkspaceSnapshot[]> {
  if (!isTauri()) return [];
  let path = '';
  try {
    path = await indexFilePath();
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as WorkspaceSnapshot[];
    if (!Array.isArray(parsed)) {
      console.warn('[workspaces] el índice no es un arreglo:', path);
      return [];
    }
    return parsed
      .filter((w) => w && typeof w.folderPath === 'string' && Array.isArray(w.photos))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  } catch (error) {
    // Índice inexistente (primera vez) es normal; lo demás se reporta.
    console.warn(`[workspaces] índice ilegible en ${path}`, error);
    return [];
  }
}

async function writeIndex(snapshots: WorkspaceSnapshot[]): Promise<void> {
  const path = await indexFilePath();
  // appDataDir debería existir; si no, se crea (instalaciones limpias).
  const dir = path.slice(0, path.lastIndexOf('/'));
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    /* si ya existe falla silenciosamente */
  }
  await writeTextFile(path, JSON.stringify(snapshots, null, 2));
}

/**
 * Guarda (o actualiza) el espacio de trabajo de un lote basado en carpeta.
 * Un mismo `folderPath` siempre sobrescribe su propio espacio.
 */
export async function saveWorkspace(
  project: ProjectState,
  lastStep: WizardStep,
): Promise<void> {
  if (!isTauri() || project.sourceKind !== 'folder' || !project.folderPath) return;
  const snapshot = workspaceFromProject(project, lastStep);
  try {
    const list = await listWorkspaces();
    const idx = list.findIndex((w) => w.folderPath === snapshot.folderPath);
    if (idx >= 0) {
      snapshot.createdAt = list[idx].createdAt; // conserva la fecha de creación
      list[idx] = snapshot;
    } else {
      list.unshift(snapshot);
    }
    await writeIndex(list);
  } catch (error) {
    const path = await indexFilePath();
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[workspaces] falló el guardado en ${path}:`, error);
    throw new Error(`No se pudo guardar en ${path} (${detail})`);
  }
}

export async function deleteWorkspace(id: string): Promise<void> {
  if (!isTauri()) return;
  const list = await listWorkspaces();
  await writeIndex(list.filter((w) => w.id !== id));
}

/* ── Verificación y reanudación ── */

/** Empareja el espacio guardado contra el contenido actual de la carpeta. */
export interface FolderMatch {
  /** Fotos del espacio que siguen disponibles (con ruta vigente). */
  available: WorkspacePhotoMeta[];
  /** Fotos del espacio que desaparecieron (sin pareja por ruta ni nombre). */
  missing: WorkspacePhotoMeta[];
  /** Fotos renombradas/movidas dentro de la carpeta. */
  moved: { meta: WorkspacePhotoMeta; newPath: string }[];
  /** Imágenes nuevas en la carpeta ajenas al espacio. */
  newFiles: string[];
  /** Mensaje si la carpeta ya no existe o no se puede leer. */
  folderError: string | null;
}

/**
 * Empareja el espacio contra la carpeta: primero por ruta exacta; si la foto
 * desapareció, por nombre de archivo (una foto renombrada dentro de la
 * carpeta conserva su edición).
 */
async function matchFolder(folderPath: string, workspace: WorkspaceSnapshot): Promise<FolderMatch> {
  let currentPaths: string[];
  try {
    currentPaths = await listImagePathsInFolder(folderPath);
  } catch (error) {
    return {
      available: [],
      missing: workspace.photos,
      moved: [],
      newFiles: [],
      folderError:
        error instanceof Error
          ? `${workspace.folderPath} (${error.message})`
          : workspace.folderPath,
    };
  }

  const available: WorkspacePhotoMeta[] = [];
  const moved: { meta: WorkspacePhotoMeta; newPath: string }[] = [];
  const usedPaths = new Set<string>();

  // 1) Emparejo por ruta exacta.
  for (const meta of workspace.photos) {
    if (currentPaths.includes(meta.sourcePath)) {
      available.push(meta);
      usedPaths.add(meta.sourcePath);
    }
  }

  // 2) Las que faltan: busco la misma por nombre de archivo.
  const pending = workspace.photos.filter((m) => !available.includes(m));
  for (const meta of pending) {
    const wanted = meta.fileName.toLowerCase();
    const candidate = currentPaths.find(
      (p) => !usedPaths.has(p) && baseNameOfPath(p).toLowerCase() === wanted,
    );
    if (candidate) {
      available.push(meta);
      usedPaths.add(candidate);
      moved.push({ meta, newPath: candidate });
    }
  }

  const missing = pending.filter((m) => !moved.some((mv) => mv.meta === m));
  const newFiles = currentPaths.filter((p) => !usedPaths.has(p));
  return { available, missing, moved, newFiles, folderError: null };
}

export interface PreparedResume extends FolderMatch {
  workspace: WorkspaceSnapshot;
}

/** Revisa que la carpeta del espacio siga disponible y calcula qué cambió. */
export async function prepareResume(id: string): Promise<PreparedResume> {
  const list = await listWorkspaces();
  const workspace = list.find((w) => w.id === id);
  if (!workspace) throw new Error('El espacio de trabajo ya no está guardado.');
  const match = await matchFolder(workspace.folderPath, workspace);
  return { ...match, workspace };
}

export interface FinishResumeOptions {
  /** Incorporar también las imágenes nuevas de la carpeta (como pendientes). */
  includeNewFiles: boolean;
  onProgress?: (progress: LoadProgress) => void;
}

export interface ResumeResult {
  project: ProjectState;
  skipped: SkippedPhoto[];
}

/**
 * Reconstruye el `ProjectState` desde el espacio guardado: relee y recomprime
 * las imágenes de la carpeta y les devuelve su meta editada (nombre de salida,
 * estado, vinculación, plantilla propia). El orden del espacio se conserva
 * para que la foto semilla siga siéndolo.
 */
export async function finishResume(
  match: FolderMatch,
  workspace: WorkspaceSnapshot,
  options: FinishResumeOptions,
): Promise<ResumeResult> {
  if (match.folderError) {
    throw new Error(`La carpeta ya no está disponible: ${match.folderError}`);
  }

  // Ruta vigente para cada foto del espacio (orden original preservado).
  const sources: PhotoSource[] = [];
  for (const meta of workspace.photos) {
    const movedEntry = match.moved.find((m) => m.meta === meta);
    if (movedEntry) {
      sources.push({ path: movedEntry.newPath });
      continue;
    }
    if (match.available.includes(meta)) sources.push({ path: meta.sourcePath });
  }
  if (options.includeNewFiles) {
    for (const path of match.newFiles) sources.push({ path });
  }

  if (sources.length === 0) {
    throw new Error(
      match.missing.length > 0 && match.newFiles.length > 0
        ? 'Ninguna foto del espacio sigue disponible. Puedes reintentar incluyendo las imágenes nuevas de la carpeta.'
        : 'No quedaron fotos disponibles para reanudar.',
    );
  }

  const { photos, skipped } = await loadPhotoAssets(sources, options.onProgress);

  const metaByPath = new Map<string, WorkspacePhotoMeta>();
  for (const meta of match.available) {
    const movedEntry = match.moved.find((m) => m.meta === meta);
    metaByPath.set(movedEntry ? movedEntry.newPath : meta.sourcePath, meta);
  }

  const restored = photos.map((photo) => applyMeta(photo, metaByPath.get(photo.sourcePath)));

  const project: ProjectState = {
    id: newId('project'),
    sourceKind: 'folder',
    folderPath: workspace.folderPath,
    template: workspace.template,
    photos: restored,
    exportFormat: workspace.exportFormat,
    jpegQuality: workspace.jpegQuality,
  };
  return { project, skipped };
}

/** Aplica la meta guardada a una foto recién releída de la carpeta. */
function applyMeta(photo: PhotoAsset, meta: WorkspacePhotoMeta | undefined): PhotoAsset {
  if (!meta) return photo;
  return {
    ...photo,
    // Nombre de salida: si no fue personalizado, regenerar con el nombre actual.
    outputName:
      meta.outputName === defaultOutputName(meta.fileName) ? photo.outputName : meta.outputName,
    status: meta.status,
    linked: meta.linked,
    ownTemplate: meta.ownTemplate,
  };
}
