import { useCallback, useEffect, useState } from 'react';
import { InspectorPanel } from '../components/panels/InspectorPanel';
import { LayerPanel } from '../components/panels/LayerPanel';
import { StatusBar } from '../components/panels/StatusBar';
import { Toolbar } from '../components/controls/Toolbar';
import { Crosshair } from '../components/controls/Crosshair';
import { VirtualJoysticks } from '../components/controls/VirtualJoysticks';
import { ControlsDialog } from '../components/controls/ControlsDialog';
import { SourcesDialog } from '../components/layers/SourcesDialog';
import { AboutDialog } from '../components/panels/AboutDialog';
import { Toast } from '../components/common/Toast';
import { GlobeView } from '../components/globe/GlobeView';
import { uiStore, useUi } from '../core/state/hooks';
import type { Engine } from '../spatial/rendering/Engine';
import { EngineContext } from './EngineContext';

export function App() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const dialog = useUi((s) => s.dialog);
  const onEngine = useCallback((e: Engine | null) => setEngine(e), []);

  // Header navigation from the shared shell dispatches actions rather than links.
  useEffect(() => {
    const onAction = (e: Event) => {
      const action = (e as CustomEvent<{ action: string }>).detail?.action;
      if (action === 'sources' || action === 'controls' || action === 'about')
        uiStore.set({ dialog: action });
    };
    document.addEventListener('harith-shell-action', onAction);
    return () => document.removeEventListener('harith-shell-action', onAction);
  }, []);

  return (
    <EngineContext.Provider value={engine}>
      <GlobeView onEngine={onEngine} />
      <Crosshair />
      <div className="hud">
        <LayerPanel />
        <InspectorPanel />
        <Toolbar />
        <VirtualJoysticks />
        <StatusBar />
      </div>
      {dialog === 'sources' && <SourcesDialog />}
      {dialog === 'controls' && <ControlsDialog />}
      {dialog === 'about' && <AboutDialog />}
      <Toast />
    </EngineContext.Provider>
  );
}
