import fs from 'fs';

export interface Scene {
    sceneNumber: number;
    isDone: boolean;
    prompt: string;
    environment?: string;
    lighting?: string;
    camera?: string;
    voice?: string;
    sound?: string;
    music?: string;
    status?: 'pending' | 'generating' | 'completed' | 'failed';
    videoPath?: string;
    imagePath?: string;
    error?: string;
    workerId?: number;
}

export function parseScriptFile(scriptPath: string): Scene[] {
    console.log(`📖 Parsing script: ${scriptPath}`);

    // Read and normalize line endings
    const content = fs.readFileSync(scriptPath, 'utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = content.split('\n');

    const scenes: Scene[] = [];
    let currentScene: Scene | null = null;
    let currentPrompt = '';

    const parseMetadata = (scene: Scene, metadataText: string) => {
        const fields = ['ENVIRONMENT', 'LIGHTING', 'CAMERA', 'Voice', 'Sound', 'Music'];
        fields.forEach(field => {
            const regex = new RegExp(`${field}:\\s*([^|]+)`, 'i');
            const match = metadataText.match(regex);
            if (match) {
                (scene as any)[field.toLowerCase()] = match[1].trim();
            }
        });
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect scene header: "Scene 1:" or "Scene 16 ( done):"
        const sceneMatch = line.match(/^Scene\s+(\d+)\s*(\(\s*done\s*\))?:/i);

        if (sceneMatch) {
            // Save previous scene
            if (currentScene && currentPrompt) {
                currentScene.prompt = currentPrompt.trim();
                scenes.push(currentScene);
            }

            // Start new scene
            const sceneNumber = parseInt(sceneMatch[1]);
            const isDone = !!sceneMatch[2];

            currentScene = {
                sceneNumber,
                isDone,
                prompt: '',
            };
            currentPrompt = '';

            // Extract prompt from same line
            const promptStart = line.indexOf(':') + 1;
            const promptLine = line.substring(promptStart).trim();

            if (promptLine) {
                // Use FULL content as prompt (Fix: Do not split at |)
                currentPrompt = promptLine;

                // Parse metadata if present
                if (promptLine.includes('|')) {
                    parseMetadata(currentScene, promptLine);
                }
            }
        } else if (currentScene && line && !line.startsWith('=')) {
            // Append continuation lines
            currentPrompt += ' ' + line;

            // Update metadata if line contains separator
            if (line.includes('|')) {
                parseMetadata(currentScene, line);
            }
        }
    }

    // Save last scene
    if (currentScene && currentPrompt) {
        currentScene.prompt = currentPrompt.trim();
        scenes.push(currentScene);
    }

    return scenes;
}
