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
    if (!isMember()) {
        showMemberGate();
        return;
    }
    var prop = document.getElementById('propertySelect').value;
    if (!prop) {
        alert('Please select a property.');
        return;
    }
    updateOfferStepIndicator(2);
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

