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


