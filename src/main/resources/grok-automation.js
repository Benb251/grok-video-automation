import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

            // 1. Upload image directly using hidden file input (no dialog)
            console.log('📁 Setting file directly to input[type="file"]...');

            const fileInput = page.locator('input[type="file"]').first();
            await fileInput.waitFor({ state: 'attached', timeout: 10000 });
            await fileInput.setInputFiles(CONFIG.videoConfig.imagePath);
            console.log('✅ File set directly to input element');

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
            // STEP 5: CONFIGURE VIDEO OPTIONS (Settings BEFORE Prompt)
            // ==========================================
            console.log('⚙️ Configuring Video Options...');

            try {
                // 1. Open "Video Options" / "Tùy chọn video"
                // The icon button is in the same toolbar as "Tạo video" button
                // Strategy: Find the submit button, then get its sibling (the options icon)
                const submitBtn = page.locator('button:has-text("Tạo video"), button:has-text("Make video")').first();

                // The options button is the button immediately before submit in the toolbar
                // Using parent container to scope correctly
                const toolbar = submitBtn.locator('xpath=..');
                let optionsBtn = toolbar.locator('button').filter({ hasNot: page.locator('text=Tạo video'), has: page.locator('svg') }).first();

                // Fallback: Get button by position (second-to-last button in parent)
                if (!await optionsBtn.isVisible({ timeout: 2000 })) {
                    console.log('   ℹ️ Sibling strategy failed, trying position-based...');
                    // The toolbar has structure: [input] [options-btn] [submit-btn] [other-icons]
                    // Options is the button right before submit
                    optionsBtn = submitBtn.locator('xpath=preceding-sibling::button[1]');
                }

                // Wait for button
                console.log('   Waiting for Video Options button...');
                if (await optionsBtn.isVisible({ timeout: 10000 })) {
                    // DEBUG
                    const btnText = await optionsBtn.innerText().catch(() => 'No text');
                    const btnLabel = await optionsBtn.getAttribute('aria-label').catch(() => 'No label');
                    console.log(`   🔎 Found button - Text: "${btnText}", Label: "${btnLabel}"`);

                    // Use NORMAL click (not evaluate) to trigger proper events
                    await optionsBtn.click({ timeout: 5000 });
                    await page.waitForTimeout(1500);

                    // VERIFY MENU OPENED
                    const menuHeader = page.locator('text=Duration').or(page.locator('text=Thời lượng'));
                    if (!await menuHeader.isVisible({ timeout: 2000 })) {
                        console.log('   ⚠️ Menu not detected, trying click again...');
                        await optionsBtn.click({ force: true });
                        await page.waitForTimeout(1500);
                    }

                    // Helper to robustly find and click an option in the menu
                    const selectOption = async (settingName, value) => {
                        console.log(`   👉 Setting ${settingName} to ${value}...`);
                        try {
                            // Grok uses non-standard menu items - try multiple selectors
                            // Scope to elements likely within the popup menu (last button, span, div with exact match)
                            const exactTextLocator = page.locator(`text="${value}"`).last();

                            if (await exactTextLocator.isVisible({ timeout: 1000 })) {
                                await exactTextLocator.click({ force: true }); // Force click to bypass any micro-overlay
                                console.log(`     ✅ Clicked ${value}`);
                                return true;
                            }

                            // Fallback: Partial match for button/span
                            const partialLocator = page.locator(`button:has-text("${value}"), span:has-text("${value}")`).last();
                            if (await partialLocator.isVisible({ timeout: 500 })) {
                                await partialLocator.click({ force: true });
                                console.log(`     ✅ Clicked ${value} (partial)`);
                                return true;
                            }

                            console.log(`     ⚠️ Could not find option: ${value}`);
                            return false;
                        } catch (e) {
                            console.log(`     ⚠️ Error setting ${value}: ${e.message}`);
                            return false;
                        }
                    };

                    // 2. Set Duration
                    await selectOption('Duration', CONFIG.videoConfig.duration);
                    await page.waitForTimeout(500);

                    // 3. Set Resolution
                    // Menu likely closed after Duration selection - reopen it
                    if (!await page.locator('text=Resolution').or(page.locator('text=Độ phân giải')).isVisible()) {
                        console.log('   ℹ️ Menu closed, reopening for Resolution...');
                        // Re-locate the options button (fresh reference)
                        const submitBtnFresh = page.locator('button:has-text("Tạo video"), button:has-text("Make video")').first();
                        const toolbarFresh = submitBtnFresh.locator('xpath=..');
                        const optionsBtnFresh = toolbarFresh.locator('button').filter({ hasNot: page.locator('text=Tạo video'), has: page.locator('svg') }).first();

                        if (await optionsBtnFresh.isVisible({ timeout: 2000 })) {
                            await optionsBtnFresh.click({ timeout: 5000 });
                            await page.waitForTimeout(1500);
                        }
                    }
                    await selectOption('Resolution', CONFIG.videoConfig.resolution);

                    // 4. Set Aspect Ratio (Text-to-Video only - In Img2Vid it's hidden or locked)
                    const aspectMenuVisible = await page.locator('text=Aspect Ratio').or(page.locator('text=Tỉ lệ')).isVisible();
                    if (aspectMenuVisible) {
                        await selectOption('Aspect Ratio', CONFIG.videoConfig.aspectRatio);
                    }

                    console.log('   ✅ Video configuration complete.');

                    // Close menu (Click outside - e.g. top left)
                    await page.mouse.click(0, 0);

                } else {
                    console.log('   ⚠️ Video Options button not visible yet, skipping configuration.');
                }

            } catch (e) {
                console.log(`⚠️ Video options setup failed: ${e.message}`);
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
            // Wait for either a new video element OR the "Download" button to appear
            // This covers both cases: auto-play video or finished state
            const videoSelector = 'video';
            const downloadBtnSelector = 'button[aria-label="Download"], button[aria-label="Tải xuống"]';

            let foundVideo = false;
            let attempts = 0;

            while (!foundVideo && attempts < CONFIG.polling.maxAttempts) {
                await page.waitForTimeout(CONFIG.polling.intervalMs);
                process.stdout.write('.');

                // Strategy: Try to click Download button normally.
                // Overlay blocks clicks during generation -> timeout -> continue polling.
                // When video done, overlay clears -> click succeeds -> download starts.
                const downloadButtons = page.locator(downloadBtnSelector);
                if (await downloadButtons.count() > 0) {
                    const lastBtn = downloadButtons.last();

                    try {
                        // Short timeout click - will fail if overlay still blocking
                        await lastBtn.click({ timeout: 1000 });

                        // If click succeeded, video is done!
                        console.log('\n🎉 Download button clicked! Video generation complete.');

                        // Wait for download event
                        const download = await page.waitForEvent('download', { timeout: 30000 }).catch(() => null);

                        if (download) {
                            const filename = `grok_video_${Date.now()}.mp4`;
                            const savePath = path.join(CONFIG.downloadDir, filename);
                            await download.saveAs(savePath);
                            console.log(`✅ Video saved: ${savePath}`);
                            foundVideo = true;
                            break;
                        } else {
                            console.log('   ⚠️ No download event. Trying video source scraper...');

                            // Fallback: Scrape video source
                            const videoSrc = await page.evaluate(() => {
                                const videos = Array.from(document.querySelectorAll('video'));
                                const v = videos.pop();
                                return v ? v.src : null;
                            });

                            if (videoSrc && (videoSrc.startsWith('http') || videoSrc.startsWith('blob:'))) {
                                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                                const filename = `grok_video_${timestamp}.mp4`;
                                const savePath = path.join(CONFIG.downloadDir, filename);

                                if (videoSrc.startsWith('blob:')) {
                                    const base64Data = await page.evaluate(async (url) => {
                                        const blob = await fetch(url).then(r => r.blob());
                                        return new Promise(resolve => {
                                            const reader = new FileReader();
                                            reader.onload = () => resolve(reader.result);
                                            reader.readAsDataURL(blob);
                                        });
                                    }, videoSrc);
                                    const data = base64Data.split(',')[1];
                                    fs.writeFileSync(savePath, Buffer.from(data, 'base64'));
                                } else {
                                    await downloadVideo(page, videoSrc, filename);
                                }
                                console.log(`✅ Video saved via scraper: ${savePath}`);
                                foundVideo = true;
                                break;
                            }
                        }
                    } catch (e) {
                        // Click timeout = overlay still blocking = generation in progress
                        // This is expected, continue polling
                    }
                }

                attempts++;
            }

            if (!foundVideo) {
                console.error('\n❌ Timeout: Could not detect finished video or download button.');
            } else {
                // Success cleanup
                console.log('\n🔒 Disconnecting from browser...');
                await browser.disconnect();
                console.log('✅ Disconnected successfully!');
            }

        } catch (error) {
            console.error('\n❌ Error during polling:', error.message);
            throw error;
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
