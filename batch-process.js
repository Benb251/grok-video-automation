import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { parseScriptFile, filterScenes } from './parse-script.js';
import { generateImagePathMap } from './match-images.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Batch configuration
 */
const DEFAULT_CONFIG = {
    duration: '6s',
    resolution: '720p',
    skipCompleted: true,
    delayBetweenScenes: 30, // seconds
    maxRetries: 2
};

/**
 * Progress tracker
 */
class ProgressTracker {
    constructor(outputFolder) {
        this.progressFile = path.join(outputFolder, 'progress', 'batch_progress.json');
        this.logFile = path.join(outputFolder, 'logs', `batch_${Date.now()}.log`);
        this.errorFile = path.join(outputFolder, 'logs', 'errors.log');

        // Ensure directories exist
        fs.mkdirSync(path.dirname(this.progressFile), { recursive: true });
        fs.mkdirSync(path.dirname(this.logFile), { recursive: true });

        this.data = this.load();
    }

    load() {
        if (fs.existsSync(this.progressFile)) {
            return JSON.parse(fs.readFileSync(this.progressFile, 'utf-8'));
        }

        return {
            totalScenes: 0,
            completed: [],
            failed: [],
            pending: [],
            currentScene: null,
            startedAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };
    }

    save() {
        this.data.lastUpdated = new Date().toISOString();
        fs.writeFileSync(this.progressFile, JSON.stringify(this.data, null, 2));
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        fs.appendFileSync(this.logFile, logLine);
        console.log(message);
    }

    logError(sceneNumber, error) {
        const timestamp = new Date().toISOString();
        const errorLine = `[${timestamp}] Scene ${sceneNumber}: ${error}\n`;
        fs.appendFileSync(this.errorFile, errorLine);
        console.error(`❌ ${errorLine.trim()}`);
    }

    markCompleted(sceneNumber, videoPath) {
        this.data.completed.push({
            sceneNumber,
            videoPath,
            completedAt: new Date().toISOString()
        });
        this.data.pending = this.data.pending.filter(n => n !== sceneNumber);
        this.save();
    }

    markFailed(sceneNumber, error) {
        this.data.failed.push({
            sceneNumber,
            error: error.toString(),
            failedAt: new Date().toISOString()
        });
        this.data.pending = this.data.pending.filter(n => n !== sceneNumber);
        this.save();
    }

    setCurrent(sceneNumber) {
        this.data.currentScene = sceneNumber;
        this.save();
    }

    getProgress() {
        const total = this.data.totalScenes;
        const completed = this.data.completed.length;
        const failed = this.data.failed.length;
        const pending = this.data.pending.length;

        return {
            total,
            completed,
            failed,
            pending,
            percentComplete: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }
}

/**
 * Batch processor
 */
class BatchProcessor {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.progress = new ProgressTracker(this.config.outputFolder);
        this.isPaused = false;
        this.isStopped = false;
    }

    async processScene(scene, imagePath) {
        const sceneNumber = scene.sceneNumber;
        this.progress.setCurrent(sceneNumber);
        this.progress.log(`\n${'='.repeat(60)}`);
        this.progress.log(`🎬 Processing Scene ${sceneNumber}`);
        this.progress.log(`${'='.repeat(60)}`);

        // Create temp config for this scene
        const tempConfig = {
            prompt: scene.prompt,
            aspectRatio: '16:9', // Always from image
            duration: this.config.duration,
            resolution: this.config.resolution,
            imagePath: imagePath
        };

        const tempConfigPath = path.join(__dirname, `temp_scene_${sceneNumber}.json`);
        fs.writeFileSync(tempConfigPath, JSON.stringify(tempConfig, null, 2));

        try {
            // Run automation
            this.progress.log(`📸 Image: ${path.basename(imagePath)}`);
            this.progress.log(`📝 Prompt: ${scene.prompt.substring(0, 100)}...`);
            this.progress.log(`⚙️  Config: ${this.config.duration}, ${this.config.resolution}`);

            await this.runAutomation(tempConfigPath);

            // Find generated video
            const videoPath = await this.findGeneratedVideo(sceneNumber);

            if (videoPath) {
                this.progress.markCompleted(sceneNumber, videoPath);
                this.progress.log(`✅ Scene ${sceneNumber} completed: ${path.basename(videoPath)}`);
                return { success: true, videoPath };
            } else {
                throw new Error('Video file not found after generation');
            }

        } catch (error) {
            this.progress.markFailed(sceneNumber, error.message);
            this.progress.logError(sceneNumber, error.message);
            return { success: false, error: error.message };

        } finally {
            // Cleanup temp config
            if (fs.existsSync(tempConfigPath)) {
                fs.unlinkSync(tempConfigPath);
            }
        }
    }

    async runAutomation(configPath) {
        return new Promise((resolve, reject) => {
            const automation = spawn('node', ['grok-automation.js', configPath], {
                cwd: __dirname,
                stdio: ['inherit', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            automation.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                process.stdout.write(text); // Echo to console
            });

            automation.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                process.stderr.write(text);
            });

            automation.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Automation failed with code ${code}: ${errorOutput}`));
                }
            });

            automation.on('error', (err) => {
                reject(err);
            });
        });
    }

    async findGeneratedVideo(sceneNumber) {
        const downloadsFolder = path.join(__dirname, 'downloads');

        if (!fs.existsSync(downloadsFolder)) {
            return null;
        }

        // Find most recent video file
        const files = fs.readdirSync(downloadsFolder)
            .filter(f => f.endsWith('.mp4'))
            .map(f => ({
                name: f,
                path: path.join(downloadsFolder, f),
                mtime: fs.statSync(path.join(downloadsFolder, f)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime);

        if (files.length > 0) {
            const latestVideo = files[0];

            // Rename with scene number
            const newName = `scene_${String(sceneNumber).padStart(3, '0')}_${Date.now()}.mp4`;
            const videosFolder = path.join(this.config.outputFolder, 'videos');
            fs.mkdirSync(videosFolder, { recursive: true });

            const newPath = path.join(videosFolder, newName);
            fs.renameSync(latestVideo.path, newPath);

            return newPath;
        }

        return null;
    }

    async delay(seconds) {
        this.progress.log(`⏳ Waiting ${seconds}s before next scene...`);
        return new Promise(resolve => setTimeout(resolve, seconds * 1000));
    }

    async run() {
        this.progress.log('🚀 Starting batch video generation');
        this.progress.log(`📁 Script: ${this.config.scriptFile}`);
        this.progress.log(`📁 Images: ${this.config.imagesFolder}`);
        this.progress.log(`📁 Output: ${this.config.outputFolder}`);
        this.progress.log(`⚙️  Config: ${this.config.duration}, ${this.config.resolution}`);
        this.progress.log(`✅ Skip completed: ${this.config.skipCompleted}`);

        // Parse script
        const allScenes = parseScriptFile(this.config.scriptFile);
        const scenes = filterScenes(allScenes, this.config.skipCompleted);

        // Match images
        const { imageMap, missing } = generateImagePathMap(scenes, this.config.imagesFolder);

        if (missing.length > 0) {
            this.progress.log(`⚠️  Warning: ${missing.length} images missing`);
            this.progress.log(`   Missing scenes: ${missing.join(', ')}`);
        }

        // Filter scenes with images
        const processableScenes = scenes.filter(s => imageMap[s.sceneNumber]);

        this.progress.data.totalScenes = processableScenes.length;
        this.progress.data.pending = processableScenes.map(s => s.sceneNumber);
        this.progress.save();

        this.progress.log(`\n📊 Total scenes to process: ${processableScenes.length}`);
        this.progress.log(`${'='.repeat(60)}\n`);

        // Process scenes
        for (let i = 0; i < processableScenes.length; i++) {
            if (this.isStopped) {
                this.progress.log('🛑 Batch processing stopped by user');
                break;
            }

            while (this.isPaused) {
                await this.delay(5);
            }

            const scene = processableScenes[i];
            const imagePath = imageMap[scene.sceneNumber];

            const result = await this.processScene(scene, imagePath);

            // Delay before next scene (except for last one)
            if (i < processableScenes.length - 1 && result.success) {
                await this.delay(this.config.delayBetweenScenes);
            }
        }

        // Final summary
        const progress = this.progress.getProgress();
        this.progress.log(`\n${'='.repeat(60)}`);
        this.progress.log('🎊 BATCH PROCESSING COMPLETED');
        this.progress.log(`${'='.repeat(60)}`);
        this.progress.log(`✅ Completed: ${progress.completed}`);
        this.progress.log(`❌ Failed: ${progress.failed}`);
        this.progress.log(`📊 Success Rate: ${progress.percentComplete}%`);
        this.progress.log(`📁 Videos saved to: ${path.join(this.config.outputFolder, 'videos')}`);
        this.progress.log(`📄 Log file: ${this.progress.logFile}`);

        return progress;
    }

    pause() {
        this.isPaused = true;
        this.progress.log('⏸️  Batch processing paused');
    }

    resume() {
        this.isPaused = false;
        this.progress.log('▶️  Batch processing resumed');
    }

    stop() {
        this.isStopped = true;
        this.progress.log('🛑 Stopping batch processing...');
    }
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 3) {
        console.log('Usage: node batch-process.js <script-file> <images-folder> <output-folder> [--duration 6s|10s] [--resolution 480p|720p] [--include-completed]');
        process.exit(1);
    }

    const config = {
        scriptFile: args[0],
        imagesFolder: args[1],
        outputFolder: args[2],
        duration: args.includes('--duration') ? args[args.indexOf('--duration') + 1] : '6s',
        resolution: args.includes('--resolution') ? args[args.indexOf('--resolution') + 1] : '720p',
        skipCompleted: !args.includes('--include-completed')
    };

    const processor = new BatchProcessor(config);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
        processor.stop();
    });

    processor.run()
        .then(progress => {
            process.exit(progress.failed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error('❌ Fatal error:', error);
            process.exit(1);
        });
}
