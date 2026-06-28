import * as vscode from 'vscode';
import * as fs from 'fs';
import { getOpenRouterApiKey } from './extension';
import { getImageMimeType } from './mediaPathCore';
import { resolveAllowedImagePath } from './mediaPaths';

const MAX_VLM_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VLM_DESCRIPTION_CHARS = 1200;
const VLM_TIMEOUT_MS = 30000;

function withTimeout(): AbortController {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), VLM_TIMEOUT_MS).unref?.();
    return controller;
}

function normalizeDescription(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null;
    }
    const text = value.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, MAX_VLM_DESCRIPTION_CHARS) : null;
}

export async function analyzeImage(imagePath: string): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const provider = config.get<string>('vlm.provider', 'disabled');
    if (provider === 'disabled') return null;

    const safePath = resolveAllowedImagePath(imagePath);
    if (!safePath) return null;

    const stats = fs.statSync(safePath);
    if (stats.size <= 0 || stats.size > MAX_VLM_IMAGE_BYTES) {
        console.warn(`VLM image skipped due to size: ${stats.size} bytes`);
        return null;
    }

    const mime = getImageMimeType(safePath);
    if (!mime) return null;

    const base64Image = fs.readFileSync(safePath).toString('base64');
    const prompt = "Describe what is happening in this image for a fantasy text-adventure GM. Focus on main subjects, environment, mood, and any active details.";

    try {
        if (provider === 'ollama') {
            const url = config.get<string>('vlm.endpoint', 'http://127.0.0.1:11434').replace(/\/$/, '');
            const model = config.get<string>('vlm.model', 'llava');
            const controller = withTimeout();
            const response = await fetch(`${url}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
                body: JSON.stringify({
                    model,
                    prompt,
                    images: [base64Image],
                    stream: false
                })
            });
            if (!response.ok) return null;
            const data = await response.json() as any;
            return normalizeDescription(data.response);
        }

        // OpenRouter path. Legacy settings values openai/gemini/anthropic still route here.
        if (provider === 'openrouter' || provider === 'openai' || provider === 'gemini' || provider === 'anthropic') {
            const apiKey = await getOpenRouterApiKey();
            if (!apiKey) return null;
            
            const model = config.get<string>('vlm.model', 'google/gemini-1.5-flash');
            const controller = withTimeout();
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/LoreRelay',
                    'X-Title': 'LoreRelay'
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        {
                            role: "user",
                            content: [
                                { type: "text", text: prompt },
                                { type: "image_url", image_url: { url: `data:${mime};base64,${base64Image}` } }
                            ]
                        }
                    ]
                })
            });
            if (!response.ok) return null;
            const data = await response.json() as any;
            return normalizeDescription(data.choices?.[0]?.message?.content);
        }

    } catch (e) {
        console.error('VLM Error:', e);
    }
    return null;
}
