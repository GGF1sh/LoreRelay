// Region hazard one-line GM flavor (pure, no vscode/fs/DOM).

import type { Region, RegionHazard } from './worldForgeCore';

const HAZARD_GM_LINES: Record<RegionHazard, string> = {
    radiation: 'Ambient radiation — narrate dosimeters, shelter breaks, and long-term exposure risk.',
    toxic: 'Toxic atmosphere or runoff — narrate filters, symptoms, and contaminated ground.',
    infested: 'Infested territory — narrate swarms, barricades, and civilian flight.',
    quarantine: 'Quarantine zone — narrate checkpoints, cordons, and restricted movement.',
    anomaly: 'Reality anomaly — narrate unstable physics, unreliable instruments, and dread.',
    haunted: 'Haunted ground — narrate omens, cold spots, and unreliable witnesses.',
    storm: 'Severe weather band — narrate travel delays, damaged routes, and shelter hunts.',
    corrupted: 'Corrupted land — narrate warped flora, tainted water, and moral unease.',
};

/** Single capped GM line when the player region carries a genre hazard tag. */
export function buildRegionHazardPromptLine(region: Region | undefined): string | undefined {
    if (!region?.hazard) { return undefined; }
    const line = HAZARD_GM_LINES[region.hazard];
    if (!line) { return undefined; }
    const name = region.name?.trim();
    const prefix = name ? `Region hazard (${name}): ` : 'Region hazard: ';
    return `${prefix}${line}`;
}