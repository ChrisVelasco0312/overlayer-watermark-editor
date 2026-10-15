# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: screenshot.spec.ts >> captures main interface screenshot
- Location: tests/screenshot.spec.ts:5:0

# Error details

```
Error: expect(page).toHaveTitle(expected) failed

Expected pattern: /cv|resume|curriculum vitae/i
Received string:  "Oficina en línea"
Timeout: 5000ms

Call log:
  - Expect "toHaveTitle" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "Oficina en línea"

```

```yaml
- text: ">"
- banner:
  - img "principal"
- text: ¡Bienvenido a Oficina en línea! Un sitio diseñado especialmente para nuestros intermediarios, ingresa y comienza a utilizar todas las herramientas que te ofrecemos.
- button "Tipo de documento"
- text: Número de identificación
- textbox "Número de identificación":
  - /placeholder: ""
- text: Contraseña
- textbox "Contraseña":
  - /placeholder: ""
- link "Olvidé la contraseña":
  - /url: /
- button "Ingresar" [disabled]
- img
- img "superintendencia"
- paragraph: Servicios en línea
- list:
  - listitem:
    - link "Campus HDI":
      - /url: https://campus.hdiseguros.com.co
- paragraph: De tu interés
- list:
  - listitem:
    - link "Financiaya":
      - /url: https://www.hdiseguros.com.co/pagos/financiacion
- paragraph: Otras
- list:
  - listitem:
    - link "Aviso Legal":
      - /url: https://www.hdiseguros.com.co/terminos-ycondiciones-oficina-en-linea
  - listitem:
    - link "Contacto":
      - /url: https://www.hdiseguros.com.co/zona-de-cliente/contactanos
  - listitem:
    - link "Política de privacidad":
      - /url: https://www.hdiseguros.com.co/habeas-data
- img "brand"
- img "brand"
- img "brand"
- img "brand"
- paragraph: Siguenos
- link "facebook":
  - /url: https://www.hdi.com.co/
  - img "facebook"
- link "linkedin":
  - /url: https://www.hdi.com.co/
  - img "linkedin"
- paragraph: Líneas de asistencia
- img "wapp"
- paragraph: Bogotá
- paragraph: 60 1 307 70 50
- img "wapp"
- paragraph: Resto del país
- paragraph: 01 8000 113390
- paragraph: HDI Seguros Colombia S.A.
- paragraph: Copyright © 2026
- img "logoHdiWhite"
- button "whatsapp Hablemos por WhatsApp":
  - img "whatsapp"
  - text: Hablemos por WhatsApp
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const APP_URL = process.env.PLAYWRIGHT_APP_URL || 'http://localhost:3000';
  4  | 
  5  | test('captures main interface screenshot', async ({ page }) => {
  6  |   await page.goto(APP_URL, { waitUntil: 'networkidle' });
  7  |   await page.waitForTimeout(1000);
  8  | 
  9  |   // extra actions injected here
  10 | 
  11 |   await page.screenshot({
  12 |     path: 'screenshots/interface.png',
  13 |     fullPage: true,
  14 |   });
  15 | 
> 16 |   await expect(page).toHaveTitle(/cv|resume|curriculum vitae/i);
     |                     ^ Error: expect(page).toHaveTitle(expected) failed
  17 | });
  18 | 
```