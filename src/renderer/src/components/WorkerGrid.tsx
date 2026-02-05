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
        <div className={cn("flex flex-wrap gap-2", className)}>
            {workers.map((worker) => (
                <div
                    key={worker.id}
                    className={cn(
                        "relative px-3 py-2 rounded-lg border backdrop-blur-sm transition-all duration-300 flex items-center gap-3 min-w-[200px]",
                        worker.status === 'working' ? "bg-amber-500/10 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.1)]" :
                            worker.status === 'error' ? "bg-red-500/10 border-red-500/30" :
                                worker.status === 'retrying' ? "bg-orange-500/10 border-orange-500/30" :
                                    "bg-white/5 border-white/10"
                    )}
                >
                    {/* Status Icon */}
                    <div className={cn(
                        "w-6 h-6 rounded flex items-center justify-center font-bold text-[10px]",
                        worker.status === 'working' ? "bg-amber-500 text-black" :
                            "bg-white/10 text-gray-400"
                    )}>
                        {worker.id}
                    </div>

                    {/* Middle Info */}
                    <div className="flex-1 flex flex-col justify-center">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Worker Node</span>
                            {worker.status === 'working' && <Loader2 size={10} className="text-amber-400 animate-spin" />}
                        </div>
                        {worker.currentScene && (
                            <span className="text-xs font-mono text-gray-200">
                                Scene <span className="font-bold text-white">{worker.currentScene}</span>
                            </span>
                        )}
                        {!worker.currentScene && (
                            <span className="text-[10px] text-gray-500 capitalize">{worker.status}</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
