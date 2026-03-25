
function initializeFilters() {
    // Initialize region filters
    const regions = [...new Set(rawListings.map(l => l.region))].sort();
    const regionContainer = document.getElementById('regionFilters');
    regions.forEach(region => {
        const count = rawListings.filter(l => l.region === region).length;
        regionContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="region_${escapeHtml(region)}" value="${escapeHtml(region)}" class="region-filter">
                <label for="region_${escapeHtml(region)}">
                    <span>${escapeHtml(region)}</span>
                    <span class="checkbox-count">${count}</span>
                </label>
            </div>
        `;
    });

    // Initialize neighborhood filters
    const neighborhoods = [...new Set(rawListings.map(l => l.neighborhood))].sort();
    const neighborhoodContainer = document.getElementById('neighborhoodFilters');
    neighborhoods.forEach(nbr => {
        const count = rawListings.filter(l => l.neighborhood === nbr).length;
        neighborhoodContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="nbr_${escapeHtml(nbr)}" value="${escapeHtml(nbr)}" class="nbr-filter">
                <label for="nbr_${escapeHtml(nbr)}">
                    <span>${escapeHtml(nbr)}</span>
                    <span class="checkbox-count">${count}</span>
                </label>
            </div>
        `;
    });

    const types = [...new Set(rawListings.map(l => l.type))].sort();
    const typeContainer = document.getElementById('typeFilters');
    types.forEach(type => {
        const count = rawListings.filter(l => l.type === type).length;
        typeContainer.innerHTML += `
            <div class="checkbox-item">
                <input type="checkbox" id="type_${escapeHtml(type)}" value="${escapeHtml(type)}" class="type-filter">
                <label for="type_${escapeHtml(type)}">
                    <span>${escapeHtml(type)}</span>
                    <span class="checkbox-count">${count}</span>
                </label>
            </div>
        `;
    });

    // Auto-apply filters when dynamic checkboxes change
    regionContainer.addEventListener('change', function() { applyFilters(); });
    neighborhoodContainer.addEventListener('change', function() { applyFilters(); });
    typeContainer.addEventListener('change', function() { applyFilters(); });
}

function getScoreWeights() {
    var el;
    el = document.getElementById('wDOM'); var wDOM = el ? parseInt(el.value) : 5;
    el = document.getElementById('wBench'); var wBench = el ? parseInt(el.value) : 5;
    el = document.getElementById('wPPSF'); var wPPSF = el ? parseInt(el.value) : 5;
    el = document.getElementById('wLot'); var wLot = el ? parseInt(el.value) : 5;
    el = document.getElementById('wAge'); var wAge = el ? parseInt(el.value) : 5;
    return { dom: wDOM/5, bench: wBench/5, ppsf: wPPSF/5, lot: wLot/5, age: wAge/5 };
}

function calculateScore(listing) {
    var w = getScoreWeights();
    let score = 0;
    // DOM component (max 30 * weight)
    var domPts = 0;
    if (listing.dom > 150) domPts = 30;
    else if (listing.dom > 120) domPts = 26;
    else if (listing.dom > 90) domPts = 22;
    else if (listing.dom > 60) domPts = 16;
    else if (listing.dom > 45) domPts = 10;
    else if (listing.dom > 30) domPts = 5;
    score += domPts * w.dom;

    // Benchmark component (max 20 * weight)
    const benchmark = neighborhoodBenchmarks[listing.neighborhood]?.[listing.type] || 1500000;
    const premium = (listing.price / benchmark - 1) * 100;
    var benchPts = 0;
    if (premium < -10) benchPts = 20;
    else if (premium < -5) benchPts = 16;
    else if (premium < 0) benchPts = 12;
    else if (premium < 5) benchPts = 8;
    else if (premium < 15) benchPts = 4;
    score += benchPts * w.bench;

    // $/SqFt component (max 15 * weight)
    if (listing.sqft > 0) {
        const ppsf = listing.price / listing.sqft;
        const nbrAvgPpsf = getNeighborhoodAvgPpsf(listing.neighborhood, listing.type);
        if (nbrAvgPpsf > 0) {
            const pctDiff = (ppsf / nbrAvgPpsf - 1) * 100;
            var ppsfPts = 0;
            if (pctDiff < -15) ppsfPts = 15;
            else if (pctDiff < -5) ppsfPts = 10;
            else if (pctDiff < 5) ppsfPts = 5;
            score += ppsfPts * w.ppsf;
        }
    }

    score += trendBonus[listing.neighborhood] || 5;

    // Lot component (max 10 * weight)
    if (listing.lot) {
        const parts = listing.lot.split('x');
        if (parts.length === 2) {
            const area = parseInt(parts[0]) * parseInt(parts[1]);
            var lotPts = 0;
            if (area > 15000) lotPts = 10;
            else if (area > 8000) lotPts = 7;
            else if (area > 5000) lotPts = 4;
            else lotPts = 2;
            score += lotPts * w.lot;
        }
    }

    if (listing.waterView) score += 5;

    // Age component (max 10 * weight)
    if (listing.yearBuilt) {
        const age = 2026 - listing.yearBuilt;
        var agePts = 0;
        if (age < 5) agePts = 10;
        else if (age < 15) agePts = 7;
        else if (age < 30) agePts = 4;
        else if (age < 50) agePts = 2;
        score += agePts * w.age;
    }

    // Assessment ratio bonus/penalty (BC Assessment data only available for BC listings)
    var _listingJur = getJurisdictionForListing(listing);
    if (_listingJur === 'CA-BC') {
        var _bcaScore = getAssessment(listing.listingIndex);
        if (_bcaScore && _bcaScore.assessedTotal) {
            var _ratio = listing.price / _bcaScore.assessedTotal;
            if (_ratio < 0.90) score += 3;
            else if (_ratio < 0.95) score += 2;
            else if (_ratio < 1.00) score += 1;
            else if (_ratio > 1.15) score -= 1;
        }
    }

    return Math.min(100, Math.max(0, Math.round(score)));
}

function getNeighborhoodAvgPpsf(neighborhood, type) {
    const nbrListings = rawListings.filter(l => l.neighborhood === neighborhood && l.type === type && l.sqft > 0);
    if (nbrListings.length === 0) return 0;
    const totalPpsf = nbrListings.reduce((sum, l) => sum + (l.price / l.sqft), 0);
    return totalPpsf / nbrListings.length;
}

function calculateOffers(listing) {
    const benchmark = neighborhoodBenchmarks[listing.neighborhood]?.[listing.type] || 1500000;
    const asking = listing.price;
    const dom = listing.dom;

    // DOM-based discount tiers (how aggressive to negotiate)
    let domDiscount;
    if (dom > 120) domDiscount = 0.30;
    else if (dom > 90) domDiscount = 0.25;
    else if (dom > 60) domDiscount = 0.19;
    else if (dom > 45) domDiscount = 0.14;
    else if (dom > 30) domDiscount = 0.10;
    else domDiscount = 0.05;

    // All calculations are based on the ASKING price with DOM-adjusted discounts
    // The benchmark informs how overpriced/underpriced the listing is

    // Aggressive: DOM-based deep discount from asking
    const aggDiscount = dom > 120 ? 0.28 : (dom > 90 ? 0.22 : (dom > 60 ? 0.18 : (dom > 45 ? 0.14 : (dom > 30 ? 0.10 : 0.07))));
    let aggressive = Math.round(asking * (1 - aggDiscount));

    // Strategic: moderate discount from asking
    const strDiscount = dom > 120 ? 0.15 : (dom > 90 ? 0.12 : (dom > 60 ? 0.10 : (dom > 45 ? 0.08 : (dom > 30 ? 0.06 : 0.04))));
    let strategic = Math.round(asking * (1 - strDiscount));

    // Competitive: small discount from asking
    const compDiscount = dom > 120 ? 0.08 : (dom > 90 ? 0.07 : (dom > 60 ? 0.05 : (dom > 45 ? 0.04 : (dom > 30 ? 0.03 : 0.02))));
    let competitive = Math.round(asking * (1 - compDiscount));

    // Bonus discount if asking is above benchmark (overpriced property = more room to negotiate)
    if (asking > benchmark && benchmark > 0) {
        const overPricePct = (asking / benchmark - 1);
        const bonusDiscount = Math.min(overPricePct * 0.3, 0.10); // up to 10% extra
        aggressive = Math.round(aggressive * (1 - bonusDiscount));
        strategic = Math.round(strategic * (1 - bonusDiscount * 0.5));
    }

    // Ensure proper ordering: aggressive < strategic < competitive
    if (strategic <= aggressive) strategic = Math.round(aggressive * 1.08);
    if (competitive <= strategic) competitive = Math.round(strategic * 1.05);

    // Final safety: nothing above asking
    aggressive = Math.min(aggressive, asking - 1);
    strategic = Math.min(strategic, asking - 1);
    competitive = Math.min(competitive, asking - 1);

    return { aggressive, strategic, competitive };
}

function applyFilters() {
    const selectedRegions = [...document.querySelectorAll('.region-filter:checked')].map(el => el.value);
    const selectedNeighborhoods = [...document.querySelectorAll('.nbr-filter:checked')].map(el => el.value);
    const selectedTypes = [...document.querySelectorAll('.type-filter:checked')].map(el => el.value);
    const priceMin = parseFloat(document.getElementById('priceMin').value) || 0;
    const priceMax = parseFloat(document.getElementById('priceMax').value) || Infinity;
    const bedroomMin = parseInt(document.getElementById('bedroomMin').value) || 0;
    const bathroomMin = parseInt(document.getElementById('bathroomMin').value) || 0;
    const domMin = parseFloat(document.getElementById('domMin').value) || 0;
    const domMax = parseFloat(document.getElementById('domMax').value) || Infinity;
    const yearMin = parseFloat(document.getElementById('yearMin').value) || 0;
    const yearMax = parseFloat(document.getElementById('yearMax').value) || Infinity;
    const scoreMin = parseFloat(document.getElementById('scoreMin').value) || 0;
    const scoreMax = parseFloat(document.getElementById('scoreMax').value) || 100;
    const filterWaterView = document.getElementById('filterWaterView').checked;
    const filterHasLot = document.getElementById('filterHasLot').checked;
    const searchTerm = (document.getElementById('searchBox').value || '').toLowerCase().trim();
    const invMinCap = investorModeActive ? (parseFloat(document.getElementById('investorMinCap').value) || 0) : 0;
    const invMinCF = investorModeActive ? (parseFloat(document.getElementById('investorMinCF').value) || -Infinity) : -Infinity;
    const selectedTags = [...document.querySelectorAll('.tag-filter:checked')].map(function(el) { return el.id.replace('tag_', ''); });
    const filterHasNotes = selectedTags.indexOf('hasNotes') >= 0;
    const filterTags = selectedTags.filter(function(t) { return t !== 'hasNotes'; });

    filteredListings = rawListings.filter((listing, idx) => {
        listing.score = calculateScore(listing);
        listing.listingIndex = idx;

        if (searchTerm && !(listing.addr.toLowerCase().includes(searchTerm) || listing.neighborhood.toLowerCase().includes(searchTerm) || listing.agent.toLowerCase().includes(searchTerm) || listing.type.toLowerCase().includes(searchTerm) || listing.region.toLowerCase().includes(searchTerm))) return false;
        if (selectedRegions.length > 0 && !selectedRegions.includes(listing.region)) return false;
        if (selectedNeighborhoods.length > 0 && !selectedNeighborhoods.includes(listing.neighborhood)) return false;
        if (selectedTypes.length > 0 && !selectedTypes.includes(listing.type)) return false;
        if (listing.price < priceMin || listing.price > priceMax) return false;
        if (listing.beds < bedroomMin) return false;
        if (listing.baths < bathroomMin) return false;
        if (listing.dom < domMin || listing.dom > domMax) return false;
        if (listing.yearBuilt < yearMin || listing.yearBuilt > yearMax) return false;
        if (listing.score < scoreMin || listing.score > scoreMax) return false;
        if (filterWaterView && !listing.waterView) return false;
        if (filterHasLot && !listing.lot) return false;
        if (filterHasNotes && !listingNotes[idx]) return false;
        if (filterTags.length > 0) {
            var lt = listingTags[idx] || [];
            if (!filterTags.some(function(t) { return lt.indexOf(t) >= 0; })) return false;
        }

        // Investor mode filters
        if (investorModeActive && (invMinCap > 0 || invMinCF > -Infinity)) {
            var metrics = estimateInvestorMetrics(listing);
            listing._investorMetrics = metrics;
            if (metrics.capRate < invMinCap) return false;
            if (metrics.cashFlow < invMinCF) return false;
        } else if (investorModeActive) {
            listing._investorMetrics = estimateInvestorMetrics(listing);
        }

        return true;
    });
    
    const sortBy = document.getElementById('sortBy').value;
    sortListings(sortBy);
    
    currentPage = 0;
    updateStats();
    renderCurrentTab();
}

// 13B: Sort with address tiebreaker for stable ordering
function stableSort(a, b, primary) {
    return primary || a.addr.localeCompare(b.addr);
}

function sortListings(sortBy) {
    switch(sortBy) {
        case 'score-desc':
            filteredListings.sort((a, b) => stableSort(a, b, b.score - a.score));
            break;
        case 'dom-desc':
            filteredListings.sort((a, b) => stableSort(a, b, b.dom - a.dom));
            break;
        case 'price-asc':
            filteredListings.sort((a, b) => stableSort(a, b, a.price - b.price));
            break;
        case 'price-desc':
            filteredListings.sort((a, b) => stableSort(a, b, b.price - a.price));
            break;
        case 'ppsf-asc':
            filteredListings.sort((a, b) => {
                const ppsfA = a.sqft > 0 ? a.price / a.sqft : Infinity;
                const ppsfB = b.sqft > 0 ? b.price / b.sqft : Infinity;
                return stableSort(a, b, ppsfA - ppsfB);
            });
            break;
        case 'gap-desc':
            filteredListings.sort((a, b) => {
                const benchmarkA = neighborhoodBenchmarks[a.neighborhood]?.[a.type] || 1500000;
                const benchmarkB = neighborhoodBenchmarks[b.neighborhood]?.[b.type] || 1500000;
                return stableSort(a, b, (benchmarkB - b.price) - (benchmarkA - a.price));
            });
            break;
        case 'caprate-desc':
            filteredListings.sort((a, b) => {
                const mA = a._investorMetrics || estimateInvestorMetrics(a);
                const mB = b._investorMetrics || estimateInvestorMetrics(b);
                return stableSort(a, b, mB.capRate - mA.capRate);
            });
            break;
        case 'cashflow-desc':
            filteredListings.sort((a, b) => {
                const mA = a._investorMetrics || estimateInvestorMetrics(a);
                const mB = b._investorMetrics || estimateInvestorMetrics(b);
                return stableSort(a, b, mB.cashFlow - mA.cashFlow);
            });
            break;
    }
}

function resetFilters() {
    document.querySelectorAll('.nbr-filter, .type-filter').forEach(el => el.checked = false);
    document.getElementById('priceMin').value = '';
    document.getElementById('priceMax').value = '';
    document.getElementById('bedroomMin').value = '';
    document.getElementById('bathroomMin').value = '';
    document.getElementById('domMin').value = '';
    document.getElementById('domMax').value = '';
    document.getElementById('yearMin').value = '';
    document.getElementById('yearMax').value = '';
    document.getElementById('scoreMin').value = '';
    document.getElementById('scoreMax').value = '';
    document.getElementById('filterWaterView').checked = false;
    document.getElementById('filterHasLot').checked = false;
    document.querySelectorAll('.tag-filter').forEach(function(el) { el.checked = false; });
    document.getElementById('investorModeToggle').checked = false;
    document.getElementById('investorMinCap').value = '';
    document.getElementById('investorMinCF').value = '';
    investorModeActive = false;
    document.getElementById('investorModeOptions').style.display = 'none';
    document.getElementById('sortBy').value = 'score-desc';
    applyFilters();
}

function updateStats() {
    const totalProps = filteredListings.length;
    const avgPrice = totalProps > 0 ? filteredListings.reduce((sum, l) => sum + l.price, 0) / totalProps : 0;
    const avgDOM = totalProps > 0 ? filteredListings.reduce((sum, l) => sum + l.dom, 0) / totalProps : 0;
    const avgScore = totalProps > 0 ? filteredListings.reduce((sum, l) => sum + l.score, 0) / totalProps : 0;
    const hotDeals = filteredListings.filter(l => l.score >= 70).length;

    document.getElementById('totalProperties').textContent = totalProps;
    document.getElementById('avgPrice').textContent = formatPrice(avgPrice);
    document.getElementById('avgDOM').textContent = Math.round(avgDOM);
    document.getElementById('avgScore').textContent = Math.round(avgScore);
    document.getElementById('hotDeals').textContent = hotDeals;

    // 13C: Show data freshness in stats bar
    var tsEl = document.getElementById('dataTimestamp');
    if (tsEl && window._dataAsOf) {
        var d = new Date(window._dataAsOf);
        var daysAgo = Math.floor((new Date() - d) / (1000*60*60*24));
        tsEl.textContent = d.toLocaleDateString('en-CA');
        if (daysAgo > 7) tsEl.style.color = 'var(--danger)';
        else tsEl.style.color = '';
    }
}

function switchTab(tabName) {
    document.title = (tabTitles[tabName] || 'Dashboard') + ' — BC Real Estate Dashboard';
    updateBottomNav(tabName);
    // Sync mobile tab dropdown
    var mobileSelect = document.getElementById('mobileTabSelect');
    if (mobileSelect) mobileSelect.value = tabName;
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

    if (tabName === 'map') {
        document.getElementById('map').classList.add('active');
        initializeMapTab();
    } else {
        document.getElementById(tabName).classList.add('active');
        if (tabName === 'dashboard') initializeDashboard();
        if (tabName === 'neighborhood') initializeNeighborhoodTab();
        if (tabName === 'deals') initializeDealsTab();
        if (tabName === 'offers') initializeOffersTab();
        if (tabName === 'mortgage') calcMortgage();
        if (tabName === 'shortlist') initializeShortlistTab();
        if (tabName === 'listings') renderListingsTable();
        if (tabName === 'myoffers') initializeMyOffers();
        if (tabName === 'roi') initializeROI();
        if (tabName === 'lenders') initializeLenders();
        if (tabName === 'buyerprofile') loadBuyerProfile();
        if (tabName === 'contactlog') initializeContactLog();
        if (tabName === 'viewings') initializeViewings();
        if (tabName === 'documents') initializeDocuments();
        if (tabName === 'pricehistory') renderPriceHistory();
        if (tabName === 'neighborhooddata') renderAreaIntel();
        if (tabName === 'datafreshness') initializeDataFreshness();
        if (tabName === 'bcassessment') renderBcaWorklist();
    }
}

function switchTabDirect(tabName) {
    document.title = (tabTitles[tabName] || 'Dashboard') + ' — BC Real Estate Dashboard';
    updateBottomNav(tabName);
    // Sync mobile tab dropdown
    var mobileSelect = document.getElementById('mobileTabSelect');
    if (mobileSelect) mobileSelect.value = tabName;
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'" + tabName + "'")) {
            btn.classList.add('active');
        }
    });
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.getElementById(tabName).classList.add('active');
    if (tabName === 'dashboard') initializeDashboard();
    if (tabName === 'neighborhood') initializeNeighborhoodTab();
    if (tabName === 'deals') initializeDealsTab();
    if (tabName === 'offers') initializeOffersTab();
    if (tabName === 'mortgage') calcMortgage();
    if (tabName === 'shortlist') initializeShortlistTab();
    if (tabName === 'listings') renderListingsTable();
    if (tabName === 'map') initializeMapTab();
    if (tabName === 'myoffers') initializeMyOffers();
    if (tabName === 'roi') initializeROI();
    if (tabName === 'lenders') initializeLenders();
    if (tabName === 'buyerprofile') loadBuyerProfile();
    if (tabName === 'contactlog') initializeContactLog();
    if (tabName === 'viewings') initializeViewings();
    if (tabName === 'documents') initializeDocuments();
    if (tabName === 'pricehistory') renderPriceHistory();
    if (tabName === 'neighborhooddata') renderAreaIntel();
    if (tabName === 'datafreshness') initializeDataFreshness();
    if (tabName === 'privateoffers') renderPrivateTargets();
    if (tabName === 'bcassessment') renderBcaWorklist();
    if (tabName === 'norealtorguide' || tabName === 'help') { /* static tabs */ }
}

function toggleAccordion(btn) {
    var panel = btn.nextElementSibling;
    var isActive = btn.classList.contains('active');
    btn.classList.toggle('active');
    panel.style.display = isActive ? 'none' : 'block';
}

function renderCurrentTab() {
    const activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    const tabId = activeTab.id;
    if (tabId === 'dashboard') initializeDashboard();
    if (tabId === 'listings') renderListingsTable();
    if (tabId === 'neighborhood') initializeNeighborhoodTab();
    if (tabId === 'deals') initializeDealsTab();
    if (tabId === 'offers') initializeOffersTab();
    if (tabId === 'shortlist') initializeShortlistTab();
    if (tabId === 'map') initializeMapTab();
    if (tabId === 'myoffers') initializeMyOffers();
}

function renderListingsTable() {
    // Update table header for investor mode
    var investorTh = investorModeActive ? '<th class="sortable-th" onclick="sortTable(\'caprate-desc\')" style="color:#6f42c1;">Cap Rate</th><th class="sortable-th" onclick="sortTable(\'cashflow-desc\')" style="color:#6f42c1;">Cash Flow</th>' : '';
    document.getElementById('listingsTableHead').innerHTML = '<tr><th style="width:40px;">★</th><th class="sortable-th" onclick="sortTable(\'addr\')">Address</th><th class="sortable-th" onclick="sortTable(\'neighborhood\')">Neighborhood</th><th class="sortable-th" onclick="sortTable(\'type\')">Type</th><th class="sortable-th" onclick="sortTable(\'price-asc\')">Price</th><th>Beds/Baths</th><th class="sortable-th" onclick="sortTable(\'sqft\')">SqFt</th><th class="sortable-th" onclick="sortTable(\'ppsf-asc\')">$/SqFt</th><th class="sortable-th" onclick="sortTable(\'dom-desc\')">DOM</th><th class="sortable-th" onclick="sortTable(\'year\')">Year</th><th class="sortable-th" onclick="sortTable(\'score-desc\')">Score</th>' + investorTh + '<th>Agg. Offer</th><th>Agent</th></tr>';

    const start = currentPage * listingsPerPage;
    const end = start + listingsPerPage;
    const pageData = filteredListings.slice(start, end);

    if (filteredListings.length === 0) {
        document.getElementById('listingsTableBody').innerHTML = '<tr><td colspan="13" style="text-align:center;padding:40px;color:#999;"><div style="font-size:18px;font-weight:700;color:#666;margin-bottom:8px;">No Properties Found</div><p>Try adjusting your filters or search terms</p></td></tr>';
        document.getElementById('listingsPagination').innerHTML = '';
        document.getElementById('listingCountLabel').textContent = '0 properties';
        if (currentListingView === 'cards') {
            document.getElementById('cardGridContainer').innerHTML = '<div style="text-align:center;padding:40px;color:#999;grid-column:1/-1;"><div style="font-size:18px;font-weight:700;color:#666;margin-bottom:8px;">No Properties Found</div><p>Try adjusting your filters or search terms</p></div>';
        }
        return;
    }

    let html = '';
    pageData.forEach((listing) => {
        const offers = calculateOffers(listing);
        const ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;
        const isShortlisted = shortlistedIds.has(listing.listingIndex);
        const starClass = isShortlisted ? 'shortlisted' : 'not-shortlisted';
        const scoreClass = getScoreClass(listing.score);
        
        var investorCols = '';
        if (investorModeActive) {
            const im = listing._investorMetrics || estimateInvestorMetrics(listing);
            const capColor = im.capRate >= 4 ? 'var(--success)' : im.capRate >= 2 ? '#856404' : 'var(--danger)';
            const cfColor = im.cashFlow >= 0 ? 'var(--success)' : 'var(--danger)';
            investorCols = `<td style="font-weight:600;color:${capColor};">${im.capRate.toFixed(1)}%</td><td style="font-weight:600;color:${cfColor};">${im.cashFlow >= 0 ? '' : '-'}$${Math.abs(im.cashFlow).toLocaleString()}</td>`;
        }
        html += `
            <tr onclick="showDetailModal(${listing.listingIndex})">
                <td><span class="star-toggle ${starClass}" onclick="event.stopPropagation(); toggleShortlist(${listing.listingIndex})" role="button" aria-label="${isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}" tabindex="0">★</span></td>
                <td><span class="water-view-icon">${listing.waterView ? '🌊' : ''}</span>${escapeHtml(listing.addr)}${getListingBadge(listing)}${(function(){var _a=getAssessment(listing.listingIndex);return _a&&_a.assessedTotal?getRatioBadgeHtml(askingToAssessedRatio(listing.price,_a.assessedTotal)):''})()}${getListingTagBadges(listing.listingIndex)}</td>
                <td>${escapeHtml(listing.neighborhood)}</td>
                <td>${escapeHtml(listing.type)}</td>
                <td>${formatPrice(listing.price)}</td>
                <td>${fmtVal(listing.beds)}/${fmtVal(listing.baths)}</td>
                <td>${fmtSqft(listing.sqft)}</td>
                <td>${ppsf > 0 ? ppsf.toLocaleString() : '—'}</td>
                <td>${listing.dom}</td>
                <td>${fmtVal(listing.yearBuilt)}</td>
                <td><span class="score-badge ${scoreClass}">${Math.round(listing.score)}</span></td>
                ${investorCols}
                <td>${formatPrice(offers.aggressive)}</td>
                <td>${escapeHtml(listing.agent)}</td>
            </tr>
        `;
    });
    
    document.getElementById('listingsTableBody').innerHTML = html;
    
    const totalPages = Math.ceil(filteredListings.length / listingsPerPage);
    let paginationHtml = '';
    
    if (currentPage > 0) {
        paginationHtml += '<button class="btn-primary" onclick="previousPage()">← Previous</button>';
    }
    
    paginationHtml += `<span>Page ${currentPage + 1} of ${totalPages}</span>`;
    
    if (currentPage < totalPages - 1) {
        paginationHtml += '<button class="btn-primary" onclick="nextPage()">Next →</button>';
    }

    document.getElementById('listingsPagination').innerHTML = paginationHtml;

    // Update listing count label
    document.getElementById('listingCountLabel').textContent = filteredListings.length + ' properties';

    // If card view is active, also render cards
    if (currentListingView === 'cards') {
        renderCardGrid();
    }
}

function nextPage() {
    const totalPages = Math.ceil(filteredListings.length / listingsPerPage);
    if (currentPage < totalPages - 1) {
        currentPage++;
        renderListingsTable();
    }
}

function previousPage() {
    if (currentPage > 0) {
        currentPage--;
        renderListingsTable();
    }
}

// Google Maps API key for Street View imagery
// Set this to your Google Maps Static API key to enable Street View fallback
var GOOGLE_MAPS_API_KEY = localStorage.getItem('googleMapsApiKey') || '';

function saveGoogleApiKey() {
    var key = document.getElementById('googleApiKeyInput').value.trim();
    if (!key) { alert('Please enter an API key.'); return; }
    localStorage.setItem('googleMapsApiKey', key);
    GOOGLE_MAPS_API_KEY = key;
    updateApiKeyStatus();
    // Refresh card view to use new images
    if (typeof renderCardGrid === 'function' && currentListingView === 'cards') renderCardGrid();
    alert('API key saved! Property card images will now use Google Street View.');
}

function clearGoogleApiKey() {
    localStorage.removeItem('googleMapsApiKey');
    GOOGLE_MAPS_API_KEY = '';
    document.getElementById('googleApiKeyInput').value = '';
    updateApiKeyStatus();
    if (typeof renderCardGrid === 'function' && currentListingView === 'cards') renderCardGrid();
}

function updateApiKeyStatus() {
    var statusEl = document.getElementById('apiKeyStatus');
    var headerIndicator = document.getElementById('streetViewIndicator');
    if (GOOGLE_MAPS_API_KEY) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#28a745;">\u2713 API key configured. Street View images are active.</span>';
        if (headerIndicator) headerIndicator.innerHTML = '<span style="color:#28a745;font-size:11px;">\u2713 Street View Active</span>';
    } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:#999;">No API key configured. Using map tile thumbnails.</span>';
        if (headerIndicator) headerIndicator.innerHTML = '<span style="color:#999;font-size:11px;">Street View: Not configured</span>';
    }
    // Also populate the input field
    var input = document.getElementById('googleApiKeyInput');
    if (input && GOOGLE_MAPS_API_KEY && !input.value) input.value = GOOGLE_MAPS_API_KEY;
}

// Offer tracking status (uses GitHub config)
function updateOfferTrackingStatus() {
    var statusEl = document.getElementById('offerTrackingGithubStatus');
    var repo = localStorage.getItem('githubFeedbackRepo');
    var token = localStorage.getItem('githubFeedbackToken');
    if (repo && token) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#28a745;">\u2713 Offer tracking active. Events will be created as issues in <strong>' + repo.replace(/</g, '&lt;') + '</strong>.</span>';
    } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:#999;">Offer tracking inactive. Configure GitHub integration below to activate.</span>';
    }
}

// GitHub feedback integration functions
function saveGitHubConfig() {
    var repo = document.getElementById('githubRepoInput').value.trim();
    var token = document.getElementById('githubTokenInput').value.trim();
    if (!repo || !token) { alert('Please enter both a repository (owner/repo) and a Personal Access Token.'); return; }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) { alert('Repository must be in the format owner/repo (e.g. patricknovak/global-realestate-dashboard).'); return; }
    localStorage.setItem('githubFeedbackRepo', repo);
    localStorage.setItem('githubFeedbackToken', token);
    updateGitHubConfigStatus();
    alert('GitHub feedback integration saved! Feedback submissions will now create GitHub Issues.');
}

function clearGitHubConfig() {
    localStorage.removeItem('githubFeedbackRepo');
    localStorage.removeItem('githubFeedbackToken');
    document.getElementById('githubRepoInput').value = '';
    document.getElementById('githubTokenInput').value = '';
    updateGitHubConfigStatus();
}

function updateGitHubConfigStatus() {
    var statusEl = document.getElementById('githubConfigStatus');
    var noteEl = document.getElementById('feedbackConfigNote');
    var repo = localStorage.getItem('githubFeedbackRepo');
    var token = localStorage.getItem('githubFeedbackToken');
    if (repo && token) {
        if (statusEl) statusEl.innerHTML = '<span style="color:#28a745;">\u2713 GitHub integration configured for <strong>' + repo.replace(/</g, '&lt;') + '</strong>. Feedback will create issues.</span>';
        if (noteEl) noteEl.innerHTML = 'Feedback is submitted as GitHub Issues to <strong>' + repo.replace(/</g, '&lt;') + '</strong>. Each submission creates a labeled issue for transparent tracking.';
    } else {
        if (statusEl) statusEl.innerHTML = '<span style="color:#999;">No GitHub integration configured. Feedback form is inactive.</span>';
        if (noteEl) noteEl.innerHTML = 'Feedback is submitted as GitHub Issues. Configure your GitHub token and repository in the <strong>GitHub Feedback Integration</strong> settings section above to activate.';
    }
    var repoInput = document.getElementById('githubRepoInput');
    if (repoInput && repo && !repoInput.value) repoInput.value = repo;
    updateOfferTrackingStatus();
}

function submitFeedbackToGitHub(form) {
    var status = document.getElementById('feedbackStatus');
    var repo = localStorage.getItem('githubFeedbackRepo');
    var token = localStorage.getItem('githubFeedbackToken');

    if (!repo || !token) {
        status.textContent = 'GitHub integration is not configured. Please set it up in the settings above.';
        status.style.color = '#dc3545';
        return;
    }

    var name = form.querySelector('[name="name"]').value.trim();
    var email = form.querySelector('[name="email"]').value.trim();
    var type = form.querySelector('[name="type"]').value;
    var message = form.querySelector('[name="message"]').value.trim();

    // Map feedback types to GitHub labels
    var labelMap = {
        'Bug Report': ['bug'],
        'Feature Request': ['enhancement'],
        'New Region Request': ['enhancement', 'new region'],
        'General Feedback': ['feedback']
    };
    var labels = labelMap[type] || ['feedback'];

    var title = '[' + type + '] ' + (message.length > 80 ? message.substring(0, 80) + '...' : message);
    var body = '## ' + type + '\n\n'
        + message + '\n\n'
        + '---\n'
        + '**Submitted by:** ' + name + ' (' + email + ')\n'
        + '**Date:** ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + '\n'
        + '**Source:** Real Estate Investment Dashboard Feedback Form';

    status.textContent = 'Submitting...';
    status.style.color = '#666';

    fetch('https://api.github.com/repos/' + repo + '/issues', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: title, body: body, labels: labels })
    })
    .then(function(r) {
        if (r.ok || r.status === 201) {
            return r.json().then(function(data) {
                status.innerHTML = 'Thank you! Your feedback has been submitted as <a href="' + data.html_url + '" target="_blank" rel="noopener" style="color:#28a745;text-decoration:underline;">Issue #' + data.number + '</a>.';
                status.style.color = '#28a745';
                form.reset();
            });
        } else if (r.status === 401) {
            status.textContent = 'Authentication failed. The GitHub token may be invalid or expired.';
            status.style.color = '#dc3545';
        } else if (r.status === 404) {
            status.textContent = 'Repository not found. Please check the repository name in settings.';
            status.style.color = '#dc3545';
        } else if (r.status === 410) {
            status.textContent = 'Issues are disabled for this repository.';
            status.style.color = '#dc3545';
        } else {
            return r.json().then(function(data) {
                status.textContent = 'Error: ' + (data.message || 'Unknown error. Please try again.');
                status.style.color = '#dc3545';
            });
        }
    })
    .catch(function() {
        status.textContent = 'Network error. Please check your connection and try again.';
        status.style.color = '#dc3545';
    });
}

function trackOfferGeneration(data) {
    var repo = localStorage.getItem('githubFeedbackRepo');
    var token = localStorage.getItem('githubFeedbackToken');
    if (!repo || !token) return;

    var address = data.propertyAddress || 'Unknown';
    var title = '[Offer Tracking] ' + address;
    var body = '## Offer Generated\n\n'
        + '| Field | Value |\n|---|---|\n'
        + '| **Property** | ' + address + ' |\n'
        + '| **Type** | ' + (data.propertyType || 'N/A') + ' |\n'
        + '| **Asking Price** | ' + (data.askingPrice || 'N/A') + ' |\n'
        + '| **Offer Price** | ' + (data.offerPrice || 'N/A') + ' |\n'
        + '| **Buyer** | ' + (data.buyerName || 'N/A') + ' |\n'
        + '| **Email** | ' + (data.buyerEmail || 'N/A') + ' |\n'
        + '| **Phone** | ' + (data.buyerPhone || 'N/A') + ' |\n'
        + '| **Company** | ' + (data.buyerCompany || 'N/A') + ' |\n'
        + '| **Timestamp** | ' + new Date().toISOString() + ' |\n';

    fetch('https://api.github.com/repos/' + repo + '/issues', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: title, body: body, labels: ['offer-tracking'] })
    }).catch(function() {}); // Silently fail
}

// Map tile thumbnail URL generator (OSM fallback)
function getMapThumbnailUrl(lat, lng, zoom) {
    zoom = zoom || 16;
    var n = Math.pow(2, zoom);
    var x = Math.floor((lng + 180) / 360 * n);
    var latRad = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return 'https://tile.openstreetmap.org/' + zoom + '/' + x + '/' + y + '.png';
}

// Get the best available property image URL
function getPropertyImageUrl(listing) {
    // 1. Use direct property photo if available
    if (listing.imageUrl) return listing.imageUrl;
    // 2. Use Google Street View if API key is configured
    if (GOOGLE_MAPS_API_KEY) {
        return 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=' +
            listing.latitude + ',' + listing.longitude +
            '&fov=90&pitch=10&source=outdoor&key=' + GOOGLE_MAPS_API_KEY;
    }
    // 3. Fallback to OSM map tile
    return getMapThumbnailUrl(listing.latitude, listing.longitude, 15);
}

// Track current view mode
var currentListingView = 'table';

function switchListingView(view) {
    currentListingView = view;
    var tableWrapper = document.querySelector('#listings > div:nth-child(2)');
    var cardGrid = document.getElementById('cardGridContainer');
    var tableBtn = document.getElementById('tableViewBtn');
    var cardBtn = document.getElementById('cardViewBtn');

    if (view === 'table') {
        tableWrapper.style.display = 'flex';
        cardGrid.style.display = 'none';
        tableBtn.classList.add('active');
        cardBtn.classList.remove('active');
    } else {
        tableWrapper.style.display = 'none';
        cardGrid.style.display = 'grid';
        tableBtn.classList.remove('active');
        cardBtn.classList.add('active');
        renderCardGrid();
    }
}

function renderCardGrid() {
    var start = currentPage * listingsPerPage;
    var end = start + listingsPerPage;
    var pageData = filteredListings.slice(start, end);

    var html = '';
    pageData.forEach(function(listing) {
        var isShortlisted = shortlistedIds.has(listing.listingIndex);
        var starClass = isShortlisted ? 'shortlisted' : 'not-shortlisted';
        var scoreClass = getScoreClass(listing.score);
        var score = Math.round(listing.score);
        var ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;
        var imgUrl = getPropertyImageUrl(listing);

        html += '<div class="property-card" onclick="showDetailModal(' + listing.listingIndex + ')">';
        html += '<div class="property-card-img-wrapper">';
        html += '<img class="property-card-img" src="' + imgUrl + '" alt="Property" loading="lazy" onerror="this.onerror=null; var fallback=getMapThumbnailUrl(' + listing.latitude + ',' + listing.longitude + ',15); if(this.src!==fallback){this.src=fallback;}else{this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22160%22><rect fill=%22%23e9ecef%22 width=%22300%22 height=%22160%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23aaa%22 font-size=%2214%22>No Image</text></svg>\';}">';
        html += '<span class="property-card-type-badge">' + listing.type + '</span>';
        if (listing.waterView) html += '<span class="property-card-water">🌊</span>';
        html += '<span class="property-card-star ' + starClass + '" onclick="event.stopPropagation(); toggleShortlist(' + listing.listingIndex + '); renderCardGrid();">★</span>';
        var isComparing = comparisonSet.has(listing.listingIndex);
        html += '<span style="position:absolute;top:8px;right:40px;background:' + (isComparing ? 'var(--secondary)' : 'rgba(0,0,0,0.5)') + ';color:white;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:50%;cursor:pointer;font-size:14px;" onclick="event.stopPropagation(); toggleComparison(' + listing.listingIndex + ', event); renderCardGrid(); updateComparisonBar();" title="' + (isComparing ? 'Remove from comparison' : 'Add to comparison') + '">⚖</span>';
        html += '</div>';
        html += '<div class="property-card-body">';
        html += '<div class="property-card-price">' + formatPrice(listing.price) + '</div>';
        html += '<div class="property-card-addr">' + escapeHtml(listing.addr) + getListingBadge(listing);
        var _bcaCard = getAssessment(listing.listingIndex);
        if (_bcaCard && _bcaCard.assessedTotal) { html += getRatioBadgeHtml(askingToAssessedRatio(listing.price, _bcaCard.assessedTotal)); }
        html += '</div>';
        var tagBadges = getListingTagBadges(listing.listingIndex);
        if (tagBadges) html += '<div style="padding:0 12px 4px;line-height:1.6;">' + tagBadges + '</div>';
        html += '<div class="property-card-nbr">' + listing.neighborhood + ' &middot; ' + listing.region + '</div>';
        html += '<div class="property-card-details">';
        html += '<span><strong>' + fmtVal(listing.beds) + '</strong> Beds</span>';
        html += '<span><strong>' + fmtVal(listing.baths) + '</strong> Baths</span>';
        if (listing.sqft > 0) html += '<span><strong>' + listing.sqft.toLocaleString() + '</strong> sqft</span>';
        if (ppsf > 0) html += '<span><strong>$' + ppsf.toLocaleString() + '</strong>/sqft</span>';
        if (listing.yearBuilt > 0) html += '<span>Built <strong>' + listing.yearBuilt + '</strong></span>';
        html += '</div>';
        html += '</div>';
        if (investorModeActive) {
            var im = listing._investorMetrics || estimateInvestorMetrics(listing);
            var capColor = im.capRate >= 4 ? '#155724' : im.capRate >= 2 ? '#856404' : '#721c24';
            var capBg = im.capRate >= 4 ? '#d4edda' : im.capRate >= 2 ? '#fff3cd' : '#f8d7da';
            var cfColor = im.cashFlow >= 0 ? '#155724' : '#721c24';
            html += '<div style="display:flex;justify-content:space-between;padding:6px 12px;background:' + capBg + ';font-size:11px;">';
            html += '<span style="color:' + capColor + ';font-weight:600;">Cap: ' + im.capRate.toFixed(1) + '%</span>';
            html += '<span style="color:' + cfColor + ';font-weight:600;">CF: ' + (im.cashFlow >= 0 ? '' : '-') + '$' + Math.abs(im.cashFlow).toLocaleString() + '/mo</span>';
            html += '<span style="color:#666;">Rent: $' + im.rent.toLocaleString() + '/mo</span>';
            html += '</div>';
        }
        html += '<div class="property-card-footer">';
        html += '<span class="property-card-dom">' + listing.dom + ' days on market</span>';
        html += '<span style="display:flex;align-items:center;gap:6px;">';
        html += '<span onclick="event.stopPropagation();openOfferBuilder(' + listing.listingIndex + ')" style="cursor:pointer;font-size:16px;color:var(--warning);" title="Quick Offer">&#9889;</span>';
        html += '<span class="property-card-score ' + scoreClass + '" style="color: white; padding: 2px 8px; border-radius: 10px;">' + score + ' Score</span>';
        html += '</span>';
        html += '</div>';
        html += '</div>';
    });

    document.getElementById('cardGridContainer').innerHTML = html;
}

var _mapMode = 'pins';
var _heatmapLayer = null;

function setMapMode(mode) {
    _mapMode = mode;
    document.getElementById('mapModePins').style.background = mode === 'pins' ? 'var(--primary)' : 'transparent';
    document.getElementById('mapModePins').style.color = mode === 'pins' ? 'white' : 'var(--text)';
    document.getElementById('mapModeHeatmap').style.background = mode === 'heatmap' ? 'var(--primary)' : 'transparent';
    document.getElementById('mapModeHeatmap').style.color = mode === 'heatmap' ? 'white' : 'var(--text)';
    document.getElementById('heatmapLegend').style.display = mode === 'heatmap' ? 'flex' : 'none';
    if (!leafletMap) return;
    if (mode === 'pins') {
        if (_heatmapLayer) { leafletMap.removeLayer(_heatmapLayer); _heatmapLayer = null; }
        if (markerClusterGroup) leafletMap.addLayer(markerClusterGroup);
    } else {
        if (markerClusterGroup) leafletMap.removeLayer(markerClusterGroup);
        renderYieldHeatmap();
    }
}

function getCapRateColor(capRate) {
    if (capRate >= 5) return '#155724';
    if (capRate >= 4) return '#28a745';
    if (capRate >= 3) return '#ffc107';
    if (capRate >= 2) return '#fd7e14';
    return '#dc3545';
}

function renderYieldHeatmap() {
    if (_heatmapLayer) { leafletMap.removeLayer(_heatmapLayer); _heatmapLayer = null; }
    _heatmapLayer = L.layerGroup();

    // Aggregate by neighborhood
    var nbhMap = {};
    filteredListings.forEach(function(listing) {
        if (!listing.latitude || !listing.longitude) return;
        var n = listing.neighborhood;
        if (!nbhMap[n]) nbhMap[n] = { lats: [], lngs: [], capRates: [], cashFlows: [], prices: [], count: 0 };
        var m = listing._investorMetrics || estimateInvestorMetrics(listing);
        nbhMap[n].lats.push(listing.latitude);
        nbhMap[n].lngs.push(listing.longitude);
        nbhMap[n].capRates.push(m.capRate);
        nbhMap[n].cashFlows.push(m.cashFlow);
        nbhMap[n].prices.push(listing.price);
        nbhMap[n].count++;
    });

    Object.keys(nbhMap).forEach(function(nbh) {
        var d = nbhMap[nbh];
        var avgLat = d.lats.reduce(function(a,b){return a+b;},0) / d.count;
        var avgLng = d.lngs.reduce(function(a,b){return a+b;},0) / d.count;
        var avgCapRate = d.capRates.reduce(function(a,b){return a+b;},0) / d.count;
        var avgCashFlow = d.cashFlows.reduce(function(a,b){return a+b;},0) / d.count;
        var avgPrice = d.prices.reduce(function(a,b){return a+b;},0) / d.count;
        var color = getCapRateColor(avgCapRate);
        var radius = Math.max(800, Math.min(d.count * 250, 3000));

        var circle = L.circle([avgLat, avgLng], {
            radius: radius,
            color: color,
            fillColor: color,
            fillOpacity: 0.45,
            weight: 2
        });

        circle.bindPopup(
            '<div style="min-width:180px;">' +
            '<div style="font-weight:700; font-size:14px; margin-bottom:6px; color:var(--primary);">' + nbh + '</div>' +
            '<div style="font-size:12px; line-height:1.8;">' +
            '<div><strong>Listings:</strong> ' + d.count + '</div>' +
            '<div><strong>Avg Cap Rate:</strong> <span style="color:' + color + '; font-weight:700;">' + avgCapRate.toFixed(2) + '%</span></div>' +
            '<div><strong>Avg Cash Flow:</strong> ' + (avgCashFlow >= 0 ? '+' : '') + '$' + Math.round(avgCashFlow).toLocaleString() + '/mo</div>' +
            '<div><strong>Avg Price:</strong> ' + formatPrice(avgPrice) + '</div>' +
            '</div>' +
            '<div style="margin-top:8px;">' +
            '<button onclick="filterByNeighborhood(\'' + nbh + '\')" style="width:100%;padding:6px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">View Listings</button>' +
            '</div></div>'
        );

        circle.bindTooltip(nbh + ': ' + avgCapRate.toFixed(1) + '% cap', { permanent: false, direction: 'top' });
        _heatmapLayer.addLayer(circle);
    });

    _heatmapLayer.addTo(leafletMap);
}

function initializeMapTab() {
    if (typeof L === 'undefined') {
        var mapEl = document.getElementById('mapCanvas');
        if (mapEl) mapEl.innerHTML = '<div style="padding:40px;text-align:center;color:#888;">Loading map...</div>';
        loadLeaflet().then(function() { initializeMapTab(); });
        return;
    }
    document.getElementById('mapToolbar').style.display = 'block';
    if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
        _heatmapLayer = null;
    }

    leafletMap = L.map('mapCanvas').setView([49.2, -123.5], 9);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(leafletMap);

    if (markerClusterGroup) {
        leafletMap.removeLayer(markerClusterGroup);
    }
    markerClusterGroup = L.markerClusterGroup();

    const bounds = L.latLngBounds();

    filteredListings.forEach((listing) => {
        if (listing.latitude && listing.longitude) {
            const color = getMarkerColor(listing.score, listing.listingIndex);
            const icon = L.icon({
                iconUrl: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Ccircle cx='12' cy='12' r='10' fill='${encodeURIComponent(color)}'/%3E%3C/svg%3E`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([listing.latitude, listing.longitude], { icon });

            const offers = calculateOffers(listing);
            const popupHtml = `
                <div class="map-popup">
                    <div class="map-popup-title">${escapeHtml(listing.addr)}</div>
                    <div class="map-popup-detail"><strong>${escapeHtml(listing.neighborhood)}</strong></div>
                    <div class="map-popup-detail">Price: ${formatPrice(listing.price)}</div>
                    <div class="map-popup-detail">Beds/Baths: ${listing.beds}/${listing.baths}</div>
                    <div class="map-popup-detail">SqFt: ${listing.sqft.toLocaleString()}</div>
                    <div class="map-popup-detail">DOM: ${listing.dom}</div>
                    <div class="map-popup-detail">Score: ${Math.round(listing.score)}/100</div>
                    <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #ddd; font-size: 11px;">
                        <div><strong>Offer Tiers:</strong></div>
                        <div>Aggressive: ${formatPrice(offers.aggressive)}</div>
                        <div>Strategic: ${formatPrice(offers.strategic)}</div>
                        <div>Competitive: ${formatPrice(offers.competitive)}</div>
                    </div>
                    <div class="map-popup-links">
                        <a onclick="window.open('${getRewSearchUrl(listing)}', '_blank')">REW.ca</a>
                        <a onclick="window.open('${getRealtorUrl(listing)}', '_blank')">REALTOR.ca</a>
                        <a onclick="window.open('${getGoogleMapsUrl(listing)}', '_blank')">Maps</a>
                    </div>
                    <div style="display:flex; gap:6px; margin-top:8px;">
                        <button onclick="showDetailModal(${listing.listingIndex})" style="flex:1;padding:6px 8px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">View Details</button>
                        <button onclick="switchTab('offers');setTimeout(function(){selectPropertyForOffer(${listing.listingIndex})},150);" style="flex:1;padding:6px 8px;background:var(--success);color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">Generate Offer</button>
                    </div>
                </div>
            `;

            marker.bindPopup(popupHtml);
            markerClusterGroup.addLayer(marker);
            bounds.extend([listing.latitude, listing.longitude]);
        }
    });

    if (_mapMode === 'pins') {
        leafletMap.addLayer(markerClusterGroup);
    } else {
        renderYieldHeatmap();
    }
    if (bounds.isValid()) {
        leafletMap.fitBounds(bounds, { padding: [50, 50] });
    }
}

function getMarkerColor(score, listingIndex) {
    if (shortlistedIds.has(listingIndex)) return '#FFD700';
    if (score >= 70) return '#dc3545';
    if (score >= 50) return '#fd7e14';
    if (score >= 30) return '#2E75B6';
    return '#999';
}

function initializeNeighborhoodTab() {
    if (typeof Chart === 'undefined') {
        loadChartJs().then(function() { initializeNeighborhoodTab(); });
        return;
    }
    const neighborhoods = [...new Set(filteredListings.map(l => l.neighborhood))].sort();
    const neighborhoodData = neighborhoods.map(nbr => {
        const nbrListings = filteredListings.filter(l => l.neighborhood === nbr);
        const prices = nbrListings.map(l => l.price).sort((a, b) => a - b);
        const medianPrice = prices[Math.floor(prices.length / 2)];
        const totalPpsf = nbrListings.filter(l => l.sqft > 0).reduce((sum, l) => sum + (l.price / l.sqft), 0);
        const avgPpsf = nbrListings.filter(l => l.sqft > 0).length > 0 ? totalPpsf / nbrListings.filter(l => l.sqft > 0).length : 0;
        const avgPrice = nbrListings.reduce((sum, l) => sum + l.price, 0) / nbrListings.length;
        const avgDOM = nbrListings.reduce((sum, l) => sum + l.dom, 0) / nbrListings.length;
        const avgScore = nbrListings.reduce((sum, l) => sum + l.score, 0) / nbrListings.length;
        const trends = marketTrends[nbr] || {};

        return { nbr, count: nbrListings.length, avgPrice, medianPrice, avgPpsf, avgDOM, avgScore, trends };
    });

    // Market summary banner
    var lowInv = neighborhoodData.filter(d => d.trends.inventory === 'low').length;
    var totalNbrs = neighborhoodData.length;
    var avgYoy = neighborhoodData.filter(d => d.trends.yoyChange != null).reduce((s, d) => s + d.trends.yoyChange, 0) / (neighborhoodData.filter(d => d.trends.yoyChange != null).length || 1);
    var hottest = neighborhoodData.filter(d => d.trends.yoyChange != null).sort((a, b) => b.trends.yoyChange - a.trends.yoyChange)[0];
    var banner = document.getElementById('marketSummaryBanner');
    var bannerContent = document.getElementById('marketSummaryContent');
    if (totalNbrs > 0) {
        banner.style.display = 'block';
        bannerContent.innerHTML = '<div><strong>' + avgYoy.toFixed(1) + '%</strong><br>Avg YoY Price Change</div>' +
            '<div><strong>' + lowInv + '/' + totalNbrs + '</strong><br>Low Inventory Areas</div>' +
            (hottest ? '<div><strong>' + hottest.nbr + '</strong><br>' + (hottest.trends.yoyChange >= 0 ? 'Fastest Appreciation' : 'Smallest Decline') + ' (' + (hottest.trends.yoyChange >= 0 ? '+' : '') + hottest.trends.yoyChange + '%)</div>' : '') +
            '<div><strong>' + filteredListings.length + '</strong><br>Active Listings</div>';
    } else {
        banner.style.display = 'none';
    }

    let tableHtml = '';
    neighborhoodData.forEach(data => {
        var yoy = data.trends.yoyChange;
        var yoyStr = yoy != null ? ((yoy >= 0 ? '+' : '') + yoy.toFixed(1) + '%') : 'N/A';
        var yoyColor = yoy > 0 ? '#28a745' : (yoy < 0 ? '#dc3545' : '#666');
        var yoyArrow = yoy > 0 ? '&#9650;' : (yoy < 0 ? '&#9660;' : '&#9644;');
        var stl = data.trends.avgSaleToList;
        var stlStr = stl ? (stl * 100).toFixed(0) + '%' : 'N/A';
        var inv = data.trends.inventory || 'N/A';
        var invColor = inv === 'low' ? '#dc3545' : (inv === 'high' ? '#28a745' : '#fd7e14');
        tableHtml += `
            <tr onclick="filterByNeighborhood('${data.nbr}')">
                <td><span class="neighborhood-name">${data.nbr}</span></td>
                <td>${data.count}</td>
                <td>${formatPrice(data.avgPrice)}</td>
                <td>${formatPrice(data.medianPrice)}</td>
                <td>${Math.round(data.avgPpsf)}</td>
                <td>${Math.round(data.avgDOM)}</td>
                <td style="color:${yoyColor};font-weight:600"><span style="font-size:10px">${yoyArrow}</span> ${yoyStr}</td>
                <td>${stlStr}</td>
                <td><span style="background:${invColor};color:white;padding:2px 8px;border-radius:10px;font-size:11px;text-transform:capitalize">${inv}</span></td>
                <td>${Math.round(data.avgScore)}</td>
            </tr>
        `;
    });
    document.getElementById('neighborhoodTableBody').innerHTML = tableHtml;

    if (!chartsInitialized['neighborhood']) {
        var ctx = document.getElementById('neighborhoodChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: neighborhoodData.map(d => d.nbr),
                datasets: [{
                    label: 'Average Price',
                    data: neighborhoodData.map(d => d.avgPrice),
                    backgroundColor: 'rgba(46, 117, 182, 0.7)',
                    borderColor: '#2E75B6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: function(value) { return '$' + (value / 1000000).toFixed(1) + 'M'; } }
                    }
                }
            }
        });

        var ctx2 = document.getElementById('yoyChart').getContext('2d');
        var yoyData = neighborhoodData.filter(d => d.trends.yoyChange != null);
        new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: yoyData.map(d => d.nbr),
                datasets: [{
                    label: 'YoY Price Change %',
                    data: yoyData.map(d => d.trends.yoyChange),
                    backgroundColor: yoyData.map(d => d.trends.yoyChange >= 0 ? 'rgba(40, 167, 69, 0.7)' : 'rgba(220, 53, 69, 0.7)'),
                    borderColor: yoyData.map(d => d.trends.yoyChange >= 0 ? '#28a745' : '#dc3545'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        ticks: { callback: function(value) { return value + '%'; } }
                    }
                }
            }
        });
        chartsInitialized['neighborhood'] = true;
    }
}

function filterByNeighborhood(nbr) {
    document.querySelectorAll('.nbr-filter').forEach(el => {
        el.checked = el.value === nbr;
    });
    applyFilters();
}

function initializeDealsTab() {
    if (typeof Chart === 'undefined') {
        loadChartJs().then(function() { initializeDealsTab(); });
        return;
    }
    const topDeals = [...filteredListings].sort((a, b) => b.score - a.score).slice(0, 10);
    let dealsHtml = '';
    topDeals.forEach(listing => {
        const offers = calculateOffers(listing);
        dealsHtml += `
            <div class="deal-item" onclick="showDetailModal(${listing.listingIndex})">
                <div class="deal-header">
                    <div class="deal-address">${escapeHtml(listing.addr)}</div>
                    <div class="deal-price">${formatPrice(listing.price)}</div>
                </div>
                <div class="deal-details">
                    <div class="deal-detail-item">
                        <div class="deal-detail-label">Neighborhood</div>
                        <div class="deal-detail-value">${escapeHtml(listing.neighborhood)}</div>
                    </div>
                    <div class="deal-detail-item">
                        <div class="deal-detail-label">Score</div>
                        <div class="deal-detail-value">${Math.round(listing.score)}/100</div>
                    </div>
                    <div class="deal-detail-item">
                        <div class="deal-detail-label">DOM</div>
                        <div class="deal-detail-value">${listing.dom}</div>
                    </div>
                    <div class="deal-detail-item">
                        <div class="deal-detail-label">Agg. Offer</div>
                        <div class="deal-detail-value">${formatPrice(offers.aggressive)}</div>
                    </div>
                </div>
            </div>
        `;
    });
    document.getElementById('dealsList').innerHTML = dealsHtml;
    
    if (!chartsInitialized['scoreDistribution']) {
        const scoreRanges = [
            { min: 0, max: 20, label: '0-20' },
            { min: 20, max: 40, label: '20-40' },
            { min: 40, max: 60, label: '40-60' },
            { min: 60, max: 80, label: '60-80' },
            { min: 80, max: 100, label: '80-100' }
        ];
        
        const scoreCounts = scoreRanges.map(range => 
            filteredListings.filter(l => l.score >= range.min && l.score < range.max).length
        );
        
        const ctx = document.getElementById('scoreDistributionChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: scoreRanges.map(r => r.label),
                datasets: [{
                    label: 'Count',
                    data: scoreCounts,
                    backgroundColor: 'rgba(23, 162, 184, 0.7)',
                    borderColor: '#17a2b8',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
        chartsInitialized['scoreDistribution'] = true;
    }
    
    if (!chartsInitialized['typeBreakdown']) {
        const types = [...new Set(filteredListings.map(l => l.type))];
        const typeCounts = types.map(type => filteredListings.filter(l => l.type === type).length);
        
        const ctx = document.getElementById('typeBreakdownChart').getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: types,
                datasets: [{
                    data: typeCounts,
                    backgroundColor: [
                        'rgba(27, 58, 92, 0.7)',
                        'rgba(46, 117, 182, 0.7)',
                        'rgba(23, 162, 184, 0.7)',
                        'rgba(40, 167, 69, 0.7)',
                        'rgba(255, 193, 7, 0.7)',
                        'rgba(220, 53, 69, 0.7)'
                    ],
                    borderColor: [
                        '#1B3A5C',
                        '#2E75B6',
                        '#17a2b8',
                        '#28a745',
                        '#ffc107',
                        '#dc3545'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
        chartsInitialized['typeBreakdown'] = true;
    }
    
    if (!chartsInitialized['priceDistribution']) {
        const priceRanges = [
            { min: 0, max: 500000, label: '<$500K' },
            { min: 500000, max: 1000000, label: '$500K-$1M' },
            { min: 1000000, max: 2000000, label: '$1M-$2M' },
            { min: 2000000, max: 5000000, label: '$2M-$5M' },
            { min: 5000000, max: Infinity, label: '>$5M' }
        ];
        
        const priceCounts = priceRanges.map(range =>
            filteredListings.filter(l => l.price >= range.min && l.price < range.max).length
        );
        
        const ctx = document.getElementById('priceDistributionChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: priceRanges.map(r => r.label),
                datasets: [{
                    label: 'Count',
                    data: priceCounts,
                    backgroundColor: 'rgba(220, 53, 69, 0.7)',
                    borderColor: '#dc3545',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                }
            }
        });
        chartsInitialized['priceDistribution'] = true;
    }
}

function initializeOffersTab() {
    updateOfferToolVisibility();
    updateOfferStepIndicator(0);
    if (!isMember()) return;
    const select = document.getElementById('propertySelect');
    select.innerHTML = '<option value="">Choose a property...</option>';
    filteredListings.forEach(listing => {
        select.innerHTML += `<option value="${listing.listingIndex}">${escapeHtml(listing.addr)} - ${formatPrice(listing.price)}</option>`;
    });
    // Buyer info is now loaded from localStorage when the offer builder renders
}

function saveBuyerInfo() {
    var name = document.getElementById('buyerName') ? document.getElementById('buyerName').value : '';
    var email = document.getElementById('buyerEmail') ? document.getElementById('buyerEmail').value : '';
    var phone = document.getElementById('buyerPhone') ? document.getElementById('buyerPhone').value : '';
    var company = document.getElementById('buyerCompany') ? document.getElementById('buyerCompany').value : '';
    localStorage.setItem('buyerName', name);
    localStorage.setItem('buyerEmail', email);
    localStorage.setItem('buyerPhone', phone);
    localStorage.setItem('buyerCompany', company);
    // Sync to buyer profile
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    if (name) profile.name = name;
    if (email) profile.email = email;
    if (phone) profile.phone = phone;
    if (company) profile.company = company;
    localStorage.setItem('buyerProfile', JSON.stringify(profile));
}

function getBuyerField(field) {
    // Read from buyer profile first, then legacy keys
    var profile = JSON.parse(localStorage.getItem('buyerProfile') || '{}');
    var legacyMap = { name: 'buyerName', email: 'buyerEmail', phone: 'buyerPhone', company: 'buyerCompany' };
    return profile[field] || localStorage.getItem(legacyMap[field]) || '';
}

function selectPropertyForOffer(listingIndex) {
    // Set the property select dropdown to the given listing index
    var select = document.getElementById('propertySelect');
    // Make sure the option exists
    var found = false;
    for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].value == listingIndex) {
            select.value = listingIndex;
            found = true;
            break;
        }
    }
    if (!found) {
        // The listing may not be in filtered results; add it temporarily
        var listing = rawListings[listingIndex];
        var opt = document.createElement('option');
        opt.value = listingIndex;
        opt.textContent = listing.addr + ' - ' + formatPrice(listing.price);
        select.appendChild(opt);
        select.value = listingIndex;
    }
    updateOfferPreview();
    // Scroll the offer form into view
    document.getElementById('offers').scrollTop = 0;
}

function updateOfferPreview() {
    const selectedIdx = parseInt(document.getElementById('propertySelect').value);
    const infoDiv = document.getElementById('selectedPropertyInfo');

    if (isNaN(selectedIdx)) {
        infoDiv.style.display = 'none';
        document.getElementById('offerSummary').style.display = 'none';
        updateOfferStepIndicator(0);
        return;
    }
    updateOfferStepIndicator(1);
    
    const listing = rawListings[selectedIdx];
    const offers = calculateOffers(listing);
    const ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;
    
    infoDiv.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div>
                <div class="detail-label">Address</div>
                <div style="font-weight: 700; color: var(--primary);">${escapeHtml(listing.addr)}</div>
            </div>
            <div>
                <div class="detail-label">Neighborhood</div>
                <div style="font-weight: 700; color: var(--primary);">${escapeHtml(listing.neighborhood)}</div>
            </div>
            <div>
                <div class="detail-label">Price</div>
                <div style="font-weight: 700; color: var(--primary);">${formatPrice(listing.price)}</div>
            </div>
            <div>
                <div class="detail-label">Type</div>
                <div style="font-weight: 700; color: var(--primary);">${escapeHtml(listing.type)}</div>
            </div>
            <div>
                <div class="detail-label">Beds/Baths</div>
                <div style="font-weight: 700; color: var(--primary);">${listing.beds}/${listing.baths}</div>
            </div>
            <div>
                <div class="detail-label">SqFt</div>
                <div style="font-weight: 700; color: var(--primary);">${listing.sqft.toLocaleString()} ($${ppsf}/sf)</div>
            </div>
            <div>
                <div class="detail-label">DOM</div>
                <div style="font-weight: 700; color: var(--primary);">${listing.dom}</div>
            </div>
            <div>
                <div class="detail-label">Score</div>
                <div style="font-weight: 700; color: var(--primary);">${Math.round(listing.score)}/100</div>
            </div>
        </div>
        
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #ddd;">
            <div class="detail-label">Offer Tiers</div>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px;">
                <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 11px; color: #666;">Aggressive</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--success);">${formatPrice(offers.aggressive)}</div>
                </div>
                <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 11px; color: #666;">Strategic</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--success);">${formatPrice(offers.strategic)}</div>
                </div>
                <div style="background: #f0f0f0; padding: 8px; border-radius: 4px; text-align: center;">
                    <div style="font-size: 11px; color: #666;">Competitive</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--success);">${formatPrice(offers.competitive)}</div>
                </div>
            </div>
        </div>
    `;
    infoDiv.style.display = 'block';
    document.getElementById('offerSummary').style.display = 'none';
}

function generateOfferSummary() {
    const selectedIdx = parseInt(document.getElementById('propertySelect').value);
    if (isNaN(selectedIdx)) {
        alert('Please select a property');
        return;
    }

    const listing = rawListings[selectedIdx];
    const offers = calculateOffers(listing);
    const savedName = getBuyerField('name');
    const savedEmail = getBuyerField('email');
    const savedPhone = getBuyerField('phone');
    const savedCompany = getBuyerField('company');
    const notes = document.getElementById('offerNotes').value;
    const city = getCityForListing(listing);
    const loc = getLocationForListing(listing);
    const fullAddr = loc.fullAddress;

    currentOfferListingIndex = selectedIdx;
    offerPdfGenerated = false;

    const today = new Date();
    const completionDate = new Date(today); completionDate.setDate(completionDate.getDate() + 30);
    const subjectDate = new Date(today); subjectDate.setDate(subjectDate.getDate() + 14);
    const irrevocDate = new Date(today); irrevocDate.setDate(irrevocDate.getDate() + 2);
    const depositDate = new Date(today); depositDate.setDate(depositDate.getDate() + 2);
    if (depositDate.getDay() === 0) depositDate.setDate(depositDate.getDate() + 1);
    if (depositDate.getDay() === 6) depositDate.setDate(depositDate.getDate() + 2);
    const fmtDate = (d) => d.toISOString().split('T')[0];
    const savedSig = localStorage.getItem('offerSignatureImg') || '';

    const summaryHtml = `
        <div class="offer-display" style="max-width:100%;">
            <h3 style="color:var(--primary);margin-bottom:4px;">Complete Offer Builder</h3>
            <p style="color:#666;font-size:13px;margin-bottom:16px;">${fullAddr}</p>

            <div style="background:var(--light-gray);padding:16px;border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 10px 0;color:var(--primary);">Property Summary</h4>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:13px;">
                    <div><span style="color:#666;">Asking Price:</span> <strong>${formatPrice(listing.price)}</strong></div>
                    <div><span style="color:#666;">Type:</span> <strong>${escapeHtml(listing.type)}</strong></div>
                    <div><span style="color:#666;">Beds/Baths:</span> <strong>${listing.beds}/${listing.baths}</strong></div>
                    <div><span style="color:#666;">SqFt:</span> <strong>${listing.sqft > 0 ? listing.sqft.toLocaleString() : 'N/A'}</strong></div>
                    <div><span style="color:#666;">DOM:</span> <strong>${listing.dom} days</strong></div>
                    <div><span style="color:#666;">Agent:</span> <strong>${escapeHtml(listing.agent)}</strong></div>
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 12px 0;color:var(--primary);">Select Offer Price</h4>
                <div style="display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
                    <div class="offer-tier-btn" onclick="selectOfferTier(this,${offers.aggressive})" style="flex:1;min-width:140px;padding:12px;border:2px solid #dc3545;border-radius:6px;cursor:pointer;text-align:center;">
                        <div style="font-weight:700;color:#dc3545;font-size:12px;">Aggressive</div>
                        <div style="font-weight:800;font-size:16px;margin:4px 0;">${formatPrice(offers.aggressive)}</div>
                        <div style="font-size:11px;color:#666;">${Math.round((listing.price - offers.aggressive) / listing.price * 100)}% below asking</div>
                    </div>
                    <div class="offer-tier-btn" onclick="selectOfferTier(this,${offers.strategic})" style="flex:1;min-width:140px;padding:12px;border:2px solid #fd7e14;border-radius:6px;cursor:pointer;text-align:center;">
                        <div style="font-weight:700;color:#fd7e14;font-size:12px;">Strategic</div>
                        <div style="font-weight:800;font-size:16px;margin:4px 0;">${formatPrice(offers.strategic)}</div>
                        <div style="font-size:11px;color:#666;">${Math.round((listing.price - offers.strategic) / listing.price * 100)}% below asking</div>
                    </div>
                    <div class="offer-tier-btn" onclick="selectOfferTier(this,${offers.competitive})" style="flex:1;min-width:140px;padding:12px;border:2px solid #28a745;border-radius:6px;cursor:pointer;text-align:center;">
                        <div style="font-weight:700;color:#28a745;font-size:12px;">Competitive</div>
                        <div style="font-weight:800;font-size:16px;margin:4px 0;">${formatPrice(offers.competitive)}</div>
                        <div style="font-size:11px;color:#666;">${Math.round((listing.price - offers.competitive) / listing.price * 100)}% below asking</div>
                    </div>
                </div>
                <div class="offer-input-group">
                    <label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Custom Offer Amount ($)</label>
                    <input type="number" id="offerPrice" value="${offers.strategic}" min="1" onchange="updateDeposit()" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;font-size:14px;">
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 12px 0;color:var(--primary);">Offer Terms &amp; Dates</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Deposit Amount ($)</label><input type="number" id="offerDeposit" value="${Math.round(offers.strategic * 0.05)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Deposit Held By</label><input type="text" id="offerDepositTrustee" value="Buyer's solicitor in trust" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Deposit Delivery Date</label><input type="date" id="offerDepositDate" value="${fmtDate(depositDate)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Completion Date</label><input type="date" id="offerCompletionDate" value="${fmtDate(completionDate)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Possession Date</label><input type="date" id="offerPossessionDate" value="${fmtDate(completionDate)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Subject Removal Date</label><input type="date" id="offerSubjectDate" value="${fmtDate(subjectDate)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Irrevocable Until</label><input type="date" id="offerIrrevocDate" value="${fmtDate(irrevocDate)}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 12px 0;color:var(--primary);">Subject Conditions</h4>
                <div class="subject-checks" style="display:grid;gap:8px;font-size:13px;">
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to satisfactory home inspection by a qualified inspector at Buyer's expense, to be completed within the subject removal period." checked> Home Inspection</label>
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer arranging satisfactory financing within the subject removal period."> Financing</label>
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer's solicitor approval of title search within the subject removal period." checked> Title Review</label>
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer's lawyer reviewing and approving the Contract of Purchase and Sale within the subject removal period."> Lawyer Review</label>
                    ${listing.type === 'Apt/Condo' || listing.type === 'Townhouse' ? '<label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer\\\'s review and approval of strata documents including minutes, bylaws, financials, depreciation report, and Form B within the subject removal period." checked> Strata Docs Review</label><label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer\\\'s review and approval of the strata corporation\\\'s current insurance and coverage."> Strata Insurance</label>' : ''}
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to Buyer's review and approval of a current property appraisal."> Property Appraisal</label>
                    <label style="display:flex;align-items:flex-start;gap:8px;"><input type="checkbox" class="subject-cb" value="Subject to satisfactory environmental assessment at Buyer's expense."> Environmental Assessment</label>
                </div>
                <div class="offer-input-group" style="margin-top:10px;">
                    <label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Additional Conditions (one per line)</label>
                    <textarea id="offerCustomConditions" rows="2" placeholder="Enter any custom conditions..." style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;font-size:13px;">${notes || ''}</textarea>
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 8px 0;color:var(--primary);">Your Information (Optional)</h4>
                <p style="font-size:12px;color:#888;margin:0 0 12px 0;">Fill in your details to include them in the offer. All fields are optional.</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Full Name</label><input type="text" id="buyerName" placeholder="Enter your full name" value="${savedName}" onchange="saveBuyerInfo()" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Email Address</label><input type="email" id="buyerEmail" placeholder="Enter your email address" value="${savedEmail}" onchange="saveBuyerInfo()" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Phone Number</label><input type="tel" id="buyerPhone" placeholder="Enter your phone number" value="${savedPhone}" onchange="saveBuyerInfo()" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Company Name</label><input type="text" id="buyerCompany" placeholder="Enter company name" value="${savedCompany}" onchange="saveBuyerInfo()" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 12px 0;color:var(--primary);">Listing Agent Contact</h4>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Agent Name</label><input type="text" id="offerAgentName" value="${listing.agent.split(',')[0].trim()}" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                    <div class="offer-input-group"><label style="font-size:12px;font-weight:600;color:#555;margin-bottom:4px;display:block;">Agent Email</label><input type="email" id="offerAgentEmail" placeholder="agent@brokerage.com" style="padding:8px 12px;border:1px solid var(--border-gray);border-radius:4px;width:100%;"></div>
                </div>
            </div>

            <div style="background:white;padding:16px;border:1px solid var(--border-gray);border-radius:6px;margin-bottom:16px;">
                <h4 style="margin:0 0 12px 0;color:var(--primary);">Your Signature</h4>
                <div id="sigPreview" style="border:2px dashed var(--border-gray);border-radius:6px;padding:20px;text-align:center;margin-bottom:10px;">
                    ${savedSig ? '<img src="' + savedSig + '" alt="Signature" style="max-height:60px;">' : '<span style="color:#999;">No signature uploaded. Click below to upload.</span>'}
                </div>
                <div style="display:flex;gap:10px;">
                    <label style="padding:8px 16px;background:#f0f0f0;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;text-align:center;">Upload Signature Image<input type="file" accept="image/*" onchange="handleSigUpload(event)" style="display:none;"></label>
                    ${savedSig ? '<button onclick="clearSignature()" style="padding:8px 16px;background:none;border:1px solid #dc3545;color:#dc3545;border-radius:6px;cursor:pointer;font-size:13px;">Clear</button>' : ''}
                </div>
            </div>

            <div style="display:flex;gap:12px;margin-top:20px;">
                <button onclick="generateOfferPDF()" style="flex:1;padding:14px;background:var(--primary);color:white;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;">Generate PDF Offer</button>
                <button id="emailAgentBtn" onclick="emailOfferToAgent()" style="flex:1;padding:14px;background:var(--secondary);color:white;border:none;border-radius:6px;font-size:15px;font-weight:700;cursor:pointer;opacity:0.5;" disabled title="Generate PDF first">Email to Agent</button>
            </div>
            <p id="offerStatus" style="text-align:center;margin-top:10px;font-size:13px;color:#666;"></p>
        </div>
    `;

    document.getElementById('offerSummary').innerHTML = summaryHtml;
    document.getElementById('offerSummary').style.display = 'block';
    document.getElementById('offerSummary').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initializeShortlistTab() {
    const shortlistedListings = rawListings.filter((l, idx) => shortlistedIds.has(idx));
    
    if (shortlistedListings.length === 0) {
        document.getElementById('shortlistTable').style.display = 'none';
        document.getElementById('emptyShortlist').style.display = 'block';
        return;
    }
    
    document.getElementById('shortlistTable').style.display = 'table';
    document.getElementById('emptyShortlist').style.display = 'none';
    
    let html = '';
    let totalAggressiveOffers = 0;
    
    shortlistedListings.forEach((listing) => {
        const offers = calculateOffers(listing);
        totalAggressiveOffers += offers.aggressive;
        const listingIndex = rawListings.indexOf(listing);
        
        html += `
            <tr onclick="showDetailModal(${listingIndex})">
                <td><span class="star-toggle shortlisted" onclick="event.stopPropagation(); toggleShortlist(${listingIndex})">★</span></td>
                <td>${escapeHtml(listing.addr)}</td>
                <td>${escapeHtml(listing.neighborhood)}</td>
                <td>${escapeHtml(listing.type)}</td>
                <td>${formatPrice(listing.price)}</td>
                <td>${listing.beds}/${listing.baths}</td>
                <td>${listing.sqft.toLocaleString()}</td>
                <td>${listing.dom}</td>
                <td><span class="score-badge ${getScoreClass(listing.score)}">${Math.round(listing.score)}</span></td>
                <td>${formatPrice(offers.aggressive)}</td>
            </tr>
        `;
    });
    
    document.getElementById('shortlistTableBody').innerHTML = html;
    document.getElementById('shortlistTotal').textContent = formatPrice(totalAggressiveOffers);
}

function showDetailModal(listingIndex) {
    trackRecentlyViewed(listingIndex);
    updateRecentlyViewed();
    const listing = rawListings[listingIndex];
    const offers = calculateOffers(listing);
    const isShortlisted = shortlistedIds.has(listingIndex);
    const ppsf = listing.sqft > 0 ? Math.round(listing.price / listing.sqft) : 0;
    const scoreClass = getScoreClass(listing.score);
    const scoreFill = (listing.score / 100) * 100;
    const scoreFillColor = listing.score >= 70 ? '#dc3545' : (listing.score >= 50 ? '#fd7e14' : (listing.score >= 30 ? '#2E75B6' : '#999'));
    
    let modalHtml = `
        <div class="modal-header">
            <div class="modal-title">${escapeHtml(listing.addr)}</div>
            <span style="background: #f0f0f0; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 600;">${escapeHtml(listing.neighborhood)}</span>
        </div>
        ${getMarketBanner(listing)}
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
            ${getMotivationBadge(calculateMotivationScore(listing))}
            <button onclick="toggleComparison(${listingIndex});this.textContent=comparisonSet.has(${listingIndex})?'Remove from Compare':'Add to Compare';this.style.background=comparisonSet.has(${listingIndex})?'var(--secondary)':'white';this.style.color=comparisonSet.has(${listingIndex})?'white':'var(--secondary)';updateComparisonBar();" style="padding:4px 10px;border:1px solid var(--secondary);background:${comparisonSet.has(listingIndex) ? 'var(--secondary)' : 'white'};color:${comparisonSet.has(listingIndex) ? 'white' : 'var(--secondary)'};border-radius:4px;cursor:pointer;font-size:11px;font-weight:600;">
                ${comparisonSet.has(listingIndex) ? 'Remove from Compare' : 'Add to Compare'}
            </button>
            <span style="background:#e7f3ff;color:#004085;padding:4px 10px;border-radius:4px;font-size:11px;font-weight:600;">Est. Rent: $${estimateMonthlyRent(listing).toLocaleString()}/mo</span>
        </div>
        
        <div class="property-detail-grid">
            <div class="detail-item">
                <div class="detail-label">Price</div>
                <div class="detail-value">${formatPrice(listing.price)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Type</div>
                <div class="detail-value">${escapeHtml(listing.type)}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Bedrooms</div>
                <div class="detail-value">${listing.beds}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Bathrooms</div>
                <div class="detail-value">${listing.baths}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Square Feet</div>
                <div class="detail-value">${listing.sqft.toLocaleString()}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Price/SqFt</div>
                <div class="detail-value">${ppsf.toLocaleString()}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Days on Market</div>
                <div class="detail-value">${listing.dom}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Year Built</div>
                <div class="detail-value">${listing.yearBuilt}</div>
            </div>
            ${listing.lot ? `<div class="detail-item">
                <div class="detail-label">Lot Size</div>
                <div class="detail-value">${listing.lot}</div>
            </div>` : ''}
            <div class="detail-item">
                <div class="detail-label">Agent</div>
                <div class="detail-value" style="font-size: 13px;">${escapeHtml(listing.agent)}</div>
            </div>
        </div>
        
        ${listing.waterView ? `<div style="background: #e7f3ff; padding: 12px; border-radius: 4px; margin: 16px 0; color: #0056b3; font-weight: 600;">
            🌊 Water View Property
        </div>` : ''}
        
        <div style="margin: 20px 0;">
            <div class="detail-label" style="margin-bottom: 8px;">Deal Score</div>
            <div class="score-bar">
                <div class="score-bar-fill" style="width: ${scoreFill}%; background: ${scoreFillColor};">
                    ${Math.round(listing.score)}/100
                </div>
            </div>
        </div>
        ${renderScoreBreakdown(listing)}
        
        <div style="background: var(--light-gray); padding: 16px; border-radius: 4px; margin: 16px 0;">
            <div style="font-weight: 700; color: var(--primary); margin-bottom: 16px;">Offer Tiers</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                <div class="offer-tier-modal" style="border-left: 3px solid var(--danger);">
                    <div class="offer-label">Aggressive Lowball</div>
                    <div class="offer-value">${formatPrice(offers.aggressive)}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        ${Math.round((listing.price - offers.aggressive) / listing.price * 100)}% off asking
                    </div>
                    <div style="font-size: 10px; color: #999; margin-top: 6px; line-height: 1.4;">Best when DOM &gt; 90, overpriced vs benchmark, or motivated seller.</div>
                </div>
                <div class="offer-tier-modal" style="border-left: 3px solid var(--warning);">
                    <div class="offer-label">Strategic Value</div>
                    <div class="offer-value">${formatPrice(offers.strategic)}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        ${Math.round((listing.price - offers.strategic) / listing.price * 100)}% off asking
                    </div>
                    <div style="font-size: 10px; color: #999; margin-top: 6px; line-height: 1.4;">Balanced approach. Good starting point for most negotiations.</div>
                </div>
                <div class="offer-tier-modal" style="border-left: 3px solid var(--success);">
                    <div class="offer-label">Competitive</div>
                    <div class="offer-value">${formatPrice(offers.competitive)}</div>
                    <div style="font-size: 11px; color: #666; margin-top: 4px;">
                        ${Math.round((listing.price - offers.competitive) / listing.price * 100)}% off asking
                    </div>
                    <div style="font-size: 10px; color: #999; margin-top: 6px; line-height: 1.4;">Use in hot markets, low DOM, or when you really want the property.</div>
                </div>
            </div>
        </div>

        <div style="background: #fff3cd; padding: 14px 16px; border-radius: 4px; margin: 16px 0; font-size: 12px; border-left: 4px solid #ffc107;">
            <strong>Est. Closing Costs:</strong> PTT $${estimateClosingCosts(listing.price).ptt.toLocaleString()} + Legal/Inspection/etc ~$3,250 = <strong>~$${estimateClosingCosts(listing.price).total.toLocaleString()} total</strong>
            <span style="margin-left: 8px; opacity: 0.7;">|</span>
            <a href="#" onclick="event.preventDefault();switchTab('mortgage');document.getElementById('mortPrice').value=${listing.price};calcMortgage();closeDetailModal();" style="color: var(--primary); margin-left: 8px;">Open in Calculator</a>
        </div>

        ${(function(){
            var trend = marketTrends[listing.neighborhood] || {};
            var nbhData = (typeof neighborhoodEnrichment !== 'undefined' ? neighborhoodEnrichment[listing.neighborhood] : null) || {};
            var hasEnrich = nbhData.walkScore || nbhData.transitScore || nbhData.crimeIndex !== undefined || nbhData.avgHouseholdIncome;
            var hasTrend = trend.yoyChange !== undefined || trend.medianDOM;
            if (!hasEnrich && !hasTrend) return '';
            var h = '<div style="background:#f0f0f0;padding:14px 16px;border-radius:4px;margin:16px 0;">';
            h += '<div style="font-weight:700;color:var(--primary);margin-bottom:10px;">Neighborhood Snapshot: ' + listing.neighborhood + '</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:8px;font-size:12px;">';
            if (nbhData.walkScore) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:var(--primary);">' + nbhData.walkScore + '</div><div style="font-size:10px;color:#888;">Walk Score</div></div>';
            if (nbhData.transitScore) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:var(--secondary);">' + nbhData.transitScore + '</div><div style="font-size:10px;color:#888;">Transit Score</div></div>';
            if (nbhData.crimeIndex !== undefined) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:' + (nbhData.crimeIndex < 20 ? 'var(--success)' : nbhData.crimeIndex < 40 ? '#856404' : 'var(--danger)') + ';">' + nbhData.crimeIndex + '</div><div style="font-size:10px;color:#888;">Crime Index</div></div>';
            if (nbhData.avgHouseholdIncome) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:var(--primary);">$' + Math.round(nbhData.avgHouseholdIncome/1000) + 'K</div><div style="font-size:10px;color:#888;">Avg Income</div></div>';
            if (trend.yoyChange !== undefined) {
                var yoyColor = trend.yoyChange > 0 ? 'var(--danger)' : 'var(--success)';
                var yoyArrow = trend.yoyChange > 0 ? '&uarr;' : '&darr;';
                h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:' + yoyColor + ';">' + yoyArrow + Math.abs(trend.yoyChange).toFixed(1) + '%</div><div style="font-size:10px;color:#888;">YoY Price</div></div>';
            }
            if (trend.medianDOM) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#666;">' + trend.medianDOM + '</div><div style="font-size:10px;color:#888;">Median DOM</div></div>';
            if (trend.inventory) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#666;">' + trend.inventory + '</div><div style="font-size:10px;color:#888;">Inventory</div></div>';
            if (trend.avgSaleToList) h += '<div style="text-align:center;"><div style="font-size:18px;font-weight:700;color:#666;">' + (trend.avgSaleToList * 100).toFixed(1) + '%</div><div style="font-size:10px;color:#888;">Sale/List</div></div>';
            h += '</div></div>';
            return h;
        })()}

        ${(function(){
            var comps = findComparables(listing);
            if (comps.length === 0) return '';
            var h = '<div style="background:var(--light-gray);padding:16px;border-radius:4px;margin:16px 0;"><div style="font-weight:700;color:var(--primary);margin-bottom:12px;">Comparable Properties</div>';
            h += '<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="background:#e9ecef;"><th style="padding:6px;text-align:left;">Address</th><th style="padding:6px;">Price</th><th style="padding:6px;">Type</th><th style="padding:6px;">Beds/Bath</th><th style="padding:6px;">SqFt</th><th style="padding:6px;">DOM</th><th style="padding:6px;">Score</th></tr>';
            comps.forEach(function(c){
                h += '<tr style="cursor:pointer;" onclick="closeDetailModal();setTimeout(function(){showDetailModal('+rawListings.indexOf(c)+')},200)"><td style="padding:6px;">'+c.addr+'</td><td style="padding:6px;text-align:center;">'+formatPrice(c.price)+'</td><td style="padding:6px;text-align:center;">'+c.type+'</td><td style="padding:6px;text-align:center;">'+c.beds+'/'+c.baths+'</td><td style="padding:6px;text-align:center;">'+c.sqft.toLocaleString()+'</td><td style="padding:6px;text-align:center;">'+c.dom+'</td><td style="padding:6px;text-align:center;">'+Math.round(c.score)+'</td></tr>';
            });
            h += '</table></div>';
            return h;
        })()}

        <div style="background:var(--light-gray);padding:14px 16px;border-radius:4px;margin:16px 0;">
            <div style="font-weight:700;color:var(--primary);margin-bottom:10px;">Quick Mortgage Estimate</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:12px;">
                <div><span style="color:#888;">20% down</span><br><strong>$${Math.round(listing.price * 0.8 * (0.055/12 * Math.pow(1+0.055/12,300)) / (Math.pow(1+0.055/12,300)-1)).toLocaleString()}/mo</strong></div>
                <div><span style="color:#888;">10% down</span><br><strong>$${Math.round((listing.price * 0.9 * 1.031) * (0.055/12 * Math.pow(1+0.055/12,300)) / (Math.pow(1+0.055/12,300)-1)).toLocaleString()}/mo</strong></div>
                <div><span style="color:#888;">5% down</span><br><strong>$${Math.round((listing.price * 0.95 * 1.04) * (0.055/12 * Math.pow(1+0.055/12,300)) / (Math.pow(1+0.055/12,300)-1)).toLocaleString()}/mo</strong></div>
            </div>
            <div style="font-size:10px;color:#999;margin-top:6px;">Based on 5.5% rate, 25-year amortization. Includes CMHC insurance where applicable.</div>
        </div>

        <div style="display: flex; gap: 8px; margin: 16px 0;">
            <button class="btn-primary" style="background: var(--success);" onclick="openOfferBuilder(${listingIndex})">Generate Offer</button>
            <button class="btn-primary" onclick="closeDetailModal();switchTabDirect('mortgage');document.getElementById('mortPrice').value=${listing.price};calcMortgage();">Mortgage Calculator</button>
            <button class="btn-primary" style="background: var(--accent);" onclick="closeDetailModal();switchTabDirect('roi');document.getElementById('roiPrice').value=${listing.price};calcROI();">ROI Calculator</button>
        </div>

        <div style="display: flex; gap: 8px; margin: 16px 0; flex-wrap: wrap;">
            <button class="btn-secondary" onclick="contactListingAgent(${listingIndex})" style="flex: 1; min-width: 100px; background: var(--secondary); color: white;">Email Agent</button>
            <button class="btn-secondary" onclick="showCallScriptModal(${listingIndex})" style="flex: 1; min-width: 100px;">Call Script</button>
            <button class="btn-secondary" onclick="copyOfferToClipboard(${listingIndex})" style="flex: 1; min-width: 100px;">Copy Details</button>
            <button class="btn-secondary" onclick="window.open('${getGoogleMapsUrl(listing)}')" style="flex: 1; min-width: 100px;">Maps</button>
        </div>
        ${listing.dom > 45 ? '<div style="margin: 8px 0;"><select onchange="if(this.value){var t=populateEmailTemplate(this.value,rawListings[' + listingIndex + ']);if(t){var subj=encodeURIComponent(t.subject);var body=encodeURIComponent(t.body);window.open(\\\'mailto:?subject=\\\'+ subj + \\\'&body=\\\' + body);}this.value=\\\'\\\'}" style="padding:6px 10px;border:1px solid var(--border-gray);border-radius:4px;font-size:12px;width:100%;"><option value="">Select an email template (stale listing)...</option><option value="initial_inquiry">Initial Inquiry</option><option value="price_discussion">Price Discussion</option><option value="post_viewing_offer">Post-Viewing Offer</option></select></div>' : ''}

        <div style="font-weight:700;color:var(--primary);margin:16px 0 8px;font-size:13px;">Research Links</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin: 0 0 16px 0;">
            <a href="${getRewSearchUrl(listing)}" target="_blank" class="btn-secondary" style="text-decoration: none; text-align: center; font-size: 11px;">REW.ca</a>
            <a href="${getRealtorUrl(listing)}" target="_blank" class="btn-secondary" style="text-decoration: none; text-align: center; font-size: 11px;">REALTOR.ca</a>
            <a href="${getBcAssessUrl(listing)}" target="_blank" class="btn-secondary" style="text-decoration: none; text-align: center; font-size: 11px;">BC Assessment</a>
            <a href="https://www.google.com/maps/@${listing.latitude},${listing.longitude},3a,75y,90t/data=!3m6!1e1!3m4" target="_blank" class="btn-secondary" style="text-decoration: none; text-align: center; font-size: 11px;">Street View</a>
        </div>

        ${(function() {
            var bcaData = getAssessment(listingIndex);
            if (!bcaData || !bcaData.assessedTotal) return '';
            var ratio = askingToAssessedRatio(listing.price, bcaData.assessedTotal);
            var ratioColor = ratio < 0.95 ? '#198754' : ratio <= 1.10 ? '#fd7e14' : '#dc3545';
            var h = '<div style="background:#f3e8ff;border:1px solid #d4b5ff;border-left:4px solid #6f42c1;border-radius:4px;padding:14px 16px;margin:0 0 16px 0;">';
            h += '<div style="font-weight:700;color:#6f42c1;margin-bottom:10px;font-size:13px;">BC Assessment Data</div>';
            h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;font-size:12px;">';
            h += '<div><span style="color:#888;">Assessed Total:</span><br><strong>' + formatPrice(bcaData.assessedTotal) + '</strong></div>';
            h += '<div><span style="color:#888;">Asking/Assessed:</span><br><strong style="color:' + ratioColor + ';">' + ratio.toFixed(2) + '</strong> ' + formatRatioText(ratio) + '</div>';
            if (bcaData.assessedLand) h += '<div><span style="color:#888;">Land Value:</span><br><strong>' + formatPrice(bcaData.assessedLand) + '</strong></div>';
            if (bcaData.assessedImprovement) h += '<div><span style="color:#888;">Improvement:</span><br><strong>' + formatPrice(bcaData.assessedImprovement) + '</strong></div>';
            if (bcaData.pid) h += '<div><span style="color:#888;">PID:</span><br><strong>' + formatPID(bcaData.pid) + '</strong></div>';
            if (bcaData.rollNumber) h += '<div><span style="color:#888;">Roll #:</span><br><strong>' + bcaData.rollNumber + '</strong></div>';
            if (bcaData.assessmentYear) h += '<div><span style="color:#888;">Assessment Year:</span><br><strong>' + bcaData.assessmentYear + '</strong></div>';
            h += '</div></div>';
            return h;
        })()}

        ${(function() {
            var nbr = listing.neighborhood;
            var trend = marketTrends[nbr];
            if (!trend) return '';
            return '<div style="background:#e7f3ff;padding:12px 14px;border-radius:4px;margin:0 0 16px 0;font-size:12px;">' +
                '<strong style="color:var(--primary);">Neighborhood Insight: ' + nbr + '</strong><br>' +
                '<span style="color:' + (trend.yoyChange < 0 ? 'var(--danger)' : 'var(--success)') + ';font-weight:600;">YoY: ' + (trend.yoyChange > 0 ? '+' : '') + trend.yoyChange + '%</span>' +
                ' &bull; Inventory: <strong>' + trend.inventory + '</strong>' +
                ' &bull; Sale/List: <strong>' + (trend.avgSaleToList * 100).toFixed(0) + '%</strong>' +
                ' &bull; Median DOM: <strong>' + trend.medianDOM + ' days</strong>' +
                (trend.yoyChange < -3 ? '<br><span style="color:var(--success);font-weight:600;">Strong buyer\'s market - prices declining. Good negotiating position.</span>' : '') +
                '</div>';
        })()}

        ${(function() {
            var tips = [];
            var trend = marketTrends[listing.neighborhood];
            if (listing.dom > 90) tips.push('This property has been on the market for <strong>' + listing.dom + ' days</strong>. Extended market time gives you strong negotiating leverage — the seller may be motivated.');
            else if (listing.dom > 60) tips.push('At <strong>' + listing.dom + ' days</strong> on market, the seller has passed typical selling windows. A well-structured offer below asking has good odds.');
            else if (listing.dom > 30) tips.push('Listed for <strong>' + listing.dom + ' days</strong>. This is past the initial interest window — reasonable offers below asking are expected.');

            if (trend) {
                if (trend.avgSaleToList < 0.95) tips.push('Properties in ' + listing.neighborhood + ' are selling at <strong>' + (trend.avgSaleToList * 100).toFixed(0) + '%</strong> of list price. Reference this ratio to justify your offer price.');
                if (trend.yoyChange < -3) tips.push('Prices in this area have dropped <strong>' + Math.abs(trend.yoyChange) + '%</strong> year-over-year. Use recent comparable sales as leverage to negotiate below asking.');
                if (trend.inventory === 'high') tips.push('Inventory is <strong>high</strong> in this area — the seller has competition. You have more options and less urgency.');
            }

            var benchmark = neighborhoodBenchmarks[listing.neighborhood];
            if (benchmark && benchmark[listing.type]) {
                var benchPrice = benchmark[listing.type];
                if (listing.price > benchPrice * 1.1) tips.push('This property is priced <strong>' + Math.round((listing.price / benchPrice - 1) * 100) + '% above</strong> the neighborhood benchmark of ' + formatPrice(benchPrice) + '. There may be room to negotiate.');
            }

            if (listing.score >= 70) tips.push('Deal Score of <strong>' + Math.round(listing.score) + '/100</strong> indicates excellent value. Move quickly — consider a competitive offer to secure this property.');
            else if (listing.score < 30) tips.push('Deal Score of <strong>' + Math.round(listing.score) + '/100</strong> suggests market pricing. Ensure your offer reflects comparable sales data.');

            if (tips.length === 0) return '';
            var html = '<div style="background:#f0f7ff;border:1px solid #b8daff;padding:14px 16px;border-radius:8px;margin:0 0 16px 0;">';
            html += '<div style="font-weight:700;color:var(--primary);margin-bottom:10px;font-size:13px;">Negotiation Strategy Advisor</div>';
            tips.forEach(function(tip) {
                html += '<div style="font-size:12px;color:#333;margin-bottom:8px;padding-left:16px;border-left:3px solid var(--secondary);line-height:1.5;">' + tip + '</div>';
            });
            html += '</div>';
            return html;
        })()}

        <div style="background:var(--light-gray);border-radius:8px;padding:14px 16px;margin:0 0 16px 0;">
            <div style="font-weight:700;color:var(--primary);margin-bottom:8px;font-size:13px;">Notes &amp; Tags</div>
            <div id="tagButtons_${listingIndex}" style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:10px;">
                ${renderTagButtons(listingIndex)}
            </div>
            <textarea id="listingNote_${listingIndex}" placeholder="Add a private note about this property..." style="width:100%;min-height:60px;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:12px;resize:vertical;box-sizing:border-box;" oninput="saveListingNote(${listingIndex})">${(listingNotes[listingIndex] || '').replace(/</g, '&lt;')}</textarea>
        </div>

        <button class="btn-success" onclick="toggleShortlist(${listingIndex}); closeDetailModal(); initializeShortlistTab();" style="width: 100%;">
            ${isShortlisted ? 'Remove from Shortlist' : 'Add to Shortlist'}
        </button>
    `;

    document.getElementById('modalBody').innerHTML = modalHtml;
    document.getElementById('detailModal').classList.add('active');
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('active');
}

function copyOfferToClipboard(listingIndex) {
    const listing = rawListings[listingIndex];
    const offers = calculateOffers(listing);
    const text = `Property: ${escapeHtml(listing.addr)}
Neighborhood: ${escapeHtml(listing.neighborhood)}
Asking Price: ${formatPrice(listing.price)}
Aggressive Lowball: ${formatPrice(offers.aggressive)}
Strategic Value: ${formatPrice(offers.strategic)}
Competitive: ${formatPrice(offers.competitive)}`;
    
    navigator.clipboard.writeText(text).then(() => {
        alert('Offer details copied to clipboard');
    });
}

// 13A: Format missing data as "—" instead of 0
function fmtVal(v) { return (v && v > 0) ? v : '—'; }
function fmtSqft(v) { return (v && v > 0) ? v.toLocaleString() : '—'; }

function formatPrice(price) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price);
}

// Build working external listing links
function getRewUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    if (jur !== 'CA-BC') return null; // REW.ca is BC only
    const slug = listing.addr.toLowerCase()
        .replace(/[#,\.]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    const city = getCityForListing(listing).toLowerCase().replace(/\s+/g, '-');
    return 'https://www.rew.ca/properties/' + slug + '-' + city + '-bc';
}
function getCityForListing(listing) {
    // Neighborhood-to-city mapping for regions where neighborhood != city
    var cityMap = {
        // South Surrey / White Rock
        'White Rock': 'White Rock', 'Crescent Beach': 'White Rock',
        'Morgan Creek': 'Surrey', 'Grandview Heights': 'Surrey',
        'King George Corridor': 'Surrey', 'Pacific Douglas': 'Surrey',
        'Elgin Chantrell': 'Surrey', 'Sunnyside Park': 'Surrey',
        'Ocean Park': 'Surrey', 'Hazelmere': 'Surrey',
        // Vancouver
        'Downtown': 'Vancouver', 'West End': 'Vancouver', 'Kitsilano': 'Vancouver',
        'Mount Pleasant': 'Vancouver', 'Commercial Drive': 'Vancouver',
        'Kerrisdale': 'Vancouver', 'Dunbar': 'Vancouver', 'Point Grey': 'Vancouver',
        'Marpole': 'Vancouver', 'Hastings-Sunrise': 'Vancouver', 'Renfrew-Collingwood': 'Vancouver',
        // Burnaby / New Westminster
        'Metrotown': 'Burnaby', 'Brentwood': 'Burnaby', 'Edmonds': 'Burnaby', 'Lougheed': 'Burnaby',
        'Downtown NW': 'New Westminster', 'Sapperton': 'New Westminster', 'Queensborough': 'New Westminster',
        // North Shore
        'Lower Lonsdale': 'North Vancouver', 'Lynn Valley': 'North Vancouver', 'Deep Cove': 'North Vancouver',
        'Ambleside': 'West Vancouver', 'Dundarave': 'West Vancouver', 'British Properties': 'West Vancouver',
        // Tri-Cities
        'Town Centre': 'Coquitlam', 'Burke Mountain': 'Coquitlam', 'Westwood Plateau': 'Coquitlam',
        'Port Coquitlam': 'Port Coquitlam', 'Inlet Centre': 'Port Moody', 'Heritage Mountain': 'Port Moody',
        // Ridge Meadows
        'Maple Ridge Town Centre': 'Maple Ridge', 'Silver Valley': 'Maple Ridge', 'Albion': 'Maple Ridge',
        'Pitt Meadows': 'Pitt Meadows',
        // Langley / Delta
        'Langley City': 'Langley', 'Willoughby': 'Langley', 'Walnut Grove': 'Langley', 'Fort Langley': 'Langley',
        'Tsawwassen': 'Delta', 'Ladner': 'Delta', 'North Delta': 'Delta',
        // Richmond
        'Richmond Centre': 'Richmond', 'Steveston': 'Richmond', 'Brighouse': 'Richmond',
        'Ironwood': 'Richmond', 'Terra Nova': 'Richmond',
        // Surrey (Expanded)
        'Fleetwood': 'Surrey', 'Guildford': 'Surrey', 'Cloverdale': 'Surrey',
        'Newton': 'Surrey', 'Panorama Ridge': 'Surrey', 'Fraser Heights': 'Surrey',
        // Edmonton
        'Downtown Edmonton': 'Edmonton', 'Oliver District': 'Edmonton', 'Strathcona': 'Edmonton',
        'Whyte Ave': 'Edmonton', 'Windermere': 'Edmonton', 'Terwillegar': 'Edmonton',
        'Riverbend': 'Edmonton', 'Mill Woods': 'Edmonton',
        'St. Albert': 'St. Albert', 'Sherwood Park': 'Sherwood Park',
        // Toronto
        'Downtown Core': 'Toronto', 'Yorkville': 'Toronto', 'The Annex': 'Toronto',
        'Liberty Village': 'Toronto', 'King West': 'Toronto', 'Leslieville': 'Toronto',
        'The Beaches': 'Toronto', 'North York': 'Toronto', 'Scarborough': 'Toronto',
        'Etobicoke': 'Toronto', 'Mississauga': 'Mississauga', 'Markham': 'Markham'
    };
    if (cityMap[listing.neighborhood]) return cityMap[listing.neighborhood];
    // For most neighborhoods, the neighborhood name IS the city
    return listing.neighborhood || 'Unknown';
}

function getRewSearchUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    if (jur !== 'CA-BC') return null;
    const city = getCityForListing(listing);
    return 'https://www.rew.ca/properties/search/results?query=' + encodeURIComponent(listing.addr + ' ' + city + ' BC');
}
function getGoogleMapsUrl(listing) {
    if (listing.latitude && listing.longitude) {
        return 'https://www.google.com/maps/@' + listing.latitude + ',' + listing.longitude + ',18z';
    }
    var loc = getLocationForListing(listing);
    return 'https://www.google.com/maps/search/' + encodeURIComponent(loc.fullAddress);
}
function getAssessmentUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    switch (jur) {
        case 'CA-BC': return 'https://www.bcassessment.ca/Property/AssessmentSearch';
        case 'CA-AB': return 'https://www.alberta.ca/property-assessment';
        case 'CA-ON': return 'https://www.mpac.ca/en/FindYourAssessment';
        case 'US-CA': return 'https://www.ocgov.com/assessor';
        default: return null;
    }
}
function getBcAssessUrl(listing) { return getAssessmentUrl(listing); }
function getZillowUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    if (jur !== 'US-CA') return null;
    var loc = getLocationForListing(listing);
    return 'https://www.zillow.com/homes/' + encodeURIComponent(loc.fullAddress);
}
function getRedfinUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    if (jur !== 'US-CA') return null;
    var loc = getLocationForListing(listing);
    return 'https://www.redfin.com/search#query=' + encodeURIComponent(loc.fullAddress);
}
function getRealtorUrl(listing) {
    var jur = getJurisdictionForListing(listing);
    if (jur && jur.startsWith('US')) return null; // Realtor.ca is Canada only
    const city = getCityForListing(listing);
    return 'https://www.realtor.ca/map#ZoomLevel=17&Center=' +
        listing.latitude + '%2C' + listing.longitude +
        '&LatitudeMax=' + (listing.latitude + 0.003) +
        '&LongitudeMax=' + (listing.longitude + 0.003) +
        '&LatitudeMin=' + (listing.latitude - 0.003) +
        '&LongitudeMin=' + (listing.longitude - 0.003) +
        '&Sort=6-D&PropertySearchTypeId=1&TransactionTypeId=2';
}

function getListingBadge(listing) {
    var badges = '';
    if (listing.dom <= 7) badges += '<span class="listing-badge badge-new">New</span>';
    if (listing.dom >= 90) badges += '<span class="listing-badge badge-hot">90+ Days</span>';
    badges += getMarketConditionBadge(listing);
    return badges;
}

function getMarketConditionBadge(listing) {
    var trend = marketTrends[listing.neighborhood];
    if (!trend) return '';
    // Score signals: negative YoY, high inventory, low sale-to-list, high median DOM → buyer's market
    var signals = 0;
    if (trend.yoyChange < -3) signals -= 2;
    else if (trend.yoyChange < 0) signals -= 1;
    else if (trend.yoyChange > 5) signals += 2;
    else if (trend.yoyChange > 2) signals += 1;
    if (trend.inventory === 'high') signals -= 1;
    else if (trend.inventory === 'low') signals += 1;
    if (trend.avgSaleToList < 0.96) signals -= 1;
    else if (trend.avgSaleToList > 1.0) signals += 1;
    if (trend.medianDOM > 50) signals -= 1;
    else if (trend.medianDOM < 20) signals += 1;

    if (signals <= -2) return '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:#d4edda;color:#155724;font-weight:600;white-space:nowrap;margin-left:3px;">Buyer\'s</span>';
    if (signals >= 2) return '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:#f8d7da;color:#721c24;font-weight:600;white-space:nowrap;margin-left:3px;">Seller\'s</span>';
    return '<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:#fff3cd;color:#856404;font-weight:600;white-space:nowrap;margin-left:3px;">Balanced</span>';
}

function exportFilteredCSV() {
    let csv = 'Address,Neighborhood,Type,Price,Beds,Baths,SqFt,$/SqFt,DOM,Year,Score,Agg. Offer,Agent\n';
    filteredListings.forEach(l => {
        const offers = calculateOffers(l);
        const ppsf = l.sqft > 0 ? Math.round(l.price / l.sqft) : 0;
        csv += `"${l.addr}","${l.neighborhood}","${l.type}",${l.price},${l.beds},${l.baths},${l.sqft},${ppsf},${l.dom},${l.yearBuilt},${Math.round(l.score)},${offers.aggressive},"${l.agent}"\n`;
    });
    downloadCSV(csv, 'filtered_listings.csv');
}

function exportShortlistCSV() {
    const shortlistedListings = rawListings.filter((l, idx) => shortlistedIds.has(idx));
    let csv = 'Address,Neighborhood,Type,Price,Beds,Baths,SqFt,DOM,Score,Agg. Offer\n';
    shortlistedListings.forEach(l => {
        const offers = calculateOffers(l);
        csv += `"${l.addr}","${l.neighborhood}","${l.type}",${l.price},${l.beds},${l.baths},${l.sqft},${l.dom},${Math.round(l.score)},${offers.aggressive}\n`;
    });
    downloadCSV(csv, 'shortlist.csv');
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
}




