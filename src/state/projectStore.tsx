import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { OverlayTemplate, PhotoAsset, ProjectState } from '../types/overlay';
import { cloneTemplate, photoTemplate } from '../types/overlay';
import { isTauri } from '../tauri/bridge';

export type Step = 'upload' | 'edit' | 'review' | 'export';
/** Vistas principales de la app: asistente o espacios guardados. */
export type View = 'wizard' | 'workspaces';

export interface ProjectStoreState {
  view: View;
  step: Step;
  project: ProjectState | null;
  /** Foto cuya plantilla se está editando (la primera, o una reeditada). */
  editingPhotoId: string | null;
  busy: string | null;
  error: string | null;
  /** Momento (ms) del último autoguardado del espacio de trabajo. */
  workspaceSavedAt: number | null;
  /** Último error de autoguardado (badge honesto en la cabecera). */
  workspaceSaveError: string | null;
}

export type ProjectAction =
  | { type: 'reset' }
  | { type: 'setView'; view: View }
  | { type: 'setProject'; project: ProjectState; step?: Step }
  | { type: 'step'; step: Step }
  | { type: 'editPhoto'; photoId: string }
  | { type: 'setTemplate'; template: OverlayTemplate }
  | { type: 'unlink'; photoId: string }
  | { type: 'relink'; photoId: string }
  | { type: 'renamePhoto'; photoId: string; outputName: string }
  | {
      type: 'renameGroup';
      photoIds: string[];
      baseName: string;
      /** Número inicial de la secuencia (solo si el grupo tiene >1 foto). */
      start: number;
      /** Dígitos de relleno de la secuencia. */
      pad: number;
    }
  | { type: 'applyToAll' }
  | { type: 'syncFolder'; photos: PhotoAsset[] }
  | { type: 'markEdited' }
  | { type: 'setExport'; format?: 'jpeg' | 'png'; quality?: number }
  | { type: 'setExported'; photoIds: string[] }
  | { type: 'busy'; message: string | null }
  | { type: 'error'; message: string | null }
  | { type: 'workspaceSavedAt'; value: number | null }
  | { type: 'workspaceSaveError'; message: string | null };

/** Vista de bienvenida: espacios guardados en escritorio, asistente en web. */
const WELCOME_VIEW: View = isTauri() ? 'workspaces' : 'wizard';

export const initialStoreState: ProjectStoreState = {
  view: WELCOME_VIEW,
  step: 'upload',
  project: null,
  editingPhotoId: null,
  busy: null,
  error: null,
  workspaceSavedAt: null,
  workspaceSaveError: null,
};

function editingPhoto(state: ProjectStoreState): PhotoAsset | null {
  if (!state.project) return null;
  return state.project.photos.find((p) => p.id === state.editingPhotoId) ?? null;
}

/** Copia de la foto marcada como vinculada, descartando `ownTemplate`. */
function asLinked(photo: PhotoAsset): PhotoAsset {
  const copy: PhotoAsset = { ...photo, linked: true };
  delete copy.ownTemplate;
  return copy;
}

function updatePhoto(
  project: ProjectState,
  photoId: string,
  update: (photo: PhotoAsset) => PhotoAsset,
): ProjectState {
  return {
    ...project,
    photos: project.photos.map((p) => (p.id === photoId ? update(p) : p)),
  };
}

export function projectReducer(
  state: ProjectStoreState,
  action: ProjectAction,
): ProjectStoreState {
  switch (action.type) {
    case 'reset':
      // «Nueva sesión» vuelve al paso de carga, no a la portada.
      return { ...initialStoreState, view: 'wizard' };
    case 'setView':
      return { ...state, view: action.view };
    case 'setProject':
      return {
        ...state,
        project: action.project,
        editingPhotoId: action.project.photos[0]?.id ?? null,
        step: action.step ?? 'edit',
        error: null,
        workspaceSavedAt: null,
        workspaceSaveError: null,
      };
    case 'step':
      return { ...state, step: action.step };
    case 'editPhoto':
      return { ...state, editingPhotoId: action.photoId, step: 'edit' };
    case 'setTemplate': {
      if (!state.project) return state;
      const photo = editingPhoto(state);
      if (!photo) return state;
      if (photo.linked) {
        return { ...state, project: { ...state.project, template: action.template } };
      }
      return {
        ...state,
        project: updatePhoto(state.project, photo.id, (p) => ({
          ...p,
          ownTemplate: action.template,
        })),
      };
    }
    case 'unlink': {
      if (!state.project) return state;
      return {
        ...state,
        project: updatePhoto(state.project, action.photoId, (p) =>
          p.linked
            ? { ...p, linked: false, ownTemplate: cloneTemplate(state.project!.template) }
            : p,
        ),
      };
    }
    case 'relink': {
      if (!state.project) return state;
      return {
        ...state,
        project: updatePhoto(state.project, action.photoId, (p) => (p.linked ? p : asLinked(p))),
      };
    }
    case 'renamePhoto': {
      if (!state.project) return state;
      return {
        ...state,
        project: updatePhoto(state.project, action.photoId, (p) => ({
          ...p,
          outputName: action.outputName,
        })),
      };
    }
    case 'renameGroup': {
      if (!state.project) return state;
      const idSet = new Set(action.photoIds);
      // Con una sola foto no se añade secuencia; en grupo, `base-NN`.
      const grouped = action.photoIds.length > 1;
      let seq = 0;
      return {
        ...state,
        project: {
          ...state.project,
          photos: state.project.photos.map((p) => {
            if (!idSet.has(p.id)) return p;
            const outputName = grouped
              ? `${action.baseName}-${String(action.start + seq).padStart(action.pad, '0')}`
              : action.baseName;
            seq += 1;
            return { ...p, outputName };
          }),
        },
      };
    }
    case 'applyToAll': {
      if (!state.project) return state;
      const photo = editingPhoto(state);
      const template = photo ? photoTemplate(state.project, photo) : state.project.template;
      return {
        ...state,
        project: {
          ...state.project,
          template: cloneTemplate(template),
          photos: state.project.photos.map((p) => asLinked(p)),
        },
      };
    }
    case 'syncFolder': {
      // Sincronización de carpeta: reemplaza el lote completo (nuevas al final,
      // quitadas fuera, reemplazadas releídas conservando su meta).
      if (!state.project) return state;
      const ids = new Set(action.photos.map((p) => p.id));
      const editingPhotoId =
        state.editingPhotoId && ids.has(state.editingPhotoId)
          ? state.editingPhotoId
          : action.photos[0]?.id ?? null;
      return { ...state, project: { ...state.project, photos: action.photos }, editingPhotoId };
    }
    case 'markEdited':
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          photos: state.project.photos.map((p) =>
            p.status === 'pending' ? { ...p, status: 'edited' } : p,
          ),
        },
      };
    case 'setExport':
      if (!state.project) return state;
      return {
        ...state,
        project: {
          ...state.project,
          exportFormat: action.format ?? state.project.exportFormat,
          jpegQuality: action.quality ?? state.project.jpegQuality,
        },
      };
    case 'setExported': {
      if (!state.project) return state;
      const ids = new Set(action.photoIds);
      return {
        ...state,
        project: {
          ...state.project,
          photos: state.project.photos.map((p) =>
            ids.has(p.id) ? { ...p, status: 'exported' } : p,
          ),
        },
      };
    }
    case 'busy':
      return { ...state, busy: action.message };
    case 'error':
      return { ...state, error: action.message };
    case 'workspaceSavedAt':
      return { ...state, workspaceSavedAt: action.value, workspaceSaveError: null };
    case 'workspaceSaveError':
      return { ...state, workspaceSaveError: action.message };
    default:
      return state;
  }
}

interface ProjectStoreValue {
  state: ProjectStoreState;
  dispatch: Dispatch<ProjectAction>;
}

const ProjectStoreContext = createContext<ProjectStoreValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(projectReducer, initialStoreState);
  return (
    <ProjectStoreContext.Provider value={{ state, dispatch }}>
      {children}
    </ProjectStoreContext.Provider>
  );
}

export function useProjectStore(): ProjectStoreValue {
  const value = useContext(ProjectStoreContext);
  if (!value) throw new Error('useProjectStore debe usarse dentro de ProjectProvider');
  return value;
}

/** Foto activa + plantilla vigente derivadas del store. */
export function useEditingContext(): {
  photo: PhotoAsset | null;
  template: OverlayTemplate | null;
  isLinked: boolean;
} {
  const { state } = useProjectStore();
  if (!state.project || !state.editingPhotoId) return { photo: null, template: null, isLinked: true };
  const photo = state.project.photos.find((p) => p.id === state.editingPhotoId) ?? null;
  if (!photo) return { photo: null, template: null, isLinked: true };
  return {
    photo,
    template: photoTemplate(state.project, photo),
    isLinked: photo.linked,
  };
}
