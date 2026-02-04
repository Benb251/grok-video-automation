import React, { useState } from 'react';
import { Film, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkerGrid } from './WorkerGrid';

interface Scene {
    sceneNumber: number;
    status: 'pending' | 'generating' | 'completed' | 'failed';
    workerId?: number;
    error?: string;
    videoPath?: string;
}

interface StoryboardProps {
    scenes: Scene[]; // We will need to map real data to this
    workers: any[];
    stats: any;
    className?: string;
}

export function Storyboard({ scenes, workers, stats, className }: StoryboardProps) {
    const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');

    // Filter scenes (Mock logic for now until we have full scene list in state)
    // For the demo, we mostly relies on the WorkerGrid and Stats

    return (
        <div className={cn("flex flex-col h-full gap-6", className)}>
            {/* Top: Active Workers */}
            <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Clock size={14} className="animate-pulse text-amber-500" /> Active Processes
                </h3>
                <WorkerGrid workers={workers} />
            </section>

            {/* Bottom: Scene List / Gallery */}
            <section className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <Film size={14} /> Storyboard
                    </h3>

                    {/* Simple Tabs */}
                    <div className="flex bg-black/40 rounded-lg p-1 border border-white/10">
                        {(['all', 'completed', 'pending', 'failed'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setFilter(tab)}
                                className={cn(
                                    "px-3 py-1 rounded-md text-xs font-medium capitalize transition-all",
                                    filter === tab ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-gray-300"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Area */}
                <div className="flex-1 bg-black/20 border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                    {/* Placeholder for now since we don't have the full scene list from backend yet 
                 We only receive "stats" and "logs" currently. 
                 To fully implement this, we need to update 'automation:progress' to send the full Scenes array.
             */}
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50 space-y-2">
                        <Film size={48} />
                        <p>Scene visualization will appear here...</p>
                        <div className="grid grid-cols-4 gap-4 mt-8 w-full max-w-lg opacity-40">
                            {/* Mock placeholders to show layout */}
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                                <div key={i} className="aspect-video bg-white/5 rounded border border-white/10 flex items-center justify-center">
                                    Scene {i}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
