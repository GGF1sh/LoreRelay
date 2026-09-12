import * as fs from 'fs';
import * as path from 'path';

/** Snapshot only files written by world adoption, including their backup slots. */
export function captureWorldGenesisRollback(workspace: string): () => void {
    const files = ['world_forge.json', 'npc_registry.json', 'world_state.json', 'game_rules.json'];
    const snapshot = files.flatMap(name => [name, `${name}.bak`]).map(name => {
        const target = path.join(workspace, name);
        return { target, bytes: fs.existsSync(target) ? fs.readFileSync(target) : undefined };
    });
    return () => {
        const failures: string[] = [];
        for (const { target, bytes } of snapshot) {
            try {
                const current = fs.existsSync(target) ? fs.readFileSync(target) : undefined;
                // A read-only file that never changed does not need rewriting.
                if (bytes === undefined && current === undefined || bytes && current?.equals(bytes)) continue;
                if (bytes === undefined) fs.unlinkSync(target);
                else fs.writeFileSync(target, bytes);
            } catch (error) { failures.push(`${path.basename(target)}: ${String(error)}`); }
        }
        if (failures.length) throw new Error(`World adoption rollback failed: ${failures.join('; ')}`);
    };
}
