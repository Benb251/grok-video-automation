/// <reference types="vite/client" />

interface Window {
    api: {
        automation: {
            init: (accountsFolder: string, config: any) => Promise<boolean>;
            scanProject: (projectPath: string) => Promise<{ scriptPath: string, imagesPath: string }>;
            start: (scriptPath: string, imagesFolder: string) => Promise<boolean>;
            updatePrompt: (scriptPath: string, sceneNumber: number, newPrompt: string) => Promise<boolean>;
            retry: (scriptPath: string, imagesFolder: string, sceneNumbers: number[]) => Promise<boolean>;
            stop: () => Promise<void>;
            onLog: (callback: (msg: string) => void) => void;
            onProgress: (callback: (data: any) => void) => void;
            onWorkerUpdate: (callback: (data: any) => void) => void;
            onError: (callback: (msg: string) => void) => void;
            removeAllListeners: () => void;
        },
        dialog: {
            selectFolder: () => Promise<string | null>;
        }
    }
}
