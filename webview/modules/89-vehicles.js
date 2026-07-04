// webview/modules/89-vehicles.js
// Vehicle System V4: read-only garage/dock/stable panel (no disk writes).

(function () {
    let selectedVehicleId = null;
    let _lastWorldMsg = null;

    const L = () => (window.LR_vehicleLabels || {
        enumLabel: (_g, c) => (c || '—'),
        accessReasonLabel: (c) => (c || ''),
        fuelBandLabel: (b) => (b && b !== 'ok' ? b : ''),
        joinLabels: (codes, g) => (codes || []).join(', '),
        humanizeCode: (c) => String(c || '').replace(/_/g, ' '),
    });

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function pct(load, cap) {
        if (!cap || cap <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((load / cap) * 100)));
    }

    function fuelBandClass(band) {
        if (band === 'empty') return 'vehicle-fuel-empty';
        if (band === 'low') return 'vehicle-fuel-low';
        return 'vehicle-fuel-ok';
    }

    function renderBar(load, cap, label) {
        const p = pct(load, cap);
        return `
            <div class="vehicle-bar-row">
                <span class="vehicle-bar-label">${escapeHtml(label)}</span>
                <div class="vehicle-bar-track" role="presentation">
                    <div class="vehicle-bar-fill" style="width:${p}%"></div>
                </div>
                <span class="vehicle-bar-value">${escapeHtml(String(load))}/${escapeHtml(String(cap))}</span>
            </div>`;
    }

    function renderModuleChips(modules) {
        if (!modules || !modules.length) {
            return `<span class="vehicle-muted">${escapeHtml(T('webview.vehicles.noModules'))}</span>`;
        }
        return modules.map((mod) => {
            const cond = mod.condition
                ? ` (${L().enumLabel('moduleCondition', mod.condition)})`
                : '';
            return `<span class="vehicle-module-chip" title="${escapeHtml(mod.slot)}">${escapeHtml(mod.name)}${escapeHtml(cond)}</span>`;
        }).join('');
    }

    function renderListItem(item) {
        const active = item.isActive ? ' is-active' : '';
        const here = item.atCurrentLocation ? ' is-here' : '';
        const selected = item.id === selectedVehicleId ? ' is-selected' : '';
        const mobile = item.isMobileBase ? `<span class="vehicle-badge mobile-base">${escapeHtml(T('webview.vehicles.mobileBase'))}</span>` : '';
        const kind = L().enumLabel('kind', item.kind);
        const status = L().enumLabel('status', item.status);
        return `
            <button type="button" class="vehicle-list-item${active}${here}${selected}" data-vehicle-id="${escapeHtml(item.id)}">
                <span class="vehicle-list-name">${escapeHtml(item.name)}</span>
                ${mobile}
                <span class="vehicle-list-meta">${escapeHtml(kind)} · ${escapeHtml(status)} · ${escapeHtml(item.locationLabel)}</span>
            </button>`;
    }

    function hasMapMarkerForVehicle(vehicleId) {
        const markers = _lastWorldMsg?.mapOverlay?.markers;
        if (!vehicleId || !Array.isArray(markers)) { return false; }
        return markers.some((m) => {
            if (!m || !m.id) { return false; }
            return m.id === `vehicle_${vehicleId}`
                || m.id === `vehicle_park_${vehicleId}`
                || m.id === `vehicle_park_fallback_${vehicleId}`
                || m.id === `vehicle_settlement_park_${vehicleId}`;
        });
    }

    function renderDetail(item) {
        if (!item) {
            return `<p class="empty-text">${escapeHtml(T('webview.vehicles.selectHint'))}</p>`;
        }
        const warnings = [];
        if (item.accessReasonCode) {
            const reason = L().accessReasonLabel(item.accessReasonCode);
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.accessWarning'))}: ${escapeHtml(reason)}</div>`);
        }
        if (item.parkingFallbackId) {
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.parkingFallback'))}: ${escapeHtml(item.parkingFallbackId)}</div>`);
        }
        if (item.accessRestrictions && item.accessRestrictions.length) {
            const limits = L().joinLabels(item.accessRestrictions, 'blocker');
            warnings.push(`<div class="vehicle-warning">${escapeHtml(T('webview.vehicles.accessLimits'))}: ${escapeHtml(limits)}</div>`);
        }

        const fuelBandText = L().fuelBandLabel(item.fuelBand);
        const fuelLine = item.powerType
            ? `<div class="vehicle-stat-row ${fuelBandClass(item.fuelBand)}">
                <span>${escapeHtml(T('webview.vehicles.fuel'))}</span>
                <span>${escapeHtml(L().enumLabel('powerType', item.powerType))} ${escapeHtml(String(item.fuelCurrent ?? 0))}/${escapeHtml(String(item.fuelMax ?? 0))}${fuelBandText ? ` <span class="vehicle-fuel-band-label">${escapeHtml(fuelBandText)}</span>` : ''}</span>
               </div>`
            : '';

        const parking = item.parkingLabel
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.parking'))}</span><span>${escapeHtml(item.parkingLabel)}</span></div>`
            : '';

        const carried = item.carriedSummary
            ? `<div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.carrier'))}</span><span>${escapeHtml(item.carriedSummary)}</span></div>`
            : '';

        const showOnMap = hasMapMarkerForVehicle(item.id)
            ? `<button type="button" class="small-btn vehicle-show-on-map-btn" data-vehicle-id="${escapeHtml(item.id)}">${escapeHtml(T('webview.vehicles.showOnMap'))}</button>`
            : '';

        const sub = [
            L().enumLabel('kind', item.kind),
            L().enumLabel('sizeClass', item.sizeClass),
            L().enumLabel('status', item.status),
            item.locationLabel,
        ].filter(Boolean).join(' · ');

        const conditionLine = [
            L().enumLabel('condition', item.condition),
            `HP ${item.hp}/${item.maxHp}`,
            L().enumLabel('armorBand', item.armorBand),
        ].join(' · ');

        return `
            <div class="vehicle-detail-card">
                <div class="vehicle-detail-header">
                    <h4 class="vehicle-detail-title">${escapeHtml(item.name)}</h4>
                    ${item.isActive ? `<span class="vehicle-badge active">${escapeHtml(T('webview.vehicles.active'))}</span>` : ''}
                    ${item.isMobileBase ? `<span class="vehicle-badge mobile-base">${escapeHtml(T('webview.vehicles.mobileBase'))}</span>` : ''}
                </div>
                <div class="vehicle-detail-sub">${escapeHtml(sub)}</div>
                ${warnings.join('')}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.condition'))}</span><span>${escapeHtml(conditionLine)}</span></div>
                ${fuelLine}
                ${parking}
                ${carried}
                ${renderBar(item.cargoLoad, item.cargoCapacity, T('webview.vehicles.cargo'))}
                ${renderBar(item.crewRequired, item.crewCapacity, T('webview.vehicles.crew'))}
                <div class="vehicle-stat-row"><span>${escapeHtml(T('webview.vehicles.passengers'))}</span><span>${escapeHtml(String(item.passengerCapacity))}</span></div>
                <div class="vehicle-modules-wrap">
                    <span class="vehicle-bar-label">${escapeHtml(T('webview.vehicles.modules'))}</span>
                    <div class="vehicle-module-list">${renderModuleChips(item.modules)}</div>
                </div>
                ${showOnMap ? `<div class="vehicle-detail-actions">${showOnMap}</div>` : ''}
            </div>`;
    }

    function wireListClicks(garage) {
        const list = document.getElementById('vehicles-list');
        if (!list) return;
        list.querySelectorAll('[data-vehicle-id]').forEach((btn) => {
            btn.addEventListener('click', () => {
                selectedVehicleId = btn.getAttribute('data-vehicle-id');
                renderGarage(garage);
            });
        });
    }

    function wireDetailActions() {
        const detail = document.getElementById('vehicles-detail');
        if (!detail) return;
        detail.querySelectorAll('.vehicle-show-on-map-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-vehicle-id');
                if (id && typeof window.focusVehicleOnMap === 'function') {
                    window.focusVehicleOnMap(id);
                }
            });
        });
    }

    function renderGarage(garage) {
        const empty = document.getElementById('vehicles-empty');
        const content = document.getElementById('vehicles-content');
        const list = document.getElementById('vehicles-list');
        const detail = document.getElementById('vehicles-detail');
        const fleetMeta = document.getElementById('vehicles-fleet-meta');
        const warnings = document.getElementById('vehicles-warnings');
        if (!content || !list || !detail) return;

        if (!garage || !garage.vehicles || !garage.vehicles.length) {
            if (empty) empty.classList.remove('hidden');
            content.classList.add('hidden');
            return;
        }

        if (empty) empty.classList.add('hidden');
        content.classList.remove('hidden');

        if (!selectedVehicleId || !garage.vehicles.some((v) => v.id === selectedVehicleId)) {
            selectedVehicleId = garage.activeVehicleId || garage.vehicles[0].id;
        }

        if (fleetMeta) {
            const loc = garage.currentLocationLabel || garage.currentLocationId || '—';
            fleetMeta.textContent = T('webview.vehicles.fleetMeta', {
                count: String(garage.fleetCount),
                location: loc,
            });
        }

        if (warnings) {
            if (garage.warnings && garage.warnings.length) {
                warnings.classList.remove('hidden');
                warnings.setAttribute('aria-live', 'polite');
                warnings.textContent = `${T('webview.vehicles.fleetWarning')}: ${garage.warnings.join(' · ')}`;
            } else {
                warnings.classList.add('hidden');
                warnings.textContent = '';
            }
        }

        list.innerHTML = garage.vehicles.map(renderListItem).join('');
        const activeItem = garage.vehicles.find((v) => v.id === selectedVehicleId);
        detail.innerHTML = renderDetail(activeItem);
        wireListClicks(garage);
        wireDetailActions();

        const selectedBtn = list.querySelector(`[data-vehicle-id="${CSS.escape(selectedVehicleId)}"]`);
        if (selectedBtn) {
            selectedBtn.focus({ preventScroll: true });
        }
    }

    function setTabVisible(visible) {
        const tabBtn = document.getElementById('tab-btn-vehicles');
        if (!tabBtn) return;
        tabBtn.classList.toggle('hidden', !visible);
    }

    function renderFromWorldView(msg) {
        _lastWorldMsg = msg;
        const enabled = msg.enableVehicleSystem === true;
        setTabVisible(enabled);
        if (!enabled) {
            const pane = document.getElementById('pane-vehicles');
            if (pane && pane.classList.contains('active')) {
                const statusTab = document.querySelector('.tab-btn[data-target="pane-status"]');
                if (statusTab) statusTab.click();
            }
            return;
        }
        renderGarage(msg.vehicleGarage || null);
    }

    window.selectGarageVehicle = function selectGarageVehicle(vehicleId) {
        if (!vehicleId) { return; }
        selectedVehicleId = vehicleId;
        renderGarage(_lastWorldMsg?.vehicleGarage || null);
    };

    window.openVehicleFromMapMarker = function openVehicleFromMapMarker(vehicleId) {
        if (!vehicleId) { return; }
        if (typeof activateStatusPane === 'function') {
            activateStatusPane('pane-vehicles');
        } else {
            document.getElementById('tab-btn-vehicles')?.click();
        }
        window.selectGarageVehicle(vehicleId);
    };

    window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg && msg.type === 'worldView') {
            renderFromWorldView(msg);
        }
    });
})();