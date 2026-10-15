import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLink,
  IconPhoto,
  IconPencil,
  IconTag,
  IconUnlink,
  IconZip,
} from '@tabler/icons-react';
import { PhotoPreview } from './PhotoPreview';
import { PhotoNameInput } from './PhotoNameInput';
import { RenameBatchModal } from './RenameBatchModal';
import { useProjectStore } from '../../state/projectStore';
import type { PhotoAsset, PhotoStatus, ProjectState } from '../../types/overlay';
import { photoTemplate } from '../../types/overlay';

const STATUS_META: Record<PhotoStatus, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'gray' },
  edited: { label: 'Editada', color: 'blue' },
  exported: { label: 'Exportada', color: 'green' },
};

interface PhotoCardProps {
  project: ProjectState;
  photo: PhotoAsset;
  selected: boolean;
  onToggle: (photoId: string) => void;
}

function PhotoCard({ project, photo, selected, onToggle }: PhotoCardProps) {
  const { dispatch } = useProjectStore();
  const status = STATUS_META[photo.status];

  return (
    <Paper
      withBorder
      p="sm"
      radius="md"
      shadow="xs"
      style={selected ? { borderColor: 'var(--mantine-color-blue-5)' } : undefined}
    >
      <PhotoPreview photo={photo} template={photoTemplate(project, photo)} />
      <Stack gap={6} mt={8}>
        <Group justify="space-between" wrap="nowrap" gap={6}>
          <Checkbox
            size="xs"
            checked={selected}
            onChange={() => onToggle(photo.id)}
            aria-label={`Seleccionar ${photo.fileName}`}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <PhotoNameInput photo={photo} />
          </div>
          <Tooltip label={photo.linked ? 'Vinculada a la plantilla común' : 'Edición individual'}>
            <Text size="sm">{photo.linked ? '🔗' : '🔓'}</Text>
          </Tooltip>
        </Group>
        <Group gap={4} justify="space-between" wrap="nowrap">
          <Badge size="xs" color={status.color} variant="light" style={{ flexShrink: 0 }}>
            {status.label}
          </Badge>
          <Group gap={4} wrap="nowrap">
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconPencil size={12} />}
              onClick={() => dispatch({ type: 'editPhoto', photoId: photo.id })}
            >
              Reeditar
            </Button>
            {photo.linked ? (
              <Tooltip label="Dejar de seguir la plantilla común (la clona)">
                <ActionIcon
                  size="sm"
                  variant="default"
                  aria-label={`Desvincular ${photo.fileName}`}
                  onClick={() => {
                    dispatch({ type: 'unlink', photoId: photo.id });
                    notifications.show({
                      color: 'grape',
                      message: `${photo.fileName} ahora se edita por separado.`,
                      autoClose: 2500,
                    });
                  }}
                >
                  <IconUnlink size={14} />
                </ActionIcon>
              </Tooltip>
            ) : (
              <Tooltip label="Descartar la edición propia y volver a la plantilla común">
                <ActionIcon
                  size="sm"
                  variant="default"
                  aria-label={`Revertir ${photo.fileName}`}
                  onClick={() => {
                    dispatch({ type: 'relink', photoId: photo.id });
                    notifications.show({
                      color: 'teal',
                      message: `${photo.fileName} volvió a la plantilla común.`,
                      autoClose: 2500,
                    });
                  }}
                >
                  <IconLink size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

export function Dashboard() {
  const { state, dispatch } = useProjectStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const project = state.project;

  if (!project) {
    return (
      <Text c="dimmed" ta="center" py="xl">
        Carga un lote para verlo aquí.
      </Text>
    );
  }

  const linked = project.photos.filter((p) => p.linked).length;
  const individual = project.photos.length - linked;
  const exported = project.photos.filter((p) => p.status === 'exported').length;

  const toggleSelected = (photoId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };

  const allSelected =
    project.photos.length > 0 && project.photos.every((p) => selected.has(p.id));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(project.photos.map((p) => p.id)));
  };

  // Renombrar en grupo: la selección o, si no hay ninguna, todo el lote.
  const renameTargets =
    selected.size > 0 ? project.photos.filter((p) => selected.has(p.id)) : project.photos;

  const handleApplyToAll = () => {
    dispatch({ type: 'applyToAll' });
    setConfirmOpen(false);
    notifications.show({
      color: 'green',
      message: 'Edición aplicada a todas las fotos del lote.',
      autoClose: 3000,
    });
  };

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Group gap="xs" wrap="nowrap">
          <IconPhoto size={20} />
          <Title order={4}>Revisar lote</Title>
        </Group>
        <Group gap="xs" wrap="wrap">
          <Text size="sm" c="dimmed">
            {project.photos.length} foto{project.photos.length === 1 ? '' : 's'} en el lote
          </Text>
          <Badge size="sm" variant="light" color="blue">
            {linked} vinculadas
          </Badge>
          <Badge size="sm" variant="light" color="grape">
            {individual} individual{individual === 1 ? '' : 'es'}
          </Badge>
          {exported > 0 && (
            <Badge size="sm" variant="light" color="green">
              {exported} exportadas
            </Badge>
          )}
        </Group>
      </Stack>

      <div className="batch-toolbar">
        <Group gap="sm" wrap="wrap">
          <Checkbox
            size="xs"
            label="Seleccionar todo"
            checked={allSelected}
            indeterminate={someSelected}
            onChange={toggleAll}
          />
          {selected.size > 0 && (
            <Badge size="sm" variant="light" color="blue">
              {selected.size} seleccionada{selected.size === 1 ? '' : 's'}
            </Badge>
          )}
        </Group>
      </div>

      <div className="review-layout">
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 3, lg: 4 }} spacing="md" className="review-grid">
          {project.photos.map((photo) => (
            <PhotoCard
              key={photo.id}
              project={project}
              photo={photo}
              selected={selected.has(photo.id)}
              onToggle={toggleSelected}
            />
          ))}
        </SimpleGrid>

        <aside className="review-rail">
          <div className="review-rail-actions">
            <Button
              variant="light"
              justify="flex-start"
              leftSection={<IconTag size={16} />}
              onClick={() => setRenameOpen(true)}
              disabled={project.photos.length === 0}
            >
              Renombrar{selected.size > 0 ? ` (${selected.size})` : ''}
            </Button>
            <Button
              variant="light"
              justify="flex-start"
              onClick={() => setConfirmOpen(true)}
              disabled={project.photos.length === 0}
            >
              Aplicar esta edición a todas
            </Button>
            <Button
              justify="flex-start"
              leftSection={<IconZip size={16} />}
              onClick={() => {
                dispatch({ type: 'markEdited' });
                dispatch({ type: 'step', step: 'export' });
              }}
            >
              Exportar
            </Button>
          </div>
        </aside>
      </div>

      <Modal
        opened={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Aplicar edición a todas"
        centered
      >
        <Stack gap="sm">
          <Text size="sm">
            La plantilla actual pasará a ser la común y las {project.photos.length} fotos
            quedarán vinculadas. Las ediciones individuales se descartarán.
          </Text>
          <Group justify="flex-end" mt="xs">
            <Button variant="default" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleApplyToAll}>Aplicar a todas</Button>
          </Group>
        </Stack>
      </Modal>

      <RenameBatchModal
        opened={renameOpen}
        onClose={() => setRenameOpen(false)}
        photos={renameTargets}
      />
    </Stack>
  );
}
