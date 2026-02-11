const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const excelStyles = require('./src/excelStyles');
const { styles } = excelStyles;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        frame: true,
        titleBarStyle: 'default',
        backgroundColor: '#f9fafb',
        icon: path.join(__dirname, 'assets', 'icon.png')
    });

    mainWindow.loadFile('index.html');

    // 开发时打开 DevTools
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    // 确保配置文件存在
    try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        await fs.access(configPath);
        console.log('Config file exists:', configPath);
    } catch (error) {
        // 如果配置文件不存在，创建默认配置
        console.log('Creating default config file...');
        await fs.writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2));
    }
    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ========== IPC Handlers ==========

// 加载配置
ipcMain.handle('load-config', async () => {
    try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        const data = await fs.readFile(configPath, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // 返回默认配置
        return getDefaultConfig();
    }
});

// 保存配置
ipcMain.handle('save-config', async (event, config) => {
    try {
        const configPath = path.join(app.getPath('userData'), 'config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 加载多语言资源
ipcMain.handle('load-locale', async (event, lang = 'en') => {
    try {
        const localePath = path.join(__dirname, '..', 'src', 'locales', `${lang}.json`);
        const localeData = await fs.readFile(localePath, 'utf8');
        return JSON.parse(localeData);
    } catch (error) {
        console.error(`Failed to load locale ${lang}:`, error);
        // 返回基本的英文本地化
        return {
            app: {
                title: 'Sales Calculator',
                loading: 'Loading...',
                success: 'Success',
                error: 'Error',
                warning: 'Warning'
            }
        };
    }
});

// 选择文件
ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
            { name: 'CSV Files', extensions: ['csv'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
});

// 导入销售数据
ipcMain.handle('import-sales-data', async (event, filePath) => {
    try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        
        // 自动尝试多个sheet名，找不到就用第一个sheet
        const possibleNames = ['Sheet1', 'Sheet2', 'Data Sheet', 'data sheet', 'Sheet 1', 'DATA SHEET'];
        let dataSheet = null;
        for (const name of possibleNames) {
            dataSheet = workbook.getWorksheet(name);
            if (dataSheet) break;
        }
        if (!dataSheet) dataSheet = workbook.worksheets[0];
        if (!dataSheet) return { success: false, error: 'No worksheet found in file' };

        const salesData = [];
        let currentPerson = null;
        let personData = null;
        const MONTHS = new Set(['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']);

        // 解析单元格值（处理公式、数字、null）
        const getCellNum = (cell) => {
            const v = cell.value;
            if (v === null || v === undefined) return 0;
            if (typeof v === 'object' && v.result !== undefined) return parseFloat(v.result) || 0;
            return parseFloat(v) || 0;
        };

        dataSheet.eachRow((row, rowNumber) => {
            const rawA = row.getCell(1).value;
            const rawB = row.getCell(2).value;

            // 跳过完全空行
            if (!rawA && !rawB) return;

            const cellA = rawA ? rawA.toString().trim() : '';
            const cellB = rawB ? rawB.toString().trim().toUpperCase() : '';

            // 跳过表头行和Total行
            if (cellB === 'MONTH' || cellA.toUpperCase().includes('SALE TEAM')) return;
            if (cellB === 'TOTAL') return;

            // 新销售员：A列有名字且不是月份
            if (cellA && !MONTHS.has(cellA.toUpperCase())) {
                if (personData) salesData.push(personData);
                currentPerson = cellA.toUpperCase();
                personData = { name: currentPerson, months: [] };
            }

            // 有月份就记录数据
            if (MONTHS.has(cellB) && personData) {
                personData.months.push({
                    month: cellB,
                    target:     getCellNum(row.getCell(3)),
                    sales:      getCellNum(row.getCell(4)),
                    collection: getCellNum(row.getCell(9))
                });
            }
        });

        // 加入最后一个人
        if (personData) salesData.push(personData);

        return { success: true, data: salesData };

    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 生成工资模板 - 包含详细调试
ipcMain.handle('generate-salary-template', async (event, data) => {
    // ========== 🔍 详细调试 ==========
    console.log('\n\n' + '='.repeat(60));
    console.log('🔍 generate-salary-template 被调用');
    console.log('='.repeat(60));
    
    console.log('\n📋 收到的完整数据结构:');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n📊 关键信息摘要:');
    console.log('- 月份:', data.month || '未设置');
    console.log('- 销售员数量:', data.salespeople?.length || 0);
    
    // 检查 config 对象
    console.log('\n🔍 检查 config 对象:');
    console.log('- 是否有 config?', !!data.config);
    console.log('- config 类型:', typeof data.config);
    
    if (data.config && typeof data.config === 'object') {
        console.log('- config 的所有键:', Object.keys(data.config));
        console.log('- config 内容:', JSON.stringify(data.config, null, 2));
        
        // 专门查找 EPF 相关键
        const epfKeys = Object.keys(data.config).filter(key => 
            key.toLowerCase().includes('epf') || 
            key.toLowerCase().includes('pf') ||
            key.toLowerCase().includes('rate')
        );
        console.log('- 可能的 EPF 相关键:', epfKeys);
        
        if (epfKeys.length > 0) {
            epfKeys.forEach(key => {
                const value = data.config[key];
                console.log(`  - ${key}:`, value, `(类型: ${typeof value})`);
                if (typeof value === 'number') {
                    console.log(`    相当于 ${value * 100}%`);
                }
            });
        } else {
            console.log('- ⚠️ 未找到 EPF 相关键');
        }
    } else {
        console.log('- ⚠️ config 为空或不是对象');
    }
    
    // 检查第一个销售员的数据
    if (data.salespeople && data.salespeople.length > 0) {
        console.log('\n🔍 检查第一个销售员的数据:');
        const firstPerson = data.salespeople[0];
        console.log('- 姓名:', firstPerson.name);
        console.log('- 所有键:', Object.keys(firstPerson));
        
        // 检查销售员是否有自己的 EPF 设置
        if (firstPerson.deductions) {
            console.log('- deductions:', JSON.stringify(firstPerson.deductions, null, 2));
        }
        
        // 检查是否有 epfRate 直接挂在 person 上
        const personEpfKeys = Object.keys(firstPerson).filter(key => 
            key.toLowerCase().includes('epf') || key.toLowerCase().includes('pf')
        );
        if (personEpfKeys.length > 0) {
            console.log('- 销售员自身的 EPF 键:', personEpfKeys);
            personEpfKeys.forEach(key => {
                console.log(`  - ${key}:`, firstPerson[key]);
            });
        }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🚀 开始生成模板...');
    console.log('='.repeat(60) + '\n');
    // =================================
    
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `Commission_Report_${data.month || 'ALL'}_${new Date().getFullYear()}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled) {
            return { success: false, message: 'Cancelled' };
        }

        const workbook = new ExcelJS.Workbook();
        
        // 计算团队总销售额
        const totalTeamSales = data.salespeople.reduce((sum, person) => {
            return sum + (parseFloat(person.sales) || 0);
        }, 0);
        
        console.log('📊 团队总销售额:', totalTeamSales);
        
        // 为每个销售员创建工作表
        for (const person of data.salespeople) {
            const sheet = workbook.addWorksheet(person.name.substring(0, 31));
            await createSalarySheet(sheet, person, data.config, data.month, totalTeamSales);
        }

        // Group Summary sheet (Book3 格式)
        const groupSheet = workbook.addWorksheet('Group Summary');
        await createGroupSummarySheet(groupSheet, data.salespeople, data.config, data.month);

        // Commission Summary sheet (Book2 格式)
        const commSheet = workbook.addWorksheet('Commission Summary');
        await createCommissionSummarySheet(commSheet, data.salespeople, data.config, data.month);

        await workbook.xlsx.writeFile(result.filePath);
        
        return { 
            success: true, 
            path: result.filePath,
            message: 'Template generated successfully!'
        };
    } catch (error) {
        console.error('❌ 生成模板时出错:', error);
        return { success: false, error: error.message };
    }
});

// 导出 PDF 报告
ipcMain.handle('export-pdf', async (event, data) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `${data.name}_Report.pdf`,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (result.canceled) {
            return { success: false };
        }

        // 使用 Electron 的打印功能生成 PDF
        const pdfData = await mainWindow.webContents.printToPDF({
            printBackground: true,
            landscape: false
        });

        await fs.writeFile(result.filePath, pdfData);
        
        return { success: true, path: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ========== Helper Functions ==========

async function createSalarySheet(sheet, person, config, month, totalTeamSales = 0) {
    // 确保 EPF 率正确
    let epfRate = 0.11; // 默认 11%
    let epfSource = 'default 11%';
    
    // 尝试从 config 获取 EPF 率
    if (config && config.epfRate !== undefined) {
        epfRate = parseFloat(config.epfRate) || 0.11;
    }
    
    // 尝试从 person.deductions 获取
    if (person.deductions && person.deductions.epfRate !== undefined) {
        epfRate = parseFloat(person.deductions.epfRate) || 0.11;
    }
    
    console.log(`Using EPF rate: ${epfRate * 100}% for ${person.name}`);
    
    
    
    // 方法1：从 config 中查找
    if (config && typeof config === 'object') {
        console.log('\n🔍 尝试从 config 中查找 EPF 费率:');
        
        const possibleKeys = [
            'epfRate', 'EPFRate', 'epf_rate', 'EPF_RATE', 'epfRate', 'epfRate',
            'epfPercentage', 'epfPercent', 'epf', 'EPF', 'Epf',
            'pfRate', 'PFRate', 'pf_rate', 'PF_RATE', 'pf', 'PF',
            'rate', 'Rate', 'RATE'
        ];
        
        for (const key of possibleKeys) {
            if (config[key] !== undefined && config[key] !== null) {
                const value = parseFloat(config[key]);
                if (!isNaN(value) && value > 0) {
                    epfRate = value;
                    epfSource = `config.${key} = ${value}`;
                    console.log(`✅ 找到: ${key} = ${value} (${value * 100}%)`);
                    break;
                }
            }
        }
    }
    
    // 方法2：从 person 对象中查找
    if (epfRate === 0.02) {
        console.log('\n🔍 尝试从 person 中查找 EPF 费率:');
        
        // 检查 person.deductions
        if (person.deductions && typeof person.deductions === 'object') {
            console.log('- person.deductions:', JSON.stringify(person.deductions, null, 2));
            
            if (person.deductions.epfRate !== undefined) {
                epfRate = parseFloat(person.deductions.epfRate) || 0.02;
                epfSource = `person.deductions.epfRate = ${epfRate}`;
                console.log(`✅ 从 deductions.epfRate 找到: ${epfRate}`);
            }
            
            // 检查百分比值
            for (const [key, value] of Object.entries(person.deductions)) {
                if (typeof value === 'number' && value > 0 && value <= 1) {
                    console.log(`- ${key}: ${value} (可能是费率)`);
                }
            }
        }
        
        // 检查 person 的其他属性
        const personEpfKeys = Object.keys(person).filter(key => 
            key.toLowerCase().includes('epf') || 
            key.toLowerCase().includes('pf') ||
            key.toLowerCase().includes('rate')
        );
        
        if (personEpfKeys.length > 0) {
            console.log('- person 中的相关键:', personEpfKeys);
            personEpfKeys.forEach(key => {
                const value = person[key];
                console.log(`  - ${key}:`, value, `(类型: ${typeof value})`);
                if (typeof value === 'number' && value > 0 && value <= 1) {
                    epfRate = value;
                    epfSource = `person.${key} = ${value}`;
                }
            });
        }
    }
    
    // 从 config.deductionRates 读取该人的 EPF Rate
    const nameUpper = (person.name || '').toUpperCase();
    if (config && config.deductionRates && config.deductionRates[nameUpper] && config.deductionRates[nameUpper].EPF_RATE !== undefined) {
        epfRate = parseFloat(config.deductionRates[nameUpper].EPF_RATE) / 100;
        epfSource = `config.deductionRates[${nameUpper}].EPF_RATE = ${config.deductionRates[nameUpper].EPF_RATE}%`;
        console.log(`✅ EPF Rate: ${config.deductionRates[nameUpper].EPF_RATE}% → ${epfRate}`);
    }
    
    console.log('\n📊 最终使用的 EPF 费率:');
    console.log('- 值:', epfRate);
    console.log('- 百分比:', epfRate * 100, '%');
    console.log('- 来源:', epfSource);
    // ========================================
    
    // 继续原有的数据验证日志
    console.log('\n\n========== 🔍 REAR-END: createSalarySheet DEBUG ==========');
    console.log('Person name:', person.name);
    console.log('Person salary:', person.salary, typeof person.salary);
    console.log('Person allowances object:', person.allowances);
    console.log('Raw allowances:', JSON.stringify(person.allowances, null, 2));
    console.log('Person sales:', person.sales);
    console.log('Person commission:', person.commission);
    console.log('Full person keys:', Object.keys(person));
    console.log('🚨 CRITICAL: person.commission value =', person.commission, '(expected: commission amount like 2900)');
    console.log('🔍 Checking if values are swapped...');
    if (person.sales < person.commission) {
        console.error('⚠️ WARNING: person.sales is LESS than person.commission! They might be swapped!');
    }
    
    // 逐个检查allowances中的每一项
    if (person.allowances) {
        console.log('\n--- Checking individual allowance values ---');
        console.log('HP:', person.allowances.HP, '(type:', typeof person.allowances.HP, ')');
        console.log('CAR:', person.allowances.CAR, '(type:', typeof person.allowances.CAR, ')');
        console.log('LOCAL FUEL:', person.allowances['LOCAL FUEL'], '(type:', typeof person.allowances['LOCAL FUEL'], ')');
        console.log('OUTSTATION FUEL:', person.allowances['OUTSTATION FUEL'], '(type:', typeof person.allowances['OUTSTATION FUEL'], ')');
        console.log('HOUSING:', person.allowances.HOUSING, '(type:', typeof person.allowances.HOUSING, ')');
        console.log('FOOD:', person.allowances.FOOD, '(type:', typeof person.allowances.FOOD, ')');
        console.log('OTHERS:', person.allowances.OTHERS, '(type:', typeof person.allowances.OTHERS, ')');
    }
    
    // 设置列宽
    sheet.columns = [
        { width: 25 }, { width: 15 }, { width: 15 }, 
        { width: 18 }, { width: 15 }, { width: 15 }, { width: 15 }
    ];

    // ========== 计算各个单元格的值 ==========
    
    // D4: SALARY
    const salary = person.salary || 0;
    
    // D5-D12: 各项津贴
    const allowances = person.allowances || {};
    const allowanceVals = {
        HP: parseFloat(allowances.HP) || 0,                 // D5
        CAR: parseFloat(allowances.CAR) || 0,               // D6
        'LOCAL FUEL': parseFloat(allowances['LOCAL FUEL']) || 0,      // D7
        'OUTSTATION FUEL': parseFloat(allowances['OUTSTATION FUEL']) || 0, // D8
        HOUSING: parseFloat(allowances.HOUSING) || 0,       // D9
        FOOD: parseFloat(allowances.FOOD) || 0,             // D10
        OTHERS: parseFloat(allowances.OTHERS) || 0          // D11
    };
    
    // D14: TOTAL FIXED INCOME = D4+D5+D6+D7+D8+D9+D10+D11
    const totalFixedIncome = salary + 
        allowanceVals.HP + 
        allowanceVals.CAR + 
        allowanceVals['LOCAL FUEL'] + 
        allowanceVals['OUTSTATION FUEL'] + 
        allowanceVals.HOUSING + 
        allowanceVals.FOOD + 
        allowanceVals.OTHERS;
    
    // 计算个人销售额
    const personMonthlySales = parseFloat(person.sales) || 0;

    // D17: 佣金 (COMMISSION AMOUNT)
    const commission = parseFloat(person.commission) || 0;
    
    // D19: 收款激励 (COLLECTION)
    const collectionIncentive = parseFloat(person.collectionIncentive) || 0;
    
    // D20: 活跃电话激励 (ACTIVE CALL)
    const activeCallIncentive = parseFloat(person.activeCallIncentive) || 0;
    
    // D21: 季度奖金 (QUATERLY)
    const quarterlyBonus = parseFloat(person.quarterlyBonus) || 0;
    
    // D23: TOTAL = D14 + D17 + D19 + D20 + D21
    const totalExtraIncome = totalFixedIncome + commission + collectionIncentive + activeCallIncentive + quarterlyBonus;
    
    // D25: EPF = D23 × EPF费率
    const epfAmount = totalExtraIncome * epfRate;
    const epfLabel = `EPF ${(epfRate * 100)}%`;
    
    // D27: GRAND TOTAL PAYABLE = D23 - D25
    const grandTotalPayable = totalExtraIncome - epfAmount;

    console.log('\n📊 Excel 单元格计算值:');
    console.log('- D4 (SALARY):', salary);
    console.log('- D5 (HP):', allowanceVals.HP);
    console.log('- D6 (CAR):', allowanceVals.CAR);
    console.log('- D7 (LOCAL FUEL):', allowanceVals['LOCAL FUEL']);
    console.log('- D8 (OUTSTATION FUEL):', allowanceVals['OUTSTATION FUEL']);
    console.log('- D9 (HOUSING):', allowanceVals.HOUSING);
    console.log('- D10 (FOOD):', allowanceVals.FOOD);
    console.log('- D11 (OTHERS):', allowanceVals.OTHERS);
    console.log('- D14 (TOTAL FIXED INCOME):', totalFixedIncome);
    console.log('- D17 (COMMISSION):', commission);
    console.log('- D19 (COLLECTION):', collectionIncentive);
    console.log('- D20 (ACTIVE CALL):', activeCallIncentive);
    console.log('- D21 (QUATERLY):', quarterlyBonus);
    console.log('- D23 (TOTAL):', totalExtraIncome);
    console.log('- D23 (TOTAL):', totalExtraIncome);
    console.log('- D25 (EPF):', epfAmount, `(费率: ${epfRate * 100}%) = ${totalExtraIncome} × ${epfRate}`);
    console.log('- D27 (GRAND TOTAL PAYABLE):', grandTotalPayable, `= ${totalExtraIncome} - ${epfAmount}`);

    // 使用预定义样式
    const headerStyle = styles.headerStyle;
    const sectionStyle = styles.subHeaderStyle;
    const totalStyle = styles.totalStyle;

    // 辅助函数：应用样式
    function applyStyle(cell, styleObj) {
        try {
            if (styleObj && styleObj.fill && styleObj.fill.fgColor) {
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: styleObj.fill.fgColor.argb }
                };
            }
            if (styleObj && styleObj.font) {
                cell.font = {
                    bold: styleObj.font.bold || false,
                    size: styleObj.font.size || 11,
                    color: styleObj.font.color ? { argb: styleObj.font.color.argb } : undefined
                };
            }
            if (styleObj && styleObj.alignment) {
                cell.alignment = {
                    horizontal: styleObj.alignment.horizontal || 'left',
                    vertical: styleObj.alignment.vertical || 'center',
                    wrapText: true
                };
            }
        } catch (err) {
            console.warn('Error applying style:', err);
        }
    }

    // 第1行：月份
    const monthCell = sheet.getCell('A1');
    monthCell.value = month.toUpperCase() + ' SALARY REPORT';
    monthCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    monthCell.fill = { 
        type: 'pattern', 
        pattern: 'solid', 
        fgColor: { argb: 'FF4F81BD' }
    };
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    
    // 安全地合并单元格
    try {
        sheet.mergeCells('A1:G1');
    } catch (err) {
        console.warn('Merge cells error:', err);
    }

    const rows = [
        // 第2-4行
        { label: 'INCOME', type: 'header' },
        { label: 'BASIC', type: 'section', cols: ['', '', 'PAY', 'INDV%', 'TEAM%'] },
        { label: 'SALARY', value: salary }, // D4
        
        // 第5-13行
        { label: 'ALLOWANCES', type: 'header' },
        { label: 'HP', value: allowanceVals.HP },        // D5
        { label: 'CAR', value: allowanceVals.CAR },      // D6
        { label: 'LOCAL FUEL', value: allowanceVals['LOCAL FUEL'] },      // D7
        { label: 'OUTSTATION FUEL', value: allowanceVals['OUTSTATION FUEL'] }, // D8
        { label: 'HOUSING', value: allowanceVals.HOUSING },  // D9
        { label: 'FOOD', value: allowanceVals.FOOD },    // D10
        { label: 'OTHERS', value: allowanceVals.OTHERS }, // D11
        { label: '', type: 'empty' },
        { label: 'TOTAL FIXED INCOME', value: totalFixedIncome, type: 'total' }, // D14
        
        // 第15-24行
        { label: '', type: 'empty' },
        { label: 'COMMISSION', type: 'header' },
        { label: 'COMMISSION AMOUNT', value: commission }, // D17
        { label: 'INCENTIVE', type: 'header' },
        { label: 'COLLECTION', value: collectionIncentive }, // D19
        { label: 'ACTIVE CALL', value: activeCallIncentive }, // D20
        { label: 'QUATERLY', value: quarterlyBonus },    // D21
        { label: '', type: 'empty' },
        { label: 'TOTAL', value: totalExtraIncome, type: 'total' }, // D23
        
        // 第25-27行
        { label: '', type: 'empty' },
        { label: epfLabel, value: epfAmount, type: 'epf' }, // D25
        { label: '', type: 'empty' },
        { label: 'GRAND TOTAL PAYABLE', value: grandTotalPayable, type: 'grandTotal' } // D27
    ];

    let rowNum = 2;
    for (const row of rows) {
        const cell = sheet.getCell(rowNum, 1);
        cell.value = row.label;

        if (row.type === 'header') {
            applyStyle(cell, headerStyle);
            for (let col = 1; col <= 7; col++) {
                applyStyle(sheet.getCell(rowNum, col), headerStyle);
            }
        } else if (row.type === 'section') {
            applyStyle(cell, sectionStyle);
            row.cols?.forEach((val, idx) => {
                const c = sheet.getCell(rowNum, idx + 2);
                c.value = val;
                applyStyle(c, sectionStyle);
            });
        } else if (row.type === 'total' || row.type === 'grandTotal' || row.type === 'epf') {
            applyStyle(cell, totalStyle);
            for (let col = 1; col <= 7; col++) {
                applyStyle(sheet.getCell(rowNum, col), totalStyle);
            }
        }

        if (row.value !== undefined) {
            const valueCell = sheet.getCell(rowNum, 4);
            valueCell.value = row.value;
            
            if (row.type === 'grandTotal' || row.type === 'total' || row.type === 'epf') {
                valueCell.numFmt = '#,##0.00';
                valueCell.font = { 
                    bold: true,
                    color: { argb: 'FFFFFFFF' },
                    size: row.type === 'grandTotal' ? 12 : 11
                };
            } else {
                valueCell.numFmt = '#,##0.00';
                if (styles.moneyStyle?.font) {
                    valueCell.font = styles.moneyStyle.font;
                }
            }
        }
        
        // 添加其他列的值
        if (row.col4 !== undefined) {
            const cell4 = sheet.getCell(rowNum, 4);
            cell4.value = parseFloat(row.col4) || 0;
            cell4.numFmt = '#,##0.00';
        }
        
        // 计算 INDV% = 该项金额 ÷ 个人销售额 × 100%
        if (row.value !== undefined && personMonthlySales > 0) {
            const cell5 = sheet.getCell(rowNum, 5);
            const indvPercent = (row.value / personMonthlySales) * 100;
            console.log(`📊 INDV% for ${row.label} (D${rowNum+2}): ${row.value} ÷ ${personMonthlySales} = ${indvPercent.toFixed(2)}%`);
            cell5.value = row.value / personMonthlySales;
            cell5.numFmt = '0.00%';
        } else if (row.value !== undefined) {
            const cell5 = sheet.getCell(rowNum, 5);
            cell5.value = 0;
            cell5.numFmt = '0.00%';
        }
        
        // 计算 TEAM% = 该项金额 ÷ 团队总销售额 × 100%
        if (row.value !== undefined && totalTeamSales > 0) {
            const cell6 = sheet.getCell(rowNum, 6);
            const teamPercent = (row.value / totalTeamSales) * 100;
            console.log(`📊 TEAM% for ${row.label} (D${rowNum+2}): ${row.value} ÷ ${totalTeamSales} = ${teamPercent.toFixed(2)}%`);
            cell6.value = row.value / totalTeamSales;
            cell6.numFmt = '0.00%';
        } else if (row.value !== undefined) {
            const cell6 = sheet.getCell(rowNum, 6);
            cell6.value = 0;
            cell6.numFmt = '0.00%';
        }

        rowNum++;
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`✅ 完成创建工资表: ${person.name}`);
    console.log('='.repeat(60));
}

function getDefaultConfig() {
    return {
        base_salaries: {
            // 用户可以在应用中添加
        },
        allowances: {
            // 用户可以在应用中添加
        },
        deductions: {
            // 自动生成
        },
        deductionRates: {
            // 自动生成
        },
        earnings: {
            // 自动生成
        },
        active_call_targets: {
            // 每个销售员的 Active Call 月度目标
        },
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
        ],
        // 添加 EPF 费率配置
        epfRate: 0.02  // 默认 2%
    };
}

// ==================== Group Summary Sheet (Book3 format) ====================
async function createGroupSummarySheet(sheet, salespeople, config, currentMonth) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const currentIdx = months.indexOf((currentMonth || '').toUpperCase());

    // 从 reportHistory 汇总每月数据
    const monthlyData = {};
    months.forEach(m => {
        monthlyData[m] = { target: 0, sales: 0 };
    });

    // 填入历史记录里的数据
    if (config.reportHistory) {
        config.reportHistory.forEach(report => {
            const m = (report.month || '').toUpperCase();
            if (monthlyData[m]) {
                (report.data || []).forEach(p => {
                    monthlyData[m].target += parseFloat(p.target) || 0;
                    monthlyData[m].sales += parseFloat(p.sales) || 0;
                });
            }
        });
    }

    // 当前月用传入的 salespeople 数据（覆盖历史）
    if (currentMonth && monthlyData[currentMonth.toUpperCase()]) {
        monthlyData[currentMonth.toUpperCase()].target = 0;
        monthlyData[currentMonth.toUpperCase()].sales = 0;
        salespeople.forEach(p => {
            monthlyData[currentMonth.toUpperCase()].target += parseFloat(p.target) || 0;
            monthlyData[currentMonth.toUpperCase()].sales += parseFloat(p.sales) || 0;
        });
    }

    // Styles
    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const monthStyle = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } },
        alignment: { horizontal: 'center' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const totalStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } },
        alignment: { horizontal: 'center' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const dataStyle = {
        alignment: { horizontal: 'right' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const pctStyle = {
        alignment: { horizontal: 'right' },
        numFmt: '0.00%',
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const currFmt = '#,##0.00';

    // Column widths
    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 16;
    sheet.getColumn(4).width = 16;
    sheet.getColumn(5).width = 14;

    // Header row
    const headers = ['GROUP SUMMARY', 'TARGET', 'SALES ACH', 'SALES vs TGT', 'SALES % HIT'];
    headers.forEach((h, i) => {
        const cell = sheet.getCell(1, i + 1);
        cell.value = h;
        Object.assign(cell, headerStyle);
        if (i > 0) cell.numFmt = i < 4 ? currFmt : '0.00%';
    });
    sheet.getRow(1).height = 20;

    // Data rows
    let totalTarget = 0, totalSales = 0;
    months.forEach((m, i) => {
        const rowNum = i + 2;
        const d = monthlyData[m];
        totalTarget += d.target;
        totalSales += d.sales;

        const rowCells = [
            { v: m, s: monthStyle },
            { v: d.target || 0, s: {...dataStyle, numFmt: currFmt} },
            { v: d.sales || 0, s: {...dataStyle, numFmt: currFmt} },
            { v: d.sales - d.target, s: {...dataStyle, numFmt: currFmt} },
            { v: d.target > 0 ? d.sales / d.target : '', s: pctStyle }
        ];
        rowCells.forEach((rc, ci) => {
            const cell = sheet.getCell(rowNum, ci + 1);
            cell.value = rc.v;
            Object.assign(cell, rc.s);
        });
    });

    // Total row
    const totalRow = 14;
    const totals = [
        { v: 'TOTAL', s: totalStyle },
        { v: totalTarget, s: {...totalStyle, numFmt: currFmt} },
        { v: totalSales, s: {...totalStyle, numFmt: currFmt} },
        { v: totalSales - totalTarget, s: {...totalStyle, numFmt: currFmt} },
        { v: totalTarget > 0 ? totalSales / totalTarget : 0, s: {...totalStyle, numFmt: '0.00%'} }
    ];
    totals.forEach((t, i) => {
        const cell = sheet.getCell(totalRow, i + 1);
        cell.value = t.v;
        Object.assign(cell, t.s);
    });
    sheet.getRow(totalRow).height = 18;
}

// ==================== Commission Summary Sheet (Book2 format) ====================
async function createCommissionSummarySheet(sheet, salespeople, config, currentMonth) {
    const month = (currentMonth || '').toUpperCase();

    // Styles
    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const nameStyle = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } },
        alignment: { horizontal: 'left' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const dataStyle = {
        alignment: { horizontal: 'right' },
        numFmt: '#,##0.00',
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const pctStyle = {
        alignment: { horizontal: 'right' },
        numFmt: '0.00%',
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const totalStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } },
        alignment: { horizontal: 'right' },
        numFmt: '#,##0.00',
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };
    const rateHeaderStyle = {
        font: { bold: true },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
        alignment: { horizontal: 'left' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };

    // Column widths
    const colWidths = [14, 14, 14, 10, 12, 12, 12, 12, 16, 20, 20, 14];
    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

    // Header row 1: Month label
    sheet.getCell(1, 1).value = month;
    Object.assign(sheet.getCell(1, 1), headerStyle);

    const headers = ['TARGET', 'SALES ACH', '', '80%-89%', '90%-100%', '100%-104%', '106% Above',
                     'QTR INCENTIVE', 'COLLECTION INCENTIVE', 'ACTIVE CALL INCENTIVE', 'TOTAL'];
    headers.forEach((h, i) => {
        const cell = sheet.getCell(1, i + 2);
        cell.value = h;
        Object.assign(cell, headerStyle);
    });
    sheet.getRow(1).height = 30;

    // Data rows — one per salesperson
    salespeople.forEach((person, idx) => {
        const rowNum = idx + 2;
        const target = parseFloat(person.target) || 0;
        const sales = parseFloat(person.sales) || 0;
        const achievement = target > 0 ? sales / target : 0;
        const comm = parseFloat(person.commission) || 0;
        const qtr = parseFloat(person.quarterlyBonus) || 0;
        const coll = parseFloat(person.collectionIncentive) || 0;
        const call = parseFloat(person.activeCallIncentive) || 0;
        const total = comm + qtr + coll + call;

        // Commission breakdown by tier
        let c80 = '', c90 = '', c100 = '', c106 = '';
        if (achievement >= 0.8 && achievement < 0.9)  c80  = sales * 0.006;
        if (achievement >= 0.9 && achievement < 1.0)  c90  = sales * 0.007;
        if (achievement >= 1.0 && achievement < 1.06) c100 = sales * 0.008;
        if (achievement >= 1.06)                       c106 = sales * 0.01;

        const row = [
            { v: person.name, s: nameStyle },
            { v: target,      s: dataStyle },
            { v: sales,       s: dataStyle },
            { v: achievement > 0 ? achievement : '', s: pctStyle },
            { v: c80,         s: dataStyle },
            { v: c90,         s: dataStyle },
            { v: c100,        s: dataStyle },
            { v: c106,        s: dataStyle },
            { v: qtr,         s: dataStyle },
            { v: coll,        s: dataStyle },
            { v: call,        s: dataStyle },
            { v: total,       s: totalStyle },
        ];
        row.forEach((r, ci) => {
            const cell = sheet.getCell(rowNum, ci + 1);
            cell.value = r.v;
            Object.assign(cell, r.s);
        });
    });

    // ---- Reference tables ----
    const startRow = salespeople.length + 4;

    // Commission Rate Summary
    sheet.getCell(startRow, 1).value = 'Sale Achievement';
    Object.assign(sheet.getCell(startRow, 1), rateHeaderStyle);
    sheet.getCell(startRow, 2).value = 'Commission Rate Summary';
    Object.assign(sheet.getCell(startRow, 2), rateHeaderStyle);

    const commRates = config.monthly_commission_rates || [
        { label: '0%-79%',    rate: 0 },
        { label: '80%-89%',   rate: 0.006 },
        { label: '90%-99%',   rate: 0.007 },
        { label: '100%-105%', rate: 0.008 },
        { label: '106% & Above', rate: 0.01 },
    ];
    commRates.forEach((r, i) => {
        const rn = startRow + 1 + i;
        sheet.getCell(rn, 1).value = r.label;
        sheet.getCell(rn, 1).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        sheet.getCell(rn, 2).value = r.rate === 0 ? 'None' : (r.rate * 100).toFixed(2) + '%';
        sheet.getCell(rn, 2).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });

    // Quarterly Incentive
    const qtrRow = startRow + commRates.length + 2;
    sheet.getCell(qtrRow, 1).value = 'Sale Achievement';
    Object.assign(sheet.getCell(qtrRow, 1), rateHeaderStyle);
    sheet.getCell(qtrRow, 2).value = 'Quarter Incentive';
    Object.assign(sheet.getCell(qtrRow, 2), rateHeaderStyle);

    const qtrRates = config.quarterly_incentive || [
        { label: '90%-99%', incentive: 200 },
        { label: '100%',    incentive: 400 },
    ];
    qtrRates.filter(r => r.incentive > 0).forEach((r, i) => {
        const rn = qtrRow + 1 + i;
        sheet.getCell(rn, 1).value = r.label;
        sheet.getCell(rn, 1).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        sheet.getCell(rn, 2).value = 'RM' + parseFloat(r.incentive).toFixed(2);
        sheet.getCell(rn, 2).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });

    // Active Call Incentive
    const callRow = qtrRow + qtrRates.filter(r => r.incentive > 0).length + 2;
    sheet.getCell(callRow, 1).value = 'Active Outlet';
    Object.assign(sheet.getCell(callRow, 1), rateHeaderStyle);
    sheet.getCell(callRow, 2).value = 'Minimum RM100.00 Buy';
    Object.assign(sheet.getCell(callRow, 2), rateHeaderStyle);

    const callRates = config.active_call_incentive || [
        { label: '65%', incentive: 50 },
        { label: '70%', incentive: 200 },
        { label: '80%', incentive: 350 },
    ];
    callRates.filter(r => r.incentive > 0).forEach((r, i) => {
        const rn = callRow + 1 + i;
        sheet.getCell(rn, 1).value = r.label;
        sheet.getCell(rn, 1).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
        sheet.getCell(rn, 2).value = 'RM' + parseFloat(r.incentive).toFixed(2);
        sheet.getCell(rn, 2).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
    });
}
