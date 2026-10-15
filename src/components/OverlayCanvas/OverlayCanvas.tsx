import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
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

export interface ViewportPan {
  x: number;
  y: number;
}

interface OverlayCanvasProps {
  photo: PhotoAsset;
  template: OverlayTemplate;
  selectedId: Id | null;
  transformMode: TransformMode;
  zoom: number;
  pan: ViewportPan;
  onSelect: (id: Id | null) => void;
  onToggleMode: () => void;
  onPanChange: (pan: ViewportPan) => void;
  onZoomChange: (zoom: number) => void;
  /** Actualización continua (durante el arrastre). */
  onChange: (template: OverlayTemplate) => void;
  /** Fin de gesto: el padre debe guardar el snapshot en el historial. */
  onCommit: () => void;
}

type HandleKey = 'tl' | 'tr' | 'bl' | 'br';

interface Interaction {
  kind: 'move' | 'scale' | 'rotate' | 'pan';
  /** Coordenadas de lienzo (pan: coordenadas de cliente). */
  start: { x: number; y: number };
  startTemplate: OverlayTemplate;
  handle?: HandleKey;
  startDistance?: number;
  startAngle?: number;
  startPan?: ViewportPan;
}

interface ViewportSize {
  width: number;
  height: number;
}

const HANDLE_KEYS: HandleKey[] = ['tl', 'tr', 'bl', 'br'];

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
const WHEEL_FACTOR = 1.2;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
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
  pan,
  onSelect,
  onToggleMode,
  onPanChange,
  onZoomChange,
  onChange,
  onCommit,
}: OverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const imagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const interactionRef = useRef<Interaction | null>(null);
  const [baseReady, setBaseReady] = useState(false);
  const [imagesVersion, setImagesVersion] = useState(0);
  const [viewport, setViewport] = useState<ViewportSize | null>(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);

  // Refs espejo para gestos (wheel / pan) sin depender del render.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const fitScaleRef = useRef(0);

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

  // Medir el viewport contenedor (para calcular el ajuste "contain").
  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const update = () => {
      setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Barra espaciadora: mantener pulsada para panorámica en cualquier zona.
  useEffect(() => {
    const isEditable = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (isEditable(target) || (target && target !== document.body && target.tagName !== 'CANVAS')) return;
      event.preventDefault();
      spaceRef.current = true;
      setSpaceHeld(true);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

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

  const toCanvasCoords = useCallback((event: { clientX: number; clientY: number }) => {
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
      if (!interaction || interaction.kind === 'pan') return;
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

  const startPan = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = 'grabbing';
      interactionRef.current = {
        kind: 'pan',
        start: { x: event.clientX, y: event.clientY },
        startTemplate: template,
        startPan: panRef.current,
      };
    },
    [template],
  );

  const handleDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLCanvasElement>) => {
      const { x, y } = toCanvasCoords(event);
      const hit = hitTest(x, y);
      // Alterna escala ↔ rotación solo sobre el elemento seleccionado.
      if (hit.id && hit.id === selectedId) onToggleMode();
    },
    [toCanvasCoords, hitTest, selectedId, onToggleMode],
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const canvas = event.currentTarget;

      // Botón central o barra espaciadora: panorámica en cualquier punto.
      if (event.button === 1 || spaceRef.current) {
        if (event.button === 1) event.preventDefault();
        startPan(event);
        return;
      }
      if (event.button !== 0) return;

      const { x, y } = toCanvasCoords(event);
      const hit = hitTest(x, y);

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

      // Fondo vacío: deselecciona y permite arrastrar para panorámica.
      onSelect(null);
      startPan(event);
    },
    [toCanvasCoords, hitTest, selectedId, transformMode, template, photo.width, photo.height, onSelect, startPan],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const interaction = interactionRef.current;
      const canvas = event.currentTarget;

      if (interaction?.kind === 'pan') {
        const origin = interaction.startPan ?? { x: 0, y: 0 };
        onPanChange({
          x: origin.x + (event.clientX - interaction.start.x),
          y: origin.y + (event.clientY - interaction.start.y),
        });
        return;
      }

      const { x, y } = toCanvasCoords(event);

      if (!interaction) {
        if (spaceRef.current) {
          canvas.style.cursor = 'grab';
          return;
        }
        const hit = hitTest(x, y);
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
          canvas.style.cursor = 'grab';
        }
        return;
      }

      applyInteraction(x, y);
    },
    [toCanvasCoords, hitTest, transformMode, applyInteraction, onPanChange],
  );

  const endInteraction = useCallback(
    (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!interactionRef.current) return;
      const wasPan = interactionRef.current.kind === 'pan';
      interactionRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      if (wasPan) {
        event.currentTarget.style.cursor = 'grab';
      }
      onCommit();
    },
    [onCommit],
  );

  // Zoom con rueda, anclado al punto bajo el cursor.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const z0 = zoomRef.current;
      const factor = event.deltaY < 0 ? WHEEL_FACTOR : 1 / WHEEL_FACTOR;
      const z1 = clampZoom(z0 * factor);
      if (z1 === z0) return;
      const viewportNode = viewportRef.current;
      if (!viewportNode) return;
      const vpRect = viewportNode.getBoundingClientRect();
      const naturalW = photo.width * fitScaleRef.current;
      const naturalH = photo.height * fitScaleRef.current;
      const cssW0 = naturalW * z0;
      const cssH0 = naturalH * z0;
      const pan0 = panRef.current;
      // Punto de contenido (en px CSS sin zoom) bajo el cursor.
      const cx = (event.clientX - (vpRect.left + (vpRect.width - cssW0) / 2 + pan0.x)) / z0 - naturalW / 2;
      const cy = (event.clientY - (vpRect.top + (vpRect.height - cssH0) / 2 + pan0.y)) / z0 - naturalH / 2;
      const dPan = z0 - z1;
      const nextPan = { x: pan0.x + dPan * cx, y: pan0.y + dPan * cy };
      // Actualización optimista para gestos de rueda rápidos antes del re-render.
      zoomRef.current = z1;
      panRef.current = nextPan;
      onZoomChange(z1);
      onPanChange(nextPan);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [photo.width, photo.height, onZoomChange, onPanChange]);

  // Escala "contain": a zoom 1 la imagen completa cabe en el viewport.
  const fitScale = viewport
    ? Math.min(viewport.width / photo.width, viewport.height / photo.height)
    : 0;
  fitScaleRef.current = fitScale;

  const cssWidth = photo.width * fitScale * zoom;
  const cssHeight = photo.height * fitScale * zoom;
  const canvasLeft = viewport ? (viewport.width - cssWidth) / 2 + pan.x : 0;
  const canvasTop = viewport ? (viewport.height - cssHeight) / 2 + pan.y : 0;

  return (
    <Box
      ref={viewportRef}
      className="canvas-checkerboard"
      style={{
        position: 'relative',
        overflow: 'hidden',
        flex: '1 1 auto',
        minWidth: 0,
        width: '100%',
        height: 'calc(100dvh - 240px)',
        minHeight: 320,
        borderRadius: 8,
        userSelect: 'none',
      }}
    >
      {viewport && fitScale > 0 && (
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
          onDoubleClick={handleDoubleClick}
          style={{
            position: 'absolute',
            left: canvasLeft,
            top: canvasTop,
            width: cssWidth,
            height: cssHeight,
            display: 'block',
            touchAction: 'none',
            cursor: spaceHeld ? 'grab' : 'default',
          }}
        />
      )}
    </Box>
  );
}
