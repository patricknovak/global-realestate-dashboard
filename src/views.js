// ===== DARK MODE =====
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    var isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'on' : 'off');
    var btn = document.getElementById('darkModeToggle');
    if (btn) btn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
}
// Apply saved dark mode on load
(function() {
    if (localStorage.getItem('darkMode') === 'on') {
        document.body.classList.add('dark-mode');
        var btn = document.getElementById('darkModeToggle');
        if (btn) btn.textContent = 'Light Mode';
    }
})();

// ===== DATA EXPORT / IMPORT =====
function exportAllData() {
    var data = {
        version: 1,
        exportDate: new Date().toISOString(),
        buyerProfile: JSON.parse(localStorage.getItem('buyerProfile') || '{}'),
        shortlist: JSON.parse(localStorage.getItem('shortlist') || '[]'),
        shortlistNotes: JSON.parse(localStorage.getItem('shortlistNotes') || '{}'),
        listingNotes: JSON.parse(localStorage.getItem('listingNotes') || '{}'),
        listingTags: JSON.parse(localStorage.getItem('listingTags') || '{}'),
        offerHistory: JSON.parse(localStorage.getItem('offerHistory') || '[]'),
        filterPresets: JSON.parse(localStorage.getItem('filterPresets') || '[]'),
        contactLog: JSON.parse(localStorage.getItem('contactLog') || '[]'),
        dueDiligence: JSON.parse(localStorage.getItem('dueDiligence') || '{}'),
        darkMode: localStorage.getItem('darkMode') || 'off',
        buyerName: localStorage.getItem('buyerName') || '',
        buyerEmail: localStorage.getItem('buyerEmail') || '',
        buyerPhone: localStorage.getItem('buyerPhone') || '',
        buyerCompany: localStorage.getItem('buyerCompany') || ''
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'realestate-dashboard-backup-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(url);
    var status = document.getElementById('importExportStatus');
    if (status) { status.textContent = 'Data exported successfully!'; status.style.color = 'var(--success)'; }
}

function importAllData(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        try {
            var data = JSON.parse(e.target.result);
            if (!data.version) throw new Error('Invalid backup file');
            if (data.buyerProfile) localStorage.setItem('buyerProfile', JSON.stringify(data.buyerProfile));
            if (data.shortlist) localStorage.setItem('shortlist', JSON.stringify(data.shortlist));
            if (data.shortlistNotes) localStorage.setItem('shortlistNotes', JSON.stringify(data.shortlistNotes));
            if (data.listingNotes) { localStorage.setItem('listingNotes', JSON.stringify(data.listingNotes)); listingNotes = data.listingNotes; }
            if (data.listingTags) { localStorage.setItem('listingTags', JSON.stringify(data.listingTags)); listingTags = data.listingTags; }
            if (data.offerHistory) localStorage.setItem('offerHistory', JSON.stringify(data.offerHistory));
            if (data.filterPresets) localStorage.setItem('filterPresets', JSON.stringify(data.filterPresets));
            if (data.contactLog) localStorage.setItem('contactLog', JSON.stringify(data.contactLog));
            if (data.dueDiligence) localStorage.setItem('dueDiligence', JSON.stringify(data.dueDiligence));
            if (data.darkMode) localStorage.setItem('darkMode', data.darkMode);
            if (data.buyerName) localStorage.setItem('buyerName', data.buyerName);
            if (data.buyerEmail) localStorage.setItem('buyerEmail', data.buyerEmail);
            if (data.buyerPhone) localStorage.setItem('buyerPhone', data.buyerPhone);
            if (data.buyerCompany) localStorage.setItem('buyerCompany', data.buyerCompany);
            // Reload shortlist into memory
            var saved = localStorage.getItem('shortlist');
            if (saved) shortlistedIds = new Set(JSON.parse(saved));
            var status = document.getElementById('importExportStatus');
            if (status) { status.textContent = 'Data imported successfully! Refreshing...'; status.style.color = 'var(--success)'; }
            setTimeout(function() { location.reload(); }, 1000);
        } catch(err) {
            var status = document.getElementById('importExportStatus');
            if (status) { status.textContent = 'Import failed: ' + err.message; status.style.color = 'var(--danger)'; }
        }
    };
    reader.readAsText(file);
}

function clearAllData() {
    var keys = ['buyerProfile','shortlist','shortlistNotes','offerHistory','filterPresets','contactLog','dueDiligence','darkMode','buyerName','buyerEmail','buyerPhone','buyerCompany','googleMapsApiKey','githubFeedbackRepo','githubFeedbackToken','offerSignatureImg'];
    keys.forEach(function(k) { localStorage.removeItem(k); });
    location.reload();
}

// ===== AGENT CONTACT LOG =====
function getContactLog() {
    return JSON.parse(localStorage.getItem('contactLog') || '[]');
}

function saveContactLog(log) {
    localStorage.setItem('contactLog', JSON.stringify(log));
}

function addContactLogEntry(prefill) {
    var log = getContactLog();
    var entry = {
        id: Date.now(),
        date: new Date().toISOString().split('T')[0],
        agentName: (prefill && prefill.agentName) || '',
        property: (prefill && prefill.property) || '',
        type: 'email',
        notes: '',
        followUp: ''
    };
    log.unshift(entry);
    saveContactLog(log);
    initializeContactLog();
}

function updateContactLogEntry(id, field, value) {
    var log = getContactLog();
    for (var i = 0; i < log.length; i++) {
        if (log[i].id === id) {
            log[i][field] = value;
            break;
        }
    }
    saveContactLog(log);
}

function deleteContactLogEntry(id) {
    var log = getContactLog().filter(function(e) { return e.id !== id; });
    saveContactLog(log);
    initializeContactLog();
}

function initializeContactLog() {
    var log = getContactLog();
    var container = document.getElementById('contactLogList');
    var empty = document.getElementById('emptyContactLog');

    if (log.length === 0) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    var html = '';
    log.forEach(function(entry) {
        var typeColors = { email: '#2E75B6', phone: '#28a745', viewing: '#fd7e14', other: '#6c757d' };
        html += '<div style="background:var(--light-gray);border:1px solid var(--border-gray);border-radius:8px;padding:16px;margin-bottom:12px;border-left:4px solid ' + (typeColors[entry.type] || '#6c757d') + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">';
        html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">';
        html += '<input type="date" value="' + (entry.date || '') + '" onchange="updateContactLogEntry(' + entry.id + ',\'date\',this.value)" style="padding:4px 8px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;">';
        html += '<select onchange="updateContactLogEntry(' + entry.id + ',\'type\',this.value)" style="padding:4px 8px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;">';
        ['email','phone','viewing','other'].forEach(function(t) {
            html += '<option value="' + t + '"' + (entry.type === t ? ' selected' : '') + '>' + t.charAt(0).toUpperCase() + t.slice(1) + '</option>';
        });
        html += '</select>';
        html += '</div>';
        html += '<button onclick="if(confirm(\'Delete this contact log entry?\'))deleteContactLogEntry(' + entry.id + ')" style="padding:6px 12px;border:1px solid var(--danger);border-radius:4px;background:#fff5f5;cursor:pointer;font-size:11px;color:var(--danger);font-weight:600;transition:all 0.2s;" onmouseover="this.style.background=\'var(--danger)\';this.style.color=\'white\'" onmouseout="this.style.background=\'#fff5f5\';this.style.color=\'var(--danger)\'">Delete</button>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">';
        html += '<input type="text" placeholder="Agent Name" value="' + (entry.agentName || '').replace(/"/g, '&quot;') + '" onchange="updateContactLogEntry(' + entry.id + ',\'agentName\',this.value)" style="padding:6px 10px;border:1px solid var(--border-gray);border-radius:4px;font-size:13px;">';
        html += '<input type="text" placeholder="Property Address" value="' + (entry.property || '').replace(/"/g, '&quot;') + '" onchange="updateContactLogEntry(' + entry.id + ',\'property\',this.value)" style="padding:6px 10px;border:1px solid var(--border-gray);border-radius:4px;font-size:13px;">';
        html += '</div>';
        html += '<textarea placeholder="Notes (what was discussed, next steps...)" onchange="updateContactLogEntry(' + entry.id + ',\'notes\',this.value)" style="width:100%;padding:8px 10px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;min-height:60px;resize:vertical;margin-bottom:6px;">' + (entry.notes || '') + '</textarea>';
        html += '<input type="text" placeholder="Follow-up action / date" value="' + (entry.followUp || '').replace(/"/g, '&quot;') + '" onchange="updateContactLogEntry(' + entry.id + ',\'followUp\',this.value)" style="padding:6px 10px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;width:100%;">';
        html += '</div>';
    });
    container.innerHTML = html;
}

// ===== DUE DILIGENCE TRACKER =====
function getDueDiligence() {
    return JSON.parse(localStorage.getItem('dueDiligence') || '{}');
}

function saveDueDiligence(data) {
    localStorage.setItem('dueDiligence', JSON.stringify(data));
}

function toggleDDItem(propIdx, itemKey) {
    var dd = getDueDiligence();
    var key = 'prop_' + propIdx;
    if (!dd[key]) dd[key] = {};
    dd[key][itemKey] = !dd[key][itemKey];
    saveDueDiligence(dd);
    renderDueDiligence();
}

function updateDDNote(propIdx, value) {
    var dd = getDueDiligence();
    var key = 'prop_' + propIdx;
    if (!dd[key]) dd[key] = {};
    dd[key].notes = value;
    saveDueDiligence(dd);
}

function renderDueDiligence() {
    var section = document.getElementById('dueDiligenceSection');
    if (!section) return;
    var shortlisted = [];
    rawListings.forEach(function(l, idx) {
        if (shortlistedIds.has(idx)) shortlisted.push({ listing: l, idx: idx });
    });
    if (shortlisted.length === 0) {
        section.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    var dd = getDueDiligence();
    var ddItems = [
        { key: 'titleSearch', label: 'Title search completed' },
        { key: 'inspection', label: 'Home inspection booked/completed' },
        { key: 'financing', label: 'Financing confirmed / pre-approval' },
        { key: 'appraisal', label: 'Appraisal ordered' },
        { key: 'insurance', label: 'Insurance quote obtained' },
        { key: 'lawyerRetained', label: 'Lawyer / notary retained' },
        { key: 'pttCalculated', label: 'Property Transfer Tax calculated' },
        { key: 'zoningCheck', label: 'Zoning and permitted use verified' },
        { key: 'strataReview', label: 'Strata documents reviewed (if applicable)' },
        { key: 'envAssessment', label: 'Environmental assessment (if applicable)' }
    ];

    var html = '';
    shortlisted.forEach(function(item) {
        var propData = dd['prop_' + item.idx] || {};
        var completed = 0;
        ddItems.forEach(function(d) { if (propData[d.key]) completed++; });
        var pct = Math.round(completed / ddItems.length * 100);
        var barColor = pct >= 80 ? 'var(--success)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)';

        html += '<div style="background:white;border:1px solid var(--border-gray);border-radius:8px;margin-bottom:12px;overflow:hidden;">';
        html += '<div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display===\'none\'?\'block\':\'none\'" style="padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><strong style="color:var(--primary);">' + item.listing.addr + '</strong><span style="color:#888;font-size:12px;margin-left:8px;">' + item.listing.neighborhood + '</span></div>';
        html += '<div style="display:flex;align-items:center;gap:10px;">';
        html += '<div style="width:100px;height:6px;background:#eee;border-radius:3px;"><div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:3px;"></div></div>';
        html += '<span style="font-size:11px;font-weight:600;color:' + barColor + ';">' + pct + '%</span>';
        html += '</div></div>';
        html += '<div style="display:none;padding:0 16px 16px;">';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px;">';
        ddItems.forEach(function(d) {
            var checked = propData[d.key] ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 8px;background:' + (propData[d.key] ? '#d4edda' : 'var(--light-gray)') + ';border-radius:4px;cursor:pointer;">';
            html += '<input type="checkbox" ' + checked + ' onchange="toggleDDItem(' + item.idx + ',\'' + d.key + '\')" style="width:16px;height:16px;">';
            html += d.label + '</label>';
        });
        html += '</div>';
        html += '<textarea placeholder="Additional notes for this property..." onchange="updateDDNote(' + item.idx + ',this.value)" style="width:100%;padding:8px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;min-height:50px;resize:vertical;">' + (propData.notes || '') + '</textarea>';
        html += '</div></div>';
    });
    document.getElementById('ddTrackerList').innerHTML = html;
}

// Hook due diligence into shortlist tab
var _origInitShortlist = typeof initializeShortlistTab === 'function' ? initializeShortlistTab : null;
if (_origInitShortlist) {
    var _origFn = initializeShortlistTab;
    initializeShortlistTab = function() {
        _origFn.apply(this, arguments);
        renderDueDiligence();
    };
}

// Hook contact log into contactListingAgent
var _origContactAgent = typeof contactListingAgent === 'function' ? contactListingAgent : null;
if (_origContactAgent) {
    var _origContactFn = contactListingAgent;
    contactListingAgent = function(listingIndex) {
        _origContactFn(listingIndex);
        // Auto-log the contact
        var listing = rawListings[listingIndex];
        addContactLogEntry({
            agentName: listing.agent.split(',')[0],
            property: listing.addr
        });
    };
}

// ===================================================================
// API DATA LAYER - Load from backend with static JSON fallback
// ===================================================================
var API_BASE = '/api/v1';
var apiConnected = false;

async function checkApiConnection() {
    var dot = document.getElementById('apiStatusDot');
    var text = document.getElementById('apiStatusText');
    if (dot) dot.className = 'api-status-dot loading';
    if (text) text.textContent = 'Checking API connection...';
    try {
        var resp = await fetch(API_BASE + '/data/benchmarks', { signal: AbortSignal.timeout(3000) });
        if (resp.ok) {
            apiConnected = true;
            if (dot) dot.className = 'api-status-dot connected';
            if (text) text.textContent = 'API connected - live data mode';
            return true;
        }
    } catch(e) { /* fallback */ }
    apiConnected = false;
    if (dot) dot.className = 'api-status-dot disconnected';
    if (text) text.textContent = 'API offline - using embedded data (static mode)';
    return false;
}

async function apiGet(path) {
    if (!apiConnected) return null;
    try {
        var resp = await fetch(API_BASE + path);
        if (resp.ok) return await resp.json();
    } catch(e) { /* fallback */ }
    return null;
}

async function apiPost(path, data) {
    if (!apiConnected) return null;
    try {
        var resp = await fetch(API_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (resp.ok) return await resp.json();
    } catch(e) { /* fallback */ }
    return null;
}

async function apiPut(path, data) {
    if (!apiConnected) return null;
    try {
        var resp = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (resp.ok) return await resp.json();
    } catch(e) { /* fallback */ }
    return null;
}

async function apiDelete(path) {
    if (!apiConnected) return null;
    try {
        var resp = await fetch(API_BASE + path, { method: 'DELETE' });
        if (resp.ok) return await resp.json();
    } catch(e) { /* fallback */ }
    return null;
}

// Try loading listings from API, fall back to embedded rawListings
async function loadListingsFromAPI() {
    var data = await apiGet('/listings?limit=2000');
    if (data && data.listings && data.listings.length > 0) {
        // Map API format back to our format
        rawListings.length = 0;
        data.listings.forEach(function(l) {
            rawListings.push({
                addr: l.addr, price: l.price, beds: l.beds, baths: l.baths,
                sqft: l.sqft, type: l.type, lot: l.lot, agent: l.agent,
                neighborhood: l.neighborhood, dom: l.dom, yearBuilt: l.year_built || l.yearBuilt,
                waterView: l.water_view || l.waterView, latitude: l.latitude,
                longitude: l.longitude, region: l.region,
                _id: l.id, _status: l.status, _source: l.source,
                _scrapedAt: l.scraped_at, _verifiedAt: l.verified_at,
                _updatedAt: l.updated_at
            });
        });
        applyFilters();
        return true;
    }
    return false;
}

// Initialize API on load
(async function() {
    var connected = await checkApiConnection();
    if (connected) {
        await loadListingsFromAPI();
    }
})();

// ===================================================================
// VIEWING SCHEDULER
// ===================================================================
var currentCalendarDate = new Date();
var viewingsViewMode = 'calendar';

function getViewings() {
    var saved = localStorage.getItem('viewings');
    return saved ? JSON.parse(saved) : [];
}
function saveViewings(viewings) {
    localStorage.setItem('viewings', JSON.stringify(viewings));
}

function setViewingsView(mode) {
    viewingsViewMode = mode;
    document.getElementById('viewCalBtn').style.fontWeight = mode === 'calendar' ? '700' : '400';
    document.getElementById('viewListBtn').style.fontWeight = mode === 'list' ? '700' : '400';
    initializeViewings();
}

function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    initializeViewings();
}

function initializeViewings() {
    var viewings = getViewings();
    var label = document.getElementById('calendarMonthLabel');
    var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    label.textContent = months[currentCalendarDate.getMonth()] + ' ' + currentCalendarDate.getFullYear();

    var emptyEl = document.getElementById('emptyViewings');
    var calEl = document.getElementById('viewingsCalendar');
    var listEl = document.getElementById('viewingsList');

    if (viewingsViewMode === 'calendar') {
        calEl.style.display = '';
        listEl.style.display = 'none';
        renderCalendar(viewings);
    } else {
        calEl.style.display = 'none';
        listEl.style.display = '';
        renderViewingsList(viewings);
    }
    emptyEl.style.display = viewings.length === 0 ? '' : 'none';
}

function renderCalendar(viewings) {
    var cal = document.getElementById('viewingsCalendar');
    var year = currentCalendarDate.getFullYear();
    var month = currentCalendarDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var today = new Date();

    var html = '<div class="calendar-grid">';
    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(function(d) {
        html += '<div class="calendar-header">' + d + '</div>';
    });

    // Previous month padding
    var prevDays = new Date(year, month, 0).getDate();
    for (var i = firstDay - 1; i >= 0; i--) {
        html += '<div class="calendar-day other-month"><div class="calendar-day-num">' + (prevDays - i) + '</div></div>';
    }

    for (var d = 1; d <= daysInMonth; d++) {
        var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        var isToday = (today.getFullYear() === year && today.getMonth() === month && today.getDate() === d);
        var dayViewings = viewings.filter(function(v) { return v.scheduled_date === dateStr; });

        html += '<div class="calendar-day' + (isToday ? ' today' : '') + '" onclick="showScheduleViewingForm(\'' + dateStr + '\')">';
        html += '<div class="calendar-day-num">' + d + '</div>';
        dayViewings.forEach(function(v) {
            var listing = rawListings[v.listing_id] || {};
            var statusClass = v.status === 'completed' ? ' completed' : (v.status === 'cancelled' ? ' cancelled' : '');
            html += '<div class="calendar-event' + statusClass + '" onclick="event.stopPropagation();showViewingDetail(' + v.id + ')" title="' + (listing.addr || 'Property') + '">';
            html += v.scheduled_time + ' ' + (listing.addr || '').substring(0, 15);
            html += '</div>';
        });
        html += '</div>';
    }

    // Next month padding
    var totalCells = firstDay + daysInMonth;
    var remaining = (7 - (totalCells % 7)) % 7;
    for (var i = 1; i <= remaining; i++) {
        html += '<div class="calendar-day other-month"><div class="calendar-day-num">' + i + '</div></div>';
    }

    html += '</div>';
    cal.innerHTML = html;
}

function renderViewingsList(viewings) {
    var listEl = document.getElementById('viewingsList');
    if (viewings.length === 0) { listEl.innerHTML = ''; return; }

    var sorted = viewings.slice().sort(function(a, b) { return (a.scheduled_date + a.scheduled_time).localeCompare(b.scheduled_date + b.scheduled_time); });
    var html = '';
    sorted.forEach(function(v) {
        var listing = rawListings[v.listing_id] || {};
        var statusClass = v.status === 'completed' ? 'viewing-completed' : (v.status === 'cancelled' ? 'viewing-cancelled' : 'viewing-scheduled');
        html += '<div class="viewing-card">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
        html += '<div><strong style="font-size:14px;">' + (listing.addr || 'Unknown Property') + '</strong>';
        html += '<span style="margin-left:8px;font-size:11px;color:#888;">' + (listing.neighborhood || '') + '</span></div>';
        html += '<span class="viewing-status ' + statusClass + '">' + v.status + '</span>';
        html += '</div>';
        html += '<div style="font-size:12px;color:#666;margin-bottom:8px;">';
        html += '<strong>' + v.scheduled_date + '</strong> at <strong>' + v.scheduled_time + '</strong>';
        html += ' (' + (v.duration_minutes || 30) + ' min)';
        if (v.agent_name) html += ' &bull; Agent: ' + v.agent_name;
        html += '</div>';
        if (v.notes) html += '<div style="font-size:12px;color:#555;background:var(--light-gray);padding:8px;border-radius:4px;margin-bottom:8px;">' + v.notes + '</div>';
        if (v.rating) {
            html += '<div style="font-size:12px;">Rating: ';
            for (var s = 1; s <= 5; s++) html += '<span style="color:' + (s <= v.rating ? '#ffc107' : '#ddd') + ';">&#9733;</span>';
            html += '</div>';
        }
        if (v.feedback) html += '<div style="font-size:12px;color:#555;margin-top:4px;"><em>Feedback: ' + v.feedback + '</em></div>';
        html += '<div style="display:flex;gap:6px;margin-top:10px;">';
        if (v.status === 'scheduled') {
            html += '<button class="btn-secondary" onclick="completeViewing(' + v.id + ')" style="font-size:11px;padding:4px 10px;">Mark Complete</button>';
            html += '<button class="btn-secondary" onclick="cancelViewing(' + v.id + ')" style="font-size:11px;padding:4px 10px;color:var(--danger);">Cancel</button>';
        }
        if (v.status === 'completed' && !v.rating) {
            html += '<button class="btn-secondary" onclick="rateViewing(' + v.id + ')" style="font-size:11px;padding:4px 10px;">Add Rating</button>';
        }
        html += '<button class="btn-secondary" onclick="deleteViewing(' + v.id + ')" style="font-size:11px;padding:4px 10px;">Delete</button>';
        html += '</div></div>';
    });
    listEl.innerHTML = html;
}

function showScheduleViewingForm(prefillDate) {
    var container = document.getElementById('viewingFormContainer');
    var today = new Date().toISOString().split('T')[0];
    var dateVal = prefillDate || today;

    var propertyOptions = '<option value="">Select a property...</option>';
    rawListings.forEach(function(l, idx) {
        propertyOptions += '<option value="' + idx + '">' + escapeHtml(l.addr) + ' - ' + escapeHtml(l.neighborhood) + ' (' + formatPrice(l.price) + ')</option>';
    });

    container.style.display = '';
    container.innerHTML = '<div style="background:var(--light-gray);padding:20px;border-radius:8px;margin-bottom:16px;">' +
        '<div style="font-weight:700;color:var(--primary);margin-bottom:12px;">Schedule a Viewing</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">' +
        '<div><label style="font-size:12px;font-weight:600;">Property</label><select id="viewingProperty" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;">' + propertyOptions + '</select></div>' +
        '<div><label style="font-size:12px;font-weight:600;">Date</label><input type="date" id="viewingDate" value="' + dateVal + '" min="' + today + '" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;">Time</label><input type="time" id="viewingTime" value="10:00" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;">Duration (min)</label><input type="number" id="viewingDuration" value="30" min="15" max="120" step="15" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;">Agent Name</label><input type="text" id="viewingAgent" placeholder="Listing agent name" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></div>' +
        '<div><label style="font-size:12px;font-weight:600;">Agent Phone/Email</label><input type="text" id="viewingAgentContact" placeholder="Phone or email" style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></div>' +
        '<div style="grid-column:1/3;"><label style="font-size:12px;font-weight:600;">Notes</label><textarea id="viewingNotes" rows="2" placeholder="Things to check, questions to ask..." style="width:100%;padding:6px;border:1px solid var(--border-gray);border-radius:4px;margin-top:4px;"></textarea></div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:12px;">' +
        '<button class="btn-primary" onclick="saveNewViewing()">Save Viewing</button>' +
        '<button class="btn-secondary" onclick="document.getElementById(\'viewingFormContainer\').style.display=\'none\'">Cancel</button>' +
        '</div></div>';

    // Auto-fill agent if property selected
    document.getElementById('viewingProperty').addEventListener('change', function() {
        var idx = parseInt(this.value);
        if (!isNaN(idx) && rawListings[idx]) {
            document.getElementById('viewingAgent').value = rawListings[idx].agent.split(',')[0];
        }
    });
}

function saveNewViewing() {
    var propIdx = parseInt(document.getElementById('viewingProperty').value);
    var date = document.getElementById('viewingDate').value;
    var time = document.getElementById('viewingTime').value;
    if (isNaN(propIdx) || !date || !time) { alert('Please select a property, date, and time.'); return; }

    var viewings = getViewings();
    var newId = viewings.length > 0 ? Math.max.apply(null, viewings.map(function(v){return v.id;})) + 1 : 1;
    viewings.push({
        id: newId,
        listing_id: propIdx,
        scheduled_date: date,
        scheduled_time: time,
        duration_minutes: parseInt(document.getElementById('viewingDuration').value) || 30,
        status: 'scheduled',
        agent_name: document.getElementById('viewingAgent').value,
        agent_contact: document.getElementById('viewingAgentContact').value,
        notes: document.getElementById('viewingNotes').value,
        rating: null,
        feedback: null,
        created_at: new Date().toISOString()
    });
    saveViewings(viewings);
    // Also save to API if connected
    if (apiConnected) apiPost('/viewings', viewings[viewings.length - 1]);
    document.getElementById('viewingFormContainer').style.display = 'none';
    initializeViewings();
}

function completeViewing(id) {
    var viewings = getViewings();
    var v = viewings.find(function(x){return x.id === id;});
    if (v) { v.status = 'completed'; saveViewings(viewings); }
    if (apiConnected) apiPut('/viewings/' + id, { status: 'completed' });
    initializeViewings();
}

function cancelViewing(id) {
    var viewings = getViewings();
    var v = viewings.find(function(x){return x.id === id;});
    if (v) { v.status = 'cancelled'; saveViewings(viewings); }
    if (apiConnected) apiPut('/viewings/' + id, { status: 'cancelled' });
    initializeViewings();
}

function deleteViewing(id) {
    if (!confirm('Delete this viewing?')) return;
    var viewings = getViewings().filter(function(x){return x.id !== id;});
    saveViewings(viewings);
    if (apiConnected) apiDelete('/viewings/' + id);
    initializeViewings();
}

function rateViewing(id) {
    var rating = prompt('Rate this viewing (1-5 stars):');
    var r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) { alert('Please enter 1-5.'); return; }
    var feedback = prompt('Any feedback or notes from the viewing?') || '';
    var viewings = getViewings();
    var v = viewings.find(function(x){return x.id === id;});
    if (v) { v.rating = r; v.feedback = feedback; saveViewings(viewings); }
    if (apiConnected) apiPut('/viewings/' + id, { rating: r, feedback: feedback });
    initializeViewings();
}

function showViewingDetail(id) {
    var viewings = getViewings();
    var v = viewings.find(function(x){return x.id === id;});
    if (!v) return;
    var listing = rawListings[v.listing_id] || {};
    alert('Viewing: ' + (listing.addr || 'Unknown') + '\nDate: ' + v.scheduled_date + ' at ' + v.scheduled_time + '\nStatus: ' + v.status + (v.notes ? '\nNotes: ' + v.notes : '') + (v.rating ? '\nRating: ' + v.rating + '/5' : ''));
}

// ===================================================================
// DOCUMENT VAULT
// ===================================================================
function getDocuments() {
    var saved = localStorage.getItem('documents');
    return saved ? JSON.parse(saved) : [];
}
function saveDocumentsList(docs) {
    localStorage.setItem('documents', JSON.stringify(docs));
}

function initializeDocuments() {
    // Populate listing filter dropdown
    var select = document.getElementById('docFilterListing');
    if (select && select.options.length <= 1) {
        shortlistedIds.forEach(function(idx) {
            var l = rawListings[idx];
            if (l) {
                var opt = document.createElement('option');
                opt.value = idx;
                opt.textContent = l.addr + ' - ' + l.neighborhood;
                select.appendChild(opt);
            }
        });
    }
    renderDocuments();
    setupDocDragDrop();
}

function setupDocDragDrop() {
    var zone = document.getElementById('docDropZone');
    if (!zone || zone._dragSetup) return;
    zone._dragSetup = true;
    zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', function() { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', function(e) {
        e.preventDefault(); zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) handleDocUpload(e.dataTransfer.files);
    });
}

function handleDocUpload(files) {
    var docs = getDocuments();
    Array.from(files).forEach(function(file) {
        if (file.size > 10 * 1024 * 1024) { alert(file.name + ' exceeds 10MB limit.'); return; }
        var reader = new FileReader();
        reader.onload = function(e) {
            var newId = docs.length > 0 ? Math.max.apply(null, docs.map(function(d){return d.id;})) + 1 : 1;
            var docType = guessDocType(file.name);
            docs.push({
                id: newId,
                listing_id: document.getElementById('docFilterListing').value || null,
                title: file.name.replace(/\.[^.]+$/, ''),
                doc_type: docType,
                file_name: file.name,
                file_size: file.size,
                mime_type: file.type,
                data: e.target.result,
                notes: '',
                created_at: new Date().toISOString()
            });
            saveDocumentsList(docs);
            renderDocuments();
        };
        reader.readAsDataURL(file);
    });
}

function guessDocType(filename) {
    var lower = filename.toLowerCase();
    if (lower.includes('inspect')) return 'inspection';
    if (lower.includes('title')) return 'title_search';
    if (lower.includes('strata') || lower.includes('bylaws')) return 'strata_docs';
    if (lower.includes('disclos')) return 'disclosure';
    if (lower.includes('apprais')) return 'appraisal';
    if (lower.includes('contract') || lower.includes('agreement') || lower.includes('offer')) return 'contract';
    return 'other';
}

function getDocIcon(type) {
    var icons = { inspection: 'pdf', title_search: 'doc', strata_docs: 'doc', disclosure: 'pdf', appraisal: 'pdf', contract: 'doc', other: 'doc' };
    var labels = { inspection: 'INS', title_search: 'TTL', strata_docs: 'STR', disclosure: 'DIS', appraisal: 'APR', contract: 'CON', other: 'DOC' };
    return { cls: icons[type] || 'doc', label: labels[type] || 'DOC' };
}

function renderDocuments() {
    var docs = getDocuments();
    var filterListing = document.getElementById('docFilterListing').value;
    var filterType = document.getElementById('docFilterType').value;

    if (filterListing) docs = docs.filter(function(d) { return String(d.listing_id) === filterListing; });
    if (filterType) docs = docs.filter(function(d) { return d.doc_type === filterType; });

    var listEl = document.getElementById('documentsList');
    var emptyEl = document.getElementById('emptyDocuments');

    if (docs.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = '';
        return;
    }
    emptyEl.style.display = 'none';

    var html = '';
    docs.forEach(function(doc) {
        var icon = getDocIcon(doc.doc_type);
        var size = doc.file_size < 1024 ? doc.file_size + ' B' : (doc.file_size < 1024*1024 ? Math.round(doc.file_size/1024) + ' KB' : (doc.file_size/1024/1024).toFixed(1) + ' MB');
        var listing = doc.listing_id !== null ? rawListings[doc.listing_id] : null;
        html += '<div class="doc-item">';
        html += '<div class="doc-icon ' + icon.cls + '">' + icon.label + '</div>';
        html += '<div class="doc-info"><div class="doc-title">' + doc.title + '</div>';
        html += '<div class="doc-meta">' + (doc.doc_type || 'other').replace(/_/g, ' ') + ' &bull; ' + size + ' &bull; ' + new Date(doc.created_at).toLocaleDateString();
        if (listing) html += ' &bull; ' + listing.addr;
        html += '</div></div>';
        html += '<div style="display:flex;gap:4px;">';
        if (doc.data) html += '<button class="btn-secondary" onclick="downloadDoc(' + doc.id + ')" style="font-size:11px;padding:4px 8px;">Download</button>';
        html += '<button class="btn-secondary" onclick="editDocNotes(' + doc.id + ')" style="font-size:11px;padding:4px 8px;">Notes</button>';
        html += '<button class="btn-secondary" onclick="deleteDoc(' + doc.id + ')" style="font-size:11px;padding:4px 8px;color:var(--danger);">Delete</button>';
        html += '</div></div>';
    });
    listEl.innerHTML = html;
}

function downloadDoc(id) {
    var docs = getDocuments();
    var doc = docs.find(function(d) { return d.id === id; });
    if (!doc || !doc.data) return;
    var a = document.createElement('a');
    a.href = doc.data;
    a.download = doc.file_name;
    a.click();
}

function editDocNotes(id) {
    var docs = getDocuments();
    var doc = docs.find(function(d) { return d.id === id; });
    if (!doc) return;
    var notes = prompt('Notes for "' + doc.title + '":', doc.notes || '');
    if (notes !== null) { doc.notes = notes; saveDocumentsList(docs); renderDocuments(); }
}

function deleteDoc(id) {
    if (!confirm('Delete this document?')) return;
    var docs = getDocuments().filter(function(d) { return d.id !== id; });
    saveDocumentsList(docs);
    renderDocuments();
}

// ===================================================================
// PRICE HISTORY TRACKING
// ===================================================================
function getPriceHistory() {
    var saved = localStorage.getItem('priceHistory');
    return saved ? JSON.parse(saved) : [];
}
function savePriceHistory(history) {
    localStorage.setItem('priceHistory', JSON.stringify(history));
}

function recordPriceSnapshot() {
    var history = getPriceHistory();
    var today = new Date().toISOString().split('T')[0];
    // Only snapshot once per day
    var lastSnap = history.length > 0 ? history[history.length - 1] : null;
    if (lastSnap && lastSnap.date === today) return;

    var snapshot = { date: today, prices: {} };
    rawListings.forEach(function(l, idx) {
        snapshot.prices[idx] = l.price;
    });
    history.push(snapshot);
    // Keep max 90 days of history
    if (history.length > 90) history = history.slice(-90);
    savePriceHistory(history);
}

function detectPriceChanges() {
    var history = getPriceHistory();
    if (history.length < 2) return [];
    var changes = [];
    var latest = history[history.length - 1];
    var previous = history[history.length - 2];
    for (var idx in latest.prices) {
        if (previous.prices[idx] !== undefined && latest.prices[idx] !== previous.prices[idx]) {
            var oldPrice = previous.prices[idx];
            var newPrice = latest.prices[idx];
            var changePct = ((newPrice - oldPrice) / oldPrice * 100).toFixed(1);
            changes.push({
                listingIndex: parseInt(idx),
                oldPrice: oldPrice,
                newPrice: newPrice,
                changePct: parseFloat(changePct),
                changeDate: latest.date,
                type: newPrice < oldPrice ? 'decrease' : 'increase'
            });
        }
    }
    return changes;
}

function getAllPriceChanges() {
    var history = getPriceHistory();
    var allChanges = [];
    for (var i = 1; i < history.length; i++) {
        for (var idx in history[i].prices) {
            if (history[i-1].prices[idx] !== undefined && history[i].prices[idx] !== history[i-1].prices[idx]) {
                var oldPrice = history[i-1].prices[idx];
                var newPrice = history[i].prices[idx];
                allChanges.push({
                    listingIndex: parseInt(idx),
                    oldPrice: oldPrice,
                    newPrice: newPrice,
                    changePct: parseFloat(((newPrice - oldPrice) / oldPrice * 100).toFixed(1)),
                    changeDate: history[i].date,
                    type: newPrice < oldPrice ? 'decrease' : 'increase'
                });
            }
        }
    }
    return allChanges;
}

function renderPriceHistory() {
    var changes = getAllPriceChanges();
    var filter = document.getElementById('priceHistoryFilter');
    var regionSelect = document.getElementById('priceHistoryRegion');

    // Populate region filter
    if (regionSelect && regionSelect.options.length <= 1) {
        var regions = [...new Set(rawListings.map(function(l){return l.region;}))].sort();
        regions.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r; opt.textContent = r;
            regionSelect.appendChild(opt);
        });
    }

    var filterVal = filter ? filter.value : 'all';
    var regionVal = regionSelect ? regionSelect.value : '';

    if (filterVal === 'drops') changes = changes.filter(function(c){return c.type === 'decrease';});
    if (filterVal === 'increases') changes = changes.filter(function(c){return c.type === 'increase';});
    if (regionVal) changes = changes.filter(function(c){
        var l = rawListings[c.listingIndex];
        return l && l.region === regionVal;
    });

    // Update stats
    var drops = changes.filter(function(c){return c.type === 'decrease';});
    var increases = changes.filter(function(c){return c.type === 'increase';});
    document.getElementById('priceDropCount').textContent = drops.length;
    document.getElementById('priceIncCount').textContent = increases.length;
    document.getElementById('avgDropPct').textContent = drops.length > 0 ?
        (drops.reduce(function(s,c){return s + Math.abs(c.changePct);}, 0) / drops.length).toFixed(1) + '%' : '0%';
    document.getElementById('trackedCount').textContent = rawListings.length;

    var listEl = document.getElementById('priceHistoryList');
    var emptyEl = document.getElementById('emptyPriceHistory');

    if (changes.length === 0) {
        listEl.innerHTML = '<div style="text-align:center;padding:30px;color:#666;"><p>No price changes detected yet.</p><p style="font-size:12px;color:#999;">Price snapshots are taken daily. Run the scraping pipeline to detect changes, or manually record a price change below.</p>' +
            '<button class="btn-secondary" onclick="manualPriceChange()" style="margin-top:12px;">Record Manual Price Change</button></div>';
        emptyEl.style.display = 'none';
        return;
    }
    emptyEl.style.display = 'none';

    changes.sort(function(a,b) { return b.changeDate.localeCompare(a.changeDate); });

    var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--light-gray);">' +
        '<th style="padding:8px;text-align:left;">Property</th><th style="padding:8px;">Neighborhood</th><th style="padding:8px;">Old Price</th><th style="padding:8px;">New Price</th><th style="padding:8px;">Change</th><th style="padding:8px;">Date</th></tr></thead><tbody>';
    changes.forEach(function(c) {
        var l = rawListings[c.listingIndex] || {};
        var changeClass = c.type === 'decrease' ? 'price-down' : 'price-up';
        html += '<tr style="cursor:pointer;" onclick="showDetailModal(' + c.listingIndex + ')">';
        html += '<td style="padding:8px;">' + (l.addr || 'Unknown') + '</td>';
        html += '<td style="padding:8px;text-align:center;">' + (l.neighborhood || '') + '</td>';
        html += '<td style="padding:8px;text-align:center;">' + formatPrice(c.oldPrice) + '</td>';
        html += '<td style="padding:8px;text-align:center;">' + formatPrice(c.newPrice) + '</td>';
        html += '<td style="padding:8px;text-align:center;"><span class="price-change-badge ' + changeClass + '">' + (c.changePct > 0 ? '+' : '') + c.changePct + '%</span></td>';
        html += '<td style="padding:8px;text-align:center;">' + c.changeDate + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += '<div style="margin-top:12px;text-align:right;"><button class="btn-secondary" onclick="manualPriceChange()" style="font-size:11px;">Record Manual Price Change</button></div>';
    listEl.innerHTML = html;
}

function manualPriceChange() {
    var addrSearch = prompt('Enter property address (or part of it):');
    if (!addrSearch) return;
    var matches = rawListings.map(function(l,i){return {listing:l, idx:i};}).filter(function(x) {
        return x.listing.addr.toLowerCase().includes(addrSearch.toLowerCase());
    });
    if (matches.length === 0) { alert('No matching property found.'); return; }
    var match = matches[0];
    var newPrice = prompt('New price for "' + match.listing.addr + '" (current: ' + formatPrice(match.listing.price) + '):');
    if (!newPrice) return;
    newPrice = parseInt(newPrice.replace(/[^0-9]/g, ''));
    if (isNaN(newPrice) || newPrice <= 0) { alert('Invalid price.'); return; }

    // Record snapshot with old prices, then update
    var history = getPriceHistory();
    var today = new Date().toISOString().split('T')[0];
    // Ensure we have a "before" snapshot
    if (history.length === 0 || history[history.length - 1].date !== today) {
        var snapshot = { date: today, prices: {} };
        rawListings.forEach(function(l,idx) { snapshot.prices[idx] = l.price; });
        history.push(snapshot);
    }
    // Now update the listing and create "after" snapshot
    rawListings[match.idx].price = newPrice;
    var afterSnapshot = { date: today + '_updated', prices: {} };
    rawListings.forEach(function(l,idx) { afterSnapshot.prices[idx] = l.price; });
    history.push(afterSnapshot);
    savePriceHistory(history);
    applyFilters();
    renderPriceHistory();
}

// Take initial price snapshot on load
recordPriceSnapshot();

// ===================================================================
// NEIGHBORHOOD ENRICHMENT / AREA INTEL
// ===================================================================
var neighborhoodEnrichment = {
    'White Rock': { walkScore: 72, transitScore: 45, bikeScore: 55, population: 21000, avgHouseholdIncome: 82000, crimeIndex: 22, parksNearby: 8, groceryNearby: 6, restaurantsNearby: 42, schools: [{name: 'Earl Marriott Secondary', type: 'Secondary', rating: 7.2}, {name: 'White Rock Elementary', type: 'Elementary', rating: 7.8}, {name: 'Semiahmoo Secondary', type: 'Secondary', rating: 7.5}], amenities: ['Beach Promenade', 'Pier', 'Marine Drive', 'Memorial Park', 'Library', 'Community Centre'] },
    'Crescent Beach': { walkScore: 42, transitScore: 20, bikeScore: 35, population: 3200, avgHouseholdIncome: 112000, crimeIndex: 12, parksNearby: 4, groceryNearby: 1, restaurantsNearby: 8, schools: [{name: 'Crescent Park Elementary', type: 'Elementary', rating: 7.6}], amenities: ['Beach', 'Blackie Spit Park', 'Dunsmuir Gardens', 'Art Studios'] },
    'Morgan Creek': { walkScore: 35, transitScore: 25, bikeScore: 30, population: 8500, avgHouseholdIncome: 145000, crimeIndex: 8, parksNearby: 5, groceryNearby: 3, restaurantsNearby: 15, schools: [{name: 'Morgan Elementary', type: 'Elementary', rating: 8.1}, {name: 'Grandview Heights Secondary', type: 'Secondary', rating: 7.3}], amenities: ['Morgan Creek Golf Course', 'South Surrey Athletic Park', 'Nature Trails'] },
    'Grandview Heights': { walkScore: 52, transitScore: 38, bikeScore: 42, population: 28000, avgHouseholdIncome: 105000, crimeIndex: 15, parksNearby: 7, groceryNearby: 5, restaurantsNearby: 30, schools: [{name: 'Grandview Heights Secondary', type: 'Secondary', rating: 7.3}, {name: 'Sunnyside Elementary', type: 'Elementary', rating: 7.9}], amenities: ['Grandview Corners', 'South Point Exchange', 'Trails', 'New Town Centre'] },
    'King George Corridor': { walkScore: 58, transitScore: 50, bikeScore: 45, population: 19000, avgHouseholdIncome: 78000, crimeIndex: 28, parksNearby: 4, groceryNearby: 4, restaurantsNearby: 20, schools: [{name: 'King George Secondary', type: 'Secondary', rating: 6.5}, {name: 'Jessie Lee Elementary', type: 'Elementary', rating: 7.0}], amenities: ['King George Hub', 'SkyTrain Access (future)', 'Shopping'] },
    'Pacific Douglas': { walkScore: 30, transitScore: 15, bikeScore: 25, population: 6000, avgHouseholdIncome: 95000, crimeIndex: 10, parksNearby: 3, groceryNearby: 2, restaurantsNearby: 8, schools: [{name: 'Pacific Academy', type: 'K-12 Private', rating: 8.0}], amenities: ['Peace Arch Provincial Park', 'Border Crossing', 'Nature Reserve'] },
    'Elgin Chantrell': { walkScore: 25, transitScore: 10, bikeScore: 20, population: 4800, avgHouseholdIncome: 165000, crimeIndex: 5, parksNearby: 3, groceryNearby: 2, restaurantsNearby: 6, schools: [{name: 'Chantrell Creek Elementary', type: 'Elementary', rating: 8.5}, {name: 'Elgin Park Secondary', type: 'Secondary', rating: 7.8}], amenities: ['Chantrell Creek Park', 'Equestrian Trails', 'Exclusive Estates'] },
    'Sunnyside Park': { walkScore: 45, transitScore: 30, bikeScore: 38, population: 7500, avgHouseholdIncome: 88000, crimeIndex: 18, parksNearby: 5, groceryNearby: 3, restaurantsNearby: 12, schools: [{name: 'Sunnyside Elementary', type: 'Elementary', rating: 7.4}], amenities: ['Sunnyside Park', 'Shops', 'Local Dining'] },
    'Ocean Park': { walkScore: 48, transitScore: 22, bikeScore: 40, population: 5200, avgHouseholdIncome: 98000, crimeIndex: 14, parksNearby: 6, groceryNearby: 2, restaurantsNearby: 10, schools: [{name: 'Ocean Park Elementary', type: 'Elementary', rating: 7.6}], amenities: ['Ocean Park Village', 'Beach Access', 'Nature Trails', 'Art Galleries'] },
    'Hazelmere': { walkScore: 10, transitScore: 5, bikeScore: 15, population: 2100, avgHouseholdIncome: 95000, crimeIndex: 6, parksNearby: 2, groceryNearby: 1, restaurantsNearby: 3, schools: [], amenities: ['Hazelmere Golf Course', 'Rural Acreages', 'Farm Markets'] },
    'Parksville': { walkScore: 62, transitScore: 25, bikeScore: 50, population: 13000, avgHouseholdIncome: 65000, crimeIndex: 25, parksNearby: 6, groceryNearby: 4, restaurantsNearby: 28, schools: [{name: 'Ballenas Secondary', type: 'Secondary', rating: 6.8}, {name: 'Parksville Elementary', type: 'Elementary', rating: 7.2}], amenities: ['Rathtrevor Beach', 'Community Beach', 'Parksville Boardwalk', 'Shops'] },
    'Qualicum Beach': { walkScore: 58, transitScore: 20, bikeScore: 48, population: 9000, avgHouseholdIncome: 68000, crimeIndex: 18, parksNearby: 5, groceryNearby: 3, restaurantsNearby: 22, schools: [{name: 'Kwalikum Secondary', type: 'Secondary', rating: 7.0}, {name: 'Qualicum Beach Elementary', type: 'Elementary', rating: 7.5}], amenities: ['Beach Walk', 'Heritage Forest', 'Old Town', 'Art Galleries', 'Golf Courses'] },
    'Nanoose Bay': { walkScore: 18, transitScore: 8, bikeScore: 22, population: 5500, avgHouseholdIncome: 78000, crimeIndex: 10, parksNearby: 4, groceryNearby: 1, restaurantsNearby: 5, schools: [{name: 'Nanoose Bay Elementary', type: 'Elementary', rating: 7.3}], amenities: ['Moorecroft Regional Park', 'Kayaking', 'Private Beaches', 'Nature'] },
    'Lantzville': { walkScore: 22, transitScore: 10, bikeScore: 28, population: 3800, avgHouseholdIncome: 85000, crimeIndex: 8, parksNearby: 3, groceryNearby: 1, restaurantsNearby: 4, schools: [{name: 'Lantzville Elementary', type: 'Elementary', rating: 7.6}], amenities: ['Copley Ridge Trail', 'Beach Access', 'Village Core', 'Ocean Views'] },
    'Nanaimo': { walkScore: 65, transitScore: 42, bikeScore: 52, population: 99000, avgHouseholdIncome: 72000, crimeIndex: 42, parksNearby: 15, groceryNearby: 12, restaurantsNearby: 85, schools: [{name: 'Nanaimo District Secondary', type: 'Secondary', rating: 6.5}, {name: 'Dover Bay Secondary', type: 'Secondary', rating: 6.8}, {name: 'VIU Campus', type: 'University', rating: null}], amenities: ['Harbourfront', 'Departure Bay', 'Bowen Park', 'Malls', 'Hospital', 'University'] },
    'Courtenay': { walkScore: 60, transitScore: 30, bikeScore: 55, population: 28000, avgHouseholdIncome: 68000, crimeIndex: 30, parksNearby: 8, groceryNearby: 5, restaurantsNearby: 35, schools: [{name: 'GP Vanier Secondary', type: 'Secondary', rating: 6.8}, {name: 'Courtenay Elementary', type: 'Elementary', rating: 7.2}], amenities: ['Downtown Core', 'Puntledge River', 'Simms Park', 'Hospital', 'NIC Campus'] },
    'Comox': { walkScore: 55, transitScore: 25, bikeScore: 50, population: 15000, avgHouseholdIncome: 75000, crimeIndex: 20, parksNearby: 7, groceryNearby: 3, restaurantsNearby: 20, schools: [{name: 'Highland Secondary', type: 'Secondary', rating: 7.0}, {name: 'Airport Elementary', type: 'Elementary', rating: 7.4}], amenities: ['Marina', 'Filberg Park', 'Comox Ave Shops', 'Air Force Base', 'Mountain Views'] },
    'Cumberland': { walkScore: 68, transitScore: 12, bikeScore: 75, population: 4200, avgHouseholdIncome: 62000, crimeIndex: 15, parksNearby: 4, groceryNearby: 2, restaurantsNearby: 10, schools: [{name: 'Cumberland Community School', type: 'K-8', rating: 7.3}], amenities: ['Mountain Bike Trails', 'Village Core', 'Comox Lake', 'Historic Downtown', 'Brewing'] },
    'Campbell River': { walkScore: 55, transitScore: 22, bikeScore: 42, population: 35000, avgHouseholdIncome: 70000, crimeIndex: 35, parksNearby: 10, groceryNearby: 6, restaurantsNearby: 40, schools: [{name: 'Carihi Secondary', type: 'Secondary', rating: 6.5}, {name: 'Timberline Secondary', type: 'Secondary', rating: 6.8}], amenities: ['Fishing', 'Discovery Passage', 'Elk Falls', 'Shopping', 'Hospital', 'Whale Watching'] }
};

function renderAreaIntel() {
    var regionFilter = document.getElementById('areaIntelRegion');
    var sortBy = document.getElementById('areaIntelSort');

    // Populate region filter
    if (regionFilter && regionFilter.options.length <= 1) {
        var regions = [...new Set(rawListings.map(function(l){return l.region;}))].sort();
        regions.forEach(function(r) {
            var opt = document.createElement('option');
            opt.value = r; opt.textContent = r;
            regionFilter.appendChild(opt);
        });
    }

    var neighborhoods = Object.keys(neighborhoodEnrichment);
    var regionVal = regionFilter ? regionFilter.value : '';
    if (regionVal) {
        var regionNeighborhoods = [...new Set(rawListings.filter(function(l){return l.region === regionVal;}).map(function(l){return l.neighborhood;}))];
        neighborhoods = neighborhoods.filter(function(n){return regionNeighborhoods.includes(n);});
    }

    // Sort
    var sortVal = sortBy ? sortBy.value : 'name';
    neighborhoods.sort(function(a,b) {
        var da = neighborhoodEnrichment[a], db = neighborhoodEnrichment[b];
        if (sortVal === 'walk') return (db.walkScore || 0) - (da.walkScore || 0);
        if (sortVal === 'transit') return (db.transitScore || 0) - (da.transitScore || 0);
        if (sortVal === 'schools') return (db.schools || []).length - (da.schools || []).length;
        return a.localeCompare(b);
    });

    var grid = document.getElementById('areaIntelGrid');
    var html = '';
    neighborhoods.forEach(function(name) {
        var data = neighborhoodEnrichment[name];
        if (!data) return;
        var listingCount = rawListings.filter(function(l){return l.neighborhood === name;}).length;
        var trend = marketTrends[name] || {};

        html += '<div class="enrichment-card">';
        html += '<h4>' + name + ' <span style="font-size:11px;font-weight:400;color:#888;">(' + listingCount + ' listings)</span></h4>';

        // Scores
        html += '<div style="display:flex;gap:12px;margin-bottom:12px;justify-content:center;">';
        html += '<div style="text-align:center;"><div class="score-circle ' + getScoreLevel(data.walkScore) + '">' + data.walkScore + '</div><div style="font-size:10px;color:#888;margin-top:4px;">Walk</div></div>';
        html += '<div style="text-align:center;"><div class="score-circle ' + getScoreLevel(data.transitScore) + '">' + data.transitScore + '</div><div style="font-size:10px;color:#888;margin-top:4px;">Transit</div></div>';
        html += '<div style="text-align:center;"><div class="score-circle ' + getScoreLevel(data.bikeScore) + '">' + data.bikeScore + '</div><div style="font-size:10px;color:#888;margin-top:4px;">Bike</div></div>';
        html += '</div>';

        // Quick stats
        html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:12px;">';
        html += '<div>Population: <strong>' + (data.population || 0).toLocaleString() + '</strong></div>';
        html += '<div>Avg Income: <strong>$' + (data.avgHouseholdIncome || 0).toLocaleString() + '</strong></div>';
        html += '<div>Parks: <strong>' + (data.parksNearby || 0) + '</strong></div>';
        html += '<div>Restaurants: <strong>' + (data.restaurantsNearby || 0) + '</strong></div>';
        html += '<div>Grocery: <strong>' + (data.groceryNearby || 0) + '</strong></div>';
        html += '<div>Crime Index: <strong>' + (data.crimeIndex || 0) + '</strong></div>';
        html += '</div>';

        // Market snapshot
        if (trend.yoyChange !== undefined) {
            html += '<div style="background:var(--light-gray);padding:8px;border-radius:4px;font-size:11px;margin-bottom:10px;">';
            html += '<span style="color:' + (trend.yoyChange < 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">YoY: ' + (trend.yoyChange > 0 ? '+' : '') + trend.yoyChange + '%</span>';
            html += ' &bull; DOM: ' + trend.medianDOM + 'd';
            html += ' &bull; Sale/List: ' + ((trend.avgSaleToList || 0) * 100).toFixed(0) + '%';
            html += '</div>';
        }

        // Schools
        if (data.schools && data.schools.length > 0) {
            html += '<div style="font-size:11px;font-weight:600;margin-bottom:4px;color:var(--primary);">Schools</div>';
            data.schools.forEach(function(s) {
                html += '<div class="school-item"><span>' + s.name + ' <span style="color:#888;">(' + s.type + ')</span></span>';
                if (s.rating) html += '<span style="font-weight:600;color:' + (s.rating >= 7.5 ? 'var(--success)' : (s.rating >= 6 ? 'var(--warning)' : 'var(--danger)')) + ';">' + s.rating + '/10</span>';
                html += '</div>';
            });
        }

        // Amenities
        if (data.amenities && data.amenities.length > 0) {
            html += '<div style="margin-top:8px;">';
            data.amenities.forEach(function(a) {
                html += '<span class="amenity-chip">' + a + '</span>';
            });
            html += '</div>';
        }

        html += '<div style="margin-top:10px;"><button class="btn-secondary" onclick="filterByNeighborhood(\'' + name + '\')" style="font-size:11px;width:100%;">View Listings</button></div>';
        html += '</div>';
    });
    grid.innerHTML = html;
}

function getScoreLevel(score) {
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
}

// ===================================================================
// DATA FRESHNESS / HEALTH DASHBOARD
// ===================================================================
function getCommunityFlags() {
    var saved = localStorage.getItem('communityFlags');
    return saved ? JSON.parse(saved) : [];
}
function saveCommunityFlags(flags) {
    localStorage.setItem('communityFlags', JSON.stringify(flags));
}

function initializeDataFreshness() {
    checkApiConnection();

    // Update data source description
    var descEl = document.getElementById('dataSourceDesc');
    if (descEl) {
        if (window._usingFallbackData) {
            descEl.textContent = 'Currently showing sample data. Listings are illustrative and may not reflect current market conditions. Run the scraper pipeline to populate with real listings.';
        } else {
            descEl.textContent = 'Listings loaded from data/listings.json. Data was last updated ' + (window._dataAsOf || 'unknown') + '. Run the scraper pipeline regularly to keep data current.';
        }
    }

    // Compute freshness based on data metadata
    var now = new Date();
    var dataAge = Math.floor((now - new Date('2026-02-28')) / (1000 * 60 * 60 * 24));

    // For static mode, all listings have the same age
    // For API mode, each listing can have individual freshness
    var fresh = 0, recent = 0, aging = 0, stale = 0;

    rawListings.forEach(function(l) {
        var age = dataAge;
        if (l._updatedAt) {
            age = Math.floor((now - new Date(l._updatedAt)) / (1000 * 60 * 60 * 24));
        }
        if (age <= 3) fresh++;
        else if (age <= 7) recent++;
        else if (age <= 14) aging++;
        else stale++;
    });

    document.getElementById('freshCount').textContent = fresh;
    document.getElementById('recentCount').textContent = recent;
    document.getElementById('agingCount').textContent = aging;
    document.getElementById('staleCount').textContent = stale;

    // Freshness bar
    var total = rawListings.length || 1;
    var bar = document.getElementById('freshnessBar');
    bar.innerHTML = '<div style="width:' + (fresh/total*100) + '%;background:var(--success);"></div>' +
        '<div style="width:' + (recent/total*100) + '%;background:var(--warning);"></div>' +
        '<div style="width:' + (aging/total*100) + '%;background:#e65100;"></div>' +
        '<div style="width:' + (stale/total*100) + '%;background:var(--danger);"></div>';

    // By region
    var regionEl = document.getElementById('freshnessByRegion');
    var regions = [...new Set(rawListings.map(function(l){return l.region;}))].sort();
    var regionHtml = '';
    regions.forEach(function(r) {
        var count = rawListings.filter(function(l){return l.region === r;}).length;
        var regionAge = dataAge;
        var freshPct = regionAge <= 3 ? 100 : (regionAge <= 7 ? 75 : (regionAge <= 14 ? 40 : 10));
        regionHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border-gray);font-size:12px;">';
        regionHtml += '<span><strong>' + r + '</strong> (' + count + ')</span>';
        regionHtml += '<span class="freshness-badge ' + (freshPct >= 75 ? 'freshness-fresh' : (freshPct >= 40 ? 'freshness-recent' : 'freshness-stale')) + '">' +
            (regionAge <= 0 ? 'Today' : regionAge + ' days old') + '</span>';
        regionHtml += '</div>';
    });
    regionEl.innerHTML = regionHtml;

    // Data sources summary
    var sourcesEl = document.getElementById('dataSourcesSummary');
    var sources = {};
    rawListings.forEach(function(l) {
        var src = l._source || 'embedded';
        sources[src] = (sources[src] || 0) + 1;
    });
    var sourceHtml = '';
    for (var src in sources) {
        sourceHtml += '<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border-gray);font-size:12px;">';
        sourceHtml += '<span>' + src.charAt(0).toUpperCase() + src.slice(1) + '</span>';
        sourceHtml += '<span><strong>' + sources[src] + '</strong> listings</span>';
        sourceHtml += '</div>';
    }
    sourcesEl.innerHTML = sourceHtml;

    // Community flags
    renderCommunityFlags();
}

function renderCommunityFlags() {
    var flags = getCommunityFlags();
    var listEl = document.getElementById('communityFlagsList');
    var emptyEl = document.getElementById('emptyCommunityFlags');

    if (flags.length === 0) {
        listEl.innerHTML = '';
        emptyEl.style.display = '';
        return;
    }
    emptyEl.style.display = 'none';

    var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr style="background:var(--light-gray);">' +
        '<th style="padding:6px;text-align:left;">Property</th><th style="padding:6px;">Flag Type</th><th style="padding:6px;">Details</th><th style="padding:6px;">Status</th><th style="padding:6px;">Date</th><th style="padding:6px;">Action</th></tr></thead><tbody>';
    flags.forEach(function(f) {
        var l = rawListings[f.listing_id] || {};
        html += '<tr>';
        html += '<td style="padding:6px;">' + (l.addr || 'Unknown') + '</td>';
        html += '<td style="padding:6px;text-align:center;">' + (f.flag_type || '').replace(/_/g, ' ') + '</td>';
        html += '<td style="padding:6px;">' + (f.notes || '-') + '</td>';
        html += '<td style="padding:6px;text-align:center;"><span class="freshness-badge ' + (f.status === 'verified' ? 'freshness-fresh' : (f.status === 'dismissed' ? 'freshness-stale' : 'freshness-recent')) + '">' + f.status + '</span></td>';
        html += '<td style="padding:6px;text-align:center;">' + new Date(f.created_at).toLocaleDateString() + '</td>';
        html += '<td style="padding:6px;text-align:center;">';
        if (f.status === 'pending') html += '<button class="btn-secondary" onclick="resolveCommunityFlag(' + f.id + ',\'verified\')" style="font-size:10px;padding:2px 6px;">Verify</button> <button class="btn-secondary" onclick="resolveCommunityFlag(' + f.id + ',\'dismissed\')" style="font-size:10px;padding:2px 6px;">Dismiss</button>';
        html += '</td></tr>';
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;
}

function flagListing(listingIndex) {
    var listing = rawListings[listingIndex];
    if (!listing) return;

    var flagType = prompt('Flag type:\n1. Sold\n2. Price wrong\n3. Delisted\n4. Info incorrect\n5. Duplicate\n\nEnter number (1-5):');
    var types = ['sold', 'price_wrong', 'delisted', 'info_incorrect', 'duplicate'];
    var typeIdx = parseInt(flagType) - 1;
    if (isNaN(typeIdx) || typeIdx < 0 || typeIdx > 4) { alert('Invalid selection.'); return; }

    var notes = prompt('Additional details (optional):') || '';
    var flags = getCommunityFlags();
    var newId = flags.length > 0 ? Math.max.apply(null, flags.map(function(f){return f.id;})) + 1 : 1;
    flags.push({
        id: newId,
        listing_id: listingIndex,
        flag_type: types[typeIdx],
        notes: notes,
        status: 'pending',
        created_at: new Date().toISOString()
    });
    saveCommunityFlags(flags);
    if (apiConnected) apiPost('/listings/' + listingIndex + '/flag', { flag_type: types[typeIdx], notes: notes });
    alert('Flag submitted. Thank you for helping keep the data accurate!');
}

function resolveCommunityFlag(id, status) {
    var flags = getCommunityFlags();
    var flag = flags.find(function(f){return f.id === id;});
    if (flag) { flag.status = status; saveCommunityFlags(flags); }
    if (status === 'verified' && flag) {
        // If verified as sold/delisted, could mark the listing
        if (flag.flag_type === 'sold' || flag.flag_type === 'delisted') {
            // Mark in our local data
            if (rawListings[flag.listing_id]) {
                rawListings[flag.listing_id]._status = flag.flag_type;
            }
        }
    }
    renderCommunityFlags();
}

// ===================================================================
// ENHANCED COMPARISON TOOL
// ===================================================================
var _origOpenComparisonTool = typeof openComparisonTool === 'function' ? openComparisonTool : null;
function enhancedOpenComparisonTool() {
    var compareSet = [];
    rawListings.forEach(function(l, idx) {
        if (l._compare) compareSet.push(idx);
    });
    if (compareSet.length < 2) {
        // Fall back to shortlisted properties
        compareSet = [...shortlistedIds];
    }
    if (compareSet.length < 2) {
        alert('Please shortlist or select at least 2 properties to compare.\n\nUse the star icon on any listing to add it to your shortlist.');
        return;
    }

    var listings = compareSet.slice(0, 5).map(function(idx) { return { listing: rawListings[idx], index: idx }; });

    var modal = document.getElementById('comparisonModal');
    var body = document.getElementById('comparisonBody');

    // Build enhanced comparison table
    var html = '<div style="font-size:18px;font-weight:700;color:var(--primary);margin-bottom:16px;">Property Comparison</div>';

    // Properties header row
    html += '<div style="overflow-x:auto;"><table class="comparison-table" style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<thead><tr><th style="padding:10px;text-align:left;min-width:120px;">Feature</th>';
    listings.forEach(function(item) {
        html += '<th style="padding:10px;text-align:center;min-width:160px;">' + item.listing.addr + '<br><span style="font-weight:400;color:#888;">' + item.listing.neighborhood + '</span></th>';
    });
    html += '</tr></thead><tbody>';

    // Comparison rows with highlighting
    var rows = [
        { label: 'Price', key: 'price', format: function(v) { return formatPrice(v); }, best: 'min' },
        { label: 'Type', key: 'type', format: function(v) { return v; } },
        { label: 'Bedrooms', key: 'beds', format: function(v) { return v; }, best: 'max' },
        { label: 'Bathrooms', key: 'baths', format: function(v) { return v; }, best: 'max' },
        { label: 'Square Feet', key: 'sqft', format: function(v) { return v.toLocaleString(); }, best: 'max' },
        { label: '$/SqFt', key: '_ppsf', format: function(v) { return '$' + v; }, best: 'min', compute: function(l) { return l.sqft > 0 ? Math.round(l.price / l.sqft) : 0; } },
        { label: 'Days on Market', key: 'dom', format: function(v) { return v; }, best: 'max' },
        { label: 'Year Built', key: 'yearBuilt', format: function(v) { return v; }, best: 'max' },
        { label: 'Lot Size', key: 'lot', format: function(v) { return v || 'N/A'; } },
        { label: 'Water View', key: 'waterView', format: function(v) { return v ? 'Yes' : 'No'; }, best: 'yes' },
        { label: 'Deal Score', key: 'score', format: function(v) { return Math.round(v) + '/100'; }, best: 'max' },
        { label: 'Walk Score', key: '_walk', format: function(v) { return v || 'N/A'; }, best: 'max', compute: function(l) { var e = neighborhoodEnrichment[l.neighborhood]; return e ? e.walkScore : null; } },
        { label: 'Transit Score', key: '_transit', format: function(v) { return v || 'N/A'; }, best: 'max', compute: function(l) { var e = neighborhoodEnrichment[l.neighborhood]; return e ? e.transitScore : null; } },
        { label: 'Market Trend (YoY)', key: '_yoy', format: function(v) { return v !== null ? (v > 0 ? '+' : '') + v + '%' : 'N/A'; }, best: 'min', compute: function(l) { var t = marketTrends[l.neighborhood]; return t ? t.yoyChange : null; } },
        { label: 'Agent', key: 'agent', format: function(v) { return v; } },
        { label: 'Region', key: 'region', format: function(v) { return v; } }
    ];

    rows.forEach(function(row) {
        html += '<tr><td style="padding:8px;font-weight:600;background:var(--light-gray);">' + row.label + '</td>';
        var values = listings.map(function(item) {
            return row.compute ? row.compute(item.listing) : item.listing[row.key];
        });

        // Determine best value
        var bestIdx = -1;
        if (row.best === 'min') { var numVals = values.filter(function(v){return typeof v === 'number';}); if (numVals.length > 0) { var min = Math.min.apply(null, numVals); bestIdx = values.indexOf(min); } }
        if (row.best === 'max') { var numVals = values.filter(function(v){return typeof v === 'number';}); if (numVals.length > 0) { var max = Math.max.apply(null, numVals); bestIdx = values.indexOf(max); } }
        if (row.best === 'yes') { bestIdx = values.indexOf(true); }

        values.forEach(function(v, i) {
            var cls = i === bestIdx ? ' class="comparison-highlight"' : '';
            html += '<td style="padding:8px;text-align:center;"' + cls + '>' + row.format(v) + (i === bestIdx && row.best ? ' <span style="color:var(--success);font-size:10px;">&#9733;</span>' : '') + '</td>';
        });
        html += '</tr>';
    });

    // Monthly payment row
    html += '<tr><td style="padding:8px;font-weight:600;background:var(--light-gray);">Est. Monthly (20% down)</td>';
    listings.forEach(function(item) {
        var payment = Math.round(item.listing.price * 0.8 * (0.055/12 * Math.pow(1+0.055/12,300)) / (Math.pow(1+0.055/12,300)-1));
        html += '<td style="padding:8px;text-align:center;">$' + payment.toLocaleString() + '/mo</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';

    // Action buttons
    html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">';
    listings.forEach(function(item) {
        html += '<button class="btn-primary" onclick="document.getElementById(\'comparisonModal\').classList.remove(\'active\');showDetailModal(' + item.index + ')" style="font-size:11px;">' + item.listing.addr.substring(0, 20) + '...</button>';
    });
    html += '</div>';

    body.innerHTML = html;
    modal.classList.add('active');
}

// Override the comparison tool
if (typeof openComparisonTool !== 'undefined') {
    openComparisonTool = enhancedOpenComparisonTool;
}

// ===================================================================
// ADD FLAG BUTTON TO DETAIL MODAL
// ===================================================================
var _origShowDetailModal = showDetailModal;
showDetailModal = function(listingIndex) {
    _origShowDetailModal(listingIndex);
    // Add flag button and price history to modal
    var modalBody = document.getElementById('modalBody');
    if (modalBody) {
        // Add flag button at the top
        var headerDiv = modalBody.querySelector('.modal-header');
        if (headerDiv && !headerDiv.querySelector('.flag-btn')) {
            var flagBtn = document.createElement('button');
            flagBtn.className = 'flag-btn';
            flagBtn.textContent = 'Flag Issue';
            flagBtn.onclick = function() { flagListing(listingIndex); };
            flagBtn.style.marginLeft = '8px';
            headerDiv.appendChild(flagBtn);
        }

        // Add freshness indicator
        var listing = rawListings[listingIndex];
        var freshHtml = '<div style="margin:8px 0;font-size:11px;">';
        var dataAge = Math.floor((new Date() - new Date('2026-02-28')) / (1000*60*60*24));
        if (listing._updatedAt) dataAge = Math.floor((new Date() - new Date(listing._updatedAt)) / (1000*60*60*24));
        var freshClass = dataAge <= 3 ? 'freshness-fresh' : (dataAge <= 7 ? 'freshness-recent' : (dataAge <= 14 ? 'freshness-aging' : 'freshness-stale'));
        freshHtml += 'Data: <span class="freshness-badge ' + freshClass + '">' + (dataAge <= 0 ? 'Today' : dataAge + ' days ago') + '</span>';
        if (listing._source) freshHtml += ' &bull; Source: ' + listing._source;
        freshHtml += ' &bull; <button class="flag-btn" onclick="flagListing(' + listingIndex + ')">Report Issue</button>';
        freshHtml += '</div>';

        // Add schedule viewing button
        freshHtml += '<button class="btn-secondary" onclick="closeDetailModal();switchTabDirect(\'viewings\');setTimeout(function(){showScheduleViewingForm();document.getElementById(\'viewingProperty\').value=\'' + listingIndex + '\';},200);" style="font-size:11px;margin-top:4px;">Schedule Viewing</button>';

        // Insert after the modal header
        if (headerDiv) {
            headerDiv.insertAdjacentHTML('afterend', freshHtml);
        }
    }
};

// ===================================================================
// BC ASSESSMENT ENRICHMENT TOOL
// ===================================================================

// Storage
function loadBcAssessmentData() {
    return JSON.parse(localStorage.getItem('bcAssessmentData') || '{}');
}
function saveBcAssessmentData(data) {
    localStorage.setItem('bcAssessmentData', JSON.stringify(data));
}
function getAssessment(idx) {
    return loadBcAssessmentData()[String(idx)] || null;
}
function saveAssessment(idx, entry) {
    var data = loadBcAssessmentData();
    data[String(idx)] = entry;
    saveBcAssessmentData(data);
}

// Analysis
function askingToAssessedRatio(price, assessed) {
    if (!assessed || assessed <= 0) return null;
    return price / assessed;
}
function formatRatioText(ratio) {
    if (ratio === null) return '';
    var pct = Math.abs(Math.round((ratio - 1) * 100));
    if (ratio < 0.95) return '<span style="color:#198754;font-weight:600;">' + pct + '% below assessed</span>';
    if (ratio <= 1.10) return '<span style="color:#fd7e14;font-weight:600;">&asymp; assessed</span>';
    return '<span style="color:#dc3545;font-weight:600;">' + pct + '% above assessed</span>';
}
function getRatioBadgeHtml(ratio) {
    if (ratio === null) return '';
    var pct = Math.abs(Math.round((ratio - 1) * 100));
    if (ratio < 0.95) return '<span style="display:inline-block;background:#d4edda;color:#155724;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;margin-left:4px;">' + pct + '% below assessed</span>';
    if (ratio <= 1.10) return '<span style="display:inline-block;background:#fff3cd;color:#856404;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;margin-left:4px;">&asymp; assessed</span>';
    return '<span style="display:inline-block;background:#f8d7da;color:#721c24;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;margin-left:4px;">' + pct + '% above assessed</span>';
}

// Neighborhood → City mapping for BC Assessment search
var bcaCityMap = {
    'White Rock': 'White Rock',
    'Crescent Beach': 'Surrey',
    'Ocean Park': 'Surrey',
    'Sunnyside Park': 'Surrey',
    'Grandview Heights': 'Surrey',
    'King George Corridor': 'Surrey',
    'Morgan Creek': 'Surrey',
    'Pacific Douglas': 'Surrey',
    'Elgin Chantrell': 'Surrey',
    'Hazelmere': 'Surrey',
    'Campbell River': 'Campbell River',
    'Comox': 'Comox',
    'Courtenay': 'Courtenay',
    'Cumberland': 'Cumberland',
    'Parksville': 'Parksville',
    'Qualicum Beach': 'Qualicum Beach',
    'Nanoose Bay': 'Nanoose Bay',
    'Lantzville': 'Lantzville',
    'Nanaimo': 'Nanaimo'
};

function buildBcaSearchString(listing) {
    var addr = listing.addr || '';
    // Strip unit prefix: "PH2-1501 Foster St" → "1501 Foster St"
    addr = addr.replace(/^[A-Za-z]*\d+[-–]\s*/, '');
    // Also strip leading # unit: "#302-1234 Main St" → "1234 Main St"
    addr = addr.replace(/^#?\d+[-–]\s*/, '');
    var city = bcaCityMap[listing.neighborhood] || listing.neighborhood || '';
    return addr + ', ' + city;
}

function formatPID(pid) {
    if (!pid) return '';
    var digits = pid.replace(/\D/g, '');
    if (digits.length === 9) return digits.substr(0,3) + '-' + digits.substr(3,3) + '-' + digits.substr(6,3);
    return pid;
}

// Main render function
function renderBcaWorklist() {
    var data = loadBcAssessmentData();
    var regionFilter = (document.getElementById('bcaRegionFilter') || {}).value || 'all';
    var statusFilter = (document.getElementById('bcaStatusFilter') || {}).value || 'all';
    var nbrFilter = (document.getElementById('bcaNeighborhoodFilter') || {}).value || 'all';
    var sortOrder = (document.getElementById('bcaSortOrder') || {}).value || 'neighborhood';

    // Build filtered list
    var items = [];
    rawListings.forEach(function(listing, idx) {
        var hasData = !!data[String(idx)];
        // Region filter
        if (regionFilter !== 'all') {
            var regionMatch = (regionFilter === 'SSWR' && listing.region && listing.region.indexOf('South Surrey') >= 0) ||
                             (regionFilter === 'SSWR' && listing.region && listing.region.indexOf('White Rock') >= 0) ||
                             (regionFilter === 'Vancouver Island' && listing.region && listing.region.indexOf('Vancouver Island') >= 0);
            if (!regionMatch) return;
        }
        // Status filter
        if (statusFilter === 'enriched' && !hasData) return;
        if (statusFilter === 'pending' && hasData) return;
        // Neighborhood filter
        if (nbrFilter !== 'all' && listing.neighborhood !== nbrFilter) return;

        var ratio = hasData && data[String(idx)].assessedTotal ? askingToAssessedRatio(listing.price, data[String(idx)].assessedTotal) : null;
        items.push({ listing: listing, idx: idx, hasData: hasData, assessment: data[String(idx)] || null, ratio: ratio });
    });

    // Populate neighborhood filter dropdown
    var nbrSelect = document.getElementById('bcaNeighborhoodFilter');
    if (nbrSelect) {
        var nbrs = {};
        rawListings.forEach(function(l) { nbrs[l.neighborhood] = true; });
        var nbrList = Object.keys(nbrs).sort();
        var currentVal = nbrSelect.value;
        nbrSelect.innerHTML = '<option value="all">All Neighborhoods</option>';
        nbrList.forEach(function(n) {
            nbrSelect.innerHTML += '<option value="' + n + '"' + (n === currentVal ? ' selected' : '') + '>' + n + '</option>';
        });
    }

    // Sort
    if (sortOrder === 'price-desc') items.sort(function(a,b) { return b.listing.price - a.listing.price; });
    else if (sortOrder === 'price-asc') items.sort(function(a,b) { return a.listing.price - b.listing.price; });
    else if (sortOrder === 'ratio-asc') items.sort(function(a,b) { return (a.ratio || 999) - (b.ratio || 999); });
    else if (sortOrder === 'ratio-desc') items.sort(function(a,b) { return (b.ratio || 0) - (a.ratio || 0); });
    else items.sort(function(a,b) { return a.listing.neighborhood.localeCompare(b.listing.neighborhood) || a.listing.addr.localeCompare(b.listing.addr); });

    // Progress bar
    var totalCount = rawListings.length;
    var enrichedCount = Object.keys(data).length;
    var sswr = 0, sswrEnriched = 0, vi = 0, viEnriched = 0;
    rawListings.forEach(function(l, idx) {
        var isSSWR = l.region && (l.region.indexOf('South Surrey') >= 0 || l.region.indexOf('White Rock') >= 0);
        if (isSSWR) { sswr++; if (data[String(idx)]) sswrEnriched++; }
        else { vi++; if (data[String(idx)]) viEnriched++; }
    });
    var pct = totalCount > 0 ? Math.round(enrichedCount / totalCount * 100) : 0;
    var progressEl = document.getElementById('bcaProgressBar');
    if (progressEl) {
        progressEl.innerHTML = '<div style="font-weight:600;color:var(--primary);margin-bottom:6px;">Progress: ' + enrichedCount + '/' + totalCount + ' (' + pct + '%)</div>' +
            '<div style="background:#e9ecef;border-radius:6px;height:12px;overflow:hidden;margin-bottom:6px;">' +
            '<div style="background:var(--secondary);height:100%;width:' + pct + '%;border-radius:6px;transition:width 0.3s;"></div></div>' +
            '<div style="font-size:11px;color:#888;">SSWR: ' + sswrEnriched + '/' + sswr + '  &middot;  VI: ' + viEnriched + '/' + vi + '</div>';
    }

    // Quick stats
    renderBcaQuickStats(data);

    // Render cards
    var html = '';
    var lastNeighborhood = '';
    items.forEach(function(item) {
        // Group header for neighborhood sort
        if (sortOrder === 'neighborhood' && item.listing.neighborhood !== lastNeighborhood) {
            var nbrCount = items.filter(function(i) { return i.listing.neighborhood === item.listing.neighborhood; }).length;
            html += '<div style="font-weight:700;color:var(--primary);font-size:14px;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid var(--secondary);">' + item.listing.neighborhood + ' (' + nbrCount + ' properties)</div>';
            lastNeighborhood = item.listing.neighborhood;
        }

        if (item.hasData) {
            html += renderBcaEnrichedCard(item);
        } else {
            html += renderBcaEmptyCard(item);
        }
    });

    if (items.length === 0) {
        html = '<div style="text-align:center;padding:40px;color:#999;">No properties match the selected filters.</div>';
    }

    var worklist = document.getElementById('bcaWorklist');
    if (worklist) worklist.innerHTML = html;
}

function renderBcaEmptyCard(item) {
    var l = item.listing;
    var idx = item.idx;
    var html = '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:14px 16px;margin-bottom:8px;" id="bcaCard_' + idx + '">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;">';
    html += '<div><div style="font-weight:700;color:var(--primary);font-size:13px;">' + escapeHtml(l.addr) + '</div>';
    html += '<div style="font-size:11px;color:#888;">' + escapeHtml(l.neighborhood) + ' &middot; DOM: ' + l.dom + '</div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="font-weight:700;color:var(--primary);">' + escapeHtml(l.type) + ' ' + formatPrice(l.price) + '</span>';
    html += '<button onclick="copyBcaAddress(' + idx + ', this)" style="padding:3px 8px;border:1px solid var(--secondary);color:var(--secondary);border-radius:4px;background:white;cursor:pointer;font-size:11px;" title="Copy address for BC Assessment lookup">Copy</button>';
    html += '<a href="https://www.bcassessment.ca/Property/AssessmentSearch" target="_blank" style="padding:3px 8px;border:1px solid #6f42c1;color:#6f42c1;border-radius:4px;background:white;text-decoration:none;font-size:11px;cursor:pointer;" title="Open BC Assessment search">Lookup</a>';
    html += '</div></div>';
    // Inline entry form
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">';
    html += '<div><label style="font-size:10px;color:#888;display:block;">Total Assessed *</label><input type="number" id="bcaTotal_' + idx + '" placeholder="e.g. 1450000" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')saveBcaEntry(' + idx + ')"></div>';
    html += '<div><label style="font-size:10px;color:#888;display:block;">Land Value</label><input type="number" id="bcaLand_' + idx + '" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')saveBcaEntry(' + idx + ')"></div>';
    html += '<div><label style="font-size:10px;color:#888;display:block;">Improvement</label><input type="number" id="bcaImprov_' + idx + '" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')saveBcaEntry(' + idx + ')"></div>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;">';
    html += '<div><label style="font-size:10px;color:#888;display:block;">PID</label><input type="text" id="bcaPid_' + idx + '" placeholder="012-345-678" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')saveBcaEntry(' + idx + ')"></div>';
    html += '<div><label style="font-size:10px;color:#888;display:block;">Roll Number</label><input type="text" id="bcaRoll_' + idx + '" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;" onkeydown="if(event.ctrlKey&&event.key===\'Enter\')saveBcaEntry(' + idx + ')"></div>';
    html += '<div><label style="font-size:10px;color:#888;display:block;">Jurisdiction</label><select id="bcaJuris_' + idx + '" style="width:100%;padding:4px 6px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box;">';
    html += '<option value="">--</option><option value="219">219 (Surrey)</option><option value="228">228 (White Rock)</option><option value="other">Other</option>';
    html += '</select></div>';
    html += '</div>';
    html += '<div style="text-align:right;"><button onclick="saveBcaEntry(' + idx + ')" style="padding:4px 14px;background:var(--secondary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:600;">Save</button></div>';
    html += '</div>';
    return html;
}

function renderBcaEnrichedCard(item) {
    var l = item.listing;
    var idx = item.idx;
    var a = item.assessment;
    var ratio = item.ratio;
    var ratioText = formatRatioText(ratio);
    var borderColor = ratio !== null ? (ratio < 0.95 ? '#198754' : ratio <= 1.10 ? '#fd7e14' : '#dc3545') : '#198754';

    var html = '<div style="background:white;border:1px solid ' + borderColor + ';border-left:4px solid ' + borderColor + ';border-radius:8px;padding:14px 16px;margin-bottom:8px;" id="bcaCard_' + idx + '">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px;">';
    html += '<div><div style="font-weight:700;color:var(--primary);font-size:13px;">' + escapeHtml(l.addr) + ' <span style="background:' + borderColor + '22;color:' + borderColor + ';padding:1px 6px;border-radius:8px;font-size:10px;font-weight:600;margin-left:4px;">Enriched</span></div>';
    html += '<div style="font-size:11px;color:#888;">' + escapeHtml(l.neighborhood) + ' &middot; DOM: ' + l.dom + '</div></div>';
    html += '<span style="font-weight:700;color:var(--primary);">' + escapeHtml(l.type) + ' ' + formatPrice(l.price) + '</span>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:12px;">';
    html += '<div><span style="color:#888;">Assessed:</span> <strong>' + formatPrice(a.assessedTotal || 0) + '</strong></div>';
    if (ratio !== null) html += '<div><span style="color:#888;">Ratio:</span> ' + ratio.toFixed(2) + ' ' + ratioText + '</div>';
    if (a.assessedLand) html += '<div><span style="color:#888;">Land:</span> ' + formatPrice(a.assessedLand) + '</div>';
    if (a.assessedImprovement) html += '<div><span style="color:#888;">Improvement:</span> ' + formatPrice(a.assessedImprovement) + '</div>';
    if (a.pid) html += '<div><span style="color:#888;">PID:</span> ' + formatPID(a.pid) + '</div>';
    if (a.rollNumber) html += '<div><span style="color:#888;">Roll:</span> ' + a.rollNumber + '</div>';
    if (a.assessmentYear) html += '<div><span style="color:#888;">Year:</span> ' + a.assessmentYear + '</div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px;margin-top:8px;">';
    html += '<button onclick="editBcaEntry(' + idx + ')" style="padding:3px 10px;border:1px solid #ccc;border-radius:4px;background:white;cursor:pointer;font-size:11px;">Edit</button>';
    html += '<button onclick="clearBcaEntry(' + idx + ')" style="padding:3px 10px;border:1px solid #dc3545;color:#dc3545;border-radius:4px;background:white;cursor:pointer;font-size:11px;">Clear</button>';
    html += '</div></div>';
    return html;
}

function renderBcaQuickStats(data) {
    var el = document.getElementById('bcaQuickStats');
    if (!el) return;
    var entries = Object.keys(data);
    if (entries.length < 3) { el.innerHTML = ''; return; }

    var ratios = [];
    var below = 0, near = 0, above = 0;
    var bestDeal = null, bestRatio = Infinity;
    var worstDeal = null, worstRatio = 0;

    entries.forEach(function(idxStr) {
        var a = data[idxStr];
        if (!a || !a.assessedTotal) return;
        var listing = rawListings[parseInt(idxStr)];
        if (!listing) return;
        var r = listing.price / a.assessedTotal;
        ratios.push(r);
        if (r < 0.95) below++;
        else if (r <= 1.10) near++;
        else above++;
        if (r < bestRatio) { bestRatio = r; bestDeal = listing.addr + ' (' + r.toFixed(2) + ')'; }
        if (r > worstRatio) { worstRatio = r; worstDeal = listing.addr + ' (' + r.toFixed(2) + ')'; }
    });

    if (ratios.length < 3) { el.innerHTML = ''; return; }
    var avgRatio = ratios.reduce(function(a,b) { return a+b; }, 0) / ratios.length;

    var html = '<div style="background:#f0f7ff;border:1px solid #b8daff;border-radius:8px;padding:14px 16px;">';
    html += '<div style="font-weight:700;color:var(--primary);margin-bottom:8px;">Quick Stats (' + ratios.length + ' enriched with assessed values)</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px;font-size:12px;">';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:var(--primary);">' + avgRatio.toFixed(2) + '</div><div style="color:#888;font-size:10px;">Avg Ratio</div></div>';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#198754;">' + below + '</div><div style="color:#888;font-size:10px;">Below Assessed</div></div>';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#fd7e14;">' + near + '</div><div style="color:#888;font-size:10px;">Near Assessed</div></div>';
    html += '<div style="text-align:center;"><div style="font-size:20px;font-weight:700;color:#dc3545;">' + above + '</div><div style="color:#888;font-size:10px;">Above Assessed</div></div>';
    html += '</div>';
    if (bestDeal) html += '<div style="font-size:11px;color:#198754;margin-top:8px;">Best Deal: ' + bestDeal + '</div>';
    if (worstDeal) html += '<div style="font-size:11px;color:#dc3545;">Worst: ' + worstDeal + '</div>';
    html += '</div>';
    el.innerHTML = html;
}

function copyBcaAddress(idx, btn) {
    var listing = rawListings[idx];
    if (!listing) return;
    var text = buildBcaSearchString(listing);
    navigator.clipboard.writeText(text).then(function() {
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#d4edda';
        btn.style.color = '#155724';
        btn.style.borderColor = '#155724';
        setTimeout(function() {
            btn.textContent = orig;
            btn.style.background = 'white';
            btn.style.color = 'var(--secondary)';
            btn.style.borderColor = 'var(--secondary)';
        }, 1500);
    });
}

function saveBcaEntry(idx) {
    var totalEl = document.getElementById('bcaTotal_' + idx);
    var total = totalEl ? parseFloat(totalEl.value) : 0;
    if (!total || total <= 0) { alert('Total Assessed value is required.'); return; }

    var entry = {
        assessedTotal: total,
        assessedLand: parseFloat((document.getElementById('bcaLand_' + idx) || {}).value) || null,
        assessedImprovement: parseFloat((document.getElementById('bcaImprov_' + idx) || {}).value) || null,
        pid: ((document.getElementById('bcaPid_' + idx) || {}).value || '').trim() || null,
        rollNumber: ((document.getElementById('bcaRoll_' + idx) || {}).value || '').trim() || null,
        jurisdiction: ((document.getElementById('bcaJuris_' + idx) || {}).value || '').trim() || null,
        propertyClass: '01',
        assessmentYear: 2026,
        enrichedDate: new Date().toISOString().split('T')[0],
        notes: ''
    };
    saveAssessment(idx, entry);
    renderBcaWorklist();
}

function editBcaEntry(idx) {
    var a = getAssessment(idx);
    if (!a) return;
    var listing = rawListings[idx];
    var html = '<div style="max-height:80vh;overflow:auto;">';
    html += '<h3 style="color:var(--primary);margin-bottom:4px;">Edit Assessment: ' + escapeHtml(listing.addr) + '</h3>';
    html += '<div style="color:#888;font-size:12px;margin-bottom:16px;">' + listing.neighborhood + ' &middot; ' + listing.type + ' &middot; ' + formatPrice(listing.price) + '</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    html += '<div class="offer-input-group"><label>Total Assessed *</label><input type="number" id="bcaEditTotal" value="' + (a.assessedTotal||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Land Value</label><input type="number" id="bcaEditLand" value="' + (a.assessedLand||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Improvement Value</label><input type="number" id="bcaEditImprov" value="' + (a.assessedImprovement||'') + '"></div>';
    html += '<div class="offer-input-group"><label>PID</label><input type="text" id="bcaEditPid" value="' + (a.pid||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Roll Number</label><input type="text" id="bcaEditRoll" value="' + (a.rollNumber||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Jurisdiction</label><select id="bcaEditJuris"><option value="">--</option><option value="219"' + (a.jurisdiction==='219'?' selected':'') + '>219 (Surrey)</option><option value="228"' + (a.jurisdiction==='228'?' selected':'') + '>228 (White Rock)</option><option value="other"' + (a.jurisdiction==='other'?' selected':'') + '>Other</option></select></div>';
    html += '<div class="offer-input-group"><label>Assessment Year</label><input type="number" id="bcaEditYear" value="' + (a.assessmentYear||2026) + '"></div>';
    html += '</div>';
    html += '<div class="offer-input-group" style="margin-top:12px;"><label>Notes</label><textarea id="bcaEditNotes" rows="2" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">' + (a.notes||'') + '</textarea></div>';
    html += '<div style="display:flex;gap:12px;margin-top:16px;">';
    html += '<button class="btn-primary" onclick="saveBcaEditEntry(' + idx + ')" style="padding:10px 24px;">Save</button>';
    html += '<button onclick="document.getElementById(\'genericModal\').classList.remove(\'active\')" style="padding:10px 24px;border:1px solid #ccc;border-radius:6px;background:white;cursor:pointer;">Cancel</button>';
    html += '</div></div>';
    showGenericModal(html);
}

function saveBcaEditEntry(idx) {
    var total = parseFloat(document.getElementById('bcaEditTotal').value);
    if (!total || total <= 0) { alert('Total Assessed value is required.'); return; }
    var entry = {
        assessedTotal: total,
        assessedLand: parseFloat(document.getElementById('bcaEditLand').value) || null,
        assessedImprovement: parseFloat(document.getElementById('bcaEditImprov').value) || null,
        pid: (document.getElementById('bcaEditPid').value || '').trim() || null,
        rollNumber: (document.getElementById('bcaEditRoll').value || '').trim() || null,
        jurisdiction: document.getElementById('bcaEditJuris').value || null,
        propertyClass: '01',
        assessmentYear: parseInt(document.getElementById('bcaEditYear').value) || 2026,
        enrichedDate: new Date().toISOString().split('T')[0],
        notes: (document.getElementById('bcaEditNotes').value || '').trim()
    };
    saveAssessment(idx, entry);
    document.getElementById('genericModal').classList.remove('active');
    renderBcaWorklist();
}

function clearBcaEntry(idx) {
    if (!confirm('Clear assessment data for this property?')) return;
    var data = loadBcAssessmentData();
    delete data[String(idx)];
    saveBcAssessmentData(data);
    renderBcaWorklist();
}

// CSV Export
function exportBcaCsv() {
    var data = loadBcAssessmentData();
    var rows = [['Index','Address','Neighborhood','Region','Price','Type','AssessedTotal','AssessedLand','AssessedImprovement','PID','RollNumber','Jurisdiction','AssessmentYear','Ratio']];
    rawListings.forEach(function(l, idx) {
        var a = data[String(idx)];
        var ratio = a && a.assessedTotal ? (l.price / a.assessedTotal).toFixed(3) : '';
        rows.push([
            idx, '"' + escapeHtml(l.addr) + '"', '"' + escapeHtml(l.neighborhood) + '"', '"' + (l.region||'') + '"',
            l.price, '"' + escapeHtml(l.type) + '"',
            a ? (a.assessedTotal||'') : '', a ? (a.assessedLand||'') : '', a ? (a.assessedImprovement||'') : '',
            a ? (a.pid||'') : '', a ? (a.rollNumber||'') : '', a ? (a.jurisdiction||'') : '',
            a ? (a.assessmentYear||'') : '', ratio
        ]);
    });
    var csv = rows.map(function(r) { return r.join(','); }).join('\n');
    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'bc-assessment-data.csv';
    a.click();
    URL.revokeObjectURL(url);
}

// CSV Import
function importBcaCsv(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        var lines = e.target.result.split('\n');
        if (lines.length < 2) { alert('CSV file is empty or invalid.'); return; }
        var header = parseCsvLine(lines[0]);
        var idxCol = header.indexOf('Index');
        var addrCol = header.indexOf('Address');
        var totalCol = findColumn(header, ['AssessedTotal', 'Total Assessed', 'TOTAL VALUE', 'ASSESSED VALUE', 'assessed_total']);
        var landCol = findColumn(header, ['AssessedLand', 'Land Value', 'LAND VALUE', 'assessed_land']);
        var improvCol = findColumn(header, ['AssessedImprovement', 'Improvement', 'IMPROVEMENT VALUE', 'assessed_improvement']);
        var pidCol = findColumn(header, ['PID', 'pid', 'Pid']);
        var rollCol = findColumn(header, ['RollNumber', 'Roll Number', 'ROLL NUMBER', 'roll_number']);
        var jurisCol = findColumn(header, ['Jurisdiction', 'JURISDICTION', 'jurisdiction']);
        var yearCol = findColumn(header, ['AssessmentYear', 'Assessment Year', 'ASSESSMENT YEAR']);

        if (totalCol < 0) { alert('Could not find an assessed value column. Expected "AssessedTotal" or similar.'); return; }

        var data = loadBcAssessmentData();
        var imported = 0;

        for (var i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            var cols = parseCsvLine(lines[i]);
            var assessedTotal = parseFloat(cols[totalCol]);
            if (!assessedTotal || assessedTotal <= 0) continue;

            var matchIdx = -1;
            // Try matching by Index
            if (idxCol >= 0 && cols[idxCol] !== undefined) {
                var tryIdx = parseInt(cols[idxCol]);
                if (tryIdx >= 0 && tryIdx < rawListings.length) matchIdx = tryIdx;
            }
            // Fuzzy address matching fallback
            if (matchIdx < 0 && addrCol >= 0 && cols[addrCol]) {
                matchIdx = fuzzyMatchAddress(cols[addrCol]);
            }
            if (matchIdx < 0) continue;

            data[String(matchIdx)] = {
                assessedTotal: assessedTotal,
                assessedLand: landCol >= 0 ? (parseFloat(cols[landCol]) || null) : null,
                assessedImprovement: improvCol >= 0 ? (parseFloat(cols[improvCol]) || null) : null,
                pid: pidCol >= 0 ? (cols[pidCol] || '').trim() || null : null,
                rollNumber: rollCol >= 0 ? (cols[rollCol] || '').trim() || null : null,
                jurisdiction: jurisCol >= 0 ? (cols[jurisCol] || '').trim() || null : null,
                propertyClass: '01',
                assessmentYear: yearCol >= 0 ? (parseInt(cols[yearCol]) || 2026) : 2026,
                enrichedDate: new Date().toISOString().split('T')[0],
                notes: ''
            };
            imported++;
        }

        saveBcAssessmentData(data);
        alert('Imported assessment data for ' + imported + ' properties.');
        renderBcaWorklist();
        event.target.value = '';
    };
    reader.readAsText(file);
}

function parseCsvLine(line) {
    var result = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var c = line[i];
        if (c === '"') { inQuotes = !inQuotes; }
        else if (c === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += c; }
    }
    result.push(current.trim());
    return result;
}

function findColumn(header, names) {
    for (var i = 0; i < names.length; i++) {
        var idx = header.findIndex(function(h) { return h.toLowerCase().replace(/[^a-z]/g,'') === names[i].toLowerCase().replace(/[^a-z]/g,''); });
        if (idx >= 0) return idx;
    }
    return -1;
}

function fuzzyMatchAddress(csvAddr) {
    var norm = normalizeAddress(csvAddr);
    for (var i = 0; i < rawListings.length; i++) {
        if (normalizeAddress(rawListings[i].addr) === norm) return i;
    }
    // Partial match: try without unit prefix
    var normStripped = norm.replace(/^[a-z]*\d+\s*/, '');
    for (var j = 0; j < rawListings.length; j++) {
        var listNorm = normalizeAddress(rawListings[j].addr).replace(/^[a-z]*\d+\s*/, '');
        if (listNorm === normStripped && normStripped.length > 5) return j;
    }
    return -1;
}

function normalizeAddress(addr) {
    return (addr || '').toLowerCase().trim()
        .replace(/\s+/g, ' ')
        .replace(/avenue/g, 'ave').replace(/street/g, 'st').replace(/drive/g, 'dr')
        .replace(/boulevard/g, 'blvd').replace(/crescent/g, 'cres').replace(/road/g, 'rd')
        .replace(/place/g, 'pl').replace(/court/g, 'ct').replace(/terrace/g, 'ter')
        .replace(/lane/g, 'ln').replace(/circle/g, 'cir').replace(/highway/g, 'hwy')
        .replace(/[.,#\-–]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ===================================================================
// PRIVATE OFFERS — TARGET PROPERTY MANAGER
// ===================================================================
function loadPrivateTargets() {
    return JSON.parse(localStorage.getItem('privateTargets') || '[]');
}
function savePrivateTargets(targets) {
    localStorage.setItem('privateTargets', JSON.stringify(targets));
}

var _privateTargetStatuses = ['New', 'Letter Sent', 'Response Received', 'Negotiating', 'Offer Submitted', 'Accepted', 'Declined', 'No Response'];
var _statusColors = { 'New': '#6c757d', 'Letter Sent': '#0d6efd', 'Response Received': '#198754', 'Negotiating': '#fd7e14', 'Offer Submitted': '#6610f2', 'Accepted': '#198754', 'Declined': '#dc3545', 'No Response': '#adb5bd' };

function renderPrivateTargets() {
    var targets = loadPrivateTargets();
    var container = document.getElementById('privateTargetsList');
    var emptyEl = document.getElementById('emptyPrivateTargets');
    if (!container) return;
    if (targets.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    var html = '<div style="display:grid;gap:12px;">';
    targets.forEach(function(t, i) {
        var pttResult = calculatePTTWithFTHB(t.estimatedValue || 0, false, false);
        var monthly = Math.round((t.estimatedValue || 0) * 0.8 * (0.055/12 * Math.pow(1+0.055/12,300)) / (Math.pow(1+0.055/12,300)-1));
        var daysSince = t.addedDate ? Math.floor((new Date() - new Date(t.addedDate)) / (1000*60*60*24)) : 0;
        var statusColor = _statusColors[t.status] || '#6c757d';
        html += '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:16px;border-left:4px solid ' + statusColor + ';">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;flex-wrap:wrap;gap:8px;">';
        html += '<div><div style="font-weight:700;color:var(--primary);font-size:14px;">' + (t.address || 'Unknown') + '</div>';
        html += '<div style="font-size:12px;color:#888;">' + (t.city || '') + (t.postalCode ? ' ' + t.postalCode : '') + ' &middot; ' + (t.propertyType || 'Unknown') + (t.yearBuilt ? ' &middot; Built ' + t.yearBuilt : '') + '</div></div>';
        html += '<span style="background:' + statusColor + ';color:white;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;">' + t.status + '</span>';
        html += '</div>';
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:#555;margin-bottom:10px;">';
        html += '<span><strong>Est. Value:</strong> ' + formatPrice(t.estimatedValue || 0) + '</span>';
        html += '<span><strong>Est. PTT:</strong> ' + formatPrice(pttResult.ptt) + '</span>';
        html += '<span><strong>Est. Monthly:</strong> ' + formatPrice(monthly) + '/mo @ 20% down</span>';
        if (daysSince > 0) html += '<span><strong>Added:</strong> ' + daysSince + ' days ago</span>';
        html += '</div>';
        if (t.notes) html += '<div style="font-size:12px;color:#666;margin-bottom:10px;font-style:italic;">' + t.notes + '</div>';
        // 8C: Status timeline
        if (t.statusHistory && t.statusHistory.length > 0) {
            html += '<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-bottom:10px;font-size:10px;">';
            t.statusHistory.forEach(function(h) {
                var hColor = _statusColors[h.status] || '#6c757d';
                var hDate = h.date ? new Date(h.date).toLocaleDateString() : '';
                html += '<span style="padding:2px 6px;border-radius:8px;background:' + hColor + '22;color:' + hColor + ';border:1px solid ' + hColor + '44;" title="' + hDate + '">' + h.status + '</span><span style="color:#ccc;">&rarr;</span>';
            });
            html += '<span style="padding:2px 6px;border-radius:8px;background:' + statusColor + ';color:white;font-weight:600;">' + t.status + '</span>';
            html += '</div>';
        }
        // 8D: Duplicate detection
        var dupeMatch = checkPrivateTargetDuplicate(t.address);
        if (dupeMatch) {
            html += '<div style="background:#e7f3ff;border:1px solid #b8daff;border-radius:4px;padding:6px 10px;font-size:11px;color:#004085;margin-bottom:10px;">';
            html += '<strong>Match found in listings:</strong> ' + dupeMatch.addr + ' — ' + formatPrice(dupeMatch.price) + ' (' + dupeMatch.dom + ' DOM)';
            html += ' <button onclick="showDetailModal(' + dupeMatch.listingIndex + ')" style="padding:2px 8px;font-size:10px;border:1px solid var(--primary);color:var(--primary);border-radius:4px;background:white;cursor:pointer;margin-left:6px;">View</button>';
            html += '</div>';
        }
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
        html += '<button onclick="editPrivateTarget(' + i + ')" style="padding:4px 12px;font-size:11px;border:1px solid #ccc;border-radius:4px;background:white;cursor:pointer;">Edit</button>';
        html += '<button onclick="showLetterGenerator(' + i + ')" style="padding:4px 12px;font-size:11px;border:1px solid var(--secondary);color:var(--secondary);border-radius:4px;background:white;cursor:pointer;">Draft Letter</button>';
        html += '<button onclick="showPrivateOfferForm(' + i + ')" style="padding:4px 12px;font-size:11px;border:1px solid var(--primary);color:var(--primary);border-radius:4px;background:white;cursor:pointer;">Draft Offer</button>';
        html += '<select onchange="updateTargetStatus(' + i + ', this.value)" style="padding:4px 8px;font-size:11px;border:1px solid #ccc;border-radius:4px;">';
        _privateTargetStatuses.forEach(function(s) {
            html += '<option value="' + s + '"' + (t.status === s ? ' selected' : '') + '>' + s + '</option>';
        });
        html += '</select>';
        html += '<button onclick="deletePrivateTarget(' + i + ')" style="padding:4px 12px;font-size:11px;border:1px solid #dc3545;color:#dc3545;border-radius:4px;background:white;cursor:pointer;">Delete</button>';
        html += '</div></div>';
    });
    html += '</div>';
    container.innerHTML = html;
    renderCampaignStats();
    renderFollowupReminders();
}

function addPrivateTarget() {
    showPrivateTargetForm(-1);
}
function editPrivateTarget(index) {
    showPrivateTargetForm(index);
}

function showPrivateTargetForm(index) {
    var targets = loadPrivateTargets();
    var t = index >= 0 ? targets[index] : {};
    var isEdit = index >= 0;
    var html = '<div style="max-height:80vh;overflow:auto;">';
    html += '<h3 style="color:var(--primary);margin-bottom:16px;">' + (isEdit ? 'Edit' : 'Add') + ' Target Property</h3>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    html += '<div class="offer-input-group"><label>Property Address *</label><input type="text" id="ptAddr" value="' + (t.address||'') + '"></div>';
    html += '<div class="offer-input-group"><label>City/Area *</label><input type="text" id="ptCity" value="' + (t.city||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Postal Code</label><input type="text" id="ptPostal" value="' + (t.postalCode||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Property Type *</label><select id="ptType">';
    ['House','Townhouse','Apt/Condo','Duplex','Land/Lot','Mfd Home'].forEach(function(pt) {
        html += '<option' + (t.propertyType===pt?' selected':'') + '>' + pt + '</option>';
    });
    html += '</select></div>';
    html += '<div class="offer-input-group"><label>Estimated Value *</label><input type="number" id="ptValue" value="' + (t.estimatedValue||'') + '"></div>';
    // Auto-populate from BC Assessment enrichment data if available
    var _ptAssessVal = t.assessmentValue || '';
    var _ptPidVal = t.pid || '';
    if (t.address) {
        var _ptMatch = fuzzyMatchAddress(t.address);
        if (_ptMatch >= 0) {
            var _ptBca = getAssessment(_ptMatch);
            if (_ptBca) {
                if (!_ptAssessVal && _ptBca.assessedTotal) _ptAssessVal = _ptBca.assessedTotal;
                if (!_ptPidVal && _ptBca.pid) _ptPidVal = _ptBca.pid;
            }
        }
    }
    html += '<div class="offer-input-group"><label>BC Assessment Value</label><input type="number" id="ptAssessment" value="' + _ptAssessVal + '"></div>';
    html += '<div class="offer-input-group"><label>Lot Size</label><input type="text" id="ptLot" value="' + (t.lotSize||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Year Built</label><input type="number" id="ptYear" value="' + (t.yearBuilt||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Bedrooms</label><input type="number" id="ptBeds" value="' + (t.beds||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Bathrooms</label><input type="number" id="ptBaths" value="' + (t.baths||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Square Footage</label><input type="number" id="ptSqft" value="' + (t.sqft||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Owner Name(s)</label><input type="text" id="ptOwner" value="' + (t.ownerName||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Owner Contact</label><input type="text" id="ptOwnerContact" value="' + (t.ownerContact||'') + '"></div>';
    html += '<div class="offer-input-group"><label>PID (Parcel ID)</label><input type="text" id="ptPID" value="' + _ptPidVal + '"></div>';
    html += '<div class="offer-input-group"><label>Zoning</label><input type="text" id="ptZoning" value="' + (t.zoning||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Status *</label><select id="ptStatus">';
    _privateTargetStatuses.forEach(function(s) {
        html += '<option' + (t.status===s?' selected':'') + '>' + s + '</option>';
    });
    html += '</select></div>';
    html += '</div>';
    html += '<div class="offer-input-group" style="margin-top:12px;"><label>Why This Property</label><textarea id="ptNotes" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">' + (t.notes||'') + '</textarea></div>';
    html += '<div style="display:flex;gap:12px;margin-top:16px;">';
    html += '<button class="btn-primary" onclick="savePrivateTargetForm(' + index + ')" style="padding:10px 24px;">Save</button>';
    html += '<button onclick="document.getElementById(\'genericModal\').classList.remove(\'active\')" style="padding:10px 24px;border:1px solid #ccc;border-radius:6px;background:white;cursor:pointer;">Cancel</button>';
    html += '</div></div>';
    showGenericModal(html);
}

function savePrivateTargetForm(index) {
    var addr = document.getElementById('ptAddr').value.trim();
    var city = document.getElementById('ptCity').value.trim();
    var value = parseFloat(document.getElementById('ptValue').value);
    if (!addr || !city || !value) { alert('Please fill in Address, City, and Estimated Value.'); return; }
    var targets = loadPrivateTargets();
    var t = index >= 0 ? targets[index] : { addedDate: new Date().toISOString() };
    t.address = addr;
    t.city = city;
    t.postalCode = document.getElementById('ptPostal').value.trim();
    t.propertyType = document.getElementById('ptType').value;
    t.estimatedValue = value;
    t.assessmentValue = parseFloat(document.getElementById('ptAssessment').value) || null;
    t.lotSize = document.getElementById('ptLot').value.trim();
    t.yearBuilt = parseInt(document.getElementById('ptYear').value) || null;
    t.beds = parseInt(document.getElementById('ptBeds').value) || null;
    t.baths = parseInt(document.getElementById('ptBaths').value) || null;
    t.sqft = parseInt(document.getElementById('ptSqft').value) || null;
    t.ownerName = document.getElementById('ptOwner').value.trim();
    t.ownerContact = document.getElementById('ptOwnerContact').value.trim();
    t.pid = document.getElementById('ptPID').value.trim();
    t.zoning = document.getElementById('ptZoning').value.trim();
    t.status = document.getElementById('ptStatus').value;
    t.notes = document.getElementById('ptNotes').value.trim();
    if (index >= 0) targets[index] = t; else targets.push(t);
    savePrivateTargets(targets);
    document.getElementById('genericModal').classList.remove('active');
    renderPrivateTargets();
}

function deletePrivateTarget(index) {
    if (!confirm('Delete this target property?')) return;
    var targets = loadPrivateTargets();
    targets.splice(index, 1);
    savePrivateTargets(targets);
    renderPrivateTargets();
}

function updateTargetStatus(index, status) {
    var targets = loadPrivateTargets();
    // 8C: Track status history
    if (!targets[index].statusHistory) targets[index].statusHistory = [];
    targets[index].statusHistory.push({ status: targets[index].status, date: targets[index].statusDate || targets[index].addedDate || new Date().toISOString() });
    targets[index].status = status;
    targets[index].statusDate = new Date().toISOString();
    savePrivateTargets(targets);
    renderPrivateTargets();
    renderCampaignStats();
    renderFollowupReminders();
}

function getPrivateTargetStats() {
    var targets = loadPrivateTargets();
    var lettersSent = targets.filter(function(t) { return ['Letter Sent','Response Received','Negotiating','Offer Submitted','Accepted','Declined','No Response'].indexOf(t.status) >= 0; }).length;
    var offersOut = targets.filter(function(t) { return ['Offer Submitted','Accepted'].indexOf(t.status) >= 0; }).length;
    return { total: targets.length, lettersSent: lettersSent, offersOut: offersOut };
}

// 8B: Campaign Statistics Bar
function renderCampaignStats() {
    var targets = loadPrivateTargets();
    var el = document.getElementById('privateCampaignStats');
    if (!el || targets.length === 0) { if (el) el.style.display = 'none'; return; }
    el.style.display = 'grid';
    var counts = {};
    _privateTargetStatuses.forEach(function(s) { counts[s] = 0; });
    targets.forEach(function(t) { counts[t.status] = (counts[t.status] || 0) + 1; });
    var totalValue = targets.reduce(function(s,t) { return s + (t.estimatedValue||0); }, 0);
    var responseRate = targets.length > 0 ? (targets.filter(function(t) { return ['Response Received','Negotiating','Offer Submitted','Accepted','Declined'].indexOf(t.status) >= 0; }).length / targets.length * 100) : 0;

    el.innerHTML =
        '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;color:var(--primary);">' + targets.length + '</div><div style="font-size:11px;color:#888;">Total Targets</div></div>' +
        '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#0d6efd;">' + (counts['Letter Sent']||0) + '</div><div style="font-size:11px;color:#888;">Letters Sent</div></div>' +
        '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#fd7e14;">' + (counts['Negotiating']||0) + '</div><div style="font-size:11px;color:#888;">Negotiating</div></div>' +
        '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;color:#198754;">' + responseRate.toFixed(0) + '%</div><div style="font-size:11px;color:#888;">Response Rate</div></div>' +
        '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:12px;text-align:center;"><div style="font-size:22px;font-weight:700;color:var(--accent);">' + formatPrice(totalValue) + '</div><div style="font-size:11px;color:#888;">Pipeline Value</div></div>';
}

// 8A: Follow-up Reminders
function renderFollowupReminders() {
    var targets = loadPrivateTargets();
    var banner = document.getElementById('privateFollowupBanner');
    if (!banner) return;
    var now = new Date();
    var needFollowup = [];
    targets.forEach(function(t, i) {
        if (t.status === 'Letter Sent' || t.status === 'No Response') {
            var lastDate = new Date(t.statusDate || t.addedDate || now);
            var daysSince = Math.floor((now - lastDate) / (1000*60*60*24));
            if (daysSince >= 7) needFollowup.push({ target: t, index: i, days: daysSince });
        }
    });
    if (needFollowup.length === 0) { banner.style.display = 'none'; return; }
    banner.style.display = 'block';
    banner.innerHTML = '<strong style="font-size:13px;">Follow-up Reminders (' + needFollowup.length + ')</strong>' +
        needFollowup.map(function(f) {
            return '<div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">' +
                '<span>' + f.target.address + ' — <strong>' + f.days + ' days</strong> since last update (' + f.target.status + ')</span>' +
                '<button onclick="editPrivateTarget(' + f.index + ')" style="padding:3px 10px;font-size:10px;border:1px solid #856404;color:#856404;border-radius:4px;background:transparent;cursor:pointer;">Follow Up</button></div>';
        }).join('');
}

// 8D: Duplicate Detection
function checkPrivateTargetDuplicate(address) {
    if (!address) return null;
    var normalized = address.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (var i = 0; i < rawListings.length; i++) {
        if (rawListings[i].addr.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) {
            var match = rawListings[i];
            match.listingIndex = i;
            return match;
        }
    }
    return null;
}

// ===================================================================
// PRIVATE OFFERS — LETTER OF INTENT GENERATOR
// ===================================================================
function showLetterGenerator(index) {
    var targets = loadPrivateTargets();
    var t = targets[index];
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var html = '<div style="max-height:80vh;overflow:auto;">';
    html += '<h3 style="color:var(--primary);margin-bottom:4px;">Letter of Intent — ' + t.address + '</h3>';
    html += '<p style="font-size:12px;color:#888;margin-bottom:16px;">Generate a professional expression of interest to gauge the owner\'s willingness to sell.</p>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    html += '<div class="offer-input-group"><label>Your Name</label><input type="text" id="loiName" value="' + (profile.name || '') + '"></div>';
    html += '<div class="offer-input-group"><label>Your Email</label><input type="text" id="loiEmail" value="' + (profile.email || '') + '"></div>';
    html += '<div class="offer-input-group"><label>Your Phone</label><input type="text" id="loiPhone" value="' + (profile.phone || '') + '"></div>';
    html += '<div class="offer-input-group"><label>Offer Price Range</label>';
    html += '<div style="display:flex;gap:6px;align-items:center;"><input type="number" id="loiPriceLow" placeholder="Low" value="' + Math.round((t.estimatedValue||0)*0.85) + '" style="width:45%;">';
    html += '<span>to</span><input type="number" id="loiPriceHigh" placeholder="High" value="' + Math.round((t.estimatedValue||0)*0.95) + '" style="width:45%;"></div></div>';
    html += '</div>';
    html += '<div class="offer-input-group" style="margin-top:12px;"><label>Reason for Interest</label>';
    html += '<div style="display:flex;flex-wrap:wrap;gap:8px;">';
    ['I love the neighborhood','Looking for a family home','Investment opportunity','Ideal for renovation/development'].forEach(function(r) {
        html += '<label style="font-size:12px;"><input type="checkbox" class="loi-reason" value="' + r + '"> ' + r + '</label>';
    });
    html += '</div></div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">';
    html += '<div class="offer-input-group"><label>Preferred Timeline</label><select id="loiTimeline"><option>Flexible</option><option>Within 30 days</option><option>Within 90 days</option><option>Within 6 months</option></select></div>';
    html += '<div class="offer-input-group"><label>Financing</label><select id="loiFinancing"><option>Pre-approved mortgage</option><option>Cash offer</option><option>Subject to financing</option></select></div>';
    html += '</div>';
    html += '<div class="offer-input-group" style="margin-top:12px;"><label>Personal Message (optional)</label><textarea id="loiMessage" rows="3" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;" placeholder="Brief paragraph about yourself and why you\'re interested..."></textarea></div>';
    html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">';
    html += '<button class="btn-primary" onclick="generateLetterVariants(' + index + ')" style="padding:10px 20px;">Generate Letters</button>';
    html += '<button onclick="document.getElementById(\'genericModal\').classList.remove(\'active\')" style="padding:10px 20px;border:1px solid #ccc;border-radius:6px;background:white;cursor:pointer;">Cancel</button>';
    html += '</div></div>';
    showGenericModal(html);
}

function generateLetterVariants(index) {
    var targets = loadPrivateTargets();
    var t = targets[index];
    var name = document.getElementById('loiName').value.trim() || 'Buyer';
    var email = document.getElementById('loiEmail').value.trim();
    var phone = document.getElementById('loiPhone').value.trim();
    var priceLow = parseInt(document.getElementById('loiPriceLow').value) || 0;
    var priceHigh = parseInt(document.getElementById('loiPriceHigh').value) || 0;
    var reasons = [];
    document.querySelectorAll('.loi-reason:checked').forEach(function(cb) { reasons.push(cb.value); });
    var timeline = document.getElementById('loiTimeline').value;
    var financing = document.getElementById('loiFinancing').value;
    var message = document.getElementById('loiMessage').value.trim();
    var dateStr = new Date().toLocaleDateString('en-US', { year:'numeric', month:'long', day:'numeric' });
    var priceRange = priceLow && priceHigh ? formatPrice(priceLow) + ' – ' + formatPrice(priceHigh) : 'open to discussion';
    var contactLine = name + (email ? ' | ' + email : '') + (phone ? ' | ' + phone : '');

    var warmLetter = dateStr + '\n\nDear ' + (t.ownerName || 'Homeowner') + ',\n\n';
    warmLetter += 'My name is ' + name + ' and I\'m writing because I have a genuine interest in your property at ' + t.address + ', ' + t.city + '.\n\n';
    if (message) warmLetter += message + '\n\n';
    else if (reasons.length > 0) warmLetter += 'I\'m interested because: ' + reasons.join(', ').toLowerCase() + '.\n\n';
    warmLetter += 'I understand your home may not be on the market, and I completely respect that. However, if you\'d ever consider selling, I would be very interested in discussing a purchase in the range of ' + priceRange + '.\n\n';
    warmLetter += 'I have ' + financing.toLowerCase() + ' and my preferred timeline is ' + timeline.toLowerCase() + '. This is a non-binding expression of interest — simply an invitation to start a conversation if the timing is right for you.\n\n';
    warmLetter += 'Please feel free to reach out at your convenience.\n\nSincerely,\n' + contactLine;

    var proLetter = dateStr + '\n\nRe: Expression of Interest — ' + t.address + ', ' + t.city + '\n\n';
    proLetter += 'Dear ' + (t.ownerName || 'Property Owner') + ',\n\n';
    proLetter += 'I am writing to express my interest in acquiring the property at ' + t.address + '. I am a qualified buyer with ' + financing.toLowerCase() + ' and I am prepared to move forward on a timeline of ' + timeline.toLowerCase() + '.\n\n';
    proLetter += 'Based on my analysis of comparable properties and current market conditions, I am considering an offer in the range of ' + priceRange + '. This reflects fair market value while accounting for the significant savings in agent commissions that a private sale offers you (typically 4-7% of sale price).\n\n';
    proLetter += 'This letter is a non-binding expression of interest. I would welcome the opportunity to discuss terms at your convenience.\n\n';
    proLetter += 'Regards,\n' + contactLine;

    var oppLetter = dateStr + '\n\nDear ' + (t.ownerName || 'Homeowner') + ',\n\n';
    oppLetter += 'I\'m ' + name + ', and I\'d like to present you with an opportunity regarding your property at ' + t.address + ', ' + t.city + '.\n\n';
    oppLetter += 'Selling privately means no showings, no staging, no open houses, and no agent commissions — saving you potentially ' + formatPrice(Math.round((t.estimatedValue||0)*0.05)) + ' or more. I\'m a serious buyer with ' + financing.toLowerCase() + ', ready to close on your timeline.\n\n';
    oppLetter += 'I\'m considering a price in the range of ' + priceRange + ', and I\'m flexible on timing (' + timeline.toLowerCase() + '). My lawyer would handle all paperwork through proper legal channels.\n\n';
    oppLetter += 'This is simply an expression of interest — no obligation whatsoever. If you\'d like to explore this, please don\'t hesitate to reach out.\n\n';
    oppLetter += 'Best regards,\n' + contactLine;

    var variants = [
        { name: 'Warm & Personal', text: warmLetter, desc: 'Best for owner-occupied homes' },
        { name: 'Professional & Direct', text: proLetter, desc: 'Best for investment properties or corporate owners' },
        { name: 'Opportunity Focused', text: oppLetter, desc: 'Best for older owners or distressed properties' }
    ];

    var html = '<div style="max-height:80vh;overflow:auto;">';
    html += '<h3 style="color:var(--primary);margin-bottom:16px;">Letter Variants for ' + t.address + '</h3>';
    variants.forEach(function(v, vi) {
        html += '<div style="margin-bottom:20px;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">';
        html += '<div style="background:var(--light-gray);padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">';
        html += '<div><strong>' + v.name + '</strong><span style="font-size:11px;color:#888;margin-left:8px;">' + v.desc + '</span></div>';
        html += '<div style="display:flex;gap:6px;">';
        html += '<button onclick="copyLetterToClipboard(' + vi + ')" style="padding:4px 10px;font-size:11px;border:1px solid var(--secondary);color:var(--secondary);border-radius:4px;background:white;cursor:pointer;">Copy</button>';
        if (t.ownerContact && t.ownerContact.includes('@')) {
            html += '<button onclick="emailLetter(' + index + ',' + vi + ')" style="padding:4px 10px;font-size:11px;border:1px solid var(--primary);color:var(--primary);border-radius:4px;background:white;cursor:pointer;">Email</button>';
        }
        html += '</div></div>';
        html += '<pre id="letterVariant' + vi + '" style="padding:14px;font-size:12px;line-height:1.6;white-space:pre-wrap;word-wrap:break-word;margin:0;max-height:200px;overflow:auto;">' + v.text + '</pre>';
        html += '</div>';
    });
    html += '<button onclick="markLetterSent(' + index + ')" class="btn-primary" style="padding:10px 24px;margin-top:8px;">Mark as Letter Sent</button>';
    html += '</div>';
    showGenericModal(html);
    window._letterVariants = variants;
}

function copyLetterToClipboard(variantIndex) {
    var text = window._letterVariants[variantIndex].text;
    navigator.clipboard.writeText(text).then(function() { alert('Letter copied to clipboard!'); });
}

function emailLetter(targetIndex, variantIndex) {
    var targets = loadPrivateTargets();
    var t = targets[targetIndex];
    var text = window._letterVariants[variantIndex].text;
    var subject = encodeURIComponent('Expression of Interest — ' + t.address);
    var body = encodeURIComponent(text);
    window.open('mailto:' + (t.ownerContact || '') + '?subject=' + subject + '&body=' + body, '_self');
}

function markLetterSent(index) {
    updateTargetStatus(index, 'Letter Sent');
    document.getElementById('genericModal').classList.remove('active');
    renderPrivateTargets();
}

// ===================================================================
// PRIVATE OFFERS — PRIVATE SALE OFFER GENERATOR
// ===================================================================
function showPrivateOfferForm(index) {
    var targets = loadPrivateTargets();
    var t = targets[index];
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var today = new Date();
    var completionDate = new Date(today); completionDate.setDate(completionDate.getDate() + 60);
    var subjectDate = new Date(today); subjectDate.setDate(subjectDate.getDate() + 14);
    var irrevocDate = new Date(today); irrevocDate.setDate(irrevocDate.getDate() + 3);
    var fmtDate = function(d) { return d.toISOString().split('T')[0]; };
    var suggestLow = Math.round((t.estimatedValue||0) * 0.88);
    var suggestHigh = Math.round((t.estimatedValue||0) * 0.95);
    var refNum = 'PS-' + today.getFullYear() + '-' + String(loadPrivateTargets().filter(function(x){return x.status==='Offer Submitted'||x.status==='Accepted';}).length + 1).padStart(3, '0');
    var isStrata = t.propertyType === 'Apt/Condo' || t.propertyType === 'Townhouse';

    var html = '<div style="max-height:85vh;overflow:auto;">';
    html += '<h3 style="color:var(--primary);margin-bottom:4px;">Private Sale Offer — ' + t.address + '</h3>';
    html += '<p style="font-size:12px;color:#888;margin-bottom:12px;">Ref: ' + refNum + ' &middot; Suggested range: ' + formatPrice(suggestLow) + ' – ' + formatPrice(suggestHigh) + '</p>';

    html += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:#856404;">';
    html += '<strong>Disclaimer:</strong> This offer template is for discussion purposes only. Both parties should have it reviewed by a BC lawyer or notary before signing. This is not a substitute for the standard BCREA Contract of Purchase and Sale.</div>';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">';
    html += '<div class="offer-input-group"><label>Offer Price *</label><input type="number" id="poPrice" value="' + Math.round((t.estimatedValue||0)*0.90) + '"></div>';
    html += '<div class="offer-input-group"><label>Deposit Amount</label><input type="number" id="poDeposit" value="' + Math.round((t.estimatedValue||0)*0.90*0.05) + '"></div>';
    html += '<div class="offer-input-group"><label>Deposit Held By</label><input type="text" id="poTrustee" value="Buyer\'s lawyer/notary in trust"></div>';
    html += '<div class="offer-input-group"><label>Completion Date</label><input type="date" id="poCompletion" value="' + fmtDate(completionDate) + '"></div>';
    html += '<div class="offer-input-group"><label>Subject Removal Date</label><input type="date" id="poSubject" value="' + fmtDate(subjectDate) + '"></div>';
    html += '<div class="offer-input-group"><label>Irrevocable Until</label><input type="date" id="poIrrevoc" value="' + fmtDate(irrevocDate) + '"></div>';
    html += '<div class="offer-input-group"><label>Your Name</label><input type="text" id="poName" value="' + (profile.name||'') + '"></div>';
    html += '<div class="offer-input-group"><label>Your Email</label><input type="text" id="poEmail" value="' + (profile.email||'') + '"></div>';
    html += '</div>';

    html += '<div style="margin-top:12px;"><h4 style="margin-bottom:8px;">Subject Conditions</h4><div class="subject-checks">';
    html += '<label><input type="checkbox" class="po-subject" value="Subject to satisfactory home inspection by a qualified inspector at Buyer\'s expense, to be completed within the subject removal period." checked> Home Inspection</label>';
    html += '<label><input type="checkbox" class="po-subject" value="Subject to Buyer obtaining satisfactory financing within the subject removal period." checked> Financing</label>';
    html += '<label><input type="checkbox" class="po-subject" value="Subject to Buyer\'s lawyer or notary reviewing title, survey, and property disclosure statement within the subject removal period." checked> Lawyer/Notary Review (Title, Survey &amp; Disclosure)</label>';
    html += '<label><input type="checkbox" class="po-subject" value="Subject to Seller providing a completed Property Disclosure Statement within 5 business days of acceptance." checked> Seller to Provide Property Disclosure</label>';
    if (isStrata) {
        html += '<label><input type="checkbox" class="po-subject" value="Subject to Buyer reviewing and approving strata documents (Form B, meeting minutes, depreciation report, bylaws, financial statements, and insurance certificate) within the subject removal period." checked> Strata Documents Review</label>';
    }
    html += '<label><input type="checkbox" class="po-subject" value="Subject to Buyer reviewing BC Assessment records and property tax history." checked> BC Assessment &amp; Tax Review</label>';
    html += '</div></div>';

    html += '<div class="offer-input-group" style="margin-top:12px;"><label>Additional Conditions</label><textarea id="poCustom" rows="2" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:13px;"></textarea></div>';

    html += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">';
    html += '<button class="btn-primary" onclick="generatePrivateOfferPDF(' + index + ')" style="padding:10px 20px;">Generate PDF Offer</button>';
    if (t.ownerContact && t.ownerContact.includes('@')) {
        html += '<button onclick="emailPrivateOffer(' + index + ')" style="padding:10px 20px;border:1px solid var(--secondary);color:var(--secondary);border-radius:6px;background:white;cursor:pointer;">Email to Owner</button>';
    }
    html += '<button onclick="document.getElementById(\'genericModal\').classList.remove(\'active\')" style="padding:10px 20px;border:1px solid #ccc;border-radius:6px;background:white;cursor:pointer;">Cancel</button>';
    html += '</div></div>';
    showGenericModal(html);
}

function generatePrivateOfferPDF(index) {
    if (!window.jspdf) {
        loadJsPdf().then(function() { generatePrivateOfferPDF(index); });
        return;
    }
    var targets = loadPrivateTargets();
    var t = targets[index];
    var price = parseFloat(document.getElementById('poPrice').value) || 0;
    var deposit = parseFloat(document.getElementById('poDeposit').value) || 0;
    var trustee = document.getElementById('poTrustee').value;
    var completionDate = document.getElementById('poCompletion').value;
    var subjectDate = document.getElementById('poSubject').value;
    var irrevocDate = document.getElementById('poIrrevoc').value;
    var buyerName = document.getElementById('poName').value;
    var buyerEmail = document.getElementById('poEmail').value;
    var subjects = [];
    document.querySelectorAll('.po-subject:checked').forEach(function(cb) { subjects.push(cb.value); });
    var custom = document.getElementById('poCustom').value.trim();
    if (custom) custom.split('\n').forEach(function(c) { if (c.trim()) subjects.push(c.trim()); });

    var { jsPDF } = window.jspdf;
    var doc = new jsPDF({ unit: 'mm', format: 'letter' });
    var pageW = doc.internal.pageSize.getWidth();
    var margin = 18;
    var contentW = pageW - margin * 2;
    var y = margin;
    var fmtDt = function(d) { if (!d) return 'TBD'; var parts = d.split('-'); return parts[1]+'/'+parts[2]+'/'+parts[0]; };
    var fmtCur = function(n) { return '$' + Math.round(n).toLocaleString(); }; // Private offers use generic $ since jurisdiction may not be known
    var today = new Date();
    var refNum = 'PS-' + today.getFullYear() + '-' + String(loadPrivateTargets().filter(function(x){return x.status==='Offer Submitted'||x.status==='Accepted';}).length + 1).padStart(3, '0');

    // Header
    doc.setFillColor(27, 58, 92);
    doc.rect(0, 0, pageW, 20, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('OFFER TO PURCHASE — PRIVATE SALE', margin, 13);
    doc.setFontSize(9);
    doc.text('Ref: ' + refNum, pageW - margin - 40, 13);
    y = 28;

    // Disclaimer
    doc.setFillColor(255, 245, 235);
    doc.setDrawColor(220, 120, 50);
    doc.rect(margin, y-2, contentW, 16, 'FD');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 80, 20);
    doc.text('IMPORTANT DISCLAIMER', margin+3, y+3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(120, 60, 10);
    var disclaimerText = 'This offer template is for discussion purposes only. Both parties are strongly advised to have this reviewed and formalized by a BC lawyer or notary before signing. This is not a substitute for the standard BCREA Contract of Purchase and Sale.';
    var dLines = doc.splitTextToSize(disclaimerText, contentW-6);
    doc.text(dLines, margin+3, y+7);
    y += 20;

    // Property & Parties table
    doc.setTextColor(0,0,0);
    doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Field', 'Details']],
        headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
        body: [
            ['Property Address', t.address + ', ' + t.city + (t.postalCode ? ', ' + t.postalCode : '') + (t.provinceState ? ', ' + t.provinceState : '')],
            ['Property Type', t.propertyType || 'N/A'],
            ['PID', t.pid || 'To be confirmed via title search'],
            ['Buyer', buyerName + (buyerEmail ? ' (' + buyerEmail + ')' : '')],
            ['Seller / Owner', t.ownerName || 'Current registered owner(s)'],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Financial Terms
    doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Term', 'Details']],
        headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
        body: [
            ['Offer Price', fmtCur(price)],
            ['Deposit', fmtCur(deposit) + ', held in trust by ' + trustee],
            ['Deposit Delivery', 'Within 24 hours of subject removal'],
            ['Balance', fmtCur(price - deposit) + ' due on Completion Date'],
            ['Transfer Tax (est.)', fmtCur(calculateTransferTax(price, 'CA-BC', false, false, false).ptt) + ' (buyer responsibility, varies by jurisdiction)'],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Key Dates
    doc.autoTable({
        startY: y, margin: { left: margin, right: margin },
        head: [['Date', 'Details']],
        headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
        body: [
            ['Subject Removal', fmtDt(subjectDate) + ' at 11:59 PM Pacific Time'],
            ['Completion Date', fmtDt(completionDate) + ' (title transfer at Land Title Office)'],
            ['Possession Date', fmtDt(completionDate) + ' (vacant possession)'],
            ['Adjustment Date', fmtDt(completionDate) + ' (taxes, utilities, strata fees adjusted)'],
            ['Irrevocable Until', fmtDt(irrevocDate) + ' at 11:59 PM Pacific Time'],
        ],
        styles: { fontSize: 9, cellPadding: 2.5 },
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 } },
    });
    y = doc.lastAutoTable.finalY + 6;

    // Subject Conditions
    if (subjects.length > 0) {
        doc.setFillColor(27, 58, 92);
        doc.rect(margin, y, contentW, 7, 'F');
        doc.setTextColor(255,255,255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('SUBJECT CONDITIONS', margin+3, y+5);
        y += 10;
        doc.setTextColor(0,0,0);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        subjects.forEach(function(s, i) {
            if (y > 250) { doc.addPage(); y = margin; }
            var lines = doc.splitTextToSize((i+1) + '. ' + s, contentW - 4);
            doc.text(lines, margin+2, y);
            y += lines.length * 4 + 2;
        });
        y += 4;
    }

    // Rescission / Cooling-Off Notice (jurisdiction-aware)
    if (y > 230) { doc.addPage(); y = margin; }
    if (jurConfig.hasRescission) {
        doc.setFillColor(255, 243, 205);
        doc.rect(margin, y, contentW, 12, 'F');
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(133, 100, 4);
        var rescTitle = jurConfig.offerTemplateType === 'bc' ? 'HOME BUYER RESCISSION PERIOD NOTICE' : 'COOLING-OFF PERIOD NOTICE';
        doc.text(rescTitle, margin+3, y+4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(jurConfig.rescissionNotes, margin+3, y+9);
        y += 16;
    }

    // Recommendation
    var legalTitle = jurConfig.country === 'US' ? 'attorney' : 'lawyer or notary';
    doc.setFontSize(8);
    doc.setTextColor(80,80,80);
    doc.text('Both parties are strongly encouraged to retain independent legal counsel (' + legalTitle + ') before executing this agreement.', margin, y);
    y += 8;

    // Signature lines
    doc.setDrawColor(0);
    doc.setTextColor(0,0,0);
    doc.setFontSize(9);
    doc.text('Buyer Signature: ____________________________  Date: ______________', margin, y);
    y += 8;
    doc.text('Seller Signature: ____________________________  Date: ______________', margin, y);
    y += 10;

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(150,150,150);
    doc.text('Generated by BC Real Estate Dashboard — Not legal advice', margin, doc.internal.pageSize.getHeight() - 8);

    var filename = 'Private_Offer_' + t.address.replace(/[^a-zA-Z0-9]/g, '_') + '.pdf';
    doc.save(filename);

    // Update status
    updateTargetStatus(index, 'Offer Submitted');
    document.getElementById('genericModal').classList.remove('active');
    renderPrivateTargets();
}

function emailPrivateOffer(index) {
    var targets = loadPrivateTargets();
    var t = targets[index];
    var price = document.getElementById('poPrice').value;
    var subject = encodeURIComponent('Offer to Purchase — ' + t.address);
    var body = encodeURIComponent('Dear ' + (t.ownerName || 'Homeowner') + ',\n\nPlease find attached my offer to purchase your property at ' + t.address + ' for ' + formatPrice(parseInt(price)) + '.\n\nPlease review the attached PDF and let me know if you would like to discuss.\n\nBest regards,\n' + (document.getElementById('poName').value || 'Buyer'));
    window.open('mailto:' + (t.ownerContact || '') + '?subject=' + subject + '&body=' + body, '_self');
}

// ===================================================================
// STATS BAR DATA FRESHNESS INDICATOR
// ===================================================================
(function() {
    var statsBar = document.querySelector('.stats-bar');
    if (statsBar) {
        var freshStat = document.createElement('div');
        freshStat.className = 'stat-item';
        freshStat.innerHTML = '<div class="stat-value" id="dataHealthScore" style="font-size: 16px;">--</div><div class="stat-label">Data Health</div>';
        statsBar.appendChild(freshStat);

        // Update data health on load
        setTimeout(function() {
            var dataDate = window._dataAsOf ? new Date(window._dataAsOf) : new Date('2026-02-28');
            var dataAge = Math.floor((new Date() - dataDate) / (1000*60*60*24));
            var healthEl = document.getElementById('dataHealthScore');
            if (healthEl) {
                if (dataAge <= 3) { healthEl.textContent = 'Fresh'; healthEl.style.color = 'var(--success)'; }
                else if (dataAge <= 7) { healthEl.textContent = 'Recent'; healthEl.style.color = 'var(--warning)'; }
                else if (dataAge <= 14) { healthEl.textContent = 'Aging'; healthEl.style.color = '#e65100'; }
                else { healthEl.textContent = 'Stale'; healthEl.style.color = 'var(--danger)'; }
            }
        }, 500);
    }
})();

