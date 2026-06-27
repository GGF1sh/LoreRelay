import * as vscode from 'vscode';
import * as fs from 'fs';
import { getOpenRouterApiKey } from './extension';

export async function analyzeImage(imagePath: string): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const provider = config.get<string>('vlm.provider', 'disabled');
    if (provider === 'disabled') return null;

    if (!fs.existsSync(imagePath)) return null;

    const base64Image = fs.readFileSync(imagePath).toString('base64');
    const prompt = "Describe what is happening in this image for a fantasy text-adventure GM. Focus on main subjects, environment, mood, and any active details.";

    try {
        if (provider === 'ollama') {
            const url = config.get<string>('vlm.endpoint', 'http://127.0.0.1:11434').replace(/\/$/, '');
            const model = config.get<string>('vlm.model', 'llava');
            const response = await fetch(`${url}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt,
                    images: [base64Image],
                    stream: false
                })
            });
            if (!response.ok) return null;
            const data = await response.json() as any;
            return data.response || null;
        }

        // Catch-all for multimodal standard (OpenRouter handles Gemini/OpenAI/Anthropic if they support image_url)
        if (provider === 'openrouter' || provider === 'openai' || provider === 'gemini' || provider === 'anthropic') {
            const apiKey = await getOpenRouterApiKey();
            if (!apiKey) return null;
            
            const model = config.get<string>('vlm.model', 'google/gemini-1.5-flash');
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
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
                                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } }
                            ]
                        }
                    ]
                })
            });
            if (!response.ok) return null;
            const data = await response.json() as any;
            return data.choices?.[0]?.message?.content || null;
        }

    } catch (e) {
        console.error('VLM Error:', e);
    }
    return null;
}
