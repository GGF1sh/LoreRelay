'use strict';
// Real browser/media implementation with a synthetic device and no external socket.
const assert = require('assert/strict');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(process.env.LORERELAY_PLAYWRIGHT || 'playwright');
const { buildVoiceCompanionConfig } = require('../out/voiceCompanionCore');
async function main() {
    const host = spawn(process.execPath, [path.join(__dirname, 'serve_voice_client.js')], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    host.stdout.on('data', chunk => { output += chunk; }); host.stderr.resume();
    let browser;
    try {
        const deadline = Date.now() + 5000;
        while (!output.includes('\n')) {
            if (Date.now() > deadline || host.exitCode !== null) throw new Error('local_server_start_failed');
            await new Promise(resolve => setTimeout(resolve, 20));
        }
        const origin = output.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
        browser = await chromium.launch({ headless: true, executablePath: process.env.LORERELAY_BROWSER_EXECUTABLE,
            args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--mute-audio'] });
        const context = await browser.newContext({ viewport: { width: 640, height: 900 } });
        await context.grantPermissions(['microphone'], { origin });
        const page = await context.newPage();
        await page.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
        await page.routeWebSocket('**/*', socket => socket.close());
        await page.addInitScript(() => {
            window.voiceFixture = { sockets: [], frames: 0, samples: 0, tracks: [], audio: [] };
            const fixture = window.voiceFixture;
            const originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = async constraints => {
                const stream = await originalMedia(constraints); fixture.tracks.push(...stream.getTracks()); return stream;
            };
            const Audio = window.AudioContext;
            window.AudioContext = class extends Audio { constructor(options) { super(options); fixture.audio.push(this); } };
            window.WebSocket = class {
                static OPEN = 1;
                constructor(url) { this.readyState = 1; this.bufferedAmount = 0; fixture.sockets.push(this); setTimeout(() => this.onopen?.(), 0); }
                send(data) {
                    const message = JSON.parse(data);
                    if (message.type === 'session.update') setTimeout(() => this.onmessage?.({ data: JSON.stringify({ type: 'session.updated' }) }), 0);
                    if (message.type === 'input_audio_buffer.append') {
                        fixture.frames++; fixture.samples += atob(message.audio).length / 2;
                        if (fixture.frames === 1) this.onmessage?.({ data: JSON.stringify({ type: 'response.output_audio.delta', delta: message.audio }) });
                    }
                }
                close() { this.closed = true; this.readyState = 3; this.onclose?.(); }
            };
        });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(origin);
        assert.equal(await page.evaluate(() => window.voiceFixture.sockets.length), 0);
        assert.equal(await page.evaluate(() => window.voiceFixture.tracks.length), 0);
        const config = buildVoiceCompanionConfig('https://fixture.invalid/mcp', 'a'.repeat(64), Date.now() + 60000, 'companion');
        await page.locator('#config').fill(JSON.stringify(config));
        await page.locator('#token').fill('synthetic-ephemeral-token');
        await page.locator('#consent').check();
        await page.locator('#start').click();
        await page.waitForFunction(() => window.voiceFixture.frames >= 3, null, { timeout: 10000 });
        await page.locator('#stop').click();
        await page.waitForFunction(() => window.voiceFixture.audio.every(audio => audio.state === 'closed'));
        const result = await page.evaluate(() => ({
            frames: window.voiceFixture.frames, samples: window.voiceFixture.samples,
            tracksEnded: window.voiceFixture.tracks.every(track => track.readyState === 'ended'),
            socketsClosed: window.voiceFixture.sockets.every(socket => socket.closed),
            credentialsCleared: !document.querySelector('#token').value && !document.querySelector('#config').value,
        }));
        assert(result.tracksEnded && result.socketsClosed && result.credentialsCleared);
        assert.equal(result.samples % 2400, 0);
        assert.deepEqual(errors, []);
        console.log(JSON.stringify({ status: 'passed', ...result, media: 'Chromium synthetic microphone', transport: 'mocked; no xAI connection' }));
    } finally { await browser?.close(); if (host.exitCode === null) host.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
