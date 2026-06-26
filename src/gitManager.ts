import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getWorkspacePath } from './workspacePaths';
import { getGameEntryHistory } from './gameStateSync';
import * as fs from 'fs';

function runGit(args: string[], cwd: string): Promise<{ stdout: string, stderr: string, code: number }> {
    return new Promise((resolve) => {
        const child = spawn('git', args, { cwd });
        let stdout = '';
        let stderr = '';
        child.stdout?.on('data', d => stdout += d.toString());
        child.stderr?.on('data', d => stderr += d.toString());
        child.on('close', code => {
            resolve({ stdout, stderr, code: code ?? 1 });
        });
        child.on('error', err => {
            resolve({ stdout: '', stderr: err.message, code: 1 });
        });
    });
}

export async function ensureGitInit(): Promise<boolean> {
    const cwd = getWorkspacePath();
    if (!cwd) return false;
    
    const gitDir = path.join(cwd, '.git');
    if (!fs.existsSync(gitDir)) {
        const { code } = await runGit(['init'], cwd);
        if (code === 0) {
            const ignorePath = path.join(cwd, '.gitignore');
            if (!fs.existsSync(ignorePath)) {
                fs.writeFileSync(ignorePath, 'node_modules/\n.env\n');
            }
            await runGit(['add', '.'], cwd);
            await runGit(['commit', '-m', 'Initial commit'], cwd);
        }
        return code === 0;
    }
    return true;
}

export async function commitTurn(turnIndex: number): Promise<boolean> {
    const cwd = getWorkspacePath();
    if (!cwd) return false;
    
    const ok = await ensureGitInit();
    if (!ok) return false;
    
    const status = await runGit(['status', '--porcelain'], cwd);
    if (!status.stdout.trim()) {
        return true; 
    }
    
    await runGit(['add', 'game_state.json', 'game_history.json', 'party.json', 'characters/', 'dice_ledger.json'], cwd);
    const { code } = await runGit(['commit', '-m', `Turn ${turnIndex}`], cwd);
    return code === 0;
}

export async function branchFromTurn(turnId: string): Promise<boolean> {
    const cwd = getWorkspacePath();
    if (!cwd) return false;
    
    const history = getGameEntryHistory();
    const entryIndex = history.findIndex(e => e.id === turnId);
    if (entryIndex === -1) {
        vscode.window.showErrorMessage(`LoreRelay: Cannot find turn with ID ${turnId}`);
        return false;
    }
    
    // Count how many GM turns exist up to this entry inclusive
    const turnIndex = history.slice(0, entryIndex + 1).filter(e => e.role === 'gm').length;
    
    const log = await runGit(['log', '--grep', `^Turn ${turnIndex}$`, '--format=%H', '-n', '1'], cwd);
    const hash = log.stdout.trim();
    if (!hash) {
        vscode.window.showErrorMessage(`LoreRelay: Cannot find commit for Turn ${turnIndex}`);
        return false;
    }
    
    const branchName = `timeline/turn_${turnIndex}_${Date.now()}`;
    const { code, stderr } = await runGit(['checkout', '-b', branchName, hash], cwd);
    if (code !== 0) {
        vscode.window.showErrorMessage(`LoreRelay: Failed to branch timeline. ${stderr}`);
        return false;
    }
    
    vscode.window.showInformationMessage(`LoreRelay: Branched to ${branchName} at Turn ${turnIndex}`);
    return true;
}
