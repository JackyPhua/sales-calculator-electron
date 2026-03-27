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

// ==================== Global State Management ====================

// Ensure appState exists
if (!window.appState) {
    window.appState = {
        salespeople: [],
        config: null,
        currentView: 'quick'
    };
}

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
                <h3 style="margin:0;font-size:20px;font-weight:700;">🔑 Activate CommissionPro</h3>
                <p style="margin:6px 0 0;font-size:13px;opacity:0.8;">Enter your license key to unlock all features</p>
            </div>
            <div style="padding:24px 28px;">
                ${expiredMsg}
                <div style="margin-bottom:16px;">
                    <label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">License Key</label>
                    <input type="text" id="license-key-input" 
                           placeholder="CPRO-XXXX-XXXX-XXXX-XXXX"
                           style="width:100%;padding:12px 14px;border:2px solid #e5e7eb;border-radius:10px;font-size:15px;font-family:'Courier New',monospace;letter-spacing:1px;text-transform:uppercase;outline:none;transition:border 0.2s;"
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
            successEl.textContent = '✅ License activated successfully! Enjoy CommissionPro Pro.';
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
                    <p style="margin:4px 0 0;font-size:14px;font-family:'Courier New',monospace;font-weight:600;color:#111827;letter-spacing:1px;">${window.licenseStatus.key || 'N/A'}</p>
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
        
        // Initialize current view
        switchView('quick');
        
        // Initialize backup system
        initBackupSystem();
        
        // Add quick recovery button
        setTimeout(addQuickRecoveryButton, 1000);
        
        console.log('✅ Application initialization completed');
    } catch (error) {
        console.error('Initialization failed:', error);
        // Use default configuration
        window.appState.config = getDefaultConfig();
        switchView('quick');
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
            if (key.includes('_rates') || key.includes('incentive')) {
                config[key] = getDefaultConfig()[key];
            } else {
                config[key] = {};
            }
        }
    });
    
    // Restore quickCalculateData if present (persists across restarts)
}

// Default configuration
function getDefaultConfig() {
    return {
        base_salaries: {},
        allowances: {},
        deductions: {},
        deductionRates: {},
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
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = 'bg-white shadow-lg rounded-lg px-4 py-3 flex items-center space-x-3 border border-gray-200 animate-fadeIn';
    toast.innerHTML = `
        <span class="text-2xl">${icon}</span>
        <span class="text-gray-700 font-medium">${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// View switching
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
        viewEl.style.display = 'block';
        viewEl.classList.add('active');
        viewEl.classList.remove('hidden');
    }
    window.appState.currentView = view;
    if (view === 'people') {
        if (typeof renderPeopleList === 'function') renderPeopleList();
    } else if (view === 'quick') {
        if (typeof initQuickCalculate === 'function') initQuickCalculate();
        if (typeof renderPersonSidebar === 'function') renderPersonSidebar();
    } else if (view === 'history') {
        if (typeof loadQuickCalculateHistory === 'function') loadQuickCalculateHistory();
    } else if (view === 'settings') {
        var lt = document.getElementById('settings-license-type');
        if (lt) lt.textContent = (typeof isPro === 'function' && isPro()) ? 'Pro License ✓' : 'Trial';
    } else if (view === 'salary') {
        if (typeof initSalaryView === 'function') initSalaryView();
    } else if (view === 'commission') {
        if (typeof initCommissionView === 'function') initCommissionView();
    }
}

// ==================== QUICK CALCULATE Fixed Version ====================

// Initialize Quick Calculate
async function initQuickCalculate() {
    console.log('📊 Initializing Quick Calculate');
    
    // Set current month
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const monthSelect = document.getElementById('report-month');
    if (monthSelect) {
        monthSelect.value = currentMonth;

        // When month changes, re-fill cards from imported Excel data or recalc locked fields
        if (!monthSelect._hasAutoFillListener) {
            monthSelect.addEventListener('change', function() {
                const newMonth = this.value.toUpperCase();
                console.log('📅 Month changed to', newMonth);

                // If we have imported Excel data, refill cards for the new month
                if (window.appState.importedExcelData && window.appState.importedExcelData.length > 0) {
                    console.log('📂 Refilling cards from imported Excel data for', newMonth);
                    fillCardsFromImportedData(newMonth);
                } else {
                    // Try to load saved data for this month from reportHistory
                    var history = window.appState.config.reportHistory || [];
                    var histEntry = history.find(function(r){ return (r.month||'').toUpperCase() === newMonth; });
                    if (histEntry && histEntry.data && histEntry.data.length > 0) {
                        // Restore only the FIRST person's data into the single card (idx=0)
                        // User can click sidebar to switch between people
                        var firstPerson = histEntry.data[0];
                        if (firstPerson && window.appState.salespeople.length > 0) {
                            var set = function(id, v) {
                                var el = document.getElementById(id + '-0');
                                if (el) el.value = (v != null && v !== 0) ? v : '';
                            };
                            set('target',             firstPerson.target);
                            set('sales',              firstPerson.sales);
                            set('quarterly-target',   firstPerson.quarterlyTarget || '');
                            set('quarterly-sales',    firstPerson.quarterlySales  || '');
                            set('collection-target',  firstPerson.collectionTarget || '');
                            set('collection-amount',  firstPerson.collectionAmount || '');
                            set('call-target',        firstPerson.callTarget || '');
                            set('call-actual',        firstPerson.callActual || '');
                            updateSalespersonData(0);
                        }
                        // Store full history data so sidebar click can load per-person
                        window._currentMonthHistory = histEntry.data;
                        updateSummaryView();
                        showToast('📅', newMonth + ' data restored');
                    } else {
                        // No saved data — clear the single card fields
                        var clearFields = ['target','sales','quarterly-target','quarterly-sales',
                            'collection-target','collection-amount','call-target','call-actual'];
                        clearFields.forEach(function(id) {
                            var el = document.getElementById(id + '-0');
                            if (el) el.value = '';
                        });
                        window._currentMonthHistory = null;
                        if (window.appState.salespeople.length > 0) updateSalespersonData(0);
                        showToast('📅', newMonth + ' — no data yet');
                    }
                }
            });
            monthSelect._hasAutoFillListener = true;
        }
    }
    
    const container = document.getElementById('salespeople-container');
    
    // If there is already data in the state, re-render the existing cards
    // (user switched tabs and came back - do NOT wipe their data)
    if (window.appState.salespeople && window.appState.salespeople.length > 0) {
        if (container) container.innerHTML = '';
        renderAllSalespeopleCards();
        updateSummaryView();
        console.log('✅ Quick Calculate restored existing cards:', window.appState.salespeople.length);
        return;
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
            var set=function(id,v){var el=document.getElementById(id+'-'+idx);if(el&&v!=null&&v!=='')el.value=v;};
            set('target',sp.target); set('sales',sp.sales);
            set('quarterly-target',sp.quarterlyTarget); set('quarterly-sales',sp.quarterlySales);
            set('collection-target',sp.collectionTarget); set('collection-amount',sp.collectionAmount);
            set('call-target',sp.callTarget); set('call-actual',sp.callActual);
            updateSalespersonData(idx);
        });
        updateSummaryView();
    } else {
        createBlankSalespersonCard();
    }
    // Update summary
    updateSummaryView();
    
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
    card.className = 'card bg-white rounded-xl shadow-sm p-6 border border-gray-200 relative';
    card.innerHTML = `
        <!-- Delete button -->
        <button onclick="deleteSalespersonCard(${newId})" 
                class="absolute top-3 right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full hover:bg-red-200 flex items-center justify-center transition-colors"
                title="Delete this salesperson">
            ✕
        </button>
        
        <div class="flex justify-between items-start mb-4">
            <h4 class="text-lg font-semibold text-gray-900">👤 Salesperson #${newId}</h4>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
            <div class="col-span-2">
                <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <select id="name-${index}"
                        class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        onchange="onSalespersonNameChange(${index})">
                    <option value="">Select...</option>
                    ${nameOptions}
                </select>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Target (RM)</label>
                <input type="number" 
                       id="target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter target"
                       value=""
                       onfocus="this.readOnly=false;this.style.backgroundColor='';"
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Sales (RM)</label>
                <input type="number" 
                       id="sales-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter sales"
                       value=""
                       onfocus="this.readOnly=false;this.style.backgroundColor='';"
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div class="col-span-2">
                <div class="h-px bg-gray-200 my-4"></div>
                <h5 class="text-sm font-semibold text-gray-700 mb-3">📊 Quarterly Data (3 months total)</h5>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Target (RM)</label>
                <input type="number" 
                       id="quarterly-target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter quarterly target"
                       value=""
                       oninput="updateSalespersonData(${index})">
                <p class="text-xs text-gray-500 mt-1">3 months total target</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Sales (RM)</label>
                <input type="number" 
                       id="quarterly-sales-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter quarterly sales"
                       value=""
                       oninput="updateSalespersonData(${index})">
                <p class="text-xs text-gray-500 mt-1">3 months total sales</p>
            </div>
            
            <div class="col-span-2">
                <div class="h-px bg-gray-200 my-4"></div>
                <h5 class="text-sm font-semibold text-gray-700 mb-3">🎯 Other Targets</h5>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Collection Target (RM)</label>
                <input type="number" 
                       id="collection-target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter collection target"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Collection Amount (RM)</label>
                <input type="number" 
                       id="collection-amount-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter collection amount"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Target)</label>
                <input type="number" 
                       id="call-target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter call target"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Actual)</label>
                <input type="number" 
                       id="call-actual-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter actual calls"
                       value=""
                       oninput="updateSalespersonData(${index})">
            </div>
        </div>
        
        <!-- Preview Section - Initially hidden -->
        <div id="preview-${index}" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200 hidden">
            <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="text-gray-600">Achievement:</span>
                    <span id="achievement-${index}" class="font-semibold ml-2"></span>
                </div>
                <div>
                    <span class="text-gray-600">Commission:</span>
                    <span id="commission-${index}" class="font-semibold ml-2"></span>
                </div>
                <div>
                    <span class="text-gray-600">Collection Bonus:</span>
                    <span id="collection-bonus-${index}" class="font-semibold ml-2"></span>
                </div>
                <div>
                    <span class="text-gray-600">Call Bonus:</span>
                    <span id="call-bonus-${index}" class="font-semibold ml-2"></span>
                </div>
                <div>
                    <span class="text-gray-600">Quarterly Bonus:</span>
                    <span id="quarterly-${index}" class="font-semibold ml-2"></span>
                </div>
                <div>
                    <span class="text-gray-600">Total Commission:</span>
                    <span id="total-commission-${index}" class="font-semibold ml-2 text-green-600"></span>
                </div>
            </div>
            <div class="mt-3 text-right">
                <button onclick="showPayslipPreview(${index})" 
                        class="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm font-medium">
                    📄 Preview Payslip
                </button>
            </div>
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

    var IS = 'width:100%;padding:10px 12px;border:2px solid #e5e7eb;border-radius:8px;font-size:14px;outline:none;box-sizing:border-box;background:#fff;color:#111827;display:block;';
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
    body.style.cssText = 'padding:20px 24px;overflow-y:auto;flex:1;';

    body.appendChild(mkRow('Name <span style="color:#ef4444">*</span>', mkInp('quick-person-name','text','','e.g., CHONG JIA YING')));

    var salBox = mkBox('#f0fdf4','#bbf7d0','SALARY','#065f46');
    salBox.appendChild(mkRow('Base Salary (RM) <span style="color:#ef4444">*</span>', mkInp('quick-person-salary','number','1700','1700'), '0'));
    body.appendChild(salBox);

    var alBox = mkBox('#eff6ff','#bfdbfe','ALLOWANCES (RM)','#1e40af');
    var grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
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
function deleteSalespersonConfig(personName) {
    if (!personName) return;

    // Custom confirm dialog (avoid native confirm which breaks focus in Electron)
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.5);display:flex;align-items:center;justify-content:center;z-index:99999;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#fff;border-radius:14px;padding:28px 28px 20px;max-width:360px;width:90%;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:sans-serif;';

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
         'person_collection_incentive','person_call_incentive'].forEach(function(k) {
            if (cfg[k] && cfg[k][nameUpper]) delete cfg[k][nameUpper];
        });
        saveConfig();
        renderPeopleList();
        showToast('✅', personName + ' deleted');
    });
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
        card.className = 'card bg-white rounded-xl shadow-sm p-6 border border-gray-200 relative';
        card.innerHTML = `
            <!-- Delete button -->
            <button onclick="deleteSalespersonCard(${person.id})" 
                    class="absolute top-3 right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full hover:bg-red-200 flex items-center justify-center transition-colors"
                    title="Delete this salesperson">
                ✕
            </button>
            
            <div class="flex justify-between items-start mb-4">
                <h4 class="text-lg font-semibold text-gray-900">👤 Salesperson #${person.id}</h4>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div class="col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                    <select id="name-${index}"
                            class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            onchange="onSalespersonNameChange(${index})">
                        <option value="">Select...</option>
                        ${nameOptions}
                        ${person.name && !configuredPeople.includes(person.name) ? 
                            `<option value="${person.name}" selected>${person.name}</option>` : ''}
                    </select>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Target (RM)</label>
                    <input type="number" 
                           id="target-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="50000"
                           value="${person.target || ''}"
                           onfocus="this.readOnly=false;this.style.backgroundColor='';"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Sales (RM)</label>
                    <input type="number" 
                           id="sales-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="48500"
                           value="${person.sales || ''}"
                           onfocus="this.readOnly=false;this.style.backgroundColor='';"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div class="col-span-2">
                    <div class="h-px bg-gray-200 my-4"></div>
                    <h5 class="text-sm font-semibold text-gray-700 mb-3">📊 Quarterly Data (3 months total)</h5>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Target (RM)</label>
                    <input type="number" 
                           id="quarterly-target-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="150000"
                           value="${person.quarterlyTarget || 150000}"
                           oninput="updateSalespersonData(${index})">
                    <p class="text-xs text-gray-500 mt-1">3 months total target</p>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Sales (RM)</label>
                    <input type="number" 
                           id="quarterly-sales-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="145000"
                           value="${person.quarterlySales || 145000}"
                           oninput="updateSalespersonData(${index})">
                    <p class="text-xs text-gray-500 mt-1">3 months total sales</p>
                </div>
                
                <div class="col-span-2">
                    <div class="h-px bg-gray-200 my-4"></div>
                    <h5 class="text-sm font-semibold text-gray-700 mb-3">🎯 Other Targets</h5>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Collection Target (RM)</label>
                    <input type="number" 
                           id="collection-target-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="30000"
                           value="${person.collectionTarget || 30000}"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Collection Amount (RM)</label>
                    <input type="number" 
                           id="collection-amount-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="29000"
                           value="${person.collectionAmount || 29000}"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Target)</label>
                    <input type="number" 
                           id="call-target-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="100"
                           value="${person.callTarget || 100}"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Actual)</label>
                    <input type="number" 
                           id="call-actual-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="95"
                           value="${person.callActual || 95}"
                           oninput="updateSalespersonData(${index})">
                </div>
            </div>
            
            <!-- Preview Section -->
            <div id="preview-${index}" class="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Achievement:</span>
                        <span id="achievement-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div>
                        <span class="text-gray-600">Commission:</span>
                        <span id="commission-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div>
                        <span class="text-gray-600">Collection Bonus:</span>
                        <span id="collection-bonus-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div>
                        <span class="text-gray-600">Call Bonus:</span>
                        <span id="call-bonus-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div>
                        <span class="text-gray-600">Quarterly Bonus:</span>
                        <span id="quarterly-${index}" class="font-semibold ml-2"></span>
                    </div>
                    <div>
                        <span class="text-gray-600">Total Commission:</span>
                        <span id="total-commission-${index}" class="font-semibold ml-2 text-green-600"></span>
                    </div>
                </div>
                <div class="mt-3 text-right">
                    <button onclick="showPayslipPreview(${index})" 
                            class="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm font-medium">
                        📄 Preview Payslip
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
        
        // Restore data and re-apply locked fields
        setTimeout(() => {
            // Restore name select value for configured people
            const nameEl = document.getElementById('name-' + index);
            if (nameEl && person.name) {
                // Try to select matching option
                const option = Array.from(nameEl.options).find(
                    o => o.value.toUpperCase() === person.name.toUpperCase()
                );
                if (option) {
                    nameEl.value = option.value;
                } else if (person.name) {
                    // Add option if not found
                    const opt = document.createElement('option');
                    opt.value = person.name;
                    opt.text = person.name;
                    nameEl.appendChild(opt);
                    nameEl.value = person.name;
                }
            }
            // Re-apply locked fields (quarterly target, collection target)
            if (typeof autoFillLockedFields === 'function') {
                autoFillLockedFields(index);
            }
            updateSalespersonData(index);
        }, 50);
    });
}

// Update salesperson data
function updateSalespersonData(index) {
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
    
    person.name = nameInput.value;
    person.target = parseFloat(targetInput.value) || 0;
    person.sales = parseFloat(salesInput.value) || 0;

    // ── Re-calculate quarterly fields if quarter-end month ──
    // (current month target/sales may have changed, so re-accumulate)
    const _curMonth = (document.getElementById('report-month')?.value || '').toUpperCase();
    if (['MAR','JUN','SEP','DEC'].includes(_curMonth) && person.name) {
        const _months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const _ci = _months.indexOf(_curMonth);
        const _history = window.appState.config.reportHistory || [];
        const _nameUpper = person.name.toUpperCase();

        // Helper: get data from Excel first, then history
        function _getData(monthName) {
            // Try imported Excel data first
            const exData = window.appState.importedExcelData;
            if (exData) {
                const personEx = exData.find(p => (p.name || '').toUpperCase() === _nameUpper);
                if (personEx) {
                    const md = personEx.months.find(m => m.month === monthName);
                    if (md) return { target: parseFloat(md.target) || 0, sales: parseFloat(md.sales) || 0 };
                }
            }
            // Fallback to history
            const entries = _history.filter(r => (r.month || '').toUpperCase() === monthName);
            if (entries.length > 0) {
                const pd = (entries[entries.length - 1].data || []).find(p => (p.name || '').toUpperCase() === _nameUpper);
                if (pd) return { target: parseFloat(pd.target) || 0, sales: parseFloat(pd.sales) || 0 };
            }
            return null;
        }

        let _qT = 0, _qS = 0;
        for (let mi = _ci - 2; mi <= _ci; mi++) {
            if (mi < 0) continue;
            const qm = _months[mi];
            if (qm === _curMonth) {
                _qT += person.target;
                _qS += person.sales;
            } else {
                const d = _getData(qm);
                if (d) { _qT += d.target; _qS += d.sales; }
            }
        }
        const _qtEl = document.getElementById('quarterly-target-' + index);
        const _qsEl = document.getElementById('quarterly-sales-' + index);
        if (_qtEl) { _qtEl.value = _qT || ''; person.quarterlyTarget = _qT; }
        if (_qsEl) { _qsEl.value = _qS || ''; person.quarterlySales = _qS; }
    }

    person.quarterlyTarget = parseFloat(document.getElementById(`quarterly-target-${index}`).value) || 0;
    person.quarterlySales = parseFloat(document.getElementById(`quarterly-sales-${index}`).value) || 0;
    person.collectionTarget = parseFloat(document.getElementById(`collection-target-${index}`).value) || 0;
    person.collectionAmount = parseFloat(document.getElementById(`collection-amount-${index}`).value) || 0;
    person.callTarget = parseFloat(document.getElementById(`call-target-${index}`).value) || 0;
    person.callActual = parseFloat(document.getElementById(`call-actual-${index}`).value) || 0;
    
    // Check if there's enough data to show preview
    const hasData = person.name && person.target > 0 && person.sales > 0;
    const previewElement = document.getElementById(`preview-${index}`);
    
    if (hasData) {
        // Calculate
        const achievement = person.target > 0 ? (person.sales / person.target) * 100 : 0;
        const quarterlyAchievement = person.quarterlyTarget > 0 ? (person.quarterlySales / person.quarterlyTarget) * 100 : 0;
        const collectionAchievement = person.collectionTarget > 0 ? (person.collectionAmount / person.collectionTarget) * 100 : 0;
        const callAchievement = person.callTarget > 0 ? (person.callActual / person.callTarget) * 100 : 0;
        
        // Commission calculation
        const commission = calculateCommission(person.sales, person.target, person.name);
        const collectionBonus = calculateIncentive(collectionAchievement, window.appState.config.collection_incentive);
        const callBonus = calculateIncentive(callAchievement, window.appState.config.active_call_incentive);
        // Quarterly bonus only in quarter-end months MAR/JUN/SEP/DEC
        const _qMonth = (document.getElementById('report-month')?.value || '').toUpperCase();
        const _isQuarterEnd = ['MAR','JUN','SEP','DEC'].includes(_qMonth);
        const quarterlyBonus = _isQuarterEnd
            ? calculateIncentive(quarterlyAchievement, window.appState.config.quarterly_incentive)
            : 0;
        const totalCommission = commission + collectionBonus + callBonus + quarterlyBonus;
        
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
        const achievementEl = document.getElementById(`achievement-${index}`);
        const commissionEl = document.getElementById(`commission-${index}`);
        const collectionBonusEl = document.getElementById(`collection-bonus-${index}`);
        const callBonusEl = document.getElementById(`call-bonus-${index}`);
        const quarterlyEl = document.getElementById(`quarterly-${index}`);
        const totalEl = document.getElementById(`total-commission-${index}`);
        
        if (achievementEl) {
            achievementEl.textContent = achievement.toFixed(2) + '%';
            achievementEl.className = `font-semibold ml-2 ${getAchievementColor(achievement)}`;
        }
        if (commissionEl) commissionEl.textContent = formatCurrency(commission);
        if (collectionBonusEl) collectionBonusEl.textContent = formatCurrency(collectionBonus);
        if (callBonusEl) callBonusEl.textContent = formatCurrency(callBonus);
        if (quarterlyEl) quarterlyEl.textContent = person.quarterlyTarget > 0 
            ? `${formatCurrency(quarterlyBonus)} (${quarterlyAchievement.toFixed(1)}%)`
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

    // Auto-save debounced 500ms
    if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);
    window._autoSaveTimer = setTimeout(function() {
        var _month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
        var _snap = {
            month: _month,
            salespeople: window.appState.salespeople.map(function(p){return Object.assign({},p);})
        };
        window.appState.config.quickCalculateData = _snap;

        // Sync valid people into reportHistory
        if (_month) {
            if (!window.appState.config.reportHistory) window.appState.config.reportHistory = [];
            var _valid = window.appState.salespeople.filter(function(p){ return p.name && (p.target>0||p.sales>0); });
            if (_valid.length > 0) {
                var _ei = window.appState.config.reportHistory.findIndex(function(r){ return (r.month||'').toUpperCase()===_month; });
                var _hd = _valid.map(function(p){ return {name:(p.name||'').toUpperCase(),target:p.target||0,sales:p.sales||0,collectionTarget:p.collectionTarget||0,collectionAmount:p.collectionAmount||0,callTarget:p.callTarget||0,callActual:p.callActual||0}; });
                if (_ei >= 0) {
                    _hd.forEach(function(e){ var pi=window.appState.config.reportHistory[_ei].data.findIndex(function(d){return (d.name||'').toUpperCase()===e.name;}); if(pi>=0)window.appState.config.reportHistory[_ei].data[pi]=e; else window.appState.config.reportHistory[_ei].data.push(e); });
                } else {
                    window.appState.config.reportHistory.push({month:_month, data:_hd});
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
    var histEntry = (window.appState.config.reportHistory||[]).find(function(r){return (r.month||'').toUpperCase()===month;});
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
            if (aa) { var avg=tTarget>0?tSales/tTarget*100:0; aa.textContent=avg.toFixed(1)+'%'; aa.style.color=avg>=100?'var(--em)':avg>=90?'var(--am)':'var(--rose)'; }
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
    if (!person || !person.name || !person.target) { hero.style.display='none'; return; }
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
    if (bigPct) { bigPct.textContent=ach.toFixed(1)+'%'; bigPct.style.color=color; }
    if (name)   name.textContent = person.name;
    if (sub)    sub.textContent  = 'Target: '+formatCurrency(person.target||0)+' · Sales: '+formatCurrency(person.sales||0);
    if (badge) {
        if (ach>=100){ badge.textContent='✅ Target Hit'; badge.style.background='var(--em-l)'; badge.style.color='var(--em)'; }
        else if (ach>=90){ badge.textContent='⚡ Almost There'; badge.style.background='var(--am-l)'; badge.style.color='var(--am)'; }
        else { badge.textContent='⚠️ Below Target'; badge.style.background='var(--ro-l)'; badge.style.color='var(--rose)'; }
    }
}

function renderPersonSidebar() {
    var list = document.getElementById('person-sidebar-list');
    var countEl = document.getElementById('sidebar-count');
    if (!list) return;

    // Always show ALL configured people, not just current card
    var configPeople = Object.keys(window.appState.config.base_salaries || {});
    if (configPeople.length === 0) {
        // Fallback to salespeople array
        configPeople = window.appState.salespeople.filter(function(p){return p.name;}).map(function(p){return p.name;});
    }

    if (countEl) countEl.textContent = 'Salesperson · ' + configPeople.length;
    list.innerHTML = '';

    var colors = ['#dbeafe:#1e40af','#fce7f3:#be185d','#dcfce7:#15803d','#fef9c3:#a16207','#ede9fe:#6d28d9','#fff1f2:#be123c'];

    configPeople.forEach(function(personName, i) {
        // Get achievement from current month history or current card
        var currentMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
        var history = window.appState.config.reportHistory || [];
        var histEntry = history.find(function(r){ return (r.month||'').toUpperCase() === currentMonth; });
        var pData = histEntry && histEntry.data ? histEntry.data.find(function(p){ return (p.name||'').toUpperCase() === personName.toUpperCase(); }) : null;

        // Also check current card if this is the active person
        var curPerson = window.appState.salespeople[0];
        if (!pData && curPerson && (curPerson.name||'').toUpperCase() === personName.toUpperCase()) {
            pData = curPerson;
        }

        var ach = pData && pData.target > 0 ? (parseFloat(pData.sales)||0) / parseFloat(pData.target) * 100 : 0;
        var achColor = ach>=100?'#059669':ach>=90?'#b45309':'#e11d48';
        var achBg    = ach>=100?'#d1fae5':ach>=90?'#fef3c7':'#ffe4e6';
        var col = (colors[i % colors.length]||'#f1f5f9:#64748b').split(':');

        var row = document.createElement('div');
        row.className = 'person-row';
        // Mark active if matches current card name
        if (curPerson && (curPerson.name||'').toUpperCase() === personName.toUpperCase()) {
            row.classList.add('active');
        }
        row.innerHTML =
            '<div class="p-av" style="background:'+col[0]+';color:'+col[1]+';">'+personName[0]+'</div>'
            + '<span class="p-name">'+personName+'</span>'
            + (ach>0 ? '<span class="p-ach" style="background:'+achBg+';color:'+achColor+';">'+ach.toFixed(0)+'%</span>' : '');

        row.addEventListener('click', (function(name){ return function() {
            // Mark active
            document.querySelectorAll('.person-row').forEach(function(r){ r.classList.remove('active'); });
            row.classList.add('active');

            // Get this month's history for this person
            var mon = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
            var hist = window.appState.config.reportHistory || [];
            var hEntry = hist.find(function(r){ return (r.month||'').toUpperCase() === mon; });
            var pd = hEntry && hEntry.data ? hEntry.data.find(function(p){ return (p.name||'').toUpperCase() === name.toUpperCase(); }) : null;

            // Update the single card
            var nameEl = document.getElementById('name-0');
            if (nameEl) nameEl.value = name;

            function setField(id, v) {
                var el = document.getElementById(id + '-0');
                if (el) el.value = (v != null && v !== '' && v !== 0) ? v : '';
            }

            if (pd) {
                setField('target',           pd.target);
                setField('sales',            pd.sales);
                setField('quarterly-target', pd.quarterlyTarget || '');
                setField('quarterly-sales',  pd.quarterlySales  || '');
                setField('collection-target',pd.collectionTarget|| '');
                setField('collection-amount',pd.collectionAmount|| '');
                setField('call-target',      pd.callTarget      || '');
                setField('call-actual',      pd.callActual      || '');
            } else {
                // No history — clear fields for fresh input
                ['target','sales','quarterly-target','quarterly-sales',
                 'collection-target','collection-amount','call-target','call-actual'].forEach(function(id){
                    setField(id, '');
                });
            }

            // Update appState salespeople[0] name
            if (window.appState.salespeople.length > 0) {
                window.appState.salespeople[0].name = name;
            }
            updateSalespersonData(0);
        }; })(personName));

        list.appendChild(row);
    });
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
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
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
    const dropdown='<div class="mb-6"><label class="block text-sm font-medium text-gray-700 mb-2">Select Salesperson</label><select id="salary-person-select" onchange="renderSalaryConfigs(this.value)" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 bg-white text-gray-900" style="max-width:320px;">'+opts+'</select></div>';
    container.innerHTML = dropdown + people.filter(n=>n===selectedName).map(name => {
        const nameUpper = name.toUpperCase();
        const salary = window.appState.config.base_salaries[nameUpper] || 0;
        const allowances = window.appState.config.allowances[nameUpper] || {};
        const deductions = window.appState.config.deductions[nameUpper] || {};
        const epfRate = (window.appState.config.deductionRates && window.appState.config.deductionRates[nameUpper] && window.appState.config.deductionRates[nameUpper].EPF_RATE) || 11;
        
        const totalIncome = salary + Object.values(allowances).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
        const epfAmount = Math.round(totalIncome * (epfRate / 100) * 100) / 100;
        const socsoAmount = Math.round(totalIncome * 0.005 * 100) / 100;
        
        return `
            <div class="border border-gray-300 rounded-lg p-4 mb-4 bg-white">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold">👤 ${name}</h3>
                    <button onclick="deleteSalespersonConfig('${name}')" 
                            class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">
                        🗑️ Delete
                    </button>
                </div>
                
                <div class="mb-4">
                    <label class="block mb-2">Base Salary (RM)</label>
                    <input type="number" 
                           value="${salary}" 
                           onchange="updateSalary('${name}', this.value)" 
                           class="w-full px-4 py-2 border border-gray-300 rounded">
                </div>
                
                <div class="mb-4">
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
                            <label class="text-xs">EPF Rate (%)</label>
                            <input type="number" 
                                   value="${epfRate}" 
                                   step="0.1" 
                                   onchange="updateEPFRate('${name}', this.value)" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded">
                        </div>
                        <div>
                            <label class="text-xs">EPF Amount (RM)</label>
                            <input type="number" 
                                   value="${epfAmount}" 
                                   readonly 
                                   class="w-full px-3 py-2 border border-gray-300 rounded bg-gray-100">
                        </div>
                        <div>
                            <label class="text-xs">SOCSO (RM)</label>
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
                            <label class="text-xs">EIS (RM)</label>
                            <input type="number" 
                                   value="${deductions.EIS || 0}" 
                                   onchange="updateDeduction('${name}', 'EIS', this.value)" 
                                   class="w-full px-3 py-2 border border-gray-300 rounded">
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Add new salesperson
function addNewPerson(nameOverride) {
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
            if (r.month) availableMonths.add(r.month.toUpperCase());
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
    window.appState.salespeople = window.appState.salespeople.filter(p => p.id !== id);
    renderSalespersonCards();
    updateSummaryView();
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
            updateSummaryView();
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
            updateSummaryView();
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

    // ── Helper: find from reportHistory ──
    function getHistoryData(monthName) {
        const entries = history.filter(r => (r.month || '').toUpperCase() === monthName);
        if (entries.length === 0) return null;
        const latest = entries[entries.length - 1];
        return (latest.data || []).find(p => (p.name || '').toUpperCase() === nameUpper) || null;
    }

    // ── Helper: get data from Excel first, then history ──
    function getData(monthName) {
        const exd = getExcelData(monthName);
        if (exd) return { target: parseFloat(exd.target) || 0, sales: parseFloat(exd.sales) || 0, source: 'excel' };
        const hd = getHistoryData(monthName);
        if (hd) return { target: parseFloat(hd.target) || 0, sales: parseFloat(hd.sales) || 0, source: 'history' };
        return null;
    }

    // ══════════════════════════════════════════════════════
    // Quarterly Target / Sales — auto-accumulate 3 months
    // ══════════════════════════════════════════════════════
    const quarterEndMonths = ['MAR','JUN','SEP','DEC'];
    const isQuarterEnd = quarterEndMonths.includes(month);
    const qTargetEl = document.getElementById('quarterly-target-' + index);
    const qSalesEl = document.getElementById('quarterly-sales-' + index);

    if (isQuarterEnd && currentIdx >= 0) {
        const qStartIdx = currentIdx - 2;
        const qMonths = [months[qStartIdx], months[qStartIdx + 1], months[qStartIdx + 2]];
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

        const tooltip = 'Auto: ' + qMonths.join('+') + '\n' + details.join('\n');
        if (qTargetEl) { qTargetEl.value = qTarget || ''; qTargetEl.readOnly = true; qTargetEl.style.backgroundColor = '#f0fdf4'; qTargetEl.title = tooltip; person.quarterlyTarget = qTarget; }
        if (qSalesEl) { qSalesEl.value = qSales || ''; qSalesEl.readOnly = true; qSalesEl.style.backgroundColor = '#f0fdf4'; qSalesEl.title = tooltip; person.quarterlySales = qSales; }
        console.log(`📊 Quarterly auto-fill for ${nameUpper} (${month}):`, details);
    } else {
        if (qTargetEl) { qTargetEl.value = ''; qTargetEl.readOnly = false; qTargetEl.style.backgroundColor = ''; qTargetEl.title = 'Quarterly bonus only applies in MAR/JUN/SEP/DEC'; person.quarterlyTarget = 0; }
        if (qSalesEl) { qSalesEl.value = ''; qSalesEl.readOnly = false; qSalesEl.style.backgroundColor = ''; qSalesEl.title = 'Quarterly bonus only applies in MAR/JUN/SEP/DEC'; person.quarterlySales = 0; }
    }

    // ══════════════════════════════════════════════════════
    // Collection Target — auto from 2 months ago sales
    // ══════════════════════════════════════════════════════
    let collTarget = 0, collLabel = '';
    if (currentIdx >= 0) {
        let twoMonthsAgo;
        if (currentIdx >= 2) { twoMonthsAgo = months[currentIdx - 2]; }
        else if (currentIdx === 1) { twoMonthsAgo = months[11]; }
        else { twoMonthsAgo = months[10]; }

        const d = getData(twoMonthsAgo);
        if (d) {
            collTarget = d.sales;
            collLabel = 'Auto: ' + twoMonthsAgo + ' sales = RM ' + collTarget.toLocaleString() + ' (' + d.source + ')';
        } else {
            collLabel = 'No data for ' + twoMonthsAgo;
        }
    }
    const cEl = document.getElementById('collection-target-' + index);
    if (cEl) {
        if (collTarget>0) { cEl.value=collTarget; cEl.readOnly=true; cEl.style.backgroundColor='#f3f4f6'; cEl.title=collLabel; }
        else { cEl.value=''; cEl.readOnly=false; cEl.style.backgroundColor=''; cEl.title=''; }
        person.collectionTarget=collTarget;
    }
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
        }
        person.months.forEach(md => {
            if (!md.month) return;
            const mKey = md.month.toUpperCase();
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

    // Keep only ONE card — fill with first person for current month
    const container = document.getElementById('salespeople-container');
    if (container) container.innerHTML = '';
    window.appState.salespeople = [];
    const fp = data[0];
    const fmd = fp.months.find(m => m.month === currentMonth) || fp.months[fp.months.length - 1];
    createBlankSalespersonCard();
    const nameEl0 = document.getElementById('name-0');
    if (nameEl0) {
        const opt0 = Array.from(nameEl0.options).find(o => o.value.toUpperCase() === fp.name.toUpperCase());
        if (opt0) { nameEl0.value = opt0.value; }
        else { const o=document.createElement('option'); o.value=fp.name; o.text=fp.name; nameEl0.appendChild(o); nameEl0.value=fp.name; }
    }
    if (fmd) {
        const s0=(id,v)=>{const el=document.getElementById(id+'-0');if(el&&v){el.value=v;el.readOnly=false;el.style.backgroundColor='';}};
        s0('target',fmd.target); s0('sales',fmd.sales);
        if(fmd.collection){const el=document.getElementById('collection-amount-0');if(el)el.value=fmd.collection;}
        if(fmd.callTarget){const el=document.getElementById('call-target-0');if(el)el.value=fmd.callTarget;}
        autoFillLockedFieldsWithExcel(0, fp.months, currentMonth);
    }
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

    // Helper: find from reportHistory
    function getHistoryData(monthName) {
        const entries = history.filter(r => (r.month || '').toUpperCase() === monthName);
        if (entries.length === 0) return null;
        return (entries[entries.length - 1].data || []).find(p => (p.name || '').toUpperCase() === nameUpper) || null;
    }

    // Helper: find from imported Excel data
    function getExcelData(monthName) {
        if (!excelMonths) return null;
        return excelMonths.find(m => m.month === monthName) || null;
    }

    // ── Quarterly Target/Sales ──
    const quarterEndMonths = ['MAR','JUN','SEP','DEC'];
    const isQuarterEnd = quarterEndMonths.includes(month);
    const qTargetEl = document.getElementById('quarterly-target-' + index);
    const qSalesEl = document.getElementById('quarterly-sales-' + index);

    if (isQuarterEnd && currentIdx >= 0) {
        const qStartIdx = currentIdx - 2;
        const qMonths = [months[qStartIdx], months[qStartIdx + 1], months[qStartIdx + 2]];
        let qTarget = 0, qSales = 0;
        const details = [];

        for (const qm of qMonths) {
            if (qm === month) {
                // Current month: from card inputs
                const curTarget = parseFloat(document.getElementById('target-' + index)?.value) || 0;
                const curSales = parseFloat(document.getElementById('sales-' + index)?.value) || 0;
                qTarget += curTarget;
                qSales += curSales;
                details.push(qm + ': T=' + curTarget.toLocaleString() + ' S=' + curSales.toLocaleString() + ' (current)');
            } else {
                // Previous months: try Excel data first, then history
                const exd = getExcelData(qm);
                if (exd) {
                    const et = parseFloat(exd.target) || 0;
                    const es = parseFloat(exd.sales) || 0;
                    qTarget += et;
                    qSales += es;
                    details.push(qm + ': T=' + et.toLocaleString() + ' S=' + es.toLocaleString() + ' (excel)');
                } else {
                    const hd = getHistoryData(qm);
                    if (hd) {
                        const ht = parseFloat(hd.target) || 0;
                        const hs = parseFloat(hd.sales) || 0;
                        qTarget += ht;
                        qSales += hs;
                        details.push(qm + ': T=' + ht.toLocaleString() + ' S=' + hs.toLocaleString() + ' (history)');
                    } else {
                        details.push(qm + ': No data');
                    }
                }
            }
        }

        const tooltip = 'Auto: ' + qMonths.join('+') + '\n' + details.join('\n');
        if (qTargetEl) { qTargetEl.value = qTarget || ''; qTargetEl.readOnly = true; qTargetEl.style.backgroundColor = '#f0fdf4'; qTargetEl.title = tooltip; person.quarterlyTarget = qTarget; }
        if (qSalesEl) { qSalesEl.value = qSales || ''; qSalesEl.readOnly = true; qSalesEl.style.backgroundColor = '#f0fdf4'; qSalesEl.title = tooltip; person.quarterlySales = qSales; }
    } else {
        if (qTargetEl) { qTargetEl.value = ''; qTargetEl.readOnly = false; qTargetEl.style.backgroundColor = ''; qTargetEl.title = 'Quarterly bonus only in MAR/JUN/SEP/DEC'; person.quarterlyTarget = 0; }
        if (qSalesEl) { qSalesEl.value = ''; qSalesEl.readOnly = false; qSalesEl.style.backgroundColor = ''; qSalesEl.title = 'Quarterly bonus only in MAR/JUN/SEP/DEC'; person.quarterlySales = 0; }
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
        if (collTarget>0) { cEl.value=collTarget; cEl.readOnly=true; cEl.style.backgroundColor='#f3f4f6'; cEl.title=collLabel; }
        else { cEl.value=''; cEl.readOnly=false; cEl.style.backgroundColor=''; cEl.title=''; }
        person.collectionTarget=collTarget;
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
    var fields   = ['target','sales','quarterly-target','quarterly-sales','collection-target','collection-amount','call-target','call-actual'];

    // Save previous person's data before switching
    var person = window.appState.salespeople[index];
    if (person && person.name && person.name !== newName) {
        var prevUpper = person.name.toUpperCase();
        var prevTarget = parseFloat((document.getElementById('target-'+index)||{}).value)||0;
        var prevSales  = parseFloat((document.getElementById('sales-'+index)||{}).value)||0;
        if (prevTarget>0||prevSales>0) {
            if (!window.appState.config.reportHistory) window.appState.config.reportHistory=[];
            var existIdx = window.appState.config.reportHistory.findIndex(function(r){return (r.month||'').toUpperCase()===month;});
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
            } else { window.appState.config.reportHistory.push({month:month,data:[entry]}); }
            saveConfig().catch(function(){});
        }
    }

    // Clear all fields
    fields.forEach(function(f){var el=document.getElementById(f+'-'+index);if(el){el.value='';el.readOnly=false;el.style.backgroundColor='';}});

    // Load saved data for new person
    if (newUpper&&month) {
        var history=window.appState.config.reportHistory||[];
        var entries=history.filter(function(r){return (r.month||'').toUpperCase()===month;});
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
}

function viewHistoryReport(index) {
    var report = (window.appState.config.reportHistory || [])[index];
    if (!report) { showToast('⚠️', 'Report not found'); return; }

    var people = report.data || [];
    var month  = (report.month || '').toUpperCase();
    var cfg    = window.appState.config;
    var qMonths = ['MAR','JUN','SEP','DEC'];
    var isQtr   = qMonths.indexOf(month) !== -1;

    var existing = document.getElementById('history-view-modal');
    if (existing) existing.remove();

    var cards = people.map(function(p) {
        var nu       = (p.name || '').toUpperCase();
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

        var comm    = calculateCommission(sales, target, p.name);
        var collBon = calculateIncentive(collPct, cfg.collection_incentive);
        var callBon = calculateIncentive(callPct, cfg.active_call_incentive);
        var qtrBon  = isQtr ? calculateIncentive(ach, cfg.quarterly_incentive) : 0;
        var totalComm = comm + collBon + callBon + qtrBon;

        var totalFixed  = salary + totalAllow;
        var totalIncome = totalFixed + totalComm;
        var epfAmt      = Math.round(totalIncome * (epfRate/100) * 100) / 100;
        var grandTotal  = totalIncome - epfAmt;

        var achColor = ach >= 100 ? '#16a34a' : ach >= 90 ? '#d97706' : '#dc2626';

        return '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;background:#fff;">'
            + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #f3f4f6;">'
            + '<span style="font-size:20px;">&#128100;</span>'
            + '<h3 style="margin:0;font-size:16px;font-weight:700;color:#111;">' + p.name + '</h3></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">'
            + '<div style="color:#6b7280;">Base Salary</div><div style="text-align:right;">'       + formatCurrency(salary)    + '</div>'
            + '<div style="color:#6b7280;">Monthly Target</div><div style="text-align:right;">'    + formatCurrency(target)    + '</div>'
            + '<div style="color:#6b7280;">Monthly Sales</div><div style="text-align:right;">'     + formatCurrency(sales)     + '</div>'
            + '<div style="color:#6b7280;">Achievement</div><div style="text-align:right;font-weight:600;color:' + achColor + ';">' + ach.toFixed(2) + '%</div>'
            + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
            + '<div style="color:#6b7280;">Commission</div><div style="text-align:right;color:#2563eb;">'       + formatCurrency(comm)    + '</div>'
            + '<div style="color:#6b7280;">Collection Bonus</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(collBon) + '</div>'
            + '<div style="color:#6b7280;">Call Bonus</div><div style="text-align:right;color:#2563eb;">'       + formatCurrency(callBon) + '</div>'
            + (isQtr ? '<div style="color:#6b7280;">Quarterly Bonus</div><div style="text-align:right;color:#2563eb;">' + formatCurrency(qtrBon) + '</div>' : '')
            + '<div style="color:#6b7280;font-weight:600;">Total Commission</div><div style="text-align:right;font-weight:700;color:#16a34a;">' + formatCurrency(totalComm) + '</div>'
            + '<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
            + '<div style="color:#6b7280;">EPF (' + epfRate + '%)</div><div style="text-align:right;color:#dc2626;">- ' + formatCurrency(epfAmt) + '</div>'
            + '<div style="font-weight:700;color:#111;">Grand Total</div><div style="text-align:right;font-weight:700;font-size:15px;color:#4f46e5;">' + formatCurrency(grandTotal) + '</div>'
            + '</div></div>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'history-view-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:flex-start;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;overflow-y:auto;';

    var box = document.createElement('div');
    box.style.cssText = 'background:#f9fafb;border-radius:16px;max-width:640px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.3);overflow:hidden;margin:auto;';

    var closeBtn = '<button onclick="document.getElementById(\'history-view-modal\').remove()" style="padding:8px 16px;background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;">&#10005; Close</button>';
    var excelBtn = '<button onclick="exportHistoryToExcel(' + index + ')" style="padding:8px 16px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">&#128202; Excel</button>';

    box.innerHTML = '<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:20px 24px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
        + '<div><div style="font-size:20px;font-weight:700;">' + month + ' Report</div>'
        + '<div style="font-size:13px;opacity:0.85;margin-top:4px;">' + people.length + ' salespeople</div></div>'
        + '<div style="display:flex;gap:8px;">' + excelBtn + closeBtn + '</div></div>'
        + '<div style="padding:20px;max-height:70vh;overflow-y:auto;">'
        + (people.length > 0 ? cards : '<div style="text-align:center;padding:40px;color:#6b7280;">No data for this month</div>')
        + '</div>';

    box.addEventListener('click', function(e){ e.stopPropagation(); });
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.addEventListener('click', function(){ modal.remove(); });
}

function deleteHistoryReport(index) {
    if (confirm('Are you sure you want to delete this history record?')) {
        window.appState.config.reportHistory.splice(index, 1);
        saveConfig();
        loadQuickCalculateHistory();
        showToast('✅', 'History record deleted');
    }
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
    if (!historyList) return;

    var history = window.appState.config.reportHistory || [];
    console.log('📜 reportHistory count:', history.length);

    if (history.length === 0) {
        historyList.innerHTML = '<div class="text-center py-8 text-gray-500"><p>No history records yet</p></div>';
        return;
    }

    var defaultRates = [
        {min:0,   max:79.99,  rate:0,     label:'0%-79%'},
        {min:80,  max:89.99,  rate:0.006, label:'80%-89%'},
        {min:90,  max:99.99,  rate:0.007, label:'90%-99%'},
        {min:100, max:105.99, rate:0.008, label:'100%-105%'},
        {min:106, max:999,    rate:0.01,  label:'106%+'}
    ];
    var cfgRates = window.appState.config.monthly_commission_rates;
    var rates = (cfgRates && cfgRates.length > 0) ? cfgRates : defaultRates;
    console.log('📜 using rates:', rates.length, 'tiers, first:', JSON.stringify(rates[0]));

    function calcComm(sales, target, name) {
        if (!target || !sales || target <= 0 || sales <= 0) return 0;
        var ach = (sales / target) * 100;
        var r = rates;
        var nu = name ? name.toUpperCase() : null;
        if (nu && window.appState.config.person_commission_rates && window.appState.config.person_commission_rates[nu])
            r = window.appState.config.person_commission_rates[nu];
        for (var i = 0; i < r.length; i++) {
            if (ach >= r[i].min && ach <= r[i].max) {
                var comm = sales * (r[i].rate || 0);
                console.log('💰', name, '| sales:', sales, '| target:', target, '| ach:', ach.toFixed(1)+'%', '| tier:', r[i].label, '| rate:', r[i].rate, '| comm:', comm);
                return comm;
            }
        }
        console.warn('⚠️ No tier matched for', name, 'ach:', ach.toFixed(1)+'%');
        return 0;
    }

    var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var currentMonthIdx = new Date().getMonth();
    var sorted = history.slice()
        .filter(function(r){ return monthOrder.indexOf((r.month||'').toUpperCase()) <= currentMonthIdx; })
        .sort(function(a,b){
            return monthOrder.indexOf((b.month||'').toUpperCase()) - monthOrder.indexOf((a.month||'').toUpperCase());
        });

    // Remove months where all people have 0 data
    sorted = sorted.filter(function(r){
        return (r.data||[]).some(function(p){ return (p.target||0)>0 || (p.sales||0)>0; });
    });

    if (sorted.length === 0) {
        historyList.innerHTML = '<div class="text-center py-8 text-gray-500"><p>No history records yet</p></div>';
        return;
    }

    historyList.innerHTML = sorted.map(function(report) {
        var people = report.data || [];
        var month  = (report.month||'').toUpperCase();
        var realIndex = history.indexOf(report);

        var totalComm = 0;
        people.forEach(function(p) {
            var comm    = calcComm(p.sales, p.target, p.name);
            var collPct = (p.collectionTarget||0) > 0 ? (p.collectionAmount||0)/p.collectionTarget*100 : 0;
            var callPct = (p.callTarget||0) > 0 ? (p.callActual||0)/p.callTarget*100 : 0;
            var coll    = calculateIncentive(collPct, window.appState.config.collection_incentive);
            var callB   = calculateIncentive(callPct, window.appState.config.active_call_incentive);
            totalComm  += comm + coll + callB;
        });

        var peopleCards = people.map(function(p) {
            var comm = calcComm(p.sales, p.target, p.name);
            var ach  = (p.target||0) > 0 ? (p.sales||0)/p.target*100 : 0;
            return '<div class="bg-white rounded p-3 text-center border border-gray-100">'
                + '<div class="font-medium text-gray-800 text-sm">' + (p.name||'—') + '</div>'
                + '<div class="text-xs text-gray-500 mt-1">Target: ' + formatCurrency(p.target||0) + '</div>'
                + '<div class="text-xs text-gray-500">Sales: ' + formatCurrency(p.sales||0) + '</div>'
                + '<div class="text-xs font-semibold mt-1 ' + (ach>=100?'text-green-600':ach>=90?'text-yellow-600':'text-red-500') + '">' + ach.toFixed(1) + '%</div>'
                + '<div class="text-xs text-indigo-600 font-medium">' + formatCurrency(comm) + '</div>'
                + '</div>';
        }).join('');

        return '<div class="bg-white rounded-xl shadow-sm p-5 border border-gray-200 mb-4">'
            + '<div class="flex justify-between items-start mb-3">'
            + '<div><h4 class="text-lg font-bold text-gray-900">' + month + '</h4>'
            + '<p class="text-sm text-gray-500">' + people.length + ' people &nbsp;|&nbsp; Total Commission: <span class="font-semibold text-green-600">' + formatCurrency(totalComm) + '</span></p></div>'
            + '<div class="flex gap-2 flex-wrap justify-end">'
            + '<button onclick="viewHistoryReport(' + realIndex + ')" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">👁 View</button>'
            + '<button onclick="exportHistoryToExcel(' + realIndex + ')" class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">📊 Excel</button>'
            + '<button onclick="printHistoryReport(' + realIndex + ')" class="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm">🖨 Print PDF</button>'
            + '<button onclick="deleteHistoryReport(' + realIndex + ')" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">🗑️ Delete</button>'
            + '</div></div>'
            + '<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">' + peopleCards + '</div>'
            + '</div>';
    }).join('');
}






// ==================== Live Payslip Preview ====================
function updateLivePayslip() {
    var ps = document.getElementById('live-payslip');
    if (!ps) return;
    ps.style.display = 'block';
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
    var salary  = (cfg.base_salaries  && cfg.base_salaries[nu])  || 0;
    var allow   = (cfg.allowances     && cfg.allowances[nu])     || {};
    var epfRate = (cfg.deductionRates && cfg.deductionRates[nu]  && cfg.deductionRates[nu].EPF_RATE) || 11;
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
    var totalInc   = totalFixed + comm + collBon + callBon + qtrBon;
    var epfAmt     = totalInc * (epfRate / 100);
    var grand      = totalInc - epfAmt;
    var achColor   = ach>=100 ? '#1D9E75' : ach>=90 ? '#BA7517' : '#E24B4A';
    var g = function(id){ return document.getElementById(id); };
    if(g('ps-title'))   g('ps-title').textContent   = person.name + ' — SALARY REPORT';
    if(g('ps-ach-lbl')) g('ps-ach-lbl').textContent = 'Achievement: ' + ach.toFixed(1) + '%';
    if(g('ps-ach-pct')){ g('ps-ach-pct').textContent = ach.toFixed(1)+'%'; g('ps-ach-pct').style.color = achColor; }
    if(g('ps-ach-bar')){ g('ps-ach-bar').style.width = Math.min(ach,120)+'%'; g('ps-ach-bar').style.background = achColor; }
    if(g('ps-personal')) g('ps-personal').textContent = formatCurrency(sales);
    // Team sale = sum of all salespeople sales this month
    var teamSales = 0;
    var curMonth = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    var hist = window.appState.config.reportHistory || [];
    var hEntry = hist.find(function(r){ return (r.month||'').toUpperCase() === curMonth; });
    if (hEntry && hEntry.data) {
        teamSales = hEntry.data.reduce(function(s,p){ return s + (parseFloat(p.sales)||0); }, 0);
    } else {
        // Fallback: sum from current appState
        teamSales = (window.appState.salespeople||[]).reduce(function(s,p){ return s+(parseFloat(p.sales)||0); }, 0);
    }
    if(g('ps-team')) g('ps-team').textContent = formatCurrency(teamSales || sales);
    if(g('ps-grand'))    g('ps-grand').textContent    = formatCurrency(grand);
    function fp(v){ return totalInc>0 ? (v/totalInc*100).toFixed(2)+'%' : '0.00%'; }
    function fc(v){ return formatCurrency(v); }
    function sec(l){ return '<tr style="background:#E6F1FB;"><td colspan="4" style="padding:4px 10px;font-weight:600;color:#0C447C;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">'+l+'</td></tr>'; }
    function row(l,v,blue,bold){
        var fw=bold?'font-weight:600;':'', bg=bold?'background:#B5D4F4;':'';
        var tc=blue?'color:#185FA5;':bold?'color:#0C447C;':'';
        var lc=bold?'color:#0C447C;':'color:var(--ink3);';
        return '<tr style="'+bg+'border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;'+fw+lc+'">'+l+'</td>'
            +'<td style="padding:4px 6px;text-align:right;'+fw+tc+'">'+fc(v)+'</td>'
            +'<td style="padding:4px 6px;text-align:right;color:var(--ink4);">'+fp(v)+'</td>'
            +'<td style="padding:4px 6px;text-align:right;color:var(--ink4);">'+fp(v)+'</td></tr>';
    }
    function erow(v){
        return '<tr style="border-top:0.5px solid var(--line);">'
            +'<td style="padding:4px 10px;color:var(--ink3);">EPF '+epfRate+'%</td>'
            +'<td style="padding:4px 6px;text-align:right;color:#E24B4A;">'+fc(v)+'</td>'
            +'<td style="padding:4px 6px;text-align:right;color:var(--ink4);">'+fp(v)+'</td>'
            +'<td style="padding:4px 6px;text-align:right;color:var(--ink4);">'+fp(v)+'</td></tr>';
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
          + row('TOTAL',         totalInc, false, true)
          + erow(epfAmt);
    if(g('ps-body')) g('ps-body').innerHTML = html;
}
window.updateLivePayslip = updateLivePayslip;


function promptAddPerson() {
    var existing = document.getElementById('add-person-modal');
    if (existing) existing.remove();

    // Build overlay - clicking overlay closes modal
    var overlay = document.createElement('div');
    overlay.id = 'add-person-modal';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.55);display:flex;align-items:center;justify-content:center;z-index:99999;';

    // Build card - stops propagation so clicks inside don't close modal
    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:16px;width:380px;box-shadow:0 25px 60px rgba(0,0,0,.3);overflow:hidden;font-family:sans-serif;';

    // Header
    var hdr = document.createElement('div');
    hdr.style.cssText = 'background:#1e3a8a;padding:20px 24px;color:#fff;';
    hdr.innerHTML = '<div style="font-size:16px;font-weight:700;">Add New Person</div><div style="font-size:12px;opacity:.7;margin-top:2px;">Enter name to get started</div>';
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
        overlay.remove();
        addNewPerson(name);
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
    items.forEach(function(item) {
        var text = item.textContent.toUpperCase();
        item.style.display = (!q || text.includes(q)) ? '' : 'none';
    });
}

function openHistoryExcel(index) {
    // Same commission calculation as reExportHistory, but opens directly instead of saving
    var report = (window.appState.config.reportHistory||[])[index];
    if (!report) return;
    showToast('⏳', 'Opening Excel...');
    try {
        var cfg = window.appState.config;
        var defRates = [{min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},{min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.01}];
        var rates = (cfg.monthly_commission_rates&&cfg.monthly_commission_rates.length>0)?cfg.monthly_commission_rates:defRates;
        var isQtr = ['MAR','JUN','SEP','DEC'].indexOf((report.month||'').toUpperCase()) !== -1;
        function calcInc(pct,tiers){if(!tiers||!tiers.length)return 0;var s=tiers.slice().sort(function(a,b){return b.min-a.min;});for(var i=0;i<s.length;i++)if(pct>=s[i].min)return s[i].incentive||0;return 0;}
        // Filter out people who have been deleted from config
        var activePeople = Object.keys(cfg.base_salaries || {}).map(function(n){ return n.toUpperCase(); });
        var reportData = (report.data||[]).filter(function(p){
            return activePeople.indexOf((p.name||'').toUpperCase()) !== -1;
        });
        var salesData=reportData.map(function(p){
            var nu=(p.name||'').toUpperCase();
            var salary=(cfg.base_salaries&&cfg.base_salaries[nu])||1700;
            var allowances=(cfg.allowances&&cfg.allowances[nu])||{};
            var epfRate=(cfg.deductionRates&&cfg.deductionRates[nu]&&cfg.deductionRates[nu].EPF_RATE)||11;
            var target=parseFloat(p.target)||0,sales=parseFloat(p.sales)||0;
            var collTgt=parseFloat(p.collectionTarget)||0,collAmt=parseFloat(p.collectionAmount)||0;
            var callTgt=parseFloat(p.callTarget)||0,callAct=parseFloat(p.callActual)||0;
            var ach=target>0?(sales/target*100):0;
            var pRates=(cfg.person_commission_rates&&cfg.person_commission_rates[nu])||rates;
            var commission=0;
            if(target>0&&sales>0)for(var i=0;i<pRates.length;i++)if(ach>=pRates[i].min&&ach<=pRates[i].max){commission=sales*(pRates[i].rate||0);break;}
            var collI=calcInc(collTgt>0?collAmt/collTgt*100:0,(cfg.person_collection_incentive&&cfg.person_collection_incentive[nu])||cfg.collection_incentive||[]);
            var callI=calcInc(callTgt>0?callAct/callTgt*100:0,(cfg.person_call_incentive&&cfg.person_call_incentive[nu])||cfg.active_call_incentive||[]);
            var qtrI=isQtr?calcInc(ach,(cfg.person_quarterly_incentive&&cfg.person_quarterly_incentive[nu])||cfg.quarterly_incentive||[]):0;
            return {name:p.name,salary:salary,allowances:allowances,epfRate:epfRate,sales:sales,target:target,achievement:ach,
                commission:commission,collectionIncentive:collI,activeCallIncentive:callI,quarterlyBonus:qtrI,
                totalCommission:commission+collI+callI+qtrI,collectionTarget:collTgt,collectionAmount:collAmt,
                callTarget:callTgt,callActual:callAct,quarterlySales:0,quarterlyTarget:0};
        });
        window.electronAPI.openExcelPreview({salespeople:salesData, config:cfg, month:report.month})
            .then(function(result){
                if(result.success) showToast('✅', 'Excel opened!');
                else showToast('❌', 'Failed: '+(result.error||''));
            });
    } catch(e){ showToast('❌', e.message); }
}
window.openHistoryExcel = openHistoryExcel;

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

    // EPF & grand total
    var totalIncome = totalFixed + totalComm;
    var epfAmt      = Math.round(totalIncome * (epfRate/100) * 100) / 100;
    var grandTotal  = totalIncome - epfAmt;

    var fmt = function(n) { return 'RM ' + parseFloat(n||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2}); };

    // Build allowance rows (only non-zero)
    var allowRows = allowList.filter(function(a){return a[1]>0;}).map(function(a){
        return '<tr><td style="padding:6px 12px;color:#6b7280;">'+a[0]+'</td><td style="padding:6px 12px;text-align:right;">'+fmt(a[1])+'</td></tr>';
    }).join('');
    if (!allowRows) allowRows = '<tr><td colspan="2" style="padding:6px 12px;color:#9ca3af;font-style:italic;">No allowances</td></tr>';

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
                    <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:1px;margin-bottom:8px;">COMMISSION & INCENTIVES</div>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:14px;">
                    <tr style="background:#f9fafb;">
                        <td style="padding:6px 12px 6px 24px;">Commission (${person.achievement?person.achievement.toFixed(1)+'%':'—'})</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;">${fmt(commission)}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 12px 6px 24px;">Collection Bonus</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;">${fmt(collBonus)}</td>
                    </tr>
                    <tr style="background:#f9fafb;">
                        <td style="padding:6px 12px 6px 24px;">Active Call Bonus</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;">${fmt(callBonus)}</td>
                    </tr>
                    <tr>
                        <td style="padding:6px 12px 6px 24px;">Quarterly Bonus</td>
                        <td style="padding:6px 24px 6px 12px;text-align:right;">${fmt(qtrBonus)}</td>
                    </tr>
                    <tr style="background:#f0fdf4;border-top:2px solid #bbf7d0;">
                        <td style="padding:8px 12px 8px 24px;font-weight:700;color:#15803d;">Total Commission</td>
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
        const coll = calculateIncentive(collAch, window.appState.config.collection_incentive);
        const call = calculateIncentive(callAch, window.appState.config.active_call_incentive);
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
    const report = (window.appState.config.reportHistory || [])[index];
    if (!report) return;
    window.electronAPI.exportPDF({ name: report.month + '_Report' })
        .then(r => { if (r.success) showToast('✅', 'PDF saved!'); })
        .catch(e => showToast('❌', e.message));
}

window.exportHistoryToExcel = exportHistoryToExcel;
window.printHistoryReport   = printHistoryReport;

function manualSave() {
    var month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    if (!month) { showToast('⚠️', 'Please select a month first'); return; }

    // Update all card data from DOM inputs
    window.appState.salespeople.forEach(function(p, idx) { updateSalespersonData(idx); });

    var snapshot = {
        month: month,
        salespeople: window.appState.salespeople.map(function(p){ return Object.assign({},p); })
    };
    window.appState.config.quickCalculateData = snapshot;

    // Sync current salespeople into reportHistory for this month
    if (!window.appState.config.reportHistory) window.appState.config.reportHistory = [];
    var validPeople = window.appState.salespeople.filter(function(p){ return p.name && (p.target > 0 || p.sales > 0); });
    if (validPeople.length > 0) {
        var existIdx = window.appState.config.reportHistory.findIndex(function(r){ return (r.month||'').toUpperCase() === month; });
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
            window.appState.config.reportHistory.push({ month: month, data: histData });
        }
    }

    // Save to JSON config
    window.electronAPI.saveConfig(window.appState.config).then(function(r){
        if(r && r.success) showToast('✅', 'Saved!');
        else showToast('❌', 'Save failed: ' + (r && r.error || 'unknown'));
    }).catch(function(e){ showToast('❌', e.message); });

    // Save to SQLite DB
    dbSave('quickCalculateData', snapshot);
    dbSave('reportHistory', window.appState.config.reportHistory);

    // Refresh history if visible
    if (document.getElementById('history-list')) loadQuickCalculateHistory();
}
window.manualSave = manualSave;


// ==================== People Tab ====================
function renderPeopleList() {
    var container = document.getElementById('people-list-container');
    if (!container) return;
    var people = Object.keys(window.appState.config.base_salaries || {});
    if (people.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--ink4);">'
            + '<div style="font-size:40px;margin-bottom:12px;">👥</div>'
            + '<div style="font-size:14px;font-weight:600;">No salespeople yet</div>'
            + '<div style="font-size:12px;margin-top:6px;">Add a person above to get started</div></div>';
        return;
    }
    container.innerHTML = '';
    var colors = ['#dbeafe:#1e40af','#fce7f3:#be185d','#dcfce7:#15803d','#fef9c3:#a16207','#ede9fe:#6d28d9','#fff1f2:#be123c'];
    people.forEach(function(name, i) {
        var salary = window.appState.config.base_salaries[name] || 0;
        var allow  = window.appState.config.allowances[name] || {};
        var totalAllow = Object.values(allow).reduce(function(s,v){return s+(parseFloat(v)||0);},0);
        var hasPersonal = window.appState.config.person_commission_rates && window.appState.config.person_commission_rates[name];
        var col = (colors[i%colors.length]||'#f1f5f9:#64748b').split(':');
        var item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px 18px;background:var(--paper);border:1px solid var(--line);border-radius:var(--r);box-shadow:var(--sh);transition:box-shadow .15s;margin-bottom:8px;';
        item.innerHTML =
            '<div style="width:38px;height:38px;border-radius:50%;background:'+col[0]+';color:'+col[1]+';display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;flex-shrink:0;">'+name[0]+'</div>'
            + '<div style="flex:1;">'
            + '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:3px;">'+name+'</div>'
            + '<div style="font-size:11px;color:var(--ink3);display:flex;align-items:center;gap:6px;flex-wrap:wrap;">'
            + 'Base: RM '+salary.toLocaleString()+' &nbsp;·&nbsp; Allowances: RM '+totalAllow.toLocaleString()+' &nbsp;·&nbsp; '
            + (hasPersonal
                ? '<span style="background:var(--vi-l);color:var(--vi);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">✦ Personal</span>'
                : '<span style="background:var(--sheet);color:var(--ink4);padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;border:1px solid var(--line);">Company Rate</span>')
            + '</div></div>'
            + '<div style="display:flex;gap:6px;" id="pi-btns-'+i+'"></div>';
        container.appendChild(item);
        var btns = item.querySelector('#pi-btns-'+i);
        var bS = document.createElement('button');
        bS.style.cssText = 'padding:7px 14px;border-radius:var(--r);font-size:11px;font-weight:700;cursor:pointer;font-family:Sora,sans-serif;border:1.5px solid #bae6fd;background:#e0f2fe;color:#0284c7;';
        bS.textContent = '💵 Salary';
        bS.addEventListener('click',(function(n){return function(){showSalaryModal(n);};})(name));
        var bC = document.createElement('button');
        bC.style.cssText = 'padding:7px 14px;border-radius:var(--r);font-size:11px;font-weight:700;cursor:pointer;font-family:Sora,sans-serif;border:1.5px solid #ddd6fe;background:var(--vi-l);color:var(--vi);';
        bC.textContent = '💰 Commission';
        bC.addEventListener('click',(function(n){return function(){showCommissionModal(n);};})(name));
        var bD = document.createElement('button');
        bD.style.cssText = 'padding:7px 10px;border-radius:var(--r);font-size:11px;font-weight:700;cursor:pointer;font-family:Sora,sans-serif;border:1.5px solid #ffe4e6;background:#fff5f7;color:var(--rose);';
        bD.textContent = '🗑️';
        bD.addEventListener('click',(function(n){return function(){deleteSalespersonConfig(n);};})(name));
        btns.appendChild(bS); btns.appendChild(bC); btns.appendChild(bD);
    });
}

function showSalaryModal(personName) {
    var ex=document.getElementById('salary-setup-modal'); if(ex)ex.remove();
    var cfg=window.appState.config;
    var allow=(cfg.allowances&&cfg.allowances[personName])||{};
    var epfRate=(cfg.deductionRates&&cfg.deductionRates[personName]&&cfg.deductionRates[personName].EPF_RATE)||11;
    var salary=(cfg.base_salaries&&cfg.base_salaries[personName])||1700;
    var IS='width:100%;padding:9px 12px;border:1.5px solid var(--line);border-radius:var(--r);font-size:13px;font-family:Sora,sans-serif;outline:none;background:var(--paper);color:var(--ink);box-sizing:border-box;';
    function makeRow(lbl,id,val,half){
        return '<div style="'+(half?'':'')+'margin-bottom:10px;">'
            +'<label style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:.8px;text-transform:uppercase;display:block;margin-bottom:5px;">'+lbl+'</label>'
            +'<input id="sm-'+id+'" type="number" value="'+val+'" style="'+IS+'"></div>';
    }
    var modal=document.createElement('div');
    modal.id='salary-setup-modal';
    modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(8,15,26,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:16px;box-sizing:border-box;';
    var card=document.createElement('div');
    card.style.cssText='background:var(--paper);border-radius:16px;max-width:520px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 60px rgba(8,15,26,.25);';
    card.addEventListener('click',function(e){e.stopPropagation();});
    card.innerHTML=
        '<div style="background:linear-gradient(135deg,#0f172a,#1e40af);padding:20px 24px;color:#fff;flex-shrink:0;">'
        +'<div style="font-size:17px;font-weight:800;letter-spacing:-.3px;">💵 Salary Setup</div>'
        +'<div style="font-size:12px;opacity:.6;margin-top:3px;">'+personName+'</div></div>'
        +'<div style="padding:20px 24px;overflow-y:auto;flex:1;">'
        +'<div style="background:var(--em-l);border:1px solid #a7f3d0;border-radius:var(--r);padding:14px;margin-bottom:14px;">'
        +'<div style="font-size:10px;font-weight:700;color:#065f46;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Base Salary</div>'
        +makeRow('Base Salary (RM)','base',salary)+'</div>'
        +'<div style="background:var(--blue-l);border:1px solid #bae6fd;border-radius:var(--r);padding:14px;margin-bottom:14px;">'
        +'<div style="font-size:10px;font-weight:700;color:#075985;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Allowances (RM)</div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        +makeRow('HP','HP',allow.HP||0,true)+makeRow('Car','CAR',allow.CAR||0,true)
        +makeRow('Local Fuel','LOCALFUEL',allow['LOCAL FUEL']||0,true)+makeRow('Outstation Fuel','OUTFUEL',allow['OUTSTATION FUEL']||0,true)
        +makeRow('Housing','HOUSING',allow.HOUSING||0,true)+makeRow('Food','FOOD',allow.FOOD||0,true)
        +'</div>'+makeRow('Others','OTHERS',allow.OTHERS||0)+'</div>'
        +'<div style="background:var(--sheet);border:1px solid var(--line);border-radius:var(--r);padding:14px;">'
        +'<div style="font-size:10px;font-weight:700;color:var(--ink3);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">Deduction</div>'
        +makeRow('EPF Rate (%)','epf',epfRate)+'</div>'
        +'</div>'
        +'<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:10px;justify-content:flex-end;background:var(--paper);flex-shrink:0;">'
        +'<button id="sm-cancel" style="padding:9px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        +'<button id="sm-save" style="padding:9px 24px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#1e40af);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save & Next →</button>'
        +'</div>';
    modal.appendChild(card);
    document.body.appendChild(modal);
    modal.addEventListener('click',function(){modal.remove();});
    document.getElementById('sm-cancel').addEventListener('click',function(){modal.remove();});
    document.getElementById('sm-save').addEventListener('click',function(){saveSalaryModal(personName);});
}

function saveSalaryModal(personName) {
    var cfg=window.appState.config;
    var base=parseFloat(document.getElementById('sm-base').value)||1700;
    var hp=parseFloat(document.getElementById('sm-HP').value)||0;
    var car=parseFloat(document.getElementById('sm-CAR').value)||0;
    var lf=parseFloat(document.getElementById('sm-LOCALFUEL').value)||0;
    var of2=parseFloat(document.getElementById('sm-OUTFUEL').value)||0;
    var hs=parseFloat(document.getElementById('sm-HOUSING').value)||0;
    var food=parseFloat(document.getElementById('sm-FOOD').value)||0;
    var oth=parseFloat(document.getElementById('sm-OTHERS').value)||0;
    var epfR=parseFloat(document.getElementById('sm-epf').value)||11;
    if(!cfg.base_salaries)cfg.base_salaries={};
    if(!cfg.allowances)cfg.allowances={};
    if(!cfg.deductions)cfg.deductions={};
    if(!cfg.deductionRates)cfg.deductionRates={};
    cfg.base_salaries[personName]=base;
    cfg.allowances[personName]={HP:hp,CAR:car,'LOCAL FUEL':lf,'OUTSTATION FUEL':of2,HOUSING:hs,FOOD:food,OTHERS:oth};
    var ti=base+hp+car+lf+of2+hs+food+oth;
    cfg.deductions[personName]={EPF:Math.round(ti*(epfR/100)*100)/100,SOCSO:Math.round(ti*0.005*100)/100,PCB:0,EIS:0};
    cfg.deductionRates[personName]={EPF_RATE:epfR};
    saveConfig();
    var m=document.getElementById('salary-setup-modal');if(m)m.remove();
    renderPeopleList();
    showToast('✅',personName+' salary saved!');
    setTimeout(function(){showCommissionModal(personName);},300);
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
        +'<div style="font-size:12px;opacity:.6;margin-top:3px;">'+personName+' — Edit to create personal override</div></div>'
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
        +'<div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;gap:8px;justify-content:space-between;background:var(--paper);flex-shrink:0;">'
        +'<button id="cm-global-btn" style="padding:9px 16px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:12px;font-weight:600;font-family:Sora,sans-serif;color:var(--ink3);">↩ Use Company Rate</button>'
        +'<div style="display:flex;gap:8px;">'
        +'<button id="cm-cancel-btn" style="padding:9px 20px;border:1.5px solid var(--line);border-radius:var(--r);background:var(--paper);cursor:pointer;font-size:13px;font-weight:600;font-family:Sora,sans-serif;">Cancel</button>'
        +'<button id="cm-save-btn" style="padding:9px 24px;border:none;border-radius:var(--r);background:linear-gradient(135deg,#0f172a,#4f46e5);color:#fff;cursor:pointer;font-size:13px;font-weight:700;font-family:Sora,sans-serif;">💾 Save</button>'
        +'</div></div>';
    modal.appendChild(card);
    document.body.appendChild(modal);
    modal.addEventListener('click',function(){modal.remove();});
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
    document.getElementById('cm-global-btn').addEventListener('click',function(){resetToGlobalComm(personName);});
}

function renderTempRates() {
    var wrap=document.getElementById('cm-tiers');if(!wrap)return;
    wrap.innerHTML='';
    (window._tempRates||[]).forEach(function(t,i){
        var row=document.createElement('div');
        row.style.cssText='display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:6px;align-items:center;padding:7px;background:var(--paper);border:1px solid var(--line);border-radius:8px;margin-bottom:5px;';
        var IS='padding:7px 9px;border:1.5px solid var(--line);border-radius:7px;font-size:12px;font-family:IBM Plex Mono,monospace;width:100%;box-sizing:border-box;outline:none;background:var(--paper);';
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
        var IS='padding:7px 9px;border:1.5px solid var(--line);border-radius:7px;font-size:12px;font-family:IBM Plex Mono,monospace;width:100%;box-sizing:border-box;outline:none;background:var(--paper);';
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
window.updateAchievementHero=updateAchievementHero;

window.promptAddPerson = promptAddPerson;
window.filterPeopleList = filterPeopleList;
window.renderPeopleList = renderPeopleList;
window.showSalaryModal = showSalaryModal;
window.showCommissionModal = showCommissionModal;
window.renderPersonSidebar = renderPersonSidebar;
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