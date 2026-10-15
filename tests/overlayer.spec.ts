import { test, expect, type Page } from '@playwright/test';

/** Cuenta píxeles rojizos en la esquina inferior derecha (donde va el texto). */
async function countRedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return -1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    const { width, height } = canvas;
    const x = Math.floor(width * 0.55);
    const y = Math.floor(height * 0.45);
    const w = Math.floor(width * 0.45);
    const h = Math.floor(height * 0.55);
    const data = ctx.getImageData(x, y, w, h).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (r > 190 && g < 90 && b < 90) count += 1;
    }
    return count;
  });
}

test('flujo completo: carga → editor → dashboard → exportación', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // ── Paso 1: carga ──
  await page.goto('/');
  await expect(page).toHaveTitle(/Overlayer/);
  await expect(
    page.getByText('Overlayer - Editor de marcas de agua'),
  ).toBeVisible();
  await expect(
    page.getByText('Arrastra aquí la foto o fotos, o busca la carpeta en el sistema de archivos'),
  ).toBeVisible();
  await page.screenshot({ path: 'output/01-upload.png', fullPage: true });

  // Cargar foto por el diálogo (input nativo creado al pulsar).
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Seleccionar archivos' }).click(),
  ]);
  await chooser.setFiles('public/logo_transparent.png');

  // ── Paso 2: edición ──
  await page.waitForSelector('canvas', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Revisar lote', exact: true })).toBeVisible();
  await page.waitForTimeout(1200);

  // Overlay por defecto: logo + texto (capas visibles).
  await expect(page.getByRole('button', { name: 'Texto' })).toBeVisible();
  await page.screenshot({ path: 'output/02-editor-default.png', fullPage: true });

  // Seleccionar la capa de texto y cambiar el color.
  await page.getByText('Overlayer', { exact: true }).first().click();
  await expect(page.getByText('Propiedades')).toBeVisible();

  const before = await countRedPixels(page);
  const colorInput = page.getByLabel('Color', { exact: true });
  await expect(colorInput).toBeVisible();
  await colorInput.fill('#ff2244');
  await colorInput.blur();
  await page.waitForTimeout(600);
  const after = await countRedPixels(page);
  expect(after).toBeGreaterThan(before);
  await page.screenshot({ path: 'output/03-editor-color-changed.png', fullPage: true });

  // Deshacer (Ctrl+Z) vuelve al amarillo original.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(400);
  const undone = await countRedPixels(page);
  expect(undone).toBeLessThan(after);
  await page.screenshot({ path: 'output/04-editor-undo.png', fullPage: true });

  // ── Paso 3: dashboard / lote ──
  await page.getByRole('button', { name: 'Revisar lote', exact: true }).click();
  await expect(page.getByText('Aplicar esta edición a todas')).toBeVisible();
  await expect(page.getByText('1 foto en el lote')).toBeVisible();
  await page.waitForTimeout(2500); // previews con debounce
  await page.screenshot({ path: 'output/05-dashboard.png', fullPage: true });

  // Desvincular → Individual; Revertir → Vinculada.
  await page.getByRole('button', { name: 'Desvincular' }).click();
  await expect(page.getByText('Individual').first()).toBeVisible();
  await page.screenshot({ path: 'output/06-dashboard-unlinked.png', fullPage: true });
  await page.getByRole('button', { name: 'Revertir' }).click();
  await expect(page.getByText('Vinculada').first()).toBeVisible();

  // ── Paso 4: exportación ──
  await page
    .getByRole('button', { name: 'Exportar' })
    .last()
    .click();
  await expect(page.getByText('Formato de salida')).toBeVisible();
  await page.screenshot({ path: 'output/07-export.png', fullPage: true });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar \d+ foto/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^overlayer_.*\.jpg$/);

  await expect(page.getByText(/imagen\(es\) descargadas/)).toBeVisible();
  await page.screenshot({ path: 'output/08-export-done.png', fullPage: true });

  expect(pageErrors, `Errores de página: ${pageErrors.join(' | ')}`).toEqual([]);
});
