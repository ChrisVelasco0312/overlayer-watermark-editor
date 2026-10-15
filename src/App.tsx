import { useEffect, useMemo, useRef } from 'react';
import { MantineProvider, Progress } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { Container } from '@mantine/core';
import { theme, colorSchemeManager } from './theme';
import { ProjectProvider, useProjectStore } from './state/projectStore';
import { Header } from './components/Header';
import { StepUpload } from './components/Wizard/StepUpload';
import { StepEditor } from './components/Wizard/StepEditor';
import { StepExport } from './components/Wizard/StepExport';
import { Dashboard } from './components/Dashboard/Dashboard';
import { WorkspacesPage } from './components/Workspaces/WorkspacesPage';
import { isTauri } from './tauri/bridge';
import { saveWorkspace } from './core/workspaces';

/** Autoguardado del espacio de trabajo (solo lotes basados en carpeta + Tauri). */
const AUTOSAVE_DELAY = 900;

function useWorkspaceAutosave() {
  const { state, dispatch } = useProjectStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastNotice = useRef(0);

  // Clave de cambios: sin `workingSrc` (data URLs pesadas) para que el
  // stringify sea barato aunque el lote tenga cientos de fotos.
  const projectKey = useMemo(() => {
    const project = state.project;
    if (!project || project.sourceKind !== 'folder') return '';
    const compact = {
      ...project,
      photos: project.photos.map((p) => ({
        id: p.id,
        sourcePath: p.sourcePath,
        fileName: p.fileName,
        outputName: p.outputName,
        width: p.width,
        height: p.height,
        status: p.status,
        linked: p.linked,
        ownTemplate: p.ownTemplate,
      })),
    };
    return JSON.stringify(compact);
  }, [state.project]);

  useEffect(() => {
    const current = stateRef.current;
    if (projectKey === '') return; // sin proyecto de carpeta (o entorno web)
    const project = current.project;
    if (!isTauri() || !project) return;
    const timer = window.setTimeout(() => {
      saveWorkspace(project, current.step)
        .then(() => dispatch({ type: 'workspaceSavedAt', value: Date.now() }))
        .catch((error) => {
          // Nunca en silencio: el usuario debe saber que su sesión no se guardó.
          const message = error instanceof Error ? error.message : String(error);
          dispatch({ type: 'workspaceSaveError', message });
          const now = Date.now();
          if (now - lastNotice.current > 15000) {
            lastNotice.current = now;
            notifications.show({
              color: 'red',
              title: 'No se pudo guardar la sesión',
              message: `${message} — tus fotos están a salvo, pero reanudar exigirá repetir pasos.`,
              autoClose: 12000,
            });
          }
        });
    }, AUTOSAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [projectKey, state.step, dispatch]);
}

function Shell() {
  useWorkspaceAutosave();
  const { state } = useProjectStore();
  const onWizard = state.view === 'wizard';
  const showUpload = onWizard && (state.step === 'upload' || !state.project);

  return (
    <div className="app-shell">
      <Header />
      {state.busy && <Progress value={100} animated striped radius={0} />}
      <Container size="xl" w="100%" pt="xl" pb="lg" className="app-content">
        {!onWizard ? (
          <WorkspacesPage />
        ) : showUpload ? (
          <StepUpload />
        ) : state.step === 'edit' ? (
          <StepEditor />
        ) : state.step === 'review' ? (
          <Dashboard />
        ) : (
          <StepExport />
        )}
      </Container>
    </div>
  );
}

export function App() {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
    >
      <Notifications position="top-right" />
      <ProjectProvider>
        <Shell />
      </ProjectProvider>
    </MantineProvider>
  );
}
