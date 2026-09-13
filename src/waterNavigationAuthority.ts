import * as fs from 'fs';
import * as path from 'path';
import { parseWorldForge } from './worldForgeCore';
import { parseVehicleStateDocument, projectVehicleStateDocumentMechanical } from './vehicleStateDocumentCore';
import { evaluateNavigation } from './waterNavigationCore';
import { navigationPending, navigationWriteActive } from './waterNavigationStore';

/** Legacy movement may only commit an evaluated safe walk; vehicle travel belongs to the multi-ledger owner. */
export function navigationGameWriteError(root: string, before: Record<string, unknown> | undefined, after: Record<string, unknown>): string | undefined {
    if (navigationWriteActive(root)) return;
    try {
        if (navigationPending(root)) return '未完了の航行があります。ワールド画面を開いて復元してください。';
        const from = (before?.world as { currentLocationId?: string } | undefined)?.currentLocationId;
        const to = (after.world as { currentLocationId?: string } | undefined)?.currentLocationId;
        if (!from || from === to) return;
        const file = path.join(root, 'world_forge.json');
        if (!fs.existsSync(file)) return;
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (raw?.geography?.waterways === undefined) return;
        const forge = parseWorldForge(raw);
        if (!forge || !to) return '水系がある世界の移動先が無効です。';
        const fleetFile = path.join(root, 'vehicle_state.json');
        if (fs.existsSync(fleetFile)) {
            const parsed = parseVehicleStateDocument(JSON.parse(fs.readFileSync(fleetFile, 'utf8')));
            if (parsed.kind !== 'valid_v1' && parsed.kind !== 'valid_v2') return '車両情報を確認できません。';
            const fleet = projectVehicleStateDocumentMechanical(parsed.document);
            if (fleet.activeVehicleId) return '車両の移動はワールドの「航路・渡河」で確認してください。';
        }
        const result = evaluateNavigation(forge, from, to).preferred;
        if (result.status !== 'safe') return '移動不可: ' + result.reasons.join(' / ');
    } catch (e) { return '航路検証失敗: ' + String(e); }
}

/** Prevent AI/legacy vehicle updates from bypassing the joint position/HP travel transaction. */
export function navigationVehicleWriteError(root: string, before: unknown, after: unknown): string | undefined {
    if (navigationWriteActive(root)) return;
    try {
        if (navigationPending(root)) return '未完了の航行があります。';
        const file = path.join(root, 'world_forge.json');
        if (!fs.existsSync(file) || JSON.parse(fs.readFileSync(file, 'utf8'))?.geography?.waterways === undefined) return;
        const a = parseVehicleStateDocument(before), b = parseVehicleStateDocument(after);
        if ((a.kind !== 'valid_v1' && a.kind !== 'valid_v2') || (b.kind !== 'valid_v1' && b.kind !== 'valid_v2')) return '車両情報が無効です。';
        const previous = projectVehicleStateDocumentMechanical(a.document), next = projectVehicleStateDocumentMechanical(b.document);
        for (const v of previous.vehicles) {
            const n = next.vehicles.find(item => item.id === v.id);
            if (n && (n.locationId !== v.locationId || JSON.stringify(n.parkedAt) !== JSON.stringify(v.parkedAt) || JSON.stringify(n.waterProfile) !== JSON.stringify(v.waterProfile))) return '船・車両の位置変更には「航路・渡河」を使用してください。航行性能は世界の設定で指定します。';
        }
    } catch (e) { return '航路検証失敗: ' + String(e); }
}
