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
    console.log(`Switching to view: ${view}`);
    
    // Update tab buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${view}`).classList.add('active');
    
    // Hide all views
    document.querySelectorAll('.view-container').forEach(v => {
        v.classList.add('hidden');
    });
    
    // Show selected view
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.classList.remove('hidden');
    }
    
    window.appState.currentView = view;
    
    // Initialize corresponding view
    if (view === 'quick') {
        initQuickCalculate();
    } else if (view === 'salary') {
        initSalaryView();
    } else if (view === 'commission') {
        initCommissionView();
    } else if (view === 'history') {
        loadQuickCalculateHistory();
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
                    // No imported data — just recalculate locked fields (quarterly, collection)
                    window.appState.salespeople.forEach((p, idx) => {
                        if (p.name) {
                            autoFillLockedFields(idx);
                            updateSalespersonData(idx);
                        }
                    });
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
    if (!personName) {
        showToast('⚠️', 'Please provide the salesperson name to delete');
        return;
    }
    
    if (confirm(`Are you sure you want to delete all salary configuration for ${personName}? This action cannot be undone.`)) {
        const nameUpper = personName.toUpperCase();
        
        console.log(`🗑️ Deleting salesperson configuration: ${personName}`);
        
        // Delete from all related configurations
        if (window.appState.config.base_salaries && window.appState.config.base_salaries[nameUpper]) {
            delete window.appState.config.base_salaries[nameUpper];
        }
        
        if (window.appState.config.allowances && window.appState.config.allowances[nameUpper]) {
            delete window.appState.config.allowances[nameUpper];
        }
        
        if (window.appState.config.deductions && window.appState.config.deductions[nameUpper]) {
            delete window.appState.config.deductions[nameUpper];
        }
        
        if (window.appState.config.deductionRates && window.appState.config.deductionRates[nameUpper]) {
            delete window.appState.config.deductionRates[nameUpper];
        }
        
        if (window.appState.config.earnings && window.appState.config.earnings[nameUpper]) {
            delete window.appState.config.earnings[nameUpper];
        }
        
        if (window.appState.config.active_call_targets && window.appState.config.active_call_targets[nameUpper]) {
            delete window.appState.config.active_call_targets[nameUpper];
        }
        
        // Save configuration
        saveConfig();
        
        // Re-render
        renderSalaryConfigs();
        
        showToast('✅', `${personName}'s configuration deleted`);
    }
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

    // Auto-save debounced 500ms
    if (window._autoSaveTimer) clearTimeout(window._autoSaveTimer);
    window._autoSaveTimer = setTimeout(function() {
        var _snap = {
            month: ((document.getElementById('report-month')||{}).value||'').toUpperCase(),
            salespeople: window.appState.salespeople.map(function(p){return Object.assign({},p);})
        };
        window.appState.config.quickCalculateData = _snap;
        saveConfig().catch(function(){});
        dbSave('quickCalculateData', _snap).catch(function(){});
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
    const summaryContainer = document.getElementById('summary-view');
    if (!summaryContainer) return;

    const allPeople = window.appState.salespeople;
    const validAll  = allPeople.filter(p => p.name && p.target > 0 && p.sales > 0);

    // Determine view mode — default 'current' if only 1 person, else show toggle
    if (!window._summaryMode) window._summaryMode = 'current';
    const mode = window._summaryMode;

    // Current person = index 0 (only card)
    const curPerson = allPeople[0] || null;
    const curValid  = curPerson && curPerson.name && curPerson.target > 0 && curPerson.sales > 0;

    // Compute totals for "all" mode from reportHistory for current month
    const month = ((document.getElementById('report-month')||{}).value||'').toUpperCase();
    const histEntry = (window.appState.config.reportHistory||[]).find(r=>(r.month||'').toUpperCase()===month);
    const histPeople = histEntry ? histEntry.data || [] : [];

    // Determine display values
    let dispPeople, dispCommission, dispTarget, dispSales, dispLabel;

    if (mode === 'all' && histPeople.length > 0) {
        dispPeople     = histPeople.length;
        dispTarget     = histPeople.reduce((s,p)=>s+(parseFloat(p.target)||0),0);
        dispSales      = histPeople.reduce((s,p)=>s+(parseFloat(p.sales)||0),0);
        dispCommission = validAll.reduce((s,p)=>s+(p.totalCommission||0),0);
        // For all mode, sum commissions from history using global config
        if (histPeople.length > 0) {
            dispCommission = histPeople.reduce((s,p) => {
                const ach = p.target>0?(p.sales/p.target)*100:0;
                const comm = calculateCommission(p.sales||0, p.target||0, p.name);
                const collAch = p.collectionTarget>0?(p.collectionAmount/p.collectionTarget)*100:0;
                const callAch = p.callTarget>0?(p.callActual||0)/p.callTarget*100:0;
                const coll = calculateIncentive(collAch, window.appState.config.collection_incentive);
                const call = calculateIncentive(callAch, window.appState.config.active_call_incentive);
                return s + comm + coll + call;
            }, 0);
        }
        dispLabel = month + ' — All (' + dispPeople + ' people)';
    } else {
        // Current person
        dispPeople     = curPerson ? 1 : 0;
        dispTarget     = curPerson ? (curPerson.target||0) : 0;
        dispSales      = curPerson ? (curPerson.sales||0) : 0;
        dispCommission = curValid  ? (curPerson.totalCommission||0) : 0;
        dispLabel      = curPerson && curPerson.name ? curPerson.name : 'No data';
    }

    const achievement = dispTarget > 0 ? (dispSales / dispTarget * 100) : 0;
    const hasHistory  = histPeople.length > 1 || (histPeople.length === 1 && (!curPerson || (histPeople[0].name||'') !== (curPerson.name||'').toUpperCase()));

    // Update summary count and commission
    const summaryCount = document.getElementById('summary-count');
    const summaryComm  = document.getElementById('summary-commission');
    if (summaryCount) summaryCount.textContent = dispPeople;
    if (summaryComm)  summaryComm.textContent  = formatCurrency(dispCommission);

    // Remove old details + toggle
    summaryContainer.querySelectorAll('.summary-details,.summary-toggle').forEach(el=>el.remove());

    // Toggle button (only show if there's history data for other people)
    if (hasHistory) {
        const toggleDiv = document.createElement('div');
        toggleDiv.className = 'summary-toggle flex gap-2 mt-3';
        toggleDiv.innerHTML =
            '<button onclick="setSummaryMode(\'current\')" style="flex:1;padding:6px 0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;'
            + (mode==='current'?'background:#ffffff;color:#2563eb;border:2px solid #fff;':'background:rgba(255,255,255,0.2);color:#fff;border:2px solid rgba(255,255,255,0.4);')
            + '">Current Person</button>'
            + '<button onclick="setSummaryMode(\'all\')" style="flex:1;padding:6px 0;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;'
            + (mode==='all'?'background:#ffffff;color:#2563eb;border:2px solid #fff;':'background:rgba(255,255,255,0.2);color:#fff;border:2px solid rgba(255,255,255,0.4);')
            + '">All People</button>';
        summaryContainer.insertAdjacentElement('afterbegin', toggleDiv);
    }

    // Details section
    if (dispPeople > 0 && dispTarget > 0) {
        const detailsHtml = `
            <div class="summary-details mt-4 pt-4 border-t border-blue-400">
                <div class="text-sm text-blue-100 mb-1">${dispLabel}</div>
                <div class="text-sm">
                    <div class="flex justify-between mb-1">
                        <span class="text-blue-100">Target:</span>
                        <span>${formatCurrency(dispTarget)}</span>
                    </div>
                    <div class="flex justify-between mb-1">
                        <span class="text-blue-100">Sales:</span>
                        <span>${formatCurrency(dispSales)}</span>
                    </div>
                    <div class="flex justify-between mb-1">
                        <span class="text-blue-100">Achievement:</span>
                        <span class="font-bold ${achievement>=100?'text-green-300':achievement>=90?'text-yellow-200':'text-red-300'}">${achievement.toFixed(1)}%</span>
                    </div>
                </div>
            </div>`;
        summaryContainer.insertAdjacentHTML('beforeend', detailsHtml);
    }
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
    const ddOpts = ['<option value="__global__"'+(selectedName==='__global__'?' selected':'')+'>\u{1F310} Global (all)</option>'].concat(people.map(n=>'<option value="'+n+'"'+(n===selectedName?' selected':'')+'>'+n+'</option>')).join('');
    const ddHtml = '<div class="mb-6 flex flex-wrap items-center gap-4"><div><label class="block text-sm font-medium text-gray-700 mb-1">Configure for</label>'
        + '<select id="commission-person-select" onchange="renderCommissionConfigs(this.value)" class="px-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900" style="min-width:220px;">'
        + ddOpts + '</select></div>'
        + (isP ? '<div class="mt-5">'+(hasOv?'<span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">✏️ Personal config</span><button onclick="clearPersonCommissionConfig(\'' + sEnc + '\')" class="ml-2 px-3 py-1 bg-red-100 text-red-600 rounded-full text-sm">Reset to global</button>':'<span class="px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-sm">Same as global setting</span>')+'</div>':'')
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
    saveConfig(); renderCommissionConfigs(decodeURIComponent(pEnc)); showToast('\u2705','Reset to global config');
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
function addNewPerson() {
    const nameInput = document.getElementById('new-person-name');
    const salaryInput = document.getElementById('new-person-salary');
    
    let name = nameInput.value.trim();
    const salary = parseFloat(salaryInput.value) || 1700;
    
    if (!name) {
        showToast('⚠️', 'Please enter a name!');
        return;
    }
    
    const nameUpper = name.toUpperCase();
    
    if (window.appState.config.base_salaries && window.appState.config.base_salaries[nameUpper]) {
        showToast('⚠️', 'This salesperson already exists.');
        return;
    }
    
    if (!window.appState.config.base_salaries) window.appState.config.base_salaries = {};
    if (!window.appState.config.allowances) window.appState.config.allowances = {};
    if (!window.appState.config.deductions) window.appState.config.deductions = {};
    if (!window.appState.config.deductionRates) window.appState.config.deductionRates = {};
    
    window.appState.config.base_salaries[nameUpper] = salary;
    window.appState.config.allowances[nameUpper] = {
        HP: 0, CAR: 0, 'LOCAL FUEL': 0, 'OUTSTATION FUEL': 0,
        HOUSING: 0, FOOD: 0, OTHERS: 0
    };
    
    const totalIncome = salary;
    const epfAmount = Math.round(totalIncome * 0.11 * 100) / 100;
    const socsoAmount = Math.round(totalIncome * 0.005 * 100) / 100;
    
    window.appState.config.deductions[nameUpper] = {
        EPF: epfAmount,
        SOCSO: socsoAmount,
        PCB: 0,
        EIS: 0
    };
    
    window.appState.config.deductionRates[nameUpper] = {
        EPF_RATE: 11
    };
    
    nameInput.value = '';
    salaryInput.value = '1700';
    
    saveConfig();
    renderSalaryConfigs();
    
    showToast('✅', `${name} added successfully!`);
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
function addBackupUI() {
    // Check if already added
    if (document.getElementById('backup-section')) return;
    
    const historyContainer = document.getElementById('view-history');
    if (!historyContainer) return;
    
    const backupSection = document.createElement('div');
    backupSection.id = 'backup-section';
    backupSection.className = 'mt-8 p-6 bg-yellow-50 rounded-lg border border-yellow-200';
    backupSection.innerHTML = `
        <h3 class="text-lg font-bold text-yellow-800 mb-4">🔒 Data Backup & Restore</h3>
        <div class="space-y-3">
            <button onclick="exportFullBackup()" 
                    class="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center">
                <span class="mr-2">📥</span> Export Full Backup
            </button>
            <button onclick="importBackup()" 
                    class="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center justify-center">
                <span class="mr-2">📤</span> Import Backup
            </button>
            <button onclick="showAutoBackups()" 
                    class="w-full px-4 py-3 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 flex items-center justify-center">
                <span class="mr-2">⏰</span> Restore Auto Backup
            </button>
            <button onclick="createManualBackup()" 
                    class="w-full px-4 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center justify-center">
                <span class="mr-2">💾</span> Create Manual Backup
            </button>
            <div class="border-t border-yellow-300 pt-3 mt-3">
                <h4 class="font-semibold text-yellow-700 mb-2">Configuration Only</h4>
                <div class="grid grid-cols-2 gap-2">
                    <button onclick="exportConfigOnly()" 
                            class="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">
                        Export Config
                    </button>
                    <button onclick="importConfigOnly()" 
                            class="px-3 py-2 bg-gray-700 text-white rounded hover:bg-gray-800 text-sm">
                        Import Config
                    </button>
                </div>
            </div>
            <div class="text-xs text-yellow-700 mt-2">
                <p>• Auto backups are created daily</p>
                <p>• Last 5 auto backups are kept</p>
                <p>• Export backup for long-term storage</p>
                <p>• Manual backups don't count toward the 5 backup limit</p>
            </div>
        </div>
    `;
    historyContainer.appendChild(backupSection);
}

// Initialize backup system
function initBackupSystem() {
    // Check and create auto backup
    initBackupManagement();
    
    // Add backup UI to history page
    setTimeout(addBackupUI, 500);
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
    // Implementation for viewing historical reports
    console.log('Viewing history report at index:', index);
    showToast('ℹ️', 'History report view feature not yet implemented');
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
    const historyList = document.getElementById('history-list');
    if (!historyList) return;

    const history = window.appState.config.reportHistory || [];
    if (history.length === 0) {
        historyList.innerHTML = '<div class="text-center py-8 text-gray-500"><p>No history records yet</p></div>';
        return;
    }

    // Sort months in calendar order, filter out future months
    const monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const currentMonthIdx = new Date().getMonth(); // 0=JAN, 11=DEC
    const sorted = [...history]
        .filter(r => monthOrder.indexOf((r.month||'').toUpperCase()) <= currentMonthIdx)
        .sort((a,b) => {
            const ai = monthOrder.indexOf((a.month||'').toUpperCase());
            const bi = monthOrder.indexOf((b.month||'').toUpperCase());
            return bi - ai; // newest month first
        });

    historyList.innerHTML = sorted.map((report, index) => {
        const people = report.data || [];
        const month  = (report.month || '').toUpperCase();

        // Calculate total commission for each person
        let totalComm = 0;
        people.forEach(p => {
            const comm = calculateCommission(p.sales||0, p.target||0, p.name);
            const collAch = p.collectionTarget>0 ? (p.collectionAmount||0)/p.collectionTarget*100 : 0;
            const callAch = p.callTarget>0 ? (p.callActual||0)/p.callTarget*100 : 0;
            const coll = calculateIncentive(collAch, window.appState.config.collection_incentive);
            const call = calculateIncentive(callAch, window.appState.config.active_call_incentive);
            totalComm += comm + coll + call;
        });

        const realIndex = history.indexOf(report);

        const peopleCards = people.map(p => {
            const comm = calculateCommission(p.sales||0, p.target||0, p.name);
            const ach  = p.target>0 ? (p.sales||0)/p.target*100 : 0;
            return `<div class="bg-white rounded p-3 text-center border border-gray-100">
                <div class="font-medium text-gray-800 text-sm">${p.name||'—'}</div>
                <div class="text-xs text-gray-500 mt-1">Target: ${formatCurrency(p.target||0)}</div>
                <div class="text-xs text-gray-500">Sales: ${formatCurrency(p.sales||0)}</div>
                <div class="text-xs font-semibold mt-1 ${ach>=100?'text-green-600':ach>=90?'text-yellow-600':'text-red-500'}">${ach.toFixed(1)}%</div>
                <div class="text-xs text-indigo-600 font-medium">${formatCurrency(comm)}</div>
            </div>`;
        }).join('');

        return `
        <div class="bg-white rounded-xl shadow-sm p-5 border border-gray-200 mb-4">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="text-lg font-bold text-gray-900">${month}</h4>
                    <p class="text-sm text-gray-500">${people.length} people &nbsp;|&nbsp; Total Commission: <span class="font-semibold text-green-600">${formatCurrency(totalComm)}</span></p>
                </div>
                <div class="flex gap-2 flex-wrap justify-end">
                    <button onclick="viewHistoryReport(${realIndex})" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">👁 View</button>
                    <button onclick="exportHistoryToExcel(${realIndex})" class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">📊 Excel</button>
                    <button onclick="printHistoryReport(${realIndex})" class="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm">🖨 Print PDF</button>
                    <button onclick="deleteHistoryReport(${realIndex})" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">🗑️ Delete</button>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                ${peopleCards}
            </div>
        </div>`;
    }).join('');
}


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
    window.appState.salespeople.forEach(function(p, idx) { updateSalespersonData(idx); });
    var snapshot = {
        month: month,
        salespeople: window.appState.salespeople.map(function(p){ return Object.assign({},p); })
    };
    window.appState.config.quickCalculateData = snapshot;
    // saveConfig is in app.js and may not return a promise - call electronAPI directly
    window.electronAPI.saveConfig(window.appState.config).then(function(r){
        if(r && r.success) showToast('✅', 'Saved!');
        else showToast('❌', 'Save failed: ' + (r && r.error || 'unknown'));
    }).catch(function(e){ showToast('❌', e.message); });
    // Also save to DB
    dbSave('quickCalculateData', snapshot);
    dbSave('reportHistory', window.appState.config.reportHistory || []);
}
window.manualSave = manualSave;

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