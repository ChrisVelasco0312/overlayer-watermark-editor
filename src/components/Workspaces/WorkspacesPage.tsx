import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Group,
  Modal,
  Paper,
  Progress,
  Skeleton,
  Stack,
  Switch,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCheck,
  IconFolder,
  IconFolderOpen,
  IconInfoCircle,
  IconPhotoPlus,
  IconPlayerPlay,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useProjectStore } from '../../state/projectStore';
import type { Step } from '../../state/projectStore';
import type { WorkspaceSnapshot } from '../../types/workspace';
import {
  deleteWorkspace,
  finishResume,
  isWorkspacesSupported,
  listWorkspaces,
  prepareResume,
  type PreparedResume,
} from '../../core/workspaces';
import { revealPath } from '../../tauri/bridge';
import type { LoadProgress } from '../../core/loadPhotos';

const MAX_NAMES_IN_LIST = 8;

function formatStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function nameList(names: string[]): string {
  const shown = names.slice(0, MAX_NAMES_IN_LIST);
  const rest = names.length - shown.length;
  return shown.join(', ') + (rest > 0 ? ` y ${rest} más` : '');
}

export function WorkspacesPage() {
  const { dispatch } = useProjectStore();
  const [items, setItems] = useState<WorkspaceSnapshot[] | null>(null);
  const [resuming, setResuming] = useState<PreparedResume | null>(null);
  const [includeNew, setIncludeNew] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<WorkspaceSnapshot | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  const reload = useCallback(() => {
    setItems(null);
    void listWorkspaces()
      .then((list) => setItems(list))
      .catch(() => {
        setItems([]);
        notifications.show({
          color: 'red',
          title: 'No se pudieron leer los espacios',
          message: 'Revisa que la app tenga acceso a su carpeta de datos.',
        });
      });
  }, []);

  useEffect(reload, [reload]);

  const supported = isWorkspacesSupported();

  /** Reanuda un espacio y devuelve al asistente con el paso guardado. */
  const doResume = async (prepared: PreparedResume, withNewFiles: boolean) => {
    dispatch({ type: 'busy', message: 'Reanudando fotos desde la carpeta…' });
    try {
      const { project, skipped } = await finishResume(prepared, prepared.workspace, {
        includeNewFiles: withNewFiles,
        onProgress: setProgress,
      });
      const step: Step =
        prepared.workspace.lastStep === 'upload' ? 'edit' : prepared.workspace.lastStep;
      dispatch({ type: 'setProject', project, step });
      dispatch({ type: 'setView', view: 'wizard' });
      notifications.show({
        color: 'green',
        title: `Espacio "${prepared.workspace.name}" reanudado`,
        message: `${project.photos.length} foto(s) cargadas desde la carpeta.`,
      });
      for (const item of skipped) {
        notifications.show({
          color: 'yellow',
          title: 'Foto dañada u omitida',
          message: `${item.name}: ${item.reason}`,
          autoClose: 8000,
        });
      }
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'No se pudo reanudar',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setProgress(null);
      setResuming(null);
      dispatch({ type: 'busy', message: null });
    }
  };

  /** Resume directo; muestra el modal de diferencias si la carpeta cambió. */
  const handleResume = async (id: string) => {
    try {
      const prepared = await prepareResume(id);
      if (prepared.folderError) {
        setResuming(prepared); // modal en modo error
        return;
      }
      const hasChanges = prepared.missing.length > 0 || prepared.newFiles.length > 0;
      if (!hasChanges) {
        await doResume(prepared, false);
        return;
      }
      setIncludeNew(true);
      setResuming(prepared);
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'No se pudo abrir el espacio',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const handleDelete = async (workspace: WorkspaceSnapshot) => {
    setConfirmDelete(null);
    try {
      await deleteWorkspace(workspace.id);
      notifications.show({
        color: 'green',
        title: 'Espacio eliminado',
        message: 'Solo se borró el espacio guardado; tus fotos quedan intactas.',
      });
      reload();
    } catch (error) {
      notifications.show({
        color: 'red',
        title: 'No se pudo eliminar',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Stack gap="lg" maw={860} mx="auto" w="100%">
      <div>
        <Group gap="sm" mb={4}>
          <ThemeIcon variant="light" color="teal" size="lg">
            <IconFolderOpen size={20} />
          </ThemeIcon>
          <Title order={3}>Espacios guardados</Title>
        </Group>
        <Text size="sm" c="dimmed">
          Cuando trabajas sobre una <b>carpeta</b>, Overlayer guarda tu sesión automáticamente:
          el overlay y sus elementos, qué fotos están desvinculadas, los estados y los nombres de
          salida. Aquí puedes <b>reanudar cualquier sesión</b> para seguir editando o exportar de
          nuevo. Las <b>fotos sueltas</b> (sin carpeta) no se guardan.
        </Text>
      </div>

      {!supported && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          Guardar espacios solo está disponible en la versión de escritorio (Tauri). En el
          navegador puedes usar el asistente, pero no se guardará ninguna sesión.
        </Alert>
      )}

      {items === null ? (
        <Stack gap="sm">
          <Skeleton height={96} radius="md" />
          <Skeleton height={96} radius="md" />
        </Stack>
      ) : !supported ? (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Stack align="center" gap="sm">
            <IconFolderOpen size={32} opacity={0.6} />
            <Text fw={500}>Guardado no disponible en este entorno</Text>
            <Text size="sm" c="dimmed" maw={520}>
              Cuando uses Overlayer como app de escritorio, las sesiones sobre carpetas se guardan
              aquí de forma automática.
            </Text>
          </Stack>
        </Paper>
      ) : items.length === 0 ? (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Stack align="center" gap="sm">
            <IconPhotoPlus size={32} opacity={0.6} />
            <Text fw={500}>Todavía no hay espacios guardados</Text>
            <Text size="sm" c="dimmed" maw={520}>
              Carga una carpeta en el asistente y tu sesión se guardará sola. Así podrás retomarla
              aquí la próxima vez que abras Overlayer.
            </Text>
            <Button
              variant="light"
              leftSection={<IconRefresh size={16} />}
              onClick={() => dispatch({ type: 'setView', view: 'wizard' })}
            >
              Ir al asistente
            </Button>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          {items.map((workspace) => {
            const exported = workspace.photos.filter((p) => p.status === 'exported').length;
            const edited = workspace.photos.filter((p) => p.status !== 'pending').length;
            return (
              <Card key={workspace.id} withBorder radius="md" padding="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                    <Group gap="xs" wrap="nowrap">
                      <IconFolder size={18} opacity={0.7} style={{ flexShrink: 0 }} />
                      <Text fw={600} truncate>
                        {workspace.name}
                      </Text>
                    </Group>
                    <Tooltip label={workspace.folderPath}>
                      <Text size="xs" c="dimmed" truncate>
                        {workspace.folderPath}
                      </Text>
                    </Tooltip>
                    <Text size="xs" c="dimmed">
                      {workspace.photos.length} foto(s) · {edited} editada(s)
                      {exported > 0 ? ` · ${exported} exportada(s)` : ''} · actualizado{' '}
                      {formatStamp(workspace.updatedAt)}
                    </Text>
                    {workspace.lastStep !== 'export' && (
                      <Text size="xs" c="dimmed">
                        Quedó en el paso:{' '}
                        {workspace.lastStep === 'edit'
                          ? 'Editar overlay'
                          : workspace.lastStep === 'review'
                            ? 'Revisar lote'
                            : 'Carga'}
                      </Text>
                    )}
                  </Stack>
                  <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                    <Button
                      leftSection={<IconPlayerPlay size={16} />}
                      onClick={() => void handleResume(workspace.id)}
                    >
                      Reanudar
                    </Button>
                    <Tooltip label="Abrir la carpeta de origen">
                      <Button
                        variant="default"
                        onClick={() => void revealPath(workspace.folderPath)}
                      >
                        <IconFolder size={16} />
                      </Button>
                    </Tooltip>
                    <Tooltip label="Eliminar el espacio guardado">
                      <Button
                        variant="subtle"
                        color="red"
                        onClick={() => setConfirmDelete(workspace)}
                      >
                        <IconTrash size={16} />
                      </Button>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>
            );
          })}
        </Stack>
      )}

      {/* Modal de reanudación: carpeta rota, fotos que faltan o nuevas */}
      <Modal
        opened={resuming !== null}
        onClose={() => setResuming(null)}
        title={resuming === null ? null : `Reanudar "${resuming.workspace.name}"`}
        centered
      >
        {resuming && (
          <Stack gap="sm">
            {resuming.folderError ? (
              <>
                <Alert
                  icon={<IconAlertTriangle size={16} />}
                  color="red"
                  variant="light"
                  title="La carpeta ya no está disponible"
                >
                  El proyecto venía de <b>{resuming.workspace.folderPath}</b>, que hoy no existe o
                  no se puede leer. Es imposible reanudar este espacio: las imágenes se releen de
                  esa carpeta. Puedes eliminarlo de la lista (tus fotos no se borran) o repetir el
                  proceso desde el asistente.
                </Alert>
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    color="red"
                    onClick={() => {
                      const dead = resuming;
                      setResuming(null);
                      if (dead) void handleDelete(dead.workspace);
                    }}
                  >
                    Eliminar espacio
                  </Button>
                  <Button variant="light" onClick={() => setResuming(null)}>
                    Cerrar
                  </Button>
                </Group>
              </>
            ) : (
              <>
                {resuming.missing.length > 0 && (
                  <Alert
                    icon={<IconAlertTriangle size={16} />}
                    color="yellow"
                    variant="light"
                    title={`${resuming.missing.length} foto(s) ya no están en la carpeta`}
                  >
                    <Text size="xs">
                      Se van a omitir (quizás las borraste o moviste fuera):{' '}
                      {nameList(resuming.missing.map((m) => m.fileName))}.
                    </Text>
                  </Alert>
                )}
                {resuming.newFiles.length > 0 && (
                  <Alert
                    icon={<IconCheck size={16} />}
                    color="blue"
                    variant="light"
                    title={`${resuming.newFiles.length} foto(s) nuevas en la carpeta`}
                  >
                    <Text size="xs">
                      No estaban cuando guardaste: {nameList(resuming.newFiles)}.
                    </Text>
                  </Alert>
                )}
                {resuming.moved.length > 0 && (
                  <Text size="xs" c="dimmed">
                    {resuming.moved.length} foto(s) cambiaron de nombre dentro de la carpeta; se
                    recuperan con su edición y nombres de salida. De todos modos revisa su
                    asignación tras reanudar si renombraste varias con el mismo nombre.
                  </Text>
                )}
                {resuming.newFiles.length > 0 && (
                  <Switch
                    checked={includeNew}
                    onChange={(event) => setIncludeNew(event.currentTarget.checked)}
                    label={`Incluir también las ${resuming.newFiles.length} foto(s) nuevas del lote`}
                    description="Se agregan al final como pendientes de editar, con el overlay común."
                  />
                )}
                {resuming.available.length === 0 && resuming.newFiles.length === 0 && (
                  <Alert color="red" variant="light" icon={<IconAlertTriangle size={16} />}>
                    No queda ninguna foto reanudable en la carpeta.
                  </Alert>
                )}
                <Group justify="flex-end">
                  <Button variant="subtle" onClick={() => setResuming(null)}>
                    Cancelar
                  </Button>
                  <Button
                    disabled={resuming.available.length === 0 && !includeNew}
                    loading={progress !== null}
                    onClick={() => void doResume(resuming, includeNew)}
                  >
                    Reanudar con {resuming.available.length + (includeNew ? resuming.newFiles.length : 0)}{' '}
                    foto(s)
                  </Button>
                </Group>
                {progress && progress.total > 0 && (
                  <Progress value={(progress.done / progress.total) * 100} animated striped />
                )}
              </>
            )}
          </Stack>
        )}
      </Modal>

      {/* Confirmación de borrado */}
      <Modal
        opened={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Eliminar espacio guardado"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            ¿Eliminar el espacio <b>{confirmDelete?.name}</b> del listado? Solo se borra el registro
            guardado: <b>la carpeta y tus fotos no se tocan</b>.
          </Text>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => confirmDelete && void handleDelete(confirmDelete)}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
