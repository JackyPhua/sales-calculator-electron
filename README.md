# 💰 Sales Commission Calculator - Electron Desktop App

Modern, feature-rich sales commission calculator with Excel import/export capabilities.

## ✨ 主要功能

### 📥 **Excel 导入**
- 一键导入你的 Excel 销售数据
- 自动识别销售员和月度数据
- 智能计算季度累计（3个月）
- 支持 Data Sheet 格式

### 🎯 **Quick Calculate**
- 卡片式界面，直观易用
- 实时预览佣金和奖励
- 支持多个销售员同时计算
- 月份选择器

### 💵 **薪资管理**
- 动态添加/删除销售员
- 配置基本工资
- 8种津贴设置（HP、Car、Housing等）
- 数据持久化保存

### 💰 **佣金配置**
- 完全可自定义的佣金层级
- 支持添加/删除层级
- Achievement Range 可编辑
- 百分比精确到小数点

### 🎁 **三种奖励金**
1. **Quarterly Bonus** - 基于3个月累计销售
2. **Collection Incentive** - 基于月度收款
3. **Active Call Incentive** - 基于月度电话量

### 📊 **Excel 导出**
- 专业的彩色工资单
- 每个销售员独立工作表
- 自动计算所有百分比
- 美观的格式设计

## 🚀 快速开始

### 安装

```bash
# 1. 解压项目
tar -xzf sales-calculator-complete.tar.gz
cd sales-calculator-complete

# 2. 安装依赖
npm install

# 3. 运行应用
npm start
```

### 打包独立程序

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 📖 使用指南

### 第一次使用

1. **配置销售员**
   - 进入 "Salary & Allowances"
   - 点击 "+ Add Salesperson"
   - 输入姓名和薪资信息
   - 保存配置

2. **快速计算**
   - 进入 "Quick Calculate"
   - 选择月份
   - 点击 "📥 Import Excel" 导入数据
   - 或手动输入数据
   - 点击 "Generate Report"

### Excel 导入格式

你的 Excel 文件需要有 "Data Sheet" 工作表，包含：

| SALE TEAM | MONTH | TARGET 26 | SALES ACH 26 | COLLECTION |
|-----------|-------|-----------|--------------|------------|
| ANTONI    | JAN   | 287000    | 303726.77    | 238990     |
| ANTONI    | FEB   | ...       | ...          | ...        |

### 季度奖金计算说明

系统会根据选择的月份自动计算季度累计：

- **JAN** → 只用 JAN
- **FEB** → JAN + FEB
- **MAR** → JAN + FEB + MAR（完整Q1）
- **APR** → 只用 APR（新季度开始）
- ...以此类推

**例如：选择 MAR（3月）**
```
系统会自动累计：
- Quarterly Target = JAN目标 + FEB目标 + MAR目标
- Quarterly Sales = JAN销售 + FEB销售 + MAR销售
- Achievement = Quarterly Sales ÷ Quarterly Target
- 如果 ≥100% → RM 400
- 如果 ≥90% → RM 200
- 如果 <90% → RM 0
```

## 🎨 界面特点

- ✅ 现代化设计（Tailwind CSS）
- ✅ 圆角按钮和平滑动画
- ✅ 实时数据预览
- ✅ 颜色编码成就率
  - 🟢 绿色：≥100%
  - 🟡 黄色：90-99%
  - 🔴 红色：<90%
- ✅ 响应式布局
- ✅ Toast 通知

## 📁 项目结构

```
sales-calculator-complete/
├── main.js              # Electron 主进程
├── preload.js           # 安全桥接
├── index.html           # 主界面
├── package.json         # 项目配置
└── src/
    ├── app.js           # 应用主逻辑
    ├── calculator.js    # 计算器逻辑
    ├── views.js         # 视图 HTML
    ├── excelStyles.js   # Excel 样式配置
    └── locales/
        └── en.json      # 英文国际化
```

## 🔧 配置文件位置

配置自动保存在：
- **Windows**: `%APPDATA%/sales-commission-calculator/config.json`
- **macOS**: `~/Library/Application Support/sales-commission-calculator/config.json`
- **Linux**: `~/.config/sales-commission-calculator/config.json`

## 💡 常见问题

### Q: 导入 Excel 失败？
A: 确保你的 Excel 有 "Data Sheet" 工作表，并且列名正确。

### Q: 季度奖金计算不对？
A: 季度奖金基于3个月累计，不是单月。系统会根据选择的月份自动累计该季度的所有数据。

### Q: 如何备份配置？
A: Settings → Export Config 导出 JSON 文件。

### Q: 如何添加新的销售员？
A: Salary & Allowances → Add Salesperson。

## 🐛 已知问题

- [ ] 历史记录功能还在完善中
- [ ] PDF 导出功能待实现

## 🎉 版本历史

**v1.0.0** (Current)
- ✅ Excel 导入/导出
- ✅ 季度数据自动计算
- ✅ 动态销售员管理
- ✅ 三种奖励金配置
- ✅ 现代化 UI
- ✅ 数据持久化

## 📞 技术支持

如有问题，请检查：
1. Node.js 版本 ≥18
2. 依赖是否完全安装
3. Excel 文件格式是否正确

---

**Made with ❤️ for Sales Team**
