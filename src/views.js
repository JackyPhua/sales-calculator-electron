// 初始化 Quick Calculate 视图
function initQuickCalculate() {
    appState.salespeople = [];
    appState.currentQuickTab = 'current';
    // 设置当前月份
    const currentMonth = new Date().toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const monthSelect = document.getElementById('report-month');
    if (monthSelect) {
        monthSelect.value = currentMonth;
    }
    // 添加第一个销售员卡片
    addSalespersonCard();
    // 加载历史记录
    loadQuickCalculateHistory();
}

// 清空所有快速计算数据
function clearAllQuickCalculateData() {
    if (confirm('Are you sure you want to clear all data? This cannot be undone.')) {
        // 清空所有销售人员的输入
        appState.salespeople.forEach((person, index) => {
            const targetInput = document.getElementById(`target-${index}`);
            const salesInput = document.getElementById(`sales-${index}`);
            const nameSelect = document.getElementById(`name-${index}`);
            
            if (targetInput) targetInput.value = '';
            if (salesInput) salesInput.value = '';
            if (nameSelect) nameSelect.value = '';
        });
        
        // 清空销售员数组
        appState.salespeople = [];
        
        // 重新初始化第一个卡片
        const container = document.getElementById('salespeople-container');
        if (container) {
            container.innerHTML = '';
            addSalespersonCard();
        }
        
        // 清空汇总视图
        const summaryContainer = document.getElementById('summary-container');
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <p class="text-lg mb-2">📊 Summary will appear here</p>
                    <p class="text-sm">Add salespeople and enter their targets and sales to see the team overview</p>
                </div>
            `;
        }
        
        showToast('✅', 'All data cleared!');
    }
}

// 导入 Excel 数据
async function importFromExcel() {
    try {
        // 选择文件
        const fileResult = await window.electronAPI.selectFile();
        if (!fileResult.success) {
            return;
        }
        
        showToast('⏳', 'Importing data...');
        
        // 导入数据
        const importResult = await window.electronAPI.importSalesData(fileResult.path);
        
        if (!importResult.success) {
            showToast('❌', 'Import failed: ' + importResult.error);
            return;
        }
        
        // 获取选择的月份
        const selectedMonth = document.getElementById('report-month').value;
        
        // 清空现有卡片
        appState.salespeople = [];
        const container = document.getElementById('salespeople-container');
        if (container) {
            container.innerHTML = '';
        }
        
        // 为每个销售员创建卡片
        importResult.data.forEach(person => {
            const monthIndex = getMonthIndex(selectedMonth);
            const quarterStartMonth = Math.floor(monthIndex / 3) * 3;
            
            // 找到当月数据
            const monthData = person.months.find(m => m.month === selectedMonth);
            
            // 计算季度累计
            let quarterlyTarget = 0;
            let quarterlySales = 0;
            
            for (let i = quarterStartMonth; i <= monthIndex; i++) {
                const month = getMonthName(i);
                const data = person.months.find(m => m.month === month);
                if (data) {
                    quarterlyTarget += data.target;
                    quarterlySales += data.sales;
                }
            }
            
            // 创建卡片
            addSalespersonCard();
            const index = appState.salespeople.length - 1;
            
            // 填充数据
            setTimeout(() => {
                const nameEl = document.getElementById(`name-${index}`);
                const targetEl = document.getElementById(`target-${index}`);
                const salesEl = document.getElementById(`sales-${index}`);
                const quarterlyTargetEl = document.getElementById(`quarterly-target-${index}`);
                const quarterlySalesEl = document.getElementById(`quarterly-sales-${index}`);
                const collectionAmountEl = document.getElementById(`collection-amount-${index}`);
                const callTargetEl = document.getElementById(`call-target-${index}`);
                
                if (nameEl) nameEl.value = person.name;
                if (targetEl) targetEl.value = monthData ? monthData.target : 0;
                if (salesEl) salesEl.value = monthData ? monthData.sales : 0;
                if (quarterlyTargetEl) quarterlyTargetEl.value = quarterlyTarget;
                if (quarterlySalesEl) quarterlySalesEl.value = quarterlySales;
                if (collectionAmountEl) collectionAmountEl.value = monthData ? monthData.collection : 0;
                
                // 自动加载 Active Call Target
                if (callTargetEl && appState.config.active_call_targets && appState.config.active_call_targets[person.name]) {
                    callTargetEl.value = appState.config.active_call_targets[person.name];
                }
                
                updateSalespersonData(index);
            }, 100);
        });
        
        showToast('✅', `Imported ${importResult.data.length} salespeople for ${selectedMonth}`);
        
    } catch (error) {
        showToast('❌', 'Error: ' + error.message);
    }
}

// 辅助函数：获取月份索引
function getMonthIndex(month) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months.indexOf(month);
}

// 辅助函数：获取月份名称
function getMonthName(index) {
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    return months[index] || '';
}

// 添加销售员卡片
function addSalespersonCard() {
    const container = document.getElementById('salespeople-container');
    if (!container) return;
    
    const index = appState.salespeople.length;
    
    // 获取所有已配置的销售员名字
    const configuredPeople = Object.keys(appState.config.base_salaries || {});
    const nameOptions = configuredPeople.length > 0 
        ? configuredPeople.map(name => `<option value="${name}">${name}</option>`).join('')
        : '<option value="">No salespeople configured</option>';
    
    const card = document.createElement('div');
    card.className = 'card bg-white rounded-xl shadow-sm p-6 border border-gray-200';
    card.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <h4 class="text-lg font-semibold text-gray-900">👤 ${appState.locale?.salesperson?.title?.replace('{}', index + 1) || 'Salesperson #' + (index + 1)}</h4>
            ${index > 0 ? `
                <button onclick="removeSalespersonCard(${index})" 
                        class="text-red-500 hover:text-red-700 text-xl">
                    ✕
                </button>
            ` : ''}
        </div>
        
        ${configuredPeople.length === 0 ? `
            <div class="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p class="text-sm text-yellow-800">
                        ${appState.locale?.salesperson?.noConfigMsg
                            ?.replace('{{view}}', `<button onclick="switchView('salary')" class="underline font-medium">${appState.locale?.views?.salary || 'Salary & Allowances'}</button>`) 
                            || '⚠️ No salespeople configured. Please configure first.'}
                    </p>
            </div>
        ` : ''}
        
        <div class="grid grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <select id="name-${index}"
                        class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                        onchange="onSalespersonNameChange(${index})"
                        ${configuredPeople.length === 0 ? 'disabled' : ''}>
                    <option value="">Select...</option>
                    ${nameOptions}
                </select>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Target (RM) 
                    <span class="text-blue-500 text-xs">✏️ Editable</span>
                </label>
                <input type="number" 
                       id="target-${index}"
                       class="input-field w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500"
                       placeholder="50000"
                       onchange="updateSalespersonData(${index})"
                       onfocus="this.style.borderColor='#3b82f6'"
                       onblur="this.style.borderColor='#d1d5db'">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">
                    Monthly Sales (RM)
                    <span class="text-blue-500 text-xs">✏️ Editable</span>
                </label>
                <input type="number" 
                       id="sales-${index}"
                       class="input-field w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:border-blue-500"
                       placeholder="48500"
                       onchange="updateSalespersonData(${index})"
                       onfocus="this.style.borderColor='#3b82f6'"
                       onblur="this.style.borderColor='#d1d5db'">
            </div>
            
            <div class="col-span-2">
                <div class="h-px bg-gray-200 my-4"></div>
                <h5 class="text-sm font-semibold text-gray-700 mb-3">📊 Quarterly Data (3 months total)</h5>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Target (RM)</label>
                <input type="number" 
                       id="quarterly-target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="150000"
                       onchange="updateSalespersonData(${index})">
                <p class="text-xs text-gray-500 mt-1">3 months total target</p>
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Quarterly Sales (RM)</label>
                <input type="number" 
                       id="quarterly-sales-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="145000"
                       onchange="updateSalespersonData(${index})">
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
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="30000"
                       onchange="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Collection Amount (RM)</label>
                <input type="number" 
                       id="collection-amount-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="29000"
                       onchange="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Target)</label>
                <input type="number" 
                       id="call-target-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="100"
                       onchange="updateSalespersonData(${index})">
            </div>
            
            <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Active Calls (Actual)</label>
                <input type="number" 
                       id="call-actual-${index}"
                       class="input-field w-full px-4 py-2 border border-gray-300 rounded-lg"
                       placeholder="95"
                       onchange="updateSalespersonData(${index})">
            </div>
        </div>
        
        <!-- Data Validation Messages -->
        <div id="validation-${index}" class="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200 hidden">
        </div>
        
        <!-- Preview Section -->
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
    
    // 初始化销售员数据
    appState.salespeople.push({
        index: index,
        name: '',
        target: 0,
        sales: 0,
        quarterlyTarget: 0,
        quarterlySales: 0,
        collectionTarget: 0,
        collectionAmount: 0,
        callTarget: 0,
        callActual: 0
    });
}

// 移除销售员卡片
function removeSalespersonCard(index) {
    const container = document.getElementById('salespeople-container');
    if (!container) return;
    
    // 直接移除 DOM 元素
    const cardToRemove = container.children[index];
    if (cardToRemove) {
        cardToRemove.remove();
    }
    
    // 从状态中移除
    appState.salespeople.splice(index, 1);
    
    // 更新汇总视图（如果存在）
    updateSummaryView();
    
    showToast('✅', 'Salesperson removed');
}

// 销售员名字改变时的处理
function onSalespersonNameChange(index) {
    const nameSelect = document.getElementById(`name-${index}`);
    if (!nameSelect) return;
    
    const selectedName = nameSelect.value;
    
    // 自动加载 Active Call Target
    if (selectedName && appState.config.active_call_targets) {
        const callTarget = appState.config.active_call_targets[selectedName];
        if (callTarget !== undefined) {
            const callTargetEl = document.getElementById(`call-target-${index}`);
            if (callTargetEl) {
                callTargetEl.value = callTarget;
            }
        }
    }
    
    // 更新销售员数据
    updateSalespersonData(index);
}

// 更新销售员数据和预览
function updateSalespersonData(index) {
    // 确保数组中有对应的对象
    if (!appState.salespeople[index]) {
        appState.salespeople[index] = {
            index: index,
            name: '',
            target: 0,
            sales: 0,
            quarterlyTarget: 0,
            quarterlySales: 0,
            collectionTarget: 0,
            collectionAmount: 0,
            callTarget: 0,
            callActual: 0
        };
    }
    
    const person = appState.salespeople[index];
    
    // 获取所有元素并检查是否存在
    const nameElement = document.getElementById(`name-${index}`);
    const targetElement = document.getElementById(`target-${index}`);
    const salesElement = document.getElementById(`sales-${index}`);
    const quarterlyTargetElement = document.getElementById(`quarterly-target-${index}`);
    const quarterlySalesElement = document.getElementById(`quarterly-sales-${index}`);
    const collectionTargetElement = document.getElementById(`collection-target-${index}`);
    const collectionAmountElement = document.getElementById(`collection-amount-${index}`);
    const callTargetElement = document.getElementById(`call-target-${index}`);
    const callActualElement = document.getElementById(`call-actual-${index}`);
    
    // 更新人员数据，如果元素不存在则使用默认值
    person.name = nameElement ? nameElement.value : '';
    person.target = targetElement ? parseFloat(targetElement.value) || 0 : 0;
    person.sales = salesElement ? parseFloat(salesElement.value) || 0 : 0;
    person.quarterlyTarget = quarterlyTargetElement ? parseFloat(quarterlyTargetElement.value) || 0 : 0;
    person.quarterlySales = quarterlySalesElement ? parseFloat(quarterlySalesElement.value) || 0 : 0;
    person.collectionTarget = collectionTargetElement ? parseFloat(collectionTargetElement.value) || 0 : 0;
    person.collectionAmount = collectionAmountElement ? parseFloat(collectionAmountElement.value) || 0 : 0;
    person.callTarget = callTargetElement ? parseFloat(callTargetElement.value) || 0 : 0;
    person.callActual = callActualElement ? parseFloat(callActualElement.value) || 0 : 0;
    
    // 计算各项数据
    const achievement = person.target > 0 ? (person.sales / person.target) * 100 : 0;
    const quarterlyAchievement = person.quarterlyTarget > 0 ? (person.quarterlySales / person.quarterlyTarget) * 100 : 0;
    const collectionAchievement = person.collectionTarget > 0 ? (person.collectionAmount / person.collectionTarget) * 100 : 0;
    const callAchievement = person.callTarget > 0 ? (person.callActual / person.callTarget) * 100 : 0;
    
    const commission = calculateCommission(person.sales, person.target, appState.config.monthly_commission_rates);
    const collectionBonus = calculateIncentive(collectionAchievement, appState.config.collection_incentive);
    const callBonus = calculateIncentive(callAchievement, appState.config.active_call_incentive);
    
    // 季度奖金使用季度数据计算
    const quarterlyBonus = calculateIncentive(quarterlyAchievement, appState.config.quarterly_incentive);
    
    const totalCommission = commission + collectionBonus + callBonus + quarterlyBonus;
    
    // 存储计算结果
    person.achievement = achievement;
    person.quarterlyAchievement = quarterlyAchievement;
    person.commission = commission;
    person.collectionIncentive = collectionBonus;
    person.activeCallIncentive = callBonus;
    person.quarterlyBonus = quarterlyBonus;
    person.totalCommission = totalCommission;
    
    // 检查数据有效性
    const previewElement = document.getElementById(`preview-${index}`);
    const validationMsg = document.getElementById(`validation-${index}`);
    
    // 清除旧的验证消息
    let hasValidationMsg = false;
    if (validationMsg) {
        validationMsg.innerHTML = '';
    }
    
    // 数据验证和警告
    if (person.target > 0 && person.sales === 0) {
        // 销售额为 0
        if (validationMsg) {
            validationMsg.innerHTML += '<p class="text-yellow-700 text-sm mb-2">⚠️ Sales amount is 0</p>';
            hasValidationMsg = true;
        }
    }
    
    if (person.target > 0 && person.sales > 0) {
        // 检查成就率是否异常
        if (achievement > 150) {
            if (validationMsg) {
                validationMsg.innerHTML += `<p class="text-yellow-700 text-sm mb-2">⚠️ Achievement rate is ${achievement.toFixed(0)}% (unusually high - please verify)</p>`;
                hasValidationMsg = true;
            }
        } else if (achievement < 20) {
            if (validationMsg) {
                validationMsg.innerHTML += `<p class="text-yellow-700 text-sm mb-2">⚠️ Achievement rate is ${achievement.toFixed(0)}% (unusually low - please verify)</p>`;
                hasValidationMsg = true;
            }
        }
    }
    
    // 显示或隐藏验证消息区域
    if (validationMsg) {
        if (hasValidationMsg) {
            validationMsg.classList.remove('hidden');
        } else {
            validationMsg.classList.add('hidden');
        }
    }
    
    // 更新预览
    if (person.target > 0 && person.sales > 0) {
        if (previewElement) {
            previewElement.classList.remove('hidden');
        }
        
        const achievementEl = document.getElementById(`achievement-${index}`);
        if (achievementEl) {
            achievementEl.textContent = achievement.toFixed(2) + '%';
            achievementEl.className = `font-semibold ml-2 ${getAchievementColor(achievement)}`;
        }
        
        const commissionEl = document.getElementById(`commission-${index}`);
        if (commissionEl) commissionEl.textContent = formatCurrency(commission);
        
        const collectionEl = document.getElementById(`collection-bonus-${index}`);
        if (collectionEl) collectionEl.textContent = formatCurrency(collectionBonus);
        
        const callEl = document.getElementById(`call-bonus-${index}`);
        if (callEl) callEl.textContent = formatCurrency(callBonus);
        
        // 显示季度成就率
        const quarterlyText = person.quarterlyTarget > 0 
            ? `${formatCurrency(quarterlyBonus)} (${quarterlyAchievement.toFixed(1)}%)`
            : formatCurrency(quarterlyBonus);
        const quarterlyEl = document.getElementById(`quarterly-${index}`);
        if (quarterlyEl) quarterlyEl.textContent = quarterlyText;
        
        const totalEl = document.getElementById(`total-commission-${index}`);
        if (totalEl) totalEl.textContent = formatCurrency(totalCommission);
    } else if (previewElement) {
        previewElement.classList.add('hidden');
    }
    
    // 更新汇总视图
    updateSummaryView();
}

// 计算汇总数据
function calculateSummary() {
    const summary = {
        totalTarget: 0,
        totalSales: 0,
        averageAchievement: 0,
        totalCommission: 0,
        totalCollectionBonus: 0,
        totalCallBonus: 0,
        totalQuarterlyBonus: 0,
        membersWithData: 0,
        highestAchiever: null,
        lowestAchiever: null
    };
    
    const validMembers = appState.salespeople.filter(p => p.name && p.target > 0 && p.sales > 0);
    
    if (validMembers.length === 0) {
        return summary;
    }
    
    validMembers.forEach(person => {
        summary.totalTarget += person.target;
        summary.totalSales += person.sales;
        summary.totalCommission += person.commission || 0;
        summary.totalCollectionBonus += person.collectionIncentive || 0;
        summary.totalCallBonus += person.activeCallIncentive || 0;
        summary.totalQuarterlyBonus += person.quarterlyBonus || 0;
        summary.membersWithData++;
        
        if (!summary.highestAchiever || person.achievement > summary.highestAchiever.achievement) {
            summary.highestAchiever = person;
        }
        if (!summary.lowestAchiever || person.achievement < summary.lowestAchiever.achievement) {
            summary.lowestAchiever = person;
        }
    });
    
    if (summary.membersWithData > 0) {
        summary.averageAchievement = summary.totalTarget > 0 ? (summary.totalSales / summary.totalTarget) * 100 : 0;
    }
    
    return summary;
}

// 更新汇总视图
function updateSummaryView() {
    const summaryContainer = document.getElementById('summary-container');
    if (!summaryContainer) return;
    
    const summary = calculateSummary();
    
    if (summary.membersWithData === 0) {
        summaryContainer.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <p class="text-lg mb-2">📊 Summary will appear here</p>
                <p class="text-sm">Add salespeople and enter their targets and sales to see the team overview</p>
            </div>
        `;
        return;
    }
    
    const totalBonuses = summary.totalCollectionBonus + summary.totalCallBonus + summary.totalQuarterlyBonus;
    const grandTotal = summary.totalCommission + totalBonuses;
    
    summaryContainer.innerHTML = `
        <div class="grid grid-cols-4 gap-4">
            <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p class="text-sm text-gray-600 mb-1">Team Members</p>
                <p class="text-3xl font-bold text-blue-600">${summary.membersWithData}</p>
            </div>
            <div class="bg-green-50 rounded-lg p-4 border border-green-200">
                <p class="text-sm text-gray-600 mb-1">Total Sales</p>
                <p class="text-2xl font-bold text-green-600">RM ${summary.totalSales.toFixed(0)}</p>
                <p class="text-xs text-gray-500 mt-1">Target: RM ${summary.totalTarget.toFixed(0)}</p>
            </div>
            <div class="bg-purple-50 rounded-lg p-4 border border-purple-200">
                <p class="text-sm text-gray-600 mb-1">Avg Achievement</p>
                <p class="text-3xl font-bold ${getAchievementColor(summary.averageAchievement).split(' ')[1]}">${summary.averageAchievement.toFixed(1)}%</p>
            </div>
            <div class="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                <p class="text-sm text-gray-600 mb-1">Total Commission</p>
                <p class="text-2xl font-bold text-yellow-600">RM ${(summary.totalCommission + totalBonuses).toFixed(2)}</p>
                <p class="text-xs text-gray-500 mt-1">Base + Bonuses</p>
            </div>
        </div>
        
        <div class="mt-4 grid grid-cols-3 gap-4 text-sm">
            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p class="text-gray-600 mb-1">Commission</p>
                <p class="font-semibold text-lg">RM ${summary.totalCommission.toFixed(2)}</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p class="text-gray-600 mb-1">Bonuses</p>
                <p class="font-semibold text-lg">RM ${totalBonuses.toFixed(2)}</p>
                <p class="text-xs text-gray-500">Collection + Call + Quarterly</p>
            </div>
            <div class="bg-gray-50 rounded-lg p-3 border border-gray-200">
                <p class="text-gray-600 mb-1">Grand Total</p>
                <p class="font-semibold text-lg text-green-600">RM ${grandTotal.toFixed(2)}</p>
            </div>
        </div>
        
        ${summary.highestAchiever ? `
            <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
                <div class="bg-green-50 rounded-lg p-3 border border-green-200">
                    <p class="text-green-700 font-semibold mb-1">🏆 Top Performer</p>
                    <p class="text-gray-900">${summary.highestAchiever.name}</p>
                    <p class="text-green-600 font-semibold">${summary.highestAchiever.achievement.toFixed(1)}%</p>
                </div>
                <div class="bg-orange-50 rounded-lg p-3 border border-orange-200">
                    <p class="text-orange-700 font-semibold mb-1">📌 Lowest Performer</p>
                    <p class="text-gray-900">${summary.lowestAchiever.name}</p>
                    <p class="text-orange-600 font-semibold">${summary.lowestAchiever.achievement.toFixed(1)}%</p>
                </div>
            </div>
        ` : ''}
    `;
}

// 生成报告
async function generateReport() {
    if (appState.salespeople.length === 0 || !appState.salespeople[0].name) {
        showToast('⚠️', 'Please add at least one salesperson!');
        return;
    }
    
    // 验证数据
    for (const person of appState.salespeople) {
        if (!person.name) {
            showToast('⚠️', 'Please enter names for all salespeople!');
            return;
        }
    }
    
    // 添加薪资信息和其他必需的字段
    appState.salespeople.forEach(person => {
        const nameUpper = person.name.toUpperCase();
        // 从配置中获取薪资信息
        person.salary = appState.config.base_salaries[nameUpper] || 0;
        // 补全allowances字段
        const configAllowances = appState.config.allowances[nameUpper] || {};
        person.allowances = {
            HP: configAllowances.HP !== undefined ? configAllowances.HP : 0,
            CAR: configAllowances.CAR !== undefined ? configAllowances.CAR : 0,
            'LOCAL FUEL': configAllowances['LOCAL FUEL'] !== undefined ? configAllowances['LOCAL FUEL'] : 0,
            'OUTSTATION FUEL': configAllowances['OUTSTATION FUEL'] !== undefined ? configAllowances['OUTSTATION FUEL'] : 0,
            HOUSING: configAllowances.HOUSING !== undefined ? configAllowances.HOUSING : 0,
            FOOD: configAllowances.FOOD !== undefined ? configAllowances.FOOD : 0,
            OTHERS: configAllowances.OTHERS !== undefined ? configAllowances.OTHERS : 0
        };
        person.deductions = appState.config.deductions[nameUpper] || {};
        person.earnings = appState.config.earnings[nameUpper] || {};
        // 确保所有计算字段都存在
        person.sales = person.sales || 0;
        person.commission = person.commission || 0;
        person.collectionIncentive = person.collectionIncentive || 0;
        person.activeCallIncentive = person.activeCallIncentive || 0;
        person.quarterlyBonus = person.quarterlyBonus || 0;
    });
    
    // 获取月份和计算总佣金
    const month = document.getElementById('report-month').value;
    const totalCommission = appState.salespeople.reduce((sum, person) => {
        return sum + (parseFloat(person.commission) || 0);
    }, 0);
    
    // 保存到历史
    saveReportToHistory(month, appState.salespeople, totalCommission);
    
    await exportTemplate();
}

// 导出模板到 Excel
async function exportTemplate() {
    try {
        const month = document.getElementById('report-month').value;
        
        // 准备要发送的数据，从config获取salary和allowances
        const salesData = appState.salespeople.map(person => {
            const nameUpper = person.name.toUpperCase();
            const salary = appState.config.base_salaries?.[nameUpper] || 0;
            const allowances = appState.config.allowances?.[nameUpper] || {
                HP: 0, CAR: 0, 'LOCAL FUEL': 0, 'OUTSTATION FUEL': 0,
                HOUSING: 0, FOOD: 0, OTHERS: 0
            };
            
            return {
                ...person,
                salary: salary,  // 从config读取
                allowances: allowances,  // 从config读取
                sales: parseFloat(person.sales) || 0,
                commission: parseFloat(person.commission) || 0,
                collectionIncentive: parseFloat(person.collectionIncentive) || 0,
                activeCallIncentive: parseFloat(person.activeCallIncentive) || 0,
                quarterlyBonus: parseFloat(person.quarterlyBonus) || 0
            };
        });
        
        console.log('📊 Exporting with complete data:');
        salesData.forEach(p => {
            console.log(`  ${p.name}:`);
            console.log(`    - salary: ${p.salary}`);
            console.log(`    - sales: ${p.sales}`);  
            console.log(`    - commission: ${p.commission}`);
            console.log(`    - allowances:`, p.allowances);
        });
        
        const result = await window.electronAPI.generateSalaryTemplate({
            salespeople: salesData,
            config: appState.config,
            month: month
        });
        
        if (result.success) {
            showToast('✅', 'Report generated successfully!');
        } else {
            showToast('❌', 'Failed to generate report: ' + result.error);
        }
    } catch (error) {
        showToast('❌', 'Error: ' + error.message);
    }
}

// 初始化薪资视图
function initSalaryView() {
    // 初始化所有人员的扣款字段
    const people = Object.keys(appState.config.base_salaries || {});
    people.forEach(person => {
        updateDeductionFields(person);
    });
}

// 更新薪资
function updateSalary(person, value) {
    const personUpper = person.toUpperCase();
    appState.config.base_salaries[personUpper] = parseFloat(value) || 0;
    updateDeductionFields(personUpper);
    // 保存配置到磁盘
    saveConfig();
}

// 更新津贴
function updateAllowance(person, type, value) {
    const personUpper = person.toUpperCase();
    if (!appState.config.allowances[personUpper]) {
        appState.config.allowances[personUpper] = {};
    }
    appState.config.allowances[personUpper][type] = parseFloat(value) || 0;
    updateDeductionFields(personUpper);
    // 保存配置到磁盘
    saveConfig();
}

// 计算总收入（基本薪资+津贴）
function calculateTotalIncome(person) {
    const personUpper = person.toUpperCase();
    const config = appState.config;
    const baseSalary = config.base_salaries[personUpper] || 0;
    const allowances = config.allowances[personUpper] || {};
    
    let totalAllowances = 0;
    Object.keys(allowances).forEach(key => {
        totalAllowances += allowances[key] || 0;
    });
    
    return baseSalary + totalAllowances;
}

// 计算扣款金额
function calculateDeduction(person, rate) {
    const totalIncome = calculateTotalIncome(person);
    return Math.round(totalIncome * rate * 100) / 100;
}

// 获取 EPF 百分比
function getEPFRate(person) {
    const personUpper = person.toUpperCase();
    if (appState.config.deductionRates && appState.config.deductionRates[personUpper]) {
        return appState.config.deductionRates[personUpper].EPF_RATE || 11;
    }
    return 11; // 默认 11%
}

// 更新 EPF 百分比
function updateEPFRate(person, rate) {
    const personUpper = person.toUpperCase();
    if (!appState.config.deductionRates) {
        appState.config.deductionRates = {};
    }
    if (!appState.config.deductionRates[personUpper]) {
        appState.config.deductionRates[personUpper] = {};
    }
    appState.config.deductionRates[personUpper].EPF_RATE = parseFloat(rate) || 11;
    updateDeductionFields(personUpper);
}

// 更新扣款字段显示
function updateDeductionFields(person) {
    const personUpper = person.toUpperCase();
    const epfRate = getEPFRate(personUpper);
    const epfValue = calculateDeduction(personUpper, epfRate / 100);
    const socsoValue = calculateDeduction(personUpper, 0.005);
    
    const epfField = document.getElementById(`epf-${person}`);
    const socsoField = document.getElementById(`socso-${person}`);
    
    if (epfField) epfField.value = epfValue;
    if (socsoField) socsoField.value = socsoValue;
    
    // 保存到config
    if (!appState.config.deductions) {
        appState.config.deductions = {};
    }
    if (!appState.config.deductions[personUpper]) {
        appState.config.deductions[personUpper] = {};
    }
    appState.config.deductions[personUpper].EPF = epfValue;
    appState.config.deductions[personUpper].SOCSO = socsoValue;
    
    // 保存配置到磁盘
    saveConfig();
}

// 更新扣款（PCB和EIS）
function updateDeduction(person, type, value) {
    const personUpper = person.toUpperCase();
    if (!appState.config.deductions) {
        appState.config.deductions = {};
    }
    if (!appState.config.deductions[personUpper]) {
        appState.config.deductions[personUpper] = {};
    }
    appState.config.deductions[personUpper][type] = parseFloat(value) || 0;
    // 保存配置到磁盘
    saveConfig();
}

// 更新收入（Commission、Quarterly、Active Call、Collection）
function updateEarning(person, type, value) {
    const personUpper = person.toUpperCase();
    if (!appState.config.earnings) {
        appState.config.earnings = {};
    }
    if (!appState.config.earnings[personUpper]) {
        appState.config.earnings[personUpper] = {};
    }
    appState.config.earnings[personUpper][type] = parseFloat(value) || 0;
    // 保存配置到磁盘
    saveConfig();
}

// 显示添加销售员对话框
function showAddPersonDialog() {
    const dialog = document.getElementById('add-person-dialog');
    if (dialog) dialog.classList.remove('hidden');
    
    const nameInput = document.getElementById('new-person-name');
    const salaryInput = document.getElementById('new-person-salary');
    if (nameInput) nameInput.value = '';
    if (salaryInput) salaryInput.value = '1700';
}

// 隐藏添加销售员对话框
function hideAddPersonDialog() {
    const dialog = document.getElementById('add-person-dialog');
    if (dialog) dialog.classList.add('hidden');
}

// 添加新销售员
function addNewPerson() {
    const nameInput = document.getElementById('new-person-name');
    const salaryInput = document.getElementById('new-person-salary');
    const callTargetInput = document.getElementById('new-person-call-target');
    
    if (!nameInput || !salaryInput) return;
    
    let name = nameInput.value.trim().toUpperCase();
    const salary = parseFloat(salaryInput.value) || 1700;
    const callTarget = callTargetInput ? parseFloat(callTargetInput.value) || 100 : 100;
    
    if (!name) {
        showToast('⚠️', 'Please enter a name!');
        return;
    }
    
    // 检查是否已存在
    if (appState.config.base_salaries[name]) {
        showToast('⚠️', 'This person already exists!');
        return;
    }
    
    // 添加到配置
    appState.config.base_salaries[name] = salary;
    appState.config.allowances[name] = {
        HP: 0,
        CAR: 0,
        'LOCAL FUEL': 0,
        'OUTSTATION FUEL': 0,
        HOUSING: 0,
        FOOD: 0,
        OTHERS: 0
    };
    if (!appState.config.deductions) {
        appState.config.deductions = {};
    }
    const totalIncome = salary; // 新添加的人只有基本薪资，没有津贴
    appState.config.deductions[name] = {
        EPF: Math.round(totalIncome * 0.11 * 100) / 100,
        SOCSO: Math.round(totalIncome * 0.005 * 100) / 100,
        PCB: 0,
        EIS: 0
    };
    
    if (!appState.config.deductionRates) {
        appState.config.deductionRates = {};
    }
    appState.config.deductionRates[name] = {
        EPF_RATE: 11  // 默认 11%
    };
    
    if (!appState.config.earnings) {
        appState.config.earnings = {};
    }
    appState.config.earnings[name] = {
        COMMISSION: 0,
        QUARTERLY: 0,
        ACTIVE_CALL: 0,
        COLLECTION: 0
    };
    
    // 初始化 Active Call Target
    if (!appState.config.active_call_targets) {
        appState.config.active_call_targets = {};
    }
    appState.config.active_call_targets[name] = callTarget;
    
    hideAddPersonDialog();
    saveConfig();
    switchView('salary');
    showToast('✅', `${name} added successfully!`);
}

// 更新 Active Call Target
function updateActiveCallTarget(person, value) {
    if (!appState.config.active_call_targets) {
        appState.config.active_call_targets = {};
    }
    const personUpper = person.toUpperCase();
    appState.config.active_call_targets[personUpper] = parseFloat(value) || 100;
}

// 删除销售员
function removePerson(person) {
    if (confirm(`Are you sure you want to remove ${person}?`)) {
        delete appState.config.base_salaries[person];
        delete appState.config.allowances[person];
        if (appState.config.active_call_targets) {
            delete appState.config.active_call_targets[person];
        }
        saveConfig();
        switchView('salary');
        showToast('✅', `${person} removed!`);
    }
}

// 初始化佣金视图
function initCommissionView() {
    // 已在 getCommissionView 中渲染
}

// 更新佣金层级
function updateCommissionTier(index, field, value) {
    if (!appState.config.monthly_commission_rates || !appState.config.monthly_commission_rates[index]) {
        return;
    }
    
    appState.config.monthly_commission_rates[index][field] = parseFloat(value) || 0;
    
    // 自动更新标签
    const tier = appState.config.monthly_commission_rates[index];
    tier.label = `${tier.min.toFixed(0)}%-${tier.max.toFixed(0)}%`;
}

// 添加佣金层级
function addCommissionTier() {
    if (!appState.config.monthly_commission_rates) {
        appState.config.monthly_commission_rates = [];
    }
    
    appState.config.monthly_commission_rates.push({
        min: 0,
        max: 100,
        rate: 0.005,
        label: '0%-100%'
    });
    switchView('commission');
}

// 删除佣金层级
function deleteCommissionTier(index) {
    if (!appState.config.monthly_commission_rates || appState.config.monthly_commission_rates.length <= 1) {
        showToast('⚠️', 'At least one tier is required!');
        return;
    }
    
    if (appState.config.monthly_commission_rates.length > 1) {
        appState.config.monthly_commission_rates.splice(index, 1);
        switchView('commission');
    }
}

// 初始化奖励视图
function initIncentiveView() {
    // 保存原始配置以便重置
    if (!appState.originalIncentiveConfig) {
        appState.originalIncentiveConfig = {
            quarterly: JSON.parse(JSON.stringify(appState.config.quarterly_incentive)),
            collection: JSON.parse(JSON.stringify(appState.config.collection_incentive)),
            activeCall: JSON.parse(JSON.stringify(appState.config.active_call_incentive))
        };
    }
    
    // 绘制三列
    renderIncentiveTier('quarterly', appState.config.quarterly_incentive, 'quarterly-tiers', 'quarterly-validation');
    renderIncentiveTier('collection', appState.config.collection_incentive, 'collection-tiers', 'collection-validation');
    renderIncentiveTier('activeCall', appState.config.active_call_incentive, 'call-tiers', 'call-validation');
    
    // 初始化计算器
    updateIncentiveCalculator();
}

// 绘制奖励层级
function renderIncentiveTier(type, tiers, containerId, validationId) {
    const container = document.getElementById(containerId);
    if (!container || !tiers) return;
    
    container.innerHTML = tiers.map((tier, index) => `
        <div class="bg-white p-4 rounded-lg border border-gray-200">
            <div class="flex justify-between items-start mb-3">
                <div class="flex-1">
                    <label class="text-sm font-medium text-gray-700 block mb-1">Tier ${index + 1}: ${tier.label}</label>
                    <input type="number" 
                           value="${tier.min}"
                           class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                           placeholder="Min %"
                           onchange="updateIncentiveTierMin('${type}', ${index}, this.value)"
                           oninput="updateIncentiveTierMin('${type}', ${index}, this.value)">
                    <p class="text-xs text-gray-500 mt-1">Min achievement</p>
                </div>
            </div>
            
            <div class="mb-3">
                <label class="text-sm font-medium text-gray-700 block mb-1">Incentive Amount (RM)</label>
                <input type="number" 
                       value="${tier.incentive}"
                       class="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                       placeholder="Amount"
                       onchange="updateIncentive('${type}', ${index}, this.value)"
                       oninput="updateIncentive('${type}', ${index}, this.value)">
            </div>
            
            <div class="p-3 bg-gray-100 rounded text-sm text-gray-700">
                <strong>Range:</strong> <span id="range-${type}-${index}">${tier.min}% - ${index === 0 ? '100%+' : 'check'}</span>
            </div>
        </div>
    `).join('');
    
    // 运行验证
    validateIncentiveTiers(type, validationId);
}

// 更新奖励 Min 值
function updateIncentiveTierMin(type, index, value) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'activeCall': 'active_call_incentive'
    };
    
    const configKey = typeMap[type];
    if (!appState.config[configKey] || !appState.config[configKey][index]) return;
    
    const newMin = parseFloat(value) || 0;
    appState.config[configKey][index].min = newMin;
    
    // 更新标签
    if (newMin === 100) {
        appState.config[configKey][index].label = '100%+';
    } else if (newMin > 0) {
        const nextTier = appState.config[configKey][index - 1];
        if (nextTier) {
            appState.config[configKey][index].label = `${newMin}%-${nextTier.min - 1}%`;
        } else {
            appState.config[configKey][index].label = `${newMin}%+`;
        }
    }
    
    // 重新渲染
    const validationId = `${type === 'activeCall' ? 'call' : type}-validation`;
    const containerId = `${type === 'activeCall' ? 'call' : type}-tiers`;
    renderIncentiveTier(type, appState.config[configKey], containerId, validationId);
    
    // 更新计算器
    updateIncentiveCalculator();
}

// 更新奖励金额（new 名称，不是旧的 updateIncentiveTier）
function updateIncentive(type, index, value) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'activeCall': 'active_call_incentive'
    };
    
    const configKey = typeMap[type];
    if (!appState.config[configKey] || !appState.config[configKey][index]) return;
    
    appState.config[configKey][index].incentive = parseFloat(value) || 0;
    
    // 运行验证
    const validationId = `${type === 'activeCall' ? 'call' : type}-validation`;
    const containerId = `${type === 'activeCall' ? 'call' : type}-tiers`;
    validateIncentiveTiers(type, validationId);
    
    // 更新计算器
    updateIncentiveCalculator();
}

// 验证奖励层级结构
function validateIncentiveTiers(type, validationId) {
    const typeMap = {
        'quarterly': 'quarterly_incentive',
        'collection': 'collection_incentive',
        'activeCall': 'active_call_incentive'
    };
    
    const configKey = typeMap[type];
    const tiers = appState.config[configKey];
    if (!tiers) return false;
    
    const validationEl = document.getElementById(validationId);
    let errors = [];
    
    // 检查 min 值是否按降序排列
    for (let i = 0; i < tiers.length - 1; i++) {
        if (tiers[i].min <= tiers[i + 1].min) {
            errors.push(`Tier ${i + 1} min (${tiers[i].min}%) should be > Tier ${i + 2} min (${tiers[i + 1].min}%)`);
        }
    }
    
    // 检查是否有重复的 min 值
    const minValues = tiers.map(t => t.min);
    if (new Set(minValues).size !== minValues.length) {
        errors.push('Duplicate minimum values detected');
    }
    
    // 显示或隐藏验证错误
    if (validationEl) {
        if (errors.length > 0) {
            validationEl.innerHTML = '⚠️ ' + errors.join('<br>⚠️ ');
            validationEl.classList.remove('hidden');
        } else {
            validationEl.classList.add('hidden');
        }
    }
    
    return errors.length === 0;
}

// 奖励计算器
function updateIncentiveCalculator() {
    const achievementInput = document.getElementById('calc-achievement');
    if (!achievementInput) return;
    
    const achievement = parseFloat(achievementInput.value) || 0;
    
    // 计算三种奖励
    const quarterlyBonus = calculateIncentiveForAchievement(achievement, appState.config.quarterly_incentive);
    const collectionBonus = calculateIncentiveForAchievement(achievement, appState.config.collection_incentive);
    const callBonus = calculateIncentiveForAchievement(achievement, appState.config.active_call_incentive);
    const total = quarterlyBonus + collectionBonus + callBonus;
    
    // 更新显示
    const quarterlyEl = document.getElementById('calc-quarterly');
    const collectionEl = document.getElementById('calc-collection');
    const callEl = document.getElementById('calc-call');
    const totalEl = document.getElementById('calc-total');
    
    if (quarterlyEl) quarterlyEl.textContent = formatCurrency(quarterlyBonus);
    if (collectionEl) collectionEl.textContent = formatCurrency(collectionBonus);
    if (callEl) callEl.textContent = formatCurrency(callBonus);
    if (totalEl) totalEl.textContent = formatCurrency(total);
}

// 根据成就率计算奖励
function calculateIncentiveForAchievement(achievement, incentives) {
    if (!incentives) return 0;
    
    for (const tier of incentives) {
        if (achievement >= tier.min) {
            return tier.incentive;
        }
    }
    return 0;
}

// 重置奖励配置
function resetIncentiveChanges() {
    if (!appState.originalIncentiveConfig) {
        showToast('⚠️', 'No changes to reset');
        return;
    }
    
    if (confirm('Reset all incentive configurations to last saved state?')) {
        appState.config.quarterly_incentive = JSON.parse(JSON.stringify(appState.originalIncentiveConfig.quarterly));
        appState.config.collection_incentive = JSON.parse(JSON.stringify(appState.originalIncentiveConfig.collection));
        appState.config.active_call_incentive = JSON.parse(JSON.stringify(appState.originalIncentiveConfig.activeCall));
        
        switchView('incentive');
        showToast('↻', 'Configuration reset');
    }
}

// 重置配置
function resetConfig() {
    if (confirm('Are you sure you want to reset all configurations to default?')) {
        // 重新加载默认配置
        initApp();
        showToast('✅', 'Configuration reset to default!');
    }
}

// 导出配置
function exportConfig() {
    const dataStr = JSON.stringify(appState.config, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sales_calculator_config.json';
    link.click();
    showToast('✅', 'Configuration exported!');
}

// ==================== Quick Calculate History ====================

// 切换快速计算标签
function switchQuickTab(tab) {
    appState.currentQuickTab = tab;
    
    // 更新按钮样式
    const tabCurrent = document.getElementById('tab-current');
    const tabHistory = document.getElementById('tab-history');
    const currentContent = document.getElementById('current-content');
    const historyContent = document.getElementById('history-content');
    
    if (tabCurrent && tabHistory) {
        tabCurrent.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
        tabHistory.classList.remove('border-b-2', 'border-blue-600', 'text-blue-600');
        tabCurrent.classList.add('text-gray-600');
        tabHistory.classList.add('text-gray-600');
    }
    
    if (tab === 'current') {
        if (tabCurrent) {
            tabCurrent.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
            tabCurrent.classList.remove('text-gray-600');
        }
        if (currentContent) currentContent.classList.remove('hidden');
        if (historyContent) historyContent.classList.add('hidden');
    } else {
        if (tabHistory) {
            tabHistory.classList.add('border-b-2', 'border-blue-600', 'text-blue-600');
            tabHistory.classList.remove('text-gray-600');
        }
        if (currentContent) currentContent.classList.add('hidden');
        if (historyContent) historyContent.classList.remove('hidden');
        loadQuickCalculateHistory();
    }
}

// 加载历史记录
function loadQuickCalculateHistory() {
    var historyList = document.getElementById('history-list');
    if (!historyList) return;

    if (!appState.config.reportHistory) appState.config.reportHistory = [];
    var history = appState.config.reportHistory;
    console.log('📜 reportHistory count:', history.length);

    if (history.length === 0) {
        historyList.innerHTML = '<div class="text-center py-8 text-gray-500"><p class="text-lg mb-2">📭 No reports yet</p><p class="text-sm">Import Excel or save data to see history</p></div>';
        return;
    }

    var defaultRates = [
        {min:0,max:79.99,rate:0,label:'0%-79%'},
        {min:80,max:89.99,rate:0.006,label:'80%-89%'},
        {min:90,max:99.99,rate:0.007,label:'90%-99%'},
        {min:100,max:105.99,rate:0.008,label:'100%-105%'},
        {min:106,max:999,rate:0.01,label:'106%+'}
    ];
    var cfgRates = appState.config.monthly_commission_rates;
    var rates = (cfgRates && cfgRates.length > 0) ? cfgRates : defaultRates;
    console.log('📜 commission rates tiers:', rates.length);

    function calcComm(sales, target, name) {
        if (!target || !sales || target <= 0 || sales <= 0) return 0;
        var ach = (sales / target) * 100;
        var r = rates;
        var nu = name ? name.toUpperCase() : null;
        if (nu && appState.config.person_commission_rates && appState.config.person_commission_rates[nu])
            r = appState.config.person_commission_rates[nu];
        for (var i = 0; i < r.length; i++) {
            if (ach >= r[i].min && ach <= r[i].max) {
                var comm = sales * (r[i].rate || 0);
                console.log('💰', name, 'ach:', ach.toFixed(1)+'%', 'comm:', comm);
                return comm;
            }
        }
        console.warn('⚠️ No tier for', name, 'ach:', (sales/target*100).toFixed(1)+'%');
        return 0;
    }

    var monthOrder = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    var curMonthIdx = new Date().getMonth();

    var sorted = history.slice()
        .filter(function(r) {
            var mi = monthOrder.indexOf((r.month||'').toUpperCase());
            if (mi > curMonthIdx) return false;
            return (r.data||[]).some(function(p){ return (p.target||0)>0||(p.sales||0)>0; });
        })
        .sort(function(a,b){
            return monthOrder.indexOf((b.month||'').toUpperCase()) - monthOrder.indexOf((a.month||'').toUpperCase());
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
            var comm = calcComm(p.sales, p.target, p.name);
            var collPct = (p.collectionTarget||0)>0 ? (p.collectionAmount||0)/p.collectionTarget*100 : 0;
            var callPct = (p.callTarget||0)>0 ? (p.callActual||0)/p.callTarget*100 : 0;
            var coll = typeof calculateIncentive==='function' ? calculateIncentive(collPct, appState.config.collection_incentive) : 0;
            var callB = typeof calculateIncentive==='function' ? calculateIncentive(callPct, appState.config.active_call_incentive) : 0;
            totalComm += comm + coll + callB;
        });

        var peopleCards = people.map(function(p) {
            var comm = calcComm(p.sales, p.target, p.name);
            var ach  = (p.target||0)>0 ? (p.sales||0)/p.target*100 : 0;
            var achColor = ach>=100?'text-green-600':ach>=90?'text-yellow-600':'text-red-500';
            return '<div class="bg-white rounded p-3 text-center border border-gray-100">'
                + '<div class="font-medium text-gray-800 text-sm">'+(p.name||'—')+'</div>'
                + '<div class="text-xs text-gray-500 mt-1">Target: RM '+((p.target||0).toLocaleString())+'</div>'
                + '<div class="text-xs text-gray-500">Sales: RM '+((p.sales||0).toLocaleString())+'</div>'
                + '<div class="text-xs font-semibold mt-1 '+achColor+'">'+ach.toFixed(1)+'%</div>'
                + '<div class="text-xs text-indigo-600 font-medium">RM '+comm.toFixed(2)+'</div>'
                + '</div>';
        }).join('');

        return '<div class="bg-white rounded-xl shadow-sm p-5 border border-gray-200 mb-4">'
            + '<div class="flex justify-between items-start mb-3">'
            + '<div><h4 class="text-lg font-bold text-gray-900">'+month+'</h4>'
            + '<p class="text-sm text-gray-500">'+people.length+' people &nbsp;|&nbsp; Total Commission: <span class="font-semibold text-green-600">RM '+totalComm.toFixed(2)+'</span></p></div>'
            + '<div class="flex gap-2 flex-wrap justify-end">'
            + '<button onclick="viewHistoryReport('+realIndex+')" class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">👁 View</button>'
            + '<button onclick="exportHistoryToExcel('+realIndex+')" class="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm">📊 Excel</button>'
            + '<button onclick="printPayslipsFromHistory('+realIndex+')" class="px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 text-sm">📄 Payslip</button>'
            + '<button onclick="printHistoryReport('+realIndex+')" class="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 text-sm">🖨 Print PDF</button>'
            + '<button onclick="deleteHistoryReport('+realIndex+')" class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 text-sm">🗑️ Delete</button>'
            + '</div></div>'
            + '<div class="grid grid-cols-2 gap-2 sm:grid-cols-4">'+peopleCards+'</div>'
            + '</div>';
    }).join('');
}

function viewHistoryReport(index) {
    var report = (appState.config.reportHistory||[])[index];
    if (!report) { return; }

    var people = report.data || [];
    var month  = (report.month||'').toUpperCase();
    var qMonths = ['MAR','JUN','SEP','DEC'];
    var isQtr  = qMonths.indexOf(month) !== -1;

    var defaultRates = [
        {min:0,max:79.99,rate:0},{min:80,max:89.99,rate:0.006},
        {min:90,max:99.99,rate:0.007},{min:100,max:105.99,rate:0.008},{min:106,max:999,rate:0.01}
    ];
    var cfgRates = appState.config.monthly_commission_rates;
    var rates = (cfgRates && cfgRates.length > 0) ? cfgRates : defaultRates;

    function calcC(sales, target, name) {
        if (!target||!sales||target<=0||sales<=0) return 0;
        var ach=(sales/target)*100, r=rates;
        var nu=name?name.toUpperCase():null;
        if(nu&&appState.config.person_commission_rates&&appState.config.person_commission_rates[nu]) r=appState.config.person_commission_rates[nu];
        for(var i=0;i<r.length;i++) if(ach>=r[i].min&&ach<=r[i].max) return sales*(r[i].rate||0);
        return 0;
    }

    var existing = document.getElementById('history-view-modal');
    if (existing) existing.remove();

    var cards = people.map(function(p) {
        var nu      = (p.name||'').toUpperCase();
        var salary  = (appState.config.base_salaries&&appState.config.base_salaries[nu])||0;
        var allow   = (appState.config.allowances&&appState.config.allowances[nu])||{};
        var epfRate = (appState.config.deductionRates&&appState.config.deductionRates[nu]&&appState.config.deductionRates[nu].EPF_RATE)||11;
        var totalAllow = Object.values(allow).reduce(function(s,v){return s+(parseFloat(v)||0);},0);
        var target=parseFloat(p.target)||0, sales=parseFloat(p.sales)||0;
        var collTgt=parseFloat(p.collectionTarget)||0, collAmt=parseFloat(p.collectionAmount)||0;
        var callTgt=parseFloat(p.callTarget)||0, callAct=parseFloat(p.callActual)||0;
        var ach=target>0?(sales/target*100):0;
        var collPct=collTgt>0?(collAmt/collTgt*100):0;
        var callPct=callTgt>0?(callAct/callTgt*100):0;
        var comm=calcC(sales,target,p.name);
        var collBon=typeof calculateIncentive==='function'?calculateIncentive(collPct,appState.config.collection_incentive):0;
        var callBon=typeof calculateIncentive==='function'?calculateIncentive(callPct,appState.config.active_call_incentive):0;
        var qtrBon=isQtr&&typeof calculateIncentive==='function'?calculateIncentive(ach,appState.config.quarterly_incentive):0;
        var totalComm=comm+collBon+callBon+qtrBon;
        var totalIncome=salary+totalAllow+totalComm;
        var _vhBareM=(typeof bareMonth==='function')?bareMonth(report.month):month;
        var _vhYear=(typeof keyYear==='function')?(keyYear(report.month)||new Date().getFullYear()):new Date().getFullYear();
        var _vhEpf=(typeof window.computeEpf==='function')?window.computeEpf(p.name,totalIncome,_vhBareM,_vhYear):{employee:Math.round(totalIncome*(epfRate/100)*100)/100,empPct:epfRate};
        var epfAmt=Math.round(_vhEpf.employee*100)/100;
        var epfPctLabel=(_vhEpf.empPct!=null)?_vhEpf.empPct.toFixed(1):epfRate;
        var _vhSocso=(typeof window.computeSocso==='function')?window.computeSocso(p.name,totalIncome,_vhBareM,_vhYear):{employee:0};
        var socsoAmt=Math.round(_vhSocso.employee*100)/100;
        var _vhEis=(typeof window.computeEis==='function')?window.computeEis(p.name,totalIncome,_vhBareM,_vhYear):{employee:0};
        var eisAmt=Math.round(_vhEis.employee*100)/100;
        var grandTotal=totalIncome-epfAmt-socsoAmt-eisAmt;
        var achColor=ach>=100?'#16a34a':ach>=90?'#d97706':'#dc2626';
        return '<div style="border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:16px;background:#fff;">'
            +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #f3f4f6;">'
            +'<h3 style="margin:0;font-size:16px;font-weight:700;color:#111;">'+p.name+'</h3></div>'
            +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;">'
            +'<div style="color:#6b7280;">Base Salary</div><div style="text-align:right;">RM '+salary.toFixed(2)+'</div>'
            +'<div style="color:#6b7280;">Monthly Target</div><div style="text-align:right;">RM '+target.toLocaleString()+'</div>'
            +'<div style="color:#6b7280;">Monthly Sales</div><div style="text-align:right;">RM '+sales.toFixed(2)+'</div>'
            +'<div style="color:#6b7280;">Achievement</div><div style="text-align:right;font-weight:600;color:'+achColor+';">'+ach.toFixed(2)+'%</div>'
            +'<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
            +'<div style="color:#6b7280;">Commission</div><div style="text-align:right;color:#2563eb;">RM '+comm.toFixed(2)+'</div>'
            +'<div style="color:#6b7280;">Collection Bonus</div><div style="text-align:right;color:#2563eb;">RM '+collBon.toFixed(2)+'</div>'
            +'<div style="color:#6b7280;">Call Bonus</div><div style="text-align:right;color:#2563eb;">RM '+callBon.toFixed(2)+'</div>'
            +(isQtr?'<div style="color:#6b7280;">Quarterly Bonus</div><div style="text-align:right;color:#2563eb;">RM '+qtrBon.toFixed(2)+'</div>':'')
            +'<div style="color:#6b7280;font-weight:600;">Total Commission</div><div style="text-align:right;font-weight:700;color:#16a34a;">RM '+totalComm.toFixed(2)+'</div>'
            +'<div style="height:1px;background:#f3f4f6;grid-column:1/-1;margin:4px 0;"></div>'
            +'<div style="color:#6b7280;">EPF ('+epfPctLabel+'%)</div><div style="text-align:right;color:#dc2626;">- RM '+epfAmt.toFixed(2)+'</div>'
            +(socsoAmt>0?'<div style="color:#6b7280;">SOCSO (0.5%)</div><div style="text-align:right;color:#dc2626;">- RM '+socsoAmt.toFixed(2)+'</div>':'')
            +(eisAmt>0?'<div style="color:#6b7280;">EIS (0.2%)</div><div style="text-align:right;color:#dc2626;">- RM '+eisAmt.toFixed(2)+'</div>':'')
            +'<div style="font-weight:700;">Grand Total</div><div style="text-align:right;font-weight:700;font-size:15px;color:#4f46e5;">RM '+grandTotal.toFixed(2)+'</div>'
            +'</div></div>';
    }).join('');

    var modal = document.createElement('div');
    modal.id = 'history-view-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:flex-start;justify-content:center;z-index:99999;padding:20px;box-sizing:border-box;overflow-y:auto;';
    var box = document.createElement('div');
    box.style.cssText = 'background:#f9fafb;border-radius:16px;max-width:640px;width:100%;box-shadow:0 25px 60px rgba(0,0,0,0.3);overflow:hidden;margin:auto;';
    box.innerHTML = '<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:20px 24px;color:#fff;display:flex;justify-content:space-between;align-items:center;">'
        +'<div><div style="font-size:20px;font-weight:700;">'+month+' Report</div><div style="font-size:13px;opacity:0.85;">'+people.length+' salespeople</div></div>'
        +'<div style="display:flex;gap:8px;">'
        +'<button onclick="exportHistoryToExcel('+index+')" style="padding:8px 16px;background:#16a34a;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">📊 Excel</button>'
        +'<button onclick="document.getElementById(\'history-view-modal\').remove()" style="padding:8px 16px;background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:8px;cursor:pointer;">✕ Close</button>'
        +'</div></div>'
        +'<div style="padding:20px;max-height:70vh;overflow-y:auto;">'+(people.length>0?cards:'<div style="text-align:center;padding:40px;color:#6b7280;">No data</div>')+'</div>';
    box.addEventListener('click',function(e){e.stopPropagation();});
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.addEventListener('click',function(){modal.remove();});
}


// 关闭报告模态框
function closeReportModal() {
    const container = document.getElementById('report-modal-container');
    if (container) {
        container.innerHTML = '';
    }
}

function deleteHistoryReport(index) {
    if (!appState.config.reportHistory || !appState.config.reportHistory[index]) return;
    
    if (confirm('Are you sure you want to delete this report?')) {
        appState.config.reportHistory.splice(index, 1);
        saveConfig();
        loadQuickCalculateHistory();
        showToast('✅', 'Report deleted');
    }
}

// 保存报告到历史
function saveReportToHistory(month, data, totalCommission) {
    if (!appState.config.reportHistory) {
        appState.config.reportHistory = [];
    }
    
    appState.config.reportHistory.push({
        month: month,
        timestamp: new Date().toISOString(),
        count: data.length,
        totalCommission: totalCommission,
        data: data
    });
    
    // 保存配置
    saveConfig();
}

// ==================== Commission & Incentive 配置 ====================

// 初始化 Commission & Incentive 视图
function initCommissionView() {
    console.log('🔍 initCommissionView called');
    renderCommissionConfigs();
}

// 渲染 Commission & Incentive 配置
function renderCommissionConfigs() {
    const container = document.getElementById('commission-config-container');
    if (!container) {
        console.error('❌ commission-config-container not found!');
        return;
    }
    
    container.innerHTML = `
        <!-- Monthly Commission Rates -->
        <div class="mb-8 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-blue-900">💰 Monthly Commission Rates</h3>
                <button onclick="addCommissionTier()" 
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2">
                    <span>➕</span>
                    <span>Add Tier</span>
                </button>
            </div>
            <div class="bg-white p-4 rounded-lg">
                <div class="space-y-3">
                    ${(appState.config.monthly_commission_rates || []).map((tier, idx) => `
                        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Label</label>
                                <input type="text" 
                                       value="${tier.label || ''}"
                                       onchange="updateCommissionTier(${idx}, 'label', this.value)"
                                       placeholder="e.g., 100%+"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Min %</label>
                                <input type="number" 
                                       value="${tier.min}"
                                       onchange="updateCommissionTier(${idx}, 'min', this.value)"
                                       placeholder="0"
                                       step="0.01"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Max %</label>
                                <input type="number" 
                                       value="${tier.max}"
                                       onchange="updateCommissionTier(${idx}, 'max', this.value)"
                                       placeholder="999"
                                       step="0.01"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Rate %</label>
                                <input type="number" 
                                       value="${(tier.rate * 100).toFixed(2)}"
                                       onchange="updateCommissionTier(${idx}, 'rate', parseFloat(this.value) / 100)"
                                       placeholder="1.0"
                                       step="0.01"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <button onclick="removeCommissionTier(${idx})" 
                                    class="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm mt-5">
                                🗑️
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <!-- Quarterly Bonus -->
        <div class="mb-8 p-6 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border-2 border-purple-200">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-purple-900">🎯 Quarterly Bonus</h3>
                <button onclick="addQuarterlyTier()" 
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2">
                    <span>➕</span>
                    <span>Add Tier</span>
                </button>
            </div>
            <div class="bg-white p-4 rounded-lg">
                <div class="space-y-3">
                    ${(appState.config.quarterly_incentive || []).map((tier, idx) => `
                        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Label</label>
                                <input type="text" 
                                       value="${tier.label || ''}"
                                       onchange="updateQuarterlyIncentive(${idx}, 'label', this.value)"
                                       placeholder="e.g., 100%+"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Min %</label>
                                <input type="number" 
                                       value="${tier.min}"
                                       onchange="updateQuarterlyIncentive(${idx}, 'min', this.value)"
                                       placeholder="100"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Amount (RM)</label>
                                <input type="number" 
                                       value="${tier.incentive}"
                                       onchange="updateQuarterlyIncentive(${idx}, 'incentive', this.value)"
                                       placeholder="400"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <button onclick="removeQuarterlyTier(${idx})" 
                                    class="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm mt-5">
                                🗑️
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <!-- Collection Incentive -->
        <div class="mb-8 p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-green-900">💵 Collection Incentive</h3>
                <button onclick="addCollectionTier()" 
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2">
                    <span>➕</span>
                    <span>Add Tier</span>
                </button>
            </div>
            <div class="bg-white p-4 rounded-lg">
                <div class="space-y-3">
                    ${(appState.config.collection_incentive || []).map((tier, idx) => `
                        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Label</label>
                                <input type="text" 
                                       value="${tier.label || ''}"
                                       onchange="updateCollectionIncentive(${idx}, 'label', this.value)"
                                       placeholder="e.g., 100%+"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Min %</label>
                                <input type="number" 
                                       value="${tier.min}"
                                       onchange="updateCollectionIncentive(${idx}, 'min', this.value)"
                                       placeholder="100"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Amount (RM)</label>
                                <input type="number" 
                                       value="${tier.incentive}"
                                       onchange="updateCollectionIncentive(${idx}, 'incentive', this.value)"
                                       placeholder="300"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <button onclick="removeCollectionTier(${idx})" 
                                    class="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm mt-5">
                                🗑️
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
        
        <!-- Active Call Incentive -->
        <div class="p-6 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border-2 border-orange-200">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold text-orange-900">📞 Active Call Incentive</h3>
                <button onclick="addActiveCallTier()" 
                        class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center space-x-2">
                    <span>➕</span>
                    <span>Add Tier</span>
                </button>
            </div>
            <div class="bg-white p-4 rounded-lg">
                <div class="space-y-3">
                    ${(appState.config.active_call_incentive || []).map((tier, idx) => `
                        <div class="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Label</label>
                                <input type="text" 
                                       value="${tier.label || ''}"
                                       onchange="updateActiveCallIncentive(${idx}, 'label', this.value)"
                                       placeholder="e.g., 100%+"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Min %</label>
                                <input type="number" 
                                       value="${tier.min}"
                                       onchange="updateActiveCallIncentive(${idx}, 'min', this.value)"
                                       placeholder="100"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <div class="flex-1">
                                <label class="block text-xs text-gray-600 mb-1">Amount (RM)</label>
                                <input type="number" 
                                       value="${tier.incentive}"
                                       onchange="updateActiveCallIncentive(${idx}, 'incentive', this.value)"
                                       placeholder="200"
                                       class="w-full px-3 py-2 border border-gray-300 rounded text-sm">
                            </div>
                            <button onclick="removeActiveCallTier(${idx})" 
                                    class="px-3 py-2 bg-red-500 text-white rounded hover:bg-red-600 text-sm mt-5">
                                🗑️
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
}

// 添加 Tier 函数
function addCommissionTier() {
    if (!appState.config.monthly_commission_rates) appState.config.monthly_commission_rates = [];
    appState.config.monthly_commission_rates.push({ min: 0, max: 999, rate: 0, label: 'New Tier' });
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', 'Tier added');
}

function addQuarterlyTier() {
    if (!appState.config.quarterly_incentive) appState.config.quarterly_incentive = [];
    appState.config.quarterly_incentive.push({ min: 0, incentive: 0, label: 'New Tier' });
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', 'Tier added');
}

function addCollectionTier() {
    if (!appState.config.collection_incentive) appState.config.collection_incentive = [];
    appState.config.collection_incentive.push({ min: 0, incentive: 0, label: 'New Tier' });
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', 'Tier added');
}

function addActiveCallTier() {
    if (!appState.config.active_call_incentive) appState.config.active_call_incentive = [];
    appState.config.active_call_incentive.push({ min: 0, incentive: 0, label: 'New Tier' });
    saveConfig();
    renderCommissionConfigs();
    showToast('✅', 'Tier added');
}

// 删除 Tier 函数
function removeCommissionTier(index) {
    if (confirm('Delete this tier?')) {
        if (!appState.config.monthly_commission_rates) return;
        appState.config.monthly_commission_rates.splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted');
    }
}

function removeQuarterlyTier(index) {
    if (confirm('Delete this tier?')) {
        if (!appState.config.quarterly_incentive) return;
        appState.config.quarterly_incentive.splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted');
    }
}

function removeCollectionTier(index) {
    if (confirm('Delete this tier?')) {
        if (!appState.config.collection_incentive) return;
        appState.config.collection_incentive.splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted');
    }
}

function removeActiveCallTier(index) {
    if (confirm('Delete this tier?')) {
        if (!appState.config.active_call_incentive) return;
        appState.config.active_call_incentive.splice(index, 1);
        saveConfig();
        renderCommissionConfigs();
        showToast('✅', 'Tier deleted');
    }
}

// 更新 Tier 函数
function updateCommissionTier(index, field, value) {
    if (!appState.config.monthly_commission_rates || !appState.config.monthly_commission_rates[index]) return;
    
    if (field === 'rate' || field === 'min' || field === 'max') {
        appState.config.monthly_commission_rates[index][field] = parseFloat(value) || 0;
    } else {
        appState.config.monthly_commission_rates[index][field] = value;
    }
    saveConfig();
    if (window.triggerAutoSave) triggerAutoSave();
}

function updateQuarterlyIncentive(index, field, value) {
    if (!appState.config.quarterly_incentive || !appState.config.quarterly_incentive[index]) return;
    
    if (field === 'min' || field === 'incentive') {
        appState.config.quarterly_incentive[index][field] = parseFloat(value) || 0;
    } else {
        appState.config.quarterly_incentive[index][field] = value;
    }
    saveConfig();
    if (window.triggerAutoSave) triggerAutoSave();
}

function updateCollectionIncentive(index, field, value) {
    if (!appState.config.collection_incentive || !appState.config.collection_incentive[index]) return;
    
    if (field === 'min' || field === 'incentive') {
        appState.config.collection_incentive[index][field] = parseFloat(value) || 0;
    } else {
        appState.config.collection_incentive[index][field] = value;
    }
    saveConfig();
    if (window.triggerAutoSave) triggerAutoSave();
}

function updateActiveCallIncentive(index, field, value) {
    if (!appState.config.active_call_incentive || !appState.config.active_call_incentive[index]) return;
    
    if (field === 'min' || field === 'incentive') {
        appState.config.active_call_incentive[index][field] = parseFloat(value) || 0;
    } else {
        appState.config.active_call_incentive[index][field] = value;
    }
    saveConfig();
    if (window.triggerAutoSave) triggerAutoSave();
}