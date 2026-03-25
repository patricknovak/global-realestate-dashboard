// ========== OFFER BUILDER SYSTEM ==========
let currentOfferListingIndex = null;
let offerPdfGenerated = false;
let lastGeneratedPdfFilename = '';

function closeOfferModal() {
    document.getElementById('offerModal').style.display = 'none';
    document.body.style.overflow = '';
}

function openOfferBuilder(listingIndex) {
    if (!isMember()) { showMemberGate(); return; }
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
  if (!isMember()) { showMemberGate(); return; }
  updateOfferStepIndicator(3);
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
    if (!isMember()) { showMemberGate(); return; }
    updateOfferStepIndicator(4);
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



