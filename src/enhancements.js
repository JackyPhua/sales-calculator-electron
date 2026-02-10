// ==================== 增强功能模块 ====================
// 将这些代码添加到 calculator.js 的末尾

// ========== 1. 输入验证 ==========
function validateNumber(value, fieldName, min = 0, max = Infinity) {
    const num = parseFloat(value);
    
    if (value === '' || value === null || value === undefined) {
        return { valid: false, error: `${fieldName} is required`, value: 0 };
    }
    
    if (isNaN(num)) {
        return { valid: false, error: `${fieldName} must be a valid number`, value: 0 };
    }
    
    if (num < min) {
        return { valid: false, error: `${fieldName} cannot be less than ${min}`, value: min };
    }
    
    if (num > max) {
        return { valid: false, error: `${fieldName} cannot exceed ${max}`, value: max };
    }
    
    return { valid: true, value: num };
}

// 验证销售员数据
function validateSalespersonData(person, index) {
    const errors = [];
    
    // 验证销售额
    const salesValidation = validateNumber(person.sales, 'Sales', 0, 10000000);
    if (!salesValidation.valid) errors.push(`Person ${index + 1}: ${salesValidation.error}`);
    
    // 验证目标
    const targetValidation = validateNumber(person.target, 'Target', 0, 10000000);
    if (!targetValidation.valid) errors.push(`Person ${index + 1}: ${targetValidation.error}`);
    
    // 验证季度销售
    if (person.quarterlySales !== undefined) {
        const qSalesValidation = validateNumber(person.quarterlySales, 'Quarterly Sales', 0, 30000000);
        if (!qSalesValidation.valid) errors.push(`Person ${index + 1}: ${qSalesValidation.error}`);
    }
    
    // 验证季度目标
    if (person.quarterlyTarget !== undefined) {
        const qTargetValidation = validateNumber(person.quarterlyTarget, 'Quarterly Target', 0, 30000000);
        if (!qTargetValidation.valid) errors.push(`Person ${index + 1}: ${qTargetValidation.error}`);
    }
    
    return errors;
}

// ========== 2. 自动保存 ==========
let autoSaveTimeout;
const AUTO_SAVE_DELAY = 2000; // 2秒延迟

function enableAutoSave() {
    // 保存当前数据
    function saveData() {
        try {
            const dataToSave = {
                salespeople: appState.salespeople,
                month: document.getElementById('report-month')?.value,
                timestamp: new Date().toISOString()
            };
            
            localStorage.setItem('quickCalculateData_v1', JSON.stringify(dataToSave));
            console.log('✅ Auto-saved at', new Date().toLocaleTimeString());
        } catch (error) {
            console.error('❌ Auto-save failed:', error);
        }
    }
    
    // 延迟保存（防抖）
    function triggerAutoSave() {
        clearTimeout(autoSaveTimeout);
        autoSaveTimeout = setTimeout(() => {
            saveData();
            showToast('💾', 'Auto-saved', 1500);
        }, AUTO_SAVE_DELAY);
    }
    
    return triggerAutoSave;
}

// 恢复保存的数据
function restoreAutoSavedData() {
    try {
        const saved = localStorage.getItem('quickCalculateData_v1');
        if (!saved) return false;
        
        const data = JSON.parse(saved);
        
        // 检查数据是否太旧（超过7天）
        const savedDate = new Date(data.timestamp);
        const daysDiff = (Date.now() - savedDate.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysDiff > 7) {
            console.log('Saved data is too old, ignoring');
            return false;
        }
        
        // 询问用户是否恢复
        const restore = confirm(
            `Found auto-saved data from ${savedDate.toLocaleString()}.\n\n` +
            `Do you want to restore it?`
        );
        
        if (restore) {
            appState.salespeople = data.salespeople || [];
            
            // 设置月份
            if (data.month) {
                const monthSelect = document.getElementById('report-month');
                if (monthSelect) monthSelect.value = data.month;
            }
            
            // 重新渲染
            const container = document.getElementById('salespeople-container');
            if (container) {
                container.innerHTML = '';
                if (appState.salespeople.length === 0) {
                    addSalespersonCard();
                } else {
                    appState.salespeople.forEach(() => addSalespersonCard());
                }
            }
            
            showToast('✅', 'Data restored successfully!');
            return true;
        } else {
            // 用户选择不恢复，删除旧数据
            localStorage.removeItem('quickCalculateData_v1');
            return false;
        }
    } catch (error) {
        console.error('Failed to restore data:', error);
        return false;
    }
}

// ========== 3. 加载动画 ==========
function showLoading(message = 'Loading...') {
    // 移除已存在的加载器
    hideLoading();
    
    const loader = document.createElement('div');
    loader.id = 'global-loader';
    loader.innerHTML = `
        <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl p-6 flex items-center space-x-4 shadow-2xl">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
                <span class="text-lg font-medium text-gray-700">${message}</span>
            </div>
        </div>
    `;
    document.body.appendChild(loader);
}

function hideLoading() {
    const loader = document.getElementById('global-loader');
    if (loader) {
        loader.remove();
    }
}

// ========== 4. 更好的错误处理 ==========
function showError(title, message, details = null) {
    const errorId = 'error-modal-' + Date.now();
    const errorHtml = `
        <div id="${errorId}" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn">
            <div class="bg-white rounded-xl p-6 max-w-md shadow-2xl transform animate-slideIn">
                <div class="flex items-start mb-4">
                    <div class="flex-shrink-0">
                        <div class="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                            <span class="text-2xl">❌</span>
                        </div>
                    </div>
                    <div class="ml-4 flex-1">
                        <h3 class="text-xl font-bold text-red-600">${title}</h3>
                        <p class="text-gray-700 mt-2">${message}</p>
                    </div>
                </div>
                
                ${details ? `
                    <details class="mt-4">
                        <summary class="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                            Show technical details
                        </summary>
                        <pre class="mt-2 bg-gray-100 p-3 rounded text-xs overflow-auto max-h-40">${details}</pre>
                    </details>
                ` : ''}
                
                <div class="mt-6 flex justify-end space-x-3">
                    <button onclick="document.getElementById('${errorId}').remove()" 
                            class="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = errorHtml;
    document.body.appendChild(div);
}

function showSuccess(title, message) {
    const successId = 'success-modal-' + Date.now();
    const successHtml = `
        <div id="${successId}" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl p-6 max-w-md shadow-2xl">
                <div class="flex items-start mb-4">
                    <div class="flex-shrink-0">
                        <div class="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                            <span class="text-2xl">✅</span>
                        </div>
                    </div>
                    <div class="ml-4 flex-1">
                        <h3 class="text-xl font-bold text-green-600">${title}</h3>
                        <p class="text-gray-700 mt-2">${message}</p>
                    </div>
                </div>
                
                <div class="mt-6 flex justify-end">
                    <button onclick="document.getElementById('${successId}').remove()" 
                            class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                        OK
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = successHtml;
    document.body.appendChild(div);
    
    // 3秒后自动关闭
    setTimeout(() => {
        const modal = document.getElementById(successId);
        if (modal) modal.remove();
    }, 3000);
}

// ========== 5. 数据完整性检查 ==========
function validateDataIntegrity() {
    const errors = [];
    const warnings = [];
    
    // 检查 EPF 费率
    if (appState.config.deductionRates) {
        Object.keys(appState.config.deductionRates).forEach(name => {
            const rate = appState.config.deductionRates[name].EPF_RATE;
            if (rate === undefined || rate === null) {
                errors.push(`${name}: EPF rate is not set`);
            } else if (rate < 0 || rate > 100) {
                errors.push(`${name}: EPF rate ${rate}% is invalid (must be 0-100)`);
            } else if (rate < 2 || rate > 15) {
                warnings.push(`${name}: EPF rate ${rate}% seems unusual (typically 2-15%)`);
            }
        });
    }
    
    // 检查基本工资
    if (appState.config.base_salaries) {
        Object.keys(appState.config.base_salaries).forEach(name => {
            const salary = appState.config.base_salaries[name];
            if (salary < 0) {
                errors.push(`${name}: Negative salary ${salary}`);
            } else if (salary < 1000) {
                warnings.push(`${name}: Very low salary RM ${salary}`);
            } else if (salary > 50000) {
                warnings.push(`${name}: Very high salary RM ${salary}`);
            }
        });
    }
    
    return { errors, warnings };
}

// 显示数据完整性报告
function showIntegrityReport() {
    const { errors, warnings } = validateDataIntegrity();
    
    if (errors.length === 0 && warnings.length === 0) {
        showSuccess('Data Integrity Check', 'All data looks good! ✓');
        return;
    }
    
    let message = '';
    
    if (errors.length > 0) {
        message += '<div class="mb-4"><strong class="text-red-600">Errors:</strong><ul class="list-disc ml-5 mt-2">';
        errors.forEach(err => {
            message += `<li class="text-red-600">${err}</li>`;
        });
        message += '</ul></div>';
    }
    
    if (warnings.length > 0) {
        message += '<div><strong class="text-yellow-600">Warnings:</strong><ul class="list-disc ml-5 mt-2">';
        warnings.forEach(warn => {
            message += `<li class="text-yellow-600">${warn}</li>`;
        });
        message += '</ul></div>';
    }
    
    const modalId = 'integrity-report-' + Date.now();
    const html = `
        <div id="${modalId}" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div class="bg-white rounded-xl p-6 max-w-2xl max-h-96 overflow-y-auto shadow-2xl">
                <h3 class="text-xl font-bold mb-4">📊 Data Integrity Report</h3>
                ${message}
                <div class="mt-6 flex justify-end">
                    <button onclick="document.getElementById('${modalId}').remove()" 
                            class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div);
}

// ========== 6. 数据导出为 JSON ==========
function exportConfigAsJSON() {
    try {
        const config = {
            version: '1.0.0',
            exportDate: new Date().toISOString(),
            config: appState.config
        };
        
        const dataStr = JSON.stringify(config, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `config_backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('✅', 'Config exported successfully!');
    } catch (error) {
        showError('Export Failed', 'Could not export configuration', error.message);
    }
}

// 导入配置
async function importConfigFromJSON() {
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    
                    // 验证数据
                    if (!imported.config) {
                        throw new Error('Invalid config file format');
                    }
                    
                    // 确认导入
                    const confirm = window.confirm(
                        'This will replace your current configuration.\n\n' +
                        `Backup created: ${imported.exportDate || 'Unknown'}\n\n` +
                        'Continue?'
                    );
                    
                    if (confirm) {
                        appState.config = imported.config;
                        await saveConfig();
                        showSuccess('Import Successful', 'Configuration has been imported!');
                        
                        // 刷新页面
                        setTimeout(() => location.reload(), 1500);
                    }
                } catch (error) {
                    showError('Import Failed', 'Could not import configuration', error.message);
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    } catch (error) {
        showError('Import Failed', 'Could not import configuration', error.message);
    }
}

// ========== 初始化增强功能 ==========
function initEnhancements() {
    console.log('🚀 Initializing enhancements...');
    
    // 1. 启用自动保存
    const triggerAutoSave = enableAutoSave();
    window.triggerAutoSave = triggerAutoSave;
    
    // 2. 页面加载时恢复数据
    setTimeout(() => {
        restoreAutoSavedData();
    }, 500);
    
    // 3. 定期检查数据完整性（每小时）
    setInterval(() => {
        const { errors } = validateDataIntegrity();
        if (errors.length > 0) {
            console.warn('⚠️ Data integrity issues detected:', errors);
        }
    }, 60 * 60 * 1000);
    
    // 4. 添加键盘快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl+S: 手动保存
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (window.triggerAutoSave) {
                window.triggerAutoSave();
            }
        }
        
        // Ctrl+E: 导出配置
        if (e.ctrlKey && e.key === 'e') {
            e.preventDefault();
            exportConfigAsJSON();
        }
    });
    
    console.log('✅ Enhancements initialized!');
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEnhancements);
} else {
    initEnhancements();
}

// 导出函数供全局使用
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showError = showError;
window.showSuccess = showSuccess;
window.validateNumber = validateNumber;
window.validateSalespersonData = validateSalespersonData;
window.showIntegrityReport = showIntegrityReport;
window.exportConfigAsJSON = exportConfigAsJSON;
window.importConfigFromJSON = importConfigFromJSON;
