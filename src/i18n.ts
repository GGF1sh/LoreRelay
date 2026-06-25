import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export type SupportedLocale = 'ja' | 'en' | 'zh-CN' | 'zh-TW';

const SUPPORTED: SupportedLocale[] = ['ja', 'en', 'zh-CN', 'zh-TW'];
const FALLBACK: SupportedLocale = 'en';

let extensionPath = '';
const bundleCache = new Map<SupportedLocale, Record<string, string>>();

export function initI18n(extPath: string): void {
    extensionPath = extPath;
    bundleCache.clear();
}

export function normalizeLocale(raw: string | undefined): SupportedLocale {
    const v = (raw || '').trim();
    if (SUPPORTED.includes(v as SupportedLocale)) {
        return v as SupportedLocale;
    }
    if (v.toLowerCase() === 'zh-tw' || v === 'zh_TW') {
        return 'zh-TW';
    }
    if (v.toLowerCase() === 'zh-cn' || v === 'zh_CN') {
        return 'zh-CN';
    }
    return FALLBACK;
}

export function getConfiguredLocale(): SupportedLocale {
    const config = vscode.workspace.getConfiguration('textAdventure');
    return normalizeLocale(config.get<string>('locale', FALLBACK));
}

function loadBundle(locale: SupportedLocale): Record<string, string> {
    const cached = bundleCache.get(locale);
    if (cached) {
        return cached;
    }

    const localesDir = path.join(extensionPath, 'locales');
    const filePath = path.join(localesDir, `${locale}.json`);
    let strings: Record<string, string> = {};

    try {
        if (fs.existsSync(filePath)) {
            strings = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
    } catch (e) {
        console.error(`[i18n] Failed to load ${filePath}:`, e);
    }

    if (locale !== FALLBACK) {
        const fallback = loadBundle(FALLBACK);
        strings = { ...fallback, ...strings };
    }

    bundleCache.set(locale, strings);
    return strings;
}

export function t(key: string, vars?: Record<string, string | number>, locale?: SupportedLocale): string {
    const loc = locale ?? getConfiguredLocale();
    const bundle = loadBundle(loc);
    let text = bundle[key] ?? loadBundle(FALLBACK)[key] ?? key;
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
    }
    return text;
}

export function getWebviewStrings(locale?: SupportedLocale): Record<string, string> {
    const loc = locale ?? getConfiguredLocale();
    const bundle = loadBundle(loc);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bundle)) {
        if (k.startsWith('webview.')) {
            out[k] = v;
        }
    }
    return out;
}

export function getGmPromptStrings(locale?: SupportedLocale): Record<string, string> {
    const loc = locale ?? getConfiguredLocale();
    const bundle = loadBundle(loc);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bundle)) {
        if (k.startsWith('gm.')) {
            out[k] = v;
        }
    }
    return out;
}

export function getSupportedLocales(): SupportedLocale[] {
    return [...SUPPORTED];
}