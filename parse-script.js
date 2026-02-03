import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse script file to extract scene information
 * @param {string} scriptPath - Path to script file
 * @returns {Array} Array of scene objects
 */
export function parseScriptFile(scriptPath) {
    console.log(`📖 Parsing script: ${scriptPath}`);

    const content = fs.readFileSync(scriptPath, 'utf-8');
    const lines = content.split('\n');

    const scenes = [];
    let currentScene = null;
    let currentPrompt = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect scene header: "Scene 1:" or "Scene 16 ( done):"
        const sceneMatch = line.match(/^Scene\s+(\d+)\s*(\(\s*done\s*\))?:/i);

        if (sceneMatch) {
            // Save previous scene if exists
            if (currentScene && currentPrompt) {
                currentScene.prompt = currentPrompt.trim();
                scenes.push(currentScene);
            }

            // Start new scene
            const sceneNumber = parseInt(sceneMatch[1]);
            const isDone = !!sceneMatch[2];

            currentScene = {
                sceneNumber: sceneNumber,
                isDone: isDone,
                prompt: '',
                environment: '',
                lighting: '',
                camera: '',
                voice: '',
                sound: '',
                music: ''
            };
            currentPrompt = '';

            // Extract prompt from same line (after "Scene X:")
            const promptStart = line.indexOf(':') + 1;
            const promptLine = line.substring(promptStart).trim();

            if (promptLine) {
                // Extract only the text before first "|" (metadata separator)
                const promptParts = promptLine.split('|');
                currentPrompt = promptParts[0].trim();

                // Parse metadata if present
                if (promptParts.length > 1) {
                    parseMetadata(currentScene, promptParts.slice(1).join('|'));
                }
            }
        } else if (currentScene && line.includes('|')) {
            // Continue parsing prompt and metadata on next lines
            const parts = line.split('|');

            if (!currentPrompt && parts[0].trim()) {
                currentPrompt = parts[0].trim();
            }

            if (parts.length > 1) {
                parseMetadata(currentScene, parts.slice(1).join('|'));
            }
        } else if (currentScene && line && !line.startsWith('=')) {
            // Continue prompt on multiple lines (before |)
            if (!currentPrompt.includes('ENVIRONMENT') && !line.includes('ENVIRONMENT')) {
                currentPrompt += ' ' + line;
            }
        }
    }

    // Save last scene
    if (currentScene && currentPrompt) {
        currentScene.prompt = currentPrompt.trim();
        scenes.push(currentScene);
    }

    console.log(`✅ Parsed ${scenes.length} scenes`);
    console.log(`   - Completed: ${scenes.filter(s => s.isDone).length}`);
    console.log(`   - Pending: ${scenes.filter(s => !s.isDone).length}`);

    return scenes;
}

/**
 * Parse metadata fields from scene line
 * @param {Object} scene - Scene object to update
 * @param {string} metadataText - Metadata text to parse
 */
function parseMetadata(scene, metadataText) {
    const fields = ['ENVIRONMENT', 'LIGHTING', 'CAMERA', 'Voice', 'Sound', 'Music'];

    fields.forEach(field => {
        const regex = new RegExp(`${field}:\\s*([^|]+)`, 'i');
        const match = metadataText.match(regex);
        if (match) {
            scene[field.toLowerCase()] = match[1].trim();
        }
    });
}

/**
 * Filter scenes based on completion status
 * @param {Array} scenes - Array of all scenes
 * @param {boolean} skipCompleted - Whether to skip completed scenes
 * @returns {Array} Filtered scenes
 */
export function filterScenes(scenes, skipCompleted = true) {
    if (!skipCompleted) {
        return scenes;
    }

    const filtered = scenes.filter(s => !s.isDone);
    console.log(`🔍 Filtered: ${filtered.length} pending scenes (skipped ${scenes.length - filtered.length} completed)`);
    return filtered;
}

/**
 * Get scene by number
 * @param {Array} scenes - Array of scenes
 * @param {number} sceneNumber - Scene number to find
 * @returns {Object|null} Scene object or null
 */
export function getSceneByNumber(scenes, sceneNumber) {
    return scenes.find(s => s.sceneNumber === sceneNumber) || null;
}

/**
 * Save parsed scenes to JSON file
 * @param {Array} scenes - Array of scenes
 * @param {string} outputPath - Output JSON path
 */
export function saveScenesJSON(scenes, outputPath) {
    fs.writeFileSync(outputPath, JSON.stringify(scenes, null, 2));
    console.log(`💾 Saved scenes to: ${outputPath}`);
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.log('Usage: node parse-script.js <script-file> [--output <json-file>]');
        process.exit(1);
    }

    const scriptPath = args[0];
    const outputIndex = args.indexOf('--output');
    const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : null;

    try {
        const scenes = parseScriptFile(scriptPath);

        if (outputPath) {
            saveScenesJSON(scenes, outputPath);
        }

        // Display sample
        console.log('\n📋 Sample scenes:');
        scenes.slice(0, 3).forEach(scene => {
            console.log(`\nScene ${scene.sceneNumber}${scene.isDone ? ' (done)' : ''}:`);
            console.log(`  Prompt: ${scene.prompt.substring(0, 100)}...`);
            console.log(`  Lighting: ${scene.lighting}`);
            console.log(`  Camera: ${scene.camera}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}
