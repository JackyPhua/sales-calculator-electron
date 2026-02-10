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
        
        // 读取 Data Sheet
        const dataSheet = workbook.getWorksheet('Data Sheet');
        if (!dataSheet) {
            return { success: false, error: 'Data Sheet not found' };
        }
        
        const salesData = [];
        let currentPerson = null;
        let personData = null;
        
        // 解析数据
        dataSheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // 跳过空行
            if (rowNumber === 2) return; // 跳过表头
            
            const saleName = row.getCell(1).value;
            const month = row.getCell(2).value;
            const target = parseFloat(row.getCell(3).value) || 0;
            const sales = parseFloat(row.getCell(4).value) || 0;
            const collection = parseFloat(row.getCell(9).value) || 0;
            
            // 新的销售员
            if (saleName && saleName !== currentPerson) {
                if (personData) {
                    salesData.push(personData);
                }
                
                currentPerson = saleName;
                personData = {
                    name: saleName.toUpperCase(),
                    months: []
                };
            }
            
            // 添加月度数据
            if (month && personData) {
                personData.months.push({
                    month: month.toString().toUpperCase(),
                    target: target,
                    sales: sales,
                    collection: collection
                });
            }
        });
        
        // 添加最后一个人
        if (personData) {
            salesData.push(personData);
        }
        
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
            defaultPath: `Salary_Template_${new Date().toISOString().split('T')[0]}.xlsx`,
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
    
    // 临时测试：硬编码 11% 来验证计算
    const TEST_EPF_RATE = 0.11; // 11%
    console.log('\n🔧 临时测试: 使用硬编码 EPF 费率', TEST_EPF_RATE, `(${TEST_EPF_RATE * 100}%)`);
    epfRate = TEST_EPF_RATE; // 临时使用硬编码值
    epfSource = `硬编码测试值 ${TEST_EPF_RATE * 100}%`;
    
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
    
    // D23: TOTAL = D17 + D19 + D20 + D21
    const totalExtraIncome = commission + collectionIncentive + activeCallIncentive + quarterlyBonus;
    
    // D25: EPF = (D14 + D23) × EPF费率
    const totalBeforeEPF = totalFixedIncome + totalExtraIncome;
    const epfAmount = totalBeforeEPF * epfRate;
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
    console.log('- 计算基数 (D14+D23):', totalBeforeEPF);
    console.log('- D25 (EPF):', epfAmount, `(费率: ${epfRate * 100}%) = ${totalBeforeEPF} × ${epfRate}`);
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