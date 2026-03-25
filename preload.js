const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
    // ========== 配置管理 ==========
    loadConfig: () => ipcRenderer.invoke('load-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    loadLocale: (lang) => ipcRenderer.invoke('load-locale', lang),
    
    // ========== 文件操作 ==========
    selectFile: () => ipcRenderer.invoke('select-file'),
    importSalesData: (filePath) => ipcRenderer.invoke('import-sales-data', filePath),
    
    // ========== Excel 导出 ==========
    generateSalaryTemplate: (data) => ipcRenderer.invoke('generate-salary-template', data),
    generateBatchSummary: (data) => ipcRenderer.invoke('generate-batch-summary', data),
    
    // ========== License 系统 ==========
    getLicenseStatus: () => ipcRenderer.invoke('license-get-status'),
    activateLicense: (key) => ipcRenderer.invoke('license-activate', key),
    deactivateLicense: () => ipcRenderer.invoke('license-deactivate'),
    incrementExport: () => ipcRenderer.invoke('license-increment-export'),
    
    // ========== PDF 导出 ==========
    exportPDF: (data) => ipcRenderer.invoke('export-pdf', data),
    
    // ========== Print Excel ==========
    printExcel: (filePath) => ipcRenderer.invoke('print-excel', filePath),
    
    // ========== 备份系统 ==========
    // JSON 文件操作
    saveJSONFile: (jsonString) => ipcRenderer.invoke('saveJSONFile', jsonString),
    selectJSONFile: () => ipcRenderer.invoke('selectJSONFile'),
    loadJSONFile: (filePath) => ipcRenderer.invoke('loadJSONFile', filePath),
    
    // 自动备份
    createAutoBackup: (jsonString) => ipcRenderer.invoke('createAutoBackup', jsonString),
    getLatestBackup: () => ipcRenderer.invoke('getLatestBackup'),
    getBackupList: () => ipcRenderer.invoke('getBackupList'),
    restoreBackup: (backupKey) => ipcRenderer.invoke('restoreBackup', backupKey),
    deleteBackup: (backupKey) => ipcRenderer.invoke('deleteBackup', backupKey),
    
    // 备份文件操作
    saveBackupFile: (options) => ipcRenderer.invoke('saveBackupFile', options),
    readBackupFile: (filePath) => ipcRenderer.invoke('readBackupFile', filePath),
    
    // ========== SQLite DB ==========
    dbSave:   (key, value) => ipcRenderer.invoke('db-save', key, value),
    dbLoad:   (key)        => ipcRenderer.invoke('db-load', key),
    dbDelete: (key)        => ipcRenderer.invoke('db-delete', key),
    dbList:   (prefix)     => ipcRenderer.invoke('db-list', prefix),

    // ========== 平台信息 ==========
    platform: process.platform
});