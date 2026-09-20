'use strict';
// Local browser evidence only. Does not emulate or claim an actual ChatGPT session.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { chromium } = require(process.env.LORERELAY_PLAYWRIGHT || 'playwright');
const { CHAT_NATIVE_CARD_HTML } = require('../out/chatNativeCard');
async function main() {
    const directory = path.resolve(__dirname, '../.test-runs/chat-card', randomUUID());
    fs.mkdirSync(directory, { recursive: true });
    const browser = await chromium.launch({ headless: true, executablePath: process.env.LORERELAY_BROWSER_EXECUTABLE });
    const evidence = [];
    try {
        for (const [width, colorScheme] of [[800, 'light'], [320, 'dark']]) {
            const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme });
            await page.route('**/*', route => route.abort());
            const messages = [];
            await page.exposeFunction('recordMessage', message => messages.push(message));
            await page.setContent('<!doctype html><style>body{margin:0}iframe{width:100%;height:880px;border:0}</style><iframe title="LoreRelay local card fixture"></iframe>');
            await page.evaluate(({ html }) => {
                window.addEventListener('message', event => {
                    if (event.source !== document.querySelector('iframe').contentWindow) return;
                    window.recordMessage(event.data.method);
                    if (event.data.method === 'ui/notifications/size-changed') {
                        document.querySelector('iframe').style.height = event.data.params.height + 'px';
                    }
                    if (event.data.method === 'ui/initialize') {
                        event.source.postMessage({ jsonrpc: '2.0', id: event.data.id, result: { protocolVersion: '2026-01-26' } }, '*');
                        event.source.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { structuredContent: { view: {
                            worldTurn: 32, geography: { currentLocation: { name: '北の農村・風渡る長い名前の交易拠点' } },
                            commerce: { credits: 128, cargo: [{ commodityId: 'grain', qty: 12 }, { commodityId: '<img src=x onerror=alert(1)>', qty: 1 }] },
                            availableActions: [{ actionId: 'commerce:trade' }, { actionId: 'commerce:travel' }, { actionId: 'commerce:end_day' }],
                            recentEvents: [{ message: '村の食料供給が回復しました。' }],
                        } } } }, '*');
                    }
                });
                document.querySelector('iframe').srcdoc = html;
            }, { html: CHAT_NATIVE_CARD_HTML });
            const frame = page.frameLocator('iframe');
            await frame.locator('#state').waitFor({ state: 'visible' });
            const metrics = await frame.locator('body').evaluate(body => ({
                horizontalOverflow: body.scrollWidth > document.documentElement.clientWidth,
                injectedImages: body.querySelectorAll('img').length,
                location: body.querySelector('#location').textContent,
            }));
            if (metrics.horizontalOverflow || metrics.injectedImages) throw new Error('card_layout_or_injection_failure');
            await frame.locator('summary').first().focus();
            await page.keyboard.press('Enter');
            const cargoClosed = await frame.locator('details').first().evaluate(details => !details.open);
            if (!cargoClosed) throw new Error('keyboard_toggle_failed');
            await page.keyboard.press('Enter');
            await page.waitForFunction(() => {
                const iframe = document.querySelector('iframe');
                const body = iframe.contentDocument.body;
                return !body.querySelector('#state').hidden && iframe.getBoundingClientRect().height >= Math.ceil(body.getBoundingClientRect().height);
            });
            const screenshot = path.join(directory, `${width}-${colorScheme}.png`);
            await page.screenshot({ path: screenshot, fullPage: true });
            if (messages.includes('tools/call')) throw new Error('unexpected_tool_call');
            evidence.push({ width, colorScheme, ...metrics, cargoClosed, screenshot, scope: 'local_browser_fixture_not_ChatGPT' });
            await page.close();
        }
        fs.writeFileSync(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2));
        console.log(JSON.stringify({ directory, evidence }));
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
