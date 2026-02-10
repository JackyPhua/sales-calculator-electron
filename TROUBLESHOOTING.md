# 🔧 Salary & Allowances 不显示问题诊断

## 问题现象
生成的 Excel 工资单中，SALARY、HP、CAR 等所有薪资和津贴都显示 0.00

## 原因分析
配置文件 `config.json` 中没有该销售员的薪资数据

## 解决方案

### 方法 1：在应用中配置（推荐） ✅

1. **打开应用**
2. **进入 "Salary & Allowances"**
3. **点击 "+ Add Salesperson"**
4. **输入销售员信息：**
   ```
   Name: ANTONI  （必须大写，与 Excel 中一致）
   Base Salary: 2000
   ```
5. **设置津贴：**
   ```
   HP Allowance: 100
   Car Allowance: 500
   Local Fuel: 200
   Housing: 300
   ... 等
   ```
6. **点击 "💾 Save Configuration"**
7. **返回 Quick Calculate 重新生成报告**

### 方法 2：检查名字大小写 ⚠️

确保：
- **Salary & Allowances 中的名字**：`ANTONI`
- **Quick Calculate 中选择的名字**：`ANTONI`
- **Excel Data Sheet 中的名字**：`ANTONI`

**名字必须完全一致（包括大小写）！**

## 如何确认配置是否正确

### 查看配置文件

配置文件位置：
- **Windows**: `%APPDATA%/sales-commission-calculator/config.json`
- **macOS**: `~/Library/Application Support/sales-commission-calculator/config.json`
- **Linux**: `~/.config/sales-commission-calculator/config.json`

打开 `config.json` 应该看到：

```json
{
  "base_salaries": {
    "ANTONI": 2000,
    "CRYSTAL": 1800
  },
  "allowances": {
    "ANTONI": {
      "HP": 100,
      "CAR": 500,
      "LOCAL FUEL": 200,
      "OUTSTATION FUEL": 150,
      "HOUSING": 300,
      "FOOD": 100,
      "OTHERS": 50
    },
    "CRYSTAL": {
      ...
    }
  }
}
```

如果 `base_salaries` 或 `allowances` 是空的 `{}`，那就是问题所在！

## 使用调试版本查看详细日志

我已经在 calculator.js 中添加了详细的调试日志。

### 查看日志步骤：

1. **打开应用**
2. **按 F12 或 Ctrl+Shift+I** 打开开发者工具
3. **切换到 "Console" 标签**
4. **进入 Quick Calculate**
5. **添加销售员并填写数据**
6. **点击 "Generate Report"**

### 你会看到类似这样的日志：

```
========== 🔍 FRONT-END: generateReport DEBUG ==========
Processing person: ANTONI
Config base_salaries: { ANTONI: 2000, CRYSTAL: 1800 }
Config allowances: { ANTONI: { HP: 100, CAR: 500, ... } }
Looking for: ANTONI
✅ Set person.salary to: 2000
Found config allowances: { HP: 100, CAR: 500, ... }
✅ Set person.allowances to: { HP: 100, CAR: 500, ... }
========================================================

========== 🔍 REAR-END: createSalarySheet DEBUG ==========
Person name: ANTONI
Person salary: 2000 (type: number)
Person allowances object: { HP: 100, CAR: 500, ... }
✅ Extracted allowance values: { HP: 100, CAR: 500, ... }
========================================================
```

### 如果看到：

```
Config base_salaries: {}
Config allowances: {}
✅ Set person.salary to: 0    ← 这里是 0！
```

**说明：配置是空的，需要先在 Salary & Allowances 中添加销售员！**

## 快速测试步骤

1. ✅ 打开应用
2. ✅ Salary & Allowances → Add Salesperson
3. ✅ 输入：ANTONI, Salary: 2000, HP: 100, Car: 500
4. ✅ Save Configuration
5. ✅ Quick Calculate → Import Excel
6. ✅ Generate Report
7. ✅ 检查 Excel - 应该能看到薪资数据了

## 常见错误

### ❌ 错误 1：名字不一致
```
配置中: antoni  (小写)
Excel中: ANTONI (大写)
结果: 找不到匹配，显示 0
```

### ❌ 错误 2：没有保存配置
```
添加了销售员但没有点 "Save Configuration"
结果: 配置没有保存，还是空的
```

### ❌ 错误 3：配置文件被手动删除
```
手动删除了 config.json
结果: 应用会创建新的空配置
```

## 需要帮助？

如果按照以上步骤仍然无法解决：

1. **打开开发者工具（F12）**
2. **复制 Console 中的所有日志**
3. **发送给开发者**

日志会告诉我们：
- 配置是否正确加载
- 数据是否正确传递
- 在哪一步出了问题
