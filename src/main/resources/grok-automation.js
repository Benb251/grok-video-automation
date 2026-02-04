import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Starting Grok Video Generation Automation (CDP Mode)...\n');

// Load config from command line argument if provided
let videoConfig = {
    prompt: 'a cat playing with a butterfly in a sunny garden',
    imagePath: null,
    cookiePath: null,
    aspectRatio: '16:9',
    duration: '6s',
    resolution: '720p'
};

// Check if config file path is provided
if (process.argv[2]) {
    try {
        const configPath = path.resolve(process.argv[2]);
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

        if (configData.prompt) videoConfig.prompt = configData.prompt;
        if (configData.aspectRatio) videoConfig.aspectRatio = configData.aspectRatio;
        if (configData.duration) videoConfig.duration = configData.duration;
        if (configData.resolution) videoConfig.resolution = configData.resolution;
        if (configData.imagePath) videoConfig.imagePath = configData.imagePath;
        if (configData.cookiePath) videoConfig.cookiePath = configData.cookiePath;

        console.log('✓ Config loaded from:', configPath);
        console.log('📝 Prompt:', videoConfig.prompt);
        console.log('⚙️  Video config:', `${videoConfig.aspectRatio} | ${videoConfig.duration} | ${videoConfig.resolution}\n`);
    } catch (error) {
        console.error('✗ Error loading config file:', error.message);
        console.log('Using default configuration\n');
    }
}

// Configuration
const args = process.argv;
const portIndex = args.indexOf('--port');
const port = portIndex !== -1 ? args[portIndex + 1] : '9222';

const downloadDirIndex = args.indexOf('--download-dir');
const downloadDir = downloadDirIndex !== -1 ? args[downloadDirIndex + 1] : path.join(__dirname, 'downloads');

const CONFIG = {
    cdpUrl: `http://127.0.0.1:${port}`, // Chrome DevTools Protocol URL
    grokUrl: 'https://grok.com/imagine',
    downloadDir: downloadDir,
    videoConfig: videoConfig,
    polling: {
        maxAttempts: 60, // 3 minutes max wait time (Fail fast for retry)
        intervalMs: 3000  // Check every 3 seconds
    }
};

// Ensure download directory exists
if (!fs.existsSync(CONFIG.downloadDir)) {
    fs.mkdirSync(CONFIG.downloadDir, { recursive: true });
}

async function downloadVideo(page, url, filename) {
    console.log(`📥 Downloading video from: ${url}`);
    try {
        const response = await page.context().request.get(url);
        if (!response.ok()) {
            console.error(`❌ Download failed: ${response.status()} ${response.statusText()}`);
            return null;
        }
        const buffer = await response.body();

        const filePath = path.join(CONFIG.downloadDir, filename);
        fs.writeFileSync(filePath, buffer);

        const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
        console.log(`✅ Video saved: ${filePath} (${sizeMB} MB)`);
        return filePath;
    } catch (error) {
        console.error('❌ Download error:', error.message);
        return null;
    }
}

async function main() {
    let browser;

    try {
        // Connect to existing Chrome instance
        console.log(`🔌 Connecting to Chrome on ${CONFIG.cdpUrl}...`);
        browser = await chromium.connectOverCDP(CONFIG.cdpUrl);

        const context = browser.contexts()[0];

        // INJECT COOKIES (if provided)
        if (CONFIG.videoConfig.cookiePath && fs.existsSync(CONFIG.videoConfig.cookiePath)) {
            try {
                console.log(`🍪 Injecting cookies from: ${CONFIG.videoConfig.cookiePath}`);
                const cookieContent = fs.readFileSync(CONFIG.videoConfig.cookiePath, 'utf-8');
                let cookies = JSON.parse(cookieContent);

                // Normalize cookies (handle J2Team/Cookie-Editor format)
                if (!Array.isArray(cookies)) {
                    // Sometimes cookies are wrapped in an object
                    if (cookies.cookies) cookies = cookies.cookies;
                }

                if (Array.isArray(cookies)) {
                    // Ensure cookies have required fields for Playwright
                    const validCookies = cookies.map(c => ({
                        name: c.name,
                        value: c.value,
                        domain: c.domain || '.grok.com',
                        path: c.path || '/',
                        secure: c.secure !== undefined ? c.secure : true,
                        httpOnly: c.httpOnly !== undefined ? c.httpOnly : true,
                        sameSite: ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax', // Default to Lax if invalid
                        expires: c.expirationDate || (Date.now() / 1000 + 31536000)
                    }));

                    await context.addCookies(validCookies);
                    console.log(`   ✅ Injected ${validCookies.length} cookies`);
                } else {
                    console.log('   ⚠️ Invalid cookie format: Not an array');
                }
            } catch (e) {
                console.error(`   ❌ Failed to inject cookies: ${e.message}`);
            }
        }
        const page = context.pages()[0] || await context.newPage();

        console.log('✅ Connected to Chrome!');

        // Grant clipboard permissions
        await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
            origin: 'https://grok.com'
        });

        // Navigate to Grok Imagine base page for batch processing
        // CRITICAL: Must reset to /imagine (not /imagine/post/xxx) for each new scene
        const currentUrl = page.url();
        const isOnBaseImagine = currentUrl === 'https://grok.com/imagine' || currentUrl === 'https://grok.com/imagine/';

        if (!isOnBaseImagine) {
            console.log(`📍 Navigating to https://grok.com/imagine...`);
            console.log(`   (Current page: ${currentUrl})`);
            await page.goto('https://grok.com/imagine', { waitUntil: 'domcontentloaded' });
            console.log('⏳ Waiting for UI to load...');
            await page.waitForTimeout(3000); // Wait for initialization
        } else {
            console.log(`✅ Already on Grok Imagine base page`);
            await page.waitForTimeout(1000); // Small wait for stability
        }

        // VERIFY LOGIN STATUS
        console.log('🔄 Reloading page to apply cookies...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        const isLoggedOut = await page.locator('button:has-text("Sign in")').count() > 0 ||
            await page.locator('a[href="/signin"]').count() > 0;

        if (isLoggedOut) {
            console.error('❌ ERROR: Not logged in! Cookie injection failed or cookies expired.');
            const screenshotPath = path.join(CONFIG.downloadDir, 'login_failed_screenshot.png');
            await page.screenshot({ path: screenshotPath });
            console.log(`📸 Debug screenshot saved to: ${screenshotPath}`);
            throw new Error('Login failed - Cookies invalid or expired');
        } else {
            console.log('✅ Login verified successfully!');
        }

        console.log('✅ Page ready!\n');

        // ==========================================
        // VIDEO GENERATION FLOW
        // ==========================================

        if (CONFIG.videoConfig.imagePath && CONFIG.videoConfig.imagePath.trim() !== "") {
            // ==========================================
            // IMAGE-TO-VIDEO FLOW
            // ==========================================
            console.log('🖼️ Mode: Image-to-Video detected');
            console.log(`📤 Uploading image: ${CONFIG.videoConfig.imagePath}`);

            // 1. Click Attach Button (Paperclip)
            const attachBtn = page.locator('button[aria-label="Attach files"], button[aria-label="Attach"]').first();
            await attachBtn.waitFor({ state: 'visible', timeout: 10000 });
            await attachBtn.click();
            await page.waitForTimeout(2000);

            // 2. Click "Upload a file" from menu
            const uploadOption = page.locator('div[role="menuitem"], button').filter({ hasText: 'Upload a file' }).first();

            // Start file chooser *before* clicking upload
            const fileChooserPromise = page.waitForEvent('filechooser');
            await uploadOption.click();
            const fileChooser = await fileChooserPromise;

            // 3. Select file
            await fileChooser.setFiles(CONFIG.videoConfig.imagePath);
            console.log('✅ File selected in system dialog');

            // 4. Wait for upload to complete and URL to change to /post/*
            console.log('⏳ Waiting for image upload and page transition...');

            // Wait for URL to change to /post/* format (Image-to-Video page)
            try {
                await page.waitForFunction(
                    () => window.location.href.includes('/imagine/post/'),
                    { timeout: 30000 }
                );
                const newUrl = page.url();
                console.log(`✅ Transitioned to Image-to-Video page: ${newUrl}`);
            } catch (e) {
                console.log('⚠️ URL did not change to /post/* format, but continuing...');
                console.log(`   Current URL: ${page.url()}`);
            }

            // Wait for the input area to be ready
            console.log('⏳ Waiting for input area to be visible...');
            try {
                const promptArea = page.locator('textarea[aria-label="Make a video"]').first();
                await promptArea.waitFor({ state: 'visible', timeout: 15000 });
                console.log('✅ Input area ready');
            } catch (e) {
                console.log(`⚠️ Input area not detected within 15s: ${e.message}`);
                console.log('   Continuing anyway...');
            }
            await page.waitForTimeout(2000); // Extra wait for stability

            // 5. Enter Prompt (Copy-Paste)
            // Use the verified selector for Image-to-Video input
            const customizingInput = page.locator('textarea[aria-label="Make a video"]').first();

            // No fallback needed - we have the exact selector
            console.log('✍️ Targeting input: Image-to-Video textarea');
            await customizingInput.click();
            console.log('   Input clicked, waiting 3s...');
            await page.waitForTimeout(3000); // WAIT 3 SECONDS

            console.log(`   Pasting prompt...`);

            // Clipboard paste trick
            await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
            await customizingInput.press('Control+V');

            console.log('   Paste command sent, waiting 3s...');
            await page.waitForTimeout(3000); // WAIT 3 SECONDS

            // Verify if text was pasted
            const inputValue = await customizingInput.inputValue().catch(async () => await customizingInput.innerText());
            if (!inputValue || inputValue.length < 5) {
                console.log('⚠️ Paste might have failed, trying fallback typing...');
                await customizingInput.fill(CONFIG.videoConfig.prompt);
                await page.waitForTimeout(2000);
            } else {
                console.log('✅ Prompt paste verified');
            }

            // ==========================================
            // STEP 5.5: CONFIGURE VIDEO OPTIONS
            // ==========================================
            console.log('⚙️ Configuring Video Options...');

            // VERIFIED: Image-to-Video uses "Video Options"
            const optionsBtn = page.locator('button[aria-label="Video Options"]').first();

            try {
                // Wait for button to be ready
                await optionsBtn.waitFor({ state: 'visible', timeout: 5000 });
                console.log('   Found Video Options button, clicking...');
                await optionsBtn.click();

                // CRITICAL: Wait longer for popover menu to fully render
                await page.waitForTimeout(1500);

                // Duration - using aria-label for precise targeting
                const duration = CONFIG.videoConfig.duration;
                try {
                    const durationBtn = page.locator(`button[aria-label="${duration}"]`);
                    if (await durationBtn.isVisible({ timeout: 2000 })) {
                        await durationBtn.click();
                        console.log(`   ✅ Set Duration: ${duration}`);
                        await page.waitForTimeout(500);
                    } else {
                        console.log(`   ⚠️ Duration aria-label not found, trying text selector...`);
                        const durationText = page.getByRole('button').filter({ hasText: duration });
                        await durationText.click({ timeout: 2000 });
                        console.log(`   ✅ Set Duration (text): ${duration}`);
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set duration: ${e.message}`); }

                // IMPORTANT: Menu auto-closes after clicking duration
                // Need to reopen menu to select resolution
                console.log('   🔄 Reopening menu for resolution selection...');
                await page.waitForTimeout(800);
                await optionsBtn.click();
                await page.waitForTimeout(1500);

                // Resolution - using multiple selector strategies
                const resolution = CONFIG.videoConfig.resolution;
                try {
                    // Try aria-label first
                    let resolutionSet = false;
                    const resolutionBtn = page.locator(`button[aria-label="${resolution}"]`);

                    if (await resolutionBtn.count() > 0 && await resolutionBtn.first().isVisible({ timeout: 2000 })) {
                        await resolutionBtn.first().click();
                        console.log(`   ✅ Set Resolution: ${resolution}`);
                        resolutionSet = true;
                    } else {
                        // Fallback: Try to find button containing text
                        console.log(`   ⚠️ Resolution aria-label not found, trying text selector...`);
                        const resolutionText = page.getByRole('button').filter({ hasText: resolution });
                        if (await resolutionText.count() > 0) {
                            await resolutionText.first().click({ timeout: 2000 });
                            console.log(`   ✅ Set Resolution (text): ${resolution}`);
                            resolutionSet = true;
                        }
                    }

                    if (resolutionSet) {
                        await page.waitForTimeout(500);
                    } else {
                        console.log(`   ⚠️ Could not find Resolution button for ${resolution}`);
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set resolution: ${e.message}`); }

                // NOTE: Aspect Ratio is NOT available in Image-to-Video mode
                // The aspect ratio is determined by the uploaded image
                console.log('   ℹ️ Aspect Ratio not configurable in Image-to-Video mode (inherited from image)');

                // CRITICAL FIX: DO NOT PRESS ESCAPE!
                // Escape key triggers "Back" navigation in Grok, returning to /imagine
                // Instead, we click Make video button directly with the menu still open
                console.log('   ✅ Video options configured (menu left open)');

            } catch (e) {
                console.log(`⚠️ Video Options button not found or error occurred: ${e.message}`);
                console.log('   Skipping video configuration.');
            }

            // NO REFOCUS NEEDED - We're not closing the menu
            // Just take debug screenshot and proceed to submit

            // DEBUG: Take screenshot to see UI state
            await page.screenshot({ path: path.join(__dirname, 'debug_after_paste.png') });
            console.log('📸 Debug screenshot saved: debug_after_paste.png');

            // 6. Submit
            console.log('🎬 Generating video...');
            await page.waitForTimeout(1500); // Wait for button to become enabled

            // Verify we're still on the Image-to-Video page (/post/*)
            const currentUrl = page.url();
            if (!currentUrl.includes('/imagine/post/')) {
                console.log(`❌ ERROR: Page navigated away from Image-to-Video interface!`);
                console.log(`   Expected URL pattern: https://grok.com/imagine/post/*`);
                console.log(`   Current URL: ${currentUrl}`);
                console.log('   This usually means the image upload failed or the UI was interrupted.');
                console.log('   Attempting to continue anyway, but video generation might fail...');
            } else {
                console.log(`✅ Still on Image-to-Video page: ${currentUrl}`);
            }

            // In Image-to-Video mode, the submit button has aria-label="Make video"
            // Try "Make video" first (Image-to-Video), then "Submit" (fallback)
            let buttonFound = false;

            try {
                // Priority 1: "Make video" button (Image-to-Video mode)
                const makeVideoBtn = page.locator('button[aria-label="Make video"]').first();
                if (await makeVideoBtn.count() > 0 && await makeVideoBtn.isVisible({ timeout: 2000 })) {
                    console.log('   Found "Make video" button, clicking...');
                    await makeVideoBtn.click();
                    buttonFound = true;
                    console.log('   ✅ Make video button clicked');
                } else {
                    // Priority 2: "Submit" button (Text-to-Video mode fallback)
                    console.log('   "Make video" not found, trying "Submit"...');
                    const submitBtn = page.locator('button[aria-label="Submit"]').first();
                    if (await submitBtn.count() > 0 && await submitBtn.isVisible({ timeout: 2000 })) {
                        console.log('   Found "Submit" button, clicking...');
                        await submitBtn.click();
                        buttonFound = true;
                        console.log('   ✅ Submit button clicked');
                    }
                }
            } catch (e) {
                console.log(`   ⚠️ Error finding button: ${e.message}`);
            }

            // Final fallback: Enter key
            if (!buttonFound) {
                console.log('   No submit button found, using Enter key...');
                await page.keyboard.press('Enter');
                console.log('   ✅ Enter key pressed');
            }

            console.log('✅ Request sent');

        } else {
            // ==========================================
            // TEXT-TO-VIDEO FLOW (Standard)
            // ==========================================
            console.log('📝 Mode: Text-to-Video');

            // Step 1: Open Settings
            console.log('⚙️ Step 1: Configuring Video Settings...');

            const settingsTrigger = page.locator('button', { hasText: 'Video' }).first();
            await settingsTrigger.waitFor({ state: 'visible', timeout: 10000 });

            if (await settingsTrigger.isVisible()) {
                await settingsTrigger.click();
                console.log('   Opened settings menu');
                await page.waitForTimeout(1000);

                // Duration
                const duration = CONFIG.videoConfig.duration;
                try {
                    const durationOption = page.locator(`text=${duration}`).last();
                    if (await durationOption.isVisible()) {
                        await durationOption.click();
                        console.log(`   ✅ Set Duration: ${duration}`);
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set duration: ${e.message}`); }

                // Resolution
                const resolution = CONFIG.videoConfig.resolution;
                try {
                    const resolutionOption = page.locator(`text=${resolution}`).last();
                    if (await resolutionOption.isVisible()) {
                        await resolutionOption.click();
                        console.log(`   ✅ Set Resolution: ${resolution}`);
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set resolution: ${e.message}`); }

                // Aspect Ratio (Global Indexing)
                const aspectStr = CONFIG.videoConfig.aspectRatio;
                try {
                    let globalIndex = -1;
                    if (aspectStr === '16:9') globalIndex = 8;
                    else if (aspectStr === '9:16') globalIndex = 4;
                    else if (aspectStr === '1:1') globalIndex = 6;

                    if (globalIndex !== -1) {
                        // Find container with "Aspect Ratio" and "6s"
                        const container = page.locator('div', { has: page.locator('text=Aspect Ratio') }).filter({ has: page.locator('text=6s') }).last();
                        if (await container.isVisible()) {
                            const buttonsInMenu = container.locator('button');
                            if (await buttonsInMenu.count() >= 9) {
                                await buttonsInMenu.nth(globalIndex).click();
                                console.log(`   ✅ Set Aspect Ratio: ${aspectStr} (Menu Index ${globalIndex})`);
                            }
                        }
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set aspect ratio: ${e.message}`); }

                // Mode: Video
                try {
                    const videoModeBtn = page.locator('div, button').filter({ hasText: 'Generate a video' }).last();
                    if (await videoModeBtn.isVisible()) {
                        await videoModeBtn.click();
                        console.log('   ✅ Selected Mode: Video');
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set Video mode: ${e.message}`); }

                await page.waitForTimeout(500);

                // Close settings
                const promptArea = page.locator('textarea, div[contenteditable="true"]').first();
                if (await promptArea.isVisible()) await promptArea.click();
                else await page.keyboard.press('Escape');
                await page.waitForTimeout(500);

            } else {
                console.log('⚠️ Could not find Settings/Video menu button. Using defaults.');
            }

            // Step 2: Prompt (Copy-Paste)
            console.log(`✍️  Step 2: Pasting prompt: "${CONFIG.videoConfig.prompt}"`);
            let promptInput = page.locator('textarea');
            if (await promptInput.count() === 0) {
                promptInput = page.locator('div[contenteditable="true"], div[role="textbox"]');
            }

            await promptInput.first().click();
            await page.waitForTimeout(2000); // WAIT 2 SECONDS

            // Clipboard paste trick
            await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
            await promptInput.first().press('Control+V');

            await page.waitForTimeout(2000); // WAIT 2 SECONDS
            console.log('✅ Prompt pasted');

            // Step 3: Submit
            console.log('🎬 Step 3: Generating video...');
            await page.keyboard.press('Enter');
            console.log('✅ Request sent (Enter key)');
        }

        console.log('⏳ Waiting for video generation...');

        // ==========================================
        // STEP 4: POLL FOR VIDEO
        // ==========================================

        try {
            // Capture existing videos to ignore them
            const existingVideos = await page.evaluate(() =>
                Array.from(document.querySelectorAll('video')).map(v => v.src)
            );

            let videoSrc = null;
            let attempts = 0;

            while (!videoSrc && attempts < CONFIG.polling.maxAttempts) {
                await page.waitForTimeout(CONFIG.polling.intervalMs);

                // Read progress percentage (DISABLED - Might be causing crashes)
                /*
                try {
                    // Look for any element containing number + % (e.g. "3%")
                    const progressText = await page.evaluate(() => {
                        const el = Array.from(document.querySelectorAll('*')).find(e =>
                            e.innerText && /^\d+%$/.test(e.innerText.trim()) && e.offsetParent !== null
                        );
                        return el ? el.innerText.trim() : null;
                    });

                    if (progressText) {
                        process.stdout.write(` [${progressText}]`);
                    } else {
                        process.stdout.write('.');
                    }
                } catch (e) {
                    process.stdout.write('.');
                }
                */
                process.stdout.write('.');

                videoSrc = await page.evaluate((known) => {
                    const videos = Array.from(document.querySelectorAll('video'));
                    const newVideo = videos.find(v =>
                        v.src &&
                        !v.src.startsWith('blob:') &&
                        !known.includes(v.src)
                    );
                    return newVideo ? newVideo.src : null;
                }, existingVideos);

                attempts++;
            }

            console.log('\n');

            if (videoSrc) {
                console.log(`🎉 Video generated successfully!`);
                console.log(`URL: ${videoSrc}\n`);

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const filename = `grok_video_${timestamp}.mp4`;

                await downloadVideo(page, videoSrc, filename);

                // Disconnect to clean up context, but keep browser open for next job
                console.log('\n🔒 Disconnecting from browser...');
                await browser.disconnect();
                console.log('✅ Disconnected successfully!');
                console.log('\n🎊 ALL DONE! Video downloaded.');
            } else {
                console.error('❌ Timeout: Video did not appear after 6 minutes');
                const screenshotPath = path.join(__dirname, 'error_screenshot.png');
                await page.screenshot({ path: screenshotPath });
                console.log(`Screenshot saved: ${screenshotPath}`);
                process.exit(1); // Exit with error code
            }
        } catch (error) {
            console.error('❌ Error during video polling:', error.message);
            const screenshotPath = path.join(__dirname, 'error_screenshot.png');
            await page.screenshot({ path: screenshotPath }).catch(() => { });
            console.log(`Screenshot saved: ${screenshotPath}`);
            throw error; // Re-throw to be caught by main try-catch
        }

    } catch (error) {
        console.error('\n❌ Error:', error.message);

        if (error.message.includes('ECONNREFUSED')) {
            console.log('\n💡 Solution:');
            console.log('1. Launch Chrome with debugging:');
            console.log('   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\chrome-debug-profile"');
            console.log('2. Navigate to https://grok.com/imagine');
            console.log('3. Run this script again');
        }
        process.exit(1); // Ensure non-zero exit code on error
    } finally {
        // Only log here if there was an error and browser is still open
        if (browser && browser.isConnected()) {
            console.log('\n⚠️ Process ended with error. Disconnecting...');
            try { await browser.disconnect(); } catch (e) { }
        } else {
            console.log('\n✅ Process complete.');
        }
    }
}

// Run automation
main().catch(err => {
    console.error(err);
    process.exit(1);
});
