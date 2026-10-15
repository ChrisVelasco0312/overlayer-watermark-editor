import {
  ActionIcon,
  Box,
  Center,
  ColorInput,
  Divider,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Slider,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconPhoto, IconTrash, IconTypography } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { Id, ImageOverlay, OverlayElement, OverlayTemplate, TextOverlay } from '../../types/overlay';
import {
  DEFAULT_FONT_FAMILY,
  derivedLetterSpacing,
  derivedLineHeight,
  derivedStrokeWidth,
} from '../../core/defaults';

interface OverlayInspectorProps {
  template: OverlayTemplate;
  selectedId: Id | null;
  onSelect: (id: Id | null) => void;
  /** Reemplaza el elemento (commit=true ⇒ guardar en historial). */
  onUpdate: (element: OverlayElement, commit: boolean) => void;
  /** Guarda snapshot en historial (fin de gesto / blur de input). */
  onCommit: () => void;
  onDelete: (id: Id) => void;
}

const FONT_OPTIONS = [
  { value: 'Roboto, Arial, sans-serif', label: 'Roboto' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: 'Impact, sans-serif', label: 'Impact' },
  { value: '"Times New Roman", serif', label: 'Times' },
  { value: '"Courier New", monospace', label: 'Courier' },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
      {children}
    </Text>
  );
}

function ElementLayers({
  template,
  selectedId,
  onSelect,
  onDelete,
}: Pick<OverlayInspectorProps, 'template' | 'selectedId' | 'onSelect' | 'onDelete'>) {
  return (
    <Stack gap={6}>
      <SectionLabel>Capas</SectionLabel>
      {template.elements.length === 0 && (
        <Text size="sm" c="dimmed">
          Sin elementos. Añade texto o una imagen.
        </Text>
      )}
      {template.elements.map((el) => {
        const label = el.name ?? (el.kind === 'text' ? el.text.split('\n')[0] || 'Texto' : 'Imagen');
        const active = el.id === selectedId;
        return (
          <Group
            key={el.id}
            gap={6}
            wrap="nowrap"
            p={6}
            style={{
              borderRadius: 6,
              cursor: 'pointer',
              border: `1px solid ${active ? 'var(--app-accent-border)' : 'var(--mantine-color-default-border)'}`,
              background: active ? 'var(--app-accent-subtle)' : 'transparent',
            }}
            onClick={() => onSelect(el.id)}
          >
            {el.kind === 'text' ? <IconTypography size={15} /> : <IconPhoto size={15} />}
            <Text size="sm" style={{ flex: 1 }} truncate>
              {label}
            </Text>
            <Tooltip label="Eliminar">
              <ActionIcon
                color="red"
                variant="subtle"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(el.id);
                }}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        );
      })}
    </Stack>
  );
}

function CommonFields({
  element,
  onUpdate,
  onCommit,
}: {
  element: OverlayElement;
  onUpdate: (next: OverlayElement, commit: boolean) => void;
  onCommit: () => void;
}) {
  const patch = (values: Partial<OverlayElement>, commit = false) =>
    onUpdate({ ...element, ...values } as OverlayElement, commit);

  return (
    <Stack gap="xs">
      <TextInput
        label="Nombre"
        size="sm"
        value={element.name ?? ''}
        placeholder="Sin nombre"
        onChange={(e) => patch({ name: e.currentTarget.value })}
        onBlur={onCommit}
      />
      <Box>
        <Text size="xs" mb={4}>
          Escala — {element.scale.toFixed(2)}x
        </Text>
        <Slider
          min={0.05}
          max={5}
          step={0.01}
          value={element.scale}
          onChange={(v) => patch({ scale: v })}
          onChangeEnd={(v) => patch({ scale: v }, true)}
        />
      </Box>
      <Box>
        <Text size="xs" mb={4}>
          Rotación — {Math.round((element.rotation * 180) / Math.PI)}°
        </Text>
        <Slider
          min={-180}
          max={180}
          step={1}
          value={Math.round((element.rotation * 180) / Math.PI)}
          onChange={(v) => patch({ rotation: (v * Math.PI) / 180 })}
          onChangeEnd={(v) => patch({ rotation: (v * Math.PI) / 180 }, true)}
        />
      </Box>
      <Box>
        <Text size="xs" mb={4}>
          Opacidad — {Math.round(element.opacity * 100)}%
        </Text>
        <Slider
          min={0.1}
          max={1}
          step={0.05}
          value={element.opacity}
          onChange={(v) => patch({ opacity: v })}
          onChangeEnd={(v) => patch({ opacity: v }, true)}
        />
      </Box>
      <Group grow>
        <Box>
          <Text size="xs" mb={4}>X — {Math.round(element.x * 100)}%</Text>
          <Slider
            min={0}
            max={1}
            step={0.005}
            value={element.x}
            onChange={(v) => patch({ x: v })}
            onChangeEnd={(v) => patch({ x: v }, true)}
          />
        </Box>
        <Box>
          <Text size="xs" mb={4}>Y — {Math.round(element.y * 100)}%</Text>
          <Slider
            min={0}
            max={1}
            step={0.005}
            value={element.y}
            onChange={(v) => patch({ y: v })}
            onChangeEnd={(v) => patch({ y: v }, true)}
          />
        </Box>
      </Group>
      <Switch
        label="Bloquear (no mover en el lienzo)"
        size="sm"
        checked={Boolean(element.locked)}
        onChange={(e) => patch({ locked: e.currentTarget.checked }, true)}
      />
    </Stack>
  );
}

function TextFields({
  element,
  onUpdate,
  onCommit,
}: {
  element: TextOverlay;
  onUpdate: (next: OverlayElement, commit: boolean) => void;
  onCommit: () => void;
}) {
  const patch = (values: Partial<TextOverlay>, commit = false) =>
    onUpdate({ ...element, ...values }, commit);

  const handleFontSize = (value: string | number) => {
    const fontSize = Number(value);
    if (!Number.isFinite(fontSize) || fontSize <= 0) return;
    // Los valores derivados acompañan al tamaño de letra (igual que la spec).
    patch({
      fontSize,
      letterSpacing: derivedLetterSpacing(fontSize),
      lineHeight: derivedLineHeight(fontSize),
      strokeWidth: derivedStrokeWidth(fontSize),
    });
  };

  return (
    <Stack gap="xs">
      <Textarea
        label="Texto"
        autosize
        minRows={2}
        maxRows={6}
        value={element.text}
        onChange={(e) => patch({ text: e.currentTarget.value })}
        onBlur={onCommit}
      />
      <Group grow align="start">
        <ColorInput
          label="Color"
          size="sm"
          value={element.color}
          onChange={(v) => patch({ color: v })}
          onChangeEnd={(v) => patch({ color: v }, true)}
        />
        <ColorInput
          label="Contorno"
          size="sm"
          value={element.strokeColor ?? '#000000'}
          onChange={(v) => patch({ strokeColor: v })}
          onChangeEnd={(v) => patch({ strokeColor: v }, true)}
        />
      </Group>
      <Group grow align="start">
        <Select
          label="Fuente"
          size="sm"
          data={FONT_OPTIONS}
          value={element.fontFamily}
          allowDeselect={false}
          onChange={(v) => patch({ fontFamily: v ?? DEFAULT_FONT_FAMILY }, true)}
        />
        <NumberInput
          label="Tamaño (px)"
          size="sm"
          min={6}
          max={400}
          value={element.fontSize}
          onChange={handleFontSize}
          onBlur={onCommit}
        />
      </Group>
      <Group grow align="start">
        <div>
          <Text size="xs" mb={4}>Peso</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            value={String(element.fontWeight)}
            onChange={(v) => patch({ fontWeight: Number(v) }, true)}
            data={[
              { value: '400', label: 'Normal' },
              { value: '700', label: 'Bold' },
              { value: '900', label: 'Black' },
            ]}
          />
        </div>
        <div>
          <Text size="xs" mb={4}>Alineación</Text>
          <SegmentedControl
            fullWidth
            size="xs"
            value={element.align}
            onChange={(v) => patch({ align: v as TextOverlay['align'] }, true)}
            data={[
              { value: 'left', label: 'Izq' },
              { value: 'center', label: 'Centro' },
              { value: 'right', label: 'Der' },
            ]}
          />
        </div>
      </Group>
      <Box>
        <Text size="xs" mb={4}>Interletrado — {Math.round(element.letterSpacing)}px</Text>
        <Slider
          min={0}
          max={Math.max(20, Math.round(element.fontSize * 0.5))}
          step={1}
          value={element.letterSpacing}
          onChange={(v) => patch({ letterSpacing: v })}
          onChangeEnd={(v) => patch({ letterSpacing: v }, true)}
        />
      </Box>
      <Box>
        <Text size="xs" mb={4}>Interlineado — {Math.round(element.lineHeight)}px</Text>
        <Slider
          min={Math.round(element.fontSize * 0.8)}
          max={Math.max(40, Math.round(element.fontSize * 2.5))}
          step={1}
          value={element.lineHeight}
          onChange={(v) => patch({ lineHeight: v })}
          onChangeEnd={(v) => patch({ lineHeight: v }, true)}
        />
      </Box>
      <Box>
        <Text size="xs" mb={4}>Grosor de contorno — {Math.round(element.strokeWidth ?? 0)}px</Text>
        <Slider
          min={0}
          max={Math.max(20, Math.round(element.fontSize * 0.5))}
          step={1}
          value={element.strokeWidth ?? 0}
          onChange={(v) => patch({ strokeWidth: v })}
          onChangeEnd={(v) => patch({ strokeWidth: v }, true)}
        />
      </Box>
      <Switch
        label="Sombra"
        size="sm"
        checked={Boolean(element.shadow)}
        onChange={(e) =>
          patch(
            {
              shadow: e.currentTarget.checked
                ? { color: 'rgba(0,0,0,0.7)', blur: 2, dx: 2, dy: 2 }
                : undefined,
            },
            true,
          )
        }
      />
      {element.shadow && (
        <Box>
          <Text size="xs" mb={4}>Desenfoque de sombra — {element.shadow.blur}px</Text>
          <Slider
            min={0}
            max={20}
            step={1}
            value={element.shadow.blur}
            onChange={(v) => patch({ shadow: { ...element.shadow!, blur: v } })}
            onChangeEnd={(v) => patch({ shadow: { ...element.shadow!, blur: v } }, true)}
          />
        </Box>
      )}
    </Stack>
  );
}

function ImageFields({
  element,
  onUpdate,
}: {
  element: ImageOverlay;
  onUpdate: (next: OverlayElement, commit: boolean) => void;
}) {
  const patch = (values: Partial<ImageOverlay>, commit = false) =>
    onUpdate({ ...element, ...values }, commit);
  return (
    <Stack gap="xs">
      <Box>
        <Text size="xs" mb={4}>Ancho base — {Math.round(element.width)}px</Text>
        <Slider
          min={20}
          max={1200}
          step={2}
          value={element.width}
          onChange={(v) => patch({ width: v })}
          onChangeEnd={(v) => patch({ width: v }, true)}
        />
      </Box>
      <Text size="xs" c="dimmed">
        Proporción original: {element.naturalWidth}×{element.naturalHeight}
      </Text>
    </Stack>
  );
}

export function OverlayInspector({
  template,
  selectedId,
  onSelect,
  onUpdate,
  onCommit,
  onDelete,
}: OverlayInspectorProps) {
  const element = template.elements.find((el) => el.id === selectedId) ?? null;

  return (
    <Stack gap="sm">
      <ElementLayers
        template={template}
        selectedId={selectedId}
        onSelect={onSelect}
        onDelete={onDelete}
      />
      <Divider />
      {element ? (
        <>
          <SectionLabel>Propiedades</SectionLabel>
          <CommonFields element={element} onUpdate={onUpdate} onCommit={onCommit} />
          <Divider />
          <SectionLabel>{element.kind === 'text' ? 'Texto' : 'Imagen'}</SectionLabel>
          {element.kind === 'text' ? (
            <TextFields element={element} onUpdate={onUpdate} onCommit={onCommit} />
          ) : (
            <ImageFields element={element} onUpdate={onUpdate} />
          )}
        </>
      ) : (
        <Center py="md">
          <Text size="sm" c="dimmed">
            Selecciona un elemento del lienzo para editar sus propiedades
          </Text>
        </Center>
      )}
    </Stack>
  );
}
