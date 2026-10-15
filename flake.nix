{
  description = "Entorno de desarrollo para Overlayer - Editor de marcas de agua (React + TypeScript + Tauri)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # nixpkgs registra un hash de `pnpmDeps` que no coincide con el que produce
        # esta máquina (hash mismatch en el FOD typescript-language-server-pnpm-deps).
        # Se corrige localmente con el hash "got" real.
        typescript-language-server-fixed = pkgs.typescript-language-server.overrideAttrs (old: {
          pnpmDeps = old.pnpmDeps.overrideAttrs (_: {
            outputHash = "sha256-xR/EF60lVBsITKgH7wCM2wHM46PFQevD51KfCENSUH4=";
          });
        });
        # Dependencias nativas que Tauri v2 necesita en Linux (WebKitGTK 4.1).
        tauriNativeDeps = with pkgs; [
          webkitgtk_4_1
          gtk3
          libsoup_3
          glib
          cairo
          pango
          gdk-pixbuf
          librsvg
          libayatana-appindicator
          openssl
          pkg-config
        ];
        # Chromium de nixpkgs (rpath resuelto) para tests E2E con Playwright.
        playwrightBrowsers = pkgs.playwright-driver.browsers;
        chromiumRev =
          (builtins.head
            (builtins.filter (x: x.name == "chromium")
              (builtins.fromJSON (builtins.readFile "${pkgs.playwright-driver}/browsers.json")).browsers)).revision;
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # Frontend
            nodejs_22
            typescript-language-server-fixed

            # Backend / Tauri
            rustc
            cargo
            clippy
            rustfmt

            # Tests E2E
            playwrightBrowsers

            # Utilidades de entorno
            direnv
          ] ++ tauriNativeDeps;

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            export PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH="${playwrightBrowsers}/chromium-${chromiumRev}/chrome-linux64/chrome"

            # Compatibilidad WebKit en NixOS: evita pantallas negras / crashes
            # en GPUs Nvidia.
            export WEBKIT_DISABLE_COMPOSITING_MODE=1
            export WEBKIT_DISABLE_DMABUF_RENDERER=1
            # WebKitGTK + Wayland + Nvidia provoca "Error 71 (Protocol error)
            # dispatching to Wayland display" y DPR incorrecto (1/96);
            # forzamos XWayland.
            export GDK_BACKEND=x11

            # GIO busca los schemas GSettings en <dataDir>/glib-2.0/schemas,
            # pero nixpkgs los instala en share/gsettings-schemas/<name>/...
            # (el hook de glib los lista en GSETTINGS_SCHEMAS_PATH). Sin esto,
            # el file chooser GTK crashea con
            # "No GSettings schemas are installed on the system".
            export GSETTINGS_SCHEMA_DIR="$(echo "$GSETTINGS_SCHEMAS_PATH" | tr ':' '\n' | while IFS= read -r d; do printf '%s/glib-2.0/schemas:' "$d"; done | sed 's/:$//')"

            echo "Entorno Overlayer listo."
            echo "  Node:  $(node --version)"
            echo "  Cargo: $(cargo --version)"
            echo
            echo "Ejecuta 'npm install' una vez y luego:"
            echo "  npm run tauri:dev     # app de escritorio en modo desarrollo"
            echo "  npm run dev           # solo frontend (http://localhost:1420)"
          '';
        };
      }
    );
}
