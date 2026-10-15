import imageCompression from 'browser-image-compression';
import type { PhotoAsset } from '../types/overlay';
import {
  COMPRESSION_OPTIONS,
  PENDING_EXTENSIONS,
  defaultOutputName,
  fileExtension,
  newId,
} from './defaults';
import { blobToDataUrl, baseNameOfPath, isTauri, readFileAsFile } from '../tauri/bridge';

export interface PhotoSource {
  file?: File;
  /** Ruta absoluta (Tauri) o nombre de origen. */
  path?: string;
}

export interface LoadProgress {
  done: number;
  total: number;
  current?: string;
}

export interface SkippedPhoto {
  name: string;
  reason: string;
}

export interface LoadPhotosResult {
  photos: PhotoAsset[];
  skipped: SkippedPhoto[];
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Formato de imagen no soportado'));
    img.src = dataUrl;
  });
}

/**
 * Comprime cada fuente (0.5 MB / 1920 px / JPEG, igual que la referencia) y
 * produce los `PhotoAsset` listos para render. El orden de entrada se
 * conserva: la primera foto es la semilla de edición.
 */
export async function loadPhotoAssets(
  sources: PhotoSource[],
  onProgress?: (progress: LoadProgress) => void,
): Promise<LoadPhotosResult> {
  const photos: PhotoAsset[] = [];
  const skipped: SkippedPhoto[] = [];
  const total = sources.length;

  for (let i = 0; i < total; i += 1) {
    const source = sources[i];
    const name = source.file?.name ?? baseNameOfPath(source.path ?? `foto-${i + 1}`);
    onProgress?.({ done: i, total, current: name });

    const ext = fileExtension(name);
    if (PENDING_EXTENSIONS.includes(ext)) {
      skipped.push({ name, reason: 'HEIC pendiente: el navegador no puede decodificarlo todavía' });
      continue;
    }

    let file = source.file;
    if (!file && source.path && isTauri()) {
      try {
        file = await readFileAsFile(source.path);
      } catch {
        file = undefined;
      }
    }
    if (!file) {
      skipped.push({ name, reason: 'No se pudo leer el archivo' });
      continue;
    }

    try {
      const compressed = await imageCompression(file, { ...COMPRESSION_OPTIONS });
      const dataUrl = await blobToDataUrl(compressed);
      const dims = await loadImageDimensions(dataUrl);
      photos.push({
        id: newId('photo'),
        sourcePath: source.path ?? file.name,
        fileName: name,
        outputName: defaultOutputName(name),
        workingSrc: dataUrl,
        width: dims.width,
        height: dims.height,
        status: 'pending',
        linked: true,
        fileSize: file.size,
      });
    } catch {
      skipped.push({ name, reason: 'No se pudo procesar la imagen' });
    }
  }

  onProgress?.({ done: total, total });
  return { photos, skipped };
}
