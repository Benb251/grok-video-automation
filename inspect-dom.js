// Final DOM inspection - output to file
import { chromium } from 'playwright';
import fs from 'fs';

async function inspectGrokDOM() {
    let output = [];
    const log = (msg) => { console.log(msg); output.push(msg); };

    log('🔌 Connecting to Chrome on port 9222...');

    let browser;
    try {
        browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
        const contexts = browser.contexts();

        // Find the Grok /imagine page specifically
        let grokPage = null;

        for (const context of contexts) {
            const pages = context.pages();
            for (const page of pages) {
                const url = page.url();
                if (url.includes('grok.com/imagine')) {
                    grokPage = page;
                    break;
                }
            }
            if (grokPage) break;
        }

        if (!grokPage) {
            log('❌ No Grok /imagine page found!');
            return;
        }

        log('📍 Using page: ' + grokPage.url());
        await grokPage.waitForTimeout(2000);

        log('\n========== ALL BUTTONS ==========\n');

        const buttons = await grokPage.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            return btns.map((btn, idx) => ({
                index: idx,
                ariaLabel: btn.getAttribute('aria-label'),
                title: btn.getAttribute('title'),
                dataTestId: btn.getAttribute('data-testid'),
                text: btn.textContent?.trim().substring(0, 60),
                isVisible: btn.offsetParent !== null,
                x: Math.round(btn.getBoundingClientRect().x),
                y: Math.round(btn.getBoundingClientRect().y)
            }));
        });

        const visibleButtons = buttons.filter(b => b.isVisible);
        log('Found ' + visibleButtons.length + ' visible buttons:\n');

        visibleButtons.forEach((btn) => {
            log('[Button ' + btn.index + '] "' + btn.text + '"');
            if (btn.ariaLabel) log('  aria-label: "' + btn.ariaLabel + '"');
            if (btn.title) log('  title: "' + btn.title + '"');
            if (btn.dataTestId) log('  data-testid: "' + btn.dataTestId + '"');
            log('  position: x=' + btn.x + ', y=' + btn.y);
            log('');
        });

        log('\n========== INPUT AREAS ==========\n');

        const inputs = await grokPage.evaluate(() => {
            const textareas = Array.from(document.querySelectorAll('textarea'));
            const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
            const textboxes = Array.from(document.querySelectorAll('[role="textbox"]'));

            return [...textareas, ...editables, ...textboxes].map((el, i) => ({
                index: i,
                tag: el.tagName,
                ariaLabel: el.getAttribute('aria-label'),
                placeholder: el.getAttribute('placeholder'),
                role: el.getAttribute('role'),
                isVisible: el.offsetParent !== null
            }));
        });

        log('Found ' + inputs.length + ' input areas:\n');
        inputs.forEach((input) => {
            log('[Input ' + input.index + ']');
            log('  tag: ' + input.tag);
            if (input.ariaLabel) log('  aria-label: "' + input.ariaLabel + '"');
            if (input.placeholder) log('  placeholder: "' + input.placeholder + '"');
            if (input.role) log('  role: "' + input.role + '"');
            log('  visible: ' + input.isVisible);
            log('');
        });

        log('\n========== FILE INPUTS ==========\n');

        const fileInputs = await grokPage.evaluate(() => {
            return Array.from(document.querySelectorAll('input[type="file"]')).map((el, i) => ({
                index: i,
                accept: el.getAttribute('accept'),
                id: el.id,
                name: el.name,
                isHidden: el.hidden || getComputedStyle(el).display === 'none'
            }));
        });

        log('Found ' + fileInputs.length + ' file inputs:\n');
        fileInputs.forEach((input) => {
            log('[FileInput ' + input.index + ']');
            log('  accept: ' + input.accept);
            log('  hidden: ' + input.isHidden);
            if (input.id) log('  id: "' + input.id + '"');
            log('');
        });

        // Save output to file
        fs.writeFileSync('d:/Frog/tools/Grok/grok-video-automation/dom_output.txt', output.join('\n'));
        log('\n📄 Output saved to: dom_output.txt');

        await grokPage.screenshot({ path: 'd:/Frog/tools/Grok/grok-video-automation/dom_inspection.png' });
        log('📸 Screenshot saved: dom_inspection.png');

        log('\n✅ Done!');

    } catch (error) {
        log('❌ Error: ' + error.message);
    } finally {
        if (browser) {
            try { await browser.close(); } catch (e) { }
        }
    }
}

inspectGrokDOM();
