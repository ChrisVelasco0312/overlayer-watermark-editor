import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconMaximize,
  IconPhotoPlus,
  IconTextSize,
  IconTrash,
  IconZoomIn,
  IconZoomOut,
} from '@tabler/icons-react';
import { OverlayCanvas, type TransformMode, type ViewportPan } from '../OverlayCanvas/OverlayCanvas';
import { OverlayInspector } from '../OverlayInspector/OverlayInspector';
import { useEditingContext, useProjectStore } from '../../state/projectStore';
import type { Id, OverlayElement, OverlayTemplate } from '../../types/overlay';
import { cloneTemplate } from '../../types/overlay';
import {
  createImageOverlay,
  createTextOverlay,
} from '../../core/defaults';
import { loadImage } from '../../core/renderWatermark';
import { blobToDataUrl, pickFilesViaInput } from '../../tauri/bridge';

export function StepEditor() {
  const { state, dispatch } = useProjectStore();
  const { photo, template, isLinked } = useEditingContext();

  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [transformMode, setTransformMode] = useState<TransformMode>('scale');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<ViewportPan>({ x: 0, y: 0 });

  // Historial lineal: stack[index] es el estado actual conocido.
  const [stack, setStack] = useState<OverlayTemplate[]>(() =>
    template ? [cloneTemplate(template)] : [],
  );
  const [index, setIndex] = useState(0);
  const currentRef = useRef<OverlayTemplate | null>(template ?? null);

  const applyTemplate = useCallback(
    (next: OverlayTemplate) => {
      currentRef.current = next;
      dispatch({ type: 'setTemplate', template: next });
    },
    [dispatch],
  );

  const commit = useCallback(() => {
    const current = currentRef.current;
    if (!current) return;
    const serialized = JSON.stringify(current);
    if (stack[index] && JSON.stringify(stack[index]) === serialized) return;
    const nextStack = stack.slice(0, index + 1);
    nextStack.push(cloneTemplate(current));
    setStack(nextStack);
    setIndex(nextStack.length - 1);
  }, [stack, index]);

  const undo = useCallback(() => {
    if (index <= 0) return;
    const snapshot = stack[index - 1];
    if (!snapshot) return;
    currentRef.current = snapshot;
    dispatch({ type: 'setTemplate', template: snapshot });
    setIndex(index - 1);
  }, [stack, index, dispatch]);

  const redo = useCallback(() => {
    if (index >= stack.length - 1) return;
    const snapshot = stack[index + 1];
    if (!snapshot) return;
    currentRef.current = snapshot;
    dispatch({ type: 'setTemplate', template: snapshot });
    setIndex(index + 1);
  }, [stack, index, dispatch]);

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(8, Math.round((z + 0.25) * 100) / 100));
  }, []);

  // Cambios externos (p. ej. cambio de foto) reinician el historial.
  useEffect(() => {
    if (template) {
      currentRef.current = template;
      setStack([cloneTemplate(template)]);
      setIndex(0);
      setSelectedId(null);
      resetView();
    }
    // Solo al montar / cambiar de foto (el paso de edición se remonta cada vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id]);

  const handleUpdateElement = useCallback(
    (nextElement: OverlayElement, shouldCommit: boolean) => {
      const current = currentRef.current;
      if (!current) return;
      const next = cloneTemplate(current);
      const idx = next.elements.findIndex((el) => el.id === nextElement.id);
      if (idx === -1) return;
      next.elements[idx] = nextElement;
      applyTemplate(next);
      if (shouldCommit) commit();
    },
    [applyTemplate, commit],
  );

  const handleDelete = useCallback(
    (id: Id) => {
      const current = currentRef.current;
      if (!current) return;
      const next = cloneTemplate(current);
      next.elements = next.elements.filter((el) => el.id !== id);
      applyTemplate(next);
      commit();
      setSelectedId((prev) => (prev === id ? null : prev));
    },
    [applyTemplate, commit],
  );

  const handleAddText = useCallback(() => {
    const current = currentRef.current;
    if (!current) return;
    const el = createTextOverlay({ text: 'Nuevo texto', name: 'Texto' });
    if (current.referenceMin) {
      el.fontSize = Math.max(18, Math.min(28, Math.round(current.referenceMin * 0.028)));
      el.lineHeight = Math.round(el.fontSize * 1.25);
      el.letterSpacing = Math.max(1, Math.round(el.fontSize * 0.08));
      el.strokeWidth = Math.max(2, Math.round(el.fontSize * 0.12));
    }
    const next = cloneTemplate(current);
    next.elements.push(el);
    applyTemplate(next);
    commit();
    setSelectedId(el.id);
    setTransformMode('scale');
  }, [applyTemplate, commit]);

  const handleAddImage = useCallback(async () => {
    const current = currentRef.current;
    if (!current || !photo) return;
    try {
      const [file] = await pickFilesViaInput({ accept: 'image/*', multiple: false });
      if (!file) return;
      const src = await blobToDataUrl(file);
      const img = await loadImage(src);
      const el = createImageOverlay({
        src,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        width: Math.round(photo.width * 0.18),
        name: file.name,
      });
      const next = cloneTemplate(current);
      next.elements.push(el);
      applyTemplate(next);
      commit();
      setSelectedId(el.id);
      setTransformMode('scale');
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'No se pudo añadir la imagen',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [applyTemplate, commit, photo]);

  // Atajos: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Supr.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId) {
          event.preventDefault();
          handleDelete(selectedId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, selectedId, handleDelete]);

  if (!photo || !template) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Carga un lote de fotos para empezar a editar.
      </Text>
    );
  }

  const linkedCount = state.project?.photos.filter((p) => p.linked).length ?? 0;

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Tooltip label="Añadir texto">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconTextSize size={14} />}
              onClick={handleAddText}
            >
              Texto
            </Button>
          </Tooltip>
          <Tooltip label="Añadir imagen">
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPhotoPlus size={14} />}
              onClick={() => void handleAddImage()}
            >
              Imagen
            </Button>
          </Tooltip>
          <Tooltip label="Eliminar seleccionado (Supr)">
            <ActionIcon
              size="md"
              variant="subtle"
              color="red"
              disabled={!selectedId}
              onClick={() => selectedId && handleDelete(selectedId)}
            >
              <IconTrash size={17} />
            </ActionIcon>
          </Tooltip>
          <ActionIcon
            size="md"
            variant="subtle"
            color="gray"
            disabled={index <= 0}
            onClick={undo}
            aria-label="Deshacer"
          >
            <IconArrowBackUp size={17} />
          </ActionIcon>
          <ActionIcon
            size="md"
            variant="subtle"
            color="gray"
            disabled={index >= stack.length - 1}
            onClick={redo}
            aria-label="Rehacer"
          >
            <IconArrowForwardUp size={17} />
          </ActionIcon>

          <ActionIcon
            size="md"
            variant="subtle"
            color="gray"
            onClick={zoomOut}
            aria-label="Alejar"
          >
            <IconZoomOut size={17} />
          </ActionIcon>
          <ActionIcon
            size="md"
            variant="subtle"
            color="gray"
            onClick={resetView}
            aria-label="Ajustar"
          >
            <IconMaximize size={17} />
          </ActionIcon>
          <ActionIcon
            size="md"
            variant="subtle"
            color="gray"
            onClick={zoomIn}
            aria-label="Acercar"
          >
            <IconZoomIn size={17} />
          </ActionIcon>

        </Group>

        <Group gap="xs">
          <Badge color={isLinked ? 'blue' : 'grape'} variant="light">
            {isLinked ? `Vinculada · plantilla de ${linkedCount}` : 'Individual'}
          </Badge>
        </Group>
      </Group>

      <Text size="xs" c="dimmed">
        Edita <b>{photo.fileName}</b> — doble clic alterna escala ↔ rotación; arrastra para mover.
        Rueda para zoom; arrastra el fondo (o mantén Espacio / botón central) para desplazar.
        {isLinked
          ? ' Los cambios se aplican a todas las fotos vinculadas.'
          : ' Esta foto tiene plantilla propia (desvinculada).'}
      </Text>

      <Group gap="md" align="start" wrap="nowrap">
        <OverlayCanvas
          photo={photo}
          template={template}
          selectedId={selectedId}
          transformMode={transformMode}
          zoom={zoom}
          pan={pan}
          onSelect={setSelectedId}
          onToggleMode={() => setTransformMode((m) => (m === 'scale' ? 'rotate' : 'scale'))}
          onPanChange={setPan}
          onZoomChange={setZoom}
          onChange={applyTemplate}
          onCommit={commit}
        />
        <Paper withBorder p="md" w={320} style={{ flexShrink: 0 }}>
          <OverlayInspector
            template={template}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onUpdate={handleUpdateElement}
            onCommit={commit}
            onDelete={handleDelete}
          />
        </Paper>
      </Group>
    </Stack>
  );
}
