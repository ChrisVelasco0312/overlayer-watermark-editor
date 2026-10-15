import { useState } from 'react';
import {
  ActionIcon,
  Group,
  Modal,
  Stack,
  Stepper,
  Text,
  Title,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconDownload,
  IconHelpCircle,
  IconLayoutDashboard,
  IconMoonStars,
  IconSun,
} from '@tabler/icons-react';
import { useProjectStore, type Step } from '../state/projectStore';

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Carga' },
  { id: 'edit', label: 'Editar overlay' },
  { id: 'review', label: 'Revisar lote' },
  { id: 'export', label: 'Exportar' },
];

export function Header() {
  const { state, dispatch } = useProjectStore();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const [helpOpen, setHelpOpen] = useState(false);
  const active = STEPS.findIndex((s) => s.id === state.step);
  const hasProject = Boolean(state.project);
  const isDark = colorScheme === 'dark';

  const goTo = (step: Step) => dispatch({ type: 'step', step });

  return (
    <header
      style={{
        background: 'var(--app-surface)',
        padding: '10px 20px 16px',
        borderBottom: '1px solid var(--app-surface-border)',
      }}
    >
      <Group justify="space-between" wrap="wrap" mb={6}>
        <Title order={4}>Overlayer - Editor de marcas de agua</Title>
        <Group gap={6}>
          <Tooltip label={isDark ? 'Tema claro' : 'Tema oscuro'}>
            <ActionIcon
              variant="default"
              onClick={toggleColorScheme}
              aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              <IconSun size={18} style={{ display: isDark ? 'block' : 'none' }} />
              <IconMoonStars size={18} style={{ display: isDark ? 'none' : 'block' }} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Dashboard del lote">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!hasProject}
              onClick={() => goTo('review')}
              aria-label="Volver al dashboard"
            >
              <IconLayoutDashboard size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Exportar">
            <ActionIcon
              variant="subtle"
              color="gray"
              disabled={!hasProject}
              onClick={() => goTo('export')}
              aria-label="Exportar"
            >
              <IconDownload size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Ayuda">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={() => setHelpOpen(true)}
              aria-label="Ayuda"
            >
              <IconHelpCircle size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      <Stepper
        active={Math.max(0, active)}
        onStepClick={(index) => {
          if (!hasProject || index === 0) return;
          goTo(STEPS[index].id);
        }}
        allowNextStepsSelect={hasProject}
        orientation="horizontal"
        size="sm"
      >
        {STEPS.map((step) => (
          <Stepper.Step key={step.id} label={step.label} />
        ))}
      </Stepper>

      <Modal opened={helpOpen} onClose={() => setHelpOpen(false)} title="Cómo funciona Overlayer" centered>
        <Stack gap="xs">
          <Text size="sm">
            1. <b>Carga</b> una foto, varias o una carpeta completa (también puedes arrastrarlas).
          </Text>
          <Text size="sm">
            2. La <b>primera foto</b> se edita con un overlay por defecto: logo arriba-izquierda y
            texto amarillo abajo-derecha. Mueve, escala y rota cada elemento; doble clic alterna
            escala ↔ rotación.
          </Text>
          <Text size="sm">
            3. En el <b>dashboard</b> aplicas la edición a todo el lote, o desvinculas fotos
            para editarlas por separado (y puedes revertirlas).
          </Text>
          <Text size="sm">
            4. <b>Exporta</b> como .zip (carpeta) o en archivos sueltos, en JPEG o PNG.
          </Text>
          <Text size="sm" c="dimmed">
            Atajos: Ctrl+Z / Ctrl+Shift+Z (deshacer/rehacer), Supr (eliminar elemento).
          </Text>
        </Stack>
      </Modal>
    </header>
  );
}
