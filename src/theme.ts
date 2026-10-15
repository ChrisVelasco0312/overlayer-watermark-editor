import { createTheme, localStorageColorSchemeManager } from '@mantine/core';

/** Gestor del esquema de color, persistido en localStorage. */
export const colorSchemeManager = localStorageColorSchemeManager({
  key: 'overlayer-color-scheme',
});

/** Tema base: hereda el look de site-survey-gen (Mantine por defecto) + Roboto. */
export const theme = createTheme({
  primaryColor: 'teal',
  fontFamily: 'Roboto, Arial, sans-serif',
  headings: { fontFamily: 'Roboto, Arial, sans-serif', fontWeight: '700' },
  defaultRadius: 'md',
  colors: {
    // Acento amarillo heredado de la estética de marca de agua.
    gold: ['#fffbe6', '#fff3bf', '#ffec99', '#ffe066', '#ffd43b', '#fcc419', '#f5b800', '#e6a700', '#d99a00', '#cc8f00'],
  },
});
