import { blobToDataUrl } from '../tauri/bridge';
import { loadImage } from './renderWatermark';

export interface LogoAsset {
  src: string;
  naturalWidth: number;
  naturalHeight: number;
}

/** Carga `public/logo_transparent.png` como data URL + dimensiones. */
export async function getLogoAsset(): Promise<LogoAsset | null> {
  try {
    const response = await fetch('/logo_transparent.png', { cache: 'no-store' });
    if (!response.ok) return null;
    const blob = await response.blob();
    const src = await blobToDataUrl(blob);
    const img = await loadImage(src);
    return { src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight };
  } catch {
    return null;
  }
}
