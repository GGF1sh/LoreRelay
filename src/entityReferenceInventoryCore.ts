// LoreRelay Identity / Reference Layer D1b: Reference inventory core (no I/O, no fs).

import {
    EntityKind,
    EntityRef,
    EntityPresence,
    EntityReferenceObservation,
} from './entityIdentityCore';

export interface InventoryInputs {
    worldForge?: any;
    npcRegistry?: any;
    vehicleState?: any;
    settlementState?: any;
    settlementLayout?: any;
    gameState?: any;
    worldState?: any;
    modProfile?: any;
    modManifests?: Record<string, any>;
}

export interface InventoryResult {
    presences: EntityPresence[];
    observations: EntityReferenceObservation[];
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.trim().length > 0;
}

/** Stable comparison for sorting EntityPresence. */
export function comparePresences(a: EntityPresence, b: EntityPresence): number {
    if (a.ref.kind !== b.ref.kind) return a.ref.kind.localeCompare(b.ref.kind);
    if (a.ref.id !== b.ref.id) return a.ref.id.localeCompare(b.ref.id);
    if (a.ledger !== b.ledger) return a.ledger.localeCompare(b.ledger);
    if (a.role !== b.role) return a.role.localeCompare(b.role);
    return a.path.localeCompare(b.path);
}

/** Stable comparison for sorting EntityReferenceObservation. */
export function compareObservations(a: EntityReferenceObservation, b: EntityReferenceObservation): number {
    if (a.sourceLedger !== b.sourceLedger) return a.sourceLedger.localeCompare(b.sourceLedger);
    if (a.sourcePath !== b.sourcePath) return a.sourcePath.localeCompare(b.sourcePath);
    if (a.targetRef.kind !== b.targetRef.kind) return a.targetRef.kind.localeCompare(b.targetRef.kind);
    if (a.targetRef.id !== b.targetRef.id) return a.targetRef.id.localeCompare(b.targetRef.id);

    const ownerAKey = a.ownerRef ? `${a.ownerRef.kind}:${a.ownerRef.id}` : '';
    const ownerBKey = b.ownerRef ? `${b.ownerRef.kind}:${b.ownerRef.id}` : '';
    return ownerAKey.localeCompare(ownerBKey);
}

/**
 * Builds the Entity Presence and Observation lists from the provided parsed ledgers.
 * Returns a deterministically sorted InventoryResult. Does not mutate inputs.
 */
export function buildEntityInventory(inputs: InventoryInputs): InventoryResult {
    const presences: EntityPresence[] = [];
    const observations: EntityReferenceObservation[] = [];

    if (!inputs) {
        return { presences, observations };
    }

    // 1. world_forge observer
    const wf = inputs.worldForge;
    if (wf && typeof wf === 'object') {
        // Regions
        if (wf.geography && Array.isArray(wf.geography.regions)) {
            wf.geography.regions.forEach((reg: any, idx: number) => {
                if (reg && isNonEmptyString(reg.id)) {
                    const ref: EntityRef = { kind: 'region', id: reg.id };
                    presences.push({
                        ref,
                        ledger: 'world_forge',
                        path: `geography.regions[${idx}]`,
                        role: 'canonical',
                        displayName: isNonEmptyString(reg.name) ? reg.name : undefined,
                    });

                    if (Array.isArray(reg.connectedTo)) {
                        reg.connectedTo.forEach((targetId: unknown, cIdx: number) => {
                            if (isNonEmptyString(targetId)) {
                                observations.push({
                                    sourceLedger: 'world_forge',
                                    sourcePath: `geography.regions[${idx}].connectedTo[${cIdx}]`,
                                    ownerRef: ref,
                                    targetRef: { kind: 'region', id: targetId },
                                });
                            }
                        });
                    }
                }
            });
        }
        // Locations
        if (wf.geography && Array.isArray(wf.geography.locations)) {
            wf.geography.locations.forEach((loc: any, idx: number) => {
                if (loc && isNonEmptyString(loc.id)) {
                    const ref: EntityRef = { kind: 'location', id: loc.id };
                    presences.push({
                        ref,
                        ledger: 'world_forge',
                        path: `geography.locations[${idx}]`,
                        role: 'canonical',
                        displayName: isNonEmptyString(loc.name) ? loc.name : undefined,
                    });

                    if (isNonEmptyString(loc.regionId)) {
                        observations.push({
                            sourceLedger: 'world_forge',
                            sourcePath: `geography.locations[${idx}].regionId`,
                            ownerRef: ref,
                            targetRef: { kind: 'region', id: loc.regionId },
                        });
                    }
                    if (isNonEmptyString(loc.factionControl)) {
                        observations.push({
                            sourceLedger: 'world_forge',
                            sourcePath: `geography.locations[${idx}].factionControl`,
                            ownerRef: ref,
                            targetRef: { kind: 'faction', id: loc.factionControl },
                        });
                    }
                }
            });
        }
        // Factions
        if (Array.isArray(wf.factions)) {
            wf.factions.forEach((fac: any, idx: number) => {
                if (fac && isNonEmptyString(fac.id)) {
                    const ref: EntityRef = { kind: 'faction', id: fac.id };
                    presences.push({
                        ref,
                        ledger: 'world_forge',
                        path: `factions[${idx}]`,
                        role: 'canonical',
                        displayName: isNonEmptyString(fac.name) ? fac.name : undefined,
                    });

                    if (Array.isArray(fac.enemies)) {
                        fac.enemies.forEach((enemyId: unknown, eIdx: number) => {
                            if (isNonEmptyString(enemyId)) {
                                observations.push({
                                    sourceLedger: 'world_forge',
                                    sourcePath: `factions[${idx}].enemies[${eIdx}]`,
                                    ownerRef: ref,
                                    targetRef: { kind: 'faction', id: enemyId },
                                });
                            }
                        });
                    }
                    if (Array.isArray(fac.allies)) {
                        fac.allies.forEach((allyId: unknown, aIdx: number) => {
                            if (isNonEmptyString(allyId)) {
                                observations.push({
                                    sourceLedger: 'world_forge',
                                    sourcePath: `factions[${idx}].allies[${aIdx}]`,
                                    ownerRef: ref,
                                    targetRef: { kind: 'faction', id: allyId },
                                });
                            }
                        });
                    }
                }
            });
        }
        // Initial NPCs (seed role)
        if (Array.isArray(wf.initialNpcs)) {
            wf.initialNpcs.forEach((npc: any, idx: number) => {
                if (npc && isNonEmptyString(npc.id)) {
                    const ref: EntityRef = { kind: 'npc', id: npc.id };
                    presences.push({
                        ref,
                        ledger: 'world_forge',
                        path: `initialNpcs[${idx}]`,
                        role: 'seed',
                        displayName: isNonEmptyString(npc.name) ? npc.name : undefined,
                    });

                    if (isNonEmptyString(npc.locationId)) {
                        observations.push({
                            sourceLedger: 'world_forge',
                            sourcePath: `initialNpcs[${idx}].locationId`,
                            ownerRef: ref,
                            targetRef: { kind: 'location', id: npc.locationId },
                        });
                    }
                    if (isNonEmptyString(npc.factionId)) {
                        observations.push({
                            sourceLedger: 'world_forge',
                            sourcePath: `initialNpcs[${idx}].factionId`,
                            ownerRef: ref,
                            targetRef: { kind: 'faction', id: npc.factionId },
                        });
                    }
                }
            });
        }
        // MapItems
        if (Array.isArray(wf.mapItems)) {
            wf.mapItems.forEach((item: any, idx: number) => {
                if (item && Array.isArray(item.revealsRegionIds)) {
                    item.revealsRegionIds.forEach((regId: unknown, rIdx: number) => {
                        if (isNonEmptyString(regId)) {
                            observations.push({
                                sourceLedger: 'world_forge',
                                sourcePath: `mapItems[${idx}].revealsRegionIds[${rIdx}]`,
                                targetRef: { kind: 'region', id: regId },
                            });
                        }
                    });
                }
            });
        }
    }

    // 2. npc_registry observer
    const nr = inputs.npcRegistry;
    if (nr && typeof nr === 'object' && nr.npcs && typeof nr.npcs === 'object') {
        Object.entries(nr.npcs).forEach(([npcId, npc]: [string, any]) => {
            if (npc && isNonEmptyString(npcId)) {
                const ref: EntityRef = { kind: 'npc', id: npcId };
                presences.push({
                    ref,
                    ledger: 'npc_registry',
                    path: `npcs.${npcId}`,
                    role: 'canonical',
                    displayName: isNonEmptyString(npc.name) ? npc.name : undefined,
                });

                if (isNonEmptyString(npc.locationId)) {
                    observations.push({
                        sourceLedger: 'npc_registry',
                        sourcePath: `npcs.${npcId}.locationId`,
                        ownerRef: ref,
                        targetRef: { kind: 'location', id: npc.locationId },
                    });
                }
                if (isNonEmptyString(npc.factionId)) {
                    observations.push({
                        sourceLedger: 'npc_registry',
                        sourcePath: `npcs.${npcId}.factionId`,
                        ownerRef: ref,
                        targetRef: { kind: 'faction', id: npc.factionId },
                    });
                }
            }
        });
    }

    // 3. vehicle_state observer
    const vs = inputs.vehicleState;
    if (vs && typeof vs === 'object') {
        if (Array.isArray(vs.vehicles)) {
            vs.vehicles.forEach((vh: any, idx: number) => {
                if (vh && isNonEmptyString(vh.id)) {
                    const ref: EntityRef = { kind: 'vehicle', id: vh.id };
                    presences.push({
                        ref,
                        ledger: 'vehicle_state',
                        path: `vehicles[${idx}]`,
                        role: 'canonical',
                        displayName: isNonEmptyString(vh.name) ? vh.name : undefined,
                    });

                    // Owner
                    if (vh.owner && typeof vh.owner === 'object') {
                        const ownerType = vh.owner.type;
                        const ownerId = vh.owner.id;
                        if (isNonEmptyString(ownerId)) {
                            let ownerKind: EntityKind | undefined;
                            if (ownerType === 'npc') ownerKind = 'npc';
                            else if (ownerType === 'faction') ownerKind = 'faction';
                            else if (ownerType === 'settlement') ownerKind = 'settlement';

                            if (ownerKind) {
                                observations.push({
                                    sourceLedger: 'vehicle_state',
                                    sourcePath: `vehicles[${idx}].owner.id`,
                                    ownerRef: ref,
                                    targetRef: { kind: ownerKind, id: ownerId },
                                });
                            }
                        }
                    }

                    // LocationId
                    if (isNonEmptyString(vh.locationId)) {
                        observations.push({
                            sourceLedger: 'vehicle_state',
                            sourcePath: `vehicles[${idx}].locationId`,
                            ownerRef: ref,
                            targetRef: { kind: 'location', id: vh.locationId },
                        });
                    }

                    // ParkedAt
                    if (vh.parkedAt && typeof vh.parkedAt === 'object') {
                        if (isNonEmptyString(vh.parkedAt.locationId)) {
                            observations.push({
                                sourceLedger: 'vehicle_state',
                                sourcePath: `vehicles[${idx}].parkedAt.locationId`,
                                ownerRef: ref,
                                targetRef: { kind: 'location', id: vh.parkedAt.locationId },
                            });
                        }
                        if (isNonEmptyString(vh.parkedAt.parkingLocationId)) {
                            observations.push({
                                sourceLedger: 'vehicle_state',
                                sourcePath: `vehicles[${idx}].parkedAt.parkingLocationId`,
                                ownerRef: ref,
                                targetRef: { kind: 'location', id: vh.parkedAt.parkingLocationId },
                            });
                        }
                    }

                    // carriedByVehicleId
                    if (isNonEmptyString(vh.carriedByVehicleId)) {
                        observations.push({
                            sourceLedger: 'vehicle_state',
                            sourcePath: `vehicles[${idx}].carriedByVehicleId`,
                            ownerRef: ref,
                            targetRef: { kind: 'vehicle', id: vh.carriedByVehicleId },
                        });
                    }

                    // hangar carriedVehicleIds
                    if (vh.hangar && Array.isArray(vh.hangar.carriedVehicleIds)) {
                        vh.hangar.carriedVehicleIds.forEach((carriedId: unknown, vIdx: number) => {
                            if (isNonEmptyString(carriedId)) {
                                observations.push({
                                    sourceLedger: 'vehicle_state',
                                    sourcePath: `vehicles[${idx}].hangar.carriedVehicleIds[${vIdx}]`,
                                    ownerRef: ref,
                                    targetRef: { kind: 'vehicle', id: carriedId },
                                });
                            }
                        });
                    }

                    // crew
                    if (Array.isArray(vh.crew)) {
                        vh.crew.forEach((assignment: any, cIdx: number) => {
                            if (assignment && isNonEmptyString(assignment.npcId)) {
                                observations.push({
                                    sourceLedger: 'vehicle_state',
                                    sourcePath: `vehicles[${idx}].crew[${cIdx}].npcId`,
                                    ownerRef: ref,
                                    targetRef: { kind: 'npc', id: assignment.npcId },
                                });
                            }
                        });
                    }

                    // mobileBase
                    if (vh.mobileBase && typeof vh.mobileBase === 'object') {
                        if (isNonEmptyString(vh.mobileBase.settlementId)) {
                            observations.push({
                                sourceLedger: 'vehicle_state',
                                sourcePath: `vehicles[${idx}].mobileBase.settlementId`,
                                ownerRef: ref,
                                targetRef: { kind: 'settlement', id: vh.mobileBase.settlementId },
                            });
                        }
                        if (isNonEmptyString(vh.mobileBase.homeLocationId)) {
                            observations.push({
                                sourceLedger: 'vehicle_state',
                                sourcePath: `vehicles[${idx}].mobileBase.homeLocationId`,
                                ownerRef: ref,
                                targetRef: { kind: 'location', id: vh.mobileBase.homeLocationId },
                            });
                        }
                        if (isNonEmptyString(vh.mobileBase.dockedAtLocationId)) {
                            observations.push({
                                sourceLedger: 'vehicle_state',
                                sourcePath: `vehicles[${idx}].mobileBase.dockedAtLocationId`,
                                ownerRef: ref,
                                targetRef: { kind: 'location', id: vh.mobileBase.dockedAtLocationId },
                            });
                        }
                    }
                }
            });
        }

        // activeVehicleId
        if (isNonEmptyString(vs.activeVehicleId)) {
            observations.push({
                sourceLedger: 'vehicle_state',
                sourcePath: 'activeVehicleId',
                targetRef: { kind: 'vehicle', id: vs.activeVehicleId },
            });
        }
    }

    // 4. settlement_state observer
    const ss = inputs.settlementState;
    if (ss && typeof ss === 'object' && isNonEmptyString(ss.settlementId)) {
        const ref: EntityRef = { kind: 'settlement', id: ss.settlementId };
        presences.push({
            ref,
            ledger: 'settlement_state',
            path: 'settlementId',
            role: 'canonical',
            displayName: isNonEmptyString(ss.name) ? ss.name : undefined,
        });

        if (isNonEmptyString(ss.locationId)) {
            observations.push({
                sourceLedger: 'settlement_state',
                sourcePath: 'locationId',
                ownerRef: ref,
                targetRef: { kind: 'location', id: ss.locationId },
            });
        }

        if (Array.isArray(ss.residents)) {
            ss.residents.forEach((res: any, rIdx: number) => {
                if (res && isNonEmptyString(res.npcId)) {
                    observations.push({
                        sourceLedger: 'settlement_state',
                        sourcePath: `residents[${rIdx}].npcId`,
                        ownerRef: ref,
                        targetRef: { kind: 'npc', id: res.npcId },
                    });
                }
            });
        }

        if (Array.isArray(ss.visitors)) {
            ss.visitors.forEach((vis: any, vIdx: number) => {
                if (vis && isNonEmptyString(vis.npcId)) {
                    observations.push({
                        sourceLedger: 'settlement_state',
                        sourcePath: `visitors[${vIdx}].npcId`,
                        ownerRef: ref,
                        targetRef: { kind: 'npc', id: vis.npcId },
                    });
                }
            });
        }

        if (Array.isArray(ss.merchants)) {
            ss.merchants.forEach((mer: any, mIdx: number) => {
                if (mer && isNonEmptyString(mer.npcId)) {
                    observations.push({
                        sourceLedger: 'settlement_state',
                        sourcePath: `merchants[${mIdx}].npcId`,
                        ownerRef: ref,
                        targetRef: { kind: 'npc', id: mer.npcId },
                    });
                }
            });
        }
    }

    // 5. settlement_layout observer
    const sl = inputs.settlementLayout;
    if (sl && typeof sl === 'object' && isNonEmptyString(sl.settlementId)) {
        presences.push({
            ref: { kind: 'settlement', id: sl.settlementId },
            ledger: 'settlement_layout',
            path: 'settlementId',
            role: 'mirror',
        });
    }

    // 6. game_state observer
    const gs = inputs.gameState;
    if (gs && typeof gs === 'object') {
        if (Array.isArray(gs.entries)) {
            gs.entries.forEach((ent: any, idx: number) => {
                if (ent && isNonEmptyString(ent.speakerNpcId)) {
                    observations.push({
                        sourceLedger: 'game_state',
                        sourcePath: `entries[${idx}].speakerNpcId`,
                        targetRef: { kind: 'npc', id: ent.speakerNpcId },
                    });
                }
            });
        }

        if (gs.world && typeof gs.world === 'object') {
            const w = gs.world;
            if (isNonEmptyString(w.currentLocationId)) {
                observations.push({
                    sourceLedger: 'game_state',
                    sourcePath: 'world.currentLocationId',
                    targetRef: { kind: 'location', id: w.currentLocationId },
                });
            }
            if (Array.isArray(w.visitedLocationIds)) {
                w.visitedLocationIds.forEach((locId: unknown, lIdx: number) => {
                    if (isNonEmptyString(locId)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `world.visitedLocationIds[${lIdx}]`,
                            targetRef: { kind: 'location', id: locId },
                        });
                    }
                });
            }
            if (Array.isArray(w.discoveredRegionIds)) {
                w.discoveredRegionIds.forEach((regId: unknown, rIdx: number) => {
                    if (isNonEmptyString(regId)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `world.discoveredRegionIds[${rIdx}]`,
                            targetRef: { kind: 'region', id: regId },
                        });
                    }
                });
            }
            if (Array.isArray(w.knownFactionIds)) {
                w.knownFactionIds.forEach((facId: unknown, fIdx: number) => {
                    if (isNonEmptyString(facId)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `world.knownFactionIds[${fIdx}]`,
                            targetRef: { kind: 'faction', id: facId },
                        });
                    }
                });
            }
            if (w.regions && typeof w.regions === 'object') {
                Object.entries(w.regions).forEach(([regionId, regData]: [string, any]) => {
                    if (regData && isNonEmptyString(regData.controllingFaction)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `world.regions.${regionId}.controllingFaction`,
                            targetRef: { kind: 'faction', id: regData.controllingFaction },
                        });
                    }
                });
            }
            if (isNonEmptyString(w.lastGeneratedLocationId)) {
                observations.push({
                    sourceLedger: 'game_state',
                    sourcePath: 'world.lastGeneratedLocationId',
                    targetRef: { kind: 'location', id: w.lastGeneratedLocationId },
                });
            }
            if (Array.isArray(w.rumorKnownRegionIds)) {
                w.rumorKnownRegionIds.forEach((regId: unknown, rIdx: number) => {
                    if (isNonEmptyString(regId)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `world.rumorKnownRegionIds[${rIdx}]`,
                            targetRef: { kind: 'region', id: regId },
                        });
                    }
                });
            }
        }

        if (gs.guild && typeof gs.guild === 'object') {
            const g = gs.guild;
            if (isNonEmptyString(g.hallLocationId)) {
                observations.push({
                    sourceLedger: 'game_state',
                    sourcePath: 'guild.hallLocationId',
                    targetRef: { kind: 'location', id: g.hallLocationId },
                });
            }
            if (Array.isArray(g.adventurers)) {
                g.adventurers.forEach((adv: any, aIdx: number) => {
                    if (adv && isNonEmptyString(adv.npcId)) {
                        observations.push({
                            sourceLedger: 'game_state',
                            sourcePath: `guild.adventurers[${aIdx}].npcId`,
                            targetRef: { kind: 'npc', id: adv.npcId },
                        });
                    }
                });
            }
            if (Array.isArray(g.quests)) {
                g.quests.forEach((qst: any, qIdx: number) => {
                    if (qst && Array.isArray(qst.partyNpcIds)) {
                        qst.partyNpcIds.forEach((npcId: unknown, nIdx: number) => {
                            if (isNonEmptyString(npcId)) {
                                observations.push({
                                    sourceLedger: 'game_state',
                                    sourcePath: `guild.quests[${qIdx}].partyNpcIds[${nIdx}]`,
                                    targetRef: { kind: 'npc', id: npcId },
                                });
                            }
                        });
                    }
                });
            }
        }
    }

    // 7. world_state observer
    const ws = inputs.worldState;
    if (ws && typeof ws === 'object') {
        if (ws.regions && typeof ws.regions === 'object') {
            Object.entries(ws.regions).forEach(([regionId, regData]: [string, any]) => {
                if (regData && isNonEmptyString(regData.controllingFaction)) {
                    observations.push({
                        sourceLedger: 'world_state',
                        sourcePath: `regions.${regionId}.controllingFaction`,
                        targetRef: { kind: 'faction', id: regData.controllingFaction },
                    });
                }
            });
        }

        if (Array.isArray(ws.questHooks)) {
            ws.questHooks.forEach((hook: any, idx: number) => {
                if (hook) {
                    if (isNonEmptyString(hook.npcId)) {
                        observations.push({
                            sourceLedger: 'world_state',
                            sourcePath: `questHooks[${idx}].npcId`,
                            targetRef: { kind: 'npc', id: hook.npcId },
                        });
                    }
                    if (isNonEmptyString(hook.factionId)) {
                        observations.push({
                            sourceLedger: 'world_state',
                            sourcePath: `questHooks[${idx}].factionId`,
                            targetRef: { kind: 'faction', id: hook.factionId },
                        });
                    }
                }
            });
        }

        if (ws.npcPositions && typeof ws.npcPositions === 'object') {
            Object.entries(ws.npcPositions).forEach(([npcId, pos]: [string, any]) => {
                if (isNonEmptyString(npcId) && pos && isNonEmptyString(pos.locationId)) {
                    observations.push({
                        sourceLedger: 'world_state',
                        sourcePath: `npcPositions.${npcId}.locationId`,
                        ownerRef: { kind: 'npc', id: npcId },
                        targetRef: { kind: 'location', id: pos.locationId },
                    });
                }
            });
        }

        if (ws.lastVisitTurnByLocation && typeof ws.lastVisitTurnByLocation === 'object') {
            Object.keys(ws.lastVisitTurnByLocation).forEach((locId) => {
                if (isNonEmptyString(locId)) {
                    observations.push({
                        sourceLedger: 'world_state',
                        sourcePath: `lastVisitTurnByLocation.${locId}`,
                        targetRef: { kind: 'location', id: locId },
                    });
                }
            });
        }

        if (ws.marketSnapshotByLocation && typeof ws.marketSnapshotByLocation === 'object') {
            Object.keys(ws.marketSnapshotByLocation).forEach((locId) => {
                if (isNonEmptyString(locId)) {
                    observations.push({
                        sourceLedger: 'world_state',
                        sourcePath: `marketSnapshotByLocation.${locId}`,
                        targetRef: { kind: 'location', id: locId },
                    });
                }
            });
        }

        if (ws.npcRelationships && typeof ws.npcRelationships === 'object') {
            Object.keys(ws.npcRelationships).forEach((pairKey) => {
                const parts = pairKey.split('|');
                if (parts.length === 2) {
                    const [idA, idB] = parts;
                    if (isNonEmptyString(idA)) {
                        observations.push({
                            sourceLedger: 'world_state',
                            sourcePath: `npcRelationships.${pairKey}`,
                            targetRef: { kind: 'npc', id: idA },
                        });
                    }
                    if (isNonEmptyString(idB)) {
                        observations.push({
                            sourceLedger: 'world_state',
                            sourcePath: `npcRelationships.${pairKey}`,
                            targetRef: { kind: 'npc', id: idB },
                        });
                    }
                }
            });
        }

        if (ws.playerNpcMilestones && typeof ws.playerNpcMilestones === 'object') {
            Object.keys(ws.playerNpcMilestones).forEach((npcId) => {
                if (isNonEmptyString(npcId)) {
                    observations.push({
                        sourceLedger: 'world_state',
                        sourcePath: `playerNpcMilestones.${npcId}`,
                        targetRef: { kind: 'npc', id: npcId },
                    });
                }
            });
        }
    }

    // 8. mods observer
    const mp = inputs.modProfile;
    if (mp && typeof mp === 'object') {
        if (Array.isArray(mp.enabledMods)) {
            mp.enabledMods.forEach((entry: any, idx: number) => {
                if (entry && isNonEmptyString(entry.modId)) {
                    presences.push({
                        ref: { kind: 'mod', id: entry.modId },
                        ledger: 'mod_profile',
                        path: `enabledMods[${idx}].modId`,
                        role: 'mirror',
                    });
                }
            });
        }
    }

    const mms = inputs.modManifests;
    if (mms && typeof mms === 'object') {
        Object.entries(mms).forEach(([modId, manifest]: [string, any]) => {
            if (isNonEmptyString(modId) && manifest && typeof manifest === 'object') {
                const ref: EntityRef = { kind: 'mod', id: modId };
                presences.push({
                    ref,
                    ledger: 'mod_manifests',
                    path: `mods.${modId}`,
                    role: 'canonical',
                    displayName: isNonEmptyString(manifest.name) ? manifest.name : undefined,
                });

                if (Array.isArray(manifest.dependencies)) {
                    manifest.dependencies.forEach((dep: any, idx: number) => {
                        if (dep && isNonEmptyString(dep.modId)) {
                            observations.push({
                                sourceLedger: 'mod_manifests',
                                sourcePath: `mods.${modId}.dependencies[${idx}].modId`,
                                ownerRef: ref,
                                targetRef: { kind: 'mod', id: dep.modId },
                            });
                        }
                    });
                }

                if (Array.isArray(manifest.conflicts)) {
                    manifest.conflicts.forEach((conflict: any, idx: number) => {
                        if (conflict && isNonEmptyString(conflict.modId)) {
                            observations.push({
                                sourceLedger: 'mod_manifests',
                                sourcePath: `mods.${modId}.conflicts[${idx}].modId`,
                                ownerRef: ref,
                                targetRef: { kind: 'mod', id: conflict.modId },
                            });
                        }
                    });
                }
            }
        });
    }

    // Sort deterministically before returning
    presences.sort(comparePresences);
    observations.sort(compareObservations);

    return { presences, observations };
}
