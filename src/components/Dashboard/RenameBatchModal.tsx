import { useEffect, useState } from 'react';
import { Button, Group, Modal, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import { useProjectStore } from '../../state/projectStore';
import type { PhotoAsset } from '../../types/overlay';
import { sanitizeFileName } from '../../core/defaults';

interface RenameBatchModalProps {
  opened: boolean;
  onClose: () => void;
  /** Fotos objetivo, en el orden del lote. */
  photos: PhotoAsset[];
}

/** Renombra un grupo de fotos con un nombre base + secuencia numérica. */
export function RenameBatchModal({ opened, onClose, photos }: RenameBatchModalProps) {
  const { dispatch } = useProjectStore();
  const [baseName, setBaseName] = useState('overlayer');
  const [start, setStart] = useState(1);
  const [pad, setPad] = useState(2);

  useEffect(() => {
    if (opened) {
      setBaseName('overlayer');
      setStart(1);
      setPad(2);
    }
  }, [opened]);

  const clean = sanitizeFileName(baseName) || 'overlayer';
  const grouped = photos.length > 1;
  const preview = photos
    .slice(0, 3)
    .map((_, index) =>
      grouped ? `${clean}-${String(start + index).padStart(pad, '0')}` : clean,
    );
  const more = photos.length > 3 ? ' …' : '';

  const apply = () => {
    dispatch({
      type: 'renameGroup',
      photoIds: photos.map((p) => p.id),
      baseName: clean,
      start,
      pad,
    });
    onClose();
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Renombrar en grupo" centered>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Se aplicará a {photos.length} foto{photos.length === 1 ? '' : 's'}. En un grupo se añade un
          número de secuencia al final del nombre.
        </Text>
        <TextInput
          label="Nombre base"
          value={baseName}
          onChange={(event) => setBaseName(event.currentTarget.value)}
        />
        <Group grow>
          <NumberInput
            label="Número inicial"
            min={0}
            value={start}
            onChange={(value) => setStart(typeof value === 'number' ? value : Number(value) || 0)}
          />
          <NumberInput
            label="Dígitos"
            min={1}
            max={6}
            value={pad}
            onChange={(value) => setPad(typeof value === 'number' ? value : Number(value) || 1)}
            disabled={!grouped}
          />
        </Group>
        {photos.length > 0 && (
          <Text size="xs" c="dimmed">
            Ejemplo: {preview.join(', ')}
            {more}
          </Text>
        )}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={apply} disabled={photos.length === 0}>
            Aplicar a {photos.length}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
