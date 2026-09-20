import * as vscode from 'vscode';
import { getGmProvider } from './workspacePaths';
import { getOpenRouterApiKey } from './extension';

export interface LlmOptions {
    temperature?: number;
    maxTokens?: number;
    provider?: string;
    model?: string;
}

export async function generateText(systemPrompt: string, userPrompt: string, options?: LlmOptions): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('textAdventure');
    const provider = options?.provider || getGmProvider();

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    try {
        if (provider === 'openrouter') {
            const apiKey = await getOpenRouterApiKey();
            if (!apiKey) {
                console.error('LLMClient: OpenRouter API Key missing');
                return null;
            }
            const model = options?.model || config.get<string>('gmBridge.openRouter.model', 'openrouter/auto');
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
                    messages,
                    temperature: options?.temperature ?? 0.7,
                    max_tokens: options?.maxTokens ?? 150
                })
            });
            if (!response.ok) {
                console.error(`LLMClient: OpenRouter Error ${response.statusText}`);
                return null;
            }
            const data = await response.json() as any;
            return data.choices?.[0]?.message?.content || null;
        }

        if (provider === 'ollama') {
            const url = config.get<string>('gmBridge.ollama.url', 'http://127.0.0.1:11434').replace(/\/$/, '');
            const model = options?.model || config.get<string>('gmBridge.ollama.model', 'llama3');
            const response = await fetch(`${url}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages,
                    stream: false,
                    options: {
                        temperature: options?.temperature ?? 0.7,
                        num_predict: options?.maxTokens ?? 150
                    }
                })
            });
            if (!response.ok) {
                console.error(`LLMClient: Ollama Error ${response.statusText}`);
                return null;
            }
            const data = await response.json() as any;
            return data.message?.content || null;
        }

        if (provider === 'koboldcpp') {
            const url = config.get<string>('gmBridge.koboldcpp.url', 'http://127.0.0.1:5001').replace(/\/$/, '');
            // KoboldCPP OpenAI compatible endpoint
            const response = await fetch(`${url}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages,
                    temperature: options?.temperature ?? 0.7,
                    max_tokens: options?.maxTokens ?? 150
                })
            });
            if (!response.ok) {
                console.error(`LLMClient: KoboldCPP Error ${response.statusText}`);
                return null;
            }
            const data = await response.json() as any;
            return data.choices?.[0]?.message?.content || null;
        }

        console.error(`LLMClient: Unsupported provider ${provider}`);
        return null;

    } catch (e) {
        console.error('LLMClient Error:', e);
        return null;
    }
}
