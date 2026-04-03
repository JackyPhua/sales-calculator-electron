const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const ExcelJS = require('exceljs');
const fs = require('fs').promises;
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');

// ── Auto-updater setup ────────────────────────────────────────────────────
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
    autoUpdater.on('update-available', (info) => {
        console.log('🔄 Update available:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-status', {
                status: 'available',
                version: info.version,
                message: 'New version ' + info.version + ' is downloading...'
            });
        }
    });

    autoUpdater.on('update-not-available', () => {
        console.log('✅ App is up to date');
    });

    autoUpdater.on('download-progress', (progress) => {
        console.log('⬇️ Download:', Math.round(progress.percent) + '%');
        if (mainWindow) {
            mainWindow.webContents.send('update-status', {
                status: 'downloading',
                percent: Math.round(progress.percent),
                message: 'Downloading update... ' + Math.round(progress.percent) + '%'
            });
        }
    });

    autoUpdater.on('update-downloaded', (info) => {
        console.log('✅ Update downloaded:', info.version);
        if (mainWindow) {
            mainWindow.webContents.send('update-status', {
                status: 'downloaded',
                version: info.version,
                message: 'Update ready! Restart to install v' + info.version
            });
        }
        // Show dialog to user
        dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: 'CommissionPro v' + info.version + ' has been downloaded.',
            detail: 'The update will be installed when you restart the app. Restart now?',
            buttons: ['Restart Now', 'Later'],
            defaultId: 0
        }).then(result => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('❌ Auto-update error:', err.message);
    });

    // Check for updates (silently, don't bother user if no update)
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
        console.log('Update check skipped:', err.message);
    });
}

// IPC: manual check for updates
ipcMain.handle('check-for-updates', async () => {
    try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, version: result?.updateInfo?.version || null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: install update now
ipcMain.handle('install-update', () => {
    autoUpdater.quitAndInstall(false, true);
});

// ── SQLite DB setup ──────────────────────────────────────────────────────────
let db = null;
function initDB() {
    try {
        const Database = require('better-sqlite3');
        const dbPath = path.join(app.getPath('userData'), 'commission_pro.db');
        db = new Database(dbPath);
        db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER DEFAULT (strftime('%s','now'))
        )`);
        console.log('✅ SQLite DB ready:', dbPath);
    } catch (e) {
        console.error('❌ SQLite init failed:', e.message);
        db = null;
    }
}
const excelStyles = require('./src/excelStyles');
const { styles } = excelStyles;

let mainWindow;

// ══════════════════════════════════════════════════════
// License System
// ══════════════════════════════════════════════════════
const LICENSE_SECRET = 'CP2026-xK9mQ4vR7nB2pL5w'; // Change this to your own secret
const LICENSE_FILE = 'license.json';
const TRIAL_DAYS = 7;
const TRIAL_MAX_EXPORTS = 10;

function getLicensePath() {
    return path.join(app.getPath('userData'), LICENSE_FILE);
}

function generateKeySignature(keyBody) {
    return crypto.createHmac('sha256', LICENSE_SECRET)
        .update(keyBody)
        .digest('hex')
        .substring(0, 8)
        .toUpperCase();
}

function validateLicenseKey(key) {
    // Format: CPRO-XXXX-XXXX-XXXX-XXXX
    if (!key || typeof key !== 'string') return { valid: false, reason: 'No key provided' };

    const cleaned = key.trim().toUpperCase();
    const parts = cleaned.split('-');
    if (parts.length !== 5 || parts[0] !== 'CPRO') {
        return { valid: false, reason: 'Invalid key format' };
    }

    // The last segment is a checksum of the first 4 segments (first 4 chars)
    const keyBody = parts.slice(0, 4).join('-');
    const expectedCheck = generateKeySignature(keyBody).substring(0, 4);
    const actualCheck = parts[4];

    if (actualCheck !== expectedCheck) {
        return { valid: false, reason: 'Invalid license key' };
    }

    return { valid: true, key: cleaned };
}

async function loadLicenseData() {
    try {
        const data = await fs.readFile(getLicensePath(), 'utf-8');
        return JSON.parse(data);
    } catch {
        return null;
    }
}

async function saveLicenseData(data) {
    await fs.writeFile(getLicensePath(), JSON.stringify(data, null, 2));
}

async function getLicenseStatus() {
    let data = await loadLicenseData();

    // First ever launch — start trial
    if (!data) {
        data = {
            type: 'trial',
            trialStart: new Date().toISOString(),
            exportCount: 0,
            activatedKey: null
        };
        await saveLicenseData(data);
    }

    // Ensure exportCount exists (for older license files)
    if (data.exportCount === undefined) {
        data.exportCount = 0;
        await saveLicenseData(data);
    }

    // Already activated with a valid key
    if (data.type === 'pro' && data.activatedKey) {
        return {
            status: 'pro',
            key: data.activatedKey,
            exportCount: data.exportCount,
            message: 'Pro License activated'
        };
    }

    // Trial — check remaining days
    const trialStart = new Date(data.trialStart);
    const now = new Date();
    const daysPassed = Math.floor((now - trialStart) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysPassed);
    const exportsRemaining = Math.max(0, TRIAL_MAX_EXPORTS - (data.exportCount || 0));

    // Expired if either limit reached
    if (daysRemaining <= 0 || exportsRemaining <= 0) {
        const reason = daysRemaining <= 0 ? 'Trial period expired' : 'Export limit reached (10/10)';
        return {
            status: 'expired',
            daysRemaining: daysRemaining,
            exportsRemaining: 0,
            exportCount: data.exportCount || 0,
            message: `${reason}. Please activate a Pro license.`
        };
    }

    return {
        status: 'trial',
        daysRemaining: daysRemaining,
        exportsRemaining: exportsRemaining,
        exportCount: data.exportCount || 0,
        trialStart: data.trialStart,
        message: `Trial: ${daysRemaining}d / ${exportsRemaining} exports left`
    };
}

async function incrementExportCount() {
    let data = await loadLicenseData();
    if (!data) return;
    if (data.type === 'pro') return; // Pro users unlimited
    data.exportCount = (data.exportCount || 0) + 1;
    await saveLicenseData(data);
    return data.exportCount;
}

async function activateLicense(key) {
    const validation = validateLicenseKey(key);
    if (!validation.valid) {
        return { success: false, error: validation.reason };
    }

    let data = await loadLicenseData();
    if (!data) {
        data = { trialStart: new Date().toISOString() };
    }

    data.type = 'pro';
    data.activatedKey = validation.key;
    data.activatedAt = new Date().toISOString();
    await saveLicenseData(data);

    return { success: true, status: 'pro', key: validation.key };
}

async function deactivateLicense() {
    let data = await loadLicenseData();
    if (data) {
        data.type = 'trial';
        data.activatedKey = null;
        data.activatedAt = null;
        await saveLicenseData(data);
    }
    return { success: true };
}

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
    initDB();
    // 确保配置文件存在
    const configPath = path.join(app.getPath('userData'), 'config.json');
    try {
        await fs.access(configPath);
        console.log('Config file exists:', configPath);
    } catch (error) {
        console.log('Creating default config file...');
        await fs.writeFile(configPath, JSON.stringify(getDefaultConfig(), null, 2));
    }
    createWindow();

    // Check for updates after app is ready
    setupAutoUpdater();
});


ipcMain.handle('open-excel-preview', async (event, data) => {
    try {
        const os = require('os');
        const tempPath = path.join(os.tmpdir(), 
            'CommissionPro_' + (data.month || 'Report') + '_' + Date.now() + '.xlsx');

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

        await workbook.xlsx.writeFile(tempPath);

        // Open with system Excel directly
        await shell.openPath(tempPath);

        return { success: true, path: tempPath };
    } catch (error) {
        console.error('open-excel-preview error:', error);
        return { success: false, error: error.message };
    }
});

// ── Projection Report Excel ──────────────────────────────────────────────
ipcMain.handle('export-projection-excel', async (event, data) => {
    try {
        const os = require('os');
        const tempPath = path.join(os.tmpdir(),
            'Projection_' + (data.personName || 'Report') + '_' + (data.month || '') + '_' + Date.now() + '.xlsx');

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Projection Report');

        // Column widths
        sheet.getColumn(1).width = 22;
        sheet.getColumn(2).width = 18;
        sheet.getColumn(3).width = 18;
        sheet.getColumn(4).width = 18;

        const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        const lightBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        const greenFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        const purpleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } };
        const thinBorder = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };
        const rmFmt = '#,##0.00';
        const pctFmt = '0.0%';

        let row = 1;

        // ── Title ──
        sheet.mergeCells(row, 1, row, 4);
        const titleCell = sheet.getCell(row, 1);
        titleCell.value = (data.personName || '') + ' — PROJECTION REPORT';
        titleCell.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = blueFill;
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        sheet.getRow(row).height = 32;
        row++;

        sheet.mergeCells(row, 1, row, 4);
        sheet.getCell(row, 1).value = (data.month || '') + ' ' + new Date().getFullYear();
        sheet.getCell(row, 1).font = { size: 11, color: { argb: 'FF64748B' } };
        sheet.getCell(row, 1).alignment = { horizontal: 'center' };
        row += 2;

        // ── Sales Summary ──
        const d = data.projData;
        const summaryItems = [
            ['Sale Target', d.target, rmFmt],
            ['Current Sales', d.sales, rmFmt],
            ['Achievement', d.achievement / 100, pctFmt],
            ['Commission Rate', d.commissionRate / 100, '0.00%'],
            ['Current Commission', d.commission, rmFmt]
        ];

        sheet.mergeCells(row, 1, row, 4);
        sheet.getCell(row, 1).value = 'SALES SUMMARY';
        sheet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        sheet.getCell(row, 1).alignment = { horizontal: 'center' };
        for (let c=1;c<=4;c++) sheet.getCell(row,c).border = thinBorder;
        row++;

        summaryItems.forEach(item => {
            sheet.getCell(row, 1).value = item[0];
            sheet.getCell(row, 1).font = { color: { argb: 'FF475569' } };
            sheet.getCell(row, 2).value = item[1];
            sheet.getCell(row, 2).font = { bold: true, color: item[0] === 'Commission Rate' ? { argb: 'FF2563EB' } : {} };
            sheet.getCell(row, 2).numFmt = item[2];
            sheet.getCell(row, 2).alignment = { horizontal: 'right' };
            for (let c=1;c<=2;c++) sheet.getCell(row,c).border = thinBorder;
            row++;
        });
        row++;

        // ── Sales Balance to Go ──
        if (d.saleMilestones && d.saleMilestones.length > 0) {
            sheet.mergeCells(row, 1, row, 4);
            sheet.getCell(row, 1).value = 'SALES — BALANCE TO GO & EXTRA COMMISSION';
            sheet.getCell(row, 1).font = { bold: true, size: 10, color: { argb: 'FF64748B' } };
            row++;

            // Headers
            ['Milestone', 'Balance to Go', 'Extra Commission'].forEach((h, i) => {
                sheet.getCell(row, i+1).value = h;
                sheet.getCell(row, i+1).font = { bold: true };
                sheet.getCell(row, i+1).fill = lightBlueFill;
                sheet.getCell(row, i+1).border = thinBorder;
            });
            row++;

            d.saleMilestones.forEach(ms => {
                sheet.getCell(row, 1).value = ms.label;
                sheet.getCell(row, 1).font = { bold: true };
                sheet.getCell(row, 2).value = ms.gap;
                sheet.getCell(row, 2).numFmt = rmFmt;
                sheet.getCell(row, 2).font = { color: { argb: 'FFDC2626' }, bold: true };
                sheet.getCell(row, 3).value = ms.extraComm;
                sheet.getCell(row, 3).numFmt = rmFmt;
                sheet.getCell(row, 3).font = { color: { argb: 'FF166534' }, bold: true };
                for (let c=1;c<=3;c++) sheet.getCell(row,c).border = thinBorder;
                row++;
            });

            if (d.saleMilestones.length === 0) {
                sheet.mergeCells(row, 1, row, 3);
                sheet.getCell(row, 1).value = '✓ All sales milestones achieved!';
                sheet.getCell(row, 1).font = { color: { argb: 'FF166534' }, bold: true };
                row++;
            }
            row++;
        }

        // ── Call Summary ──
        sheet.mergeCells(row, 1, row, 4);
        sheet.getCell(row, 1).value = 'ACTIVE CALL SUMMARY';
        sheet.getCell(row, 1).font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
        sheet.getCell(row, 1).alignment = { horizontal: 'center' };
        for (let c=1;c<=4;c++) sheet.getCell(row,c).border = thinBorder;
        row++;

        const callItems = [
            ['Call Target', d.callTarget, '0'],
            ['Actual Calls', d.callActual, '0'],
            ['Call Achievement', d.callAchievement / 100, pctFmt],
            ['Call Incentive', d.callIncentive, rmFmt],
            ['Call Progress', d.callProgress / 100, pctFmt]
        ];
        callItems.forEach(item => {
            sheet.getCell(row, 1).value = item[0];
            sheet.getCell(row, 1).font = { color: { argb: 'FF5B21B6' } };
            sheet.getCell(row, 2).value = item[1];
            sheet.getCell(row, 2).font = { bold: true, color: { argb: 'FF4C1D95' } };
            sheet.getCell(row, 2).numFmt = item[2];
            sheet.getCell(row, 2).alignment = { horizontal: 'right' };
            for (let c=1;c<=2;c++) sheet.getCell(row,c).border = thinBorder;
            row++;
        });
        row++;

        // ── Call Balance to Go ──
        if (d.callMilestones && d.callMilestones.length > 0) {
            sheet.mergeCells(row, 1, row, 4);
            sheet.getCell(row, 1).value = 'ACTIVE CALLS — BALANCE TO GO & EXTRA INCENTIVE';
            sheet.getCell(row, 1).font = { bold: true, size: 10, color: { argb: 'FF5B21B6' } };
            row++;

            ['Milestone', 'Balance (Calls)', 'Extra Incentive'].forEach((h, i) => {
                sheet.getCell(row, i+1).value = h;
                sheet.getCell(row, i+1).font = { bold: true };
                sheet.getCell(row, i+1).fill = purpleFill;
                sheet.getCell(row, i+1).border = thinBorder;
            });
            row++;

            d.callMilestones.forEach(ms => {
                sheet.getCell(row, 1).value = ms.label;
                sheet.getCell(row, 1).font = { bold: true };
                sheet.getCell(row, 2).value = ms.gap + ' calls';
                sheet.getCell(row, 2).font = { color: { argb: 'FF4C1D95' }, bold: true };
                sheet.getCell(row, 3).value = ms.extraInc;
                sheet.getCell(row, 3).numFmt = rmFmt;
                sheet.getCell(row, 3).font = { color: { argb: 'FF166534' }, bold: true };
                for (let c=1;c<=3;c++) sheet.getCell(row,c).border = thinBorder;
                row++;
            });
        }

        await workbook.xlsx.writeFile(tempPath);
        await shell.openPath(tempPath);
        return { success: true, path: tempPath };
    } catch (error) {
        console.error('export-projection-excel error:', error);
        return { success: false, error: error.message };
    }
});

// ── SQLite KV handlers ──────────────────────────────────────────────────────
ipcMain.handle('db-save', (event, key, value) => {
    try {
        if (!db) return { success: false, error: 'DB not initialized' };
        const json = typeof value === 'string' ? value : JSON.stringify(value);
        db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run(key, json);
        return { success: true, key, value };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('db-load', (event, key) => {
    try {
        if (!db) return null;
        const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get(key);
        if (!row) return null;
        try { return { success: true, key, value: JSON.parse(row.value) }; }
        catch { return { success: true, key, value: row.value }; }
    } catch (e) {
        return null;
    }
});

ipcMain.handle('db-delete', (event, key) => {
    try {
        if (!db) return { success: false };
        db.prepare('DELETE FROM kv_store WHERE key = ?').run(key);
        return { success: true, key };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('db-list', (event, prefix) => {
    try {
        if (!db) return { keys: [] };
        const rows = prefix
            ? db.prepare("SELECT key FROM kv_store WHERE key LIKE ?").all(prefix + '%')
            : db.prepare("SELECT key FROM kv_store").all();
        return { keys: rows.map(r => r.key) };
    } catch (e) {
        return { keys: [] };
    }
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

// ══════════════════════════════════════════════════════
// License IPC Handlers
// ══════════════════════════════════════════════════════
ipcMain.handle('license-get-status', async () => {
    return await getLicenseStatus();
});

ipcMain.handle('license-activate', async (event, key) => {
    return await activateLicense(key);
});

ipcMain.handle('license-deactivate', async () => {
    return await deactivateLicense();
});

ipcMain.handle('license-increment-export', async () => {
    return await incrementExportCount();
});

// ========== IPC Handlers ==========

// 加载配置
ipcMain.handle('load-config', async () => {
    try {
        // Try SQLite first
        if (db) {
            const row = db.prepare('SELECT value FROM kv_store WHERE key = ?').get('config');
            if (row) return JSON.parse(row.value);
        }
        // Fallback to JSON file (migration)
        const configPath = path.join(app.getPath('userData'), 'config.json');
        const data = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(data);
        // Migrate to DB
        if (db) {
            db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run('config', JSON.stringify(config));
            console.log('✅ Config migrated from JSON to DB');
        }
        return config;
    } catch (error) {
        return getDefaultConfig();
    }
});

// 保存配置
ipcMain.handle('save-config', async (event, config) => {
    try {
        if (db) {
            db.prepare('INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)').run('config', JSON.stringify(config));
            return { success: true };
        }
        // Fallback to JSON if DB not available
        const configPath = path.join(app.getPath('userData'), 'config.json');
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});;

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
                    collection: getCellNum(row.getCell(9)),
                    callTarget: getCellNum(row.getCell(11))
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
            defaultPath: data.suggestedFilename || `Commission_Report_${data.month || 'ALL'}_${new Date().getFullYear()}.xlsx`,
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

// ── Batch Summary Excel (all months combined in one file) ──
ipcMain.handle('generate-batch-summary', async (event, data) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            defaultPath: data.suggestedFilename || `Commission_Summary_${new Date().getFullYear()}.xlsx`,
            filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
        });

        if (result.canceled) {
            return { success: false, message: 'Cancelled' };
        }

        const workbook = new ExcelJS.Workbook();
        const monthsData = data.monthsData; // [{month, salespeople}, ...]

        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } },
            alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
            border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
        };
        const totalStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } },
            border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
        };
        const monthHeaderStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF365F91' } },
            alignment: { horizontal: 'center', vertical: 'middle' },
            border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
        };
        const dataBorder = { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} };

        // ── Sheet 1: Commission Summary (all months stacked) ──
        const summarySheet = workbook.addWorksheet('Commission Summary');
        const colWidths = [14, 14, 14, 10, 12, 12, 12, 12, 16, 20, 20, 14];
        colWidths.forEach((w, i) => { summarySheet.getColumn(i + 1).width = w; });

        const headers = ['TARGET', 'SALES ACH', '', '80%-89%', '90%-100%', '100%-104%', '106% Above',
                         'QTR INCENTIVE', 'COLLECTION INCENTIVE', 'ACTIVE CALL INCENTIVE', 'TOTAL'];

        let row = 1;
        let grandTarget = 0, grandSales = 0, grandComm = 0, grandQtr = 0, grandColl = 0, grandCall = 0, grandTotal = 0;

        monthsData.forEach(md => {
            const month = (md.month || '').toUpperCase();
            const people = md.salespeople || [];

            // Month header row
            summarySheet.mergeCells(row, 1, row, 12);
            summarySheet.getCell(row, 1).value = `── ${month} ──`;
            Object.assign(summarySheet.getCell(row, 1), monthHeaderStyle);
            summarySheet.getRow(row).height = 28;
            row++;

            // Column headers
            summarySheet.getCell(row, 1).value = month;
            Object.assign(summarySheet.getCell(row, 1), headerStyle);
            headers.forEach((h, i) => {
                const cell = summarySheet.getCell(row, i + 2);
                cell.value = h;
                Object.assign(cell, headerStyle);
            });
            summarySheet.getRow(row).height = 26;
            row++;

            let mTarget = 0, mSales = 0, mCol5 = 0, mCol6 = 0, mCol7 = 0, mCol8 = 0, mQtr = 0, mColl = 0, mCall = 0, mTotal = 0;

            people.forEach(person => {
                const target = parseFloat(person.target) || 0;
                const sales = parseFloat(person.sales) || 0;
                const achievement = target > 0 ? (sales / target) * 100 : 0;
                const comm = parseFloat(person.commission) || 0;
                const qtr = parseFloat(person.quarterlyBonus) || 0;
                const coll = parseFloat(person.collectionIncentive) || 0;
                const call = parseFloat(person.activeCallIncentive) || 0;
                const total = comm + qtr + coll + call;

                summarySheet.getCell(row, 1).value = person.name;
                summarySheet.getCell(row, 2).value = target;
                summarySheet.getCell(row, 3).value = sales;
                summarySheet.getCell(row, 4).value = achievement > 0 ? achievement / 100 : '';

                summarySheet.getCell(row, 5).value = '';
                summarySheet.getCell(row, 6).value = '';
                summarySheet.getCell(row, 7).value = '';
                summarySheet.getCell(row, 8).value = '';
                if (comm > 0) {
                    if (achievement >= 106) summarySheet.getCell(row, 8).value = comm;
                    else if (achievement >= 100) summarySheet.getCell(row, 7).value = comm;
                    else if (achievement >= 90) summarySheet.getCell(row, 6).value = comm;
                    else if (achievement >= 80) summarySheet.getCell(row, 5).value = comm;
                }
                summarySheet.getCell(row, 9).value = qtr || '';
                summarySheet.getCell(row, 10).value = coll || '';
                summarySheet.getCell(row, 11).value = call || '';
                summarySheet.getCell(row, 12).value = total;

                for (let col = 1; col <= 12; col++) {
                    const cell = summarySheet.getCell(row, col);
                    if (col === 4) cell.numFmt = '0.00%';
                    else if (col >= 2) cell.numFmt = '#,##0.00';
                    cell.border = dataBorder;
                }

                mTarget += target; mSales += sales;
                if (comm > 0) {
                    if (achievement >= 106) mCol8 += comm;
                    else if (achievement >= 100) mCol7 += comm;
                    else if (achievement >= 90) mCol6 += comm;
                    else if (achievement >= 80) mCol5 += comm;
                }
                mQtr += qtr; mColl += coll; mCall += call; mTotal += total;
                row++;
            });

            // Monthly total row
            summarySheet.getCell(row, 1).value = `${month} TOTAL`;
            summarySheet.getCell(row, 2).value = mTarget;
            summarySheet.getCell(row, 3).value = mSales;
            summarySheet.getCell(row, 4).value = mTarget > 0 ? mSales / mTarget : '';
            summarySheet.getCell(row, 5).value = mCol5 || '';
            summarySheet.getCell(row, 6).value = mCol6 || '';
            summarySheet.getCell(row, 7).value = mCol7 || '';
            summarySheet.getCell(row, 8).value = mCol8 || '';
            summarySheet.getCell(row, 9).value = mQtr || '';
            summarySheet.getCell(row, 10).value = mColl || '';
            summarySheet.getCell(row, 11).value = mCall || '';
            summarySheet.getCell(row, 12).value = mTotal;
            for (let col = 1; col <= 12; col++) {
                const cell = summarySheet.getCell(row, col);
                Object.assign(cell, totalStyle);
                if (col === 4) cell.numFmt = '0.00%';
                else if (col >= 2) cell.numFmt = '#,##0.00';
            }
            row++;

            grandTarget += mTarget; grandSales += mSales;
            grandComm += mCol5 + mCol6 + mCol7 + mCol8;
            grandQtr += mQtr; grandColl += mColl; grandCall += mCall; grandTotal += mTotal;

            // Blank row between months
            row++;
        });

        // ── GRAND TOTAL row ──
        const grandTotalStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B3A5C' } },
            border: { top: {style:'medium'}, bottom: {style:'medium'}, left: {style:'medium'}, right: {style:'medium'} }
        };
        summarySheet.getCell(row, 1).value = 'GRAND TOTAL';
        summarySheet.getCell(row, 2).value = grandTarget;
        summarySheet.getCell(row, 3).value = grandSales;
        summarySheet.getCell(row, 4).value = grandTarget > 0 ? grandSales / grandTarget : '';
        summarySheet.getCell(row, 12).value = grandTotal;
        for (let col = 1; col <= 12; col++) {
            const cell = summarySheet.getCell(row, col);
            Object.assign(cell, grandTotalStyle);
            if (col === 4) cell.numFmt = '0.00%';
            else if (col >= 2) cell.numFmt = '#,##0.00';
        }
        summarySheet.getRow(row).height = 30;

        // ── Sheet 2: Per-Person Summary (each person's totals across months) ──
        const personSheet = workbook.addWorksheet('Per-Person Summary');
        const months = monthsData.map(m => (m.month || '').toUpperCase());
        const personNames = [...new Set(monthsData.flatMap(m => (m.salespeople || []).map(p => p.name)))];

        // Per month: Target, Sales, Comm, Qtr, Coll, Call, Total = 7 cols
        // Grand Total: Target, Sales, Comm, Qtr, Coll, Call, Total = 7 cols
        // Then: Comm%, Team%
        const perMonthCols = 7;
        const subHeaders = ['Target', 'Sales', 'Comm', 'Qtr', 'Coll', 'Call', 'Total'];

        const pColWidths = [14];
        months.forEach(() => { pColWidths.push(12, 12, 12, 12, 12, 12, 14); });
        pColWidths.push(14, 14, 14, 14, 14, 14, 16); // Grand total
        pColWidths.push(14, 14); // % columns
        pColWidths.forEach((w, i) => { personSheet.getColumn(i + 1).width = w; });

        // Row 1: Month group headers
        let pCol = 2;
        months.forEach(m => {
            personSheet.mergeCells(1, pCol, 1, pCol + perMonthCols - 1);
            personSheet.getCell(1, pCol).value = m;
            Object.assign(personSheet.getCell(1, pCol), headerStyle);
            pCol += perMonthCols;
        });
        const grandStartCol = pCol;
        personSheet.mergeCells(1, pCol, 1, pCol + perMonthCols - 1);
        personSheet.getCell(1, pCol).value = 'GRAND TOTAL';
        Object.assign(personSheet.getCell(1, pCol), grandTotalStyle);
        const pctStartCol = pCol + perMonthCols;

        personSheet.getCell(1, pctStartCol).value = 'Comm %';
        Object.assign(personSheet.getCell(1, pctStartCol), headerStyle);
        personSheet.getCell(1, pctStartCol + 1).value = 'Team %';
        Object.assign(personSheet.getCell(1, pctStartCol + 1), headerStyle);

        personSheet.getCell(1, 1).value = 'Name';
        Object.assign(personSheet.getCell(1, 1), headerStyle);

        // Row 2: Sub-headers
        pCol = 2;
        months.forEach(() => {
            subHeaders.forEach((h, hi) => {
                personSheet.getCell(2, pCol + hi).value = h;
                Object.assign(personSheet.getCell(2, pCol + hi), headerStyle);
            });
            pCol += perMonthCols;
        });
        subHeaders.forEach((h, hi) => {
            personSheet.getCell(2, grandStartCol + hi).value = h;
            Object.assign(personSheet.getCell(2, grandStartCol + hi), grandTotalStyle);
        });
        personSheet.getCell(2, pctStartCol).value = 'of Sales';
        Object.assign(personSheet.getCell(2, pctStartCol), headerStyle);
        personSheet.getCell(2, pctStartCol + 1).value = 'of Team';
        Object.assign(personSheet.getCell(2, pctStartCol + 1), headerStyle);

        personSheet.getRow(1).height = 26;
        personSheet.getRow(2).height = 22;

        // Pre-calculate team totals across all months
        let teamTotalSales = 0, teamTotalComm = 0;
        monthsData.forEach(md => {
            (md.salespeople || []).forEach(p => {
                teamTotalSales += parseFloat(p.sales) || 0;
                teamTotalComm += (parseFloat(p.commission) || 0) + (parseFloat(p.quarterlyBonus) || 0) + (parseFloat(p.collectionIncentive) || 0) + (parseFloat(p.activeCallIncentive) || 0);
            });
        });

        // Accumulators for TOTAL row
        let allGTarget = 0, allGSales = 0, allGComm = 0, allGQtr = 0, allGColl = 0, allGCall = 0, allGTotal = 0;

        // Data rows
        personNames.forEach((name, pIdx) => {
            const pRow = pIdx + 3;
            personSheet.getCell(pRow, 1).value = name;
            personSheet.getCell(pRow, 1).border = dataBorder;
            let gTarget = 0, gSales = 0, gComm = 0, gQtr = 0, gColl = 0, gCall = 0, gTotal = 0;

            pCol = 2;
            months.forEach(m => {
                const md = monthsData.find(x => (x.month || '').toUpperCase() === m);
                const person = md ? (md.salespeople || []).find(p => p.name === name) : null;
                const target = person ? (parseFloat(person.target) || 0) : 0;
                const sales = person ? (parseFloat(person.sales) || 0) : 0;
                const comm = person ? (parseFloat(person.commission) || 0) : 0;
                const qtr = person ? (parseFloat(person.quarterlyBonus) || 0) : 0;
                const coll = person ? (parseFloat(person.collectionIncentive) || 0) : 0;
                const call = person ? (parseFloat(person.activeCallIncentive) || 0) : 0;
                const total = comm + qtr + coll + call;

                const vals = [target, sales, comm, qtr, coll, call, total];
                vals.forEach((v, vi) => {
                    personSheet.getCell(pRow, pCol + vi).value = v || '';
                    personSheet.getCell(pRow, pCol + vi).numFmt = '#,##0.00';
                    personSheet.getCell(pRow, pCol + vi).border = dataBorder;
                });

                gTarget += target; gSales += sales; gComm += comm;
                gQtr += qtr; gColl += coll; gCall += call; gTotal += total;
                pCol += perMonthCols;
            });

            // Grand total columns
            const gVals = [gTarget, gSales, gComm, gQtr, gColl, gCall, gTotal];
            gVals.forEach((v, vi) => {
                const cell = personSheet.getCell(pRow, grandStartCol + vi);
                cell.value = v;
                cell.numFmt = '#,##0.00';
                cell.font = { bold: true };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
                cell.border = dataBorder;
            });

            // Comm % of Sales (个人 total commission / 个人 total sales)
            const commPctOfSales = gSales > 0 ? gTotal / gSales : 0;
            const cellPctSales = personSheet.getCell(pRow, pctStartCol);
            cellPctSales.value = commPctOfSales;
            cellPctSales.numFmt = '0.00%';
            cellPctSales.border = dataBorder;
            cellPctSales.alignment = { horizontal: 'center' };

            // Team % (个人 total commission / team total sales)
            const commPctOfTeam = teamTotalSales > 0 ? gTotal / teamTotalSales : 0;
            const cellPctTeam = personSheet.getCell(pRow, pctStartCol + 1);
            cellPctTeam.value = commPctOfTeam;
            cellPctTeam.numFmt = '0.00%';
            cellPctTeam.border = dataBorder;
            cellPctTeam.alignment = { horizontal: 'center' };

            // Accumulate for TOTAL row
            allGTarget += gTarget; allGSales += gSales; allGComm += gComm;
            allGQtr += gQtr; allGColl += gColl; allGCall += gCall; allGTotal += gTotal;
        });

        // ── TOTAL row at bottom ──
        const tRow = personNames.length + 3;
        personSheet.getCell(tRow, 1).value = 'TOTAL';
        Object.assign(personSheet.getCell(tRow, 1), grandTotalStyle);

        // Grand total columns for TOTAL row
        const allGVals = [allGTarget, allGSales, allGComm, allGQtr, allGColl, allGCall, allGTotal];
        allGVals.forEach((v, vi) => {
            const cell = personSheet.getCell(tRow, grandStartCol + vi);
            cell.value = v;
            cell.numFmt = '#,##0.00';
            Object.assign(cell, grandTotalStyle);
        });

        // Total Comm % and Team %
        const tPctSales = allGSales > 0 ? allGTotal / allGSales : 0;
        const tCellPctSales = personSheet.getCell(tRow, pctStartCol);
        tCellPctSales.value = tPctSales;
        tCellPctSales.numFmt = '0.00%';
        Object.assign(tCellPctSales, grandTotalStyle);
        tCellPctSales.alignment = { horizontal: 'center' };

        const tCellPctTeam = personSheet.getCell(tRow, pctStartCol + 1);
        tCellPctTeam.value = allGSales > 0 ? allGTotal / allGSales : 0; // Team total comm / team total sales
        tCellPctTeam.numFmt = '0.00%';
        Object.assign(tCellPctTeam, grandTotalStyle);
        tCellPctTeam.alignment = { horizontal: 'center' };

        // Fill empty cols in TOTAL row with style
        for (let c = 2; c < grandStartCol; c++) {
            const cell = personSheet.getCell(tRow, c);
            if (!cell.value) cell.value = '';
            Object.assign(cell, grandTotalStyle);
            cell.numFmt = '#,##0.00';
        }
        personSheet.getRow(tRow).height = 26;

        await workbook.xlsx.writeFile(result.filePath);
        return { success: true, path: result.filePath };

    } catch (error) {
        console.error('❌ Batch summary error:', error);
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

    // ========== 第一部分：Commission Summary (从 A1 开始) ==========
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

        sheet.getCell(rowNum, 1).value = person.name;
        sheet.getCell(rowNum, 2).value = target;
        sheet.getCell(rowNum, 3).value = sales;
        sheet.getCell(rowNum, 4).value = achievement > 0 ? achievement / 100 : '';

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

        sheet.getCell(rowNum, 9).value = qtr || '';
        sheet.getCell(rowNum, 10).value = coll || '';
        sheet.getCell(rowNum, 11).value = call || '';
        sheet.getCell(rowNum, 12).value = total;
        
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

    // TOTAL Row
    const totalRowNum = salespeople.length + 2;
    let totTarget = 0, totSales = 0, totCol5 = 0, totCol6 = 0, totCol7 = 0, totCol8 = 0, totQtr = 0, totColl = 0, totCall = 0, totTotal = 0;

    salespeople.forEach(person => {
        const target = parseFloat(person.target) || 0;
        const sales = parseFloat(person.sales) || 0;
        const achievement = target > 0 ? (sales / target) * 100 : 0;
        const comm = parseFloat(person.commission) || 0;
        const qtr = parseFloat(person.quarterlyBonus) || 0;
        const coll = parseFloat(person.collectionIncentive) || 0;
        const call = parseFloat(person.activeCallIncentive) || 0;
        const total = comm + qtr + coll + call;

        totTarget += target;
        totSales += sales;
        if (comm > 0) {
            if (achievement >= 106) totCol8 += comm;
            else if (achievement >= 100) totCol7 += comm;
            else if (achievement >= 90) totCol6 += comm;
            else if (achievement >= 80) totCol5 += comm;
        }
        totQtr += qtr;
        totColl += coll;
        totCall += call;
        totTotal += total;
    });

    const totalStyle = {
        font: { bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } },
        border: { top: {style:'thin'}, bottom: {style:'thin'}, left: {style:'thin'}, right: {style:'thin'} }
    };

    sheet.getCell(totalRowNum, 1).value = 'TOTAL';
    sheet.getCell(totalRowNum, 2).value = totTarget;
    sheet.getCell(totalRowNum, 3).value = totSales;
    sheet.getCell(totalRowNum, 4).value = totTarget > 0 ? totSales / totTarget : '';
    sheet.getCell(totalRowNum, 5).value = totCol5 || '';
    sheet.getCell(totalRowNum, 6).value = totCol6 || '';
    sheet.getCell(totalRowNum, 7).value = totCol7 || '';
    sheet.getCell(totalRowNum, 8).value = totCol8 || '';
    sheet.getCell(totalRowNum, 9).value = totQtr || '';
    sheet.getCell(totalRowNum, 10).value = totColl || '';
    sheet.getCell(totalRowNum, 11).value = totCall || '';
    sheet.getCell(totalRowNum, 12).value = totTotal;

    for (let col = 1; col <= 12; col++) {
        const cell = sheet.getCell(totalRowNum, col);
        Object.assign(cell, totalStyle);
        if (col === 4) { cell.numFmt = '0.00%'; }
        else if (col >= 2) { cell.numFmt = '#,##0.00'; }
    }

    // ========== 第二部分：费率表格 (从 A18 开始) ==========
    const startRow = totalRowNum + 3; // 在TOTAL行下面空3行开始

    // 表格1: Commission Rate Summary
    let currentRow = startRow;
    
    // 标题
    sheet.mergeCells(currentRow, 1, currentRow, 2);
    const title1Cell = sheet.getCell(currentRow, 1);
    title1Cell.value = 'COMMISSION RATE SUMMARY';
    title1Cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    title1Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    title1Cell.alignment = { horizontal: 'center', vertical: 'middle' };
    title1Cell.border = {
        top: {style:'thin'}, bottom: {style:'thin'},
        left: {style:'thin'}, right: {style:'thin'}
    };
    sheet.getRow(currentRow).height = 25;
    currentRow++;

    // 表头
    sheet.getCell(currentRow, 1).value = 'Sale Achievement';
    sheet.getCell(currentRow, 2).value = 'Commission Rate Summary';
    sheet.getCell(currentRow, 1).font = { bold: true };
    sheet.getCell(currentRow, 2).font = { bold: true };
    sheet.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    sheet.getCell(currentRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    
    for (let col = 1; col <= 2; col++) {
        sheet.getCell(currentRow, col).border = {
            top: {style:'thin'}, bottom: {style:'thin'},
            left: {style:'thin'}, right: {style:'thin'}
        };
    }
    currentRow++;

    // 费率数据 - read from config
    const cfgRates = (config && config.monthly_commission_rates) || [];
    const rateData = cfgRates.length > 0
        ? cfgRates.slice().sort((a, b) => a.min - b.min).map(t => {
            const label = t.label || (t.min + '%-' + t.max + '%');
            const rateStr = (t.rate && t.rate > 0) ? (t.rate * 100).toFixed(2) + '%' : 'None';
            return [label, rateStr];
        })
        : [
            ['0%-79%', 'None'],
            ['80%-89%', '0.60%'],
            ['90%-99%', '0.70%'],
            ['100%-105%', '0.80%'],
            ['106% & Above', '1.00%']
        ];

    rateData.forEach((row, idx) => {
        sheet.getCell(currentRow + idx, 1).value = row[0];
        sheet.getCell(currentRow + idx, 2).value = row[1];
        
        for (let col = 1; col <= 2; col++) {
            const cell = sheet.getCell(currentRow + idx, col);
            cell.border = {
                top: {style:'thin'}, bottom: {style:'thin'},
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
        
        if (row[1] !== 'None') {
            sheet.getCell(currentRow + idx, 2).font = { color: { argb: 'FF0097A7' }, bold: true };
        }
    });
    
    currentRow += rateData.length + 2; // 空两行

    // 表格2: Quarter Incentive
    sheet.mergeCells(currentRow, 1, currentRow, 2);
    const title2Cell = sheet.getCell(currentRow, 1);
    title2Cell.value = 'QUARTER INCENTIVE';
    title2Cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    title2Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    title2Cell.alignment = { horizontal: 'center', vertical: 'middle' };
    title2Cell.border = {
        top: {style:'thin'}, bottom: {style:'thin'},
        left: {style:'thin'}, right: {style:'thin'}
    };
    sheet.getRow(currentRow).height = 25;
    currentRow++;

    // 表头
    sheet.getCell(currentRow, 1).value = 'Sale Achievement';
    sheet.getCell(currentRow, 2).value = 'Incentive (RM)';
    sheet.getCell(currentRow, 1).font = { bold: true };
    sheet.getCell(currentRow, 2).font = { bold: true };
    sheet.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    sheet.getCell(currentRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    
    for (let col = 1; col <= 2; col++) {
        sheet.getCell(currentRow, col).border = {
            top: {style:'thin'}, bottom: {style:'thin'},
            left: {style:'thin'}, right: {style:'thin'}
        };
    }
    currentRow++;

    // 季度奖励数据 - read from config
    const qtrTiers = (config && config.quarterly_incentive) || [
        { min: 90, incentive: 200, label: '90%-99%' },
        { min: 100, incentive: 400, label: '100%' }
    ];
    const quarterData = qtrTiers.slice().sort((a, b) => a.min - b.min).map(t => {
        return [t.label || (t.min + '%'), 'RM' + (parseFloat(t.incentive) || 0).toFixed(2)];
    });

    quarterData.forEach((row, idx) => {
        sheet.getCell(currentRow + idx, 1).value = row[0];
        sheet.getCell(currentRow + idx, 2).value = row[1];
        
        for (let col = 1; col <= 2; col++) {
            const cell = sheet.getCell(currentRow + idx, col);
            cell.border = {
                top: {style:'thin'}, bottom: {style:'thin'},
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
        // Set teal color on value column
        sheet.getCell(currentRow + idx, 2).font = { color: { argb: 'FF0097A7' }, bold: true };
    });
    
    currentRow += quarterData.length + 2; // 空两行

    // 表格3: Collection Incentive
    sheet.mergeCells(currentRow, 1, currentRow, 2);
    const title3aCell = sheet.getCell(currentRow, 1);
    title3aCell.value = 'COLLECTION INCENTIVE';
    title3aCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    title3aCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    title3aCell.alignment = { horizontal: 'center', vertical: 'middle' };
    title3aCell.border = {
        top: {style:'thin'}, bottom: {style:'thin'},
        left: {style:'thin'}, right: {style:'thin'}
    };
    sheet.getRow(currentRow).height = 25;
    currentRow++;

    // 表头
    sheet.getCell(currentRow, 1).value = 'Collection Achievement';
    sheet.getCell(currentRow, 2).value = 'Incentive (RM)';
    sheet.getCell(currentRow, 1).font = { bold: true };
    sheet.getCell(currentRow, 2).font = { bold: true };
    sheet.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    sheet.getCell(currentRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    
    for (let col = 1; col <= 2; col++) {
        sheet.getCell(currentRow, col).border = {
            top: {style:'thin'}, bottom: {style:'thin'},
            left: {style:'thin'}, right: {style:'thin'}
        };
    }
    currentRow++;

    // Collection incentive data from config
    const collTiers = (config && config.collection_incentive) || [
        { min: 90, incentive: 150, label: '90%-99%' },
        { min: 100, incentive: 300, label: '100%' }
    ];
    const collData = collTiers.slice().sort((a, b) => a.min - b.min).map(t => {
        return [t.label || (t.min + '%'), 'RM' + (parseFloat(t.incentive) || 0).toFixed(2)];
    });

    collData.forEach((row, idx) => {
        sheet.getCell(currentRow + idx, 1).value = row[0];
        sheet.getCell(currentRow + idx, 2).value = row[1];
        
        for (let col = 1; col <= 2; col++) {
            const cell = sheet.getCell(currentRow + idx, col);
            cell.border = {
                top: {style:'thin'}, bottom: {style:'thin'},
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
        // Set teal color on value column
        sheet.getCell(currentRow + idx, 2).font = { color: { argb: 'FF0097A7' }, bold: true };
    });
    
    currentRow += collData.length + 2; // 空两行

    // 表格4: Active Call Incentive
    sheet.mergeCells(currentRow, 1, currentRow, 2);
    const title3Cell = sheet.getCell(currentRow, 1);
    title3Cell.value = 'ACTIVE CALL INCENTIVE';
    title3Cell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    title3Cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } };
    title3Cell.alignment = { horizontal: 'center', vertical: 'middle' };
    title3Cell.border = {
        top: {style:'thin'}, bottom: {style:'thin'},
        left: {style:'thin'}, right: {style:'thin'}
    };
    sheet.getRow(currentRow).height = 25;
    currentRow++;

    // 表头
    sheet.getCell(currentRow, 1).value = 'Active Outlet';
    sheet.getCell(currentRow, 2).value = 'Minimum RM100.00 Purchase';
    sheet.getCell(currentRow, 1).font = { bold: true };
    sheet.getCell(currentRow, 2).font = { bold: true };
    sheet.getCell(currentRow, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    sheet.getCell(currentRow, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    
    for (let col = 1; col <= 2; col++) {
        sheet.getCell(currentRow, col).border = {
            top: {style:'thin'}, bottom: {style:'thin'},
            left: {style:'thin'}, right: {style:'thin'}
        };
    }
    currentRow++;

    // 活跃电话奖励数据 - read from config
    const callTiers = (config && config.active_call_incentive) || [
        { min: 65, incentive: 50, label: '65%' },
        { min: 70, incentive: 200, label: '70%' },
        { min: 80, incentive: 350, label: '80%' }
    ];
    const callData = callTiers.slice().sort((a, b) => a.min - b.min).map(t => {
        return [t.label || (t.min + '%'), 'RM' + (parseFloat(t.incentive) || 0).toFixed(2)];
    });

    callData.forEach((row, idx) => {
        sheet.getCell(currentRow + idx, 1).value = row[0];
        sheet.getCell(currentRow + idx, 2).value = row[1];
        
        for (let col = 1; col <= 2; col++) {
            const cell = sheet.getCell(currentRow + idx, col);
            cell.border = {
                top: {style:'thin'}, bottom: {style:'thin'},
                left: {style:'thin'}, right: {style:'thin'}
            };
        }
        // Set teal color on value column
        sheet.getCell(currentRow + idx, 2).font = { color: { argb: 'FF0097A7' }, bold: true };
    });

    // 添加备注
   const noteRow = currentRow + callData.length;
sheet.mergeCells(noteRow, 1, noteRow, 2);  // 改为合并到第2列
sheet.getCell(noteRow, 1).value = 'Note: Minimum RM100.00 purchase required to qualify for incentives';
sheet.getCell(noteRow, 1).font = { italic: true, size: 8, color: { argb: 'FF666666' } };
sheet.getCell(noteRow, 1).border = {
    top: {style:'thin'}, bottom: {style:'thin'},
    left: {style:'thin'}, right: {style:'thin'}
};
}