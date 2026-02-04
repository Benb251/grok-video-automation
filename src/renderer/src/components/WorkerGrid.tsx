import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';

interface WorkerStats {
    id: number;
    status: 'idle' | 'working' | 'retrying' | 'error';
    currentScene?: number;
    progress?: number; // 0-100
    message?: string;
}

interface WorkerGridProps {
    workers: WorkerStats[];
    className?: string;
}

export function WorkerGrid({ workers, className }: WorkerGridProps) {
    if (workers.length === 0) return null;

    return (
        <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4", className)}>
            {workers.map((worker) => (
                <div
                    key={worker.id}
                    className={cn(
                        "relative p-4 rounded-xl border backdrop-blur-sm transition-all duration-300",
                        worker.status === 'working' ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]" :
                            worker.status === 'error' ? "bg-red-500/10 border-red-500/30" :
                                worker.status === 'retrying' ? "bg-orange-500/10 border-orange-500/30" :
                                    "bg-white/5 border-white/10"
                    )}
                >
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs",
                                worker.status === 'working' ? "bg-amber-500 text-black" :
                                    "bg-white/10 text-gray-400"
                            )}>
                                {worker.id}
                            </div>
                            <span className="text-sm font-medium text-gray-300">Worker Node</span>
                        </div>

                        {worker.status === 'working' && <Loader2 size={16} className="text-amber-400 animate-spin" />}
                        {worker.status === 'idle' && <Cpu size={16} className="text-gray-600" />}
                        {worker.status === 'error' && <AlertCircle size={16} className="text-red-400" />}
                    </div>

                    <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Status</span>
                            <span className={cn(
                                "font-bold uppercase",
                                worker.status === 'working' ? "text-amber-400" :
                                    worker.status === 'error' ? "text-red-400" :
                                        "text-gray-500"
                            )}>
                                {worker.status}
                            </span>
                        </div>

                        {worker.currentScene && (
                            <div className="bg-black/30 rounded-lg p-2 text-xs font-mono text-center border border-white/5">
                                Processing Scene <span className="text-white font-bold">{worker.currentScene}</span>
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
