import { useState } from 'react';
import JSZip from 'jszip';
import {
  Alert,
  Button,
  Group,
  Paper,
  Progress,
  SegmentedControl,
  Slider,
  Stack,
  Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconDownload,
  IconFolder,
  IconFolderOpen,
  IconPhoto,
} from '@tabler/icons-react';
import { useProjectStore } from '../../state/projectStore';
import { photoTemplate } from '../../types/overlay';
import { renderWatermark } from '../../core/renderWatermark';
import { baseName } from '../../core/defaults';
import {
  dataUrlToUint8Array,
  downloadBlob,
  downloadDataUrl,
  isTauri,
  pickDestinationFolder,
  revealPath,
  writeBinaryFile,
} from '../../tauri/bridge';

type ExportMode = 'zip' | 'individual';

export function StepExport() {
  const { state, dispatch } = useProjectStore();
  const project = state.project;
  const [modeOverride, setModeOverride] = useState<ExportMode | null>(null);
  const [destFolder, setDestFolder] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(
    null,
  );
  const [lastExportFolder, setLastExportFolder] = useState<string | null>(null);

  if (!project) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Carga un lote para exportarlo.
      </Text>
    );
  }

  const mode: ExportMode =
    modeOverride ?? (project.sourceKind === 'folder' ? 'zip' : 'individual');
  const isPng = project.exportFormat === 'png';
  const native = isTauri();

  const handleChooseFolder = async () => {
    const folder = await pickDestinationFolder();
    if (folder) setDestFolder(folder);
  };

  const runExport = async () => {
    if (project.photos.length === 0) return;
    const total = project.photos.length;
    setProgress({ done: 0, total });
    dispatch({ type: 'busy', message: 'Exportando…' });
    setLastExportFolder(null);
    try {
      const format = project.exportFormat;
      const quality = project.jpegQuality;
      const ext = format === 'png' ? 'png' : 'jpg';
      const results: { name: string; dataUrl: string }[] = [];
      const used = new Set<string>();

      for (let i = 0; i < total; i += 1) {
        const photo = project.photos[i];
        setProgress({ done: i, total, current: photo.fileName });
        const dataUrl = await renderWatermark(
          photo.workingSrc,
          photoTemplate(project, photo),
          { format, quality },
        );
        let name = `${photo.outputName || baseName(photo.fileName)}.${ext}`;
        if (used.has(name)) {
          const stem = photo.outputName || baseName(photo.fileName);
          let n = 2;
          while (used.has(`${stem}-${n}.${ext}`)) n += 1;
          name = `${stem}-${n}.${ext}`;
        }
        used.add(name);
        results.push({ name, dataUrl });
      }
      setProgress({ done: total, total });

      if (mode === 'zip') {
        const zip = new JSZip();
        for (const item of results) {
          zip.file(item.name, dataUrlToUint8Array(item.dataUrl));
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const zipName = `overlayer_${new Date().toISOString().slice(0, 10)}.zip`;
        if (native && destFolder) {
          const path = `${destFolder.replace(/\/+$/, '')}/${zipName}`;
          await writeBinaryFile(path, new Uint8Array(await blob.arrayBuffer()));
          setLastExportFolder(destFolder);
          notifications.show({ color: 'green', message: `ZIP guardado en ${path}` });
        } else {
          downloadBlob(blob, zipName);
          notifications.show({ color: 'green', message: 'ZIP descargado.' });
        }
      } else if (native && destFolder) {
        for (const item of results) {
          const path = `${destFolder.replace(/\/+$/, '')}/${item.name}`;
          await writeBinaryFile(path, dataUrlToUint8Array(item.dataUrl));
        }
        setLastExportFolder(destFolder);
        notifications.show({
          color: 'green',
          message: `${results.length} imagen(es) guardadas en ${destFolder}`,
        });
      } else {
        for (const item of results) {
          downloadDataUrl(item.dataUrl, item.name);
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        notifications.show({
          color: 'green',
          message: `${results.length} imagen(es) descargadas.`,
        });
      }

      dispatch({ type: 'setExported', photoIds: project.photos.map((p) => p.id) });
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'Error al exportar',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setProgress(null);
      dispatch({ type: 'busy', message: null });
    }
  };

  return (
    <Stack gap="md" maw={720} mx="auto">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={600} mb={6}>
              Formato de salida
            </Text>
            <SegmentedControl
              value={project.exportFormat}
              onChange={(v) => dispatch({ type: 'setExport', format: v as 'jpeg' | 'png' })}
              data={[
                { value: 'jpeg', label: 'JPEG' },
                { value: 'png', label: 'PNG' },
              ]}
            />
          </div>
          <div>
            <Text size="sm" fw={600} mb={6}>
              Calidad JPEG — {Math.round(project.jpegQuality * 100)}%
            </Text>
            <Slider
              min={0.3}
              max={1}
              step={0.05}
              value={project.jpegQuality}
              disabled={isPng}
              onChange={(v) => dispatch({ type: 'setExport', quality: v })}
            />
            {isPng && (
              <Text size="xs" c="dimmed" mt={4}>
                PNG es sin pérdida: la calidad no aplica.
              </Text>
            )}
          </div>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <div>
            <Text size="sm" fw={600} mb={6}>
              Destino
            </Text>
            <SegmentedControl
              value={mode}
              onChange={(v) => setModeOverride(v as ExportMode)}
              data={[
                { value: 'zip', label: 'Un .zip' },
                { value: 'individual', label: 'Archivos sueltos' },
              ]}
            />
            <Text size="xs" c="dimmed" mt={6}>
              {project.sourceKind === 'folder'
                ? 'El origen fue una carpeta: se recomienda un .zip con todo el lote.'
                : 'Fotos sueltas: puedes descargarlas una por una o empaquetarlas en un .zip.'}
            </Text>
          </div>

          {native ? (
            <Group gap="xs">
              <Button
                variant="light"
                leftSection={<IconFolder size={16} />}
                onClick={handleChooseFolder}
              >
                {destFolder ? 'Cambiar carpeta destino' : 'Elegir carpeta destino'}
              </Button>
              {destFolder && (
                <Text size="sm" c="dimmed" truncate maw={360}>
                  {destFolder}
                </Text>
              )}
            </Group>
          ) : (
            <Alert icon={<IconDownload size={16} />} color="blue" variant="light">
              Modo navegador: los resultados se descargarán a tu carpeta de descargas.
            </Alert>
          )}
        </Stack>
      </Paper>

      {progress && (
        <Paper withBorder p="md" radius="md">
          <Stack gap={6}>
            <Progress
              value={progress.total > 0 ? (progress.done / progress.total) * 100 : 0}
              animated
              striped
            />
            <Text size="xs" c="dimmed" ta="center">
              Componiendo {progress.done}/{progress.total}
              {progress.current ? ` — ${progress.current}` : ''}
            </Text>
          </Stack>
        </Paper>
      )}

      <Group justify="space-between">
        <Button
          variant="light"
          leftSection={<IconPhoto size={16} />}
          onClick={() => dispatch({ type: 'step', step: 'review' })}
        >
          Volver al lote
        </Button>
        <Group gap="xs">
          {native && lastExportFolder && (
            <Button
              variant="subtle"
              leftSection={<IconFolderOpen size={16} />}
              onClick={() => void revealPath(lastExportFolder)}
            >
              Abrir carpeta
            </Button>
          )}
          <Button
            leftSection={<IconDownload size={16} />}
            loading={progress !== null}
            disabled={project.photos.length === 0 || (native && !destFolder)}
            onClick={() => void runExport()}
          >
            Exportar {project.photos.length} foto{project.photos.length === 1 ? '' : 's'}
            {mode === 'zip' ? ' en .zip' : ''}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}
