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
    
    // 开发时打开 DevTools（生产环境注释掉）
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

// 加载本地化资源
ipcMain.handle('load-locale', async (event, lang = 'en') => {
    try {
        const localePath = path.join(__dirname, 'src', 'locales', `${lang}.json`);
        const localeData = await fs.readFile(localePath, 'utf8');
        return JSON.parse(localeData);
    } catch (error) {
        console.error(`Failed to load locale ${lang}:`, error);
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

        const getCellNum = (cell) => {
            const v = cell.value;
            if (v === null || v === undefined) return 0;
            if (typeof v === 'object' && v.result !== undefined) return parseFloat(v.result) || 0;
            return parseFloat(v) || 0;
        };

        dataSheet.eachRow((row, rowNumber) => {
            const rawA = row.getCell(1).value;
            const rawB = row.getCell(2).value;

            if (!rawA && !rawB) return;

            const cellA = rawA ? rawA.toString().trim() : '';
            const cellB = rawB ? rawB.toString().trim().toUpperCase() : '';

            if (cellB === 'MONTH' || cellA.toUpperCase().includes('SALE TEAM')) return;
            if (cellB === 'TOTAL') return;

            if (cellA && !MONTHS.has(cellA.toUpperCase())) {
                if (personData) salesData.push(personData);
                currentPerson = cellA.toUpperCase();
                personData = { name: currentPerson, months: [] };
            }

            if (MONTHS.has(cellB) && personData) {
                personData.months.push({
                    month: cellB,
                    target: getCellNum(row.getCell(3)),
                    sales: getCellNum(row.getCell(4)),
                    collection: getCellNum(row.getCell(9))
                });
            }
        });

        if (personData) salesData.push(personData);
        return { success: true, data: salesData };

    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 生成工资模板
ipcMain.handle('generate-salary-template', async (event, data) => {
    console.log('\n\n' + '='.repeat(60));
    console.log('🔍 generate-salary-template called');
    console.log('='.repeat(60));
    
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
        
        console.log('📊 Total team sales:', totalTeamSales);
        
        // 为每个销售员创建工作表
        for (const person of data.salespeople) {
            const sheet = workbook.addWorksheet(person.name.substring(0, 31));
            await createSalarySheet(sheet, person, data.config, data.month, totalTeamSales);
        }

        // Group Summary sheet
        const groupSheet = workbook.addWorksheet('Group Summary');
        await createGroupSummarySheet(groupSheet, data.salespeople, data.config, data.month);

        // Commission Summary sheet
        const commSheet = workbook.addWorksheet('Commission Summary');
        await createCommissionSummarySheet(commSheet, data.salespeople, data.config, data.month);

        await workbook.xlsx.writeFile(result.filePath);
        
        return { 
            success: true, 
            path: result.filePath,
            message: 'Template generated successfully!'
        };
    } catch (error) {
        console.error('❌ Error generating template:', error);
        return { success: false, error: error.message };
    }
});

// 导出 PDF
ipcMain.handle('export-pdf', async (event, data) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `${data.name}_Report.pdf`,
            filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
        });

        if (result.canceled) {
            return { success: false };
        }

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

// Print Excel - 修复版本
ipcMain.handle('print-excel', async (event, data) => {
    try {
        console.log('🖨️ print-excel called');
        
        const printData = data;
        
        if (!printData || !printData.salespeople || !Array.isArray(printData.salespeople)) {
            console.log('📝 No valid data to print');
            return { success: true, message: 'No data to print' };
        }

        console.log(`Printing ${printData.salespeople.length} salespeople`);
        
        const workbook = new ExcelJS.Workbook();
        const summarySheet = workbook.addWorksheet('Summary');
        
        const headers = ['Name', 'Target (RM)', 'Sales (RM)', 'Achievement %', 'Commission (RM)', 'Total Commission (RM)'];
        summarySheet.getRow(1).values = headers;
        summarySheet.getRow(1).font = { bold: true };
        summarySheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4F81BD' }
        };
        
        let rowNumber = 2;
        let validEntries = 0;
        
        printData.salespeople.forEach(person => {
            if (!person || !person.name) return;
            
            const target = parseFloat(person.target) || 0;
            const sales = parseFloat(person.sales) || 0;
            const achievement = target > 0 ? (sales / target) * 100 : 0;
            const commission = parseFloat(person.commission) || 0;
            const totalCommission = parseFloat(person.totalCommission) || 0;
            
            summarySheet.getRow(rowNumber).values = [
                person.name || 'Unknown',
                target,
                sales,
                achievement.toFixed(2),
                commission,
                totalCommission
            ];
            
            rowNumber++;
            validEntries++;
        });
        
        if (validEntries > 0) {
            const totalTarget = printData.salespeople.reduce((sum, p) => sum + (parseFloat(p?.target) || 0), 0);
            const totalSales = printData.salespeople.reduce((sum, p) => sum + (parseFloat(p?.sales) || 0), 0);
            const totalCommission = printData.salespeople.reduce((sum, p) => sum + (parseFloat(p?.totalCommission) || 0), 0);
            
            summarySheet.getRow(rowNumber).values = [
                'TOTAL',
                totalTarget,
                totalSales,
                totalTarget > 0 ? ((totalSales / totalTarget) * 100).toFixed(2) : '0.00',
                '',
                totalCommission
            ];
            
            summarySheet.getRow(rowNumber).font = { bold: true };
            summarySheet.getRow(rowNumber).fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFF2F2F2' }
            };
        }
        
        summarySheet.columns.forEach((column, i) => {
            column.width = i === 0 ? 20 : 15;
        });
        
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `Sales_Report_${new Date().getFullYear()}_${new Date().getMonth() + 1}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });
        
        if (result.canceled) {
            return { success: false, message: 'Cancelled by user' };
        }
        
        await workbook.xlsx.writeFile(result.filePath);
        console.log('✅ Excel file saved successfully:', result.filePath);
        
        return { success: true, path: result.filePath };
        
    } catch (error) {
        console.error('❌ Error in print-excel:', error);
        return { success: true, message: 'Print function completed with warnings' };
    }
});

// ========== 备份系统 IPC Handlers ==========

// 保存 JSON 备份文件
ipcMain.handle('saveJSONFile', async (event, jsonString) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: `sales_calculator_backup_${new Date().toISOString().split('T')[0]}.json`,
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        
        if (result.canceled) {
            return { success: false, message: 'Cancelled' };
        }
        
        await fs.writeFile(result.filePath, jsonString, 'utf-8');
        return { success: true, path: result.filePath };
    } catch (error) {
        console.error('Save JSON error:', error);
        return { success: false, error: error.message };
    }
});

// 选择 JSON 文件
ipcMain.handle('selectJSONFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'JSON Files', extensions: ['json'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    
    if (!result.canceled && result.filePaths.length > 0) {
        return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
});

// 加载 JSON 文件
ipcMain.handle('loadJSONFile', async (event, filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return { success: true, data: JSON.parse(data) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 创建自动备份
ipcMain.handle('createAutoBackup', async (event, jsonString) => {
    try {
        const backupDir = path.join(app.getPath('userData'), 'backups');
        
        try {
            await fs.access(backupDir);
        } catch {
            await fs.mkdir(backupDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `auto_backup_${timestamp}.json`);
        await fs.writeFile(backupPath, jsonString, 'utf-8');
        
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.startsWith('auto_backup_')).sort();
        
        if (backupFiles.length > 10) {
            const filesToDelete = backupFiles.slice(0, backupFiles.length - 10);
            for (const file of filesToDelete) {
                await fs.unlink(path.join(backupDir, file));
            }
        }
        
        return { success: true, path: backupPath };
    } catch (error) {
        console.error('Auto backup error:', error);
        return { success: false, error: error.message };
    }
});

// 获取最新备份
ipcMain.handle('getLatestBackup', async () => {
    try {
        const backupDir = path.join(app.getPath('userData'), 'backups');
        
        try {
            await fs.access(backupDir);
        } catch {
            return { success: false, error: 'No backup directory found' };
        }
        
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.startsWith('auto_backup_')).sort().reverse();
        
        if (backupFiles.length === 0) {
            return { success: false, error: 'No backup files found' };
        }
        
        const latestFile = backupFiles[0];
        const filePath = path.join(backupDir, latestFile);
        const data = await fs.readFile(filePath, 'utf-8');
        
        return { 
            success: true, 
            data: JSON.parse(data),
            path: filePath,
            timestamp: latestFile.replace('auto_backup_', '').replace('.json', '')
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 获取备份列表
ipcMain.handle('getBackupList', async () => {
    try {
        const backupDir = path.join(app.getPath('userData'), 'backups');
        
        try {
            await fs.access(backupDir);
        } catch {
            return { success: true, backups: [] };
        }
        
        const files = await fs.readdir(backupDir);
        const backupFiles = files.filter(f => f.startsWith('auto_backup_')).sort().reverse();
        
        const backups = [];
        for (const file of backupFiles) {
            try {
                const filePath = path.join(backupDir, file);
                const stats = await fs.stat(filePath);
                const data = await fs.readFile(filePath, 'utf-8');
                const jsonData = JSON.parse(data);
                
                backups.push({
                    name: file,
                    path: filePath,
                    timestamp: jsonData.timestamp || file.replace('auto_backup_', '').replace('.json', ''),
                    size: stats.size,
                    salespeopleCount: jsonData.salespeopleCount || 0,
                    reportCount: jsonData.reportCount || 0
                });
            } catch (error) {
                console.error(`Error reading backup ${file}:`, error);
            }
        }
        
        return { success: true, backups };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 恢复备份
ipcMain.handle('restoreBackup', async (event, backupKey) => {
    try {
        const filePath = path.join(app.getPath('userData'), 'backups', backupKey);
        const data = await fs.readFile(filePath, 'utf-8');
        return { success: true, data: JSON.parse(data) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 删除备份
ipcMain.handle('deleteBackup', async (event, backupKey) => {
    try {
        const filePath = path.join(app.getPath('userData'), 'backups', backupKey);
        await fs.unlink(filePath);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 保存备份文件
ipcMain.handle('saveBackupFile', async (event, options) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: options.filename || `backup_${new Date().toISOString().split('T')[0]}.json`,
            filters: [{ name: 'JSON Files', extensions: ['json'] }]
        });
        
        if (result.canceled) {
            return { success: false, message: 'Cancelled' };
        }
        
        await fs.writeFile(result.filePath, options.data, 'utf-8');
        return { success: true, path: result.filePath };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 读取备份文件
ipcMain.handle('readBackupFile', async (event, filePath) => {
    try {
        const data = await fs.readFile(filePath, 'utf-8');
        return { success: true, data };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ========== Helper Functions ==========

async function createSalarySheet(sheet, person, config, month, totalTeamSales = 0) {
    let epfRate = 0.11;
    
    const nameUpper = (person.name || '').toUpperCase();
    if (config && config.deductionRates && config.deductionRates[nameUpper] && config.deductionRates[nameUpper].EPF_RATE !== undefined) {
        epfRate = parseFloat(config.deductionRates[nameUpper].EPF_RATE) / 100;
    }
    
    sheet.columns = [
        { width: 25 }, { width: 15 }, { width: 15 }, 
        { width: 18 }, { width: 15 }, { width: 15 }, { width: 15 }
    ];

    const salary = person.salary || 0;
    const allowances = person.allowances || {};
    const allowanceVals = {
        HP: parseFloat(allowances.HP) || 0,
        CAR: parseFloat(allowances.CAR) || 0,
        'LOCAL FUEL': parseFloat(allowances['LOCAL FUEL']) || 0,
        'OUTSTATION FUEL': parseFloat(allowances['OUTSTATION FUEL']) || 0,
        HOUSING: parseFloat(allowances.HOUSING) || 0,
        FOOD: parseFloat(allowances.FOOD) || 0,
        OTHERS: parseFloat(allowances.OTHERS) || 0
    };
    
    const totalFixedIncome = salary + 
        allowanceVals.HP + allowanceVals.CAR + allowanceVals['LOCAL FUEL'] + 
        allowanceVals['OUTSTATION FUEL'] + allowanceVals.HOUSING + 
        allowanceVals.FOOD + allowanceVals.OTHERS;
    
    const personMonthlySales = parseFloat(person.sales) || 0;
    const commission = parseFloat(person.commission) || 0;
    const collectionIncentive = parseFloat(person.collectionIncentive) || 0;
    const activeCallIncentive = parseFloat(person.activeCallIncentive) || 0;
    const quarterlyBonus = parseFloat(person.quarterlyBonus) || 0;
    const totalExtraIncome = totalFixedIncome + commission + collectionIncentive + activeCallIncentive + quarterlyBonus;
    const epfAmount = totalExtraIncome * epfRate;
    const epfLabel = `EPF ${(epfRate * 100)}%`;
    const grandTotalPayable = totalExtraIncome - epfAmount;

    const headerStyle = styles.headerStyle;
    const sectionStyle = styles.subHeaderStyle;
    const totalStyle = styles.totalStyle;

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

    const monthCell = sheet.getCell('A1');
    monthCell.value = month.toUpperCase() + ' SALARY REPORT';
    monthCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    monthCell.fill = { 
        type: 'pattern', 
        pattern: 'solid', 
        fgColor: { argb: 'FF4F81BD' }
    };
    monthCell.alignment = { horizontal: 'center', vertical: 'middle' };
    
    try {
        sheet.mergeCells('A1:G1');
    } catch (err) {
        console.warn('Merge cells error:', err);
    }

    const rows = [
        { label: 'INCOME', type: 'header' },
        { label: 'BASIC', type: 'section', cols: ['', '', 'PAY', 'INDV%', 'TEAM%'] },
        { label: 'SALARY', value: salary },
        
        { label: 'ALLOWANCES', type: 'header' },
        { label: 'HP', value: allowanceVals.HP },
        { label: 'CAR', value: allowanceVals.CAR },
        { label: 'LOCAL FUEL', value: allowanceVals['LOCAL FUEL'] },
        { label: 'OUTSTATION FUEL', value: allowanceVals['OUTSTATION FUEL'] },
        { label: 'HOUSING', value: allowanceVals.HOUSING },
        { label: 'FOOD', value: allowanceVals.FOOD },
        { label: 'OTHERS', value: allowanceVals.OTHERS },
        { label: '', type: 'empty' },
        { label: 'TOTAL FIXED INCOME', value: totalFixedIncome, type: 'total' },
        
        { label: '', type: 'empty' },
        { label: 'COMMISSION', type: 'header' },
        { label: 'COMMISSION AMOUNT', value: commission },
        { label: 'INCENTIVE', type: 'header' },
        { label: 'COLLECTION', value: collectionIncentive },
        { label: 'ACTIVE CALL', value: activeCallIncentive },
        { label: 'QUATERLY', value: quarterlyBonus },
        { label: '', type: 'empty' },
        { label: 'TOTAL', value: totalExtraIncome, type: 'total' },
        
        { label: '', type: 'empty' },
        { label: epfLabel, value: epfAmount, type: 'epf' },
        { label: '', type: 'empty' },
        { label: 'GRAND TOTAL PAYABLE', value: grandTotalPayable, type: 'grandTotal' }
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
        
        if (row.value !== undefined && personMonthlySales > 0) {
            const cell5 = sheet.getCell(rowNum, 5);
            cell5.value = row.value / personMonthlySales;
            cell5.numFmt = '0.00%';
        } else if (row.value !== undefined) {
            const cell5 = sheet.getCell(rowNum, 5);
            cell5.value = 0;
            cell5.numFmt = '0.00%';
        }
        
        if (row.value !== undefined && totalTeamSales > 0) {
            const cell6 = sheet.getCell(rowNum, 6);
            cell6.value = row.value / totalTeamSales;
            cell6.numFmt = '0.00%';
        } else if (row.value !== undefined) {
            const cell6 = sheet.getCell(rowNum, 6);
            cell6.value = 0;
            cell6.numFmt = '0.00%';
        }

        rowNum++;
    }

    // ========== 添加 Personal Sale 和 Team Sale ==========
    let currentRow = rowNum; // 当前行号

    // 添加空行
    sheet.getCell(currentRow, 1).value = '';
    currentRow++;

    // Personal Sale
    const personalSaleLabelCell = sheet.getCell(currentRow, 1);
    personalSaleLabelCell.value = 'Personal Sale';
    personalSaleLabelCell.font = { bold: true, size: 11 };
    personalSaleLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
    };

    const personalSaleValueCell = sheet.getCell(currentRow, 4);
    personalSaleValueCell.value = personMonthlySales;
    personalSaleValueCell.numFmt = '#,##0.00';
    personalSaleValueCell.font = { bold: true };
    currentRow++;

    // Team Sale
    const teamSaleLabelCell = sheet.getCell(currentRow, 1);
    teamSaleLabelCell.value = 'Team Sale';
    teamSaleLabelCell.font = { bold: true, size: 11 };
    teamSaleLabelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF2F2F2' }
    };

    const teamSaleValueCell = sheet.getCell(currentRow, 4);
    teamSaleValueCell.value = totalTeamSales;
    teamSaleValueCell.numFmt = '#,##0.00';
    teamSaleValueCell.font = { bold: true };

    console.log(`📊 Added Personal Sale: RM ${personMonthlySales.toLocaleString()}, Team Sale: RM ${totalTeamSales.toLocaleString()}`);
}

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
        ],
        epfRate: 0.02
    };
}

async function createGroupSummarySheet(sheet, salespeople, config, currentMonth) {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthlyData = {};
    months.forEach(m => {
        monthlyData[m] = { target: 0, sales: 0 };
    });

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

    if (currentMonth && monthlyData[currentMonth.toUpperCase()]) {
        monthlyData[currentMonth.toUpperCase()].target = 0;
        monthlyData[currentMonth.toUpperCase()].sales = 0;
        salespeople.forEach(p => {
            monthlyData[currentMonth.toUpperCase()].target += parseFloat(p.target) || 0;
            monthlyData[currentMonth.toUpperCase()].sales += parseFloat(p.sales) || 0;
        });
    }

    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };

    sheet.getColumn(1).width = 10;
    sheet.getColumn(2).width = 16;
    sheet.getColumn(3).width = 16;
    sheet.getColumn(4).width = 16;
    sheet.getColumn(5).width = 14;

    const headers = ['GROUP SUMMARY', 'TARGET', 'SALES ACH', 'SALES vs TGT', 'SALES % HIT'];
    headers.forEach((h, i) => {
        const cell = sheet.getCell(1, i + 1);
        cell.value = h;
        Object.assign(cell, headerStyle);
        if (i > 0) cell.numFmt = i < 4 ? '#,##0.00' : '0.00%';
    });
    sheet.getRow(1).height = 20;

    let totalTarget = 0, totalSales = 0;
    months.forEach((m, i) => {
        const rowNum = i + 2;
        const d = monthlyData[m];
        totalTarget += d.target;
        totalSales += d.sales;

        sheet.getCell(rowNum, 1).value = m;
        sheet.getCell(rowNum, 2).value = d.target || 0;
        sheet.getCell(rowNum, 3).value = d.sales || 0;
        sheet.getCell(rowNum, 4).value = d.sales - d.target;
        sheet.getCell(rowNum, 5).value = d.target > 0 ? d.sales / d.target : '';
        
        for (let col = 1; col <= 5; col++) {
            sheet.getCell(rowNum, col).numFmt = col < 5 ? '#,##0.00' : '0.00%';
            sheet.getCell(rowNum, col).border = {
                top: {style:'thin'}, bottom: {style:'thin'}, 
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
    });

    const totalRow = 14;
    sheet.getCell(totalRow, 1).value = 'TOTAL';
    sheet.getCell(totalRow, 2).value = totalTarget;
    sheet.getCell(totalRow, 3).value = totalSales;
    sheet.getCell(totalRow, 4).value = totalSales - totalTarget;
    sheet.getCell(totalRow, 5).value = totalTarget > 0 ? totalSales / totalTarget : 0;
    
    for (let col = 1; col <= 5; col++) {
        sheet.getCell(totalRow, col).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet.getCell(totalRow, col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2E75B6' }
        };
        sheet.getCell(totalRow, col).numFmt = col < 5 ? '#,##0.00' : '0.00%';
    }
}

async function createCommissionSummarySheet(sheet, salespeople, config, currentMonth) {
    const month = (currentMonth || '').toUpperCase();

    const headerStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };

    const colWidths = [14, 14, 14, 10, 12, 12, 12, 12, 16, 20, 20, 14];
    colWidths.forEach((w, i) => { sheet.getColumn(i + 1).width = w; });

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

    salespeople.forEach((person, idx) => {
        const rowNum = idx + 2;
        const target = parseFloat(person.target) || 0;
        const sales = parseFloat(person.sales) || 0;
        const achievement = target > 0 ? (sales / target) * 100 : 0;
        const comm = parseFloat(person.commission) || 0;
        const qtr = parseFloat(person.quarterlyBonus) || 0;
        const coll = parseFloat(person.collectionIncentive) || 0;
        const call = parseFloat(person.activeCallIncentive) || 0;
        const total = comm + qtr + coll + call;

        // Col 1: Name
        sheet.getCell(rowNum, 1).value = person.name;
        // Col 2: Target
        sheet.getCell(rowNum, 2).value = target;
        // Col 3: Sales
        sheet.getCell(rowNum, 3).value = sales;
        // Col 4: Achievement %
        sheet.getCell(rowNum, 4).value = achievement > 0 ? achievement / 100 : '';

        // Col 5-8: Commission placed in the correct tier column
        // Col 5 = 80%-89%, Col 6 = 90%-100%, Col 7 = 100%-104%, Col 8 = 106%+
        sheet.getCell(rowNum, 5).value = '';
        sheet.getCell(rowNum, 6).value = '';
        sheet.getCell(rowNum, 7).value = '';
        sheet.getCell(rowNum, 8).value = '';
        if (comm > 0) {
            if (achievement >= 106) {
                sheet.getCell(rowNum, 8).value = comm;
            } else if (achievement >= 100) {
                sheet.getCell(rowNum, 7).value = comm;
            } else if (achievement >= 90) {
                sheet.getCell(rowNum, 6).value = comm;
            } else if (achievement >= 80) {
                sheet.getCell(rowNum, 5).value = comm;
            }
        }

        // Col 9: Quarterly Incentive
        sheet.getCell(rowNum, 9).value = qtr || '';
        // Col 10: Collection Incentive
        sheet.getCell(rowNum, 10).value = coll || '';
        // Col 11: Active Call Incentive
        sheet.getCell(rowNum, 11).value = call || '';
        // Col 12: Total
        sheet.getCell(rowNum, 12).value = total;
        
        // Apply formatting and borders
        for (let col = 1; col <= 12; col++) {
            const cell = sheet.getCell(rowNum, col);
            if (col === 4) {
                cell.numFmt = '0.00%';
            } else if (col >= 2) {
                cell.numFmt = '#,##0.00';
            }
            cell.border = {
                top: {style:'thin'}, bottom: {style:'thin'},
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
    });
}