const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // === 文件操作 ===
    selectFile: () => ipcRenderer.invoke('select-file'),
    importSalesData: (path) => ipcRenderer.invoke('import-sales-data', path),
    
    // === 用户管理 ===
    createUser: (userData) => ipcRenderer.invoke('create-user', userData),
    updateUser: (userId, userData) => ipcRenderer.invoke('update-user', userId, userData),
    deleteUser: (userId) => ipcRenderer.invoke('delete-user', userId),
    getUsers: () => ipcRenderer.invoke('get-users'),
    getUser: (userId) => ipcRenderer.invoke('get-user', userId),
    
    // === Excel 操作 ===
    generateSalaryTemplate: (data) => ipcRenderer.invoke('generate-salary-template', data),
    exportToExcel: (data) => ipcRenderer.invoke('export-to-excel', data),
    
    // === PDF 操作 ===
    exportPDF: (data) => ipcRenderer.invoke('export-pdf', data),
    generateReport: (data) => ipcRenderer.invoke('generate-report', data),
    
    // === 配置管理 ===
    loadConfig: () => ipcRenderer.invoke('load-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    
    // === 系统信息 ===
    platform: process.platform,
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    
    // === 对话框 ===
    showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options)
});