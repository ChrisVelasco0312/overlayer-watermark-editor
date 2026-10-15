import { useEffect, useMemo, useRef, useState } from 'react';
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
import { invoke } from '@tauri-apps/api/core';

const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

function LayoutDiagnostics() {
  const [details, setDetails] = useState('Measuring layout…');

  useEffect(() => {
    if (!isTauri() || !isDev) return;

    const measure = () => {
      const widthOf = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        return element ? Math.round(element.getBoundingClientRect().width) : 'missing';
      };
      const rootStyle = getComputedStyle(document.documentElement);
      setDetails([
        `viewport ${window.innerWidth}×${window.innerHeight} · DPR ${window.devicePixelRatio}`,
        `root ${widthOf('#root')} · content ${widthOf('.app-content')}`,
        `upload ${widthOf('.upload-layout')} · card ${widthOf('.upload-dropzone')}`,
        `font ${rootStyle.fontSize} · zoom ${rootStyle.getPropertyValue('zoom') || 'normal'}`,
      ].join('\n'));
      if (isDev) {
        document.title = `DIAG ${window.innerWidth}x${window.innerHeight} dpr:${window.devicePixelRatio}`;
      }
      void invoke('log_layout', {
        msg: `viewport ${window.innerWidth}x${window.innerHeight} · dpr ${window.devicePixelRatio} · client w ${document.documentElement.clientWidth}`,
      }).catch(() => undefined);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    const timer = window.setInterval(measure, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  if (!isTauri() || !isDev) return null;

  return (
    <pre
      style={{
        position: 'fixed',
        right: 8,
        bottom: 8,
        zIndex: 99999,
        margin: 0,
        padding: 8,
        borderRadius: 4,
        background: '#171717',
        color: '#a6ff8f',
        font: '12px/1.5 monospace',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      }}
    >
      {details}
    </pre>
  );
}

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
      <LayoutDiagnostics />
      <ProjectProvider>
        <Shell />
      </ProjectProvider>
    </MantineProvider>
  );
}
