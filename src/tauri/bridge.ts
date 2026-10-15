import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readDir, readFile, stat, writeFile } from '@tauri-apps/plugin-fs';
import { openPath } from '@tauri-apps/plugin-opener';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { IMAGE_DIALOG_FILTER, fileExtension, isImageFileName } from '../core/defaults';

/** true cuando corre dentro de Tauri (si no, fallback web). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  gif: 'image/gif',
};

export function mimeForFileName(fileName: string): string {
  return MIME_BY_EXT[fileExtension(fileName)] ?? 'application/octet-stream';
}

export function baseNameOfPath(path: string): string {
  const clean = path.replace(/[\\/]+$/, '');
  const idx = Math.max(clean.lastIndexOf('/'), clean.lastIndexOf('\\'));
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',');
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  if (!meta.includes(';base64')) {
    const decoded = decodeURIComponent(payload);
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i += 1) bytes[i] = decoded.charCodeAt(i);
    return bytes;
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(blob);
  });
}

/* ── Selección de archivos (Tauri o fallback web) ── */

export interface PickedSource {
  file?: File;
  path?: string;
}

export async function pickImageFiles(): Promise<PickedSource[]> {
  if (isTauri()) {
    const result = await openDialog({
      multiple: true,
      directory: false,
      filters: [IMAGE_DIALOG_FILTER],
    });
    const paths = Array.isArray(result) ? result : result ? [result] : [];
    return paths.map((p) => ({ path: p }));
  }
  const files = await pickFilesViaInput({ accept: 'image/*', multiple: true });
  return files.map((file) => ({ file }));
}

export async function pickImageFolder(): Promise<{
  folderPath: string;
  sources: PickedSource[];
} | null> {
  if (isTauri()) {
    const result = await openDialog({ directory: true, multiple: false });
    if (typeof result !== 'string' || !result) return null;
    const paths = await listImagePathsInFolder(result);
    return { folderPath: result, sources: paths.map((p) => ({ path: p })) };
  }
  const files = await pickFilesViaInput({ webkitdirectory: true });
  if (files.length === 0) return null;
  const relative = (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath ?? '';
  const folderName = relative.split('/')[0] ?? 'carpeta';
  return { folderPath: folderName, sources: files.map((file) => ({ file })) };
}

export async function pickDestinationFolder(): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await openDialog({ directory: true, multiple: false, title: 'Elegir carpeta destino' });
  return typeof result === 'string' ? result : null;
}

/** Fallback web: input DOM oculto (archivos, carpeta o ambos). */
export function pickFilesViaInput(options: {
  accept?: string;
  multiple?: boolean;
  webkitdirectory?: boolean;
}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    if (options.multiple) input.multiple = true;
    if (options.webkitdirectory) {
      input.setAttribute('webkitdirectory', '');
      input.setAttribute('directory', '');
    }
    input.style.display = 'none';
    document.body.appendChild(input);
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(Array.from(input.files ?? [])));
    // El usuario puede cerrar el diálogo sin elegir: no hay evento fiable, se
    // limpia tras un tiempo largo si no cambió.
    window.setTimeout(() => finish(Array.from(input.files ?? [])), 5 * 60 * 1000);
    input.click();
  });
}

/* ── FS (Tauri) ── */

export async function readFileAsFile(path: string): Promise<File> {
  const bytes = await readFile(path);
  const name = baseNameOfPath(path);
  return new File([new Uint8Array(bytes)], name, { type: mimeForFileName(name) });
}

export async function listImagePathsInFolder(folderPath: string): Promise<string[]> {
  const paths: string[] = [];

  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8) return;
    const entries = await readDir(dir);
    for (const entry of entries) {
      const entryPath = `${dir}/${entry.name}`;
      if (entry.isDirectory) {
        await walk(entryPath, depth + 1);
      } else if (isImageFileName(entry.name)) {
        paths.push(entryPath);
      }
    }
  };

  await walk(folderPath, 0);
  return paths.sort();
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  await writeFile(path, data);
}

/** Huella ligera de un archivo para detectar reemplazos (tamaño + mtime). */
export interface FileFingerprint {
  size: number;
  mtimeMs: number | null;
}

export async function statFileMeta(path: string): Promise<FileFingerprint | null> {
  try {
    const info = await stat(path);
    return { size: info.size, mtimeMs: info.mtime ? info.mtime.getTime() : null };
  } catch {
    return null; // desapareció o no se puede leer
  }
}

/** true si la huella cambió (o si no hay huella previa con la que comparar). */
export function fingerprintChanged(
  previous: FileFingerprint | undefined,
  current: FileFingerprint,
): boolean {
  if (!previous) return false; // sin datos previos: conservador, asumimos igual
  if (previous.size !== current.size) return true;
  if (previous.mtimeMs !== null && current.mtimeMs !== null) {
    return previous.mtimeMs !== current.mtimeMs;
  }
  return false;
}

export async function revealPath(path: string): Promise<void> {
  await openPath(path);
}

/* ── Drag & drop nativo (Tauri) ── */

export function subscribeNativeDrops(onPaths: (paths: string[]) => void): () => void {
  if (!isTauri()) return () => undefined;
  let unlisten: (() => void) | undefined;
  let cancelled = false;
  getCurrentWebview()
    .onDragDropEvent((event) => {
      if (event.payload.type === 'drop') onPaths(event.payload.paths);
    })
    .then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
    unlisten?.();
  };
}

/* ── Descargas (fallback web) ── */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
