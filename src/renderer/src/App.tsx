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
    }
  }, []);

  // Persistence: Save config on change
  useEffect(() => {
    localStorage.setItem('grok_config', JSON.stringify({
      duration: state.config.duration,
      resolution: state.config.resolution,
      maxConcurrent: state.config.maxConcurrent
    }));
  }, [state.config.duration, state.config.resolution, state.config.maxConcurrent]);

  // Persistence: Save paths on change
  useEffect(() => {
    localStorage.setItem('grok_paths', JSON.stringify({
      projectPath: state.projectPath,
      accountsPath: state.accountsPath
    }));
  }, [state.projectPath, state.accountsPath]);

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
            <div className="flex-1 px-4 py-2 rounded-lg bg-black/40 border border-white/10 backdrop-blur-md flex items-center justify-between">
              <span className="text-gray-400 text-xs font-bold uppercase tracking-wider">Failed</span>
              <span className="text-xl font-mono text-red-400 leading-none">{state.stats.failed}</span>
            </div>
          </div>

          {/* Storyboard / Worker Grid - Main Focus */}
          <div className="flex-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-xl overflow-hidden flex flex-col min-h-0">
            <Storyboard
              scenes={state.scenes}
              workers={state.workers}
              stats={state.stats}
              className="flex-1 min-h-0"
            />
          </div>

          {/* Log Terminal (Collapsible) */}
          <div className={`flex-shrink-0 transition-all duration-300 ease-in-out border border-white/10 rounded-xl bg-black/30 overflow-hidden ${isLogsOpen ? 'h-[200px]' : 'h-[36px]'}`}>
            <div
              className="h-[36px] px-4 flex items-center justify-between cursor-pointer hover:bg-white/5"
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
            <div className="h-[calc(200px-36px)]">
              <LogTerminal logs={state.logs} className="h-full border-t border-white/5" />
            </div>
          </div>
        </div>

      </div>
    </MainLayout>
  );
}

export default App;
