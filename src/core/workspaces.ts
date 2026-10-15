import { appDataDir } from '@tauri-apps/api/path';
import { mkdir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { defaultOutputName, newId } from './defaults';
import { baseNameOfPath, fingerprintChanged, isTauri, listImagePathsInFolder, statFileMeta, type FileFingerprint } from '../tauri/bridge';
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

  // Huella fresca (tamaño + mtime) para que futuras sincronizaciones detecten
  // reemplazos, aunque la meta guardada no la tuviera o la ruta cambiara.
  for (let i = 0; i < restored.length; i += 1) {
    const fingerprint = await statFileMeta(restored[i].sourcePath);
    if (fingerprint) {
      restored[i] = { ...restored[i], fileSize: fingerprint.size, fileMtimeMs: fingerprint.mtimeMs };
    }
  }

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
    fileSize: meta.fileSize,
    fileMtimeMs: meta.fileMtimeMs,
  };
}

/* ── Sincronización de carpeta ── */

export interface FolderSyncResult {
  /** Lote completo tras sincronizar: originales actualizados + nuevas al final. */
  photos: PhotoAsset[];
  /** Fotos nuevas detectadas y ya comprimidas. */
  added: PhotoAsset[];
  /** Fotos que desaparecieron de la carpeta (se quitan del lote). */
  removed: PhotoAsset[];
  /** Fotos recargadas porque el archivo cambió de contenido (meta preservada). */
  replaced: PhotoAsset[];
  /** Fotos renombradas dentro de la carpeta (misma huella, ruta actualizada). */
  renamed: PhotoAsset[];
  skipped: SkippedPhoto[];
  /** Mensaje si la carpeta ya no existe o no se puede leer. */
  folderError: string | null;
}

/**
 * Relee la carpeta del lote y la empareja contra el lote actual:
 * - Nuevas → cargadas y añadidas al final como `pending` y vinculadas.
 * - Desaparecidas → quitadas del lote (la edición asociada se descarta).
 * - Reemplazadas (huella tamaño/mtime cambió) → releídas y recomprimidas,
 *   conservando id, nombre de salida, vínculo y plantilla propia; el estado
 *   vuelve a `pending` porque la imagen que se editó ya no es la misma.
 * - Renombradas dentro de la carpeta → se emparejan por nombre de archivo.
 * Las fotos intactas no se tocan.
 */
export async function syncFolderPhotos(
  project: ProjectState,
  onProgress?: (progress: LoadProgress) => void,
): Promise<FolderSyncResult> {
  const unchanged: FolderSyncResult = {
    photos: project.photos,
    added: [],
    removed: [],
    replaced: [],
    renamed: [],
    skipped: [],
    folderError: null,
  };
  if (!isTauri() || project.sourceKind !== 'folder' || !project.folderPath) {
    return unchanged;
  }

  let currentPaths: string[];
  try {
    currentPaths = await listImagePathsInFolder(project.folderPath);
  } catch (error) {
    return {
      ...unchanged,
      folderError:
        error instanceof Error
          ? `${project.folderPath} (${error.message})`
          : project.folderPath,
    };
  }

  // Huella (tamaño + mtime) de cada archivo vigente en la carpeta.
  const fingerprintByPath = new Map<string, FileFingerprint>();
  await Promise.all(
    currentPaths.map(async (path) => {
      const fingerprint = await statFileMeta(path);
      if (fingerprint) fingerprintByPath.set(path, fingerprint);
    }),
  );

  const availablePaths = new Set(currentPaths);
  const usedPaths = new Set<string>();
  const added: PhotoAsset[] = [];
  const removed: PhotoAsset[] = [];
  const replaced: PhotoAsset[] = [];
  const renamed: PhotoAsset[] = [];
  const skipped: SkippedPhoto[] = [];
  /** Sobrevivientes por posición original; null = quitada o pendiente de recarga. */
  const slots: (PhotoAsset | null)[] = [];
  const reloadJobs: { index: number; path: string; photo: PhotoAsset }[] = [];

  project.photos.forEach((photo) => {
    // 1) Por ruta exacta; si desapareció, por nombre (renombrada en la carpeta).
    const path = availablePaths.has(photo.sourcePath)
      ? photo.sourcePath
      : currentPaths.find(
          (p) =>
            !usedPaths.has(p) &&
            baseNameOfPath(p).toLowerCase() === photo.fileName.toLowerCase(),
        );
    if (!path) {
      removed.push(photo);
      slots.push(null);
      return;
    }
    usedPaths.add(path);

    const fingerprint = fingerprintByPath.get(path);
    const previous =
      typeof photo.fileSize === 'number'
        ? { size: photo.fileSize, mtimeMs: photo.fileMtimeMs ?? null }
        : undefined;
    if (fingerprint && fingerprintChanged(previous, fingerprint)) {
      // Reemplazada: se recarga y recompone conservando la meta; abajo.
      slots.push(null);
      reloadJobs.push({ index: slots.length - 1, path, photo });
      return;
    }

    let updated = photo;
    if (path !== photo.sourcePath || photo.fileMtimeMs === undefined) {
      updated = {
        ...photo,
        sourcePath: path,
        fileSize: fingerprint?.size,
        fileMtimeMs: fingerprint?.mtimeMs ?? null,
      };
      if (path !== photo.sourcePath) renamed.push(updated);
    }
    slots.push(updated);
  });

  // Recarga de reemplazadas: una por una para conservar su meta aunque alguna
  // falle (si falla, se conserva la versión anterior y se avisa).
  for (const job of reloadJobs) {
    try {
      const { photos: fresh } = await loadPhotoAssets([{ path: job.path }], onProgress);
      const fingerprint = fingerprintByPath.get(job.path);
      if (fresh.length === 0) throw new Error('ilegible');
      const merged: PhotoAsset = {
        ...job.photo,
        // La imagen es otra: su edición anterior ya no la representa.
        status: 'pending',
        sourcePath: job.path,
        workingSrc: fresh[0].workingSrc,
        width: fresh[0].width,
        height: fresh[0].height,
        fileSize: fingerprint?.size,
        fileMtimeMs: fingerprint?.mtimeMs ?? null,
      };
      slots[job.index] = merged;
      replaced.push(merged);
    } catch {
      slots[job.index] = {
        ...job.photo,
        fileSize: fingerprintByPath.get(job.path)?.size,
        fileMtimeMs: fingerprintByPath.get(job.path)?.mtimeMs ?? null,
      };
      skipped.push({
        name: job.photo.fileName,
        reason: 'El archivo reemplazado no se pudo leer; se conserva la versión anterior',
      });
    }
  }

  // Nuevas en la carpeta: se cargan y se añaden al final (pendientes, vinculadas).
  const newPaths = currentPaths.filter((p) => !usedPaths.has(p));
  if (newPaths.length > 0) {
    const { photos: freshPhotos, skipped: newSkipped } = await loadPhotoAssets(
      newPaths.map((path) => ({ path })),
      onProgress,
    );
    skipped.push(...newSkipped);
    for (const photo of freshPhotos) {
      const fingerprint = fingerprintByPath.get(photo.sourcePath);
      added.push({
        ...photo,
        fileSize: fingerprint?.size,
        fileMtimeMs: fingerprint?.mtimeMs ?? null,
      });
    }
  }

  const photos = [
    ...slots.filter((p): p is PhotoAsset => p !== null),
    ...added,
  ];
  return { photos, added, removed, replaced, renamed, skipped, folderError: null };
}
