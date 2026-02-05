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
    let content = fs.readFileSync(scriptPath, 'utf-8');
    // Strip BOM if present
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
        // Relaxed regex matches "Scene 1:" or "Scene 1 (done) :"
        const sceneMatch = line.match(/^Scene\s+(\d+)[^:]*:/i);

        if (sceneMatch) {
            // Save previous scene
            if (currentScene && currentPrompt) {
                currentScene.prompt = currentPrompt.trim();
                scenes.push(currentScene);
            }

            // Start new scene
            const sceneNumber = parseInt(sceneMatch[1]);
            const isDone = line.toLowerCase().includes('(done)');

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
                // Use FULL content as prompt
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

export function updateScriptScene(scriptPath: string, sceneNumber: number, newPrompt: string): boolean {
    try {
        console.log(`[ScriptParser] Request update for Scene ${sceneNumber}`);
        let content = fs.readFileSync(scriptPath, 'utf-8');
        // Strip BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
            content = content.slice(1);
        }
        content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        const lines = content.split('\n');

        let startLine = -1;
        let endLine = -1;

        // Find start and end of the scene block
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            // Relaxed regex: Matches "Scene 1:" or "Scene 1 (done) :" or "Scene 1   :"
            const sceneMatch = line.match(/^Scene\s+(\d+)[^:]*:/i);

            if (sceneMatch) {
                const num = parseInt(sceneMatch[1]);
                if (num === sceneNumber) {
                    startLine = i;
                    console.log(`[ScriptParser] Found start of Scene ${sceneNumber} at line ${i}`);
                } else if (startLine !== -1) {
                    // Found the next scene, so previous scene ends here
                    endLine = i;
                    console.log(`[ScriptParser] Found start of next Scene (${num}) at line ${i}, ending previous scene`);
                    break;
                }
            }
        }

        if (startLine === -1) {
            console.error(`[ScriptParser] Scene ${sceneNumber} NOT FOUND in script`);
            return false;
        }
        if (endLine === -1) endLine = lines.length; // Scene goes to EOF

        // formatting
        const header = `Scene ${sceneNumber}:`;

        // Split new prompt by newlines to preserve formatting
        const promptLines = newPrompt.split('\n');

        // Construct the new block of lines
        const newBlockLines = [
            `${header} ${promptLines[0] || ''}`, // First line with header
            ...promptLines.slice(1)             // Subsequent lines
        ];

        console.log(`[ScriptParser] Replacing lines ${startLine} to ${endLine} with new content`);

        // Replace the old range of lines with the new lines
        // splice expects individual args for items to insert
        lines.splice(startLine, endLine - startLine, ...newBlockLines, '');

        // Write back
        fs.writeFileSync(scriptPath, lines.join('\n'), 'utf-8');
        console.log(`[ScriptParser] Successfully wrote to ${scriptPath}`);
        return true;

    } catch (e) {
        console.error('Error updating script:', e);
        return false;
    }
}
