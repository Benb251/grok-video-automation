import { useEffect, useRef } from 'react';
import { Terminal } from 'lucide-react';
import { cn } from '../lib/utils';

interface LogTerminalProps {
    logs: string[];
    className?: string;
}

export function LogTerminal({ logs, className }: LogTerminalProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    return (
        <div className={cn("flex flex-col bg-black/40 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden", className)}>
            <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/5">
                <Terminal size={14} className="text-amber-500" />
                <span className="text-xs font-mono text-gray-400">System Logs</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 max-h-[300px] font-mono text-xs space-y-1 custom-scrollbar">
                {logs.length === 0 && (
                    <div className="text-gray-600 italic">Waiting for logs...</div>
                )}
                {logs.map((log, i) => (
                    <div key={i} className="break-all whitespace-pre-wrap">
                        {log.includes('❌') || log.includes('Error') ? (
                            <span className="text-red-400">{log}</span>
                        ) : log.includes('⚠️') || log.includes('Warning') ? (
                            <span className="text-yellow-400">{log}</span>
                        ) : log.includes('✅') || log.includes('Success') ? (
                            <span className="text-green-400">{log}</span>
                        ) : log.includes('🚀') ? (
                            <span className="text-amber-400 font-bold">{log}</span>
                        ) : (
                            <span className="text-gray-300">{log}</span>
                        )}
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
