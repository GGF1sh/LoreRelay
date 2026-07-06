import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import { getWorkspacePath } from './workspacePaths';
import { getGameEntryHistory } from './gameStateSync';
import * as fs from 'fs';
import {
    ensureAcceptedTurnWriterLease,
    rotateAcceptedTurnTimelineEpoch,
} from './acceptedTurnReplayGuard';

function runGit(args: string[], cwd: string): Promise<{ stdout: string, stderr: string, code: number }> {
    return new Promise((resolve) => {
        const child = spawn('git', args, { cwd, shell: false });
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

/** Workspace-appropriate defaults: excludes noise/regenerable files, keeps narrative + media so branches stay complete. */
const GITIGNORE_DEFAULT = [
    'node_modules/',
    '.env',
    '*.tmp',
    'game_state.invalid.latest.json',
    '.vscode/'
].join('\n') + '\n';

// In-memory guard so we don't re-prompt on every turn within the same session
// after a decline; the persisted gitAutoCommitInterval=0 update (below) is
// what actually prevents ensureGitInit from being reached again.
let initConsentAsked = false;

function prepareTimelineGitRestore(cwd: string, reason: string): boolean {
    const leaseConflict = ensureAcceptedTurnWriterLease(cwd, reason);
    if (leaseConflict) {
        vscode.window.showErrorMessage(`LoreRelay: ${leaseConflict.reason ?? 'Another writer is active.'}`);
        return false;
    }
    try {
        rotateAcceptedTurnTimelineEpoch(cwd);
        return true;
    } catch (e) {
        vscode.window.showErrorMessage(`LoreRelay: Failed to rotate replay epoch. ${String(e)}`);
        return false;
    }
}

async function promptGitInitConsent(cwd: string): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
        `LoreRelay: Enable Git Timeline for this workspace?\n\n${cwd}\n\nThis runs "git init" here (if not already a Git repo) and auto-commits your game state after each turn, so you can branch back to earlier moments in the story later. It only touches this workspace folder, not the LoreRelay extension itself. You can disable it anytime via the "textAdventure.gitAutoCommitInterval" setting (0 = off).`,
        { modal: true },
        'Enable Git Timeline',
        'Not Now'
    );
    return choice === 'Enable Git Timeline';
}

export async function ensureGitInit(): Promise<boolean> {
    const cwd = getWorkspacePath();
    if (!cwd) return false;

    const gitDir = path.join(cwd, '.git');
    if (fs.existsSync(gitDir)) {
        return true;
    }

    if (initConsentAsked) {
        // Already asked (and declined) once this session; the config update
        // below should short-circuit callers before we get here again, but
        // avoid nagging if that update didn't stick for some reason.
        return false;
    }
    initConsentAsked = true;

    const consent = await promptGitInitConsent(cwd);
    if (!consent) {
        try {
            await vscode.workspace.getConfiguration('textAdventure')
                .update('gitAutoCommitInterval', 0, vscode.ConfigurationTarget.Workspace);
        } catch {
            // Best-effort; if it can't be persisted, initConsentAsked still
            // prevents re-prompting for the rest of this session.
        }
        return false;
    }

    const { code } = await runGit(['init'], cwd);
    if (code === 0) {
        const ignorePath = path.join(cwd, '.gitignore');
        if (!fs.existsSync(ignorePath)) {
            fs.writeFileSync(ignorePath, GITIGNORE_DEFAULT);
        }
        await runGit(['add', '.'], cwd);
        await runGit(['commit', '-m', 'Initial commit (LoreRelay Git Timeline)'], cwd);
        vscode.window.showInformationMessage(
            'LoreRelay: Git Timeline enabled for this workspace. Disable anytime via the "textAdventure.gitAutoCommitInterval" setting.'
        );
    }
    return code === 0;
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

    // `git add` fails atomically (stages nothing) if ANY pathspec matches no
    // files, so only pass paths that currently exist. World Forge / NPC
    // Registry / party characters are optional features and may not exist
    // yet, especially early in a game.
    const candidatePaths = [
        'game_state.json',
        'game_history.json',
        'party.json',
        'characters/',
        'dice_ledger.json',
        'world_forge.json',
        'world_state.json',
        'npc_registry.json'
    ];
    const existingPaths = candidatePaths.filter(p => fs.existsSync(path.join(cwd, p)));
    if (existingPaths.length === 0) {
        return true;
    }

    await runGit(['add', ...existingPaths], cwd);
    const { code } = await runGit(['commit', '-m', `Turn ${turnIndex}`], cwd);
    return code === 0;
}

export async function branchFromTurn(turnId: string): Promise<boolean> {
    const cwd = getWorkspacePath();
    if (!cwd) return false;

    if (!fs.existsSync(path.join(cwd, '.git'))) {
        vscode.window.showWarningMessage(
            'LoreRelay: Git Timeline is not enabled for this workspace yet. Play a turn to be prompted to enable it, or check the "textAdventure.gitAutoCommitInterval" setting.'
        );
        return false;
    }

    const dirty = await runGit(['status', '--porcelain'], cwd);
    if (dirty.stdout.trim()) {
        vscode.window.showWarningMessage(
            'LoreRelay: This workspace has uncommitted changes, so branching now could carry them onto the new branch. Wait for the next auto-commit (or take another turn) before branching from history.'
        );
        return false;
    }

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
    if (!prepareTimelineGitRestore(cwd, 'git-branch-from-turn')) {
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

export interface GitTimelineBranch {
    name: string;
    isCurrent: boolean;
}

export interface GitTimelineStatus {
    enabled: boolean;
    currentBranch: string;
    branches: GitTimelineBranch[];
}

const MAX_TIMELINE_BRANCHES = 20;
/** Only branches created by branchFromTurn() are ever offered for switching. */
const TIMELINE_BRANCH_RE = /^timeline\/[a-zA-Z0-9_.-]{1,120}$/;

/** Read-only: current branch + recent timeline/* branches, for the Webview panel. */
export async function getGitTimelineStatus(): Promise<GitTimelineStatus> {
    const cwd = getWorkspacePath();
    if (!cwd || !fs.existsSync(path.join(cwd, '.git'))) {
        return { enabled: false, currentBranch: '', branches: [] };
    }

    const currentRes = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
    const currentBranch = currentRes.stdout.trim();

    const listRes = await runGit(
        ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)', 'refs/heads/timeline/'],
        cwd
    );
    const branches: GitTimelineBranch[] = listRes.stdout
        .split('\n')
        .map(l => l.trim())
        .filter(name => TIMELINE_BRANCH_RE.test(name))
        .slice(0, MAX_TIMELINE_BRANCHES)
        .map(name => ({ name, isCurrent: name === currentBranch }));

    return { enabled: true, currentBranch, branches };
}

/**
 * Checks out an existing `timeline/*` branch. Refuses to run if there are
 * uncommitted changes (never carries dirty state onto another branch) or if
 * the target isn't a real, already-existing timeline branch.
 */
export async function switchToBranch(branchName: string): Promise<boolean> {
    if (!TIMELINE_BRANCH_RE.test(branchName)) {
        vscode.window.showErrorMessage('LoreRelay: Invalid branch name.');
        return false;
    }

    const cwd = getWorkspacePath();
    if (!cwd) return false;

    if (!fs.existsSync(path.join(cwd, '.git'))) {
        vscode.window.showWarningMessage('LoreRelay: Git Timeline is not enabled for this workspace.');
        return false;
    }

    const dirty = await runGit(['status', '--porcelain'], cwd);
    if (dirty.stdout.trim()) {
        vscode.window.showWarningMessage(
            'LoreRelay: This workspace has uncommitted changes, so switching now could carry them onto the other branch. Wait for the next auto-commit (or take another turn) before switching.'
        );
        return false;
    }

    const exists = await runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${branchName}`], cwd);
    if (exists.code !== 0) {
        vscode.window.showErrorMessage(`LoreRelay: Branch "${branchName}" no longer exists.`);
        return false;
    }
    if (!prepareTimelineGitRestore(cwd, 'git-switch-timeline-branch')) {
        return false;
    }

    const { code, stderr } = await runGit(['checkout', branchName], cwd);
    if (code !== 0) {
        vscode.window.showErrorMessage(`LoreRelay: Failed to switch branch. ${stderr}`);
        return false;
    }

    const picked = await vscode.window.showInformationMessage(
        `LoreRelay: Switched to ${branchName}. Reload the window to load its game state.`,
        'Reload Window'
    );
    if (picked === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
    return true;
}
