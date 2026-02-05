import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Conditionally define __filename/__dirname only if not already defined (ESM vs CJS compatibility)
var __filename = typeof __filename !== 'undefined' ? __filename : fileURLToPath(import.meta.url);
var __dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(__filename);

console.log('🚀 Starting Grok Video Generation Automation (CDP Mode)...\n');
console.log('ℹ️ Script Version: NATIVE_DOM_CLICK_FIX');

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
        // CRITICAL: ALWAYS reset to /imagine (not /imagine/post/xxx) for each new scene
        const currentUrl = page.url();
        console.log(`📍 Current page: ${currentUrl}`);

        // FORCE navigate to base /imagine even if already there - ensures fresh state
        console.log(`📍 Navigating to https://grok.com/imagine...`);
        await page.goto('https://grok.com/imagine', { waitUntil: 'domcontentloaded' });
        console.log('⏳ Waiting for UI to load...');
        await page.waitForTimeout(3000); // Wait for initialization

        // VERIFY LOGIN STATUS
        console.log('🔄 Reloading page to apply cookies...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        // Check if Grok redirected back to /post/* after reload
        const urlAfterReload = page.url();
        if (urlAfterReload.includes('/imagine/post/')) {
            console.log(`⚠️ Grok redirected to ${urlAfterReload}, forcing back to /imagine...`);
            await page.goto('https://grok.com/imagine', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(2000);
        }

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

            // Take debug screenshot BEFORE attempting upload
            const uploadDebugPath = path.join(CONFIG.downloadDir, 'debug_before_upload.png');
            await page.screenshot({ path: uploadDebugPath });
            console.log(`📸 Debug screenshot: ${uploadDebugPath}`);

            // Strategy 1: Try direct input[type="file"] first (hidden input, most reliable)
            let uploadSuccess = false;
            const fileInput = page.locator('input[type="file"]').first();

            try {
                const inputExists = await fileInput.count() > 0;
                if (inputExists) {
                    console.log('📁 Strategy 1: Setting file to input[type="file"]...');
                    await fileInput.setInputFiles(CONFIG.videoConfig.imagePath);
                    console.log('✅ File set directly to input element');
                    uploadSuccess = true;
                }
            } catch (e) {
                console.log(`   ⚠️ Strategy 1 failed: ${e.message}`);
            }

            // Strategy 2: Click attach button → file chooser
            if (!uploadSuccess) {
                console.log('📁 Strategy 2: Click Attach button...');
                try {
                    // Try multiple selectors for attach button
                    const attachBtn = page.locator('button[aria-label="Attach files"], button[aria-label="Attach"], button[aria-label="Đính kèm tệp"], button[aria-label="Đính kèm"], button:has(svg)').filter({ has: page.locator('svg') }).first();

                    if (await attachBtn.isVisible({ timeout: 3000 })) {
                        await attachBtn.click();
                        await page.waitForTimeout(1500);

                        // Click "Upload a file" option
                        const uploadOption = page.locator('div[role="menuitem"], button').filter({ hasText: /Upload|Tải|tệp/i }).first();
                        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
                        await uploadOption.click();
                        const fileChooser = await fileChooserPromise;
                        await fileChooser.setFiles(CONFIG.videoConfig.imagePath);
                        console.log('✅ File selected via file chooser');
                        uploadSuccess = true;
                    }
                } catch (e) {
                    console.log(`   ⚠️ Strategy 2 failed: ${e.message}`);
                }
            }

            // Strategy 3: Look for any clickable paperclip/plus icon
            if (!uploadSuccess) {
                console.log('📁 Strategy 3: Looking for paperclip/plus icon...');
                try {
                    // Find first button with SVG that's near the input area
                    const iconBtn = page.locator('button svg').first().locator('xpath=..');
                    if (await iconBtn.isVisible({ timeout: 2000 })) {
                        const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 });
                        await iconBtn.click();
                        await page.waitForTimeout(1000);

                        // Check if menu appeared, if so click upload option
                        const menuItem = page.locator('[role="menuitem"]').first();
                        if (await menuItem.isVisible({ timeout: 1000 })) {
                            await menuItem.click();
                        }

                        const fileChooser = await fileChooserPromise;
                        await fileChooser.setFiles(CONFIG.videoConfig.imagePath);
                        console.log('✅ File selected via icon click');
                        uploadSuccess = true;
                    }
                } catch (e) {
                    console.log(`   ⚠️ Strategy 3 failed: ${e.message}`);
                }
            }

            if (!uploadSuccess) {
                const errorScreenshot = path.join(CONFIG.downloadDir, 'upload_failed.png');
                await page.screenshot({ path: errorScreenshot });
                console.error(`❌ All upload strategies failed. Screenshot: ${errorScreenshot}`);
                throw new Error('Failed to upload image - no upload method worked');
            }

            // 2. Wait for upload to complete and URL to change to /post/*
            console.log('⏳ Waiting for image upload and page transition...');

            // Wait for URL to change to /post/* format (Image-to-Video page)
            try {
                // Wait up to 60 seconds for the upload and redirect
                await page.waitForFunction(
                    () => window.location.href.includes('/imagine/post/'),
                    { timeout: 60000 }
                );
                const newUrl = page.url();
                console.log(`✅ Transitioned to Image-to-Video page: ${newUrl}`);

                // CRITICAL: Wait for the UI to settle after redirect
                await page.waitForTimeout(3000);

            } catch (e) {
                console.error('❌ Error: Timed out waiting for Image-to-Video page transition.');
                console.error('   The image upload might have failed or is taking too long.');
                console.error(`   Current URL: ${page.url()}`);
                throw new Error('Upload transition failed');
            }

            // ==========================================
            // STEP 5: CONFIGURE VIDEO OPTIONS (Using Fetch project's working approach)
            // ==========================================
            console.log('⚙️ Configuring Video Options...');

            // VERIFIED: Image-to-Video uses "Video Options" / "Tùy chọn Video"
            const optionsBtn = page.locator('button[aria-label="Video Options"], button[aria-label="Tùy chọn Video"]').first();

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

                    if (!resolutionSet) {
                        console.log(`   ⚠️ Could not find Resolution button for ${resolution}`);
                    }
                } catch (e) { console.log(`   ⚠️ Failed to set resolution: ${e.message}`); }

                // NOTE: Aspect Ratio is NOT available in Image-to-Video mode
                // The aspect ratio is determined by the uploaded image
                console.log('   ✅ Video options configured.');

            } catch (e) {
                console.log(`⚠️ Video Options button not found or error occurred: ${e.message}`);
                console.log('   Skipping video configuration.');
            }

            // ==========================================
            // STEP 6: ENTER PROMPT (After Settings)
            // ==========================================
            // Support both English and Vietnamese UI
            const customizingInput = page.locator('textarea[aria-label="Make a video"], textarea[aria-label="Tạo video"], textarea[placeholder*="customize"], textarea[placeholder*="tùy chỉnh"]').first();

            console.log('✍️ Targeting input: Image-to-Video textarea');
            await customizingInput.click({ force: true });
            console.log('   Input clicked, waiting 3s...');
            await page.waitForTimeout(3000);

            console.log(`   Pasting prompt...`);
            await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
            await customizingInput.press('Control+V');

            console.log('   Paste command sent, waiting 3s...');
            await page.waitForTimeout(3000);

            // Verify if text was pasted
            const inputValue = await customizingInput.inputValue().catch(async () => await customizingInput.innerText());
            if (!inputValue || inputValue.length < 5) {
                console.log('⚠️ Paste might have failed, trying fallback typing...');
                await customizingInput.fill(CONFIG.videoConfig.prompt);
                await page.waitForTimeout(2000);
            } else {
                console.log('✅ Prompt paste verified');
            }

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

            // In Image-to-Video mode, the submit button has aria-label="Make video" or "Tạo video"
            // Try "Make video"/"Tạo video" first, then "Submit"/"Gửi" (fallback)
            let buttonFound = false;

            try {
                // Priority 1: "Make video" / "Tạo video" button (Image-to-Video mode)
                const makeVideoBtn = page.locator('button[aria-label="Make video"], button[aria-label="Tạo video"]').first();
                if (await makeVideoBtn.count() > 0 && await makeVideoBtn.isVisible({ timeout: 2000 })) {
                    console.log('   Found "Make video" / "Tạo video" button, clicking...');
                    await makeVideoBtn.evaluate(b => b.click());
                    buttonFound = true;
                    console.log('   ✅ Make video button clicked (Native)');
                } else {
                    // Priority 2: "Submit" / "Gửi" button (fallback)
                    console.log('   "Make video" not found, trying "Submit"/"Gửi"...');
                    const submitBtn = page.locator('button[aria-label="Submit"], button[aria-label="Gửi"]').first();
                    if (await submitBtn.count() > 0 && await submitBtn.isVisible({ timeout: 2000 })) {
                        console.log('   Found "Submit"/"Gửi" button, clicking...');
                        await submitBtn.evaluate(b => b.click());
                        buttonFound = true;
                        console.log('   ✅ Submit button clicked (Native)');
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

            // Step 1: Open Settings (Moved to Robust V2 Logic)
            console.log('⚙️ Step 1: Configuring Video Settings...');

            try {
                // 1. Open "Video Options" / "Tùy chọn video"
                const optionsBtn = page.locator('button')
                    .filter({ hasText: /Video Options|Tùy chọn video|Video/i })
                    .first();

                await optionsBtn.waitFor({ state: 'visible', timeout: 5000 });
                await optionsBtn.click();
                await page.waitForTimeout(1000);

                // Helper to robustly find and click an option in the menu (Duplicated definition for scope safety)
                const selectOption = async (settingName, value) => {
                    console.log(`   👉 Setting ${settingName} to ${value}...`);
                    try {
                        const option = page.locator('div, button, span')
                            .filter({ hasText: new RegExp(`^${value}$`, 'i') })
                            .last();
                        if (await option.isVisible()) {
                            await option.click();
                            console.log(`     ✅ Clicked ${value}`);
                            return true;
                        }
                        const partial = page.locator('div, button, span').filter({ hasText: value }).last();
                        if (await partial.isVisible()) {
                            await partial.click();
                            console.log(`     ✅ Clicked ${value} (partial match)`);
                            return true;
                        }
                        return false;
                    } catch (e) { return false; }
                };

                await selectOption('Duration', CONFIG.videoConfig.duration);
                await page.waitForTimeout(500);

                if (!await page.locator('text=Resolution').or(page.locator('text=Độ phân giải')).isVisible()) {
                    await optionsBtn.click();
                    await page.waitForTimeout(1000);
                }
                await selectOption('Resolution', CONFIG.videoConfig.resolution);

                // Aspect Ratio (Text-to-Video)
                const aspectMenuVisible = await page.locator('text=Aspect Ratio').or(page.locator('text=Tỉ lệ')).isVisible();
                if (!aspectMenuVisible) {
                    await optionsBtn.click();
                    await page.waitForTimeout(1000);
                }
                await selectOption('Aspect Ratio', CONFIG.videoConfig.aspectRatio);

                // Close menu
                await page.mouse.click(0, 0);
                await page.waitForTimeout(500);

            } catch (e) {
                console.log(`⚠️ Video options setup failed: ${e.message}`);
            }

            // Step 2: Prompt (Copy-Paste)
            console.log(`✍️  Step 2: Pasting prompt: "${CONFIG.videoConfig.prompt}"`);
            let promptInput = page.locator('textarea');
            if (await promptInput.count() === 0) {
                promptInput = page.locator('div[contenteditable="true"], div[role="textbox"]');
            }

            await promptInput.first().click();
            await page.waitForTimeout(2000);

            // Clipboard paste trick
            await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
            await promptInput.first().press('Control+V');

            await page.waitForTimeout(2000);
            console.log('✅ Prompt pasted');

            // Step 3: Submit
            console.log('🎬 Step 3: Generating video...');
            await page.keyboard.press('Enter');
            console.log('✅ Request sent (Enter key)');
        }

        // ==========================================
        // STEP 4: POLL FOR VIDEO (Button Click Strategy)
        // ==========================================

        console.log(`\n📂 Download Folder: ${CONFIG.downloadDir}`);
        console.log('⏳ Waiting for video generation...');

        try {
            // Capture existing videos to ignore them
            const existingVideos = await page.evaluate(() =>
                Array.from(document.querySelectorAll('video')).map(v => v.src)
            );

            let videoSrc = null;
            let attempts = 0;

            while (!videoSrc && attempts < CONFIG.polling.maxAttempts) {
                await page.waitForTimeout(CONFIG.polling.intervalMs);
                process.stdout.write('.');

                // Look for NEW video with HTTP URL (not blob)
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

                console.log('\n✅ Video download complete! Script finished successfully.');
                process.exit(0); // Exit with success code so TypeScript can proceed
            } else {
                console.error('❌ Timeout: Video did not appear after polling');
                const screenshotPath = path.join(__dirname, 'error_screenshot.png');
                await page.screenshot({ path: screenshotPath });
                console.log(`Screenshot saved: ${screenshotPath}`);
                process.exit(1); // Exit with error code
            }
        } catch (error) {
            console.error('\n❌ Error during video polling:', error.message);
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
        // For CDP connection, browser stays running - just log completion
        if (browser) {
            console.log('\n✅ Process complete. Browser remains open.');
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
