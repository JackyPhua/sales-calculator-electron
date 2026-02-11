// ==================== 全局状态管理 ====================

// 确保 appState 存在
if (!window.appState) {
    window.appState = {
        salespeople: [],
        config: null,
        currentView: 'quick'
    };
}

// 初始化应用
async function initApp() {
    console.log('🚀 正在初始化应用...');
    
    try {
        // 加载配置
        await loadConfig();
        
        // 初始化当前视图
        switchView('quick');
        
        console.log('✅ 应用初始化完成');
    } catch (error) {
        console.error('初始化失败:', error);
        // 使用默认配置
        window.appState.config = getDefaultConfig();
        switchView('quick');
    }
}

// 加载配置
async function loadConfig() {
    try {
        if (window.electronAPI && window.electronAPI.loadConfig) {
            const config = await window.electronAPI.loadConfig();
            window.appState.config = config || getDefaultConfig();
        } else {
            window.appState.config = getDefaultConfig();
        }
        
        // 确保所有必要的配置项都存在
        ensureConfigStructure();
        
        console.log('📂 配置加载完成');
    } catch (error) {
        console.error('加载配置失败:', error);
        window.appState.config = getDefaultConfig();
    }
}

// 确保配置结构完整
function ensureConfigStructure() {
    const config = window.appState.config;
    
    // 确保所有必要的对象都存在
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
    
    // 确保 salespeople 数据为空（不要加载保存的销售员数据）
    config.quickCalculateData = null;
}

// 默认配置
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

// Toast 通知
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

// 视图切换
function switchView(view) {
    console.log(`切换到视图: ${view}`);
    
    // 更新标签按钮
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`tab-${view}`).classList.add('active');
    
    // 隐藏所有视图
    document.querySelectorAll('.view-container').forEach(v => {
        v.classList.add('hidden');
    });
    
    // 显示选中的视图
    const targetView = document.getElementById(`view-${view}`);
    if (targetView) {
        targetView.classList.remove('hidden');
    }
    
    window.appState.currentView = view;
    
    // 初始化对应视图
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

// ==================== QUICK CALCULATE 修复版 ====================

// 初始化 Quick Calculate
function initQuickCalculate() {
    console.log('📊 初始化 Quick Calculate');
    
    // 设置当前月份
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const monthSelect = document.getElementById('report-month');
    if (monthSelect) {
        monthSelect.value = currentMonth;
    }
    
    // 清空销售员数组（关键：不要加载保存的数据）
    window.appState.salespeople = [];
    
    // 清空容器
    const container = document.getElementById('salespeople-container');
    if (container) {
        container.innerHTML = '';
    }
    
    // 添加两个默认销售员卡片
    addSalespersonCard();
    addSalespersonCard();
    
    // 更新汇总
    updateSummaryView();
    
    console.log('✅ Quick Calculate 初始化完成');
}

// 添加销售员卡片（修复版 - 空白卡片）
function addSalespersonCard() {
    const container = document.getElementById('salespeople-container');
    if (!container) return;
    
    // 计算新ID
    const maxId = window.appState.salespeople.length > 0 
        ? Math.max(...window.appState.salespeople.map(p => p.id || 0))
        : 0;
    
    const newId = maxId + 1;
    const index = window.appState.salespeople.length;
    
    // 获取已配置的销售员
    const configuredPeople = Object.keys(window.appState.config.base_salaries || {});
    const nameOptions = configuredPeople.length > 0 
        ? configuredPeople.map(name => `<option value="${name}">${name}</option>`).join('')
        : '<option value="">请先配置销售员</option>';
    
    const card = document.createElement('div');
    card.className = 'card bg-white rounded-xl shadow-sm p-6 border border-gray-200 relative';
    card.innerHTML = `
        <!-- 删除按钮 -->
        <button onclick="deleteSalespersonCard(${newId})" 
                class="absolute top-3 right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full hover:bg-red-200 flex items-center justify-center transition-colors"
                title="删除此销售员">
            ✕
        </button>
        
        <div class="flex justify-between items-start mb-4">
            <h4 class="text-lg font-semibold text-gray-900">👤 Salesperson #${newId}</h4>
        </div>
        
        <div class="grid grid-cols-2 gap-4">
            <div>
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
                       oninput="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Sales (RM)</label>
                <input type="number" 
                       id="sales-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                       placeholder="Enter sales"
                       value=""
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
        
        <!-- Preview Section - 初始隐藏 -->
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
        </div>
    `;
    
    container.appendChild(card);
    
    // 添加到状态（使用空值）
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
    
    console.log(`➕ 添加空白销售员卡片 #${newId}`);
    return newId;
}

// 清除所有数据（修复版）
function clearAllQuickCalculateData() {
    if (confirm('确定要清除所有数据吗？此操作不可撤销。')) {
        console.log('🗑️ 清除所有数据');
        
        // 清空状态
        window.appState.salespeople = [];
        
        // 清空容器
        const container = document.getElementById('salespeople-container');
        if (container) {
            container.innerHTML = '';
        }
        
        // 添加两个全新的默认销售员卡片
        addSalespersonCard();
        addSalespersonCard();
        
        // 清除配置中的保存数据
        if (window.appState.config.quickCalculateData) {
            delete window.appState.config.quickCalculateData;
        }
        
        // 更新汇总
        updateSummaryView();
        
        showToast('🗑️', '所有数据已清除');
        
        console.log('✅ 数据清除完成');
    }
}

// 删除销售员配置（修复版）
function deleteSalespersonConfig(personName) {
    if (!personName) {
        showToast('⚠️', '请提供要删除的销售员姓名');
        return;
    }
    
    if (confirm(`确定要删除 ${personName} 的所有薪资配置吗？此操作不可撤销。`)) {
        const nameUpper = personName.toUpperCase();
        
        console.log(`🗑️ 删除销售员配置: ${personName}`);
        
        // 从所有相关配置中删除
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
        
        // 保存配置
        saveConfig();
        
        // 重新渲染
        renderSalaryConfigs();
        
        showToast('✅', `${personName} 的配置已删除`);
    }
}

// 重新渲染所有卡片（修复版）
function renderAllSalespeopleCards() {
    const container = document.getElementById('salespeople-container');
    if (!container) {
        console.error('找不到销售员容器');
        return;
    }
    
    console.log('🔄 重新渲染所有卡片');
    
    // 完全清空容器
    container.innerHTML = '';
    
    // 重新创建所有卡片
    window.appState.salespeople.forEach((person, index) => {
        const configuredPeople = Object.keys(window.appState.config.base_salaries || {});
        const nameOptions = configuredPeople.length > 0 
            ? configuredPeople.map(name => `<option value="${name}">${name}</option>`).join('')
            : '<option value="">请先配置销售员</option>';
        
        const card = document.createElement('div');
        card.className = 'card bg-white rounded-xl shadow-sm p-6 border border-gray-200 relative';
        card.innerHTML = `
            <!-- 删除按钮 -->
            <button onclick="deleteSalespersonCard(${person.id})" 
                    class="absolute top-3 right-3 w-8 h-8 bg-red-100 text-red-600 rounded-full hover:bg-red-200 flex items-center justify-center transition-colors"
                    title="删除此销售员">
                ✕
            </button>
            
            <div class="flex justify-between items-start mb-4">
                <h4 class="text-lg font-semibold text-gray-900">👤 Salesperson #${person.id}</h4>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <div>
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
                           value="${person.target || 50000}"
                           oninput="updateSalespersonData(${index})">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">Monthly Sales (RM)</label>
                    <input type="number" 
                           id="sales-${index}"
                           class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                           placeholder="48500"
                           value="${person.sales || 48500}"
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
            </div>
        `;
        
        container.appendChild(card);
        
        // 恢复数据
        setTimeout(() => {
            updateSalespersonData(index);
        }, 50);
    });
}

// 更新销售员数据
function updateSalespersonData(index) {
    const person = window.appState.salespeople[index];
    if (!person) return;
    
    // 获取输入值
    const nameInput = document.getElementById(`name-${index}`);
    const targetInput = document.getElementById(`target-${index}`);
    const salesInput = document.getElementById(`sales-${index}`);
    
    if (!nameInput || !targetInput || !salesInput) {
        console.error(`找不到输入元素 for index ${index}`);
        return;
    }
    
    person.name = nameInput.value;
    person.target = parseFloat(targetInput.value) || 0;
    person.sales = parseFloat(salesInput.value) || 0;
    person.quarterlyTarget = parseFloat(document.getElementById(`quarterly-target-${index}`).value) || 0;
    person.quarterlySales = parseFloat(document.getElementById(`quarterly-sales-${index}`).value) || 0;
    person.collectionTarget = parseFloat(document.getElementById(`collection-target-${index}`).value) || 0;
    person.collectionAmount = parseFloat(document.getElementById(`collection-amount-${index}`).value) || 0;
    person.callTarget = parseFloat(document.getElementById(`call-target-${index}`).value) || 0;
    person.callActual = parseFloat(document.getElementById(`call-actual-${index}`).value) || 0;
    
    // 检查是否有足够的数据来显示预览
    const hasData = person.name && person.target > 0 && person.sales > 0;
    const previewElement = document.getElementById(`preview-${index}`);
    
    if (hasData) {
        // 计算
        const achievement = person.target > 0 ? (person.sales / person.target) * 100 : 0;
        const quarterlyAchievement = person.quarterlyTarget > 0 ? (person.quarterlySales / person.quarterlyTarget) * 100 : 0;
        const collectionAchievement = person.collectionTarget > 0 ? (person.collectionAmount / person.collectionTarget) * 100 : 0;
        const callAchievement = person.callTarget > 0 ? (person.callActual / person.callTarget) * 100 : 0;
        
        // 佣金计算
        const commission = calculateCommission(person.sales, person.target);
        const collectionBonus = calculateIncentive(collectionAchievement, window.appState.config.collection_incentive);
        const callBonus = calculateIncentive(callAchievement, window.appState.config.active_call_incentive);
        const quarterlyBonus = calculateIncentive(quarterlyAchievement, window.appState.config.quarterly_incentive);
        const totalCommission = commission + collectionBonus + callBonus + quarterlyBonus;
        
        // 存储结果
        person.achievement = achievement;
        person.quarterlyAchievement = quarterlyAchievement;
        person.commission = commission;
        person.collectionIncentive = collectionBonus;
        person.activeCallIncentive = callBonus;
        person.quarterlyBonus = quarterlyBonus;
        person.totalCommission = totalCommission;
        
        // 显示预览
        if (previewElement) {
            previewElement.classList.remove('hidden');
        }
        
        // 更新预览内容
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
        // 隐藏预览并重置数据
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
    
    // 更新汇总
    updateSummaryView();
}

// 计算佣金
function calculateCommission(sales, target) {
    if (target <= 0 || sales <= 0) return 0;
    
    const achievement = (sales / target) * 100;
    const rates = window.appState.config.monthly_commission_rates || [];
    
    for (const tier of rates) {
        if (achievement >= tier.min && achievement <= tier.max) {
            return sales * (tier.rate || 0);
        }
    }
    
    return 0;
}

// 计算激励
function calculateIncentive(achievement, incentiveTiers) {
    if (achievement <= 0) return 0;
    
    for (const tier of incentiveTiers) {
        if (achievement >= tier.min) {
            return tier.incentive || 0;
        }
    }
    
    return 0;
}

// 获取成就颜色
function getAchievementColor(achievement) {
    if (achievement >= 100) return 'text-green-600';
    if (achievement >= 90) return 'text-yellow-600';
    if (achievement >= 80) return 'text-orange-600';
    return 'text-red-600';
}

// 格式化货币
function formatCurrency(amount) {
    if (isNaN(amount)) return 'RM 0.00';
    return `RM ${amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,')}`;
}

// 更新汇总视图
function updateSummaryView() {
    const summaryContainer = document.getElementById('summary-view');
    if (!summaryContainer) return;
    
    // 只计算有有效数据的销售员
    const validSalespeople = window.appState.salespeople.filter(p => 
        p.name && p.target > 0 && p.sales > 0
    );
    
    const totalPeople = window.appState.salespeople.length;
    const validMembers = validSalespeople.length;
    
    // 计算总佣金（只计算有效数据）
    let totalCommission = 0;
    validSalespeople.forEach(person => {
        totalCommission += (person.totalCommission || 0);
    });
    
    // 更新显示
    const summaryCount = document.getElementById('summary-count');
    const summaryCommission = document.getElementById('summary-commission');
    
    if (summaryCount) summaryCount.textContent = totalPeople;
    if (summaryCommission) summaryCommission.textContent = formatCurrency(totalCommission);
    
    // 更新详细摘要
    const existingDetails = summaryContainer.querySelector('.summary-details');
    if (existingDetails) {
        existingDetails.remove();
    }
    
    if (validMembers > 0) {
        // 计算平均成就率
        let totalTarget = 0;
        let totalSales = 0;
        validSalespeople.forEach(person => {
            totalTarget += (person.target || 0);
            totalSales += (person.sales || 0);
        });
        
        const averageAchievement = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;
        
        const detailsHtml = `
            <div class="summary-details mt-4 pt-4 border-t border-blue-400">
                <div class="text-sm">
                    <div class="flex justify-between mb-1">
                        <span class="text-blue-100">Valid Entries:</span>
                        <span>${validMembers}/${totalPeople}</span>
                    </div>
                    <div class="flex justify-between mb-1">
                        <span class="text-blue-100">Total Sales:</span>
                        <span>RM ${totalSales.toLocaleString()}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-blue-100">Avg Achievement:</span>
                        <span class="${getAchievementColor(averageAchievement)}">${averageAchievement.toFixed(1)}%</span>
                    </div>
                </div>
            </div>
        `;
        summaryContainer.insertAdjacentHTML('beforeend', detailsHtml);
    }
}

// ==================== COMMISSION & INCENTIVE 页面修复 ====================

function initCommissionView() {
    console.log('💰 初始化 Commission & Incentive 页面');
    renderCommissionConfigs();
}

function renderCommissionConfigs() {
    const container = document.getElementById('commission-config-container');
    if (!container) {
        console.error('找不到 Commission 配置容器');
        return;
    }
    
    // 获取配置
    const commissionRates = window.appState.config.monthly_commission_rates || [];
    const quarterlyIncentive = window.appState.config.quarterly_incentive || [];
    const collectionIncentive = window.appState.config.collection_incentive || [];
    const activeCallIncentive = window.appState.config.active_call_incentive || [];
    
    container.innerHTML = `
        <div class="space-y-6">
            <!-- 月度佣金设置 -->
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold">💰 Monthly Commission Rates</h3>
                    <button onclick="addCommissionTier()" 
                            class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        ➕ Add Tier
                    </button>
                </div>
                <div class="space-y-3" id="commission-rates-container">
                    ${commissionRates.map((tier, index) => `
                        <div class="bg-white p-3 rounded border border-gray-300">
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">Tier ${index + 1}:</span>
                                    <input type="text" 
                                           value="${tier.label || ''}" 
                                           onchange="updateCommissionLabel(${index}, this.value)"
                                           class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                           placeholder="Tier label">
                                </div>
                                <button onclick="removeCommissionTier(${index})" 
                                        class="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">
                                    ✕ Remove
                                </button>
                            </div>
                            <div class="grid grid-cols-3 gap-2">
                                <div>
                                    <label class="text-xs block mb-1">Min (%)</label>
                                    <input type="number" 
                                           value="${tier.min}" 
                                           step="0.01"
                                           onchange="updateCommissionTier(${index}, 'min', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                                <div>
                                    <label class="text-xs block mb-1">Max (%)</label>
                                    <input type="number" 
                                           value="${tier.max}" 
                                           step="0.01"
                                           onchange="updateCommissionTier(${index}, 'max', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                                <div>
                                    <label class="text-xs block mb-1">Rate (%)</label>
                                    <input type="number" 
                                           value="${(tier.rate * 100).toFixed(3)}" 
                                           step="0.001"
                                           onchange="updateCommissionTier(${index}, 'rate', this.value/100)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 季度奖励 -->
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold">🏆 Quarterly Incentive</h3>
                    <button onclick="addIncentiveTier('quarterly')" 
                            class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        ➕ Add Tier
                    </button>
                </div>
                <div class="space-y-3" id="quarterly-incentive-container">
                    ${quarterlyIncentive.map((tier, index) => `
                        <div class="bg-white p-3 rounded border border-gray-300">
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">Tier ${index + 1}:</span>
                                    <input type="text" 
                                           value="${tier.label || ''}" 
                                           onchange="updateIncentiveLabel('quarterly', ${index}, this.value)"
                                           class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                           placeholder="Tier label">
                                </div>
                                <button onclick="removeIncentiveTier('quarterly', ${index})" 
                                        class="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">
                                    ✕ Remove
                                </button>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-xs block mb-1">Min Achievement (%)</label>
                                    <input type="number" 
                                           value="${tier.min}" 
                                           onchange="updateIncentiveTier('quarterly', ${index}, 'min', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                                <div>
                                    <label class="text-xs block mb-1">Incentive (RM)</label>
                                    <input type="number" 
                                           value="${tier.incentive}" 
                                           onchange="updateIncentiveTier('quarterly', ${index}, 'incentive', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 收款奖励 -->
            <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold">💵 Collection Incentive</h3>
                    <button onclick="addIncentiveTier('collection')" 
                            class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        ➕ Add Tier
                    </button>
                </div>
                <div class="space-y-3" id="collection-incentive-container">
                    ${collectionIncentive.map((tier, index) => `
                        <div class="bg-white p-3 rounded border border-gray-300">
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">Tier ${index + 1}:</span>
                                    <input type="text" 
                                           value="${tier.label || ''}" 
                                           onchange="updateIncentiveLabel('collection', ${index}, this.value)"
                                           class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                           placeholder="Tier label">
                                </div>
                                <button onclick="removeIncentiveTier('collection', ${index})" 
                                        class="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">
                                    ✕ Remove
                                </button>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-xs block mb-1">Min Achievement (%)</label>
                                    <input type="number" 
                                           value="${tier.min}" 
                                           onchange="updateIncentiveTier('collection', ${index}, 'min', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                                <div>
                                    <label class="text-xs block mb-1">Incentive (RM)</label>
                                    <input type="number" 
                                           value="${tier.incentive}" 
                                           onchange="updateIncentiveTier('collection', ${index}, 'incentive', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <!-- 活跃电话奖励 -->
            <div class="bg-orange-50 rounded-lg p-4 border border-orange-200">
                <div class="flex justify-between items-center mb-3">
                    <h3 class="text-lg font-bold">📞 Active Call Incentive</h3>
                    <button onclick="addIncentiveTier('active_call')" 
                            class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">
                        ➕ Add Tier
                    </button>
                </div>
                <div class="space-y-3" id="active-call-incentive-container">
                    ${activeCallIncentive.map((tier, index) => `
                        <div class="bg-white p-3 rounded border border-gray-300">
                            <div class="flex justify-between items-center mb-2">
                                <div class="flex items-center gap-3">
                                    <span class="font-medium">Tier ${index + 1}:</span>
                                    <input type="text" 
                                           value="${tier.label || ''}" 
                                           onchange="updateIncentiveLabel('active_call', ${index}, this.value)"
                                           class="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                           placeholder="Tier label">
                                </div>
                                <button onclick="removeIncentiveTier('active_call', ${index})" 
                                        class="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200 text-sm">
                                    ✕ Remove
                                </button>
                            </div>
                            <div class="grid grid-cols-2 gap-2">
                                <div>
                                    <label class="text-xs block mb-1">Min Achievement (%)</label>
                                    <input type="number" 
                                           value="${tier.min}" 
                                           onchange="updateIncentiveTier('active_call', ${index}, 'min', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                                <div>
                                    <label class="text-xs block mb-1">Incentive (RM)</label>
                                    <input type="number" 
                                           value="${tier.incentive}" 
                                           onchange="updateIncentiveTier('active_call', ${index}, 'incentive', this.value)"
                                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm">
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    console.log('✅ Commission & Incentive 页面渲染完成');
}

// 添加佣金 Tier
function addCommissionTier() {
    if (!window.appState.config.monthly_commission_rates) {
        window.appState.config.monthly_commission_rates = [];
    }
    
    // 获取最大的 max 值
    const lastTier = window.appState.config.monthly_commission_rates.length > 0 
        ? window.appState.config.monthly_commission_rates[window.appState.config.monthly_commission_rates.length - 1]
        : { min: 0, max: 0 };
    
    const newMax = lastTier.max + 20; // 增加20%
    
    window.appState.config.monthly_commission_rates.push({
        min: lastTier.max + 0.01,
        max: newMax,
        rate: 0.01, // 默认1%
        label: `${lastTier.max + 0.01}%-${newMax}%`
    });
    
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', 'New commission Tier added successfully');
}

// 移除佣金 Tier
function removeCommissionTier(index) {
    if (window.appState.config.monthly_commission_rates.length <= 1) {
        showToast('⚠️', 'Cannot delete the last Tier');
        return;
    }
    
    if (confirm('Confirm to delete this Tier ？')) {
        window.appState.config.monthly_commission_rates.splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted successfully');
    }
}

// 添加激励 Tier
function addIncentiveTier(type) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'active_call': 'active_call_incentive'
    };
    
    const configKey = typeMap[type];
    if (!configKey) return;
    
    if (!window.appState.config[configKey]) {
        window.appState.config[configKey] = [];
    }
    
    // 获取最小的 min 值
    const tiers = window.appState.config[configKey];
    const minValues = tiers.map(t => t.min).filter(m => m !== undefined);
    const nextMin = minValues.length > 0 ? Math.min(...minValues) - 10 : 90;
    
    window.appState.config[configKey].push({
        min: nextMin,
        incentive: 100, // 默认100
        label: `${nextMin}%+`
    });
    
    // 按 min 值降序排序
    window.appState.config[configKey].sort((a, b) => b.min - a.min);
    
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', `New ${type} Tier added successfully`);
}

// 移除激励 Tier
function removeIncentiveTier(type, index) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'active_call': 'active_call_incentive'
    };
    
    const configKey = typeMap[type];
    if (!configKey || !window.appState.config[configKey]) return;
    
    if (window.appState.config[configKey].length <= 1) {
        showToast('⚠️', 'Cannot delete the last Tier');
        return;
    }
    
    if (confirm('Confirm to delete this Tier ？')) {
        window.appState.config[configKey].splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted successfully');
    }
}

// 更新佣金标签
function updateCommissionLabel(index, value) {
    if (!window.appState.config.monthly_commission_rates[index]) return;
    window.appState.config.monthly_commission_rates[index].label = value;
    saveConfig();
}

// 更新佣金层级
function updateCommissionTier(index, field, value) {
    if (!window.appState.config.monthly_commission_rates[index]) return;
    window.appState.config.monthly_commission_rates[index][field] = parseFloat(value) || 0;
    
    const tier = window.appState.config.monthly_commission_rates[index];
    if (tier.min !== undefined && tier.max !== undefined) {
        tier.label = `${tier.min.toFixed(0)}%-${tier.max.toFixed(0)}%`;
    }
    
    saveConfig();
    renderCommissionConfigs();
}

// 更新激励标签
function updateIncentiveLabel(type, index, value) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'active_call': 'active_call_incentive'
    };
    
    if (!window.appState.config[typeMap[type]] || !window.appState.config[typeMap[type]][index]) return;
    window.appState.config[typeMap[type]][index].label = value;
    saveConfig();
}

// 更新激励层级
function updateIncentiveTier(type, index, field, value) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'active_call': 'active_call_incentive'
    };
    
    if (!window.appState.config[typeMap[type]] || !window.appState.config[typeMap[type]][index]) return;
    window.appState.config[typeMap[type]][index][field] = parseFloat(value) || 0;
    
    saveConfig();
    renderCommissionConfigs();
}

// ==================== 其他页面函数 ====================

// Salary & Allowances 页面（简化版）
function initSalaryView() {
    renderSalaryConfigs();
}

function renderSalaryConfigs() {
    const container = document.getElementById('salary-config-container');
    if (!container) return;
    
    const people = Object.keys(window.appState.config.base_salaries || {});
    
    if (people.length === 0) {
        container.innerHTML = '<div class="text-center py-12 text-gray-500"><p>尚未配置销售员</p></div>';
        return;
    }
    
    container.innerHTML = people.map(name => {
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

// 添加新销售员
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
    
    showToast('✅', `${name} Added successfully!`);
}

// ==================== 导出功能 ====================

// 导出到 Excel
async function exportTemplate() {
    try {
        showLoading('正在生成 Excel 报告...');
        
        const month = document.getElementById('report-month').value;
        
        if (window.appState.salespeople.length === 0) {
            hideLoading();
            showToast('⚠️', 'no sales data');
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
        
        const result = await window.electronAPI.generateSalaryTemplate({
            salespeople: salesData,
            config: window.appState.config,
            month: month
        });
        
        hideLoading();
        
        if (result.success) {
            showToast('✅', `Successfully exported to export ${salesData.length} records!`);
            
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
            showToast('❌', '导出失败: ' + (result.error || result.message));
        }
    } catch (error) {
        hideLoading();
        console.error('导出错误:', error);
        showToast('❌', '错误: ' + error.message);
    }
}

// 保存配置
async function saveConfig() {
    try {
        if (window.electronAPI && window.electronAPI.saveConfig) {
            await window.electronAPI.saveConfig(window.appState.config);
        }
    } catch (error) {
        console.error('保存配置失败:', error);
    }
}

// ==================== 页面加载和全局函数导出 ====================

// 确保所有函数在全局可用
window.initApp = initApp;
window.switchView = switchView;
window.addSalespersonCard = addSalespersonCard;
window.deleteSalespersonCard = deleteSalespersonCard;
window.clearAllQuickCalculateData = clearAllQuickCalculateData;
window.exportTemplate = exportTemplate;
// Import Excel — 读取选中文件，自动填入当月数据到Quick Calculate卡片
async function importFromExcel() {
    try {
        // 1. 选择文件
        const fileResult = await window.electronAPI.selectFile();
        if (!fileResult || !fileResult.success) return;

        showToast('⏳', 'Reading Excel file...');

        // 2. 读取数据
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

        // 3. 找出当前选择的月份
        const currentMonth = document.getElementById('report-month')
            ? document.getElementById('report-month').value.toUpperCase()
            : '';

        // 4. 清空现有卡片
        const container = document.getElementById('salespeople-container');
        if (container) container.innerHTML = '';
        window.appState.salespeople = [];

        // 5. 为每个人创建卡片并填入数据
        let loaded = 0;
        data.forEach(person => {
            // 找该人当月数据
            const monthData = person.months.find(m => m.month === currentMonth);
            if (!monthData && !person.months.length) return;

            const md = monthData || person.months[person.months.length - 1];

            // 添加卡片
            addSalespersonCard();
            const idx = window.appState.salespeople.length - 1;

            // 填入名字
            const nameEl = document.getElementById('name-' + idx);
            if (nameEl) {
                // 找匹配的 option
                const option = Array.from(nameEl.options).find(o => o.value.toUpperCase() === person.name.toUpperCase());
                if (option) {
                    nameEl.value = option.value;
                } else {
                    // 没有配置这个人，加一个临时 option
                    const opt = document.createElement('option');
                    opt.value = person.name;
                    opt.text = person.name;
                    nameEl.appendChild(opt);
                    nameEl.value = person.name;
                }
                // 触发名字改变，自动填入 quarterly target 和 collection target
                if (typeof autoFillLockedFields === 'function') autoFillLockedFields(idx);
            }

            // 填入目标和销售额
            const targetEl = document.getElementById('target-' + idx);
            const salesEl = document.getElementById('sales-' + idx);
            const collAmtEl = document.getElementById('collection-amount-' + idx);

            if (targetEl) targetEl.value = md.target || '';
            if (salesEl) salesEl.value = md.sales || '';
            if (collAmtEl && md.collection) collAmtEl.value = md.collection;

            // 更新计算
            updateSalespersonData(idx);
            loaded++;
        });

        if (loaded > 0) {
            showToast('✅', `Imported ${loaded} salespeople for ${currentMonth}`);
        } else {
            showToast('⚠️', `No data found for ${currentMonth}`);
        }

    } catch (e) {
        showToast('❌', 'Error: ' + e.message);
        console.error('Import error:', e);
    }
}

window.importFromExcel = importFromExcel;
window.addNewPerson = addNewPerson;
window.deleteSalespersonConfig = deleteSalespersonConfig;
window.updateSalary = updateSalary;
window.updateAllowance = updateAllowance;
window.updateEPFRate = updateEPFRate;
window.updateDeduction = updateDeduction;
window.updateSalespersonData = updateSalespersonData;
window.onSalespersonNameChange = onSalespersonNameChange;
window.updateCommissionLabel = updateCommissionLabel;
window.updateCommissionTier = updateCommissionTier;
window.updateIncentiveLabel = updateIncentiveLabel;
window.updateIncentiveTier = updateIncentiveTier;
// 确保所有函数在全局可用
window.addCommissionTier = addCommissionTier;
window.removeCommissionTier = removeCommissionTier;
window.addIncentiveTier = addIncentiveTier;
window.removeIncentiveTier = removeIncentiveTier;
// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM 加载完成，开始初始化...');
    
    // 延迟初始化以避免竞争条件
    setTimeout(() => {
        if (typeof initApp === 'function') {
            initApp();
        } else {
            console.error('initApp 函数未定义');
        }
    }, 100);
});

// 显示加载
function showLoading(message) {
    // 简单实现
    console.log('⏳', message);
}

// 隐藏加载
function hideLoading() {
    // 简单实现
}

// 加载历史记录
function loadQuickCalculateHistory() {
    const historyList = document.getElementById('history-list');
    if (!historyList) return;
    
    if (!window.appState.config.reportHistory || window.appState.config.reportHistory.length === 0) {
        historyList.innerHTML = '<div class="text-center py-8 text-gray-500"><p>暂无历史记录</p></div>';
        return;
    }
    
    historyList.innerHTML = window.appState.config.reportHistory.map((report, index) => `
        <div class="bg-blue-50 rounded-lg p-4 border border-gray-200">
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="font-semibold text-gray-900">${report.month} Report</h4>
                    <p class="text-sm text-gray-600">${new Date(report.timestamp).toLocaleString()}</p>
                </div>
                <div class="flex space-x-2">
                    <button onclick="viewHistoryReport(${index})" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">View</button>
                    <button onclick="deleteHistoryReport(${index})" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">Delete</button>
                </div>
            </div>
            <div class="text-sm text-gray-700">
                <p>Members: ${report.count}</p>
                <p>Total Commission: RM ${(report.totalCommission || 0).toFixed(2)}</p>
            </div>
        </div>
    `).join('');
}