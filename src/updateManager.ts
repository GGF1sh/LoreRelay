import * as vscode from 'vscode';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn } from 'child_process';
import { t } from './i18n';
import { getWorkspacePath } from './workspacePaths';

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

function downloadFile(url: string, destPath: string, redirectCount = 0): Promise<void> {
    if (redirectCount > 5) {
        return Promise.reject(new Error('Too many redirects'));
    }
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'LoreRelay-Updater/0.3.1'
            }
        };
        https.get(url, options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                // Follow redirect
                downloadFile(res.headers.location, destPath, redirectCount + 1)
                    .then(resolve)
                    .catch(reject);
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`Download failed with HTTP ${res.statusCode}`));
                return;
            }
            const fileStream = fs.createWriteStream(destPath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
            fileStream.on('error', (err) => {
                fs.unlink(destPath, () => {});
                reject(err);
            });
        }).on('error', reject);
    });
}

function fetchLatestRelease(): Promise<ReleaseInfo> {
    return new Promise((resolve, reject) => {
        const url = 'https://api.github.com/repos/GGF1sh/LoreRelay/releases/latest';
        const options = {
            headers: {
                'User-Agent': 'LoreRelay-Updater/0.3.1'
            }
        };
        https.get(url, options, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
                return;
            }
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data) as ReleaseInfo);
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

function unzipFile(zipPath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        let cmd = 'unzip';
        let args = ['-o', zipPath, '-d', destDir];
        if (process.platform === 'win32') {
            cmd = 'powershell.exe';
            args = ['-NoProfile', '-Command', `Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force`];
        }
        const proc = spawn(cmd, args, { shell: false });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Unzip failed with exit code ${code}`));
            }
        });
        proc.on('error', (err) => reject(err));
    });
}

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

async function installVsix(vsixPath: string): Promise<void> {
    let codeCmd = 'code';
    if (process.platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || '';
        const defaultCodePath = path.join(localAppData, 'Programs', 'Microsoft VS Code', 'bin', 'code.cmd');
        if (fs.existsSync(defaultCodePath)) {
            codeCmd = defaultCodePath;
        }
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(codeCmd, ['--install-extension', vsixPath, '--force'], { shell: false });
        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`VS Code extension installation failed with exit code ${code}`));
            }
        });
        proc.on('error', (err) => reject(err));
    });
}

export async function checkForUpdates(silent: boolean, context: vscode.ExtensionContext): Promise<void> {
    try {
        const currentVersion = context.extension.packageJSON.version;
        const release = await fetchLatestRelease();
        const latestVersion = release.tag_name;

        if (!isVersionNewer(currentVersion, latestVersion)) {
            if (!silent) {
                vscode.window.showInformationMessage(t('updater.upToDate', { version: currentVersion }));
            }
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

        // Verify Workspace Trust before downloading/installing
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

            const vsixAsset = release.assets.find(a => a.name.endsWith('.vsix'));
            const zipAsset = release.assets.find(a => a.name.endsWith('.zip'));

            // 1. Install VS Code Extension
            if (vsixAsset) {
                progress.report({ message: t('updater.installingVsix') });
                const vsixPath = path.join(tempDir, vsixAsset.name);
                await downloadFile(vsixAsset.browser_download_url, vsixPath);
                await installVsix(vsixPath);
            }

            // 2. Install GM Skill
            if (zipAsset) {
                progress.report({ message: t('updater.installingSkill') });
                const zipPath = path.join(tempDir, zipAsset.name);
                const extractDir = path.join(tempDir, 'skill_extract');
                await downloadFile(zipAsset.browser_download_url, zipPath);
                await unzipFile(zipPath, extractDir);

                const skillFolder = findSkillFolder(extractDir);
                if (skillFolder) {
                    const home = process.env.USERPROFILE || process.env.HOME || '';
                    const targetSkillDir = path.join(home, '.gemini', 'config', 'skills', 'text-adventure-gm');
                    if (fs.existsSync(targetSkillDir)) {
                        fs.rmSync(targetSkillDir, { recursive: true, force: true });
                    }
                    copyFolderRecursive(skillFolder, targetSkillDir);
                } else {
                    console.error('Could not find SKILL.md in downloaded zip file.');
                }
            }

            // Cleanup temp dir
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        const reloadChoice = await vscode.window.showInformationMessage(
            t('updater.success'),
            t('updater.btnReload')
        );

        if (reloadChoice === t('updater.btnReload')) {
            vscode.commands.executeCommand('workbench.action.reloadWindow');
        }

    } catch (e: any) {
        console.error('Update failed:', e);
        vscode.window.showErrorMessage(t('updater.error', { message: e.message || String(e) }));
    }
}
