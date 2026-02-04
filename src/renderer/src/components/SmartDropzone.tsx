import React, { useCallback } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import { cn } from '../lib/utils';

interface SmartDropzoneProps {
    onFolderSelected: (path: string) => void;
    selectedPath?: string;
    className?: string;
}

export function SmartDropzone({ onFolderSelected, selectedPath, className }: SmartDropzoneProps) {

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
            const path = (e.dataTransfer.files[0] as any).path;
            onFolderSelected(path);
        }
    }, [onFolderSelected]);

    const handleSelect = async () => {
        const path = await window.api.dialog.selectFolder();
        if (path) {
            onFolderSelected(path);
        }
    };

    return (
        <div
            onClick={handleSelect}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
                "relative group cursor-pointer border-2 border-dashed rounded-xl transition-all duration-300 overflow-hidden",
                selectedPath
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-white/10 hover:border-amber-500/30 hover:bg-white/5",
                className
            )}
        >
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-white/5 to-transparent -skew-x-12 translate-x-[-100%] group-hover:animate-shine" />

            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                {selectedPath ? (
                    <>
                        <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                            <FolderOpen className="w-8 h-8 text-amber-400" />
                        </div>
                        <h3 className="text-xl font-bold text-white mb-1 truncate max-w-full px-4">
                            {selectedPath.split('\\').pop()}
                        </h3>
                        <p className="text-sm text-gray-400 font-mono text-xs opacity-70 truncate max-w-full px-10">
                            {selectedPath}
                        </p>
                    </>
                ) : (
                    <>
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                            <Upload className="w-8 h-8 text-gray-400 group-hover:text-amber-400 transition-colors" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-300 group-hover:text-white transition-colors">
                            Select Project Folder
                        </h3>
                        <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
                            Drag and drop your project folder here (e.g. "tap-1") to auto-detect scripts and images.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
