// webview/modules/89a-vehicle-labels.js
// Shared display-only i18n helpers for Vehicle / Mobile Base panels (no disk writes).

(function () {
    function humanizeCode(code) {
        if (!code) { return '—'; }
        return String(code).replace(/_/g, ' ');
    }

    function enumLabel(group, code) {
        if (!code) { return '—'; }
        const key = `webview.vehicles.enum.${group}.${code}`;
        if (typeof T !== 'function') { return humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(code);
    }

    function accessReasonLabel(code) {
        if (!code || code === 'ok') { return ''; }
        const key = `webview.vehicles.accessReason.${code}`;
        if (typeof T !== 'function') { return humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(code);
    }

    function fuelBandLabel(band) {
        if (!band || band === 'ok') { return ''; }
        const key = `webview.vehicles.fuelBand.${band}`;
        if (typeof T !== 'function') { return band; }
        const translated = T(key);
        return translated && translated !== key ? translated : band;
    }

    function stockLabel(id) {
        if (!id) { return '—'; }
        const key = `webview.stock.${id}`;
        if (typeof T !== 'function') { return humanizeCode(id); }
        const translated = T(key);
        return translated && translated !== key ? translated : humanizeCode(id);
    }

    function joinLabels(codes, group) {
        if (!codes || !codes.length) { return ''; }
        return codes.map((c) => enumLabel(group, c)).join(', ');
    }

    function vehicleIdFromOverlayMarker(marker) {
        if (!marker || !marker.id) { return null; }
        const prefixes = [
            'vehicle_park_fallback_',
            'vehicle_settlement_park_',
            'vehicle_park_',
            'vehicle_',
        ];
        for (const prefix of prefixes) {
            if (marker.id.startsWith(prefix)) {
                return marker.id.slice(prefix.length);
            }
        }
        return null;
    }

    window.LR_vehicleLabels = {
        enumLabel,
        accessReasonLabel,
        fuelBandLabel,
        stockLabel,
        joinLabels,
        vehicleIdFromOverlayMarker,
        humanizeCode,
    };
})();