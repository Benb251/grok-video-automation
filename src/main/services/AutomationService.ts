import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import { parseScriptFile, Scene } from './ScriptParser';

interface AutomationConfig {
    basePort: number;
    maxConcurrent: number;
    maxRetries: number;
    outputFolder: string;
}

interface WorkerAccount {
    id: number;
    port: number;
    cookiePath: string;
    profileDir: string;
}

export class AutomationService {
    private accountsFolder: string;
    private config: AutomationConfig;
    private accounts: WorkerAccount[] = [];
    private chromeProcesses: ChildProcess[] = [];
    private isRunning: boolean = false;

    // Callback for sending logs to UI
    private onLog: (msg: string) => void;
    private onProgress: (data: any) => void;
    private onWorkerUpdate: (data: any) => void;
    private onError: (msg: string) => void;

    constructor(
        accountsFolder: string,
        config: Partial<AutomationConfig>,
        callbacks: {
            onLog: (msg: string) => void;
            onProgress: (data: any) => void;
            onWorkerUpdate: (data: any) => void;
            onError: (msg: string) => void;
        }
    ) {
        this.accountsFolder = accountsFolder;
        this.config = {
            basePort: 9222,
            maxConcurrent: 0,
            maxRetries: 2,
            outputFolder: '',
            ...config
        };
        this.onLog = callbacks.onLog;
        this.onProgress = callbacks.onProgress;
        this.onWorkerUpdate = callbacks.onWorkerUpdate;
        this.onError = callbacks.onError;
    }

    log(msg: string) {
        console.log(msg); // Keep console for terminal
        this.onLog(msg);
    }

    async initialize() {
        // Reset state to avoid duplicates if init is called multiple times
        this.cleanup();
        this.accounts = [];
        this.chromeProcesses = [];

        this.log(`📂 Scanning accounts in: ${this.accountsFolder}`);

        // Load cookie files
        const cookieFiles = fs.readdirSync(this.accountsFolder)
            .filter(f => f.endsWith('.json'))
            .map(f => path.join(this.accountsFolder, f));

        if (cookieFiles.length === 0) {
            throw new Error(`No cookie files found in ${this.accountsFolder}`);
        }

        const numWorkers = this.config.maxConcurrent > 0
            ? Math.min(this.config.maxConcurrent, cookieFiles.length)
            : cookieFiles.length;

        this.log(`🚀 Initializing ${numWorkers} workers...`);

        // Create account configs
        for (let i = 0; i < numWorkers; i++) {
            const account: WorkerAccount = {
                id: i + 1,
                port: this.config.basePort + i,
                cookiePath: cookieFiles[i],
                // Use local app data for profiles to avoid permission issues
                profileDir: path.join(app.getPath('userData'), `chrome-profile-${i + 1}`)
            };
            this.accounts.push(account);
        }

        await this.launchAllChrome();
    }

    async launchAllChrome() {
        // Find Chrome
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            path.join(process.env.USERPROFILE || '', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
        ];

        let chromePath = '';
        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                chromePath = p;
                break;
            }
        }

        if (!chromePath) throw new Error('Chrome not found');

        for (const account of this.accounts) {
            this.log(`📦 Launching Worker ${account.id} (Port ${account.port})`);

            if (!fs.existsSync(account.profileDir)) {
                fs.mkdirSync(account.profileDir, { recursive: true });
            }

            const chromeProcess = spawn(chromePath, [
                `--remote-debugging-port=${account.port}`,
                `--user-data-dir=${account.profileDir}`,
                'https://grok.com/imagine'
            ], { stdio: 'ignore', detached: false });

            this.chromeProcesses.push(chromeProcess);

            // Stagger launch
            await new Promise(r => setTimeout(r, 1500));
        }

        this.log('⏳ Waiting for Chrome initialization...');
        await new Promise(r => setTimeout(r, 4000));
    }

    async startBatch(scriptPath: string, imagesFolder: string) {
        this.isRunning = true;
        const scenes = parseScriptFile(scriptPath);

        // Derive output folder from project root (parent of images folder)
        const projectRoot = path.dirname(imagesFolder);
        this.config.outputFolder = projectRoot;
        this.log(`📂 Project Root: ${projectRoot}`);
        this.log(`📂 Output Video Folder: ${path.join(projectRoot, 'video')}`);

        // Filter out completed ones if check enabled (skipped for simplicity, can add later)
        const pendingScenes = scenes.filter(s => !s.isDone);

        this.log(`📊 Starting batch: ${pendingScenes.length} scenes pending`);

        // Initialize stats
        const stats = {
            total: scenes.length,
            completed: scenes.filter(s => s.isDone).length,
            failed: 0,
            pending: pendingScenes.length
        };
        this.onProgress(stats);

        const queue = [...pendingScenes];

        const processWorker = async (account: WorkerAccount) => {
            while (queue.length > 0 && this.isRunning) {
                const scene = queue.shift();
                if (!scene) break;

                this.log(`\n[Worker ${account.id}] Processing Scene ${scene.sceneNumber}...`);
                this.onWorkerUpdate({ id: account.id, status: 'working', currentScene: scene.sceneNumber });
                this.log(`🍪 [Worker ${account.id}] Using cookie file: ${path.basename(account.cookiePath)}`);

                // Resolve image path
                // Simple logic: Look for matching number in filename
                let imagePath = '';
                try {
                    const files = fs.readdirSync(imagesFolder);
                    const match = files.find(f => {
                        const num = f.match(/\d+/);
                        // Ensure we match "1.png", "scene_1.jpg" etc, but strictly link number to scene
                        return num && parseInt(num[0]) === scene.sceneNumber;
                    });
                    if (match) imagePath = path.join(imagesFolder, match);
                } catch (e) {
                    this.log(`⚠️ Could not access images folder: ${e}`);
                }

                let attempts = 0;
                let success = false;

                while (attempts <= this.config.maxRetries && !success && this.isRunning) {
                    if (attempts > 0) this.log(`⚠️ [Worker ${account.id}] Retry ${attempts}...`);

                    try {
                        const tempDownloadDir = await this.runAutomation(account, scene, imagePath);

                        // Move from temp to project "video" folder
                        const videoPath = this.findAndMoveVideo(scene.sceneNumber, this.config.outputFolder, tempDownloadDir);

                        // Cleanup
                        try {
                            if (fs.existsSync(tempDownloadDir)) {
                                fs.rmSync(tempDownloadDir, { recursive: true, force: true });
                            }
                        } catch (e) { }

                        if (videoPath) {
                            stats.completed++;
                            stats.pending--;
                            this.onProgress({ ...stats });
                            this.log(`✅ [Worker ${account.id}] Scene ${scene.sceneNumber} Complete`);
                            this.log(`   Saved to: ${videoPath}`);
                            this.onWorkerUpdate({ id: account.id, status: 'idle', currentScene: null }); // Idle after done
                            success = true;
                        } else {
                            throw new Error('Video not found in temp folder');
                        }
                    } catch (error: any) {
                        attempts++;
                        if (attempts > this.config.maxRetries) {
                            this.log(`❌ [Worker ${account.id}] Scene ${scene.sceneNumber} Failed: ${error.message}`);
                            stats.failed++;
                            stats.pending--; // Remove from pending even if failed
                            this.onProgress({ ...stats });
                            this.onWorkerUpdate({ id: account.id, status: 'error', currentScene: scene.sceneNumber });
                            this.onError(`Scene ${scene.sceneNumber} failed`);
                        } else {
                            this.log(`⚠️ [Worker ${account.id}] Error: ${error.message}. Retrying...`);
                            this.onWorkerUpdate({ id: account.id, status: 'retrying', currentScene: scene.sceneNumber });
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }
                }
            }
            this.onWorkerUpdate({ id: account.id, status: 'offline', currentScene: null });
        };

        const promises = this.accounts.map(acc => processWorker(acc));
        await Promise.all(promises);

        this.isRunning = false;
        this.log('🎉 Batch processing finished!');
    }

    async runAutomation(account: WorkerAccount, scene: Scene, imagePath: string): Promise<string> {
        // Get script path
        const scriptPath = app.isPackaged
            ? path.join(process.resourcesPath, 'grok-automation.js')
            : path.join(__dirname, '../../src/main/resources/grok-automation.js');

        // Temp config
        const tempConfig = {
            prompt: scene.prompt,
            imagePath: imagePath,
            cookiePath: account.cookiePath,
            aspectRatio: '16:9',
            duration: '6s',
            resolution: '720p'
        };

        const tempDir = app.getPath('userData');
        const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tempConfigPath = path.join(tempDir, `config_${uniqueId}.json`);
        const tempDownloadDir = path.join(tempDir, `downloads_${uniqueId}`);

        if (!fs.existsSync(tempDownloadDir)) fs.mkdirSync(tempDownloadDir, { recursive: true });

        try {
            fs.writeFileSync(tempConfigPath, JSON.stringify(tempConfig, null, 2));

            return new Promise((resolve, reject) => {
                const proc = spawn('node', [
                    scriptPath,
                    tempConfigPath,
                    '--port', account.port.toString(),
                    '--download-dir', tempDownloadDir
                ], { stdio: 'pipe' }); // Changed to pipe to capture output

                proc.stdout?.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        // Filter out polling dots and empty lines
                        if (trimmed && trimmed !== '.') {
                            // Detect generic progress (optional, if we want to show it in logs)
                            this.log(`[Job] ${trimmed}`);
                        }
                    });
                });

                proc.stderr?.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim()) this.log(`⚠️ [Job Error] ${line.trim()}`);
                    });
                });

                proc.on('close', (code) => {
                    // Cleanup config file
                    try {
                        if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
                    } catch (e) { }

                    if (code === 0) resolve(tempDownloadDir);
                    else reject(new Error(`Worker exited with code ${code}`));
                });
                proc.on('error', (err) => {
                    try {
                        if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
                    } catch (e) { }
                    reject(err);
                });
            });

        } catch (e) {
            // Fallback cleanup
            try {
                if (fs.existsSync(tempConfigPath)) fs.unlinkSync(tempConfigPath);
            } catch (err) { }
            throw e;
        }
    }

    findAndMoveVideo(sceneNumber: number, outputFolder: string, sourceFolder: string): string | null {
        if (!fs.existsSync(sourceFolder)) return null;

        const files = fs.readdirSync(sourceFolder).filter(f => f.endsWith('.mp4'));
        if (files.length === 0) return null;

        const video = files[0]; // Should only be one
        const newName = `scene_${String(sceneNumber).padStart(3, '0')}.mp4`; // Simplified name

        // Use "video" folder (Singular to match user structure)
        const targetDir = path.join(outputFolder, 'video');

        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const sourcePath = path.join(sourceFolder, video);
        const targetPath = path.join(targetDir, newName);

        try {
            // If exists, overwrite or rename? Let's overwrite for now to be simple
            fs.copyFileSync(sourcePath, targetPath);
            return targetPath;
        } catch (e) {
            this.log(`❌ Error moving video: ${e}`);
            return null;
        }
    }

    stop() {
        this.isRunning = false;
        this.cleanup();
    }

    cleanup() {
        this.log('🧹 Cleaning up processes...');
        this.chromeProcesses.forEach(p => p.kill());
    }
}
