'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildVoiceCompanionConfig } = require('../out/voiceCompanionCore');
async function main() {
    const elements = Object.fromEntries(['start', 'stop', 'config', 'token', 'consent', 'status', 'transcript'].map(id => [id, { value: '', checked: false, textContent: '' }]));
    const sockets = [], contexts = [], processors = [];
    let microphoneCalls = 0, stoppedTracks = 0;
    class Socket {
        static OPEN = 1;
        constructor(url, protocols) { this.url = url; this.protocols = protocols; this.readyState = 1; this.bufferedAmount = 0; this.sent = []; sockets.push(this); }
        send(data) { this.sent.push(JSON.parse(data)); }
        close() { this.closed = true; this.onclose?.(); }
    }
    class Audio {
        constructor() { this.sampleRate = 24000; this.currentTime = 0; this.destination = {}; this.audioWorklet = { addModule: async () => {} }; contexts.push(this); }
        async resume() {}
        async close() { this.closed = true; }
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
        createBuffer(_, size) { this.output = new Float32Array(size); return { duration: size / 24000, getChannelData: () => this.output }; }
        createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
    }
    class Processor { constructor() { this.port = {}; processors.push(this); } connect() {} disconnect() { this.disconnected = true; } }
    const timers = new Set();
    const context = { document: { getElementById: id => elements[id] }, window: { addEventListener() {} },
        navigator: { mediaDevices: { async getUserMedia() { microphoneCalls++; return { getTracks: () => [{ stop() { stoppedTracks++; } }] }; } } },
        WebSocket: Socket, AudioContext: Audio, AudioWorkletNode: Processor, URL, Blob,
        setTimeout(fn, delay) { const timer = setTimeout(fn, delay); timers.add(timer); return timer; }, clearTimeout,
        btoa: value => Buffer.from(value, 'binary').toString('base64'), atob: value => Buffer.from(value, 'base64').toString('binary') };
    try {
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../integrations/voice-client.js'), 'utf8'), context);
        await elements.start.onclick();
        assert.equal(sockets.length, 0); assert.equal(microphoneCalls, 0);
        const config = buildVoiceCompanionConfig('https://fixture.invalid/mcp', 'a'.repeat(64), Date.now() + 60000, 'companion');
        const load = value => { elements.config.value = JSON.stringify(value); elements.token.value = 'fixture-ephemeral-token'; elements.consent.checked = true; };
        const invalid = JSON.parse(JSON.stringify(config)); invalid.sessionUpdate.session.tools[0].allowed_tools = ['execute'];
        load(invalid); await elements.start.onclick(); assert.equal(sockets.length, 0);
        load(config); await elements.start.onclick();
        assert.equal(sockets.length, 1); assert.equal(microphoneCalls, 0);
        const ws = sockets[0]; ws.onopen();
        assert.equal(ws.url, config.webSocketUrl);
        assert.deepEqual(Array.from(ws.sent[0].session.tools[0].allowed_tools), ['read_player_view', 'query_available']);
        assert.equal(elements.token.value, ''); assert.equal(elements.config.value, '');
        await ws.onmessage({ data: JSON.stringify({ type: 'session.updated' }) });
        assert.equal(microphoneCalls, 1);
        processors[0].port.onmessage({ data: new Float32Array([-1, 1]) });
        const outgoing = ws.sent.find(event => event.type === 'input_audio_buffer.append');
        const pcm = Buffer.from(outgoing.audio, 'base64');
        assert.equal(pcm.readInt16LE(0), -32768); assert.equal(pcm.readInt16LE(2), 32767);
        await ws.onmessage({ data: JSON.stringify({ type: 'response.output_audio.delta', delta: outgoing.audio }) });
        assert.equal(contexts[0].output[0], -1);
        elements.stop.onclick();
        assert.equal(stoppedTracks, 1); assert(ws.closed); assert(contexts[0].closed); assert(processors[0].disconnected);
        await ws.onmessage({ data: JSON.stringify({ type: 'session.updated' }) });
        assert.equal(microphoneCalls, 1); assert.equal(sockets.length, 1, 'no automatic reconnect');
        console.log('Voice client mocked transport/media: consent, readonly config, PCM input/output, stop and no reconnect passed. No external API or microphone used.');
    } finally { for (const timer of timers) clearTimeout(timer); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
