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
      <div className="flex h-full gap-6 max-w-[98vw] mx-auto">

        {/* LEFT COLUMN: Settings & Controls (350px fixed or 25%) */}
        <div className="w-[350px] flex-shrink-0 flex flex-col">
          <ConfigurationPanel
            projectPath={state.projectPath}
            onProjectSelect={(path) => {
              // Auto-detect accounts only if it looks like a parent folder, 
              // but better to just set project path and let user select accounts separately
              // or just clear it to avoid "accounts\accounts" duplication.
              setState(prev => ({
                ...prev,
                projectPath: path,
                // Don't auto-guess accounts path to avoid "C:\...\accounts\accounts" error
                // unless we verify it exists. For now, keep it simple.
              }));
            }}
            accountsPath={state.accountsPath}
            onAccountsSelect={(path) => setState(prev => ({ ...prev, accountsPath: path }))}
            config={state.config}
            onConfigChange={(key, value) => setState(prev => ({ ...prev, config: { ...prev.config, [key]: value } }))}
            isRunning={state.isRunning}
            onStart={handleStart}
            onStop={handleStop}
            className="bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-6 flex-1 shadow-2xl"
          />
        </div>

        {/* RIGHT COLUMN: Storyboard & Visualization */}
        <div className="flex-1 flex flex-col gap-6 min-w-0">
          {/* Stats Bar */}
          <div className="grid grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-black/20 border border-white/10 backdrop-blur-md">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Total</div>
              <div className="text-2xl font-mono text-white">{state.stats.total}</div>
            </div>
            <div className="p-4 rounded-xl bg-black/20 border border-white/10 backdrop-blur-md">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Completed</div>
              <div className="text-2xl font-mono text-green-400">{state.stats.completed}</div>
            </div>
            <div className="p-4 rounded-xl bg-black/20 border border-white/10 backdrop-blur-md">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Pending</div>
              <div className="text-2xl font-mono text-amber-400">{state.stats.pending}</div>
            </div>
            <div className="p-4 rounded-xl bg-black/20 border border-white/10 backdrop-blur-md">
              <div className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-1">Failed</div>
              <div className="text-2xl font-mono text-red-400">{state.stats.failed}</div>
            </div>
          </div>

          {/* Storyboard / Worker Grid */}
          <div className="flex-1 bg-black/20 backdrop-blur-md rounded-2xl border border-white/10 p-6 shadow-xl overflow-hidden flex flex-col">
            <Storyboard
              scenes={state.scenes}
              workers={state.workers}
              stats={state.stats}
              className="flex-1"
            />
          </div>

          {/* Log Terminal (Collapsible or Fixed Height at bottom) */}
          <div className="h-[200px] flex-shrink-0">
            <LogTerminal logs={state.logs} className="h-full shadow-lg" />
          </div>
        </div>

      </div>
    </MainLayout>
  );
}

export default App;
