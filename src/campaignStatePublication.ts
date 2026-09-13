import * as path from 'path';
import { rebindAcceptedTurnCampaignInstance, runAcceptedTurnTimelineRestoreTransaction } from './acceptedTurnReplayGuard';
import { commitGameStateAtPathForRuntimeAuthority } from './stateManager';
import { recoverWaterNavigation } from './waterNavigationStore';

/** Host-only new-campaign publication under the existing writer lease and failure latch. */
export async function publishNewCampaignState(workspace: string, state: Record<string, unknown>, publishHistory: () => void): Promise<void> {
    const result = await runAcceptedTurnTimelineRestoreTransaction(workspace, 'new-campaign-publication', () => {
        recoverWaterNavigation(workspace);
        rebindAcceptedTurnCampaignInstance(workspace);
        const committed = commitGameStateAtPathForRuntimeAuthority(path.join(workspace, 'game_state.json'), state, {
            createBackup: true, mergeProfile: 'replace', navigationPublication: 'campaign-reset', runtimeAcceptedTurnWitnessMode: 'clear',
        });
        if (!committed.ok) throw new Error(committed.reason.join('; '));
        publishHistory();
    });
    if (!('ok' in result) || !result.ok) throw new Error('reason' in result ? result.reason : 'Campaign publication failed');
}
