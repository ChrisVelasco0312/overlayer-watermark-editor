# Overlayer - Editor de marcas de agua
# Atajos de desarrollo. Todo se ejecuta dentro del dev shell de Nix (`nix develop`).

install:
	npm install

web:
	npm run dev

dev:
	npm run tauri:dev

build:
	npm run tauri:build

typecheck:
	npm run typecheck

lint:
	npm run lint

clean:
	rm -rf dist src-tauri/target src-tauri/gen

.PHONY: install web dev build typecheck lint clean
