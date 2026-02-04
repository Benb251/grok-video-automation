import React from 'react';
import { ViewState } from '../components/Sidebar';

interface MainLayoutProps {
    children: React.ReactNode;
    currentView?: ViewState;
    onViewChange?: (view: ViewState) => void;
}

export function MainLayout({ children }: MainLayoutProps) {
    return (
        <div className="flex h-screen bg-[#0f0f12] text-white overflow-hidden font-sans select-none">
            <main className="flex-1 min-w-0 relative overflow-hidden flex flex-col bg-[#0f0f12]">
                {/* Background Effects */}
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none -z-10 overflow-hidden">
                    {/* Top Right Teal/Blue Glow */}
                    <div className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] bg-blue-900/10 blur-[150px] rounded-full animate-pulse duration-[8000ms]" />
                    {/* Bottom Left Amber Glow */}
                    <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-amber-900/10 blur-[120px] rounded-full" />
                    {/* Noise Texture */}
                    <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")` }} />
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 scroll-smooth">
                    {children}
                </div>
            </main>
        </div>
    );
}
