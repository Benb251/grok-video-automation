import React from 'react';
import { Play, StopCircle, Settings, Clock, Monitor, Users } from 'lucide-react';
import { cn } from '../lib/utils';

interface ConfigurationPanelProps {
    projectPath: string;
    onProjectSelect: (path: string) => void;
    accountsPath: string;
    onAccountsSelect: (path: string) => void;
    config: {
        duration: string;
        resolution: string;
        delay: number;
        maxConcurrent: number;
    };
    onConfigChange: (key: string, value: any) => void;
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    className?: string;
}

export function ConfigurationPanel({
    projectPath,
    onProjectSelect,
    accountsPath,
    onAccountsSelect,
    config,
    onConfigChange,
    isRunning,
    onStart,
    onStop,
    className
}: ConfigurationPanelProps) {
    return (
        <div className={cn("flex flex-col gap-6 h-full", className)}>
            {/* Project Selection */}
            <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Settings size={14} /> Project Source
                </h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={projectPath}
                        readOnly
                        placeholder="Select project folder (e.g. tap-1)..."
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none"
                    />
                    <button
                        onClick={async () => {
                            const path = await window.api.dialog.selectFolder();
                            if (path) onProjectSelect(path);
                        }}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                    >
                        Browse
                    </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1 ml-1">
                    Folder must contain script (.txt) and 'image' folder.
                </p>
            </section>

            {/* Account Selection */}
            <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Users size={14} /> Account Source
                </h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={accountsPath}
                        readOnly
                        placeholder="Select accounts folder..."
                        className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none"
                    />
                    <button
                        onClick={async () => {
                            const path = await window.api.dialog.selectFolder();
                            if (path) onAccountsSelect(path);
                        }}
                        className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                    >
                        Browse
                    </button>
                </div>
            </section>

            {/* Settings Form */}
            <section className="space-y-4">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                    Generation Settings
                </h3>

                {/* Duration */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <label className="text-xs text-gray-400 mb-2 block flex items-center gap-2">
                        <Clock size={12} /> Duration
                    </label>
                    <select
                        value={config.duration}
                        onChange={(e) => onConfigChange('duration', e.target.value)}
                        disabled={isRunning}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    >
                        <option value="6s">6 Seconds</option>
                        <option value="10s">10 Seconds</option>
                    </select>
                </div>

                {/* Resolution */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <label className="text-xs text-gray-400 mb-2 block flex items-center gap-2">
                        <Monitor size={12} /> Resolution
                    </label>
                    <select
                        value={config.resolution}
                        onChange={(e) => onConfigChange('resolution', e.target.value)}
                        disabled={isRunning}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    >
                        <option value="480p">480p SD</option>
                        <option value="720p">720p HD</option>
                    </select>
                </div>

                {/* Workers */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <label className="text-xs text-gray-400 mb-2 block flex items-center gap-2">
                        <Users size={12} /> Concurrent Workers
                    </label>
                    <input
                        type="number"
                        min={1}
                        max={10}
                        value={config.maxConcurrent}
                        onChange={(e) => onConfigChange('maxConcurrent', parseInt(e.target.value))}
                        disabled={isRunning}
                        className="w-full bg-black/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500/50"
                    />
                </div>
            </section>

            {/* Action Buttons */}
            <div className="mt-auto pt-6 border-t border-white/10 space-y-3">
                <button
                    onClick={onStart}
                    disabled={!projectPath || isRunning}
                    className={cn(
                        "w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
                        isRunning
                            ? "bg-gray-600/20 text-gray-500 cursor-not-allowed"
                            : "bg-amber-500 text-black hover:bg-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_25px_rgba(245,158,11,0.5)]"
                    )}
                >
                    {isRunning ? 'Running Batch...' : <><Play size={20} fill="currentColor" /> START GENERATION</>}
                </button>

                <button
                    onClick={onStop}
                    disabled={!isRunning}
                    className={cn(
                        "w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all",
                        isRunning
                            ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
                            : "opacity-0 pointer-events-none"
                    )}
                >
                    <StopCircle size={20} /> STOP PROCESS
                </button>
            </div>
        </div>
    );
}
