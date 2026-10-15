import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Box } from '@mantine/core';
import type { Id, OverlayElement, OverlayTemplate, PhotoAsset } from '../../types/overlay';
import { cloneTemplate } from '../../types/overlay';
import {
  drawTemplate,
  elementSize,
  loadImage,
  preloadTemplateImages,
  templateRatio,
} from '../../core/renderWatermark';

export type TransformMode = 'scale' | 'rotate';

interface OverlayCanvasProps {
  photo: PhotoAsset;
  template: OverlayTemplate;
  selectedId: Id | null;
  transformMode: TransformMode;
  zoom: number;
  onSelect: (id: Id | null) => void;
  onToggleMode: () => void;
  /** Actualización continua (durante el arrastre). */
  onChange: (template: OverlayTemplate) => void;
  /** Fin de gesto: el padre debe guardar el snapshot en el historial. */
  onCommit: () => void;
}

type HandleKey = 'tl' | 'tr' | 'bl' | 'br';

interface Interaction {
  kind: 'move' | 'scale' | 'rotate';
  start: { x: number; y: number };
  startTemplate: OverlayTemplate;
  handle?: HandleKey;
  startDistance?: number;
  startAngle?: number;
}

const HANDLE_KEYS: HandleKey[] = ['tl', 'tr', 'bl', 'br'];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Punto del elemento en coordenadas locales (sin rotación/escala). */
function toLocal(
  el: OverlayElement,
  x: number,
  y: number,
  width: number,
  height: number,
): { lx: number; ly: number } {
  const cx = el.x * width;
  const cy = el.y * height;
  const cos = Math.cos(-el.rotation);
  const sin = Math.sin(-el.rotation);
  const dx = x - cx;
  const dy = y - cy;
  return { lx: dx * cos - dy * sin, ly: dx * sin + dy * cos };
}

function handleCorners(bw: number, bh: number, pad: number): Record<HandleKey, { x: number; y: number }> {
  const hx = bw / 2 + pad;
  const hy = bh / 2 + pad;
  return { tl: { x: -hx, y: -hy }, tr: { x: hx, y: -hy }, bl: { x: -hx, y: hy }, br: { x: hx, y: hy } };
}

export function OverlayCanvas({
  photo,
  template,
  selectedId,
  transformMode,
  zoom,
  onSelect,
  onToggleMode,
  onChange,
  onCommit,
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const interactionRef = useRef<Interaction | null>(null);
  const [baseReady, setBaseReady] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);

  // Cargar foto base.
  useEffect(() => {
    let cancelled = false;
    setBaseReady(false);
    loadImage(photo.workingSrc)
      .then((img) => {
        if (cancelled) return;
        baseImgRef.current = img;
        setBaseReady(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [photo.workingSrc]);

  // Precargar imágenes del overlay.
  useEffect(() => {
    let cancelled = false;
    preloadTemplateImages(template).then((map) => {
      if (cancelled) return;
      imagesRef.current = map;
      setImagesVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [template]);

  /** px de lienzo por píxel CSS (incluye zoom). */
  const pixelsPerCss = useCallback((): number => {
    const canvas = canvasRef.current;
    if (!canvas) return 1;
    const rect = canvas.getBoundingClientRect();
    return rect.width > 0 ? canvas.width / rect.width : 1;
  }, []);

  const metricsFor = useCallback(
    (el: OverlayElement) => {
      const ratio = templateRatio(template, photo.width, photo.height);
      const size = elementSize(el, ratio);
      return { bw: size.width * el.scale, bh: size.height * el.scale };
    },
    [template, photo.width, photo.height],
  );

  // ── Dibujo ──
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (canvas.width !== photo.width) canvas.width = photo.width;
    if (canvas.height !== photo.height) canvas.height = photo.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (baseReady && baseImgRef.current) {
      ctx.drawImage(baseImgRef.current, 0, 0, canvas.width, canvas.height);
    }
    drawTemplate(ctx, template, canvas.width, canvas.height, imagesRef.current);

    const selected = template.elements.find((el) => el.id === selectedId);
    if (selected) {
      const px = pixelsPerCss();
      const { bw, bh } = metricsFor(selected);
      const pad = 6 * px;
      ctx.save();
      ctx.translate(selected.x * canvas.width, selected.y * canvas.height);
      ctx.rotate(selected.rotation);
      ctx.lineWidth = Math.max(1, px);
      ctx.strokeStyle = transformMode === 'rotate' ? '#e67e22' : '#00a8ff';
      ctx.setLineDash(transformMode === 'scale' ? [5 * px, 5 * px] : []);
      ctx.strokeRect(-bw / 2 - pad, -bh / 2 - pad, bw + 2 * pad, bh + 2 * pad);
      ctx.setLineDash([]);

      const handleSize = 8 * px;
      const corners = handleCorners(bw, bh, pad);
      if (transformMode === 'scale') {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#00a8ff';
        for (const key of HANDLE_KEYS) {
          const c = corners[key];
          ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
        }
      } else {
        // Modo rotación: puntos en las esquinas + centro.
        ctx.fillStyle = '#e67e22';
        for (const key of HANDLE_KEYS) {
          const c = corners[key];
          ctx.beginPath();
          ctx.arc(c.x, c.y, handleSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 3 * px, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }, [
    photo.width,
    photo.height,
    template,
    selectedId,
    transformMode,
    baseReady,
    imagesVersion,
    pixelsPerCss,
    metricsFor,
  ]);

  const toCanvasCoords = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * canvas.height,
    };
  }, []);

  const hitTest = useCallback(
    (x: number, y: number): { id: Id | null; handle: HandleKey | null } => {
      const px = pixelsPerCss();
      const margin = 10 * px;

      // 1) Esquinas del elemento seleccionado.
      const selected = template.elements.find((el) => el.id === selectedId);
      if (selected) {
        const { lx, ly } = toLocal(selected, x, y, photo.width, photo.height);
        const { bw, bh } = metricsFor(selected);
        const corners = handleCorners(bw, bh, 6 * px);
        for (const key of HANDLE_KEYS) {
          const c = corners[key];
          if (Math.abs(lx - c.x) <= margin && Math.abs(ly - c.y) <= margin) {
            return { id: selected.id, handle: key };
          }
        }
      }

      // 2) Cuerpo de los elementos (de arriba hacia abajo).
      for (let i = template.elements.length - 1; i >= 0; i -= 1) {
        const el = template.elements[i];
        const { lx, ly } = toLocal(el, x, y, photo.width, photo.height);
        const { bw, bh } = metricsFor(el);
        const tolerance = 4 * px;
        if (Math.abs(lx) <= bw / 2 + tolerance && Math.abs(ly) <= bh / 2 + tolerance) {
          return { id: el.id, handle: null };
        }
      }
      return { id: null, handle: null };
    },
    [template, selectedId, photo.width, photo.height, metricsFor, pixelsPerCss],
  );

  const applyInteraction = useCallback(
    (x: number, y: number) => {
      const interaction = interactionRef.current;
      if (!interaction) return;
      const startEl = interaction.startTemplate.elements.find((el) => el.id === selectedId);
      if (!startEl) return;

      const next = cloneTemplate(interaction.startTemplate);
      const el = next.elements.find((item) => item.id === startEl.id);
      if (!el) return;
      const cx = startEl.x * photo.width;
      const cy = startEl.y * photo.height;

      if (interaction.kind === 'move') {
        const dx = (x - interaction.start.x) / photo.width;
        const dy = (y - interaction.start.y) / photo.height;
        el.x = clamp01(startEl.x + dx);
        el.y = clamp01(startEl.y + dy);
      } else if (interaction.kind === 'scale') {
        const distance = Math.hypot(x - cx, y - cy);
        const factor = distance / Math.max(1, interaction.startDistance ?? 1);
        el.scale = Math.min(20, Math.max(0.05, startEl.scale * factor));
      } else {
        const angle = Math.atan2(y - cy, x - cx);
        el.rotation = startEl.rotation + (angle - (interaction.startAngle ?? angle));
      }
      onChange(next);
    },
    [selectedId, photo.width, photo.height, onChange],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (event.button !== 0) return;
      const { x, y } = toCanvasCoords(event);
      const hit = hitTest(x, y);
      const canvas = event.currentTarget;

      if (hit.handle && selectedId) {
        const el = template.elements.find((item) => item.id === selectedId);
        if (!el) return;
        const cx = el.x * photo.width;
        const cy = el.y * photo.height;
        const kind: Interaction['kind'] =
          transformMode === 'rotate' ? 'rotate' : 'scale';
        interactionRef.current = {
          kind,
          start: { x, y },
          startTemplate: template,
          handle: hit.handle,
          startDistance: Math.hypot(x - cx, y - cy),
          startAngle: Math.atan2(y - cy, x - cx),
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      if (hit.id) {
        if (hit.id !== selectedId) onSelect(hit.id);
        const el = template.elements.find((item) => item.id === hit.id);
        if (el?.locked) return;
        interactionRef.current = {
          kind: 'move',
          start: { x, y },
          startTemplate: template,
        };
        canvas.setPointerCapture(event.pointerId);
        return;
      }

      onSelect(null);
    },
    [toCanvasCoords, hitTest, selectedId, transformMode, template, photo.width, photo.height, onSelect],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const { x, y } = toCanvasCoords(event);
      const interaction = interactionRef.current;

      if (!interaction) {
        const hit = hitTest(x, y);
        const canvas = event.currentTarget;
        if (hit.handle) {
          canvas.style.cursor =
            transformMode === 'rotate'
              ? 'grab'
              : hit.handle === 'tl' || hit.handle === 'br'
                ? 'nwse-resize'
                : 'nesw-resize';
        } else if (hit.id) {
          canvas.style.cursor = 'move';
        } else {
          canvas.style.cursor = 'default';
        }
        return;
      }

      applyInteraction(x, y);
    },
    [toCanvasCoords, hitTest, transformMode, applyInteraction],
  );

  const endInteraction = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactionRef.current) return;
      interactionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onCommit();
    },
    [onCommit],
  );

  return (
    <Box className="canvas-checkerboard" style={{ overflow: 'auto', width: '100%', borderRadius: 8 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onDoubleClick={onToggleMode}
        style={{
          display: 'block',
          width: `${zoom * 100}%`,
          height: 'auto',
          margin: '0 auto',
          touchAction: 'none',
          cursor: 'default',
        }}
      />
    </Box>
  );
}
