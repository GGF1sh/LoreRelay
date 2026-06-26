export interface DiceLedgerEntry {
    formula: string;    // e.g. "1d20+2"
    rolls: number[];    // e.g. [13]
    modifier: number;   // e.g. 2
    total: number;      // e.g. 15
    reason?: string;    // e.g. "罠発見"
    dc?: number;        // e.g. 15
    success?: boolean;  // e.g. true if total >= dc
}

export interface StatePatchOp {
    op: "replace" | "add" | "remove";
    path: string;       // e.g. "/status/hp/current"
    value?: any;
}

export interface TurnResult {
    turnId: string;
    playerAction?: string;
    diceLedger?: DiceLedgerEntry[];
    statePatch?: StatePatchOp[];
    narration: string;
}
