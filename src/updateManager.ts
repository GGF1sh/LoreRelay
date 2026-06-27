import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { t } from './i18n';


// ── Constants ────────────────────────────────────────────────────────────────

/** Matches lorerelay-0.3.1.vsix, lorerelay-v0.3.1.vsix, etc. */
const VSIX_ASSET_RE = /^lorerelay-v?[\d.]+\.vsix$/i;

/** Matches text-adventure-gm-0.3.1.zip, text-adventure-gm.zip, etc. */
const SKILL_ZIP_ASSET_RE = /^text-adventure-gm[-v\d.]*\.zip$/i;

const REQUEST_TIMEOUT_MS = 15_000;  // 15 s for GitHub API & downloads
const PROCESS_TIMEOUT_MS = 60_000;  // 60 s for code --install-extension / unzip

const ALLOWED_DOWNLOAD_HOSTS = new Set([
    'api.github.com',
    'github.com',
    'objects.githubusercontent.com',
    'codeload.github.com'
]);

function isAllowedDownloadUrl(url: string): boolean {
    try {
        const u = new URL(url);
        if (u.protocol !== 'https:') {
            return false;
        }
        const host = u.hostname.toLowerCase();
        if (ALLOWED_DOWNLOAD_HOSTS.has(host)) {
            return true;
        }
        return host.endsWith('.githubusercontent.com');
    } catch {
        return false;
    }
}

// ── Subprocess helper ────────────────────────────────────────────────────────

function spawnWithTimeout(
    cmd: string,
    args: string[],
    options: object,
    timeoutMs: number
): Promise<void> {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, options);
        let finished = false;

        const timer = setTimeout(() => {
            if (!finished) {
                finished = true;
                proc.kill();
                reject(new Error(`Process timed out after ${timeoutMs / 1000}s: ${cmd}`));
            }
        }, timeoutMs);

        proc.on('close', (code) => {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            if (code === 0) { resolve(); }
            else { reject(new Error(`Process exited with code ${code}: ${cmd}`)); }
        });

        proc.on('error', (err) => {
            if (finished) { return; }
            finished = true;
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ── Unzip (injection-safe) ───────────────────────────────────────────────────

/**
 * Extracts a zip file to destDir.
 *
 * On Windows we use PowerShell Expand-Archive but NEVER interpolate
 * user-controlled strings into the -Command string.  Instead we write a tiny
 * .ps1 script that receives paths as named parameters, then invoke it with
 * -File so PowerShell treats the args as plain data, not executable code.
 */
async function unzipFile(zipPath: string, destDir: string): Promise<void> {
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }

    if (process.platform === 'win32') {
        const scriptContent = [
            'param([string]$Zip, [string]$Dest)',
            'Expand-Archive -LiteralPath $Zip -DestinationPath $Dest -Force',
        ].join('\r\n');

        const scriptPath = path.join(os.tmpdir(), `lorerelay-unzip-${Date.now()}.ps1`);
        fs.writeFileSync(scriptPath, scriptContent, 'utf8');
        try {
            await spawnWithTimeout(
                'powershell.exe',
                ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Zip', zipPath, '-Dest', destDir],
                { shell: false },
                PROCESS_TIMEOUT_MS
            );
        } finally {
            fs.unlink(scriptPath, () => {});
        }
    } else {
        await spawnWithTimeout(
            'unzip',
            ['-o', zipPath, '-d', destDir],
            { shell: false },
            PROCESS_TIMEOUT_MS
        );
    }
}


// ── Interfaces + version helpers ──────────────────────────────────────────────

interface ReleaseAsset {
    name: string;
    browser_download_url: string;
}

interface ReleaseInfo {
    tag_name: string;
    name: string;
    body: string;
    assets: ReleaseAsset[];
}

function isVersionNewer(current: string, latest: string): boolean {
    const cleanCur = current.replace(/^v/, '');
    const cleanLat = latest.replace(/^v/, '');
    const curParts = cleanCur.split('.').map(Number);
    const latParts = cleanLat.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const c = curParts[i] || 0;
        const l = latParts[i] || 0;
        if (l > c) { return true; }
        if (c > l) { return false; }
    }
    return false;
}

function fetchLatestRelease(): Promise<ReleaseInfo> {
    return new Promise((resolve, reject) => {
        const url = 'https://api.github.com/repos/GGF1sh/LoreRelay/releases/latest';
        const options = { headers: { 'User-Agent': 'LoreRelay-Updater/1.0' } };
        const req = https.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data) as ReleaseInfo); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error('GitHub API request timed out'));
        });
    });
}

function downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 5) {
        return Promise.reject(new Error('Too many redirects'));
    }
    return new Promise((resolve, reject) => {
        const options = { headers: { 'User-Agent': 'LoreRelay-Updater/1.0' } };
        const req = https.get(url, options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location;
                if (!isAllowedDownloadUrl(nextUrl)) {
                    reject(new Error(`Blocked redirect to untrusted host: ${nextUrl}`));
                    return;
                }
                downloadFile(nextUrl, destPath, redirectCount + 1)
                    .then(resolve).catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed with HTTP ${res.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => { fileStream.close(); resolve(); });
            fileStream.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
        });
        req.on('error', reject);
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error('Download request timed out'));
        });
    });
}

function calculateFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', data => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', err => reject(err));
    });
}

// ── File utilities ────────────────────────────────────────────────────────────

function findSkillFolder(dir: string): string | undefined {
    const items = fs.readdirSync(dir);
    if (items.includes('SKILL.md')) {
        return dir;
    }
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            const found = findSkillFolder(fullPath);
            if (found) { return found; }
        }
    }
    return undefined;
}

function copyFolderRecursive(source: string, target: string) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const files = fs.readdirSync(source);
    for (const file of files) {
        const curSource = path.join(source, file);
        const curTarget = path.join(target, file);
        if (fs.statSync(curSource).isDirectory()) {
            copyFolderRecursive(curSource, curTarget);
        } else {
            fs.copyFileSync(curSource, curTarget);
        }
    }
}

/**
 * Atomically installs skillFolder → targetSkillDir.
 *
 * Strategy:
 *   1. Copy new content to <target>.tmp
 *   2. Rename existing <target> → <target>.backup  (if present)
 *   3. Rename <target>.tmp → <target>
 *   4. On failure after step 2: restore backup
 *   5. Remove .backup on success
 */
function installSkillAtomic(skillFolder: string, targetSkillDir: string): void {
    const tmpDir    = `${targetSkillDir}.tmp`;
    const backupDir = `${targetSkillDir}.backup`;

    // Clean up any previous failed attempt
    if (fs.existsSync(tmpDir))    { fs.rmSync(tmpDir,    { recursive: true, force: true }); }
    if (fs.existsSync(backupDir)) { fs.rmSync(backupDir, { recursive: true, force: true }); }

    // Step 1: copy to .tmp
    copyFolderRecursive(skillFolder, tmpDir);

    const hadExisting = fs.existsSync(targetSkillDir);
    try {
        // Step 2: retire existing → .backup
        if (hadExisting) { fs.renameSync(targetSkillDir, backupDir); }
        // Step 3: promote .tmp → target
        fs.renameSync(tmpDir, targetSkillDir);
    } catch (err) {
        // Rollback: restore backup if we moved it
        if (hadExisting && !fs.existsSync(targetSkillDir) && fs.existsSync(backupDir)) {
            try { fs.renameSync(backupDir, targetSkillDir); } catch { /* best-effort */ }
        }
        if (fs.existsSync(tmpDir)) { fs.rmSync(tmpDir, { recursive: true, force: true }); }
        throw err;
    }

    // Step 5: remove leftover backup on success
    if (fs.existsSync(backupDir)) { fs.rmSync(backupDir, { recursive: true, force: true }); }
}

async function installVsix(vsixPath: string): Promise<void> {
    let codeCmd = 'code';
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        const defaultCodePath = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');
        if (fs.existsSync(defaultCodePath)) {
            codeCmd = defaultCodePath;
        }
    }
    await spawnWithTimeout(codeCmd, ['--install-extension', vsixPath, '--force'], { shell: false }, PROCESS_TIMEOUT_MS);
}

export async function checkForUpdates(silent: boolean, context: vscode.ExtensionContext): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('LoreRelay Updater');

    const reportError = (msg: string) => {
        outputChannel.appendLine(`[Update] ERROR: ${msg}`);
        if (!silent) {
            // Only show error dialog for manual invocations; background checks stay quiet
            vscode.window.showErrorMessage(t('updater.error', { message: msg }));
        }
    };

    try {
        const currentVersion = context.extension.packageJSON.version as string;
        const release = await fetchLatestRelease();
        const latestVersion = release.tag_name;

        if (!isVersionNewer(currentVersion, latestVersion)) {
            // Save timestamp only after a successful API call
            await context.globalState.update('lorerelay.lastUpdateCheck', Date.now());
            if (!silent) {
                vscode.window.showInformationMessage(t('updater.upToDate', { version: currentVersion }));
            }
            return;
        }

        // ── Validate required assets are present before prompting ──────────
        const vsixAsset = release.assets.find(a => VSIX_ASSET_RE.test(a.name));
        const zipAsset  = release.assets.find(a => SKILL_ZIP_ASSET_RE.test(a.name));
        const sumsAsset = release.assets.find(a => a.name === 'SHA256SUMS.txt');

        if (!vsixAsset && !zipAsset) {
            reportError(`Release ${latestVersion} has no installable assets (no matching .vsix or .zip found).`);
            return;
        }

        const msg = t('updater.newVersionAvailable', { current: currentVersion, latest: latestVersion });
        const choice = await vscode.window.showInformationMessage(
            msg,
            { modal: true, detail: release.body },
            t('updater.btnUpdateNow'),
            t('updater.btnLater')
        );

        if (choice !== t('updater.btnUpdateNow')) {
            return;
        }

        // Workspace Trust guard
        if (!vscode.workspace.isTrusted) {
            vscode.window.showWarningMessage(t('extension.error.untrustedWorkspace'));
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('updater.downloading'),
            cancellable: false
        }, async (progress) => {
            const tempDir = path.join(os.tmpdir(), `lorerelay-update-${Date.now()}`);
            fs.mkdirSync(tempDir, { recursive: true });

            try {
                // Fetch SHA256SUMS.txt if available
                let sumsContent = '';
                if (sumsAsset) {
                    if (!isAllowedDownloadUrl(sumsAsset.browser_download_url)) {
                        throw new Error('Blocked untrusted SHA256SUMS.txt download URL');
                    }
                    const sumsPath = path.join(tempDir, sumsAsset.name);
                    await downloadFile(sumsAsset.browser_download_url, sumsPath);
                    sumsContent = fs.readFileSync(sumsPath, 'utf8');
                }

                const verifyChecksum = async (filePath: string, fileName: string) => {
                    if (!sumsContent) return;
                    // match "<hash> *filename" or "<hash> filename"
                    const match = sumsContent.match(new RegExp(`([a-fA-F0-9]{64})\\s+\\*?${fileName.replace(/\./g, '\\.')}`));
                    if (match) {
                        const expectedHash = match[1].toLowerCase();
                        const actualHash = await calculateFileSha256(filePath);
                        if (expectedHash !== actualHash) {
                            throw new Error(`Checksum mismatch for ${fileName}. Expected ${expectedHash}, got ${actualHash}.`);
                        }
                        outputChannel.appendLine(`[Update] SHA256 checksum verified for ${fileName}`);
                    }
                };

                // 1. Install VS Code Extension
                if (vsixAsset) {
                    if (!isAllowedDownloadUrl(vsixAsset.browser_download_url)) {
                        throw new Error('Blocked untrusted VSIX download URL');
                    }
                    progress.report({ message: t('updater.installingVsix') });
                    const vsixPath = path.join(tempDir, vsixAsset.name);
                    await downloadFile(vsixAsset.browser_download_url, vsixPath);
                    await verifyChecksum(vsixPath, vsixAsset.name);
                    await installVsix(vsixPath);
                    outputChannel.appendLine(`[Update] VSIX installed: ${vsixAsset.name}`);
                }

                // 2. Install GM Skill (atomic)
                if (zipAsset) {
                    if (!isAllowedDownloadUrl(zipAsset.browser_download_url)) {
                        throw new Error('Blocked untrusted skill zip download URL');
                    }
                    progress.report({ message: t('updater.installingSkill') });
                    const zipPath    = path.join(tempDir, zipAsset.name);
                    const extractDir = path.join(tempDir, 'skill_extract');
                    await downloadFile(zipAsset.browser_download_url, zipPath);
                    await verifyChecksum(zipPath, zipAsset.name);
                    await unzipFile(zipPath, extractDir);

                    const skillFolder = findSkillFolder(extractDir);
                    if (!skillFolder) {
                        throw new Error('Could not find SKILL.md inside the downloaded zip.');
                    }

                    const home = process.env.USERPROFILE || process.env.HOME || '';
                    const targetSkillDir = path.join(home, '.gemini', 'config', 'skills', 'text-adventure-gm');
                    installSkillAtomic(skillFolder, targetSkillDir);
                    outputChannel.appendLine(`[Update] GM skill installed to: ${targetSkillDir}`);
                }
            } finally {
                // Always clean up temp dir
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
            }
        });

        // Save timestamp only after successful install
        await context.globalState.update('lorerelay.lastUpdateCheck', Date.now());

        const reloadChoice = await vscode.window.showInformationMessage(
            t('updater.success'),
            t('updater.btnReload')
        );
        if (reloadChoice === t('updater.btnReload')) {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }

    } catch (e: any) {
        reportError(e.message || String(e));
    }
}
