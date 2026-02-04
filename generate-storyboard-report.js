import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate storyboard report from batch results
 * @param {string} outputFolder - Batch output folder
 * @param {Object} scenesMap - Map of scene number to scene data
 */
export function generateStoryboardReport(outputFolder, scenesMap) {
    const progressFile = path.join(outputFolder, 'progress', 'batch_progress.json');

    if (!fs.existsSync(progressFile)) {
        throw new Error('Progress file not found');
    }

    const progress = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));

    // Build scenes data
    const scenes = [];

    // Add completed scenes
    progress.completed.forEach(item => {
        const scene = scenesMap[item.sceneNumber] || {};
        scenes.push({
            sceneNumber: item.sceneNumber,
            status: 'completed',
            prompt: scene.prompt || '',
            videoPath: path.relative(outputFolder, item.videoPath),
            duration: '6s', // From config
            resolution: '720p', // From config
            lighting: scene.lighting || '',
            camera: scene.camera || '',
            environment: scene.environment || '',
            completedAt: item.completedAt
        });
    });

    // Add failed scenes
    progress.failed.forEach(item => {
        const scene = scenesMap[item.sceneNumber] || {};
        scenes.push({
            sceneNumber: item.sceneNumber,
            status: 'failed',
            prompt: scene.prompt || '',
            error: item.error,
            duration: '6s',
            resolution: '720p',
            lighting: scene.lighting || '',
            camera: scene.camera || '',
            environment: scene.environment || '',
            failedAt: item.failedAt
        });
    });

    // Add pending scenes
    progress.pending.forEach(sceneNumber => {
        const scene = scenesMap[sceneNumber] || {};
        scenes.push({
            sceneNumber: sceneNumber,
            status: 'pending',
            prompt: scene.prompt || '',
            duration: '6s',
            resolution: '720p',
            lighting: scene.lighting || '',
            camera: scene.camera || '',
            environment: scene.environment || ''
        });
    });

    // Sort by scene number
    scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);

    const report = {
        generatedAt: new Date().toISOString(),
        stats: {
            total: progress.totalScenes,
            completed: progress.completed.length,
            failed: progress.failed.length,
            pending: progress.pending.length
        },
        scenes: scenes
    };

    // Save report
    const reportPath = path.join(outputFolder, 'batch-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log(`✅ Storyboard report generated: ${reportPath}`);

    return reportPath;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node generate-storyboard-report.js <output-folder> <scenes-json>');
        process.exit(1);
    }

    const outputFolder = args[0];
    const scenesPath = args[1];

    try {
        const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));
        const scenesMap = {};
        scenes.forEach(s => scenesMap[s.sceneNumber] = s);

        const reportPath = generateStoryboardReport(outputFolder, scenesMap);

        console.log('\n📊 Storyboard report ready!');
        console.log(`   Open: ${path.join(outputFolder, 'storyboard.html')}`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}
