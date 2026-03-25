// ===== MEMBERSHIP SYSTEM =====
var MEMBER_STORAGE_KEY = 'reDashMember';
var MEMBERS_DB_KEY = 'reDashMembersDB';

function getMember() {
    try {
        var data = localStorage.getItem(MEMBER_STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch(e) { return null; }
}

function getMembersDB() {
    try {
        var data = localStorage.getItem(MEMBERS_DB_KEY);
        return data ? JSON.parse(data) : {};
    } catch(e) { return {}; }
}

function saveMembersDB(db) {
    localStorage.setItem(MEMBERS_DB_KEY, JSON.stringify(db));
}

function setMember(member) {
    localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(member));
    updateMemberUI();
}

function clearMember() {
    localStorage.removeItem(MEMBER_STORAGE_KEY);
    updateMemberUI();
}

function isMember() {
    return getMember() !== null;
}

function simpleHash(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
    }
    return 'h' + Math.abs(hash).toString(36);
}

function handleMemberSignup(e) {
    e.preventDefault();
    var name = document.getElementById('gateSignupName').value.trim();
    var email = document.getElementById('gateSignupEmail').value.trim().toLowerCase();
    var password = document.getElementById('gateSignupPassword').value;
    var errorEl = document.getElementById('gateError');

    if (!name || !email || !password) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.style.display = 'block';
        return;
    }
    if (password.length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters.';
        errorEl.style.display = 'block';
        return;
    }

    var db = getMembersDB();
    if (db[email]) {
        errorEl.textContent = 'An account with this email already exists. Please log in.';
        errorEl.style.display = 'block';
        return;
    }

    var member = {
        name: name,
        email: email,
        joinedAt: new Date().toISOString(),
        role: 'buyer'
    };
    db[email] = { name: name, passHash: simpleHash(password), joinedAt: member.joinedAt };
    saveMembersDB(db);
    setMember(member);

    // Auto-fill buyer profile
    if (!getBuyerField('name')) { try { localStorage.setItem('buyerProfile_name', name); } catch(e){} }
    if (!getBuyerField('email')) { try { localStorage.setItem('buyerProfile_email', email); } catch(e){} }

    errorEl.style.display = 'none';
    document.getElementById('memberGate').style.display = 'none';
    document.body.style.overflow = '';
    updateOfferToolVisibility();
}

function handleMemberLogin(e) {
    e.preventDefault();
    var email = document.getElementById('gateLoginEmail').value.trim().toLowerCase();
    var password = document.getElementById('gateLoginPassword').value;
    var errorEl = document.getElementById('gateError');

    var db = getMembersDB();
    var record = db[email];
    if (!record || record.passHash !== simpleHash(password)) {
        errorEl.textContent = 'Invalid email or password.';
        errorEl.style.display = 'block';
        return;
    }

    setMember({ name: record.name, email: email, joinedAt: record.joinedAt, role: 'buyer' });
    errorEl.style.display = 'none';
    document.getElementById('memberGate').style.display = 'none';
    document.body.style.overflow = '';
    updateOfferToolVisibility();
}

function handleMemberLogout() {
    clearMember();
    closeMemberMenu();
    updateOfferToolVisibility();
}

function showMemberGate() {
    document.getElementById('memberGate').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    document.getElementById('gateError').style.display = 'none';
}

function dismissMemberGate() {
    document.getElementById('memberGate').style.display = 'none';
    document.body.style.overflow = '';
}

function showGateForm(which) {
    document.querySelectorAll('.gate-tab').forEach(function(t) { t.classList.remove('active'); });
    if (which === 'login') {
        document.getElementById('gateSignupForm').style.display = 'none';
        document.getElementById('gateLoginForm').style.display = 'block';
        document.querySelectorAll('.gate-tab')[1].classList.add('active');
    } else {
        document.getElementById('gateSignupForm').style.display = 'block';
        document.getElementById('gateLoginForm').style.display = 'none';
        document.querySelectorAll('.gate-tab')[0].classList.add('active');
    }
    document.getElementById('gateError').style.display = 'none';
}

function toggleMemberMenu() {
    var menu = document.getElementById('memberMenu');
    menu.classList.toggle('active');
}

function closeMemberMenu() {
    document.getElementById('memberMenu').classList.remove('active');
}

// Close member menu when clicking outside
document.addEventListener('click', function(e) {
    var wrap = document.getElementById('memberBadgeWrap');
    if (wrap && !wrap.contains(e.target)) {
        closeMemberMenu();
    }
});

function updateMemberUI() {
    var member = getMember();
    var badgeWrap = document.getElementById('memberBadgeWrap');
    var loginBtn = document.getElementById('memberLoginBtn');
    var displayName = document.getElementById('memberDisplayName');

    if (member) {
        if (badgeWrap) badgeWrap.style.display = 'block';
        if (loginBtn) loginBtn.style.display = 'none';
        if (displayName) displayName.textContent = member.name.split(' ')[0];
    } else {
        if (badgeWrap) badgeWrap.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'inline-flex';
    }
}

function updateOfferToolVisibility() {
    var lockOverlay = document.getElementById('offerLockOverlay');
    var toolContent = document.getElementById('offerToolContent');
    if (isMember()) {
        if (lockOverlay) lockOverlay.style.display = 'none';
        if (toolContent) toolContent.style.display = 'block';
    } else {
        if (lockOverlay) lockOverlay.style.display = 'block';
        if (toolContent) toolContent.style.display = 'none';
    }
}

function updateOfferStepIndicator(step) {
    var steps = document.querySelectorAll('#offerStepIndicator .offer-step');
    steps.forEach(function(s, i) {
        s.classList.remove('active', 'completed');
        if (i < step) s.classList.add('completed');
        else if (i === step) s.classList.add('active');
    });
}

// Initialize membership UI on load
document.addEventListener('DOMContentLoaded', function() {
    updateMemberUI();
    updateOfferToolVisibility();
});
