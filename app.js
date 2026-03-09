        // ===== HTML Escaping Utility (XSS Prevention) =====
        function escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        // ===== Lazy Script Loader =====
        var _loadedScripts = {};
        function loadScript(url) {
            if (_loadedScripts[url]) return _loadedScripts[url];
            _loadedScripts[url] = new Promise(function(resolve, reject) {
                var s = document.createElement('script');
                s.src = url;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
            return _loadedScripts[url];
        }

        function loadLeaflet() {
            return loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js')
                .then(function() { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'); });
        }
        function loadChartJs() {
            return loadScript('https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js');
        }
        function loadJsPdf() {
            return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.3.1/jspdf.umd.min.js')
                .then(function() { return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.4/jspdf.plugin.autotable.min.js'); });
        }

        let rawListings = [];
        const FALLBACK_LISTINGS = [
            {"addr":"14971 Prospect Ave","price":32500000,"beds":6,"baths":8,"sqft":11811,"type":"House","lot":null,"agent":"Malcolm Hasman","neighborhood":"White Rock","dom":38,"yearBuilt":1990,"waterView":false,"latitude":49.025,"longitude":-122.808,"region":"South Surrey / White Rock"},
            {"addr":"1234 Ocean Blvd","price":899000,"beds":3,"baths":2,"sqft":1800,"type":"Townhouse","lot":null,"agent":"Sample Agent","neighborhood":"Parksville","dom":45,"yearBuilt":2010,"waterView":true,"latitude":49.317,"longitude":-124.312,"region":"Vancouver Island"},
            {"addr":"567 Mountain View Dr","price":650000,"beds":2,"baths":1,"sqft":1100,"type":"Apt/Condo","lot":null,"agent":"Sample Agent","neighborhood":"Nanaimo","dom":22,"yearBuilt":2015,"waterView":false,"latitude":49.166,"longitude":-123.940,"region":"Vancouver Island"},
            {"addr":"890 Garden Lane","price":1250000,"beds":4,"baths":3,"sqft":2400,"type":"House","lot":"50x120","agent":"Sample Agent","neighborhood":"Comox","dom":90,"yearBuilt":2005,"waterView":false,"latitude":49.686,"longitude":-124.997,"region":"Vancouver Island"},
            {"addr":"2468 Sunset Rd","price":1750000,"beds":5,"baths":4,"sqft":3200,"type":"House","lot":"60x130","agent":"Sample Agent","neighborhood":"Morgan Creek","dom":120,"yearBuilt":2000,"waterView":false,"latitude":49.040,"longitude":-122.810,"region":"South Surrey / White Rock"}
        ];

        let neighborhoodBenchmarks = {};
        
        let trendBonus = {};

        let marketTrends = {};
        
        let filteredListings = [];
        let shortlistedIds = new Set();
        let currentPage = 0;
        let listingsPerPage = 25;
        let markerClusterGroup = null;
        let leafletMap = null;
        let chartsInitialized = {};
        
        async function loadExternalData() {
            try {
                var resp = await fetch('data/listings.json');
                if (resp.ok) {
                    var listingsData = await resp.json();
                    rawListings = listingsData.listings || listingsData;
                }
            } catch(e) { console.warn('Failed to load data/listings.json, using fallback'); }
            if (rawListings.length === 0) {
                rawListings = FALLBACK_LISTINGS;
                window._usingFallbackData = true;
            }

            try {
                var resp2 = await fetch('data.json');
                if (resp2.ok) {
                    var data = await resp2.json();
                    if (data.benchmarks) neighborhoodBenchmarks = data.benchmarks;
                    if (data.marketTrends) marketTrends = data.marketTrends;
                    if (data.trendBonus) trendBonus = data.trendBonus;
                    if (data.areaIntel) neighborhoodEnrichment = data.areaIntel;
                    if (data.lenders) externalLenders = data.lenders;
                    if (data.brokers) externalBrokers = data.brokers;
                    if (data.dataAsOf) window._dataAsOf = data.dataAsOf;
                }
            } catch(e) { console.warn('Failed to load data.json'); }
        }

        var externalLenders = null;
        var externalBrokers = null;

        document.addEventListener('DOMContentLoaded', async () => {
            await loadExternalData();
            document.getElementById('loadingOverlay').classList.add('hidden');
            if (window._usingFallbackData) {
                var fw = document.getElementById('fallbackWarning');
                if (fw) fw.style.display = 'block';
            }
            loadShortlist();
            initializeFilters();
            applyFilters();
            updateApiKeyStatus();
            loadFilterPresetList();
            renderSearchAlerts();
            calcMortgage();
            initializeDashboard();
            checkViewMode();
            updateRecentlyViewed();

            // GitHub Issues feedback form handler
            var feedbackForm = document.getElementById('feedbackForm');
            if (feedbackForm) {
                feedbackForm.addEventListener('submit', function(e) {
                    e.preventDefault();
                    submitFeedbackToGitHub(feedbackForm);
                });
            }
            updateGitHubConfigStatus();
            showWelcomeBanner();
            checkStalenessWarning();
        });
        
        function loadShortlist() {
            const saved = localStorage.getItem('shortlist');
            if (saved) {
                shortlistedIds = new Set(JSON.parse(saved));
            }
        }
        
        function saveShortlist() {
            localStorage.setItem('shortlist', JSON.stringify([...shortlistedIds]));
        }
        
        function toggleShortlist(index) {
            if (shortlistedIds.has(index)) {
                shortlistedIds.delete(index);
            } else {
                shortlistedIds.add(index);
            }
            saveShortlist();
            renderCurrentTab();
        }
        
        // ===== INVESTOR MODE =====
        var investorModeActive = false;

        function toggleInvestorMode() {
            investorModeActive = document.getElementById('investorModeToggle').checked;
            document.getElementById('investorModeOptions').style.display = investorModeActive ? 'block' : 'none';
            applyFilters();
        }

        function estimateMonthlyRent(listing) {
            var price = listing.price;
            var type = (listing.type || '').toLowerCase();
            var sqft = listing.sqft || 0;

            // Primary model: sqft-based rent (more accurate than price for expensive properties)
            if (sqft > 0) {
                var rentPerSqft; // monthly $/sqft
                if (type.indexOf('condo') >= 0 || type.indexOf('apt') >= 0) {
                    rentPerSqft = 3.00;
                    return Math.max(1800, Math.min(Math.round(sqft * rentPerSqft), 5500));
                } else if (type.indexOf('town') >= 0 || type.indexOf('row') >= 0) {
                    rentPerSqft = 2.40;
                    return Math.max(2400, Math.min(Math.round(sqft * rentPerSqft), 6000));
                } else {
                    rentPerSqft = 1.80;
                    return Math.max(2800, Math.min(Math.round(sqft * rentPerSqft), 8000));
                }
            }

            // Fallback: diminishing price ratio when sqft is missing
            var ratio;
            if (type.indexOf('condo') >= 0 || type.indexOf('apt') >= 0) {
                ratio = price <= 600000 ? 0.0040 : price <= 1000000 ? 0.0033 : 0.0025;
            } else if (type.indexOf('town') >= 0 || type.indexOf('row') >= 0) {
                ratio = price <= 800000 ? 0.0035 : price <= 1200000 ? 0.0028 : 0.0022;
            } else {
                ratio = price <= 1000000 ? 0.0030 : price <= 2000000 ? 0.0022 : 0.0015;
            }
            return Math.round(price * ratio);
        }

        function estimateInvestorMetrics(listing) {
            var rent = estimateMonthlyRent(listing);
            var price = listing.price;
            var annualRent = rent * 12;
            var vacancyRate = 0.05;
            var effectiveIncome = annualRent * (1 - vacancyRate);
            // Estimate operating expenses: property tax + insurance + maintenance ~ 1.5% of price/year
            var opEx = price * 0.015;
            var noi = effectiveIncome - opEx;
            var capRate = price > 0 ? (noi / price) * 100 : 0;
            // Monthly mortgage estimate (20% down, 5.5%, 25yr)
            var mortAmount = price * 0.80;
            var mRate = 0.055 / 12;
            var nPmt = 300;
            var mortPayment = mRate > 0 ? mortAmount * (mRate * Math.pow(1 + mRate, nPmt)) / (Math.pow(1 + mRate, nPmt) - 1) : 0;
            var monthlyCashFlow = rent * (1 - vacancyRate) - (opEx / 12) - mortPayment;
            return { rent: rent, capRate: capRate, cashFlow: Math.round(monthlyCashFlow), noi: Math.round(noi) };
        }

        // Debounce utility for number inputs
        var _debounceTimer = null;
        function debouncedApply() {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(function() { applyFilters(); }, 350);
        }

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
                return;
            }
            
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




        // ===== PHASE 1: Mobile View Mode Check =====
        function checkViewMode() {
            if (window.innerWidth <= 768) {
                // Auto-switch to card view on mobile
                if (typeof switchListingView === 'function' && document.getElementById('cardGridContainer')) {
                    switchListingView('cards');
                }
            }
        }
        window.addEventListener('resize', function() { checkViewMode(); });

        // ===== PHASE 2.1: Stale Deals Dashboard =====
        var _staleShowAll = false;
        function toggleStaleShowMore() {
            _staleShowAll = !_staleShowAll;
            renderStaleDeals();
        }

        function renderStaleDeals() {
            var container = document.getElementById('dashStaleDeals');
            if (!container) return;

            var sortBy = (document.getElementById('staleSortBy') || {}).value || 'score';
            var staleDeals = rawListings
                .map(function(l, idx) { return Object.assign({}, l, { idx: idx, score: calculateScore(l), motivation: calculateMotivationScore(l) }); })
                .filter(function(l) { return l.dom > 60; });

            if (sortBy === 'dom') staleDeals.sort(function(a, b) { return b.dom - a.dom; });
            else if (sortBy === 'price') staleDeals.sort(function(a, b) { return a.price - b.price; });
            else if (sortBy === 'motivation') staleDeals.sort(function(a, b) { return b.motivation - a.motivation; });
            else staleDeals.sort(function(a, b) { return b.score - a.score; });

            var showCount = _staleShowAll ? 12 : 6;
            var visibleDeals = staleDeals.slice(0, showCount);

            // Show/hide "Show More" button
            var showMoreWrap = document.getElementById('staleShowMoreWrap');
            if (showMoreWrap) {
                if (staleDeals.length > 6) {
                    showMoreWrap.style.display = 'block';
                    var btn = document.getElementById('staleShowMoreBtn');
                    if (btn) btn.textContent = _staleShowAll ? 'Show Less' : 'Show More (' + Math.min(staleDeals.length - 6, 6) + ' more)';
                } else {
                    showMoreWrap.style.display = 'none';
                }
            }

            if (visibleDeals.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:#999;">No stale listings found (60+ DOM)</div>';
                return;
            }

            var html = '';
            visibleDeals.forEach(function(l) {
                var trend = marketTrends[l.neighborhood] || {};
                var motBadge = getMotivationBadge(l.motivation);
                var detailed = calculateScoreDetailed(l);
                var bd = detailed.breakdown;
                html += '<div class="stale-deal-card">';
                html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">';
                html += '<div style="font-weight:700;color:var(--primary);font-size:13px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;" onclick="showDetailModal(' + l.idx + ')">' + escapeHtml(l.addr) + '</div>';
                html += '<span class="score-badge ' + getScoreClass(l.score) + '" style="margin-left:8px;cursor:pointer;" onclick="toggleStaleBreakdown(this)">' + l.score + '</span>';
                html += '</div>';
                html += '<div style="font-size:18px;font-weight:700;color:var(--primary);margin-bottom:4px;">' + formatPrice(l.price) + '</div>';
                html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px;">';
                html += '<span style="background:#f8d7da;color:#721c24;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;">' + l.dom + ' days</span>';
                html += motBadge;
                if (trend.avgSaleToList) html += '<span style="font-size:11px;color:#888;">' + (trend.avgSaleToList * 100).toFixed(1) + '% sale/list</span>';
                html += '</div>';
                html += '<div style="font-size:11px;color:#888;margin-bottom:8px;">' + escapeHtml(l.neighborhood) + ' &middot; ' + l.beds + ' bed &middot; ' + l.baths + ' bath' + (l.sqft ? ' &middot; ' + l.sqft.toLocaleString() + ' sqft' : '') + '</div>';
                // Score breakdown (hidden by default)
                html += '<div class="stale-breakdown" style="display:none;font-size:11px;background:var(--light-gray);padding:8px;border-radius:6px;margin-bottom:8px;">';
                html += '<div style="font-weight:600;margin-bottom:4px;color:var(--primary);">Score Breakdown</div>';
                html += '<div>DOM: +' + bd.dom.weighted + ' (' + bd.dom.label + ')</div>';
                html += '<div>Benchmark: +' + bd.benchmark.weighted + ' (' + bd.benchmark.label + ')</div>';
                html += '<div>$/sqft: +' + bd.ppsf.weighted + ' (' + bd.ppsf.label + ')</div>';
                html += '<div>Trend: +' + bd.trend.points + ' (' + bd.trend.label + ')</div>';
                html += '<div>Motivation: ' + l.motivation + '/100</div>';
                html += '</div>';
                // Draft Offer button
                html += '<button onclick="event.stopPropagation();openOfferBuilder(' + l.idx + ')" style="width:100%;padding:5px 0;background:var(--secondary);color:white;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">Draft Offer</button>';
                html += '</div>';
            });
            container.innerHTML = html;
        }

        function toggleStaleBreakdown(el) {
            event.stopPropagation();
            var card = el.closest('.stale-deal-card');
            var breakdown = card.querySelector('.stale-breakdown');
            if (breakdown) breakdown.style.display = breakdown.style.display === 'none' ? 'block' : 'none';
        }

        // ===== PHASE 2.2: Seller Motivation Score =====
        function calculateMotivationScore(listing) {
            var score = 0;
            if (listing.dom > 150) score += 40;
            else if (listing.dom > 120) score += 35;
            else if (listing.dom > 90) score += 28;
            else if (listing.dom > 60) score += 20;
            else if (listing.dom > 45) score += 12;
            else if (listing.dom > 30) score += 5;

            var history = getPriceHistory();
            var propHistory = history[listing.addr] || [];
            var drops = 0;
            if (Array.isArray(propHistory)) {
                drops = propHistory.filter(function(h) { return h && h.type === 'drop'; }).length;
            }
            score += Math.min(drops * 10, 30);

            var benchmark = (neighborhoodBenchmarks[listing.neighborhood] || {})[listing.type] || listing.price;
            var overPct = ((listing.price / benchmark) - 1) * 100;
            if (overPct > 15) score += 20;
            else if (overPct > 10) score += 15;
            else if (overPct > 5) score += 10;
            else if (overPct > 0) score += 5;

            var trend = marketTrends[listing.neighborhood];
            if (trend && trend.avgSaleToList < 0.93) score += 10;
            else if (trend && trend.avgSaleToList < 0.95) score += 5;

            return Math.min(100, score);
        }

        function getMotivationBadge(score) {
            if (score >= 70) return '<span class="motivation-badge motivation-high">High Motivation</span>';
            if (score >= 40) return '<span class="motivation-badge motivation-moderate">Moderate Motivation</span>';
            return '<span class="motivation-badge motivation-standard">Standard</span>';
        }

        function getScoreClass(score) {
            if (score >= 70) return 'score-hot';
            if (score >= 50) return 'score-good';
            if (score >= 30) return 'score-watching';
            return 'score-low';
        }

        // ===== PHASE 2.3: Stale Email Templates =====
        var staleEmailTemplates = {
            initial_inquiry: {
                subject: "Inquiry Regarding {address}",
                body: "Dear {agentName},\n\nI am writing to express my interest in the property at {address}, currently listed at {price}.\n\nI am an unrepresented buyer with pre-approved financing and am prepared to move quickly on the right property. I understand this home has been on the market for {dom} days, and I would welcome the opportunity to discuss it further with you.\n\nWould you be available for a showing this week? I am also open to discussing terms that work for both the seller and myself.\n\nThank you for your time,\n{buyerName}\n{buyerPhone}\n{buyerEmail}"
            },
            price_discussion: {
                subject: "RE: {address} — Interest in Discussing Terms",
                body: "Dear {agentName},\n\nThank you for showing me the property at {address}. I appreciated the opportunity to view it.\n\nAfter careful analysis of recent comparable sales in {neighborhood} and current market conditions, I am interested in submitting an offer. I wanted to reach out first to understand whether the seller would be receptive to offers in the range of {strategicPrice} to {competitivePrice}.\n\nI am flexible on closing dates and prepared to submit a formal offer with standard subject conditions at your convenience.\n\nBest regards,\n{buyerName}\n{buyerPhone}"
            },
            post_viewing_offer: {
                subject: "Offer Submission — {address}",
                body: "Dear {agentName},\n\nFollowing my viewing of {address}, I am pleased to submit the attached offer.\n\nKey terms:\n- Offer price: {offerPrice}\n- Deposit: 5% within 24 hours of acceptance\n- Subject removal: 10 business days\n- Completion: 30-60 days\n\nI am an unrepresented buyer, so no buyer agent commission applies. I look forward to your response.\n\nSincerely,\n{buyerName}\n{buyerPhone}\n{buyerEmail}"
            }
        };

        function populateEmailTemplate(templateKey, listing) {
            var t = staleEmailTemplates[templateKey];
            if (!t) return null;
            var offers = generateOfferPrices(listing);
            var replacements = {
                '{address}': listing.addr,
                '{agentName}': (listing.agent || '').split(',')[0] || 'Listing Agent',
                '{price}': formatPrice(listing.price),
                '{dom}': listing.dom,
                '{neighborhood}': listing.neighborhood,
                '{buyerName}': getBuyerField('name') || '[Your Name]',
                '{buyerPhone}': getBuyerField('phone') || '[Your Phone]',
                '{buyerEmail}': getBuyerField('email') || '[Your Email]',
                '{strategicPrice}': formatPrice(offers.strategic),
                '{competitivePrice}': formatPrice(offers.competitive),
                '{offerPrice}': formatPrice(offers.strategic)
            };
            var subject = t.subject;
            var body = t.body;
            for (var key in replacements) {
                subject = subject.split(key).join(replacements[key]);
                body = body.split(key).join(replacements[key]);
            }
            return { subject: subject, body: body };
        }

        function generateOfferPrices(listing) {
            var benchmark = (neighborhoodBenchmarks[listing.neighborhood] || {})[listing.type] || listing.price;
            var trend = marketTrends[listing.neighborhood] || {};
            var domFactor = Math.min(listing.dom / 120, 1);
            var aggDiscount = 0.08 + (domFactor * 0.07);
            var stratDiscount = 0.04 + (domFactor * 0.04);
            var compDiscount = 0.01 + (domFactor * 0.02);
            if (listing.price > benchmark * 1.1) {
                var overPremium = (listing.price / benchmark - 1) * 0.5;
                aggDiscount += overPremium * 0.3;
                stratDiscount += overPremium * 0.2;
                compDiscount += overPremium * 0.1;
            }
            return {
                aggressive: Math.round(listing.price * (1 - aggDiscount)),
                strategic: Math.round(listing.price * (1 - stratDiscount)),
                competitive: Math.round(listing.price * (1 - compDiscount))
            };
        }

        // ===== PHASE 2.4: Deal Score Breakdown =====
        function calculateScoreDetailed(listing) {
            var w = {
                dom: parseFloat((document.getElementById('wDOM') || {}).value) || 5,
                bench: parseFloat((document.getElementById('wBench') || {}).value) || 5,
                ppsf: parseFloat((document.getElementById('wPPSF') || {}).value) || 5,
                lot: parseFloat((document.getElementById('wLot') || {}).value) || 5,
                age: parseFloat((document.getElementById('wAge') || {}).value) || 5
            };
            var totalWeight = w.dom + w.bench + w.ppsf + w.lot + w.age;
            if (totalWeight === 0) totalWeight = 1;

            // DOM score (0-10)
            var domPts = 0;
            if (listing.dom > 120) domPts = 10;
            else if (listing.dom > 90) domPts = 8;
            else if (listing.dom > 60) domPts = 6;
            else if (listing.dom > 30) domPts = 4;
            else if (listing.dom > 14) domPts = 2;
            else domPts = 0;

            // Benchmark score
            var benchmark = (neighborhoodBenchmarks[listing.neighborhood] || {})[listing.type] || listing.price;
            var premium = ((listing.price / benchmark) - 1) * 100;
            var benchPts = 0;
            if (premium < -15) benchPts = 10;
            else if (premium < -10) benchPts = 8;
            else if (premium < -5) benchPts = 6;
            else if (premium < 0) benchPts = 4;
            else if (premium < 5) benchPts = 2;
            else benchPts = 0;

            // $/sqft score
            var ppsfPts = 0;
            var pctDiff = 0;
            if (listing.sqft > 0) {
                var ppsf = listing.price / listing.sqft;
                var nbhPpsf = [];
                rawListings.forEach(function(l) {
                    if (l.neighborhood === listing.neighborhood && l.type === listing.type && l.sqft > 0) {
                        nbhPpsf.push(l.price / l.sqft);
                    }
                });
                if (nbhPpsf.length > 0) {
                    var avgPpsf = nbhPpsf.reduce(function(a, b) { return a + b; }, 0) / nbhPpsf.length;
                    pctDiff = ((ppsf / avgPpsf) - 1) * 100;
                    if (pctDiff < -15) ppsfPts = 10;
                    else if (pctDiff < -10) ppsfPts = 8;
                    else if (pctDiff < -5) ppsfPts = 6;
                    else if (pctDiff < 0) ppsfPts = 4;
                    else ppsfPts = 0;
                }
            }

            // Lot score
            var lotPts = 0;
            if (listing.lot) lotPts = 4;

            // Age score
            var agePts = 0;
            var age = listing.yearBuilt ? (2026 - listing.yearBuilt) : 50;
            if (age < 5) agePts = 8;
            else if (age < 15) agePts = 6;
            else if (age < 30) agePts = 4;
            else if (age < 50) agePts = 2;

            var tb = (trendBonus[listing.neighborhood] || 5);
            var wv = listing.waterView ? 5 : 0;
            var score = ((domPts * w.dom + benchPts * w.bench + ppsfPts * w.ppsf + lotPts * w.lot + agePts * w.age) / totalWeight) * 8 + tb + wv;

            // BC Assessment ratio bonus
            var assessPts = 0;
            var assessLabel = 'No assessment data';
            var _bcaDetailed = getAssessment(listing.listingIndex);
            if (_bcaDetailed && _bcaDetailed.assessedTotal) {
                var _ratioD = listing.price / _bcaDetailed.assessedTotal;
                if (_ratioD < 0.90) { assessPts = 3; assessLabel = 'Ratio ' + _ratioD.toFixed(2) + ' (strong deal)'; }
                else if (_ratioD < 0.95) { assessPts = 2; assessLabel = 'Ratio ' + _ratioD.toFixed(2) + ' (below assessed)'; }
                else if (_ratioD < 1.00) { assessPts = 1; assessLabel = 'Ratio ' + _ratioD.toFixed(2) + ' (near assessed)'; }
                else if (_ratioD > 1.15) { assessPts = -1; assessLabel = 'Ratio ' + _ratioD.toFixed(2) + ' (above assessed)'; }
                else { assessPts = 0; assessLabel = 'Ratio ' + _ratioD.toFixed(2); }
            }
            score += assessPts;

            return {
                total: Math.min(100, Math.max(0, Math.round(score))),
                breakdown: {
                    dom: { points: domPts, weight: w.dom, weighted: Math.round(domPts * w.dom / totalWeight * 8), label: listing.dom + ' DOM', color: '#e74c3c' },
                    benchmark: { points: benchPts, weight: w.bench, weighted: Math.round(benchPts * w.bench / totalWeight * 8), label: premium.toFixed(1) + '% vs benchmark', color: '#3498db' },
                    ppsf: { points: ppsfPts, weight: w.ppsf, weighted: Math.round(ppsfPts * w.ppsf / totalWeight * 8), label: pctDiff.toFixed(1) + '% vs avg $/sqft', color: '#2ecc71' },
                    lot: { points: lotPts, weight: w.lot, weighted: Math.round(lotPts * w.lot / totalWeight * 8), label: listing.lot || 'N/A', color: '#f39c12' },
                    age: { points: agePts, weight: w.age, weighted: Math.round(agePts * w.age / totalWeight * 8), label: listing.yearBuilt ? (2026 - listing.yearBuilt) + ' years old' : 'Unknown', color: '#9b59b6' },
                    trend: { points: tb, label: listing.neighborhood + ' trend', color: '#1abc9c' },
                    waterView: { points: wv, label: listing.waterView ? 'Water view' : 'No water view', color: '#34495e' },
                    assessment: { points: assessPts, label: assessLabel, color: '#6f42c1' }
                }
            };
        }

        function renderScoreBreakdown(listing) {
            var detail = calculateScoreDetailed(listing);
            var parts = ['dom', 'benchmark', 'ppsf', 'lot', 'age', 'trend', 'waterView', 'assessment'];
            var total = detail.total || 1;
            var html = '<div class="score-breakdown">';
            html += '<div class="score-breakdown-title">Deal Score Breakdown: ' + detail.total + '/100</div>';
            html += '<div class="score-bar-container">';
            parts.forEach(function(key) {
                var b = detail.breakdown[key];
                if (b.points > 0) {
                    var pct = Math.max(5, (b.points / total * 100));
                    html += '<div class="score-segment" style="width:' + pct + '%;background:' + b.color + ';" title="' + key + ': +' + b.points + '">' + key.substr(0,3) + '</div>';
                }
            });
            html += '</div>';
            html += '<div class="score-legend">';
            parts.forEach(function(key) {
                var b = detail.breakdown[key];
                html += '<div class="score-legend-item"><div class="score-legend-dot" style="background:' + b.color + ';"></div>' + b.label + ' (+' + b.points + ')</div>';
            });
            html += '</div></div>';
            return html;
        }

        // ===== PHASE 3.1: Negotiation Insights =====
        function getNegotiationInsights(listing) {
            var insights = [];
            var trend = marketTrends[listing.neighborhood] || {};
            var offers = generateOfferPrices(listing);

            if (trend.inventory === 'high') {
                insights.push({ type: 'advantage', title: "Buyer's Market",
                    text: listing.neighborhood + ' has high inventory with prices declining ' + Math.abs(trend.yoyChange || 0).toFixed(1) + '% year-over-year. You have strong negotiating leverage.' });
            }
            if (listing.dom > 90) {
                insights.push({ type: 'advantage', title: 'Extended Listing Period',
                    text: 'At ' + listing.dom + ' days on market (vs ' + (trend.medianDOM || 35) + '-day neighborhood median), the seller is likely motivated. Your aggressive offer of ' + formatPrice(offers.aggressive) + ' is reasonable to start the conversation.' });
            } else if (listing.dom > 45) {
                insights.push({ type: 'neutral', title: 'Above Average Listing Period',
                    text: 'At ' + listing.dom + ' days, this is above the ' + (trend.medianDOM || 35) + '-day median. The strategic offer of ' + formatPrice(offers.strategic) + ' is a solid opening position.' });
            }
            var benchmark = (neighborhoodBenchmarks[listing.neighborhood] || {})[listing.type];
            if (benchmark && listing.price > benchmark * 1.1) {
                var overPct = ((listing.price / benchmark) - 1) * 100;
                insights.push({ type: 'advantage', title: 'Priced Above Benchmark',
                    text: 'This property is listed ' + overPct.toFixed(0) + '% above the ' + listing.type + ' benchmark for ' + listing.neighborhood + ' (' + formatPrice(benchmark) + '). Use this fact when justifying your offer price.' });
            }
            if (trend.avgSaleToList && trend.avgSaleToList < 0.95) {
                insights.push({ type: 'advantage', title: 'Below-Ask Sales Common',
                    text: 'Properties in ' + listing.neighborhood + ' are selling at ' + (trend.avgSaleToList * 100).toFixed(1) + '% of asking price on average. Sellers expect negotiation.' });
            }
            insights.push({ type: 'tip', title: 'Strengthen Your Offer',
                text: 'Attach your pre-approval letter to demonstrate financial readiness. As an unrepresented buyer, the seller saves on buyer agent commission — mention this as a benefit.' });
            return insights;
        }

        function renderNegotiationInsights(listing) {
            var insights = getNegotiationInsights(listing);
            var html = '<div class="insight-panel"><div style="font-weight:700;color:var(--primary);margin-bottom:10px;font-size:14px;">Negotiation Insights</div>';
            insights.forEach(function(i) {
                html += '<div class="insight-item insight-' + i.type + '">';
                html += '<div class="insight-item-title">' + i.title + '</div>';
                html += '<div>' + i.text + '</div>';
                html += '</div>';
            });
            html += '</div>';
            return html;
        }

        // ===== PHASE 3.2: Call Script =====
        function generateCallScript(listing) {
            var buyerName = getBuyerField('name') || '[Your Name]';
            return [
                { label: 'Opening', text: '"Hi, my name is ' + buyerName + '. I\'m calling about the property at ' + escapeHtml(listing.addr) + ', listed at ' + formatPrice(listing.price) + '. I found it on your listing and I\'m interested in learning more."' },
                { label: 'Establish Status', text: '"I should mention that I\'m an unrepresented buyer — I don\'t have a buyer\'s agent. I\'m looking to work directly with you on this."' },
                { label: 'Ask About Property', text: '"Could you tell me a bit about the property\'s history? I noticed it\'s been listed for ' + listing.dom + ' days. Has the seller received any offers?"' },
                { label: 'Express Interest', text: '"I\'m genuinely interested and I have my financing arranged. Would you be available for a showing this week?"' },
                { label: 'Discuss Price', text: listing.dom > 60
                    ? '"Given the time on market, would the seller be open to considering an offer in the ' + formatPrice(Math.round(listing.price * 0.9)) + ' to ' + formatPrice(Math.round(listing.price * 0.95)) + ' range?"'
                    : '"I\'ve been looking at comparable sales in the area. Could you share any recent comparable information the seller has considered in their pricing?"' },
                { label: 'Close', text: '"Thank you for your time. I\'ll put together a formal offer and email it to you. What\'s the best email address to send it to?"' }
            ];
        }

        function showCallScriptModal(listingIndex) {
            var listing = rawListings[listingIndex];
            if (!listing) return;
            var scripts = generateCallScript(listing);
            var html = '<div style="max-height:70vh;overflow:auto;">';
            html += '<h3 style="color:var(--primary);margin-bottom:12px;">Call Script: ' + escapeHtml(listing.addr) + '</h3>';
            html += '<div style="background:#d1ecf1;padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:16px;"><strong>Tips:</strong> Speak calmly and confidently. Don\'t volunteer your maximum budget. Ask questions — the more the agent talks, the more you learn.</div>';
            scripts.forEach(function(s, i) {
                html += '<div class="call-script-step">';
                html += '<div class="call-script-label">Step ' + (i + 1) + ': ' + s.label + '</div>';
                html += '<div class="call-script-text">' + s.text + '</div>';
                html += '</div>';
            });
            html += '</div>';
            showGenericModal(html);
        }

        // ===== PHASE 3.3: Post-Offer Timeline =====
        function showPostOfferTimeline(listing) {
            var steps = [
                { title: 'Offer Sent', desc: 'Your offer has been emailed to the listing agent.', done: true },
                { title: 'Wait for Response', desc: 'The seller typically responds within 24-72 hours. The offer is irrevocable until the date you specified.', done: false },
                { title: 'If Counter-Offered', desc: 'Review the counter carefully. You can accept, reject, or counter back. There is no limit to rounds of negotiation.', done: false },
                { title: 'If Accepted', desc: 'The subject period begins. Complete all due diligence items before the subject removal date.', done: false },
                { title: 'Subject Removal', desc: 'Complete: home inspection, financing confirmation, title search, lawyer review, strata docs (if applicable).', done: false },
                { title: 'Remove Subjects', desc: 'Sign the subject removal form. The deal is now firm. Deliver your deposit to the specified trust account.', done: false },
                { title: 'Completion Day', desc: 'Your lawyer handles the title transfer, mortgage registration, and key exchange. Budget for closing costs.', done: false }
            ];
            var html = '<div style="max-height:70vh;overflow:auto;">';
            html += '<h3 style="color:var(--primary);margin-bottom:16px;">Post-Offer Checklist</h3>';
            steps.forEach(function(step, i) {
                html += '<div class="timeline-step">';
                html += '<div class="timeline-dot ' + (step.done ? 'done' : 'pending') + '">' + (step.done ? '&#10003;' : (i + 1)) + '</div>';
                html += '<div style="flex:1;">';
                html += '<div style="font-weight:700;color:var(--primary);font-size:13px;">' + step.title + '</div>';
                html += '<div style="font-size:12px;color:#666;">' + step.desc + '</div>';
                html += '</div></div>';
                if (i < steps.length - 1) html += '<div class="timeline-line"></div>';
            });
            html += '</div>';
            showGenericModal(html);
        }

        // ===== Generic Modal Helper =====
        function showGenericModal(content) {
            var modal = document.getElementById('genericModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'genericModal';
                modal.className = 'modal';
                modal.onclick = function(e) { if (e.target === modal) modal.classList.remove('active'); };
                modal.innerHTML = '<div class="modal-content" style="max-width:700px;max-height:90vh;overflow:auto;"><button class="modal-close" onclick="document.getElementById(\'genericModal\').classList.remove(\'active\')">&times;</button><div id="genericModalBody"></div></div>';
                document.body.appendChild(modal);
            }
            document.getElementById('genericModalBody').innerHTML = content;
            modal.classList.add('active');
        }

        // ===== PHASE 5.2: Market Condition Banner =====
        function getMarketBanner(listing) {
            var trend = marketTrends[listing.neighborhood];
            if (!trend) return '';
            var isBuyersMarket = trend.inventory === 'high' || trend.yoyChange < -3;
            var isSellersMarket = trend.yoyChange > 2;
            var bgColor = isBuyersMarket ? '#d4edda' : (isSellersMarket ? '#f8d7da' : '#fff3cd');
            var icon = isBuyersMarket ? '&#9899;' : (isSellersMarket ? '&#128308;' : '&#128992;');
            var title = isBuyersMarket ? "BUYER'S MARKET" : (isSellersMarket ? "SELLER'S MARKET" : 'BALANCED MARKET');
            var stats = listing.neighborhood + ': ' + (trend.yoyChange > 0 ? '+' : '') + trend.yoyChange + '% YoY | ' + trend.medianDOM + '-day median DOM | ' + (trend.avgSaleToList * 100).toFixed(1) + '% sale-to-list';
            return '<div class="market-banner" style="background:' + bgColor + ';"><span>' + icon + '</span><span class="market-banner-title">' + title + '</span><span style="font-size:12px;color:#555;margin-left:auto;">' + stats + '</span></div>';
        }

        // ===== PHASE 5.3: Neighborhood Comparison =====
        function openNeighborhoodComparison() {
            var neighborhoods = Object.keys(neighborhoodBenchmarks);
            var html = '<div style="max-height:80vh;overflow:auto;">';
            html += '<h3 style="color:var(--primary);margin-bottom:12px;">Compare Neighborhoods</h3>';
            html += '<p style="font-size:12px;color:#888;margin-bottom:16px;">Select 2-4 neighborhoods to compare side by side.</p>';
            html += '<div class="neighborhood-compare-controls" id="nbhCompareControls">';
            neighborhoods.forEach(function(n) {
                html += '<label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:4px 8px;border:1px solid var(--border-gray);border-radius:4px;cursor:pointer;"><input type="checkbox" value="' + n + '" onchange="updateNeighborhoodComparison()">' + n + '</label>';
            });
            html += '</div>';
            html += '<div id="nbhComparisonResult"></div>';
            html += '</div>';
            showGenericModal(html);
        }

        function updateNeighborhoodComparison() {
            var checks = document.querySelectorAll('#nbhCompareControls input:checked');
            var selected = [];
            checks.forEach(function(c) { selected.push(c.value); });
            if (selected.length < 2) {
                document.getElementById('nbhComparisonResult').innerHTML = '<div style="text-align:center;padding:20px;color:#999;">Select at least 2 neighborhoods</div>';
                return;
            }
            selected = selected.slice(0, 4);
            var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:16px;">';
            html += '<tr style="background:var(--light-gray);"><th style="padding:8px;text-align:left;">Metric</th>';
            selected.forEach(function(n) { html += '<th style="padding:8px;text-align:center;">' + n + '</th>'; });
            html += '</tr>';

            var metrics = [
                { label: 'Avg House Price', fn: function(n) { return formatPrice((neighborhoodBenchmarks[n] || {}).House || 0); } },
                { label: 'Avg Condo Price', fn: function(n) { return formatPrice((neighborhoodBenchmarks[n] || {})['Apt/Condo'] || 0); } },
                { label: 'YoY Change', fn: function(n) { var t = marketTrends[n]; return t ? (t.yoyChange > 0 ? '+' : '') + t.yoyChange + '%' : 'N/A'; } },
                { label: 'Median DOM', fn: function(n) { var t = marketTrends[n]; return t ? t.medianDOM + ' days' : 'N/A'; } },
                { label: 'Sale/List Ratio', fn: function(n) { var t = marketTrends[n]; return t ? (t.avgSaleToList * 100).toFixed(1) + '%' : 'N/A'; } },
                { label: 'Walk Score', fn: function(n) { return (neighborhoodEnrichment[n] || {}).walkScore || 'N/A'; } },
                { label: 'Transit Score', fn: function(n) { return (neighborhoodEnrichment[n] || {}).transitScore || 'N/A'; } },
                { label: 'Crime Index', fn: function(n) { return (neighborhoodEnrichment[n] || {}).crimeIndex || 'N/A'; } },
                { label: 'Avg Income', fn: function(n) { var e = neighborhoodEnrichment[n]; return e ? '$' + (e.avgHouseholdIncome || 0).toLocaleString() : 'N/A'; } },
                { label: 'Market Type', fn: function(n) { var t = marketTrends[n]; return t ? t.inventory : 'N/A'; } }
            ];

            metrics.forEach(function(m) {
                html += '<tr><td style="padding:8px;font-weight:600;border-bottom:1px solid #eee;">' + m.label + '</td>';
                selected.forEach(function(n) {
                    html += '<td style="padding:8px;text-align:center;border-bottom:1px solid #eee;">' + m.fn(n) + '</td>';
                });
                html += '</tr>';
            });
            html += '</table>';
            document.getElementById('nbhComparisonResult').innerHTML = html;
        }

        function openMobileSidebar() {
            document.getElementById('filterSidebar').classList.add('mobile-open');
            document.getElementById('sidebarOverlay').classList.add('active');
            document.body.style.overflow = 'hidden';
        }
        function closeMobileSidebar() {
            document.getElementById('filterSidebar').classList.remove('mobile-open');
            document.getElementById('sidebarOverlay').classList.remove('active');
            document.body.style.overflow = '';
        }
        // Close sidebar when applying filters on mobile
        const origApply = window.applyFilters;
        if (origApply) {
            window.applyFilters = function() {
                origApply.apply(this, arguments);
                if (window.innerWidth <= 768) closeMobileSidebar();
            };
        }


        // ========== OFFER BUILDER SYSTEM ==========
        let currentOfferListingIndex = null;
        let offerPdfGenerated = false;
        let lastGeneratedPdfFilename = '';

        function closeOfferModal() {
            document.getElementById('offerModal').style.display = 'none';
            document.body.style.overflow = '';
        }

        function openOfferBuilder(listingIndex) {
            closeDetailModal();
            currentOfferListingIndex = listingIndex;
            offerPdfGenerated = false;
            const listing = rawListings[listingIndex];
            const offers = calculateOffers(listing);
            const city = getCityForListing(listing);
            const loc = getLocationForListing(listing);
            const fullAddr = loc.fullAddress;

            // Default dates
            const today = new Date();
            const completionDate = new Date(today);
            completionDate.setDate(completionDate.getDate() + 30);
            const subjectDate = new Date(today);
            subjectDate.setDate(subjectDate.getDate() + 14);
            const irrevocDate = new Date(today);
            irrevocDate.setDate(irrevocDate.getDate() + 2);
            // Deposit delivery date: 2 business days after today
            const depositDate = new Date(today);
            depositDate.setDate(depositDate.getDate() + 2);
            // Skip weekends
            if (depositDate.getDay() === 0) depositDate.setDate(depositDate.getDate() + 1);
            if (depositDate.getDay() === 6) depositDate.setDate(depositDate.getDate() + 2);

            const fmtDate = (d) => d.toISOString().split('T')[0];
            const savedSig = localStorage.getItem('offerSignatureImg') || '';

            const html = `
                <h2 style="color: var(--primary); margin-bottom: 4px;">Generate Offer</h2>
                <p style="color: #666; font-size: 13px; margin-bottom: 16px;">${fullAddr}</p>

                <div class="offer-builder-section">
                    <h4>Property Summary</h4>
                    <div class="offer-property-summary">
                        <div><div class="ops-label">Asking Price</div><div class="ops-value">${formatPrice(listing.price)}</div></div>
                        <div><div class="ops-label">Type</div><div class="ops-value">${escapeHtml(listing.type)}</div></div>
                        <div><div class="ops-label">Beds / Baths</div><div class="ops-value">${listing.beds} / ${listing.baths}</div></div>
                        <div><div class="ops-label">SqFt</div><div class="ops-value">${listing.sqft > 0 ? listing.sqft.toLocaleString() : 'N/A'}</div></div>
                        <div><div class="ops-label">Days on Market</div><div class="ops-value">${listing.dom}</div></div>
                        <div><div class="ops-label">Listing Agent</div><div class="ops-value">${escapeHtml(listing.agent)}</div></div>
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Select Offer Price</h4>
                    <div style="display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
                        <div class="offer-tier-btn" onclick="selectOfferTier(this, ${offers.aggressive})">
                            <div class="tier-name">Aggressive</div>
                            <div class="tier-price">${formatPrice(offers.aggressive)}</div>
                            <div class="tier-discount">${Math.round((listing.price - offers.aggressive) / listing.price * 100)}% below asking</div>
                        </div>
                        <div class="offer-tier-btn" onclick="selectOfferTier(this, ${offers.strategic})">
                            <div class="tier-name">Strategic</div>
                            <div class="tier-price">${formatPrice(offers.strategic)}</div>
                            <div class="tier-discount">${Math.round((listing.price - offers.strategic) / listing.price * 100)}% below asking</div>
                        </div>
                        <div class="offer-tier-btn" onclick="selectOfferTier(this, ${offers.competitive})">
                            <div class="tier-name">Competitive</div>
                            <div class="tier-price">${formatPrice(offers.competitive)}</div>
                            <div class="tier-discount">${Math.round((listing.price - offers.competitive) / listing.price * 100)}% below asking</div>
                        </div>
                    </div>
                    <div class="offer-input-group">
                        <label>Custom Offer Amount ($)</label>
                        <input type="number" id="offerPrice" value="${offers.strategic}" min="1" onchange="updateDeposit()">
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Offer Terms</h4>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Deposit Amount ($)</label>
                            <input type="number" id="offerDeposit" value="${Math.round(offers.strategic * 0.05)}">
                        </div>
                        <div class="offer-input-group">
                            <label>Deposit Held By</label>
                            <input type="text" id="offerDepositTrustee" value="Buyer's lawyer/notary in trust">
                        </div>
                    </div>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Deposit Delivery Date</label>
                            <input type="date" id="offerDepositDate" value="${fmtDate(depositDate)}">
                        </div>
                        <div class="offer-input-group" style="display:flex;align-items:flex-end;">
                            <span style="font-size:11px;color:#666;padding-bottom:8px;">Within 24 hours of subject removal. As an unrepresented buyer, your deposit should be held by your own lawyer or notary.</span>
                        </div>
                    </div>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Completion Date</label>
                            <input type="date" id="offerCompletionDate" value="${fmtDate(completionDate)}">
                        </div>
                        <div class="offer-input-group">
                            <label>Possession Date</label>
                            <input type="date" id="offerPossessionDate" value="${fmtDate(completionDate)}">
                        </div>
                    </div>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Subject Removal Date</label>
                            <input type="date" id="offerSubjectDate" value="${fmtDate(subjectDate)}">
                        </div>
                        <div class="offer-input-group">
                            <label>Irrevocable Until</label>
                            <input type="date" id="offerIrrevocDate" value="${fmtDate(irrevocDate)}">
                        </div>
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Subject Conditions</h4>
                    <div class="subject-checks">
                        <label><input type="checkbox" class="subject-cb" value="Subject to satisfactory home inspection by a qualified inspector at Buyer's expense, to be completed within the subject removal period." checked> Home Inspection</label>
                        <label><input type="checkbox" class="subject-cb" value="Subject to Buyer obtaining satisfactory financing within the subject removal period." checked> Financing</label>
                        <label><input type="checkbox" class="subject-cb" value="Subject to Buyer's lawyer or notary reviewing and approving title, property disclosure statement, and the Contract of Purchase and Sale within the subject removal period." checked> Lawyer/Notary Review (Title &amp; Disclosure)</label>
                        ${listing.type === 'Apt/Condo' || listing.type === 'Townhouse' ? `
                        <label><input type="checkbox" class="subject-cb" value="Subject to Buyer reviewing and approving strata documents (Form B information certificate, meeting minutes, bylaws, financial statements, depreciation report, and current insurance certificate) within the subject removal period." checked> Strata Documents Review</label>
                        ` : ''}
                        <label><input type="checkbox" class="subject-cb" value="Subject to Buyer's review and approval of a current property appraisal."> Property Appraisal</label>
                        <label><input type="checkbox" class="subject-cb" value="Subject to satisfactory environmental assessment at Buyer's expense."> Environmental Assessment</label>
                    </div>
                    <div class="offer-input-group" style="margin-top: 10px;">
                        <label>Additional Conditions (one per line)</label>
                        <textarea id="offerCustomConditions" rows="2" placeholder="Enter any custom conditions..."></textarea>
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Your Information (Optional)</h4>
                    <p style="font-size:12px;color:#888;margin:0 0 12px 0;">Fill in your details to include them in the offer. All fields are optional.</p>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Full Name</label>
                            <input type="text" id="buyerName" placeholder="Enter your full name" value="${getBuyerField('name')}" onchange="saveBuyerInfo()">
                        </div>
                        <div class="offer-input-group">
                            <label>Email Address</label>
                            <input type="email" id="buyerEmail" placeholder="Enter your email address" value="${getBuyerField('email')}" onchange="saveBuyerInfo()">
                        </div>
                    </div>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Phone Number</label>
                            <input type="tel" id="buyerPhone" placeholder="Enter your phone number" value="${getBuyerField('phone')}" onchange="saveBuyerInfo()">
                        </div>
                        <div class="offer-input-group">
                            <label>Company Name</label>
                            <input type="text" id="buyerCompany" placeholder="Enter company name" value="${getBuyerField('company')}" onchange="saveBuyerInfo()">
                        </div>
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Listing Agent Contact</h4>
                    <div class="offer-input-row">
                        <div class="offer-input-group">
                            <label>Agent Name</label>
                            <input type="text" id="offerAgentName" value="${listing.agent.split(',')[0].trim()}">
                        </div>
                        <div class="offer-input-group">
                            <label>Agent Email</label>
                            <input type="email" id="offerAgentEmail" placeholder="agent@brokerage.com">
                        </div>
                    </div>
                </div>

                <div class="offer-builder-section">
                    <h4>Your Signature</h4>
                    <div class="sig-preview ${savedSig ? 'has-sig' : ''}" id="sigPreview">
                        ${savedSig ? '<img src="' + savedSig + '" alt="Signature">' : '<span style="color:#999;">No signature uploaded. Click below to upload.</span>'}
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <label style="padding: 8px 16px; background: #f0f0f0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; text-align: center;">
                            Upload Signature Image
                            <input type="file" accept="image/*" onchange="handleSigUpload(event)" style="display:none;">
                        </label>
                        ${savedSig ? '<button onclick="clearSignature()" style="padding: 8px 16px; background: none; border: 1px solid #dc3545; color: #dc3545; border-radius: 6px; cursor: pointer; font-size: 13px;">Clear</button>' : ''}
                    </div>
                </div>

                <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#856404;">
                    <strong>Disclaimer:</strong> This offer template is for informational purposes only. It is not legal advice. Have a BC lawyer or notary review any offer before submission.
                </div>
                <div class="offer-actions">
                    <button class="btn-generate-pdf" onclick="generateOfferPDF()">Generate PDF Offer</button>
                    <button class="btn-email-agent" id="emailAgentBtn" onclick="emailOfferToAgent()" ${offerPdfGenerated ? '' : 'disabled'} title="${offerPdfGenerated ? '' : 'Generate PDF first'}">Email to Agent</button>
                </div>
                <p id="offerStatus" style="text-align: center; margin-top: 10px; font-size: 13px; color: #666;"></p>
                ${renderNegotiationInsights(listing)}
            `;

            document.getElementById('offerModalBody').innerHTML = html;
            document.getElementById('offerModal').style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function selectOfferTier(btn, price) {
            document.querySelectorAll('.offer-tier-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            document.getElementById('offerPrice').value = price;
            updateDeposit();
        }

        function updateDeposit() {
            const price = parseFloat(document.getElementById('offerPrice').value) || 0;
            document.getElementById('offerDeposit').value = Math.round(price * 0.05);
        }

        function handleSigUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const dataUrl = e.target.result;
                localStorage.setItem('offerSignatureImg', dataUrl);
                const preview = document.getElementById('sigPreview');
                preview.innerHTML = '<img src="' + dataUrl + '" alt="Signature">';
                preview.classList.add('has-sig');
            };
            reader.readAsDataURL(file);
        }

        function clearSignature() {
            localStorage.removeItem('offerSignatureImg');
            const preview = document.getElementById('sigPreview');
            preview.innerHTML = '<span style="color:#999;">No signature uploaded. Click below to upload.</span>';
            preview.classList.remove('has-sig');
        }

        function generateOfferPDF() {
          if (!window.jspdf) {
            var statusEl = document.getElementById('offerStatus');
            if (statusEl) { statusEl.textContent = 'Loading PDF library...'; statusEl.style.color = '#888'; }
            loadJsPdf().then(function() { generateOfferPDF(); });
            return;
          }
          try {
            const listing = rawListings[currentOfferListingIndex];
            const city = getCityForListing(listing);
            const loc = getLocationForListing(listing);
            const jurConfig = getJurisdictionConfig(loc.jurisdictionCode);
            const fullAddr = loc.fullAddress;
            const offerPrice = parseFloat(document.getElementById('offerPrice').value);
            const deposit = parseFloat(document.getElementById('offerDeposit').value);
            const depositTrustee = document.getElementById('offerDepositTrustee').value;
            const completionDate = document.getElementById('offerCompletionDate').value;
            const possessionDate = document.getElementById('offerPossessionDate').value;
            const subjectDate = document.getElementById('offerSubjectDate').value;
            const irrevocDate = document.getElementById('offerIrrevocDate').value;
            const depositDeliveryDate = document.getElementById('offerDepositDate') ? document.getElementById('offerDepositDate').value : '';
            const agentName = document.getElementById('offerAgentName').value;
            const buyerNameEl = document.getElementById('buyerName');
            const buyerEmailEl = document.getElementById('buyerEmail');
            const buyerPhoneEl = document.getElementById('buyerPhone');
            const buyerCompanyEl = document.getElementById('buyerCompany');
            const buyerName = buyerNameEl ? buyerNameEl.value.trim() : '';
            const buyerEmail = buyerEmailEl ? buyerEmailEl.value.trim() : '';
            const buyerPhone = buyerPhoneEl ? buyerPhoneEl.value.trim() : '';
            const buyerCompany = buyerCompanyEl ? buyerCompanyEl.value.trim() : '';
            const buyerDisplay = buyerCompany
                ? buyerCompany + (buyerName ? ' (c/o ' + buyerName + ')' : '')
                : (buyerName || 'Purchaser');
            const sigImg = localStorage.getItem('offerSignatureImg');

            const subjects = [];
            document.querySelectorAll('.subject-cb:checked').forEach(cb => subjects.push(cb.value));
            const custom = document.getElementById('offerCustomConditions').value.trim();
            if (custom) {
                custom.split('\n').filter(l => l.trim()).forEach(l => subjects.push(l.trim()));
            }

            if (!offerPrice || offerPrice <= 0) {
                document.getElementById('offerStatus').textContent = 'Please enter a valid offer price.';
                document.getElementById('offerStatus').style.color = '#dc3545';
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'mm', format: 'letter' });
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 22;
            const contentW = pageW - margin * 2;
            let y = margin;

            const curSymbol = jurConfig.currency === 'USD' ? 'US$' : '$';
            const fmtCur = (n) => curSymbol + Number(n).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
            const fmtDt = (d) => {
                if (!d) return 'TBD';
                const dt = new Date(d + 'T00:00:00');
                return dt.toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'});
            };

            function addText(text, x, yPos, opts = {}) {
                const fontSize = opts.fontSize || 10;
                const maxWidth = opts.maxWidth || contentW;
                doc.setFontSize(fontSize);
                if (opts.bold) doc.setFont('helvetica', 'bold');
                else if (opts.italic) doc.setFont('helvetica', 'italic');
                else doc.setFont('helvetica', 'normal');
                if (opts.color) doc.setTextColor(...opts.color);
                else doc.setTextColor(0, 0, 0);
                const lines = doc.splitTextToSize(text, maxWidth);
                const lineH = fontSize * 0.45;
                for (let i = 0; i < lines.length; i++) {
                    if (yPos + lineH > pageH - 18) {
                        doc.addPage();
                        yPos = margin;
                    }
                    doc.text(lines[i], x, yPos);
                    yPos += lineH;
                }
                return yPos;
            }

            function addSectionHeading(title, yPos) {
                if (yPos > pageH - 40) { doc.addPage(); yPos = margin; }
                doc.setFillColor(27, 58, 92);
                doc.rect(margin, yPos - 1, contentW, 7, 'F');
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(title, margin + 3, yPos + 4);
                doc.setTextColor(0, 0, 0);
                return yPos + 10;
            }

            // ===== HEADER BAR =====
            doc.setFillColor(27, 58, 92);
            doc.rect(0, 0, pageW, 24, 'F');
            doc.setFontSize(15);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('OFFER TO PURCHASE REAL PROPERTY', margin, 11);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(jurConfig.governingLaw, margin, 17);
            var headerContactParts = [buyerName, buyerEmail, buyerPhone].filter(function(v) { return v; });
            if (headerContactParts.length > 0) doc.text(headerContactParts.join('  |  '), pageW - margin, 14, {align: 'right'});
            y = 32;

            // ===== LEGAL DISCLAIMER =====
            doc.setFillColor(255, 245, 235);
            doc.setDrawColor(220, 120, 50);
            doc.rect(margin, y - 2, contentW, 14, 'FD');
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(180, 80, 20);
            doc.text('IMPORTANT DISCLAIMER', margin + 3, y + 3);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(120, 60, 10);
            var disclaimerText = jurConfig.legalDisclaimer;
            var disclaimerLines = doc.splitTextToSize(disclaimerText, contentW - 6);
            doc.text(disclaimerLines, margin + 3, y + 7);
            y += 16;

            // ===== DATE & RECIPIENT =====
            const today = new Date();
            const dateStr = today.toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'});
            y = addText(dateStr, margin, y, {fontSize: 10});
            y += 3;
            y = addText(agentName, margin, y, {fontSize: 10, bold: true});
            y = addText('Listing Agent / Designated Agent for the Seller', margin, y, {fontSize: 9, color: [80,80,80]});
            y += 5;
            y = addText('RE: Offer to Purchase - ' + fullAddr, margin, y, {fontSize: 11, bold: true, color: [27, 58, 92]});
            y += 3;

            // ===== PREAMBLE =====
            y = addText('Dear ' + agentName.split(' ')[0] + ',', margin, y, {fontSize: 10});
            y += 3;
            const intro = 'I, ' + buyerDisplay + ' (the "Buyer"), hereby submit this written offer to purchase the below-described property. This offer is made in good faith, and I am financially prepared to close on terms acceptable to both parties. Please find the details of my offer below.';
            y = addText(intro, margin, y, {fontSize: 9.5});
            y += 5;

            // ===== SECTION 1: PROPERTY & PARTIES =====
            y = addSectionHeading('1. PROPERTY AND PARTIES', y);

            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Term', 'Details']],
                headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
                body: [
                    ['Buyer (Purchaser)', buyerDisplay],
                    ...((buyerEmail || buyerPhone) ? [['Buyer Contact', [buyerEmail, buyerPhone].filter(function(v) { return v; }).join('  |  ')]] : []),
                    ['Property Address', fullAddr],
                    ['Property Type', listing.type + (listing.beds > 0 ? ' - ' + listing.beds + ' bed / ' + listing.baths + ' bath' + (listing.sqft > 0 ? ' / ' + listing.sqft.toLocaleString() + ' sqft' : '') : '')],
                    ['Legal Description', 'To be confirmed via title search prior to subject removal'],
                    ['PID', 'To be confirmed via title search prior to subject removal'],
                ],
                styles: { fontSize: 9, cellPadding: 2.5 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 }, 1: { cellWidth: contentW - 48 } },
                alternateRowStyles: { fillColor: [245, 247, 250] },
            });
            y = doc.lastAutoTable.finalY + 6;

            // ===== SECTION 2: FINANCIAL TERMS (no asking price or variance) =====
            y = addSectionHeading('2. FINANCIAL TERMS', y);

            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Term', 'Details']],
                headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
                body: [
                    ['Offer Price', fmtCur(offerPrice)],
                    ['Deposit Amount', fmtCur(deposit)],
                    ['Deposit Delivery', (depositDeliveryDate ? 'On or before ' + fmtDt(depositDeliveryDate) : 'Within 24 hours of subject removal') + ', held in trust by ' + depositTrustee],
                    ['Balance of Purchase Price', fmtCur(offerPrice - deposit) + ' due on Completion Date'],
                    [jurConfig.transferTaxName, 'Buyer acknowledges responsibility for ' + jurConfig.transferTaxName + ' payable on completion'],
                    ['GST', 'If applicable, included in or in addition to the Purchase Price as required by law'],
                ],
                styles: { fontSize: 9, cellPadding: 2.5 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 }, 1: { cellWidth: contentW - 48 } },
                alternateRowStyles: { fillColor: [245, 247, 250] },
            });
            y = doc.lastAutoTable.finalY + 6;

            // ===== SECTION 3: KEY DATES =====
            y = addSectionHeading('3. KEY DATES', y);

            doc.autoTable({
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Date', 'Details']],
                headStyles: { fillColor: [55, 90, 127], fontSize: 9, fontStyle: 'bold', textColor: [255,255,255] },
                body: [
                    ['Subject Removal Date', fmtDt(subjectDate) + ' at 11:59 PM Pacific Time'],
                    ['Completion Date', fmtDt(completionDate) + ' (title transfer at Land Title Office)'],
                    ['Possession Date', fmtDt(possessionDate) + ' (vacant possession unless otherwise agreed)'],
                    ['Adjustment Date', fmtDt(possessionDate) + ' (property taxes, utilities, strata fees adjusted as of this date)'],
                    ['Offer Irrevocable Until', fmtDt(irrevocDate) + ' at 11:59 PM Pacific Time'],
                ],
                styles: { fontSize: 9, cellPadding: 2.5 },
                columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 }, 1: { cellWidth: contentW - 48 } },
                alternateRowStyles: { fillColor: [245, 247, 250] },
            });
            y = doc.lastAutoTable.finalY + 6;

            // ===== SECTION 4: SUBJECT CONDITIONS =====
            if (subjects.length > 0) {
                y = addSectionHeading('4. SUBJECT CONDITIONS', y);
                y = addText('This offer is subject to the following conditions, to be fulfilled or waived by the Buyer at the Buyer\'s sole discretion on or before the Subject Removal Date. If any condition is not fulfilled or waived, this offer shall be null and void and the deposit returned in full to the Buyer without deduction.', margin, y, {fontSize: 9, color: [80,80,80]});
                y += 4;
                subjects.forEach((s, i) => {
                    if (y > pageH - 20) { doc.addPage(); y = margin; }
                    y = addText((i + 1) + '. ' + s, margin + 2, y, {fontSize: 9, maxWidth: contentW - 4});
                    y += 3;
                });
                y += 3;
            }

            // ===== SECTION 5: GENERAL TERMS (buyer-favourable) =====
            const secNum5 = subjects.length > 0 ? 5 : 4;
            y = addSectionHeading(secNum5 + '. GENERAL TERMS AND CONDITIONS', y);

            const generalTerms = [
                ['TIME IS OF THE ESSENCE:', 'Time shall be of the essence of this contract and of every provision hereof.'],
                ['ADJUSTMENTS:', 'All adjustments to be made as of the Adjustment Date, including but not limited to: property taxes, utility charges, strata/maintenance/HOA fees, rental income (if applicable), fuel, and other items typically adjusted in a real estate transaction in ' + jurConfig.governingLaw + '. Any prepaid amounts by the Seller beyond the Adjustment Date shall be credited to the Seller; any amounts owing shall be the responsibility of the Seller up to and including the Adjustment Date.'],
                ['RISK AND INSURANCE:', 'The property shall be and remain at the risk of the Seller until the Completion Date. If the property is materially damaged before completion, the Buyer may at the Buyer\'s option either complete the purchase and receive all insurance proceeds or terminate this agreement and receive a full refund of the deposit. The Seller shall maintain all existing insurance policies in full force and effect until completion.'],
                ['TITLE:', 'Good and marketable title shall be conveyed to the Buyer free and clear of all liens, charges, encumbrances, and defects, except: (a) conditions, provisos, restrictions, and reservations in the original grant from the Crown or government; (b) subsisting conditions and reservations under applicable land title legislation; and (c) any registered easements or covenants disclosed to and accepted by the Buyer prior to subject removal.'],
                ['PROPERTY CONDITION:', 'The property is sold on an "as-is, where-is" basis as of the date of acceptance, subject to the Seller\'s obligations under the Property Disclosure Statement. The Seller represents that the Seller has not received notice of any building code violations, zoning non-compliance, or bylaw infractions affecting the property. The property shall be delivered in substantially the same condition as on the date of acceptance, reasonable wear and tear excepted.'],
                ['PROPERTY DISCLOSURE:', 'The Seller shall provide to the Buyer a completed Property Disclosure Statement (or equivalent disclosure form as required by the ' + jurConfig.governingLaw + ') within 3 business days of acceptance. Any material misrepresentation or omission in the Property Disclosure Statement shall entitle the Buyer to terminate this agreement and receive a full refund of the deposit.'],
                ['INCLUDED ITEMS:', 'All fixtures, improvements, and appurtenances attached to the property are included in the purchase price unless specifically excluded in writing. This includes but is not limited to: built-in appliances, light fixtures, window coverings, attached floor coverings, garage door openers with remotes, and all landscaping.'],
                ['BUYER ACCESS:', 'The Seller shall provide the Buyer and the Buyer\'s agents (inspectors, appraisers, contractors) reasonable access to the property for inspections and assessments during the subject removal period, and for one final walk-through within 48 hours prior to the Completion Date.'],
                ['VACANT POSSESSION:', 'The Seller shall deliver vacant possession of the property on the Possession Date, with all personal belongings and debris removed and the property in a clean, broom-swept condition.'],
                ['REPRESENTATIONS AND WARRANTIES:', 'The Seller represents and warrants that: (a) the Seller has the legal authority and capacity to sell the property; (b) the property is not subject to any undisclosed litigation, claims, or disputes; (c) all information provided to the Buyer is true and accurate to the best of the Seller\'s knowledge. These representations and warranties shall survive and not merge on completion.'],
                ['REMEDIES:', 'If the Seller fails to complete this transaction after all conditions have been fulfilled or waived, the Buyer shall be entitled to pursue all remedies available at law or in equity. If the Buyer fails to complete after all conditions have been fulfilled or waived, the Seller\'s remedies shall include forfeiture of the deposit as liquidated damages, without prejudice to any other remedies available at law.'],
                ['GOVERNING LAW:', 'This agreement shall be governed by and construed in accordance with the laws of the ' + jurConfig.governingLaw + (jurConfig.country === 'CA' ? ' and the federal laws of Canada applicable therein' : '') + '. Any disputes shall be resolved in the courts of ' + jurConfig.governingLaw + '.'],
                ['ENTIRE AGREEMENT:', 'This offer, when accepted, shall constitute the entire agreement between the Buyer and Seller. There are no representations, warranties, guarantees, promises, or agreements other than those set out herein. Any amendment shall be made in writing and signed by all parties.'],
                ['TENDER:', 'Any tender of documents or money may be made on or upon the parties or their respective lawyers.'],
                ['ASSIGNMENT:', 'The Buyer may assign this agreement or direct title to a nominee prior to or on the Completion Date, provided the Seller\'s written consent is obtained, which consent shall not be unreasonably withheld.'],
                ['SEVERABILITY:', 'If any provision of this agreement is found to be invalid or unenforceable, the remaining provisions shall continue in full force and effect.'],
            ];

            generalTerms.forEach((pair) => {
                if (y > pageH - 20) { doc.addPage(); y = margin; }
                y = addText(pair[0], margin + 2, y, {fontSize: 8.5, bold: true, maxWidth: contentW - 4});
                y = addText(pair[1], margin + 2, y, {fontSize: 8.5, maxWidth: contentW - 4});
                y += 2.5;
            });
            y += 3;

            // ===== SECTION 6: OFFER RATIONALE =====
            const secNum6 = secNum5 + 1;
            y = addSectionHeading(secNum6 + '. OFFER RATIONALE', y);
            const domText = listing.dom > 60
                ? 'This property has been listed for ' + listing.dom + ' days, which is significantly above the South Surrey market average. The extended listing period suggests the current pricing may not be aligned with current buyer demand in the area.'
                : 'This property has been listed for ' + listing.dom + ' days.';
            y = addText(domText, margin, y, {fontSize: 9.5});
            y += 2;
            if (listing.sqft > 0) {
                const ppsf = Math.round(offerPrice / listing.sqft);
                y = addText('At the proposed offer price, the effective price per square foot is $' + ppsf.toLocaleString() + '/sqft for ' + listing.sqft.toLocaleString() + ' sqft, which reflects current comparable market values in the ' + listing.neighborhood + ' area.', margin, y, {fontSize: 9.5});
                y += 2;
            }
            y = addText('This offer is submitted in good faith with the intention of completing the transaction on the proposed timeline. The Buyer is open to reasonable negotiation to reach a mutually acceptable agreement.', margin, y, {fontSize: 9.5});
            y += 4;

            // ===== SECTION 7: FINANCING =====
            const secNum7 = secNum6 + 1;
            y = addSectionHeading(secNum7 + '. FINANCING AND ABILITY TO CLOSE', y);
            y = addText('The Buyer confirms financial capacity to complete this purchase and is prepared to provide proof of funds or a mortgage pre-approval letter upon request. The deposit of ' + fmtCur(deposit) + ' shall be held in trust by ' + depositTrustee + ' and delivered' + (depositDeliveryDate ? ' on or before ' + fmtDt(depositDeliveryDate) + '.' : ' within 24 hours of subject removal.'), margin, y, {fontSize: 9.5});
            y += 4;

            // ===== SECTION 8: BUYER ACKNOWLEDGMENTS =====
            const secNum8 = secNum7 + 1;
            y = addSectionHeading(secNum8 + '. BUYER ACKNOWLEDGMENTS', y);
            const acks = [
                'I acknowledge that I am an UNREPRESENTED BUYER in this transaction and that the listing agent (or designated agent) represents the Seller only.',
                'I acknowledge that the listing agent has advised me to seek independent legal advice and/or independent real estate representation.',
                'I understand that no buyer agent commission is payable in this transaction.',
                'I acknowledge that I am responsible for all applicable Property Transfer Tax, GST (if applicable), legal fees, and other closing costs.',
                'I have read and understand the BCFSA Disclosure of Risks to Unrepresented Parties.',
            ];
            acks.forEach((ack, i) => {
                if (y > pageH - 20) { doc.addPage(); y = margin; }
                y = addText(String.fromCharCode(97 + i) + ') ' + ack, margin + 2, y, {fontSize: 9, maxWidth: contentW - 4});
                y += 2.5;
            });
            y += 4;

            // ===== BUYER EXECUTION =====
            if (y > pageH - 55) { doc.addPage(); y = margin; }
            y = addSectionHeading('BUYER EXECUTION', y);
            y = addText('By signing below, the Buyer offers to purchase the property on the terms set out above, subject to acceptance by the Seller.', margin, y, {fontSize: 9, color: [80,80,80]});
            y += 6;

            if (sigImg) {
                try {
                    doc.addImage(sigImg, 'PNG', margin, y, 50, 20);
                    y += 24;
                } catch(e) {
                    y += 6;
                }
            } else {
                y += 8;
            }

            doc.setDrawColor(0);
            doc.line(margin, y, margin + 70, y);
            y += 4;
            y = addText(buyerDisplay + ' (Buyer)', margin, y, {fontSize: 10, bold: true});
            y = addText('Date: ' + dateStr, margin, y, {fontSize: 9});
            if (buyerEmail) y = addText('Email: ' + buyerEmail, margin, y, {fontSize: 9, color: [100, 100, 100]});
            if (buyerPhone) y = addText('Phone: ' + buyerPhone, margin, y, {fontSize: 9, color: [100, 100, 100]});

            // ===== SELLER RESPONSE FORM (new page) =====
            doc.addPage();
            y = margin;

            y = addSectionHeading('SELLER RESPONSE', y);
            y = addText('The Seller is requested to complete one of the following sections and return this form to the Buyer.', margin, y, {fontSize: 9, color: [80,80,80]});
            y += 6;

            // Option A: Accept
            doc.setFillColor(230, 245, 230);
            doc.rect(margin, y - 2, contentW, 14, 'F');
            doc.setDrawColor(40, 167, 69);
            doc.rect(margin, y - 2, contentW, 14, 'S');
            doc.rect(margin + 3, y + 2, 4, 4);
            y = addText('  OPTION A: ACCEPT OFFER AS WRITTEN', margin + 10, y + 5, {fontSize: 10, bold: true, color: [40, 167, 69]});
            y += 6;
            y = addText('I/We, the undersigned Seller(s), hereby accept the above offer to purchase on all terms and conditions as stated.', margin + 4, y, {fontSize: 9});
            y += 4;
            doc.setDrawColor(0);
            doc.line(margin + 4, y, margin + 80, y);
            y += 4;
            y = addText('Seller Name (Print)', margin + 4, y, {fontSize: 8, color: [120,120,120]});
            y += 3;
            doc.line(margin + 4, y, margin + 80, y);
            y += 4;
            y = addText('Seller Signature', margin + 4, y, {fontSize: 8, color: [120,120,120]});
            doc.line(margin + 100, y - 4, margin + contentW - 4, y - 4);
            y = addText('Date', margin + 100, y, {fontSize: 8, color: [120,120,120]});
            y += 8;

            // Option B: Counter-Offer
            doc.setFillColor(255, 248, 230);
            doc.rect(margin, y - 2, contentW, 14, 'F');
            doc.setDrawColor(253, 126, 20);
            doc.rect(margin, y - 2, contentW, 14, 'S');
            doc.rect(margin + 3, y + 2, 4, 4);
            y = addText('  OPTION B: COUNTER-OFFER', margin + 10, y + 5, {fontSize: 10, bold: true, color: [200, 100, 0]});
            y += 6;
            y = addText('I/We, the undersigned Seller(s), reject the above offer but propose the following counter-offer:', margin + 4, y, {fontSize: 9});
            y += 5;

            // Counter-offer form fields
            const counterFields = [
                'Counter-Offer Price: $',
                'Deposit Amount: $',
                'Completion Date:',
                'Possession Date:',
                'Subject Removal Date:',
                'Counter-Offer Irrevocable Until:',
            ];
            counterFields.forEach((field) => {
                if (y > pageH - 18) { doc.addPage(); y = margin; }
                y = addText(field, margin + 6, y, {fontSize: 9, bold: true});
                doc.line(margin + 60, y - 3.2, margin + contentW - 6, y - 3.2);
                y += 4;
            });
            y += 2;

            y = addText('Additional / Changed Terms:', margin + 6, y, {fontSize: 9, bold: true});
            y += 2;
            for (let ln = 0; ln < 5; ln++) {
                if (y > pageH - 18) { doc.addPage(); y = margin; }
                doc.line(margin + 6, y, margin + contentW - 6, y);
                y += 6;
            }
            y += 2;

            y = addText('All other terms and conditions of the original offer remain unchanged unless specifically amended above.', margin + 4, y, {fontSize: 8.5, italic: true, color: [80,80,80]});
            y += 6;

            doc.setDrawColor(0);
            doc.line(margin + 4, y, margin + 80, y);
            y += 4;
            y = addText('Seller Name (Print)', margin + 4, y, {fontSize: 8, color: [120,120,120]});
            y += 3;
            doc.line(margin + 4, y, margin + 80, y);
            y += 4;
            y = addText('Seller Signature', margin + 4, y, {fontSize: 8, color: [120,120,120]});
            doc.line(margin + 100, y - 4, margin + contentW - 4, y - 4);
            y = addText('Date', margin + 100, y, {fontSize: 8, color: [120,120,120]});
            y += 8;

            // Option C: Reject
            doc.setFillColor(255, 235, 235);
            doc.rect(margin, y - 2, contentW, 14, 'F');
            doc.setDrawColor(220, 53, 69);
            doc.rect(margin, y - 2, contentW, 14, 'S');
            doc.rect(margin + 3, y + 2, 4, 4);
            y = addText('  OPTION C: REJECT OFFER', margin + 10, y + 5, {fontSize: 10, bold: true, color: [220, 53, 69]});
            y += 6;
            y = addText('I/We, the undersigned Seller(s), hereby reject the above offer in its entirety.', margin + 4, y, {fontSize: 9});
            y += 4;
            doc.setDrawColor(0);
            doc.line(margin + 4, y, margin + 80, y);
            y += 4;
            y = addText('Seller Signature', margin + 4, y, {fontSize: 8, color: [120,120,120]});
            doc.line(margin + 100, y - 4, margin + contentW - 4, y - 4);
            y = addText('Date', margin + 100, y, {fontSize: 8, color: [120,120,120]});

            // ===== FOOTER on each page =====
            const totalPages = doc.internal.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(150, 150, 150);
                doc.text('OFFER TO PURCHASE - ' + fullAddr + '  |  Page ' + p + ' of ' + totalPages + '  |  This document is not a substitute for legal advice.', pageW / 2, pageH - 8, {align: 'center'});
            }

            // Save with blob download for Safari compatibility
            const safeAddr = listing.addr.replace(/[^a-zA-Z0-9]/g, '_');
            lastGeneratedPdfFilename = 'Offer_' + safeAddr + '.pdf';
            const pdfBlob = doc.output('blob');
            const blobUrl = URL.createObjectURL(pdfBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = blobUrl;
            downloadLink.download = lastGeneratedPdfFilename;
            downloadLink.style.display = 'none';
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            setTimeout(function() { URL.revokeObjectURL(blobUrl); }, 5000);

            offerPdfGenerated = true;
            var emailBtn = document.getElementById('emailAgentBtn');
            if (emailBtn) {
                emailBtn.disabled = false;
                emailBtn.title = '';
            }
            var status = document.getElementById('offerStatus');
            status.textContent = 'PDF generated and downloaded! You can now email it to the agent.';
            status.style.color = 'var(--success)';

            // Silent tracking of offer generation
            trackOfferGeneration({
                buyerName: buyerName,
                buyerEmail: buyerEmail,
                buyerPhone: buyerPhone,
                buyerCompany: buyerCompany,
                propertyAddress: fullAddr,
                askingPrice: listing.price,
                offerPrice: offerPrice,
                propertyType: listing.type
            });

            // Track in local offer history
            if (typeof saveOfferToHistory === 'function') {
                saveOfferToHistory({
                    address: listing.addr,
                    neighborhood: listing.neighborhood,
                    askingPrice: listing.price,
                    offerPrice: offerPrice,
                    propertyType: listing.type,
                    buyerName: buyerName
                });
            }
          } catch(err) {
            console.error('PDF generation error:', err);
            var status = document.getElementById('offerStatus');
            status.textContent = 'Error generating PDF: ' + err.message;
            status.style.color = '#dc3545';
          }
        }

        function emailOfferToAgent() {
            const listing = rawListings[currentOfferListingIndex];
            const city = getCityForListing(listing);
            const loc = getLocationForListing(listing);
            const fullAddr = loc.fullAddress;
            const agentEmail = document.getElementById('offerAgentEmail').value.trim();
            const agentName = document.getElementById('offerAgentName').value.trim();
            const offerPrice = parseFloat(document.getElementById('offerPrice').value);
            const deposit = parseFloat(document.getElementById('offerDeposit').value) || 0;
            const completionDate = document.getElementById('offerCompletionDate').value;
            const buyerNameEl2 = document.getElementById('buyerName');
            const buyerEmailEl2 = document.getElementById('buyerEmail');
            const buyerPhoneEl2 = document.getElementById('buyerPhone');
            const buyerName = buyerNameEl2 ? buyerNameEl2.value.trim() : '';
            const buyerEmail = buyerEmailEl2 ? buyerEmailEl2.value.trim() : '';
            const buyerPhone = buyerPhoneEl2 ? buyerPhoneEl2.value.trim() : '';
            const fmtCur = (n) => '$' + Number(n).toLocaleString('en-US');
            const fmtDt = (d) => { if (!d) return 'TBD'; const dt = new Date(d + 'T00:00:00'); return dt.toLocaleDateString('en-US', {year:'numeric', month:'long', day:'numeric'}); };

            if (!agentEmail) {
                const status = document.getElementById('offerStatus');
                status.textContent = "Please enter the listing agent's email address above.";
                status.style.color = '#dc3545';
                return;
            }

            // Build professional email body
            const sigName = buyerName || 'Interested Buyer';
            const bodyText =
                'Dear ' + (agentName || 'Listing Agent') + ',\n\n' +
                'I am writing to submit a formal offer to purchase the property listed at:\n' +
                fullAddr + '\n\n' +
                'OFFER SUMMARY\n' +
                '—————————————————\n' +
                'Offer Price: ' + fmtCur(offerPrice) + '\n' +
                'Deposit: ' + fmtCur(deposit) + '\n' +
                'Proposed Completion: ' + fmtDt(completionDate) + '\n' +
                '—————————————————\n\n' +
                'Please find the full signed offer letter attached as a PDF (' + (lastGeneratedPdfFilename || 'Offer_Letter.pdf') + ').\n\n' +
                'I am an unrepresented buyer and have been advised to seek independent legal counsel. I am a motivated and financially prepared purchaser and would appreciate your earliest review and response.\n\n' +
                'I am happy to discuss any questions regarding the terms of this offer. Please feel free to reach me at the contact details below.\n\n' +
                'Best regards,\n' +
                sigName + '\n' +
                (buyerEmail ? 'Email: ' + buyerEmail + '\n' : '') +
                (buyerPhone ? 'Phone: ' + buyerPhone + '\n' : '');

            // Show preview modal
            var previewHtml = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;" id="emailPreviewModal" onclick="if(event.target===this)this.remove()">';
            previewHtml += '<div style="background:white;border-radius:8px;max-width:640px;width:90%;max-height:85vh;overflow:auto;padding:24px;">';
            previewHtml += '<h3 style="color:var(--primary);margin:0 0 16px 0;">Email Preview</h3>';
            previewHtml += '<div style="margin-bottom:12px;"><strong>To:</strong> ' + agentEmail + '</div>';
            previewHtml += '<div style="margin-bottom:12px;"><strong>Subject:</strong> Offer to Purchase \u2014 ' + fullAddr + '</div>';
            previewHtml += '<hr style="border:none;border-top:1px solid #eee;margin:12px 0;">';
            previewHtml += '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.6;background:#f8f9fa;padding:16px;border-radius:4px;max-height:400px;overflow:auto;">' + bodyText.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
            previewHtml += '<div style="margin-top:12px;padding:10px;background:#fff3cd;border-radius:4px;font-size:12px;color:#856404;">Remember to attach the PDF file: <strong>' + (lastGeneratedPdfFilename || 'Offer_Letter.pdf') + '</strong></div>';
            previewHtml += '<div style="display:flex;gap:12px;margin-top:20px;">';
            previewHtml += '<button onclick="document.getElementById(\'emailPreviewModal\').remove(); sendEmailNow();" style="flex:1;padding:12px;background:var(--secondary);color:white;border:none;border-radius:4px;font-size:14px;font-weight:600;cursor:pointer;">Open Email Client</button>';
            previewHtml += '<button onclick="document.getElementById(\'emailPreviewModal\').remove();" style="flex:1;padding:12px;background:#6c757d;color:white;border:none;border-radius:4px;font-size:14px;cursor:pointer;">Cancel</button>';
            previewHtml += '</div></div></div>';
            document.body.insertAdjacentHTML('beforeend', previewHtml);

            // Store data for actual send
            window._pendingEmail = {
                to: agentEmail,
                subject: encodeURIComponent('Offer to Purchase \u2014 ' + fullAddr),
                body: encodeURIComponent(bodyText)
            };
        }

        function showPostSubmissionChecklist() {
            var checklistHtml = '<div style="margin-top:20px;padding:20px;background:linear-gradient(135deg, #e8f5e9 0%, #f1f8e9 100%);border-radius:8px;border-left:4px solid var(--secondary);">';
            checklistHtml += '<h4 style="color:var(--primary);margin:0 0 12px 0;">What Happens Next</h4>';
            checklistHtml += '<div style="font-size:13px;line-height:2;">';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Attach the PDF to your email and send it</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Wait for agent response (typically 1\u20133 business days)</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> If accepted: retain a BC lawyer/notary immediately</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Arrange home inspection within subject period</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Confirm mortgage financing / proof of funds</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Deliver deposit to trustee by the deposit delivery date</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Remove subjects by the subject removal date</label>';
            checklistHtml += '<label style="display:block;cursor:pointer;"><input type="checkbox" style="margin-right:8px;"> Complete final walk-through before possession</label>';
            checklistHtml += '</div></div>';

            var summaryDiv = document.getElementById('offerSummary');
            if (summaryDiv) {
                var existing = document.getElementById('postSubmissionChecklist');
                if (existing) existing.remove();
                var div = document.createElement('div');
                div.id = 'postSubmissionChecklist';
                div.innerHTML = checklistHtml;
                summaryDiv.appendChild(div);
            }
        }

        function sendEmailNow() {
            if (!window._pendingEmail) return;
            var e = window._pendingEmail;
            window.open('mailto:' + e.to + '?subject=' + e.subject + '&body=' + e.body, '_self');

            var status = document.getElementById('offerStatus');
            status.textContent = 'Email client opened! Attach the downloaded PDF (' + lastGeneratedPdfFilename + ') and send.';
            status.style.color = 'var(--secondary)';

            // Show "What Happens Next" checklist
            showPostSubmissionChecklist();
            window._pendingEmail = null;
        }



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

        // ===== HOME BUYER RESCISSION PERIOD CALCULATOR =====
        function calcRescission() {
            var dateStr = document.getElementById('rescissionDate').value;
            var price = parseFloat(document.getElementById('rescissionPrice').value) || 0;

            // Determine jurisdiction from selected property or default
            var jurisdiction = 'CA-BC';
            var rescissionJurEl = document.getElementById('rescissionJurisdiction');
            if (rescissionJurEl) jurisdiction = rescissionJurEl.value || 'CA-BC';
            var jurConfig = getJurisdictionConfig(jurisdiction);

            if (!jurConfig.hasRescission) {
                document.getElementById('rescissionResult').innerHTML = '<div style="background:#f8f9fa;padding:16px;border-radius:8px;text-align:center;"><div style="font-size:16px;font-weight:600;color:#666;margin-bottom:8px;">No Statutory Rescission Period</div><p style="color:#888;font-size:13px;">' + jurConfig.rescissionNotes + '</p></div>';
                return;
            }

            if (jurisdiction === 'CA-ON') {
                document.getElementById('rescissionResult').innerHTML = '<div style="background:#fff3cd;padding:16px;border-radius:8px;"><div style="font-size:14px;font-weight:600;color:#856404;margin-bottom:8px;">Ontario: Limited Rescission</div><p style="font-size:13px;color:#856404;">' + jurConfig.rescissionNotes + '</p><p style="font-size:12px;color:#856404;">For pre-construction condos: 10-day cooling-off period from date of signing Agreement of Purchase and Sale. No fee charged. Does not apply to resale properties.</p></div>';
                return;
            }

            if (!dateStr) {
                document.getElementById('rescissionResult').innerHTML = '<p style="color:#888;">Enter the acceptance date to see your rescission deadline and fee.</p>';
                return;
            }
            // HBRP holidays per BC Interpretation Act s.29 — NOT the same as Employment Standards holidays.
            // Includes Easter Monday and Boxing Day (Dec 26).
            // Does NOT include National Indigenous Peoples Day (Jun 21) or any non-Interpretation Act holidays.
            // Thanksgiving kept as it arguably falls under s.29(d) (day set by Parliament for thanksgiving).
            // Source: BCREA HBRP Calculator, BCFSA HBRP Guideline, Interpretation Act [RSBC 1996] c.238 s.29
            var bcHolidays = [
                // 2025
                '2025-01-01',  // New Year's Day
                '2025-02-17',  // Family Day (3rd Monday Feb)
                '2025-04-18',  // Good Friday
                '2025-04-21',  // Easter Monday
                '2025-05-19',  // Victoria Day
                '2025-07-01',  // Canada Day
                '2025-08-04',  // BC Day (1st Monday Aug)
                '2025-09-01',  // Labour Day (1st Monday Sep)
                '2025-09-30',  // National Day for Truth and Reconciliation
                '2025-10-13',  // Thanksgiving (2nd Monday Oct) — s.29(d) federal proclamation
                '2025-11-11',  // Remembrance Day
                '2025-12-25',  // Christmas Day
                '2025-12-26',  // Boxing Day
                // 2026
                '2026-01-01',  // New Year's Day
                '2026-02-16',  // Family Day
                '2026-04-03',  // Good Friday
                '2026-04-06',  // Easter Monday
                '2026-05-18',  // Victoria Day
                '2026-07-01',  // Canada Day
                '2026-08-03',  // BC Day
                '2026-09-07',  // Labour Day
                '2026-09-30',  // Truth and Reconciliation
                '2026-10-12',  // Thanksgiving
                '2026-11-11',  // Remembrance Day
                '2026-12-25',  // Christmas Day
                '2026-12-26',  // Boxing Day
                // 2027
                '2027-01-01',  // New Year's Day
                '2027-02-15',  // Family Day
                '2027-03-26',  // Good Friday
                '2027-03-29',  // Easter Monday
                '2027-05-24',  // Victoria Day
                '2027-07-01',  // Canada Day
                '2027-08-02',  // BC Day
                '2027-09-06',  // Labour Day
                '2027-09-30',  // Truth and Reconciliation
                '2027-10-11',  // Thanksgiving
                '2027-11-11',  // Remembrance Day
                '2027-12-25',  // Christmas Day
                '2027-12-26'   // Boxing Day
            ];
            function isBusinessDay(d) {
                var day = d.getDay();
                if (day === 0 || day === 6) return false; // weekend
                var ds = d.toISOString().split('T')[0];
                return bcHolidays.indexOf(ds) < 0;
            }
            function addBusinessDays(start, days) {
                var current = new Date(start);
                var added = 0;
                while (added < days) {
                    current.setDate(current.getDate() + 1);
                    if (isBusinessDay(current)) added++;
                }
                return current;
            }
            var acceptDate = new Date(dateStr + 'T12:00:00');
            var rescDays = jurConfig.rescissionDays || 3;
            var deadline = addBusinessDays(acceptDate, rescDays);
            var rescissionFee = jurConfig.rescissionFeePct > 0 ? Math.round(price * jurConfig.rescissionFeePct / 100) : 0;
            var dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
            var monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

            var fmtDate = function(d) {
                return dayNames[d.getDay()] + ', ' + monthNames[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
            };

            // Check if any holidays fell in the period
            var holidaysInPeriod = [];
            var check = new Date(acceptDate);
            for (var i = 0; i < 10; i++) {
                check.setDate(check.getDate() + 1);
                if (check > deadline) break;
                var cs = check.toISOString().split('T')[0];
                if (bcHolidays.indexOf(cs) >= 0) holidaysInPeriod.push(fmtDate(new Date(check)));
            }

            var html = '<div style="background:var(--primary);color:white;padding:14px;border-radius:8px;text-align:center;margin-bottom:12px;">';
            html += '<div style="font-size:11px;opacity:0.8;">Rescission Deadline (end of day)</div>';
            html += '<div style="font-size:20px;font-weight:700;">' + fmtDate(deadline) + '</div>';
            html += '</div>';
            html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
            html += '<tr><td style="padding:4px 0;">Acceptance Date:</td><td style="text-align:right;font-weight:600;">' + fmtDate(acceptDate) + '</td></tr>';
            html += '<tr><td style="padding:4px 0;">Business Days:</td><td style="text-align:right;font-weight:600;">' + rescDays + ' business days</td></tr>';
            if (holidaysInPeriod.length > 0) {
                html += '<tr><td style="padding:4px 0;color:var(--danger);">Holidays in period:</td><td style="text-align:right;font-weight:600;color:var(--danger);">' + holidaysInPeriod.join(', ') + '</td></tr>';
            }
            if (jurConfig.rescissionFeePct > 0) {
                html += '<tr><td style="padding:4px 0;border-top:1px solid #ddd;padding-top:8px;">Rescission Fee (' + jurConfig.rescissionFeePct + '%):</td><td style="text-align:right;font-weight:700;color:var(--danger);border-top:1px solid #ddd;padding-top:8px;">$' + rescissionFee.toLocaleString() + '</td></tr>';
            } else {
                html += '<tr><td style="padding:4px 0;border-top:1px solid #ddd;padding-top:8px;">Rescission Fee:</td><td style="text-align:right;font-weight:600;border-top:1px solid #ddd;padding-top:8px;">None</td></tr>';
            }
            html += '</table>';
            var rescNote = '<div style="margin-top:10px;padding:8px;background:#fff3cd;border-radius:4px;font-size:11px;color:#856404;line-height:1.5;">';
            rescNote += '<strong>Important:</strong> You must deliver written notice of rescission before midnight on the deadline date.';
            if (jurConfig.rescissionFeePct > 0) rescNote += ' The ' + jurConfig.rescissionFeePct + '% fee is payable to the seller.';
            rescNote += ' Consult a lawyer for proper rescission procedure.';
            if (jurisdiction === 'CA-BC') rescNote += '<br><br><strong>Note:</strong> "Business days" for HBRP exclude Saturdays, Sundays, and holidays as defined in the BC <em>Interpretation Act</em> (s.29), which differs from Employment Standards holidays. This includes Easter Monday and Boxing Day.';
            rescNote += '</div>';
            html += rescNote;
            document.getElementById('rescissionResult').innerHTML = html;
        }

        function validateAndGenerateOffer() {
            var prop = document.getElementById('propertySelect').value;
            if (!prop) {
                alert('Please select a property.');
                return;
            }
            generateOfferSummary();
        }

        // ===== AFFORDABILITY CALCULATOR =====
        var _lastAffordMaxPrice = 0;
        function calcAffordability() {
            var income = parseFloat(document.getElementById('affIncome').value) || 0;
            var debts = parseFloat(document.getElementById('affDebts').value) || 0;
            var downAvail = parseFloat(document.getElementById('affDown').value) || 0;
            var contractRate = parseFloat(document.getElementById('affRate').value) || 5.5;
            var years = parseInt(document.getElementById('affAmort').value) || 25;
            var taxRate = parseFloat(document.getElementById('affTaxRate').value) || 0.35;
            var strata = parseFloat(document.getElementById('affStrata').value) || 0;
            var heat = parseFloat(document.getElementById('affHeat').value) || 0;
            var monthlyIncome = income / 12;

            // Stress test: higher of contract + 2% or 5.25%
            var stressRate = Math.max(contractRate + 2, 5.25);
            var monthlyStressRate = stressRate / 100 / 12;
            var nPayments = years * 12;

            // Binary search for max purchase price where GDS <= 39% AND TDS <= 44%
            var lo = 0, hi = 5000000;
            for (var iter = 0; iter < 50; iter++) {
                var mid = (lo + hi) / 2;
                var mortAmt = mid - downAvail;
                if (mortAmt < 0) mortAmt = 0;
                // Add CMHC if < 20% down
                var downPct = mid > 0 ? (downAvail / mid * 100) : 100;
                var cmhcPremium = 0;
                if (downPct < 20 && mid <= 1500000) {
                    var cmhcRate = downPct >= 15 ? 0.028 : downPct >= 10 ? 0.031 : downPct >= 5 ? 0.04 : 0;
                    cmhcPremium = mortAmt * cmhcRate;
                    mortAmt += cmhcPremium;
                }
                var mortPmt = monthlyStressRate > 0 && mortAmt > 0 ? mortAmt * (monthlyStressRate * Math.pow(1 + monthlyStressRate, nPayments)) / (Math.pow(1 + monthlyStressRate, nPayments) - 1) : 0;
                var taxPmt = mid * (taxRate / 100) / 12;
                var gds = monthlyIncome > 0 ? (mortPmt + taxPmt + heat + strata * 0.5) / monthlyIncome : 1;
                var tds = monthlyIncome > 0 ? (mortPmt + taxPmt + heat + strata * 0.5 + debts) / monthlyIncome : 1;
                if (gds <= 0.39 && tds <= 0.44) { lo = mid; } else { hi = mid; }
            }
            var maxPrice = Math.floor(lo / 1000) * 1000; // Round down to nearest $1K

            // Check minimum down payment requirement
            var minDown;
            if (maxPrice <= 500000) minDown = maxPrice * 0.05;
            else if (maxPrice <= 1500000) minDown = 25000 + (maxPrice - 500000) * 0.10;
            else minDown = maxPrice * 0.20;
            minDown = Math.ceil(minDown);

            // If available down < minimum required, cap the price
            if (downAvail < minDown) {
                // Re-search with minimum down constraint
                lo = 0; hi = maxPrice;
                for (var iter2 = 0; iter2 < 50; iter2++) {
                    var mid2 = (lo + hi) / 2;
                    var reqDown;
                    if (mid2 <= 500000) reqDown = mid2 * 0.05;
                    else if (mid2 <= 1500000) reqDown = 25000 + (mid2 - 500000) * 0.10;
                    else reqDown = mid2 * 0.20;
                    if (downAvail >= reqDown) { lo = mid2; } else { hi = mid2; }
                }
                maxPrice = Math.floor(lo / 1000) * 1000;
            }

            // Recalculate final values at maxPrice
            var finalMort = maxPrice - downAvail;
            if (finalMort < 0) finalMort = 0;
            var finalDownPct = maxPrice > 0 ? (downAvail / maxPrice * 100) : 100;
            var finalCMHC = 0;
            if (finalDownPct < 20 && maxPrice <= 1500000) {
                var cr = finalDownPct >= 15 ? 0.028 : finalDownPct >= 10 ? 0.031 : finalDownPct >= 5 ? 0.04 : 0;
                finalCMHC = Math.round(finalMort * cr);
                finalMort += finalCMHC;
            }
            var monthlyActualRate = contractRate / 100 / 12;
            var actualMortPmt = monthlyActualRate > 0 && finalMort > 0 ? finalMort * (monthlyActualRate * Math.pow(1 + monthlyActualRate, nPayments)) / (Math.pow(1 + monthlyActualRate, nPayments) - 1) : 0;
            var finalTax = maxPrice * (taxRate / 100) / 12;
            var gdsActual = monthlyIncome > 0 ? (actualMortPmt + finalTax + heat + strata * 0.5) / monthlyIncome * 100 : 0;
            var tdsActual = monthlyIncome > 0 ? (actualMortPmt + finalTax + heat + strata * 0.5 + debts) / monthlyIncome * 100 : 0;

            // Min down for final price
            if (maxPrice <= 500000) minDown = maxPrice * 0.05;
            else if (maxPrice <= 1500000) minDown = 25000 + (maxPrice - 500000) * 0.10;
            else minDown = maxPrice * 0.20;

            _lastAffordMaxPrice = maxPrice;

            // Update UI
            document.getElementById('affMaxPrice').textContent = '$' + maxPrice.toLocaleString();
            document.getElementById('affStressNote').textContent = 'Stress-tested at ' + stressRate.toFixed(2) + '% (contract ' + contractRate + '% + 2%)';
            document.getElementById('affMaxMort').textContent = '$' + Math.round(finalMort).toLocaleString();
            document.getElementById('affMortPmt').textContent = '$' + Math.round(actualMortPmt).toLocaleString();
            document.getElementById('affTaxPmt').textContent = '$' + Math.round(finalTax).toLocaleString();
            document.getElementById('affHeatStrata').textContent = '$' + (heat + strata).toLocaleString();
            document.getElementById('affDebtsPmt').textContent = '$' + debts.toLocaleString();
            document.getElementById('affCMHC').textContent = finalCMHC > 0 ? '$' + finalCMHC.toLocaleString() + ' (added to mortgage)' : '$0';
            document.getElementById('affMinDown').textContent = '$' + Math.ceil(minDown).toLocaleString() + ' (' + (maxPrice > 0 ? (minDown / maxPrice * 100).toFixed(1) : 0) + '%)';

            var gdsEl = document.getElementById('affGDS');
            gdsEl.textContent = gdsActual.toFixed(1) + '%';
            gdsEl.style.color = gdsActual <= 32 ? '#155724' : gdsActual <= 39 ? '#856404' : '#721c24';
            gdsEl.parentElement.style.background = gdsActual <= 32 ? '#d4edda' : gdsActual <= 39 ? '#fff3cd' : '#f8d7da';

            var tdsEl = document.getElementById('affTDS');
            tdsEl.textContent = tdsActual.toFixed(1) + '%';
            tdsEl.style.color = tdsActual <= 39 ? '#004085' : tdsActual <= 44 ? '#856404' : '#721c24';
            tdsEl.parentElement.style.background = tdsActual <= 39 ? '#e7f3ff' : tdsActual <= 44 ? '#fff3cd' : '#f8d7da';

            var notes = [];
            notes.push('Qualification uses stress test rate of ' + stressRate.toFixed(2) + '%. Your actual payments use the contract rate of ' + contractRate + '%.');
            if (finalCMHC > 0) notes.push('CMHC insurance of $' + finalCMHC.toLocaleString() + ' is added to your mortgage balance.');
            if (downAvail < minDown) notes.push('<strong style="color:var(--danger);">Your down payment ($' + downAvail.toLocaleString() + ') is below the minimum required ($' + Math.ceil(minDown).toLocaleString() + ').</strong>');
            if (maxPrice > 1500000) notes.push('Properties over $1.5M require minimum 20% down payment and are not eligible for CMHC insurance.');
            document.getElementById('affNotes').innerHTML = '<ul style="margin:0;padding-left:18px;">' + notes.map(function(n) { return '<li style="margin-bottom:4px;">' + n + '</li>'; }).join('') + '</ul>';

            document.getElementById('affShowBtn').style.display = maxPrice > 0 ? 'block' : 'none';
        }

        function applyAffordabilityFilter() {
            if (_lastAffordMaxPrice <= 0) return;
            document.getElementById('priceMin').value = '';
            document.getElementById('priceMax').value = _lastAffordMaxPrice;
            applyFilters();
            switchTabDirect('listings');
        }

        // ===== MORTGAGE CALCULATOR =====
        function calcMortgage() {
            var price = parseFloat(document.getElementById('mortPrice').value) || 0;
            var down = parseFloat(document.getElementById('mortDown').value) || 0;
            var rate = parseFloat(document.getElementById('mortRate').value) || 5.5;
            var years = parseInt(document.getElementById('mortAmort').value) || 25;
            var principal = price - down;
            var downPct = price > 0 ? (down / price * 100) : 0;

            // CMHC Insurance (required if down < 20%)
            var cmhc = 0;
            if (downPct < 20 && price <= 1500000) {
                var cmhcRate = downPct < 5 ? 0 : (downPct < 10 ? 0.04 : (downPct < 15 ? 0.031 : 0.028));
                cmhc = Math.round(principal * cmhcRate);
                principal += cmhc;
            }

            var monthlyRate = rate / 100 / 12;
            var n = years * 12;
            var monthly = monthlyRate > 0 ? principal * monthlyRate * Math.pow(1 + monthlyRate, n) / (Math.pow(1 + monthlyRate, n) - 1) : principal / n;
            var totalCost = monthly * n;
            var totalInterest = totalCost - (price - down);

            document.getElementById('mortMonthly').textContent = '$' + Math.round(monthly).toLocaleString();
            document.getElementById('mortAmount').textContent = '$' + Math.round(price - down).toLocaleString();
            document.getElementById('mortTotalInterest').textContent = '$' + Math.round(totalInterest).toLocaleString();
            document.getElementById('mortTotalCost').textContent = '$' + Math.round(totalCost).toLocaleString();
            document.getElementById('mortCMHC').textContent = cmhc > 0 ? '$' + cmhc.toLocaleString() : 'N/A (20%+ down)';

            // Property Transfer Tax (currently shows BC PTT tiers in the UI breakdown)
            var fthbEl = document.getElementById('fthbCheckbox');
            var newBuildEl = document.getElementById('newBuildCheckbox');
            var isFTHB = fthbEl ? fthbEl.checked : false;
            var isNewBuild = newBuildEl ? newBuildEl.checked : false;
            var standardPtt = calculatePTTWithFTHB(price, false, false).ptt;
            var fthbResult = calculatePTTWithFTHB(price, isFTHB, isNewBuild);
            var pttTotal = fthbResult.ptt;
            if (isFTHB) {
                var fthbSavingsEl = document.getElementById('fthbSavings');
                if (fthbResult.savings > 0 && fthbSavingsEl) {
                    fthbSavingsEl.style.display = 'block';
                    fthbSavingsEl.innerHTML = '<strong>First-Time Home Buyer Savings: ' + formatPrice(fthbResult.savings) + '</strong><br><span style="font-size:12px;">PTT reduced from ' + formatPrice(standardPtt) + ' to ' + formatPrice(fthbResult.ptt) + '</span>';
                } else if (fthbSavingsEl) {
                    fthbSavingsEl.style.display = 'block';
                    fthbSavingsEl.innerHTML = '<span style="font-size:12px;">FTHB exemption does not apply at this price (' + (isNewBuild ? 'max $1.15M new builds' : 'max $860K existing') + ').</span>';
                }
            } else {
                var fthbSavingsEl2 = document.getElementById('fthbSavings');
                if (fthbSavingsEl2) fthbSavingsEl2.style.display = 'none';
            }

            // PTT tier breakdown for display
            var _ptt1 = Math.min(price, 200000) * 0.01;
            var _ptt2 = Math.max(0, Math.min(price, 2000000) - 200000) * 0.02;
            var _ptt3 = Math.max(0, Math.min(price, 3000000) - 2000000) * 0.03;
            var _ptt4 = Math.max(0, price - 3000000) * 0.05;
            document.getElementById('pttTier1').textContent = '$' + Math.round(_ptt1).toLocaleString();
            document.getElementById('pttTier2').textContent = '$' + Math.round(_ptt2).toLocaleString();
            document.getElementById('pttTier3').textContent = '$' + Math.round(_ptt3 + _ptt4).toLocaleString();
            document.getElementById('pttTotal').textContent = '$' + Math.round(pttTotal).toLocaleString();
            document.getElementById('ccPTT').textContent = '$' + Math.round(pttTotal).toLocaleString();
            document.getElementById('ccCMHC').textContent = cmhc > 0 ? '$' + cmhc.toLocaleString() : '$0';
            var closingMin = pttTotal + 1500 + 400 + 300 + 200 + cmhc;
            var closingMax = pttTotal + 2500 + 700 + 500 + 400 + cmhc;
            document.getElementById('ccTotal').textContent = '$' + Math.round(closingMin).toLocaleString() + ' - $' + Math.round(closingMax).toLocaleString();

            // Amortization Schedule
            var amortHtml = '';
            var balance = principal;
            var totalPrincipalPaid = 0;
            for (var yr = 1; yr <= years; yr++) {
                var yearPrincipal = 0;
                var yearInterest = 0;
                for (var mo = 0; mo < 12; mo++) {
                    var intPmt = balance * monthlyRate;
                    var prinPmt = monthly - intPmt;
                    if (prinPmt > balance) prinPmt = balance;
                    yearPrincipal += prinPmt;
                    yearInterest += intPmt;
                    balance -= prinPmt;
                    if (balance < 0) balance = 0;
                }
                totalPrincipalPaid += yearPrincipal;
                var principalPct = monthly > 0 ? Math.round(yearPrincipal / (yearPrincipal + yearInterest) * 100) : 0;
                amortHtml += '<tr>';
                amortHtml += '<td style="padding:6px 8px;">' + yr + '</td>';
                amortHtml += '<td style="padding:6px 8px;">$' + Math.round(monthly * 12).toLocaleString() + '</td>';
                amortHtml += '<td style="padding:6px 8px;color:var(--success);font-weight:600;">$' + Math.round(yearPrincipal).toLocaleString() + ' <span style="font-size:10px;color:#888;">(' + principalPct + '%)</span></td>';
                amortHtml += '<td style="padding:6px 8px;color:var(--danger);">$' + Math.round(yearInterest).toLocaleString() + '</td>';
                amortHtml += '<td style="padding:6px 8px;font-weight:600;">$' + Math.round(balance).toLocaleString() + '</td>';
                amortHtml += '<td style="padding:6px 8px;color:var(--primary);font-weight:600;">$' + Math.round(totalPrincipalPaid).toLocaleString() + '</td>';
                amortHtml += '</tr>';
            }
            var amortEl = document.getElementById('amortTableBody');
            if (amortEl) amortEl.innerHTML = amortHtml;
        }

        // ===== PROPERTY COMPARISON TOOL =====
        var comparisonSet = new Set();

        function toggleComparison(idx, event) {
            if (event) event.stopPropagation();
            if (comparisonSet.has(idx)) {
                comparisonSet.delete(idx);
            } else if (comparisonSet.size < 4) {
                comparisonSet.add(idx);
            } else {
                alert('Maximum 4 properties for comparison. Remove one first.');
                return;
            }
        }

        function openComparisonTool() {
            var items = [...comparisonSet].map(function(idx) { return rawListings[idx]; });
            if (items.length < 2) {
                // Show selection UI
                var sl = [...shortlistedIds];
                if (sl.length >= 2) {
                    comparisonSet = new Set(sl.slice(0, Math.min(4, sl.length)));
                    items = [...comparisonSet].map(function(idx) { return rawListings[idx]; });
                } else {
                    var emptyModal = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)this.remove()">';
                    emptyModal += '<div style="background:white;border-radius:8px;max-width:400px;width:90%;padding:30px;text-align:center;">';
                    emptyModal += '<div style="font-size:48px;margin-bottom:12px;">⚖️</div>';
                    emptyModal += '<h3 style="color:var(--primary);margin:0 0 8px 0;">No Properties to Compare</h3>';
                    emptyModal += '<p style="color:#666;font-size:13px;margin:0 0 16px 0;">Add at least 2 properties to your shortlist (★), then use Compare to see them side by side.</p>';
                    emptyModal += '<button onclick="this.closest(\'div[style*=fixed]\').remove()" style="padding:10px 24px;background:var(--primary);color:white;border:none;border-radius:4px;cursor:pointer;">Got It</button>';
                    emptyModal += '</div></div>';
                    document.body.insertAdjacentHTML('beforeend', emptyModal);
                    return;
                }
            }
            renderComparison(items);
        }

        function renderComparison(items) {
            var fields = [
                { key: 'price', label: 'Asking Price', fmt: function(l) { return formatPrice(l.price); }, compare: 'lower' },
                { key: 'score', label: 'Deal Score', fmt: function(l) { return Math.round(l.score) + '/100'; }, compare: 'higher' },
                { key: 'type', label: 'Property Type', fmt: function(l) { return l.type; } },
                { key: 'beds', label: 'Bedrooms', fmt: function(l) { return l.beds; }, compare: 'higher' },
                { key: 'baths', label: 'Bathrooms', fmt: function(l) { return l.baths; }, compare: 'higher' },
                { key: 'sqft', label: 'Square Feet', fmt: function(l) { return l.sqft > 0 ? l.sqft.toLocaleString() : 'N/A'; }, compare: 'higher' },
                { key: 'ppsf', label: '$/SqFt', fmt: function(l) { return l.sqft > 0 ? '$' + Math.round(l.price / l.sqft).toLocaleString() : 'N/A'; }, compare: 'lower' },
                { key: 'dom', label: 'Days on Market', fmt: function(l) { return l.dom; }, compare: 'higher' },
                { key: 'yearBuilt', label: 'Year Built', fmt: function(l) { return l.yearBuilt; }, compare: 'higher' },
                { key: 'lot', label: 'Lot Size', fmt: function(l) { return l.lot || 'N/A'; } },
                { key: 'neighborhood', label: 'Neighborhood', fmt: function(l) { return l.neighborhood; } },
                { key: 'agent', label: 'Agent', fmt: function(l) { return l.agent; } },
                { key: 'agg', label: 'Aggressive Offer', fmt: function(l) { return formatPrice(calculateOffers(l).aggressive); }, compare: 'lower' },
                { key: 'str', label: 'Strategic Offer', fmt: function(l) { return formatPrice(calculateOffers(l).strategic); }, compare: 'lower' },
                { key: 'comp', label: 'Competitive Offer', fmt: function(l) { return formatPrice(calculateOffers(l).competitive); }, compare: 'lower' },
                { key: 'closingCost', label: 'Est. Closing Costs', fmt: function(l) { return '$'+Math.round(calculatePTTWithFTHB(l.price,false,false).ptt+2500).toLocaleString(); }, compare: 'lower' },
                { key: 'waterView', label: 'Water View', fmt: function(l) { return l.waterView ? 'Yes' : 'No'; } }
            ];

            var html = '<h2 style="color:var(--primary);margin-bottom:16px;">Property Comparison</h2>';
            html += '<table class="comparison-table"><thead><tr><th></th>';
            items.forEach(function(l) {
                html += '<td style="font-weight:700;font-size:14px;padding:12px;background:var(--primary);color:white;min-width:180px;">' + escapeHtml(l.addr) + '<br><span style="font-weight:400;font-size:11px;opacity:0.8;">' + escapeHtml(l.neighborhood) + '</span></td>';
            });
            html += '</tr></thead><tbody>';

            fields.forEach(function(field) {
                html += '<tr><th>' + field.label + '</th>';
                var vals = items.map(function(l) {
                    if (field.key === 'ppsf') return l.sqft > 0 ? l.price / l.sqft : Infinity;
                    if (field.key === 'agg') return calculateOffers(l).aggressive;
                    if (field.key === 'str') return calculateOffers(l).strategic;
                    if (field.key === 'comp') return calculateOffers(l).competitive;
                    if (field.key === 'closingCost') { return calculatePTTWithFTHB(l.price,false,false).ptt+2500; }
                    return l[field.key];
                });
                var best = field.compare === 'lower' ? Math.min(...vals.filter(function(v){return typeof v==='number'&&isFinite(v);})) : (field.compare === 'higher' ? Math.max(...vals.filter(function(v){return typeof v==='number'&&isFinite(v);})) : null);
                items.forEach(function(l, i) {
                    var cls = '';
                    if (best !== null && typeof vals[i] === 'number' && isFinite(vals[i])) {
                        cls = vals[i] === best ? ' class="comp-better"' : '';
                    }
                    html += '<td' + cls + '>' + field.fmt(l) + '</td>';
                });
                html += '</tr>';
            });
            html += '</tbody></table>';
            html += '<div style="margin-top:16px;font-size:12px;color:#666;">Green highlights indicate the best value for that metric. Comparing ' + items.length + ' properties.</div>';
            document.getElementById('comparisonBody').innerHTML = html;
            document.getElementById('comparisonModal').classList.add('active');
        }

        function updateComparisonBar() {
            var bar = document.getElementById('comparisonBar');
            if (comparisonSet.size === 0) {
                bar.style.display = 'none';
                return;
            }
            bar.style.display = 'block';
            var html = '<span style="font-size:11px;opacity:0.8;margin-right:8px;">' + comparisonSet.size + '/4 selected:</span>';
            [...comparisonSet].forEach(function(idx) {
                var l = rawListings[idx];
                html += '<span style="background:rgba(255,255,255,0.2);padding:4px 8px;border-radius:12px;font-size:11px;display:inline-flex;align-items:center;gap:4px;">';
                html += l.addr.substring(0, 25) + (l.addr.length > 25 ? '...' : '');
                html += ' <span onclick="comparisonSet.delete(' + idx + ');updateComparisonBar();renderCurrentTab();" style="cursor:pointer;opacity:0.7;font-size:14px;" title="Remove">&times;</span>';
                html += '</span>';
            });
            document.getElementById('comparisonBarItems').innerHTML = html;
        }

        // ===== TABLE COLUMN SORTING =====
        var lastSortCol = '';
        var sortAsc = true;
        function sortTable(col) {
            if (col === lastSortCol) { sortAsc = !sortAsc; } else { sortAsc = true; lastSortCol = col; }
            var dir = sortAsc ? 1 : -1;
            filteredListings.sort(function(a, b) {
                switch(col) {
                    case 'addr': return dir * a.addr.localeCompare(b.addr);
                    case 'neighborhood': return dir * a.neighborhood.localeCompare(b.neighborhood);
                    case 'type': return dir * a.type.localeCompare(b.type);
                    case 'price-asc': return dir * (a.price - b.price);
                    case 'sqft': return dir * (b.sqft - a.sqft);
                    case 'ppsf-asc': return dir * ((a.sqft>0?a.price/a.sqft:Infinity) - (b.sqft>0?b.price/b.sqft:Infinity));
                    case 'dom-desc': return dir * (b.dom - a.dom);
                    case 'year': return dir * ((b.yearBuilt||0) - (a.yearBuilt||0));
                    case 'score-desc': return dir * (b.score - a.score);
                    case 'caprate-desc': var mA2 = a._investorMetrics || estimateInvestorMetrics(a); var mB2 = b._investorMetrics || estimateInvestorMetrics(b); return dir * (mB2.capRate - mA2.capRate);
                    case 'cashflow-desc': var mA3 = a._investorMetrics || estimateInvestorMetrics(a); var mB3 = b._investorMetrics || estimateInvestorMetrics(b); return dir * (mB3.cashFlow - mA3.cashFlow);
                    default: return 0;
                }
            });
            currentPage = 0;
            renderListingsTable();
        }

        // ===== COMPARABLE SALES FINDER =====
        function findComparables(listing) {
            return rawListings.filter(function(l) {
                if (l === listing) return false;
                if (l.neighborhood !== listing.neighborhood && l.region !== listing.region) return false;
                if (l.type !== listing.type) return false;
                var priceDiff = Math.abs(l.price - listing.price) / listing.price;
                return priceDiff < 0.35;
            }).sort(function(a, b) {
                var distA = Math.abs(a.price - listing.price);
                var distB = Math.abs(b.price - listing.price);
                return distA - distB;
            }).slice(0, 5);
        }

        // ===== CLOSING COST ESTIMATOR =====
        function estimateClosingCosts(price, jurisdiction) {
            var jur = jurisdiction || 'CA-BC';
            var result = calculateTransferTax(price, jur, false, false, false);
            var ptt = result.ptt;
            return { ptt: ptt, legal: 2000, inspection: 550, appraisal: 400, titleIns: 300, total: Math.round(ptt + 3250) };
        }

        // ===== CASH TO CLOSE CALCULATOR =====
        function calcCashToClose() {
            var jurisdiction = document.getElementById('ctcJurisdiction').value || 'CA-BC';
            var jurConfig = getJurisdictionConfig(jurisdiction);
            var price = parseFloat(document.getElementById('ctcPrice').value) || 0;
            var downPct = parseFloat(document.getElementById('ctcDownPct').value) || 0;
            var fthb = document.getElementById('ctcFTHB').value;
            var legal = parseFloat(document.getElementById('ctcLegal').value) || 0;
            var inspection = parseFloat(document.getElementById('ctcInspection').value) || 0;
            var appraisal = parseFloat(document.getElementById('ctcAppraisal').value) || 0;
            var titleIns = parseFloat(document.getElementById('ctcTitleIns').value) || 0;
            var taxAdj = parseFloat(document.getElementById('ctcTaxAdj').value) || 0;
            var homeIns = parseFloat(document.getElementById('ctcHomeIns').value) || 0;
            var moving = parseFloat(document.getElementById('ctcMoving').value) || 0;
            var reserve = parseFloat(document.getElementById('ctcReserve').value) || 0;

            var downPayment = Math.round(price * downPct / 100);
            var mortAmount = price - downPayment;

            // Mortgage insurance (CMHC for Canada, PMI for US)
            var insuranceAmt = 0;
            var insuranceLabel = '';
            var insResult = calculateMortgageInsurance(mortAmount, price, downPct, jurisdiction);
            if (insResult.premium > 0) {
                insuranceAmt = insResult.premium;
                insuranceLabel = insResult.label;
            }

            // Transfer tax (jurisdiction-aware)
            var isFTHB = fthb !== 'no';
            var isNewBuild = fthb === 'new';
            var isToronto = jurisdiction === 'CA-ON'; // simplified; could add city selector
            var pttResult = calculateTransferTax(price, jurisdiction, isFTHB, isNewBuild, isToronto);
            var ptt = pttResult.ptt;
            var fthbSavings = pttResult.savings || 0;

            // Total
            var total = downPayment + insuranceAmt + ptt + legal + inspection + appraisal + titleIns + taxAdj + homeIns + moving + reserve;

            // Update displays
            var cur = jurConfig.currency === 'USD' ? 'US$' : '$';
            document.getElementById('ctcTotal').textContent = cur + Math.round(total).toLocaleString();
            document.getElementById('ctcGrandTotal').textContent = cur + Math.round(total).toLocaleString();
            document.getElementById('ctcDownAmt').textContent = cur + downPayment.toLocaleString();
            document.getElementById('ctcCMHC').textContent = insuranceAmt > 0 ? cur + insuranceAmt.toLocaleString() : cur + '0';
            document.getElementById('ctcPTT').textContent = cur + Math.round(ptt).toLocaleString();
            document.getElementById('ctcFTHBSavings').textContent = fthbSavings > 0 ? '-' + cur + Math.round(fthbSavings).toLocaleString() : cur + '0';
            document.getElementById('ctcLegalAmt').textContent = cur + legal.toLocaleString();
            document.getElementById('ctcInspAmt').textContent = cur + inspection.toLocaleString();
            document.getElementById('ctcApprAmt').textContent = cur + appraisal.toLocaleString();
            document.getElementById('ctcTitleAmt').textContent = cur + titleIns.toLocaleString();
            document.getElementById('ctcTaxAdjAmt').textContent = cur + taxAdj.toLocaleString();
            document.getElementById('ctcHomeInsAmt').textContent = cur + homeIns.toLocaleString();
            document.getElementById('ctcMovingAmt').textContent = cur + moving.toLocaleString();
            document.getElementById('ctcReserveAmt').textContent = cur + reserve.toLocaleString();

            // Notes
            var notes = [];
            if (insuranceAmt > 0) notes.push(insuranceLabel + ' of ' + cur + insuranceAmt.toLocaleString() + ' is added to your mortgage balance, but required at closing.');
            if (fthbSavings > 0) notes.push('FTHB exemption saves you ' + cur + Math.round(fthbSavings).toLocaleString() + ' on ' + (pttResult.label || 'transfer tax') + '.');
            if (jurConfig.country === 'CA') {
                if (downPct < 5) notes.push('Minimum 5% down payment required in Canada for homes under $500K.');
                if (price > 1000000 && downPct < 20) notes.push('Properties over $1M require minimum 20% down payment in Canada.');
            } else {
                if (downPct < 3) notes.push('Most US lenders require a minimum 3% down payment (3.5% for FHA).');
            }
            if (reserve < 5000) notes.push('Consider increasing your emergency reserve. 3-6 months of expenses is recommended.');
            var withoutReserve = total - reserve;
            notes.push('Without emergency reserve: ' + cur + Math.round(withoutReserve).toLocaleString() + ' needed at closing.');
            document.getElementById('ctcNotes').innerHTML = '<strong>Notes:</strong><ul style="margin:6px 0 0;padding-left:20px;">' + notes.map(function(n) { return '<li style="margin-bottom:4px;">' + n + '</li>'; }).join('') + '</ul>';
        }

        // ===== CMHC INSURANCE BREAKDOWN =====
        function calcCMHCBreakdown() {
            var price = parseFloat(document.getElementById('cmhcPrice').value) || 0;
            var el = document.getElementById('cmhcResults');
            if (price <= 0) { el.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">Enter a valid price</div>'; return; }

            // Min down payment rules
            var minDown;
            if (price <= 500000) { minDown = price * 0.05; }
            else if (price <= 1500000) { minDown = 25000 + (price - 500000) * 0.10; }
            else { minDown = price * 0.20; }
            var minDownPct = (minDown / price * 100);

            var html = '';
            if (price > 1500000) {
                html += '<div style="background:#f8d7da;border:1px solid #dc3545;border-radius:8px;padding:16px;text-align:center;margin-bottom:16px;">';
                html += '<div style="font-size:16px;font-weight:700;color:#721c24;">NOT Eligible for CMHC Insurance</div>';
                html += '<div style="font-size:13px;color:#856404;margin-top:6px;">Properties over $1,500,000 require a minimum 20% down payment.</div>';
                html += '</div>';
                html += '<table style="width:100%;border-collapse:collapse;font-size:13px;">';
                html += '<tr style="background:var(--primary);color:white;font-weight:700;"><td style="padding:10px 8px;">Minimum Down Payment (20%)</td><td style="padding:10px 8px;text-align:right;">$' + Math.round(minDown).toLocaleString() + '</td></tr>';
                html += '</table>';
            } else {
                // Calculate premiums at each tier
                var tiers = [
                    { label: '5% Down', pct: 5, rate: 4.00 },
                    { label: '10% Down', pct: 10, rate: 3.10 },
                    { label: '15% Down', pct: 15, rate: 2.80 },
                    { label: '20% Down', pct: 20, rate: 0 }
                ];

                html += '<div style="text-align:center;margin-bottom:16px;">';
                html += '<div style="font-size:12px;color:#888;">Min. Down Payment Required</div>';
                html += '<div style="font-size:28px;font-weight:700;color:var(--primary);">$' + Math.round(minDown).toLocaleString() + '</div>';
                html += '<div style="font-size:12px;color:#666;">(' + minDownPct.toFixed(1) + '% of $' + price.toLocaleString() + ')</div>';
                html += '</div>';

                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<thead><tr style="background:var(--primary);color:white;"><th style="padding:8px;text-align:left;">Scenario</th><th style="padding:8px;text-align:right;">Down $</th><th style="padding:8px;text-align:center;">Rate</th><th style="padding:8px;text-align:right;">Premium</th><th style="padding:8px;text-align:right;">Total Mortgage</th></tr></thead>';
                html += '<tbody>';
                tiers.forEach(function(tier) {
                    var down = price * tier.pct / 100;
                    if (down < minDown && tier.pct < 20) return; // Skip if below min
                    var mortgage = price - down;
                    var premium = mortgage * tier.rate / 100;
                    var totalMort = mortgage + premium;
                    var bg = tier.rate === 0 ? '#e7f3ff' : tier.rate <= 2.80 ? '#d4edda' : tier.rate <= 3.10 ? '#fff3cd' : '#f8d7da';
                    html += '<tr style="background:' + bg + ';">';
                    html += '<td style="padding:8px;font-weight:600;">' + tier.label + '</td>';
                    html += '<td style="padding:8px;text-align:right;">$' + Math.round(down).toLocaleString() + '</td>';
                    html += '<td style="padding:8px;text-align:center;font-weight:700;">' + (tier.rate > 0 ? tier.rate.toFixed(2) + '%' : 'None') + '</td>';
                    html += '<td style="padding:8px;text-align:right;">' + (premium > 0 ? '$' + Math.round(premium).toLocaleString() : '$0') + '</td>';
                    html += '<td style="padding:8px;text-align:right;font-weight:600;">$' + Math.round(totalMort).toLocaleString() + '</td>';
                    html += '</tr>';
                });
                html += '</tbody></table>';

                // Monthly payment comparison at 5.5%
                var mRate = 0.055 / 12;
                var nPmt = 300;
                html += '<div style="margin-top:16px;"><div style="font-weight:700;color:var(--primary);margin-bottom:8px;font-size:13px;">Monthly Payment Comparison (5.5%, 25yr)</div>';
                html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;">';
                tiers.forEach(function(tier) {
                    var down = price * tier.pct / 100;
                    if (down < minDown && tier.pct < 20) return;
                    var mortgage = price - down;
                    var premium = mortgage * tier.rate / 100;
                    var totalMort = mortgage + premium;
                    var pmt = mRate > 0 ? totalMort * (mRate * Math.pow(1+mRate,nPmt)) / (Math.pow(1+mRate,nPmt)-1) : 0;
                    html += '<div style="background:white;border:1px solid #e0e0e0;border-radius:8px;padding:10px;text-align:center;">';
                    html += '<div style="font-size:11px;color:#888;">' + tier.label + '</div>';
                    html += '<div style="font-size:18px;font-weight:700;color:var(--primary);">$' + Math.round(pmt).toLocaleString() + '</div>';
                    html += '<div style="font-size:10px;color:#999;">/month</div></div>';
                });
                html += '</div></div>';
            }

            el.innerHTML = html;
        }

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

        // ===== Welcome Banner =====
        function showWelcomeBanner() {
            if (localStorage.getItem('hasVisited')) return;
            var banner = document.getElementById('welcomeBanner');
            if (banner) banner.style.display = 'block';
        }

        function dismissWelcome() {
            localStorage.setItem('hasVisited', '1');
            var banner = document.getElementById('welcomeBanner');
            if (banner) banner.style.display = 'none';
        }

        // ===== PHASE 6.3: Dynamic Page Title =====
        var tabTitles = {
            dashboard: 'Dashboard', listings: 'All Listings', map: 'Map View',
            neighborhood: 'Neighborhoods', deals: 'Deal Analysis', offers: 'Offer Generator',
            myoffers: 'My Offers', shortlist: 'Shortlist', mortgage: 'Financing Hub',
            roi: 'ROI Calculator', lenders: 'Lender Directory', buyerprofile: 'My Profile',
            contactlog: 'Contact Log', viewings: 'Viewings', documents: 'Documents',
            pricehistory: 'Price History', neighborhooddata: 'Area Intel',
            datafreshness: 'Data Health', norealtorguide: 'No-Realtor Guide', privateoffers: 'Private Offers', bcassessment: 'Assessment', help: 'Help'
        };

        // ===== JURISDICTION TAX ENGINE =====
        // Maps region -> jurisdiction code
        var REGION_JURISDICTION_MAP = {
            'South Surrey / White Rock': 'CA-BC', 'Vancouver Island': 'CA-BC',
            'Vancouver': 'CA-BC', 'Burnaby / New Westminster': 'CA-BC', 'North Shore': 'CA-BC',
            'Tri-Cities': 'CA-BC', 'Ridge Meadows': 'CA-BC', 'Langley / Delta': 'CA-BC',
            'Richmond': 'CA-BC', 'Surrey (Expanded)': 'CA-BC', 'Sunshine Coast': 'CA-BC',
            'Okanagan': 'CA-BC', 'Sea to Sky': 'CA-BC', 'Gulf Islands': 'CA-BC',
            'Edmonton': 'CA-AB', 'Hinton': 'CA-AB',
            'Toronto': 'CA-ON',
            'Laguna Beach': 'US-CA'
        };

        var JURISDICTION_CONFIG = {
            'CA-BC': {
                country: 'CA', provinceState: 'BC', currency: 'CAD',
                displayName: 'British Columbia', transferTaxName: 'BC Property Transfer Tax',
                hasRescission: true, rescissionDays: 3, rescissionFeePct: 0.25,
                rescissionNotes: '3 business days, 0.25% fee per Home Buyer Rescission Period (HBRP)',
                governingLaw: 'Province of British Columbia',
                legalDisclaimer: 'This offer template is for informational purposes only. It is not legal advice. It is not a standard BCREA Contract of Purchase and Sale (Form B). Have a BC lawyer or notary review any offer before submission. The buyer accepts all responsibility for reliance on this document.',
                offerTemplateType: 'bc',
                hasCMHC: true, hasStressTest: true, minDownPct: 5,
                foreignBuyerTax: 0.20, foreignBuyerTaxName: 'Additional Property Transfer Tax (20%)'
            },
            'CA-AB': {
                country: 'CA', provinceState: 'AB', currency: 'CAD',
                displayName: 'Alberta', transferTaxName: 'Land Title Registration Fee',
                hasRescission: false, rescissionDays: 0, rescissionFeePct: 0,
                rescissionNotes: 'No statutory rescission period in Alberta',
                governingLaw: 'Province of Alberta',
                legalDisclaimer: 'This offer template is for informational purposes only. It is not legal advice. Have an Alberta lawyer review any offer before submission. The buyer accepts all responsibility for reliance on this document.',
                offerTemplateType: 'ab',
                hasCMHC: true, hasStressTest: true, minDownPct: 5,
                foreignBuyerTax: 0, foreignBuyerTaxName: null
            },
            'CA-ON': {
                country: 'CA', provinceState: 'ON', currency: 'CAD',
                displayName: 'Ontario', transferTaxName: 'Ontario Land Transfer Tax',
                hasRescission: true, rescissionDays: 10, rescissionFeePct: 0,
                rescissionNotes: '10-day cooling-off period for pre-construction condos only (Condominium Act)',
                governingLaw: 'Province of Ontario',
                legalDisclaimer: 'This offer template is for informational purposes only. It is not legal advice. It is not a standard OREA Agreement of Purchase and Sale. Have an Ontario lawyer review any offer before submission. The buyer accepts all responsibility for reliance on this document.',
                offerTemplateType: 'on',
                hasCMHC: true, hasStressTest: true, minDownPct: 5,
                foreignBuyerTax: 0.25, foreignBuyerTaxName: 'Non-Resident Speculation Tax (25%)'
            },
            'US-CA': {
                country: 'US', provinceState: 'CA', currency: 'USD',
                displayName: 'California', transferTaxName: 'County Transfer Tax',
                hasRescission: false, rescissionDays: 0, rescissionFeePct: 0,
                rescissionNotes: 'No statutory rescission period in California',
                governingLaw: 'State of California',
                legalDisclaimer: 'This offer template is for informational purposes only. It is not legal advice. It is not a standard CAR Residential Purchase Agreement. Have a California attorney review any offer before submission. The buyer accepts all responsibility for reliance on this document.',
                offerTemplateType: 'us-ca',
                hasCMHC: false, hasStressTest: false, minDownPct: 3,
                foreignBuyerTax: 0, foreignBuyerTaxName: null
            }
        };

        function getJurisdictionForListing(listing) {
            if (listing && listing.jurisdiction) return listing.jurisdiction;
            if (listing && listing.region && REGION_JURISDICTION_MAP[listing.region]) {
                return REGION_JURISDICTION_MAP[listing.region];
            }
            return 'CA-BC';
        }

        function getJurisdictionConfig(jurisdictionCode) {
            return JURISDICTION_CONFIG[jurisdictionCode] || JURISDICTION_CONFIG['CA-BC'];
        }

        function getLocationForListing(listing) {
            var jur = getJurisdictionForListing(listing);
            var config = getJurisdictionConfig(jur);
            var city = getCityForListing(listing);
            var suffix = config.provinceState;
            return {
                city: city,
                provinceState: config.provinceState,
                country: config.country,
                fullSuffix: city + ', ' + suffix,
                fullAddress: listing.addr + ', ' + city + ', ' + suffix,
                jurisdictionCode: jur
            };
        }

        function formatPriceWithCurrency(price, currency) {
            if (!currency || currency === 'CAD') {
                return '$' + Number(price).toLocaleString('en-CA', {maximumFractionDigits: 0});
            } else if (currency === 'USD') {
                return 'US$' + Number(price).toLocaleString('en-US', {maximumFractionDigits: 0});
            }
            return '$' + Number(price).toLocaleString('en-US', {maximumFractionDigits: 0});
        }

        // ===== JURISDICTION-SPECIFIC TRANSFER TAX CALCULATORS =====
        function calculateTransferTax(price, jurisdiction, isFTHB, isNewBuild, isToronto) {
            var jur = jurisdiction || 'CA-BC';
            switch (jur) {
                case 'CA-BC': return calculatePTTWithFTHB(price, isFTHB, isNewBuild);
                case 'CA-AB': return calculateABRegistrationFee(price);
                case 'CA-ON': return calculateONLTT(price, isFTHB, isToronto);
                case 'US-CA': return calculateCATransferTax(price);
                default: return calculatePTTWithFTHB(price, isFTHB, isNewBuild);
            }
        }

        function calculateABRegistrationFee(price) {
            // Alberta: $50 base + $2 per $5,000 of property value
            var fee = 50 + Math.ceil(price / 5000) * 2;
            return { ptt: fee, savings: 0, label: 'Land Title Registration Fee' };
        }

        function calculateONLTT(price, isFTHB, isToronto) {
            // Ontario Provincial LTT
            var provLTT = 0;
            if (price <= 55000) provLTT = price * 0.005;
            else if (price <= 250000) provLTT = 275 + (price - 55000) * 0.01;
            else if (price <= 400000) provLTT = 275 + 1950 + (price - 250000) * 0.015;
            else if (price <= 2000000) provLTT = 275 + 1950 + 2250 + (price - 400000) * 0.02;
            else provLTT = 275 + 1950 + 2250 + 32000 + (price - 2000000) * 0.025;

            // Toronto Municipal LTT (if applicable)
            var muniLTT = 0;
            if (isToronto) {
                if (price <= 55000) muniLTT = price * 0.005;
                else if (price <= 250000) muniLTT = 275 + (price - 55000) * 0.01;
                else if (price <= 400000) muniLTT = 275 + 1950 + (price - 250000) * 0.015;
                else if (price <= 2000000) muniLTT = 275 + 1950 + 2250 + (price - 400000) * 0.02;
                else muniLTT = 275 + 1950 + 2250 + 32000 + (price - 2000000) * 0.025;
            }

            var totalLTT = provLTT + muniLTT;
            var savings = 0;

            // FTHB rebates
            if (isFTHB) {
                var provRebate = Math.min(provLTT, 4000);
                var muniRebate = isToronto ? Math.min(muniLTT, 4475) : 0;
                savings = provRebate + muniRebate;
                totalLTT -= savings;
            }

            return { ptt: Math.round(totalLTT), savings: Math.round(savings), provLTT: Math.round(provLTT), muniLTT: Math.round(muniLTT), label: 'Ontario Land Transfer Tax' + (isToronto ? ' + Toronto Municipal LTT' : '') };
        }

        function calculateCATransferTax(price) {
            // California: County transfer tax $1.10 per $1,000
            var tax = Math.round(price / 1000 * 1.10);
            return { ptt: tax, savings: 0, label: 'County Transfer Tax' };
        }

        // ===== PHASE 7.3: FTHB PTT Exemption (BC) =====
        function calculatePTTWithFTHB(price, isFTHB, isNewBuild) {
            var ptt = 0;
            // Standard BC PTT rates
            if (price <= 200000) ptt = price * 0.01;
            else if (price <= 2000000) ptt = 2000 + (price - 200000) * 0.02;
            else if (price <= 3000000) ptt = 2000 + 36000 + (price - 2000000) * 0.03;
            else ptt = 2000 + 36000 + 30000 + (price - 3000000) * 0.05;

            var savings = 0;

            if (isFTHB && isNewBuild) {
                if (price <= 1100000) {
                    savings = ptt;
                    ptt = 0;
                } else if (price <= 1150000) {
                    var ratio = (1150000 - price) / 50000;
                    savings = ptt * ratio;
                    ptt = ptt - savings;
                }
            } else if (isFTHB && !isNewBuild) {
                if (price <= 500000) {
                    savings = ptt;
                    ptt = 0;
                } else if (price <= 835000) {
                    savings = 8000;
                    ptt = ptt - 8000;
                } else if (price < 860000) {
                    var exemption = 8000 * ((860000 - price) / 25000);
                    savings = Math.round(exemption);
                    ptt = ptt - exemption;
                }
            }

            return { ptt: Math.round(ptt), savings: Math.round(savings), label: 'BC Property Transfer Tax' };
        }

        // ===== MORTGAGE INSURANCE CALCULATOR (jurisdiction-aware) =====
        function calculateMortgageInsurance(principal, price, downPct, jurisdiction) {
            var jur = getJurisdictionConfig(jurisdiction || 'CA-BC');
            if (jur.hasCMHC) {
                // Canadian CMHC insurance
                if (downPct >= 20 || price > 1500000) return { premium: 0, label: 'N/A (20%+ down)', type: 'CMHC' };
                var cmhcRate = downPct >= 15 ? 0.028 : downPct >= 10 ? 0.031 : downPct >= 5 ? 0.04 : 0;
                return { premium: Math.round(principal * cmhcRate), label: 'CMHC Insurance', type: 'CMHC' };
            } else {
                // US PMI (Private Mortgage Insurance)
                if (downPct >= 20) return { premium: 0, label: 'N/A (20%+ down)', type: 'PMI' };
                // PMI typically 0.5-1% of loan annually; we estimate ~0.7% annual
                var annualPMI = Math.round(principal * 0.007);
                return { premium: 0, annualPMI: annualPMI, monthlyPMI: Math.round(annualPMI / 12), label: 'PMI ~$' + Math.round(annualPMI / 12) + '/mo', type: 'PMI' };
            }
        }

        // ===== PHASE 9.1: Staleness Warning =====
        function checkStalenessWarning() {
            if (!window._dataAsOf) return;
            var dataDate = new Date(window._dataAsOf);
            var now = new Date();
            var daysDiff = Math.floor((now - dataDate) / (1000 * 60 * 60 * 24));
            var el = document.getElementById('stalenessWarning');
            if (!el) return;
            if (daysDiff > 14) {
                el.className = 'staleness-warning red';
                el.innerHTML = 'Listing data was last updated ' + daysDiff + ' days ago. Prices and availability may have changed significantly.';
                el.style.display = 'block';
            } else if (daysDiff > 7) {
                el.className = 'staleness-warning yellow';
                el.innerHTML = 'Listing data was last updated ' + daysDiff + ' days ago. Some listings may have new pricing or status changes.';
                el.style.display = 'block';
            }
        }

        // ===== PHASE 10.1: Keyboard Shortcuts =====
        document.addEventListener('keydown', function(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
            if (e.key === '/') { e.preventDefault(); document.getElementById('searchBox').focus(); }
            if (e.key === 'Escape') {
                var detailModal = document.getElementById('detailModal');
                if (detailModal && detailModal.classList.contains('active')) { closeDetailModal(); return; }
                var genericModal = document.getElementById('genericModal');
                if (genericModal && genericModal.classList.contains('active')) { genericModal.classList.remove('active'); return; }
                var offerModal = document.getElementById('offerModal');
                if (offerModal && offerModal.classList.contains('active')) { closeOfferModal(); return; }
                var compModal = document.getElementById('comparisonModal');
                if (compModal && compModal.classList.contains('active')) { compModal.classList.remove('active'); return; }
            }
            if (e.key === 'ArrowLeft' && currentPage > 0) { if (typeof previousPage === 'function') previousPage(); }
            if (e.key === 'ArrowRight') { if (typeof nextPage === 'function') nextPage(); }
        });

        // ===== PHASE 10.2: Recently Viewed =====
        function trackRecentlyViewed(listingIndex) {
            var recent = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
            recent = recent.filter(function(r) { return r !== listingIndex; });
            recent.unshift(listingIndex);
            recent = recent.slice(0, 10);
            localStorage.setItem('recentlyViewed', JSON.stringify(recent));
        }

        function updateRecentlyViewed() {
            var recent = JSON.parse(localStorage.getItem('recentlyViewed') || '[]');
            var section = document.getElementById('recentlyViewedSection');
            var list = document.getElementById('recentlyViewedList');
            if (!section || !list) return;
            if (recent.length === 0) { section.style.display = 'none'; return; }
            section.style.display = 'block';
            var html = '';
            recent.slice(0, 6).forEach(function(idx) {
                var l = rawListings[idx];
                if (!l) return;
                html += '<div style="background:var(--light-gray);padding:10px 12px;border-radius:6px;cursor:pointer;font-size:12px;" onclick="showDetailModal(' + idx + ')">';
                html += '<div style="font-weight:700;color:var(--primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(l.addr) + '</div>';
                html += '<div style="color:#888;">' + formatPrice(l.price) + ' &middot; ' + escapeHtml(l.neighborhood) + '</div>';
                html += '</div>';
            });
            list.innerHTML = html;
        }

        // ===== PHASE 6: Mobile Bottom Nav Update =====
        function updateBottomNav(activeTab) {
            var nav = document.getElementById('mobileBottomNav');
            if (!nav) return;
            var btns = nav.querySelectorAll('button');
            var tabs = ['dashboard', 'listings', 'shortlist', 'offers', 'mortgage'];
            btns.forEach(function(btn, i) {
                btn.className = (tabs[i] === activeTab) ? 'active' : '';
            });
        }


