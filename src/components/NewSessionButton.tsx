import { useState } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useProjectStore } from '../state/projectStore';

interface NewSessionButtonProps {
  variant?: 'default' | 'subtle' | 'light';
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Punto de entrada para empezar desde cero (otra carpeta u otras fotos).
 * La sesión en memoria se descarta; los espacios guardados no se tocan.
 */
export function NewSessionButton({ variant = 'default', size = 'sm' }: NewSessionButtonProps) {
  const { state, dispatch } = useProjectStore();
  const [confirming, setConfirming] = useState(false);
  const project = state.project;
  const filesOnly = project?.sourceKind === 'files';

  const start = () => {
    setConfirming(false);
    dispatch({ type: 'reset' });
  };

  // Sin proyecto activo no hay nada que confirmar: directo a la carga.
  const handleClick = () => {
    if (!project) {
      start();
      return;
    }
    setConfirming(true);
  };

  return (
    <>
      <Button variant={variant} size={size} leftSection={<IconPlus size={16} />} onClick={handleClick}>
        Nueva sesión
      </Button>
      <Modal
        opened={confirming}
        onClose={() => setConfirming(false)}
        title="Empezar una sesión nueva"
        centered
      >
        <Stack gap="sm">
          {filesOnly ? (
            <Text size="sm">
              La sesión actual es de <b>fotos sueltas</b>: se cerrará y <b>no queda guardada</b>.
              Después podrás cargar otra carpeta u otras fotos desde cero.
            </Text>
          ) : (
            <Text size="sm">
              La sesión actual de la carpeta ya quedó guardada en «Espacios guardados»; <b>no se
              pierde nada</b>. Podrás reanudarla cuando quieras, y la nueva carpeta creará su
              propio espacio.
            </Text>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={start}>
              Sesión nueva
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
