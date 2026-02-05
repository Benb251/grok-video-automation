import React, { useState } from 'react';
import { Film, CheckCircle2, Clock, AlertCircle, Loader2, PlayCircle, Image as ImageIcon, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { WorkerGrid } from './WorkerGrid';

interface Scene {
    sceneNumber: number;
    status: 'pending' | 'generating' | 'completed' | 'failed';
    workerId?: number;
    error?: string;
    videoPath?: string;
    imagePath?: string;
    prompt: string;
}

interface StoryboardProps {
    scenes: Scene[];
    workers: any[];
    className?: string;
}

export function Storyboard({ scenes, workers, className }: StoryboardProps) {
    const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
    const [selectedVideo, setSelectedVideo] = useState<Scene | null>(null);

    const filteredScenes = scenes.filter(s => {
        if (filter === 'all') return true;
        if (filter === 'completed') return s.status === 'completed';
        if (filter === 'pending') return s.status === 'pending' || s.status === 'generating';
        if (filter === 'failed') return s.status === 'failed';
        return true;
    });

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
                        <Film size={14} /> Storyboard ({scenes.length})
                    </h3>

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

                <div className="flex-1 bg-black/20 border border-white/5 rounded-xl p-4 overflow-y-auto custom-scrollbar">
                    {scenes.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 opacity-50 space-y-2">
                            <Film size={48} />
                            <p>Select a project to load storyboard...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 px-4 pb-8">
                            {filteredScenes.map((scene) => (
                                <SceneCard
                                    key={scene.sceneNumber}
                                    scene={scene}
                                    onClick={(s) => {
                                        if (s.status === 'completed' && s.videoPath) {
                                            setSelectedVideo(s);
                                        }
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Video Modal */}
            {selectedVideo && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="relative w-full max-w-5xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-white/10">
                        <button
                            onClick={() => setSelectedVideo(null)}
                            className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-white/20 rounded-full text-white transition-colors"
                        >
                            <X size={24} />
                        </button>

                        <video
                            src={`media://${selectedVideo.videoPath}`}
                            controls
                            autoPlay
                            className="w-full h-full object-contain"
                        />

                        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                            <h3 className="text-xl font-bold text-white mb-2">Scene {selectedVideo.sceneNumber}</h3>
                            <p className="text-sm text-gray-300 line-clamp-2 max-w-3xl">
                                {selectedVideo.prompt}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SceneCard({ scene, onClick }: { scene: Scene, onClick: (s: Scene) => void }) {
    const statusColor = {
        pending: 'border-white/10 bg-white/5',
        generating: 'border-amber-500/50 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]',
        completed: 'border-green-500/50 bg-green-500/10 cursor-pointer hover:border-green-400',
        failed: 'border-red-500/50 bg-red-500/10'
    };

    return (
        <div
            onClick={() => onClick(scene)}
            className={cn(
                "group relative aspect-video rounded-lg border flex flex-col overflow-hidden transition-all duration-300 hover:scale-[1.02] shadow-lg",
                statusColor[scene.status] || statusColor.pending
            )}
        >
            {/* Background: Video Preview OR Image Thumbnail */}
            <div className="absolute inset-0 z-0 bg-black">
                {scene.status === 'completed' && scene.videoPath ? (
                    // Show First Frame of Video
                    <video
                        src={`media:///${encodeURI(scene.videoPath.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`}
                        className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        preload="metadata"
                        muted // Muted to allow autoplay metadata loading
                        onMouseOver={e => e.currentTarget.play()}
                        onMouseOut={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                    />
                ) : scene.imagePath ? (
                    // Show Source Image
                    <img
                        src={`media:///${encodeURI(scene.imagePath.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F')}`}
                        alt={`Scene ${scene.sceneNumber}`}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                    />
                ) : null}

                <div className="absolute inset-0 bg-black/50 group-hover:bg-black/20 transition-colors duration-300 pointer-events-none" />
            </div>

            {/* Header Status Bar */}
            <div className="absolute top-0 left-0 right-0 p-3 flex justify-between items-start z-10 pointer-events-none">
                <span className={cn(
                    "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm border border-white/5",
                    scene.status === 'completed' ? "bg-green-500 text-black border-transparent" :
                        scene.status === 'generating' ? "bg-amber-500 text-black border-transparent" :
                            scene.status === 'failed' ? "bg-red-500 text-white border-transparent" : "bg-black/60 text-white"
                )}>
                    Scene {scene.sceneNumber}
                </span>

                {scene.status === 'generating' && <Loader2 size={16} className="text-amber-500 animate-spin drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" />}
                {scene.status === 'completed' && <CheckCircle2 size={16} className="text-green-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" />}
                {scene.status === 'failed' && <AlertCircle size={16} className="text-red-500 drop-shadow-[0_2px_2px_rgba(0,0,0,0.8)]" />}
            </div>

            {/* Centered Content / Icons */}
            <div className="flex-1 flex flex-col justify-center items-center text-center z-10 p-4 pointer-events-none">
                {scene.status === 'pending' && !scene.imagePath && (
                    <div className="text-gray-500 flex flex-col items-center gap-2">
                        <ImageIcon size={32} strokeWidth={1} />
                        <span className="text-[10px] uppercase tracking-widest opacity-60">Waiting</span>
                    </div>
                )}

                {scene.status === 'generating' && (
                    <div className="flex flex-col items-center gap-3">
                        <div className="bg-black/40 backdrop-blur-md p-3 rounded-full border border-amber-500/30 shadow-lg">
                            <Loader2 size={24} className="text-amber-500 animate-spin" strokeWidth={2} />
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-black/60 px-2 py-1 rounded backdrop-blur-sm mb-1">Generating</span>
                        </div>
                    </div>
                )}

                {scene.status === 'completed' && (
                    <div className="transition-transform duration-300 transform scale-90 group-hover:scale-110">
                        <div className="bg-green-500/20 backdrop-blur-md p-4 rounded-full border border-green-500/50 shadow-[0_0_20px_rgba(74,222,128,0.2)] group-hover:bg-green-500/30">
                            <PlayCircle size={40} className="text-green-400 fill-green-400/10" strokeWidth={1.5} />
                        </div>
                    </div>
                )}

                {scene.status === 'failed' && (
                    <div className="flex flex-col items-center gap-2">
                        <div className="bg-red-500/20 backdrop-blur-md p-3 rounded-full border border-red-500/50 shadow-lg">
                            <AlertCircle size={32} className="text-red-500" strokeWidth={1.5} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-100 bg-red-500/20 px-2 py-1 rounded backdrop-blur-sm border border-red-500/20">Failed</span>
                    </div>
                )}
            </div>

            {/* Hover Prompt Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-black/80 backdrop-blur-md border-t border-white/10 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300 z-20 pointer-events-none">
                <p className="text-[11px] text-gray-300 line-clamp-2 leading-relaxed font-medium">
                    {scene.prompt}
                </p>
            </div>
        </div>
    );
}
