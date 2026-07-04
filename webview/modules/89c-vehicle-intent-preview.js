// webview/modules/89c-vehicle-intent-preview.js
// World Intent WI3a-1: Tier 1 read-only preview for the Vehicles tab (no disk writes).
//
// Pure function of fields already present in the `vehicleGarage` payload the host
// already sends (see docs/WORLD_INTENT_WI3A_PREVIEW_UI_DESIGN.md, Phase WI3a-1).
// This module does not call any WorldIntentCore host query/execute function and
// does not import any src/*.ts module. It re-derives only the payload-free subset
// of that taxonomy that can be answered from state already on screen.
// `move_vehicle` has no candidate destination here, so it is intentionally left as
// a "needs_input" pseudo-state rather than a real allowed/valid_noop verdict.

(function () {
    const PREVIEW_ACTIONS = ['set_active_vehicle', 'move_vehicle', 'repair_vehicle', 'refuel_vehicle'];

    function blockedRow(action, reasonKey) {
        return {
            action,
            statusClass: 'blocked',
            textKey: 'webview.vehicles.intentPreview.status.blockedPrefix',
            reasonKey,
        };
    }

    function computeRow(action, item, enableVehicleSystem) {
        if (enableVehicleSystem === false) {
            return blockedRow(action, 'webview.vehicles.intentPreview.reason.systemDisabled');
        }
        if (item.status === 'lost') {
            return blockedRow(action, 'webview.vehicles.intentPreview.reason.vehicleLost');
        }

        switch (action) {
            case 'set_active_vehicle':
                if (item.isActive) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyActive' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.availableActivate' };
            case 'move_vehicle':
                return { action, statusClass: 'needs_input', textKey: 'webview.vehicles.intentPreview.status.needsDestination' };
            case 'repair_vehicle':
                if (item.hp >= item.maxHp) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyMaxHp' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.repairable' };
            case 'refuel_vehicle':
                if (!item.powerType) {
                    return blockedRow(action, 'webview.vehicles.intentPreview.reason.noFuelTank');
                }
                if ((item.fuelCurrent ?? 0) >= (item.fuelMax ?? 0)) {
                    return { action, statusClass: 'valid_noop', textKey: 'webview.vehicles.intentPreview.status.alreadyFull' };
                }
                return { action, statusClass: 'allowed', textKey: 'webview.vehicles.intentPreview.status.refuelable' };
            default:
                return blockedRow(action, 'webview.vehicles.intentPreview.reason.systemDisabled');
        }
    }

    function computeRows(item, enableVehicleSystem) {
        if (!item) { return []; }
        return PREVIEW_ACTIONS.map((action) => computeRow(action, item, enableVehicleSystem));
    }

    window.LR_vehicleIntentPreview = {
        PREVIEW_ACTIONS,
        computeRows,
    };
})();
