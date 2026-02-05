var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var import_playwright = require("playwright");
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
var import_url = require("url");
const import_meta = {};
var __filename = typeof __filename !== "undefined" ? __filename : (0, import_url.fileURLToPath)(import_meta.url);
var __dirname = typeof __dirname !== "undefined" ? __dirname : import_path.default.dirname(__filename);
console.log("\u{1F680} Starting Grok Video Generation Automation (CDP Mode)...\n");
console.log("\u2139\uFE0F Script Version: NATIVE_DOM_CLICK_FIX");
let videoConfig = {
  prompt: "a cat playing with a butterfly in a sunny garden",
  imagePath: null,
  cookiePath: null,
  aspectRatio: "16:9",
  duration: "6s",
  resolution: "720p"
};
if (process.argv[2]) {
  try {
    const configPath = import_path.default.resolve(process.argv[2]);
    const configData = JSON.parse(import_fs.default.readFileSync(configPath, "utf-8"));
    if (configData.prompt) videoConfig.prompt = configData.prompt;
    if (configData.aspectRatio) videoConfig.aspectRatio = configData.aspectRatio;
    if (configData.duration) videoConfig.duration = configData.duration;
    if (configData.resolution) videoConfig.resolution = configData.resolution;
    if (configData.imagePath) videoConfig.imagePath = configData.imagePath;
    if (configData.cookiePath) videoConfig.cookiePath = configData.cookiePath;
    console.log("\u2713 Config loaded from:", configPath);
    console.log("\u{1F4DD} Prompt:", videoConfig.prompt);
    console.log("\u2699\uFE0F  Video config:", `${videoConfig.aspectRatio} | ${videoConfig.duration} | ${videoConfig.resolution}
`);
  } catch (error) {
    console.error("\u2717 Error loading config file:", error.message);
    console.log("Using default configuration\n");
  }
}
const args = process.argv;
const portIndex = args.indexOf("--port");
const port = portIndex !== -1 ? args[portIndex + 1] : "9222";
const downloadDirIndex = args.indexOf("--download-dir");
const downloadDir = downloadDirIndex !== -1 ? args[downloadDirIndex + 1] : import_path.default.join(__dirname, "downloads");
const CONFIG = {
  cdpUrl: `http://127.0.0.1:${port}`,
  // Chrome DevTools Protocol URL
  grokUrl: "https://grok.com/imagine",
  downloadDir,
  videoConfig,
  polling: {
    maxAttempts: 60,
    // 3 minutes max wait time (Fail fast for retry)
    intervalMs: 3e3
    // Check every 3 seconds
  }
};
if (!import_fs.default.existsSync(CONFIG.downloadDir)) {
  import_fs.default.mkdirSync(CONFIG.downloadDir, { recursive: true });
}
async function downloadVideo(page, url, filename) {
  console.log(`\u{1F4E5} Downloading video from: ${url}`);
  try {
    const response = await page.context().request.get(url);
    if (!response.ok()) {
      console.error(`\u274C Download failed: ${response.status()} ${response.statusText()}`);
      return null;
    }
    const buffer = await response.body();
    const filePath = import_path.default.join(CONFIG.downloadDir, filename);
    import_fs.default.writeFileSync(filePath, buffer);
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`\u2705 Video saved: ${filePath} (${sizeMB} MB)`);
    return filePath;
  } catch (error) {
    console.error("\u274C Download error:", error.message);
    return null;
  }
}
async function main() {
  let browser;
  try {
    console.log(`\u{1F50C} Connecting to Chrome on ${CONFIG.cdpUrl}...`);
    browser = await import_playwright.chromium.connectOverCDP(CONFIG.cdpUrl);
    const context = browser.contexts()[0];
    if (CONFIG.videoConfig.cookiePath && import_fs.default.existsSync(CONFIG.videoConfig.cookiePath)) {
      try {
        console.log(`\u{1F36A} Injecting cookies from: ${CONFIG.videoConfig.cookiePath}`);
        const cookieContent = import_fs.default.readFileSync(CONFIG.videoConfig.cookiePath, "utf-8");
        let cookies = JSON.parse(cookieContent);
        if (!Array.isArray(cookies)) {
          if (cookies.cookies) cookies = cookies.cookies;
        }
        if (Array.isArray(cookies)) {
          const validCookies = cookies.map((c) => ({
            name: c.name,
            value: c.value,
            domain: c.domain || ".grok.com",
            path: c.path || "/",
            secure: c.secure !== void 0 ? c.secure : true,
            httpOnly: c.httpOnly !== void 0 ? c.httpOnly : true,
            sameSite: ["Strict", "Lax", "None"].includes(c.sameSite) ? c.sameSite : "Lax",
            // Default to Lax if invalid
            expires: c.expirationDate || Date.now() / 1e3 + 31536e3
          }));
          await context.addCookies(validCookies);
          console.log(`   \u2705 Injected ${validCookies.length} cookies`);
        } else {
          console.log("   \u26A0\uFE0F Invalid cookie format: Not an array");
        }
      } catch (e) {
        console.error(`   \u274C Failed to inject cookies: ${e.message}`);
      }
    }
    const page = context.pages()[0] || await context.newPage();
    console.log("\u2705 Connected to Chrome!");
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "https://grok.com"
    });
    const currentUrl = page.url();
    console.log(`\u{1F4CD} Current page: ${currentUrl}`);
    console.log(`\u{1F4CD} Navigating to https://grok.com/imagine...`);
    await page.goto("https://grok.com/imagine", { waitUntil: "domcontentloaded" });
    console.log("\u23F3 Waiting for UI to load...");
    await page.waitForTimeout(3e3);
    console.log("\u{1F504} Reloading page to apply cookies...");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2e3);
    const urlAfterReload = page.url();
    if (urlAfterReload.includes("/imagine/post/")) {
      console.log(`\u26A0\uFE0F Grok redirected to ${urlAfterReload}, forcing back to /imagine...`);
      await page.goto("https://grok.com/imagine", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2e3);
    }
    const isLoggedOut = await page.locator('button:has-text("Sign in")').count() > 0 || await page.locator('a[href="/signin"]').count() > 0;
    if (isLoggedOut) {
      console.error("\u274C ERROR: Not logged in! Cookie injection failed or cookies expired.");
      const screenshotPath = import_path.default.join(CONFIG.downloadDir, "login_failed_screenshot.png");
      await page.screenshot({ path: screenshotPath });
      console.log(`\u{1F4F8} Debug screenshot saved to: ${screenshotPath}`);
      throw new Error("Login failed - Cookies invalid or expired");
    } else {
      console.log("\u2705 Login verified successfully!");
    }
    console.log("\u2705 Page ready!\n");
    if (CONFIG.videoConfig.imagePath && CONFIG.videoConfig.imagePath.trim() !== "") {
      console.log("\u{1F5BC}\uFE0F Mode: Image-to-Video detected");
      console.log(`\u{1F4E4} Uploading image: ${CONFIG.videoConfig.imagePath}`);
      const uploadDebugPath = import_path.default.join(CONFIG.downloadDir, "debug_before_upload.png");
      await page.screenshot({ path: uploadDebugPath });
      console.log(`\u{1F4F8} Debug screenshot: ${uploadDebugPath}`);
      let uploadSuccess = false;
      const fileInput = page.locator('input[type="file"]').first();
      try {
        const inputExists = await fileInput.count() > 0;
        if (inputExists) {
          console.log('\u{1F4C1} Strategy 1: Setting file to input[type="file"]...');
          await fileInput.setInputFiles(CONFIG.videoConfig.imagePath);
          console.log("\u2705 File set directly to input element");
          uploadSuccess = true;
        }
      } catch (e) {
        console.log(`   \u26A0\uFE0F Strategy 1 failed: ${e.message}`);
      }
      if (!uploadSuccess) {
        console.log("\u{1F4C1} Strategy 2: Click Attach button...");
        try {
          const attachBtn = page.locator('button[aria-label="Attach files"], button[aria-label="Attach"], button[aria-label="\u0110\xEDnh k\xE8m t\u1EC7p"], button[aria-label="\u0110\xEDnh k\xE8m"], button:has(svg)').filter({ has: page.locator("svg") }).first();
          if (await attachBtn.isVisible({ timeout: 3e3 })) {
            await attachBtn.click();
            await page.waitForTimeout(1500);
            const uploadOption = page.locator('div[role="menuitem"], button').filter({ hasText: /Upload|Tải|tệp/i }).first();
            const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 5e3 });
            await uploadOption.click();
            const fileChooser = await fileChooserPromise;
            await fileChooser.setFiles(CONFIG.videoConfig.imagePath);
            console.log("\u2705 File selected via file chooser");
            uploadSuccess = true;
          }
        } catch (e) {
          console.log(`   \u26A0\uFE0F Strategy 2 failed: ${e.message}`);
        }
      }
      if (!uploadSuccess) {
        console.log("\u{1F4C1} Strategy 3: Looking for paperclip/plus icon...");
        try {
          const iconBtn = page.locator("button svg").first().locator("xpath=..");
          if (await iconBtn.isVisible({ timeout: 2e3 })) {
            const fileChooserPromise = page.waitForEvent("filechooser", { timeout: 5e3 });
            await iconBtn.click();
            await page.waitForTimeout(1e3);
            const menuItem = page.locator('[role="menuitem"]').first();
            if (await menuItem.isVisible({ timeout: 1e3 })) {
              await menuItem.click();
            }
            const fileChooser = await fileChooserPromise;
            await fileChooser.setFiles(CONFIG.videoConfig.imagePath);
            console.log("\u2705 File selected via icon click");
            uploadSuccess = true;
          }
        } catch (e) {
          console.log(`   \u26A0\uFE0F Strategy 3 failed: ${e.message}`);
        }
      }
      if (!uploadSuccess) {
        const errorScreenshot = import_path.default.join(CONFIG.downloadDir, "upload_failed.png");
        await page.screenshot({ path: errorScreenshot });
        console.error(`\u274C All upload strategies failed. Screenshot: ${errorScreenshot}`);
        throw new Error("Failed to upload image - no upload method worked");
      }
      console.log("\u23F3 Waiting for image upload and page transition...");
      try {
        await page.waitForFunction(
          () => window.location.href.includes("/imagine/post/"),
          { timeout: 6e4 }
        );
        const newUrl = page.url();
        console.log(`\u2705 Transitioned to Image-to-Video page: ${newUrl}`);
        await page.waitForTimeout(3e3);
      } catch (e) {
        console.error("\u274C Error: Timed out waiting for Image-to-Video page transition.");
        console.error("   The image upload might have failed or is taking too long.");
        console.error(`   Current URL: ${page.url()}`);
        throw new Error("Upload transition failed");
      }
      console.log("\u2699\uFE0F Configuring Video Options...");
      const optionsBtn = page.locator('button[aria-label="Video Options"], button[aria-label="T\xF9y ch\u1ECDn Video"]').first();
      try {
        await optionsBtn.waitFor({ state: "visible", timeout: 5e3 });
        console.log("   Found Video Options button, clicking...");
        await optionsBtn.click();
        await page.waitForTimeout(1500);
        const duration = CONFIG.videoConfig.duration;
        try {
          const durationBtn = page.locator(`button[aria-label="${duration}"]`);
          if (await durationBtn.isVisible({ timeout: 2e3 })) {
            await durationBtn.click();
            console.log(`   \u2705 Set Duration: ${duration}`);
            await page.waitForTimeout(500);
          } else {
            console.log(`   \u26A0\uFE0F Duration aria-label not found, trying text selector...`);
            const durationText = page.getByRole("button").filter({ hasText: duration });
            await durationText.click({ timeout: 2e3 });
            console.log(`   \u2705 Set Duration (text): ${duration}`);
          }
        } catch (e) {
          console.log(`   \u26A0\uFE0F Failed to set duration: ${e.message}`);
        }
        console.log("   \u{1F504} Reopening menu for resolution selection...");
        await page.waitForTimeout(800);
        await optionsBtn.click();
        await page.waitForTimeout(1500);
        const resolution = CONFIG.videoConfig.resolution;
        try {
          let resolutionSet = false;
          const resolutionBtn = page.locator(`button[aria-label="${resolution}"]`);
          if (await resolutionBtn.count() > 0 && await resolutionBtn.first().isVisible({ timeout: 2e3 })) {
            await resolutionBtn.first().click();
            console.log(`   \u2705 Set Resolution: ${resolution}`);
            resolutionSet = true;
          } else {
            console.log(`   \u26A0\uFE0F Resolution aria-label not found, trying text selector...`);
            const resolutionText = page.getByRole("button").filter({ hasText: resolution });
            if (await resolutionText.count() > 0) {
              await resolutionText.first().click({ timeout: 2e3 });
              console.log(`   \u2705 Set Resolution (text): ${resolution}`);
              resolutionSet = true;
            }
          }
          if (!resolutionSet) {
            console.log(`   \u26A0\uFE0F Could not find Resolution button for ${resolution}`);
          }
        } catch (e) {
          console.log(`   \u26A0\uFE0F Failed to set resolution: ${e.message}`);
        }
        console.log("   \u2705 Video options configured.");
      } catch (e) {
        console.log(`\u26A0\uFE0F Video Options button not found or error occurred: ${e.message}`);
        console.log("   Skipping video configuration.");
      }
      const customizingInput = page.locator('textarea[aria-label="Make a video"], textarea[aria-label="T\u1EA1o video"], textarea[placeholder*="customize"], textarea[placeholder*="t\xF9y ch\u1EC9nh"]').first();
      console.log("\u270D\uFE0F Targeting input: Image-to-Video textarea");
      await customizingInput.click({ force: true });
      console.log("   Input clicked, waiting 3s...");
      await page.waitForTimeout(3e3);
      console.log(`   Pasting prompt...`);
      await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
      await customizingInput.press("Control+V");
      console.log("   Paste command sent, waiting 3s...");
      await page.waitForTimeout(3e3);
      const inputValue = await customizingInput.inputValue().catch(async () => await customizingInput.innerText());
      if (!inputValue || inputValue.length < 5) {
        console.log("\u26A0\uFE0F Paste might have failed, trying fallback typing...");
        await customizingInput.fill(CONFIG.videoConfig.prompt);
        await page.waitForTimeout(2e3);
      } else {
        console.log("\u2705 Prompt paste verified");
      }
      await page.screenshot({ path: import_path.default.join(__dirname, "debug_after_paste.png") });
      console.log("\u{1F4F8} Debug screenshot saved: debug_after_paste.png");
      console.log("\u{1F3AC} Generating video...");
      await page.waitForTimeout(1500);
      const currentUrl2 = page.url();
      if (!currentUrl2.includes("/imagine/post/")) {
        console.log(`\u274C ERROR: Page navigated away from Image-to-Video interface!`);
        console.log(`   Expected URL pattern: https://grok.com/imagine/post/*`);
        console.log(`   Current URL: ${currentUrl2}`);
        console.log("   This usually means the image upload failed or the UI was interrupted.");
        console.log("   Attempting to continue anyway, but video generation might fail...");
      } else {
        console.log(`\u2705 Still on Image-to-Video page: ${currentUrl2}`);
      }
      let buttonFound = false;
      try {
        const makeVideoBtn = page.locator('button[aria-label="Make video"], button[aria-label="T\u1EA1o video"]').first();
        if (await makeVideoBtn.count() > 0 && await makeVideoBtn.isVisible({ timeout: 2e3 })) {
          console.log('   Found "Make video" / "T\u1EA1o video" button, clicking...');
          await makeVideoBtn.evaluate((b) => b.click());
          buttonFound = true;
          console.log("   \u2705 Make video button clicked (Native)");
        } else {
          console.log('   "Make video" not found, trying "Submit"/"G\u1EEDi"...');
          const submitBtn = page.locator('button[aria-label="Submit"], button[aria-label="G\u1EEDi"]').first();
          if (await submitBtn.count() > 0 && await submitBtn.isVisible({ timeout: 2e3 })) {
            console.log('   Found "Submit"/"G\u1EEDi" button, clicking...');
            await submitBtn.evaluate((b) => b.click());
            buttonFound = true;
            console.log("   \u2705 Submit button clicked (Native)");
          }
        }
      } catch (e) {
        console.log(`   \u26A0\uFE0F Error finding button: ${e.message}`);
      }
      if (!buttonFound) {
        console.log("   No submit button found, using Enter key...");
        await page.keyboard.press("Enter");
        console.log("   \u2705 Enter key pressed");
      }
      console.log("\u2705 Request sent");
    } else {
      console.log("\u{1F4DD} Mode: Text-to-Video");
      console.log("\u2699\uFE0F Step 1: Configuring Video Settings...");
      try {
        const optionsBtn = page.locator("button").filter({ hasText: /Video Options|Tùy chọn video|Video/i }).first();
        await optionsBtn.waitFor({ state: "visible", timeout: 5e3 });
        await optionsBtn.click();
        await page.waitForTimeout(1e3);
        const selectOption = async (settingName, value) => {
          console.log(`   \u{1F449} Setting ${settingName} to ${value}...`);
          try {
            const option = page.locator("div, button, span").filter({ hasText: new RegExp(`^${value}$`, "i") }).last();
            if (await option.isVisible()) {
              await option.click();
              console.log(`     \u2705 Clicked ${value}`);
              return true;
            }
            const partial = page.locator("div, button, span").filter({ hasText: value }).last();
            if (await partial.isVisible()) {
              await partial.click();
              console.log(`     \u2705 Clicked ${value} (partial match)`);
              return true;
            }
            return false;
          } catch (e) {
            return false;
          }
        };
        await selectOption("Duration", CONFIG.videoConfig.duration);
        await page.waitForTimeout(500);
        if (!await page.locator("text=Resolution").or(page.locator("text=\u0110\u1ED9 ph\xE2n gi\u1EA3i")).isVisible()) {
          await optionsBtn.click();
          await page.waitForTimeout(1e3);
        }
        await selectOption("Resolution", CONFIG.videoConfig.resolution);
        const aspectMenuVisible = await page.locator("text=Aspect Ratio").or(page.locator("text=T\u1EC9 l\u1EC7")).isVisible();
        if (!aspectMenuVisible) {
          await optionsBtn.click();
          await page.waitForTimeout(1e3);
        }
        await selectOption("Aspect Ratio", CONFIG.videoConfig.aspectRatio);
        await page.mouse.click(0, 0);
        await page.waitForTimeout(500);
      } catch (e) {
        console.log(`\u26A0\uFE0F Video options setup failed: ${e.message}`);
      }
      console.log(`\u270D\uFE0F  Step 2: Pasting prompt: "${CONFIG.videoConfig.prompt}"`);
      let promptInput = page.locator("textarea");
      if (await promptInput.count() === 0) {
        promptInput = page.locator('div[contenteditable="true"], div[role="textbox"]');
      }
      await promptInput.first().click();
      await page.waitForTimeout(2e3);
      await page.evaluate((text) => navigator.clipboard.writeText(text), CONFIG.videoConfig.prompt);
      await promptInput.first().press("Control+V");
      await page.waitForTimeout(2e3);
      console.log("\u2705 Prompt pasted");
      console.log("\u{1F3AC} Step 3: Generating video...");
      await page.keyboard.press("Enter");
      console.log("\u2705 Request sent (Enter key)");
    }
    console.log(`
\u{1F4C2} Download Folder: ${CONFIG.downloadDir}`);
    console.log("\u23F3 Waiting for video generation...");
    try {
      const existingVideos = await page.evaluate(
        () => Array.from(document.querySelectorAll("video")).map((v) => v.src)
      );
      let videoSrc = null;
      let attempts = 0;
      while (!videoSrc && attempts < CONFIG.polling.maxAttempts) {
        await page.waitForTimeout(CONFIG.polling.intervalMs);
        process.stdout.write(".");
        videoSrc = await page.evaluate((known) => {
          const videos = Array.from(document.querySelectorAll("video"));
          const newVideo = videos.find(
            (v) => v.src && !v.src.startsWith("blob:") && !known.includes(v.src)
          );
          return newVideo ? newVideo.src : null;
        }, existingVideos);
        attempts++;
      }
      console.log("\n");
      if (videoSrc) {
        console.log(`\u{1F389} Video generated successfully!`);
        console.log(`URL: ${videoSrc}
`);
        const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
        const filename = `grok_video_${timestamp}.mp4`;
        await downloadVideo(page, videoSrc, filename);
        console.log("\n\u2705 Video download complete! Script finished successfully.");
        process.exit(0);
      } else {
        console.error("\u274C Timeout: Video did not appear after polling");
        const screenshotPath = import_path.default.join(__dirname, "error_screenshot.png");
        await page.screenshot({ path: screenshotPath });
        console.log(`Screenshot saved: ${screenshotPath}`);
        process.exit(1);
      }
    } catch (error) {
      console.error("\n\u274C Error during video polling:", error.message);
      const screenshotPath = import_path.default.join(__dirname, "error_screenshot.png");
      await page.screenshot({ path: screenshotPath }).catch(() => {
      });
      console.log(`Screenshot saved: ${screenshotPath}`);
      throw error;
    }
  } catch (error) {
    console.error("\n\u274C Error:", error.message);
    if (error.message.includes("ECONNREFUSED")) {
      console.log("\n\u{1F4A1} Solution:");
      console.log("1. Launch Chrome with debugging:");
      console.log('   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\chrome-debug-profile"');
      console.log("2. Navigate to https://grok.com/imagine");
      console.log("3. Run this script again");
    }
    process.exit(1);
  } finally {
    if (browser) {
      console.log("\n\u2705 Process complete. Browser remains open.");
    } else {
      console.log("\n\u2705 Process complete.");
    }
  }
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
