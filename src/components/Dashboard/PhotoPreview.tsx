import { useEffect, useRef } from 'react';
import type { OverlayTemplate, PhotoAsset } from '../../types/overlay';
import { renderWatermarkPreview } from '../../core/renderWatermark';

interface PhotoPreviewProps {
  photo: PhotoAsset;
  template: OverlayTemplate;
  maxWidth?: number;
}

/** Miniatura foto + overlay (con debounce para lotes grandes). */
export function PhotoPreview({ photo, template, maxWidth = 400 }: PhotoPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled || !canvasRef.current) return;
      renderWatermarkPreview(canvasRef.current, photo.workingSrc, template, maxWidth).catch(
        () => undefined,
      );
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [photo.workingSrc, template, maxWidth]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', display: 'block', borderRadius: 6, backgroundColor: '#f1f3f5' }}
    />
  );
}
