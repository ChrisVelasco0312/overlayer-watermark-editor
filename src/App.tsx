import { useEffect, useState } from 'react';
import { MantineProvider, Progress } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { Container } from '@mantine/core';
import { theme } from './theme';
import { ProjectProvider, useProjectStore } from './state/projectStore';
import { Header } from './components/Header';
import { StepUpload } from './components/Wizard/StepUpload';
import { StepEditor } from './components/Wizard/StepEditor';
import { StepExport } from './components/Wizard/StepExport';
import { Dashboard } from './components/Dashboard/Dashboard';
import { isTauri } from './tauri/bridge';
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

function Shell() {
  const { state } = useProjectStore();
  const showUpload = state.step === 'upload' || !state.project;

  return (
    <div className="app-shell">
      <Header />
      {state.busy && <Progress value={100} animated striped radius={0} />}
      <Container size="xl" w="100%" pt="xl" pb="lg" className="app-content">
        {showUpload ? (
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
    <MantineProvider theme={theme}>
      <Notifications position="top-right" />
      <LayoutDiagnostics />
      <ProjectProvider>
        <Shell />
      </ProjectProvider>
    </MantineProvider>
  );
}
