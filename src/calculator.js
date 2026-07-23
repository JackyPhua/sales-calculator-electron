function onSalespersonNameChange(index) {
    // Update card header display
    var sel = document.getElementById('name-' + index);
    var nm  = sel ? sel.value : '';
    var nd  = document.getElementById('card-name-display-' + index);
    var av  = document.getElementById('card-avatar-' + index);
    if (nd) nd.textContent = nm || '—';
    if (av) av.textContent = nm ? nm[0] : '?';
}

// ── SQLite DB helpers ──
async function dbSave(key, value) {
    try {
        if (window.electronAPI && window.electronAPI.dbSave)
            await window.electronAPI.dbSave(key, value);
    } catch(e) { console.warn('dbSave failed:', e); }
}
async function dbLoad(key) {
    try {
        if (window.electronAPI && window.electronAPI.dbLoad) {
            const r = await window.electronAPI.dbLoad(key);
            if (r && r.success) return r.value;
        }
    } catch(e) { console.warn('dbLoad failed:', e); }
    return null;
}


// Inject locked field styles
(function() {
    var s = document.createElement('style');
    s.id = 'quarterly-locked-style';
    s.textContent = 'input:disabled { background:#f1f5f9 !important; color:#64748b !important; cursor:not-allowed !important; opacity:1 !important; -webkit-text-fill-color:#64748b !important; pointer-events:none !important; }';
    document.head.appendChild(s);
})();

// ==================== Global State Management ====================

// Ensure appState exists
if (!window.appState) {
    window.appState = {
        salespeople: [],
        config: null,
        currentView: 'quick'
    };
}

// ==================== Employee Type Helpers ====================
function getEmployeeType(name) {
    if (!name) return 'Sales';
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_types) return 'Sales';
    var t = cfg.employee_types[name.toUpperCase()] || 'Sales';
    if (t === 'Support Staff') t = 'Support Staff';
    return t;
}
/** Role pill: Sales 浅青, Supervisor 浅蓝, Support Staff 浅黄 */
function getRoleBadgeStyle(empType) {
    var map = {
        Sales: { bg: '#ccfbf1', c: '#0f766e', icon: '💼' },
        Supervisor: { bg: '#dbeafe', c: '#1d4ed8', icon: '👔' },
        'Support Staff': { bg: '#fef9c3', c: '#854d0e', icon: '🛠️' }
    };
    return map[empType] || map.Sales;
}
/** Avatar + name strip on Calculation card — role colors */
function applyRoleColorsToCardHeader(cardIndex, personName) {
    var av = document.getElementById('card-avatar-' + cardIndex);
    var nm = document.getElementById('card-name-text-' + cardIndex);
    var hd = document.getElementById('card-name-display-' + cardIndex);
    if (!personName) {
        if (av) {
            av.style.background = '';
            av.style.color = '';
            av.style.removeProperty('background-image');
        }
        if (nm) nm.style.color = '';
        if (hd) {
            hd.style.borderLeft = '';
            hd.style.paddingLeft = '';
            hd.style.background = '';
        }
        return;
    }
    var tc = getRoleBadgeStyle(getEmployeeType(personName));
    if (av) {
        av.style.background = tc.bg;
        av.style.color = tc.c;
        av.style.setProperty('background-image', 'none');
    }
    if (nm) nm.style.color = tc.c;
    if (hd) {
        hd.style.borderLeft = '3px solid ' + tc.c;
        hd.style.paddingLeft = '11px';
        hd.style.background = 'linear-gradient(90deg,' + tc.bg + ' 0%,rgba(255,255,255,0) 72%)';
    }
}
function setEmployeeType(name, type) {
    if (!name || !type) return;
    var cfg = window.appState.config;
    if (!cfg.employee_types) cfg.employee_types = {};
    cfg.employee_types[name.toUpperCase()] = type;
    saveConfig();
}
function getTierAmt(tiers, pct) {
    if (!tiers || !tiers.length) return 0;
    var sorted = tiers.slice().sort(function(a,b){return b.min-a.min;});
    for (var i=0;i<sorted.length;i++) if (pct >= sorted[i].min) return sorted[i].amt||0;
    return 0;
}
window.getEmployeeType = getEmployeeType;
window.getRoleBadgeStyle = getRoleBadgeStyle;
window.applyRoleColorsToCardHeader = applyRoleColorsToCardHeader;
window.setEmployeeType = setEmployeeType;
window.getTierAmt = getTierAmt;

// ==================== EPF Third Schedule (KWSP) — Effective 1 Oct 2025 ====================
// EPF contributions follow the official Third Schedule. The applicable Part is
// resolved automatically from each employee's nationality status and age:
//   Part A  Malaysian citizen / PR, under 60      (employer 13%/12%, employee 11%)
//   Part C  PR / pre-1998 elector, age 60+        (employer 6.5%/6%, employee 5.5%)
//   Part E  Malaysian citizen, age 60+            (employer 4%, employee 0%)
//   Part F  Non-citizen (foreign worker)          (employer 2%, employee 2%)
function getEmployeeDOB(name) {
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_dob) return '';
    return cfg.employee_dob[(name || '').toUpperCase()] || '';
}
function setEmployeeDOB(name, val) {
    if (!name) return;
    var cfg = window.appState.config;
    if (!cfg.employee_dob) cfg.employee_dob = {};
    cfg.employee_dob[name.toUpperCase()] = val || '';
}
function getEmployeeNationality(name) {
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_nationality) return 'CITIZEN';
    return cfg.employee_nationality[(name || '').toUpperCase()] || 'CITIZEN';
}
function setEmployeeNationality(name, val) {
    if (!name) return;
    var cfg = window.appState.config;
    if (!cfg.employee_nationality) cfg.employee_nationality = {};
    cfg.employee_nationality[name.toUpperCase()] = val || 'CITIZEN';
}

function getEmployeeProfile(name) {
    var cfg = window.appState && window.appState.config;
    var nu = (name || '').toUpperCase();
    if (!cfg || !cfg.employee_profiles) return { mykad: '', epfNo: '', bankAccount: '' };
    var p = cfg.employee_profiles[nu] || {};
    return {
        mykad: p.mykad || '',
        epfNo: p.epfNo || '',
        bankAccount: p.bankAccount || ''
    };
}

function setEmployeeProfile(name, data) {
    if (!name) return;
    var cfg = window.appState.config;
    if (!cfg.employee_profiles) cfg.employee_profiles = {};
    var nu = name.toUpperCase();
    var cur = cfg.employee_profiles[nu] || {};
    cfg.employee_profiles[nu] = Object.assign({}, cur, data || {});
}
window.getEmployeeProfile = getEmployeeProfile;
window.setEmployeeProfile = setEmployeeProfile;

// Age in whole years as at the 1st of the given report month.
function epfAgeAtMonth(dob, bareM, year) {
    if (!dob) return null;
    var mm = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(dob);
    if (!mm) return null;
    var by = parseInt(mm[1], 10), bm = parseInt(mm[2], 10), bd = parseInt(mm[3] || '1', 10);
    var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var mi = MONTHS.indexOf((bareM || '').toUpperCase());
    var refY = parseInt(year, 10) || new Date().getFullYear();
    var refM = (mi >= 0 ? mi : new Date().getMonth()) + 1;
    var age = refY - by;
    if (refM < bm || (refM === bm && bd > 1)) age--;
    return age;
}

function resolveEpfPart(name, bareM, year) {
    var nat = getEmployeeNationality(name);
    var age = epfAgeAtMonth(getEmployeeDOB(name), bareM, year);
    var is60 = (age != null && age >= 60);
    if (nat === 'FOREIGNER') return 'F';
    if (nat === 'PR') return is60 ? 'C' : 'A';
    return is60 ? 'E' : 'A'; // CITIZEN (default)
}

// Round up to the next ringgit (statutory rounding), float-safe.
function _epfCeil(x) { return Math.ceil(x - 1e-6); }

// Statutory employee/employer contribution for given gross wages + Part.
function epfScheduleAmount(wages, part) {
    wages = parseFloat(wages) || 0;
    if (wages <= 0) return { employee: 0, employer: 0 };
    var erLow, eeLow, erHigh, eeHigh;
    switch (part) {
        case 'C': erLow = 0.065; eeLow = 0.055; erHigh = 0.06; eeHigh = 0.055; break;
        case 'E': erLow = 0.04;  eeLow = 0;     erHigh = 0.04; eeHigh = 0;     break;
        case 'F': return { employee: _epfCeil(wages * 0.02), employer: _epfCeil(wages * 0.02) };
        case 'A':
        default:  erLow = 0.13;  eeLow = 0.11;  erHigh = 0.12; eeHigh = 0.11;  break;
    }
    if (wages <= 10) return { employee: 0, employer: 0 };
    var ceiling, er, ee;
    if (wages <= 5000) {
        ceiling = Math.ceil(wages / 20) * 20;
        er = _epfCeil(ceiling * erLow);  ee = _epfCeil(ceiling * eeLow);
    } else if (wages <= 20000) {
        ceiling = Math.ceil(wages / 100) * 100;
        er = _epfCeil(ceiling * erHigh); ee = _epfCeil(ceiling * eeHigh);
    } else {
        er = _epfCeil(wages * erHigh);   ee = _epfCeil(wages * eeHigh);
    }
    return { employee: ee, employer: er };
}

// Main entry: compute EPF for a person/month from gross wages.
function computeEpf(name, wages, bareM, year) {
    var part = resolveEpfPart(name, bareM, year);
    var amt = epfScheduleAmount(wages, part);
    var w = parseFloat(wages) || 0;
    return {
        employee: amt.employee,
        employer: amt.employer,
        part: part,
        empPct: w > 0 ? amt.employee / w * 100 : 0,
        erPct:  w > 0 ? amt.employer / w * 100 : 0
    };
}
window.getEmployeeDOB = getEmployeeDOB;
window.setEmployeeDOB = setEmployeeDOB;
window.getEmployeeNationality = getEmployeeNationality;
window.setEmployeeNationality = setEmployeeNationality;
window.epfAgeAtMonth = epfAgeAtMonth;
window.resolveEpfPart = resolveEpfPart;
window.epfScheduleAmount = epfScheduleAmount;
window.computeEpf = computeEpf;

// ==================== EIS / SIP (Employment Insurance System, Act 800) ====================
// Second Schedule: employee 0.2% + employer 0.2%, charged on the MID-POINT of each
// RM100 wage band, capped at RM6,000 monthly wages (max RM11.90 per side).
// Exempt: employees aged 60+ and non-citizens (foreign workers).
function eisScheduleAmount(wages) {
    var w = Math.min(parseFloat(wages) || 0, 6000);
    if (w <= 0) return 0;
    // Band = (X00.01 .. (X+1)00); the schedule charges 0.2% of the band mid-point.
    var midpoint = (Math.ceil(w / 100) * 100) - 50;
    return Math.round(midpoint * 0.002 * 100) / 100;
}
function computeEis(name, wages, bareM, year) {
    var nat = getEmployeeNationality(name);
    if (nat === 'FOREIGNER') return { employee: 0, employer: 0, exempt: true };
    var age = epfAgeAtMonth(getEmployeeDOB(name), bareM, year);
    if (age != null && age >= 60) return { employee: 0, employer: 0, exempt: true };
    var amt = eisScheduleAmount(wages);
    return { employee: amt, employer: amt, exempt: false };
}
window.eisScheduleAmount = eisScheduleAmount;
window.computeEis = computeEis;

// ==================== SOCSO / PERKESO (Act 4, First Schedule) ====================
// Charged on the MID-POINT of each RM100 wage band, capped at RM6,000.
//   Category 1 (under 60, local/PR): employer 1.75%, employee 0.5%
//   Category 2 (age 60+, or foreign workers): employer 1.25%, employee 0%
// Amounts are rounded to the nearest 5 sen.
function _socsoRound5(x) { return Math.round(x * 20 + 1e-9) / 20; }
function socsoCategory(name, bareM, year) {
    var age = epfAgeAtMonth(getEmployeeDOB(name), bareM, year);
    if (age != null && age >= 60) return 2;
    if (getEmployeeNationality(name) === 'FOREIGNER') return 2;
    return 1;
}
function computeSocso(name, wages, bareM, year) {
    var cat = socsoCategory(name, bareM, year);
    var w = Math.min(parseFloat(wages) || 0, 6000);
    if (w <= 0) return { employee: 0, employer: 0, cat: cat };
    var mid = (Math.ceil(w / 100) * 100) - 50;
    var employer = _socsoRound5(mid * (cat === 1 ? 0.0175 : 0.0125));
    var employee = cat === 1 ? _socsoRound5(mid * 0.005) : 0;
    return { employee: employee, employer: employer, cat: cat };
}
window.socsoCategory = socsoCategory;
window.computeSocso = computeSocso;

// ==================== Company Helpers ====================
function getEmployeeCompany(name) {
    if (!name) return '';
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_companies) return '';
    return cfg.employee_companies[name.toUpperCase()] || '';
}
function setEmployeeCompany(name, company) {
    if (!name) return;
    var cfg = window.appState.config;
    if (!cfg.employee_companies) cfg.employee_companies = {};
    cfg.employee_companies[name.toUpperCase()] = company;
    saveConfig();
}
function addCompany() {
    var inp = document.getElementById('new-company-name');
    if (!inp) return;
    var name = inp.value.trim();
    if (!name) return;
    var cfg = window.appState.config;
    if (!cfg.companies) cfg.companies = [];
    if (cfg.companies.indexOf(name) !== -1) { showToast('⚠️', name + ' already exists'); return; }
    cfg.companies.push(name);
    inp.value = '';
    saveConfig();
    renderCompanyList();
    renderPeopleList();

    showToast('✅', name + ' added');
}
function removeCompany(name) {
    var cfg = window.appState.config;
    if (!cfg.companies) return;
    cfg.companies = cfg.companies.filter(function(c) { return c !== name; });
    // Remove company assignment from employees
    if (cfg.employee_companies) {
        Object.keys(cfg.employee_companies).forEach(function(k) {
            if (cfg.employee_companies[k] === name) delete cfg.employee_companies[k];
        });
    }
    saveConfig();
    renderCompanyList();
    renderPeopleList();

    showToast('✅', name + ' removed');
}
function renderCompanyList() {
    var el = document.getElementById('company-list');
    if (!el) return;
    var cfg = window.appState.config;
    var companies = cfg.companies || [];
    if (companies.length === 0) {
        el.innerHTML = '<div class="set-sub" style="padding:8px 0;margin:0;">No companies yet. Add one below.</div>';
        return;
    }
    el.innerHTML = companies.map(function(c) {
        var count = Object.keys(cfg.employee_companies || {}).filter(function(k) { return cfg.employee_companies[k] === c; }).length;
        return '<div class="company-row">'
            + '<div><span style="font-size:13px;font-weight:700;color:var(--ink);">🏢 ' + c + '</span>'
            + '<span style="font-size:10px;color:var(--ink4);margin-left:8px;">' + count + ' employees</span></div>'
            + '<button onclick="removeCompany(\'' + c.replace(/'/g, "\\'") + '\')" class="pi-btn pi-btn--del" style="padding:4px 8px;width:auto;">✕</button>'
            + '</div>';
    }).join('');
}
window.getEmployeeCompany = getEmployeeCompany;
window.setEmployeeCompany = setEmployeeCompany;
window.addCompany = addCompany;
window.removeCompany = removeCompany;
window.renderCompanyList = renderCompanyList;

// ==================== License System ====================
window.licenseStatus = { status: 'loading' };

async function checkLicenseStatus() {
    try {
        const status = await window.electronAPI.getLicenseStatus();
        window.licenseStatus = status;
        updateLicenseBadge();
        console.log('🔑 License:', status.status, status.message);
        return status;
    } catch (e) {
        console.error('License check error:', e);
        window.licenseStatus = { status: 'trial', daysRemaining: 14 };
        return window.licenseStatus;
    }
}

function isPro() {
    return window.licenseStatus && window.licenseStatus.status === 'pro';
}

function isTrialActive() {
    return window.licenseStatus && window.licenseStatus.status === 'trial' 
        && window.licenseStatus.daysRemaining > 0 
        && window.licenseStatus.exportsRemaining > 0;
}

function canUseProFeature() {
    return isPro() || isTrialActive();
}

function requirePro(featureName) {
    if (canUseProFeature()) return true;
    showLicenseModal(featureName);
    return false;
}

function updateLicenseBadge() {
    const badge = document.getElementById('license-badge');
    if (!badge) return;

    if (isPro()) {
        badge.innerHTML = '🔑 <span style="color:#10b981;font-weight:600;">PRO</span>';
        badge.title = 'Pro License activated';
        badge.style.cursor = 'pointer';
        badge.onclick = () => showLicenseInfoModal();
    } else if (isTrialActive()) {
        const days = window.licenseStatus.daysRemaining;
        const exports = window.licenseStatus.exportsRemaining;
        badge.innerHTML = `⏳ <span style="color:#f59e0b;font-weight:600;">TRIAL — ${days}d / ${exports} exports</span>`;
        badge.title = `${days} days, ${exports} exports remaining. Click to activate license.`;
        badge.style.cursor = 'pointer';
        badge.onclick = () => showLicenseModal();
    } else {
        badge.innerHTML = '🔒 <span style="color:#ef4444;font-weight:600;">EXPIRED</span>';
        badge.title = 'Trial expired. Click to activate license.';
        badge.style.cursor = 'pointer';
        badge.onclick = () => showLicenseModal();
    }
}

function showLicenseModal(featureName) {
    const existing = document.getElementById('license-modal');
    if (existing) existing.remove();

    const expiredMsg = featureName
        ? `<p style="color:#f59e0b;font-size:13px;margin:0 0 16px;">⚠️ "${featureName}" requires a Pro license.</p>`
        : '';

    const modal = document.createElement('div');
    modal.id = 'license-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:0;max-width:440px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#1e3a5f,#0f172a);padding:24px 28px;color:white;">
                <h3 style="margin:0;font-size:20px;font-weight:700;">🔑 Activate SalesPro</h3>
                <p style="margin:6px 0 0;font-size:13px;opacity:0.8;">Enter your license key to unlock all features</p>
            </div>
            <div style="padding:24px 28px;">
                ${expiredMsg}
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">License Key</label>
                    <input type="text" id="license-key-input" 
                           placeholder="CPRO-XXXX-XXXX-XXXX-XXXX"
                           style="width:100%;padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:'Sora',sans-serif;letter-spacing:1px;text-transform:uppercase;outline:none;transition:border 0.2s;"
                           onfocus="this.style.borderColor='#3b82f6'"
                           onblur="this.style.borderColor='#e5e7eb'"
                           maxlength="24">
                </div>
                <div id="license-error" style="display:none;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;margin-bottom:12px;"></div>
                <div id="license-success" style="display:none;padding:8px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#16a34a;font-size:13px;margin-bottom:12px;"></div>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="closeLicenseModal()" 
                            style="padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">
                        Cancel
                    </button>
                    <button onclick="submitLicenseKey()" id="license-submit-btn"
                            style="padding:10px 24px;border:none;border-radius:8px;background:#1e3a5f;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">
                        Activate
                    </button>
                </div>
                <div style="margin-top:16px;padding-top:16px;border-top:1px solid #f3f4f6;text-align:center;">
                    <a href="https://commissionpro.app" target="_blank" style="font-size:12px;color:#6b7280;text-decoration:none;">
                        Don't have a key? <span style="color:#3b82f6;font-weight:600;">Buy License →</span>
                    </a>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeLicenseModal(); });

    // Auto-format key input
    const input = document.getElementById('license-key-input');
    input.addEventListener('input', function() {
        let val = this.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (val.length > 20) val = val.substring(0, 20);
        // Insert dashes: CPRO-XXXX-XXXX-XXXX-XXXX
        let formatted = '';
        for (let i = 0; i < val.length; i++) {
            if (i === 4 || i === 8 || i === 12 || i === 16) formatted += '-';
            formatted += val[i];
        }
        this.value = formatted;
    });

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') submitLicenseKey();
    });

    setTimeout(() => input.focus(), 100);
}

function closeLicenseModal() {
    const modal = document.getElementById('license-modal');
    if (modal) modal.remove();
}

async function submitLicenseKey() {
    const input = document.getElementById('license-key-input');
    const errorEl = document.getElementById('license-error');
    const successEl = document.getElementById('license-success');
    const btn = document.getElementById('license-submit-btn');

    const key = input.value.trim();
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    if (!key) {
        errorEl.textContent = 'Please enter a license key';
        errorEl.style.display = 'block';
        return;
    }

    btn.textContent = 'Verifying...';
    btn.disabled = true;

    try {
        const result = await window.electronAPI.activateLicense(key);
        if (result.success) {
            successEl.textContent = '✅ License activated successfully! Enjoy SalesPro Pro.';
            successEl.style.display = 'block';
            errorEl.style.display = 'none';
            window.licenseStatus = { status: 'pro', key: result.key };
            updateLicenseBadge();
            setTimeout(closeLicenseModal, 1500);
        } else {
            errorEl.textContent = '❌ ' + (result.error || 'Invalid license key');
            errorEl.style.display = 'block';
        }
    } catch (e) {
        errorEl.textContent = '❌ Error: ' + e.message;
        errorEl.style.display = 'block';
    }

    btn.textContent = 'Activate';
    btn.disabled = false;
}

function showLicenseInfoModal() {
    const existing = document.getElementById('license-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'license-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:0;max-width:400px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">
            <div style="background:linear-gradient(135deg,#065f46,#064e3b);padding:24px 28px;color:white;">
                <h3 style="margin:0;font-size:20px;font-weight:700;">✅ Pro License Active</h3>
            </div>
            <div style="padding:24px 28px;">
                <div style="padding:12px;background:#f0fdf4;border-radius:10px;margin-bottom:16px;">
                    <p style="margin:0;font-size:12px;color:#6b7280;">License Key</p>
                    <p style="margin:4px 0 0;font-size:14px;font-family:'Sora',sans-serif;font-weight:600;color:#111827;letter-spacing:1px;">${window.licenseStatus.key || 'N/A'}</p>
                </div>
                <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">All Pro features are unlocked. Thank you for your purchase!</p>
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="deactivateAndClose()" 
                            style="padding:8px 16px;border:1px solid #fecaca;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;color:#dc2626;">
                        Deactivate
                    </button>
                    <button onclick="closeLicenseModal()" 
                            style="padding:8px 20px;border:none;border-radius:8px;background:#065f46;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeLicenseModal(); });
}

async function deactivateAndClose() {
    if (confirm('Are you sure you want to deactivate your license?')) {
        await window.electronAPI.deactivateLicense();
        await checkLicenseStatus();
        closeLicenseModal();
        showToast('ℹ️', 'License deactivated');
    }
}

// Export license functions
window.checkLicenseStatus = checkLicenseStatus;
window.isPro = isPro;
window.canUseProFeature = canUseProFeature;
window.requirePro = requirePro;
window.showLicenseModal = showLicenseModal;
window.closeLicenseModal = closeLicenseModal;
window.submitLicenseKey = submitLicenseKey;
window.showLicenseInfoModal = showLicenseInfoModal;
window.deactivateAndClose = deactivateAndClose;

// Initialize application
async function initApp() {
    console.log('🚀 Initializing application...');
    
    try {
        // Check license status first
        await checkLicenseStatus();
        
        // Load configuration
        await loadConfig();
        fixSalaryHistory();
        migrateReportHistory();

        
        // Initialize current view
        switchView('quick');
        
        // Initialize backup system
        initBackupSystem();
        
        console.log('✅ Application initialization completed');
    } catch (error) {
        console.error('Initialization failed:', error);
        // Use default configuration
        window.appState.config = getDefaultConfig();
        switchView('quick');
    }
}

// Helper: get current month-year key like "JAN-2026"
function getCurrentMonthKey() {
    var m = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var y = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    return m ? m + '-' + y : '';
}

// Helper: build month key from month name and optional year
function buildMonthKey(month, year) {
    var m = (month||'').toUpperCase().replace(/-\d{4}$/, ''); // strip any existing year suffix
    var y = year || ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    return m ? m + '-' + y : '';
}

// Helper: extract bare month from a key like "JAN-2026" → "JAN"
function bareMonth(key) {
    return (key||'').toUpperCase().replace(/-\d{4}$/, '');
}

// Helper: extract year from a key like "JAN-2026" → 2026, or null
function keyYear(key) {
    var m = (key||'').match(/-(\d{4})$/);
    return m ? parseInt(m[1]) : null;
}

// Helper: find reportHistory entry for a given bare month and year
// Supports both "JAN-2026" and legacy "JAN" formats
function findHistEntry(history, bareM, year) {
    var yearKey = bareM.toUpperCase() + '-' + (year || String(new Date().getFullYear()));
    return history.find(function(r){ return (r.month||'').toUpperCase() === yearKey; })
        || history.find(function(r){ return (r.month||'').toUpperCase() === bareM.toUpperCase(); });
}

// ==================== Employee Start (Join) Month ====================
var _MONTH_ORDER_SY = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/** Convert a bare month + year into a comparable "YYYY-MM" string. */
function monthYearToYM(bareM, year) {
    var idx = _MONTH_ORDER_SY.indexOf((bareM || '').toUpperCase());
    if (idx < 0) idx = 0;
    var y = parseInt(year, 10) || new Date().getFullYear();
    return y + '-' + String(idx + 1).padStart(2, '0');
}

// Accepts "YYYY-MM" (legacy) or "YYYY-MM-DD" (with day). Returns the value as stored, or null.
var _DATE_OR_MONTH_RE = /^\d{4}-\d{2}(-\d{2})?$/;

function lookupEmployeeDateMap(map, name) {
    if (!map) return null;
    var nu = (name || '').toUpperCase();
    var ym = map[nu];
    if (ym && _DATE_OR_MONTH_RE.test(ym)) return ym;
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].toUpperCase() === nu) {
            ym = map[keys[i]];
            if (ym && _DATE_OR_MONTH_RE.test(ym)) return ym;
        }
    }
    return null;
}

/** A person's configured start (join) date "YYYY-MM-DD" (or legacy "YYYY-MM"), or null if not set. */
function getEmployeeStartYM(name) {
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_start_month) return null;
    return lookupEmployeeDateMap(cfg.employee_start_month, name);
}

function setEmployeeStartYM(name, ym) {
    var cfg = window.appState.config;
    if (!cfg.employee_start_month) cfg.employee_start_month = {};
    var nu = (name || '').toUpperCase();
    if (ym && _DATE_OR_MONTH_RE.test(ym)) cfg.employee_start_month[nu] = ym;
    else delete cfg.employee_start_month[nu];
}

/** A person's configured end (resign) date "YYYY-MM-DD" (or legacy "YYYY-MM"), or null if not set. */
function getEmployeeEndYM(name) {
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_end_month) return null;
    return lookupEmployeeDateMap(cfg.employee_end_month, name);
}

function setEmployeeEndYM(name, ym) {
    var cfg = window.appState.config;
    if (!cfg.employee_end_month) cfg.employee_end_month = {};
    var nu = (name || '').toUpperCase();
    if (ym && _DATE_OR_MONTH_RE.test(ym)) cfg.employee_end_month[nu] = ym;
    else delete cfg.employee_end_month[nu];
}

/** Last payroll month (YYYY-MM, inclusive) derived from resign / inactive date.
 *  "Inactive from" is the first day OFF payroll → last paid month is the calendar month before that date. */
function getLastPayrollMonthYM(name) {
    var endYM = getEmployeeEndYM(name);
    if (!endYM) return null;
    var parts = endYM.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!parts) return endYM.slice(0, 7);
    var y = parseInt(parts[1], 10);
    var mo = parseInt(parts[2], 10);
    var day = parts[3] ? parseInt(parts[3], 10) : new Date(y, mo, 0).getDate();
    var d = new Date(y, mo - 1, day);
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** True if name appears in a reportHistory snapshot for bareM + year. */
function personInHistMonth(name, bareM, year) {
    var cfg = window.appState && window.appState.config;
    var history = cfg && cfg.reportHistory;
    if (!history || !history.length) return false;
    var hEntry = findHistEntry(history, bareM, year);
    if (!hEntry || !hEntry.data) return false;
    var nu = (name || '').toUpperCase();
    return hEntry.data.some(function(d) { return ((d.name || '') + '').toUpperCase() === nu; });
}

/** True if the person was employed in the given report month (bareM + year). */
function isEmployeeActiveInMonth(name, bareM, year) {
    var ym = monthYearToYM(bareM, year);
    var startYM = getEmployeeStartYM(name);
    if (startYM && ym < startYM.slice(0, 7)) return false;
    var lastPayYM = getLastPayrollMonthYM(name);
    var endYM = getEmployeeEndYM(name);
    var inactive = typeof isEmployeeActive === 'function' && !isEmployeeActive(name);
    if (inactive && !endYM) {
        // No resign date on file → only include months that still have saved history for this person.
        return personInHistMonth(name, bareM, year);
    }
    if (lastPayYM && ym > lastPayYM) return false;
    return true;
}

/** Roster active/inactive flag (default active). Inactive = resigned/hidden from daily entry. */
function isEmployeeActive(name) {
    var cfg = window.appState && window.appState.config;
    if (!cfg || !cfg.employee_active) return true; // default active
    var nu = (name || '').toUpperCase();
    if (cfg.employee_active[nu] === false) return false;
    var keys = Object.keys(cfg.employee_active);
    for (var i = 0; i < keys.length; i++) {
        if (keys[i].toUpperCase() === nu && cfg.employee_active[keys[i]] === false) return false;
    }
    return true;
}

function setEmployeeActive(name, active) {
    var cfg = window.appState.config;
    if (!cfg.employee_active) cfg.employee_active = {};
    var nu = (name || '').toUpperCase();
    if (active) {
        delete cfg.employee_active[nu]; // active is default → keep config lean
        setEmployeeEndYM(nu, ''); // reactivating clears the resign month so they fully return
    } else {
        cfg.employee_active[nu] = false;
        // When marking inactive, stamp the resign (end) month to current month if not already set,
        // so Records / Annual stop showing them after this month while keeping past history.
        if (!getEmployeeEndYM(nu)) {
            var now = new Date();
            setEmployeeEndYM(nu, now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'));
        }
    }
}

window.getEmployeeStartYM = getEmployeeStartYM;
window.setEmployeeStartYM = setEmployeeStartYM;
window.getEmployeeEndYM = getEmployeeEndYM;
window.setEmployeeEndYM = setEmployeeEndYM;
window.getLastPayrollMonthYM = getLastPayrollMonthYM;
window.personInHistMonth = personInHistMonth;
window.isEmployeeActiveInMonth = isEmployeeActiveInMonth;
window.isEmployeeActive = isEmployeeActive;
window.setEmployeeActive = setEmployeeActive;
window.monthYearToYM = monthYearToYM;

/** Months in the calendar quarter that contains bareM (e.g. APR → APR,MAY,JUN) */
function quarterMonthsForBareMonth(bareM) {
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var i = months.indexOf((bareM || '').toUpperCase());
    if (i < 0) return null;
    var s = Math.floor(i / 3) * 3;
    return [months[s], months[s + 1], months[s + 2]];
}

/** Only MAR/JUN/SEP/DEC — end of each 3-month period — show cumulative Quarterly Target/Sales */
function isQuarterEndMonthForRollup(bareM) {
    var m = (bareM || '').toUpperCase();
    return m === 'MAR' || m === 'JUN' || m === 'SEP' || m === 'DEC';
}

// Helper: filter reportHistory entries for a given year
function filterHistByYear(history, year) {
    var yr = String(year || new Date().getFullYear());
    return (history||[]).filter(function(r) {
        var m = (r.month||'').toUpperCase();
        // Match "JAN-2026" for specific year, or legacy "JAN" (no year suffix) 
        return m.endsWith('-' + yr) || !/\-\d{4}$/.test(m);
    });
}

// Migrate old reportHistory entries from "JAN" to "JAN-2026" format
function migrateReportHistory() {
    var hist = window.appState.config.reportHistory;
    if (!hist || !Array.isArray(hist)) return;
    var curYear = String(new Date().getFullYear());
    var migrated = false;
    hist.forEach(function(entry) {
        if (entry.month && !/\-\d{4}$/.test(entry.month)) {
            entry.month = entry.month.toUpperCase() + '-' + curYear;
            migrated = true;
        }
    });
    if (migrated) {
        console.log('🔄 Migrated reportHistory to year-keyed format');
        // Merge duplicates that might have appeared
        var merged = {};
        hist.forEach(function(entry) {
            var key = (entry.month||'').toUpperCase();
            if (!merged[key]) {
                merged[key] = { month: key, data: (entry.data||[]).slice() };
            } else {
                // merge data arrays
                (entry.data||[]).forEach(function(d) {
                    var existing = merged[key].data.findIndex(function(x){ return (x.name||'').toUpperCase() === (d.name||'').toUpperCase(); });
                    if (existing >= 0) merged[key].data[existing] = d;
                    else merged[key].data.push(d);
                });
            }
        });
        window.appState.config.reportHistory = Object.values(merged);
        saveConfig().catch(function(){});
        dbSave('reportHistory', window.appState.config.reportHistory).catch(function(){});
    }
}

// Load configuration
async function loadConfig() {
    try {
        if (window.electronAPI && window.electronAPI.loadConfig) {
            const config = await window.electronAPI.loadConfig();
            window.appState.config = config || getDefaultConfig();
        } else {
            window.appState.config = getDefaultConfig();
        }
        
        // Ensure all necessary configuration items exist
        ensureConfigStructure();
        
        console.log('📂 Configuration loaded');
    } catch (error) {
        console.error('Failed to load configuration:', error);
        window.appState.config = getDefaultConfig();
    }
}

// Ensure configuration structure is complete
function ensureConfigStructure() {
    const config = window.appState.config;
    
    // Ensure all necessary objects exist
    const requiredStructures = [
        'base_salaries',
        'allowances', 
        'deductions',
        'deductionRates',
        'employer_epf_rates',
        'employee_types',
        'employee_start_month',
        'employee_end_month',
        'employee_active',
        'employee_dob',
        'employee_nationality',
        'employee_profiles',
        'companies',
        'employee_companies',
        'supervisor_sale_tiers',
        'supervisor_coll_tiers',
        'supervisor_call_tiers',
        'supervisor_qtr_tiers',
        'person_supervisor_sale_tiers',
        'person_supervisor_coll_tiers',
        'person_supervisor_call_tiers',
        'person_supervisor_qtr_tiers',
        'person_merchandiser_rates',
        'merchandiser_block_rate',
        'earnings',
        'active_call_targets',
        'reportHistory',
        'monthly_commission_rates',
        'quarterly_incentive',
        'collection_incentive',
        'active_call_incentive'
    ];
    
    requiredStructures.forEach(key => {
        if (!config[key]) {
            if (key.includes('_rates') || key.includes('incentive') || key.includes('_tiers')) {
                config[key] = getDefaultConfig()[key];
            } else if (key === 'merchandiser_block_rate') {
                config[key] = 10;
            } else if (key === 'companies') {
                config[key] = [];
            } else if (key === 'reportHistory') {
                config[key] = [];
            } else {
                config[key] = {};
            }
        }
    });

    // Migration: ensure companies is an array
    if (!Array.isArray(config.companies)) config.companies = [];
    if (!Array.isArray(config.reportHistory)) config.reportHistory = [];

    // Migration: ensure supervisor tiers are arrays (old configs may have them as {})
    ['supervisor_sale_tiers', 'supervisor_coll_tiers', 'supervisor_call_tiers', 'supervisor_qtr_tiers'].forEach(function(k) {
        if (!Array.isArray(config[k])) {
            config[k] = getDefaultConfig()[k];
        }
    });

    // Migration: force scalar config values to correct types
    if (typeof config.merchandiser_block_rate !== 'number') {
        var bv = Number(config.merchandiser_block_rate);
        config.merchandiser_block_rate = isNaN(bv) || !bv ? 10 : bv;
    }
    
    // Restore quickCalculateData if present (persists across restarts)
}

// Default configuration
function getDefaultConfig() {
    return {
        base_salaries: {},
        allowances: {},
        deductions: {},
        deductionRates: {},
        employer_epf_rates: {},
        employee_types: {},
        employee_start_month: {},
        employee_end_month: {},
        employee_active: {},
        employee_dob: {},
        employee_nationality: {},
        employee_profiles: {},
        companies: [],
        employee_companies: {},
        supervisor_sale_tiers: [
            { min: 80, max: 89.99, amt: 500 },
            { min: 90, max: 99.99, amt: 800 },
            { min: 100, max: 105.99, amt: 1200 },
            { min: 106, max: 999, amt: 1500 }
        ],
        supervisor_coll_tiers: [
            { min: 80, max: 89.99, amt: 200 },
            { min: 90, max: 99.99, amt: 400 },
            { min: 100, max: 999, amt: 600 }
        ],
        supervisor_call_tiers: [
            { min: 75, max: 89.99, amt: 100 },
            { min: 90, max: 99.99, amt: 200 },
            { min: 100, max: 999, amt: 300 }
        ],
        supervisor_qtr_tiers: [
            { min: 90, max: 99.99, amt: 300 },
            { min: 100, max: 105.99, amt: 500 },
            { min: 106, max: 999, amt: 800 }
        ],
        merchandiser_block_rate: 10,
        earnings: {},
        active_call_targets: {},
        reportHistory: [],
        monthly_commission_rates: [
            { min: 0, max: 79.99, rate: 0, label: '0%-79%' },
            { min: 80, max: 89.99, rate: 0.006, label: '80%-89%' },
            { min: 90, max: 99.99, rate: 0.007, label: '90%-99%' },
            { min: 100, max: 105.99, rate: 0.008, label: '100%-105%' },
            { min: 106, max: 999, rate: 0.01, label: '106%+' }
        ],
        quarterly_incentive: [
            { min: 100, incentive: 400, label: '100%+' },
            { min: 90, incentive: 200, label: '90%-99%' },
            { min: 0, incentive: 0, label: '<90%' }
        ],
        collection_incentive: [
            { min: 100, incentive: 300, label: '100%+' },
            { min: 90, incentive: 150, label: '90%-99%' },
            { min: 0, incentive: 0, label: '<90%' }
        ],
        active_call_incentive: [
            { min: 100, incentive: 200, label: '100%+' },
            { min: 90, incentive: 100, label: '90%-99%' },
            { min: 0, incentive: 0, label: '<90%' }
        ]
    };
}

// Toast notification
function showToast(icon, message, duration = 3000) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = '<span style="font-size:20px;line-height:1;">' + icon + '</span><span>' + message + '</span>';
    container.appendChild(toast);
    setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity .3s';
        setTimeout(function() { toast.remove(); }, 300);
    }, duration);
}

// View switching
function syncWindowFitForView(view) {
    if (!window.electronAPI || typeof window.electronAPI.applyWindowFit !== 'function') return;
    window.electronAPI.applyWindowFit('fit').catch(function() {});
}

function switchView(view) {
    document.querySelectorAll('.tab-button').forEach(function(btn) {
        btn.classList.remove('active');
    });
    var tabBtn = document.getElementById('tab-' + view);
    if (tabBtn) tabBtn.classList.add('active');
    document.querySelectorAll('.view-container').forEach(function(v) {
        v.style.display = 'none';
        v.classList.remove('active');
        v.classList.add('hidden');
    });
    var viewEl = document.getElementById('view-' + view);
    if (viewEl) {
        viewEl.style.display = (view === 'quick') ? 'flex' : 'block';
        viewEl.classList.add('active');
        viewEl.classList.remove('hidden');
    }
    window.appState.currentView = view;
    if (view === 'dashboard') {
        if (typeof renderDashboard === 'function') renderDashboard();
    } else if (view === 'people') {
        if (typeof renderPeopleList === 'function') renderPeopleList();
    } else if (view === 'quick') {
        if (typeof initQuickCalculate === 'function') initQuickCalculate();
        if (typeof renderPersonSidebar === 'function') renderPersonSidebar();
    } else if (view === 'history') {
        if (typeof loadQuickCalculateHistory === 'function') loadQuickCalculateHistory();
    } else if (view === 'annual') {
        if (!window._annualUnlocked) {
            if (viewEl) { viewEl.style.display = 'none'; }
            var overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
            var box = document.createElement('div');
            box.style.cssText = 'background:var(--paper,#fff);border-radius:16px;max-width:380px;width:100%;padding:28px;box-shadow:0 20px 60px rgba(8,15,26,.3);text-align:center;';
            box.innerHTML = '<div style="font-size:36px;margin-bottom:12px;">🔒</div>'
                + '<div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px;">Annual Report</div>'
                + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Enter password to access</div>'
                + '<input id="annual-pw-input" type="password" placeholder="Password" style="width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:Sora,sans-serif;outline:none;box-sizing:border-box;text-align:center;margin-bottom:8px;">'
                + '<div id="annual-pw-err" style="font-size:12px;color:#dc2626;margin-bottom:12px;min-height:18px;"></div>';
            var btnRow = document.createElement('div');
            btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
            var btnCancel = document.createElement('button');
            btnCancel.textContent = 'Cancel';
            btnCancel.style.cssText = 'padding:9px 24px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;';
            var btnUnlock = document.createElement('button');
            btnUnlock.textContent = '🔓 Unlock';
            btnUnlock.style.cssText = 'padding:6px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;';
            btnRow.appendChild(btnCancel);
            btnRow.appendChild(btnUnlock);
            box.appendChild(btnRow);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            setTimeout(function(){ var inp = document.getElementById('annual-pw-input'); if(inp) inp.focus(); }, 100);
            var annualPw = (window.appState.config && window.appState.config.annual_password) || 'boss123';
            function tryUnlock() {
                var inp = document.getElementById('annual-pw-input');
                var err = document.getElementById('annual-pw-err');
                if (inp && inp.value === annualPw) {
                    window._annualUnlocked = true;
                    overlay.remove();
                    switchView('annual');
                } else {
                    if (err) err.textContent = '❌ Wrong password';
                    if (inp) { inp.value = ''; inp.focus(); }
                }
            }
            btnUnlock.addEventListener('click', tryUnlock);
            var pwInput = document.getElementById('annual-pw-input');
            if (pwInput) pwInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') tryUnlock(); });
            btnCancel.addEventListener('click', function() { overlay.remove(); switchView('quick'); });
            return;
        }
        if (typeof switchAnnualView === 'function') switchAnnualView(_annualActiveView || 'report');
        else if (typeof renderAnnualReport === 'function') renderAnnualReport();
    } else if (view === 'settings') {
        if (!window._settingsUnlocked) {
            if (viewEl) { viewEl.style.display = 'none'; }
            var overlayS = document.createElement('div');
            overlayS.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
            var boxS = document.createElement('div');
            boxS.style.cssText = 'background:var(--paper,#fff);border-radius:16px;max-width:380px;width:100%;padding:28px;box-shadow:0 20px 60px rgba(8,15,26,.3);text-align:center;';
            boxS.innerHTML = '<div style="font-size:36px;margin-bottom:12px;">\ud83d\udd12</div>'
                + '<div style="font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px;">Settings</div>'
                + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">Enter password to access (same as Annual Report)</div>'
                + '<input id="settings-pw-input" type="password" placeholder="Password" style="width:100%;padding:10px 14px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:14px;font-family:Sora,sans-serif;outline:none;box-sizing:border-box;text-align:center;margin-bottom:8px;">'
                + '<div id="settings-pw-err" style="font-size:12px;color:#dc2626;margin-bottom:12px;min-height:18px;"></div>';
            var btnRowS = document.createElement('div');
            btnRowS.style.cssText = 'display:flex;gap:10px;justify-content:center;';
            var btnCancelS = document.createElement('button');
            btnCancelS.textContent = 'Cancel';
            btnCancelS.style.cssText = 'padding:9px 24px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;';
            var btnUnlockS = document.createElement('button');
            btnUnlockS.textContent = '\ud83d\udd13 Unlock';
            btnUnlockS.style.cssText = 'padding:6px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;';
            btnRowS.appendChild(btnCancelS);
            btnRowS.appendChild(btnUnlockS);
            boxS.appendChild(btnRowS);
            overlayS.appendChild(boxS);
            document.body.appendChild(overlayS);
            setTimeout(function(){ var _inp = document.getElementById('settings-pw-input'); if (_inp) _inp.focus(); }, 100);
            var settingsPw = (window.appState.config && window.appState.config.annual_password) || 'boss123';
            function tryUnlockSettings() {
                var _inp = document.getElementById('settings-pw-input');
                var _err = document.getElementById('settings-pw-err');
                if (_inp && _inp.value === settingsPw) {
                    window._settingsUnlocked = true;
                    overlayS.remove();
                    switchView('settings');
                } else {
                    if (_err) _err.textContent = '\u274c Wrong password';
                    if (_inp) { _inp.value = ''; _inp.focus(); }
                }
            }
            btnUnlockS.addEventListener('click', tryUnlockSettings);
            var pwInputS = document.getElementById('settings-pw-input');
            if (pwInputS) pwInputS.addEventListener('keydown', function(e) { if (e.key === 'Enter') tryUnlockSettings(); });
            btnCancelS.addEventListener('click', function() { overlayS.remove(); switchView('quick'); });
            return;
        }
        var lt = document.getElementById('settings-license-type');
        if (lt) lt.textContent = (typeof isPro === 'function' && isPro()) ? 'Pro License ✓' : 'Trial';
        if (window.electronAPI && window.electronAPI.getAppVersion) {
            window.electronAPI.getAppVersion().then(function(ver) {
                var ve = document.getElementById('settings-app-version');
                if (ve) ve.textContent = 'v' + ver;
            });
        }
        if (typeof renderCompanyList === 'function') renderCompanyList();
    } else if (view === 'salary') {
        if (typeof initSalaryView === 'function') initSalaryView();
    } else if (view === 'commission') {
        if (typeof initCommissionView === 'function') initCommissionView();
    }
    syncWindowFitForView(view);
}

// ==================== QUICK CALCULATE Fixed Version ====================

// Initialize Quick Calculate
async function initQuickCalculate() {
    console.log('📊 Initializing Quick Calculate');
    
    const container = document.getElementById('salespeople-container');
    const monthSelect = document.getElementById('report-month');
    
    // If there is already data in the state, just re-render
    // (user switched tabs and came back - do NOT wipe their data or reset month)
    if (window.appState.salespeople && window.appState.salespeople.length > 0) {
        if (container) container.innerHTML = '';
        renderAllSalespeopleCards();
        rerunQuickCalcDerivedFields();
        console.log('✅ Quick Calculate restored existing cards:', window.appState.salespeople.length);
        return;
    }
    
    // First time init — set current month
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    if (monthSelect) {
        monthSelect.value = currentMonth;
                window._currentMonth = monthSelect.value.toUpperCase();
                window._currentYear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    }

    // Initialize year dropdown
    var yearSelect = document.getElementById('report-year');
    if (yearSelect && yearSelect.options.length === 0) {
        var curYear = new Date().getFullYear();
        [curYear-1, curYear, curYear+1].forEach(function(y) {
            var opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === curYear) opt.selected = true;
            yearSelect.appendChild(opt);
        });
        yearSelect.addEventListener('change', function() {
            console.log('📅 Year changed to', this.value);
            window._currentYear = this.value;
            renderPersonSidebar();
            var curPerson = window.appState.salespeople[0];
            if (curPerson && curPerson.name) {
                if (typeof applyPersonTarget === 'function') applyPersonTarget(0);
                updateSalespersonData(0);
            }
        });
    }

    if (monthSelect) {
        // When month changes, re-fill cards from imported Excel data or recalc locked fields
        if (!monthSelect._hasAutoFillListener) {
            monthSelect.addEventListener('change', function() {
                const newMonth = this.value.toUpperCase();
                const oldMonth = window._currentMonth || '';
                var yearVal = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
                var oldMonthKey = oldMonth ? oldMonth + '-' + (window._currentYear || yearVal) : '';
                var newMonthKey = newMonth + '-' + yearVal;
                console.log('📅 Month changed from', oldMonthKey, 'to', newMonthKey);

                // Cancel any pending auto-save to prevent old data leaking into new month
                if (window._autoSaveTimer) { clearTimeout(window._autoSaveTimer); window._autoSaveTimer = null; }

                // ── SAVE current month data before switching ──────────────
                if (oldMonth && oldMonth !== newMonth) {
                    var curPerson = window.appState.salespeople[0];
                    var curNameEl = document.getElementById('name-0');
                    var curNameDisp = document.getElementById('card-name-text-0');
                    var curName = (curPerson && curPerson.name) ? curPerson.name
                                : (curNameDisp && curNameDisp.textContent !== '—') ? curNameDisp.textContent
                                : (curNameEl ? curNameEl.value : '');
                    if (curName) {
                        function getF(id) {
                            var el = document.getElementById(id + '-0');
                            if (!el) return 0;
                            if (el.disabled) {
                                if (id==='target' && curPerson && curPerson.target) return curPerson.target;
                                if (id==='collection-target' && curPerson && curPerson.collectionTarget) return curPerson.collectionTarget;
                                if (id==='call-target' && curPerson && curPerson.callTarget) return curPerson.callTarget;
                            }
                            return parseFloat(el.value)||0;
                        }
                        var saveData = {
                            name:            curName.toUpperCase(),
                            target:          getF('target'),
                            sales:           getF('sales'),
                            quarterlyTarget: getF('quarterly-target'),
                            quarterlySales:  getF('quarterly-sales'),
                            collectionTarget:getF('collection-target'),
                            collectionAmount:getF('collection-amount'),
                            callTarget:      getF('call-target'),
                            callActual:      getF('call-actual')
                        };
                        var hist = window.appState.config.reportHistory || [];
                        var hIdx = hist.findIndex(function(r){ return (r.month||'').toUpperCase() === oldMonthKey; });
                        if (hIdx < 0) { hist.push({month:oldMonthKey, data:[]}); hIdx = hist.length-1; }
                        var pIdx = hist[hIdx].data.findIndex(function(p){ return (p.name||'').toUpperCase() === curName.toUpperCase(); });
                        if (pIdx >= 0) hist[hIdx].data[pIdx] = saveData;
                        else hist[hIdx].data.push(saveData);
                        window.appState.config.reportHistory = hist;
                        saveConfig();
                        dbSave('reportHistory', hist).catch(function(){});
                        console.log('💾 Saved', curName, 'data for', oldMonth);
                    }
                }
                window._currentMonth = newMonth;
                window._currentYear = yearVal;
                // Also update the select to reflect current month
                if (monthSelect) monthSelect.value = newMonth;

                // If we have imported Excel data, refill cards for the new month
                if (window.appState.importedExcelData && window.appState.importedExcelData.length > 0) {
                    console.log('📂 Refilling cards from imported Excel data for', newMonth);
                    fillCardsFromImportedData(newMonth);
                } else {
                    // Try to load saved data for this month from reportHistory
                    var history = window.appState.config.reportHistory || [];
                    var histEntry = history.find(function(r){ return (r.month||'').toUpperCase() === newMonthKey; })
                                 || history.find(function(r){ return (r.month||'').toUpperCase() === newMonth; });
                    
                    // Keep the CURRENT person — don't jump to anyone else
                    var currentPersonName = (window.appState.salespeople[0] && window.appState.salespeople[0].name) || '';
                    
                    // Find current person's data in the new month
                    var personData = null;
                    if (histEntry && histEntry.data && currentPersonName) {
                        personData = histEntry.data.find(function(p){ return (p.name||'').toUpperCase() === currentPersonName.toUpperCase(); });
                    }

                    var set = function(id, v) {
                        var el = document.getElementById(id + '-0');
                        if (el) el.value = (v != null && v !== 0) ? v : '';
                    };

                    if (personData && window.appState.salespeople.length > 0) {
                        // Has data — restore it
                        window.appState.salespeople[0].target = parseFloat(personData.target) || 0;
                        window.appState.salespeople[0].collectionTarget = parseFloat(personData.collectionTarget) || 0;
                        window.appState.salespeople[0].callTarget = parseFloat(personData.callTarget) || 0;
                        set('target',             personData.target);
                        set('sales',              personData.sales);
                        set('quarterly-target',   personData.quarterlyTarget || '');
                        set('quarterly-sales',    personData.quarterlySales  || '');
                        set('collection-target',  personData.collectionTarget || '');
                        set('collection-amount',  personData.collectionAmount || '');
                        set('call-target',        personData.callTarget || '');
                        set('call-actual',        personData.callActual || '');
                    } else {
                        // No data for this person in this month — CLEAR ALL fields
                        ['target','sales','quarterly-target','quarterly-sales',
                         'collection-target','collection-amount','call-target','call-actual'].forEach(function(id){
                            set(id, '');
                        });
                        if (window.appState.salespeople.length > 0) {
                            window.appState.salespeople[0].target = 0;
                            window.appState.salespeople[0].sales = 0;
                            window.appState.salespeople[0].collectionTarget = 0;
                            window.appState.salespeople[0].collectionAmount = 0;
                            window.appState.salespeople[0].callTarget = 0;
                            window.appState.salespeople[0].callActual = 0;
                            window.appState.salespeople[0].quarterlyTarget = 0;
                            window.appState.salespeople[0].quarterlySales = 0;
                        }
                    }

                    // Apply target locks from config for the new month
                    if (typeof applyPersonTarget === 'function') applyPersonTarget(0);
                    if (window.appState.salespeople.length > 0) updateSalespersonData(0);

                    window._currentMonthHistory = histEntry ? histEntry.data : null;
                    updateSummaryView();
                    if (typeof renderPersonSidebar === 'function') renderPersonSidebar();
                    showToast('📅', newMonth + (personData ? ' data restored' : ' — no data yet'));
                }
            });
            monthSelect._hasAutoFillListener = true;
        }
    }
    
    // First time init — restore from DB first, fallback to config
    window.appState.salespeople = [];
    if (container) container.innerHTML = '';

    // Try DB first
    var dbQcd = await dbLoad('quickCalculateData');
    var dbHist = await dbLoad('reportHistory');
    if (dbQcd) {
        window.appState.config.quickCalculateData = dbQcd;
        console.log('✅ Restored quickCalculateData from DB');
    }
    if (dbHist && Array.isArray(dbHist)) {
        window.appState.config.reportHistory = dbHist;
        console.log('✅ Restored reportHistory from DB, entries:', dbHist.length);
    }

    var saved = window.appState.config.quickCalculateData;
    if (saved && saved.salespeople && saved.salespeople.length > 0) {
        if (saved.month) { var ms=document.getElementById('report-month'); if(ms) ms.value=saved.month; }
        saved.salespeople.forEach(function(sp) {
            var newId=window.appState.salespeople.length+1;
            window.appState.salespeople.push(Object.assign({id:newId},sp));
        });
        renderAllSalespeopleCards();
        saved.salespeople.forEach(function(sp,idx) {
            var nameEl=document.getElementById('name-'+idx);
            if(nameEl&&sp.name) nameEl.value=sp.name;
            // Update card header
            var nt=document.getElementById('card-name-text-'+idx);
            var av=document.getElementById('card-avatar-'+idx);
            if(nt&&sp.name) nt.textContent=sp.name;
            if(av&&sp.name) av.textContent=sp.name[0];
            var set=function(id,v){var el=document.getElementById(id+'-'+idx);if(el&&v!=null&&v!=='')el.value=v;};
            set('target',sp.target); set('sales',sp.sales);
            set('quarterly-target',sp.quarterlyTarget); set('quarterly-sales',sp.quarterlySales);
            set('collection-target',sp.collectionTarget); set('collection-amount',sp.collectionAmount);
            set('call-target',sp.callTarget); set('call-actual',sp.callActual);
            // Apply target lock BEFORE updateSalespersonData
            if (typeof applyPersonTarget === 'function') applyPersonTarget(idx);
            updateSalespersonData(idx);
        });
        updateSummaryView();
    } else {
        createBlankSalespersonCard();
        // Auto-select first configured person so target shows immediately
        var configPeople = Object.keys(window.appState.config.base_salaries || {});
        if (configPeople.length > 0 && window.appState.salespeople.length > 0) {
            var firstName = configPeople[0];
            window.appState.salespeople[0].name = firstName;
            var _nameEl = document.getElementById('name-0');
            if (_nameEl) _nameEl.value = firstName;
            var _nameText = document.getElementById('card-name-text-0');
            var _avatar = document.getElementById('card-avatar-0');
            if (_nameText) _nameText.textContent = firstName;
            if (_avatar) _avatar.textContent = firstName[0];
            // Delay to ensure DOM is ready
            setTimeout(function() {
                if (typeof applyPersonTarget === 'function') applyPersonTarget(0);
                updateSalespersonData(0);
                updateSummaryView();
            }, 100);
        }
    }
    // Update summary
    updateSummaryView();
    if (typeof renderPersonSidebar === 'function') renderPersonSidebar();

    console.log('✅ Quick Calculate initialization completed');
}

// 用户点击按钮时调用的函数 - 弹出模态框
function addSalespersonCard() {
    // 显示快速添加人员模态框
    showQuickAddPersonModal();
}

// 创建空白卡片（初始化时使用，不弹出模态框）
function createBlankSalespersonCard() {
    const container = document.getElementById('salespeople-container');
    if (!container) return;
    
    // Calculate new ID
    const maxId = window.appState.salespeople.length > 0 
        ? Math.max(...window.appState.salespeople.map(p => p.id || 0))
        : 0;
    
    const newId = maxId + 1;
    const index = window.appState.salespeople.length;
    
    // Get configured salespeople
    const configuredPeople = Object.keys(window.appState.config.base_salaries || {});
    const nameOptions = configuredPeople.length > 0 
        ? configuredPeople.map(name => `<option value="${name}">${name}</option>`).join('')
        : '<option value="">Please configure salespeople first</option>';
    
    const card = document.createElement('div');
    card.className = 'card calc-person-card relative';
    card.setAttribute('draggable', 'false');
    card.addEventListener('dragstart', function(e) { e.preventDefault(); });
    card.innerHTML = `
        <!-- Delete button -->
        <button type="button" onmousedown="this._pressed=true" onmouseleave="this._pressed=false" onclick="if(this._pressed){this._pressed=false;deleteSalespersonCard(${newId})}" 
                class="calc-card-del"
                title="Delete this salesperson">
            ✕
        </button>
        
        <!-- Person name display -->
        <div id="card-name-display-${index}" class="calc-card-hd">
            <span id="card-avatar-${index}" class="calc-card-av">?</span>
            <span id="card-name-text-${index}" class="calc-card-name">—</span>
            <span id="card-type-badge-${index}" style="display:none;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;"></span>
        </div>
        
        <div class="grid grid-cols-2 gap-2">
            <div class="col-span-2" style="display:none;">
                <input type="hidden" id="name-${index}" value="">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Monthly Target (RM)</label>
                <input type="number" 
                       id="target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set in Salesperson → 🎯 Target">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Monthly Sales (RM)</label>
                <input type="number" 
                       id="sales-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter sales"
                       value=""
                       onfocus="this.readOnly=false;this.style.backgroundColor='';"
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div class="col-span-2">
                <h5 class="calc-section-hd calc-section-first">Quarterly totals</h5>
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Quarterly Target (RM)</label>
                <input type="number" 
                       id="quarterly-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Auto (Q months total)"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Auto: sum of quarterly months targets">
                <p class="text-xs text-gray-500" style="margin-top:2px;">3 months total target</p>
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Quarterly Sales (RM)</label>
                <input type="number" 
                       id="quarterly-sales-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Auto (Q months total)"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Auto: sum of quarterly months sales">
                <p class="text-xs text-gray-500" style="margin-top:2px;">3 months total sales</p>
            </div>
            
            <div class="col-span-2">
                <h5 class="calc-section-hd">Other targets</h5>
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Collection Target (Outlets)</label>
                <input type="number" 
                       id="collection-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set outlets in Salesperson → Target">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Collected Outlets</label>
                <input type="number" 
                       id="collection-amount-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter collected outlets"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Active Calls (Target)</label>
                <input type="number" 
                       id="call-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set in Salesperson → Target">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Active Calls (Actual)</label>
                <input type="number" 
                       id="call-actual-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter actual calls"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
        </div>
        
        <!-- Preview Section - Initially hidden -->
        <div id="preview-${index}" class="calc-preview-panel hidden">
            <div class="grid grid-cols-2 gap-1 text-xs">
                <div id="wrap-achievement-${index}">
                    <span class="text-gray-600">Achievement:</span>
                    <span id="achievement-${index}" class="font-semibold ml-2"></span>
                </div>
                <div id="wrap-commission-${index}">
                    <span class="text-gray-600" id="lbl-commission-${index}">Commission:</span>
                    <span id="commission-${index}" class="font-semibold ml-2"></span>
                </div>
                <div id="wrap-collection-bonus-${index}">
                    <span class="text-gray-600" id="lbl-collection-bonus-${index}">Collection Incentive:</span>
                    <span id="collection-bonus-${index}" class="font-semibold ml-2"></span>
                </div>
                <div id="wrap-call-bonus-${index}">
                    <span class="text-gray-600" id="lbl-call-bonus-${index}">Call Incentive:</span>
                    <span id="call-bonus-${index}" class="font-semibold ml-2"></span>
                </div>
                <div id="wrap-quarterly-${index}">
                    <span class="text-gray-600" id="lbl-quarterly-${index}">Quarterly Incentive:</span>
                    <span id="quarterly-${index}" class="font-semibold ml-2"></span>
                </div>
                <div id="wrap-total-commission-${index}">
                    <span class="text-gray-600" id="lbl-total-commission-${index}">Total Commission:</span>
                    <span id="total-commission-${index}" class="font-semibold ml-2 text-green-600"></span>
                </div>
            </div>
            <div class="text-right">
                <button type="button" onclick="showPayslipPreview(${index})" class="calc-preview-btn">Preview payslip</button>
            </div>
        </div>
        <div class="calc-card-foot">
            <button type="button" onclick="manualSave()" class="calc-foot-save">Save</button>
        </div>
    `;
    
    container.appendChild(card);
    
    // Add to state (using empty values)
    window.appState.salespeople.push({
        id: newId,
        index: index,
        name: '',
        target: 0,
        sales: 0,
        quarterlyTarget: 0,
        quarterlySales: 0,
        collectionTarget: 0,
        collectionAmount: 0,
        callTarget: 0,
        callActual: 0,
        achievement: 0,
        commission: 0,
        collectionIncentive: 0,
        activeCallIncentive: 0,
        quarterlyBonus: 0,
        totalCommission: 0
    });
    
    // Ensure target and sales inputs on the new card are always editable
    setTimeout(() => {
        const tEl = document.getElementById('target-' + index);
        const sEl = document.getElementById('sales-' + index);
        if (tEl) { tEl.readOnly = false; tEl.style.backgroundColor = ''; }
        if (sEl) { sEl.readOnly = false; sEl.style.backgroundColor = ''; }
    }, 0);
    
    console.log(`➕ Added blank salesperson card #${newId}`);
    return newId;
}

// ==================== Quick Add Person Modal ====================

// Show quick add person modal
function showQuickAddPersonModal() {
    var existing = document.getElementById('quick-add-person-modal');
    if (existing) existing.remove();

    var IS = 'width:100%;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;background:#fff;color:#111827;display:block;';
    function mkInp(id, type, val, ph, extra) {
        var i = document.createElement('input');
        i.id = id; i.type = type; i.value = val; i.placeholder = ph;
        i.style.cssText = IS + (extra || '');
        i.addEventListener('focus', function() { this.style.borderColor = '#10b981'; });
        i.addEventListener('blur',  function() { this.style.borderColor = '#e5e7eb'; });
        return i;
    }
    function mkRow(lhtml, el, mb) {
        var d = document.createElement('div');
        d.style.marginBottom = mb || '12px';
        var l = document.createElement('label');
        l.style.cssText = 'display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:5px;';
        l.innerHTML = lhtml; d.appendChild(l); d.appendChild(el);
        return d;
    }
    function mkBox(bg, border, title, tc) {
        var b = document.createElement('div');
        b.style.cssText = 'background:'+bg+';border:1px solid '+border+';border-radius:10px;padding:14px 16px;margin-bottom:14px;';
        var t = document.createElement('div');
        t.style.cssText = 'font-size:12px;font-weight:700;color:'+tc+';margin-bottom:10px;';
        t.textContent = title; b.appendChild(t); return b;
    }

    var modal = document.createElement('div');
    modal.id = 'quick-add-person-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;max-width:500px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;';
    card.addEventListener('click', function(e) { e.stopPropagation(); });

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,#10b981,#059669);padding:18px 24px;color:#fff;flex-shrink:0;';
    hdr.innerHTML = '<div style="font-size:18px;font-weight:700;">Add New Salesperson</div><div style="font-size:13px;margin-top:4px;opacity:0.9;">Fill in salary & allowances</div>';

    var body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;';

    body.appendChild(mkRow('Name <span style="color:#ef4444">*</span>', mkInp('quick-person-name','text','','e.g., CHONG JIA YING')));

    // Employee Type selector
    var typeSel = document.createElement('select');
    typeSel.id = 'quick-person-type';
    typeSel.style.cssText = IS;
    typeSel.innerHTML = '<option value="Sales">💼 Sales</option><option value="Supervisor">👔 Supervisor</option><option value="Support Staff">🛠️ Support Staff</option>';
    body.appendChild(mkRow('Employee Type', typeSel));

    var salBox = mkBox('#f0fdf4','#bbf7d0','SALARY','#065f46');
    salBox.appendChild(mkRow('Base Salary (RM) <span style="color:#ef4444">*</span>', mkInp('quick-person-salary','number','1700','1700'), '0'));
    body.appendChild(salBox);

    var alBox = mkBox('#eff6ff','#bfdbfe','ALLOWANCES (RM)','#1e40af');
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;';
    [['HP','quick-allow-hp'],['Car','quick-allow-car'],
     ['Local Fuel','quick-allow-localfuel'],['Outstation Fuel','quick-allow-outfuel'],
     ['Housing','quick-allow-housing'],['Food','quick-allow-food']
    ].forEach(function(p) { grid.appendChild(mkRow(p[0], mkInp(p[1],'number','0','0'), '0')); });
    alBox.appendChild(grid);
    var ow = document.createElement('div'); ow.style.marginTop='10px';
    ow.appendChild(mkRow('Others', mkInp('quick-allow-others','number','0','0'), '0'));
    alBox.appendChild(ow); body.appendChild(alBox);

    var epfBox = mkBox('#fafafa','#e5e7eb','DEDUCTION','#374151');
    epfBox.appendChild(mkRow('EPF Rate (%)', mkInp('quick-person-epf','number','11','11','max-width:120px;'), '0'));
    body.appendChild(epfBox);

    var errDiv = document.createElement('div');
    errDiv.id = 'quick-add-error';
    errDiv.style.cssText = 'display:none;padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;margin-bottom:10px;';
    body.appendChild(errDiv);

    var ftr = document.createElement('div');
    ftr.style.cssText = 'padding:16px 24px;border-top:1px solid #f3f4f6;display:flex;gap:12px;justify-content:flex-end;flex-shrink:0;background:#fff;';
    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.cssText = 'padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;font-weight:500;';
    cancelBtn.addEventListener('click', function() { closeQuickAddPersonModal(); });
    var submitBtn = document.createElement('button');
    submitBtn.id = 'quick-add-submit-btn';
    submitBtn.textContent = '+ Add Person';
    submitBtn.style.cssText = 'padding:10px 24px;border:none;border-radius:8px;background:#10b981;color:#fff;cursor:pointer;font-size:14px;font-weight:600;';
    submitBtn.addEventListener('click', function() { quickAddPersonSubmit(); });
    ftr.appendChild(cancelBtn); ftr.appendChild(submitBtn);
    card.appendChild(hdr); card.appendChild(body); card.appendChild(ftr);
    modal.appendChild(card); document.body.appendChild(modal);
    modal.addEventListener('click', function() { closeQuickAddPersonModal(); });
    setTimeout(function() { var n=document.getElementById('quick-person-name'); if(n) n.focus(); }, 50);
}

// Close modal
function closeQuickAddPersonModal() {
    const modal = document.getElementById('quick-add-person-modal');
    if (modal) modal.remove();
}

// Submit add person
async function quickAddPersonSubmit() {
    var nameInput   = document.getElementById('quick-person-name');
    var salaryInput = document.getElementById('quick-person-salary');
    var errorEl     = document.getElementById('quick-add-error');
    var btn         = document.getElementById('quick-add-submit-btn');
    var name   = nameInput.value.trim();
    var salary = parseFloat(salaryInput.value) || 1700;
    var allowances = {
        HP:                parseFloat((document.getElementById('quick-allow-hp')       ||{}).value)||0,
        CAR:               parseFloat((document.getElementById('quick-allow-car')      ||{}).value)||0,
        'LOCAL FUEL':      parseFloat((document.getElementById('quick-allow-localfuel')||{}).value)||0,
        'OUTSTATION FUEL': parseFloat((document.getElementById('quick-allow-outfuel')  ||{}).value)||0,
        HOUSING:           parseFloat((document.getElementById('quick-allow-housing')  ||{}).value)||0,
        FOOD:              parseFloat((document.getElementById('quick-allow-food')     ||{}).value)||0,
        OTHERS:            parseFloat((document.getElementById('quick-allow-others')   ||{}).value)||0
    };
    var epfRate = parseFloat((document.getElementById('quick-person-epf')||{}).value)||11;
    if (!name) { errorEl.textContent='Please enter a name'; errorEl.style.display='block'; nameInput.focus(); return; }
    var nameUpper = name.toUpperCase();
    if (window.appState.config.base_salaries && window.appState.config.base_salaries[nameUpper]) {
        errorEl.textContent='"'+name+'" already exists'; errorEl.style.display='block'; nameInput.focus(); return;
    }
    btn.disabled=true; btn.style.opacity='0.6'; btn.textContent='Adding...';
    try {
        if (!window.appState.config.base_salaries)  window.appState.config.base_salaries={};
        if (!window.appState.config.allowances)      window.appState.config.allowances={};
        if (!window.appState.config.deductions)      window.appState.config.deductions={};
        if (!window.appState.config.deductionRates)  window.appState.config.deductionRates={};
        window.appState.config.base_salaries[nameUpper] = salary;
        window.appState.config.allowances[nameUpper]    = allowances;
        // Save employee type
        var empTypeVal = (document.getElementById('quick-person-type')||{}).value || 'Sales';
        setEmployeeType(nameUpper, empTypeVal);
        var totalIncome = salary + Object.values(allowances).reduce(function(a,b){return a+b;},0);
        window.appState.config.deductions[nameUpper]     = {EPF:Math.round(totalIncome*(epfRate/100)*100)/100,SOCSO:Math.round(totalIncome*0.005*100)/100,PCB:0,EIS:0};
        window.appState.config.deductionRates[nameUpper] = {EPF_RATE:epfRate};
        await saveConfig();
        closeQuickAddPersonModal();
        showToast('✅', '"'+name+'" added! Select from the dropdown.');
        var people = Object.keys(window.appState.config.base_salaries||{});
        var opts = '<option value="">Select...</option>'+people.map(function(n){return '<option value="'+n+'">'+n+'</option>';}).join('');
        document.querySelectorAll('[id^="name-"]').forEach(function(sel){var cur=sel.value;sel.innerHTML=opts;sel.value=cur;});
    } catch(error) {
        errorEl.textContent='Failed: '+error.message; errorEl.style.display='block';
        btn.disabled=false; btn.style.opacity='1'; btn.textContent='+ Add Person';
    }
}

// Clear all data - custom modal (no confirm() to avoid Electron timing issues)
function clearAllQuickCalculateData() {
    backupBeforeClear();

    // Remove any existing modal
    const existingModal = document.getElementById('clear-confirm-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'clear-confirm-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:12px;padding:28px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
            <h3 style="margin:0 0 12px;font-size:18px;font-weight:700;color:#111;">🗑️ Clear All Data</h3>
            <p style="margin:0 0 24px;color:#555;font-size:14px;">Are you sure you want to clear all data? This cannot be undone.</p>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="clear-cancel-btn" style="padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">Cancel</button>
                <button id="clear-ok-btn" style="padding:10px 20px;border:none;border-radius:8px;background:#ef4444;color:#fff;cursor:pointer;font-size:14px;font-weight:600;">Clear</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('clear-cancel-btn').onclick = () => modal.remove();

    document.getElementById('clear-ok-btn').onclick = () => {
        modal.remove();
        _doClearAllData();
    };
}

function _doClearAllData() {
    console.log('🗑️ Clearing all data');

    // Reset state
    window.appState.salespeople = [];

    // Completely replace the container to avoid any stale DOM/event issues
    const oldContainer = document.getElementById('salespeople-container');
    if (oldContainer) {
        const newContainer = document.createElement('div');
        newContainer.id = 'salespeople-container';
        newContainer.className = oldContainer.className;
        oldContainer.parentNode.replaceChild(newContainer, oldContainer);
    }

    // Add one fresh blank card
    createBlankSalespersonCard();

    // Clear saved data
    if (window.appState.config && window.appState.config.quickCalculateData) {
        delete window.appState.config.quickCalculateData;
    }

    updateSummaryView();
    showToast('🗑️', 'All data cleared');
    console.log('✅ Data clearing completed');
}

// Delete salesperson configuration
function toggleEmployeeActive(personName, makeActive) {
    if (!personName) return;
    if (typeof setEmployeeActive === 'function') setEmployeeActive(personName, makeActive);
    if (typeof saveConfig === 'function') saveConfig();
    renderPeopleList();
    if (typeof renderPersonSidebar === 'function') renderPersonSidebar();
    if (makeActive) {
        showToast('✅', personName + ' set to Active');
    } else {
        var endYM = (typeof getEmployeeEndYM === 'function') ? getEmployeeEndYM(personName) : null;
        showToast('🚪', personName + ' set to Inactive' + (endYM ? ' (resigned ' + endYM + ')' : ''));
    }
}
window.toggleEmployeeActive = toggleEmployeeActive;

// Pop up a date picker when toggling a person's Active/Inactive status.
// - Marking Active   → pick the join (start) date → person appears from that month onwards.
// - Marking Inactive → pick the resign (end) date → person hidden after that month.
function showEmployeeStatusDatePicker(personName, currentlyActive) {
    if (!personName) return;
    var makeActive = !currentlyActive;
    var now = new Date();
    var existingRaw = makeActive
        ? ((typeof getEmployeeStartYM === 'function' && getEmployeeStartYM(personName)) || '')
        : ((typeof getEmployeeEndYM === 'function' && getEmployeeEndYM(personName)) || '');
    // Pre-fill from stored value (YYYY-MM-DD or legacy YYYY-MM); otherwise today.
    var preY, preM, preD;
    var fm = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(existingRaw);
    if (fm) {
        preY = parseInt(fm[1], 10);
        preM = parseInt(fm[2], 10);
        preD = fm[3] ? parseInt(fm[3], 10) : now.getDate();
    } else {
        preY = now.getFullYear(); preM = now.getMonth() + 1; preD = now.getDate();
    }

    var headBg = makeActive ? 'linear-gradient(135deg,#065f46,#16a34a)' : 'linear-gradient(135deg,#7f1d1d,#dc2626)';
    var title  = makeActive ? '● Set Active' : '○ Set Inactive';
    var lbl    = makeActive ? 'Active from (Join date) — DD/MM/YYYY' : 'Inactive from (Resign date) — DD/MM/YYYY';
    var hint   = makeActive
        ? 'This person will appear in Records / Annual Report from this month onwards.'
        : 'This person will not appear in Records / Annual Report from this month onwards. Pick the 1st of the month they leave (e.g. 01/06 for last payroll in May). Past history is kept.';
    var accent = makeActive ? '#16a34a' : '#dc2626';

    // Build DD / MM / YYYY option lists.
    var dayOpts = '';
    for (var d = 1; d <= 31; d++) { var dd = String(d).padStart(2, '0'); dayOpts += '<option value="' + dd + '"' + (d === preD ? ' selected' : '') + '>' + dd + '</option>'; }
    var monOpts = '';
    for (var mo = 1; mo <= 12; mo++) { var mm = String(mo).padStart(2, '0'); monOpts += '<option value="' + mm + '"' + (mo === preM ? ' selected' : '') + '>' + mm + '</option>'; }
    var yrOpts = '';
    var baseYr = now.getFullYear();
    for (var y = baseYr - 6; y <= baseYr + 2; y++) { yrOpts += '<option value="' + y + '"' + (y === preY ? ' selected' : '') + '>' + y + '</option>'; }

    var selCss = 'flex:1;padding:10px 8px;border:1.5px solid var(--line);border-radius:var(--r);font-size:14px;font-family:Sora,sans-serif;outline:none;background:var(--paper);color:var(--ink);box-sizing:border-box;text-align:center;cursor:pointer;';
    var sepCss = 'font-size:16px;font-weight:700;color:var(--ink3);';

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--paper);border-radius:16px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(8,15,26,.25);';
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    card.innerHTML =
        '<div style="background:' + headBg + ';padding:18px 22px;color:#fff;">'
        + '<div style="font-size:16px;font-weight:800;">' + title + '</div>'
        + '<div style="font-size:12px;opacity:.7;margin-top:3px;">' + personName + '</div></div>'
        + '<div style="padding:20px 22px;">'
        + '<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px;">' + lbl + '</label>'
        + '<div style="display:flex;align-items:center;gap:6px;">'
        + '<select id="es-day" aria-label="Day" style="' + selCss + '">' + dayOpts + '</select>'
        + '<span style="' + sepCss + '">/</span>'
        + '<select id="es-mon" aria-label="Month" style="' + selCss + '">' + monOpts + '</select>'
        + '<span style="' + sepCss + '">/</span>'
        + '<select id="es-yr" aria-label="Year" style="' + selCss + ';flex:1.3;">' + yrOpts + '</select>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--ink3);margin-top:8px;line-height:1.5;">' + hint + '</div>'
        + '</div>'
        + '<div style="padding:14px 22px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;">'
        + '<button id="es-cancel" style="padding:9px 18px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        + '<button id="es-save" style="padding:9px 22px;border:none;border-radius:var(--r);background:' + accent + ';color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">Confirm</button>'
        + '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    document.getElementById('es-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('es-save').addEventListener('click', function () {
        var dd = document.getElementById('es-day').value;
        var mm = document.getElementById('es-mon').value;
        var yy = document.getElementById('es-yr').value;
        // Clamp the day to the chosen month's length (e.g. 31 Feb → 28/29).
        var maxDay = new Date(parseInt(yy, 10), parseInt(mm, 10), 0).getDate();
        if (parseInt(dd, 10) > maxDay) dd = String(maxDay).padStart(2, '0');
        var dateVal = yy + '-' + mm + '-' + dd; // stored as YYYY-MM-DD
        overlay.remove();
        applyEmployeeStatus(personName, makeActive, dateVal);
    });
}
window.showEmployeeStatusDatePicker = showEmployeeStatusDatePicker;

function applyEmployeeStatus(personName, makeActive, ym) {
    if (!personName) return;
    var cfg = window.appState.config;
    if (!cfg.employee_active) cfg.employee_active = {};
    var nu = personName.toUpperCase();
    if (makeActive) {
        delete cfg.employee_active[nu];
        if (typeof setEmployeeStartYM === 'function') setEmployeeStartYM(personName, ym || '');
        if (typeof setEmployeeEndYM === 'function') setEmployeeEndYM(personName, '');
    } else {
        cfg.employee_active[nu] = false;
        if (typeof setEmployeeEndYM === 'function') setEmployeeEndYM(personName, ym || '');
    }
    if (typeof saveConfig === 'function') saveConfig();
    renderPeopleList();
    if (typeof renderPersonSidebar === 'function') renderPersonSidebar();
    // Display as DD/MM/YYYY in the confirmation toast.
    var ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ym || '');
    var nice = ymd ? (ymd[3] + '/' + ymd[2] + '/' + ymd[1]) : (ym || '');
    if (makeActive) {
        showToast('✅', personName + ' set to Active' + (nice ? ' (from ' + nice + ')' : ''));
    } else {
        showToast('🚪', personName + ' set to Inactive' + (nice ? ' (resigned ' + nice + ')' : ''));
    }
}
window.applyEmployeeStatus = applyEmployeeStatus;

// Require the manager password (same as Annual Report) before running a sensitive People action.
function requirePeoplePassword(actionLabel, onSuccess) {
    var correct = (window.appState && window.appState.config && window.appState.config.annual_password) || 'boss123';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;box-sizing:border-box;';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--paper);border-radius:14px;max-width:340px;width:100%;padding:24px;box-shadow:0 25px 60px rgba(8,15,26,.25);font-family:Sora,sans-serif;';
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    card.innerHTML =
        '<div style="font-size:15px;font-weight:800;color:var(--ink);margin-bottom:4px;">\uD83D\uDD12 Password required</div>'
        + '<div style="font-size:12px;color:var(--ink3);margin-bottom:14px;">' + actionLabel + '</div>'
        + '<input id="pp-input" type="password" placeholder="Password" style="width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:var(--r);font-size:14px;font-family:Sora,sans-serif;outline:none;box-sizing:border-box;text-align:center;background:var(--paper);color:var(--ink);">'
        + '<div id="pp-err" style="font-size:12px;color:#dc2626;min-height:16px;margin:6px 0 10px;"></div>'
        + '<div style="display:flex;gap:10px;justify-content:flex-end;">'
        + '<button id="pp-cancel" style="padding:8px 16px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;color:var(--ink);">Cancel</button>'
        + '<button id="pp-ok" style="padding:8px 18px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">Confirm</button>'
        + '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    var input = document.getElementById('pp-input');
    if (input) setTimeout(function () { input.focus(); }, 50);
    function submit() {
        if (input && input.value === correct) {
            overlay.remove();
            if (typeof onSuccess === 'function') onSuccess();
        } else {
            var err = document.getElementById('pp-err');
            if (err) err.textContent = 'Incorrect password';
            if (input) { input.value = ''; input.focus(); }
        }
    }
    document.getElementById('pp-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('pp-ok').addEventListener('click', submit);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
}
window.requirePeoplePassword = requirePeoplePassword;

function deleteSalespersonConfig(personName) {
    if (!personName) return;

    // Custom confirm dialog (avoid native confirm which breaks focus in Electron)
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.5);display:flex;align-items:center;justify-content:center;z-index:99999;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;padding:28px 28px 20px;max-width:360px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:Sora,sans-serif;';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:16px;font-weight:700;color:#111;margin-bottom:8px;';
    title.textContent = 'Delete ' + personName + '?';

    var msg = document.createElement('div');
    msg.style.cssText = 'font-size:13px;color:#666;margin-bottom:20px;line-height:1.5;';
    msg.textContent = 'This will remove all salary, allowances and commission settings. Cannot be undone.';

    var btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

    var btnNo = document.createElement('button');
    btnNo.textContent = 'Cancel';
    btnNo.style.cssText = 'padding:8px 18px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;';

    var btnYes = document.createElement('button');
    btnYes.textContent = 'Delete';
    btnYes.style.cssText = 'padding:8px 18px;border:none;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-size:13px;font-weight:700;';

    btns.appendChild(btnNo);
    btns.appendChild(btnYes);
    box.appendChild(title);
    box.appendChild(msg);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    btnNo.addEventListener('click', function() { overlay.remove(); });

    btnYes.addEventListener('click', function() {
        overlay.remove();
        var nameUpper = personName.toUpperCase();
        var cfg = window.appState.config;
        ['base_salaries','allowances','deductions','deductionRates','earnings',
         'active_call_targets','person_commission_rates','person_quarterly_incentive',
         'person_collection_incentive','person_call_incentive','employee_profiles',
         'employee_dob','employee_nationality'].forEach(function(k) {
            if (cfg[k] && cfg[k][nameUpper]) delete cfg[k][nameUpper];
        });
        saveConfig();
        renderPeopleList();
        showToast('✅', personName + ' deleted');
    });
}

/** After rebuilding salesperson cards from appState, sync inputs → state and refresh KPIs / commission workspace / summary. */
function rerunQuickCalcDerivedFields() {
    var n = (window.appState.salespeople || []).length;
    for (var i = 0; i < n; i++) {
        if (typeof applyPersonTarget === 'function') applyPersonTarget(i);
        updateSalespersonData(i);
    }
    if (n === 0 && typeof updateCalcWorkspace === 'function') updateCalcWorkspace();
    updateSummaryView();
}

// Re-render all cards
function renderAllSalespeopleCards() {
    const container = document.getElementById('salespeople-container');
    if (!container) {
        console.error('Salesperson container not found');
        return;
    }
    
    console.log('🔄 Re-rendering all cards');
    
    // Completely clear container
    container.innerHTML = '';
    
    // Recreate all cards
    window.appState.salespeople.forEach((person, index) => {
        const configuredPeople = Object.keys(window.appState.config.base_salaries || {});
        const nameOptions = configuredPeople.length > 0 
            ? configuredPeople.map(name => `<option value="${name}">${name}</option>`).join('')
            : '<option value="">Please configure salespeople first</option>';
        
        const card = document.createElement('div');
        card.className = 'card calc-person-card relative';
        card.setAttribute('draggable', 'false');
        card.addEventListener('dragstart', function(e) { e.preventDefault(); });
        card.innerHTML = `
            <!-- Delete button -->
            <button type="button" onmousedown="this._pressed=true" onmouseleave="this._pressed=false" onclick="if(this._pressed){this._pressed=false;deleteSalespersonCard(${person.id})}" 
                    class="calc-card-del"
                    title="Delete this salesperson">
                ✕
            </button>
            
            <!-- Person name display -->
            <div id="card-name-display-${index}" class="calc-card-hd">
                <span id="card-avatar-${index}" class="calc-card-av">${person.name ? person.name[0] : '?'}</span>
                <span id="card-name-text-${index}" class="calc-card-name">${person.name || '—'}</span>
                <span id="card-type-badge-${index}" style="display:none;padding:2px 8px;border-radius:6px;font-size:10px;font-weight:700;"></span>
            </div>
            
            <div class="grid grid-cols-2 gap-2">
                <div class="col-span-2" style="display:none;">
                    <input type="hidden" id="name-${index}" value="${person.name || ''}">
                </div>
                
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Monthly Target (RM)</label>
                <input type="number" 
                       id="target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set in Salesperson → Target">
            </div>
            
            <div class="calc-input-cell">
                <label class="block text-xs font-medium text-gray-700 mb-1">Monthly Sales (RM)</label>
                    <input type="number" 
                           id="sales-${index}"
                           class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="Enter sales"
                           value="${person.sales || ''}"
                           onfocus="this.readOnly=false;this.style.backgroundColor='';"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div class="col-span-2">
                    <h5 class="calc-section-hd calc-section-first">Quarterly totals</h5>
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Quarterly Target (RM)</label>
                    <input type="number" 
                       id="quarterly-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Auto (Q months total)"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Auto: sum of quarterly months targets">
                    <p class="text-xs text-gray-500" style="margin-top:2px;">3 months total target</p>
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Quarterly Sales (RM)</label>
                    <input type="number" 
                       id="quarterly-sales-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Auto (Q months total)"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Auto: sum of quarterly months sales">
                    <p class="text-xs text-gray-500" style="margin-top:2px;">3 months total sales</p>
                </div>
                
                <div class="col-span-2">
                    <h5 class="calc-section-hd">Other targets</h5>
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Collection Target (Outlets)</label>
                    <input type="number" 
                       id="collection-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set in Salesperson → Target">
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Collected Outlets</label>
                    <input type="number" 
                           id="collection-amount-${index}"
                           class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="Enter collected outlets"
                           value="${person.collectionAmount || ''}"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Active Calls (Target)</label>
                    <input type="number" 
                       id="call-target-${index}"
                       class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg"
                       placeholder="Set in Salesperson tab"
                       value=""
                       disabled readonly
                       style="background:#f1f5f9;color:#64748b;cursor:not-allowed;pointer-events:none;"
                       title="Set in Salesperson → Target">
                </div>
                
                <div class="calc-input-cell">
                    <label class="block text-xs font-medium text-gray-700 mb-1">Active Calls (Actual)</label>
                    <input type="number" 
                           id="call-actual-${index}"
                           class="input-field w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="Enter actual calls"
                           value="${person.callActual || ''}"
                           oninput="updateSalespersonData(${index})">
                </div>
            </div>
            
            <!-- Preview Section -->
            <div id="preview-${index}" class="calc-preview-panel">
                <div class="grid grid-cols-2 gap-1 text-xs">
                    <div id="wrap-achievement-${index}">
                        <span class="text-gray-600">Achievement:</span>
                        <span id="achievement-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div id="wrap-commission-${index}">
                        <span class="text-gray-600" id="lbl-commission-${index}">Commission:</span>
                        <span id="commission-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div id="wrap-collection-bonus-${index}">
                        <span class="text-gray-600" id="lbl-collection-bonus-${index}">Collection Incentive:</span>
                        <span id="collection-bonus-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div id="wrap-call-bonus-${index}">
                        <span class="text-gray-600" id="lbl-call-bonus-${index}">Call Incentive:</span>
                        <span id="call-bonus-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div id="wrap-quarterly-${index}">
                        <span class="text-gray-600" id="lbl-quarterly-${index}">Quarterly Incentive:</span>
                        <span id="quarterly-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div id="wrap-total-commission-${index}">
                        <span class="text-gray-600" id="lbl-total-commission-${index}">Total Commission:</span>
                        <span id="total-commission-${index}" class="font-semibold ml-2 text-green-600"></span>
                    </div>
                </div>
                <div class="text-right">
                    <button type="button" onclick="showPayslipPreview(${index})" class="calc-preview-btn">Preview payslip</button>
                </div>
            </div>
            <div class="calc-card-foot">
                <button type="button" onclick="manualSave()" class="calc-foot-save">Save</button>
            </div>
        `;
        
        container.appendChild(card);
        
        // Restore data and re-apply locked fields
        setTimeout(() => {
            // Sync hidden name input
            const nameEl = document.getElementById('name-' + index);
            if (nameEl && person.name) {
                nameEl.value = person.name;
            }
            // Apply target locks from config
            if (typeof applyPersonTarget === 'function') applyPersonTarget(index);
            updateSalespersonData(index);
        }, 50);
    });
}

// Update salesperson data
function updateSalespersonData(index, opts) {
    opts = opts || {};
    const person = window.appState.salespeople[index];
    if (!person) return;
    
    // Get input values
    const nameInput = document.getElementById(`name-${index}`);
    const targetInput = document.getElementById(`target-${index}`);
    const salesInput = document.getElementById(`sales-${index}`);
    
    if (!nameInput || !targetInput || !salesInput) {
        console.error(`Input elements not found for index ${index}`);
        return;
    }
    
    // Use appState name as primary source (set by sidebar click)
    // Only update from DOM if appState is empty
    if (!person.name || person.name.trim() === '') {
        if (nameInput && nameInput.value && nameInput.value.trim() !== '') {
            person.name = nameInput.value.trim();
        } else {
            var nd = document.getElementById('card-name-text-' + index);
            if (nd && nd.textContent && nd.textContent.trim() !== '—') {
                person.name = nd.textContent.trim();
            }
        }
    }
    // Always sync hidden input with appState name
    if (nameInput && person.name) nameInput.value = person.name;
    // If target field is locked (disabled), read from appState to preserve locked value
    person.target = (targetInput && targetInput.disabled && person.target)
        ? person.target
        : (parseFloat(targetInput ? targetInput.value : 0) || 0);
    person.sales = parseFloat(salesInput.value) || 0;

    // ── Re-calculate quarterly totals: full quarter containing selected month (Sales only)
    const _curMonth = (document.getElementById('report-month')?.value || '').toUpperCase();
    const _histYear = parseInt((document.getElementById('report-year')||{}).value, 10) || new Date().getFullYear();
    if (person.name && getEmployeeType(person.name) === 'Sales' && _curMonth) {
        const _history = window.appState.config.reportHistory || [];
        const _nameUpper = person.name.toUpperCase();
        const _qMonths = quarterMonthsForBareMonth(_curMonth);

        function _getData(monthName) {
            const exData = window.appState.importedExcelData;
            if (exData) {
                const personEx = exData.find(p => (p.name || '').toUpperCase() === _nameUpper);
                if (personEx) {
                    const md = personEx.months.find(m => m.month === monthName);
                    if (md) return { target: parseFloat(md.target) || 0, sales: parseFloat(md.sales) || 0 };
                }
            }
            const hEntry = findHistEntry(_history, monthName, _histYear);
            if (hEntry && hEntry.data) {
                const pd = hEntry.data.find(p => (p.name || '').toUpperCase() === _nameUpper);
                if (pd) return { target: parseFloat(pd.target) || 0, sales: parseFloat(pd.sales) || 0 };
            }
            var _ptKey = _histYear + '-' + monthName;
            var _ptRow = window.appState.config.person_targets && window.appState.config.person_targets[_nameUpper];
            var _ptVal = _ptRow && _ptRow[_ptKey];
            if (_ptVal != null && _ptVal !== '') {
                var _tv = parseFloat(_ptVal);
                if (!isNaN(_tv)) return { target: _tv, sales: 0 };
            }
            return null;
        }

        if (!isQuarterEndMonthForRollup(_curMonth)) {
            const _qtEl0 = document.getElementById('quarterly-target-' + index);
            const _qsEl0 = document.getElementById('quarterly-sales-' + index);
            var _naTitle = 'Quarterly Target/Sales only in Mar/Jun/Sep/Dec (each 3-month period end).';
            if (_qtEl0) { _qtEl0.value = ''; person.quarterlyTarget = 0; _qtEl0.title = _naTitle; }
            if (_qsEl0) { _qsEl0.value = ''; person.quarterlySales = 0; _qsEl0.title = _naTitle; }
        } else if (_qMonths) {
            let _qT = 0, _qS = 0;
            for (var _qi = 0; _qi < _qMonths.length; _qi++) {
                var qm = _qMonths[_qi];
                if (qm === _curMonth) {
                    _qT += person.target;
                    _qS += person.sales;
                } else {
                    var d = _getData(qm);
                    if (d) { _qT += d.target; _qS += d.sales; }
                }
            }
            const _qtEl = document.getElementById('quarterly-target-' + index);
            const _qsEl = document.getElementById('quarterly-sales-' + index);
            if (_qtEl) { var _qtR = Math.round(_qT * 100) / 100; _qtEl.value = _qtR ? _qtR.toFixed(2) : ''; person.quarterlyTarget = _qtR; }
            if (_qsEl) { var _qsR = Math.round(_qS * 100) / 100; _qsEl.value = _qsR ? _qsR.toFixed(2) : ''; person.quarterlySales = _qsR; }
        }
    }

    person.quarterlyTarget = parseFloat(document.getElementById(`quarterly-target-${index}`).value) || 0;
    person.quarterlySales = parseFloat(document.getElementById(`quarterly-sales-${index}`).value) || 0;
    person.collectionTarget = parseFloat(document.getElementById(`collection-target-${index}`).value) || 0;
    person.collectionAmount = parseFloat(document.getElementById(`collection-amount-${index}`).value) || 0;
    person.callTarget = parseFloat(document.getElementById(`call-target-${index}`).value) || 0;
    person.callActual = parseFloat(document.getElementById(`call-actual-${index}`).value) || 0;
    
    // Check if there's enough data to show preview
    var _empTypeHd = person.name ? getEmployeeType(person.name) : 'Sales';
    const hasData = person.name && (
        _empTypeHd === 'Sales' ? (person.target > 0 && person.sales > 0)
        : _empTypeHd === 'Supervisor' ? true
        : _empTypeHd === 'Support Staff' ? (person.collectionAmount > 0)
        : false
    );
    const previewElement = document.getElementById(`preview-${index}`);
    
    if (hasData) {
        var empType = getEmployeeType(person.name);
        var commission = 0, collectionBonus = 0, callBonus = 0, quarterlyBonus = 0;
        var achievement = person.target > 0 ? (person.sales / person.target) * 100 : 0;
        var quarterlyAchievement = person.quarterlyTarget > 0 ? (person.quarterlySales / person.quarterlyTarget) * 100 : 0;
        var collectionAchievement = person.collectionTarget > 0 ? (person.collectionAmount / person.collectionTarget) * 100 : 0;
        var callAchievement = person.callTarget > 0 ? (person.callActual / person.callTarget) * 100 : 0;

        if (empType === 'Supervisor') {
            // Supervisor earns based on TEAM totals — read from reportHistory for current month
            var curMonth = (document.getElementById('report-month')||{}).value || '';
            curMonth = curMonth.toUpperCase();
            var _curYear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
            var teamSales = 0, teamTarget = 0, teamColl = 0, teamCollTarget = 0, teamCall = 0, teamCallTarget = 0;
            var _hist = (window.appState.config.reportHistory || []);
            var _hEntry = findHistEntry(_hist, curMonth, _curYear);
            if (_hEntry && _hEntry.data) {
                _hEntry.data.forEach(function(p) {
                    var t = getEmployeeType(p.name);
                    if (t !== 'Sales') return; // Only count Sales people for team totals
                    teamSales += parseFloat(p.sales) || 0;
                    teamTarget += parseFloat(p.target) || 0;
                    teamColl += parseFloat(p.collectionAmount) || 0;
                    teamCollTarget += parseFloat(p.collectionTarget) || 0;
                    teamCall += parseFloat(p.callActual) || 0;
                    teamCallTarget += parseFloat(p.callTarget) || 0;
                });
            }
            // Also include anyone currently open in Calculation page (not yet saved)
            (window.appState.salespeople || []).forEach(function(p) {
                if (!p.name) return;
                var t = getEmployeeType(p.name);
                if (t !== 'Sales') return;
                // Skip if already counted from history
                var alreadyInHistory = _hEntry && _hEntry.data && _hEntry.data.some(function(hp){return (hp.name||'').toUpperCase()===(p.name||'').toUpperCase();});
                if (alreadyInHistory) return;
                teamSales += parseFloat(p.sales) || 0;
                teamTarget += parseFloat(p.target) || 0;
                teamColl += parseFloat(p.collectionAmount) || 0;
                teamCollTarget += parseFloat(p.collectionTarget) || 0;
                teamCall += parseFloat(p.callActual) || 0;
                teamCallTarget += parseFloat(p.callTarget) || 0;
            });
            var teamAch = teamTarget > 0 ? (teamSales / teamTarget * 100) : 0;
            var teamCollAch = teamCollTarget > 0 ? (teamColl / teamCollTarget * 100) : 0;
            var teamCallAch = teamCallTarget > 0 ? (teamCall / teamCallTarget * 100) : 0;
            var _supCfg = window.appState.config;
            var _saleT = (_supCfg.person_supervisor_sale_tiers && _supCfg.person_supervisor_sale_tiers[person.name]) || _supCfg.supervisor_sale_tiers || [];
            var _collT = (_supCfg.person_supervisor_coll_tiers && _supCfg.person_supervisor_coll_tiers[person.name]) || _supCfg.supervisor_coll_tiers || [];
            var _callT = (_supCfg.person_supervisor_call_tiers && _supCfg.person_supervisor_call_tiers[person.name]) || _supCfg.supervisor_call_tiers || [];
            var _qtrT  = (_supCfg.person_supervisor_qtr_tiers  && _supCfg.person_supervisor_qtr_tiers[person.name])  || _supCfg.supervisor_qtr_tiers  || [];
            commission = getTierAmt(_saleT, teamAch);
            collectionBonus = getTierAmt(_collT, teamCollAch);
            callBonus = getTierAmt(_callT, teamCallAch);
            // Quarterly: only in quarter-end months
            var _qMonth = (document.getElementById('report-month')||{}).value || '';
            _qMonth = _qMonth.toUpperCase();
            if (['MAR','JUN','SEP','DEC'].indexOf(_qMonth) !== -1) {
                quarterlyBonus = getTierAmt(_qtrT, teamAch);
            }
            achievement = teamAch;
            collectionAchievement = teamCollAch;
            callAchievement = teamCallAch;
        } else if (empType === 'Support Staff') {
            // Merchandiser earns based on blocks (stored in collectionAmount field)
            var blocks = parseFloat(person.collectionAmount) || 0;
            var _merchRates = window.appState.config.person_merchandiser_rates || {};
            var rate = _merchRates[person.name] != null ? parseFloat(_merchRates[person.name]) : (parseFloat(window.appState.config.merchandiser_block_rate) || 10);
            collectionBonus = blocks * rate;
            commission = 0;
            callBonus = 0;
            quarterlyBonus = 0;
        } else {
            // Sales (default)
            commission = calculateCommission(person.sales, person.target, person.name);
            collectionBonus = calculateIncentive(collectionAchievement, collectionIncentiveTiersFor(person.name));
            callBonus = calculateIncentive(callAchievement, activeCallIncentiveTiersFor(person.name));
            var _qMonth = (document.getElementById('report-month')||{}).value || '';
            _qMonth = _qMonth.toUpperCase();
            var _isQuarterEnd = ['MAR','JUN','SEP','DEC'].indexOf(_qMonth) !== -1;
            quarterlyBonus = _isQuarterEnd ? calculateIncentive(quarterlyAchievement, quarterlyIncentiveTiersFor(person.name)) : 0;
        }

        var totalCommission = commission + collectionBonus + callBonus + quarterlyBonus;

        // Store results
        person.achievement = achievement;
        person.quarterlyAchievement = quarterlyAchievement;
        person.commission = commission;
        person.collectionIncentive = collectionBonus;
        person.activeCallIncentive = callBonus;
        person.quarterlyBonus = quarterlyBonus;
        person.totalCommission = totalCommission;

        // Show preview
        if (previewElement) {
            previewElement.classList.remove('hidden');
        }

        // Update preview content
        var achievementEl = document.getElementById('achievement-' + index);
        var commissionEl = document.getElementById('commission-' + index);
        var collectionBonusEl = document.getElementById('collection-bonus-' + index);
        var callBonusEl = document.getElementById('call-bonus-' + index);
        var quarterlyEl = document.getElementById('quarterly-' + index);
        var totalEl = document.getElementById('total-commission-' + index);

        if (achievementEl) {
            achievementEl.textContent = achievement.toFixed(2) + '%';
            achievementEl.className = 'font-semibold ml-2 ' + getAchievementColor(achievement);
        }
        if (commissionEl) commissionEl.textContent = formatCurrency(commission);
        if (collectionBonusEl) collectionBonusEl.textContent = formatCurrency(collectionBonus);
        if (callBonusEl) callBonusEl.textContent = formatCurrency(callBonus);
        if (quarterlyEl) quarterlyEl.textContent = person.quarterlyTarget > 0
            ? (formatCurrency(quarterlyBonus) + ' (' + quarterlyAchievement.toFixed(2) + '%)')
            : formatCurrency(quarterlyBonus);
        if (totalEl) totalEl.textContent = formatCurrency(totalCommission);
    } else {
        // Hide preview and reset data
        if (previewElement) {
            previewElement.classList.add('hidden');
        }
        person.achievement = 0;
        person.commission = 0;
        person.collectionIncentive = 0;
        person.activeCallIncentive = 0;
        person.quarterlyBonus = 0;
        person.totalCommission = 0;
    }
    
    // Update summary
    updateSummaryView();
    if (typeof updateLivePayslip === 'function') updateLivePayslip();
    if (!opts.skipWorkspace && typeof updateCalcWorkspace === 'function') updateCalcWorkspace();

    // Auto-save debounced 500ms
    if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);
    window._autoSaveTimer = setTimeout(function() {
        var _month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
        var _year = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
        var _monthKey = _month ? _month + '-' + _year : '';
        var _snap = {
            month: _month,
            year: _year,
            salespeople: window.appState.salespeople.map(function(p){return Object.assign({},p);})
        };
        window.appState.config.quickCalculateData = _snap;

        // Sync valid people into reportHistory
        if (_monthKey) {
            if (!window.appState.config.reportHistory) window.appState.config.reportHistory = [];
            // Also sync sales from input fields before saving
            window.appState.salespeople.forEach(function(p, i) {
                var sEl = document.getElementById('sales-' + i);
                if (sEl) p.sales = parseFloat(sEl.value) || p.sales || 0;
                var tEl = document.getElementById('target-' + i);
                if (tEl && tEl.disabled && p.target) {} // keep appState value
                else if (tEl) p.target = parseFloat(tEl.value) || p.target || 0;
            });
            var _valid = window.appState.salespeople.filter(function(p){ return p.name && p.name.trim() !== ''; });
            if (_valid.length > 0) {
                var _ei = window.appState.config.reportHistory.findIndex(function(r){ return (r.month||'').toUpperCase()===_monthKey; });
                var _hd = _valid.map(function(p){ return {name:(p.name||'').toUpperCase(),target:p.target||0,sales:p.sales||0,collectionTarget:p.collectionTarget||0,collectionAmount:p.collectionAmount||0,callTarget:p.callTarget||0,callActual:p.callActual||0}; });
                if (_ei >= 0) {
                    _hd.forEach(function(e){ var pi=window.appState.config.reportHistory[_ei].data.findIndex(function(d){return (d.name||'').toUpperCase()===e.name;}); if(pi>=0)window.appState.config.reportHistory[_ei].data[pi]=e; else window.appState.config.reportHistory[_ei].data.push(e); });
                } else {
                    window.appState.config.reportHistory.push({month:_monthKey, data:_hd});
                }
            }
        }

        saveConfig().catch(function(){});
        dbSave('quickCalculateData', _snap).catch(function(){});
        dbSave('reportHistory', window.appState.config.reportHistory||[]).catch(function(){});
    }, 500);
}

// Calculate commission
function calculateCommission(sales, target, personName) {
    if (target <= 0 || sales <= 0) return 0;
    const achievement = (sales / target) * 100;
    const nu = personName ? personName.toUpperCase() : null;
    let rates = window.appState.config.monthly_commission_rates || [];
    if (nu && window.appState.config.person_commission_rates && window.appState.config.person_commission_rates[nu])
        rates = window.appState.config.person_commission_rates[nu];
    for (const tier of rates) {
        if (achievement >= tier.min && achievement <= tier.max) return sales * (tier.rate || 0);
    }
    return 0;
}

// Calculate incentive
function calculateIncentive(achievement, incentiveTiers) {
    if (achievement <= 0) return 0;
    
    for (const tier of incentiveTiers) {
        if (achievement >= tier.min) {
            return tier.incentive || 0;
        }
    }
    
    return 0;
}

/** Personal incentive tiers override global (aligned with Commission setup UI & history Excel). */
function collectionIncentiveTiersFor(personName) {
    var nu = (personName || '').toUpperCase();
    var cfg = window.appState.config || {};
    var tiers = cfg.collection_incentive || [];
    if (nu && cfg.person_collection_incentive && cfg.person_collection_incentive[nu])
        tiers = cfg.person_collection_incentive[nu];
    return tiers;
}
function activeCallIncentiveTiersFor(personName) {
    var nu = (personName || '').toUpperCase();
    var cfg = window.appState.config || {};
    var tiers = cfg.active_call_incentive || [];
    if (nu && cfg.person_call_incentive && cfg.person_call_incentive[nu])
        tiers = cfg.person_call_incentive[nu];
    return tiers;
}
function quarterlyIncentiveTiersFor(personName) {
    var nu = (personName || '').toUpperCase();
    var cfg = window.appState.config || {};
    var tiers = cfg.quarterly_incentive || [];
    if (nu && cfg.person_quarterly_incentive && cfg.person_quarterly_incentive[nu])
        tiers = cfg.person_quarterly_incentive[nu];
    return tiers;
}

// Get achievement color
function getAchievementColor(achievement) {
    if (achievement >= 100) return 'text-green-600';
    if (achievement >= 90) return 'text-yellow-600';
    if (achievement >= 80) return 'text-orange-600';
    return 'text-red-600';
}

// Format currency
function formatCurrency(amount) {
    if (isNaN(amount)) return 'RM 0.00';
    return `RM ${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

// Update summary view
function updateSummaryView() {
    var summaryContainer = document.getElementById('summary-view');
    if (!summaryContainer) return;

    var allPeople = window.appState.salespeople;
    var validAll  = allPeople.filter(function(p){ return p.name && p.target > 0 && p.sales > 0; });

    if (!window._summaryMode) window._summaryMode = 'current';
    var mode = window._summaryMode;

    var curPerson = allPeople[0] || null;
    var curValid  = curPerson && curPerson.name && curPerson.target > 0 && curPerson.sales > 0;

    var month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var _syear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var histEntry = findHistEntry(window.appState.config.reportHistory||[], month, _syear);
    var histPeople = histEntry ? histEntry.data||[] : [];

    var dispPeople, dispCommission, dispTarget, dispSales;

    if (mode === 'all' && histPeople.length > 0) {
        dispPeople     = histPeople.length;
        dispTarget     = histPeople.reduce(function(s,p){return s+(parseFloat(p.target)||0);},0);
        dispSales      = histPeople.reduce(function(s,p){return s+(parseFloat(p.sales)||0);},0);
        dispCommission = histPeople.reduce(function(s,p){return s+calculateCommission(p.sales||0,p.target||0,p.name);},0);
    } else {
        dispPeople     = curPerson ? 1 : 0;
        dispTarget     = curPerson ? (curPerson.target||0) : 0;
        dispSales      = curPerson ? (curPerson.sales||0)  : 0;
        dispCommission = curValid  ? (curPerson.totalCommission||0) : 0;
    }

    var achievement = dispTarget > 0 ? (dispSales / dispTarget * 100) : 0;

    // Update main summary
    var sc = document.getElementById('summary-commission');
    if (sc) sc.textContent = formatCurrency(dispCommission);
    var scount = document.getElementById('summary-count');
    if (scount) scount.textContent = dispPeople;

    // Update stat boxes
    var statsBox = document.getElementById('summary-stats');
    if (statsBox) {
        var hasStats = (mode === 'all' && histPeople.length > 1) || (mode === 'current' && curValid);
        statsBox.style.display = hasStats ? 'grid' : 'none';
        if (hasStats) {
            var ts = document.getElementById('stat-total-sales');
            var aa = document.getElementById('stat-avg-ach');
            var ht = document.getElementById('stat-hit-target');
            var tt = document.getElementById('stat-total-target');
            var srcPeople = mode==='all' ? histPeople : (curPerson ? [curPerson] : []);
            var tSales=0,tTarget=0,hits=0;
            srcPeople.forEach(function(p){tSales+=parseFloat(p.sales)||0;tTarget+=parseFloat(p.target)||0;if(p.target>0&&p.sales/p.target>=1)hits++;});
            if (ts) ts.textContent = formatCurrency(tSales);
            if (aa) { var avg=tTarget>0?tSales/tTarget*100:0; aa.textContent=avg.toFixed(2)+'%'; aa.style.color=avg>=100?'var(--em)':avg>=90?'var(--am)':'var(--rose)'; }
            if (ht) ht.textContent = hits+' / '+srcPeople.length;
            if (tt) tt.textContent = formatCurrency(tTarget);
        }
    }

    // Update achievement hero
    updateAchievementHero();

    // Update person sidebar
    renderPersonSidebar();

    // Update toggle buttons
    document.querySelectorAll('.sum-toggle-btn').forEach(function(btn,i){
        btn.classList.toggle('active', (i===0&&mode==='current')||(i===1&&mode==='all'));
    });

    // Remove old details
    summaryContainer.querySelectorAll('.summary-details,.summary-toggle').forEach(function(el){el.remove();});
}

function updateAchievementHero() {
    var hero = document.getElementById('ach-hero-card');
    if (!hero) return;
    var person = window.appState.salespeople[0];
    if (!person || !person.name) { hero.style.display='none'; return; }
    var empTypeH = getEmployeeType(person.name);
    var monthH = ((document.getElementById('report-month')||{}).value||'JAN').toUpperCase();
    var yearH = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());

    if (empTypeH === 'Supervisor') {
        var tt = cwSupervisorTeamTotals(monthH, yearH);
        var teamAch = tt.teamTarget > 0 ? (tt.teamSales / tt.teamTarget) * 100 : 0;
        hero.style.display = 'block';
        var fill = document.getElementById('ach-progress-fill');
        var bigPct = document.getElementById('ach-big-pct');
        var name   = document.getElementById('ach-person-name');
        var sub    = document.getElementById('ach-sub-text');
        var badge  = document.getElementById('ach-badge');
        var color  = teamAch >= 100 ? 'var(--em)' : teamAch >= 90 ? 'var(--am)' : 'var(--rose)';
        var fillColor = teamAch>=100?'linear-gradient(90deg,#10b981,#34d399)':teamAch>=90?'linear-gradient(90deg,#f59e0b,#fbbf24)':'linear-gradient(90deg,#f43f5e,#fb7185)';
        if (fill)   { fill.style.width = tt.teamTarget > 0 ? Math.min(teamAch,100)+'%' : '0%'; fill.style.background=fillColor; }
        if (bigPct) { bigPct.textContent = formatCurrency(tt.teamSales); bigPct.style.color=color; }
        if (name) {
            name.textContent = person.name;
            var _tcHs = getRoleBadgeStyle(empTypeH);
            name.style.color = _tcHs.c;
        }
        if (sub)    sub.textContent = '';
        if (badge) {
            if (tt.teamTarget <= 0 && tt.teamSales <= 0) { badge.textContent='\u2014'; badge.style.background='#f1f5f9'; badge.style.color='#64748b'; }
            else if (tt.teamTarget <= 0) { badge.textContent='Team sales'; badge.style.background='#e0e7ff'; badge.style.color='#3730a3'; }
            else if (teamAch>=100){ badge.textContent='✅ Target Hit'; badge.style.background='var(--em-l)'; badge.style.color='var(--em)'; }
            else if (teamAch>=90){ badge.textContent='⚡ Almost There'; badge.style.background='var(--am-l)'; badge.style.color='var(--am)'; }
            else { badge.textContent='⚠️ Below Target'; badge.style.background='var(--ro-l)'; badge.style.color='var(--rose)'; }
        }
        return;
    }

    if (!person.target) { hero.style.display='none'; return; }
    hero.style.display = 'block';
    var ach = person.target > 0 ? (person.sales||0) / person.target * 100 : 0;
    var fill = document.getElementById('ach-progress-fill');
    var bigPct = document.getElementById('ach-big-pct');
    var name   = document.getElementById('ach-person-name');
    var sub    = document.getElementById('ach-sub-text');
    var badge  = document.getElementById('ach-badge');
    var color  = ach >= 100 ? 'var(--em)' : ach >= 90 ? 'var(--am)' : 'var(--rose)';
    var fillColor = ach>=100?'linear-gradient(90deg,#10b981,#34d399)':ach>=90?'linear-gradient(90deg,#f59e0b,#fbbf24)':'linear-gradient(90deg,#f43f5e,#fb7185)';
    if (fill)   { fill.style.width=Math.min(ach,100)+'%'; fill.style.background=fillColor; }
    if (bigPct) { bigPct.textContent=ach.toFixed(2)+'%'; bigPct.style.color=color; }
    if (name) {
        name.textContent = person.name;
        var _tcH = getRoleBadgeStyle(getEmployeeType(person.name));
        name.style.color = _tcH.c;
    }
    if (sub)    sub.textContent  = 'Target: '+formatCurrency(person.target||0)+' · Sales: '+formatCurrency(person.sales||0);
    if (badge) {
        if (ach>=100){ badge.textContent='✅ Target Hit'; badge.style.background='var(--em-l)'; badge.style.color='var(--em)'; }
        else if (ach>=90){ badge.textContent='⚡ Almost There'; badge.style.background='var(--am-l)'; badge.style.color='var(--am)'; }
        else { badge.textContent='⚠️ Below Target'; badge.style.background='var(--ro-l)'; badge.style.color='var(--rose)'; }
    }
}

function getBaseConfiguredPeople() {
    var configPeople = Object.keys(window.appState.config.base_salaries || {});
    if (configPeople.length === 0) {
        configPeople = window.appState.salespeople.filter(function(p) { return p.name; }).map(function(p) { return p.name; });
    }
    if (typeof isEmployeeActive === 'function') {
        configPeople = configPeople.filter(function(n) { return isEmployeeActive(n); });
    }
    return configPeople;
}

function getCalcConfiguredPeople() {
    var configPeople = getBaseConfiguredPeople();
    var groupSel = document.getElementById('calc-group-select');
    var selectedGroup = groupSel ? groupSel.value : 'ALL';
    if (selectedGroup !== 'ALL') {
        configPeople = configPeople.filter(function(n) { return getEmployeeType(n) === selectedGroup; });
    }
    var typeOrder = { 'Sales': 0, 'Supervisor': 1, 'Support Staff': 2 };
    return configPeople.slice().sort(function(a, b) {
        var tA = typeOrder[getEmployeeType(a)] !== undefined ? typeOrder[getEmployeeType(a)] : 3;
        var tB = typeOrder[getEmployeeType(b)] !== undefined ? typeOrder[getEmployeeType(b)] : 3;
        if (tA !== tB) return tA - tB;
        return a.localeCompare(b);
    });
}

function populateCalcPersonSelect(preferredName) {
    var sel = document.getElementById('calc-person-select');
    if (!sel) return null;
    var people = getCalcConfiguredPeople();
    if (people.length === 0) {
        sel.innerHTML = '<option value="">— No person —</option>';
        sel.value = '';
        return null;
    }
    var curName = preferredName
        || (window.appState.salespeople[0] && window.appState.salespeople[0].name)
        || sel.value;
    sel.innerHTML = people.map(function(n) {
        return '<option value="' + n.replace(/"/g, '&quot;') + '">' + n + '</option>';
    }).join('');
    var match = people.find(function(n) { return n.toUpperCase() === (curName || '').toUpperCase(); });
    var chosen = match || people[0];
    sel.value = chosen;
    return chosen;
}

function saveCurrentCalcPersonBeforeSwitch() {
    var curPerson = window.appState.salespeople[0];
    var curNameEl = document.getElementById('name-0');
    var curNameDisp = document.getElementById('card-name-text-0');
    var curName = (curPerson && curPerson.name) ? curPerson.name
        : (curNameDisp && curNameDisp.textContent !== '—') ? curNameDisp.textContent
        : (curNameEl ? curNameEl.value : '');
    if (!curName) return;

    function getField(id) {
        var el = document.getElementById(id + '-0');
        if (!el) return 0;
        if (el.disabled) {
            var sp = window.appState.salespeople[0];
            if (id === 'target' && sp && sp.target) return sp.target;
            if (id === 'collection-target' && sp && sp.collectionTarget) return sp.collectionTarget;
            if (id === 'call-target' && sp && sp.callTarget) return sp.callTarget;
        }
        return parseFloat(el.value) || 0;
    }
    var curTarget = getField('target');
    var curSales = getField('sales');
    if (!(curTarget > 0 || curSales > 0)) return;

    var mon = ((document.getElementById('report-month') || {}).value || '').toUpperCase();
    var yr = ((document.getElementById('report-year') || {}).value || '') || String(new Date().getFullYear());
    var mKey = mon + '-' + yr;
    var hist = window.appState.config.reportHistory || [];
    var hIdx = hist.findIndex(function(r) { return (r.month || '').toUpperCase() === mKey || (r.month || '').toUpperCase() === mon; });
    if (hIdx === -1) { hist.push({ month: mKey, data: [] }); hIdx = hist.length - 1; }
    if (!hist[hIdx].data) hist[hIdx].data = [];
    var pIdx2 = hist[hIdx].data.findIndex(function(p) { return (p.name || '').toUpperCase() === curName.toUpperCase(); });
    var saveObj = {
        name: curName.toUpperCase(),
        target: curTarget,
        sales: curSales,
        collectionTarget: getField('collection-target'),
        collectionAmount: getField('collection-amount'),
        callTarget: getField('call-target'),
        callActual: getField('call-actual')
    };
    if (pIdx2 >= 0) hist[hIdx].data[pIdx2] = saveObj;
    else hist[hIdx].data.push(saveObj);
    dbSave('reportHistory', hist).catch(function() {});
    saveConfig();
}

function selectCalcPerson(name, options) {
    options = options || {};
    if (!name) return;
    var curPerson = window.appState.salespeople[0];
    var curName = (curPerson && curPerson.name) || (document.getElementById('name-0') || {}).value || '';
    if (!options.force && curName && curName.toUpperCase() === name.toUpperCase()) return;

    if (curName && curName.toUpperCase() !== name.toUpperCase()) {
        saveCurrentCalcPersonBeforeSwitch();
    }

    var mon = ((document.getElementById('report-month') || {}).value || '').toUpperCase();
    var yr = ((document.getElementById('report-year') || {}).value || '') || String(new Date().getFullYear());
    var mKey = mon + '-' + yr;
    var hist = window.appState.config.reportHistory || [];
    var hEntry = hist.find(function(r) { return (r.month || '').toUpperCase() === mKey; })
        || hist.find(function(r) { return (r.month || '').toUpperCase() === mon; });
    var pd = hEntry && hEntry.data ? hEntry.data.find(function(p) { return (p.name || '').toUpperCase() === name.toUpperCase(); }) : null;

    var nameEl = document.getElementById('name-0');
    if (nameEl) nameEl.value = name;
    var nameText = document.getElementById('card-name-text-0');
    var avatarEl = document.getElementById('card-avatar-0');
    if (nameText) nameText.textContent = name;
    if (avatarEl) avatarEl.textContent = name ? name[0] : '?';

    function setField(id, v) {
        var el = document.getElementById(id + '-0');
        if (el) el.value = (v != null && v !== '' && v !== 0) ? v : '';
    }
    setField('sales', pd ? pd.sales : '');
    setField('collection-amount', pd ? pd.collectionAmount : '');
    setField('call-actual', pd ? pd.callActual : '');

    if (window.appState.salespeople.length > 0) {
        window.appState.salespeople[0].name = name;
        if (pd) {
            window.appState.salespeople[0].target = parseFloat(pd.target) || 0;
            window.appState.salespeople[0].collectionTarget = parseFloat(pd.collectionTarget) || 0;
            window.appState.salespeople[0].callTarget = parseFloat(pd.callTarget) || 0;
        }
    }

    var pSel = document.getElementById('calc-person-select');
    if (pSel && pSel.value.toUpperCase() !== name.toUpperCase()) pSel.value = name;

    if (typeof applyPersonTarget === 'function') applyPersonTarget(0);
    updateSalespersonData(0);
}

function onCalcPersonChange() {
    var sel = document.getElementById('calc-person-select');
    if (sel && sel.value) selectCalcPerson(sel.value, { force: true });
}

function onCalcGroupChange() {
    var name = populateCalcPersonSelect();
    if (name) selectCalcPerson(name, { force: true });
}

function renderPersonSidebar() {
    var cur = window.appState.salespeople[0] && window.appState.salespeople[0].name;
    populateCalcPersonSelect(cur);
}



function setSummaryMode(mode) {
    window._summaryMode = mode;
    updateSummaryView();
}


// ==================== COMMISSION & INCENTIVE Page ====================

function initCommissionView() {
    console.log('💰 Initializing Commission & Incentive page');
    renderCommissionConfigs();
}

function renderCommissionConfigs(selectedName) {
    const container = document.getElementById('commission-config-container');
    if (!container) { console.error('Commission config container not found'); return; }
    const people = Object.keys(window.appState.config.base_salaries || {});
    if (!selectedName) { const sel=document.getElementById('commission-person-select'); selectedName=sel?sel.value:'__global__'; }
    function getPCfg(gk,pk) {
        const nu=selectedName&&selectedName!=='__global__'?selectedName.toUpperCase():null;
        if(nu&&window.appState.config[pk]&&window.appState.config[pk][nu]) return JSON.parse(JSON.stringify(window.appState.config[pk][nu]));
        return JSON.parse(JSON.stringify(window.appState.config[gk]||[]));
    }
    const commissionRates     = getPCfg('monthly_commission_rates','person_commission_rates');
    const quarterlyIncentive  = getPCfg('quarterly_incentive','person_quarterly_incentive');
    const collectionIncentive = getPCfg('collection_incentive','person_collection_incentive');
    const activeCallIncentive = getPCfg('active_call_incentive','person_call_incentive');
    const sEnc = encodeURIComponent(selectedName||'__global__');
    const isP  = selectedName && selectedName !== '__global__';
    const hasOv= isP && ['person_commission_rates','person_quarterly_incentive','person_collection_incentive','person_call_incentive'].some(k=>window.appState.config[k]&&window.appState.config[k][selectedName.toUpperCase()]);
    const ddOpts = ['<option value="__global__"'+(selectedName==='__global__'?' selected':'')+'>🏢 Company Rate</option>'].concat(people.map(n=>'<option value="'+n+'"'+(n===selectedName?' selected':'')+'>'+n+'</option>')).join('');
    const ddHtml = '<div class="mb-6 flex flex-wrap items-center gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">Configure for</label>'
        + '<select id="commission-person-select" onchange="renderCommissionConfigs(this.value)" class="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900" style="min-width:220px;">'
        + ddOpts + '</select></div>'
        + (isP ? '<div class="mt-5">'+(hasOv?'<span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">✏️ Personal config</span><button onclick="clearPersonCommissionConfig(\'' + sEnc + '\')" class="ml-2 px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm">Reset to Company</button>':'<span class="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">Using Company Rate</span>')+'</div>':'')
        + '</div>';

    // Temporarily set config to per-person values so existing render code works
    const origCR=window.appState.config.monthly_commission_rates, origQI=window.appState.config.quarterly_incentive;
    const origCI=window.appState.config.collection_incentive, origAI=window.appState.config.active_call_incentive;
    window.appState.config.monthly_commission_rates=commissionRates;
    window.appState.config.quarterly_incentive=quarterlyIncentive;
    window.appState.config.collection_incentive=collectionIncentive;
    window.appState.config.active_call_incentive=activeCallIncentive;

    container.innerHTML = ddHtml + `
        <div class="space-y-6">
            <!-- Monthly commission settings -->
            <div class="bg-blue-50 rounded-lg p-2 border border-blue-200">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold">\u{1F4B0} Monthly Commission Rates</h3>
                    <button onclick="addCommissionTier('${sEnc}')"
                            class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        \u2795 Add Tier
                    </button>
                </div>
                <div class="space-y-3" id="commission-rates-container">
                    ${commissionRates.map((tier, index) => `
                        <div class="bg-white p-3 rounded border border-gray-300">
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">Tier ${index + 1}:</span>
                                    <input type="text" value="${tier.label || ''}"
                                           onchange="updateCommissionLabel(${index}, this.value, '${sEnc}')"
                                           class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm" placeholder="Label">
                                </div>
                                <button onclick="removeCommissionTier(${index}, '${sEnc}')"
                                        class="text-red-500 hover:text-red-700 text-sm px-2">\u2715</button>
                            </div>
                            <div class="grid grid-cols-3 gap-3">
                                <div><label class="text-xs text-gray-500">Min %</label>
                                    <input type="number" value="${tier.min}" step="0.01"
                                           onchange="updateCommissionTier(${index}, 'min', this.value, '${sEnc}')"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm"></div>
                                <div><label class="text-xs text-gray-500">Max %</label>
                                    <input type="number" value="${tier.max}" step="0.01"
                                           onchange="updateCommissionTier(${index}, 'max', this.value, '${sEnc}')"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm"></div>
                                <div><label class="text-xs text-gray-500">Rate %</label>
                                    <input type="number" value="${(tier.rate * 100).toFixed(2)}" step="0.01"
                                           onchange="updateCommissionTier(${index}, 'rate', this.value/100, '${sEnc}')"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            ${[
                ['quarterly',   '\u{1F3C6} Quarterly Incentive',    'bg-green-50',  'border-green-200',  quarterlyIncentive],
                ['collection',  '\u{1F4B5} Collection Incentive',   'bg-yellow-50', 'border-yellow-200', collectionIncentive],
                ['active_call', '\u{1F4DE} Active Call Incentive',  'bg-purple-50', 'border-purple-200', activeCallIncentive]
            ].map(([type, title, bg, border, tiers]) => `
                <div class="${bg} rounded-lg p-4 border ${border}">
                    <div class="flex justify-between items-center mb-3">
                        <h3 class="text-lg font-bold">${title}</h3>
                        <button onclick="addIncentiveTier('${type}', '${sEnc}')"
                                class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">\u2795 Add Tier</button>
                    </div>
                    <div class="space-y-2">
                        ${tiers.map((tier, i) => `
                            <div class="bg-white p-3 rounded border border-gray-300 flex items-center gap-3">
                                <input type="text" value="${tier.label||''}" placeholder="Label"
                                       onchange="updateIncentiveLabel('${type}', ${i}, this.value, '${sEnc}')"
                                       class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm">
                                <div class="flex items-center gap-1"><label class="text-xs text-gray-500">Min%</label>
                                    <input type="number" value="${tier.min}" step="1"
                                           onchange="updateIncentiveTier('${type}', ${i}, 'min', this.value, '${sEnc}')"
                                           class="w-20 px-2 py-1 border border-gray-300 rounded text-sm"></div>
                                <div class="flex items-center gap-1"><label class="text-xs text-gray-500">RM</label>
                                    <input type="number" value="${tier.incentive}" step="50"
                                           onchange="updateIncentiveTier('${type}', ${i}, 'incentive', this.value, '${sEnc}')"
                                           class="w-24 px-2 py-1 border border-gray-300 rounded text-sm"></div>
                                <button onclick="removeIncentiveTier('${type}', ${i}, '${sEnc}')"
                                        class="text-red-500 hover:text-red-700 text-sm px-2">\u2715</button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('')}
        </div>
    `;

    // Restore original config
    window.appState.config.monthly_commission_rates=origCR; window.appState.config.quarterly_incentive=origQI;
    window.appState.config.collection_incentive=origCI; window.appState.config.active_call_incentive=origAI;
    console.log('\u2705 Commission & Incentive page rendering completed');
}

function clearPersonCommissionConfig(pEnc) {
    const nu = decodeURIComponent(pEnc).toUpperCase();
    ['person_commission_rates','person_quarterly_incentive','person_collection_incentive','person_call_incentive'].forEach(k => {
        if (window.appState.config[k] && window.appState.config[k][nu]) delete window.appState.config[k][nu];
    });
    saveConfig(); renderCommissionConfigs(decodeURIComponent(pEnc)); showToast('\u2705','Reset to Company rate');
}

// Add commission Tier
function addCommissionTier(pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const gk='monthly_commission_rates', pk='person_commission_rates';
    let rates;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));rates=window.appState.config[pk][nu];}
    else{if(!window.appState.config[gk])window.appState.config[gk]=[];rates=window.appState.config[gk];}
    const last=rates.length>0?rates[rates.length-1]:{max:0}; const newMin=(last.max||0)+0.01;
    rates.push({min:newMin,max:newMin+9.99,rate:0,label:newMin.toFixed(0)+'%+'});
    saveConfig(); showToast('\u2705','New commission Tier added successfully'); renderCommissionConfigs(pN);
}

// Remove commission Tier
function removeCommissionTier(index, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const gk='monthly_commission_rates', pk='person_commission_rates';
    let rates;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));rates=window.appState.config[pk][nu];}
    else rates=window.appState.config[gk];
    if(!rates||rates.length<=1){showToast('\u26a0\ufe0f','Cannot delete the last Tier');return;}
    rates.splice(index,1); saveConfig(); renderCommissionConfigs(pN); showToast('\u2705','Tier deleted');
}

// Add incentive Tier
function addIncentiveTier(type, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const tm={quarterly:'quarterly_incentive',collection:'collection_incentive',active_call:'active_call_incentive'};
    const pm={quarterly:'person_quarterly_incentive',collection:'person_collection_incentive',active_call:'person_call_incentive'};
    const gk=tm[type], pk=pm[type]; if(!gk)return;
    let tiers;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));tiers=window.appState.config[pk][nu];}
    else{if(!window.appState.config[gk])window.appState.config[gk]=[];tiers=window.appState.config[gk];}
    const last=tiers.length>0?tiers[0]:{min:100};
    tiers.unshift({min:Math.max(0,(last.min||0)-10),incentive:0,label:'New Tier'});
    saveConfig(); showToast('\u2705','New '+type+' Tier added successfully'); renderCommissionConfigs(pN);
}

// Remove incentive Tier
function removeIncentiveTier(type, index, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const tm={quarterly:'quarterly_incentive',collection:'collection_incentive',active_call:'active_call_incentive'};
    const pm={quarterly:'person_quarterly_incentive',collection:'person_collection_incentive',active_call:'person_call_incentive'};
    const gk=tm[type], pk=pm[type]; if(!gk)return;
    let tiers;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));tiers=window.appState.config[pk][nu];}
    else tiers=window.appState.config[gk];
    if(!tiers||tiers.length<=1){showToast('\u26a0\ufe0f','Cannot delete the last Tier');return;}
    tiers.splice(index,1); saveConfig(); renderCommissionConfigs(pN); showToast('\u2705','Tier deleted');
}

// Update commission label
function updateCommissionLabel(index, value, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const gk='monthly_commission_rates', pk='person_commission_rates';
    let rates;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));rates=window.appState.config[pk][nu];}
    else rates=window.appState.config[gk];
    if(!rates||!rates[index])return; rates[index].label=value; saveConfig();
}

// Update commission tier
function updateCommissionTier(index, field, value, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const gk='monthly_commission_rates', pk='person_commission_rates';
    let rates;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));rates=window.appState.config[pk][nu];}
    else rates=window.appState.config[gk];
    if(!rates||!rates[index])return; rates[index][field]=parseFloat(value)||0; saveConfig(); renderCommissionConfigs(pN);
}

// Update incentive label
function updateIncentiveLabel(type, index, value, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const tm={quarterly:'quarterly_incentive',collection:'collection_incentive',active_call:'active_call_incentive'};
    const pm={quarterly:'person_quarterly_incentive',collection:'person_collection_incentive',active_call:'person_call_incentive'};
    const gk=tm[type], pk=pm[type]; if(!gk)return;
    let tiers;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));tiers=window.appState.config[pk][nu];}
    else tiers=window.appState.config[gk];
    if(!tiers||!tiers[index])return; tiers[index].label=value; saveConfig();
}

// Update incentive tier
function updateIncentiveTier(type, index, field, value, pEnc) {
    const pN=pEnc?decodeURIComponent(pEnc):'__global__', nu=pN!=='__global__'?pN.toUpperCase():null;
    const tm={quarterly:'quarterly_incentive',collection:'collection_incentive',active_call:'active_call_incentive'};
    const pm={quarterly:'person_quarterly_incentive',collection:'person_collection_incentive',active_call:'person_call_incentive'};
    const gk=tm[type], pk=pm[type]; if(!gk)return;
    let tiers;
    if(nu){if(!window.appState.config[pk])window.appState.config[pk]={};if(!window.appState.config[pk][nu])window.appState.config[pk][nu]=JSON.parse(JSON.stringify(window.appState.config[gk]||[]));tiers=window.appState.config[pk][nu];}
    else tiers=window.appState.config[gk];
    if(!tiers||!tiers[index])return; tiers[index][field]=parseFloat(value)||0; saveConfig(); renderCommissionConfigs(pN);
}

// ==================== Other Page Functions ====================

// Salary & Allowances page
function initSalaryView() {
    renderSalaryConfigs();
}

function renderSalaryConfigs(selectedName) {
    const container = document.getElementById('salary-config-container');
    if (!container) return;
    const people = Object.keys(window.appState.config.base_salaries || {});
    if (people.length === 0) { container.innerHTML = '<div class="text-center py-12 text-gray-500"><p>No salespeople configured yet</p></div>'; return; }
    if (!selectedName) { const sel=document.getElementById('salary-person-select'); selectedName=sel?sel.value:people[0]; }
    if (!selectedName||!people.includes(selectedName)) selectedName=people[0];
    const opts=people.map(n=>'<option value="'+n+'"'+(n===selectedName?' selected':'')+'>'+n+'</option>').join('');
    const dropdown='<div class="mb-6"><label class="block text-xs font-medium text-gray-700 mb-1">Select Salesperson</label><select id="salary-person-select" onchange="renderSalaryConfigs(this.value)" class="w-full px-3 py-1 border border-gray-300 rounded-lg focus:border-blue-500 bg-white text-gray-900" style="max-width:320px;">'+opts+'</select></div>';
    container.innerHTML = dropdown + people.filter(n=>n===selectedName).map(name => {
        const nameUpper = name.toUpperCase();
        const salary = window.appState.config.base_salaries[nameUpper] || 0;
        const allowances = window.appState.config.allowances[nameUpper] || {};
        const deductions = window.appState.config.deductions[nameUpper] || {};
        const totalIncome = salary + Object.values(allowances).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        const _scMon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][new Date().getMonth()];
        const _scYear = String(new Date().getFullYear());
        const _scEpf = (typeof computeEpf === 'function') ? computeEpf(nameUpper, totalIncome, _scMon, _scYear) : { employee: Math.round(totalIncome*0.11*100)/100, empPct: 11 };
        const epfRate = (_scEpf.empPct != null) ? Math.round(_scEpf.empPct * 100) / 100 : 11;
        const epfAmount = Math.round(_scEpf.employee * 100) / 100;
        const _scSocso = (typeof computeSocso === 'function') ? computeSocso(nameUpper, totalIncome, _scMon, _scYear) : { employee: Math.round(totalIncome*0.005*100)/100 };
        const socsoAmount = Math.round(_scSocso.employee * 100) / 100;
        const _scEis = (typeof computeEis === 'function') ? computeEis(nameUpper, totalIncome, _scMon, _scYear) : { employee: 0 };
        const eisAmount = Math.round(_scEis.employee * 100) / 100;
        
        return `
            <div class="border border-gray-300 rounded-lg p-4 mb-4 bg-white">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">👤 ${name}</h3>
                    <button onclick="deleteSalespersonConfig('${name}')" 
                            class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                        🗑️ Delete
                    </button>
                </div>
                
                <div class="mb-2">
                    <label class="block mb-2">Base Salary (RM)</label>
                    <input type="number" 
                           value="${salary}" 
                           onchange="updateSalary('${name}', this.value)" 
                           class="w-full px-3 py-1 border border-gray-300 rounded">
                </div>
                
                <div class="mb-2">
                    <label class="block mb-2">Allowances (RM)</label>
                    <div class="grid grid-cols-2 gap-3">
                        ${Object.entries(allowances).map(([key, value]) => `
                            <div>
                                <label class="text-xs">${key}</label>
                                <input type="number" 
                                       value="${value}" 
                                       onchange="updateAllowance('${name}', '${key}', this.value)"
                                       class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div>
                    <label class="block mb-2">Deductions</label>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs">EPF Rate (auto %)</label>
                            <input type="number" 
                                   value="${epfRate}" 
                                   readonly 
                                   title="Auto from EPF Third Schedule (set DOB / nationality in Salary Setup)"
                                   class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100">
                        </div>
                        <div>
                            <label class="text-xs">EPF Amount (RM)</label>
                            <input type="number" 
                                   value="${epfAmount}" 
                                   readonly 
                                   class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100">
                        </div>
                        <div>
                            <label class="text-xs">SOCSO (RM, auto)</label>
                            <input type="number" 
                                   value="${socsoAmount}" 
                                   readonly 
                                   class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100">
                        </div>
                        <div>
                            <label class="text-xs">PCB (RM)</label>
                            <input type="number" 
                                   value="${deductions.PCB || 0}" 
                                   onchange="updateDeduction('${name}', 'PCB', this.value)" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded">
                        </div>
                        <div>
                            <label class="text-xs">EIS (RM, auto 0.2%)</label>
                            <input type="number" 
                                   value="${eisAmount}" 
                                   readonly 
                                   title="Auto: employee 0.2%, capped RM6,000; exempt 60+ / foreigners"
                                   class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Add new salesperson
function addNewPerson(nameOverride, typeOverride, profileOverride) {
    var nameVal = nameOverride;
    if (!nameVal) {
        var ni = document.getElementById('new-person-name');
        nameVal = ni ? (ni.value || '').trim().toUpperCase() : '';
    }
    if (!nameVal) { showToast('\u26a0\ufe0f', 'Please enter a name'); return; }
    var nameUpper = nameVal.toUpperCase();
    if (window.appState.config.base_salaries && window.appState.config.base_salaries[nameUpper]) {
        showToast('\u26a0\ufe0f', nameUpper + ' already exists'); return;
    }
    if (!window.appState.config.base_salaries) window.appState.config.base_salaries = {};
    if (!window.appState.config.allowances)    window.appState.config.allowances    = {};
    if (!window.appState.config.deductions)    window.appState.config.deductions    = {};
    if (!window.appState.config.deductionRates)window.appState.config.deductionRates= {};
    window.appState.config.base_salaries[nameUpper]  = 1700;
    window.appState.config.allowances[nameUpper]      = { HP:0, CAR:0, 'LOCAL FUEL':0, 'OUTSTATION FUEL':0, HOUSING:0, FOOD:0, OTHERS:0 };
    window.appState.config.deductions[nameUpper]      = { EPF:187, SOCSO:8.5, PCB:0, EIS:0 };
    window.appState.config.deductionRates[nameUpper]  = { EPF_RATE:11 };
    // Save employee type
    if (typeOverride) setEmployeeType(nameUpper, typeOverride);
    if (profileOverride && typeof setEmployeeProfile === 'function') {
        setEmployeeProfile(nameUpper, profileOverride);
    }
    saveConfig();
    renderPeopleList();
    // Clear search input so it's ready for next use
    var si = document.getElementById('people-search');
    if (si) { si.value = ''; }
    showSalaryModal(nameUpper);
}

// ==================== Batch Export (Multi-Month) ====================

function showBatchExportModal() {
    // Pro feature check
    if (!canUseProFeature()) {
        showLicenseModal('Batch Export');
        return;
    }

    // Check data sources
    const hasExcelData = window.appState.importedExcelData && window.appState.importedExcelData.length > 0;
    const hasHistory = window.appState.config.reportHistory && window.appState.config.reportHistory.length > 0;
    const hasCurrent = window.appState.salespeople && window.appState.salespeople.length > 0 && window.appState.salespeople.some(p => p.name && p.sales > 0);

    if (!hasExcelData && !hasHistory && !hasCurrent) {
        showToast('⚠️', 'No data available. Please import Excel or enter data first.');
        return;
    }

    // Find which months have data
    const availableMonths = new Set();
    if (hasExcelData) {
        window.appState.importedExcelData.forEach(p => {
            (p.months || []).forEach(m => availableMonths.add(m.month));
        });
    }
    if (hasHistory) {
        window.appState.config.reportHistory.forEach(r => {
            if (r.month) availableMonths.add(bareMonth(r.month));
        });
    }
    if (hasCurrent) {
        const curMonth = (document.getElementById('report-month')?.value || '').toUpperCase();
        if (curMonth) availableMonths.add(curMonth);
    }

    const allMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    // Remove existing modal
    const existing = document.getElementById('batch-export-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'batch-export-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;padding:0;max-width:500px;width:95%;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#f97316,#ea580c);padding:20px 24px;color:white;">
                <h3 style="margin:0;font-size:18px;font-weight:700;">📦 Batch Export — Select Months</h3>
                <p style="margin:6px 0 0;font-size:12px;opacity:0.9;">Each selected month generates an independent Excel file</p>
            </div>

            <div style="padding:20px 24px;">
                <!-- Quick Select Buttons -->
                <div style="margin-bottom:16px;">
                    <p style="font-size:12px;color:#6b7280;margin:0 0 8px;font-weight:600;">QUICK SELECT</p>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        <button onclick="batchSelectMonths(['JAN','FEB','MAR'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">Q1</button>
                        <button onclick="batchSelectMonths(['APR','MAY','JUN'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">Q2</button>
                        <button onclick="batchSelectMonths(['JUL','AUG','SEP'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">Q3</button>
                        <button onclick="batchSelectMonths(['OCT','NOV','DEC'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">Q4</button>
                        <div style="width:1px;height:28px;background:#e5e7eb;margin:0 2px;"></div>
                        <button onclick="batchSelectMonths(['JAN','FEB','MAR','APR','MAY','JUN'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">H1 (Jan-Jun)</button>
                        <button onclick="batchSelectMonths(['JUL','AUG','SEP','OCT','NOV','DEC'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">H2 (Jul-Dec)</button>
                        <button onclick="batchSelectMonths(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;transition:all 0.2s;">Full Year</button>
                        <button onclick="batchSelectMonths([])" class="batch-quick-btn" style="padding:6px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:12px;font-weight:600;color:#ef4444;transition:all 0.2s;">Clear</button>
                    </div>
                </div>

                <!-- Month Checkboxes -->
                <div style="margin-bottom:16px;">
                    <p style="font-size:12px;color:#6b7280;margin:0 0 8px;font-weight:600;">SELECT MONTHS</p>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
                        ${allMonths.map(m => {
                            const hasData = availableMonths.has(m);
                            return `
                                <label style="display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid ${hasData ? '#d1d5db' : '#f3f4f6'};border-radius:8px;cursor:${hasData ? 'pointer' : 'not-allowed'};background:${hasData ? '#fff' : '#f9fafb'};transition:all 0.2s;" 
                                       class="batch-month-label" data-month="${m}">
                                    <input type="checkbox" id="batch-${m}" value="${m}" ${hasData ? '' : 'disabled'} 
                                           onchange="updateBatchExportUI()"
                                           style="width:16px;height:16px;cursor:${hasData ? 'pointer' : 'not-allowed'};">
                                    <span style="font-size:13px;font-weight:600;color:${hasData ? '#1f2937' : '#d1d5db'};">${m}</span>
                                    ${hasData ? '<span style="font-size:9px;color:#10b981;">●</span>' : ''}
                                </label>
                            `;
                        }).join('')}
                    </div>
                    <p style="font-size:11px;color:#9ca3af;margin:6px 0 0;"><span style="color:#10b981;">●</span> = Data available</p>
                </div>

                <!-- Selected count -->
                <div id="batch-export-status" style="padding:10px 14px;background:#f0fdf4;border-radius:8px;margin-bottom:16px;font-size:13px;color:#166534;font-weight:500;">
                    No months selected
                </div>

                <!-- Buttons -->
                <div style="display:flex;gap:10px;justify-content:flex-end;">
                    <button onclick="closeBatchExportModal()" 
                            style="padding:10px 20px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;">
                        Cancel
                    </button>
                    <button id="batch-export-btn" onclick="executeBatchExport()" disabled
                            style="padding:10px 24px;border:none;border-radius:8px;background:#f97316;color:#fff;cursor:pointer;font-size:14px;font-weight:600;opacity:0.5;">
                        📦 Export Selected
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) closeBatchExportModal(); });
}

function closeBatchExportModal() {
    const modal = document.getElementById('batch-export-modal');
    if (modal) modal.remove();
}

function batchSelectMonths(months) {
    const allMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    allMonths.forEach(m => {
        const cb = document.getElementById('batch-' + m);
        if (cb && !cb.disabled) {
            cb.checked = months.includes(m);
        }
    });
    updateBatchExportUI();
}

function updateBatchExportUI() {
    const allMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const selected = allMonths.filter(m => {
        const cb = document.getElementById('batch-' + m);
        return cb && cb.checked;
    });

    const statusEl = document.getElementById('batch-export-status');
    const btnEl = document.getElementById('batch-export-btn');

    if (selected.length === 0) {
        statusEl.textContent = 'No months selected';
        statusEl.style.background = '#f3f4f6';
        statusEl.style.color = '#6b7280';
        btnEl.disabled = true;
        btnEl.style.opacity = '0.5';
    } else {
        statusEl.textContent = `${selected.length} month(s) selected: ${selected.join(', ')}`;
        statusEl.style.background = '#f0fdf4';
        statusEl.style.color = '#166534';
        btnEl.disabled = false;
        btnEl.style.opacity = '1';
    }

    // Highlight selected month labels
    document.querySelectorAll('.batch-month-label').forEach(label => {
        const m = label.dataset.month;
        const cb = document.getElementById('batch-' + m);
        if (cb && cb.checked) {
            label.style.borderColor = '#f97316';
            label.style.background = '#fff7ed';
        } else {
            label.style.borderColor = cb && !cb.disabled ? '#d1d5db' : '#f3f4f6';
            label.style.background = cb && !cb.disabled ? '#fff' : '#f9fafb';
        }
    });
}

async function executeBatchExport() {
    const allMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const selectedMonths = allMonths.filter(m => {
        const cb = document.getElementById('batch-' + m);
        return cb && cb.checked;
    });

    if (selectedMonths.length === 0) {
        showToast('⚠️', 'No months selected');
        return;
    }

    closeBatchExportModal();

    const excelData = window.appState.importedExcelData || [];
    const history = window.appState.config.reportHistory || [];
    const config = window.appState.config;
    const curMonth = (document.getElementById('report-month')?.value || '').toUpperCase();
    const year = new Date().getFullYear();

    // Build combined filename: commission_jan_feb_mar_2026.xlsx
    const monthsStr = selectedMonths.map(m => m.toLowerCase()).join('_');
    const combinedFilename = `commission_${monthsStr}_${year}.xlsx`;

    showToast('⏳', `Exporting ${selectedMonths.length} month(s)...`);

    let successCount = 0;
    let failCount = 0;
    const allMonthsData = []; // collect for batch summary

    for (let i = 0; i < selectedMonths.length; i++) {
        const month = selectedMonths[i];
        try {
            // Build sales data for this month
            const salesData = buildSalesDataForMonth(month, excelData, history, config, curMonth);

            if (!salesData || salesData.length === 0) {
                console.warn(`⚠️ No data for ${month}, skipping`);
                failCount++;
                continue;
            }

            // Store for batch summary
            allMonthsData.push({ month: month, salespeople: salesData });

            // Generate filename for this month
            let suggestedFilename;
            if (selectedMonths.length === 1) {
                suggestedFilename = combinedFilename;
            } else {
                suggestedFilename = `commission_${month.toLowerCase()}_${year}.xlsx`;
            }

            // Call electron API to generate Excel
            const result = await window.electronAPI.generateSalaryTemplate({
                salespeople: salesData,
                config: config,
                month: month,
                suggestedFilename: suggestedFilename
            });

            if (result.success) {
                successCount++;

                // Increment trial export count
                if (!isPro() && window.electronAPI.incrementExport) {
                    await window.electronAPI.incrementExport();
                }

                // Save to history
                if (!window.appState.config.reportHistory) {
                    window.appState.config.reportHistory = [];
                }
                const totalCommission = salesData.reduce((sum, p) => sum + (p.totalCommission || 0), 0);
                window.appState.config.reportHistory.push({
                    month: month,
                    timestamp: new Date().toISOString(),
                    count: salesData.length,
                    totalCommission: totalCommission,
                    data: salesData
                });
            } else if (result.message === 'Cancelled') {
                showToast('ℹ️', 'Export cancelled');
                break;
            } else {
                failCount++;
                console.error(`❌ Export failed for ${month}:`, result.error);
            }
        } catch (e) {
            failCount++;
            console.error(`❌ Error exporting ${month}:`, e);
        }
    }

    // ── Generate Batch Summary Excel (all months combined) ──
    if (allMonthsData.length >= 2 && window.electronAPI.generateBatchSummary) {
        try {
            showToast('⏳', 'Generating combined summary...');
            const summaryFilename = `commission_summary_${monthsStr}_${year}.xlsx`;
            const summaryResult = await window.electronAPI.generateBatchSummary({
                monthsData: allMonthsData,
                suggestedFilename: summaryFilename
            });
            if (summaryResult.success) {
                successCount++;
                console.log('✅ Batch summary generated');
            } else if (summaryResult.message !== 'Cancelled') {
                console.warn('⚠️ Batch summary skipped or failed');
            }
        } catch (e) {
            console.error('❌ Batch summary error:', e);
        }
    }

    // Save updated history
    if (successCount > 0) {
        await saveConfig();
        if (typeof loadQuickCalculateHistory === 'function') loadQuickCalculateHistory();
    }

    // Show result
    if (successCount > 0 && failCount === 0) {
        showToast('✅', `Successfully exported ${successCount} file(s)!`);
    } else if (successCount > 0) {
        showToast('⚠️', `Exported ${successCount} file(s), ${failCount} month(s) skipped`);
    } else {
        showToast('❌', 'Export failed — no data found for selected months');
    }
}

// Build sales data for a specific month from all available sources
function buildSalesDataForMonth(month, excelData, history, config, currentCardMonth) {
    const monthUpper = month.toUpperCase();
    const configuredPeople = Object.keys(config.base_salaries || {});
    const quarterEndMonths = ['MAR','JUN','SEP','DEC'];
    const allMonths = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthIdx = allMonths.indexOf(monthUpper);
    const isQuarterEnd = quarterEndMonths.includes(monthUpper);

    // Helper: get person data from Excel
    function getExcelMonth(personName, m) {
        const p = excelData.find(x => (x.name || '').toUpperCase() === personName.toUpperCase());
        if (!p) return null;
        return p.months.find(x => x.month === m) || null;
    }

    // Helper: get person data from history
    function getHistoryMonth(personName, m) {
        const entries = history.filter(r => (r.month || '').toUpperCase() === m);
        if (entries.length === 0) return null;
        return (entries[entries.length - 1].data || []).find(p => (p.name || '').toUpperCase() === personName.toUpperCase()) || null;
    }

    // Helper: get data from either source (Excel first, then history)
    function getMonthData(personName, m) {
        const ex = getExcelMonth(personName, m);
        if (ex) return { target: parseFloat(ex.target) || 0, sales: parseFloat(ex.sales) || 0, collection: parseFloat(ex.collection) || 0, source: 'excel' };
        const hi = getHistoryMonth(personName, m);
        if (hi) return { target: parseFloat(hi.target) || 0, sales: parseFloat(hi.sales) || 0, collection: 0, source: 'history' };
        return null;
    }

    // Collect all person names from all sources
    const personNames = new Set();
    excelData.forEach(p => personNames.add((p.name || '').toUpperCase()));
    configuredPeople.forEach(n => personNames.add(n.toUpperCase()));

    // If this is the currently displayed month, also use card data
    if (monthUpper === currentCardMonth) {
        window.appState.salespeople.forEach(p => {
            if (p.name) personNames.add(p.name.toUpperCase());
        });
    }

    const result = [];

    personNames.forEach(nameUpper => {
        let target = 0, sales = 0, collection = 0;

        // If this is current card month, try card data first
        if (monthUpper === currentCardMonth) {
            const cardPerson = window.appState.salespeople.find(p => (p.name || '').toUpperCase() === nameUpper);
            if (cardPerson && cardPerson.target > 0) {
                target = cardPerson.target;
                sales = cardPerson.sales;
                collection = cardPerson.collectionAmount || 0;
            }
        }

        // If no card data, try Excel/history
        if (target === 0) {
            const md = getMonthData(nameUpper, monthUpper);
            if (md) {
                target = md.target;
                sales = md.sales;
                collection = md.collection;
            }
        }

        // Skip if no data at all
        if (target === 0 && sales === 0) return;

        // Calculate commission
        const achievement = target > 0 ? (sales / target) * 100 : 0;
        const commission = calculateCommission(sales, target);

        // Collection incentive (from 2 months ago)
        let collTarget = 0;
        if (monthIdx >= 2) {
            const d = getMonthData(nameUpper, allMonths[monthIdx - 2]);
            if (d) collTarget = d.sales;
        } else if (monthIdx === 1) {
            const d = getMonthData(nameUpper, allMonths[11]);
            if (d) collTarget = d.sales;
        } else {
            const d = getMonthData(nameUpper, allMonths[10]);
            if (d) collTarget = d.sales;
        }
        const collAchievement = collTarget > 0 ? (collection / collTarget) * 100 : 0;
        const collectionIncentive = calculateIncentive(collAchievement, config.collection_incentive || []);

        // Active call incentive (no data in batch — set 0)
        const activeCallIncentive = 0;

        // Quarterly bonus
        let quarterlyBonus = 0;
        if (isQuarterEnd) {
            const qStart = monthIdx - 2;
            let qTarget = 0, qSales = 0;
            for (let i = qStart; i <= monthIdx; i++) {
                if (i < 0) continue;
                const qm = allMonths[i];
                if (qm === monthUpper) {
                    qTarget += target;
                    qSales += sales;
                } else {
                    const d = getMonthData(nameUpper, qm);
                    if (d) { qTarget += d.target; qSales += d.sales; }
                }
            }
            const qAchievement = qTarget > 0 ? (qSales / qTarget) * 100 : 0;
            quarterlyBonus = calculateIncentive(qAchievement, config.quarterly_incentive || []);
        }

        const totalCommission = commission + collectionIncentive + activeCallIncentive + quarterlyBonus;

        result.push({
            name: nameUpper,
            salary: config.base_salaries?.[nameUpper] || 0,
            allowances: config.allowances?.[nameUpper] || {},
            target: target,
            sales: sales,
            achievement: achievement,
            commission: commission,
            collectionIncentive: collectionIncentive,
            activeCallIncentive: activeCallIncentive,
            quarterlyBonus: quarterlyBonus,
            deductions: config.deductions?.[nameUpper] || {},
            totalCommission: totalCommission
        });
    });

    return result;
}

// ==================== Export Function ====================

// Export to Excel
async function exportTemplate() {
    try {
        // Check trial limit
        if (!isPro()) {
            const status = await checkLicenseStatus();
            if (status.status === 'expired') {
                showLicenseModal('Export Excel');
                return;
            }
        }

        showLoading('Generating Excel report...');
        
        const month = document.getElementById('report-month').value;
        
        if (window.appState.salespeople.length === 0) {
            hideLoading();
            showToast('⚠️', 'No sales data');
            return;
        }
        
        const salesData = window.appState.salespeople.map(person => {
            const nameUpper = person.name.toUpperCase();
            
            return {
                name: person.name || '',
                salary: window.appState.config.base_salaries?.[nameUpper] || 1700,
                allowances: window.appState.config.allowances?.[nameUpper] || {},
                sales: parseFloat(person.sales) || 0,
                target: parseFloat(person.target) || 0,
                commission: parseFloat(person.commission) || 0,
                collectionIncentive: parseFloat(person.collectionIncentive) || 0,
                activeCallIncentive: parseFloat(person.activeCallIncentive) || 0,
                quarterlyBonus: parseFloat(person.quarterlyBonus) || 0,
                deductions: window.appState.config.deductions?.[nameUpper] || {},
                totalCommission: parseFloat(person.totalCommission) || 0
            };
        });
        
        // Debug: Confirm allowances data
        salesData.forEach(p => {
            console.log(`📦 Export ${p.name} allowances:`, JSON.stringify(p.allowances));
        });
        
        const result = await window.electronAPI.generateSalaryTemplate({
            salespeople: salesData,
            config: window.appState.config,
            month: month
        });
        
        hideLoading();
        
        if (result.success) {
            showToast('✅', `Successfully exported ${salesData.length} records!`);
            
            // Increment trial export count
            if (!isPro() && window.electronAPI.incrementExport) {
                await window.electronAPI.incrementExport();
                await checkLicenseStatus(); // refresh badge
            }
            
            if (!window.appState.config.reportHistory) {
                window.appState.config.reportHistory = [];
            }
            
            const totalCommission = salesData.reduce((sum, p) => sum + (p.totalCommission || 0), 0);
            
            window.appState.config.reportHistory.push({
                month: month,
                timestamp: new Date().toISOString(),
                count: salesData.length,
                totalCommission: totalCommission,
                data: salesData
            });
            
            saveConfig();
            loadQuickCalculateHistory();
        } else {
            showToast('❌', 'Export failed: ' + (result.error || result.message));
        }
    } catch (error) {
        hideLoading();
        console.error('Export error:', error);
        showToast('❌', 'Error: ' + error.message);
    }
}

// Save configuration
async function saveConfig() {
    try {
        if (window.electronAPI && window.electronAPI.saveConfig) {
            await window.electronAPI.saveConfig(window.appState.config);
        }
    } catch (error) {
        console.error('Failed to save configuration:', error);
    }
}

// ==================== Delete Salesperson Card ====================
function deleteSalespersonCard(id) {
    // Find the person name for the confirmation message
    var person = window.appState.salespeople.find(function(p) { return p.id === id; });
    var personName = (person && person.name) ? person.name : 'this salesperson';
    
    // Build confirmation modal
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
    var box = document.createElement('div');
    box.style.cssText = 'background:var(--paper);border-radius:16px;max-width:380px;width:100%;padding:24px;box-shadow:0 20px 60px rgba(8,15,26,.3);text-align:center;';
    box.innerHTML = '<div style="font-size:32px;margin-bottom:12px;">⚠️</div>'
        + '<div style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:8px;">Delete ' + personName + '?</div>'
        + '<div style="font-size:13px;color:#64748b;margin-bottom:20px;">This will remove the card and all entered data.</div>';
    var btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'padding:9px 24px;border:1.5px solid var(--line);border-radius:8px;background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;';
    var btnDelete = document.createElement('button');
    btnDelete.textContent = '🗑️ Delete';
    btnDelete.style.cssText = 'padding:9px 24px;border:none;border-radius:8px;background:#dc2626;color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;';
    btnRow.appendChild(btnCancel);
    btnRow.appendChild(btnDelete);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    btnCancel.addEventListener('click', function() { overlay.remove(); });
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    btnDelete.addEventListener('click', function() {
        overlay.remove();
        window.appState.salespeople = window.appState.salespeople.filter(function(p) { return p.id !== id; });
        renderSalespersonCards();
        showToast('🗑️', personName + ' removed');
    });
}

// ==================== Data Backup & Restore ====================

// Export full backup
async function exportFullBackup() {
    try {
        showLoading('Creating backup...');
        
        const backupData = {
            appVersion: '1.0.0',
            timestamp: new Date().toISOString(),
            config: window.appState.config,
            currentData: {
                salespeople: window.appState.salespeople,
                currentMonth: document.getElementById('report-month')?.value || '',
                currentView: window.appState.currentView
            }
        };
        
        // Generate JSON file
        const dataStr = JSON.stringify(backupData, null, 2);
        
        if (window.electronAPI && window.electronAPI.saveBackupFile) {
            const result = await window.electronAPI.saveBackupFile({
                data: dataStr,
                filename: `sales_calculator_backup_${new Date().toISOString().split('T')[0]}.json`
            });
            
            if (result.success) {
                showToast('✅', `Backup saved: ${result.path}`);
            } else {
                // Fallback: browser download
                downloadFile(dataStr, `sales_calculator_backup_${new Date().toISOString().split('T')[0]}.json`);
            }
        } else {
            // Pure web solution
            downloadFile(dataStr, `sales_calculator_backup_${new Date().toISOString().split('T')[0]}.json`);
        }
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        console.error('Backup error:', error);
        showToast('❌', 'Backup failed: ' + error.message);
    }
}

// Import backup
async function importBackup() {
    try {
        if (!confirm('Importing backup will replace all current data. Continue?')) {
            return;
        }
        
        const fileResult = await window.electronAPI.selectFile(['.json']);
        if (!fileResult || !fileResult.success) return;
        
        showLoading('Restoring backup...');
        
        // Read backup file
        const backupResult = await window.electronAPI.readBackupFile(fileResult.path);
        if (!backupResult.success) {
            throw new Error(backupResult.error || 'Failed to read backup file');
        }
        
        const backupData = JSON.parse(backupResult.data);
        
        // Verify backup data format
        if (!backupData.config || !backupData.timestamp) {
            throw new Error('Invalid backup file format');
        }
        
        // Restore configuration
        window.appState.config = backupData.config;
        
        // Restore current data (if exists)
        if (backupData.currentData) {
            window.appState.salespeople = backupData.currentData.salespeople || [];
            
            if (backupData.currentData.currentMonth) {
                const monthSelect = document.getElementById('report-month');
                if (monthSelect) monthSelect.value = backupData.currentData.currentMonth;
            }
            
            if (backupData.currentData.currentView) {
                window.appState.currentView = backupData.currentData.currentView;
            }
        }
        
        // Save configuration
        await saveConfig();
        
        // Refresh current view
        switchView(window.appState.currentView);
        
        // If it's Quick Calculate view, re-render cards
        if (window.appState.currentView === 'quick') {
            renderAllSalespeopleCards();
            rerunQuickCalcDerivedFields();
        }
        
        hideLoading();
        showToast('✅', `Backup restored from ${new Date(backupData.timestamp).toLocaleDateString()}`);
        
    } catch (error) {
        hideLoading();
        console.error('Restore error:', error);
        showToast('❌', 'Restore failed: ' + error.message);
    }
}

// Backup history management
function initBackupManagement() {
    // Auto backup (on first startup each day)
    const lastBackup = localStorage.getItem('lastAutoBackup');
    const today = new Date().toDateString();
    
    if (lastBackup !== today) {
        // Auto create backup
        setTimeout(() => autoBackup(), 5000); // Delay 5 seconds, wait for app to fully load
    }
}

// Auto backup
async function autoBackup() {
    try {
        // Only backup when there's data
        const hasData = window.appState.salespeople.length > 0 || 
                       Object.keys(window.appState.config.base_salaries || {}).length > 0;
        
        if (!hasData) return;
        
        const backupData = {
            appVersion: '1.0.0',
            timestamp: new Date().toISOString(),
            config: window.appState.config,
            currentData: {
                salespeople: window.appState.salespeople,
                currentMonth: document.getElementById('report-month')?.value || ''
            }
        };
        
        // Save to local storage (limit to recent 5 auto backups)
        const autoBackups = JSON.parse(localStorage.getItem('autoBackups') || '[]');
        autoBackups.unshift({
            data: backupData,
            timestamp: new Date().toISOString()
        });
        
        // Keep only recent 5 backups
        if (autoBackups.length > 5) {
            autoBackups.length = 5;
        }
        
        localStorage.setItem('autoBackups', JSON.stringify(autoBackups));
        localStorage.setItem('lastAutoBackup', new Date().toDateString());
        
        console.log('Auto backup created');
        
    } catch (error) {
        console.error('Auto backup error:', error);
    }
}

// Show auto backups
function showAutoBackups() {
    const autoBackups = JSON.parse(localStorage.getItem('autoBackups') || '[]');
    
    if (autoBackups.length === 0) {
        showToast('ℹ️', 'No automatic backups found');
        return;
    }
    
    // Create backup selection dialog
    const backupListHTML = autoBackups.map((backup, index) => {
        const date = new Date(backup.timestamp).toLocaleString();
        const size = JSON.stringify(backup).length;
        const kb = (size / 1024).toFixed(2);
        
        return `
            <div class="backup-item p-3 border border-gray-300 rounded mb-2 hover:bg-gray-50 cursor-pointer" 
                 onclick="selectBackup(${index})">
                <div class="flex justify-between">
                    <div>
                        <strong>Backup ${index + 1}</strong>
                        <div class="text-sm text-gray-600">${date}</div>
                    </div>
                    <div class="text-sm text-gray-500">${kb} KB</div>
                </div>
            </div>
        `;
    }).join('');
    
    const modalHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h3 class="text-lg font-bold mb-4">📂 Auto Backups</h3>
                <div class="max-h-64 overflow-y-auto mb-4">
                    ${backupListHTML}
                </div>
                <div class="flex justify-between">
                    <button onclick="closeBackupModal()" 
                            class="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400">
                        Cancel
                    </button>
                    <button id="restoreBackupBtn" 
                            onclick="restoreSelectedBackup()"
                            class="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled>
                        Restore Selected
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add modal to page
    const modal = document.createElement('div');
    modal.id = 'backupModal';
    modal.innerHTML = modalHTML;
    document.body.appendChild(modal);
    
    // Store selected index
    window.selectedBackupIndex = -1;
}

// Select backup
function selectBackup(index) {
    window.selectedBackupIndex = index;
    
    // Update UI
    document.querySelectorAll('.backup-item').forEach((item, i) => {
        if (i === index) {
            item.classList.add('bg-blue-50', 'border-blue-300');
        } else {
            item.classList.remove('bg-blue-50', 'border-blue-300');
        }
    });
    
    // Enable restore button
    document.getElementById('restoreBackupBtn').disabled = false;
}

// Close backup modal
function closeBackupModal() {
    const modal = document.getElementById('backupModal');
    if (modal) modal.remove();
    window.selectedBackupIndex = -1;
}

// Restore selected backup
async function restoreSelectedBackup() {
    const index = window.selectedBackupIndex;
    if (index === -1) return;
    
    const autoBackups = JSON.parse(localStorage.getItem('autoBackups') || '[]');
    if (index >= autoBackups.length) return;
    
    if (!confirm(`Restore backup from ${new Date(autoBackups[index].timestamp).toLocaleString()}?\nThis will replace all current data.`)) {
        return;
    }
    
    try {
        showLoading('Restoring backup...');
        
        const backup = autoBackups[index].data;
        
        // Restore data
        window.appState.config = backup.config;
        
        if (backup.currentData) {
            window.appState.salespeople = backup.currentData.salespeople || [];
        }
        
        // Save configuration
        await saveConfig();
        
        // Refresh current view
        if (window.appState.currentView === 'quick') {
            renderAllSalespeopleCards();
            rerunQuickCalcDerivedFields();
        }
        
        closeBackupModal();
        hideLoading();
        showToast('✅', 'Backup restored successfully');
        
    } catch (error) {
        hideLoading();
        console.error('Auto restore error:', error);
        showToast('❌', 'Restore failed: ' + error.message);
    }
}

// Download file helper function
function downloadFile(dataStr, filename) {
    const blob = new Blob([dataStr], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Manual backup (triggered by user)
function createManualBackup() {
    const backupData = {
        appVersion: '1.0.0',
        timestamp: new Date().toISOString(),
        config: window.appState.config,
        currentData: {
            salespeople: window.appState.salespeople,
            currentMonth: document.getElementById('report-month')?.value || '',
            currentView: window.appState.currentView
        }
    };
    
    // Add to auto backups (at the beginning)
    const autoBackups = JSON.parse(localStorage.getItem('autoBackups') || '[]');
    autoBackups.unshift({
        data: backupData,
        timestamp: new Date().toISOString(),
        manual: true
    });
    
    // Keep only recent 5 backups
    if (autoBackups.length > 5) {
        autoBackups.length = 5;
    }
    
    localStorage.setItem('autoBackups', JSON.stringify(autoBackups));
    
    showToast('✅', 'Manual backup created successfully');
}

// Export configuration only (without current data)
function exportConfigOnly() {
    try {
        const configData = {
            appVersion: '1.0.0',
            timestamp: new Date().toISOString(),
            config: window.appState.config
        };
        
        const dataStr = JSON.stringify(configData, null, 2);
        downloadFile(dataStr, `sales_config_${new Date().toISOString().split('T')[0]}.json`);
        
        showToast('✅', 'Configuration exported successfully');
        
    } catch (error) {
        console.error('Config export error:', error);
        showToast('❌', 'Export failed: ' + error.message);
    }
}

// Import configuration only
async function importConfigOnly() {
    try {
        if (!confirm('Importing configuration will replace all current settings. Continue?')) {
            return;
        }
        
        const fileResult = await window.electronAPI.selectFile(['.json']);
        if (!fileResult || !fileResult.success) return;
        
        showLoading('Importing configuration...');
        
        const configResult = await window.electronAPI.readBackupFile(fileResult.path);
        if (!configResult.success) {
            throw new Error(configResult.error || 'Failed to read config file');
        }
        
        const configData = JSON.parse(configResult.data);
        
        // Verify config data format
        if (!configData.config) {
            throw new Error('Invalid configuration file format');
        }
        
        // Restore configuration only
        window.appState.config = configData.config;
        
        // Save configuration
        await saveConfig();
        
        // Refresh all views
        renderSalaryConfigs();
        renderCommissionConfigs();
        loadQuickCalculateHistory();
        
        hideLoading();
        showToast('✅', 'Configuration imported successfully');
        
    } catch (error) {
        hideLoading();
        console.error('Config import error:', error);
        showToast('❌', 'Import failed: ' + error.message);
    }
}

// Add backup UI to history page

// Initialize backup system
function initBackupSystem() {
    // Check and create auto backup
    initBackupManagement();
}

// Backup before clear all data
function backupBeforeClear() {
    const hasData = window.appState.salespeople.length > 0;
    
    if (hasData) {
        // Create quick backup before clearing
        const quickBackup = {
            timestamp: new Date().toISOString(),
            salespeople: [...window.appState.salespeople],
            month: document.getElementById('report-month')?.value || ''
        };
        
        // Store in session storage for quick recovery
        sessionStorage.setItem('quickRecovery', JSON.stringify(quickBackup));
    }
}

// Quick recovery
function quickRecovery() {
    const recoveryData = sessionStorage.getItem('quickRecovery');
    if (!recoveryData) {
        showToast('ℹ️', 'No quick recovery data found');
        return;
    }
    
    if (!confirm('Recover last cleared data?')) {
        return;
    }
    
    try {
        const data = JSON.parse(recoveryData);
        
        window.appState.salespeople = data.salespeople || [];
        
        if (data.month) {
            const monthSelect = document.getElementById('report-month');
            if (monthSelect) monthSelect.value = data.month;
        }
        
        if (window.appState.currentView === 'quick') {
            renderAllSalespeopleCards();
            rerunQuickCalcDerivedFields();
        }
        
        showToast('✅', 'Data recovered successfully');
        
        // Remove recovery data
        sessionStorage.removeItem('quickRecovery');
        
    } catch (error) {
        console.error('Quick recovery error:', error);
        showToast('❌', 'Recovery failed: ' + error.message);
    }
}

// Add quick recovery button to UI
function addQuickRecoveryButton() {
    // Add to Quick Calculate view
    const quickView = document.getElementById('view-quick');
    if (quickView) {
        const existingBtn = quickView.querySelector('.quick-recovery-btn');
        if (existingBtn) return;
        
        const recoveryBtn = document.createElement('button');
        recoveryBtn.className = 'quick-recovery-btn ml-2 px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm';
        recoveryBtn.innerHTML = '↶ Undo Clear';
        recoveryBtn.onclick = quickRecovery;
        
        // Add next to clear button
        const clearBtn = quickView.querySelector('[onclick="clearAllQuickCalculateData()"]');
        if (clearBtn && clearBtn.parentNode) {
            clearBtn.parentNode.appendChild(recoveryBtn);
        }
    }
}

// ==================== Helper Functions ====================

function autoFillLockedFields(index) {
    const person = window.appState.salespeople[index];
    if (!person) return;
    const nameUpper = (person.name || '').toUpperCase();
    if (!nameUpper) return;
    const month = (document.getElementById('report-month')?.value || '').toUpperCase();
    const year = parseInt((document.getElementById('report-year')||{}).value, 10) || new Date().getFullYear();
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const currentIdx = months.indexOf(month);
    const history = window.appState.config.reportHistory || [];

    // ── Helper: find from imported Excel data ──
    function getExcelData(monthName) {
        const exData = window.appState.importedExcelData;
        if (!exData) return null;
        const personEx = exData.find(p => (p.name || '').toUpperCase() === nameUpper);
        if (!personEx) return null;
        return personEx.months.find(m => m.month === monthName) || null;
    }

    // ── Helper: find from reportHistory (year-aligned) ──
    function getHistoryData(monthName) {
        const hEntry = findHistEntry(history, monthName, year);
        if (!hEntry || !hEntry.data) return null;
        return hEntry.data.find(p => (p.name || '').toUpperCase() === nameUpper) || null;
    }

    // ── Helper: get data from Excel first, then history, then Monthly Target Setting (target only) ──
    function getData(monthName) {
        const exd = getExcelData(monthName);
        if (exd) return { target: parseFloat(exd.target) || 0, sales: parseFloat(exd.sales) || 0, source: 'excel' };
        const hd = getHistoryData(monthName);
        if (hd) return { target: parseFloat(hd.target) || 0, sales: parseFloat(hd.sales) || 0, source: 'history' };
        var ptk = year + '-' + monthName;
        var ptr = window.appState.config.person_targets && window.appState.config.person_targets[nameUpper];
        var ptv = ptr && ptr[ptk];
        if (ptv != null && ptv !== '') {
            var t0 = parseFloat(ptv);
            if (!isNaN(t0)) return { target: t0, sales: 0, source: 'target-setting' };
        }
        return null;
    }

    // ══════════════════════════════════════════════════════
    // Quarterly Target / Sales — full quarter for selected month (JAN..MAR, APR..JUN, …)
    // ══════════════════════════════════════════════════════
    const qTargetEl = document.getElementById('quarterly-target-' + index);
    const qSalesEl = document.getElementById('quarterly-sales-' + index);
    const isSalesPerson = getEmployeeType(nameUpper) === 'Sales';

    if (isSalesPerson && currentIdx >= 0 && month) {
        const qMonths = quarterMonthsForBareMonth(month);
        if (!isQuarterEndMonthForRollup(month)) {
            var _naT = 'Quarterly Target/Sales only in Mar/Jun/Sep/Dec (each 3-month period end).';
            if (qTargetEl) { qTargetEl.removeAttribute('disabled'); qTargetEl.value = ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.title = _naT; person.quarterlyTarget = 0; }
            if (qSalesEl) { qSalesEl.removeAttribute('disabled'); qSalesEl.value = ''; qSalesEl.setAttribute('disabled','disabled'); qSalesEl.title = _naT; person.quarterlySales = 0; }
        } else if (qMonths) {
        let qTarget = 0, qSales = 0;
        const details = [];

        for (const qm of qMonths) {
            if (qm === month) {
                const curTarget = parseFloat(document.getElementById('target-' + index)?.value) || 0;
                const curSales = parseFloat(document.getElementById('sales-' + index)?.value) || 0;
                qTarget += curTarget;
                qSales += curSales;
                details.push(qm + ': T=' + curTarget.toLocaleString() + ' S=' + curSales.toLocaleString() + ' (current month)');
            } else {
                const d = getData(qm);
                if (d) {
                    qTarget += d.target;
                    qSales += d.sales;
                    details.push(qm + ': T=' + d.target.toLocaleString() + ' S=' + d.sales.toLocaleString() + ' (' + d.source + ')');
                } else {
                    details.push(qm + ': No data');
                }
            }
        }

        const tooltip = 'Auto (' + year + '): ' + qMonths.join(' + ') + '\n' + details.join('\n');
        if (qTargetEl) { var _qtR2 = Math.round(qTarget * 100) / 100; qTargetEl.removeAttribute('disabled'); qTargetEl.value = _qtR2 ? _qtR2.toFixed(2) : ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.title = tooltip; person.quarterlyTarget = _qtR2; }
        if (qSalesEl) { var _qsR2 = Math.round(qSales * 100) / 100; qSalesEl.removeAttribute('disabled'); qSalesEl.value = _qsR2 ? _qsR2.toFixed(2) : ''; qSalesEl.setAttribute('disabled','disabled'); qSalesEl.title = tooltip; person.quarterlySales = _qsR2; }
        console.log(`📊 Quarterly auto-fill for ${nameUpper} (${month} ${year}):`, details);
        }
    } else {
        if (qTargetEl) { qTargetEl.removeAttribute('disabled'); qTargetEl.value = ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.style.background='#f1f5f9'; qTargetEl.title = isSalesPerson ? 'Select month' : 'N/A for this role'; person.quarterlyTarget = 0; }
        if (qSalesEl)  { qSalesEl.removeAttribute('disabled');  qSalesEl.value  = ''; qSalesEl.setAttribute('disabled','disabled');  qSalesEl.style.background='#f1f5f9';  qSalesEl.title  = isSalesPerson ? 'Select month' : 'N/A for this role'; person.quarterlySales  = 0; }
    }

    // Collection Target (Outlets) — set from person_outlet_targets via applyPersonTarget
    // No auto-calculation here; handled by applyPersonTarget
}

// Import Excel
async function importFromExcel() {
    try {
        // 1. Select file
        const fileResult = await window.electronAPI.selectFile();
        if (!fileResult || !fileResult.success) return;

        showToast('⏳', 'Reading Excel file...');

        // 2. Read data
        const importResult = await window.electronAPI.importSalesData(fileResult.path);
        if (!importResult.success) {
            showToast('❌', 'Import failed: ' + importResult.error);
            return;
        }

        const data = importResult.data; // [{name, months: [{month, target, sales, collection}]}]
        if (!data || data.length === 0) {
            showToast('⚠️', 'No data found in file');
            return;
        }

        // ── Store full imported Excel data for month-switching ──
        window.appState.importedExcelData = data;
        console.log('📂 Stored imported Excel data:', data.length, 'people,', 
            data.map(p => p.name + '(' + p.months.length + ' months)').join(', '));

        // 3. Find current selected month
        const currentMonth = document.getElementById('report-month')
            ? document.getElementById('report-month').value.toUpperCase()
            : '';

        // 4. Fill cards for the selected month
        fillCardsFromImportedData(currentMonth);

    } catch (e) {
        showToast('❌', 'Error: ' + e.message);
        console.error('Import error:', e);
    }
}

// ── Fill cards from stored imported Excel data for a given month ──
function fillCardsFromImportedData(targetMonth) {
    const data = window.appState.importedExcelData;
    if (!data || data.length === 0) return;
    const currentMonth = targetMonth.toUpperCase();
    if (!window.appState.config.reportHistory) window.appState.config.reportHistory = [];
    if (!window.appState.config.base_salaries) window.appState.config.base_salaries = {};
    if (!window.appState.config.allowances) window.appState.config.allowances = {};
    if (!window.appState.config.deductions) window.appState.config.deductions = {};
    if (!window.appState.config.deductionRates) window.appState.config.deductionRates = {};

    // Sync ALL months from ALL people into reportHistory + config
    data.forEach(person => {
        const nameUpper = person.name.toUpperCase();
        if (!window.appState.config.base_salaries[nameUpper]) {
            window.appState.config.base_salaries[nameUpper] = 1700;
            window.appState.config.allowances[nameUpper] = {HP:0,CAR:0,'LOCAL FUEL':0,'OUTSTATION FUEL':0,HOUSING:0,FOOD:0,OTHERS:0};
            window.appState.config.deductions[nameUpper] = {EPF:Math.round(1700*0.11*100)/100,SOCSO:Math.round(1700*0.005*100)/100,PCB:0,EIS:0};
            window.appState.config.deductionRates[nameUpper] = {EPF_RATE:11};
            if (!window.appState.config.employer_epf_rates) window.appState.config.employer_epf_rates = {};
            window.appState.config.employer_epf_rates[nameUpper] = 13;
        }
        person.months.forEach(md => {
            if (!md.month) return;
            const mKey = md.month.toUpperCase() + '-' + (((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear()));
            let mEntry = window.appState.config.reportHistory.find(r => (r.month||'').toUpperCase() === mKey);
            if (!mEntry) { mEntry = {month:mKey,data:[]}; window.appState.config.reportHistory.push(mEntry); }
            const ei = mEntry.data.findIndex(p => (p.name||'').toUpperCase() === nameUpper);
            const entry = {name:nameUpper,target:md.target||0,sales:md.sales||0,collectionAmount:md.collection||0,callTarget:md.callTarget||0,collectionTarget:0,callActual:0};
            if (ei >= 0) mEntry.data[ei] = entry; else mEntry.data.push(entry);
            if (md.callTarget) {
                if (!window.appState.config.active_call_targets) window.appState.config.active_call_targets = {};
                window.appState.config.active_call_targets[nameUpper] = md.callTarget;
            }
        });
    });
    saveConfig();

    // Keep only ONE card — preserve the currently-selected person across month switches
    var prevName = (document.getElementById('name-0') || {}).value
        || (window.appState.salespeople[0] && window.appState.salespeople[0].name) || '';
    const container = document.getElementById('salespeople-container');
    if (container) container.innerHTML = '';
    window.appState.salespeople = [];
    const fp = (prevName && data.find(function(p){ return (p.name||'').toUpperCase() === prevName.toUpperCase(); })) || data[0];
    // IMPORTANT: only use data for the EXACT selected month — never fall back to another
    // month (that caused e.g. May data to show up under June).
    const fmd = fp.months.find(m => m.month === currentMonth) || null;
    // If this month isn't in the imported file, fall back to manually-saved Records for
    // THIS month only (so manual edits aren't wiped) — otherwise leave it empty.
    var monthData = fmd
        ? { target: fmd.target, sales: fmd.sales, collectionAmount: fmd.collection, callTarget: fmd.callTarget }
        : null;
    if (!monthData) {
        var _hist = window.appState.config.reportHistory || [];
        var _yr = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
        var _mKey = currentMonth + '-' + _yr;
        var _he = _hist.find(function(r){ return (r.month||'').toUpperCase() === _mKey; })
               || _hist.find(function(r){ return (r.month||'').toUpperCase() === currentMonth; });
        if (_he && _he.data) monthData = _he.data.find(function(p){ return (p.name||'').toUpperCase() === fp.name.toUpperCase(); }) || null;
    }
    createBlankSalespersonCard();
    const nameEl0 = document.getElementById('name-0');
    if (nameEl0) {
        const opt0 = Array.from(nameEl0.options).find(o => o.value.toUpperCase() === fp.name.toUpperCase());
        if (opt0) { nameEl0.value = opt0.value; }
        else { const o=document.createElement('option'); o.value=fp.name; o.text=fp.name; nameEl0.appendChild(o); nameEl0.value=fp.name; }
    }
    const s0=(id,v)=>{const el=document.getElementById(id+'-0');if(el){el.value=(v!=null&&v!==0&&v!=='')?v:'';el.readOnly=false;el.style.backgroundColor='';}};
    s0('target',            monthData ? monthData.target : '');
    s0('sales',             monthData ? monthData.sales : '');
    s0('collection-amount', monthData ? monthData.collectionAmount : '');
    s0('call-target',       monthData ? monthData.callTarget : '');
    if (!monthData) {
        // Clear remaining monthly inputs and stale state so nothing carries over
        s0('call-actual', ''); s0('quarterly-sales', '');
        if (window.appState.salespeople[0]) {
            window.appState.salespeople[0].sales = 0;
            window.appState.salespeople[0].collectionAmount = 0;
            window.appState.salespeople[0].callActual = 0;
        }
    }
    autoFillLockedFieldsWithExcel(0, fp.months, currentMonth);
    updateSalespersonData(0);

    // Force-save quickCalculateData immediately after import so data persists on restart
    var _qcd = {
        month: currentMonth,
        salespeople: window.appState.salespeople.map(function(p){ return Object.assign({}, p); })
    };
    window.appState.config.quickCalculateData = _qcd;
    saveConfig();
    // Also persist to SQLite DB
    dbSave('quickCalculateData', _qcd);
    dbSave('reportHistory', window.appState.config.reportHistory || []);

    if (document.getElementById('salary-person-select')) renderSalaryConfigs();
    if (document.getElementById('commission-person-select')) renderCommissionConfigs();
    if (document.getElementById('history-list')) loadQuickCalculateHistory();
    const totalMonths = [...new Set(data.flatMap(p => p.months.map(m => m.month)))].length;
    showToast('\u2705', `Imported ${data.length} people, ${totalMonths} months. Use name dropdown to switch.`);
}

// ── Auto-fill quarterly fields using imported Excel data + history ──
function autoFillLockedFieldsWithExcel(index, excelMonths, currentMonth) {
    const person = window.appState.salespeople[index];
    if (!person) return;
    const nameUpper = (person.name || '').toUpperCase();
    const month = currentMonth.toUpperCase();
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const currentIdx = months.indexOf(month);
    const history = window.appState.config.reportHistory || [];
    const year = parseInt((document.getElementById('report-year')||{}).value, 10) || new Date().getFullYear();

    // Helper: find from reportHistory (year-aligned)
    function getHistoryData(monthName) {
        const hEntry = findHistEntry(history, monthName, year);
        if (!hEntry || !hEntry.data) return null;
        return hEntry.data.find(p => (p.name || '').toUpperCase() === nameUpper) || null;
    }

    // Helper: find from imported Excel data (current import row)
    function getExcelData(monthName) {
        if (!excelMonths) return null;
        return excelMonths.find(m => m.month === monthName) || null;
    }

    function getData(monthName) {
        const exd = getExcelData(monthName);
        if (exd) return { target: parseFloat(exd.target) || 0, sales: parseFloat(exd.sales) || 0, source: 'excel' };
        const hd = getHistoryData(monthName);
        if (hd) return { target: parseFloat(hd.target) || 0, sales: parseFloat(hd.sales) || 0, source: 'history' };
        var ptk = year + '-' + monthName;
        var ptr = window.appState.config.person_targets && window.appState.config.person_targets[nameUpper];
        var ptv = ptr && ptr[ptk];
        if (ptv != null && ptv !== '') {
            var t1 = parseFloat(ptv);
            if (!isNaN(t1)) return { target: t1, sales: 0, source: 'target-setting' };
        }
        return null;
    }

    // ── Quarterly Target/Sales — full quarter for selected month (Sales only) ──
    const qTargetEl = document.getElementById('quarterly-target-' + index);
    const qSalesEl = document.getElementById('quarterly-sales-' + index);
    const isSalesPerson = getEmployeeType(nameUpper) === 'Sales';

    if (isSalesPerson && currentIdx >= 0 && month) {
        const qMonths = quarterMonthsForBareMonth(month);
        if (!isQuarterEndMonthForRollup(month)) {
            var _naT2 = 'Quarterly Target/Sales only in Mar/Jun/Sep/Dec (each 3-month period end).';
            if (qTargetEl) { qTargetEl.removeAttribute('disabled'); qTargetEl.value = ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.style.background='#f1f5f9'; qTargetEl.title = _naT2; person.quarterlyTarget = 0; }
            if (qSalesEl) { qSalesEl.removeAttribute('disabled'); qSalesEl.value = ''; qSalesEl.setAttribute('disabled','disabled'); qSalesEl.style.background='#f1f5f9'; qSalesEl.title = _naT2; person.quarterlySales = 0; }
        } else if (qMonths) {
            let qTarget = 0, qSales = 0;
            const details = [];

            for (const qm of qMonths) {
                if (qm === month) {
                    const curTarget = parseFloat(document.getElementById('target-' + index)?.value) || 0;
                    const curSales = parseFloat(document.getElementById('sales-' + index)?.value) || 0;
                    qTarget += curTarget;
                    qSales += curSales;
                    details.push(qm + ': T=' + curTarget.toLocaleString() + ' S=' + curSales.toLocaleString() + ' (current)');
                } else {
                    const d = getData(qm);
                    if (d) {
                        qTarget += d.target;
                        qSales += d.sales;
                        details.push(qm + ': T=' + d.target.toLocaleString() + ' S=' + d.sales.toLocaleString() + ' (' + d.source + ')');
                    } else {
                        details.push(qm + ': No data');
                    }
                }
            }

            const tooltip = 'Auto (' + year + '): ' + qMonths.join(' + ') + '\n' + details.join('\n');
            if (qTargetEl) { var _qtR3 = Math.round(qTarget * 100) / 100; qTargetEl.removeAttribute('disabled'); qTargetEl.value = _qtR3 ? _qtR3.toFixed(2) : ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.style.background='#f1f5f9'; qTargetEl.title = tooltip; person.quarterlyTarget = _qtR3; }
            if (qSalesEl)  { var _qsR3 = Math.round(qSales * 100) / 100; qSalesEl.removeAttribute('disabled');  qSalesEl.value  = _qsR3 ? _qsR3.toFixed(2) : ''; qSalesEl.setAttribute('disabled','disabled');  qSalesEl.style.background='#f1f5f9';  qSalesEl.title  = tooltip; person.quarterlySales  = _qsR3; }
        }
    } else {
        if (qTargetEl) { qTargetEl.removeAttribute('disabled'); qTargetEl.value = ''; qTargetEl.setAttribute('disabled','disabled'); qTargetEl.style.background='#f1f5f9'; qTargetEl.title = isSalesPerson ? 'Select month' : 'N/A for this role'; person.quarterlyTarget = 0; }
        if (qSalesEl)  { qSalesEl.removeAttribute('disabled');  qSalesEl.value  = ''; qSalesEl.setAttribute('disabled','disabled');  qSalesEl.style.background='#f1f5f9';  qSalesEl.title  = isSalesPerson ? 'Select month' : 'N/A for this role'; person.quarterlySales  = 0; }
    }

    // ── Collection Target — from 2 months ago (try Excel first, then history) ──
    let collTarget = 0, collLabel = '';
    if (currentIdx >= 0) {
        let twoMonthsAgo;
        if (currentIdx >= 2) { twoMonthsAgo = months[currentIdx - 2]; }
        else if (currentIdx === 1) { twoMonthsAgo = months[11]; }
        else { twoMonthsAgo = months[10]; }

        const exd = getExcelData(twoMonthsAgo);
        if (exd) {
            collTarget = parseFloat(exd.sales) || 0;
            collLabel = 'Auto: ' + twoMonthsAgo + ' sales = RM ' + collTarget.toLocaleString() + ' (excel)';
        } else {
            const personHist = getHistoryData(twoMonthsAgo);
            if (personHist) {
                collTarget = parseFloat(personHist.sales) || 0;
                collLabel = 'Auto: ' + twoMonthsAgo + ' sales = RM ' + collTarget.toLocaleString() + ' (history)';
            } else {
                collLabel = 'No data for ' + twoMonthsAgo;
            }
        }
    }
    const cEl = document.getElementById('collection-target-' + index);
    if (cEl) {
        // Keep disabled — value set by applyPersonTarget from person_outlet_targets
        cEl.removeAttribute('disabled');
        cEl.value = collTarget || '';
        cEl.setAttribute('disabled', 'disabled');
        cEl.style.background = '#f1f5f9';
        cEl.style.color = '#64748b';
        person.collectionTarget = collTarget;
    }
}

// Salary & Allowances update functions
function updateSalary(name, value) {
    const nameUpper = name.toUpperCase();
    if (!window.appState.config.base_salaries) window.appState.config.base_salaries = {};
    window.appState.config.base_salaries[nameUpper] = parseFloat(value) || 0;
    saveConfig();
    renderSalaryConfigs(name);
}

function updateAllowance(name, key, value) {
    const nameUpper = name.toUpperCase();
    if (!window.appState.config.allowances) window.appState.config.allowances = {};
    if (!window.appState.config.allowances[nameUpper]) window.appState.config.allowances[nameUpper] = {};
    window.appState.config.allowances[nameUpper][key] = parseFloat(value) || 0;
    saveConfig();
    // Recalculate EPF/SOCSO (based on new total income)
    const allowances = window.appState.config.allowances[nameUpper];
    const salary = window.appState.config.base_salaries?.[nameUpper] || 0;
    const totalIncome = salary + Object.values(allowances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const epfRate = (window.appState.config.deductionRates?.[nameUpper]?.EPF_RATE || 11) / 100;
    if (!window.appState.config.deductions) window.appState.config.deductions = {};
    if (!window.appState.config.deductions[nameUpper]) window.appState.config.deductions[nameUpper] = {};
    window.appState.config.deductions[nameUpper].EPF   = Math.round(totalIncome * epfRate * 100) / 100;
    window.appState.config.deductions[nameUpper].SOCSO = Math.round(totalIncome * 0.005 * 100) / 100;
    saveConfig();
    renderSalaryConfigs(name);
}

function updateEPFRate(name, value) {
    const nameUpper = name.toUpperCase();
    if (!window.appState.config.deductionRates) window.appState.config.deductionRates = {};
    if (!window.appState.config.deductionRates[nameUpper]) window.appState.config.deductionRates[nameUpper] = {};
    window.appState.config.deductionRates[nameUpper].EPF_RATE = parseFloat(value) || 11;
    saveConfig();
    // Recalculate EPF amount
    const salary = window.appState.config.base_salaries?.[nameUpper] || 0;
    const allowances = window.appState.config.allowances?.[nameUpper] || {};
    const totalIncome = salary + Object.values(allowances).reduce((s, v) => s + (parseFloat(v) || 0), 0);
    const epfRate = (parseFloat(value) || 11) / 100;
    if (!window.appState.config.deductions) window.appState.config.deductions = {};
    if (!window.appState.config.deductions[nameUpper]) window.appState.config.deductions[nameUpper] = {};
    window.appState.config.deductions[nameUpper].EPF = Math.round(totalIncome * epfRate * 100) / 100;
    saveConfig();
    renderSalaryConfigs(name);
}

function updateDeduction(name, key, value) {
    const nameUpper = name.toUpperCase();
    if (!window.appState.config.deductions) window.appState.config.deductions = {};
    if (!window.appState.config.deductions[nameUpper]) window.appState.config.deductions[nameUpper] = {};
    window.appState.config.deductions[nameUpper][key] = parseFloat(value) || 0;
    saveConfig();
}

// Missing functions
function onSalespersonNameChange(index) {
    var nameEl   = document.getElementById('name-'+index);
    var newName  = nameEl ? nameEl.value : '';
    var newUpper = newName.toUpperCase();
    var month    = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var _nscYear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var _nscMonthKey = month ? month + '-' + _nscYear : '';
    var fields   = ['target','sales','quarterly-target','quarterly-sales','collection-target','collection-amount','call-target','call-actual'];

    // Save previous person's data before switching
    var person = window.appState.salespeople[index];
    if (person && person.name && person.name !== newName) {
        var prevUpper = person.name.toUpperCase();
        var prevTarget = parseFloat((document.getElementById('target-'+index)||{}).value)||0;
        var prevSales  = parseFloat((document.getElementById('sales-'+index)||{}).value)||0;
        if (prevTarget>0||prevSales>0) {
            if (!window.appState.config.reportHistory) window.appState.config.reportHistory=[];
            var existIdx = window.appState.config.reportHistory.findIndex(function(r){return (r.month||'').toUpperCase()===_nscMonthKey;});
            var entry = {name:prevUpper,target:prevTarget,sales:prevSales,
                collectionTarget:parseFloat((document.getElementById('collection-target-'+index)||{}).value)||0,
                collectionAmount:parseFloat((document.getElementById('collection-amount-'+index)||{}).value)||0,
                callTarget:parseFloat((document.getElementById('call-target-'+index)||{}).value)||0,
                callActual:parseFloat((document.getElementById('call-actual-'+index)||{}).value)||0};
            if (existIdx>=0) {
                var data=window.appState.config.reportHistory[existIdx].data||[];
                var pi=data.findIndex(function(p){return (p.name||'').toUpperCase()===prevUpper;});
                if(pi>=0) data[pi]=entry; else data.push(entry);
                window.appState.config.reportHistory[existIdx].data=data;
            } else { window.appState.config.reportHistory.push({month:_nscMonthKey,data:[entry]}); }
            saveConfig().catch(function(){});
        }
    }

    // Clear all fields
    fields.forEach(function(f){var el=document.getElementById(f+'-'+index);if(el){el.value='';el.readOnly=false;el.style.backgroundColor='';}});

    // Load saved data for new person
    if (newUpper&&month) {
        var history=window.appState.config.reportHistory||[];
        var entries=history.filter(function(r){return (r.month||'').toUpperCase()===_nscMonthKey;});
        var saved=null;
        for(var i=entries.length-1;i>=0;i--){var f=( entries[i].data||[]).find(function(p){return (p.name||'').toUpperCase()===newUpper;});if(f){saved=f;break;}}
        if(saved){
            var set=function(f,v){var el=document.getElementById(f+'-'+index);if(el&&v)el.value=v;};
            set('target',saved.target);set('sales',saved.sales);
            set('collection-target',saved.collectionTarget);set('collection-amount',saved.collectionAmount);
            set('call-target',saved.callTarget);set('call-actual',saved.callActual);
        }
    }

    updateSalespersonData(index);
    autoFillLockedFields(index);
}

function renderSalespersonCards() {
    renderAllSalespeopleCards();
    rerunQuickCalcDerivedFields();
}

function viewHistoryReport(index) {
    var report = (window.appState.config.reportHistory || [])[index];
    if (!report) { showToast('⚠️', 'Report not found'); return; }

    var people = report.data || [];
    var month  = (report.month || '').toUpperCase();
    var cfg    = window.appState.config;
    var qMonths = ['MAR','JUN','SEP','DEC'];
    var isQtr   = qMonths.indexOf(month) !== -1;

    // Hide people who had not joined yet in this report month
    var _hvBareM = (typeof bareMonth === 'function') ? bareMonth(report.month) : month;
    var _hvYear  = (typeof keyYear === 'function') ? (keyYear(report.month) || new Date().getFullYear()) : new Date().getFullYear();
    people = people.filter(function(p){
        return typeof isEmployeeActiveInMonth !== 'function' || isEmployeeActiveInMonth(p.name, _hvBareM, _hvYear);
    });

    var existing = document.getElementById('history-view-modal');
    if (existing) existing.remove();

    var cards = people.map(function(p, pIdx) {
        var nu       = (p.name || '').toUpperCase();
        var empType  = (typeof getEmployeeType === 'function') ? getEmployeeType(p.name) : 'Sales';
        var salary   = (cfg.base_salaries && cfg.base_salaries[nu]) || 0;
        var allow    = (cfg.allowances    && cfg.allowances[nu])    || {};
        var epfRate  = (cfg.deductionRates && cfg.deductionRates[nu] && cfg.deductionRates[nu].EPF_RATE) || 11;
        var totalAllow = Object.values(allow).reduce(function(s,v){ return s+(parseFloat(v)||0); }, 0);

        var target  = parseFloat(p.target)          || 0;
        var sales   = parseFloat(p.sales)           || 0;
        var collTgt = parseFloat(p.collectionTarget) || 0;
        var collAmt = parseFloat(p.collectionAmount) || 0;
        var callTgt = parseFloat(p.callTarget)       || 0;
        var callAct = parseFloat(p.callActual)       || 0;

        var ach     = target  > 0 ? (sales   / target  * 100) : 0;
        var collPct = collTgt > 0 ? (collAmt / collTgt * 100) : 0;
        var callPct = callTgt > 0 ? (callAct / callTgt * 100) : 0;

        var comm = 0, collBon = 0, callBon = 0, qtrBon = 0, totalComm = 0;
        var detailRows = '';
        var achColor = ach >= 100 ? '#16a34a' : ach >= 90 ? '#d97706' : '#dc2626';

        if (empType === 'Sales') {
            comm    = calculateCommission(sales, target, p.name);
            collBon = calculateIncentive(collPct, collectionIncentiveTiersFor(p.name));
            callBon = calculateIncentive(callPct, activeCallIncentiveTiersFor(p.name));
            qtrBon  = isQtr ? calculateIncentive(ach, quarterlyIncentiveTiersFor(p.name)) : 0;
            totalComm = comm + collBon + callBon + qtrBon;

            detailRows = ''
                + '<div style="color:#6b7280;">Monthly Target</div><div style="text-align:right;">' + formatCurrency(target) + '</div>'
                + '<div style="color:#6b7280;">Monthly Sales</div><div style="text-align:right;">' + formatCurrency(sales) + '</div>'
                + '<div style="color:#6b7280;">Achievement</div><div style="text-align:right;font-weight:600;color:' + achColor + ';">' + ach.toFixed(2) + '%</div>'
                + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
                + '<div style="color:#6b7280;">Commission</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(comm) + '</div>'
                + '<div style="color:#6b7280;">Collection Incentive</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(collBon) + '</div>'
                + '<div style="color:#6b7280;">Call Incentive</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(callBon) + '</div>'
                + (isQtr ? '<div style="color:#6b7280;">Quarterly Incentive</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(qtrBon) + '</div>' : '')
                + '<div style="color:#6b7280;font-weight:600;">Total Commission</div><div style="text-align:right;font-weight:700;color:#16a34a;">' + formatCurrency(totalComm) + '</div>';
        } else if (empType === 'Supervisor') {
            // Compute team totals for the month
            var teamS=0, teamT=0, teamCo=0, teamCoT=0, teamCa=0, teamCaT=0;
            people.forEach(function(tp) {
                if ((typeof getEmployeeType === 'function' ? getEmployeeType(tp.name) : 'Sales') !== 'Sales') return;
                teamS += parseFloat(tp.sales)||0; teamT += parseFloat(tp.target)||0;
                teamCo += parseFloat(tp.collectionAmount)||0; teamCoT += parseFloat(tp.collectionTarget)||0;
                teamCa += parseFloat(tp.callActual)||0; teamCaT += parseFloat(tp.callTarget)||0;
            });
            var teamAch = teamT>0?(teamS/teamT*100):0;
            var teamCollAch = teamCoT>0?(teamCo/teamCoT*100):0;
            var teamCallAch = teamCaT>0?(teamCa/teamCaT*100):0;
            var saleT = (cfg.person_supervisor_sale_tiers&&cfg.person_supervisor_sale_tiers[p.name])||cfg.supervisor_sale_tiers||[];
            var collT = (cfg.person_supervisor_coll_tiers&&cfg.person_supervisor_coll_tiers[p.name])||cfg.supervisor_coll_tiers||[];
            var callT = (cfg.person_supervisor_call_tiers&&cfg.person_supervisor_call_tiers[p.name])||cfg.supervisor_call_tiers||[];
            var qtrT  = (cfg.person_supervisor_qtr_tiers&&cfg.person_supervisor_qtr_tiers[p.name])||cfg.supervisor_qtr_tiers||[];
            comm = getTierAmt(saleT, teamAch);
            collBon = getTierAmt(collT, teamCollAch);
            callBon = getTierAmt(callT, teamCallAch);
            qtrBon = isQtr ? getTierAmt(qtrT, teamAch) : 0;
            totalComm = comm + collBon + callBon + qtrBon;
            ach = teamAch;
            achColor = ach >= 100 ? '#16a34a' : ach >= 90 ? '#d97706' : '#dc2626';

            detailRows = ''
                + '<div style="color:#6b7280;">Team Achievement</div><div style="text-align:right;font-weight:600;color:' + achColor + ';">' + ach.toFixed(2) + '%</div>'
                + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
                + '<div style="color:#6b7280;">Sale Incentive</div><div style="text-align:right;color:#7c3aed;">' + formatCurrency(comm) + '</div>'
                + '<div style="color:#6b7280;">Collection Incentive</div><div style="text-align:right;color:#7c3aed;">' + formatCurrency(collBon) + '</div>'
                + '<div style="color:#6b7280;">Call Incentive</div><div style="text-align:right;color:#7c3aed;">' + formatCurrency(callBon) + '</div>'
                + (isQtr ? '<div style="color:#6b7280;">Quarterly Incentive</div><div style="text-align:right;color:#7c3aed;">' + formatCurrency(qtrBon) + '</div>' : '')
                + '<div style="color:#6b7280;font-weight:600;">Total Incentive</div><div style="text-align:right;font-weight:700;color:#7c3aed;">' + formatCurrency(totalComm) + '</div>';
        } else if (empType === 'Support Staff') {
            var blocks = parseFloat(p.collectionAmount)||0;
            var rate = (cfg.person_merchandiser_rates&&cfg.person_merchandiser_rates[p.name]!=null)
                ? parseFloat(cfg.person_merchandiser_rates[p.name])
                : (parseFloat(cfg.merchandiser_block_rate)||10);
            totalComm = blocks * rate;

            detailRows = ''
                + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
                + '<div style="color:#6b7280;">Blocks</div><div style="text-align:right;">' + blocks + '</div>'
                + '<div style="color:#6b7280;">Block Incentive</div><div style="text-align:right;color:#d97706;">' + formatCurrency(totalComm) + '</div>'
                + '<div style="color:#6b7280;font-weight:600;">Total Incentive</div><div style="text-align:right;font-weight:700;color:#d97706;">' + formatCurrency(totalComm) + '</div>';
        }

        var totalFixed  = salary + totalAllow;
        var totalIncome = totalFixed + totalComm;
        var _hvEpf      = (typeof computeEpf === 'function') ? computeEpf(p.name, totalIncome, _hvBareM, _hvYear) : { employee: Math.round(totalIncome*(epfRate/100)*100)/100, empPct: epfRate };
        var epfAmt      = Math.round(_hvEpf.employee * 100) / 100;
        var epfPctLabel = (_hvEpf.empPct != null) ? _hvEpf.empPct.toFixed(1) : epfRate;
        var _hvSocso    = (typeof computeSocso === 'function') ? computeSocso(p.name, totalIncome, _hvBareM, _hvYear) : { employee: 0 };
        var socsoAmt    = Math.round(_hvSocso.employee * 100) / 100;
        var _hvEis      = (typeof computeEis === 'function') ? computeEis(p.name, totalIncome, _hvBareM, _hvYear) : { employee: 0 };
        var eisAmt      = Math.round(_hvEis.employee * 100) / 100;
        var grandTotal  = totalIncome - epfAmt - socsoAmt - eisAmt;

        return '<div id="hv-person-'+pIdx+'" style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;background:#fff;">'
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #f3f4f6;">'
            + '<span style="font-size:20px;">&#128100;</span>'
            + '<h3 style="margin:0;font-size:16px;font-weight:700;color:#111;">' + p.name + '</h3></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">'
            + '<div style="color:#6b7280;">Base Salary</div><div style="text-align:right;">' + formatCurrency(salary) + '</div>'
            + detailRows
            + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
            + '<div style="color:#6b7280;">EPF (' + epfPctLabel + '%)</div><div style="text-align:right;color:#dc2626;">- ' + formatCurrency(epfAmt) + '</div>'
            + (socsoAmt > 0 ? '<div style="color:#6b7280;">SOCSO (0.5%)</div><div style="text-align:right;color:#dc2626;">- ' + formatCurrency(socsoAmt) + '</div>' : '')
            + (eisAmt > 0 ? '<div style="color:#6b7280;">EIS (0.2%)</div><div style="text-align:right;color:#dc2626;">- ' + formatCurrency(eisAmt) + '</div>' : '')
            + '<div style="font-weight:700;color:#111;">Grand Total</div><div style="text-align:right;font-weight:700;font-size:15px;color:#4f46e5;">' + formatCurrency(grandTotal) + '</div>'
            + '</div></div>';
    }).join('');

    // Build person quick-jump buttons
    var personBtns = people.map(function(p, i) {
        var shortName = (p.name||'').substring(0,8);
        return '<button data-person-idx="'+i+'" style="padding:5px 12px;border:1px solid rgba(255,255,255,0.3);border-radius:20px;background:rgba(255,255,255,0.15);color:#fff;cursor:pointer;font-size:11px;font-weight:600;font-family:Sora,sans-serif;white-space:nowrap;" '
            + 'onclick="(function(){var el=document.getElementById(\'hv-person-'+i+'\');if(el)el.scrollIntoView({behavior:\'smooth\',block:\'start\'});})()">'
            + shortName + '</button>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'history-view-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:flex-start;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;overflow-y:auto;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#f9fafb;border-radius:16px;max-width:640px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.3);overflow:hidden;margin:auto;';

    var closeBtn = '<button onclick="document.getElementById(\'history-view-modal\').remove()" style="padding:8px 16px;background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">&#10005; Close</button>';

    box.innerHTML = '<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:20px 24px;color:#fff;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;">'
        + '<div><div style="font-size:20px;font-weight:700;">' + month + ' Report</div>'
        + '<div style="font-size:13px;opacity:0.85;margin-top:4px;">' + people.length + ' salespeople</div></div>'
        + '<div style="display:flex;gap:8px;">' + closeBtn + '</div></div>'
        + (people.length > 1 ? '<div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap;">' + personBtns + '</div>' : '')
        + '</div>'
        + '<div id="hv-scroll-area" style="padding:20px;max-height:70vh;overflow-y:auto;">'
        + (people.length > 0 ? cards : '<div style="text-align:center;padding:40px;color:#6b7280;">No data for this month</div>')
        + '</div>';

    box.addEventListener('click', function(e){ e.stopPropagation(); });
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.addEventListener('click', function(){ modal.remove(); });
}

function deleteHistoryReport(index) {
    var history = window.appState.config.reportHistory || [];
    var report = history[index];
    if (!report) { showToast('\u26a0\ufe0f', 'Report not found'); return; }

    var monthLbl = (typeof bareMonth === 'function') ? bareMonth(report.month) : (report.month || '');
    var yearLbl  = (typeof keyYear === 'function') ? (keyYear(report.month) || '') : '';
    var peopleNames = (report.data || []).map(function (p) { return p.name; }).filter(Boolean);
    var correctPw = (window.appState.config && window.appState.config.annual_password) || 'boss123';

    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px;box-sizing:border-box;';
    var card = document.createElement('div');
    card.style.cssText = 'background:var(--paper);border-radius:16px;max-width:380px;width:100%;overflow:hidden;box-shadow:0 25px 60px rgba(8,15,26,.25);font-family:Sora,sans-serif;';
    card.addEventListener('click', function (e) { e.stopPropagation(); });

    var personOpts = '<option value="__ALL__">\u2014 Entire month (all people) \u2014</option>'
        + peopleNames.map(function (n) { return '<option value="' + n.toUpperCase() + '">' + n + '</option>'; }).join('');

    var inCss = 'width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:var(--r);font-size:14px;font-family:Sora,sans-serif;outline:none;background:var(--paper);color:var(--ink);box-sizing:border-box;';
    card.innerHTML =
        '<div style="background:linear-gradient(135deg,#7f1d1d,#dc2626);padding:18px 22px;color:#fff;">'
        + '<div style="font-size:16px;font-weight:800;">\ud83d\uddd1\ufe0f Delete record</div>'
        + '<div style="font-size:12px;opacity:.8;margin-top:3px;">' + monthLbl + ' ' + yearLbl + '</div></div>'
        + '<div style="padding:20px 22px;">'
        + '<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px;">What to delete</label>'
        + '<select id="del-target" style="' + inCss + 'cursor:pointer;margin-bottom:14px;">' + personOpts + '</select>'
        + '<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:6px;">Password</label>'
        + '<input id="del-pw" type="password" placeholder="Password" style="' + inCss + 'text-align:center;">'
        + '<div id="del-err" style="font-size:12px;color:#dc2626;min-height:16px;margin-top:6px;"></div>'
        + '<div style="font-size:11px;color:var(--ink3);line-height:1.5;">Deleting a single person only removes their data for this month. Other months are not affected.</div>'
        + '</div>'
        + '<div style="padding:14px 22px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;">'
        + '<button id="del-cancel" style="padding:9px 18px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;color:var(--ink);">Cancel</button>'
        + '<button id="del-ok" style="padding:9px 22px;border:none;border-radius:var(--r);background:#dc2626;color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">Delete</button>'
        + '</div>';
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    var pwInput = document.getElementById('del-pw');
    if (pwInput) setTimeout(function () { pwInput.focus(); }, 50);

    function doDelete() {
        if (!pwInput || pwInput.value !== correctPw) {
            var err = document.getElementById('del-err');
            if (err) err.textContent = 'Incorrect password';
            if (pwInput) { pwInput.value = ''; pwInput.focus(); }
            return;
        }
        var target = (document.getElementById('del-target') || {}).value || '__ALL__';
        var curIndex = (window.appState.config.reportHistory || []).indexOf(report);
        if (curIndex < 0) { overlay.remove(); showToast('\u26a0\ufe0f', 'Report not found'); return; }
        if (target === '__ALL__') {
            window.appState.config.reportHistory.splice(curIndex, 1);
            showToast('\u2705', monthLbl + ' ' + yearLbl + ' deleted');
        } else {
            report.data = (report.data || []).filter(function (p) { return (p.name || '').toUpperCase() !== target; });
            // If no one is left in this month, drop the empty month entry too.
            if (report.data.length === 0) window.appState.config.reportHistory.splice(curIndex, 1);
            showToast('\u2705', target + ' removed from ' + monthLbl + ' ' + yearLbl);
        }
        saveConfig();
        loadQuickCalculateHistory();
        overlay.remove();
    }

    document.getElementById('del-cancel').addEventListener('click', function () { overlay.remove(); });
    document.getElementById('del-ok').addEventListener('click', doDelete);
    if (pwInput) pwInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') doDelete(); });
}

// Show loading
function showLoading(message) {
    // Simple implementation
    console.log('⏳', message);
}

// Hide loading
function hideLoading() {
    // Simple implementation
}

// Load history records
function loadQuickCalculateHistory() {
    var historyList = document.getElementById('history-list');
    var summaryEl = document.getElementById('history-summary');
    if (!historyList) return;

    var history = (window.appState && window.appState.config && window.appState.config.reportHistory) || [];
    var cfg = window.appState.config || {};
    var subEl = document.getElementById('history-sub');
    var curYear = new Date().getFullYear();

    function escHtml(s) {
        return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }

    var defaultRates = [
        {min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},
        {min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.01}
    ];
    var cfgRates = cfg.monthly_commission_rates;
    var rates = (cfgRates && cfgRates.length > 0) ? cfgRates : defaultRates;

    function calcC(sales, target, name) {
        if (!target || !sales || target <= 0 || sales <= 0) return 0;
        var ach = (sales / target) * 100, r = rates;
        var nu = name ? name.toUpperCase() : null;
        if (nu && cfg.person_commission_rates && cfg.person_commission_rates[nu]) r = cfg.person_commission_rates[nu];
        for (var i = 0; i < r.length; i++) if (ach >= r[i].min && ach <= r[i].max) return sales * (r[i].rate || 0);
        return 0;
    }
    function calcInc(pct, tiers) {
        if (!tiers || !tiers.length) return 0;
        var s = tiers.slice().sort(function(a, b) { return b.min - a.min; });
        for (var i = 0; i < s.length; i++) if (pct >= s[i].min) return s[i].incentive || 0;
        return 0;
    }

    var configuredPeople = Object.keys(cfg.base_salaries || {}).map(function(n) { return n.toUpperCase(); });
    var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var curMonthIdx = new Date().getMonth();

    function hasReportData(r) {
        return (r.data || []).some(function(p) {
            return (p.target || 0) > 0 || (p.sales || 0) > 0 || (p.collectionAmount || 0) > 0;
        });
    }

    var allSorted = history.slice()
        .filter(function(r) {
            var yr = keyYear(r.month) || curYear;
            var bm = bareMonth(r.month);
            var mi = monthOrder.indexOf(bm);
            return (yr < curYear || (yr === curYear && mi <= curMonthIdx)) && hasReportData(r);
        })
        .sort(function(a, b) {
            var yA = keyYear(a.month) || curYear;
            var yB = keyYear(b.month) || curYear;
            if (yA !== yB) return yB - yA;
            return monthOrder.indexOf(bareMonth(b.month)) - monthOrder.indexOf(bareMonth(a.month));
        });

    var yearsInHistory = [];
    allSorted.forEach(function(r) {
        var y = keyYear(r.month) || curYear;
        if (yearsInHistory.indexOf(y) === -1) yearsInHistory.push(y);
    });
    yearsInHistory.sort(function(a, b) { return b - a; });
    if (yearsInHistory.indexOf(curYear) === -1) yearsInHistory.unshift(curYear);

    var yearSel = document.getElementById('history-year-select');
    var showAllYears = false;
    var selectedYear = curYear;
    if (yearSel) {
        var prevVal = yearSel.value || '';
        yearSel.innerHTML = '<option value="ALL">All Years</option>'
            + yearsInHistory.map(function(y) {
                return '<option value="' + y + '">' + y + '</option>';
            }).join('');
        if (prevVal === 'ALL') {
            showAllYears = true;
            yearSel.value = 'ALL';
        } else if (prevVal && yearsInHistory.indexOf(parseInt(prevVal, 10)) !== -1) {
            selectedYear = parseInt(prevVal, 10);
            yearSel.value = prevVal;
        } else if (yearsInHistory.indexOf(curYear) !== -1) {
            selectedYear = curYear;
            yearSel.value = String(curYear);
        } else if (yearsInHistory.length) {
            selectedYear = yearsInHistory[0];
            yearSel.value = String(selectedYear);
        } else {
            yearSel.value = 'ALL';
            showAllYears = true;
        }
        if (yearSel.value === 'ALL') showAllYears = true;
    }

    var sorted = showAllYears
        ? allSorted.slice()
        : allSorted.filter(function(r) {
            return (keyYear(r.month) || curYear) === selectedYear;
        });

    var monthSel = document.getElementById('history-month-select');
    var selectedMonth = monthSel ? monthSel.value : 'ALL';

    var groupSel = document.getElementById('history-group-select');
    var selectedGroup = groupSel ? groupSel.value : 'ALL';

    var personSel = document.getElementById('history-person-select');
    var prevPerson = personSel ? personSel.value : 'ALL';
    var peopleNames = Object.keys(cfg.base_salaries || {});
    var filteredPeopleNames = peopleNames.filter(function(n) {
        return selectedGroup === 'ALL' || getEmployeeType(n) === selectedGroup;
    });
    if (personSel) {
        personSel.innerHTML = '<option value="ALL">All Staff</option>'
            + filteredPeopleNames.map(function(n) {
                return '<option value="' + escHtml(n) + '">' + escHtml(n) + '</option>';
            }).join('');
        if (prevPerson === 'ALL' || filteredPeopleNames.indexOf(prevPerson) !== -1) {
            personSel.value = prevPerson;
        } else {
            personSel.value = 'ALL';
        }
    }
    var selectedPerson = personSel ? personSel.value : 'ALL';

    function personMatchesGroup(name) {
        return selectedGroup === 'ALL' || getEmployeeType(name) === selectedGroup;
    }

    function personHasDataInReport(personName, report, bm, yr) {
        var nu = (personName || '').toUpperCase();
        if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(personName, bm, yr)) return false;
        var reportData = report.data || [];
        var pd = reportData.find(function(p) { return (p.name || '').toUpperCase() === nu; });
        if (!pd) return false;
        var t = getEmployeeType(personName);
        if (t === 'Sales') return (pd.target || 0) > 0 || (pd.sales || 0) > 0;
        if (t === 'Support Staff') return (pd.collectionAmount || 0) > 0;
        if (t === 'Supervisor') {
            var team = calcTeamTotals(bm, yr);
            return team.target > 0;
        }
        return false;
    }

    if (selectedMonth !== 'ALL') {
        sorted = sorted.filter(function(r) { return bareMonth(r.month) === selectedMonth; });
    }
    if (selectedGroup !== 'ALL') {
        sorted = sorted.filter(function(r) {
            var bm = bareMonth(r.month);
            var yr = keyYear(r.month) || (showAllYears ? curYear : selectedYear);
            return filteredPeopleNames.some(function(n) {
                return personHasDataInReport(n, r, bm, yr);
            });
        });
    }
    if (selectedPerson !== 'ALL') {
        sorted = sorted.filter(function(r) {
            var bm = bareMonth(r.month);
            var yr = keyYear(r.month) || (showAllYears ? curYear : selectedYear);
            return personHasDataInReport(selectedPerson, r, bm, yr);
        });
    }

    function scopeCommForReport(report, bm, yr) {
        if (selectedPerson !== 'ALL') {
            var reportData = report.data || [];
            var pd = reportData.find(function(p) { return (p.name || '').toUpperCase() === selectedPerson.toUpperCase(); });
            if (!pd) pd = { name: selectedPerson };
            if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(selectedPerson, bm, yr)) return 0;
            return calcPersonBonus(pd, bm, yr).total;
        }
        return monthTotalComm(report, bm, yr);
    }

    function quarterNum(bm) {
        var i = monthOrder.indexOf((bm || '').toUpperCase());
        if (i < 0) return 0;
        return Math.floor(i / 3) + 1;
    }
    function quarterKey(bm) {
        var q = quarterNum(bm);
        return q ? ('Q' + q) : '';
    }
    function isQuarterClose(bm) {
        return ['MAR', 'JUN', 'SEP', 'DEC'].indexOf((bm || '').toUpperCase()) !== -1;
    }

    function calcTeamTotals(bm, yr) {
        var hEntry = findHistEntry(history, bm, yr);
        if (!hEntry || !hEntry.data) return { ach: 0, sales: 0, target: 0 };
        var tS = 0, tT = 0;
        hEntry.data.forEach(function(p) {
            if (getEmployeeType(p.name) !== 'Sales') return;
            tS += parseFloat(p.sales) || 0;
            tT += parseFloat(p.target) || 0;
        });
        return { ach: tT > 0 ? (tS / tT * 100) : 0, sales: tS, target: tT };
    }
    function getTierA(tiers, pct) {
        if (!tiers || !tiers.length) return 0;
        var s = tiers.slice().sort(function(a, b) { return b.min - a.min; });
        for (var i = 0; i < s.length; i++) if (pct >= s[i].min) return s[i].amt || 0;
        return 0;
    }
    function calcTeamTotalsFull(bm, yr) {
        var hEntry = findHistEntry(history, bm, yr);
        if (!hEntry || !hEntry.data) return { ach: 0, collAch: 0, callAch: 0 };
        var tS = 0, tT = 0, tCo = 0, tCoT = 0, tCa = 0, tCaT = 0;
        hEntry.data.forEach(function(p) {
            if (getEmployeeType(p.name) !== 'Sales') return;
            tS += parseFloat(p.sales) || 0;
            tT += parseFloat(p.target) || 0;
            tCo += parseFloat(p.collectionAmount) || 0;
            tCoT += parseFloat(p.collectionTarget) || 0;
            tCa += parseFloat(p.callActual) || 0;
            tCaT += parseFloat(p.callTarget) || 0;
        });
        return {
            ach: tT > 0 ? (tS / tT * 100) : 0,
            collAch: tCoT > 0 ? (tCo / tCoT * 100) : 0,
            callAch: tCaT > 0 ? (tCa / tCaT * 100) : 0
        };
    }
    function calcPersonBonus(p, bm, yr) {
        var empType = getEmployeeType(p.name);
        var nu = (p.name || '').toUpperCase();
        if (empType === 'Supervisor') {
            var team = calcTeamTotalsFull(bm, yr);
            var saleT = (cfg.person_supervisor_sale_tiers && cfg.person_supervisor_sale_tiers[p.name]) || cfg.supervisor_sale_tiers || [];
            var collT = (cfg.person_supervisor_coll_tiers && cfg.person_supervisor_coll_tiers[p.name]) || cfg.supervisor_coll_tiers || [];
            var callT = (cfg.person_supervisor_call_tiers && cfg.person_supervisor_call_tiers[p.name]) || cfg.supervisor_call_tiers || [];
            var qtrT = (cfg.person_supervisor_qtr_tiers && cfg.person_supervisor_qtr_tiers[p.name]) || cfg.supervisor_qtr_tiers || [];
            var qtrBonus = ['MAR','JUN','SEP','DEC'].indexOf(bm.toUpperCase()) !== -1 ? getTierA(qtrT, team.ach) : 0;
            return { total: getTierA(saleT, team.ach) + getTierA(collT, team.collAch) + getTierA(callT, team.callAch) + qtrBonus, ach: team.ach, display: empType };
        }
        if (empType === 'Support Staff') {
            var blocks = parseFloat(p.collectionAmount) || 0;
            var rate = (cfg.person_merchandiser_rates && cfg.person_merchandiser_rates[p.name] != null)
                ? parseFloat(cfg.person_merchandiser_rates[p.name])
                : (parseFloat(cfg.merchandiser_block_rate) || 10);
            return { total: blocks * rate, blocks: blocks, display: empType };
        }
        var comm = calcC(p.sales, p.target, p.name);
        var collPct = (p.collectionTarget || 0) > 0 ? (p.collectionAmount || 0) / p.collectionTarget * 100 : 0;
        var callPct = (p.callTarget || 0) > 0 ? (p.callActual || 0) / p.callTarget * 100 : 0;
        var collI = calcInc(collPct, (cfg.person_collection_incentive && cfg.person_collection_incentive[nu]) || cfg.collection_incentive || []);
        var callI = calcInc(callPct, (cfg.person_call_incentive && cfg.person_call_incentive[nu]) || cfg.active_call_incentive || []);
        var ach = (p.target || 0) > 0 ? (p.sales || 0) / p.target * 100 : 0;
        return { total: comm + collI + callI, ach: ach, display: empType };
    }
    function monthTotalComm(report, bm, yr) {
        var reportData = report.data || [];
        var people = configuredPeople.map(function(name) {
            var existing = reportData.find(function(p) { return (p.name || '').toUpperCase() === name; });
            return existing || { name: name };
        });
        reportData.forEach(function(p) {
            if (configuredPeople.indexOf((p.name || '').toUpperCase()) === -1) people.push(p);
        });
        var total = 0;
        people.forEach(function(p) {
            if (!personMatchesGroup(p.name)) return;
            if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(p.name, bm, yr)) return;
            total += calcPersonBonus(p, bm, yr).total;
        });
        return total;
    }

    var groupLabel = selectedGroup === 'ALL' ? '' : selectedGroup === 'Supervisor' ? 'Management Staff' : selectedGroup;

    if (subEl) {
        var scopeParts = [showAllYears ? 'All Years' : String(selectedYear)];
        if (selectedMonth !== 'ALL') scopeParts.push(selectedMonth);
        if (selectedGroup !== 'ALL') scopeParts.push(groupLabel);
        if (selectedPerson !== 'ALL') scopeParts.push(selectedPerson);
        subEl.textContent = sorted.length + ' month' + (sorted.length === 1 ? '' : 's') + ' · ' + scopeParts.join(' · ');
    }

    if (summaryEl) summaryEl.innerHTML = '';

    if (sorted.length === 0) {
        var emptyParts = [];
        if (!showAllYears) emptyParts.push(String(selectedYear));
        if (selectedMonth !== 'ALL') emptyParts.push(selectedMonth);
        if (selectedGroup !== 'ALL') emptyParts.push(groupLabel);
        if (selectedPerson !== 'ALL') emptyParts.push(selectedPerson);
        var emptyScope = emptyParts.length ? emptyParts.join(' · ') : (showAllYears ? 'any year' : String(selectedYear));
        historyList.innerHTML = '<div class="empty-state">'
            + '<div class="empty-state-icon">📋</div>'
            + '<div class="empty-state-title">No history for ' + escHtml(emptyScope) + '</div>'
            + '<div class="empty-state-sub">Save data in Sales Insight to create monthly records</div>'
            + '<button type="button" class="tbtn blue" style="margin-top:16px;" onclick="switchView(\'quick\')">Go to Calculate →</button>'
            + '</div>';
        return;
    }

    var scopeCommTotal = 0;
    var achSum = 0;
    var achCount = 0;
    sorted.forEach(function(report) {
        var bm = bareMonth(report.month);
        var yr = keyYear(report.month) || (showAllYears ? curYear : selectedYear);
        scopeCommTotal += scopeCommForReport(report, bm, yr);
        if (selectedPerson !== 'ALL') {
            var reportData = report.data || [];
            var pd = reportData.find(function(p) { return (p.name || '').toUpperCase() === selectedPerson.toUpperCase(); });
            if (pd) {
                var pb = calcPersonBonus(pd, bm, yr);
                if (pb.display === 'Sales' && (pd.target || 0) > 0) {
                    achSum += pb.ach || 0;
                    achCount++;
                } else if (pb.display === 'Supervisor') {
                    var team = calcTeamTotals(bm, yr);
                    if (team.target > 0) {
                        achSum += team.ach;
                        achCount++;
                    }
                }
            }
        } else {
            var team = calcTeamTotals(bm, yr);
            if (team.target > 0) {
                achSum += team.ach;
                achCount++;
            }
        }
    });
    var avgAch = achCount > 0 ? (achSum / achCount) : 0;
    var latest = sorted[0];
    var latestLabel = bareMonth(latest.month) + ' ' + (keyYear(latest.month) || (showAllYears ? curYear : selectedYear));
    var fmtRm = function(n) {
        return 'RM ' + (n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    var summaryScopeParts = [showAllYears ? 'All Years' : String(selectedYear)];
    if (selectedMonth !== 'ALL') summaryScopeParts.push(selectedMonth);
    if (selectedGroup !== 'ALL') summaryScopeParts.push(groupLabel);
    if (selectedPerson !== 'ALL') summaryScopeParts.push(selectedPerson);
    var summaryScopeLabel = summaryScopeParts.join(' · ');
    var achKpiLbl = selectedPerson !== 'ALL'
        ? (getEmployeeType(selectedPerson) === 'Supervisor' ? 'Avg Team Achievement' : 'Avg Achievement')
        : 'Avg Team Achievement';

    if (summaryEl) {
        summaryEl.innerHTML = '<div class="history-summary">'
            + '<div class="dash-kpi"><div class="dash-kpi-lbl">Records</div><div class="dash-kpi-val">' + sorted.length + '</div></div>'
            + '<div class="dash-kpi dash-kpi--good"><div class="dash-kpi-lbl">Total Comm / Inc (' + escHtml(summaryScopeLabel) + ')</div><div class="dash-kpi-val">' + fmtRm(scopeCommTotal) + '</div></div>'
            + '<div class="dash-kpi ' + (avgAch >= 100 ? 'dash-kpi--good' : avgAch >= 90 ? 'dash-kpi--warn' : '') + '"><div class="dash-kpi-lbl">' + achKpiLbl + '</div><div class="dash-kpi-val">' + (achCount > 0 ? avgAch.toFixed(2) + '%' : '—') + '</div></div>'
            + '<div class="dash-kpi dash-kpi--muted"><div class="dash-kpi-lbl">Latest Month</div><div class="dash-kpi-val" style="font-family:Sora,sans-serif;">' + latestLabel + '</div></div>'
            + '</div>';
    }

    function renderHistoryCard(report) {
        var reportData = report.data || [];
        var people = configuredPeople.map(function(name) {
            var existing = reportData.find(function(p) { return (p.name || '').toUpperCase() === name; });
            return existing || { name: name, target: 0, sales: 0, collectionTarget: 0, collectionAmount: 0, callTarget: 0, callActual: 0 };
        });
        reportData.forEach(function(p) {
            if (configuredPeople.indexOf((p.name || '').toUpperCase()) === -1) people.push(p);
        });

        var month = bareMonth(report.month);
        var monthYear = keyYear(report.month) || (showAllYears ? curYear : selectedYear);
        var realIndex = history.indexOf(report);
        var totalComm = scopeCommForReport(report, month, monthYear);
        var teamAch = calcTeamTotals(month, monthYear).ach;
        var achBadgeCls = teamAch >= 100 ? 'good' : teamAch >= 90 ? 'warn' : 'bad';
        var qKey = quarterKey(month);
        var qtrBadge = qKey
            ? '<span class="h-qtr-badge' + (isQuarterClose(month) ? ' close' : '') + '">' + qKey + (isQuarterClose(month) ? ' Close' : '') + '</span>'
            : '';

        var peopleWithData = people.filter(function(p) {
            if (!personMatchesGroup(p.name)) return false;
            if (selectedPerson !== 'ALL' && (p.name || '').toUpperCase() !== selectedPerson.toUpperCase()) return false;
            if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(p.name, month, monthYear)) return false;
            var t = getEmployeeType(p.name);
            if (t === 'Sales') return (p.target || 0) > 0 || (p.sales || 0) > 0;
            if (t === 'Support Staff') return (p.collectionAmount || 0) > 0;
            if (t === 'Supervisor') return selectedPerson !== 'ALL' || teamAch > 0 || calcTeamTotals(month, monthYear).target > 0;
            return false;
        });
        peopleWithData.sort(function(a, b) {
            return calcPersonBonus(b, month, monthYear).total - calcPersonBonus(a, month, monthYear).total;
        });

        var showMax = 4;
        var peopleHtml = peopleWithData.slice(0, showMax).map(function(p) {
            var bonus = calcPersonBonus(p, month, monthYear);
            var tc = getRoleBadgeStyle(bonus.display);
            var ach = bonus.ach || 0;
            var achCls = bonus.display === 'Sales' ? (ach >= 100 ? 'ach-good' : ach >= 90 ? 'ach-warn' : 'ach-bad') : '';
            var mainVal = bonus.display === 'Support Staff' ? bonus.blocks + ' blk'
                : bonus.display === 'Supervisor' ? ach.toFixed(1) + '% team'
                : ach.toFixed(1) + '%';
            var meta = tc.icon + ' ' + (bonus.display === 'Supervisor' ? 'Mgmt' : bonus.display === 'Support Staff' ? 'Support' : 'Sales');
            var pname = p.name || '—';
            return '<div class="h-person">'
                + '<div class="h-pav" style="background:' + tc.bg + ';color:' + tc.c + ';">' + escHtml(pname.charAt(0)) + '</div>'
                + '<div class="h-pinfo"><div class="h-pname" title="' + escHtml(pname) + '">' + escHtml(pname) + '</div><div class="h-pmeta">' + meta + '</div></div>'
                + '<div class="h-person-right"><div class="h-pach' + (achCls ? ' ' + achCls : '') + '"' + (!achCls ? ' style="color:' + tc.c + ';"' : '') + '>' + mainVal + '</div>'
                + '<div class="h-pcomm">' + formatCurrency(bonus.total) + '</div></div>'
                + '</div>';
        }).join('');
        var moreCount = peopleWithData.length - showMax;
        if (moreCount > 0) {
            peopleHtml += '<div class="h-more">+' + moreCount + ' more employee' + (moreCount > 1 ? 's' : '') + ' · click card to open full report</div>';
        }

        var cardAccent = teamAch >= 100 ? 'h-card--good' : teamAch >= 90 ? 'h-card--warn' : teamAch > 0 ? 'h-card--bad' : '';

        return '<div class="h-card ' + cardAccent + '">'
            + '<div class="h-card-body" onclick="viewHistoryReport(' + realIndex + ')" title="Click to view full report">'
            + '<div class="h-card-top">'
            + '<div><div class="h-month-row"><div class="h-month">' + month + '</div>' + qtrBadge
            + (teamAch > 0 ? '<span class="h-ach-badge ' + achBadgeCls + '">' + teamAch.toFixed(1) + '%</span>' : '')
            + '</div><div class="h-year">' + monthYear + '</div></div>'
            + '<div><div class="h-comm-lbl">TOTAL COMM/INC PAID</div><div class="h-comm-val">' + formatCurrency(totalComm) + '</div></div>'
            + '</div>'
            + (peopleHtml.length > 0 ? '<div class="h-people">' + peopleHtml + '</div>' : '')
            + '</div>'
            + '<div class="h-foot">'
            + '<div class="h-foot-primary">'
            + '<button class="hbtn hbtn-view hbtn-primary" onclick="event.stopPropagation();viewHistoryReport(' + realIndex + ')">👁 View</button>'
            + '<button class="hbtn hbtn-excel hbtn-primary" onclick="event.stopPropagation();openHistoryExcel(' + realIndex + ')">📊 Excel</button>'
            + '</div>'
            + '<div class="h-foot-actions">'
            + '<details class="h-more-menu" onclick="event.stopPropagation()">'
            + '<summary class="hbtn hbtn-more">⋯ More</summary>'
            + '<div class="h-more-drop">'
            + '<button class="hbtn hbtn-payslip" onclick="event.stopPropagation();printPayslipsFromHistory(' + realIndex + ')">📄 Payslip</button>'
            + '<button class="hbtn hbtn-pdf" onclick="event.stopPropagation();printHistoryReport(' + realIndex + ')">🖨️ PDF</button>'
            + '</div></details>'
            + '<button class="hbtn hbtn-del hbtn-del--ghost" onclick="event.stopPropagation();deleteHistoryReport(' + realIndex + ')" title="Delete this month">🗑️</button>'
            + '</div></div></div>';
    }

    function sectionMeta(reports, yrLabel) {
        var comm = 0;
        reports.forEach(function(r) {
            var bm = bareMonth(r.month);
            var yr = keyYear(r.month) || yrLabel || curYear;
            comm += scopeCommForReport(r, bm, yr);
        });
        return reports.length + ' month' + (reports.length === 1 ? '' : 's') + ' · ' + fmtRm(comm);
    }

    function historyGridClass(count) {
        if (count <= 1) return 'history-grid history-grid--cols-1';
        if (count === 2) return 'history-grid history-grid--cols-2';
        return 'history-grid';
    }

    function buildGroupedHistoryHtml() {
        if (showAllYears) {
            var byYear = {};
            sorted.forEach(function(r) {
                var y = keyYear(r.month) || curYear;
                if (!byYear[y]) byYear[y] = [];
                byYear[y].push(r);
            });
            return Object.keys(byYear).map(Number).sort(function(a, b) { return b - a; }).map(function(y) {
                return '<div class="history-year-group">'
                    + '<div class="history-section-title"><span>' + y + '</span><span class="history-section-meta">' + sectionMeta(byYear[y], y) + '</span></div>'
                    + '<div class="' + historyGridClass(byYear[y].length) + '">' + byYear[y].map(renderHistoryCard).join('') + '</div>'
                    + '</div>';
            }).join('');
        }

        var byQuarter = { Q4: [], Q3: [], Q2: [], Q1: [] };
        sorted.forEach(function(r) {
            var q = quarterKey(bareMonth(r.month));
            if (byQuarter[q]) byQuarter[q].push(r);
        });
        var qOrder = ['Q4', 'Q3', 'Q2', 'Q1'];
        var qLabels = { Q1: 'Q1 · Jan – Mar', Q2: 'Q2 · Apr – Jun', Q3: 'Q3 · Jul – Sep', Q4: 'Q4 · Oct – Dec' };
        return qOrder.filter(function(q) { return byQuarter[q].length > 0; }).map(function(q) {
            return '<div class="history-year-group">'
                + '<div class="history-section-title"><span>' + qLabels[q] + '</span><span class="history-section-meta">' + sectionMeta(byQuarter[q], selectedYear) + '</span></div>'
                + '<div class="' + historyGridClass(byQuarter[q].length) + '">' + byQuarter[q].map(renderHistoryCard).join('') + '</div>'
                + '</div>';
        }).join('');
    }

    historyList.innerHTML = buildGroupedHistoryHtml();

    historyList.querySelectorAll('.h-more-menu').forEach(function(menu) {
        menu.addEventListener('toggle', function() {
            if (!menu.open) return;
            historyList.querySelectorAll('.h-more-menu').forEach(function(other) {
                if (other !== menu) other.open = false;
            });
        });
    });
}
window.loadQuickCalculateHistory = loadQuickCalculateHistory;






// ==================== Live Payslip Preview ====================
function updateLivePayslip() {
    var ps = document.getElementById('live-payslip');
    if (!ps) return;
    ps.style.display = 'flex';
    ps.style.flexDirection = 'column';
    var person = window.appState.salespeople[0];
    if (!person || !person.name) { 
        // Show empty state
        var titleEl = document.getElementById('ps-title');
        if (titleEl) titleEl.textContent = '— SALARY REPORT';
        var body = document.getElementById('ps-body');
        if (body) body.innerHTML = '';
        var grand = document.getElementById('ps-grand');
        if (grand) grand.textContent = 'RM 0.00';
        return; 
    }
    var cfg = window.appState.config;
    var nu  = (person.name || '').toUpperCase();
    // Use salary for the current report month (not latest salary)
    var curMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var salaryRec = getSalaryForMonth(person.name, curMonth);
    var salary  = salaryRec.salary;
    var allow   = salaryRec.allowances;
    var epfRate = salaryRec.epfRate;
    var hp=allow.HP||0, car=allow.CAR||0, lf=allow['LOCAL FUEL']||0;
    var of2=allow['OUTSTATION FUEL']||0, hs=allow.HOUSING||0, food=allow.FOOD||0, oth=allow.OTHERS||0;
    var sales   = parseFloat(person.sales)  || 0;
    var target  = parseFloat(person.target) || 0;
    var collBon = parseFloat(person.collectionIncentive) || 0;
    var callBon = parseFloat(person.activeCallIncentive) || 0;
    var qtrBon  = parseFloat(person.quarterlyBonus)      || 0;
    var comm    = parseFloat(person.commission) || calculateCommission(sales, target, person.name);
    var ach = target > 0 ? (sales / target * 100) : 0;
    var totalAllow = hp+car+lf+of2+hs+food+oth;
    var totalFixed = salary + totalAllow;
    var totalFlexible = comm + collBon + callBon + qtrBon;
    var totalInc   = totalFixed + totalFlexible;
    var _psYearE   = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var _epfRes    = (typeof computeEpf === 'function') ? computeEpf(person.name, totalInc, curMonth, _psYearE) : { employee: totalInc*(epfRate/100), empPct: epfRate };
    var epfAmt     = _epfRes.employee;
    var epfPctLabel= (_epfRes.empPct != null) ? _epfRes.empPct.toFixed(1) : epfRate;
    var _socsoRes  = (typeof computeSocso === 'function') ? computeSocso(person.name, totalInc, curMonth, _psYearE) : { employee: 0 };
    var socsoAmt   = _socsoRes.employee;
    var _eisRes    = (typeof computeEis === 'function') ? computeEis(person.name, totalInc, curMonth, _psYearE) : { employee: 0 };
    var eisAmt     = _eisRes.employee;
    var grand      = totalInc - epfAmt - socsoAmt - eisAmt;
    var achColor   = ach>=100 ? '#1D9E75' : ach>=90 ? '#BA7517' : '#E24B4A';
    var g = function(id){ return document.getElementById(id); };
    if(g('ps-title'))   g('ps-title').textContent   = person.name + ' — SALARY REPORT';
    if(g('ps-ach-lbl')) g('ps-ach-lbl').textContent = 'Achievement: ' + ach.toFixed(2) + '%';
    if(g('ps-ach-pct')){ g('ps-ach-pct').textContent = ach.toFixed(2)+'%'; g('ps-ach-pct').style.color = achColor; }
    if(g('ps-ach-bar')){ g('ps-ach-bar').style.width = Math.min(ach,120)+'%'; g('ps-ach-bar').style.background = achColor; }
    if(g('ps-personal')) g('ps-personal').textContent = formatCurrency(sales);
    // Team sale = sum of all salespeople sales this month
    var teamSales = 0;
    var curMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var _psYear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var hist = window.appState.config.reportHistory || [];
    var hEntry = findHistEntry(hist, curMonth, _psYear);
    if (hEntry && hEntry.data) {
        teamSales = hEntry.data.reduce(function(s,p){ return s + (parseFloat(p.sales)||0); }, 0);
    } else {
        // Fallback: sum from current appState
        teamSales = (window.appState.salespeople||[]).reduce(function(s,p){ return s+(parseFloat(p.sales)||0); }, 0);
    }
    if(g('ps-team')) g('ps-team').textContent = formatCurrency(teamSales || sales);
    if(g('ps-grand'))    g('ps-grand').textContent    = formatCurrency(grand);

    function fp(v){ return sales>0 ? (v/sales*100).toFixed(3)+'%' : '0.000%'; }
    function tp(v){ return teamSales>0 ? (v/teamSales*100).toFixed(3)+'%' : '0.000%'; }
    function fc(v){ return formatCurrency(v); }
    function sec(l){ return '<tr style="background:#E6F1FB;"><td colspan="4" style="padding:4px 10px;font-weight:600;color:#0C447C;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">'+l+'</td></tr>'; }
    function pctTd(v, fn) {
        return '<td class="ps-pct" style="padding:4px 6px;">' + fn(v) + '</td>';
    }
    function row(l,v,blue,bold){
        var fw=bold?'font-weight:600;':'', bg=bold?'background:#B5D4F4;':'';
        var tc=blue?'color:#185FA5;':bold?'color:#0C447C;':'';
        var lc=bold?'color:#0C447C;':'color:var(--ink3);';
        return '<tr style="'+bg+'border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;'+fw+lc+'">'+l+'</td>'
            +'<td style="padding:4px 6px;text-align:right;'+fw+tc+'">'+fc(v)+'</td>'
            + pctTd(v, fp)
            + pctTd(v, tp) + '</tr>';
    }
    function erow(v){
        return '<tr style="border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;color:var(--ink3);">EPF '+epfPctLabel+'%</td>'
            +'<td style="padding:4px 6px;text-align:right;color:#E24B4A;">'+fc(v)+'</td>'
            + pctTd(v, fp)
            + pctTd(v, tp) + '</tr>';
    }
    function eisrow(v){
        return '<tr style="border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;color:var(--ink3);">EIS 0.2%</td>'
            +'<td style="padding:4px 6px;text-align:right;color:#E24B4A;">'+fc(v)+'</td>'
            + pctTd(v, fp)
            + pctTd(v, tp) + '</tr>';
    }
    function socsorow(v){
        return '<tr style="border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;color:var(--ink3);">SOCSO 0.5%</td>'
            +'<td style="padding:4px 6px;text-align:right;color:#E24B4A;">'+fc(v)+'</td>'
            + pctTd(v, fp)
            + pctTd(v, tp) + '</tr>';
    }
    function payablePctRow(v){
        return '<tr class="ps-payable-pct" style="background:#B5D4F4;border-top:0.5px solid var(--line);">'
            +'<td colspan="2"></td>'
            + pctTd(v, fp)
            + pctTd(v, tp) + '</tr>';
    }
    var html = sec('INCOME') + row('SALARY',salary,true,false) + sec('ALLOWANCES');
    if(hp)   html += row('HP',              hp,   true, false);
    if(car)  html += row('CAR',             car,  true, false);
    if(lf)   html += row('LOCAL FUEL',      lf,   true, false);
    if(of2)  html += row('OUTSTATION FUEL', of2,  true, false);
    if(hs)   html += row('HOUSING',         hs,   true, false);
    if(food) html += row('FOOD',            food, true, false);
    if(oth)  html += row('OTHERS',          oth,  true, false);
    html += row('TOTAL FIXED INCOME', totalFixed, false, true)
          + sec('COMMISSION')    + row('COMMISSION AMOUNT', comm,    true, false)
          + sec('INCENTIVE')     + row('COLLECTION',        collBon, true, false)
          + row('ACTIVE CALL',   callBon, true, false)
          + row('QUARTERLY',     qtrBon,  true, false)
          + row('TOTAL FLEXIBLE INCOME', totalFlexible, false, true)
          + row('GRAND TOTAL',         totalInc, false, true)
          + erow(epfAmt);
    if (socsoAmt > 0) html += socsorow(socsoAmt);
    if (eisAmt > 0) html += eisrow(eisAmt);
    html += payablePctRow(grand);
    if(g('ps-body')) g('ps-body').innerHTML = html;
}
window.updateLivePayslip = updateLivePayslip;

function getSalaryReportPrintCss() {
    return 'body{font-family:Sora,sans-serif;margin:24px;color:#0f172a;}'
        + '.cw-panel-hd{font-size:12px;padding:10px 16px;font-weight:800;color:#fff;text-transform:uppercase;background:#163556;margin-bottom:8px;}'
        + '.live-payslip-card{font-size:12px;max-width:560px;margin:0 auto;}'
        + '.ps-table{width:100%;border-collapse:collapse;}'
        + '.ps-th td{padding:7px 10px;font-size:10px;font-weight:700;color:#1e4976;background:#f4f7fb;}'
        + '.ps-th td:not(:first-child){text-align:right;}'
        + '.ps-pay-rm{display:block;font-size:9px;font-weight:700;color:#64748b;margin-top:2px;letter-spacing:.04em;text-align:right;}'
        + '.ps-th td:nth-child(3),.ps-th td:nth-child(4){color:#8b5cf6;}'
        + 'tbody td{padding:6px 10px;font-size:11px;}'
        + 'tbody td:nth-child(2){text-align:right;}'
        + '.ps-pct{color:#8b5cf6;font-weight:800;text-align:right;}'
        + '.ps-foot{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#059669;color:#fff;margin-top:4px;}'
        + '.ps-foot-lbl{font-size:12px;font-weight:600;}'
        + '.ps-foot-val{font-size:18px;font-weight:800;}'
        + '.ps-meta{padding:14px 14px 12px;background:#f4f7fb;}'
        + '.ps-kpi-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}'
        + '.ps-mini{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;}'
        + '.ps-mini-box{border:1px solid #d4dce8;border-radius:8px;padding:14px 12px;background:#fff;}'
        + '.ps-mini-lbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;}'
        + '.ps-mini-val{font-size:14px;font-weight:800;color:#163556;}'
        + '.ps-ach-strip{display:none;}';
}
function stripRmPrefix(text) {
    return String(text || '').replace(/^RM\s?/, '');
}
function prepareSalaryReportPrintHtml(tile) {
    if (!tile) return '';
    var clone = tile.cloneNode(true);
    var payTh = clone.querySelector('.ps-th td:nth-child(2)');
    if (payTh) payTh.innerHTML = 'Pay<br><span class="ps-pay-rm">RM</span>';
    clone.querySelectorAll('tbody tr').forEach(function(tr) {
        var payTd = tr.querySelector('td:nth-child(2)');
        if (payTd) payTd.textContent = stripRmPrefix(payTd.textContent);
    });
    return clone.outerHTML;
}
function printSalaryReportModal() {
    var content = document.getElementById('salary-report-modal-content');
    if (!content) return;
    var tile = content.querySelector('.cw-tile-payslip');
    var titleEl = tile && tile.querySelector('.cw-panel-hd span');
    var title = titleEl ? titleEl.textContent : 'Salary Report';
    var win = window.open('', '_blank');
    if (!win) {
        showToast('⚠️', 'Pop-up blocked — allow pop-ups to print');
        return;
    }
    win.document.write('<html><head><title>' + title + '</title><style>' + getSalaryReportPrintCss() + '</style></head><body>');
    win.document.write(prepareSalaryReportPrintHtml(tile) || content.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 300);
}
function openSalaryReportModal() {
    var person = window.appState.salespeople[0];
    if (!person || !person.name) {
        showToast('⚠️', 'Please select a person first');
        return;
    }
    if (typeof updateLivePayslip === 'function') updateLivePayslip();

    var tile = document.querySelector('#view-quick .cw-tile-payslip');
    var live = document.getElementById('live-payslip');
    if (!tile || !live) {
        showToast('❌', 'Salary report layout not found');
        return;
    }

    closeSalaryReportModal();

    var overlay = document.createElement('div');
    overlay.id = 'salary-report-modal';
    overlay.className = 'salary-report-modal-overlay';
    overlay.innerHTML = ''
        + '<div class="salary-report-modal-dialog" role="dialog" aria-modal="true" aria-label="Salary report">'
        + '<div class="salary-report-modal-content" id="salary-report-modal-content"></div>'
        + '<div class="salary-report-modal-bar">'
        + '<button type="button" class="salary-report-modal-btn salary-report-modal-btn--ghost" id="salary-report-close">Close</button>'
        + '<button type="button" class="salary-report-modal-btn salary-report-modal-btn--print" id="salary-report-print">🖨️ Print</button>'
        + '</div></div>';

    document.body.appendChild(overlay);

    var clone = tile.cloneNode(true);
    clone.querySelectorAll('[id]').forEach(function(el) { el.removeAttribute('id'); });
    document.getElementById('salary-report-modal-content').appendChild(clone);

    function syncCloneText(sel, srcId) {
        var src = document.getElementById(srcId);
        var dst = clone.querySelector(sel);
        if (src && dst) dst.textContent = src.textContent;
    }
    syncCloneText('.ps-mini-box.personal .ps-mini-val', 'ps-personal');
    syncCloneText('.ps-mini-box.team .ps-mini-val', 'ps-team');
    syncCloneText('.ps-foot-val', 'ps-grand');
    syncCloneText('.ps-ach-pct-val', 'ps-ach-pct');
    var srcBody = document.getElementById('ps-body');
    var dstBody = clone.querySelector('#ps-body') || clone.querySelector('tbody');
    if (srcBody && dstBody) dstBody.innerHTML = srcBody.innerHTML;

    document.getElementById('salary-report-close').addEventListener('click', closeSalaryReportModal);
    document.getElementById('salary-report-print').addEventListener('click', printSalaryReportModal);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) closeSalaryReportModal(); });
    document.addEventListener('keydown', salaryReportModalEscHandler);
}
function salaryReportModalEscHandler(e) {
    if (e.key === 'Escape') closeSalaryReportModal();
}
function closeSalaryReportModal() {
    document.removeEventListener('keydown', salaryReportModalEscHandler);
    var modal = document.getElementById('salary-report-modal');
    if (modal) modal.remove();
}
window.openSalaryReportModal = openSalaryReportModal;
window.closeSalaryReportModal = closeSalaryReportModal;
window.printSalaryReportModal = printSalaryReportModal;

// ==================== Calculation center — commission workspace ====================
function bareMonthToQuarterLabel(bareM) {
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var i = months.indexOf((bareM || '').toUpperCase());
    if (i < 0) return '\u2014';
    return 'Q' + (Math.floor(i / 3) + 1);
}
function cwGetRatesForPerson(name) {
    var nu = (name || '').toUpperCase();
    var rates = (window.appState.config && window.appState.config.monthly_commission_rates) || [];
    if (nu && window.appState.config.person_commission_rates && window.appState.config.person_commission_rates[nu])
        rates = window.appState.config.person_commission_rates[nu];
    return (rates || []).slice();
}
function cwFindSalesTier(achievement, rates) {
    for (var i = 0; i < rates.length; i++) {
        if (achievement >= rates[i].min && achievement <= rates[i].max) return { tier: rates[i], idx: i };
    }
    return null;
}
function cwNextSalesTierMin(achievement, rates) {
    var sorted = rates.slice().sort(function(a, b) { return a.min - b.min; });
    for (var j = 0; j < sorted.length; j++) {
        if (achievement < sorted[j].min) return sorted[j];
    }
    return null;
}
function cwTierSortIdx(achievement, rates) {
    var sorted = rates.slice().sort(function(a, b) { return a.min - b.min; });
    for (var k = 0; k < sorted.length; k++) {
        if (achievement >= sorted[k].min && achievement <= sorted[k].max) return k;
    }
    return -1;
}
function cwSalesFromHistory(name, month, yearStr) {
    var row = cwPersonRowFromHistory(name, month, yearStr);
    if (row) return parseFloat(row.sales) || 0;
    return null;
}
function cwPersonRowFromHistory(name, month, yearStr) {
    var nu = (name || '').toUpperCase();
    var h = findHistEntry(window.appState.config.reportHistory || [], month, yearStr);
    if (h && h.data) {
        var row = h.data.find(function(p) { return (p.name || '').toUpperCase() === nu; });
        if (row) return row;
    }
    return null;
}
function cwPrevMonthKey(selMonth, selYear) {
    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var mi = months.indexOf((selMonth || '').toUpperCase());
    var pm = mi <= 0 ? months[11] : months[mi - 1];
    var py = mi <= 0 ? selYear - 1 : selYear;
    return {
        pm: pm,
        py: py,
        curLabel: (selMonth || 'JAN').toUpperCase() + ' ' + selYear,
        prevLabel: pm + ' ' + py
    };
}
function cwFormatMomPct(cur, prev) {
    if (prev == null || isNaN(prev)) return '\u2014';
    if (prev === 0 && cur === 0) return '\u2014';
    if (prev === 0 && cur > 0) return '<span class="cw-trend-pos">\u25b4 new</span>';
    var chg = ((cur - prev) / prev) * 100;
    var cl = chg >= 0 ? 'cw-trend-pos' : 'cw-trend-neg';
    var arr = chg >= 0 ? '\u25b4' : '\u25bc';
    return '<span class="' + cl + '">' + arr + ' ' + Math.abs(chg).toFixed(2) + '%</span>';
}
function cwFormatMomPts(cur, prev) {
    if (prev == null || isNaN(prev)) return '\u2014';
    var diff = cur - prev;
    if (Math.abs(diff) < 0.005) return '<span class="cw-trend-flat">\u2014</span>';
    var cl = diff >= 0 ? 'cw-trend-pos' : 'cw-trend-neg';
    var arr = diff >= 0 ? '\u25b4' : '\u25bc';
    return '<span class="' + cl + '">' + arr + ' ' + Math.abs(diff).toFixed(2) + '%</span>';
}
function cwCalcOverallMomPct(rows) {
    var pcts = [];
    (rows || []).forEach(function(r) {
        if (r.skipOverall) return;
        var cur = r.curNum;
        var prev = r.prevNum;
        if (cur == null || isNaN(cur) || prev == null || isNaN(prev)) return;
        if (prev === 0 && cur === 0) return;
        if (prev === 0 && cur > 0) {
            pcts.push(100);
            return;
        }
        if (prev !== 0) pcts.push(((cur - prev) / prev) * 100);
    });
    if (!pcts.length) return null;
    return pcts.reduce(function(a, b) { return a + b; }, 0) / pcts.length;
}
function cwRenderCompareOverall(pct) {
    if (pct == null || isNaN(pct)) {
        return '<div class="cw-compare-overall">'
            + '<div class="cw-compare-overall-lbl">Overall comparison</div>'
            + '<div class="cw-compare-overall-val" style="font-size:11px;color:var(--calc-muted);">\u2014</div>'
            + '<div class="cw-compare-overall-sub">Not enough prior-month data</div>'
            + '</div>';
    }
    var cl = pct >= 0 ? 'cw-trend-pos' : 'cw-trend-neg';
    var arr = pct >= 0 ? '\u25b4' : '\u25bc';
    return '<div class="cw-compare-overall">'
        + '<div class="cw-compare-overall-lbl">Overall comparison</div>'
        + '<div class="cw-compare-overall-val ' + cl + '">' + arr + ' ' + Math.abs(pct).toFixed(2) + '%</div>'
        + '<div class="cw-compare-overall-sub">Average MoM across metrics above</div>'
        + '</div>';
}
function cwRenderCompareTable(rows, curLabel, prevLabel) {
    var html = '<table class="cw-compare-table"><thead><tr>'
        + '<th>Metric</th><th class="cw-compare-cur">' + curLabel + '</th>'
        + '<th class="cw-compare-prev">' + prevLabel + '</th><th>MoM</th></tr></thead><tbody>';
    rows.forEach(function(r) {
        var achCls = r.ach ? ' cw-compare-ach' : '';
        html += '<tr><td class="cw-compare-metric">' + r.label + '</td>'
            + '<td class="cw-compare-val' + achCls + '">' + r.cur + '</td>'
            + '<td class="cw-compare-val' + achCls + '">' + r.prev + '</td>'
            + '<td class="cw-compare-mom">' + r.mom + '</td></tr>';
    });
    html += '</tbody></table>';
    html += cwRenderCompareOverall(cwCalcOverallMomPct(rows));
    return html;
}
function cwCompareRow(label, curNum, prevNum, fmtCur, fmtPrev, momFn, isAch) {
    var dash = '\u2014';
    var hasPrev = prevNum != null && !isNaN(prevNum);
    return {
        label: label,
        cur: fmtCur != null ? fmtCur : (curNum != null ? String(curNum) : dash),
        prev: hasPrev ? (fmtPrev != null ? fmtPrev : String(prevNum)) : dash,
        mom: hasPrev && momFn ? momFn(curNum, prevNum) : dash,
        ach: !!isAch,
        curNum: curNum,
        prevNum: hasPrev ? prevNum : null,
        skipOverall: !!isAch || momFn === cwFormatMomPts
    };
}
function cwFmtPct(v, digits) {
    var d = digits == null ? 2 : digits;
    return (Number(v) || 0).toFixed(d) + '%';
}
function cwShortChartVal(v, isPct) {
    if (isPct) return cwFmtPct(v, 2);
    var n = v || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(2) + 'k';
    return (n).toFixed(2);
}
function cwMomBadge(cur, prev) {
    if (prev == null || isNaN(prev)) return '';
    if (prev === 0 && cur === 0) return '';
    if (prev === 0 && cur > 0) return '\u25b4';
    var chg = ((cur - prev) / prev) * 100;
    return (chg >= 0 ? '\u25b4' : '\u25bc') + Math.abs(chg).toFixed(2) + '%';
}
function cwRenderCompareGraph(bars, achPair, curLabel, prevLabel) {
    if (!bars || !bars.length) return '';
    var hasAny = bars.some(function(b) { return (b.cur || 0) > 0 || (b.prev || 0) > 0; });
    if (!hasAny && !(achPair && ((achPair.cur || 0) > 0 || (achPair.prev || 0) > 0))) {
        return '<div class="cw-compare-graph-empty">Enter data to see month comparison chart</div>';
    }

    var items = bars.map(function(b) {
        return {
            label: b.label,
            cur: b.cur || 0,
            prev: b.prev != null && !isNaN(b.prev) ? b.prev : 0,
            curFmt: b.curFmt,
            prevFmt: b.prevFmt,
            pct: false
        };
    });
    if (achPair && ((achPair.cur || 0) > 0 || (achPair.prev || 0) > 0)) {
        items.push({
            label: 'Ach%',
            cur: achPair.cur || 0,
            prev: achPair.prev || 0,
            curFmt: cwFmtPct(achPair.cur, 2),
            prevFmt: cwFmtPct(achPair.prev, 2),
            pct: true
        });
    }

    var W = 480;
    var H = 200;
    var padL = 8;
    var padR = 8;
    var padT = 8;
    var padB = 42;
    var chartW = W - padL - padR;
    var chartH = H - padT - padB;
    var maxBarH = chartH;
    var baseY = padT + chartH;
    var n = items.length;
    var groupW = chartW / Math.max(n, 1);
    var barW = Math.min(18, Math.max(9, groupW * 0.22));
    var innerGap = 3;
    var labelPad = 4;

    var html = '<div class="cw-compare-graph" role="img" aria-label="This month vs last month bar chart">';
    html += '<div class="cw-compare-graph-head"><div class="cw-compare-graph-legend">'
        + '<span class="cw-compare-leg cw-compare-leg--prev"><span class="cw-compare-leg-swatch"></span>' + prevLabel + '</span>'
        + '<span class="cw-compare-leg cw-compare-leg--cur"><span class="cw-compare-leg-swatch"></span>' + curLabel + '</span>'
        + '</div></div>';

    html += '<svg class="cw-compare-bar-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    html += '<defs>'
        + '<linearGradient id="cwBarPrev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient>'
        + '<linearGradient id="cwBarCur" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#60a5fa"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient>'
        + '</defs>';

    [0.25, 0.5, 0.75, 1].forEach(function(t) {
        var gy = padT + chartH * (1 - t);
        html += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#eef2f7" stroke-width="1"/>';
    });
    html += '<line x1="' + padL + '" y1="' + baseY + '" x2="' + (W - padR) + '" y2="' + baseY + '" stroke="#cbd5e1" stroke-width="1.2"/>';

    items.forEach(function(item, i) {
        var gx = padL + i * groupW + groupW / 2;
        var max = Math.max(item.cur, item.prev, item.pct ? 100 : 1, 1);
        var hPrev = Math.max(2, (item.prev / max) * maxBarH);
        var hCur = Math.max(2, (item.cur / max) * maxBarH);
        var xPrev = gx - barW - innerGap / 2;
        var xCur = gx + innerGap / 2;
        var yPrev = baseY - hPrev;
        var yCur = baseY - hCur;
        var mom = cwMomBadge(item.cur, item.prev);
        var momUp = mom.indexOf('\u25b4') === 0;
        var momColor = !mom ? '#94a3b8' : (momUp ? '#047857' : '#be123c');

        html += '<rect x="' + xPrev + '" y="' + yPrev + '" width="' + barW + '" height="' + hPrev + '" rx="3" fill="url(#cwBarPrev)">'
            + '<title>' + prevLabel + ' ' + item.label + ': ' + (item.prevFmt != null ? item.prevFmt : item.prev) + '</title></rect>';
        html += '<rect x="' + xCur + '" y="' + yCur + '" width="' + barW + '" height="' + hCur + '" rx="3" fill="url(#cwBarCur)">'
            + '<title>' + curLabel + ' ' + item.label + ': ' + (item.curFmt != null ? item.curFmt : item.cur) + '</title></rect>';

        var pctLabelFill = item.pct ? '#7c3aed' : null;
        var prevLabelFill = pctLabelFill || '#64748b';
        var curLabelFill = pctLabelFill || '#1d4ed8';

        var valFont = item.pct ? 9 : 7;
        var valWeight = item.pct ? 800 : 700;

        html += '<text x="' + (xPrev - labelPad) + '" y="' + (yPrev + hPrev / 2) + '" text-anchor="end" dominant-baseline="middle" fill="' + prevLabelFill + '" font-size="' + valFont + '" font-weight="' + valWeight + '" font-family="Sora, sans-serif">'
            + cwShortChartVal(item.prev, item.pct) + '</text>';
        html += '<text x="' + (xCur + barW + labelPad) + '" y="' + (yCur + hCur / 2) + '" text-anchor="start" dominant-baseline="middle" fill="' + curLabelFill + '" font-size="' + valFont + '" font-weight="800" font-family="Sora, sans-serif">'
            + cwShortChartVal(item.cur, item.pct) + '</text>';

        if (item.pct) {
            html += '<circle cx="' + (xPrev + barW / 2) + '" cy="' + yPrev + '" r="2.2" fill="#64748b" stroke="#fff" stroke-width="0.6"/>';
            html += '<circle cx="' + (xCur + barW / 2) + '" cy="' + yCur + '" r="2.2" fill="#1d4ed8" stroke="#fff" stroke-width="0.6"/>';
        }

        html += '<text x="' + gx + '" y="' + (baseY + 12) + '" text-anchor="middle" fill="#64748b" font-size="7" font-weight="800" font-family="Sora, sans-serif">' + item.label + '</text>';
        if (mom) {
            var momFill = item.pct ? '#7c3aed' : momColor;
            html += '<text x="' + gx + '" y="' + (baseY + 24) + '" text-anchor="middle" fill="' + momFill + '" font-size="9" font-weight="800" font-family="Sora, sans-serif">' + mom + '</text>';
        }
    });

    html += '</svg></div>';
    return html;
}
function cwGraphBar(label, cur, prev, curFmt, prevFmt) {
    return {
        label: label,
        cur: cur || 0,
        prev: prev != null && !isNaN(prev) ? prev : 0,
        curFmt: curFmt,
        prevFmt: prevFmt
    };
}
function cwUpdatePrevMonthPanel(person, empType, selMonth, selYear) {
    var panel = document.getElementById('cw-prev-month-panel');
    var bodyEl = document.getElementById('cw-prev-month-body');
    if (!panel || !bodyEl) return;

    var keys = cwPrevMonthKey(selMonth, selYear);
    var pm = keys.pm;
    var py = keys.py;
    var rows = [];

    if (empType === 'Supervisor') {
        var teamCur = cwSupervisorTeamTotals(selMonth, String(selYear));
        var teamPrev = cwSupervisorTeamTotals(pm, String(py));
        var curAch = teamCur.teamTarget > 0 ? (teamCur.teamSales / teamCur.teamTarget) * 100 : 0;
        var prevAch = teamPrev.teamTarget > 0 ? (teamPrev.teamSales / teamPrev.teamTarget) * 100 : 0;
        var hasPrev = teamPrev.teamSales > 0 || teamPrev.teamTarget > 0;
        rows.push(cwCompareRow('Team sales', teamCur.teamSales, hasPrev ? teamPrev.teamSales : null,
            formatCurrency(teamCur.teamSales), hasPrev ? formatCurrency(teamPrev.teamSales) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Team target', teamCur.teamTarget, hasPrev ? teamPrev.teamTarget : null,
            formatCurrency(teamCur.teamTarget), hasPrev ? formatCurrency(teamPrev.teamTarget) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Achievement', curAch, hasPrev && teamPrev.teamTarget > 0 ? prevAch : null,
            teamCur.teamTarget > 0 ? cwFmtPct(curAch, 2) : '\u2014',
            hasPrev && teamPrev.teamTarget > 0 ? cwFmtPct(prevAch, 2) : '\u2014',
            cwFormatMomPts, true));
    } else if (empType === 'Support Staff') {
        var rowS = cwPersonRowFromHistory(person.name, pm, String(py));
        var curBlocks = parseFloat(person.collectionAmount) || 0;
        var curBlockTgt = parseFloat(person.collectionTarget) || 0;
        var curCallAct = parseFloat(person.callActual) || 0;
        var curCallTgt = parseFloat(person.callTarget) || 0;
        var prevBlocks = rowS ? (parseFloat(rowS.collectionAmount) || 0) : null;
        var prevBlockTgt = rowS ? (parseFloat(rowS.collectionTarget) || 0) : null;
        var prevCallAct = rowS ? (parseFloat(rowS.callActual) || 0) : null;
        var prevCallTgt = rowS ? (parseFloat(rowS.callTarget) || 0) : null;
        rows.push(cwCompareRow('Blocks', curBlocks, prevBlocks, String(curBlocks), rowS ? String(prevBlocks) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Block target', curBlockTgt, prevBlockTgt, String(curBlockTgt), rowS ? String(prevBlockTgt) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Call actual', curCallAct, prevCallAct, String(curCallAct), rowS ? String(prevCallAct) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Call target', curCallTgt, prevCallTgt, String(curCallTgt), rowS ? String(prevCallTgt) : null, cwFormatMomPct));
    } else {
        var sales = parseFloat(person.sales) || 0;
        var target = parseFloat(person.target) || 0;
        var curAch = target > 0 ? (sales / target) * 100 : 0;
        var curComm = parseFloat(person.commission) || calculateCommission(sales, target, person.name);
        var row = cwPersonRowFromHistory(person.name, pm, String(py));
        var prevSales = row ? (parseFloat(row.sales) || 0) : null;
        var prevTarget = row ? (parseFloat(row.target) || 0) : null;
        var prevAch = row && prevTarget > 0 ? (prevSales / prevTarget) * 100 : null;
        var prevComm = row ? calculateCommission(prevSales || 0, prevTarget || 0, person.name) : null;

        rows.push(cwCompareRow('Sales', sales, prevSales,
            formatCurrency(sales), row ? formatCurrency(prevSales) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Target', target, prevTarget,
            formatCurrency(target), row ? formatCurrency(prevTarget) : null, cwFormatMomPct));
        rows.push(cwCompareRow('Achievement', curAch, prevAch,
            target > 0 ? cwFmtPct(curAch, 2) : '\u2014',
            row && prevTarget > 0 ? cwFmtPct(prevAch, 2) : '\u2014',
            cwFormatMomPts, true));
        rows.push(cwCompareRow('Commission', curComm, prevComm,
            formatCurrency(curComm), row ? formatCurrency(prevComm) : null, cwFormatMomPct));

        var curCollAmt = parseFloat(person.collectionAmount) || 0;
        var curCollTgt = parseFloat(person.collectionTarget) || 0;
        var curCallAct = parseFloat(person.callActual) || 0;
        var curCallTgt = parseFloat(person.callTarget) || 0;
        var prevCollAmt = row ? (parseFloat(row.collectionAmount) || 0) : null;
        var prevCollTgt = row ? (parseFloat(row.collectionTarget) || 0) : null;
        var prevCallAct = row ? (parseFloat(row.callActual) || 0) : null;
        var prevCallTgt = row ? (parseFloat(row.callTarget) || 0) : null;

        if (curCollAmt > 0 || curCollTgt > 0 || (prevCollAmt != null && (prevCollAmt > 0 || prevCollTgt > 0))) {
            rows.push({
                label: 'Collection',
                cur: formatCurrency(curCollAmt) + ' / ' + formatCurrency(curCollTgt),
                prev: row ? formatCurrency(prevCollAmt) + ' / ' + formatCurrency(prevCollTgt) : '\u2014',
                mom: row ? cwFormatMomPct(curCollAmt, prevCollAmt) : '\u2014',
                curNum: curCollAmt,
                prevNum: row ? prevCollAmt : null
            });
        }
        if (curCallAct > 0 || curCallTgt > 0 || (prevCallAct != null && (prevCallAct > 0 || prevCallTgt > 0))) {
            rows.push({
                label: 'Active call',
                cur: String(curCallAct) + ' / ' + String(curCallTgt),
                prev: row ? String(prevCallAct) + ' / ' + String(prevCallTgt) : '\u2014',
                mom: row ? cwFormatMomPct(curCallAct, prevCallAct) : '\u2014',
                curNum: curCallAct,
                prevNum: row ? prevCallAct : null
            });
        }
    }

    bodyEl.innerHTML = cwRenderCompareTable(rows, keys.curLabel, keys.prevLabel);
}
function cwBindWhatIf() {
    if (window._cwWhatIfBound) return;
    var r = document.getElementById('cw-whatif-range');
    if (!r) return;
    window._cwWhatIfBound = true;
    r.addEventListener('input', function() {
        if (window._cwWhatIfApply) window._cwWhatIfApply();
    });
    r.addEventListener('change', function() {
        r.dataset.cwTouched = '1';
    });
}
function cwSetHtml(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
}
function cwSetText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text == null ? '' : String(text);
}
function cwFormatTierTableLabel(t, tierIndex) {
    var n = tierIndex + 1;
    var minP = Math.round(Number(t.min) || 0);
    if (Number(t.max) >= 999) {
        return 'Tier ' + n + ' (' + minP + '%+)';
    }
    var maxP = Math.floor(Number(t.max) + 0.001);
    return 'Tier ' + n + ' (' + minP + '% - ' + maxP + '%)';
}
function cwTierTitleFromAch(ach, personName) {
    var rates = cwGetRatesForPerson(personName);
    var row = cwFindSalesTier(ach, rates);
    if (!row || !row.tier) return '\u2014';
    var n = cwTierSortIdx(ach, rates) + 1;
    var pct = (row.tier.rate || 0) * 100;
    return 'Tier ' + n + ' (' + pct.toFixed(2) + '%)';
}
/** Scroll target into view inside Quick Calculate — grid + min-height fixes make `.calc-center` the real scroller; otherwise walk up or use scrollIntoView. */
function cwFindScrollableAncestor(el) {
    var p = el && el.parentElement;
    while (p && p !== document.body && p !== document.documentElement) {
        var st = window.getComputedStyle(p);
        var oy = st.overflowY;
        if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && p.scrollHeight > p.clientHeight + 2) return p;
        p = p.parentElement;
    }
    return null;
}
function cwScrollElIntoQuickCenter(el, pad) {
    if (!el) return;
    pad = pad == null ? 12 : pad;
    var scroller = typeof el.closest === 'function' ? el.closest('.calc-center') : null;
    if (!scroller) scroller = document.querySelector('#view-quick .calc-center');
    function scrollWithin(container) {
        if (!container || container.scrollHeight <= container.clientHeight + 1) return false;
        var delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top - pad;
        if (!isFinite(delta)) return false;
        var next = container.scrollTop + delta;
        var max = Math.max(0, container.scrollHeight - container.clientHeight);
        if (next < 0) next = 0;
        if (next > max) next = max;
        container.scrollTop = next;
        return true;
    }
    if (!scrollWithin(scroller)) {
        var alt = cwFindScrollableAncestor(el);
        if (alt && alt !== scroller) scrollWithin(alt);
        else el.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
    }
}
window.cwScrollToTier = function() {
    cwScrollElIntoQuickCenter(document.getElementById('cw-tier-panel'));
};
window.cwScrollFormula = function() {
    cwScrollElIntoQuickCenter(document.getElementById('cw-panel-formula'));
};

/** Sales roles only: team sales and target for supervisors (saved history + open rows, no double-count). */
function cwSupervisorTeamTotals(bareMonth, year) {
    var teamSales = 0, teamTarget = 0;
    var m = (bareMonth || 'JAN').toUpperCase();
    var y = year || String(new Date().getFullYear());
    var _hist = (window.appState.config.reportHistory || []);
    var _hEntry = findHistEntry(_hist, m, y);
    if (_hEntry && _hEntry.data) {
        _hEntry.data.forEach(function(p) {
            if (getEmployeeType(p.name) !== 'Sales') return;
            teamSales += parseFloat(p.sales) || 0;
            teamTarget += parseFloat(p.target) || 0;
        });
    }
    (window.appState.salespeople || []).forEach(function(p) {
        if (!p.name || getEmployeeType(p.name) !== 'Sales') return;
        var alreadyInHistory = _hEntry && _hEntry.data && _hEntry.data.some(function(hp) {
            return (hp.name || '').toUpperCase() === (p.name || '').toUpperCase();
        });
        if (alreadyInHistory) return;
        teamSales += parseFloat(p.sales) || 0;
        teamTarget += parseFloat(p.target) || 0;
    });
    return { teamSales: teamSales, teamTarget: teamTarget };
}

function updateCalcWorkspace() {
    cwBindWhatIf();
    var root = document.getElementById('calc-workspace');
    if (!root) return;
    if (window.appState.salespeople && window.appState.salespeople[0] && document.getElementById('sales-0') && typeof updateSalespersonData === 'function') {
        updateSalespersonData(0, { skipWorkspace: true });
    }
    var person = window.appState.salespeople[0];
    if (!person || !person.name || !String(person.name).trim()) {
        root.classList.remove('cw-visible');
        root.classList.remove('cw-emp-support');
        root.setAttribute('aria-hidden', 'true');
        return;
    }
    root.classList.add('cw-visible');
    root.setAttribute('aria-hidden', 'false');

    var rng = document.getElementById('cw-whatif-range');
    if (rng && window._cwLastPerson !== (person.name || '')) {
        delete rng.dataset.cwTouched;
        window._cwLastPerson = person.name;
    }

    var empType = getEmployeeType(person.name);
    if (empType === 'Support Staff') root.classList.add('cw-emp-support');
    else root.classList.remove('cw-emp-support');

    var selMonth = ((document.getElementById('report-month') || {}).value || 'JAN').toUpperCase();
    var selYear = parseInt((document.getElementById('report-year') || {}).value, 10) || new Date().getFullYear();
    var teamSup = empType === 'Supervisor' ? cwSupervisorTeamTotals(selMonth, String(selYear)) : null;

    var cwLblAch = document.getElementById('cw-kpi-lbl-ach');
    var cwLblSales = document.getElementById('cw-kpi-lbl-sales');
    var cwLblRate = document.getElementById('cw-kpi-lbl-rate');
    var cwLblProj = document.getElementById('cw-kpi-lbl-proj');
    var cwHdInputs = document.getElementById('cw-panel-hd-inputs');
    var cwHdCalc = document.getElementById('cw-panel-hd-calc-title');
    if (empType === 'Support Staff') {
        if (cwLblAch) cwLblAch.textContent = 'Target achievement';
        if (cwLblSales) cwLblSales.textContent = 'Monthly block';
        if (cwLblRate) cwLblRate.textContent = 'Block incentive';
        if (cwLblProj) cwLblProj.textContent = 'Salary';
        if (cwHdInputs) cwHdInputs.textContent = 'Block display input';
        if (cwHdCalc) cwHdCalc.textContent = 'Total calculation';
        cwSetText('cw-kpi-proj-sub', 'Monthly gross');
    } else {
        if (cwLblAch) cwLblAch.textContent = empType === 'Supervisor' ? 'Team sales' : 'Target achievement';
        if (cwLblSales) cwLblSales.textContent = 'Monthly sales';
        if (cwLblRate) cwLblRate.textContent = 'Commission rate';
        if (cwLblProj) cwLblProj.textContent = 'Salary';
        if (cwHdInputs) cwHdInputs.textContent = 'Sales & target input';
        if (cwHdCalc) cwHdCalc.textContent = 'Commission calculation (live)';
        cwSetText('cw-kpi-proj-sub', 'Monthly gross');
    }

    var sales = parseFloat(person.sales) || 0;
    var target = parseFloat(person.target) || 0;
    /** Supervisor: team achievement from Sales-role totals (history + workspace). */
    var ach;
    if (empType === 'Supervisor') {
        ach = teamSup.teamTarget > 0 ? (teamSup.teamSales / teamSup.teamTarget) * 100 : 0;
    } else {
        ach = target > 0 ? (sales / target) * 100 : (typeof person.achievement === 'number' ? person.achievement : 0);
    }

    var rStyle = getRoleBadgeStyle(empType);
    var avEl = document.getElementById('cw-mock-av');
    if (avEl) {
        avEl.textContent = (person.name || '?').charAt(0);
        avEl.style.background = rStyle.bg;
        avEl.style.color = rStyle.c;
    }
    cwSetText('cw-mock-name', person.name || '\u2014');
    var roleEl = document.getElementById('cw-mock-role');
    if (roleEl) {
        roleEl.textContent = empType;
        roleEl.style.background = rStyle.bg;
        roleEl.style.color = rStyle.c;
    }
    var comp = getEmployeeCompany(person.name);
    cwSetText('cw-meta-dept', comp ? comp.toUpperCase() : (empType === 'Sales' ? 'SALES' : empType.toUpperCase()));

    var months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var mi = months.indexOf(selMonth);
    var pm = mi <= 0 ? months[11] : months[mi - 1];
    var py = mi <= 0 ? selYear - 1 : selYear;
    var prevSales = cwSalesFromHistory(person.name, pm, String(py));
    var momPct = null;
    if (prevSales != null && prevSales > 0) momPct = ((sales - prevSales) / prevSales) * 100;

    var rates = cwGetRatesForPerson(person.name);
    var tierRow = empType === 'Sales' ? cwFindSalesTier(ach, rates) : null;
    var tierIdx1 = empType === 'Sales' ? (cwTierSortIdx(ach, rates) + 1) : 0;
    var ratePct = 0;
    if (empType === 'Sales' && tierRow && tierRow.tier.rate != null) ratePct = tierRow.tier.rate * 100;
    else if (empType === 'Sales' && sales > 0 && (person.commission || 0) > 0) ratePct = (person.commission / sales) * 100;

    var achBar = document.getElementById('cw-kpi-ach-bar');
    if (empType === 'Supervisor') {
        cwSetText('cw-kpi-ach', formatCurrency(teamSup.teamSales));
        cwSetText('cw-kpi-ach-sub', '');
        if (achBar) achBar.style.width = '0%';
    } else {
        cwSetText('cw-kpi-ach', (target > 0 || sales > 0) ? ach.toFixed(2) + '%' : '\u2014');
        cwSetText('cw-kpi-ach-sub', target > 0 ? formatCurrency(sales) + ' / ' + formatCurrency(target) : 'Enter sales & target');
        if (achBar) achBar.style.width = (target > 0 || sales > 0) ? Math.min(Math.max(ach, 0), 100) + '%' : '0%';
    }

    var tnum = document.getElementById('cw-kpi-tier-num');
    if (tnum) tnum.textContent = (empType === 'Sales' && tierIdx1 > 0) ? String(tierIdx1) : '\u2014';

    if (empType === 'Sales') {
        cwSetText('cw-kpi-tier', tierRow && tierRow.tier ? cwFormatTierTableLabel(tierRow.tier, tierRow.idx) : '\u2014');
        var tierSubTxt = '';
        if (tierRow && tierRow.tier) {
            tierSubTxt = ratePct.toFixed(2) + '% commission rate';
        } else tierSubTxt = 'No matching band';
        cwSetText('cw-kpi-tier-sub', tierSubTxt);
    } else if (empType === 'Supervisor') {
        cwSetText('cw-kpi-tier', 'Team tiers');
        cwSetText('cw-kpi-tier-sub', 'Based on team achievement');
    } else {
        cwSetText('cw-kpi-tier', 'Block pay');
        cwSetText('cw-kpi-tier-sub', 'Merchandiser / support');
    }

    var salesSubEl = document.getElementById('cw-kpi-sales-sub');
    if (empType === 'Support Staff') {
        cwSetText('cw-kpi-sales', String(person.collectionAmount || 0));
        if (salesSubEl) salesSubEl.textContent = 'Blocks';
    } else {
        cwSetText('cw-kpi-sales', formatCurrency(sales));
        if (salesSubEl) {
            if (momPct != null) {
                var cl = momPct >= 0 ? 'cw-trend-pos' : 'cw-trend-neg';
                var arr = momPct >= 0 ? '\u25b4' : '\u25bc';
                salesSubEl.innerHTML = '<span class="cw-kpi-trend-lbl">vs last month</span><span class="' + cl + '">' + arr + '\u00a0' + Math.abs(momPct).toFixed(2) + '%</span>';
            } else if (prevSales !== null && prevSales === 0 && sales > 0) salesSubEl.textContent = 'Up from RM 0 last month';
            else salesSubEl.textContent = '';
        }
    }

    if (empType === 'Sales') {
        cwSetText('cw-kpi-rate', (sales > 0 && ratePct > 0) ? ratePct.toFixed(2) + '%' : (sales <= 0 ? '\u2014' : '0.00%'));
        cwSetText('cw-kpi-rate-sub', 'Current tier rate');
    } else if (empType === 'Supervisor') {
        cwSetText('cw-kpi-rate', '\u2014');
        cwSetText('cw-kpi-rate-sub', 'Fixed tier amounts');
    } else {
        var _mr = (window.appState.config.person_merchandiser_rates || {})[person.name];
        if (_mr == null) _mr = parseFloat(window.appState.config.merchandiser_block_rate) || 10;
        cwSetText('cw-kpi-rate', 'RM ' + parseFloat(_mr).toFixed(2));
        cwSetText('cw-kpi-rate-sub', 'Per block');
    }

    var comm = parseFloat(person.commission) || 0;
    var collBon = parseFloat(person.collectionIncentive) || 0;
    var callBon = parseFloat(person.activeCallIncentive) || 0;
    var qtrBon = parseFloat(person.quarterlyBonus) || 0;

    var salaryRec = getSalaryForMonth(person.name, selMonth);
    var salary = salaryRec.salary;
    var allow = salaryRec.allowances;
    var epfRate = salaryRec.epfRate;
    var hp = allow.HP || 0, car = allow.CAR || 0, lf = allow['LOCAL FUEL'] || 0;
    var of2 = allow['OUTSTATION FUEL'] || 0, hs = allow.HOUSING || 0, food = allow.FOOD || 0, oth = allow.OTHERS || 0;
    var totalAllow = hp + car + lf + of2 + hs + food + oth;
    var totalFixed = salary + totalAllow;
    var totalFlexible = comm + collBon + callBon + qtrBon;
    var totalInc = totalFixed + totalFlexible;
    var _cwYearE = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var _cwEpf = (typeof computeEpf === 'function') ? computeEpf(person.name, totalInc, selMonth, _cwYearE) : { employee: totalInc*(epfRate/100), empPct: epfRate };
    var epfAmt = _cwEpf.employee;
    var epfPctLabel = (_cwEpf.empPct != null) ? _cwEpf.empPct.toFixed(1) : epfRate;
    var _cwSocso = (typeof computeSocso === 'function') ? computeSocso(person.name, totalInc, selMonth, _cwYearE) : { employee: 0 };
    var socsoAmt = _cwSocso.employee;
    var _cwEis = (typeof computeEis === 'function') ? computeEis(person.name, totalInc, selMonth, _cwYearE) : { employee: 0 };
    var eisAmt = _cwEis.employee;
    var grand = totalInc - epfAmt - socsoAmt - eisAmt;

    cwSetText('cw-kpi-proj', formatCurrency(totalInc));
    cwSetText('cw-net-val', formatCurrency(grand));

    cwUpdatePrevMonthPanel(person, empType, selMonth, selYear);

    var upEl = document.getElementById('cw-mock-updated');
    if (upEl) {
        upEl.textContent = 'Last updated: ' + new Date().toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    }

    var steps = '';
    if (empType === 'Sales') {
        if (sales > 0 && target > 0 && ratePct > 0) {
            steps += '<li><span class="cw-step-lbl">Base commission (Sales \u00d7 rate)</span> \u2014 ' + formatCurrency(sales) + ' \u00d7 ' + ratePct.toFixed(2) + '% = <strong>' + formatCurrency(comm) + '</strong></li>';
        } else {
            steps += '<li><span class="cw-step-lbl">Base commission</span> \u2014 ' + formatCurrency(comm) + '</li>';
        }
    } else if (empType === 'Supervisor') {
        steps += '<li><span class="cw-step-lbl">Team sales tier payout</span> \u2014 ' + formatCurrency(comm) + '</li>';
    } else {
        steps += '<li><span class="cw-step-lbl">Outlet / block earnings</span> \u2014 ' + formatCurrency(collBon) + '</li>';
    }
    if (empType !== 'Support Staff' && collBon > 0) steps += '<li><span class="cw-step-lbl">Incentive (collection)</span> \u2014 +' + formatCurrency(collBon) + '</li>';
    if (callBon > 0) steps += '<li><span class="cw-step-lbl">Incentive (active call)</span> \u2014 +' + formatCurrency(callBon) + '</li>';
    if (qtrBon > 0) steps += '<li><span class="cw-step-lbl">Other bonus (quarterly)</span> \u2014 +' + formatCurrency(qtrBon) + '</li>';
    steps += '<li><span class="cw-step-lbl">EPF (' + epfPctLabel + '% of gross)</span> \u2014 \u2212' + formatCurrency(epfAmt) + '</li>';
    if (socsoAmt > 0) steps += '<li><span class="cw-step-lbl">SOCSO (0.5% of gross)</span> \u2014 \u2212' + formatCurrency(socsoAmt) + '</li>';
    if (eisAmt > 0) steps += '<li><span class="cw-step-lbl">EIS (0.2% of gross)</span> \u2014 \u2212' + formatCurrency(eisAmt) + '</li>';
    var st = document.getElementById('cw-steps');
    if (st) st.innerHTML = steps;

    var fl = document.getElementById('cw-formula-list');
    if (fl) {
        if (empType === 'Sales') {
            fl.innerHTML = '<li>Gross = fixed pay + base commission + incentives</li><li>Net payable = gross \u2212 employee EPF (' + epfPctLabel + '%)</li>';
        } else if (empType === 'Supervisor') {
            fl.innerHTML = '<li>Team tiers set payout amounts from achievement</li><li>Net = gross \u2212 employee EPF (' + epfPctLabel + '%)</li>';
        } else {
            fl.innerHTML = '<li>Variable = blocks \u00d7 rate</li><li>Net = gross \u2212 employee EPF (' + epfPctLabel + '%)</li>';
        }
    }
    var il = document.getElementById('cw-incentive-list');
    if (il) {
        var items = [];
        if (empType !== 'Support Staff' && collBon > 0) items.push('Collection incentive \u2014 ' + formatCurrency(collBon));
        if (callBon > 0) items.push('Active call incentive \u2014 ' + formatCurrency(callBon));
        if (qtrBon > 0) items.push('Quarterly bonus \u2014 ' + formatCurrency(qtrBon));
        if (items.length === 0 && empType === 'Support Staff' && collBon > 0) items.push('Block earnings \u2014 ' + formatCurrency(collBon));
        if (items.length === 0) il.innerHTML = '<li class="cw-inc-muted">No variable incentives this month</li>';
        else il.innerHTML = items.map(function(s) { return '<li>' + s + '</li>'; }).join('');
    }

    var insightEl = document.getElementById('cw-insight');
    if (insightEl) {
        var insight = '\u2014';
        if (empType === 'Sales' && target > 0) {
            var next = cwNextSalesTierMin(ach, rates);
            if (next) {
                var need = (next.min / 100) * target - sales;
                if (need > 0) insight = 'You need about ' + formatCurrency(need) + ' more in sales to reach the next tier (' + ((next.rate || 0) * 100).toFixed(2) + '% rate).';
                else insight = 'You are in the highest tier for configured bands.';
            } else insight = 'You already meet or exceed the top achievement band.';
        } else if (empType === 'Supervisor') {
            insight = 'Supervisor pay uses team totals from Records and any unsaved rows in this workspace.';
        } else insight = 'Edit collected outlets in Sales & target input to update block pay.';
        insightEl.textContent = insight;
    }

    var tbl = document.getElementById('cw-tier-table');
    var tierTableHead = '<caption class="cw-tier-caption">Commission tier table</caption>'
        + '<colgroup><col class="cw-tier-col-name"><col class="cw-tier-col-val"></colgroup>';
    if (tbl) {
        if (empType === 'Sales' && rates.length) {
            var sortedR = rates.slice().sort(function(a, b) { return a.min - b.min; });
            var body = sortedR.map(function(t, idx) {
                var active = ach >= t.min && ach <= t.max;
                var lab = cwFormatTierTableLabel(t, idx);
                return '<tr class="' + (active ? 'cw-tier-active' : '') + '"><td>' + lab + '</td><td>' + ((t.rate || 0) * 100).toFixed(2) + '%</td></tr>';
            }).join('');
            tbl.innerHTML = tierTableHead + '<thead><tr><th>Tier band</th><th>Rate</th></tr></thead><tbody>' + body + '</tbody>';
        } else if (empType === 'Supervisor') {
            var _supCfg = window.appState.config;
            var _saleT = (_supCfg.person_supervisor_sale_tiers && _supCfg.person_supervisor_sale_tiers[person.name]) || _supCfg.supervisor_sale_tiers || [];
            var sortedS = _saleT.slice().sort(function(a, b) { return a.min - b.min; });
            var body2 = sortedS.map(function(t, idx) {
                var active = ach >= t.min && ach <= t.max;
                var lab = cwFormatTierTableLabel(t, idx);
                return '<tr class="' + (active ? 'cw-tier-active' : '') + '"><td>' + lab + '</td><td>' + formatCurrency(t.amt || 0) + '</td></tr>';
            }).join('');
            tbl.innerHTML = tierTableHead + '<thead><tr><th>Tier band</th><th>Payout (RM)</th></tr></thead><tbody>' + body2 + '</tbody>';
        } else {
            tbl.innerHTML = tierTableHead + '<tbody><tr><td colspan="2" style="text-align:center;color:#64748b;padding:12px;">No percentage tiers \u2014 per-block rate in KPI</td></tr></tbody>';
        }
    }

    var bar = document.getElementById('cw-tier-bar-fill');
    var barLbl = document.getElementById('cw-tier-bar-lbl');
    if (bar) bar.style.width = Math.min(Math.max(ach, 0), 100) + '%';
    if (barLbl) barLbl.textContent = 'Your position: ' + ach.toFixed(2) + '% achievement';

    var wrap = document.getElementById('cw-whatif-wrap');
    if (wrap && rng) {
        var readEl = document.getElementById('cw-whatif-readout');
        if (empType !== 'Sales') {
            wrap.classList.add('cw-whatif-disabled');
            if (readEl) readEl.textContent = empType === 'Supervisor' ? 'What-if applies to sales commission roles.' : 'Edit blocks in Sales & target input.';
        } else {
            wrap.classList.remove('cw-whatif-disabled');
            var wmax = Math.max(100000, Math.ceil(Math.max(sales, target, 1) * 1.35 / 10000) * 10000);
            rng.max = String(wmax);
            if (!rng.dataset.cwTouched) rng.value = String(Math.min(Math.max(0, sales), wmax));
            window._cwWhatIfApply = function() {
                var hSales = parseFloat(rng.value) || 0;
                var hAch = target > 0 ? (hSales / target) * 100 : 0;
                var hComm = calculateCommission(hSales, target, person.name);
                var hFlex = hComm + collBon + callBon + qtrBon;
                var hTotalInc = totalFixed + hFlex;
                var hEpf = (typeof computeEpf === 'function') ? computeEpf(person.name, hTotalInc, selMonth, _cwYearE).employee : hTotalInc * (epfRate / 100);
                var hEis = (typeof computeEis === 'function') ? computeEis(person.name, hTotalInc, selMonth, _cwYearE).employee : 0;
                var hSocso = (typeof computeSocso === 'function') ? computeSocso(person.name, hTotalInc, selMonth, _cwYearE).employee : 0;
                var hGrand = hTotalInc - hEpf - hSocso - hEis;
                var tierTit = cwTierTitleFromAch(hAch, person.name);
                if (readEl) {
                    readEl.innerHTML = ''
                        + '<div class="cw-wif-line">If sales = <strong>' + formatCurrency(hSales) + '</strong></div>'
                        + '<div class="cw-wif-line">Achievement: <strong>' + hAch.toFixed(2) + '%</strong> (' + tierTit + ')</div>'
                        + '<div class="cw-wif-line cw-wif-net">Net payable: ' + formatCurrency(hGrand) + '</div>';
                }
            };
            window._cwWhatIfApply();
        }
    }
}
window.updateCalcWorkspace = updateCalcWorkspace;

function promptAddPerson() {
    var existing = document.getElementById('add-person-modal');
    if (existing) existing.remove();

    // Build overlay - clicking overlay closes modal
    var overlay = document.createElement('div');
    overlay.id = 'add-person-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;';

    // Build card - stops propagation so clicks inside don't close modal
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;width:420px;box-shadow:0 25px 60px rgba(0,0,0,.3);overflow:hidden;font-family:Sora,sans-serif;';

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#1e3a8a;padding:20px 24px;color:#fff;';
    hdr.innerHTML = '<div style="font-size:16px;font-weight:700;">Add New Person</div><div style="font-size:12px;opacity:.7;margin-top:2px;">Enter employee details to get started</div>';
    card.appendChild(hdr);

    // Body
    var body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;';
    var lbl = document.createElement('label');
    lbl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;';
    lbl.textContent = 'Full Name';
    body.appendChild(lbl);

    // Input - created directly, no innerHTML
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.placeholder = 'e.g. JOHN TAN';
    inp.style.cssText = 'display:block;width:100%;padding:10px 14px;border:2px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;box-sizing:border-box;color:#111;background:#fff;';
    inp.addEventListener('focus', function() { this.style.borderColor = '#3b82f6'; });
    inp.addEventListener('blur',  function() { this.style.borderColor = '#d1d5db'; });
    inp.addEventListener('input', function() { 
        this.value = this.value.toUpperCase();
        errEl.style.display = 'none';
    });
    body.appendChild(inp);

    // Employee Type selector
    var typeLbl = document.createElement('label');
    typeLbl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;margin-top:14px;';
    typeLbl.textContent = 'Employee Type';
    body.appendChild(typeLbl);
    var typeSel = document.createElement('select');
    typeSel.id = 'add-person-type';
    typeSel.style.cssText = 'display:block;width:100%;padding:10px 14px;border:2px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;box-sizing:border-box;color:#111;background:#fff;cursor:pointer;';
    typeSel.innerHTML = '<option value="Sales">💼 Sales</option><option value="Supervisor">👔 Supervisor</option><option value="Support Staff">🛠️ Support Staff</option>';
    body.appendChild(typeSel);

    function mkProfileField(id, labelText, placeholder) {
        var pl = document.createElement('label');
        pl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;margin-top:14px;';
        pl.textContent = labelText;
        body.appendChild(pl);
        var field = document.createElement('input');
        field.id = id;
        field.type = 'text';
        field.placeholder = placeholder;
        field.style.cssText = 'display:block;width:100%;padding:10px 14px;border:2px solid #d1d5db;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;color:#111;background:#fff;';
        field.addEventListener('focus', function() { this.style.borderColor = '#3b82f6'; });
        field.addEventListener('blur', function() { this.style.borderColor = '#d1d5db'; });
        body.appendChild(field);
        return field;
    }

    mkProfileField('add-person-mykad', 'MyKad No / Passport No', 'e.g. 900101-01-1234');
    mkProfileField('add-person-epf', 'EPF Number', 'e.g. 12345678');
    mkProfileField('add-person-bank', 'Bank Account Number', 'e.g. 1234567890');

    // Company selector (only if companies exist)
    var companies = (window.appState.config.companies || []);
    var compSel = null;
    if (companies.length > 0) {
        var compLbl = document.createElement('label');
        compLbl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;margin-top:14px;';
        compLbl.textContent = 'Branch / Team';
        body.appendChild(compLbl);
        compSel = document.createElement('select');
        compSel.style.cssText = 'display:block;width:100%;padding:10px 14px;border:2px solid #d1d5db;border-radius:8px;font-size:15px;outline:none;box-sizing:border-box;color:#111;background:#fff;cursor:pointer;';
        compSel.innerHTML = '<option value="">— No Branch —</option>' + companies.map(function(c){return '<option value="'+c+'">🏢 '+c+'</option>';}).join('');
        body.appendChild(compSel);
    }

    var errEl = document.createElement('div');
    errEl.style.cssText = 'color:#dc2626;font-size:12px;margin-top:6px;display:none;';
    errEl.textContent = 'Name already exists';
    body.appendChild(errEl);
    card.appendChild(body);

    // Footer
    var foot = document.createElement('div');
    foot.style.cssText = 'padding:12px 24px 20px;display:flex;gap:10px;justify-content:flex-end;';
    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'padding:9px 20px;border:1.5px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;';
    var btnOk = document.createElement('button');
    btnOk.textContent = 'Next →';
    btnOk.style.cssText = 'padding:9px 24px;border:none;border-radius:8px;background:#1e3a8a;color:#fff;cursor:pointer;font-size:13px;font-weight:700;';
    foot.appendChild(btnCancel);
    foot.appendChild(btnOk);
    card.appendChild(foot);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Focus input
    setTimeout(function(){ inp.focus(); }, 50);

    function doAdd() {
        var name = inp.value.trim().toUpperCase();
        if (!name) { inp.focus(); return; }
        if (window.appState.config.base_salaries && window.appState.config.base_salaries[name]) {
            errEl.style.display = 'block';
            inp.focus();
            return;
        }
        var selectedType = typeSel.value || 'Sales';
        var selectedCompany = compSel ? compSel.value : '';
        var profile = {
            mykad: ((document.getElementById('add-person-mykad') || {}).value || '').trim(),
            epfNo: ((document.getElementById('add-person-epf') || {}).value || '').trim(),
            bankAccount: ((document.getElementById('add-person-bank') || {}).value || '').trim()
        };
        overlay.remove();
        addNewPerson(name, selectedType, profile);
        if (selectedCompany) {
            setEmployeeCompany(name, selectedCompany);
            saveConfig();
        }
    }

    function close() { overlay.remove(); }

    // Only close when clicking the overlay background (not the card)
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) close();
    });

    inp.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') doAdd();
        if (e.key === 'Escape') close();
    });
    btnOk.addEventListener('click', doAdd);
    btnCancel.addEventListener('click', close);
}

function filterPeopleList(query) {
    var items = document.querySelectorAll('#people-list-container > div');
    var q = (query||'').toUpperCase().trim();
    var groupSel = document.getElementById('people-group-select');
    var selectedGroup = groupSel ? groupSel.value : 'ALL';
    items.forEach(function(item) {
        var text = item.textContent.toUpperCase();
        var nameMatch = !q || text.includes(q);
        var groupMatch = selectedGroup === 'ALL';
        if (!groupMatch) {
            var nameEl = item.querySelector('div[style*="font-weight:700"]');
            if (nameEl) {
                var pName = nameEl.textContent.trim().toUpperCase();
                var pType = getEmployeeType(pName);
                groupMatch = pType === selectedGroup;
            }
        }
        // Must restore `flex` — clearing display with '' removes inline flex from cssText and falls back to block, stacking the row vertically.
        item.style.display = (nameMatch && groupMatch) ? 'flex' : 'none';
    });
}

// (Team selectors are now hardcoded group dropdowns in HTML)

// Filter Calculation person list by employee group (Sales / Supervisor / Support Staff)
function filterByGroup() {
    onCalcGroupChange();
}

function buildHistoryExportPeople(report) {
    var cfg = window.appState.config;
    var defRates = [{min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},{min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.01}];
    var rates = (cfg.monthly_commission_rates && cfg.monthly_commission_rates.length > 0) ? cfg.monthly_commission_rates : defRates;
    var monthUpper = bareMonth(report.month || '').toUpperCase();
    var isQtr = ['MAR','JUN','SEP','DEC'].indexOf(monthUpper) !== -1;
    function calcInc(pct, tiers) {
        if (!tiers || !tiers.length) return 0;
        var s = tiers.slice().sort(function(a,b){ return b.min - a.min; });
        for (var i = 0; i < s.length; i++) if (pct >= s[i].min) return s[i].incentive || 0;
        return 0;
    }

    var teamSales = 0, teamTarget = 0, teamColl = 0, teamCollTgt = 0, teamCall = 0, teamCallTgt = 0;
    (report.data || []).forEach(function(p) {
        if (getEmployeeType(p.name) !== 'Sales') return;
        teamSales += parseFloat(p.sales) || 0;
        teamTarget += parseFloat(p.target) || 0;
        teamColl += parseFloat(p.collectionAmount) || 0;
        teamCollTgt += parseFloat(p.collectionTarget) || 0;
        teamCall += parseFloat(p.callActual) || 0;
        teamCallTgt += parseFloat(p.callTarget) || 0;
    });
    var teamAch = teamTarget > 0 ? (teamSales / teamTarget * 100) : 0;
    var teamCollAch = teamCollTgt > 0 ? (teamColl / teamCollTgt * 100) : 0;
    var teamCallAch = teamCallTgt > 0 ? (teamCall / teamCallTgt * 100) : 0;

    var activePeople = Object.keys(cfg.base_salaries || {}).map(function(n){ return n.toUpperCase(); });
    var reportData = (report.data || []).filter(function(p) {
        return activePeople.indexOf((p.name || '').toUpperCase()) !== -1;
    });

    var salesData = [], supervisorData = [], merchandiserData = [];
    reportData.forEach(function(p) {
        var nu = (p.name || '').toUpperCase();
        var empType = getEmployeeType(p.name);
        var salRec = getSalaryForMonth(p.name, report.month);
        var salary = salRec.salary;
        var allowances = salRec.allowances;
        var epfRate = salRec.epfRate;

        if (empType === 'Sales') {
            var target = parseFloat(p.target) || 0, sales = parseFloat(p.sales) || 0;
            var collTgt = parseFloat(p.collectionTarget) || 0, collAmt = parseFloat(p.collectionAmount) || 0;
            var callTgt = parseFloat(p.callTarget) || 0, callAct = parseFloat(p.callActual) || 0;
            var ach = target > 0 ? (sales / target * 100) : 0;
            var pRates = (cfg.person_commission_rates && cfg.person_commission_rates[nu]) || rates;
            var commission = 0, commissionRate = 0;
            if (target > 0 && sales > 0) {
                for (var i = 0; i < pRates.length; i++) {
                    if (ach >= pRates[i].min && ach <= pRates[i].max) {
                        commission = sales * (pRates[i].rate || 0);
                        commissionRate = pRates[i].rate || 0;
                        break;
                    }
                }
            }
            var collI = calcInc(collTgt > 0 ? collAmt / collTgt * 100 : 0, (cfg.person_collection_incentive && cfg.person_collection_incentive[nu]) || cfg.collection_incentive || []);
            var callI = calcInc(callTgt > 0 ? callAct / callTgt * 100 : 0, (cfg.person_call_incentive && cfg.person_call_incentive[nu]) || cfg.active_call_incentive || []);
            var qtrI = isQtr ? calcInc(ach, (cfg.person_quarterly_incentive && cfg.person_quarterly_incentive[nu]) || cfg.quarterly_incentive || []) : 0;
            salesData.push({ name: p.name, type: 'Sales', salary: salary, allowances: allowances, epfRate: epfRate, sales: sales, target: target, achievement: ach,
                commission: commission, commissionRate: commissionRate, collectionIncentive: collI, activeCallIncentive: callI, quarterlyBonus: qtrI,
                totalCommission: commission + collI + callI + qtrI, collectionTarget: collTgt, collectionAmount: collAmt,
                callTarget: callTgt, callActual: callAct, quarterlySales: 0, quarterlyTarget: 0 });
        } else if (empType === 'Supervisor') {
            var saleT = (cfg.person_supervisor_sale_tiers && cfg.person_supervisor_sale_tiers[p.name]) || cfg.supervisor_sale_tiers || [];
            var collT = (cfg.person_supervisor_coll_tiers && cfg.person_supervisor_coll_tiers[p.name]) || cfg.supervisor_coll_tiers || [];
            var callT = (cfg.person_supervisor_call_tiers && cfg.person_supervisor_call_tiers[p.name]) || cfg.supervisor_call_tiers || [];
            var qtrT  = (cfg.person_supervisor_qtr_tiers && cfg.person_supervisor_qtr_tiers[p.name]) || cfg.supervisor_qtr_tiers || [];
            var saleInc = getTierAmt(saleT, teamAch);
            var collInc = getTierAmt(collT, teamCollAch);
            var callInc = getTierAmt(callT, teamCallAch);
            var qtrInc  = isQtr ? getTierAmt(qtrT, teamAch) : 0;
            supervisorData.push({ name: p.name, type: 'Supervisor', salary: salary, allowances: allowances, epfRate: epfRate,
                sales: teamSales, target: teamTarget, achievement: teamAch, commission: saleInc, commissionRate: 0,
                collectionIncentive: collInc, activeCallIncentive: callInc, quarterlyBonus: qtrInc,
                totalCommission: saleInc + collInc + callInc + qtrInc,
                collectionTarget: teamCollTgt, collectionAmount: teamColl, callTarget: teamCallTgt, callActual: teamCall,
                quarterlySales: 0, quarterlyTarget: 0 });
        } else if (empType === 'Support Staff') {
            var blocks = parseFloat(p.collectionAmount) || 0;
            var rate = (cfg.person_merchandiser_rates && cfg.person_merchandiser_rates[p.name] != null)
                ? parseFloat(cfg.person_merchandiser_rates[p.name])
                : (parseFloat(cfg.merchandiser_block_rate) || 10);
            var blockIncentive = blocks * rate;
            merchandiserData.push({ name: p.name, type: 'Support Staff', salary: salary, allowances: allowances, epfRate: epfRate,
                blocks: blocks, blockRate: rate, blockIncentive: blockIncentive, totalCommission: blockIncentive,
                commission: 0, commissionRate: 0, collectionIncentive: 0, activeCallIncentive: 0, quarterlyBonus: 0,
                sales: 0, target: 0, achievement: 0 });
        }
    });

    return salesData.concat(supervisorData).concat(merchandiserData);
}
window.buildHistoryExportPeople = buildHistoryExportPeople;

function enrichPersonForPayslip(person, report) {
    var cfg = window.appState.config;
    var nu = (person.name || '').toUpperCase();
    var bareM = bareMonth(report.month || '');
    var year = keyYear(report.month) || String(new Date().getFullYear());
    var allowances = person.allowances || {};
    var allowSum = Object.keys(allowances).reduce(function(s, k) { return s + (parseFloat(allowances[k]) || 0); }, 0);
    var salary = parseFloat(person.salary) || 0;
    var totalFixed = salary + allowSum;
    var empType = person.type || getEmployeeType(person.name);
    var commission = parseFloat(person.commission) || 0;
    var collI = parseFloat(person.collectionIncentive) || 0;
    var callI = parseFloat(person.activeCallIncentive) || 0;
    var qtrI = parseFloat(person.quarterlyBonus) || 0;
    var blockI = parseFloat(person.blockIncentive) || 0;
    var bonus = collI + callI + qtrI;
    var flexIncome = empType === 'Support Staff' ? blockI : commission + bonus;
    var totalGross = totalFixed + flexIncome;
    var epf = (typeof computeEpf === 'function') ? computeEpf(person.name, totalGross, bareM, year) : { employee: 0, employer: 0 };
    var socso = (typeof computeSocso === 'function') ? computeSocso(person.name, totalGross, bareM, year) : { employee: 0, employer: 0 };
    var eis = (typeof computeEis === 'function') ? computeEis(person.name, totalGross, bareM, year) : { employee: 0, employer: 0 };
    var profile = (cfg.employee_profiles && cfg.employee_profiles[nu]) || {};
    var joinRaw = getEmployeeStartYM(person.name) || '';
    var joinDate = joinRaw;
    if (/^\d{4}-\d{2}-\d{2}$/.test(joinRaw)) {
        var jp = joinRaw.split('-');
        joinDate = jp[2] + '/' + jp[1] + '/' + jp[0];
    }
    return Object.assign({}, person, {
        type: empType,
        bonus: bonus,
        totalGross: totalGross,
        epfEmployee: Math.round((epf.employee || 0) * 100) / 100,
        epfEmployer: Math.round((epf.employer || 0) * 100) / 100,
        socsoEmployee: Math.round((socso.employee || 0) * 100) / 100,
        socsoEmployer: Math.round((socso.employer || 0) * 100) / 100,
        eisEmployee: Math.round((eis.employee || 0) * 100) / 100,
        eisEmployer: Math.round((eis.employer || 0) * 100) / 100,
        netSalary: Math.round((totalGross - (epf.employee || 0) - (socso.employee || 0) - (eis.employee || 0)) * 100) / 100,
        joinDate: joinDate,
        position: profile.position || empType,
        mykad: profile.mykad || '',
        epfNo: profile.epfNo || '',
        bankAccount: profile.bankAccount || ''
    });
}

function printPayslipsFromHistory(index) {
    var report = (window.appState.config.reportHistory || [])[index];
    if (!report) return;
    var people = buildHistoryExportPeople(report);
    if (!people.length) { showToast('⚠️', 'No employees found for this month'); return; }

    var existing = document.getElementById('payslip-print-modal');
    if (existing) existing.remove();

    var monthLabel = (bareMonth(report.month || '') + ' ' + (keyYear(report.month) || '')).trim();
    var overlay = document.createElement('div');
    overlay.id = 'payslip-print-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:16px;max-width:420px;width:100%;padding:24px;box-shadow:0 25px 60px rgba(0,0,0,.25);';
    box.innerHTML = '<div style="font-size:18px;font-weight:700;margin-bottom:4px;">📄 Print Payslip</div>'
        + '<div style="font-size:13px;color:#64748b;margin-bottom:16px;">' + monthLabel + ' — select employees</div>'
        + '<div id="payslip-person-list" style="max-height:280px;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;padding:8px 12px;margin-bottom:16px;"></div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;">'
        + '<button id="payslip-cancel-btn" style="padding:8px 16px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;">Cancel</button>'
        + '<button id="payslip-all-btn" style="padding:8px 16px;border:none;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-weight:600;">Print All</button>'
        + '<button id="payslip-go-btn" style="padding:8px 16px;border:none;border-radius:8px;background:#059669;color:#fff;cursor:pointer;font-weight:600;">Print Selected</button>'
        + '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var listEl = box.querySelector('#payslip-person-list');
    listEl.innerHTML = people.map(function(p, i) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid #f1f5f9;cursor:pointer;">'
            + '<input type="checkbox" class="payslip-chk" data-idx="' + i + '" checked>'
            + '<span style="font-size:14px;font-weight:500;">' + (p.name || '—') + '</span>'
            + '<span style="font-size:11px;color:#94a3b8;margin-left:auto;">' + (p.type || '') + '</span>'
            + '</label>';
    }).join('');

    function runPrint(selected) {
        if (!selected.length) { showToast('⚠️', 'Please select at least one employee'); return; }
        overlay.remove();
        showToast('⏳', 'Generating payslips...');
        var payload = selected.map(function(p) { return enrichPersonForPayslip(p, report); });
        window.electronAPI.generatePayslips({
            salespeople: payload,
            config: window.appState.config,
            month: report.month
        }).then(function(result) {
            if (result.success) showToast('✅', 'Payslip Excel opened — ready to print');
            else showToast('❌', result.error || 'Failed to generate payslip');
        }).catch(function(e) { showToast('❌', e.message); });
    }

    box.querySelector('#payslip-cancel-btn').onclick = function() { overlay.remove(); };
    box.querySelector('#payslip-all-btn').onclick = function() { runPrint(people.slice()); };
    box.querySelector('#payslip-go-btn').onclick = function() {
        var idxs = Array.prototype.slice.call(box.querySelectorAll('.payslip-chk'))
            .filter(function(c){ return c.checked; })
            .map(function(c){ return parseInt(c.getAttribute('data-idx'), 10); });
        runPrint(idxs.map(function(i){ return people[i]; }).filter(Boolean));
    };
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
}
window.printPayslipsFromHistory = printPayslipsFromHistory;

function openHistoryExcel(index) {
    // Same commission calculation as reExportHistory, but opens directly instead of saving
    var report = (window.appState.config.reportHistory||[])[index];
    if (!report) return;
    showToast('⏳', 'Opening Excel...');
    try {
        var cfg = window.appState.config;
        var combinedData = buildHistoryExportPeople(report);

        window.electronAPI.openExcelPreview({salespeople:combinedData, config:cfg, month:report.month})
            .then(function(result){
                if(result.success) showToast('✅', 'Excel opened!');
                else showToast('❌', 'Failed: '+(result.error||''));
            });
    } catch(e){ showToast('❌', e.message); }
}
window.openHistoryExcel = openHistoryExcel;


// ==================== Salary History Helpers ====================

function getSalaryForMonth(personName, monthStr) {
    var cfg = window.appState.config;
    var nu = (personName||'').toUpperCase();
    var history = cfg.salary_history && cfg.salary_history[nu];

    if (!history || history.length === 0) {
        return {
            salary:     (cfg.base_salaries && cfg.base_salaries[nu]) || 1700,
            allowances: (cfg.allowances    && cfg.allowances[nu])    || {},
            epfRate:    (cfg.deductionRates && cfg.deductionRates[nu] && cfg.deductionRates[nu].EPF_RATE) || 11
        };
    }

    // Build targetYM from monthStr + current year (e.g. 'MAR' -> '2026-03')
    var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var curYear = new Date().getFullYear();
    var mIdx = monthOrder.indexOf((monthStr||'').toUpperCase());
    if (mIdx < 0) mIdx = 0;
    var targetYM = curYear + '-' + String(mIdx + 1).padStart(2, '0');

    // Sort ascending by effectiveFrom
    var sorted = history.slice().sort(function(a, b) {
        return (a.effectiveFrom||'').localeCompare(b.effectiveFrom||'');
    });

    // Find the LAST entry whose effectiveFrom <= targetYM
    // i.e. the salary that was in effect at that month
    var match = null;
    for (var i = 0; i < sorted.length; i++) {
        if ((sorted[i].effectiveFrom||'') <= targetYM) {
            match = sorted[i]; // keep updating - we want the latest applicable
        }
    }

    // If no record is <= targetYM, use the oldest (earliest) record
    // (salary was set before we started tracking history)
    if (!match) match = sorted[0];

    return {
        salary:     match.salary     || 1700,
        allowances: match.allowances || {},
        epfRate:    match.epfRate    || 11
    };
}

function getCurrentSalary(personName) {
    var cfg = window.appState.config;
    var nu = (personName||'').toUpperCase();
    var history = cfg.salary_history && cfg.salary_history[nu];
    if (!history || history.length === 0) {
        return {
            salary:     (cfg.base_salaries && cfg.base_salaries[nu]) || 1700,
            allowances: (cfg.allowances    && cfg.allowances[nu])    || {},
            epfRate:    (cfg.deductionRates && cfg.deductionRates[nu] && cfg.deductionRates[nu].EPF_RATE) || 11
        };
    }
    // Most recent entry
    var sorted = history.slice().sort(function(a,b){ return (b.effectiveFrom||'').localeCompare(a.effectiveFrom||''); });
    return { salary: sorted[0].salary||1700, allowances: sorted[0].allowances||{}, epfRate: sorted[0].epfRate||11 };
}

window.getSalaryForMonth = getSalaryForMonth;
window.getCurrentSalary  = getCurrentSalary;


// ==================== Salary History Migration ====================
function fixSalaryHistory() {
    // Run on startup - ensure every person has an origin salary record
    var cfg = window.appState.config;
    if (!cfg || !cfg.base_salaries) return;
    if (!cfg.salary_history) cfg.salary_history = {};

    var changed = false;
    Object.keys(cfg.base_salaries).forEach(function(nu) {
        var history = cfg.salary_history[nu];
        
        if (!history || history.length === 0) {
            // No history at all - create origin from current flat values
            cfg.salary_history[nu] = [{
                salary:        cfg.base_salaries[nu] || 1700,
                allowances:    (cfg.allowances && cfg.allowances[nu])    || {},
                epfRate:       (cfg.deductionRates && cfg.deductionRates[nu] && cfg.deductionRates[nu].EPF_RATE) || 11,
                effectiveFrom: '2000-01'
            }];
            changed = true;
            console.log('✅ Created origin salary record for', nu);
        } else {
            // Has history - check if earliest record covers all report months
            var sorted = history.slice().sort(function(a,b){
                return (a.effectiveFrom||'').localeCompare(b.effectiveFrom||'');
            });
            var earliest = sorted[0].effectiveFrom || '';
            
            // Find earliest report month in reportHistory
            var reports = cfg.reportHistory || [];
            var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
            var curYear = new Date().getFullYear();
            var earliestReport = null;
            reports.forEach(function(r) {
                var mi = monthOrder.indexOf(bareMonth(r.month));
                if (mi < 0) return;
                var ym = curYear + '-' + String(mi+1).padStart(2,'0');
                if (!earliestReport || ym < earliestReport) earliestReport = ym;
            });

            // If earliest salary record is AFTER earliest report, need an origin record
            if (earliestReport && earliest > earliestReport) {
                // The oldest salary record is newer than some reports
                // Add an origin record with the oldest known salary
                cfg.salary_history[nu].push({
                    salary:        sorted[0].salary,
                    allowances:    sorted[0].allowances || {},
                    epfRate:       sorted[0].epfRate || 11,
                    effectiveFrom: '2000-01'
                });
                cfg.salary_history[nu].sort(function(a,b){
                    return (a.effectiveFrom||'').localeCompare(b.effectiveFrom||'');
                });
                changed = true;
                console.log('✅ Added origin record for', nu, '- old salary preserved for reports before', earliest);
            }
        }
    });

    if (changed) {
        saveConfig();
        console.log('✅ Salary history migration complete');
    }
}
window.fixSalaryHistory = fixSalaryHistory;


// ==================== Target Setup ====================

function showTargetModal(personName) {
    var ex = document.getElementById('target-setup-modal');
    if (ex) ex.remove();

    var cfg = window.appState.config;
    var nu  = personName.toUpperCase();
    var targets = (cfg.person_targets && cfg.person_targets[nu]) || {};
    var months  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    var overlay = document.createElement('div');
    overlay.id = 'target-setup-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--paper);border-radius:16px;width:920px;max-width:95vw;max-height:90vh;margin:20px auto;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(8,15,26,.25);overflow:hidden;';
    card.addEventListener('click', function(e){ e.stopPropagation(); });

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,#0f172a,#0369a1);padding:20px 24px;color:#fff;flex-shrink:0;';
    hdr.innerHTML = '<div style="font-size:17px;font-weight:800;">🎯 Monthly Target Setting</div>'
        + '<div style="font-size:12px;opacity:.6;margin-top:3px;">' + personName + ' — Set target for each month</div>';
    card.appendChild(hdr);

    // Body - month grid
    var body = document.createElement('div');
    body.style.cssText = 'padding:20px 24px;overflow-y:auto;flex:1;';

    // Year selector — align with Calculation / Projection year so Team Target Setting keys match
    var ryBar = parseInt(String(((document.getElementById('report-year')||{}).value||'')), 10);
    var curYear = !isNaN(ryBar) ? ryBar : new Date().getFullYear();
    var yearRow = document.createElement('div');
    yearRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;';
    yearRow.innerHTML = '<label style="font-size:12px;font-weight:700;color:var(--ink3);">Year:</label>';
    var yearSel = document.createElement('select');
    yearSel.style.cssText = 'padding:6px 12px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-family:Sora,sans-serif;outline:none;background:var(--paper);color:var(--ink);';
    var yCandidates = [curYear - 1, curYear, curYear + 1];
    yCandidates.sort(function(a, b) { return a - b; });
    yCandidates.forEach(function(y){
        var opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        if (y === curYear) opt.selected = true;
        yearSel.appendChild(opt);
    });
    yearRow.appendChild(yearSel);
    body.appendChild(yearRow);
    var yearAlignHint = document.createElement('div');
    yearAlignHint.style.cssText = 'font-size:11px;color:var(--ink4);margin:-8px 0 14px 2px;line-height:1.4;';
    yearAlignHint.textContent = 'Default year matches Sales Insight / Projection \u2192 Year (same period keys as Team Target Setting).';
    body.appendChild(yearAlignHint);

    // Month grid
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%;';

    function buildGrid(year) {
        grid.innerHTML = '';
        var outletTargets = (cfg.person_outlet_targets && cfg.person_outlet_targets[nu]) || {};
        months.forEach(function(mon) {
            var key = year + '-' + mon;
            var val = targets[key] || '';
            var outletVal = outletTargets[key] || '';
            var cell = document.createElement('div');
            cell.style.cssText = 'background:var(--sheet);border:1px solid var(--line);border-radius:var(--r);padding:16px 18px;';

            var hdr = document.createElement('div');
            hdr.style.cssText = 'font-size:13px;font-weight:800;color:var(--ink);letter-spacing:.5px;margin-bottom:12px;';
            hdr.textContent = mon + ' ' + year;
            cell.appendChild(hdr);

            // Target (RM)
            var lbl1 = document.createElement('div');
            lbl1.style.cssText = 'font-size:11px;color:var(--ink4);margin-bottom:5px;text-transform:uppercase;font-weight:600;';
            lbl1.textContent = 'Sale Target (RM)';
            cell.appendChild(lbl1);
            var inp = document.createElement('input');
            inp.type = 'number'; inp.placeholder = '0'; inp.value = val;
            inp.dataset.key = key; inp.dataset.fieldtype = 'target';
            inp.style.cssText = 'width:100%;padding:9px 12px;border:1.5px solid var(--line);border-radius:8px;font-size:15px;font-family:Sora,sans-serif;font-weight:600;outline:none;background:var(--paper);color:var(--ink);box-sizing:border-box;margin-bottom:10px;';
            inp.addEventListener('focus', function(){ this.style.borderColor='var(--blue)'; });
            inp.addEventListener('blur',  function(){ this.style.borderColor='var(--line)'; });
            cell.appendChild(inp);

            // Outlets
            var lbl2 = document.createElement('div');
            lbl2.style.cssText = 'font-size:11px;color:#92400e;margin-bottom:5px;text-transform:uppercase;font-weight:700;';
            lbl2.textContent = 'Collection Target';
            cell.appendChild(lbl2);
            var outInp = document.createElement('input');
            outInp.type = 'number'; outInp.placeholder = '0'; outInp.value = outletVal;
            outInp.dataset.key = key; outInp.dataset.fieldtype = 'outlet';
            outInp.style.cssText = 'width:100%;padding:9px 12px;border:1.5px solid #fde68a;border-radius:8px;font-size:15px;font-family:Sora,sans-serif;font-weight:600;outline:none;background:#fffbeb;color:var(--ink);box-sizing:border-box;margin-bottom:10px;';
            outInp.addEventListener('focus', function(){ this.style.borderColor='var(--am)'; });
            outInp.addEventListener('blur',  function(){ this.style.borderColor='#fde68a'; });
            cell.appendChild(outInp);

            // Active Calls Target
            var callTargets = (cfg.person_call_targets && cfg.person_call_targets[nu]) || {};
            var callVal = callTargets[key] || '';
            var lbl3 = document.createElement('div');
            lbl3.style.cssText = 'font-size:11px;color:#5b21b6;margin-bottom:5px;text-transform:uppercase;font-weight:700;';
            lbl3.textContent = 'Active Calls Target';
            cell.appendChild(lbl3);
            var callInp = document.createElement('input');
            callInp.type = 'number'; callInp.placeholder = '0'; callInp.value = callVal;
            callInp.dataset.key = key; callInp.dataset.fieldtype = 'call';
            callInp.style.cssText = 'width:100%;padding:9px 12px;border:1.5px solid #ddd6fe;border-radius:8px;font-size:15px;font-family:Sora,sans-serif;font-weight:600;outline:none;background:#f5f3ff;color:var(--ink);box-sizing:border-box;';
            callInp.addEventListener('focus', function(){ this.style.borderColor='var(--vi)'; });
            callInp.addEventListener('blur',  function(){ this.style.borderColor='#ddd6fe'; });
            cell.appendChild(callInp);

            grid.appendChild(cell);
        });
    }

    buildGrid(curYear);
    yearSel.addEventListener('change', function(){ buildGrid(parseInt(this.value)); });
    body.appendChild(grid);
    card.appendChild(body);

    // Footer
    var foot = document.createElement('div');
    foot.style.cssText = 'padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;background:var(--paper);flex-shrink:0;';
    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'padding:9px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;';
    var btnSave = document.createElement('button');
    btnSave.textContent = '💾 Save & Confirm ✓';
    btnSave.style.cssText = 'padding:9px 24px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#0369a1);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;';
    foot.appendChild(btnCancel);
    foot.appendChild(btnSave);
    card.appendChild(foot);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    // Only close via Cancel button — clicking background does NOT close
    btnCancel.addEventListener('click', function(){ overlay.remove(); });
    btnSave.addEventListener('click', function(){
        if (!cfg.person_targets) cfg.person_targets = {};
        if (!cfg.person_targets[nu]) cfg.person_targets[nu] = {};
        if (!cfg.person_outlet_targets) cfg.person_outlet_targets = {};
        if (!cfg.person_outlet_targets[nu]) cfg.person_outlet_targets[nu] = {};
        if (!cfg.person_call_targets) cfg.person_call_targets = {};
        if (!cfg.person_call_targets[nu]) cfg.person_call_targets[nu] = {};
        grid.querySelectorAll('input').forEach(function(inp){
            var key = inp.dataset.key;
            var val = parseFloat(inp.value) || 0;
            if (inp.dataset.fieldtype === 'outlet') {
                if (val > 0) cfg.person_outlet_targets[nu][key] = val;
                else delete cfg.person_outlet_targets[nu][key];
            } else if (inp.dataset.fieldtype === 'call') {
                if (val > 0) cfg.person_call_targets[nu][key] = val;
                else delete cfg.person_call_targets[nu][key];
            } else {
                if (val > 0) cfg.person_targets[nu][key] = val;
                else delete cfg.person_targets[nu][key];
            }
        });
        refreshTeamTargetAllocationFromPersonTargetsForYear(cfg, String(yearSel.value));
        saveConfig();
        overlay.remove();
        showToast('✅', personName + ' targets saved!');
        // Refresh calculate card if visible
        if (window.appState.salespeople.length > 0) {
            applyPersonTarget(0);
        }
    });
}

// ==================== Team Target Setting (allocation UI) ====================
function teamAllocationMonthKey() {
    var pjm = ((document.getElementById('proj-month-select')||{}).value||'').toUpperCase();
    var pjy = ((document.getElementById('proj-year-select')||{}).value||'').trim();
    if (pjm && pjy) {
        return { month: pjm, year: String(pjy), key: String(pjy) + '-' + pjm };
    }
    var month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var year  = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    return { month: month, year: String(year), key: String(year) + '-' + month };
}

function salesNamesForTeamAllocation(scope) {
    var cfg = window.appState.config;
    var raw = Object.keys(cfg.base_salaries || {}).filter(function(n) {
        if (getEmployeeType(n) !== 'Sales') return false;
        if (typeof isEmployeeActive === 'function' && !isEmployeeActive(n)) return false;
        return true;
    });
    raw.sort(function(a, b) { return String(a).localeCompare(String(b)); });
    var up = function(n) { return String(n).toUpperCase(); };
    if (!scope || scope === 'ALL') return raw.map(up);
    if (scope === '__UNASSIGNED__') return raw.filter(function(n) { return !getEmployeeCompany(n); }).map(up);
    return raw.filter(function(n) { return getEmployeeCompany(n) === scope; }).map(up);
}

function distributeTeamTotalRM(teamTotal, names, pctMap) {
    var sumPct = names.reduce(function(s, n) { return s + (parseFloat(pctMap[n]) || 0); }, 0);
    var out = {};
    if (names.length === 0 || sumPct <= 0 || !(teamTotal > 0)) return out;
    var cents = Math.round(teamTotal * 100);
    var acc = 0;
    names.slice(0, -1).forEach(function(n) {
        var part = Math.round(cents * ((parseFloat(pctMap[n]) || 0) / sumPct));
        out[n] = part / 100;
        acc += part;
    });
    var last = names[names.length - 1];
    out[last] = Math.round((cents - acc)) / 100;
    return out;
}

/** Derive team total & contribution % from saved Sale Targets (person_targets) for one period key. */
function computeTeamAllocationFromPersonTargets(cfg, key, scope) {
    var ns = salesNamesForTeamAllocation(scope);
    if (ns.length === 0) return null;
    var amounts = {};
    var sum = 0;
    ns.forEach(function(nu) {
        var amt = parseFloat((((cfg.person_targets || {})[nu]) || {})[key]) || 0;
        amounts[nu] = amt;
        sum += amt;
    });
    if (!(sum > 0)) return null;
    var pct = {};
    var dec = 1e6;
    ns.slice(0, -1).forEach(function(nu) {
        pct[nu] = Math.round((amounts[nu] / sum) * 100 * dec) / dec;
    });
    var used = ns.slice(0, -1).reduce(function(s, n) { return s + (pct[n] || 0); }, 0);
    pct[ns[ns.length - 1]] = Math.round((100 - used) * dec) / dec;
    return { teamTotal: sum, contributions: pct };
}

/** After Person Monthly Target edits: refresh team_target_allocation for each month (only entries saved with scope ALL). */
function refreshTeamTargetAllocationFromPersonTargetsForYear(cfg, yearStr) {
    var mons = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    mons.forEach(function(mon) {
        var key = String(yearStr) + '-' + mon;
        var existing = cfg.team_target_allocation && cfg.team_target_allocation[key];
        if (existing && existing.scope && existing.scope !== 'ALL') return;
        var got = computeTeamAllocationFromPersonTargets(cfg, key, 'ALL');
        if (!got) {
            if (cfg.team_target_allocation && cfg.team_target_allocation[key]) delete cfg.team_target_allocation[key];
            return;
        }
        if (!cfg.team_target_allocation) cfg.team_target_allocation = {};
        cfg.team_target_allocation[key] = {
            teamTotal: got.teamTotal,
            contributions: got.contributions,
            autoAllocate: false,
            scope: 'ALL'
        };
    });
}

/** Previous calendar month (for "last month" top performer in Team Target equal split). */
function prevMonthYearForAllocation(monthU, yearStr) {
    var monthsFull = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var idx = monthsFull.indexOf((monthU || '').toUpperCase());
    var y = parseInt(String(yearStr), 10);
    if (isNaN(y)) y = new Date().getFullYear();
    if (idx < 0) return { month: monthsFull[new Date().getMonth()], year: String(y) };
    if (idx === 0) return { month: monthsFull[11], year: String(y - 1) };
    return { month: monthsFull[idx - 1], year: String(y) };
}

/**
 * Among Sales people in namesUpper (uppercase), pick top performer for that month in reportHistory.
 * Primary: achievement %. Tie: higher sales, then name (stable).
 * If no targets but some sales, rank by sales. Returns uppercase name or null.
 */
function topSalesPerformerFromHistoryForMonth(cfg, namesUpper, bareMonth, yearStr) {
    var hist = (cfg && cfg.reportHistory) || [];
    var hEntry = findHistEntry(hist, bareMonth, yearStr);
    if (!hEntry || !hEntry.data || !namesUpper || namesUpper.length === 0) return null;
    var allowed = {};
    namesUpper.forEach(function(n) { allowed[String(n).toUpperCase()] = true; });
    var candidates = [];
    hEntry.data.forEach(function(p) {
        if (!p || !p.name) return;
        if (getEmployeeType(p.name) !== 'Sales') return;
        var nu = String(p.name).toUpperCase();
        if (!allowed[nu]) return;
        var sales = parseFloat(p.sales) || 0;
        var target = parseFloat(p.target) || 0;
        var ach = target > 0 ? (sales / target) * 100 : 0;
        candidates.push({ nu: nu, ach: ach, sales: sales, hasTarget: target > 0 });
    });
    if (candidates.length === 0) return null;
    candidates.sort(function(a, b) {
        if (b.ach !== a.ach) return b.ach - a.ach;
        if (b.sales !== a.sales) return b.sales - a.sales;
        return a.nu.localeCompare(b.nu);
    });
    var top = candidates[0];
    if (top.ach <= 0 && top.sales <= 0) {
        var withSales = candidates.filter(function(c) { return c.sales > 0; });
        if (withSales.length === 0) return null;
        withSales.sort(function(a, b) {
            if (b.sales !== a.sales) return b.sales - a.sales;
            return a.nu.localeCompare(b.nu);
        });
        return withSales[0].nu;
    }
    return top.nu;
}

function showTeamTargetAllocationModal() {
    var ex = document.getElementById('team-target-allocation-modal');
    if (ex) ex.remove();

    var cfg = window.appState.config;
    var monthsFull = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var initTk = teamAllocationMonthKey();
    var pmFromProj = ((document.getElementById('proj-month-select')||{}).value||'').toUpperCase();
    var pmFromBar = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var calendarMonth = monthsFull[new Date().getMonth()];
    var defaultMonth = (pmFromProj && monthsFull.indexOf(pmFromProj) >= 0) ? pmFromProj
        : (pmFromBar && monthsFull.indexOf(pmFromBar) >= 0) ? pmFromBar : calendarMonth;
    var period = {
        year: initTk.year,
        month: (initTk.month && monthsFull.indexOf(initTk.month) >= 0) ? initTk.month : defaultMonth
    };
    function periodKey() { return String(period.year) + '-' + period.month; }
    function currentSaved() {
        return (cfg.team_target_allocation && cfg.team_target_allocation[periodKey()]) || {};
    }

    if (!cfg.team_target_allocation) cfg.team_target_allocation = {};

    var overlay = document.createElement('div');
    overlay.id = 'team-target-allocation-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;overflow:auto;';

    var card = document.createElement('div');
    card.style.cssText = 'background:var(--paper);border-radius:16px;width:720px;max-width:96vw;max-height:92vh;margin:auto;display:flex;flex-direction:column;box-shadow:0 25px 60px rgba(8,15,26,.25);overflow:hidden;';
    card.addEventListener('click', function(e) { e.stopPropagation(); });

    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(135deg,#0f172a,#0369a1);padding:18px 22px;color:#fff;flex-shrink:0;';
    hdr.innerHTML = '<div style="font-size:17px;font-weight:800;">\ud83c\udfaf Team Target Setting</div>';
    var periodLbl = document.createElement('div');
    periodLbl.style.cssText = 'font-size:12px;opacity:.75;margin-top:4px;line-height:1.35;';
    hdr.appendChild(periodLbl);
    card.appendChild(hdr);

    var body = document.createElement('div');
    body.style.cssText = 'padding:18px 20px;overflow-y:auto;flex:1;';

    function syncToolbarFromPeriod() {
        var rm = document.getElementById('report-month');
        var ry = document.getElementById('report-year');
        if (rm && monthsFull.indexOf(period.month) >= 0) rm.value = period.month;
        if (ry) ry.value = period.year;
        var pjm = document.getElementById('proj-month-select');
        var pjy = document.getElementById('proj-year-select');
        if (pjm && monthsFull.indexOf(period.month) >= 0) pjm.value = period.month;
        if (pjy) pjy.value = period.year;
    }

    function updatePeriodSubtitle() {
        periodLbl.innerHTML = ''
            + '<span style="opacity:.95;font-weight:700;">' + period.month + ' ' + period.year + '</span>'
            + ' \u2014 Same month keys as <strong>Salesperson \u2192 Target</strong> (e.g. <code style="font-size:11px;background:rgba(255,255,255,.12);padding:2px 6px;border-radius:4px;">' + period.year + '-' + period.month + '</code>)';
    }

    var periodRow = document.createElement('div');
    periodRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line);';

    var py = parseInt(String(period.year), 10);
    if (isNaN(py)) py = new Date().getFullYear();
    var yCandidates = [py - 1, py, py + 1];
    if (yCandidates.indexOf(py) < 0) yCandidates.push(py);
    yCandidates.sort(function(a, b) { return a - b; });

    var yrLab = document.createElement('label');
    yrLab.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:var(--ink3);';
    yrLab.textContent = 'YEAR';
    var yearSel = document.createElement('select');
    yearSel.style.cssText = 'padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-weight:600;background:var(--paper);min-width:100px;';
    yCandidates.forEach(function(y) {
        var opt = document.createElement('option');
        opt.value = String(y);
        opt.textContent = String(y);
        if (String(y) === String(period.year)) opt.selected = true;
        yearSel.appendChild(opt);
    });
    if (!yearSel.querySelector('option:checked')) {
        var optCur = document.createElement('option');
        optCur.value = String(period.year);
        optCur.textContent = String(period.year);
        optCur.selected = true;
        yearSel.appendChild(optCur);
    }
    yrLab.appendChild(yearSel);
    periodRow.appendChild(yrLab);

    var moLab = document.createElement('label');
    moLab.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:var(--ink3);';
    moLab.textContent = 'MONTH';
    var monthSel = document.createElement('select');
    monthSel.style.cssText = 'padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-weight:600;background:var(--paper);min-width:110px;';
    monthsFull.forEach(function(m) {
        var opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === period.month) opt.selected = true;
        monthSel.appendChild(opt);
    });
    moLab.appendChild(monthSel);
    periodRow.appendChild(moLab);

    body.appendChild(periodRow);

    var pctMap = {};
    var namesRef = { list: [] };

    var scopeRow = document.createElement('div');
    scopeRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;margin-bottom:14px;';
    var totalWrap = document.createElement('div');
    totalWrap.style.flex = '1';
    totalWrap.innerHTML = '<label style="display:block;font-size:11px;font-weight:700;color:var(--ink3);margin-bottom:6px;">TEAM TOTAL TARGET (RM)</label>';
    var totalInp = document.createElement('input');
    totalInp.type = 'number';
    totalInp.min = '0';
    totalInp.step = '1';
    totalInp.placeholder = '0';
    var _initSaved = currentSaved();
    totalInp.value = _initSaved.teamTotal > 0 ? String(_initSaved.teamTotal) : '';
    totalInp.style.cssText = 'width:100%;padding:10px 14px;border:2px solid #bfdbfe;border-radius:10px;font-size:18px;font-weight:700;font-family:\'Sora\',sans-serif;background:#eff6ff;color:#1e40af;box-sizing:border-box;';
    totalWrap.appendChild(totalInp);
    scopeRow.appendChild(totalWrap);

    var grpLab = document.createElement('label');
    grpLab.style.cssText = 'display:flex;flex-direction:column;gap:6px;font-size:11px;font-weight:700;color:var(--ink3);';
    grpLab.textContent = 'SCOPE';
    var grpSel = document.createElement('select');
    grpSel.style.cssText = 'padding:10px 14px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-weight:600;background:var(--paper);min-width:160px;';
    grpSel.innerHTML = '<option value="ALL">All Groups</option>';
    (cfg.companies || []).forEach(function(c) {
        grpSel.innerHTML += '<option value="' + String(c).replace(/"/g, '&quot;') + '">\ud83c\udfe2 ' + String(c).replace(/</g, '') + '</option>';
    });
    grpSel.innerHTML += '<option value="__UNASSIGNED__">\u2014 Unassigned \u2014</option>';
    if (_initSaved.scope) {
        var scopeOk = false;
        for (var si = 0; si < grpSel.options.length; si++) {
            if (grpSel.options[si].value === _initSaved.scope) {
                grpSel.selectedIndex = si;
                scopeOk = true;
                break;
            }
        }
        if (!scopeOk) grpSel.selectedIndex = 0;
    }
    grpLab.appendChild(grpSel);
    scopeRow.appendChild(grpLab);

    var autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.style.cssText = 'padding:10px 16px;border:none;border-radius:10px;background:#fef3c7;color:#92400e;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap;';
    var autoOn = !!_initSaved.autoAllocate;
    function syncAutoLabel() {
        autoBtn.innerHTML = autoOn ? '\u2728 Auto-allocate ON' : '\u2728 Auto-allocate OFF';
        autoBtn.style.background = autoOn ? '#fef08a' : '#f1f5f9';
        autoBtn.style.color = autoOn ? '#854d0e' : '#64748b';
    }
    syncAutoLabel();
    function primeTeamInputsFromPersonTargetsIfEmpty() {
        var s = currentSaved();
        if (s.teamTotal > 0) return;
        var primed = computeTeamAllocationFromPersonTargets(cfg, periodKey(), grpSel.value);
        if (!primed) return;
        totalInp.value = String(primed.teamTotal);
        pctMap = primed.contributions;
        autoOn = false;
        syncAutoLabel();
    }
    scopeRow.appendChild(autoBtn);
    body.appendChild(scopeRow);

    function onPeriodChange() {
        period.year = yearSel.value;
        period.month = monthSel.value;
        var s = currentSaved();
        totalInp.value = s.teamTotal > 0 ? String(s.teamTotal) : '';
        autoOn = !!s.autoAllocate;
        syncAutoLabel();
        if (s.scope) {
            var ok = false;
            for (var sj = 0; sj < grpSel.options.length; sj++) {
                if (grpSel.options[sj].value === s.scope) {
                    grpSel.selectedIndex = sj;
                    ok = true;
                    break;
                }
            }
            if (!ok) grpSel.selectedIndex = 0;
        } else grpSel.selectedIndex = 0;
        pctMap = {};
        rebuildPctFromSaved(salesNamesForTeamAllocation(grpSel.value));
        primeTeamInputsFromPersonTargetsIfEmpty();
        renderRows();
        updatePeriodSubtitle();
        syncToolbarFromPeriod();
    }
    yearSel.addEventListener('change', onPeriodChange);
    monthSel.addEventListener('change', onPeriodChange);

    var hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--ink4);margin-bottom:10px;line-height:1.45;';
    hint.textContent = 'Writes the same Sale Target fields as People \u2192 Monthly Target Setting. If that grid already has amounts for this month, they load here when team allocation is empty (scope ALL). After saving Person targets, team snapshot updates for scope ALL. Equal split / Auto: extra 0.01% (e.g. 33.34% vs 33.33%) goes to last month\u2019s top Sales achiever in Records; if unknown, alphabetical last.';
    body.appendChild(hint);

    var tableWrap = document.createElement('div');
    tableWrap.style.cssText = 'border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:14px;';

    var tblTop = document.createElement('div');
    tblTop.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--sheet);border-bottom:1px solid var(--line);';
    tblTop.innerHTML = '<span style="font-size:12px;font-weight:800;color:var(--ink);">\ud83d\udcca Allocation</span>'
        + '<span id="tta-team-sum-lbl" style="font-size:12px;font-weight:700;color:#0369a1;font-family:\'Sora\',sans-serif;">Total Team Target: RM 0</span>';
    tableWrap.appendChild(tblTop);

    var table = document.createElement('table');
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:12px;';
    table.innerHTML = '<thead><tr style="background:#f1f5f9;">'
        + '<th style="padding:8px 12px;text-align:left;font-weight:700;color:#475569;">SALESPERSON</th>'
        + '<th style="padding:8px 10px;text-align:right;width:110px;font-weight:700;color:#475569;">CONTRIBUTION %</th>'
        + '<th style="padding:8px 10px;text-align:left;font-weight:700;color:#475569;">SHARE</th>'
        + '<th style="padding:8px 12px;text-align:right;font-weight:700;color:#475569;">AUTO TARGET</th>'
        + '</tr></thead><tbody id="tta-tbody"></tbody>'
        + '<tfoot><tr style="background:#dbeafe;">'
        + '<td style="padding:10px 12px;font-weight:800;color:#0f172a;">Grand Total</td>'
        + '<td id="tta-foot-pct" style="padding:10px;text-align:right;font-weight:800;color:#059669;">0%</td>'
        + '<td></td>'
        + '<td id="tta-foot-rm" style="padding:10px 12px;text-align:right;font-weight:800;color:#0369a1;font-family:\'Sora\',sans-serif;">RM 0.00</td>'
        + '</tr></tfoot>';
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);

    var foot = document.createElement('div');
    foot.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;padding-top:4px;';
    var btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancel';
    btnCancel.style.cssText = 'padding:10px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;';
    var btnApply = document.createElement('button');
    btnApply.innerHTML = '\u2705 Apply Targets to This Month';
    btnApply.style.cssText = 'padding:11px 22px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0369a1,#2563eb);color:#fff;cursor:pointer;font-size:13px;font-weight:800;';
    foot.appendChild(btnCancel);
    foot.appendChild(btnApply);
    body.appendChild(foot);

    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var tbody = document.getElementById('tta-tbody');
    var lblSum = document.getElementById('tta-team-sum-lbl');
    var footPct = document.getElementById('tta-foot-pct');
    var footRm = document.getElementById('tta-foot-rm');

    var colors = ['#dbeafe:#1e40af','#fce7f3:#be185d','#dcfce7:#15803d','#fef9c3:#a16207','#ede9fe:#6d28d9'];

    function storedPersonSaleRm(nu) {
        var k = periodKey();
        var row = cfg.person_targets && cfg.person_targets[nu];
        if (!row || !Object.prototype.hasOwnProperty.call(row, k)) return null;
        var raw = row[k];
        if (raw === '' || raw === null || raw === undefined) return null;
        var x = parseFloat(raw);
        return isNaN(x) ? null : x;
    }

    function fmtPctField(v) {
        var x = parseFloat(v);
        if (isNaN(x)) return '0.0000';
        return x.toFixed(4);
    }

    function equalPercents(ns) {
        if (ns.length === 0) return {};
        var base = Math.floor(10000 / ns.length) / 100;
        var prev = prevMonthYearForAllocation(period.month, period.year);
        var bonusNu = topSalesPerformerFromHistoryForMonth(cfg, ns, prev.month, prev.year);
        if (!bonusNu || ns.indexOf(bonusNu) < 0) bonusNu = ns[ns.length - 1];
        var m = {};
        var used = 0;
        ns.forEach(function(n) {
            if (n === bonusNu) return;
            m[n] = base;
            used += base;
        });
        m[bonusNu] = Math.round((100 - used) * 100) / 100;
        return m;
    }

    function rebuildPctFromSaved(ns) {
        var cm = currentSaved().contributions || {};
        var allMissing = ns.every(function(n) { return cm[n] == null || cm[n] === ''; });
        if (allMissing && ns.length > 0) {
            var eq = equalPercents(ns);
            ns.forEach(function(n) { pctMap[n] = eq[n]; });
            return;
        }
        ns.forEach(function(n) {
            pctMap[n] = cm[n] != null ? parseFloat(cm[n]) : (ns.length ? Math.round(10000 / ns.length) / 100 : 0);
        });
    }

    function getLivePctFromInputs() {
        var order = [];
        var map = {};
        tbody.querySelectorAll('.tta-pct').forEach(function(inp) {
            var nm = inp.getAttribute('data-name');
            if (!nm) return;
            order.push(nm);
            var v = parseFloat(String(inp.value).replace(/,/g, ''));
            map[nm] = isNaN(v) ? 0 : v;
        });
        return { order: order, map: map };
    }

    function refreshAllocationTotals() {
        var teamTotal = parseFloat(totalInp.value) || 0;
        lblSum.textContent = 'Total Team Target: RM ' + teamTotal.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        var live = getLivePctFromInputs();
        if (live.order.length === 0) return;

        var sumPct = live.order.reduce(function(s, n) { return s + (live.map[n] || 0); }, 0);
        var rmMap = distributeTeamTotalRM(teamTotal, live.order, live.map);

        var sumRmDisplayed = 0;
        tbody.querySelectorAll('tr').forEach(function(tr) {
            var inp = tr.querySelector('.tta-pct');
            if (!inp) return;
            var nm = inp.getAttribute('data-name');
            var pct = live.map[nm] || 0;
            var bar = tr.querySelector('.tta-bar');
            if (bar) bar.style.width = Math.min(pct, 100) + '%';
            var rmCell = tr.querySelector('.tta-rm-cell');
            var rmComputed = rmMap[nm] != null ? rmMap[nm] : 0;
            var sto = storedPersonSaleRm(nm);
            var rmShown = sto !== null ? sto : rmComputed;
            sumRmDisplayed += rmShown;
            if (rmCell) {
                rmCell.textContent = 'RM ' + rmShown.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            }
        });

        footPct.textContent = sumPct.toFixed(2) + '%';
        footPct.style.color = Math.abs(sumPct - 100) < 0.51 ? '#059669' : '#dc2626';
        footRm.textContent = 'RM ' + sumRmDisplayed.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        live.order.forEach(function(n) { pctMap[n] = live.map[n]; });
    }

    function attachPctInputHandlers() {
        var pctInputs = function() {
            return Array.prototype.slice.call(tbody.querySelectorAll('.tta-pct'));
        };
        tbody.querySelectorAll('.tta-pct').forEach(function(inp) {
            inp.addEventListener('input', function() {
                autoOn = false;
                syncAutoLabel();
                refreshAllocationTotals();
            });
            inp.addEventListener('blur', function() {
                var raw = String(inp.value).trim().replace(/,/g, '');
                if (raw === '') return;
                var v = parseFloat(raw);
                if (!isNaN(v)) inp.value = fmtPctField(v);
                refreshAllocationTotals();
            });
            inp.addEventListener('keydown', function(e) {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                var list = pctInputs();
                var idx = list.indexOf(inp);
                var raw = String(inp.value).trim().replace(/,/g, '');
                if (raw !== '') {
                    var v = parseFloat(raw);
                    if (!isNaN(v)) inp.value = fmtPctField(v);
                }
                refreshAllocationTotals();
                if (idx >= 0 && idx < list.length - 1) {
                    setTimeout(function() {
                        var next = list[idx + 1];
                        next.focus();
                        if (typeof next.select === 'function') next.select();
                    }, 0);
                } else {
                    setTimeout(function() { btnApply.focus(); }, 0);
                }
            });
        });
    }

    function renderRows() {
        namesRef.list = salesNamesForTeamAllocation(grpSel.value);
        if (autoOn && namesRef.list.length > 0) {
            pctMap = equalPercents(namesRef.list);
        } else if (namesRef.list.some(function(n) { return pctMap[n] == null || pctMap[n] === undefined; })) {
            rebuildPctFromSaved(namesRef.list);
        }

        tbody.innerHTML = '';
        var teamTotal = parseFloat(totalInp.value) || 0;
        lblSum.textContent = 'Total Team Target: RM ' + teamTotal.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

        if (namesRef.list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--ink4);">No Sales people in this scope. Add people or choose another group.</td></tr>';
            footPct.textContent = '\u2014';
            footRm.textContent = '\u2014';
            return;
        }

        var rmMap = distributeTeamTotalRM(teamTotal, namesRef.list, pctMap);

        namesRef.list.forEach(function(nu, i) {
            var pct = parseFloat(pctMap[nu]) || 0;
            var sto = storedPersonSaleRm(nu);
            if (sto !== null && teamTotal > 0) {
                pct = (sto / teamTotal) * 100;
            }
            var tr = document.createElement('tr');
            tr.style.borderTop = '1px solid var(--line)';
            var col = (colors[i % colors.length] || '#f1f5f9:#64748b').split(':');
            var rmComputed = rmMap[nu] != null ? rmMap[nu] : 0;
            var rmShown = sto !== null ? sto : rmComputed;
            var barBg = 'linear-gradient(90deg,' + col[1] + ',' + col[0] + ')';
            tr.innerHTML = ''
                + '<td style="padding:8px 12px;font-weight:600;">'
                + '<span style="display:inline-flex;align-items:center;gap:8px;">'
                + '<span style="width:26px;height:26px;border-radius:50%;background:' + col[0] + ';color:' + col[1] + ';font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center;">' + nu.charAt(0) + '</span>'
                + nu + '</span></td>'
                + '<td style="padding:6px 10px;text-align:right;"><input type="text" inputmode="decimal" autocomplete="off" data-name="' + nu.replace(/"/g, '') + '" class="tta-pct" value="' + fmtPctField(pct) + '" '
                + 'style="width:92px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;text-align:right;font-weight:700;"></td>'
                + '<td style="padding:6px 12px;"><div style="height:8px;background:#e2e8f0;border-radius:4px;overflow:hidden;">'
                + '<div class="tta-bar" style="height:100%;width:' + Math.min(pct, 100) + '%;background:' + barBg + ';border-radius:4px;"></div></div></td>'
                + '<td class="tta-rm-cell" style="padding:8px 12px;text-align:right;font-family:\'Sora\',sans-serif;font-weight:700;color:' + col[1] + ';">RM ' + rmShown.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>';
            tbody.appendChild(tr);
        });

        attachPctInputHandlers();
        refreshAllocationTotals();
    }

    grpSel.addEventListener('change', function() {
        pctMap = {};
        rebuildPctFromSaved(salesNamesForTeamAllocation(grpSel.value));
        primeTeamInputsFromPersonTargetsIfEmpty();
        renderRows();
    });
    totalInp.addEventListener('input', function() { renderRows(); });
    autoBtn.addEventListener('click', function() {
        autoOn = !autoOn;
        syncAutoLabel();
        if (autoOn && namesRef.list.length > 0) pctMap = equalPercents(namesRef.list);
        renderRows();
    });

    pctMap = {};
    rebuildPctFromSaved(salesNamesForTeamAllocation(grpSel.value));
    primeTeamInputsFromPersonTargetsIfEmpty();
    renderRows();
    updatePeriodSubtitle();
    syncToolbarFromPeriod();

    btnCancel.addEventListener('click', function() { overlay.remove(); });
    // Only close when both mousedown and click land on the backdrop — not when selecting text
    // inside the card and releasing over the dimmed area (click target becomes overlay).
    var backdropDown = false;
    overlay.addEventListener('mousedown', function(e) {
        backdropDown = (e.target === overlay);
    });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay && backdropDown) overlay.remove();
        backdropDown = false;
    });

    function performApplyTargetsSave(teamTotal, live, rmMap) {
        if (!cfg.person_targets) cfg.person_targets = {};
        live.order.forEach(function(nu) {
            var amt = rmMap[nu] || 0;
            if (!cfg.person_targets[nu]) cfg.person_targets[nu] = {};
            if (amt > 0) cfg.person_targets[nu][periodKey()] = amt;
            else delete cfg.person_targets[nu][periodKey()];
        });

        var contribSave = {};
        live.order.forEach(function(nu) { contribSave[nu] = live.map[nu] || 0; });
        cfg.team_target_allocation[periodKey()] = {
            teamTotal: teamTotal,
            contributions: contribSave,
            autoAllocate: autoOn,
            scope: grpSel.value
        };

        saveConfig().then(function() {
            if (window.appState.salespeople.length > 0) applyPersonTarget(0);
            showToast('\u2705', 'Team targets saved for ' + periodKey());
            overlay.remove();
        }).catch(function() {
            showToast('\u274c', 'Save failed');
        });
    }

    btnApply.addEventListener('click', function() {
        var teamTotal = parseFloat(totalInp.value) || 0;
        if (!(teamTotal > 0)) {
            showToast('\u26a0\ufe0f', 'Enter team total target');
            return;
        }
        var ns = salesNamesForTeamAllocation(grpSel.value);
        if (ns.length === 0) {
            showToast('\u26a0\ufe0f', 'No Sales people to allocate');
            return;
        }
        var live = getLivePctFromInputs();
        var sumPct = live.order.reduce(function(s, n) { return s + (live.map[n] || 0); }, 0);
        if (Math.abs(sumPct - 100) > 0.51) {
            showToast('\u26a0\ufe0f', 'Contribution % must sum to 100% (now ' + sumPct.toFixed(2) + '%)');
            return;
        }
        var rmMap = distributeTeamTotalRM(teamTotal, live.order, live.map);

        var exC = document.getElementById('team-target-apply-confirm');
        if (exC) exC.remove();

        var cOverlay = document.createElement('div');
        cOverlay.id = 'team-target-apply-confirm';
        cOverlay.style.cssText = 'position:fixed;inset:0;background:rgba(8,15,26,.5);display:flex;align-items:center;justify-content:center;z-index:100000;padding:20px;box-sizing:border-box;';

        var box = document.createElement('div');
        box.style.cssText = 'background:var(--paper,#fff);border-radius:14px;max-width:440px;width:100%;padding:24px 22px 20px;box-shadow:0 25px 60px rgba(8,15,26,.28);border:1.5px solid var(--line,#e8edf3);';
        box.addEventListener('click', function(e) { e.stopPropagation(); });

        var title = document.createElement('div');
        title.style.cssText = 'font-size:17px;font-weight:800;color:var(--ink,#0f172a);display:flex;align-items:center;gap:10px;';
        title.innerHTML = '<span style="font-size:22px;line-height:1;">\u26a0\ufe0f</span><span>Apply targets to this month?</span>';
        box.appendChild(title);

        var body = document.createElement('p');
        body.style.cssText = 'margin:14px 0 20px;font-size:13px;line-height:1.55;color:var(--ink3,#475569);';
        body.innerHTML = 'This will write <strong>Sale Target (RM)</strong> for <strong>' + period.month + ' ' + period.year + '</strong> to each salesperson\'s Monthly Target Setting. '
            + '<strong>Existing amounts for that month may be overwritten.</strong> Continue?';
        box.appendChild(body);

        var row = document.createElement('div');
        row.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;';

        var btnCancelC = document.createElement('button');
        btnCancelC.type = 'button';
        btnCancelC.textContent = 'Cancel';
        btnCancelC.style.cssText = 'padding:10px 18px;border:1.5px solid var(--line,#e2e8f0);border-radius:var(--r,10px);background:var(--paper,#fff);cursor:pointer;font-size:13px;font-weight:600;color:var(--ink2,#334155);font-family:Sora,sans-serif;';

        var btnConfirm = document.createElement('button');
        btnConfirm.type = 'button';
        btnConfirm.textContent = 'Confirm & Save';
        btnConfirm.style.cssText = 'padding:10px 20px;border:none;border-radius:var(--r,10px);background:#0891b2;color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;';
        btnConfirm.addEventListener('mouseenter', function() { btnConfirm.style.background = '#0e7490'; });
        btnConfirm.addEventListener('mouseleave', function() { btnConfirm.style.background = '#0891b2'; });

        function closeConfirm() {
            if (cOverlay.parentNode) cOverlay.parentNode.removeChild(cOverlay);
        }

        btnCancelC.addEventListener('click', closeConfirm);
        cOverlay.addEventListener('click', function(e) {
            if (e.target === cOverlay) closeConfirm();
        });
        btnConfirm.addEventListener('click', function() {
            closeConfirm();
            performApplyTargetsSave(teamTotal, live, rmMap);
        });

        row.appendChild(btnCancelC);
        row.appendChild(btnConfirm);
        box.appendChild(row);
        cOverlay.appendChild(box);
        document.body.appendChild(cOverlay);
    });
}

function applyPersonTarget(cardIndex) {
    // Apply the set target for current person + month to the card
    var person = window.appState.salespeople[cardIndex];
    if (!person || !person.name) return;
    var cfg = window.appState.config;
    var nu  = person.name.toUpperCase();
    var month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var year  = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var key   = year + '-' + month;
    var targets = cfg.person_targets && cfg.person_targets[nu];
    var targetVal = targets && targets[key];

    var targetEl = document.getElementById('target-' + cardIndex);
    if (targetEl) {
        if (targetVal) {
            targetEl.value = targetVal;
            targetEl.removeAttribute('disabled');
            targetEl.value = targetVal;
            targetEl.setAttribute('disabled', 'disabled');
            targetEl.setAttribute('readonly', 'readonly');
            targetEl.style.cssText += ';background:#f1f5f9!important;color:#64748b!important;cursor:not-allowed!important;pointer-events:none!important;user-select:none!important;';
            targetEl.title = 'Target locked — change in Salesperson → Target';
            // Force value lock — prevent any changes via events
            if (!targetEl._locked) {
                targetEl._locked = true;
                targetEl._lockedValue = targetVal;
                targetEl.addEventListener('input',  function(){ this.value = this._lockedValue; });
                targetEl.addEventListener('change', function(){ this.value = this._lockedValue; });
                targetEl.addEventListener('keydown',function(e){ e.preventDefault(); });
                targetEl.addEventListener('paste',  function(e){ e.preventDefault(); });
            } else {
                targetEl._lockedValue = targetVal;
            }
            if (window.appState.salespeople[cardIndex]) {
                window.appState.salespeople[cardIndex].target = targetVal;
            }
        } else {
            targetEl.value = '';
            targetEl.setAttribute('disabled', 'disabled');
            targetEl.setAttribute('readonly', 'readonly');
            targetEl.style.cssText += ';background:#f1f5f9!important;color:#94a3b8!important;cursor:not-allowed!important;pointer-events:none!important;';
            targetEl.title = 'Set target in Salesperson → Target';
            targetEl.placeholder = 'Set in Salesperson tab';
            targetEl._locked = false;
            targetEl._lockedValue = null;
        }
    }

    // Apply Collection Target (Outlets)
    var collEl = document.getElementById('collection-target-' + cardIndex);
    if (collEl) {
        var outletTargets = cfg.person_outlet_targets && cfg.person_outlet_targets[nu];
        var outletVal = outletTargets && outletTargets[key];
        collEl.removeAttribute('disabled');
        collEl.value = outletVal || '';
        collEl.setAttribute('disabled', 'disabled');
        collEl.style.background = '#f1f5f9';
        collEl.style.color = '#64748b';
        if (window.appState.salespeople[cardIndex]) {
            window.appState.salespeople[cardIndex].collectionTarget = parseFloat(outletVal) || 0;
        }
    }

    // Apply Active Call Target
    var callEl = document.getElementById('call-target-' + cardIndex);
    if (callEl) {
        var callTargets = cfg.person_call_targets && cfg.person_call_targets[nu];
        var callVal = callTargets && callTargets[key];
        callEl.removeAttribute('disabled');
        callEl.value = callVal || '';
        callEl.setAttribute('disabled', 'disabled');
        callEl.style.background = '#f1f5f9';
        callEl.style.color = '#64748b';
        if (window.appState.salespeople[cardIndex]) {
            window.appState.salespeople[cardIndex].callTarget = parseFloat(callVal) || 0;
        }
    }

    // Update type badge and show/hide sections based on employee type
    updateCardForEmployeeType(cardIndex);

    // Trigger calculation for Supervisor (uses team data, no input needed)
    var _empT = person.name ? getEmployeeType(person.name) : 'Sales';
    if (_empT === 'Supervisor' || _empT === 'Support Staff') {
        setTimeout(function(){ updateSalespersonData(cardIndex); }, 50);
    }
}

function updateCardForEmployeeType(cardIndex) {
    var person = window.appState.salespeople[cardIndex];
    var nameDisp = document.getElementById('card-name-display-' + cardIndex);
    var card = nameDisp ? nameDisp.closest('.card') : null;
    if (!person) return;
    if (!person.name) {
        applyRoleColorsToCardHeader(cardIndex, '');
        var badgeEmpty = document.getElementById('card-type-badge-' + cardIndex);
        if (badgeEmpty) badgeEmpty.style.display = 'none';
        return;
    }
    var empType = getEmployeeType(person.name);
    applyRoleColorsToCardHeader(cardIndex, person.name);
    var badge = document.getElementById('card-type-badge-' + cardIndex);
    var tc = getRoleBadgeStyle(empType);
    if (badge) {
        badge.style.display = 'inline-block';
        badge.style.background = tc.bg;
        badge.style.color = tc.c;
        badge.textContent = tc.icon + ' ' + empType;
    }
    if (!card) return;

    // Remove existing notice
    var notice = card.querySelector('.emp-type-notice');
    if (notice) notice.remove();

    // Reset: restore all fields, headers, and dividers visible
    var allInputs = ['target-','sales-','quarterly-target-','quarterly-sales-','collection-target-','collection-amount-','call-target-','call-actual-'];
    allInputs.forEach(function(prefix) {
        var el = document.getElementById(prefix + cardIndex);
        if (el) {
            var p = el.closest('div:not(.grid)');
            if (p) p.style.display = '';
            // Also restore original label
            if (p && prefix === 'collection-amount-') {
                var lbl = p.querySelector('label');
                if (lbl) lbl.textContent = 'Collected Outlets';
            }
        }
    });
    var allH5 = card.querySelectorAll('h5');
    allH5.forEach(function(h){ h.style.display = ''; });
    var allHr = card.querySelectorAll('.h-px');
    allHr.forEach(function(h){ h.style.display = ''; });

    // Hide irrelevant fields and add notice for non-Sales types
    if (empType !== 'Sales') {
        var n = document.createElement('div');
        n.className = 'emp-type-notice';
        var _pmCfg = window.appState.config;
        var _pmRates = _pmCfg.person_merchandiser_rates || {};
        var rate = (_pmRates[person.name] != null ? Number(_pmRates[person.name]) : Number(_pmCfg.merchandiser_block_rate)) || 10;
        n.style.cssText = 'background:'+(empType==='Supervisor'?'#dbeafe':'#fef9c3')+';border:1px solid '+(empType==='Supervisor'?'#93c5fd':'#facc15')+';border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:11px;color:'+(empType==='Supervisor'?'#1e40af':'#854d0e')+';';
        if (empType === 'Supervisor') {
            n.innerHTML = '<strong>👔 Supervisor</strong> — Earns from team performance. Sale/Collection/Call Incentives are calculated automatically from team totals on save. No individual target input needed.';
        } else {
            n.innerHTML = '<strong>🛠️ Support Staff</strong> — Earns from blocks display. Enter number of blocks displayed in "Collected Outlets" field (each block = RM ' + rate.toFixed(2) + '). Other fields not applicable.';
        }
        var nameDiv = card.querySelector('#card-name-display-' + cardIndex);
        if (nameDiv && nameDiv.parentNode) nameDiv.parentNode.insertBefore(n, nameDiv.nextSibling);

        // Hide the main grid fields that don't apply
        var targetInput = document.getElementById('target-' + cardIndex);
        var salesInput  = document.getElementById('sales-' + cardIndex);
        var qTInput     = document.getElementById('quarterly-target-' + cardIndex);
        var qSInput     = document.getElementById('quarterly-sales-' + cardIndex);
        var collTInput  = document.getElementById('collection-target-' + cardIndex);
        var collAInput  = document.getElementById('collection-amount-' + cardIndex);
        var callTInput  = document.getElementById('call-target-' + cardIndex);
        var callAInput  = document.getElementById('call-actual-' + cardIndex);

        function hideParent(el) {
            if (!el) return;
            var p = el.closest('div:not(.grid)');
            if (p) p.style.display = 'none';
        }
        function showParent(el) {
            if (!el) return;
            var p = el.closest('div:not(.grid)');
            if (p) p.style.display = '';
        }
        function setLabel(el, txt) {
            if (!el) return;
            var p = el.closest('div:not(.grid)');
            if (!p) return;
            var lbl = p.querySelector('label');
            if (lbl) lbl.textContent = txt;
        }

        // Hide all by default
        hideParent(targetInput); hideParent(salesInput);
        hideParent(qTInput); hideParent(qSInput);
        hideParent(collTInput); hideParent(collAInput);
        hideParent(callTInput); hideParent(callAInput);
        // Hide the Quarterly Data and Other Targets headers
        var hd = card.querySelectorAll('h5');
        hd.forEach(function(h){ h.style.display = 'none'; });
        var hr = card.querySelectorAll('.h-px');
        hr.forEach(function(h){ h.style.display = 'none'; });

        if (empType === 'Support Staff') {
            // Show only "Collected Outlets" (as block count)
            showParent(collAInput);
            setLabel(collAInput, 'Blocks Display (count)');
            if (collAInput) collAInput.placeholder = 'Enter number of blocks';
        }
        // Supervisor: all hidden. Just the notice + auto-calculated preview.
    }

    // Update preview labels based on type
    var lblC  = document.getElementById('lbl-commission-' + cardIndex);
    var lblCB = document.getElementById('lbl-collection-bonus-' + cardIndex);
    var lblKB = document.getElementById('lbl-call-bonus-' + cardIndex);
    var lblQB = document.getElementById('lbl-quarterly-' + cardIndex);
    var lblT  = document.getElementById('lbl-total-commission-' + cardIndex);

    // Preview row wrappers — show all first
    var wrapIds = ['wrap-achievement-','wrap-commission-','wrap-collection-bonus-','wrap-call-bonus-','wrap-quarterly-','wrap-total-commission-'];
    wrapIds.forEach(function(id){ var el = document.getElementById(id + cardIndex); if (el) el.style.display = ''; });

    if (empType === 'Supervisor') {
        if (lblC)  lblC.textContent  = 'Sale Incentive:';
        if (lblCB) lblCB.textContent = 'Collection Incentive:';
        if (lblKB) lblKB.textContent = 'Call Incentive:';
        if (lblQB) lblQB.textContent = 'Quarterly Incentive:';
        if (lblT)  lblT.textContent  = 'Total Incentive:';
    } else if (empType === 'Support Staff') {
        if (lblCB) lblCB.textContent = 'Blocks Incentive:';
        if (lblT)  lblT.textContent  = 'Total Incentive:';
        // Hide: Achievement, Commission, Call, Quarterly
        ['wrap-achievement-','wrap-commission-','wrap-call-bonus-','wrap-quarterly-'].forEach(function(id){
            var el = document.getElementById(id + cardIndex); if (el) el.style.display = 'none';
        });
    } else {
        if (lblC)  lblC.textContent  = 'Commission:';
        if (lblCB) lblCB.textContent = 'Collection Incentive:';
        if (lblKB) lblKB.textContent = 'Call Incentive:';
        if (lblQB) lblQB.textContent = 'Quarterly Incentive:';
        if (lblT)  lblT.textContent  = 'Total Commission:';
    }
}
window.updateCardForEmployeeType = updateCardForEmployeeType;
window.applyPersonTarget = applyPersonTarget;
window.showTargetModal   = showTargetModal;
window.showTeamTargetAllocationModal = showTeamTargetAllocationModal;


// ==================== Projection Report ====================

function renderProjectionReport() {
    var cfg  = window.appState.config;
    var body = document.getElementById('projection-report-body');
    if (!body) return;

    // ── Populate person selector (Sales only — projection is sales-based) ──
    var personSelect = document.getElementById('proj-person-select');
    if (personSelect) {
        var configPeople = Object.keys(cfg.base_salaries || {}).filter(function(n){
            if (getEmployeeType(n) !== 'Sales') return false;
            if (typeof isEmployeeActive === 'function' && !isEmployeeActive(n)) return false;
            return true;
        });
        var existingNames = Array.from(personSelect.options).map(function(o){return o.value;}).filter(function(v){return v;});
        if (existingNames.join(',') !== configPeople.join(',')) {
            var html = '<option value="">— Select —</option>';
            configPeople.forEach(function(n){ html += '<option value="'+n+'">'+n+'</option>'; });
            personSelect.innerHTML = html;
        }
        if (!personSelect._userOverride) {
            var person0 = window.appState.salespeople[0];
            var calcName = person0 && person0.name ? person0.name.toUpperCase() : '';
            if (calcName && configPeople.indexOf(calcName) >= 0) {
                personSelect.value = calcName;
            } else if (!personSelect.value && configPeople.length > 0) {
                personSelect.value = configPeople[0];
            }
        }
    }

    // ── Populate year selector ──
    var yearSelect = document.getElementById('proj-year-select');
    if (yearSelect) {
        var curYear = new Date().getFullYear();
        if (yearSelect.options.length === 0) {
            [curYear-1, curYear, curYear+1].forEach(function(y) {
                var opt = document.createElement('option');
                opt.value = y; opt.textContent = y;
                if (y === curYear) opt.selected = true;
                yearSelect.appendChild(opt);
            });
        }
        if (!yearSelect._userOverride) {
            var calcYearEl = document.getElementById('report-year');
            yearSelect.value = (calcYearEl && calcYearEl.value) ? calcYearEl.value : String(curYear);
        }
    }

    // ── Sync month from Calculate card ──
    var monthSelect = document.getElementById('proj-month-select');
    if (monthSelect && !monthSelect._userOverride) {
        var calcMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
        if (calcMonth) monthSelect.value = calcMonth;
    }

    // ── Read selected values ──
    var personName = personSelect ? personSelect.value : '';
    var month = monthSelect ? monthSelect.value.toUpperCase() : '';
    var selectedYear = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();

    document.getElementById('proj-person-name').textContent = personName || '—';
    document.getElementById('proj-month-label').textContent = month ? month + ' ' + selectedYear : 'No data';

    if (!personName || personName === '—' || !month) {
        body.innerHTML = '<div style="text-align:center;padding:48px;color:var(--ink4);"><div style="font-size:32px;margin-bottom:12px;">📈</div><div style="font-size:14px;font-weight:600;">No data</div><div style="font-size:12px;margin-top:6px;">Go to Sales Insight, select a person and enter sales data first.</div></div>';
        return;
    }

    var nu      = personName.toUpperCase();
    var sales   = 0;
    var calls   = 0;
    var collTgt = 0, collAmt = 0;

    // Read from reportHistory for selected person + month
    var rh = window.appState.config.reportHistory || [];
    var rEntry = findHistEntry(rh, month, selectedYear);
    if (rEntry && rEntry.data) {
        var rp = rEntry.data.find(function(p){ return (p.name||'').toUpperCase() === nu; });
        if (rp) {
            sales = parseFloat(rp.sales) || 0;
            calls = parseFloat(rp.callActual) || 0;
            collTgt = parseFloat(rp.collectionTarget) || 0;
            collAmt = parseFloat(rp.collectionAmount) || 0;
        }
    }
    // Fallback: if selected person matches Calculate card, read live values
    var person0 = window.appState.salespeople[0];
    var calcMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    if (!sales && person0 && (person0.name||'').toUpperCase() === nu && calcMonth === month) {
        sales = parseFloat(person0.sales) || 0;
        calls = parseFloat(person0.callActual) || 0;
    }
    if (person0 && (person0.name||'').toUpperCase() === nu && calcMonth === month) {
        var liveCollT = parseFloat(person0.collectionTarget);
        var liveCollA = parseFloat(person0.collectionAmount);
        if (!isNaN(liveCollT) && liveCollT > 0) collTgt = liveCollT;
        if (!isNaN(liveCollA)) collAmt = liveCollA;
    }

    // Get targets
    var year    = selectedYear;
    var tKey    = year + '-' + month;
    var target  = (cfg.person_targets && cfg.person_targets[nu] && cfg.person_targets[nu][tKey]) || 0;
    var callTgt = (cfg.person_call_targets && cfg.person_call_targets[nu] && cfg.person_call_targets[nu][tKey]) || 0;
    var outletCollTgt = (cfg.person_outlet_targets && cfg.person_outlet_targets[nu] && cfg.person_outlet_targets[nu][tKey]) || 0;
    if ((!collTgt || collTgt <= 0) && outletCollTgt > 0) collTgt = outletCollTgt;

    // Salary data
    var salRec  = getSalaryForMonth(personName, month);
    var salary  = salRec.salary || 1700;
    var allow   = salRec.allowances || {};
    var epfRate = (salRec.epfRate || 11) / 100;
    var totalAllow = Object.values(allow).reduce(function(s,v){return s+(parseFloat(v)||0);},0);
    var fixedIncome = salary + totalAllow;

    // Commission rates
    var defRates = [{min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},{min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.010}];
    var rates    = (cfg.person_commission_rates && cfg.person_commission_rates[nu] && cfg.person_commission_rates[nu].length > 0)
                    ? cfg.person_commission_rates[nu] : ((cfg.monthly_commission_rates && cfg.monthly_commission_rates.length > 0) ? cfg.monthly_commission_rates : defRates);

    // Call incentive tiers
    var callTiers = (cfg.person_call_incentive && cfg.person_call_incentive[nu] && cfg.person_call_incentive[nu].length > 0)
                    ? cfg.person_call_incentive[nu] : (cfg.active_call_incentive || [{min:90,incentive:200},{min:75,incentive:100},{min:60,incentive:50},{min:0,incentive:0}]);

    var collTiers = collectionIncentiveTiersFor(personName);
    var collPctAch = collTgt > 0 ? (collAmt / collTgt * 100) : 0;

    function getSaleRate(pct) {
        var sorted = rates.slice().sort(function(a,b){return b.min-a.min;});
        for (var i=0;i<sorted.length;i++) if (pct>=sorted[i].min) return sorted[i].rate||0;
        return 0;
    }
    function getCallInc(pct) {
        var sorted = callTiers.slice().sort(function(a,b){return b.min-a.min;});
        for (var i=0;i<sorted.length;i++) if (pct>=sorted[i].min) return sorted[i].incentive||sorted[i].amt||0;
        return 0;
    }
    function calcIncome(s, cl, collAchPct) {
        var sp   = target > 0 ? s/target*100 : 0;
        var cp   = callTgt > 0 ? cl/callTgt*100 : 0;
        var rate = getSaleRate(sp);
        var comm = s * rate;
        var cInc = getCallInc(cp);
        var collInc = calculateIncentive(collAchPct || 0, collTiers);
        var tot  = fixedIncome + comm + cInc + collInc;
        var _epfDed = (typeof computeEpf === 'function') ? computeEpf(personName, tot, month, year).employee : tot*epfRate;
        var _eisDed = (typeof computeEis === 'function') ? computeEis(personName, tot, month, year).employee : 0;
        var _socsoDed = (typeof computeSocso === 'function') ? computeSocso(personName, tot, month, year).employee : 0;
        return { income: tot - _epfDed - _socsoDed - _eisDed, comm, rate, cInc, collInc, sp, cp, collAch: collAchPct || 0, tot };
    }
    function fmt(n){ return 'RM ' + n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function fmtN(n){ return n.toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }

    var curr = calcIncome(sales, calls, collPctAch);
    var sPct = curr.sp, cPct = curr.cp, collPct = curr.collAch;

    // Sales milestones — built dynamically from commission rates
    var msColors = [
        {bg:'#fefce8',bc:'#fde68a',tc:'#92400e'},
        {bg:'#eff6ff',bc:'#bfdbfe',tc:'#1e40af'},
        {bg:'#f0fdf4',bc:'#86efac',tc:'#166534'},
        {bg:'#dcfce7',bc:'#4ade80',tc:'#14532d'},
        {bg:'#fdf4ff',bc:'#e9d5ff',tc:'#6b21a8'},
        {bg:'#fff7ed',bc:'#fed7aa',tc:'#9a3412'}
    ];
    var SALE_MS = rates.slice().sort(function(a,b){return a.min-b.min;}).filter(function(t){return (t.rate||0)>0;}).map(function(t,i){
        var c = msColors[i % msColors.length];
        return {pct:t.min, label:t.min+'%', bg:c.bg, bc:c.bc, tc:c.tc};
    });

    // Build call milestone labels from tiers
    var CALL_MS = callTiers.slice().sort(function(a,b){return a.min-b.min;}).filter(function(t){return (t.incentive||t.amt||0)>0;}).map(function(t){
        return {pct:t.min, label:t.min+'% ('+fmt(t.incentive||t.amt||0)+')', bg:'#f5f3ff', bc:'#ddd6fe', tc:'#4c1d95', inc:t.incentive||t.amt||0};
    });

    var COLL_MS = collTiers.slice().sort(function(a,b){return a.min-b.min;}).filter(function(t){return (t.incentive||t.amt||0)>0;}).map(function(t){
        return {pct:t.min, label:t.min+'% ('+fmt(t.incentive||t.amt||0)+')', bg:'#fffbeb', bc:'#fde68a', tc:'#92400e', inc:t.incentive||t.amt||0};
    });

    var html = '';

    html += '<div class="proj-report-meta">'
        + '<div class="proj-report-name">' + personName + '</div>'
        + '<div class="proj-report-period">' + month + ' ' + selectedYear + '</div>'
        + '</div>';

    // ── Header stats ──────────────────────────────────────────────────────────
    var barW  = Math.min(100, sPct).toFixed(2);
    var barC  = sPct>=106?'#16a34a':sPct>=100?'#2563eb':sPct>=90?'#d97706':'#dc2626';
    var cBarW = Math.min(100, cPct).toFixed(2);
    var cBarC = cPct>=90?'#4f46e5':cPct>=75?'#7c3aed':cPct>=60?'#a78bfa':'#c4b5fd';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">';
    html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Sale Target</div><div style="font-size:14px;font-weight:600;color:#0f172a;">'+(target>0?fmt(target):'—')+'</div></div>';
    html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Current Sales</div><div style="font-size:14px;font-weight:600;color:#0f172a;">'+fmt(sales)+'</div></div>';
    html += '<div style="background:'+(sPct>=100?'#f0fdf4':'#fefce8')+';border:1px solid '+(sPct>=100?'#86efac':'#fde68a')+';border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Achievement</div><div style="font-size:14px;font-weight:600;color:'+(sPct>=100?'#166534':sPct>=90?'#92400e':'#dc2626')+';">'+sPct.toFixed(2)+'%</div></div>';
    html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Commission Rate</div><div style="font-size:14px;font-weight:600;color:#2563eb;">'+(curr.rate*100).toFixed(2)+'%</div></div>';
    html += '<div style="background:#eff6ff;border:1px solid #93c5fd;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#1e40af;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Current Commission</div><div style="font-size:14px;font-weight:600;color:#1d4ed8;">'+fmt(curr.comm)+'</div></div>';
    html += '</div>';

    // Sales progress bar
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;"><span>Sales progress</span><span style="font-weight:600;">'+sPct.toFixed(2)+'%</span></div>';
    html += '<div style="background:#f1f5f9;border-radius:99px;height:7px;overflow:hidden;margin-bottom:14px;"><div style="height:100%;border-radius:99px;width:'+barW+'%;background:'+barC+';"></div></div>';

    // Sales balance to go — only show milestones NOT yet achieved
    var unachievedMS = SALE_MS.filter(function(m){ return sales < target * m.pct / 100; });
    if (unachievedMS.length > 0) {
        html += '<div style="font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Sales — Balance to Go With Higher Earnings</div>';
        html += '<div style="display:grid;grid-template-columns:'+('1fr '.repeat(unachievedMS.length)).trim()+';gap:8px;margin-bottom:16px;">';
        unachievedMS.forEach(function(m){
            var mS   = target * m.pct / 100;
            var gap  = Math.max(0, mS - sales);
            var mD   = calcIncome(mS, calls, collPctAch);
            var extraComm = mD.comm - curr.comm;
            html += '<div style="background:'+m.bg+';border:1px solid '+m.bc+';border-radius:10px;padding:10px;text-align:center;">';
            html += '<div style="font-size:11px;font-weight:600;color:'+m.tc+';margin-bottom:5px;">'+m.label+'</div>';
            html += '<div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Balance to go</div>';
            html += '<div style="font-size:14px;font-weight:600;color:#dc2626;margin-bottom:8px;">'+fmt(gap)+'</div>';
            html += '<div style="border-top:1px solid '+m.bc+';padding-top:6px;"><div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Extra commission</div>';
            html += '<div style="font-size:13px;font-weight:600;color:'+m.tc+';">+ '+fmt(extraComm)+'</div></div>';
            html += '</div>';
        });
        html += '</div>';
    } else {
        html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;text-align:center;margin-bottom:16px;color:#166534;font-weight:600;">✓ All sales milestones achieved!</div>';
    }

    // ── Collection (outlets) progress ─────────────────────────────────────────
    var collBarW = Math.min(100, collPct).toFixed(2);
    var collBarC = collPct>=100?'#16a34a':collPct>=90?'#ca8a04':collPct>=75?'#ea580c':'#f59e0b';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">';
    html += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Collection Target</div><div style="font-size:14px;font-weight:600;color:#78350f;">'+(collTgt>0?fmtN(collTgt):'—')+'</div></div>';
    html += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Collected Outlets</div><div style="font-size:14px;font-weight:600;color:#78350f;">'+fmtN(collAmt)+'</div></div>';
    html += '<div style="background:'+(collPct>=100?'#f0fdf4':'#fefce8')+';border:1px solid '+(collPct>=100?'#86efac':'#fde68a')+';border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Collection Achievement</div><div style="font-size:14px;font-weight:600;color:'+(collPct>=100?'#166534':collPct>=75?'#92400e':'#dc2626')+';">'+collPct.toFixed(2)+'%</div></div>';
    html += '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Collection Incentive</div><div style="font-size:14px;font-weight:600;color:#b45309;">'+fmt(curr.collInc)+'</div></div>';
    html += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#92400e;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Progress</div><div style="font-size:14px;font-weight:600;color:#92400e;">'+collPct.toFixed(2)+'%</div></div>';
    html += '</div>';

    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;"><span>Collection progress</span><span style="font-weight:600;">'+collPct.toFixed(2)+'%</span></div>';
    html += '<div style="background:#f1f5f9;border-radius:99px;height:7px;overflow:hidden;margin-bottom:14px;"><div style="height:100%;border-radius:99px;width:'+collBarW+'%;background:'+collBarC+';"></div></div>';

    if (collTgt > 0 && COLL_MS.length > 0) {
        var unachievedColl = COLL_MS.filter(function(m){ return collAmt < collTgt * m.pct / 100; });
        if (unachievedColl.length > 0) {
            html += '<div style="font-size:10px;font-weight:600;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Collection — Balance to Go With Higher Earnings</div>';
            html += '<div style="display:grid;grid-template-columns:'+('1fr '.repeat(unachievedColl.length)).trim()+';gap:8px;margin-bottom:16px;">';
            unachievedColl.forEach(function(m){
                var mNeed = collTgt * m.pct / 100;
                var gap   = Math.max(0, mNeed - collAmt);
                var extraInc = (m.inc || 0) - curr.collInc;
                html += '<div style="background:'+m.bg+';border:1px solid '+m.bc+';border-radius:10px;padding:10px;text-align:center;">';
                html += '<div style="font-size:11px;font-weight:600;color:'+m.tc+';margin-bottom:5px;">'+m.label+'</div>';
                html += '<div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Balance to go</div>';
                html += '<div style="font-size:14px;font-weight:600;color:#dc2626;margin-bottom:8px;">'+fmtN(gap)+' outlets</div>';
                html += '<div style="border-top:1px solid '+m.bc+';padding-top:6px;"><div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Extra incentive</div>';
                html += '<div style="font-size:13px;font-weight:600;color:'+m.tc+';">+ '+fmt(Math.max(0, extraInc))+'</div></div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;text-align:center;margin-bottom:16px;color:#166534;font-weight:600;">✓ All collection milestones achieved!</div>';
        }
    } else if (collTgt <= 0) {
        html += '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-align:center;margin-bottom:16px;color:#64748b;font-size:12px;">No collection target for '+month+' '+year+' — set Collection Target in Monthly Target Setting or enter outlets on Calculate.</div>';
    }

    // Call stats - 5 boxes
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:8px;margin-bottom:10px;">';
    html += '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Call Target</div><div style="font-size:14px;font-weight:600;color:#3c1d8a;">'+(callTgt||'—')+'</div></div>';
    html += '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Actual Calls</div><div style="font-size:14px;font-weight:600;color:#3c1d8a;">'+calls+'</div></div>';
    html += '<div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Call Achievement</div><div style="font-size:14px;font-weight:600;color:#4c1d95;">'+cPct.toFixed(2)+'%</div></div>';
    html += '<div style="background:#ede9fe;border:1px solid #c4b5fd;border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Call Incentive</div><div style="font-size:14px;font-weight:600;color:#4c1d95;">'+fmt(curr.cInc)+'</div></div>';
    html += '<div style="background:'+(cPct>=100?'#f0fdf4':'#fefce8')+';border:1px solid '+(cPct>=100?'#86efac':'#fde68a')+';border-radius:10px;padding:10px 12px;"><div style="font-size:10px;color:#5b21b6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;">Call Progress</div><div style="font-size:14px;font-weight:600;color:'+(cPct>=100?'#166534':cPct>=75?'#92400e':'#dc2626')+';">'+cPct.toFixed(2)+'%</div></div>';
    html += '</div>';

    // Call progress bar
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#64748b;margin-bottom:4px;"><span>Active call progress</span><span style="font-weight:600;">'+cPct.toFixed(2)+'%</span></div>';
    html += '<div style="background:#f1f5f9;border-radius:99px;height:7px;overflow:hidden;margin-bottom:14px;"><div style="height:100%;border-radius:99px;width:'+cBarW+'%;background:'+cBarC+';"></div></div>';

    // Call milestones — only show unachieved
    var unachievedCalls = CALL_MS.filter(function(m){ return calls < Math.ceil(callTgt * m.pct / 100); });
    if (CALL_MS.length > 0) {
        if (unachievedCalls.length > 0) {
            html += '<div style="font-size:10px;font-weight:600;color:#5b21b6;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Active Calls — Balance to Go With Higher Earnings</div>';
            html += '<div style="display:grid;grid-template-columns:'+('1fr '.repeat(unachievedCalls.length)).trim()+';gap:8px;">';
            unachievedCalls.forEach(function(m){
                var mC   = Math.ceil(callTgt * m.pct / 100);
                var gap  = Math.max(0, mC - calls);
                var extraInc = (m.inc || 0) - curr.cInc;
                html += '<div style="background:'+m.bg+';border:1px solid '+m.bc+';border-radius:10px;padding:10px;text-align:center;">';
                html += '<div style="font-size:11px;font-weight:600;color:'+m.tc+';margin-bottom:5px;">'+m.label+'</div>';
                html += '<div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Balance to go</div>';
                html += '<div style="font-size:14px;font-weight:600;color:#4c1d95;margin-bottom:8px;">'+gap+' calls</div>';
                html += '<div style="border-top:1px solid '+m.bc+';padding-top:6px;"><div style="font-size:10px;color:'+m.tc+';opacity:.7;margin-bottom:2px;">Extra incentive</div>';
                html += '<div style="font-size:13px;font-weight:600;color:'+m.tc+';">+ '+fmt(Math.max(0,extraInc))+'</div></div>';
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;text-align:center;color:#166534;font-weight:600;">✓ All call milestones achieved!</div>';
        }
    }

    body.innerHTML = '<div class="proj-report-root">' + html + '</div>';
}

function getProjectionPrintCss() {
    return 'body{font-family:Sora,sans-serif;padding:16px 12px;margin:0;color:#0f172a;}'
        + '.proj-report-root{width:100%;}'
        + '.proj-report-meta{display:flex;align-items:baseline;justify-content:flex-start;gap:10px;flex-wrap:nowrap;'
        + 'margin-bottom:14px;padding:10px 14px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;}'
        + '.proj-report-name{font-size:18px;font-weight:800;color:#163556;letter-spacing:-.3px;}'
        + '.proj-report-period{font-size:13px;font-weight:600;color:#64748b;}';
}

function printProjectionReport() {
    var body  = document.getElementById('projection-report-body');
    if (!body || !body.innerHTML) return;
    var name  = (document.getElementById('proj-person-name') || {}).textContent || '—';
    var month = (document.getElementById('proj-month-label') || {}).textContent || '';

    var win = window.open('', '_blank');
    if (!win) {
        showToast('⚠️', 'Pop-up blocked — allow pop-ups to print');
        return;
    }
    win.document.write('<html><head><title>Projection Report — ' + name + '</title>');
    win.document.write('<style>' + getProjectionPrintCss() + '</style></head><body>');
    win.document.write(body.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function(){ win.print(); }, 300);
}
window.renderProjectionReport = renderProjectionReport;
window.printProjectionReport  = printProjectionReport;

function syncProjectionFromCalculate() {
    var calcMonth = ((document.getElementById('report-month') || {}).value || '').toUpperCase();
    var calcYear = ((document.getElementById('report-year') || {}).value || '') || String(new Date().getFullYear());
    var calcPersonSel = document.getElementById('calc-person-select');
    var calcName = '';
    if (calcPersonSel && calcPersonSel.value) {
        calcName = calcPersonSel.value.toUpperCase();
    } else {
        var person0 = window.appState.salespeople[0];
        calcName = person0 && person0.name ? person0.name.toUpperCase() : '';
    }

    var yearSelect = document.getElementById('proj-year-select');
    if (yearSelect) {
        yearSelect._userOverride = false;
        yearSelect.value = calcYear;
    }
    var monthSelect = document.getElementById('proj-month-select');
    if (monthSelect) {
        monthSelect._userOverride = false;
        if (calcMonth) monthSelect.value = calcMonth;
    }
    var personSelect = document.getElementById('proj-person-select');
    if (personSelect && calcName) {
        personSelect._userOverride = false;
        var opts = Array.from(personSelect.options || []);
        var match = opts.find(function(o) { return (o.value || '').toUpperCase() === calcName; });
        if (match) personSelect.value = calcName;
    }
}

function closeProjectionFullscreenModal() {
    var modal = document.getElementById('projection-fullscreen-modal');
    if (modal && modal._projFsRo) {
        modal._projFsRo.disconnect();
    }
    if (modal) modal.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', _projFsEscHandler);
    window.removeEventListener('resize', _projFsResizeHandler);
}

function _projFsEscHandler(e) {
    if (e.key === 'Escape') closeProjectionFullscreenModal();
}

function _projFsResizeHandler() {
    if (document.getElementById('projection-fullscreen-modal')) fitProjectionToScreen();
}

/** Scale projection to fill viewport height; collapse layout gap below content. */
function fitProjectionToScreen() {
    var wrap = document.querySelector('#projection-fullscreen-modal .proj-fs-scale-wrap');
    var host = document.getElementById('proj-fs-scale-host');
    var inner = document.getElementById('proj-fs-inner');
    if (!wrap || !host || !inner) return;

    inner.style.zoom = '';
    inner.style.transform = 'none';
    inner.style.marginBottom = '0';
    inner.style.width = '100%';
    host.style.height = 'auto';

    var availW = wrap.clientWidth;
    var availH = wrap.clientHeight;
    if (availW < 1 || availH < 1) return;

    var contentW = inner.scrollWidth;
    var contentH = inner.scrollHeight;
    if (contentW < 1 || contentH < 1) return;

    var scaleH = availH / contentH;
    var scale = Math.max(0.55, Math.min(scaleH, 1.65));

    inner.style.transformOrigin = 'top left';
    inner.style.transform = 'scale(' + scale + ')';
    inner.style.width = (100 / scale) + '%';
    host.style.height = availH + 'px';
    wrap.style.overflowX = (contentW * scale > availW + 2) ? 'hidden' : 'hidden';
}
window.fitProjectionToScreen = fitProjectionToScreen;

function openProjectionFromToolbar() {
    var sel = document.getElementById('calc-person-select');
    var name = (sel && sel.value) || (window.appState.salespeople[0] && window.appState.salespeople[0].name) || '';
    if (!name) {
        showToast('⚠️', 'Please select a person first');
        return;
    }
    if (typeof getEmployeeType === 'function' && getEmployeeType(name) !== 'Sales') {
        showToast('⚠️', 'Projection is available for Sales employees only');
        return;
    }
    if (window.appState.salespeople.length > 0 && typeof updateSalespersonData === 'function') {
        updateSalespersonData(0);
    }
    if (typeof showProjectionFullscreenModal === 'function') {
        showProjectionFullscreenModal();
    }
}
window.openProjectionFromToolbar = openProjectionFromToolbar;

function showProjectionFullscreenModal() {
    closeProjectionFullscreenModal();

    if (typeof renderProjectionReport === 'function') {
        syncProjectionFromCalculate();
        renderProjectionReport();
    }

    var bodyEl = document.getElementById('projection-report-body');
    if (!bodyEl) return;

    var personLabel = (document.getElementById('proj-person-name') || {}).textContent || '—';
    var monthLabel = (document.getElementById('proj-month-label') || {}).textContent || '';
    var content = bodyEl.innerHTML;

    var overlay = document.createElement('div');
    overlay.id = 'projection-fullscreen-modal';
    overlay.className = 'proj-fs-modal';
    overlay.innerHTML =
        '<div class="proj-fs-card" role="dialog" aria-modal="true" aria-labelledby="proj-fs-title">'
        + '<div class="proj-fs-head">'
        + '<div><div id="proj-fs-title" class="proj-fs-title">📈 Projection — ' + personLabel + '</div>'
        + '<div class="proj-fs-sub">' + monthLabel + '</div></div>'
        + '<div class="proj-fs-actions">'
        + '<button type="button" class="proj-fs-btn proj-fs-btn--ghost" id="proj-fs-excel">📊 Print Excel</button>'
        + '<button type="button" class="proj-fs-btn proj-fs-btn--ghost" id="proj-fs-pdf">🖨️ Print PDF</button>'
        + '<button type="button" class="proj-fs-btn proj-fs-btn--close" id="proj-fs-close">✕ Close</button>'
        + '</div></div>'
        + '<div class="proj-fs-body"><div class="proj-fs-scale-wrap"><div class="proj-fs-scale-host" id="proj-fs-scale-host"><div class="proj-fs-inner" id="proj-fs-inner"></div></div></div></div>'
        + '</div>';

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    var fsInner = document.getElementById('proj-fs-inner');
    if (fsInner) fsInner.innerHTML = content;
    fitProjectionToScreen();
    setTimeout(fitProjectionToScreen, 60);
    setTimeout(fitProjectionToScreen, 180);
    setTimeout(fitProjectionToScreen, 400);
    if (typeof ResizeObserver !== 'undefined') {
        var fsBody = document.querySelector('#projection-fullscreen-modal .proj-fs-body');
        if (fsBody) {
            var ro = new ResizeObserver(function() { fitProjectionToScreen(); });
            ro.observe(fsBody);
            overlay._projFsRo = ro;
        }
    }
    window.addEventListener('resize', _projFsResizeHandler);

    document.getElementById('proj-fs-close').addEventListener('click', closeProjectionFullscreenModal);
    document.getElementById('proj-fs-excel').addEventListener('click', function() {
        if (typeof printProjectionExcel === 'function') printProjectionExcel();
    });
    document.getElementById('proj-fs-pdf').addEventListener('click', function() {
        if (typeof printProjectionReport === 'function') printProjectionReport();
    });
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay && e.target.classList.contains('proj-fs-modal')) closeProjectionFullscreenModal();
    });
    document.addEventListener('keydown', _projFsEscHandler);
}
window.showProjectionFullscreenModal = showProjectionFullscreenModal;
window.closeProjectionFullscreenModal = closeProjectionFullscreenModal;

function printProjectionExcel() {
    var personSelect = document.getElementById('proj-person-select');
    var monthSelect = document.getElementById('proj-month-select');
    var personName = personSelect ? personSelect.value : '';
    var month = monthSelect ? monthSelect.value.toUpperCase() : '';
    if (!personName || !month) { showToast('⚠️', 'Please select a person and month'); return; }

    var cfg = window.appState.config;
    var nu = personName.toUpperCase();

    // Get data from reportHistory
    var yearSelect = document.getElementById('proj-year-select');
    var selectedYear = yearSelect ? parseInt(yearSelect.value) : new Date().getFullYear();
    var rh = cfg.reportHistory || [];
    var rEntry = findHistEntry(rh, month, selectedYear);
    var rp = rEntry && rEntry.data ? rEntry.data.find(function(p){ return (p.name||'').toUpperCase() === nu; }) : null;

    var person0 = window.appState.salespeople[0];
    var calcMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var sales = rp ? (parseFloat(rp.sales)||0) : (person0 && (person0.name||'').toUpperCase()===nu && calcMonth===month ? (parseFloat(person0.sales)||0) : 0);
    var callActual = rp ? (parseFloat(rp.callActual)||0) : (person0 && (person0.name||'').toUpperCase()===nu && calcMonth===month ? (parseFloat(person0.callActual)||0) : 0);
    var collTgt = rp ? (parseFloat(rp.collectionTarget)||0) : 0;
    var collAmt = rp ? (parseFloat(rp.collectionAmount)||0) : 0;
    if (person0 && (person0.name||'').toUpperCase()===nu && calcMonth===month) {
        var xlLiveCollT = parseFloat(person0.collectionTarget);
        var xlLiveCollA = parseFloat(person0.collectionAmount);
        if (!isNaN(xlLiveCollT) && xlLiveCollT > 0) collTgt = xlLiveCollT;
        if (!isNaN(xlLiveCollA)) collAmt = xlLiveCollA;
    }

    var tKey = selectedYear + '-' + month;
    var target = (cfg.person_targets && cfg.person_targets[nu] && cfg.person_targets[nu][tKey]) || 0;
    var callTgt = (cfg.person_call_targets && cfg.person_call_targets[nu] && cfg.person_call_targets[nu][tKey]) || 0;
    var outletCollTgt = (cfg.person_outlet_targets && cfg.person_outlet_targets[nu] && cfg.person_outlet_targets[nu][tKey]) || 0;
    if ((!collTgt || collTgt <= 0) && outletCollTgt > 0) collTgt = outletCollTgt;
    var ach = target > 0 ? (sales/target*100) : 0;
    var comm = calculateCommission(sales, target, personName);
    var callPct = callTgt > 0 ? (callActual/callTgt*100) : 0;
    var callInc = calculateIncentive(callPct, activeCallIncentiveTiersFor(personName));
    var collPctAch = collTgt > 0 ? (collAmt / collTgt * 100) : 0;
    var collInc = calculateIncentive(collPctAch, collectionIncentiveTiersFor(personName));

    // Get commission rate
    var defRates = [{min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},{min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.01}];
    var rates = (cfg.person_commission_rates && cfg.person_commission_rates[nu] && cfg.person_commission_rates[nu].length > 0)
                ? cfg.person_commission_rates[nu] : ((cfg.monthly_commission_rates && cfg.monthly_commission_rates.length > 0) ? cfg.monthly_commission_rates : defRates);
    function getSaleRate(pct) {
        var sorted = rates.slice().sort(function(a,b){return b.min-a.min;});
        for (var i=0;i<sorted.length;i++) if(pct>=sorted[i].min) return sorted[i].rate||0;
        return 0;
    }
    var commRate = getSaleRate(ach) * 100; // as percentage

    // Build sale milestones (only unachieved)
    var SALE_MS = [{pct:80,label:'80%'},{pct:90,label:'90%'},{pct:100,label:'100%'},{pct:106,label:'106%'}];
    var saleMilestones = [];
    SALE_MS.forEach(function(m) {
        var mS = target * m.pct / 100;
        if (sales < mS) {
            var gap = mS - sales;
            var mRate = getSaleRate(m.pct);
            var mComm = mS * mRate;
            saleMilestones.push({ label: m.label, gap: gap, extraComm: mComm - comm });
        }
    });

    // Build call milestones (only unachieved)
    var callTiers = (cfg.person_call_incentive && cfg.person_call_incentive[nu] && cfg.person_call_incentive[nu].length > 0)
                    ? cfg.person_call_incentive[nu] : (cfg.active_call_incentive || []);
    var callMilestones = [];
    callTiers.slice().sort(function(a,b){return a.min-b.min;}).filter(function(t){return (t.incentive||t.amt||0)>0;}).forEach(function(t) {
        var mC = Math.ceil(callTgt * t.min / 100);
        if (callActual < mC) {
            var cIncAmt = t.incentive||t.amt||0;
            callMilestones.push({ label: t.min+'% (RM '+cIncAmt.toFixed(2)+')', gap: mC - callActual, extraInc: Math.max(0, cIncAmt - callInc) });
        }
    });

    var collTiersXl = collectionIncentiveTiersFor(personName);
    var collMilestones = [];
    collTiersXl.slice().sort(function(a,b){return a.min-b.min;}).filter(function(t){return (t.incentive||t.amt||0)>0;}).forEach(function(t) {
        var mNeed = collTgt * t.min / 100;
        if (collAmt < mNeed) {
            var tierInc = t.incentive||t.amt||0;
            collMilestones.push({ label: t.min+'% (RM '+tierInc.toFixed(2)+')', gap: mNeed - collAmt, extraInc: Math.max(0, tierInc - collInc) });
        }
    });

    var projData = {
        target: target, sales: sales, achievement: ach, commission: comm, commissionRate: commRate,
        callTarget: callTgt, callActual: callActual, callAchievement: callPct, callIncentive: callInc, callProgress: callPct,
        saleMilestones: saleMilestones, callMilestones: callMilestones,
        collectionTarget: collTgt, collectionActual: collAmt, collectionAchievement: collPctAch,
        collectionIncentive: collInc, collectionProgress: collPctAch, collMilestones: collMilestones
    };

    showToast('⏳', 'Opening Excel...');
    window.electronAPI.exportProjectionExcel({ personName: personName, month: month, year: selectedYear, projData: projData })
        .then(function(result) {
            if (result.success) showToast('✅', 'Excel opened!');
            else showToast('❌', 'Failed: ' + (result.error||''));
        })
        .catch(function(e) { showToast('❌', e.message); });
}
window.printProjectionExcel = printProjectionExcel;

// ==================== Global Function Export ====================

window.initApp = initApp;
window.switchView = switchView;
// ==================== Payslip Preview Modal ====================
function showPayslipPreview(index) {
    var person = window.appState.salespeople[index];
    if (!person || !person.name) {
        showToast('⚠️', 'Please select a name first');
        return;
    }

    var config  = window.appState.config;
    var nameUpper = person.name.toUpperCase();
    var month   = ((document.getElementById('report-month')||{}).value || '').toUpperCase() || 'CURRENT';
    var empType = getEmployeeType(person.name);

    // Salary & allowances
    var salary     = config.base_salaries?.[nameUpper] || 0;
    var allowances = config.allowances?.[nameUpper] || {};
    var epfRate    = config.deductionRates?.[nameUpper]?.EPF_RATE || 11;

    var allowList  = [
        ['HP',               allowances.HP               || 0],
        ['Car',              allowances.CAR              || 0],
        ['Local Fuel',       allowances['LOCAL FUEL']    || 0],
        ['Outstation Fuel',  allowances['OUTSTATION FUEL']|| 0],
        ['Housing',          allowances.HOUSING          || 0],
        ['Food',             allowances.FOOD             || 0],
        ['Others',           allowances.OTHERS           || 0],
    ];
    var totalAllow = allowList.reduce(function(s,a){return s+a[1];}, 0);
    var totalFixed = salary + totalAllow;

    // Commission & incentives
    var commission  = person.commission          || 0;
    var collBonus   = person.collectionIncentive || 0;
    var callBonus   = person.activeCallIncentive || 0;
    var qtrBonus    = person.quarterlyBonus      || 0;
    var totalComm   = commission + collBonus + callBonus + qtrBonus;

    // EPF & grand total — follows the statutory Third Schedule
    var totalIncome = totalFixed + totalComm;
    var _ppYear = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var _ppEpf  = (typeof computeEpf === 'function') ? computeEpf(person.name, totalIncome, month, _ppYear) : { employee: Math.round(totalIncome*(epfRate/100)*100)/100, empPct: epfRate };
    var epfAmt      = Math.round(_ppEpf.employee * 100) / 100;
    epfRate         = (_ppEpf.empPct != null) ? _ppEpf.empPct.toFixed(1) : epfRate;
    var _ppSocso = (typeof computeSocso === 'function') ? computeSocso(person.name, totalIncome, month, _ppYear) : { employee: 0 };
    var socsoAmt    = Math.round(_ppSocso.employee * 100) / 100;
    var _ppEis  = (typeof computeEis === 'function') ? computeEis(person.name, totalIncome, month, _ppYear) : { employee: 0 };
    var eisAmt      = Math.round(_ppEis.employee * 100) / 100;
    var grandTotal  = totalIncome - epfAmt - socsoAmt - eisAmt;

    var fmt = function(n) { return 'RM ' + parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); };

    // Build allowance rows (only non-zero)
    var allowRows = allowList.filter(function(a){return a[1]>0;}).map(function(a){
        return '<tr><td style="padding:6px 12px;color:#6b7280;">'+a[0]+'</td><td style="padding:6px 12px;text-align:right;">'+fmt(a[1])+'</td></tr>';
    }).join('');
    if (!allowRows) allowRows = '<tr><td colspan="2" style="padding:6px 12px;color:#9ca3af;font-style:italic;">No allowances</td></tr>';

    // Build incentive rows based on type
    var incentiveRows = '';
    var sectionTitle = '';
    var totalLabel = '';
    if (empType === 'Sales') {
        sectionTitle = 'COMMISSION & INCENTIVES';
        totalLabel = 'Total Commission';
        incentiveRows = '<tr style="background:#f9fafb;">'
            +'<td style="padding:6px 12px 6px 24px;">Commission ('+(person.achievement?person.achievement.toFixed(2)+'%':'—')+')</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(commission)+'</td></tr>'
            +'<tr><td style="padding:6px 12px 6px 24px;">Collection Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(collBonus)+'</td></tr>'
            +'<tr style="background:#f9fafb;"><td style="padding:6px 12px 6px 24px;">Active Call Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(callBonus)+'</td></tr>'
            +'<tr><td style="padding:6px 12px 6px 24px;">Quarterly Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(qtrBonus)+'</td></tr>';
    } else if (empType === 'Supervisor') {
        sectionTitle = 'INCENTIVES';
        totalLabel = 'Total Incentive';
        incentiveRows = '<tr style="background:#f9fafb;">'
            +'<td style="padding:6px 12px 6px 24px;">Sale Incentive ('+(person.achievement?person.achievement.toFixed(2)+'%':'—')+' team)</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(commission)+'</td></tr>'
            +'<tr><td style="padding:6px 12px 6px 24px;">Collection Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(collBonus)+'</td></tr>'
            +'<tr style="background:#f9fafb;"><td style="padding:6px 12px 6px 24px;">Active Call Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(callBonus)+'</td></tr>'
            +'<tr><td style="padding:6px 12px 6px 24px;">Quarterly Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(qtrBonus)+'</td></tr>';
    } else if (empType === 'Support Staff') {
        sectionTitle = 'INCENTIVES';
        totalLabel = 'Total Incentive';
        incentiveRows = '<tr style="background:#f9fafb;">'
            +'<td style="padding:6px 12px 6px 24px;">Block Incentive</td>'
            +'<td style="padding:6px 24px 6px 12px;text-align:right;">'+fmt(collBonus)+'</td></tr>';
    }

    var existing = document.getElementById('payslip-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'payslip-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';

    modal.innerHTML = `
        <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,0.3);">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:20px 24px;color:#fff;flex-shrink:0;">
                <div style="font-size:18px;font-weight:700;">📄 Payslip Preview</div>
                <div style="font-size:13px;margin-top:4px;opacity:0.85;">${person.name} — ${month}</div>
            </div>

            <!-- Body -->
            <div style="overflow-y:auto;flex:1;padding:0;">

                <!-- Salary & Allowances -->
                <div style="padding:16px 24px 0;">
                    <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:8px;">SALARY & ALLOWANCES</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr style="background:#f9fafb;">
                        <td style="padding:6px 12px 6px 24px;font-weight:600;">Base Salary</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;font-weight:600;">${fmt(salary)}</td>
                    </tr>
                    ${allowRows.replace(/padding:6px 12px/g,'padding:6px 12px 6px 24px')}
                    <tr style="background:#eff6ff;border-top:2px solid #bfdbfe;">
                        <td style="padding:8px 12px 8px 24px;font-weight:700;color:#1d4ed8;">Total Fixed Income</td>
                        <td style="padding:8px 24px 8px 12px;text-align:right;font-weight:700;color:#1d4ed8;">${fmt(totalFixed)}</td>
                    </tr>
                </table>

                <!-- Commission & Incentives -->
                <div style="padding:16px 24px 0;margin-top:8px;">
                    <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:8px;">${sectionTitle}</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    ${incentiveRows}
                    <tr style="background:#f0fdf4;border-top:2px solid #bbf7d0;">
                        <td style="padding:8px 12px 8px 24px;font-weight:700;color:#15803d;">${totalLabel}</td>
                        <td style="padding:8px 24px 8px 12px;text-align:right;font-weight:700;color:#15803d;">${fmt(totalComm)}</td>
                    </tr>
                </table>

                <!-- Deductions & Grand Total -->
                <div style="padding:16px 24px 0;margin-top:8px;">
                    <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:8px;">DEDUCTIONS</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr style="background:#fef2f2;">
                        <td style="padding:6px 12px 6px 24px;color:#dc2626;">EPF (${epfRate}%)</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;color:#dc2626;">— ${fmt(epfAmt)}</td>
                    </tr>
                    ${socsoAmt > 0 ? `<tr style="background:#fef2f2;">
                        <td style="padding:6px 12px 6px 24px;color:#dc2626;">SOCSO (0.5%)</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;color:#dc2626;">— ${fmt(socsoAmt)}</td>
                    </tr>` : ''}
                    ${eisAmt > 0 ? `<tr style="background:#fef2f2;">
                        <td style="padding:6px 12px 6px 24px;color:#dc2626;">EIS (0.2%)</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;color:#dc2626;">— ${fmt(eisAmt)}</td>
                    </tr>` : ''}
                </table>

                <!-- Grand Total -->
                <div style="margin:12px 16px 16px;background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="color:#c7d2fe;font-size:13px;font-weight:600;">GRAND TOTAL PAYABLE</div>
                    <div style="color:#fff;font-size:20px;font-weight:700;">${fmt(grandTotal)}</div>
                </div>
            </div>

            <!-- Footer -->
            <div style="padding:12px 24px;border-top:1px solid #f3f4f6;text-align:right;flex-shrink:0;">
                <button onclick="document.getElementById('payslip-modal').remove()" 
                        style="padding:8px 24px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer;font-size:14px;font-weight:500;">
                    Close
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
}

window.showPayslipPreview = showPayslipPreview;


function exportHistoryToExcel(index) {
    const report = (window.appState.config.reportHistory || [])[index];
    if (!report) return;
    const people = report.data || [];
    const month  = report.month || '';
    // Build salespeople array with commission calculated
    const salespeople = people.map(p => {
        const comm = calculateCommission(p.sales||0, p.target||0, p.name);
        const collAch = p.collectionTarget>0?(p.collectionAmount||0)/p.collectionTarget*100:0;
        const callAch = p.callTarget>0?(p.callActual||0)/p.callTarget*100:0;
        const coll = calculateIncentive(collAch, collectionIncentiveTiersFor(p.name));
        const call = calculateIncentive(callAch, activeCallIncentiveTiersFor(p.name));
        return Object.assign({}, p, {
            commission: comm, collectionIncentive: coll, activeCallIncentive: call,
            quarterlyBonus: 0, totalCommission: comm+coll+call,
            achievement: p.target>0?(p.sales||0)/p.target*100:0
        });
    });
    window.electronAPI.generateSalaryTemplate({
        salespeople: salespeople,
        config: window.appState.config,
        month: month,
        suggestedFilename: 'Commission_' + month + '.xlsx'
    }).then(r => {
        if (r.success) showToast('✅', month + ' exported!');
        else showToast('❌', r.error || 'Export failed');
    }).catch(e => showToast('❌', e.message));
}

function printHistoryReport(index) {
    var report = (window.appState.config.reportHistory || [])[index];
    if (!report) return;
    var people = report.data || [];
    var month = (report.month || '').toUpperCase();
    var cfg = window.appState.config;
    var isQtr = ['MAR','JUN','SEP','DEC'].indexOf(month) !== -1;

    // Compute team totals for Supervisor
    var teamS=0, teamT=0, teamCo=0, teamCoT=0, teamCa=0, teamCaT=0;
    people.forEach(function(tp) {
        if ((typeof getEmployeeType === 'function' ? getEmployeeType(tp.name) : 'Sales') !== 'Sales') return;
        teamS += parseFloat(tp.sales)||0; teamT += parseFloat(tp.target)||0;
        teamCo += parseFloat(tp.collectionAmount)||0; teamCoT += parseFloat(tp.collectionTarget)||0;
        teamCa += parseFloat(tp.callActual)||0; teamCaT += parseFloat(tp.callTarget)||0;
    });
    var teamAch = teamT>0?(teamS/teamT*100):0;
    var teamCollAch = teamCoT>0?(teamCo/teamCoT*100):0;
    var teamCallAch = teamCaT>0?(teamCa/teamCaT*100):0;

    var html = '';
    people.forEach(function(p) {
        var name = (p.name || '').toUpperCase();
        var empType = (typeof getEmployeeType === 'function') ? getEmployeeType(name) : 'Sales';
        var salary = (cfg.base_salaries && cfg.base_salaries[name]) || 0;
        var allowances = cfg.allowances && cfg.allowances[name] ? Object.values(cfg.allowances[name]).reduce(function(s,v){return s+(parseFloat(v)||0);},0) : 0;
        var totalFixed = salary + allowances;
        var epfRate = (cfg.deductionRates && cfg.deductionRates[name] && cfg.deductionRates[name].EPF_RATE) || 11;

        var comm = 0, collI = 0, callI = 0, qtrI = 0, totalComm = 0;
        var detailRows = '';
        var typeLabel = '';

        if (empType === 'Sales') {
            var sales = parseFloat(p.sales) || 0;
            var target = parseFloat(p.target) || 0;
            var ach = target > 0 ? (sales / target * 100) : 0;
            comm = calculateCommission(sales, target, name);
            var collAch = (p.collectionTarget||0) > 0 ? (p.collectionAmount||0) / p.collectionTarget * 100 : 0;
            var callAch = (p.callTarget||0) > 0 ? (p.callActual||0) / p.callTarget * 100 : 0;
            collI = calculateIncentive(collAch, collectionIncentiveTiersFor(name));
            callI = calculateIncentive(callAch, activeCallIncentiveTiersFor(name));
            qtrI = isQtr ? calculateIncentive(ach, quarterlyIncentiveTiersFor(name)) : 0;
            totalComm = comm + collI + callI + qtrI;

            detailRows = '<tr style="background:#f1f5f9;"><td style="padding:6px 10px;font-weight:600;">Target</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(target)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;font-weight:600;">Sales</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(sales)+'</td></tr>'
                +'<tr style="background:#f1f5f9;"><td style="padding:6px 10px;font-weight:600;">Achievement</td><td style="padding:6px 10px;text-align:right;color:'+(ach>=100?'#059669':'#d97706')+';">'+ach.toFixed(2)+'%</td></tr>'
                +'<tr><td style="padding:6px 10px;">Salary</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(salary)+'</td></tr>'
                +'<tr style="background:#f1f5f9;"><td style="padding:6px 10px;">Allowances</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(allowances)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;font-weight:600;">Total Fixed Income</td><td style="padding:6px 10px;text-align:right;font-weight:600;">'+formatCurrency(totalFixed)+'</td></tr>'
                +'<tr style="background:#eff6ff;"><td style="padding:6px 10px;">Commission</td><td style="padding:6px 10px;text-align:right;color:#2563eb;">'+formatCurrency(comm)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;">Collection Incentive</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(collI)+'</td></tr>'
                +'<tr style="background:#eff6ff;"><td style="padding:6px 10px;">Active Call Incentive</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(callI)+'</td></tr>'
                +(isQtr?'<tr><td style="padding:6px 10px;">Quarterly Incentive</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(qtrI)+'</td></tr>':'')
                +'<tr style="background:#dcfce7;"><td style="padding:6px 10px;font-weight:700;">Total Commission</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#059669;">'+formatCurrency(totalComm)+'</td></tr>';
        } else if (empType === 'Supervisor') {
            typeLabel = ' 👔 Supervisor';
            var saleT = (cfg.person_supervisor_sale_tiers&&cfg.person_supervisor_sale_tiers[p.name])||cfg.supervisor_sale_tiers||[];
            var collT = (cfg.person_supervisor_coll_tiers&&cfg.person_supervisor_coll_tiers[p.name])||cfg.supervisor_coll_tiers||[];
            var callT = (cfg.person_supervisor_call_tiers&&cfg.person_supervisor_call_tiers[p.name])||cfg.supervisor_call_tiers||[];
            var qtrT  = (cfg.person_supervisor_qtr_tiers&&cfg.person_supervisor_qtr_tiers[p.name])||cfg.supervisor_qtr_tiers||[];
            comm = getTierAmt(saleT, teamAch);
            collI = getTierAmt(collT, teamCollAch);
            callI = getTierAmt(callT, teamCallAch);
            qtrI = isQtr ? getTierAmt(qtrT, teamAch) : 0;
            totalComm = comm + collI + callI + qtrI;

            detailRows = '<tr style="background:#f1f5f9;"><td style="padding:6px 10px;font-weight:600;">Team Achievement</td><td style="padding:6px 10px;text-align:right;color:'+(teamAch>=100?'#059669':'#d97706')+';">'+teamAch.toFixed(2)+'%</td></tr>'
                +'<tr><td style="padding:6px 10px;">Salary</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(salary)+'</td></tr>'
                +'<tr style="background:#f1f5f9;"><td style="padding:6px 10px;">Allowances</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(allowances)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;font-weight:600;">Total Fixed Income</td><td style="padding:6px 10px;text-align:right;font-weight:600;">'+formatCurrency(totalFixed)+'</td></tr>'
                +'<tr style="background:#f3e8ff;"><td style="padding:6px 10px;">Sale Incentive</td><td style="padding:6px 10px;text-align:right;color:#7c3aed;">'+formatCurrency(comm)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;">Collection Incentive</td><td style="padding:6px 10px;text-align:right;color:#7c3aed;">'+formatCurrency(collI)+'</td></tr>'
                +'<tr style="background:#f3e8ff;"><td style="padding:6px 10px;">Call Incentive</td><td style="padding:6px 10px;text-align:right;color:#7c3aed;">'+formatCurrency(callI)+'</td></tr>'
                +(isQtr?'<tr><td style="padding:6px 10px;">Quarterly Incentive</td><td style="padding:6px 10px;text-align:right;color:#7c3aed;">'+formatCurrency(qtrI)+'</td></tr>':'')
                +'<tr style="background:#dcfce7;"><td style="padding:6px 10px;font-weight:700;">Total Incentive</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#7c3aed;">'+formatCurrency(totalComm)+'</td></tr>';
        } else if (empType === 'Support Staff') {
            typeLabel = ' 🛠️ Support Staff';
            var blocks = parseFloat(p.collectionAmount)||0;
            var rate = (cfg.person_merchandiser_rates&&cfg.person_merchandiser_rates[p.name]!=null)
                ? parseFloat(cfg.person_merchandiser_rates[p.name])
                : (parseFloat(cfg.merchandiser_block_rate)||10);
            totalComm = blocks * rate;

            detailRows = '<tr><td style="padding:6px 10px;">Salary</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(salary)+'</td></tr>'
                +'<tr style="background:#f1f5f9;"><td style="padding:6px 10px;">Allowances</td><td style="padding:6px 10px;text-align:right;">'+formatCurrency(allowances)+'</td></tr>'
                +'<tr><td style="padding:6px 10px;font-weight:600;">Total Fixed Income</td><td style="padding:6px 10px;text-align:right;font-weight:600;">'+formatCurrency(totalFixed)+'</td></tr>'
                +'<tr style="background:#fef3c7;"><td style="padding:6px 10px;">Blocks</td><td style="padding:6px 10px;text-align:right;">'+blocks+'</td></tr>'
                +'<tr><td style="padding:6px 10px;">Block Incentive</td><td style="padding:6px 10px;text-align:right;color:#d97706;">'+formatCurrency(totalComm)+'</td></tr>'
                +'<tr style="background:#dcfce7;"><td style="padding:6px 10px;font-weight:700;">Total Incentive</td><td style="padding:6px 10px;text-align:right;font-weight:700;color:#d97706;">'+formatCurrency(totalComm)+'</td></tr>';
        }

        var totalIncome = totalFixed + totalComm;
        var _phBareM = (typeof bareMonth === 'function') ? bareMonth(report.month) : month;
        var _phYear  = (typeof keyYear === 'function') ? (keyYear(report.month) || new Date().getFullYear()) : new Date().getFullYear();
        var _phEpf   = (typeof computeEpf === 'function') ? computeEpf(name, totalIncome, _phBareM, _phYear) : { employee: totalIncome*epfRate/100, empPct: epfRate };
        var epf = _phEpf.employee;
        var epfPctLabel = (_phEpf.empPct != null) ? _phEpf.empPct.toFixed(1) : epfRate;
        var _phSocso = (typeof computeSocso === 'function') ? computeSocso(name, totalIncome, _phBareM, _phYear) : { employee: 0 };
        var socso = _phSocso.employee;
        var _phEis = (typeof computeEis === 'function') ? computeEis(name, totalIncome, _phBareM, _phYear) : { employee: 0 };
        var eis = _phEis.employee;
        var grandTotal = totalIncome - epf - socso - eis;

        html += '<div style="page-break-inside:avoid;border:1px solid #ccc;border-radius:8px;padding:16px;margin-bottom:16px;">';
        html += '<h3 style="margin:0 0 10px;font-size:16px;color:#0f172a;">'+name+typeLabel+' — '+month+' 2026</h3>';
        html += '<table style="width:100%;font-size:12px;border-collapse:collapse;">';
        html += detailRows;
        html += '<tr><td style="padding:6px 10px;color:#dc2626;">EPF '+epfPctLabel+'%</td><td style="padding:6px 10px;text-align:right;color:#dc2626;">- '+formatCurrency(epf)+'</td></tr>';
        if (socso > 0) html += '<tr><td style="padding:6px 10px;color:#dc2626;">SOCSO 0.5%</td><td style="padding:6px 10px;text-align:right;color:#dc2626;">- '+formatCurrency(socso)+'</td></tr>';
        if (eis > 0) html += '<tr><td style="padding:6px 10px;color:#dc2626;">EIS 0.2%</td><td style="padding:6px 10px;text-align:right;color:#dc2626;">- '+formatCurrency(eis)+'</td></tr>';
        html += '<tr style="background:#0f172a;color:#fff;"><td style="padding:8px 10px;font-weight:700;">Grand Total Payable</td><td style="padding:8px 10px;text-align:right;font-weight:800;font-size:14px;color:#fbbf24;">'+formatCurrency(grandTotal)+'</td></tr>';
        html += '</table></div>';
    });

    var win = window.open('', '_blank');
    win.document.write('<html><head><title>'+month+' Report</title>');
    win.document.write('<style>body{font-family:Sora,sans-serif;padding:20px;max-width:800px;margin:0 auto;}h2{font-size:20px;margin-bottom:16px;}</style></head><body>');
    win.document.write('<h2>Commission Report — '+month+' 2026</h2>');
    win.document.write(html);
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function(){ win.print(); }, 300);
}

window.exportHistoryToExcel = exportHistoryToExcel;
window.printHistoryReport   = printHistoryReport;

function manualSave() {
    var month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var year = ((document.getElementById('report-year')||{}).value||'') || String(new Date().getFullYear());
    var monthKey = month ? month + '-' + year : '';
    if (!month) { showToast('⚠️', 'Please select a month first'); return; }

    // Update all card data from DOM inputs
    window.appState.salespeople.forEach(function(p, idx) { updateSalespersonData(idx); });

    var snapshot = {
        month: month,
        year: year,
        salespeople: window.appState.salespeople.map(function(p){ return Object.assign({},p); })
    };
    window.appState.config.quickCalculateData = snapshot;

    // Sync current salespeople into reportHistory for this month
    if (!window.appState.config.reportHistory) window.appState.config.reportHistory = [];
    var validPeople = window.appState.salespeople.filter(function(p){ return p.name && (p.target > 0 || p.sales > 0); });
    if (validPeople.length > 0) {
        var existIdx = window.appState.config.reportHistory.findIndex(function(r){ return (r.month||'').toUpperCase() === monthKey; });
        var histData = validPeople.map(function(p) {
            return {
                name:             (p.name||'').toUpperCase(),
                target:           p.target           || 0,
                sales:            p.sales            || 0,
                collectionTarget: p.collectionTarget  || 0,
                collectionAmount: p.collectionAmount  || 0,
                callTarget:       p.callTarget        || 0,
                callActual:       p.callActual        || 0
            };
        });
        if (existIdx >= 0) {
            // Merge: update existing entries, add new ones
            histData.forEach(function(entry) {
                var pi = window.appState.config.reportHistory[existIdx].data.findIndex(function(d){ return (d.name||'').toUpperCase() === entry.name; });
                if (pi >= 0) window.appState.config.reportHistory[existIdx].data[pi] = entry;
                else window.appState.config.reportHistory[existIdx].data.push(entry);
            });
        } else {
            window.appState.config.reportHistory.push({ month: monthKey, data: histData });
        }
    }

    // Save to SQLite DB
    dbSave('quickCalculateData', snapshot);
    dbSave('reportHistory', window.appState.config.reportHistory);

    // Refresh history if visible
    if (document.getElementById('history-list')) loadQuickCalculateHistory();

    var savedPerson = window.appState.salespeople[0];
    var openProjection = savedPerson && savedPerson.name && getEmployeeType(savedPerson.name) === 'Sales';

    function afterSaved() {
        if (openProjection && typeof showProjectionFullscreenModal === 'function') {
            showProjectionFullscreenModal();
        }
    }

    window.electronAPI.saveConfig(window.appState.config).then(function(r){
        if(r && r.success) {
            showToast('✅', 'Saved!');
            afterSaved();
        } else {
            showToast('❌', 'Save failed: ' + (r && r.error || 'unknown'));
        }
    }).catch(function(e){ showToast('❌', e.message); });
}
window.manualSave = manualSave;


// ==================== People Tab ====================
function renderPeopleList() {
    var container = document.getElementById('people-list-container');
    if (!container) return;
    // Ensure config is loaded
    if (!window.appState || !window.appState.config) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:var(--ink4);">Loading...</div>';
        setTimeout(renderPeopleList, 500);
        return;
    }
    var cfg = window.appState.config;
    var people = Object.keys(cfg.base_salaries || {});
    if (people.length === 0) {
        container.innerHTML = '<div class="empty-state">'
            + '<div class="empty-state-icon">👥</div>'
            + '<div class="empty-state-title">No salespeople yet</div>'
            + '<div class="empty-state-sub">Add a person above to get started</div></div>';
        return;
    }
    container.innerHTML = '';
    people.forEach(function(name, i) {
        var salary = window.appState.config.base_salaries[name] || 0;
        var allow  = window.appState.config.allowances[name] || {};
        var totalAllow = Object.values(allow).reduce(function(s,v){return s+(parseFloat(v)||0);},0);
        var hasPersonal = window.appState.config.person_commission_rates && window.appState.config.person_commission_rates[name];
        var empType = getEmployeeType(name);
        var tc = getRoleBadgeStyle(empType);
        var active = (typeof isEmployeeActive === 'function') ? isEmployeeActive(name) : true;
        var item = document.createElement('div');
        item.className = 'people-list-row';
        item.setAttribute('data-type', empType);
        item.style.cssText = 'background:linear-gradient(90deg,'+tc.bg+' 0%,var(--paper) 40%);border-left:3px solid '+tc.c+';';
        if (!active) { item.style.opacity = '0.55'; item.style.filter = 'grayscale(0.6)'; }
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-name', name);
        item.innerHTML =
            '<div class="pi-drag" title="Drag to reorder">⠿</div>'
            + '<div class="pi-avatar" style="background:'+tc.bg+';color:'+tc.c+';">'+name[0]+'</div>'
            + '<div class="pi-main">'
            + '<div class="pi-name-row">'
            + '<div class="pi-name" style="color:'+tc.c+';">'+name+'</div>'
            + '<span class="pi-badge" style="background:'+tc.bg+';color:'+tc.c+';">'+tc.icon+' '+empType+'</span>'
            + (active
                ? '<span class="pi-badge" style="background:#dcfce7;color:#166534;">● Active</span>'
                : '<span class="pi-badge" style="background:#fee2e2;color:#b91c1c;">○ Inactive</span>')
            + '</div>'
            + '<div class="pi-meta">'
            + 'Base: RM '+salary.toLocaleString()+' · Allowances: RM '+totalAllow.toLocaleString()
            + (cfg.salary_history&&cfg.salary_history[name]&&cfg.salary_history[name].length>1
                ? ' · <span style="color:var(--am);font-size:9px;font-weight:700;">'+cfg.salary_history[name].length+' salary records</span>'
                : '')
            + ' · '
            + (hasPersonal
                ? '<span class="pi-badge" style="background:var(--vi-l);color:var(--vi);border-radius:20px;">✦ Personal</span>'
                : '<span class="pi-badge" style="background:var(--sheet);color:var(--ink4);border:1px solid var(--line);border-radius:20px;">Company Rate</span>')
            + '</div></div>'
            + '<select id="type-select-'+i+'" class="filter-select">'
            + '<option value="Sales"'+(empType==='Sales'?' selected':'')+'>💼 Sales</option>'
            + '<option value="Supervisor"'+(empType==='Supervisor'?' selected':'')+'>👔 Supervisor</option>'
            + '<option value="Support Staff"'+(empType==='Support Staff'?' selected':'')+'>🛠️ Support Staff</option>'
            + '</select>'
            + (function(){
                var companies = (window.appState.config.companies || []);
                if (companies.length === 0) return '';
                var empCompany = getEmployeeCompany(name);
                var opts = '<option value=""'+(empCompany===''?' selected':'')+'>— No Company —</option>';
                companies.forEach(function(c){ opts += '<option value="'+c+'"'+(empCompany===c?' selected':'')+'>🏢 '+c+'</option>'; });
                return '<select id="company-select-'+i+'" class="filter-select">'+opts+'</select>';
            })()
            + '<div class="pi-btns" id="pi-btns-'+i+'"></div>';
        container.appendChild(item);
        var typeSel = item.querySelector('#type-select-'+i);
        if (typeSel) typeSel.addEventListener('change', (function(n){ return function(e){ setEmployeeType(n, e.target.value); renderPeopleList(); showToast('✅', n+' type changed to '+e.target.value); };})(name));
        var companySel = item.querySelector('#company-select-'+i);
        if (companySel) companySel.addEventListener('change', (function(n){ return function(e){ setEmployeeCompany(n, e.target.value); renderPeopleList(); showToast('✅', n+' assigned to '+(e.target.value||'no company')); };})(name));
        var btns = item.querySelector('#pi-btns-'+i);

        // Salary always first
        var bS = document.createElement('button');
        bS.className = 'pi-btn pi-btn--salary';
        bS.textContent = '💵 Salary';
        bS.addEventListener('click',(function(n){return function(){showSalaryModal(n);};})(name));
        btns.appendChild(bS);

        if (empType === 'Sales') {
            var bC = document.createElement('button');
            bC.className = 'pi-btn pi-btn--comm';
            bC.textContent = '💰 Commission';
            bC.addEventListener('click',(function(n){return function(){showCommissionModal(n);};})(name));
            var bT = document.createElement('button');
            bT.className = 'pi-btn pi-btn--target';
            bT.textContent = '🎯 Target';
            bT.addEventListener('click',(function(n){return function(){showTargetModal(n);};})(name));
            btns.appendChild(bC);
            btns.appendChild(bT);
        } else if (empType === 'Supervisor') {
            var bSI = document.createElement('button');
            bSI.className = 'pi-btn pi-btn--tier';
            bSI.textContent = '👔 Incentive Tiers';
            bSI.addEventListener('click',(function(n){return function(){showSupervisorIncentiveModal(n);};})(name));
            var spacer = document.createElement('div');
            spacer.style.cssText = 'width:110px;';
            btns.appendChild(bSI);
            btns.appendChild(spacer);
        } else if (empType === 'Support Staff') {
            var bMR = document.createElement('button');
            bMR.className = 'pi-btn pi-btn--rate';
            bMR.textContent = '🛠️ Block Rate';
            bMR.addEventListener('click',(function(n){return function(){showMerchandiserRateModal(n);};})(name));
            var spacer2 = document.createElement('div');
            spacer2.style.cssText = 'width:110px;';
            btns.appendChild(bMR);
            btns.appendChild(spacer2);
        }

        var bA = document.createElement('button');
        bA.title = active ? 'Click to mark as resigned / inactive' : 'Click to reactivate';
        bA.className = 'pi-btn ' + (active ? 'pi-btn--active' : 'pi-btn--inactive');
        bA.textContent = active ? '● Active' : '○ Inactive';
        bA.addEventListener('click',(function(n, isActive){ return function(){ requirePeoplePassword((isActive ? 'Set ' : 'Reactivate ') + n + ' \u2014 enter password to continue', function(){ showEmployeeStatusDatePicker(n, isActive); }); };})(name, active));
        btns.appendChild(bA);

        var bD = document.createElement('button');
        bD.className = 'pi-btn pi-btn--del';
        bD.textContent = '🗑️';
        bD.addEventListener('click',(function(n){return function(){ requirePeoplePassword('Delete ' + n + ' \u2014 enter password to continue', function(){ deleteSalespersonConfig(n); }); };})(name));
        btns.appendChild(bD);
    });

    // Drag-to-reorder
    var dragSrc = null;
    Array.from(container.children).forEach(function(el) {
        el.addEventListener('dragstart', function(e) {
            dragSrc = this;
            this.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        });
        el.addEventListener('dragend', function() {
            this.style.opacity = '';
            Array.from(container.children).forEach(function(c){ c.style.background=''; });
        });
        el.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            Array.from(container.children).forEach(function(c){ c.style.background=''; });
            if (this !== dragSrc) this.style.background = '#f0f9ff';
        });
        el.addEventListener('drop', function(e) {
            e.preventDefault();
            if (dragSrc === this) return;
            // Reorder in DOM
            var children = Array.from(container.children);
            var fromIdx = children.indexOf(dragSrc);
            var toIdx = children.indexOf(this);
            if (fromIdx < toIdx) container.insertBefore(dragSrc, this.nextSibling);
            else container.insertBefore(dragSrc, this);
            // Persist new order in base_salaries
            var newOrder = Array.from(container.children).map(function(c){ return c.getAttribute('data-name'); }).filter(Boolean);
            var cfg = window.appState.config;
            var newBS = {};
            newOrder.forEach(function(n){ if(cfg.base_salaries[n]!==undefined) newBS[n]=cfg.base_salaries[n]; });
            // Keep any not shown
            Object.keys(cfg.base_salaries).forEach(function(n){ if(!newBS[n]) newBS[n]=cfg.base_salaries[n]; });
            cfg.base_salaries = newBS;
            saveConfig();
        });
    });
}

function sumAllowancesBag(allow) {
    if (!allow) return 0;
    return Object.values(allow).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0);
}

function formatSalaryEffectiveLabel(ym) {
    if (!ym) return '';
    if (ym === '2000-01') return 'From start';
    var parts = /^(\d{4})-(\d{2})/.exec(ym);
    if (!parts) return ym;
    var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var mo = parseInt(parts[2], 10);
    return (monthOrder[mo - 1] || parts[2]) + ' ' + parts[1];
}

function currentEffectiveYM() {
    var now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function getSortedSalaryHistory(history) {
    return (history || []).slice().sort(function(a, b) {
        return (a.effectiveFrom || '').localeCompare(b.effectiveFrom || '');
    });
}

function getLatestSalaryHistoryEntry(history) {
    var sorted = getSortedSalaryHistory(history);
    return sorted.length ? sorted[sorted.length - 1] : null;
}

function smAllowancesEqual(a, b) {
    var keys = ['HP', 'CAR', 'LOCAL FUEL', 'OUTSTATION FUEL', 'HOUSING', 'FOOD', 'OTHERS'];
    for (var i = 0; i < keys.length; i++) {
        if ((parseFloat((a || {})[keys[i]]) || 0) !== (parseFloat((b || {})[keys[i]]) || 0)) return false;
    }
    return true;
}

function smFormValuesDifferFromEntry(formVals, entry) {
    if (!entry) return true;
    if ((parseFloat(formVals.salary) || 0) !== (parseFloat(entry.salary) || 0)) return true;
    if (!smAllowancesEqual(formVals.allowances, entry.allowances)) return true;
    return false;
}

function smGetHistoryEntry(history, ym) {
    return (history || []).find(function(h) { return h.effectiveFrom === ym; });
}

function smEnsureOriginRecord(personName, history, formVals) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    if (history.length > 0) return;
    var effective = currentEffectiveYM();
    var histReports = cfg.reportHistory || [];
    var hasEarlierReports = histReports.some(function(r) {
        var monthOrder2 = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        var rIdx = monthOrder2.indexOf(bareMonth(r.month));
        var curYr = new Date().getFullYear();
        var rYM = curYr + '-' + String(rIdx + 1).padStart(2, '0');
        return rYM < effective;
    });
    if (hasEarlierReports) {
        var oldSalary = (cfg.base_salaries && cfg.base_salaries[nu]) || formVals.salary;
        var oldAllow = (cfg.allowances && cfg.allowances[nu]) || formVals.allowances;
        var oldEpf = (cfg.deductionRates && cfg.deductionRates[nu] && cfg.deductionRates[nu].EPF_RATE) || formVals.epfRate;
        history.push({ salary: oldSalary, allowances: oldAllow, epfRate: oldEpf, effectiveFrom: '2000-01' });
    }
}

function buildSmInlineStatusHtml(personName, kind) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    var history = (cfg.salary_history && cfg.salary_history[nu]) || [];
    var formVals = smReadFormSalaryValues();
    var monthEl = document.getElementById('sm-record-month');
    var targetYm = (monthEl && monthEl.value) ? monthEl.value : currentEffectiveYM();
    var targetEntry = smGetHistoryEntry(history, targetYm);
    var latest = getLatestSalaryHistoryEntry(history);
    var allowTotal = sumAllowancesBag(formVals.allowances);

    if (kind === 'salary') {
        if (targetEntry) {
            var recSal = parseFloat(targetEntry.salary) || 0;
            var formSal = parseFloat(formVals.salary) || 0;
            if (Math.abs(recSal - formSal) < 0.005) {
                return '<span class="sm-inline-status sm-inline-status--ok">✓ RM ' + recSal.toLocaleString() + ' recorded for ' + formatSalaryEffectiveLabel(targetYm) + '</span>';
            }
            return '<span class="sm-inline-status sm-inline-status--warn">⚠ ' + formatSalaryEffectiveLabel(targetYm) + ' has RM ' + recSal.toLocaleString() + ' — form shows RM ' + formSal.toLocaleString() + '. Click <b>Record change</b>.</span>';
        }
        if (latest) {
            return '<span class="sm-inline-status sm-inline-status--muted">No record for ' + formatSalaryEffectiveLabel(targetYm) + '. Latest: RM ' + (parseFloat(latest.salary) || 0).toLocaleString() + ' from ' + formatSalaryEffectiveLabel(latest.effectiveFrom) + '.</span>';
        }
        return '<span class="sm-inline-status sm-inline-status--warn">⚠ No salary history yet — set amount and click <b>Record change</b>.</span>';
    }

    if (kind === 'allowance') {
        if (targetEntry) {
            var recAllow = sumAllowancesBag(targetEntry.allowances);
            if (Math.abs(recAllow - allowTotal) < 0.005) {
                return '<span class="sm-inline-status sm-inline-status--ok">✓ RM ' + recAllow.toLocaleString() + ' total recorded for ' + formatSalaryEffectiveLabel(targetYm) + '</span>';
            }
            return '<span class="sm-inline-status sm-inline-status--warn">⚠ ' + formatSalaryEffectiveLabel(targetYm) + ' has RM ' + recAllow.toLocaleString() + ' — form total RM ' + allowTotal.toLocaleString() + '. Click <b>Record change</b>.</span>';
        }
        if (latest) {
            var latAllow = sumAllowancesBag(latest.allowances);
            return '<span class="sm-inline-status sm-inline-status--muted">No record for ' + formatSalaryEffectiveLabel(targetYm) + '. Latest total: RM ' + latAllow.toLocaleString() + ' from ' + formatSalaryEffectiveLabel(latest.effectiveFrom) + '.</span>';
        }
        return '<span class="sm-inline-status sm-inline-status--warn">⚠ No allowance history yet — click <b>Record change</b> after editing.</span>';
    }
    return '';
}

function buildSalaryHistoryTableHtml(history) {
    var sorted = getSortedSalaryHistory(history);
    if (!sorted.length) {
        return '<tr><td colspan="4" style="padding:12px;text-align:center;color:var(--ink3);font-size:12px;">No salary records yet. Edit values above and click <b>Record change</b>.</td></tr>';
    }
    var latestYm = sorted[sorted.length - 1].effectiveFrom;
    return sorted.map(function(h) {
        var ym = h.effectiveFrom || '';
        var allowTotal = sumAllowancesBag(h.allowances);
        var isCurrent = ym === latestYm;
        var canDelete = sorted.length > 1;
        return '<tr class="sm-history-row' + (isCurrent ? ' sm-history-row--current' : '') + '" data-ym="' + ym + '">'
            + '<td>' + formatSalaryEffectiveLabel(ym)
            + (isCurrent ? ' <span class="sm-history-current-badge">Current</span>' : '') + '</td>'
            + '<td style="text-align:right;">RM ' + (parseFloat(h.salary) || 0).toLocaleString() + '</td>'
            + '<td style="text-align:right;">RM ' + allowTotal.toLocaleString() + '</td>'
            + '<td style="text-align:center;white-space:nowrap;">'
            + '<button type="button" class="sm-history-edit" data-ym="' + ym + '" title="Load into form">Edit</button>'
            + '<button type="button" class="sm-history-del" data-ym="' + ym + '"' + (canDelete ? '' : ' disabled') + ' title="Delete record">Del</button>'
            + '</td></tr>';
    }).join('');
}

function smReadFormAllowances() {
    return {
        HP: parseFloat((document.getElementById('sm-HP') || {}).value) || 0,
        CAR: parseFloat((document.getElementById('sm-CAR') || {}).value) || 0,
        'LOCAL FUEL': parseFloat((document.getElementById('sm-LOCALFUEL') || {}).value) || 0,
        'OUTSTATION FUEL': parseFloat((document.getElementById('sm-OUTFUEL') || {}).value) || 0,
        HOUSING: parseFloat((document.getElementById('sm-HOUSING') || {}).value) || 0,
        FOOD: parseFloat((document.getElementById('sm-FOOD') || {}).value) || 0,
        OTHERS: parseFloat((document.getElementById('sm-OTHERS') || {}).value) || 0
    };
}

function smReadFormSalaryValues() {
    var _epfEl = document.getElementById('sm-epf');
    return {
        salary: parseFloat((document.getElementById('sm-base') || {}).value) || 1700,
        allowances: smReadFormAllowances(),
        epfRate: _epfEl ? (parseFloat(_epfEl.value) || 11) : 11
    };
}

function smLoadEntryIntoForm(entry) {
    if (!entry) return;
    var baseEl = document.getElementById('sm-base');
    if (baseEl) baseEl.value = entry.salary || 1700;
    var allow = entry.allowances || {};
    ['HP','CAR','LOCALFUEL','OUTFUEL','HOUSING','FOOD','OTHERS'].forEach(function(id) {
        var el = document.getElementById('sm-' + id);
        if (!el) return;
        var key = id === 'LOCALFUEL' ? 'LOCAL FUEL' : (id === 'OUTFUEL' ? 'OUTSTATION FUEL' : id);
        el.value = allow[key] || 0;
    });
}

function smRefreshSalaryModalUI(personName) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    var history = (cfg.salary_history && cfg.salary_history[nu]) || [];
    var tbody = document.getElementById('sm-history-body');
    var salStatus = document.getElementById('sm-salary-status');
    var allowStatus = document.getElementById('sm-allow-status');
    if (tbody) tbody.innerHTML = buildSalaryHistoryTableHtml(history);
    if (salStatus) salStatus.innerHTML = buildSmInlineStatusHtml(personName, 'salary');
    if (allowStatus) allowStatus.innerHTML = buildSmInlineStatusHtml(personName, 'allowance');
    smBindHistoryTableActions(personName);
}

function smBindHistoryTableActions(personName) {
    var tbody = document.getElementById('sm-history-body');
    if (!tbody) return;
    tbody.querySelectorAll('.sm-history-edit').forEach(function(btn) {
        btn.onclick = function() {
            var ym = btn.getAttribute('data-ym');
            var cfg = window.appState.config;
            var nu = (personName || '').toUpperCase();
            var entry = smGetHistoryEntry((cfg.salary_history && cfg.salary_history[nu]) || [], ym);
            if (!entry) return;
            smLoadEntryIntoForm(entry);
            var monthEl = document.getElementById('sm-record-month');
            if (monthEl && ym !== '2000-01') monthEl.value = ym;
            smRefreshSalaryModalUI(personName);
            showToast('✏️', 'Loaded ' + formatSalaryEffectiveLabel(ym) + ' into form');
        };
    });
    tbody.querySelectorAll('.sm-history-del').forEach(function(btn) {
        btn.onclick = function() {
            smDeleteSalaryHistoryEntry(personName, btn.getAttribute('data-ym'));
        };
    });
}

function smRecordSalaryChange(personName, effectiveYm) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    if (!cfg.salary_history) cfg.salary_history = {};
    if (!cfg.salary_history[nu]) cfg.salary_history[nu] = [];
    var history = cfg.salary_history[nu];
    var vals = smReadFormSalaryValues();
    var monthEl = document.getElementById('sm-record-month');
    var effective = effectiveYm || (monthEl && monthEl.value) || currentEffectiveYM();
    if (!effective) effective = currentEffectiveYM();

    smEnsureOriginRecord(personName, history, vals);

    var entry = { salary: vals.salary, allowances: vals.allowances, epfRate: vals.epfRate, effectiveFrom: effective };
    var existingIdx = history.findIndex(function(h) { return h.effectiveFrom === effective; });
    if (existingIdx >= 0) history[existingIdx] = entry;
    else history.push(entry);
    history.sort(function(a, b) { return (a.effectiveFrom || '').localeCompare(b.effectiveFrom || ''); });

    smRefreshSalaryModalUI(personName);
    showToast('✅', 'Recorded from ' + formatSalaryEffectiveLabel(effective));
}

function smDeleteSalaryHistoryEntry(personName, effectiveFrom) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    var history = cfg.salary_history && cfg.salary_history[nu];
    if (!history || history.length <= 1) return;
    var idx = history.findIndex(function(h) { return h.effectiveFrom === effectiveFrom; });
    if (idx < 0) return;
    history.splice(idx, 1);
    var latest = getLatestSalaryHistoryEntry(history);
    if (latest) smLoadEntryIntoForm(latest);
    smRefreshSalaryModalUI(personName);
    showToast('🗑', 'Removed ' + formatSalaryEffectiveLabel(effectiveFrom));
}

function smHasUnrecordedChanges(personName) {
    var cfg = window.appState.config;
    var nu = (personName || '').toUpperCase();
    var history = (cfg.salary_history && cfg.salary_history[nu]) || [];
    if (!history.length) return false;
    var latest = getLatestSalaryHistoryEntry(history);
    return smFormValuesDifferFromEntry(smReadFormSalaryValues(), latest);
}

function smShowSavePrompt(personName, onRecordAndSave) {
    var bar = document.getElementById('sm-save-prompt');
    if (!bar) { onRecordAndSave(); return; }
    var monthEl = document.getElementById('sm-record-month');
    var ym = (monthEl && monthEl.value) ? monthEl.value : currentEffectiveYM();
    bar.innerHTML = '<div class="sm-save-prompt-inner">'
        + '<span>Salary or allowances changed but not recorded for <b>' + formatSalaryEffectiveLabel(ym) + '</b>.</span>'
        + '<div style="display:flex;gap:8px;flex-shrink:0;">'
        + '<button type="button" id="sm-prompt-cancel" class="sm-prompt-btn sm-prompt-btn--ghost">Keep editing</button>'
        + '<button type="button" id="sm-prompt-record" class="sm-prompt-btn sm-prompt-btn--primary">Record &amp; Save</button>'
        + '</div></div>';
    bar.style.display = 'block';
    bar.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    document.getElementById('sm-prompt-cancel').onclick = function() { bar.style.display = 'none'; };
    document.getElementById('sm-prompt-record').onclick = function() {
        bar.style.display = 'none';
        onRecordAndSave(ym);
    };
}

function smHideSavePrompt() {
    var bar = document.getElementById('sm-save-prompt');
    if (bar) bar.style.display = 'none';
}

function smBindSalaryFormListeners(personName) {
    var modal = document.getElementById('salary-setup-modal');
    if (!modal) return;
    var refresh = function() { smRefreshSalaryModalUI(personName); };
    modal.querySelectorAll('#sm-base, #sm-HP, #sm-CAR, #sm-LOCALFUEL, #sm-OUTFUEL, #sm-HOUSING, #sm-FOOD, #sm-OTHERS').forEach(function(el) {
        el.addEventListener('input', refresh);
    });
    var monthEl = document.getElementById('sm-record-month');
    if (monthEl) monthEl.addEventListener('change', refresh);
}

function showSalaryModal(personName) {
    var ex=document.getElementById('salary-setup-modal'); if(ex)ex.remove();
    var cfg=window.appState.config;
    // Get current salary from history or flat values
    var cur = (typeof getCurrentSalary === 'function') ? getCurrentSalary(personName) : {
        salary: (window.appState.config.base_salaries && window.appState.config.base_salaries[personName]) || 1700,
        allowances: (window.appState.config.allowances && window.appState.config.allowances[personName]) || {},
        epfRate: (window.appState.config.deductionRates && window.appState.config.deductionRates[personName] && window.appState.config.deductionRates[personName].EPF_RATE) || 11
    };
    var salary   = cur.salary;
    var allow    = cur.allowances;
    var epfRate  = cur.epfRate;
    var employerEpfRate = (window.appState.config.employer_epf_rates && window.appState.config.employer_epf_rates[personName]) || 13;
    var empDob = (typeof getEmployeeDOB === 'function') ? getEmployeeDOB(personName) : '';
    var empNat = (typeof getEmployeeNationality === 'function') ? getEmployeeNationality(personName) : 'CITIZEN';
    var empProfile = (typeof getEmployeeProfile === 'function') ? getEmployeeProfile(personName) : { mykad: '', epfNo: '', bankAccount: '' };
    function natOpt(v,l){ return '<option value="'+v+'"'+(empNat===v?' selected':'')+'>'+l+'</option>'; }
    var history = (window.appState.config.salary_history && window.appState.config.salary_history[personName]) || [];
    var recordMonthDefault = currentEffectiveYM();
    var IS='width:100%;padding:9px 12px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-family:Sora,sans-serif;outline:none;background:var(--paper);color:var(--ink);box-sizing:border-box;';
    function makeRow(lbl,id,val,half){
        return '<div style="'+(half?'':'')+'margin-bottom:10px;">'
            +'<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;">'+lbl+'</label>'
            +'<input id="sm-'+id+'" type="number" value="'+val+'" style="'+IS+'"></div>';
    }
    function makeSectionTitle(title) {
        return '<div style="font-size:10px;font-weight:700;color:inherit;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">'+title+'</div>';
    }
    function makeTextRow(lbl, id, val) {
        return '<div style="margin-bottom:10px;">'
            +'<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;">'+lbl+'</label>'
            +'<input id="sm-'+id+'" type="text" value="'+(val||'').replace(/"/g,'&quot;')+'" style="'+IS+'"></div>';
    }
    var modal=document.createElement('div');
    modal.id='salary-setup-modal';
    modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
    var card=document.createElement('div');
    card.style.cssText='background:var(--paper);border-radius:16px;max-width:560px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(8,15,26,.25);';
    card.addEventListener('click',function(e){e.stopPropagation();});
    card.innerHTML=
        '<div style="background:linear-gradient(135deg,#0f172a,#1e40af);padding:20px 24px;color:#fff;flex-shrink:0;">'
        +'<div style="font-size:17px;font-weight:800;letter-spacing:-.3px;">💵 Salary Setup</div>'
        +'<div style="font-size:12px;opacity:.6;margin-top:3px;">'+personName+'</div></div>'
        +'<div style="padding:20px 24px;overflow-y:auto;flex:1;">'
        +'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:var(--r);padding:14px;margin-bottom:14px;">'
        +'<div style="font-size:10px;font-weight:700;color:#334155;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Employee Details</div>'
        +makeTextRow('MyKad No / Passport No','mykad',empProfile.mykad)
        +makeTextRow('EPF Number','epfno',empProfile.epfNo)
        +makeTextRow('Bank Account Number','bank',empProfile.bankAccount)
        +'</div>'
        +'<style>'
        +'.sm-inline-status{display:block;font-size:11px;line-height:1.45;margin-top:6px;}'
        +'.sm-inline-status--ok{color:#059669;}'
        +'.sm-inline-status--warn{color:#d97706;}'
        +'.sm-inline-status--muted{color:var(--ink3);}'
        +'.sm-history-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;}'
        +'.sm-history-table th,.sm-history-table td{padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:middle;}'
        +'.sm-history-table th{font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.6px;text-align:left;}'
        +'.sm-history-row--current{background:#f0fdf4;}'
        +'.sm-history-current-badge{display:inline-block;margin-left:4px;padding:1px 6px;border-radius:999px;font-size:9px;font-weight:700;background:#dcfce7;color:#166534;}'
        +'.sm-history-edit,.sm-history-del{padding:3px 8px;border-radius:5px;border:1px solid var(--line);background:var(--paper);cursor:pointer;font-size:11px;font-family:Sora,sans-serif;margin:0 2px;}'
        +'.sm-history-del{color:#b91c1c;border-color:#fecaca;}'
        +'.sm-history-del:disabled{opacity:.35;cursor:not-allowed;}'
        +'.sm-record-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line);}'
        +'.sm-record-bar label{font-size:10px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.6px;}'
        +'.sm-record-bar input[type=month]{padding:7px 10px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-family:Sora,sans-serif;background:var(--paper);}'
        +'#sm-record-btn{padding:8px 16px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:12px;font-weight:700;font-family:Sora,sans-serif;}'
        +'.sm-save-prompt-inner{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:var(--r);font-size:12px;color:#92400e;}'
        +'.sm-prompt-btn{padding:7px 14px;border-radius:var(--r);font-size:12px;font-weight:600;font-family:Sora,sans-serif;cursor:pointer;}'
        +'.sm-prompt-btn--ghost{border:1.5px solid var(--line);background:var(--paper);color:var(--ink);}'
        +'.sm-prompt-btn--primary{border:none;background:#0f172a;color:#fff;}'
        +'</style>'
        +'<div style="background:var(--em-l);border:1px solid #a7f3d0;border-radius:var(--r);padding:14px;margin-bottom:14px;color:#065f46;">'
        +makeSectionTitle('Base Salary')
        +makeRow('Base Salary (RM)','base',salary)
        +'<div id="sm-salary-status"></div></div>'
        +'<div style="background:var(--blue-l);border:1px solid #bae6fd;border-radius:var(--r);padding:14px;margin-bottom:14px;color:#075985;">'
        +makeSectionTitle('Allowances (RM)')
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +makeRow('HP','HP',allow.HP||0,true)+makeRow('Car','CAR',allow.CAR||0,true)
        +makeRow('Local Fuel','LOCALFUEL',allow['LOCAL FUEL']||0,true)+makeRow('Outstation Fuel','OUTFUEL',allow['OUTSTATION FUEL']||0,true)
        +makeRow('Housing','HOUSING',allow.HOUSING||0,true)+makeRow('Food','FOOD',allow.FOOD||0,true)
        +'</div>'+makeRow('Others','OTHERS',allow.OTHERS||0)
        +'<div id="sm-allow-status"></div></div>'
        +'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:var(--r);padding:14px;margin-bottom:14px;">'
        +makeSectionTitle('Salary History')
        +'<table class="sm-history-table"><thead><tr>'
        +'<th>Effective</th><th style="text-align:right;">Base Salary</th><th style="text-align:right;">Allowances</th><th style="text-align:center;">Actions</th>'
        +'</tr></thead><tbody id="sm-history-body">'+buildSalaryHistoryTableHtml(history)+'</tbody></table>'
        +'<div class="sm-record-bar">'
        +'<label for="sm-record-month">Effective from</label>'
        +'<input type="month" id="sm-record-month" value="'+recordMonthDefault+'">'
        +'<button type="button" id="sm-record-btn">Record change</button>'
        +'</div>'
        +'<div style="font-size:11px;color:var(--ink3);margin-top:8px;line-height:1.5;">Edit salary or allowances above, choose the month they take effect, then click <b>Record change</b>. Past payroll months use the matching history row.</div>'
        +'</div>'
        +'<div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:var(--r);padding:14px;">'
        +'<div style="font-size:10px;font-weight:700;color:#be123c;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">EPF (KWSP) — auto rate</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +'<div><label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;">Date of Birth</label>'
        +'<input id="sm-dob" type="date" value="'+empDob+'" style="'+IS+'"></div>'
        +'<div><label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;">Nationality</label>'
        +'<select id="sm-nationality" style="'+IS+'">'+natOpt('CITIZEN','Malaysian Citizen')+natOpt('PR','Permanent Resident')+natOpt('FOREIGNER','Foreigner')+'</select></div>'
        +'</div>'
        +'<div style="font-size:11px;color:#be123c;margin-top:8px;line-height:1.5;">EPF follows the official Third Schedule (eff. 1 Oct 2025). The rate is chosen automatically from age &amp; nationality — Citizen &lt;60: 11%/13%; Citizen 60+: 0%/4%; PR 60+: 5.5%/6.5%; Foreigner: 2%/2%.</div>'
        +'</div>'
        +'<div id="sm-save-prompt" style="display:none;margin-top:10px;"></div>'
        +'</div>'
        +'<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;background:var(--paper);flex-shrink:0;">'
        +'<button id="sm-cancel" style="padding:9px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        +'<button id="sm-save" style="padding:9px 24px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save & Next →</button>'
        +'</div>';
    modal.appendChild(card);
    document.body.appendChild(modal);
    // Only close via Cancel button — clicking background does NOT close
    document.getElementById('sm-cancel').addEventListener('click',function(){modal.remove();});
    document.getElementById('sm-save').addEventListener('click',function(){saveSalaryModal(personName);});
    document.getElementById('sm-record-btn').addEventListener('click', function() { smRecordSalaryChange(personName); });
    smBindSalaryFormListeners(personName);
    smRefreshSalaryModalUI(personName);
}

function saveSalaryModal(personName) {
    if (smHasUnrecordedChanges(personName)) {
        smShowSavePrompt(personName, function(ym) {
            smRecordSalaryChange(personName, ym);
            smFinishSaveSalaryModal(personName);
        });
        return;
    }
    smFinishSaveSalaryModal(personName);
}

function smFinishSaveSalaryModal(personName) {
    var cfg=window.appState.config;
    var base=parseFloat(document.getElementById('sm-base').value)||1700;
    var hp=parseFloat(document.getElementById('sm-HP').value)||0;
    var car=parseFloat(document.getElementById('sm-CAR').value)||0;
    var lf=parseFloat(document.getElementById('sm-LOCALFUEL').value)||0;
    var of2=parseFloat(document.getElementById('sm-OUTFUEL').value)||0;
    var hs=parseFloat(document.getElementById('sm-HOUSING').value)||0;
    var food=parseFloat(document.getElementById('sm-FOOD').value)||0;
    var oth=parseFloat(document.getElementById('sm-OTHERS').value)||0;
    var _epfEl=document.getElementById('sm-epf');
    var _empEpfEl=document.getElementById('sm-employer-epf');
    var epfR=_epfEl?(parseFloat(_epfEl.value)||11):11;
    var employerEpfR=_empEpfEl?(parseFloat(_empEpfEl.value)||13):13;
    var dobEl=document.getElementById('sm-dob');
    var natEl=document.getElementById('sm-nationality');
    if (typeof setEmployeeDOB === 'function') setEmployeeDOB(personName, dobEl?dobEl.value:'');
    if (typeof setEmployeeNationality === 'function') setEmployeeNationality(personName, natEl?natEl.value:'CITIZEN');
    if (typeof setEmployeeProfile === 'function') {
        setEmployeeProfile(personName, {
            mykad: ((document.getElementById('sm-mykad') || {}).value || '').trim(),
            epfNo: ((document.getElementById('sm-epfno') || {}).value || '').trim(),
            bankAccount: ((document.getElementById('sm-bank') || {}).value || '').trim()
        });
    }

    var allowances = {HP:hp,CAR:car,'LOCAL FUEL':lf,'OUTSTATION FUEL':of2,HOUSING:hs,FOOD:food,OTHERS:oth};
    var nu = personName.toUpperCase();

    if (!cfg.base_salaries)  cfg.base_salaries  = {};
    if (!cfg.allowances)     cfg.allowances      = {};
    if (!cfg.deductions)     cfg.deductions      = {};
    if (!cfg.deductionRates) cfg.deductionRates  = {};
    cfg.base_salaries[nu]  = base;
    cfg.allowances[nu]     = allowances;
    var ti = base+hp+car+lf+of2+hs+food+oth;
    cfg.deductions[nu]     = {EPF:Math.round(ti*(epfR/100)*100)/100,SOCSO:Math.round(ti*0.005*100)/100,PCB:0,EIS:0};
    cfg.deductionRates[nu] = {EPF_RATE:epfR};
    if (!cfg.employer_epf_rates) cfg.employer_epf_rates = {};
    cfg.employer_epf_rates[nu] = employerEpfR;

    smHideSavePrompt();
    saveConfig();
    var m=document.getElementById('salary-setup-modal'); if(m) m.remove();
    renderPeopleList();
    showToast('✅', personName+' saved!');
    var _empType = getEmployeeType(personName);
    setTimeout(function(){
        if (_empType === 'Supervisor') {
            showSupervisorIncentiveModal(personName);
        } else if (_empType === 'Support Staff') {
            showMerchandiserRateModal(personName);
        } else {
            showCommissionModal(personName);
        }
    }, 300);
}

function showCommissionModal(personName) {
    var ex=document.getElementById('commission-setup-modal');if(ex)ex.remove();
    var cfg=window.appState.config;
    function getPCfg(gk,pk){
        if(cfg[pk]&&cfg[pk][personName])return JSON.parse(JSON.stringify(cfg[pk][personName]));
        return JSON.parse(JSON.stringify(cfg[gk]||[]));
    }
    window._tempRates=getPCfg('monthly_commission_rates','person_commission_rates');
    window._tempQtr  =getPCfg('quarterly_incentive','person_quarterly_incentive');
    window._tempColl =getPCfg('collection_incentive','person_collection_incentive');
    window._tempCall =getPCfg('active_call_incentive','person_call_incentive');
    var hasP=(cfg.person_commission_rates&&cfg.person_commission_rates[personName])||(cfg.person_quarterly_incentive&&cfg.person_quarterly_incentive[personName]);
    var badge=hasP?'<span style="background:var(--vi-l);color:var(--vi);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-left:8px;">Personal</span>':'<span style="background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600;margin-left:8px;">Company Rate</span>';
    var modal=document.createElement('div');
    modal.id='commission-setup-modal';
    modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
    var card=document.createElement('div');
    card.style.cssText='background:#f8fafc;border-radius:16px;max-width:660px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(8,15,26,.25);';
    card.addEventListener('click',function(e){e.stopPropagation();});
    var colHdr=function(cols){return '<div style="display:grid;grid-template-columns:'+cols+';gap:6px;font-size:10px;font-weight:700;color:var(--ink4);margin-bottom:4px;padding:0 2px;letter-spacing:.5px;text-transform:uppercase;"></div>';};
    card.innerHTML=
        '<div style="background:linear-gradient(135deg,#0f172a,#4f46e5);padding:20px 24px;color:#fff;flex-shrink:0;">'
        +'<div style="font-size:17px;font-weight:800;letter-spacing:-.3px;">💰 Commission & Incentive'+badge+'</div>'
        +'<div style="font-size:12px;opacity:.6;margin-top:3px;">'+personName+' — Edit to create personal override</div>'
        +'<div style="margin-top:12px;display:flex;align-items:center;gap:8px;">'
        +'<span style="font-size:11px;font-weight:600;opacity:.75;">Rate source</span>'
        +'<select id="cm-rate-mode" style="padding:7px 12px;border-radius:8px;border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.14);color:#fff;font-size:12px;font-weight:700;font-family:Sora,sans-serif;cursor:pointer;outline:none;">'
        +'<option value="company"'+(hasP?'':' selected')+' style="color:#0f172a;">🏢 Company Rate</option>'
        +'<option value="personal"'+(hasP?' selected':'')+' style="color:#0f172a;">✦ Personal Rate</option>'
        +'</select></div></div>'
        +'<div style="padding:16px 24px;overflow-y:auto;flex:1;">'
        // Monthly Commission
        +'<div style="background:var(--blue-l);border:1px solid #bae6fd;border-radius:var(--r);padding:14px;margin-bottom:12px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        +'<span style="font-size:12px;font-weight:700;color:#075985;">💰 Monthly Commission Rates</span>'
        +'<button id="cm-add-rate" style="padding:4px 12px;background:#0ea5e9;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;">➕ Add</button></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;font-size:10px;font-weight:700;color:var(--ink4);margin-bottom:4px;padding:0 2px;text-transform:uppercase;letter-spacing:.5px;"><span>Label</span><span>Min%</span><span>Max%</span><span>Rate%</span><span></span></div>'
        +'<div id="cm-tiers"></div></div>'
        // Quarterly
        +'<div style="background:var(--em-l);border:1px solid #a7f3d0;border-radius:var(--r);padding:14px;margin-bottom:12px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        +'<span style="font-size:12px;font-weight:700;color:#065f46;">🏆 Quarterly Incentive</span>'
        +'<button id="cm-add-qtr" style="padding:4px 12px;background:var(--em);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;">➕ Add</button></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;font-size:10px;font-weight:700;color:var(--ink4);margin-bottom:4px;padding:0 2px;text-transform:uppercase;letter-spacing:.5px;"><span>Label</span><span>Min%</span><span>RM</span><span></span></div>'
        +'<div id="cm-qtr"></div></div>'
        // Collection
        +'<div style="background:var(--am-l);border:1px solid #fde68a;border-radius:var(--r);padding:14px;margin-bottom:12px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        +'<span style="font-size:12px;font-weight:700;color:#92400e;">💵 Collection Incentive</span>'
        +'<button id="cm-add-coll" style="padding:4px 12px;background:var(--am);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;">➕ Add</button></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;font-size:10px;font-weight:700;color:var(--ink4);margin-bottom:4px;padding:0 2px;text-transform:uppercase;letter-spacing:.5px;"><span>Label</span><span>Min%</span><span>RM</span><span></span></div>'
        +'<div id="cm-coll"></div></div>'
        // Call
        +'<div style="background:var(--vi-l);border:1px solid #ddd6fe;border-radius:var(--r);padding:14px;">'
        +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        +'<span style="font-size:12px;font-weight:700;color:#5b21b6;">📞 Active Call Incentive</span>'
        +'<button id="cm-add-call" style="padding:4px 12px;background:var(--vi);color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;font-family:Sora,sans-serif;">➕ Add</button></div>'
        +'<div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;font-size:10px;font-weight:700;color:var(--ink4);margin-bottom:4px;padding:0 2px;text-transform:uppercase;letter-spacing:.5px;"><span>Label</span><span>Min%</span><span>RM</span><span></span></div>'
        +'<div id="cm-call"></div></div>'
        +'</div>'
        +'<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:flex-end;background:var(--paper);flex-shrink:0;">'
        +'<button id="cm-cancel-btn" style="padding:9px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        +'<button id="cm-save-btn" style="padding:9px 24px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#4f46e5);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save & Next →</button>'
        +'</div>';
    modal.appendChild(card);
    document.body.appendChild(modal);
    // Only close via Cancel button — clicking background does NOT close
    renderTempRates();
    renderTempIncentive('qtr',window._tempQtr);
    renderTempIncentive('coll',window._tempColl);
    renderTempIncentive('call',window._tempCall);
    document.getElementById('cm-add-rate').addEventListener('click',addTempRate);
    document.getElementById('cm-add-qtr').addEventListener('click',function(){addTempIncentive('qtr');});
    document.getElementById('cm-add-coll').addEventListener('click',function(){addTempIncentive('coll');});
    document.getElementById('cm-add-call').addEventListener('click',function(){addTempIncentive('call');});
    document.getElementById('cm-save-btn').addEventListener('click',function(){saveCommissionModal(personName);});
    document.getElementById('cm-cancel-btn').addEventListener('click',function(){modal.remove();});
    var modeSel=document.getElementById('cm-rate-mode');
    if(modeSel)modeSel.addEventListener('change',function(){setCommissionModalMode(personName,this.value);});
}

// Toggle the person between Company Rate (use global) and Personal Rate (own editable copy) from within the modal.
function setCommissionModalMode(personName, mode){
    var cfg=window.appState.config;
    if(mode==='company'){
        ['person_commission_rates','person_quarterly_incentive','person_collection_incentive','person_call_incentive'].forEach(function(k){
            if(cfg[k]&&cfg[k][personName])delete cfg[k][personName];
        });
        saveConfig();
        renderPeopleList();
        showToast('\ud83c\udfe2', personName+' \u2192 Company Rate');
    } else {
        // Seed a personal copy from the current (company) values so it can be edited independently.
        if(!cfg.person_commission_rates)cfg.person_commission_rates={};
        if(!cfg.person_quarterly_incentive)cfg.person_quarterly_incentive={};
        if(!cfg.person_collection_incentive)cfg.person_collection_incentive={};
        if(!cfg.person_call_incentive)cfg.person_call_incentive={};
        cfg.person_commission_rates[personName]=JSON.parse(JSON.stringify(window._tempRates||cfg.monthly_commission_rates||[]));
        cfg.person_quarterly_incentive[personName]=JSON.parse(JSON.stringify(window._tempQtr||cfg.quarterly_incentive||[]));
        cfg.person_collection_incentive[personName]=JSON.parse(JSON.stringify(window._tempColl||cfg.collection_incentive||[]));
        cfg.person_call_incentive[personName]=JSON.parse(JSON.stringify(window._tempCall||cfg.active_call_incentive||[]));
        saveConfig();
        renderPeopleList();
        showToast('\u2726', personName+' \u2192 Personal Rate');
    }
    // Reload the modal so the badge, dropdown and editor values reflect the new source.
    showCommissionModal(personName);
}
window.setCommissionModalMode = setCommissionModalMode;

function renderTempRates() {
    var wrap=document.getElementById('cm-tiers');if(!wrap)return;
    wrap.innerHTML='';
    (window._tempRates||[]).forEach(function(t,i){
        var row=document.createElement('div');
        row.style.cssText='display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:center;padding:7px;background:var(--paper);border:1px solid var(--line);border-radius:8px;margin-bottom:5px;';
        var IS='padding:7px 9px;border:1.5px solid var(--line);border-radius:7px;font-size:12px;font-family:Sora,sans-serif;width:100%;box-sizing:border-box;outline:none;background:var(--paper);';
        row.innerHTML='<input type="text" value="'+(t.label||'')+'" placeholder="Label" style="'+IS+';font-family:Sora,sans-serif;">'
            +'<input type="number" value="'+t.min+'" step="0.01" style="'+IS+'">'
            +'<input type="number" value="'+t.max+'" step="0.01" style="'+IS+'">'
            +'<input type="number" value="'+(t.rate*100).toFixed(2)+'" step="0.01" style="'+IS+'">';
        var del=document.createElement('button');
        del.textContent='✕';del.style.cssText='padding:5px 9px;background:var(--ro-l);color:var(--rose);border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;';
        del.addEventListener('click',(function(idx){return function(){window._tempRates.splice(idx,1);renderTempRates();};})(i));
        row.appendChild(del);
        var inp=row.querySelectorAll('input');
        inp[0].addEventListener('input',(function(idx){return function(e){window._tempRates[idx].label=e.target.value;};})(i));
        inp[1].addEventListener('input',(function(idx){return function(e){window._tempRates[idx].min=parseFloat(e.target.value)||0;};})(i));
        inp[2].addEventListener('input',(function(idx){return function(e){window._tempRates[idx].max=parseFloat(e.target.value)||0;};})(i));
        inp[3].addEventListener('input',(function(idx){return function(e){window._tempRates[idx].rate=(parseFloat(e.target.value)||0)/100;};})(i));
        wrap.appendChild(row);
    });
}

function renderTempIncentive(type,tiers) {
    var wrap=document.getElementById('cm-'+type);if(!wrap)return;
    wrap.innerHTML='';
    (tiers||[]).forEach(function(t,i){
        var arr=type==='qtr'?window._tempQtr:type==='coll'?window._tempColl:window._tempCall;
        var row=document.createElement('div');
        row.style.cssText='display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;align-items:center;padding:7px;background:var(--paper);border:1px solid var(--line);border-radius:8px;margin-bottom:5px;';
        var IS='padding:7px 9px;border:1.5px solid var(--line);border-radius:7px;font-size:12px;font-family:Sora,sans-serif;width:100%;box-sizing:border-box;outline:none;background:var(--paper);';
        row.innerHTML='<input type="text" value="'+(t.label||'')+'" placeholder="Label" style="'+IS+';font-family:Sora,sans-serif;">'
            +'<input type="number" value="'+(t.min||0)+'" step="1" style="'+IS+'">'
            +'<input type="number" value="'+(t.incentive||0)+'" step="50" style="'+IS+'">';
        var del=document.createElement('button');
        del.textContent='✕';del.style.cssText='padding:5px 9px;background:var(--ro-l);color:var(--rose);border:none;border-radius:7px;cursor:pointer;font-size:12px;font-weight:700;';
        del.addEventListener('click',(function(idx,a,tp){return function(){a.splice(idx,1);renderTempIncentive(tp,a);};})(i,arr,type));
        row.appendChild(del);
        var inp=row.querySelectorAll('input');
        inp[0].addEventListener('input',(function(idx,a){return function(e){a[idx].label=e.target.value;};})(i,arr));
        inp[1].addEventListener('input',(function(idx,a){return function(e){a[idx].min=parseFloat(e.target.value)||0;};})(i,arr));
        inp[2].addEventListener('input',(function(idx,a){return function(e){a[idx].incentive=parseFloat(e.target.value)||0;};})(i,arr));
        wrap.appendChild(row);
    });
}

function addTempRate(){
    if(!window._tempRates)window._tempRates=[];
    var last=window._tempRates.length>0?window._tempRates[window._tempRates.length-1]:{max:0};
    var nm=(last.max||0)+0.01;
    window._tempRates.push({min:nm,max:nm+9.99,rate:0,label:nm.toFixed(0)+'%+'});
    renderTempRates();
}

function addTempIncentive(type){
    var arr=type==='qtr'?window._tempQtr:type==='coll'?window._tempColl:window._tempCall;
    if(!arr){arr=[];if(type==='qtr')window._tempQtr=arr;else if(type==='coll')window._tempColl=arr;else window._tempCall=arr;}
    var last=arr.length>0?arr[0]:{min:100};
    arr.unshift({min:Math.max(0,(last.min||0)-10),incentive:0,label:'New Tier'});
    renderTempIncentive(type,arr);
}

function saveCommissionModal(personName){
    if(!window._tempRates)return;
    var cfg=window.appState.config;
    if(!cfg.person_commission_rates)cfg.person_commission_rates={};
    if(!cfg.person_quarterly_incentive)cfg.person_quarterly_incentive={};
    if(!cfg.person_collection_incentive)cfg.person_collection_incentive={};
    if(!cfg.person_call_incentive)cfg.person_call_incentive={};
    cfg.person_commission_rates[personName]=JSON.parse(JSON.stringify(window._tempRates));
    cfg.person_quarterly_incentive[personName]=JSON.parse(JSON.stringify(window._tempQtr||[]));
    cfg.person_collection_incentive[personName]=JSON.parse(JSON.stringify(window._tempColl||[]));
    cfg.person_call_incentive[personName]=JSON.parse(JSON.stringify(window._tempCall||[]));
    saveConfig();
    var m=document.getElementById('commission-setup-modal');if(m)m.remove();
    renderPeopleList();
    showToast('✅',personName+' commission saved!');
    setTimeout(function(){ showTargetModal(personName); }, 300);
}

function resetToGlobalComm(personName){
    var cfg=window.appState.config;
    ['person_commission_rates','person_quarterly_incentive','person_collection_incentive','person_call_incentive'].forEach(function(k){
        if(cfg[k]&&cfg[k][personName])delete cfg[k][personName];
    });
    saveConfig();
    var m=document.getElementById('commission-setup-modal');if(m)m.remove();
    renderPeopleList();
    showToast('✅','Reset to Company rate');
}

window.renderPeopleList=renderPeopleList;
window.showSalaryModal=showSalaryModal;
window.saveSalaryModal=saveSalaryModal;
window.showCommissionModal=showCommissionModal;
window.saveCommissionModal=saveCommissionModal;
window.resetToGlobalComm=resetToGlobalComm;
window.addTempRate=addTempRate;
window.addTempIncentive=addTempIncentive;
window.renderPersonSidebar=renderPersonSidebar;
window.onCalcPersonChange=onCalcPersonChange;
window.onCalcGroupChange=onCalcGroupChange;
window.selectCalcPerson=selectCalcPerson;
window.updateAchievementHero=updateAchievementHero;

window.promptAddPerson = promptAddPerson;
window.filterPeopleList = filterPeopleList;
window.renderPeopleList = renderPeopleList;
window.showSalaryModal = showSalaryModal;
window.showCommissionModal = showCommissionModal;
window.updateAchievementHero = updateAchievementHero;
window.addSalespersonCard = addSalespersonCard;
window.deleteSalespersonCard = deleteSalespersonCard;
window.clearAllQuickCalculateData = clearAllQuickCalculateData;
window._doClearAllData = _doClearAllData;
window.exportTemplate = exportTemplate;
window.importFromExcel = importFromExcel;
window.addNewPerson = addNewPerson;
window.deleteSalespersonConfig = deleteSalespersonConfig;
window.updateSalary = updateSalary;
window.updateAllowance = updateAllowance;
window.updateEPFRate = updateEPFRate;
window.updateDeduction = updateDeduction;
window.updateSalespersonData = updateSalespersonData;
window.onSalespersonNameChange = onSalespersonNameChange;
window.renderSalespersonCards = renderSalespersonCards;
window.viewHistoryReport = viewHistoryReport;
window.deleteHistoryReport = deleteHistoryReport;
window.updateCommissionLabel = updateCommissionLabel;
window.updateCommissionTier = updateCommissionTier;
window.updateIncentiveLabel = updateIncentiveLabel;
window.updateIncentiveTier = updateIncentiveTier;
window.addCommissionTier = addCommissionTier;
window.removeCommissionTier = removeCommissionTier;
window.addIncentiveTier = addIncentiveTier;
window.removeIncentiveTier = removeIncentiveTier;

// Backup functions
window.exportFullBackup = exportFullBackup;
window.importBackup = importBackup;
window.showAutoBackups = showAutoBackups;
window.createManualBackup = createManualBackup;
window.exportConfigOnly = exportConfigOnly;
window.importConfigOnly = importConfigOnly;
window.quickRecovery = quickRecovery;
window.selectBackup = selectBackup;
window.closeBackupModal = closeBackupModal;
window.restoreSelectedBackup = restoreSelectedBackup;

// Import/month-switch functions
window.fillCardsFromImportedData = fillCardsFromImportedData;
window.autoFillLockedFieldsWithExcel = autoFillLockedFieldsWithExcel;

// Batch export functions
window.showBatchExportModal = showBatchExportModal;
window.closeBatchExportModal = closeBatchExportModal;
window.batchSelectMonths = batchSelectMonths;
window.updateBatchExportUI = updateBatchExportUI;
window.executeBatchExport = executeBatchExport;
window.buildSalesDataForMonth = buildSalesDataForMonth;

// Quick add person functions
window.showQuickAddPersonModal = showQuickAddPersonModal;
window.closeQuickAddPersonModal = closeQuickAddPersonModal;
window.quickAddPersonSubmit = quickAddPersonSubmit;
window.createBlankSalespersonCard = createBlankSalespersonCard;

// Initialize after DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded, starting initialization...');
    
    // Delay initialization to avoid race conditions
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        } else {
            console.error('initApp function not defined');
        }
    }, 100);
});
// ==================== SOFTWARE UPDATE ====================
function checkForAppUpdate() {
    var msgEl = document.getElementById('update-status-msg');
    var btnCheck = document.getElementById('btn-check-update');
    var btnInstall = document.getElementById('btn-install-update');
    if (msgEl) msgEl.textContent = '🔄 Checking for updates...';
    if (btnCheck) btnCheck.disabled = true;

    if (!window.electronAPI || !window.electronAPI.checkForUpdates) {
        if (msgEl) msgEl.textContent = '❌ Update feature not available in this version';
        if (btnCheck) btnCheck.disabled = false;
        return;
    }

    window.electronAPI.checkForUpdates().then(function(result) {
        if (!result || !result.success) {
            if (msgEl) msgEl.textContent = '❌ ' + ((result && result.error) || 'Update check failed');
            if (btnCheck) btnCheck.disabled = false;
            return;
        }
        if (result.updateAvailable && result.version) {
            if (msgEl) {
                msgEl.innerHTML = '✅ New version <b>v' + result.version + '</b> available! Downloading...'
                    + '<div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;">'
                    + '<div id="update-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#2563eb);border-radius:6px;transition:width 0.3s;"></div></div>'
                    + '<div id="update-progress-text" style="font-size:11px;color:#64748b;margin-top:4px;">Starting download...</div>';
            }
        } else {
            if (msgEl) msgEl.textContent = '✅ You are on the latest version (v' + (result.current || '') + ')!';
        }
        if (btnCheck) btnCheck.disabled = false;
    }).catch(function(e) {
        if (msgEl) msgEl.textContent = '❌ Update check failed: ' + (e.message || e);
        if (btnCheck) btnCheck.disabled = false;
    });
}
window.checkForAppUpdate = checkForAppUpdate;

function installAppUpdate() {
    if (window.electronAPI && window.electronAPI.installUpdate) {
        window.electronAPI.installUpdate();
    }
}
window.installAppUpdate = installAppUpdate;

// Listen for update status from main process
if (window.electronAPI && window.electronAPI.onUpdateStatus) {
    window.electronAPI.onUpdateStatus(function(data) {
        var msgEl = document.getElementById('update-status-msg');
        var btnInstall = document.getElementById('btn-install-update');
        if (!msgEl) return;

        if (data.status === 'available') {
            msgEl.innerHTML = '⬇️ Downloading <b>v' + data.version + '</b>...'
                + '<div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;">'
                + '<div id="update-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#3b82f6,#2563eb);border-radius:6px;transition:width 0.3s;"></div></div>'
                + '<div id="update-progress-text" style="font-size:11px;color:#64748b;margin-top:4px;">Starting download...</div>';
        } else if (data.status === 'downloading') {
            var pct = Math.round(data.percent || 0);
            var bar = document.getElementById('update-progress-bar');
            var txt = document.getElementById('update-progress-text');
            if (bar) bar.style.width = pct + '%';
            if (txt) txt.textContent = 'Downloading... ' + pct + '%';
            if (!bar) {
                msgEl.innerHTML = '⬇️ Downloading... ' + pct + '%'
                    + '<div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;">'
                    + '<div id="update-progress-bar" style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#3b82f6,#2563eb);border-radius:6px;transition:width 0.3s;"></div></div>'
                    + '<div id="update-progress-text" style="font-size:11px;color:#64748b;margin-top:4px;">Downloading... '+pct+'%</div>';
            }
        } else if (data.status === 'downloaded') {
            msgEl.innerHTML = '✅ <b>v' + data.version + '</b> ready! Click Install to restart.'
                + '<div style="margin-top:8px;background:#e2e8f0;border-radius:6px;height:8px;overflow:hidden;">'
                + '<div style="height:100%;width:100%;background:linear-gradient(90deg,#059669,#10b981);border-radius:6px;"></div></div>'
                + '<div style="font-size:11px;color:#059669;margin-top:4px;">Download complete!</div>';
            if (btnInstall) btnInstall.style.display = '';
        } else if (data.status === 'not-available') {
            msgEl.textContent = '✅ ' + (data.message || 'You are on the latest version.');
        }
    });
}

// ==================== DASHBOARD ====================
function renderDashboard() {
    var body = document.getElementById('dashboard-body');
    if (!body) return;
    var cfg = window.appState.config;
    var configPeople = Object.keys(cfg.base_salaries || {});
    
    // Group filter
    var dashGroupSel = document.getElementById('dashboard-group-select');
    var selectedGroup = dashGroupSel ? dashGroupSel.value : 'ALL';
    if (selectedGroup !== 'ALL') {
        configPeople = configPeople.filter(function(n) { return getEmployeeType(n) === selectedGroup; });
    }
    
    var history = cfg.reportHistory || [];
    var curYear = new Date().getFullYear();

    // Year selector
    var dashYearSel = document.getElementById('dashboard-year-select');
    if (dashYearSel && dashYearSel.options.length === 0) {
        [curYear-1, curYear, curYear+1].forEach(function(y) { var opt = document.createElement('option'); opt.value = y; opt.textContent = y; if (y === curYear) opt.selected = true; dashYearSel.appendChild(opt); });
    }
    var selectedYear = dashYearSel ? parseInt(dashYearSel.value) : curYear;

    // Month selector
    var dashMonthSel = document.getElementById('dashboard-month-select');
    var selectedMonth = dashMonthSel ? dashMonthSel.value : 'ALL';

    var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var displayMonths = selectedMonth === 'ALL' ? MONTHS : [selectedMonth];
    function fmt(n) { return 'RM ' + (n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }

    // Helper: calc team totals for a month (Sales only)
    function teamTotalsForMonth(m) {
        var hEntry = findHistEntry(history, m, selectedYear);
        if (!hEntry || !hEntry.data) return {sales:0, target:0, collAch:0, callAch:0};
        var tS=0, tT=0, tCo=0, tCoT=0, tCa=0, tCaT=0;
        hEntry.data.forEach(function(pd) {
            var t = getEmployeeType(pd.name);
            if (t !== 'Sales') return;
            tS += parseFloat(pd.sales)||0;
            tT += parseFloat(pd.target)||0;
            tCo += parseFloat(pd.collectionAmount)||0;
            tCoT += parseFloat(pd.collectionTarget)||0;
            tCa += parseFloat(pd.callActual)||0;
            tCaT += parseFloat(pd.callTarget)||0;
        });
        return {sales:tS, target:tT, collAch: tCoT>0?(tCo/tCoT*100):0, callAch: tCaT>0?(tCa/tCaT*100):0};
    }

    var peopleStats = configPeople.map(function(name) {
        var empType = getEmployeeType(name);
        var totalSales=0, totalTarget=0, totalComm=0, monthCount=0;
        var totalBlocks = 0;
        var salesByMonth = MONTHS.map(function(m) {
            var hEntry = findHistEntry(history, m, selectedYear);
            var pd = hEntry && hEntry.data ? hEntry.data.find(function(p){return (p.name||'').toUpperCase()===name;}) : null;
            var inDisplay = displayMonths.indexOf(m) !== -1
                && (typeof isEmployeeActiveInMonth !== 'function' || isEmployeeActiveInMonth(name, m, selectedYear));
            if (empType === 'Sales') {
                if (pd && (pd.sales>0 || pd.target>0)) {
                    if (inDisplay) {
                    totalSales += parseFloat(pd.sales)||0;
                    totalTarget += parseFloat(pd.target)||0;
                    totalComm += calculateCommission(pd.sales||0, pd.target||0, name);
                    var collPct = (pd.collectionTarget||0)>0?(pd.collectionAmount||0)/pd.collectionTarget*100:0;
                    var callPct = (pd.callTarget||0)>0?(pd.callActual||0)/pd.callTarget*100:0;
                    totalComm += calculateIncentive(collPct, collectionIncentiveTiersFor(name));
                    totalComm += calculateIncentive(callPct, activeCallIncentiveTiersFor(name));
                    monthCount++;
                    }
                    return parseFloat(pd.sales)||0;
                }
                return 0;
            } else if (empType === 'Supervisor') {
                var team = teamTotalsForMonth(m);
                var teamAchM = team.target>0?(team.sales/team.target*100):0;
                if (team.target>0 && inDisplay) {
                    var saleT = (cfg.person_supervisor_sale_tiers&&cfg.person_supervisor_sale_tiers[name])||cfg.supervisor_sale_tiers||[];
                    var collT = (cfg.person_supervisor_coll_tiers&&cfg.person_supervisor_coll_tiers[name])||cfg.supervisor_coll_tiers||[];
                    var callT = (cfg.person_supervisor_call_tiers&&cfg.person_supervisor_call_tiers[name])||cfg.supervisor_call_tiers||[];
                    var qtrT  = (cfg.person_supervisor_qtr_tiers&&cfg.person_supervisor_qtr_tiers[name])||cfg.supervisor_qtr_tiers||[];
                    totalComm += getTierAmt(saleT, teamAchM) + getTierAmt(collT, team.collAch) + getTierAmt(callT, team.callAch);
                    if (['MAR','JUN','SEP','DEC'].indexOf(m)!==-1) totalComm += getTierAmt(qtrT, teamAchM);
                    monthCount++;
                }
                return 0;
            } else if (empType === 'Support Staff') {
                if (pd && (pd.collectionAmount||0)>0 && inDisplay) {
                    var blocks = parseFloat(pd.collectionAmount)||0;
                    var rate = (cfg.person_merchandiser_rates&&cfg.person_merchandiser_rates[name]!=null)
                        ? parseFloat(cfg.person_merchandiser_rates[name])
                        : (parseFloat(cfg.merchandiser_block_rate)||10);
                    totalComm += blocks * rate;
                    totalBlocks += blocks;
                    monthCount++;
                }
                return 0;
            }
            return 0;
        });
        return {name:name, type:empType, totalSales:totalSales, totalTarget:totalTarget, totalComm:totalComm, totalBlocks:totalBlocks, ach:totalTarget>0?(totalSales/totalTarget*100):0, monthCount:monthCount, salesByMonth:salesByMonth};
    });

    // Team totals: Sales people only
    var salesPeople = peopleStats.filter(function(p){return p.type==='Sales';});
    var teamSales = salesPeople.reduce(function(s,p){return s+p.totalSales;},0);
    var teamTarget = salesPeople.reduce(function(s,p){return s+p.totalTarget;},0);
    var teamComm = peopleStats.reduce(function(s,p){return s+p.totalComm;},0);  // All types for total commission
    var teamAch = teamTarget>0?(teamSales/teamTarget*100):0;
    // Top performer: only Sales
    var rankedSales = salesPeople.slice().sort(function(a,b){return b.totalSales-a.totalSales;});
    var topPerson = rankedSales.length>0 ? rankedSales[0].name : '—';
    var typeOrder = {'Sales':0,'Supervisor':1,'Support Staff':2};
    var ranked = peopleStats.slice().sort(function(a,b){
        var tA = typeOrder[a.type]!==undefined ? typeOrder[a.type] : 3;
        var tB = typeOrder[b.type]!==undefined ? typeOrder[b.type] : 3;
        if (tA !== tB) return tA - tB;
        return b.totalComm - a.totalComm;
    });
    var medals = ['🥇','🥈','🥉'];
    var html = '';
    html += '<div class="dash-meta">'+selectedYear+' Overview · '+configPeople.length+' people</div>';
    html += '<div class="dash-kpi-grid">';
    html += '<div class="dash-kpi dash-kpi--muted"><div class="dash-kpi-lbl">Team Target</div><div class="dash-kpi-val">'+fmt(teamTarget)+'</div></div>';
    html += '<div class="dash-kpi"><div class="dash-kpi-lbl">Team Sales</div><div class="dash-kpi-val">'+fmt(teamSales)+'</div></div>';
    html += '<div class="dash-kpi '+(teamAch>=100?'dash-kpi--good':'dash-kpi--warn')+'"><div class="dash-kpi-lbl">Achievement</div><div class="dash-kpi-val">'+teamAch.toFixed(2)+'%</div></div>';
    html += '<div class="dash-kpi dash-kpi--good"><div class="dash-kpi-lbl">TOTAL COMM/INC PAID</div><div class="dash-kpi-val">'+fmt(teamComm)+'</div></div>';
    var topTc = (topPerson && topPerson !== '—') ? getRoleBadgeStyle(getEmployeeType(topPerson)) : { bg: '#f1f5f9', c: '#64748b', icon: '🏆' };
    html += '<div class="dash-kpi" style="background:linear-gradient(135deg,'+topTc.bg+' 0%,var(--paper) 55%);border-left:3px solid '+topTc.c+';"><div class="dash-kpi-lbl">Top Performer</div><div class="dash-kpi-val" style="color:'+topTc.c+';font-family:Sora,sans-serif;">'+topTc.icon+' '+topPerson+'</div></div>';
    html += '</div>';
    html += '<div class="dash-section-title">🏆 Team Ranking</div>';
    ranked.forEach(function(p, i) {
        var tc = getRoleBadgeStyle(p.type);
        var achC = p.ach>=100?'ach-good':p.ach>=90?'ach-warn':'ach-bad';
        var typeIcon = tc.icon;
        var typeDisplay = p.type==='Supervisor'?'Management Staff':p.type;
        var typeLabel = '<span style="background:'+tc.bg+';color:'+tc.c+';padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700;margin-left:6px;">'+typeIcon+' '+typeDisplay+'</span>';
        var maxSale = Math.max.apply(null, p.salesByMonth.concat([1]));
        var bars = p.salesByMonth.map(function(v,mi){
            var h = maxSale>0?Math.max(2,(v/maxSale)*22):2;
            return '<div style="display:flex;flex-direction:column;align-items:center;gap:0;width:20px;"><div style="width:16px;height:'+h+'px;background:'+(v>0?tc.c:'#e2e8f0')+';border-radius:2px 2px 0 0;opacity:'+(v>0?1:0.35)+';"></div><div style="font-size:5px;color:#94a3b8;">'+MONTHS[mi][0]+'</div></div>';
        }).join('');
        html += '<div class="dash-rank-row" style="background:linear-gradient(90deg,'+tc.bg+' 0%,#fff 38%);border-left:3px solid '+tc.c+';">';
        html += '<div class="dash-rank-person"><div class="dash-rank-avatar" style="background:'+tc.bg+';color:'+tc.c+';">'+p.name[0]+'</div><div style="min-width:0;"><div class="dash-rank-name"><span style="color:'+tc.c+';">'+(p.type==='Sales'?(medals[i]||''):'')+' '+p.name+'</span>'+typeLabel+'</div><div class="dash-rank-sub">'+p.monthCount+' months</div></div></div>';
        html += '<div class="dash-rank-bars">'+bars+'</div>';
        var monoAmt = 'dash-rank-col-val';
        // Column 1: Total Sales or Total Blocks or "—"
        if (p.type === 'Sales') {
            html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">Total Sales</div><div class="'+monoAmt+'">'+fmt(p.totalSales)+'</div></div>';
        } else if (p.type === 'Support Staff') {
            html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">Total Blocks</div><div class="'+monoAmt+'">'+p.totalBlocks+'</div></div>';
        } else {
            html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">Earns From</div><div style="font-size:11px;font-weight:700;color:'+tc.c+';overflow-wrap:break-word;">Team</div></div>';
        }
        if (p.type === 'Sales') {
            html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">Achievement</div><div class="dash-rank-col-val '+achC+'">'+p.ach.toFixed(2)+'%</div></div>';
        } else {
            html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">Type</div><div class="dash-rank-col-val" style="color:'+tc.c+';">'+typeIcon+' '+typeDisplay+'</div></div>';
        }
        var commLabel = p.type==='Supervisor'?'Sale Incentive':p.type==='Support Staff'?'Block Incentive':'Commission';
        html += '<div class="dash-rank-col"><div class="dash-rank-col-lbl">'+commLabel+'</div><div class="'+monoAmt+'" style="color:'+tc.c+';">'+fmt(p.totalComm)+'</div></div>';
        html += '</div>';
    });
    // Monthly Sales Trend - only show for ALL or Sales group
    if (selectedGroup === 'ALL' || selectedGroup === 'Sales') {
    html += '<div class="dash-trend-panel">';
    html += '<div class="dash-trend-title">📈 Monthly Sales Trend</div>';
    html += '<div class="dash-trend-bars">';
    var monthTotals = MONTHS.map(function(m){return salesPeople.reduce(function(s,p){var mi=MONTHS.indexOf(m);return s+p.salesByMonth[mi];},0);});
    var maxMonth = Math.max.apply(null, monthTotals.concat([1]));
    MONTHS.forEach(function(m,mi){
        var total = monthTotals[mi]; var h = maxMonth>0?Math.max(4,(total/maxMonth)*58):4; var hasData = total>0;
        var salesBarC = getRoleBadgeStyle('Sales').c;
        html += '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;">';
        html += '<div style="width:100%;height:'+h+'px;background:'+(hasData?'linear-gradient(180deg,'+salesBarC+','+salesBarC+'cc)':'#f1f5f9')+';border-radius:3px 3px 2px 2px;opacity:'+(hasData?1:0.3)+';"></div>';
        html += '<div style="font-size:8px;font-weight:700;color:'+(hasData?'#0f172a':'#cbd5e1')+';text-align:center;white-space:nowrap;">'+m+(hasData?'<br><span style="font-family:\'Sora\',sans-serif;font-size:7px;color:#475569;">'+fmt(total)+'</span>':'')+'</div></div>';
    });
    html += '</div></div>';
    }
    body.innerHTML = html;
}
window.renderDashboard = renderDashboard;

// ==================== ANNUAL REPORT ====================
function renderAnnualReport() {
    var body = document.getElementById('annual-panel-host');
    if (!body || _annualActiveView !== 'report') return;
    var cfg = window.appState.config;
    var configPeople = Object.keys(cfg.base_salaries || {});
    var history = cfg.reportHistory || [];
    var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var yearSelect = document.getElementById('annual-year-select');
    var curYear = new Date().getFullYear();
    if (yearSelect && yearSelect.options.length === 0) {
        [curYear-1, curYear, curYear+1].forEach(function(y) { var opt = document.createElement('option'); opt.value = y; opt.textContent = y; if (y === curYear) opt.selected = true; yearSelect.appendChild(opt); });
    }
    var selectedYear = yearSelect ? parseInt(yearSelect.value) : curYear;

    // Person selector
    var arPersonSel = document.getElementById('ar-person-select');
    if (arPersonSel && arPersonSel.options.length <= 1) {
        configPeople.forEach(function(name) { var opt = document.createElement('option'); opt.value = name; opt.textContent = name; arPersonSel.appendChild(opt); });
    }
    var selectedPerson = arPersonSel ? arPersonSel.value : 'ALL';
    var displayPeople = selectedPerson === 'ALL' ? configPeople : configPeople.filter(function(n){ return n === selectedPerson; });

    // Month selector
    var arMonthSel = document.getElementById('ar-month-select');
    var selectedMonth = arMonthSel ? arMonthSel.value : 'ALL';
    var nowDate = new Date();
    var displayMonths;
    var rangeLabel = '';
    if (selectedMonth === 'ALL') {
        displayMonths = MONTHS;
    } else if (selectedMonth === 'UPTODATE') {
        // Up to date = JAN .. current month (only meaningful for the current year).
        if (selectedYear < nowDate.getFullYear()) displayMonths = MONTHS;          // past year → full year
        else if (selectedYear > nowDate.getFullYear()) displayMonths = [];          // future year → nothing yet
        else displayMonths = MONTHS.slice(0, nowDate.getMonth() + 1);               // current year → up to this month
    } else if (selectedMonth === 'RANGE') {
        // Custom range: From month .. To month (inclusive). Auto-swap if reversed.
        var fromSel = document.getElementById('ar-range-from');
        var toSel = document.getElementById('ar-range-to');
        var fromM = fromSel ? fromSel.value : 'JAN';
        var toM = toSel ? toSel.value : 'DEC';
        var fi = MONTHS.indexOf(fromM); if (fi < 0) fi = 0;
        var ti = MONTHS.indexOf(toM);  if (ti < 0) ti = MONTHS.length - 1;
        if (fi > ti) { var tmp = fi; fi = ti; ti = tmp; }
        displayMonths = MONTHS.slice(fi, ti + 1);
        rangeLabel = MONTHS[fi] + ' – ' + MONTHS[ti];
    } else {
        displayMonths = MONTHS.filter(function(m){ return m === selectedMonth; });
    }

    // Group selector
    var arGroupSel = document.getElementById('ar-group-select');
    var selectedGroup = arGroupSel ? arGroupSel.value : 'ALL';
    if (selectedGroup !== 'ALL') {
        displayPeople = displayPeople.filter(function(n) {
            var t = getEmployeeType(n);
            if (selectedGroup === 'Management Staff') return t === 'Supervisor';
            return t === selectedGroup;
        });
    }

    var subEl = document.getElementById('annual-sub');
    var groupLabel = selectedGroup === 'ALL' ? '' : ' · ' + selectedGroup;
    var monthLabel = selectedMonth === 'ALL' ? 'Full Year'
        : (selectedMonth === 'UPTODATE'
            ? 'Up to date' + (displayMonths.length ? ' (\u2264 ' + displayMonths[displayMonths.length - 1] + ')' : '')
            : (selectedMonth === 'RANGE' ? rangeLabel : selectedMonth));
    if (subEl) {
        var salesCount = displayPeople.filter(function(n) { return getEmployeeType(n) === 'Sales'; }).length;
        var countLabel = selectedPerson === 'ALL'
            ? displayPeople.length + ' employees' + (salesCount !== displayPeople.length ? ' (' + salesCount + ' Sales)' : '')
            : selectedPerson;
        subEl.textContent = selectedYear + ' · ' + monthLabel + ' · ' + countLabel + groupLabel;
    }
    function fmt(n) { return 'RM ' + (n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function fmtNum(n) { return (n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function personKey(name) { return (name || '').toUpperCase(); }
    var peopleData = {};
    configPeople.forEach(function(name) { peopleData[personKey(name)] = {}; });

    // Helper: calc team totals for a month (Sales only)
    function _teamTotalsForMonth(m) {
        var hEntry = findHistEntry(history, m, selectedYear);
        if (!hEntry || !hEntry.data) return {sales:0, target:0, collAch:0, callAch:0};
        var tS=0, tT=0, tCo=0, tCoT=0, tCa=0, tCaT=0;
        hEntry.data.forEach(function(pd) {
            var t = getEmployeeType(pd.name);
            if (t !== 'Sales') return;
            tS += parseFloat(pd.sales)||0;
            tT += parseFloat(pd.target)||0;
            tCo += parseFloat(pd.collectionAmount)||0;
            tCoT += parseFloat(pd.collectionTarget)||0;
            tCa += parseFloat(pd.callActual)||0;
            tCaT += parseFloat(pd.callTarget)||0;
        });
        return {sales:tS, target:tT, collAch: tCoT>0?(tCo/tCoT*100):0, callAch: tCaT>0?(tCa/tCaT*100):0};
    }

    MONTHS.forEach(function(m) {
        var hEntry = findHistEntry(history, m, selectedYear);
        // For Sales: use saved data
        if (hEntry && hEntry.data) {
            hEntry.data.forEach(function(pd) {
                var nu = personKey(pd.name);
                if (!peopleData[nu]) return;
                if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(nu, m, selectedYear)) return;
                var empType = getEmployeeType(nu);
                if (empType === 'Sales') {
                    var comm = calculateCommission(pd.sales||0, pd.target||0, nu);
                    var collPct = (pd.collectionTarget||0)>0?(pd.collectionAmount||0)/pd.collectionTarget*100:0;
                    var callPct = (pd.callTarget||0)>0?(pd.callActual||0)/pd.callTarget*100:0;
                    var collI = calculateIncentive(collPct, collectionIncentiveTiersFor(nu));
                    var callI = calculateIncentive(callPct, activeCallIncentiveTiersFor(nu));
                    var ach = (pd.target||0)>0?((pd.sales||0)/(pd.target)*100):0;
                    var isQtr = ['MAR','JUN','SEP','DEC'].indexOf(m)!==-1;
                    var qtrI = isQtr ? calculateIncentive(ach, quarterlyIncentiveTiersFor(nu)) : 0;
                    peopleData[nu][m] = { type:'Sales', target: parseFloat(pd.target)||0, sales: parseFloat(pd.sales)||0, ach: ach, commission: comm, collInc: collI, callInc: callI, qtrBonus: qtrI };
                } else if (empType === 'Support Staff') {
                    var blocks = parseFloat(pd.collectionAmount)||0;
                    var rate = (cfg.person_merchandiser_rates&&cfg.person_merchandiser_rates[nu]!=null)
                        ? parseFloat(cfg.person_merchandiser_rates[nu])
                        : (parseFloat(cfg.merchandiser_block_rate)||10);
                    peopleData[nu][m] = { type:'Support Staff', blocks: blocks, rate: rate, incentive: blocks*rate };
                }
            });
        }
        // For Supervisors: compute from team (regardless of whether they're in history)
        configPeople.forEach(function(name) {
            var empType = getEmployeeType(name);
            if (empType !== 'Supervisor') return;
            if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(name, m, selectedYear)) return;
            var team = _teamTotalsForMonth(m);
            if (team.target === 0) return; // No team data this month
            var teamAchM = team.target>0?(team.sales/team.target*100):0;
            var saleT = (cfg.person_supervisor_sale_tiers&&cfg.person_supervisor_sale_tiers[name])||cfg.supervisor_sale_tiers||[];
            var collT = (cfg.person_supervisor_coll_tiers&&cfg.person_supervisor_coll_tiers[name])||cfg.supervisor_coll_tiers||[];
            var callT = (cfg.person_supervisor_call_tiers&&cfg.person_supervisor_call_tiers[name])||cfg.supervisor_call_tiers||[];
            var qtrT  = (cfg.person_supervisor_qtr_tiers&&cfg.person_supervisor_qtr_tiers[name])||cfg.supervisor_qtr_tiers||[];
            var saleInc = getTierAmt(saleT, teamAchM);
            var collInc = getTierAmt(collT, team.collAch);
            var callInc = getTierAmt(callT, team.callAch);
            var isQtr = ['MAR','JUN','SEP','DEC'].indexOf(m)!==-1;
            var qtrInc = isQtr ? getTierAmt(qtrT, teamAchM) : 0;
            peopleData[personKey(name)][m] = { type:'Supervisor', teamAch: teamAchM, saleInc:saleInc, collInc:collInc, callInc:callInc, qtrInc:qtrInc, total: saleInc+collInc+callInc+qtrInc };
        });
    });
    var teamSales=0, teamTarget=0, teamComm=0;
    configPeople.forEach(function(name) {
        var empType = getEmployeeType(name);
        displayMonths.forEach(function(m) {
            var d = peopleData[personKey(name)][m]; if (!d) return;
            if (empType === 'Sales') {
                teamSales+=d.sales; teamTarget+=d.target; teamComm+=d.commission+d.collInc+d.callInc+d.qtrBonus;
            } else if (empType === 'Supervisor') {
                teamComm += d.total;
            } else if (empType === 'Support Staff') {
                teamComm += d.incentive;
            }
        });
    });
    var teamAch = teamTarget>0?(teamSales/teamTarget*100):0;
    function achCls(pct) { return pct >= 100 ? 'ach-good' : pct >= 90 ? 'ach-warn' : 'ach-bad'; }
    var html = '';
    html += '<div class="dash-kpi-grid report-kpi-grid">';
    html += '<div class="dash-kpi"><div class="dash-kpi-lbl">Total Team Sales</div><div class="dash-kpi-val">'+fmt(teamSales)+'</div></div>';
    html += '<div class="dash-kpi dash-kpi--muted"><div class="dash-kpi-lbl">Total Target</div><div class="dash-kpi-val">'+fmt(teamTarget)+'</div></div>';
    html += '<div class="dash-kpi '+(teamAch>=100?'dash-kpi--good':teamAch>=90?'dash-kpi--warn':'')+'"><div class="dash-kpi-lbl">Overall Achievement</div><div class="dash-kpi-val">'+teamAch.toFixed(2)+'%</div></div>';
    html += '<div class="dash-kpi dash-kpi--good"><div class="dash-kpi-lbl">TOTAL COMM/INC PAID</div><div class="dash-kpi-val">'+fmt(teamComm)+'</div></div>';
    html += '</div>';
    // Monthly breakdown
    // Filter people by type for different sections
    var salesDisplay = displayPeople.filter(function(p){return getEmployeeType(p)==='Sales';});
    var supervisorDisplay = displayPeople.filter(function(p){return getEmployeeType(p)==='Supervisor';});
    var merchandiserDisplay = displayPeople.filter(function(p){return getEmployeeType(p)==='Support Staff';});

    // ── Monthly Breakdown (Sales only) ──
    if (salesDisplay.length > 0) {
        html += '<div class="report-panel report-panel--monthly-breakdown"><div class="report-panel-head">📊 Sales Monthly Breakdown — '+selectedYear+' (Sales)</div>';
        html += '<div class="report-panel-body"><table class="report-table report-table--monthly">';
        html += '<thead><tr><th>Month</th>';
        salesDisplay.forEach(function(p) { html += '<th colspan="3" class="rt-num rt-border">'+p+'</th>'; });
        html += '<th colspan="3" class="rt-num rt-border">Total</th>';
        html += '</tr><tr><th></th>';
        salesDisplay.forEach(function() { html += '<th class="rt-num rt-border">Target RM</th><th class="rt-num">Sales RM</th><th class="rt-num">Ach%</th>'; });
        html += '<th class="rt-num rt-border">Target RM</th><th class="rt-num">Sales RM</th><th class="rt-num">Ach%</th>';
        html += '</tr></thead><tbody>';
        displayMonths.forEach(function(m) {
            var hasData = salesDisplay.some(function(p){return peopleData[personKey(p)][m];});
            if (!hasData) return;
            var monthTarget = 0, monthSales = 0;
            html += '<tr><td style="font-weight:700;">'+m+'</td>';
            salesDisplay.forEach(function(p) {
                var d = peopleData[personKey(p)][m];
                if (d) { monthTarget += d.target || 0; monthSales += d.sales || 0; }
                html += '<td class="rt-num rt-mono rt-border">'+(d?fmtNum(d.target):'—')+'</td>';
                html += '<td class="rt-num rt-mono" style="font-weight:600;">'+(d?fmtNum(d.sales):'—')+'</td>';
                html += '<td class="rt-num rt-mono '+(d?achCls(d.ach):'')+'" style="font-weight:700;">'+(d?d.ach.toFixed(2)+'%':'—')+'</td>';
            });
            var monthAch = monthTarget > 0 ? (monthSales / monthTarget * 100) : 0;
            html += '<td class="rt-num rt-mono rt-border" style="font-weight:700;">'+(monthTarget > 0 ? fmtNum(monthTarget) : '—')+'</td>';
            html += '<td class="rt-num rt-mono" style="font-weight:800;">'+(monthSales > 0 ? fmtNum(monthSales) : '—')+'</td>';
            html += '<td class="rt-num rt-mono '+(monthTarget > 0 ? achCls(monthAch) : '')+'" style="font-weight:800;">'+(monthTarget > 0 ? monthAch.toFixed(2)+'%' : '—')+'</td>';
            html += '</tr>';
        });
        html += '<tr class="rt-total"><td>TOTAL</td>';
        var grandTarget = 0, grandSales = 0;
        salesDisplay.forEach(function(p) {
            var tT=0, tS=0; displayMonths.forEach(function(m){var d=peopleData[personKey(p)][m];if(d){tT+=d.target;tS+=d.sales;}});
            grandTarget += tT;
            grandSales += tS;
            var tA = tT>0?(tS/tT*100):0;
            html += '<td class="rt-num rt-mono rt-border">'+fmtNum(tT)+'</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(tS)+'</td>';
            html += '<td class="rt-num rt-mono '+achCls(tA)+'">'+tA.toFixed(2)+'%</td>';
        });
        var grandAch = grandTarget > 0 ? (grandSales / grandTarget * 100) : 0;
        html += '<td class="rt-num rt-mono rt-border">'+fmtNum(grandTarget)+'</td>';
        html += '<td class="rt-num rt-mono">'+fmtNum(grandSales)+'</td>';
        html += '<td class="rt-num rt-mono '+achCls(grandAch)+'">'+grandAch.toFixed(2)+'%</td>';
        html += '</tr></tbody></table></div></div>';
    }

    // ── Commission Summary (Sales) ──
    if (salesDisplay.length > 0) {
        html += '<div class="report-panel"><div class="report-panel-head report-panel-head--em">💰 Commission &amp; Incentive Summary (Sales)</div>';
        html += '<div class="report-panel-body"><table class="report-table"><thead><tr>';
        html += '<th>Person</th><th class="rt-num">Commission RM</th><th class="rt-num">Collection RM</th><th class="rt-num">Call Bonus RM</th><th class="rt-num">Quarterly RM</th><th class="rt-num">Total RM</th>';
        html += '</tr></thead><tbody>';
        salesDisplay.forEach(function(p) {
            var comm=0,coll=0,call=0,qtr=0; displayMonths.forEach(function(m){var d=peopleData[personKey(p)][m];if(d){comm+=d.commission||0;coll+=d.collInc||0;call+=d.callInc||0;qtr+=d.qtrBonus||0;}});
            html += '<tr><td style="font-weight:700;">'+p+'</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(comm)+'</td><td class="rt-num rt-mono">'+fmtNum(coll)+'</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(call)+'</td><td class="rt-num rt-mono">'+fmtNum(qtr)+'</td>';
            html += '<td class="rt-num rt-mono ach-good" style="font-weight:800;">'+fmtNum(comm+coll+call+qtr)+'</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    if (supervisorDisplay.length > 0) {
        html += '<div class="report-panel"><div class="report-panel-head">👔 Management Staff Incentive Summary</div>';
        html += '<div class="report-panel-body"><table class="report-table"><thead><tr>';
        html += '<th>Management Staff</th><th class="rt-num">Sale Inc RM</th><th class="rt-num">Collection Inc RM</th><th class="rt-num">Call Inc RM</th><th class="rt-num">Quarterly RM</th><th class="rt-num">Total RM</th>';
        html += '</tr></thead><tbody>';
        supervisorDisplay.forEach(function(p) {
            var sI=0,cI=0,caI=0,qI=0; displayMonths.forEach(function(m){var d=peopleData[personKey(p)][m];if(d&&d.type==='Supervisor'){sI+=d.saleInc||0;cI+=d.collInc||0;caI+=d.callInc||0;qI+=d.qtrInc||0;}});
            html += '<tr><td style="font-weight:700;">👔 '+p+'</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(sI)+'</td><td class="rt-num rt-mono">'+fmtNum(cI)+'</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(caI)+'</td><td class="rt-num rt-mono">'+fmtNum(qI)+'</td>';
            html += '<td class="rt-num rt-mono" style="font-weight:800;color:var(--vi);">'+fmtNum(sI+cI+caI+qI)+'</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    if (merchandiserDisplay.length > 0) {
        html += '<div class="report-panel"><div class="report-panel-head">🛠️ Support Staff Incentive Summary</div>';
        html += '<div class="report-panel-body"><table class="report-table"><thead><tr>';
        html += '<th>Support Staff</th><th class="rt-num">Total Blocks</th><th class="rt-num">Rate/Block RM</th><th class="rt-num">Months Active</th><th class="rt-num">Total Incentive RM</th>';
        html += '</tr></thead><tbody>';
        merchandiserDisplay.forEach(function(p) {
            var totBlocks=0, totInc=0, mc=0, rate=0;
            displayMonths.forEach(function(m){var d=peopleData[personKey(p)][m];if(d&&d.type==='Support Staff'){totBlocks+=d.blocks||0;totInc+=d.incentive||0;rate=d.rate||rate;mc++;}});
            html += '<tr><td style="font-weight:700;">🛠️ '+p+'</td>';
            html += '<td class="rt-num rt-mono" style="font-weight:700;">'+totBlocks+' blocks</td>';
            html += '<td class="rt-num rt-mono">'+fmtNum(rate)+'</td><td class="rt-num rt-mono">'+mc+'</td>';
            html += '<td class="rt-num rt-mono ach-warn" style="font-weight:800;">'+fmtNum(totInc)+'</td></tr>';
        });
        html += '</tbody></table></div></div>';
    }

    html += '<div class="annual-section-title">👤 Individual Annual Summary</div>';
    html += '<div class="annual-person-grid">';
    displayPeople.forEach(function(p) {
        var empType = getEmployeeType(p);
        var tS=0,tT=0,tComm=0,mc=0,totBlocks=0;
        displayMonths.forEach(function(m){
            var d = peopleData[personKey(p)][m]; if (!d) return;
            if (empType === 'Sales') { tS+=d.sales||0; tT+=d.target||0; tComm+=(d.commission||0)+(d.collInc||0)+(d.callInc||0)+(d.qtrBonus||0); mc++; }
            else if (empType === 'Supervisor') { tComm += d.total||0; mc++; }
            else if (empType === 'Support Staff') { totBlocks += d.blocks||0; tComm += d.incentive||0; mc++; }
        });
        var tAch = tT>0?(tS/tT*100):0;
        var sal = ((cfg.base_salaries&&cfg.base_salaries[p])||1700)*mc;
        var allow = cfg.allowances&&cfg.allowances[p] ? Object.values(cfg.allowances[p]).reduce(function(s,v){return s+(parseFloat(v)||0);},0)*mc : 0;
        var typeIcons = { Sales:'', Supervisor:'👔 ', 'Support Staff':'🛠️ ' };
        var headCls = empType==='Supervisor'?'annual-person-head--mgmt':empType==='Support Staff'?'annual-person-head--support':'annual-person-head--sales';
        html += '<div class="annual-person-card">';
        html += '<div class="annual-person-head '+headCls+'"><div class="annual-person-name">'+(typeIcons[empType]||'')+p+'</div><div class="annual-person-meta">'+mc+' months · '+empType+'</div></div>';
        html += '<div class="annual-person-body">';
        if (empType === 'Sales') {
            html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Total Sales</span><span class="annual-stat-val">'+fmt(tS)+'</span></div>';
            html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Achievement</span><span class="annual-stat-val '+achCls(tAch)+'">'+tAch.toFixed(2)+'%</span></div>';
        } else if (empType === 'Support Staff') {
            html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Total Blocks</span><span class="annual-stat-val">'+totBlocks+'</span></div>';
        } else {
            html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Earns From</span><span class="annual-stat-val" style="color:var(--vi);">Team Performance</span></div>';
        }
        html += '<div class="annual-stat-sep"></div>';
        html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Total Salary</span><span class="annual-stat-val">'+fmt(sal)+'</span></div>';
        html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Total Allowances</span><span class="annual-stat-val">'+fmt(allow)+'</span></div>';
        html += '<div class="annual-stat-row"><span class="annual-stat-lbl">Total Incentive</span><span class="annual-stat-val ach-good">'+fmt(tComm)+'</span></div>';
        html += '<div class="annual-stat-sep"></div>';
        html += '<div class="annual-stat-row annual-stat-total"><span class="annual-stat-lbl">Total Paid</span><span class="annual-stat-val">'+fmt(sal+allow+tComm)+'</span></div>';
        html += '</div></div>';
    });
    html += '</div>';
    body.innerHTML = html;
}
window.renderAnnualReport = renderAnnualReport;

// Show/hide the From–To range dropdowns when the Month mode changes, then re-render.
function onAnnualMonthModeChange() {
    var sel = document.getElementById('ar-month-select');
    var wrap = document.getElementById('ar-range-wrap');
    if (wrap) wrap.style.display = (sel && sel.value === 'RANGE') ? 'flex' : 'none';
    renderAnnualReport();
}
window.onAnnualMonthModeChange = onAnnualMonthModeChange;
function printAnnualReport() {
    var yearSel = document.getElementById('annual-year-select');
    var year = yearSel ? yearSel.value : new Date().getFullYear();

    if (_annualActiveView === 'cost') {
        // Print Outlays Report
        var body = document.getElementById('annual-panel-host');
        if (!body) return;
        var win = window.open('', '_blank');
        win.document.write('<html><head><title>Annual Outlays Report '+year+'</title><style>body{font-family:Sora,sans-serif;padding:24px;max-width:1100px;margin:0 auto;}h1{font-size:20px;font-weight:700;margin-bottom:20px;}</style></head><body>');
        win.document.write('<h1>Annual Outlays Report — '+year+'</h1>');
        win.document.write(body.innerHTML);
        win.document.write('</body></html>');
        win.document.close(); win.focus();
        setTimeout(function(){ win.print(); }, 300);
    } else {
        // Print Sales Report
        var body = document.getElementById('annual-panel-host');
        if (!body) return;
        var win = window.open('', '_blank');
        win.document.write('<html><head><title>Annual Sales Report '+year+'</title><style>body{font-family:Sora,sans-serif;padding:24px;max-width:1100px;margin:0 auto;}h1{font-size:20px;font-weight:700;margin-bottom:20px;}</style></head><body>');
        win.document.write('<h1>Annual Sales Report — '+year+'</h1>');
        win.document.write(body.innerHTML);
        win.document.write('</body></html>');
        win.document.close(); win.focus();
        setTimeout(function(){ win.print(); }, 300);
    }
}
window.printAnnualReport = printAnnualReport;

// ==================== ANNUAL REPORT PASSWORD ====================
function saveAnnualPassword() {
    var oldInp = document.getElementById('annual-pw-old');
    var newInp = document.getElementById('annual-pw-setting');
    var errEl = document.getElementById('annual-pw-change-err');
    
    var currentPw = (window.appState.config && window.appState.config.annual_password) || 'boss123';
    
    if (!oldInp || !oldInp.value.trim()) {
        if (errEl) errEl.textContent = '❌ Please enter current password';
        return;
    }
    if (oldInp.value.trim() !== currentPw) {
        if (errEl) errEl.textContent = '❌ Current password is wrong';
        oldInp.value = '';
        oldInp.focus();
        return;
    }
    if (!newInp || !newInp.value.trim()) {
        if (errEl) errEl.textContent = '❌ Please enter new password';
        return;
    }
    
    window.appState.config.annual_password = newInp.value.trim();
    saveConfig();
    window._annualUnlocked = false;
    window._settingsUnlocked = false;
    oldInp.value = '';
    newInp.value = '';
    if (errEl) errEl.textContent = '';
    showToast('✅', 'Password updated (Annual & Settings)');
}
window.saveAnnualPassword = saveAnnualPassword;

// Load existing password into settings field when opening settings
(function() {
    var origSwitchSettings = null;
    var checkSettingsPw = setInterval(function() {
        var inp = document.getElementById('annual-pw-setting');
        if (inp && window.appState && window.appState.config) {
            clearInterval(checkSettingsPw);
            // Show current password when settings tab opens
            var observer = new MutationObserver(function() {
                var settingsView = document.getElementById('view-settings');
                if (settingsView && settingsView.style.display === 'block') {
                    var pw = (window.appState.config.annual_password) || 'boss123';
                    inp.value = pw;
                }
            });
            var settingsView = document.getElementById('view-settings');
            if (settingsView) observer.observe(settingsView, {attributes:true, attributeFilter:['style']});
        }
    }, 1000);
})();

// ==================== ANNUAL VIEW TOGGLE ====================
var _annualActiveView = 'report';

function switchAnnualView(mode) {
    _annualActiveView = mode;
    var costSelectors = document.getElementById('employer-cost-selectors');
    var reportSelectors = document.getElementById('annual-report-selectors');
    var btnReport = document.getElementById('btn-annual-report');
    var btnCost = document.getElementById('btn-employer-cost');
    var title = document.getElementById('annual-page-title');

    if (mode === 'report') {
        if (costSelectors) costSelectors.style.display = 'none';
        if (reportSelectors) reportSelectors.style.display = '';
        if (btnReport) btnReport.classList.add('active');
        if (btnCost) btnCost.classList.remove('active');
        if (title) title.textContent = 'Annual Sales Report';
        renderAnnualReport();
    } else {
        if (costSelectors) costSelectors.style.display = '';
        if (reportSelectors) reportSelectors.style.display = 'none';
        if (btnCost) btnCost.classList.add('active');
        if (btnReport) btnReport.classList.remove('active');
        if (title) title.textContent = 'Annual Outlays Report';
        initEmployerCostSelectors();
        renderEmployerCostReport();
    }
}
window.switchAnnualView = switchAnnualView;

function onAnnualViewChange() {
    if (_annualActiveView === 'report') renderAnnualReport();
    else renderEmployerCostReport();
}
window.onAnnualViewChange = onAnnualViewChange;

function initEmployerCostSelectors() {
    var cfg = window.appState.config;
    var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var configPeople = Object.keys(cfg.base_salaries || {});
    var yearSelect = document.getElementById('annual-year-select');
    var curYear = new Date().getFullYear();
    if (yearSelect && yearSelect.options.length === 0) {
        [curYear - 1, curYear, curYear + 1].forEach(function(y) {
            var opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            if (y === curYear) opt.selected = true;
            yearSelect.appendChild(opt);
        });
    }

    // Month selector
    var mSel = document.getElementById('ec-month-select');
    if (mSel && mSel.options.length <= 1) {
        // Quarters
        var quarters = [
            {val:'Q1', label:'Q1 (JAN-MAR)'},
            {val:'Q2', label:'Q2 (APR-JUN)'},
            {val:'Q3', label:'Q3 (JUL-SEP)'},
            {val:'Q4', label:'Q4 (OCT-DEC)'}
        ];
        quarters.forEach(function(q) {
            var opt = document.createElement('option');
            opt.value = q.val; opt.textContent = q.label;
            mSel.appendChild(opt);
        });
        // Custom range
        var rangeOpt = document.createElement('option');
        rangeOpt.value = 'RANGE'; rangeOpt.textContent = '\uD83D\uDCD0 Custom range\u2026';
        mSel.appendChild(rangeOpt);
        // Individual months
        MONTHS.forEach(function(m) {
            var opt = document.createElement('option');
            opt.value = m; opt.textContent = m;
            mSel.appendChild(opt);
        });
    }

    // Person selector — refresh when roster changes
    var pSel = document.getElementById('ec-person-select');
    if (pSel) {
        var prevPerson = pSel.value || 'ALL';
        pSel.innerHTML = '<option value="ALL">All Employees</option>'
            + configPeople.map(function(name) {
                return '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>';
            }).join('');
        if (prevPerson === 'ALL' || configPeople.indexOf(prevPerson) !== -1) pSel.value = prevPerson;
        else pSel.value = 'ALL';
    }
}

function renderEmployerCostReport() {
    var body = document.getElementById('annual-panel-host');
    if (!body || _annualActiveView !== 'cost') return;
    initEmployerCostSelectors();
    var cfg = window.appState.config;
    var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var configPeople = Object.keys(cfg.base_salaries || {});
    var history = cfg.reportHistory || [];
    var yearSelect = document.getElementById('annual-year-select');
    var curYear = new Date().getFullYear();
    var selectedYear = yearSelect ? parseInt(yearSelect.value) : curYear;
    var monthSelect = document.getElementById('ec-month-select');
    var selectedMonth = monthSelect ? monthSelect.value : 'ALL';
    var personSelect = document.getElementById('ec-person-select');
    var selectedPerson = personSelect ? personSelect.value : 'ALL';

    // Group filter - only affects display, not data gathering
    var ecGroupSel = document.getElementById('ec-group-select');
    var selectedGroup = ecGroupSel ? ecGroupSel.value : 'ALL';
    var ecCostSel = document.getElementById('ec-cost-select');
    var selectedCostFilter = ecCostSel ? ecCostSel.value : 'ALL';

    // Map quarter values to month arrays
    var quarterMap = {
        Q1: ['JAN','FEB','MAR'],
        Q2: ['APR','MAY','JUN'],
        Q3: ['JUL','AUG','SEP'],
        Q4: ['OCT','NOV','DEC']
    };
    var filterMonths = null; // null = all months
    if (selectedMonth === 'RANGE') {
        // Custom range: From month .. To month (inclusive). Auto-swap if reversed.
        var fromSel = document.getElementById('ec-range-from');
        var toSel = document.getElementById('ec-range-to');
        var fromM = fromSel ? fromSel.value : 'JAN';
        var toM = toSel ? toSel.value : 'DEC';
        var fi = MONTHS.indexOf(fromM); if (fi < 0) fi = 0;
        var ti = MONTHS.indexOf(toM);  if (ti < 0) ti = MONTHS.length - 1;
        if (fi > ti) { var tmp = fi; fi = ti; ti = tmp; }
        filterMonths = MONTHS.slice(fi, ti + 1);
    } else if (selectedMonth !== 'ALL') {
        if (quarterMap[selectedMonth]) {
            filterMonths = quarterMap[selectedMonth];
        } else {
            filterMonths = [selectedMonth];
        }
    }
    // Human-readable label for the selected month scope (used in subtitle / cards).
    var ecMonthLabel = (selectedMonth === 'ALL')
        ? 'Full Year'
        : (selectedMonth === 'RANGE'
            ? (filterMonths.length ? filterMonths[0] + ' \u2013 ' + filterMonths[filterMonths.length - 1] : 'Range')
            : selectedMonth);

    function isMonthIncluded(m) {
        if (!filterMonths) return true;
        return filterMonths.indexOf(m) !== -1;
    }
    function fmt(n) { return 'RM ' + (n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); }
    function pct(v, t) { return t > 0 ? ((v/t)*100).toFixed(3)+'%' : '0.000%'; }
    function personKey(name) { return (name || '').toUpperCase(); }
    function histPerson(hEntry, name) {
        if (!hEntry || !hEntry.data) return null;
        var nu = personKey(name);
        return hEntry.data.find(function(d) { return personKey(d.name) === nu; }) || null;
    }
    function cfgSalary(name) {
        var nu = personKey(name);
        return (cfg.base_salaries && (cfg.base_salaries[nu] != null ? cfg.base_salaries[nu] : cfg.base_salaries[name])) || 0;
    }
    function cfgAllowances(name) {
        var nu = personKey(name);
        var bag = (cfg.allowances && (cfg.allowances[nu] || cfg.allowances[name])) || null;
        return bag ? Object.values(bag).reduce(function(s, v) { return s + (parseFloat(v) || 0); }, 0) : 0;
    }

    // Helper: team totals for a given month (Sales only)
    function _teamTotalsForMonth(m) {
        var hEntry = findHistEntry(history, m, selectedYear);
        if (!hEntry || !hEntry.data) return {sales:0, target:0, collAch:0, callAch:0};
        var tS=0, tT=0, tCo=0, tCoT=0, tCa=0, tCaT=0;
        hEntry.data.forEach(function(pd) {
            if (getEmployeeType(pd.name) !== 'Sales') return;
            tS += parseFloat(pd.sales)||0;
            tT += parseFloat(pd.target)||0;
            tCo += parseFloat(pd.collectionAmount)||0;
            tCoT += parseFloat(pd.collectionTarget)||0;
            tCa += parseFloat(pd.callActual)||0;
            tCaT += parseFloat(pd.callTarget)||0;
        });
        return {sales:tS, target:tT, collAch: tCoT>0?(tCo/tCoT*100):0, callAch: tCaT>0?(tCa/tCaT*100):0};
    }

    // Gather data per person
    var allPeopleData = {};
    configPeople.forEach(function(name) {
        if (filterMonths && filterMonths.length > 0 && filterMonths.every(function(m) { return !isEmployeeActiveInMonth(name, m, selectedYear); })) return;
        var empType = getEmployeeType(name);
        var nu = personKey(name);
        var salary = cfgSalary(name);
        var allowances = cfgAllowances(name);
        var employerEpfRate = (cfg.employer_epf_rates && (cfg.employer_epf_rates[nu] != null ? cfg.employer_epf_rates[nu] : cfg.employer_epf_rates[name])) || 13;
        var months = 0, totalSales = 0, totalTarget = 0, totalSalary = 0, totalAllow = 0;
        var totalComm = 0, totalCollInc = 0, totalCallInc = 0, totalQtrBonus = 0;
        var totalEmployerEpf = 0; // accumulated per month (Third Schedule is non-linear)
        var totalEmployerEis = 0; // accumulated per month (capped at RM6,000)
        var totalEmployerSocso = 0; // accumulated per month (band-based)

        MONTHS.forEach(function(m) {
            if (!isMonthIncluded(m)) return;
            if (typeof isEmployeeActiveInMonth === 'function' && !isEmployeeActiveInMonth(name, m, selectedYear)) return;
            var hEntry = findHistEntry(history, m, selectedYear);

            if (empType === 'Sales') {
                if (!hEntry || !hEntry.data) return;
                var pd = histPerson(hEntry, name);
                months++;
                var sales = pd ? (parseFloat(pd.sales) || 0) : 0;
                var target = pd ? (parseFloat(pd.target) || 0) : 0;
                totalSales += sales; totalTarget += target;
                totalSalary += salary; totalAllow += allowances;
                var collPct = pd && (pd.collectionTarget || 0) > 0 ? (pd.collectionAmount || 0) / pd.collectionTarget * 100 : 0;
                var callPct = pd && (pd.callTarget || 0) > 0 ? (pd.callActual || 0) / pd.callTarget * 100 : 0;
                var collI = calculateIncentive(collPct, collectionIncentiveTiersFor(name));
                var callI = calculateIncentive(callPct, activeCallIncentiveTiersFor(name));
                var ach = target > 0 ? (sales / target * 100) : 0;
                var isQtr = ['MAR','JUN','SEP','DEC'].indexOf(m) !== -1;
                var qtrI = isQtr ? calculateIncentive(ach, quarterlyIncentiveTiersFor(name)) : 0;
                var comm = calculateCommission(sales, target, name);
                totalComm += comm; totalCollInc += collI; totalCallInc += callI; totalQtrBonus += qtrI;
                var _mgS = salary + allowances + comm + collI + callI + qtrI;
                totalEmployerEpf += (typeof computeEpf === 'function') ? computeEpf(name, _mgS, m, selectedYear).employer : _mgS * employerEpfRate / 100;
                totalEmployerEis += (typeof computeEis === 'function') ? computeEis(name, _mgS, m, selectedYear).employer : 0;
                totalEmployerSocso += (typeof computeSocso === 'function') ? computeSocso(name, _mgS, m, selectedYear).employer : 0;
            } else if (empType === 'Supervisor') {
                if (!hEntry || !hEntry.data) return;
                months++;
                totalSalary += salary; totalAllow += allowances;
                var team = _teamTotalsForMonth(m);
                var _svSale = 0, _svColl = 0, _svCall = 0, _svQtr = 0;
                if (team.target > 0) {
                    var teamAchM = team.sales / team.target * 100;
                    var saleT = (cfg.person_supervisor_sale_tiers && (cfg.person_supervisor_sale_tiers[nu] || cfg.person_supervisor_sale_tiers[name])) || cfg.supervisor_sale_tiers || [];
                    var collT = (cfg.person_supervisor_coll_tiers && (cfg.person_supervisor_coll_tiers[nu] || cfg.person_supervisor_coll_tiers[name])) || cfg.supervisor_coll_tiers || [];
                    var callT = (cfg.person_supervisor_call_tiers && (cfg.person_supervisor_call_tiers[nu] || cfg.person_supervisor_call_tiers[name])) || cfg.supervisor_call_tiers || [];
                    var qtrT  = (cfg.person_supervisor_qtr_tiers && (cfg.person_supervisor_qtr_tiers[nu] || cfg.person_supervisor_qtr_tiers[name])) || cfg.supervisor_qtr_tiers || [];
                    _svSale = getTierAmt(saleT, teamAchM);
                    _svColl = getTierAmt(collT, team.collAch);
                    _svCall = getTierAmt(callT, team.callAch);
                    _svQtr  = (['MAR','JUN','SEP','DEC'].indexOf(m) !== -1) ? getTierAmt(qtrT, teamAchM) : 0;
                }
                totalComm += _svSale; totalCollInc += _svColl; totalCallInc += _svCall; totalQtrBonus += _svQtr;
                var _mgV = salary + allowances + _svSale + _svColl + _svCall + _svQtr;
                totalEmployerEpf += (typeof computeEpf === 'function') ? computeEpf(name, _mgV, m, selectedYear).employer : _mgV * employerEpfRate / 100;
                totalEmployerEis += (typeof computeEis === 'function') ? computeEis(name, _mgV, m, selectedYear).employer : 0;
                totalEmployerSocso += (typeof computeSocso === 'function') ? computeSocso(name, _mgV, m, selectedYear).employer : 0;
            } else if (empType === 'Support Staff') {
                var pd = (hEntry && hEntry.data) ? histPerson(hEntry, name) : null;
                months++;
                totalSalary += salary; totalAllow += allowances;
                var blocks = pd ? (parseFloat(pd.collectionAmount) || 0) : 0;
                var rate = (cfg.person_merchandiser_rates && cfg.person_merchandiser_rates[nu] != null)
                    ? parseFloat(cfg.person_merchandiser_rates[nu])
                    : (cfg.person_merchandiser_rates && cfg.person_merchandiser_rates[name] != null)
                        ? parseFloat(cfg.person_merchandiser_rates[name])
                        : (parseFloat(cfg.merchandiser_block_rate) || 10);
                // Put merchandiser incentive into totalComm field (reused for display consistency)
                var _blkInc = blocks * rate;
                totalComm += _blkInc;
                var _mgB = salary + allowances + _blkInc;
                totalEmployerEpf += (typeof computeEpf === 'function') ? computeEpf(name, _mgB, m, selectedYear).employer : _mgB * employerEpfRate / 100;
                totalEmployerEis += (typeof computeEis === 'function') ? computeEis(name, _mgB, m, selectedYear).employer : 0;
                totalEmployerSocso += (typeof computeSocso === 'function') ? computeSocso(name, _mgB, m, selectedYear).employer : 0;
            }
        });

        var totalIncentive = totalCollInc + totalCallInc + totalQtrBonus;
        var totalPay = totalSalary + totalAllow + totalComm + totalIncentive;
        var employerEpf = totalEmployerEpf;
        var employerEis = totalEmployerEis;
        var employerSocso = totalEmployerSocso;
        var totalCost = totalPay + employerEpf + employerEis + employerSocso;

        allPeopleData[name] = { name:name, type:empType, months:months, totalSales:totalSales, totalTarget:totalTarget, totalSalary:totalSalary, totalAllow:totalAllow, totalComm:totalComm, totalCollInc:totalCollInc, totalCallInc:totalCallInc, totalQtrBonus:totalQtrBonus, totalIncentive:totalIncentive, totalPay:totalPay, employerEpf:employerEpf, employerEis:employerEis, employerSocso:employerSocso, totalCost:totalCost, epfRate:employerEpfRate };
    });

    // Team totals (always all people for TEAM%)
    // teamSales = total sales from ALL Sales-type employees
    var teamSales = 0;
    configPeople.forEach(function(name) {
        if (getEmployeeType(name) === 'Sales' && allPeopleData[name]) {
            teamSales += allPeopleData[name].totalSales;
        }
    });

    // Filter display people
    var displayPeople = selectedPerson === 'ALL' ? configPeople : [selectedPerson];
    displayPeople = displayPeople.filter(function(n) { return allPeopleData[n]; });
    // Apply group filter
    if (selectedGroup !== 'ALL') {
        displayPeople = displayPeople.filter(function(n) { return getEmployeeType(n) === selectedGroup; });
    }
    // When a month/quarter is selected, hide anyone not employed in that scope
    if (filterMonths && filterMonths.length) {
        displayPeople = displayPeople.filter(function(n) {
            return filterMonths.some(function(m) { return isEmployeeActiveInMonth(n, m, selectedYear); });
        });
    }

    var displayTotalCost = 0;

    function ecCostCategory(key) {
        if (key === 'salary') return 'SALARY';
        if (key === 'allow') return 'ALLOWANCE';
        if (key === 'comm') return 'COMMISSION';
        if (key === 'collInc' || key === 'callInc' || key === 'qtrBonus') return 'INCENTIVE';
        if (key === 'epf') return 'EPF';
        if (key === 'socso') return 'SOCSO';
        if (key === 'eis') return 'EIS';
        return 'OTHER';
    }
    function ecCostMatches(key) {
        if (selectedCostFilter === 'ALL') return true;
        return ecCostCategory(key) === selectedCostFilter;
    }
    function ecPersonFilteredAmount(p) {
        var sum = 0;
        if (ecCostMatches('salary')) sum += p.totalSalary || 0;
        if (ecCostMatches('allow')) sum += p.totalAllow || 0;
        if (ecCostMatches('comm')) sum += p.totalComm || 0;
        if (ecCostMatches('collInc')) sum += p.totalCollInc || 0;
        if (ecCostMatches('callInc')) sum += p.totalCallInc || 0;
        if (ecCostMatches('qtrBonus')) sum += p.totalQtrBonus || 0;
        if (ecCostMatches('epf')) sum += p.employerEpf || 0;
        if (ecCostMatches('socso')) sum += p.employerSocso || 0;
        if (ecCostMatches('eis')) sum += p.employerEis || 0;
        return sum;
    }
    function ecGroupFilteredAmount(g) {
        var sum = 0;
        if (ecCostMatches('salary')) sum += g.salary || 0;
        if (ecCostMatches('allow')) sum += g.allow || 0;
        if (ecCostMatches('comm')) sum += g.comm || 0;
        if (ecCostMatches('collInc')) sum += g.collInc || 0;
        if (ecCostMatches('callInc')) sum += g.callInc || 0;
        if (ecCostMatches('qtrBonus')) sum += g.qtrBonus || 0;
        if (ecCostMatches('epf')) sum += g.epf || 0;
        if (ecCostMatches('socso')) sum += g.socso || 0;
        if (ecCostMatches('eis')) sum += g.eis || 0;
        return sum;
    }
    function ecShowPayrollSection() {
        return ecCostMatches('salary') || ecCostMatches('allow') || ecCostMatches('comm')
            || ecCostMatches('collInc') || ecCostMatches('callInc') || ecCostMatches('qtrBonus');
    }
    function ecShowStatutorySection() {
        return ecCostMatches('epf') || ecCostMatches('socso') || ecCostMatches('eis');
    }
    function ecFilteredPayAmount(p) {
        var sum = 0;
        if (ecCostMatches('salary')) sum += p.totalSalary || 0;
        if (ecCostMatches('allow')) sum += p.totalAllow || 0;
        if (ecCostMatches('comm')) sum += p.totalComm || 0;
        if (ecCostMatches('collInc')) sum += p.totalCollInc || 0;
        if (ecCostMatches('callInc')) sum += p.totalCallInc || 0;
        if (ecCostMatches('qtrBonus')) sum += p.totalQtrBonus || 0;
        return sum;
    }
    function ecFilteredPayAmountGroup(g) {
        var sum = 0;
        if (ecCostMatches('salary')) sum += g.salary || 0;
        if (ecCostMatches('allow')) sum += g.allow || 0;
        if (ecCostMatches('comm')) sum += g.comm || 0;
        if (ecCostMatches('collInc')) sum += g.collInc || 0;
        if (ecCostMatches('callInc')) sum += g.callInc || 0;
        if (ecCostMatches('qtrBonus')) sum += g.qtrBonus || 0;
        return sum;
    }

    displayPeople.forEach(function(n) {
        var p = allPeopleData[n];
        if (!p || p.months === 0) return;
        displayTotalCost += selectedCostFilter === 'ALL' ? p.totalCost : ecPersonFilteredAmount(p);
    });

    var ecCostKpiLabels = {
        ALL: 'Total Expenses (RM)',
        SALARY: 'Total Salary (RM)',
        ALLOWANCE: 'Total Allowances (RM)',
        COMMISSION: 'Total Commission (RM)',
        INCENTIVE: 'Total Incentive (RM)',
        EPF: 'Total Employer EPF (RM)',
        SOCSO: 'Total Employer SOCSO (RM)',
        EIS: 'Total Employer EIS (RM)'
    };
    var ecCostFilterLabel = {
        ALL: '',
        SALARY: ' · Salary',
        ALLOWANCE: ' · Allowances',
        COMMISSION: ' · Commission',
        INCENTIVE: ' · Incentive',
        EPF: ' · Employer EPF',
        SOCSO: ' · Employer SOCSO',
        EIS: ' · Employer EIS'
    };

    var sub = document.getElementById('annual-sub');
    if (sub) sub.textContent = (selectedPerson === 'ALL' ? 'All Employees' : selectedPerson) + ' · ' + ecMonthLabel + ' ' + selectedYear + (ecCostFilterLabel[selectedCostFilter] || '');

    // Build HTML
    var html = '';

    // Summary cards
    html += '<div class="dash-kpi-grid report-kpi-grid">';
    html += '<div class="dash-kpi dash-kpi--good"><div class="dash-kpi-lbl">Grand Total Sales</div><div class="dash-kpi-val">'+fmt(teamSales)+'</div></div>';
    html += '<div class="dash-kpi dash-kpi--cost"><div class="dash-kpi-lbl">'+(ecCostKpiLabels[selectedCostFilter] || 'Filtered Total (RM)')+'</div><div class="dash-kpi-val">'+fmt(displayTotalCost)+'</div></div>';
    html += '<div class="dash-kpi dash-kpi--ratio"><div class="dash-kpi-lbl">Expenses / Sales</div><div class="dash-kpi-val">'+pct(displayTotalCost, teamSales)+'</div></div>';
    html += '</div>';

    function ecGroupRowIf(key, label, val, hasIndv, base, rowCls) {
        if (!ecCostMatches(key)) return '';
        if (selectedCostFilter !== 'ALL' && !val) return '';
        return ecGroupRow(label, val, hasIndv, base, rowCls);
    }

    function aggregateGroupTotals(members) {
        var g = {
            salary: 0, allow: 0, comm: 0, collInc: 0, callInc: 0, qtrBonus: 0,
            pay: 0, epf: 0, socso: 0, eis: 0, cost: 0, sales: 0, months: 0, headcount: 0
        };
        members.forEach(function(n) {
            var p = allPeopleData[n];
            if (!p || p.months === 0) return;
            g.headcount++;
            g.months += p.months;
            g.sales += p.totalSales;
            g.salary += p.totalSalary;
            g.allow += p.totalAllow;
            g.comm += p.totalComm;
            g.collInc += p.totalCollInc;
            g.callInc += p.totalCallInc;
            g.qtrBonus += p.totalQtrBonus;
            g.pay += p.totalPay;
            g.epf += p.employerEpf;
            g.socso += p.employerSocso;
            g.eis += p.employerEis;
            g.cost += p.totalCost;
        });
        return g;
    }

    function ecGroupRow(label, val, hasIndv, indvBase, rowCls) {
        rowCls = rowCls || 'rt-expense';
        if (hasIndv) {
            return '<tr class="'+rowCls+'"><td>'+label+'</td><td class="rt-num rt-mono">'+fmt(val)+'</td><td class="rt-num rt-mono">'+pct(val, indvBase)+'</td><td class="rt-num rt-mono">'+pct(val, teamSales)+'</td></tr>';
        }
        return '<tr class="'+rowCls+'"><td>'+label+'</td><td class="rt-num rt-mono">'+fmt(val)+'</td><td class="rt-num rt-mono">'+pct(val, teamSales)+'</td></tr>';
    }

    function renderGroupGrandTotal(groupCfg, members) {
        if (!members.length) return '';
        var g = aggregateGroupTotals(members);
        var filteredTotal = selectedCostFilter === 'ALL' ? g.cost : ecGroupFilteredAmount(g);
        if (filteredTotal <= 0) return '';

        var empType = groupCfg.type;
        var hasIndv = false;
        var colspan = 3;
        var subLbl = g.headcount + ' staff · ' + ecMonthLabel + ' ' + selectedYear;

        var out = '<div class="report-panel">';
        out += '<div class="ec-card-head ec-card-head--group-grand">';
        out += '<div><div class="ec-card-title">'+groupCfg.icon+' '+groupCfg.title+' — Grand Total</div>';
        out += '<div class="ec-card-sub">'+subLbl+'</div></div>';
        if (selectedCostFilter === 'ALL' && (empType === 'Sales' || empType === 'ALL')) {
            out += '<div class="ec-card-sales"><div class="ec-card-sales-lbl">Team Sales</div><div class="ec-card-sales-val">'+fmt(empType === 'ALL' ? teamSales : g.sales)+'</div></div>';
        } else if (selectedCostFilter === 'ALL') {
            out += '<div class="ec-card-sales"><div class="ec-card-sales-lbl">Total Expenses</div><div class="ec-card-sales-val">'+fmt(g.cost)+'</div></div>';
        } else {
            out += '<div class="ec-card-sales"><div class="ec-card-sales-lbl">Filtered Total</div><div class="ec-card-sales-val">'+fmt(filteredTotal)+'</div></div>';
        }
        out += '</div>';
        out += '<table class="report-table">';
        out += '<thead><tr><th style="width:45%;">Cost Item</th><th class="rt-num" style="width:30%;">Amount</th><th class="rt-num" style="width:25%;">TEAM%</th></tr></thead>';
        out += '<tbody>';
        if (selectedCostFilter === 'ALL' && (empType === 'Sales' || empType === 'ALL')) {
            var revSales = empType === 'ALL' ? teamSales : g.sales;
            out += '<tr class="rt-revenue"><td>📈 Sales Revenue</td><td class="rt-num rt-mono">'+fmt(revSales)+'</td><td class="rt-num rt-mono">'+pct(revSales, teamSales)+'</td></tr>';
        }
        if (ecShowPayrollSection()) {
            out += '<tr class="rt-section"><td colspan="'+colspan+'">Payroll &amp; Incentives</td></tr>';
            out += ecGroupRowIf('salary', '💵 Basic Salary', g.salary, hasIndv, teamSales);
            out += ecGroupRowIf('allow', '🏠 Allowances', g.allow, hasIndv, teamSales);

            if (empType === 'Sales') {
                out += ecGroupRowIf('comm', '💰 Commission', g.comm, hasIndv, teamSales);
                out += ecGroupRowIf('collInc', '📦 Collection Incentive', g.collInc, hasIndv, teamSales);
                out += ecGroupRowIf('callInc', '📞 Call Incentive', g.callInc, hasIndv, teamSales);
                out += ecGroupRowIf('qtrBonus', '🏆 Quarterly Incentive', g.qtrBonus, hasIndv, teamSales);
            } else if (empType === 'Supervisor') {
                out += ecGroupRowIf('comm', '💰 Sale Incentive', g.comm, hasIndv, teamSales);
                out += ecGroupRowIf('collInc', '📦 Collection Incentive', g.collInc, hasIndv, teamSales);
                out += ecGroupRowIf('callInc', '📞 Call Incentive', g.callInc, hasIndv, teamSales);
                out += ecGroupRowIf('qtrBonus', '🏆 Quarterly Incentive', g.qtrBonus, hasIndv, teamSales);
            } else if (empType === 'Support Staff') {
                out += ecGroupRowIf('comm', '📦 Block Incentive', g.comm, hasIndv, teamSales);
            } else if (empType === 'ALL') {
                out += ecGroupRowIf('comm', '💰 Commission / Incentive', g.comm, hasIndv, teamSales);
                out += ecGroupRowIf('collInc', '📦 Collection Incentive', g.collInc, hasIndv, teamSales);
                out += ecGroupRowIf('callInc', '📞 Call Incentive', g.callInc, hasIndv, teamSales);
                out += ecGroupRowIf('qtrBonus', '🏆 Quarterly Incentive', g.qtrBonus, hasIndv, teamSales);
            }

            if (selectedCostFilter === 'ALL') {
                out += ecGroupRow('Total Pay', g.pay, hasIndv, teamSales, 'rt-highlight');
            } else if (ecFilteredPayAmountGroup(g) > 0) {
                out += ecGroupRow('Filtered Pay Total', ecFilteredPayAmountGroup(g), hasIndv, teamSales, 'rt-highlight');
            }
        }
        if (ecShowStatutorySection()) {
            out += '<tr class="rt-section"><td colspan="'+colspan+'">Employer Statutory</td></tr>';
            out += ecGroupRowIf('epf', '🏛️ Employer EPF', g.epf, hasIndv, teamSales);
            out += ecGroupRowIf('socso', '🏛️ Employer SOCSO', g.socso, hasIndv, teamSales);
            out += ecGroupRowIf('eis', '🏛️ Employer EIS (0.2%)', g.eis, hasIndv, teamSales);
        }
        var footerLbl = selectedCostFilter === 'ALL' ? '⚠️ GRAND TOTAL EXPENSES' : '⚠️ FILTERED TOTAL';
        out += ecGroupRow(footerLbl, filteredTotal, hasIndv, teamSales, 'rt-total-group');
        out += '</tbody></table></div>';
        return out;
    }

    function renderPersonExpenseTable(name) {
        var p = allPeopleData[name];
        if (!p || p.months === 0) return '';
        var filteredTotal = selectedCostFilter === 'ALL' ? p.totalCost : ecPersonFilteredAmount(p);
        if (filteredTotal <= 0) return '';
        var empType = p.type || 'Sales';

        var out = '<div class="report-panel">';
        var typeTag = empType==='Supervisor'?' 👔':empType==='Support Staff'?' 🛠️':'';
        out += '<div class="ec-card-head">';
        out += '<div><div class="ec-card-title">'+name+typeTag+'</div><div class="ec-card-sub" style="color:rgba(255,255,255,.75);">'+p.months+' months · '+ecMonthLabel+' '+selectedYear+'</div></div>';
        if (selectedCostFilter === 'ALL' && empType === 'Sales') {
            out += '<div class="ec-card-sales"><div class="ec-card-sales-lbl">Sales</div><div class="ec-card-sales-val">'+fmt(p.totalSales)+'</div></div>';
        } else if (selectedCostFilter !== 'ALL') {
            out += '<div class="ec-card-sales"><div class="ec-card-sales-lbl">Filtered Total</div><div class="ec-card-sales-val">'+fmt(filteredTotal)+'</div></div>';
        }
        out += '</div>';

        var hasIndv = (empType === 'Sales');
        out += '<table class="report-table">';
        if (hasIndv) {
            out += '<thead><tr><th style="width:40%;">Cost Item</th><th class="rt-num" style="width:25%;">Amount</th><th class="rt-num" style="width:17%;">INDV%</th><th class="rt-num" style="width:18%;">TEAM%</th></tr></thead>';
        } else {
            out += '<thead><tr><th style="width:45%;">Cost Item</th><th class="rt-num" style="width:30%;">Amount</th><th class="rt-num" style="width:25%;">TEAM%</th></tr></thead>';
        }
        out += '<tbody>';

        if (selectedCostFilter === 'ALL' && empType === 'Sales') {
            out += '<tr class="rt-revenue"><td>📈 Sales Revenue</td><td class="rt-num rt-mono">'+fmt(p.totalSales)+'</td><td class="rt-num rt-mono">100.000%</td><td class="rt-num rt-mono">'+pct(p.totalSales,teamSales)+'</td></tr>';
        }

        function personRowIf(key, label, val) {
            if (!ecCostMatches(key)) return '';
            if (selectedCostFilter !== 'ALL' && !val) return '';
            if (hasIndv) {
                return '<tr class="rt-expense"><td>'+label+'</td><td class="rt-num rt-mono">'+fmt(val)+'</td><td class="rt-num rt-mono">'+pct(val,p.totalSales)+'</td><td class="rt-num rt-mono">'+pct(val,teamSales)+'</td></tr>';
            }
            return '<tr class="rt-expense"><td>'+label+'</td><td class="rt-num rt-mono">'+fmt(val)+'</td><td class="rt-num rt-mono">'+pct(val,teamSales)+'</td></tr>';
        }

        if (ecShowPayrollSection()) {
            out += '<tr class="rt-section"><td colspan="'+(hasIndv?4:3)+'">Expenses</td></tr>';
            out += personRowIf('salary', '💵 Basic Salary', p.totalSalary);
            out += personRowIf('allow', '🏠 Allowances', p.totalAllow);

            if (empType === 'Sales') {
                out += personRowIf('comm', '💰 Commission', p.totalComm);
                out += personRowIf('collInc', '📦 Collection Incentive', p.totalCollInc);
                out += personRowIf('callInc', '📞 Call Incentive', p.totalCallInc);
                out += personRowIf('qtrBonus', '🏆 Quarterly Incentive', p.totalQtrBonus);
            } else if (empType === 'Supervisor') {
                out += personRowIf('comm', '💰 Sale Incentive', p.totalComm);
                out += personRowIf('collInc', '📦 Collection Incentive', p.totalCollInc);
                out += personRowIf('callInc', '📞 Call Incentive', p.totalCallInc);
                out += personRowIf('qtrBonus', '🏆 Quarterly Incentive', p.totalQtrBonus);
            } else if (empType === 'Support Staff') {
                out += personRowIf('comm', '📦 Block Incentive', p.totalComm);
            }

            if (selectedCostFilter === 'ALL') {
                if (hasIndv) {
                    out += '<tr class="rt-highlight"><td>Total Pay</td><td class="rt-num rt-mono">'+fmt(p.totalPay)+'</td><td class="rt-num rt-mono">'+pct(p.totalPay,p.totalSales)+'</td><td class="rt-num rt-mono">'+pct(p.totalPay,teamSales)+'</td></tr>';
                } else {
                    out += '<tr class="rt-highlight"><td>Total Pay</td><td class="rt-num rt-mono">'+fmt(p.totalPay)+'</td><td class="rt-num rt-mono">'+pct(p.totalPay,teamSales)+'</td></tr>';
                }
            } else if (ecFilteredPayAmount(p) > 0) {
                if (hasIndv) {
                    out += '<tr class="rt-highlight"><td>Filtered Pay Total</td><td class="rt-num rt-mono">'+fmt(ecFilteredPayAmount(p))+'</td><td class="rt-num rt-mono">'+pct(ecFilteredPayAmount(p),p.totalSales)+'</td><td class="rt-num rt-mono">'+pct(ecFilteredPayAmount(p),teamSales)+'</td></tr>';
                } else {
                    out += '<tr class="rt-highlight"><td>Filtered Pay Total</td><td class="rt-num rt-mono">'+fmt(ecFilteredPayAmount(p))+'</td><td class="rt-num rt-mono">'+pct(ecFilteredPayAmount(p),teamSales)+'</td></tr>';
                }
            }
        }

        if (ecShowStatutorySection()) {
            out += '<tr class="rt-section"><td colspan="'+(hasIndv?4:3)+'">Employer Statutory</td></tr>';
            out += personRowIf('epf', '🏛️ Employer EPF', p.employerEpf);
            out += personRowIf('socso', '🏛️ Employer SOCSO', p.employerSocso);
            out += personRowIf('eis', '🏛️ Employer EIS (0.2%)', p.employerEis);
        }

        var footerLbl = selectedCostFilter === 'ALL' ? '⚠️ TOTAL EXPENSES' : '⚠️ FILTERED TOTAL';
        if (hasIndv) {
            out += '<tr class="rt-total-dark"><td>'+footerLbl+'</td><td class="rt-num rt-mono">'+fmt(filteredTotal)+'</td><td class="rt-num rt-mono">'+pct(filteredTotal,p.totalSales)+'</td><td class="rt-num rt-mono">'+pct(filteredTotal,teamSales)+'</td></tr>';
        } else {
            out += '<tr class="rt-total-dark"><td>'+footerLbl+'</td><td class="rt-num rt-mono">'+fmt(filteredTotal)+'</td><td class="rt-num rt-mono">'+pct(filteredTotal,teamSales)+'</td></tr>';
        }

        out += '</tbody></table></div>';
        return out;
    }

    function activeMembers() {
        return displayPeople.filter(function(n) {
            var p = allPeopleData[n];
            if (!p || p.months === 0) return false;
            if (filterMonths && filterMonths.length && typeof isEmployeeActiveInMonth === 'function') {
                return filterMonths.some(function(m) { return isEmployeeActiveInMonth(n, m, selectedYear); });
            }
            return true;
        });
    }

    var GROUP_SECTIONS = [
        { type: 'Sales', title: 'Sales Team', icon: '💼' },
        { type: 'Supervisor', title: 'Management Staff', icon: '👔' },
        { type: 'Support Staff', title: 'Support Staff', icon: '🛠️' }
    ];

    if (selectedGroup === 'ALL') {
        var allMembers = activeMembers();
        if (allMembers.length) {
            html += renderGroupGrandTotal({ type: 'ALL', title: 'All Staff', icon: '👥' }, allMembers);
            allMembers.forEach(function(name) {
                html += renderPersonExpenseTable(name);
            });
        }
    } else {
        var groupCfg = null;
        GROUP_SECTIONS.forEach(function(g) { if (g.type === selectedGroup) groupCfg = g; });
        if (groupCfg) {
            var members = activeMembers();
            if (members.length) {
                html += renderGroupGrandTotal(groupCfg, members);
                members.forEach(function(name) {
                    html += renderPersonExpenseTable(name);
                });
            }
        }
    }

    body.innerHTML = html;
}
window.renderEmployerCostReport = renderEmployerCostReport;

// Show/hide the Expenses From–To range dropdowns when the Month mode changes, then re-render.
function onEcMonthModeChange() {
    var sel = document.getElementById('ec-month-select');
    var wrap = document.getElementById('ec-range-wrap');
    if (wrap) wrap.style.display = (sel && sel.value === 'RANGE') ? 'flex' : 'none';
    renderEmployerCostReport();
}
window.onEcMonthModeChange = onEcMonthModeChange;

// ==================== SUPERVISOR INCENTIVE MODAL ====================
function showSupervisorIncentiveModal(personName) {
    var ex = document.getElementById('supervisor-setup-modal'); if (ex) ex.remove();
    var cfg = window.appState.config;

    // Load tiers (per-person override or company default)
    if (!cfg.person_supervisor_sale_tiers) cfg.person_supervisor_sale_tiers = {};
    if (!cfg.person_supervisor_coll_tiers) cfg.person_supervisor_coll_tiers = {};
    if (!cfg.person_supervisor_call_tiers) cfg.person_supervisor_call_tiers = {};
    if (!cfg.person_supervisor_qtr_tiers)  cfg.person_supervisor_qtr_tiers  = {};

    window._tempSupSale = JSON.parse(JSON.stringify(cfg.person_supervisor_sale_tiers[personName] || cfg.supervisor_sale_tiers || []));
    window._tempSupColl = JSON.parse(JSON.stringify(cfg.person_supervisor_coll_tiers[personName] || cfg.supervisor_coll_tiers || []));
    window._tempSupCall = JSON.parse(JSON.stringify(cfg.person_supervisor_call_tiers[personName] || cfg.supervisor_call_tiers || []));
    window._tempSupQtr  = JSON.parse(JSON.stringify(cfg.person_supervisor_qtr_tiers[personName]  || cfg.supervisor_qtr_tiers  || []));

    var modal = document.createElement('div');
    modal.id = 'supervisor-setup-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;width:100%;max-width:760px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);';
    card.innerHTML = '<div style="padding:18px 24px;background:linear-gradient(135deg,#7c3aed,#6b21a8);color:#fff;">'
        + '<div style="font-size:12px;font-weight:700;opacity:.85;letter-spacing:1px;text-transform:uppercase;">Step 2 of 2 · Supervisor Setup</div>'
        + '<div style="font-size:18px;font-weight:800;margin-top:4px;">👔 '+personName+' — Incentive Tiers</div>'
        + '<div style="font-size:12px;opacity:.8;margin-top:2px;">All incentives are based on team performance (not individual)</div>'
        + '</div>'
        + '<div id="sup-body" style="padding:20px 24px;overflow-y:auto;flex:1;">'
        + renderSupTiersSection('Sale Incentive', 'by Team Sales Ach %', '_tempSupSale', '#7c3aed')
        + renderSupTiersSection('Collection Incentive', 'by Team Collection Ach %', '_tempSupColl', '#2563eb')
        + renderSupTiersSection('Active Call Incentive', 'by Team Call Ach %', '_tempSupCall', '#0891b2')
        + renderSupTiersSection('Quarterly Incentive', 'by Team Quarterly Ach %', '_tempSupQtr', '#d97706')
        + '</div>'
        + '<div style="padding:14px 24px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;background:#f8fafc;flex-shrink:0;">'
        + '<button id="sup-cancel" style="padding:9px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        + '<button id="sup-save" style="padding:9px 24px;border:none;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#6b21a8);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save</button>'
        + '</div>';

    modal.appendChild(card);
    document.body.appendChild(modal);

    document.getElementById('sup-cancel').addEventListener('click', function(){ modal.remove(); });
    document.getElementById('sup-save').addEventListener('click', function(){ saveSupervisorIncentiveModal(personName); });

    bindSupTierInputs();
}

function renderSupTiersSection(title, sub, tempVar, accent) {
    var tiers = window[tempVar];
    if (!Array.isArray(tiers)) { tiers = []; window[tempVar] = tiers; }
    var html = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:12px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">';
    html += '<div><div style="font-size:12px;font-weight:700;color:'+accent+';">'+title+'</div><div style="font-size:10px;color:#64748b;">'+sub+'</div></div>';
    html += '<button onclick="addSupTier(\''+tempVar+'\')" style="padding:5px 12px;border:1px solid '+accent+';color:'+accent+';background:#fff;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">+ Add Tier</button>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:60px 1fr 1fr 1fr 30px;gap:6px;font-size:10px;font-weight:700;color:#64748b;margin-bottom:4px;padding:0 6px;">';
    html += '<div>LBL</div><div>MIN%</div><div>MAX%</div><div>AMOUNT (RM)</div><div></div></div>';
    html += '<div id="sup-rows-'+tempVar+'">';
    tiers.forEach(function(t, i) {
        html += '<div style="display:grid;grid-template-columns:60px 1fr 1fr 1fr 30px;gap:6px;margin-bottom:4px;">'
            + '<input type="text" data-var="'+tempVar+'" data-idx="'+i+'" data-field="label" value="'+(t.label||'')+'" placeholder="80%+" style="padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:11px;">'
            + '<input type="number" data-var="'+tempVar+'" data-idx="'+i+'" data-field="min" value="'+(t.min||0)+'" step="0.01" style="padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:11px;">'
            + '<input type="number" data-var="'+tempVar+'" data-idx="'+i+'" data-field="max" value="'+(t.max||0)+'" step="0.01" style="padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:11px;">'
            + '<input type="number" data-var="'+tempVar+'" data-idx="'+i+'" data-field="amt" value="'+(t.amt||0)+'" step="0.01" style="padding:6px 8px;border:1.5px solid #e2e8f0;border-radius:6px;font-size:11px;">'
            + '<button onclick="removeSupTier(\''+tempVar+'\','+i+')" style="border:none;background:#fff1f2;color:#e11d48;border-radius:4px;cursor:pointer;font-size:13px;">×</button>'
            + '</div>';
    });
    html += '</div></div>';
    return html;
}

function bindSupTierInputs() {
    document.querySelectorAll('#supervisor-setup-modal input[data-var]').forEach(function(inp) {
        inp.addEventListener('input', function() {
            var v = this.dataset.var;
            var i = parseInt(this.dataset.idx);
            var f = this.dataset.field;
            if (!window[v][i]) return;
            window[v][i][f] = f === 'label' ? this.value : (parseFloat(this.value) || 0);
        });
    });
}

function addSupTier(tempVar) {
    if (!window[tempVar]) window[tempVar] = [];
    window[tempVar].push({label:'', min:0, max:0, amt:0});
    refreshSupModal();
}
function removeSupTier(tempVar, idx) {
    if (!window[tempVar]) return;
    window[tempVar].splice(idx, 1);
    refreshSupModal();
}
function refreshSupModal() {
    var body = document.getElementById('sup-body');
    if (!body) return;
    body.innerHTML = renderSupTiersSection('Sale Incentive', 'by Team Sales Ach %', '_tempSupSale', '#7c3aed')
        + renderSupTiersSection('Collection Incentive', 'by Team Collection Ach %', '_tempSupColl', '#2563eb')
        + renderSupTiersSection('Active Call Incentive', 'by Team Call Ach %', '_tempSupCall', '#0891b2')
        + renderSupTiersSection('Quarterly Incentive', 'by Team Quarterly Ach %', '_tempSupQtr', '#d97706');
    bindSupTierInputs();
}

function saveSupervisorIncentiveModal(personName) {
    var cfg = window.appState.config;
    if (!cfg.person_supervisor_sale_tiers) cfg.person_supervisor_sale_tiers = {};
    if (!cfg.person_supervisor_coll_tiers) cfg.person_supervisor_coll_tiers = {};
    if (!cfg.person_supervisor_call_tiers) cfg.person_supervisor_call_tiers = {};
    if (!cfg.person_supervisor_qtr_tiers)  cfg.person_supervisor_qtr_tiers  = {};
    cfg.person_supervisor_sale_tiers[personName] = JSON.parse(JSON.stringify(window._tempSupSale || []));
    cfg.person_supervisor_coll_tiers[personName] = JSON.parse(JSON.stringify(window._tempSupColl || []));
    cfg.person_supervisor_call_tiers[personName] = JSON.parse(JSON.stringify(window._tempSupCall || []));
    cfg.person_supervisor_qtr_tiers[personName]  = JSON.parse(JSON.stringify(window._tempSupQtr  || []));
    saveConfig();
    var m = document.getElementById('supervisor-setup-modal'); if (m) m.remove();
    renderPeopleList();
    showToast('✅', personName + ' supervisor setup saved!');
}

window.showSupervisorIncentiveModal = showSupervisorIncentiveModal;
window.saveSupervisorIncentiveModal = saveSupervisorIncentiveModal;
window.addSupTier = addSupTier;
window.removeSupTier = removeSupTier;

// ==================== MERCHANDISER RATE MODAL ====================
function showMerchandiserRateModal(personName) {
    var ex = document.getElementById('merchandiser-setup-modal'); if (ex) ex.remove();
    var cfg = window.appState.config;
    if (!cfg.person_merchandiser_rates) cfg.person_merchandiser_rates = {};
    var curRate = cfg.person_merchandiser_rates[personName] != null ? cfg.person_merchandiser_rates[personName] : (cfg.merchandiser_block_rate || 10);

    var modal = document.createElement('div');
    modal.id = 'merchandiser-setup-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;box-sizing:border-box;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;width:100%;max-width:480px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);';
    card.innerHTML = '<div style="padding:18px 24px;background:linear-gradient(135deg,#d97706,#92400e);color:#fff;">'
        + '<div style="font-size:12px;font-weight:700;opacity:.85;letter-spacing:1px;text-transform:uppercase;">Step 2 of 2 · Support Staff Setup</div>'
        + '<div style="font-size:18px;font-weight:800;margin-top:4px;">🛠️ '+personName+' — Block Rate</div>'
        + '<div style="font-size:12px;opacity:.8;margin-top:2px;">Amount earned per block displayed</div>'
        + '</div>'
        + '<div style="padding:24px;">'
        + '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px;">'
        + '<div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Rate per Block (RM)</div>'
        + '<input id="merch-rate" type="number" step="0.01" value="'+curRate+'" style="width:100%;padding:10px 14px;border:1.5px solid #fde68a;border-radius:8px;font-size:18px;font-family:\'Sora\',sans-serif;font-weight:700;outline:none;box-sizing:border-box;">'
        + '<div style="font-size:11px;color:#92400e;margin-top:8px;">Example: Rate RM 10 × 30 blocks = RM 300 incentive</div>'
        + '</div></div>'
        + '<div style="padding:14px 24px;border-top:1px solid #e2e8f0;display:flex;gap:10px;justify-content:flex-end;background:#f8fafc;">'
        + '<button id="merch-cancel" style="padding:9px 20px;border:1.5px solid #e2e8f0;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        + '<button id="merch-save" style="padding:9px 24px;border:none;border-radius:8px;background:linear-gradient(135deg,#d97706,#92400e);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save</button>'
        + '</div>';
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(function(){ var i=document.getElementById('merch-rate'); if(i) i.focus(); }, 100);

    document.getElementById('merch-cancel').addEventListener('click', function(){ modal.remove(); });
    document.getElementById('merch-save').addEventListener('click', function(){
        var inp = document.getElementById('merch-rate');
        var rate = parseFloat(inp.value) || 0;
        cfg.person_merchandiser_rates[personName] = rate;
        saveConfig();
        modal.remove();
        renderPeopleList();
        showToast('✅', personName + ' block rate saved (RM ' + rate.toFixed(2) + '/block)!');
    });
}
window.showMerchandiserRateModal = showMerchandiserRateModal;
