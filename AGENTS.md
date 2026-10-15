# Commands
- Install (NixOS dev shell first): `nix develop` then `npm install`
- Frontend dev server: `npm run dev` (port 1420)
- Desktop dev (Tauri): `npm run tauri:dev`
- Frontend build + type-check: `npm run build`
- Type-check only: `npm run typecheck`
- Lint: `npm run lint`
- Desktop bundle: `npm run tauri:build`
- Generate Tauri icons: `npm run tauri icon public/logo_transparent.png`

# Architecture
- Desktop app: **React 19 + TypeScript + Vite + Tauri v2**.
- UI kit: **Mantine v8** + `@tabler/icons-react` (same stack as `site-survey-gen`).
- Native bridge: Tauri plugins `dialog`, `fs`, `opener`; drag-drop enabled on the main window.
- Overlay engine: Canvas 2D, pure TS (no React), generalized from
  `site-survey-gen/src/utils/watermark.ts`.
- ZIP export: `jszip`. Image compression: `browser-image-compression`
  (`maxSizeMB: 0.5`, `maxWidthOrHeight: 1920`, JPEG).

# Key domain rules
- Default overlay style inherits `site-survey-gen`: yellow text `#FFD700`, black stroke,
  shadow `rgba(0,0,0,0.7)`, Roboto 700. Default placement: logo top-left, text bottom-right.
- The **first** loaded photo is the edit seed; its template is applied to the rest.
- A photo is `linked` (follows the shared template) or unlinked (individual `ownTemplate`).
  Unlink clones the current template; revert discards it.
- Editing the shared template re-renders all linked photos.
- Export: `.zip` when the source was a folder, individual download otherwise.

# Plan / spec
- `docs/spec/overlayer-watermark-editor.md` is the source of truth for UX, data model, and
  milestones. Keep it aligned with implementation.

# Git
- Commit messages: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`), imperative,
  concise. Example: `feat: add overlay canvas selection handles`.
