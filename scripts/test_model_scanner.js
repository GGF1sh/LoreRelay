#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const scannerPath = path.join(__dirname, '..', 'out', 'modelScanner.js');
if (!fs.existsSync(scannerPath)) {
    console.error('FAIL: out/modelScanner.js missing — run npm run compile');
    process.exit(1);
}

const { scanLocalModelRoots, formatModelSize } = require(scannerPath);

let failed = 0;
function ok(msg) { console.log(`OK: ${msg}`); }
function fail(msg) { console.error(`FAIL: ${msg}`); failed++; }
function assert(cond, msg) { cond ? ok(msg) : fail(msg); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lorerelay-model-scan-'));
try {
    const ckptDir = path.join(tmp, 'ComfyUI', 'models', 'checkpoints', 'IL');
    const cnDir = path.join(tmp, 'ComfyUI', 'models', 'controlnet');
    const ggufDir = path.join(tmp, 'Models', 'GGUF');
    const skipDir = path.join(tmp, 'ComfyUI', 'output');
    fs.mkdirSync(ckptDir, { recursive: true });
    fs.mkdirSync(cnDir, { recursive: true });
    fs.mkdirSync(ggufDir, { recursive: true });
    fs.mkdirSync(skipDir, { recursive: true });
    fs.writeFileSync(path.join(ckptDir, 'prefectIllustriousXL_v8.safetensors'), Buffer.alloc(1024));
    fs.writeFileSync(path.join(cnDir, 'diffusers_xl_canny_full.safetensors'), Buffer.alloc(2048));
    fs.writeFileSync(path.join(ggufDir, 'qwen2.5-7b-instruct.gguf'), Buffer.alloc(512));
    fs.writeFileSync(path.join(skipDir, 'not_a_model.safetensors'), Buffer.alloc(512));
    fs.writeFileSync(path.join(tmp, 'notes.txt'), 'ignore');

    const results = scanLocalModelRoots([tmp]);
    assert(results.length === 3, `finds 3 model files (got ${results.length})`);

    const ckpt = results.find((m) => m.category === 'checkpoint');
    assert(Boolean(ckpt), 'checkpoint categorized');
    assert(ckpt && ckpt.comfyName === 'IL\\prefectIllustriousXL_v8.safetensors', 'checkpoint comfyName strips models/checkpoints');

    const cn = results.find((m) => m.category === 'controlnet');
    assert(Boolean(cn), 'controlnet categorized');
    assert(cn && cn.comfyName === 'diffusers_xl_canny_full.safetensors', 'controlnet comfyName strips models/controlnet');

    const gguf = results.find((m) => m.category === 'gguf');
    assert(Boolean(gguf), 'gguf categorized');
    assert(gguf && gguf.comfyName === 'qwen2.5-7b-instruct.gguf', 'gguf comfyName strips GGUF folder');

    assert(formatModelSize(2 * 1024 * 1024 * 1024) === '2.00 GiB', 'formatModelSize GiB');
    assert(formatModelSize(512 * 1024) === '0.5 MiB', 'formatModelSize MiB');
} finally {
    fs.rmSync(tmp, { recursive: true, force: true });
}

if (failed > 0) {
    console.error(`modelScanner tests: ${failed} failure(s)`);
    process.exit(1);
}

console.log('All model scanner tests passed.');
