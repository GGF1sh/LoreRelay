import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getGameEntryHistory } from './gameStateSync';

function encodeImageToBase64(imagePath: string): string | undefined {
    if (!imagePath) return undefined;
    try {
        const fullPath = imagePath.replace('file:///', '').replace(/\//g, '\\');
        if (fs.existsSync(fullPath)) {
            const ext = path.extname(fullPath).toLowerCase();
            const mimeType = ext === '.png' ? 'image/png' : (ext === '.jpeg' || ext === '.jpg' ? 'image/jpeg' : 'image/webp');
            const data = fs.readFileSync(fullPath).toString('base64');
            return `data:${mimeType};base64,${data}`;
        }
    } catch (e) {
        console.error('Failed to encode image:', e);
    }
    return undefined;
}

export async function exportSagaToHtml(targetUri: vscode.Uri): Promise<void> {
    const entries = getGameEntryHistory();
    if (!entries || entries.length === 0) {
        vscode.window.showInformationMessage('No chat history to export.');
        return;
    }

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>LoreRelay Saga Archive</title>
<style>
    body { font-family: sans-serif; background: #1e1e1e; color: #d4d4d4; padding: 20px; max-width: 800px; margin: 0 auto; line-height: 1.6; }
    .entry { margin-bottom: 20px; padding: 15px; border-radius: 8px; background: #2d2d2d; border-left: 4px solid #555; }
    .entry.user { border-left-color: #007acc; }
    .entry.gm { border-left-color: #d16969; }
    .entry.system { border-left-color: #6a9955; font-style: italic; opacity: 0.8; }
    .role { font-weight: bold; margin-bottom: 8px; font-size: 0.9em; text-transform: uppercase; color: #9cdcfe; }
    .entry.gm .role { color: #ce9178; }
    .content { white-space: pre-wrap; }
    .image-container { margin-top: 10px; text-align: center; }
    .image-container img { max-width: 100%; border-radius: 4px; box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
</style>
</head>
<body>
<h1>Saga Archive</h1>
`;

    for (const e of entries) {
        const cssClass = e.role;
        html += `<div class="entry ${cssClass}">\n`;
        html += `<div class="role">${e.role}</div>\n`;
        html += `<div class="content">${escapeHtml(e.content)}</div>\n`;
        if (e.image) {
            const b64 = encodeImageToBase64(e.image);
            if (b64) {
                html += `<div class="image-container"><img src="${b64}" alt="Generated Image" /></div>\n`;
            }
        }
        html += `</div>\n`;
    }

    html += `</body>\n</html>`;

    try {
        fs.writeFileSync(targetUri.fsPath, html, 'utf-8');
        vscode.window.showInformationMessage(`Exported Saga to ${path.basename(targetUri.fsPath)}`);
    } catch (e: any) {
        vscode.window.showErrorMessage(`Failed to export HTML: ${e.message}`);
    }
}

function escapeHtml(str: string): string {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
