import { useState } from 'react';
import { LayoutGrid, Clapperboard, Settings, Wifi, ChevronsLeft, ChevronsRight, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';

// View State Types
export type ViewState = 'dashboard' | 'settings' | 'logs';

interface SidebarProps {
    currentView: ViewState;
    onViewChange: (view: ViewState) => void;
    isOnline?: boolean;
}

export function Sidebar({ currentView, onViewChange, isOnline = true }: SidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const menuItems = [
        { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutGrid },
        { id: 'logs' as const, label: 'Live Logs', icon: Terminal },
    ];

    return (
        <aside className={cn(
            "bg-black/40 backdrop-blur-xl border-r border-white/10 flex flex-col z-20 transition-all duration-300 ease-in-out h-full",
            isCollapsed ? "w-[70px]" : "w-64"
        )}>
            {/* Logo Area */}
            <div className={cn("p-4 border-b border-white/5", isCollapsed ? "px-3" : "p-6")}>
                <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
                    <Clapperboard className="h-6 w-6 text-amber-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.5)] flex-shrink-0" />
                    {!isCollapsed && (
                        <h1 className="text-lg font-bold bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent leading-tight font-mono">
                            Grok Studio
                        </h1>
                    )}
                </div>
            </div>

            {/* Navigation */}
            <nav className={cn("flex-1 space-y-2 overflow-y-auto py-4", isCollapsed ? "px-2" : "px-4")}>
                {menuItems.map((item) => (
                    <button
                        key={item.id}
                        onClick={() => onViewChange(item.id)}
                        title={isCollapsed ? item.label : undefined}
                        className={cn(
                            "w-full flex items-center rounded-xl transition-all group relative",
                            isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                            currentView === item.id
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[inset_0_0_15px_rgba(251,191,36,0.05)]"
                                : "text-gray-400 hover:bg-white/5 hover:text-white border border-transparent"
                        )}
                    >
                        <item.icon size={20} className={cn("transition-transform flex-shrink-0", currentView === item.id && "scale-110")} />
                        {!isCollapsed && (
                            <>
                                <span className="text-sm font-medium tracking-wide">{item.label}</span>
                                {currentView === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_5px_#fbbf24]" />}
                            </>
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Actions */}
            <div className={cn("border-t border-white/10 bg-black/20", isCollapsed ? "p-2" : "p-4")}>
                <button
                    onClick={() => onViewChange('settings')}
                    className={cn(
                        "w-full flex items-center rounded-xl transition-all mb-3 border border-transparent group relative",
                        isCollapsed ? "justify-center p-3" : "gap-3 px-4 py-3",
                        currentView === 'settings'
                            ? "bg-white/10 text-white border-white/10"
                            : "text-gray-400 hover:text-white hover:bg-white/5"
                    )}
                >
                    <Settings size={20} className={cn("flex-shrink-0", currentView === 'settings' && "animate-spin-slow")} />
                    {!isCollapsed && <span className="text-sm font-medium">Settings</span>}
                </button>

                {/* Status */}
                {!isCollapsed ? (
                    <div className={cn(
                        "rounded-lg px-3 py-2 border flex items-center justify-between backdrop-blur-md transition-colors",
                        isOnline ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
                    )}>
                        <div className="flex items-center gap-2">
                            <Wifi size={14} className={isOnline ? "text-green-400" : "text-red-400"} />
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider", isOnline ? "text-green-400" : "text-red-400")}>
                                {isOnline ? "System Ready" : "Offline"}
                            </span>
                        </div>
                        <span className="text-[10px] text-gray-500 font-mono">v1.0.0</span>
                    </div>
                ) : (
                    <div className="flex justify-center py-2">
                        <div className={cn("w-2 h-2 rounded-full", isOnline ? "bg-green-500" : "bg-red-500")} />
                    </div>
                )}
            </div>

            {/* Collapse Toggle */}
            <div className={cn("p-2 border-t border-white/5", isCollapsed ? "flex justify-center" : "flex justify-end")}>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all duration-200 group"
                >
                    {isCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
                </button>
            </div>
        </aside>
    );
}
