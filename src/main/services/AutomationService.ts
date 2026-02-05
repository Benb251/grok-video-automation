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
    duration: string;
    resolution: string;
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
            duration: '6s',
            resolution: '720p',
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

    async startBatch(scriptPath: string, imagesFolder: string, options?: { specificScenes?: number[], force?: boolean }) {
        // Ensure service is initialized and workers are running
        if (this.accounts.length === 0) {
            this.log('⚠️ Service not initialized, attempting to initialize...');
            if (!this.accountsFolder) throw new Error('Accounts folder not set. Please initialize first.');
            await this.initialize();
        } else {
            // If initialized but stopped (no processes), relaunch
            // Check if any process is actually running (simple check if array is empty or processes killed)
            // Since we don't track exit codes robustly, we'll check if chromeProcesses array is empty
            if (this.chromeProcesses.length === 0) {
                this.log('🔄 Workers stopped. Relaunching Chrome...');
                this.isRunning = false; // Reset flag to ensure clean state
                // Assume config is already set from previous init
                await this.launchAllChrome();
            }
        }

        this.isRunning = true;
        const scenes = parseScriptFile(scriptPath);

        // Derive output folder from project root (parent of images folder)
        const projectRoot = path.dirname(imagesFolder);
        this.config.outputFolder = projectRoot;
        this.log(`📂 Project Root: ${projectRoot}`);
        this.log(`📂 Output Video Folder: ${path.join(projectRoot, 'video')}`);

        // SMART RESUME: Check for existing videos
        const videoFolder = path.join(projectRoot, 'video');
        const totalScenes = scenes.length;
        let completedCount = 0;

        // Clone scenes to avoid mutating cached ones if any
        const allScenes = scenes.map(s => ({ ...s }));

        const queue: Scene[] = [];

        for (const scene of allScenes) {
            // Filter specific scenes if requested
            if (options?.specificScenes && !options.specificScenes.includes(scene.sceneNumber)) {
                continue; // Skip scenes not in the list
            }

            const videoName = `scene_${String(scene.sceneNumber).padStart(3, '0')}.mp4`;
            const videoPath = path.join(videoFolder, videoName);

            // If forced, we ignore existing video (and maybe overwrite it later)
            // If NOT forced, we check existence
            if (!options?.force && fs.existsSync(videoPath)) {
                // Mark as done
                scene.isDone = true;
                scene.videoPath = videoPath;
                scene.status = 'completed'; // For UI consistency
                completedCount++;

                // Notify UI immediately so it turns green
                // We delay slightly to ensure stats are init
                setTimeout(() => {
                    this.onProgress({
                        updatedScene: {
                            sceneNumber: scene.sceneNumber,
                            status: 'completed',
                            videoPath: videoPath
                        }
                    });
                }, 100);
            } else {
                queue.push(scene);
            }
        }

        this.log(`📊 Batch/Retry: Found ${completedCount} completed (skipped), ${queue.length} scenes to process.`);

        // Initialize stats
        const stats = {
            total: totalScenes,
            completed: completedCount,
            failed: 0,
            pending: queue.length
        };
        this.onProgress(stats);

        const processWorker = async (account: WorkerAccount) => {
            while (queue.length > 0 && this.isRunning) {
                const scene = queue.shift();
                if (!scene) break;

                this.log(`\n[Worker ${account.id}] Processing Scene ${scene.sceneNumber}...`);
                this.onWorkerUpdate({ id: account.id, status: 'working', currentScene: scene.sceneNumber });

                // Notify scene started
                this.onProgress({
                    ...stats,
                    updatedScene: {
                        sceneNumber: scene.sceneNumber,
                        status: 'generating',
                        workerId: account.id
                    }
                });
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
                        this.log(`   📂 runAutomation returned: ${tempDownloadDir}`);

                        // Move from temp to project "video" folder
                        this.log(`   🔄 Calling findAndMoveVideo...`);
                        const videoPath = this.findAndMoveVideo(scene.sceneNumber, this.config.outputFolder, tempDownloadDir);
                        this.log(`   📂 findAndMoveVideo returned: ${videoPath}`);

                        // Cleanup
                        try {
                            if (fs.existsSync(tempDownloadDir)) {
                                fs.rmSync(tempDownloadDir, { recursive: true, force: true });
                            }
                        } catch (e) { }

                        if (videoPath) {
                            stats.completed++;
                            stats.pending--;
                            this.onProgress({
                                ...stats,
                                updatedScene: {
                                    sceneNumber: scene.sceneNumber,
                                    status: 'completed',
                                    videoPath: videoPath
                                }
                            });
                            this.log(`✅ [Worker ${account.id}] Scene ${scene.sceneNumber} Complete`);
                            this.log(`   Saved to: ${videoPath}`);
                            this.onWorkerUpdate({ id: account.id, status: 'idle', currentScene: null }); // Idle after done
                            success = true;
                        } else {
                            throw new Error('Video not found in temp folder');
                        }
                    } catch (error: any) {
                        attempts++;
                        // Enhanced Error Logging
                        console.error(`[Worker ${account.id}] Error Details:`, error);
                        this.log(`❌ [Worker ${account.id}] Scene ${scene.sceneNumber} Error: ${error.message}`);

                        if (attempts > this.config.maxRetries) {
                            this.log(`❌ [Worker ${account.id}] Scene ${scene.sceneNumber} FAILED after ${attempts} attempts.`);
                            stats.failed++;
                            stats.pending--;
                            this.onProgress({
                                ...stats,
                                updatedScene: {
                                    sceneNumber: scene.sceneNumber,
                                    status: 'failed',
                                    error: error.message
                                }
                            });
                            this.onWorkerUpdate({ id: account.id, status: 'error', currentScene: scene.sceneNumber });
                            this.onError(`Scene ${scene.sceneNumber} failed: ${error.message}`);
                        } else {
                            this.log(`⚠️ [Worker ${account.id}] Retrying (${attempts}/${this.config.maxRetries})...`);
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
        // Get script path (Using CJS now)
        const scriptPath = app.isPackaged
            ? path.join(process.resourcesPath, 'grok-automation.cjs')
            : path.join(__dirname, '../../src/main/resources/grok-automation.js');

        console.log(`[AutomationService] Resolved script path: ${scriptPath}`);
        console.log(`[AutomationService] Exists? ${require('fs').existsSync(scriptPath)}`);

        // Temp config
        const tempConfig = {
            prompt: scene.prompt,
            imagePath: imagePath,
            cookiePath: account.cookiePath,
            aspectRatio: '16:9',
            duration: this.config.duration || '6s',
            resolution: this.config.resolution || '720p'
        };

        const tempDir = app.getPath('userData');
        const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const tempConfigPath = path.join(tempDir, `config_${uniqueId}.json`);
        const tempDownloadDir = path.join(tempDir, `downloads_${uniqueId}`);

        if (!fs.existsSync(tempDownloadDir)) fs.mkdirSync(tempDownloadDir, { recursive: true });

        try {
            fs.writeFileSync(tempConfigPath, JSON.stringify(tempConfig, null, 2));

            return new Promise((resolve, reject) => {
                const nodeExecutable = process.execPath;
                const nodeArgs = [
                    scriptPath,
                    tempConfigPath,
                    '--port', account.port.toString(),
                    '--download-dir', tempDownloadDir
                ];

                // When running in production/packaged mode, we use the Electron executable as Node
                // via ELECTRON_RUN_AS_NODE=1. This allows it to require modules from app.asar.
                // In dev mode, we can default to 'node' or still use Electron.
                // Using process.execPath works for both if configured, but 'node' is simpler for dev.
                // Note: process.execPath in dev points to electron.exe in node_modules.

                // CRITICAL FIX: allow script to find node_modules inside app.asar
                const appAsarPath = path.join(process.resourcesPath, 'app.asar');
                const nodeModulesPath = path.join(appAsarPath, 'node_modules');

                const env = {
                    ...process.env,
                    ELECTRON_RUN_AS_NODE: '1',
                    NODE_PATH: nodeModulesPath // Helper for require() to look inside asar
                };

                console.log(`[AutomationService] NODE_PATH set to: ${nodeModulesPath}`);

                const proc = spawn(nodeExecutable, nodeArgs, {
                    stdio: 'pipe',
                    env: env
                });

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
        this.log(`   📦 Moving video: source=${sourceFolder}, output=${outputFolder}`);

        if (!fs.existsSync(sourceFolder)) {
            this.log(`   ⚠️ Source folder not found: ${sourceFolder}`);
            return null;
        }

        const files = fs.readdirSync(sourceFolder).filter(f => f.endsWith('.mp4'));
        this.log(`   📋 Found ${files.length} mp4 files: ${files.join(', ')}`);

        if (files.length === 0) return null;

        const video = files[0]; // Should only be one
        const newName = `scene_${String(sceneNumber).padStart(3, '0')}.mp4`; // Simplified name

        // Use "video" folder (Singular to match user structure)
        const targetDir = path.join(outputFolder, 'video');

        if (!fs.existsSync(targetDir)) {
            this.log(`   📁 Creating target folder: ${targetDir}`);
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const sourcePath = path.join(sourceFolder, video);
        const targetPath = path.join(targetDir, newName);
        this.log(`   📥 Copying: ${sourcePath} -> ${targetPath}`);

        try {
            // If exists, overwrite or rename? Let's overwrite for now to be simple
            fs.copyFileSync(sourcePath, targetPath);
            this.log(`   ✅ Video copied successfully!`);
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
        this.chromeProcesses = []; // Clear the array so we know they are dead
    }
}
