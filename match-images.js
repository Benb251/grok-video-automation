import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Find image file for a given scene number
 * @param {number} sceneNumber - Scene number
 * @param {string} imagesFolder - Path to images folder
 * @returns {string|null} Image path or null if not found
 */
export function findImageForScene(sceneNumber, imagesFolder) {
    // Pattern: "Scene 1.png", "Scene 2.png", etc.
    const imageName = `Scene ${sceneNumber}.png`;
    const imagePath = path.join(imagesFolder, imageName);

    if (fs.existsSync(imagePath)) {
        return imagePath;
    }

    // Try alternative extensions
    const alternatives = ['.jpg', '.jpeg', '.PNG', '.JPG', '.JPEG'];
    for (const ext of alternatives) {
        const altName = `Scene ${sceneNumber}${ext}`;
        const altPath = path.join(imagesFolder, altName);
        if (fs.existsSync(altPath)) {
            return altPath;
        }
    }

    return null;
}

/**
 * Generate image path map for all scenes
 * @param {Array} scenes - Array of scene objects
 * @param {string} imagesFolder - Path to images folder
 * @returns {Object} Map of scene number to image path
 */
export function generateImagePathMap(scenes, imagesFolder) {
    console.log(`🖼️  Matching images from: ${imagesFolder}`);

    const imageMap = {};
    const missing = [];

    scenes.forEach(scene => {
        const imagePath = findImageForScene(scene.sceneNumber, imagesFolder);
        if (imagePath) {
            imageMap[scene.sceneNumber] = imagePath;
        } else {
            missing.push(scene.sceneNumber);
        }
    });

    console.log(`✅ Found images: ${Object.keys(imageMap).length}/${scenes.length}`);

    if (missing.length > 0) {
        console.log(`⚠️  Missing images for scenes: ${missing.join(', ')}`);
    }

    return { imageMap, missing };
}

/**
 * Validate that image exists
 * @param {string} imagePath - Path to image
 * @returns {boolean} True if exists
 */
export function validateImageExists(imagePath) {
    return fs.existsSync(imagePath);
}

/**
 * Get image file size
 * @param {string} imagePath - Path to image
 * @returns {number} File size in bytes
 */
export function getImageSize(imagePath) {
    const stats = fs.statSync(imagePath);
    return stats.size;
}

/**
 * Validate images folder
 * @param {string} imagesFolder - Path to images folder
 * @returns {Object} Validation result
 */
export function validateImagesFolder(imagesFolder) {
    if (!fs.existsSync(imagesFolder)) {
        return {
            valid: false,
            error: 'Folder does not exist'
        };
    }

    const stats = fs.statSync(imagesFolder);
    if (!stats.isDirectory()) {
        return {
            valid: false,
            error: 'Path is not a directory'
        };
    }

    // Count image files
    const files = fs.readdirSync(imagesFolder);
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg)$/i.test(f));

    return {
        valid: true,
        totalFiles: files.length,
        imageFiles: imageFiles.length,
        images: imageFiles
    };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node match-images.js <images-folder> <scenes-json>');
        process.exit(1);
    }

    const imagesFolder = args[0];
    const scenesPath = args[1];

    try {
        // Validate folder
        console.log('📁 Validating images folder...');
        const validation = validateImagesFolder(imagesFolder);

        if (!validation.valid) {
            console.error(`❌ Error: ${validation.error}`);
            process.exit(1);
        }

        console.log(`✅ Folder valid: ${validation.imageFiles} image files found`);

        // Load scenes
        const scenes = JSON.parse(fs.readFileSync(scenesPath, 'utf-8'));
        console.log(`📋 Loaded ${scenes.length} scenes`);

        // Match images
        const { imageMap, missing } = generateImagePathMap(scenes, imagesFolder);

        // Display sample mappings
        console.log('\n📊 Sample mappings:');
        Object.entries(imageMap).slice(0, 5).forEach(([sceneNum, imgPath]) => {
            const size = (getImageSize(imgPath) / 1024).toFixed(1);
            console.log(`  Scene ${sceneNum}: ${path.basename(imgPath)} (${size} KB)`);
        });

        if (missing.length > 0) {
            console.log(`\n⚠️  Missing ${missing.length} images`);
            process.exit(1);
        } else {
            console.log('\n✅ All images matched successfully!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}
