import { useEffect, useState } from 'react';
import { TextInput } from '@mantine/core';
import { IconFileText } from '@tabler/icons-react';
import { useProjectStore } from '../../state/projectStore';
import type { PhotoAsset } from '../../types/overlay';
import { defaultOutputName, sanitizeFileName } from '../../core/defaults';

/** Nombre de salida editable de una foto concreta. */
export function PhotoNameInput({ photo }: { photo: PhotoAsset }) {
  const { dispatch } = useProjectStore();
  const [value, setValue] = useState(photo.outputName);

  useEffect(() => setValue(photo.outputName), [photo.outputName]);

  const commit = () => {
    const fallback = photo.outputName || defaultOutputName(photo.fileName);
    const clean = sanitizeFileName(value) || fallback;
    setValue(clean);
    if (clean !== photo.outputName) {
      dispatch({ type: 'renamePhoto', photoId: photo.id, outputName: clean });
    }
  };

  return (
    <TextInput
      size="xs"
      value={value}
      title={`Archivo original: ${photo.fileName}`}
      aria-label={`Nombre de archivo de ${photo.fileName}`}
      leftSection={<IconFileText size={14} />}
      onChange={(event) => setValue(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setValue(photo.outputName);
          event.currentTarget.blur();
        }
      }}
    />
  );
}
