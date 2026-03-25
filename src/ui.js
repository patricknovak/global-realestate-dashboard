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


