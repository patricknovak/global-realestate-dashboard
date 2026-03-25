// ===== SHORTLIST NOTES =====
var shortlistNotes = JSON.parse(localStorage.getItem('shortlistNotes') || '{}');
function saveShortlistNote(idx) {
    var note = document.getElementById('note_' + idx).value;
    shortlistNotes[idx] = note;
    localStorage.setItem('shortlistNotes', JSON.stringify(shortlistNotes));
}

// ===== LISTING NOTES & TAGS =====
var PRESET_TAGS = ['favorite', 'needsViewing', 'underNegotiation', 'overpriced', 'hidden_gem'];
var TAG_LABELS = { favorite: '⭐ Favorite', needsViewing: '👁 Needs Viewing', underNegotiation: '🤝 Under Negotiation', overpriced: '💰 Overpriced', hidden_gem: '💎 Hidden Gem' };
var listingNotes = JSON.parse(localStorage.getItem('listingNotes') || '{}');
var listingTags = JSON.parse(localStorage.getItem('listingTags') || '{}');

function saveListingNote(idx) {
    var el = document.getElementById('listingNote_' + idx);
    if (!el) return;
    var note = el.value.trim();
    if (note) { listingNotes[idx] = note; } else { delete listingNotes[idx]; }
    localStorage.setItem('listingNotes', JSON.stringify(listingNotes));
}

function toggleListingTag(idx, tag) {
    if (!listingTags[idx]) listingTags[idx] = [];
    var i = listingTags[idx].indexOf(tag);
    if (i >= 0) { listingTags[idx].splice(i, 1); } else { listingTags[idx].push(tag); }
    if (listingTags[idx].length === 0) delete listingTags[idx];
    localStorage.setItem('listingTags', JSON.stringify(listingTags));
    // Re-render tag buttons
    var container = document.getElementById('tagButtons_' + idx);
    if (container) container.innerHTML = renderTagButtons(idx);
}

function renderTagButtons(idx) {
    var tags = listingTags[idx] || [];
    return PRESET_TAGS.map(function(t) {
        var active = tags.indexOf(t) >= 0;
        return '<button onclick="event.stopPropagation(); toggleListingTag(' + idx + ', \'' + t + '\')" style="padding:3px 8px;font-size:10px;border:1px solid ' + (active ? 'var(--primary)' : 'var(--border)') + ';background:' + (active ? 'var(--primary)' : 'var(--white)') + ';color:' + (active ? 'white' : 'var(--text)') + ';border-radius:12px;cursor:pointer;white-space:nowrap;">' + TAG_LABELS[t] + '</button>';
    }).join('');
}

function getListingTagBadges(idx) {
    var tags = listingTags[idx] || [];
    if (tags.length === 0 && !listingNotes[idx]) return '';
    var html = '';
    tags.forEach(function(t) {
        html += '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:var(--primary);color:white;white-space:nowrap;">' + TAG_LABELS[t] + '</span>';
    });
    if (listingNotes[idx]) html += '<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:#6f42c1;color:white;" title="' + listingNotes[idx].replace(/"/g, '&quot;') + '">📝</span>';
    return '<span style="display:inline-flex;gap:3px;flex-wrap:wrap;margin-left:4px;">' + html + '</span>';
}

// ===== CONTACT LISTING AGENT =====
function contactListingAgent(listingIndex) {
    var listing = rawListings[listingIndex];
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var buyerName = profile.name || 'Prospective Buyer';
    var buyerEmail = profile.email || '';
    var buyerPhone = profile.phone || '';
    var city = getCityForListing(listing);

    var loc = getLocationForListing(listing);
    var subject = encodeURIComponent('Inquiry: ' + loc.fullAddress + ' - ' + formatPrice(listing.price));
    var body = encodeURIComponent(
        'Dear ' + listing.agent.split(',')[0] + ',\n\n' +
        'I am writing to inquire about the property listed at:\n\n' +
        loc.fullAddress + '\n' +
        'Listed at: ' + formatPrice(listing.price) + '\n' +
        'MLS Type: ' + listing.type + '\n\n' +
        'I am an unrepresented buyer and would like to:\n' +
        '- Schedule a viewing at your earliest convenience\n' +
        '- Request the Property Disclosure Statement\n' +
        '- Receive any additional property information available\n\n' +
        'I am a serious, financially prepared buyer' +
        (profile.preApproval ? ' with mortgage pre-approval in place' : '') + '.\n\n' +
        'Best regards,\n' +
        buyerName + '\n' +
        (buyerEmail ? 'Email: ' + buyerEmail + '\n' : '') +
        (buyerPhone ? 'Phone: ' + buyerPhone : '')
    );

    window.open('mailto:?subject=' + subject + '&body=' + body);
}

// ===== DASHBOARD HOME =====
function initializeDashboard() {
    renderStaleDeals();
    // Shortlist count
    document.getElementById('dashShortlistCount').textContent = shortlistedIds.size;

    // Offer count
    var offers = JSON.parse(localStorage.getItem('offerHistory') || '[]');
    document.getElementById('dashOfferCount').textContent = offers.length;

    // Hot deals
    var hotCount = 0;
    rawListings.forEach(function(l) {
        var s = calculateScore(l);
        if (s >= 70) hotCount++;
    });
    document.getElementById('dashHotDeals').textContent = hotCount;

    // Market snapshot
    var totalPrice = 0, totalDOM = 0, totalScore = 0, count = rawListings.length;
    rawListings.forEach(function(l) {
        totalPrice += l.price;
        totalDOM += l.dom;
        totalScore += calculateScore(l);
    });
    document.getElementById('dashAvgPrice').textContent = formatPrice(Math.round(totalPrice / count));
    document.getElementById('dashAvgDOM').textContent = Math.round(totalDOM / count) + ' days';
    document.getElementById('dashTotalListings').textContent = count;
    document.getElementById('dashAvgScore').textContent = Math.round(totalScore / count) + '/100';

    var buyerMarkets = 0;
    var totalSaleList = 0, slCount = 0;
    Object.keys(marketTrends).forEach(function(k) {
        if (marketTrends[k].inventory === 'high') buyerMarkets++;
        totalSaleList += marketTrends[k].avgSaleToList;
        slCount++;
    });
    document.getElementById('dashBuyerMarkets').textContent = buyerMarkets + ' areas';
    document.getElementById('dashSaleList').textContent = (totalSaleList / slCount * 100).toFixed(1) + '%';

    // Recent listings
    var recent = rawListings.slice().sort(function(a, b) { return a.dom - b.dom; }).slice(0, 5);
    var recentHtml = '';
    recent.forEach(function(l) {
        var idx = rawListings.indexOf(l);
        recentHtml += '<div onclick="showDetailModal(' + idx + ')" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:white;border:1px solid #eee;border-radius:6px;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'var(--secondary)\'" onmouseout="this.style.borderColor=\'#eee\'">';
        recentHtml += '<div><strong style="color:var(--primary);font-size:13px;">' + escapeHtml(l.addr) + '</strong><br><span style="font-size:11px;color:#888;">' + escapeHtml(l.neighborhood) + ' &bull; ' + escapeHtml(l.type) + ' &bull; ' + l.dom + ' days on market</span></div>';
        recentHtml += '<div style="text-align:right;"><span style="font-weight:700;color:var(--primary);font-size:15px;">' + formatPrice(l.price) + '</span></div>';
        recentHtml += '</div>';
    });
    document.getElementById('dashRecentListings').innerHTML = recentHtml;

    // Private targets stats
    var ptStats = getPrivateTargetStats();
    document.getElementById('dashPrivateTargets').textContent = ptStats.total;
    document.getElementById('dashLettersSent').textContent = ptStats.lettersSent;
    document.getElementById('dashOffersOut').textContent = ptStats.offersOut;

    // Buyer Quick Stats
    renderBuyerQuickStats();

    // Profile summary
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    if (profile.name) {
        var phtml = '<div style="font-size:13px;">';
        phtml += '<strong style="color:var(--primary);">' + profile.name + '</strong><br>';
        if (profile.email) phtml += '<span style="color:#666;">' + profile.email + '</span><br>';
        if (profile.preApproval) phtml += '<span style="color:var(--success);font-weight:600;">Pre-approved: ' + formatPrice(parseInt(profile.preApproval)) + '</span><br>';
        if (profile.budgetMin || profile.budgetMax) phtml += '<span style="color:#888;">Budget: ' + (profile.budgetMin ? formatPrice(parseInt(profile.budgetMin)) : '$0') + ' - ' + (profile.budgetMax ? formatPrice(parseInt(profile.budgetMax)) : 'no max') + '</span>';
        phtml += '</div>';
        document.getElementById('dashProfileSummary').innerHTML = phtml;
    }

    renderLocationListings();
}

function renderLocationListings() {
    var container = document.getElementById('dashLocationListings');
    if (!container || rawListings.length === 0) return;

    var searchTerm = (document.getElementById('locationSearchInput').value || '').toLowerCase().trim();
    var sortBy = (document.getElementById('locationSortBy') || {}).value || 'count';

    // Group listings by neighborhood
    var locationMap = {};
    rawListings.forEach(function(l, idx) {
        var nbr = l.neighborhood || 'Unknown';
        if (!locationMap[nbr]) {
            locationMap[nbr] = { name: nbr, region: l.region || '', listings: [], totalPrice: 0, totalDOM: 0, totalScore: 0 };
        }
        var entry = locationMap[nbr];
        entry.listings.push(l);
        entry.totalPrice += l.price;
        entry.totalDOM += l.dom;
        entry.totalScore += calculateScore(l);
    });

    var locations = Object.values(locationMap).map(function(loc) {
        var count = loc.listings.length;
        return {
            name: loc.name,
            region: loc.region,
            count: count,
            avgPrice: Math.round(loc.totalPrice / count),
            avgDOM: Math.round(loc.totalDOM / count),
            avgScore: Math.round(loc.totalScore / count),
            minPrice: Math.min.apply(null, loc.listings.map(function(l) { return l.price; })),
            maxPrice: Math.max.apply(null, loc.listings.map(function(l) { return l.price; })),
            types: [...new Set(loc.listings.map(function(l) { return l.type; }))],
            trend: marketTrends[loc.name] || null
        };
    });

    // Filter by search
    if (searchTerm) {
        locations = locations.filter(function(loc) {
            return loc.name.toLowerCase().indexOf(searchTerm) >= 0 || loc.region.toLowerCase().indexOf(searchTerm) >= 0;
        });
    }

    // Sort
    if (sortBy === 'count') locations.sort(function(a, b) { return b.count - a.count; });
    else if (sortBy === 'name') locations.sort(function(a, b) { return a.name.localeCompare(b.name); });
    else if (sortBy === 'price') locations.sort(function(a, b) { return b.avgPrice - a.avgPrice; });
    else if (sortBy === 'dom') locations.sort(function(a, b) { return b.avgDOM - a.avgDOM; });
    else if (sortBy === 'score') locations.sort(function(a, b) { return b.avgScore - a.avgScore; });

    var html = '';
    locations.forEach(function(loc) {
        var trendHtml = '';
        if (loc.trend) {
            var yoy = loc.trend.yoyChange;
            var yoyColor = yoy < 0 ? 'var(--success)' : yoy > 0 ? 'var(--danger)' : '#888';
            var yoyArrow = yoy < 0 ? '&#9660;' : yoy > 0 ? '&#9650;' : '&#9644;';
            var invLabel = loc.trend.inventory === 'high' ? "Buyer's" : loc.trend.inventory === 'low' ? "Seller's" : 'Balanced';
            var invColor = loc.trend.inventory === 'high' ? 'var(--success)' : loc.trend.inventory === 'low' ? 'var(--danger)' : '#fd7e14';
            trendHtml = '<div style="display:flex;gap:8px;margin-top:6px;font-size:10px;">' +
                '<span style="color:' + yoyColor + ';font-weight:600;" title="Year-over-year change">' + yoyArrow + ' ' + Math.abs(yoy) + '% YoY</span>' +
                '<span style="color:' + invColor + ';" title="Market type">' + escapeHtml(invLabel) + '</span>' +
                '<span style="color:#888;" title="Sale-to-list ratio">' + Math.round(loc.trend.avgSaleToList * 100) + '% S/L</span>' +
                '</div>';
        }

        var scoreColor = loc.avgScore >= 70 ? 'var(--success)' : loc.avgScore >= 50 ? 'var(--warning)' : '#888';

        html += '<div onclick="switchTabDirect(\'listings\');document.getElementById(\'searchBox\').value=\'' + escapeHtml(loc.name) + '\';applyFilters();" ' +
            'style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:14px 16px;cursor:pointer;transition:all 0.2s;" ' +
            'onmouseover="this.style.borderColor=\'var(--secondary)\';this.style.boxShadow=\'0 2px 8px rgba(0,0,0,0.08)\'" ' +
            'onmouseout="this.style.borderColor=\'#e0e0e0\';this.style.boxShadow=\'none\'">';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
        html += '<div><strong style="color:var(--primary);font-size:14px;">' + escapeHtml(loc.name) + '</strong>';
        html += '<div style="font-size:11px;color:#888;margin-top:2px;">' + escapeHtml(loc.region) + '</div></div>';
        html += '<div style="background:var(--primary);color:white;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:700;">' + loc.count + '</div>';
        html += '</div>';
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:10px;font-size:11px;">';
        html += '<div><span style="color:#888;">Avg Price</span><div style="font-weight:600;color:var(--primary);">' + formatPrice(loc.avgPrice) + '</div></div>';
        html += '<div><span style="color:#888;">Avg DOM</span><div style="font-weight:600;">' + loc.avgDOM + ' days</div></div>';
        html += '<div><span style="color:#888;">Avg Score</span><div style="font-weight:600;color:' + scoreColor + ';">' + loc.avgScore + '/100</div></div>';
        html += '</div>';
        html += '<div style="font-size:10px;color:#888;margin-top:6px;">Range: ' + formatPrice(loc.minPrice) + ' &ndash; ' + formatPrice(loc.maxPrice) + '</div>';
        html += '<div style="font-size:10px;color:#888;margin-top:2px;">Types: ' + loc.types.map(function(t) { return escapeHtml(t); }).join(', ') + '</div>';
        html += trendHtml;
        html += '</div>';
    });

    if (locations.length === 0) {
        html = '<div style="text-align:center;color:#888;padding:20px;grid-column:1/-1;">No locations match your search.</div>';
    }

    container.innerHTML = html;
}

function renderBuyerQuickStats() {
    var el = document.getElementById('dashBuyerQuickStats');
    if (!el || rawListings.length === 0) return;

    var under500 = 0, under1m = 0, priceDrops = 0, newThisWeek = 0, sqftCount = 0, sqftSum = 0;
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var budgetMax = parseFloat(profile.budgetMax) || 0;
    var budgetMatch = 0;

    rawListings.forEach(function(l) {
        if (l.price < 500000) under500++;
        if (l.price < 1000000) under1m++;
        if (l.dom <= 7) newThisWeek++;
        if (l.dom > 30 && l.score >= 50) priceDrops++; // Proxy: high DOM + decent score = potential price reduction
        if (l.sqft > 0) { sqftSum += l.price / l.sqft; sqftCount++; }
        if (budgetMax > 0 && l.price <= budgetMax) budgetMatch++;
    });

    var avgPpsf = sqftCount > 0 ? Math.round(sqftSum / sqftCount) : 0;

    function statCard(value, label, color, onclick) {
        return '<div onclick="' + onclick + '" style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:14px 10px;text-align:center;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.borderColor=\'' + color + '\'" onmouseout="this.style.borderColor=\'#e0e0e0\'">' +
            '<div style="font-size:24px;font-weight:700;color:' + color + ';">' + value + '</div>' +
            '<div style="font-size:10px;color:#888;margin-top:2px;text-transform:uppercase;font-weight:600;">' + label + '</div></div>';
    }

    el.innerHTML =
        statCard(under500, 'Under $500K', '#28a745', "switchTabDirect('listings');document.getElementById('priceMax').value=500000;applyFilters();") +
        statCard(under1m, 'Under $1M', '#2E75B6', "switchTabDirect('listings');document.getElementById('priceMax').value=1000000;applyFilters();") +
        statCard(priceDrops, 'Price Drops', '#dc3545', "switchTabDirect('deals');") +
        statCard(newThisWeek, 'New This Week', '#fd7e14', "switchTabDirect('listings');document.getElementById('sortBy').value='dom-asc';applyFilters();") +
        statCard('$' + avgPpsf, 'Avg $/SqFt', '#6f42c1', "switchTabDirect('listings');document.getElementById('sortBy').value='ppsf-asc';applyFilters();") +
        (budgetMax > 0 ? statCard(budgetMatch, 'Budget Match', '#e83e8c', "switchTabDirect('listings');document.getElementById('priceMax').value=" + budgetMax + ";applyFilters();") :
            statCard(rawListings.length, 'Total Listings', '#e83e8c', "switchTabDirect('listings');"));
}

// ===== BUYER PROFILE =====
function saveBuyerProfile() {
    var profile = {
        name: document.getElementById('bpName').value,
        email: document.getElementById('bpEmail').value,
        phone: document.getElementById('bpPhone').value,
        company: document.getElementById('bpCompany').value,
        address: document.getElementById('bpAddress').value,
        budgetMin: document.getElementById('bpBudgetMin').value,
        budgetMax: document.getElementById('bpBudgetMax').value,
        preApproval: document.getElementById('bpPreApproval').value,
        preApprovalLender: document.getElementById('bpPreApprovalLender').value,
        purpose: document.getElementById('bpPurpose').value,
        areas: document.getElementById('bpAreas').value,
        types: document.getElementById('bpTypes').value,
        timeline: document.getElementById('bpTimeline').value,
        lawyer: document.getElementById('bpLawyer').value,
        mortBroker: document.getElementById('bpMortBroker').value,
        inspector: document.getElementById('bpInspector').value
    };
    localStorage.setItem('buyerProfile', JSON.stringify(profile));
}

function loadBuyerProfile() {
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var fields = ['name','email','phone','company','address','budgetMin','budgetMax','preApproval','preApprovalLender','purpose','areas','types','timeline','lawyer','mortBroker','inspector'];
    var idMap = { name:'bpName', email:'bpEmail', phone:'bpPhone', company:'bpCompany', address:'bpAddress', budgetMin:'bpBudgetMin', budgetMax:'bpBudgetMax', preApproval:'bpPreApproval', preApprovalLender:'bpPreApprovalLender', purpose:'bpPurpose', areas:'bpAreas', types:'bpTypes', timeline:'bpTimeline', lawyer:'bpLawyer', mortBroker:'bpMortBroker', inspector:'bpInspector' };
    fields.forEach(function(f) {
        var el = document.getElementById(idMap[f]);
        if (el && profile[f]) el.value = profile[f];
    });
}

// ===== MY OFFERS TRACKING =====
function getOfferHistory() {
    return JSON.parse(localStorage.getItem('offerHistory') || '[]');
}

function saveOfferToHistory(offerData) {
    var history = getOfferHistory();
    offerData.id = Date.now();
    offerData.status = 'sent';
    offerData.date = new Date().toISOString().split('T')[0];
    history.unshift(offerData);
    localStorage.setItem('offerHistory', JSON.stringify(history));
    if (offerData && offerData.property) {
        var matchedListing = rawListings.find(function(l) { return l.addr === offerData.property; });
        if (matchedListing) setTimeout(function() { showPostOfferTimeline(matchedListing); }, 500);
    }
}

function updateOfferStatus(offerId, newStatus) {
    var history = getOfferHistory();
    for (var i = 0; i < history.length; i++) {
        if (history[i].id === offerId) {
            history[i].status = newStatus;
            break;
        }
    }
    localStorage.setItem('offerHistory', JSON.stringify(history));
    initializeMyOffers();
}

function deleteOffer(offerId) {
    var history = getOfferHistory();
    history = history.filter(function(o) { return o.id !== offerId; });
    localStorage.setItem('offerHistory', JSON.stringify(history));
    initializeMyOffers();
}

function initializeMyOffers() {
    var lockEl = document.getElementById('myOffersLock');
    var contentEl = document.getElementById('myOffersContent');
    if (!isMember()) {
        if (lockEl) lockEl.style.display = 'block';
        if (contentEl) contentEl.style.display = 'none';
        return;
    }
    if (lockEl) lockEl.style.display = 'none';
    if (contentEl) contentEl.style.display = 'block';
    var history = getOfferHistory();
    var total = history.length;
    var accepted = history.filter(function(o) { return o.status === 'accepted'; }).length;
    var pending = history.filter(function(o) { return o.status === 'sent' || o.status === 'countered'; }).length;
    var rejected = history.filter(function(o) { return o.status === 'rejected' || o.status === 'withdrawn'; }).length;

    document.getElementById('myoffersTotal').textContent = total;
    document.getElementById('myoffersAccepted').textContent = accepted;
    document.getElementById('myoffersPending').textContent = pending;
    document.getElementById('myoffersRejected').textContent = rejected;

    if (total === 0) {
        document.getElementById('myoffersTable').style.display = 'none';
        document.getElementById('emptyOffers').style.display = 'block';
        return;
    }
    document.getElementById('myoffersTable').style.display = 'table';
    document.getElementById('emptyOffers').style.display = 'none';

    var html = '';
    history.forEach(function(offer) {
        var statusColors = {
            'sent': 'background:#fff3cd;color:#856404;',
            'countered': 'background:#e7f3ff;color:#004085;',
            'accepted': 'background:#d4edda;color:#155724;',
            'rejected': 'background:#f8d7da;color:#721c24;',
            'withdrawn': 'background:#e2e3e5;color:#383d41;',
            'draft': 'background:#f8f9fa;color:#666;'
        };
        var statusStyle = statusColors[offer.status] || statusColors['draft'];
        var discount = offer.askingPrice ? Math.round((1 - offer.offerPrice / offer.askingPrice) * 100) : 0;

        html += '<tr>';
        html += '<td>' + (offer.date || '--') + '</td>';
        html += '<td><strong>' + (offer.address || 'Unknown') + '</strong><br><span style="font-size:11px;color:#888;">' + (offer.neighborhood || '') + '</span></td>';
        html += '<td>' + (offer.askingPrice ? formatPrice(offer.askingPrice) : '--') + '</td>';
        html += '<td style="font-weight:600;color:var(--success);">' + (offer.offerPrice ? formatPrice(offer.offerPrice) : '--') + '</td>';
        html += '<td>' + (discount > 0 ? discount + '% below' : '--') + '</td>';
        html += '<td><span style="padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;' + statusStyle + '">' + (offer.status || 'draft').toUpperCase() + '</span></td>';
        html += '<td style="white-space:nowrap;">';
        html += '<select onchange="updateOfferStatus(' + offer.id + ', this.value)" style="padding:4px 6px;border:1px solid #ddd;border-radius:4px;font-size:11px;">';
        ['sent','countered','accepted','rejected','withdrawn'].forEach(function(s) {
            html += '<option value="' + s + '"' + (offer.status === s ? ' selected' : '') + '>' + s.charAt(0).toUpperCase() + s.slice(1) + '</option>';
        });
        html += '</select> ';
        html += '<button onclick="deleteOffer(' + offer.id + ')" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;background:white;cursor:pointer;font-size:11px;color:#dc3545;" title="Delete">&#10005;</button>';
        html += '</td>';
        html += '</tr>';
    });
    document.getElementById('myoffersTableBody').innerHTML = html;
}

// ===== INVESTMENT ROI CALCULATOR =====
function initializeROI() {
    var sel = document.getElementById('roiPropertySelect');
    if (sel.options.length <= 1) {
        rawListings.forEach(function(l, idx) {
            var opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = l.addr + ' - ' + formatPrice(l.price) + ' (' + escapeHtml(l.neighborhood) + ')';
            sel.appendChild(opt);
        });
    }
    calcROI();
}

function roiLoadProperty() {
    var sel = document.getElementById('roiPropertySelect');
    if (!sel.value) return;
    var l = rawListings[parseInt(sel.value)];
    document.getElementById('roiPrice').value = l.price;
    calcROI();
}

function calcROI() {
    var price = parseFloat(document.getElementById('roiPrice').value) || 0;
    var downPct = parseFloat(document.getElementById('roiDown').value) || 0;
    var rate = parseFloat(document.getElementById('roiRate').value) || 0;
    var closing = parseFloat(document.getElementById('roiClosing').value) || 0;
    var rent = parseFloat(document.getElementById('roiRent').value) || 0;
    var otherIncome = parseFloat(document.getElementById('roiOtherIncome').value) || 0;
    var tax = parseFloat(document.getElementById('roiTax').value) || 0;
    var insurance = parseFloat(document.getElementById('roiInsurance').value) || 0;
    var maintenance = parseFloat(document.getElementById('roiMaintenance').value) || 0;
    var mgmtPct = parseFloat(document.getElementById('roiMgmt').value) || 0;
    var strata = parseFloat(document.getElementById('roiStrata').value) || 0;
    var vacancyPct = parseFloat(document.getElementById('roiVacancy').value) || 0;
    var appreciationPct = parseFloat(document.getElementById('roiAppreciation').value) || 0;
    var rentIncreasePct = parseFloat(document.getElementById('roiRentIncrease').value) || 0;

    var downPayment = price * downPct / 100;
    var mortgageAmount = price - downPayment;
    var totalInvestment = downPayment + closing;

    var monthlyRate = rate / 100 / 12;
    var nPayments = 25 * 12;
    var mortPayment = 0;
    if (monthlyRate > 0 && mortgageAmount > 0) {
        mortPayment = mortgageAmount * (monthlyRate * Math.pow(1 + monthlyRate, nPayments)) / (Math.pow(1 + monthlyRate, nPayments) - 1);
    }

    var grossIncome = rent + otherIncome;
    var effectiveIncome = grossIncome * (1 - vacancyPct / 100);
    var mgmtFee = rent * mgmtPct / 100;
    var operatingExpenses = tax + insurance + maintenance + mgmtFee + strata;
    var noi = (effectiveIncome - operatingExpenses) * 12;
    var monthlyCashFlow = effectiveIncome - operatingExpenses - mortPayment;
    var annualCashFlow = monthlyCashFlow * 12;

    var capRate = price > 0 ? (noi / price) * 100 : 0;
    var cashOnCash = totalInvestment > 0 ? (annualCashFlow / totalInvestment) * 100 : 0;
    var grm = grossIncome > 0 ? (price / (grossIncome * 12)).toFixed(1) : '--';

    // New metrics: DSCR, Price-to-Rent, 1% Rule, Break-Even
    var annualDebtService = mortPayment * 12;
    var dscr = annualDebtService > 0 ? (noi / annualDebtService) : 0;
    var priceToRent = rent > 0 ? (price / (rent * 12)) : 0;
    var onePercentRatio = price > 0 ? (rent / price * 100) : 0;
    var breakEvenMonths = monthlyCashFlow > 0 ? Math.ceil(totalInvestment / monthlyCashFlow) : 0;

    document.getElementById('roiCashFlow').textContent = (monthlyCashFlow >= 0 ? '' : '-') + '$' + Math.abs(Math.round(monthlyCashFlow)).toLocaleString();
    document.getElementById('roiCashFlow').parentElement.style.background = monthlyCashFlow >= 0 ? 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' : 'linear-gradient(135deg, #dc3545 0%, #e83e8c 100%)';
    document.getElementById('roiCapRate').textContent = capRate.toFixed(2) + '%';
    document.getElementById('roiCashOnCash').textContent = cashOnCash.toFixed(2) + '%';
    document.getElementById('roiTotalInvestment').textContent = '$' + Math.round(totalInvestment).toLocaleString();
    document.getElementById('roiMortPayment').textContent = '$' + Math.round(mortPayment).toLocaleString();
    document.getElementById('roiGrossIncome').textContent = '$' + Math.round(grossIncome).toLocaleString();
    document.getElementById('roiEffIncome').textContent = '$' + Math.round(effectiveIncome).toLocaleString();
    document.getElementById('roiTotalExpenses').textContent = '$' + Math.round(operatingExpenses + mortPayment).toLocaleString();
    document.getElementById('roiNOI').textContent = '$' + Math.round(noi).toLocaleString();
    document.getElementById('roiAnnualCF').textContent = (annualCashFlow >= 0 ? '' : '-') + '$' + Math.abs(Math.round(annualCashFlow)).toLocaleString();
    document.getElementById('roiGRM').textContent = grm;

    // New metric displays
    var dscrEl = document.getElementById('roiDSCR');
    if (annualDebtService > 0) {
        dscrEl.textContent = dscr.toFixed(2) + 'x';
        dscrEl.style.color = dscr >= 1.25 ? 'var(--success)' : dscr >= 1.0 ? '#856404' : 'var(--danger)';
    } else { dscrEl.textContent = 'N/A (no debt)'; dscrEl.style.color = ''; }

    var ptrEl = document.getElementById('roiPriceToRent');
    if (rent > 0) {
        ptrEl.textContent = priceToRent.toFixed(1) + 'x';
        ptrEl.style.color = priceToRent <= 15 ? 'var(--success)' : priceToRent <= 20 ? '#856404' : 'var(--danger)';
    } else { ptrEl.textContent = '--'; ptrEl.style.color = ''; }

    var oneEl = document.getElementById('roi1PctRule');
    if (price > 0 && rent > 0) {
        oneEl.textContent = onePercentRatio.toFixed(2) + '%';
        oneEl.style.color = onePercentRatio >= 1.0 ? 'var(--success)' : onePercentRatio >= 0.7 ? '#856404' : 'var(--danger)';
    } else { oneEl.textContent = '--'; oneEl.style.color = ''; }

    var beEl = document.getElementById('roiBreakEven');
    if (monthlyCashFlow > 0) {
        var beYrs = Math.floor(breakEvenMonths / 12);
        var beMos = breakEvenMonths % 12;
        beEl.textContent = (beYrs > 0 ? beYrs + 'y ' : '') + beMos + 'mo';
        beEl.style.color = breakEvenMonths <= 60 ? 'var(--success)' : breakEvenMonths <= 120 ? '#856404' : 'var(--danger)';
    } else { beEl.textContent = monthlyCashFlow < 0 ? 'Never (negative CF)' : '--'; beEl.style.color = monthlyCashFlow < 0 ? 'var(--danger)' : ''; }

    // Verdict
    var verdict = '';
    if (capRate >= 6) verdict = '<div style="color:#155724;font-weight:700;">Excellent Investment</div><p>Cap rate of ' + capRate.toFixed(1) + '% is well above average for most markets.</p>';
    else if (capRate >= 4) verdict = '<div style="color:#004085;font-weight:700;">Good Investment</div><p>Cap rate of ' + capRate.toFixed(1) + '% is competitive. Solid returns with potential for appreciation.</p>';
    else if (capRate >= 2) verdict = '<div style="color:#856404;font-weight:700;">Moderate Investment</div><p>Cap rate of ' + capRate.toFixed(1) + '% is typical for major markets. Returns are modest but you may benefit from property appreciation.</p>';
    else verdict = '<div style="color:#721c24;font-weight:700;">Low Return / Appreciation Play</div><p>Cap rate of ' + capRate.toFixed(1) + '% is low. This property relies heavily on appreciation for returns.</p>';

    if (monthlyCashFlow < 0) verdict += '<p style="background:#f8d7da;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>Warning:</strong> Negative cash flow of $' + Math.abs(Math.round(monthlyCashFlow)).toLocaleString() + '/month.</p>';
    else if (monthlyCashFlow > 0) verdict += '<p style="background:#d4edda;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>Positive cash flow</strong> of $' + Math.round(monthlyCashFlow).toLocaleString() + '/month.</p>';

    // Additional verdict insights
    if (dscr > 0 && dscr < 1.0) verdict += '<p style="background:#f8d7da;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>DSCR below 1.0:</strong> Income does not cover debt service. Lenders typically require DSCR &ge; 1.25.</p>';
    else if (dscr >= 1.25) verdict += '<p style="background:#d4edda;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>DSCR ' + dscr.toFixed(2) + 'x:</strong> Meets most lender requirements (&ge; 1.25x).</p>';

    if (onePercentRatio >= 1.0) verdict += '<p style="background:#d4edda;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>Passes 1% Rule:</strong> Monthly rent is ' + onePercentRatio.toFixed(2) + '% of purchase price.</p>';
    else if (price > 0 && rent > 0) verdict += '<p style="background:#fff3cd;padding:8px 12px;border-radius:4px;margin-top:8px;"><strong>Below 1% Rule:</strong> Monthly rent is only ' + onePercentRatio.toFixed(2) + '% of purchase price (target &ge; 1%).</p>';

    document.getElementById('roiVerdict').innerHTML = verdict;

    // 5-year projection with appreciation and rent increases
    var projHtml = '';
    var cumCF = 0;
    var remainingMort = mortgageAmount;
    var projRent = rent;
    var projOther = otherIncome;
    var projValue = price;
    for (var yr = 1; yr <= 5; yr++) {
        projValue = price * Math.pow(1 + appreciationPct / 100, yr);
        projRent = rent * Math.pow(1 + rentIncreasePct / 100, yr);
        projOther = otherIncome * Math.pow(1 + rentIncreasePct / 100, yr);
        var projGross = projRent + projOther;
        var projEff = projGross * (1 - vacancyPct / 100);
        var projMgmt = projRent * mgmtPct / 100;
        var projOpEx = tax + insurance + maintenance + projMgmt + strata;
        var projAnnualCF = (projEff - projOpEx - mortPayment) * 12;
        cumCF += projAnnualCF;
        var tempBal = remainingMort;
        for (var m = 0; m < 12; m++) {
            var intPmt = tempBal * monthlyRate;
            var prinPmt = mortPayment - intPmt;
            if (prinPmt > 0) { tempBal -= prinPmt; }
        }
        remainingMort = tempBal;
        var equityBuilt = projValue - Math.max(remainingMort, 0);
        var totalReturn = cumCF + (projValue - price) + (mortgageAmount - remainingMort);
        projHtml += '<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;">Year ' + yr + '</td>';
        projHtml += '<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;color:' + (projAnnualCF >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-weight:600;">' + (projAnnualCF >= 0 ? '' : '-') + '$' + Math.abs(Math.round(projAnnualCF)).toLocaleString() + '</td>';
        projHtml += '<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;font-weight:600;">$' + Math.round(projValue).toLocaleString() + '</td>';
        projHtml += '<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;font-weight:600;">$' + Math.round(equityBuilt).toLocaleString() + '</td>';
        projHtml += '<td style="padding:6px 8px;text-align:right;border-bottom:1px solid #eee;font-weight:600;">$' + Math.round(totalReturn).toLocaleString() + '</td></tr>';
    }
    document.getElementById('roiProjectionBody').innerHTML = projHtml;

    // Scenario comparison: Conservative / Base / Optimistic
    var scenarios = [
        { name: 'Conservative', appreciation: Math.max(appreciationPct - 2, 0), rentInc: Math.max(rentIncreasePct - 1, 0), vacancy: Math.min(vacancyPct + 3, 15), color: '#dc3545', bg: '#f8d7da' },
        { name: 'Base Case', appreciation: appreciationPct, rentInc: rentIncreasePct, vacancy: vacancyPct, color: '#004085', bg: '#e7f3ff' },
        { name: 'Optimistic', appreciation: appreciationPct + 2, rentInc: rentIncreasePct + 1, vacancy: Math.max(vacancyPct - 2, 0), color: '#155724', bg: '#d4edda' }
    ];
    var scenHtml = '';
    scenarios.forEach(function(sc) {
        var scValue5 = price * Math.pow(1 + sc.appreciation / 100, 5);
        var scRent5 = rent * Math.pow(1 + sc.rentInc / 100, 5);
        var scGross5 = (scRent5 + otherIncome) * (1 - sc.vacancy / 100);
        var scMgmt5 = scRent5 * mgmtPct / 100;
        var scOpEx5 = tax + insurance + maintenance + scMgmt5 + strata;
        var scMonthlyCF5 = scGross5 - scOpEx5 - mortPayment;
        var scCumCF = 0;
        var scBal = mortgageAmount;
        for (var y = 1; y <= 5; y++) {
            var yRent = rent * Math.pow(1 + sc.rentInc / 100, y);
            var yGross = (yRent + otherIncome) * (1 - sc.vacancy / 100);
            var yMgmt = yRent * mgmtPct / 100;
            var yOpEx = tax + insurance + maintenance + yMgmt + strata;
            scCumCF += (yGross - yOpEx - mortPayment) * 12;
            for (var mm = 0; mm < 12; mm++) {
                var ii = scBal * monthlyRate;
                var pp = mortPayment - ii;
                if (pp > 0) scBal -= pp;
            }
        }
        var scAppreciation = scValue5 - price;
        var scEquityPaid = mortgageAmount - scBal;
        var scTotalReturn = scCumCF + scAppreciation + scEquityPaid;
        var scROI = totalInvestment > 0 ? (scTotalReturn / totalInvestment * 100) : 0;
        scenHtml += '<div style="background:' + sc.bg + ';padding:14px;border-radius:8px;border:1px solid ' + sc.color + '30;">';
        scenHtml += '<div style="font-weight:700;color:' + sc.color + ';margin-bottom:8px;font-size:13px;">' + sc.name + '</div>';
        scenHtml += '<div style="font-size:11px;color:#666;margin-bottom:6px;">Appr: ' + sc.appreciation.toFixed(1) + '% | Rent+: ' + sc.rentInc.toFixed(1) + '% | Vac: ' + sc.vacancy + '%</div>';
        scenHtml += '<div style="margin-bottom:4px;font-size:12px;">5yr Value: <strong>$' + Math.round(scValue5).toLocaleString() + '</strong></div>';
        scenHtml += '<div style="margin-bottom:4px;font-size:12px;">5yr Cash Flow: <strong style="color:' + (scCumCF >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (scCumCF >= 0 ? '' : '-') + '$' + Math.abs(Math.round(scCumCF)).toLocaleString() + '</strong></div>';
        scenHtml += '<div style="margin-bottom:4px;font-size:12px;">Yr5 Monthly CF: <strong style="color:' + (scMonthlyCF5 >= 0 ? 'var(--success)' : 'var(--danger)') + ';">' + (scMonthlyCF5 >= 0 ? '' : '-') + '$' + Math.abs(Math.round(scMonthlyCF5)).toLocaleString() + '</strong></div>';
        scenHtml += '<div style="font-size:12px;">Total 5yr ROI: <strong style="color:' + sc.color + ';">' + scROI.toFixed(1) + '%</strong></div>';
        scenHtml += '</div>';
    });
    document.getElementById('roiScenarios').innerHTML = scenHtml;
}

// ===== LENDER DIRECTORY =====
function initializeLenders() {
    renderRateTable();
    renderBrokerDirectory();
    calcPreQual();
    calcScenarios();
}

function renderRateTable() {
    var ratesAsOf = window._dataAsOf || '2026-02-28';
    var rateWarningEl = document.getElementById('ratesFreshnessWarning');
    if (rateWarningEl) rateWarningEl.innerHTML = '<div style="background:#fff3cd;padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:12px;"><strong>Rates shown as of ' + ratesAsOf + '</strong> — Rates change frequently. Always verify directly with the lender. <a href="https://www.ratehub.ca/best-mortgage-rates" target="_blank" rel="noopener" style="color:var(--secondary);font-weight:600;">Check current rates on RateHub.ca</a> (Canada) or <a href="https://www.bankrate.com/mortgages/mortgage-rates/" target="_blank" rel="noopener" style="color:var(--secondary);font-weight:600;">Bankrate.com</a> (US)</div>';
    var lenders = [
        // Canadian lenders
        { name: 'RBC Royal Bank', type: 'Big 5 Bank', country: 'CA', fix5: '4.99%', fix3: '5.19%', variable: '5.85%', insured: '-0.10%', url: 'https://www.rbcroyalbank.com/mortgages/' },
        { name: 'TD Canada Trust', type: 'Big 5 Bank', country: 'CA', fix5: '4.94%', fix3: '5.14%', variable: '5.80%', insured: '-0.15%', url: 'https://www.td.com/ca/en/personal-banking/products/mortgages/' },
        { name: 'BMO', type: 'Big 5 Bank', country: 'CA', fix5: '4.99%', fix3: '5.24%', variable: '5.90%', insured: '-0.10%', url: 'https://www.bmo.com/main/personal/mortgages/' },
        { name: 'Scotiabank', type: 'Big 5 Bank', country: 'CA', fix5: '5.04%', fix3: '5.29%', variable: '5.75%', insured: '-0.10%', url: 'https://www.scotiabank.com/ca/en/personal/mortgages.html' },
        { name: 'CIBC', type: 'Big 5 Bank', country: 'CA', fix5: '4.99%', fix3: '5.19%', variable: '5.85%', insured: '-0.10%', url: 'https://www.cibc.com/en/personal-banking/mortgages.html' },
        { name: 'National Bank', type: 'Bank', country: 'CA', fix5: '4.94%', fix3: '5.09%', variable: '5.70%', insured: '-0.15%', url: 'https://www.nbc.ca/personal/mortgages.html' },
        { name: 'Coast Capital', type: 'Credit Union', country: 'CA', fix5: '4.89%', fix3: '5.09%', variable: '5.65%', insured: '-0.15%', url: 'https://www.coastcapitalsavings.com/mortgages' },
        { name: 'Vancity', type: 'Credit Union', country: 'CA', fix5: '4.94%', fix3: '5.14%', variable: '5.70%', insured: '-0.15%', url: 'https://www.vancity.com/Mortgages/' },
        { name: 'MCAP', type: 'Monoline', country: 'CA', fix5: '4.79%', fix3: '4.99%', variable: '5.50%', insured: '-0.20%', url: 'https://www.mcap.com/' },
        { name: 'First National', type: 'Monoline', country: 'CA', fix5: '4.84%', fix3: '5.04%', variable: '5.55%', insured: '-0.20%', url: 'https://www.firstnational.ca/' },
        { name: 'RMG Mortgages', type: 'Monoline', country: 'CA', fix5: '4.79%', fix3: '4.99%', variable: '5.55%', insured: '-0.20%', url: 'https://www.rmgmortgages.ca/' },
        { name: 'Tangerine', type: 'Online', country: 'CA', fix5: '4.89%', fix3: '5.09%', variable: '5.60%', insured: '-0.15%', url: 'https://www.tangerine.ca/en/products/borrowing/mortgages' },
        { name: 'EQ Bank', type: 'Online', country: 'CA', fix5: '4.84%', fix3: '5.04%', variable: '5.55%', insured: '-0.15%', url: 'https://www.eqbank.ca/personal-banking/mortgages' },
        // US lenders
        { name: 'Chase', type: 'US Bank', country: 'US', fix5: '6.50%', fix3: '6.25%', variable: '7.00%', insured: 'N/A', url: 'https://www.chase.com/personal/mortgage' },
        { name: 'Bank of America', type: 'US Bank', country: 'US', fix5: '6.45%', fix3: '6.20%', variable: '6.95%', insured: 'N/A', url: 'https://www.bankofamerica.com/mortgage/home-mortgage/' },
        { name: 'Wells Fargo', type: 'US Bank', country: 'US', fix5: '6.55%', fix3: '6.30%', variable: '7.05%', insured: 'N/A', url: 'https://www.wellsfargo.com/mortgage/' },
        { name: 'Rocket Mortgage', type: 'US Online', country: 'US', fix5: '6.40%', fix3: '6.15%', variable: '6.85%', insured: 'N/A', url: 'https://www.rocketmortgage.com/' },
        { name: 'Better.com', type: 'US Online', country: 'US', fix5: '6.35%', fix3: '6.10%', variable: '6.80%', insured: 'N/A', url: 'https://better.com/' },
        { name: 'US Bank', type: 'US Bank', country: 'US', fix5: '6.48%', fix3: '6.22%', variable: '6.95%', insured: 'N/A', url: 'https://www.usbank.com/home-loans/mortgage.html' }
    ];
    var html = '';
    lenders.forEach(function(l) {
        html += '<tr>';
        html += '<td style="font-weight:600;">' + l.name + '</td>';
        html += '<td><span style="padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:#e7f3ff;color:#004085;">' + escapeHtml(l.type) + '</span></td>';
        html += '<td style="font-weight:600;">' + l.fix5 + '</td>';
        html += '<td>' + l.fix3 + '</td>';
        html += '<td>' + l.variable + '</td>';
        html += '<td style="color:var(--success);">' + l.insured + '</td>';
        html += '<td><a href="' + l.url + '" target="_blank" rel="noopener" style="color:var(--secondary);font-weight:600;text-decoration:none;font-size:12px;">Visit Site</a></td>';
        html += '</tr>';
    });
    document.getElementById('rateTableBody').innerHTML = html;
}

function renderBrokerDirectory() {
    var brokers = [
        // Canadian brokers
        { name: 'Dominion Lending Centres', specialty: 'Full-service mortgage broker network', region: 'All Canada', country: 'CA', phone: '1-888-806-8080', note: 'Canada\'s largest mortgage brokerage. Access to 60+ lenders.', color: '#1B3A5C' },
        { name: 'Mortgage Alliance', specialty: 'First-time buyers, self-employed', region: 'All Canada', country: 'CA', phone: '1-877-420-2627', note: 'Specializes in non-traditional income verification.', color: '#2E75B6' },
        { name: 'True North Mortgage', specialty: 'Low-rate specialists', region: 'All Canada', country: 'CA', phone: '1-866-407-0004', note: 'Online-first broker known for negotiating the lowest rates.', color: '#17a2b8' },
        { name: 'CanWise Financial', specialty: 'Digital-first mortgage platform', region: 'All Canada', country: 'CA', phone: 'Online only', note: 'Fully digital application. Often has the best published rates.', color: '#28a745' },
        { name: 'Outline Financial', specialty: 'Investment properties, HELOCs', region: 'Metro Vancouver', country: 'CA', phone: '604-339-4488', note: 'Specialists in investment property financing and equity extraction.', color: '#fd7e14' },
        { name: 'BC Mortgage Group', specialty: 'White Rock & South Surrey', region: 'South Surrey / White Rock', country: 'CA', phone: '604-531-4499', note: 'Local expertise in the South Surrey and White Rock market.', color: '#e83e8c' },
        { name: 'Nanaimo Mortgage Broker', specialty: 'Vancouver Island specialists', region: 'Vancouver Island', country: 'CA', phone: '250-585-2150', note: 'Deep knowledge of the Island market. Serves Nanaimo to Campbell River.', color: '#6f42c1' },
        { name: 'Parksville Qualicum Mortgage', specialty: 'Retirement & vacation properties', region: 'Parksville / Qualicum', country: 'CA', phone: '250-248-1341', note: 'Specializes in financing for retirees and vacation homes.', color: '#20c997' },
        // US brokers
        { name: 'Guaranteed Rate', specialty: 'Full-service national lender', region: 'All US', country: 'US', phone: '1-866-934-7283', note: 'Top-rated US mortgage lender with competitive rates and fast closings.', color: '#dc3545' },
        { name: 'LoanDepot', specialty: 'Digital-first mortgage platform', region: 'All US', country: 'US', phone: '1-888-983-3240', note: 'Major non-bank lender with streamlined online application.', color: '#fd7e14' },
        { name: 'New American Funding', specialty: 'First-time buyers, FHA/VA loans', region: 'California', country: 'US', phone: '1-800-450-2010', note: 'California-headquartered lender specializing in government-backed loans.', color: '#007bff' },
        { name: 'RPM Mortgage', specialty: 'Jumbo loans, luxury properties', region: 'Southern California', country: 'US', phone: '949-273-7700', note: 'Specialists in high-value properties in Orange County and SoCal.', color: '#6f42c1' }
    ];
    var html = '';
    brokers.forEach(function(b) {
        html += '<div style="background:white;border:1px solid #eee;border-radius:8px;padding:16px;border-left:4px solid ' + b.color + ';">';
        html += '<div style="font-weight:700;color:var(--primary);font-size:14px;margin-bottom:4px;">' + b.name + '</div>';
        html += '<div style="font-size:11px;color:#888;margin-bottom:8px;">' + b.specialty + '</div>';
        html += '<div style="font-size:12px;color:#555;margin-bottom:4px;"><strong>Region:</strong> ' + b.region + '</div>';
        html += '<div style="font-size:12px;color:#555;margin-bottom:8px;"><strong>Contact:</strong> ' + b.phone + '</div>';
        html += '<div style="font-size:11px;color:#888;font-style:italic;">' + b.note + '</div>';
        html += '</div>';
    });
    document.getElementById('brokerDirectory').innerHTML = html;
}

// ===== MORTGAGE PRE-QUALIFICATION =====
function calcPreQual() {
    var income = parseFloat(document.getElementById('pqIncome').value) || 0;
    var debts = parseFloat(document.getElementById('pqDebts').value) || 0;
    var down = parseFloat(document.getElementById('pqDown').value) || 0;
    var propTax = parseFloat(document.getElementById('pqTax').value) || 0;
    var heat = parseFloat(document.getElementById('pqHeat').value) || 0;
    var strata = parseFloat(document.getElementById('pqStrata').value) || 0;

    var monthlyIncome = income / 12;
    var contractRate = 5.0;
    var stressRate = Math.max(contractRate + 2, 5.25);
    var monthlyStressRate = stressRate / 100 / 12;
    var nPayments = 25 * 12;

    var gdsLimit = monthlyIncome * 0.39;
    var gdsAvailable = gdsLimit - propTax - heat - strata * 0.5;
    if (gdsAvailable < 0) gdsAvailable = 0;

    var tdsLimit = monthlyIncome * 0.44;
    var tdsAvailable = tdsLimit - propTax - heat - strata * 0.5 - debts;
    if (tdsAvailable < 0) tdsAvailable = 0;

    function mortgageFromPayment(payment) {
        if (payment <= 0 || monthlyStressRate <= 0) return 0;
        return payment * (Math.pow(1 + monthlyStressRate, nPayments) - 1) / (monthlyStressRate * Math.pow(1 + monthlyStressRate, nPayments));
    }

    var gdsMaxMortgage = mortgageFromPayment(gdsAvailable);
    var tdsMaxMortgage = mortgageFromPayment(tdsAvailable);
    var maxMortgage = Math.min(gdsMaxMortgage, tdsMaxMortgage);
    var maxPrice = maxMortgage + down;
    var downPct = maxPrice > 0 ? (down / maxPrice) * 100 : 0;
    var cmhcNeeded = downPct < 20;

    var maxPayment = Math.min(gdsAvailable, tdsAvailable);
    var actualGDS = monthlyIncome > 0 ? ((maxPayment + propTax + heat + strata * 0.5) / monthlyIncome * 100).toFixed(1) : '0';
    var actualTDS = monthlyIncome > 0 ? ((maxPayment + propTax + heat + strata * 0.5 + debts) / monthlyIncome * 100).toFixed(1) : '0';

    document.getElementById('pqMaxPrice').textContent = '$' + Math.round(maxPrice).toLocaleString();
    document.getElementById('pqGDSMax').textContent = '$' + Math.round(gdsMaxMortgage).toLocaleString();
    document.getElementById('pqTDSMax').textContent = '$' + Math.round(tdsMaxMortgage).toLocaleString();
    document.getElementById('pqStressRate').textContent = stressRate.toFixed(2) + '%';
    document.getElementById('pqGDS').textContent = actualGDS + '% (max 39%)';
    document.getElementById('pqTDS').textContent = actualTDS + '% (max 44%)';
    document.getElementById('pqCMHC').textContent = cmhcNeeded ? 'Yes (down < 20%)' : 'No (down >= 20%)';
}

// ===== MORTGAGE SCENARIO COMPARISON =====
function calcScenarios() {
    var scenarios = ['A', 'B', 'C'];
    var results = [];

    scenarios.forEach(function(s) {
        var price = parseFloat(document.getElementById('sc' + s + '_price').value) || 0;
        var downPct = parseFloat(document.getElementById('sc' + s + '_down').value) || 0;
        var rate = parseFloat(document.getElementById('sc' + s + '_rate').value) || 0;
        var amort = parseInt(document.getElementById('sc' + s + '_amort').value) || 25;

        var down = price * downPct / 100;
        var mortgage = price - down;
        var cmhc = 0;
        if (downPct < 20 && mortgage > 0) {
            if (downPct >= 15) cmhc = mortgage * 0.028;
            else if (downPct >= 10) cmhc = mortgage * 0.031;
            else cmhc = mortgage * 0.04;
            mortgage += cmhc;
        }

        var monthlyRate = rate / 100 / 12;
        var n = amort * 12;
        var payment = 0;
        if (monthlyRate > 0 && mortgage > 0) {
            payment = mortgage * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
        }
        var totalPaid = payment * n;
        var totalInterest = totalPaid - (price - down);

        results.push({ down: down, mortgage: mortgage, cmhc: cmhc, payment: payment, totalPaid: totalPaid, totalInterest: totalInterest });
    });

    var minPayment = Math.min.apply(null, results.map(function(r) { return r.payment || Infinity; }));
    var minInterest = Math.min.apply(null, results.map(function(r) { return r.totalInterest || Infinity; }));
    var minTotal = Math.min.apply(null, results.map(function(r) { return r.totalPaid || Infinity; }));

    var rows = [
        { label: 'Down Payment ($)', key: 'down' },
        { label: 'Mortgage Amount', key: 'mortgage' },
        { label: 'CMHC Insurance', key: 'cmhc' },
        { label: 'Monthly Payment', key: 'payment', best: minPayment },
        { label: 'Total Interest Paid', key: 'totalInterest', best: minInterest },
        { label: 'Total Cost of Ownership', key: 'totalPaid', best: minTotal }
    ];

    var html = '';
    rows.forEach(function(row) {
        html += '<tr><th>' + row.label + '</th>';
        results.forEach(function(r) {
            var val = Math.round(r[row.key]);
            var cls = '';
            if (row.best !== undefined && val === Math.round(row.best) && val > 0) cls = ' class="comp-better"';
            html += '<td' + cls + ' style="text-align:center;font-weight:600;">$' + val.toLocaleString() + '</td>';
        });
        html += '</tr>';
    });
    document.getElementById('scenarioResults').innerHTML = html;
}

