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
