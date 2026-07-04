// webview/modules/89b-mobile-base-panel.js
// Mobile Base System MB4: read-only panel in Vehicles tab (no disk writes).
// Persistence channel: turn_result.mobileBaseOps (MB3 apply gate).

(function () {
    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function stockBandClass(band) {
        if (band === 'empty') return 'mb-stock-empty';
        if (band === 'low') return 'mb-stock-low';
        return 'mb-stock-ok';
    }

    function stockBandLabel(band) {
        if (band === 'empty') return T('webview.mobileBase.stockBand.empty');
        if (band === 'low') return T('webview.mobileBase.stockBand.low');
        return T('webview.mobileBase.stockBand.ok');
    }

    function fuelBandClass(band) {
        if (band === 'empty') return 'vehicle-fuel-empty';
        if (band === 'low') return 'vehicle-fuel-low';
        return 'vehicle-fuel-ok';
    }

    function renderFacilityRows(facilities) {
        if (!facilities || !facilities.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.mobileBase.noFacilities'))}</span>`;
        }
        return facilities.map((f) => (
            `<span class="mb-facility-chip status-${escapeHtml(f.status)}">${escapeHtml(f.name)}</span>`
        )).join('');
    }

    function renderStockRows(stocks) {
        if (!stocks || !stocks.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.mobileBase.noStocks'))}</span>`;
        }
        return stocks.map((s) => (
            `<span class="mb-stock-chip ${stockBandClass(s.band)}">${escapeHtml(s.id)}: ${escapeHtml(stockBandLabel(s.band))}</span>`
        )).join('');
    }

    function renderMobileBasePanel(panel) {
        const section = document.getElementById('vehicles-mobile-base-section');
        const root = document.getElementById('vehicles-mobile-base-panel');
        if (!section || !root) return;

        if (!panel) {
            section.classList.add('hidden');
            root.innerHTML = '';
            return;
        }

        section.classList.remove('hidden');

        const warnings = [];
        if (panel.linkWarnings && panel.linkWarnings.length) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(panel.linkWarnings.join(' · '))}</div>`);
        }
        if (panel.accessWarning) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.access'))}: ${escapeHtml(panel.accessWarning)}</div>`);
        }
        if (panel.parkingFallbackId) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.parkingFallback'))}: ${escapeHtml(panel.parkingFallbackId)}</div>`);
        }
        if (panel.exteriorLimits && panel.exteriorLimits.length) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.exteriorLimits'))}: ${escapeHtml(panel.exteriorLimits.join(', '))}</div>`);
        }

        const hereBadge = panel.atCurrentLocation
            ? `<span class="vehicle-badge active">${escapeHtml(T('webview.mobileBase.atPartyLocation'))}</span>`
            : '';

        const fuelLine = panel.powerType
            ? `<div class="vehicle-stat-row ${fuelBandClass(panel.fuelBand)}">
                <span>${escapeHtml(T('webview.mobileBase.power'))}</span>
                <span>${escapeHtml(panel.powerType)} ${escapeHtml(String(panel.fuelCurrent ?? 0))}/${escapeHtml(String(panel.fuelMax ?? 0))}</span>
               </div>`
            : '';

        const hangar = panel.hangarSummary
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.hangar'))}</span><span>${escapeHtml(panel.hangarSummary)}</span></div>`
            : '';

        const community = typeof panel.communityCount === 'number'
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.community'))}</span><span>${escapeHtml(String(panel.communityCount))}</span></div>`
            : '';

        const interior = panel.interiorAccess
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.interiorAccess'))}</span><span>${escapeHtml(panel.interiorAccess)}</span></div>`
            : '';

        const problems = panel.problems && panel.problems.length
            ? `<div class="mb-problems"><span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.concerns'))}</span><ul>${panel.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
            : '';

        root.innerHTML = `
            <div class="mobile-base-panel-card">
                <div class="vehicle-detail-header">
                    <h4 class="vehicle-detail-title">${escapeHtml(panel.settlementName)}</h4>
                    ${hereBadge}
                </div>
                <div class="vehicle-detail-sub">${escapeHtml(panel.vehicleName)} · ${escapeHtml(panel.mode)} · ${escapeHtml(panel.layoutProfile)} · ${escapeHtml(panel.dockLabel)}</div>
                <p class="vehicle-garage-hint">${escapeHtml(T('webview.mobileBase.hint'))}</p>
                ${warnings.join('')}
                ${interior}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.condition'))}</span><span>${escapeHtml(panel.condition)} · HP ${escapeHtml(String(panel.hp))}/${escapeHtml(String(panel.maxHp))} · ${escapeHtml(panel.armorBand)}${panel.threatBand ? ' · ' + escapeHtml(panel.threatBand) : ''}</span></div>
                ${fuelLine}
                ${hangar}
                ${community}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.crew'))}</span><span>${escapeHtml(String(panel.crewRequired))}/${escapeHtml(String(panel.crewCapacity))}</span></div>
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.passengers'))}</span><span>${escapeHtml(String(panel.passengerCapacity))}</span></div>
                <div class="mb-section">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.facilities'))}</span>
                    <div class="mb-chip-row">${renderFacilityRows(panel.facilities)}</div>
                </div>
                <div class="mb-section">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.stocks'))}</span>
                    <div class="mb-chip-row">${renderStockRows(panel.stocks)}</div>
                </div>
                ${problems}
            </div>`;
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'worldView') { return; }
        if (msg.enableMobileBaseSystem === true) {
            renderMobileBasePanel(msg.mobileBasePanel || null);
        } else {
            renderMobileBasePanel(null);
        }
    });
})();