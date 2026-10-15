import { useState } from 'react';
import {
  Badge,
  Button,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconLink,
  IconPhoto,
  IconPencil,
  IconUnlink,
  IconZip,
} from '@tabler/icons-react';
import { PhotoPreview } from './PhotoPreview';
import { useProjectStore } from '../../state/projectStore';
import type { PhotoAsset, PhotoStatus, ProjectState } from '../../types/overlay';
import { photoTemplate } from '../../types/overlay';

const STATUS_META: Record<PhotoStatus, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'gray' },
  edited: { label: 'Editada', color: 'blue' },
  exported: { label: 'Exportada', color: 'green' },
};

function PhotoCard({ project, photo }: { project: ProjectState; photo: PhotoAsset }) {
  const { dispatch } = useProjectStore();
  const status = STATUS_META[photo.status];

  return (
    <Paper withBorder p="sm" radius="md" shadow="xs">
      <PhotoPreview photo={photo} template={photoTemplate(project, photo)} />
      <Stack gap={6} mt={8}>
        <Group justify="space-between" wrap="nowrap" gap={4}>
          <Text size="sm" fw={500} truncate title={photo.fileName}>
            {photo.fileName}
          </Text>
          <Tooltip label={photo.linked ? 'Vinculada a la plantilla común' : 'Edición individual'}>
            <Text size="sm">{photo.linked ? '🔗' : '🔓'}</Text>
          </Tooltip>
        </Group>
        <Group gap={4}>
          <Badge size="xs" color={status.color} variant="light">
            {status.label}
          </Badge>
          <Badge size="xs" color={photo.linked ? 'blue' : 'grape'} variant="light">
            {photo.linked ? 'Vinculada' : 'Individual'}
          </Badge>
        </Group>
        <Group gap={4}>
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
              <Button
                size="compact-xs"
                variant="default"
                leftSection={<IconUnlink size={12} />}
                onClick={() => {
                  dispatch({ type: 'unlink', photoId: photo.id });
                  notifications.show({
                    color: 'grape',
                    message: `${photo.fileName} ahora se edita por separado.`,
                    autoClose: 2500,
                  });
                }}
              >
                Desvincular
              </Button>
            </Tooltip>
          ) : (
            <Tooltip label="Descartar la edición propia y volver a la plantilla común">
              <Button
                size="compact-xs"
                variant="default"
                leftSection={<IconLink size={12} />}
                onClick={() => dispatch({ type: 'relink', photoId: photo.id })}
              >
                Revertir
              </Button>
            </Tooltip>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

export function Dashboard() {
  const { state, dispatch } = useProjectStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
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
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <IconPhoto size={18} />
          <Text fw={600}>
            {project.photos.length} foto{project.photos.length === 1 ? '' : 's'} en el lote
          </Text>
          <Badge variant="light" color="blue">
            {linked} vinculadas
          </Badge>
          <Badge variant="light" color="grape">
            {individual} individual{individual === 1 ? '' : 'es'}
          </Badge>
          {exported > 0 && (
            <Badge variant="light" color="green">
              {exported} exportadas
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <Button
            variant="light"
            onClick={() => setConfirmOpen(true)}
            disabled={project.photos.length === 0}
          >
            Aplicar esta edición a todas
          </Button>
          <Button
            leftSection={<IconZip size={16} />}
            onClick={() => {
              dispatch({ type: 'markEdited' });
              dispatch({ type: 'step', step: 'export' });
            }}
          >
            Exportar
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 3, lg: 4 }} spacing="md">
        {project.photos.map((photo) => (
          <PhotoCard key={photo.id} project={project} photo={photo} />
        ))}
      </SimpleGrid>

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
    </Stack>
  );
}
