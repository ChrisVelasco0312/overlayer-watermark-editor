import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import type { OverlayTemplate, PhotoAsset, ProjectState } from '../types/overlay';
import { cloneTemplate, photoTemplate } from '../types/overlay';

export type Step = 'upload' | 'edit' | 'review' | 'export';

export interface ProjectStoreState {
  step: Step;
  project: ProjectState | null;
  /** Foto cuya plantilla se está editando (la primera, o una reeditada). */
  editingPhotoId: string | null;
  busy: string | null;
  error: string | null;
}

export type ProjectAction =
  | { type: 'reset' }
  | { type: 'setProject'; project: ProjectState }
  | { type: 'step'; step: Step }
  | { type: 'editPhoto'; photoId: string }
  | { type: 'setTemplate'; template: OverlayTemplate }
  | { type: 'unlink'; photoId: string }
  | { type: 'relink'; photoId: string }
  | { type: 'applyToAll' }
  | { type: 'markEdited' }
  | { type: 'setExport'; format?: 'jpeg' | 'png'; quality?: number }
  | { type: 'setExported'; photoIds: string[] }
  | { type: 'busy'; message: string | null }
  | { type: 'error'; message: string | null };

export const initialStoreState: ProjectStoreState = {
  step: 'upload',
  project: null,
  editingPhotoId: null,
  busy: null,
  error: null,
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
      return { ...initialStoreState };
    case 'setProject':
      return {
        ...state,
        project: action.project,
        editingPhotoId: action.project.photos[0]?.id ?? null,
        step: 'edit',
        error: null,
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
