import { useCallback, useEffect, useState, type DragEvent } from 'react';
import {
  Button,
  Group,
  Paper,
  Progress,
  Stack,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconFolder, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useProjectStore } from '../../state/projectStore';
import { loadPhotoAssets, type LoadProgress, type PhotoSource } from '../../core/loadPhotos';
import { createDefaultTemplate, isImageFileName, newId, whenFontsReady } from '../../core/defaults';
import { getLogoAsset } from '../../core/logo';
import type { ProjectState } from '../../types/overlay';
import {
  baseNameOfPath,
  isTauri,
  listImagePathsInFolder,
  pickImageFiles,
  pickImageFolder,
  subscribeNativeDrops,
} from '../../tauri/bridge';

/** Distingue archivos sueltos de carpetas soltadas en Tauri. */
async function sourcesFromPaths(paths: string[]): Promise<{
  sources: PhotoSource[];
  folderPath?: string;
}> {
  const sources: PhotoSource[] = [];
  let folderPath: string | undefined;
  for (const path of paths) {
    if (isImageFileName(baseNameOfPath(path))) {
      sources.push({ path });
      continue;
    }
    try {
      const inner = await listImagePathsInFolder(path);
      if (inner.length > 0) {
        folderPath = path;
        for (const p of inner) sources.push({ path: p });
      }
    } catch {
      /* no era una carpeta legible */
    }
  }
  return { sources, folderPath };
}

export function StepUpload() {
  const { dispatch } = useProjectStore();
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [dragging, setDragging] = useState(false);
  const busy = progress !== null;

  const handleSources = useCallback(
    async (
      sources: PhotoSource[],
      sourceKind: 'files' | 'folder',
      folderPath?: string,
    ) => {
      if (sources.length === 0) {
        notifications.show({
          color: 'yellow',
          title: 'Sin fotos',
          message: 'No se encontraron imágenes válidas.',
        });
        return;
      }
      dispatch({ type: 'busy', message: 'Cargando fotos…' });
      try {
        const { photos, skipped } = await loadPhotoAssets(sources, setProgress);
        for (const item of skipped) {
          notifications.show({
            color: 'yellow',
            title: 'Foto omitida',
            message: `${item.name}: ${item.reason}`,
            autoClose: 6000,
          });
        }
        if (photos.length === 0) {
          notifications.show({
            color: 'red',
            title: 'Sin fotos',
            message: 'No se pudo cargar ninguna imagen.',
          });
          return;
        }

        await whenFontsReady();
        const logo = await getLogoAsset();
        const template = createDefaultTemplate(photos[0].width, photos[0].height, logo);
        const project: ProjectState = {
          id: newId('project'),
          sourceKind,
          folderPath,
          template,
          photos,
          exportFormat: 'jpeg',
          jpegQuality: 0.9,
        };
        dispatch({ type: 'setProject', project });
        notifications.show({
          color: 'green',
          title: 'Lote cargado',
          message: `${photos.length} foto(s) lista(s) para editar.`,
        });
      } catch (error) {
        notifications.show({
          color: 'red',
          title: 'Error al cargar',
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setProgress(null);
        dispatch({ type: 'busy', message: null });
      }
    },
    [dispatch],
  );

  // Drag & drop nativo de Tauri (en web se usan los eventos HTML de abajo).
  useEffect(() => {
    if (!isTauri()) return;
    return subscribeNativeDrops((paths) => {
      void (async () => {
        const { sources, folderPath } = await sourcesFromPaths(paths);
        await handleSources(sources, folderPath ? 'folder' : 'files', folderPath);
      })();
    });
  }, [handleSources]);

  const handlePickFiles = async () => {
    const picked = await pickImageFiles();
    await handleSources(
      picked.map((p) => ({ file: p.file, path: p.path })),
      'files',
    );
  };

  const handlePickFolder = async () => {
    const picked = await pickImageFolder();
    if (!picked) return;
    await handleSources(picked.sources, 'folder', picked.folderPath);
  };

  const handleDomDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (isTauri()) return; // Tauri ya lo maneja vía onDragDropEvent
    const files = Array.from(event.dataTransfer.files ?? []);
    await handleSources(
      files.filter((f) => isImageFileName(f.name)).map((file) => ({ file })),
      'files',
    );
  };

  return (
    <Stack align="center" w="100%" gap="lg" py="xl" className="upload-layout">
      <Paper
        withBorder
        p="xl"
        radius="lg"
        shadow="sm"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDomDrop}
        className="upload-dropzone"
        style={{
          width: 760,
          maxWidth: 'calc(100vw - 48px)',
          flex: '0 0 auto',
          borderStyle: 'dashed',
          borderWidth: 2,
          borderColor: dragging ? 'var(--app-accent-border)' : undefined,
          background: dragging ? 'var(--app-accent-subtle)' : undefined,
          transition: 'background 120ms ease',
        }}
      >
        <Stack align="center" gap="md" py="md">
          <ThemeIcon size={64} radius="xl" variant="light" color="teal">
            <IconUpload size={34} />
          </ThemeIcon>
          <Text size="lg" fw={500} ta="center">
            Arrastra aquí la foto o fotos, o busca la carpeta en el sistema de archivos
          </Text>
          <Text size="sm" c="dimmed" ta="center">
            JPG, PNG, WEBP y AVIF · HEIC queda pendiente · la primera foto será la semilla de
            edición
          </Text>
          <Group>
            <Button
              leftSection={<IconPhoto size={16} />}
              onClick={handlePickFiles}
              loading={busy}
            >
              Seleccionar archivos
            </Button>
            <Button
              variant="light"
              leftSection={<IconFolder size={16} />}
              onClick={handlePickFolder}
              loading={busy}
            >
              Seleccionar carpeta
            </Button>
          </Group>

          {progress && (
            <Stack w="100%" gap={6}>
              <Progress
                value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
                animated
                striped
              />
              <Text size="xs" c="dimmed" ta="center">
                Procesando {progress.done}/{progress.total}
                {progress.current ? ` — ${progress.current}` : ''}
              </Text>
            </Stack>
          )}
        </Stack>
      </Paper>

      <Group gap="xs" c="dimmed">
        <IconPhoto size={14} />
        <Text size="xs">
          Las fotos se comprimen a 0.5 MB / 1920 px como en la referencia; el original nunca se
          modifica.
        </Text>
      </Group>
    </Stack>
  );
}
