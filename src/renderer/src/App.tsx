import { useState, useEffect } from 'react';
import { MainLayout } from './layouts/MainLayout';
import { ViewState } from './components/Sidebar';
import { ConfigurationPanel } from './components/ConfigurationPanel';
import { Storyboard } from './components/Storyboard';
import { LogTerminal } from './components/LogTerminal';

// Mock types until we have real data state
interface DashboardState {
  projectPath: string;
  accountsPath: string;
  isRunning: boolean;
  logs: string[];
  config: {
    duration: string;
    resolution: string;
    delay: number;
    maxConcurrent: number;
  };
  stats: {
    total: number;
    completed: number;
    pending: number;
    failed: number;
  }
  workers: any[];
  scenes: any[];
}

function App() {
  const [currentView, setCurrentView] = useState<ViewState>('dashboard');
  const [state, setState] = useState<DashboardState>({
    projectPath: '',
    accountsPath: '',
    isRunning: false,
    logs: [],
    config: {
      duration: '6s',
      resolution: '720p',
      delay: 30,
      maxConcurrent: 2
    },
    stats: { total: 0, completed: 0, pending: 0, failed: 0 },
    workers: [],
    scenes: []
  });

  // State for collapsible logs
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Persistence: Load settings on mount
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('grok_config');
      const savedPaths = localStorage.getItem('grok_paths');

      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setState(prev => ({ ...prev, config: { ...prev.config, ...parsed } }));
      }
      if (savedPaths) {
        const parsed = JSON.parse(savedPaths);
        setState(prev => ({
          ...prev,
          projectPath: parsed.projectPath || '',
          accountsPath: parsed.accountsPath || ''
        }));
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Persistence: Save config on change
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('grok_config', JSON.stringify({
      duration: state.config.duration,
      resolution: state.config.resolution,
      maxConcurrent: state.config.maxConcurrent
    }));
  }, [state.config.duration, state.config.resolution, state.config.maxConcurrent, isLoaded]);

  // Persistence: Save paths on change
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('grok_paths', JSON.stringify({
      projectPath: state.projectPath,
      accountsPath: state.accountsPath
    }));
  }, [state.projectPath, state.accountsPath, isLoaded]);

  // Setup Listeners
  useEffect(() => {
    window.api.automation.onLog((msg) => {
      setState(prev => ({ ...prev, logs: [...prev.logs, msg] }));
    });

    window.api.automation.onProgress((data) => {
      setState(prev => {
        let newScenes = [...prev.scenes];

        // Update specific scene if provided in data
        if (data.updatedScene) {
          newScenes = newScenes.map(s =>
            s.sceneNumber === data.updatedScene.sceneNumber
              ? { ...s, ...data.updatedScene }
              : s
          );
        }

        return { ...prev, stats: data, scenes: newScenes };
      });
    });

    window.api.automation.onWorkerUpdate((data) => {
      setState(prev => {
        const existing = prev.workers.find(w => w.id === data.id);
        if (existing) {
          // Update existing worker
          const updatedWorkers = prev.workers.map(w => w.id === data.id ? { ...w, ...data } : w);
          return { ...prev, workers: updatedWorkers };
        } else {
          // Add new worker (only if likely valid, or just append)
          return { ...prev, workers: [...prev.workers, data].sort((a, b) => a.id - b.id) };
        }
      });
    });

    window.api.automation.onError((msg) => {
      setState(prev => ({ ...prev, logs: [...prev.logs, `❌ Error: ${msg}`] }));
    });

    return () => {
      window.api.automation.removeAllListeners();
    };
  }, []);

  const handleStart = async () => {
    if (!state.projectPath) return;

    setState(prev => ({ ...prev, isRunning: true, logs: [...prev.logs, '🚀 Validating project...'] }));

    if (!state.accountsPath) {
      setState(prev => ({ ...prev, isRunning: false, logs: [...prev.logs, '❌ Error: No Accounts Folder selected'] }));
      return;
    }

    try {
      // 1. Scan Project
      const { scriptPath, imagesPath, scenes } = await window.api.automation.scanProject(state.projectPath) as any;

      // Initialize scenes with default status
      const initialScenes = scenes.map((s: any) => ({
        ...s,
        status: 'pending' // Default status
      }));

      setState(prev => ({
        ...prev,
        scenes: initialScenes,
        logs: [...prev.logs, `✅ Script: ${scriptPath.split('\\').pop()}`, `✅ Images: ${imagesPath.split('\\').pop()}`, `✅ Loaded ${scenes.length} scenes`]
      }));

      // 2. Init Service
      await window.api.automation.init(state.accountsPath, {
        maxConcurrent: state.config.maxConcurrent,
        outputFolder: state.projectPath,
        duration: state.config.duration,
        resolution: state.config.resolution
      });

      // 3. Start
      await window.api.automation.start(scriptPath, imagesPath);
    } catch (e: any) {
      setState(prev => ({ ...prev, isRunning: false, logs: [...prev.logs, `❌ Error: ${e.message}`] }));
    }
  };

  const handleStop = async () => {
    await window.api.automation.stop();
    setState(prev => ({ ...prev, isRunning: false, logs: [...prev.logs, '🛑 Stopped by user'] }));
  };

  const handleUpdatePrompt = async (scene: any, newPrompt: string) => {
    try {
      const success = await window.api.automation.updatePrompt(state.projectPath, scene.sceneNumber, newPrompt);
      if (success) {
        // Reload project to reflect changes
        const { scenes } = await window.api.automation.scanProject(state.projectPath) as any;
        setState(prev => ({
          ...prev,
          scenes: scenes.map((s: any) => {
            // Preserve status of existing scenes
            const existing = prev.scenes.find(os => os.sceneNumber === s.sceneNumber);
            return existing ? { ...s, status: existing.status, videoPath: existing.videoPath } : { ...s, status: 'pending' };
          }),
          logs: [...prev.logs, `✅ Updated prompt for Scene ${scene.sceneNumber}`]
        }));
      } else {
        setState(prev => ({ ...prev, logs: [...prev.logs, `❌ Failed to update prompt for Scene ${scene.sceneNumber}`] }));
      }
    } catch (e: any) {
      setState(prev => ({ ...prev, logs: [...prev.logs, `❌ Error: ${e.message}`] }));
    }
  };

  const handleRetry = async (scene: any) => {
    if (!state.projectPath || !state.accountsPath) return; // Should be set

    // Reset status for this scene
    setState(prev => ({
      ...prev,
      isRunning: true,
      scenes: prev.scenes.map(s => s.sceneNumber === scene.sceneNumber ? { ...s, status: 'pending', error: undefined } : s)
    }));

    try {
      // Get images path again (hacky, ideally store it)
      // Get images path again (hacky, ideally store it)
      // actually better to rely on scanProject or store it in state. 
      // stored in state? No. 
      // Let's re-use logic from handleStart or just assume standard structure.
      // standard structure: project/image

      const { scriptPath, imagesPath: validImagesPath } = await window.api.automation.scanProject(state.projectPath) as any;

      await window.api.automation.retry(scriptPath, validImagesPath, [scene.sceneNumber]);
    } catch (e: any) {
      setState(prev => ({ ...prev, isRunning: false, logs: [...prev.logs, `❌ Retry Error: ${e.message}`] }));
    }
  };

  const handleRetryFailed = async () => {
    const failedScenes = state.scenes.filter(s => s.status === 'failed').map(s => s.sceneNumber);
    if (failedScenes.length === 0) return;

    setState(prev => ({
      ...prev,
      isRunning: true,
      scenes: prev.scenes.map(s => failedScenes.includes(s.sceneNumber) ? { ...s, status: 'pending', error: undefined } : s)
    }));

    try {
      const { scriptPath, imagesPath } = await window.api.automation.scanProject(state.projectPath) as any;
      await window.api.automation.retry(scriptPath, imagesPath, failedScenes);
    } catch (e: any) {
      setState(prev => ({ ...prev, isRunning: false, logs: [...prev.logs, `❌ Retry Error: ${e.message}`] }));
    }
  };

  return (
    <MainLayout currentView={currentView} onViewChange={setCurrentView}>
      <div className="flex h-full gap-6 max-w-[98vw] mx-auto overflow-hidden">

        {/* LEFT COLUMN: Settings & Controls (300px fixed) */}
        <div className="w-[300px] flex-shrink-0 flex flex-col">
          <ConfigurationPanel
            projectPath={state.projectPath}
            onProjectSelect={(path) => {
              setState(prev => ({
                ...prev,
                projectPath: path,
              }));
            }}
            accountsPath={state.accountsPath}
            onAccountsSelect={(path) => setState(prev => ({ ...prev, accountsPath: path }))}
            config={state.config}
            onConfigChange={(key, value) => setState(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))}
            isRunning={state.isRunning}
            onStart={handleStart}
            onStop={handleStop}
            className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-6 flex-1 shadow-2xl overflow-y-auto"
          />
        </div>

        {/* RIGHT COLUMN: Storyboard & Visualization */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 h-full">
          {/* Stats Bar - Compact- */}
          <div className="flex gap-4">
            <div className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Total</span>
              <span className="text-xl font-mono text-white leading-none">{state.stats.total}</span>
            </div>
            <div className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Done</span>
              <span className="text-xl font-mono text-green-400 leading-none">{state.stats.completed}</span>
            </div>
            <div className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Pending</span>
              <span className="text-xl font-mono text-amber-400 leading-none">{state.stats.pending}</span>
            </div>
            <div className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between group relative">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Failed</span>
              <div className="flex items-center gap-3">
                <span className="text-xl font-mono text-red-400 leading-none">{state.stats.failed}</span>
                {state.stats.failed > 0 && !state.isRunning && (
                  <button
                    onClick={handleRetryFailed}
                    className="p-1 rounded bg-red-500/20 hover:bg-red-500/40 text-red-400 transition-colors"
                    title="Retry All Failed"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Storyboard / Worker Grid - Main Focus */}
          <div className="flex-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col min-h-0">
            <Storyboard
              scenes={state.scenes}
              workers={state.workers}
              stats={state.stats}
              className="flex-1 min-h-0"
              onEdit={handleUpdatePrompt}
              onRetry={handleRetry}
            />
          </div>

          {/* Log Terminal (Collapsible) */}
          {/* Log Terminal (Collapsible) - Expanded Height increased to 600px */}
          <div className={`flex-shrink-0 transition-all duration-300 ease-in-out border border-white/10 rounded-xl bg-black/30 overflow-hidden flex flex-col ${isLogsOpen ? 'h-[600px]' : 'h-[36px]'}`}>
            <div
              className="h-[36px] flex-shrink-0 px-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
              onClick={() => setIsLogsOpen(!isLogsOpen)}
            >
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${state.logs.length > 0 && state.logs[state.logs.length - 1].includes('Error') ? 'bg-red-500' : 'bg-green-500'}`}></span>
                System Logs
              </span>
              <button className="text-gray-400 hover:text-white">
                {isLogsOpen ? '▼' : '▲'}
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <LogTerminal logs={state.logs} className="h-full border-t border-white/5" />
            </div>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}

export default App;
