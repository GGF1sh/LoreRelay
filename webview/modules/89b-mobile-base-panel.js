// webview/modules/89b-mobile-base-panel.js
// Mobile Base System MB4/MB5: read-only panel + Settlement interior view entry (no disk writes).
// Persistence channel: turn_result.mobileBaseOps (MB3 apply gate).

(function () {
    let _mbPanelWorldMsg = null;

    const L = () => (window.LR_vehicleLabels || {
        enumLabel: (_g, c) => (c || '—'),
        accessReasonLabel: (c) => (c || ''),
        fuelBandLabel: (b) => (b && b !== 'ok' ? b : ''),
        stockLabel: (id) => id,
        joinLabels: (codes, g) => (codes || []).join(', '),
        humanizeCode: (c) => String(c || '').replace(/_/g, ' '),
    });

    function mbLabel(group, code) {
        if (!code) { return '—'; }
        const key = `webview.mobileBase.enum.${group}.${code}`;
        if (typeof T !== 'function') { return L().humanizeCode(code); }
        const translated = T(key);
        return translated && translated !== key ? translated : L().humanizeCode(code);
    }

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

    function openMobileBaseInteriorView(mapMode) {
        if (typeof activateStatusPane === 'function') {
            activateStatusPane('pane-world');
        } else {
            document.getElementById('tab-btn-world')?.click();
        }
        if (typeof setWorldMapMode === 'function') {
            setWorldMapMode(mapMode, { persist: true });
        }
    }

    function renderInteriorActions(interior) {
        if (!interior) {
            return '';
        }
        if (interior.interiorBlocked) {
            const reasonCode = interior.interiorBlockReason || interior.interiorAccess || 'blocked';
            const reason = mbLabel('interiorAccess', reasonCode);
            return `<p class="vehicle-warning mb-interior-blocked">${escapeHtml(T('webview.mobileBase.interiorBlocked'))}: ${escapeHtml(reason)}</p>`;
        }
        const buttons = [];
        if (interior.hasCanvas) {
            buttons.push(`<button type="button" class="small-btn mb-interior-btn" data-mb-view="settlement">${escapeHtml(T('webview.mobileBase.viewInteriorCanvas'))}</button>`);
        }
        if (interior.hasDiorama) {
            buttons.push(`<button type="button" class="small-btn mb-interior-btn" data-mb-view="diorama">${escapeHtml(T('webview.mobileBase.viewInteriorDiorama'))}</button>`);
        }
        if (!buttons.length) {
            return '';
        }
        return `<div class="mb-interior-actions">${buttons.join('')}</div>`;
    }

    function wireInteriorActionButtons(root) {
        root.querySelectorAll('.mb-interior-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mb-view');
                if (mode === 'settlement' || mode === 'diorama') {
                    openMobileBaseInteriorView(mode);
                }
            });
        });
    }

    function renderStockRows(stocks) {
        if (!stocks || !stocks.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.mobileBase.noStocks'))}</span>`;
        }
        return stocks.map((s) => (
            `<span class="mb-stock-chip ${stockBandClass(s.band)}">${escapeHtml(L().stockLabel(s.id))}: ${escapeHtml(stockBandLabel(s.band))}</span>`
        )).join('');
    }

    function renderLinkUnavailable() {
        return `<div class="mobile-base-panel-card mobile-base-unavailable">
            <p class="vehicle-warning">${escapeHtml(T('webview.mobileBase.linkUnavailable'))}</p>
        </div>`;
    }

    function renderMobileBasePanel(panel) {
        const section = document.getElementById('vehicles-mobile-base-section');
        const root = document.getElementById('vehicles-mobile-base-panel');
        if (!section || !root) return;

        if (!panel) {
            root.innerHTML = renderLinkUnavailable();
            return;
        }

        section.open = true;

        const warnings = [];
        if (panel.linkWarnings && panel.linkWarnings.length) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(panel.linkWarnings.join(' · '))}</div>`);
        }
        if (panel.accessReasonCode) {
            const reason = L().accessReasonLabel(panel.accessReasonCode);
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.access'))}: ${escapeHtml(reason)}</div>`);
        }
        if (panel.parkingFallbackId) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.parkingFallback'))}: ${escapeHtml(panel.parkingFallbackId)}</div>`);
        }
        if (panel.exteriorLimits && panel.exteriorLimits.length) {
            const limits = L().joinLabels(panel.exteriorLimits, 'blocker');
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.mobileBase.exteriorLimits'))}: ${escapeHtml(limits)}</div>`);
        }

        const hereBadge = panel.atCurrentLocation
            ? `<span class="vehicle-badge active">${escapeHtml(T('webview.mobileBase.atPartyLocation'))}</span>`
            : '';

        const fuelBandText = L().fuelBandLabel(panel.fuelBand);
        const fuelLine = panel.powerType
            ? `<div class="vehicle-stat-row ${fuelBandClass(panel.fuelBand)}">
                <span>${escapeHtml(T('webview.mobileBase.power'))}</span>
                <span>${escapeHtml(L().enumLabel('powerType', panel.powerType))} ${escapeHtml(String(panel.fuelCurrent ?? 0))}/${escapeHtml(String(panel.fuelMax ?? 0))}${fuelBandText ? ` <span class="vehicle-fuel-band-label">${escapeHtml(fuelBandText)}</span>` : ''}</span>
               </div>`
            : '';

        const hangar = panel.hangarSummary
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.hangar'))}</span><span>${escapeHtml(panel.hangarSummary)}</span></div>`
            : '';

        const community = typeof panel.communityCount === 'number'
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.community'))}</span><span>${escapeHtml(String(panel.communityCount))}</span></div>`
            : '';

        const interior = panel.interiorAccess
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.interiorAccess'))}</span><span>${escapeHtml(mbLabel('interiorAccess', panel.interiorAccess))}</span></div>`
            : '';

        const problems = panel.problems && panel.problems.length
            ? `<div class="mb-problems"><span class="vehicle-bar-label">${escapeHtml(T('webview.mobileBase.concerns'))}</span><ul>${panel.problems.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul></div>`
            : '';

        const interiorActions = renderInteriorActions(_mbPanelWorldMsg ? _mbPanelWorldMsg.mobileBaseInterior : null);

        const sub = [
            panel.vehicleName,
            mbLabel('mode', panel.mode),
            mbLabel('layoutProfile', panel.layoutProfile),
            panel.dockLabel,
        ].filter(Boolean).join(' · ');

        const conditionParts = [
            L().enumLabel('condition', panel.condition),
            `HP ${panel.hp}/${panel.maxHp}`,
            L().enumLabel('armorBand', panel.armorBand),
        ];
        if (panel.threatBand) {
            conditionParts.push(L().enumLabel('threatBand', panel.threatBand));
        }

        root.innerHTML = `
            <div class="mobile-base-panel-card">
                <div class="vehicle-detail-header">
                    <h4 class="vehicle-detail-title">${escapeHtml(panel.settlementName)}</h4>
                    ${hereBadge}
                </div>
                <div class="vehicle-detail-sub">${escapeHtml(sub)}</div>
                <p class="vehicle-garage-hint">${escapeHtml(T('webview.mobileBase.hint'))}</p>
                ${warnings.join('')}
                ${interior}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.mobileBase.condition'))}</span><span>${escapeHtml(conditionParts.join(' · '))}</span></div>
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
                ${interiorActions}
            </div>`;
        wireInteriorActionButtons(root);
    }

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (!msg || msg.type !== 'worldView') { return; }
        _mbPanelWorldMsg = msg;
        const section = document.getElementById('vehicles-mobile-base-section');
        if (!section) { return; }
        if (msg.enableMobileBaseSystem === true) {
            section.classList.remove('hidden');
            renderMobileBasePanel(msg.mobileBasePanel || null);
        } else {
            section.classList.add('hidden');
            const root = document.getElementById('vehicles-mobile-base-panel');
            if (root) { root.innerHTML = ''; }
        }
    });
})();