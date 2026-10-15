# Tauri icons

This folder is intentionally empty in the scaffold. Tauri's bundler expects icon files here.

Generate the full set from the project logo:

```bash
npm run tauri icon public/logo_transparent.png
```

That command creates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico`,
plus the Windows Store and Android/iOS variants referenced by `tauri.conf.json`.
