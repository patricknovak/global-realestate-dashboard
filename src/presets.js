// ===== SAVED FILTER PRESETS =====
function saveFilterPreset() {
    var name = prompt('Name this filter preset:');
    if (!name) return;
    var preset = {
        search: document.getElementById('searchBox').value,
        priceMin: document.getElementById('priceMin').value,
        priceMax: document.getElementById('priceMax').value,
        bedroomMin: document.getElementById('bedroomMin').value,
        bathroomMin: document.getElementById('bathroomMin').value,
        domMin: document.getElementById('domMin').value,
        domMax: document.getElementById('domMax').value,
        yearMin: document.getElementById('yearMin').value,
        yearMax: document.getElementById('yearMax').value,
        scoreMin: document.getElementById('scoreMin').value,
        scoreMax: document.getElementById('scoreMax').value,
        sortBy: document.getElementById('sortBy').value,
        waterView: document.getElementById('filterWaterView').checked,
        hasLot: document.getElementById('filterHasLot').checked,
        regions: [...document.querySelectorAll('.region-filter:checked')].map(function(e){return e.value;}),
        neighborhoods: [...document.querySelectorAll('.nbr-filter:checked')].map(function(e){return e.value;}),
        types: [...document.querySelectorAll('.type-filter:checked')].map(function(e){return e.value;})
    };
    var presets = JSON.parse(localStorage.getItem('filterPresets') || '{}');
    presets[name] = preset;
    localStorage.setItem('filterPresets', JSON.stringify(presets));
    loadFilterPresetList();
}
function loadFilterPresetList() {
    var presets = JSON.parse(localStorage.getItem('filterPresets') || '{}');
    var sel = document.getElementById('filterPresets');
    sel.innerHTML = '<option value="">Load preset...</option>';
    Object.keys(presets).forEach(function(name) {
        sel.innerHTML += '<option value="' + name + '">' + name + '</option>';
    });
}
function loadFilterPreset(name) {
    if (!name) return;
    var presets = JSON.parse(localStorage.getItem('filterPresets') || '{}');
    var p = presets[name];
    if (!p) return;
    document.getElementById('searchBox').value = p.search || '';
    document.getElementById('priceMin').value = p.priceMin || '';
    document.getElementById('priceMax').value = p.priceMax || '';
    document.getElementById('bedroomMin').value = p.bedroomMin || '';
    document.getElementById('bathroomMin').value = p.bathroomMin || '';
    document.getElementById('domMin').value = p.domMin || '';
    document.getElementById('domMax').value = p.domMax || '';
    document.getElementById('yearMin').value = p.yearMin || '';
    document.getElementById('yearMax').value = p.yearMax || '';
    document.getElementById('scoreMin').value = p.scoreMin || '';
    document.getElementById('scoreMax').value = p.scoreMax || '';
    document.getElementById('sortBy').value = p.sortBy || 'score-desc';
    document.getElementById('filterWaterView').checked = !!p.waterView;
    document.getElementById('filterHasLot').checked = !!p.hasLot;
    if (p.regions) { document.querySelectorAll('.region-filter').forEach(function(e){ e.checked = p.regions.includes(e.value); }); }
    if (p.neighborhoods) { document.querySelectorAll('.nbr-filter').forEach(function(e){ e.checked = p.neighborhoods.includes(e.value); }); }
    if (p.types) { document.querySelectorAll('.type-filter').forEach(function(e){ e.checked = p.types.includes(e.value); }); }
    applyFilters();
}

// ===== SAVED SEARCH ALERTS =====
function getSearchAlerts() {
    return JSON.parse(localStorage.getItem('searchAlerts') || '[]');
}
function saveSearchAlerts(alerts) {
    localStorage.setItem('searchAlerts', JSON.stringify(alerts));
}
function saveSearchAlert() {
    var name = prompt('Name this search alert:');
    if (!name) return;
    var preset = {
        search: document.getElementById('searchBox').value,
        priceMin: document.getElementById('priceMin').value,
        priceMax: document.getElementById('priceMax').value,
        bedroomMin: document.getElementById('bedroomMin').value,
        bathroomMin: document.getElementById('bathroomMin').value,
        domMin: document.getElementById('domMin').value,
        domMax: document.getElementById('domMax').value,
        yearMin: document.getElementById('yearMin').value,
        yearMax: document.getElementById('yearMax').value,
        scoreMin: document.getElementById('scoreMin').value,
        scoreMax: document.getElementById('scoreMax').value,
        waterView: document.getElementById('filterWaterView').checked,
        hasLot: document.getElementById('filterHasLot').checked,
        regions: [...document.querySelectorAll('.region-filter:checked')].map(function(e){return e.value;}),
        neighborhoods: [...document.querySelectorAll('.nbr-filter:checked')].map(function(e){return e.value;}),
        types: [...document.querySelectorAll('.type-filter:checked')].map(function(e){return e.value;})
    };
    // Record current matching listing indices
    var matchIndices = [];
    rawListings.forEach(function(l, idx) {
        if (matchesPreset(l, idx, preset)) matchIndices.push(idx);
    });
    var alerts = getSearchAlerts();
    alerts.push({ name: name, preset: preset, matchedIndices: matchIndices, created: new Date().toISOString(), lastChecked: new Date().toISOString() });
    saveSearchAlerts(alerts);
    renderSearchAlerts();
}
function matchesPreset(listing, idx, p) {
    var pMin = parseFloat(p.priceMin) || 0;
    var pMax = parseFloat(p.priceMax) || Infinity;
    var bedMin = parseInt(p.bedroomMin) || 0;
    var bathMin = parseInt(p.bathroomMin) || 0;
    var dMin = parseFloat(p.domMin) || 0;
    var dMax = parseFloat(p.domMax) || Infinity;
    var yMin = parseFloat(p.yearMin) || 0;
    var yMax = parseFloat(p.yearMax) || Infinity;
    var sMin = parseFloat(p.scoreMin) || 0;
    var sMax = parseFloat(p.scoreMax) || 100;
    var search = (p.search || '').toLowerCase().trim();
    var score = calculateScore(listing);
    if (search && !(listing.addr.toLowerCase().includes(search) || listing.neighborhood.toLowerCase().includes(search) || listing.type.toLowerCase().includes(search) || listing.region.toLowerCase().includes(search))) return false;
    if (p.regions && p.regions.length > 0 && !p.regions.includes(listing.region)) return false;
    if (p.neighborhoods && p.neighborhoods.length > 0 && !p.neighborhoods.includes(listing.neighborhood)) return false;
    if (p.types && p.types.length > 0 && !p.types.includes(listing.type)) return false;
    if (listing.price < pMin || listing.price > pMax) return false;
    if (listing.beds < bedMin) return false;
    if (listing.baths < bathMin) return false;
    if (listing.dom < dMin || listing.dom > dMax) return false;
    if (listing.yearBuilt < yMin || listing.yearBuilt > yMax) return false;
    if (score < sMin || score > sMax) return false;
    if (p.waterView && !listing.waterView) return false;
    if (p.hasLot && !listing.lot) return false;
    return true;
}
function checkSearchAlerts() {
    var alerts = getSearchAlerts();
    var hasNew = false;
    alerts.forEach(function(alert) {
        var currentMatches = [];
        rawListings.forEach(function(l, idx) {
            if (matchesPreset(l, idx, alert.preset)) currentMatches.push(idx);
        });
        var newMatches = currentMatches.filter(function(idx) { return alert.matchedIndices.indexOf(idx) < 0; });
        alert._newCount = newMatches.length;
        alert._totalCount = currentMatches.length;
        alert._newIndices = newMatches;
        if (newMatches.length > 0) hasNew = true;
    });
    return { alerts: alerts, hasNew: hasNew };
}
function renderSearchAlerts() {
    var result = checkSearchAlerts();
    var alerts = result.alerts;
    var el = document.getElementById('savedAlertsList');
    if (!el || alerts.length === 0) { if (el) el.innerHTML = ''; return; }
    var html = '<div style="font-weight:600;color:var(--primary);margin-bottom:4px;">Saved Alerts</div>';
    alerts.forEach(function(alert, i) {
        var badge = alert._newCount > 0 ? '<span style="background:var(--danger);color:white;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px;">' + alert._newCount + ' new</span>' : '';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;">';
        html += '<a href="#" onclick="loadSearchAlert(' + i + ');return false;" style="color:var(--secondary);text-decoration:none;">' + alert.name + ' (' + alert._totalCount + ')' + badge + '</a>';
        html += '<span onclick="deleteSearchAlert(' + i + ')" style="cursor:pointer;color:#999;font-size:14px;" title="Delete alert">&times;</span>';
        html += '</div>';
    });
    el.innerHTML = html;
}
function loadSearchAlert(index) {
    var alerts = getSearchAlerts();
    var alert = alerts[index];
    if (!alert) return;
    var p = alert.preset;
    document.getElementById('searchBox').value = p.search || '';
    document.getElementById('priceMin').value = p.priceMin || '';
    document.getElementById('priceMax').value = p.priceMax || '';
    document.getElementById('bedroomMin').value = p.bedroomMin || '';
    document.getElementById('bathroomMin').value = p.bathroomMin || '';
    document.getElementById('domMin').value = p.domMin || '';
    document.getElementById('domMax').value = p.domMax || '';
    document.getElementById('yearMin').value = p.yearMin || '';
    document.getElementById('yearMax').value = p.yearMax || '';
    document.getElementById('scoreMin').value = p.scoreMin || '';
    document.getElementById('scoreMax').value = p.scoreMax || '';
    document.getElementById('filterWaterView').checked = !!p.waterView;
    document.getElementById('filterHasLot').checked = !!p.hasLot;
    if (p.regions) { document.querySelectorAll('.region-filter').forEach(function(e){ e.checked = p.regions.includes(e.value); }); }
    if (p.neighborhoods) { document.querySelectorAll('.nbr-filter').forEach(function(e){ e.checked = p.neighborhoods.includes(e.value); }); }
    if (p.types) { document.querySelectorAll('.type-filter').forEach(function(e){ e.checked = p.types.includes(e.value); }); }
    // Update matched indices to mark as checked
    var currentMatches = [];
    rawListings.forEach(function(l, idx) {
        if (matchesPreset(l, idx, p)) currentMatches.push(idx);
    });
    alert.matchedIndices = currentMatches;
    alert.lastChecked = new Date().toISOString();
    alerts[index] = alert;
    saveSearchAlerts(alerts);
    applyFilters();
    renderSearchAlerts();
}
function deleteSearchAlert(index) {
    var alerts = getSearchAlerts();
    alerts.splice(index, 1);
    saveSearchAlerts(alerts);
    renderSearchAlerts();
}

