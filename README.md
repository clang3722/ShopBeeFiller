# ShopBeeFiller

> 店小蜜批量编辑商品自动填充表格 · Chrome 扩展

[![Version](https://img.shields.io/badge/version-2.8.1-blue.svg)](https://github.com/clang3722/ShopBeeFiller)
[![License](https://img.shields.io/badge/license-CC%20BY%204.0-green.svg)](https://creativecommons.org/licenses/by/4.0/)
[![JavaScript](https://img.shields.io/badge/JavaScript-74.7%25-yellow.svg)](https://github.com/clang3722/ShopBeeFiller)
[![HTML](https://img.shields.io/badge/HTML-15.8%25-orange.svg)](https://github.com/clang3722/ShopBeeFiller)
[![CSS](https://img.shields.io/badge/CSS-9.5%25-blue.svg)](https://github.com/clang3722/ShopBeeFiller)

---

## 📖 简介

> 本项目全部使用AI完成

**ShopBeeFiller** 是一款专为店小蜜（Dianxiaomi）跨境电商ERP设计的 Chrome 浏览器扩展。

只需在 Excel 中整理好商品数据，打开店小蜜批量编辑页面，点击「开始」，程序即自动完成全部商品的批量填写，**大幅提升工作效率**。

> ⏱ 原本 **25 件/小时** → 现在只需 **几分钟**

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 📊 **Excel 读取** | 支持 `.xlsx` 格式，自动读取标题、尺寸、重量、价格 |
| 🔄 **自动变种识别** | 自动识别页面中的多规格商品（颜色、尺寸等） |
| 🧮 **智能数量提取** | 从变种名称提取数量（如 `2pcs`、`5件`），自动计算价格 |
| ⚡ **动态倍率** | 价格超过阈值自动降倍率（5→4→3），避免报价过高 |
| 🛠 **智能修正** | 价格 < 4 → 4，重量 > 150 → 150，重量 = 1 → 2 |
| 🪟 **悬浮窗** | 店小蜜页面右上角浮动面板，即开即用，可拖拽移动 |
| 💾 **设置记忆** | 倍率、间隔、阈值自动保存，下次打开无需重设 |
| 📋 **日志持久化** | 操作日志自动保存，方便排查问题 |
| 🎮 **快捷键** | `F8` 暂停/继续，`Esc` 停止 |

---

## 📊 Excel 格式要求

| 列 | 字段 | 必填 | 说明 |
|----|------|------|------|
| A | 标题 | ✅ | 商品标题 |
| B | 图片 | ❌ | 可留空 |
| C | 尺寸 | ✅ | 格式：`长*宽*高`，如 `12*8*2` |
| D | 重量 | ✅ | 单位 g，如 `100` |
| E | 进货价 | ✅ | 如 `20.5` |

> 💡 **提示**：F列及之后的列程序不读取，可自由添加备注列（如：是否通过、核价失败、1688链接等）。

---

## 🚀 安装与使用

### 1. 下载源码

```bash
git clone https://github.com/clang3722/ShopBeeFiller.git
```

或者直接在 GitHub 页面点击 「Code」 → 「Download ZIP」 下载解压。

2. 加载到 Chrome

1. 打开 Chrome，地址栏输入 chrome://extensions/
2. 开启右上角的 「开发者模式」
3. 点击 「加载已解压的扩展程序」
4. 选择项目文件夹 ShopBeeFiller
5. 扩展安装完成 ✅

3. 使用流程

步骤 操作
1 整理 Excel：按格式填写商品数据
2 登录店小蜜：进入「产品 → 采集箱 → 批量编辑」
3 打开扩展：点击右上角扩展图标，或使用页面悬浮窗 📦
4 选择文件：选择已填好的 Excel
5 点击「开始」：程序自动填写
6 核对数据：手动确认无误后点击「保存」

---

⚙️ 配置说明

配置项 默认值 说明
申报价倍率 5 进货价 × 倍率 = 申报价
填写间隔 0.4s 每个单元格填写后的等待时间
动态阈值 80 超过此值自动降倍率（5→4→3）

---

🧮 价格计算规则

基础规则

```
申报价 = 进货价 × 倍率
```

变种数量规则

条件 计算方式
基础价格 > 200 数量不参与计算
变种名称中数字 > 501 视为型号/货号，不参与计算
变种名称中数字 ≤ 501 申报价 = 进货价 × 数字 × 倍率
变种名称中无数字 申报价 = 进货价 × 倍率

动态倍率规则

条件 倍率
进货价 × 倍率 ≤ 阈值 保持用户设置
进货价 × 倍率 > 阈值 降为 4 倍（倍率 × 0.8）
4 倍后仍 > 阈值 降为 3 倍（倍率 × 0.6）

智能修正

条件 修正
申报价 < 4 改为 4
重量 > 150g 改为 150g
重量 = 1g 改为 2g

---

📁 项目结构

```
ShopBeeFiller/
├── manifest.json          # 扩展配置
├── popup.html             # 设置面板
├── popup.js               # 设置逻辑
├── content.js             # 核心填写引擎
├── floating.js            # 悬浮窗逻辑
├── floating.css           # 悬浮窗样式
├── guide.js               # 功能说明折叠面板
├── background.js          # 后台服务
├── styles.css             # 通用样式
├── xlsx.full.min.js       # Excel 读取库
├── 示例表格.xlsx          # 示例 Excel
├── README.md              # 本文件
├── LICENSE                # 许可证
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

🛠 技术栈

技术 用途
JavaScript (ES6) 核心逻辑
Chrome Extension API (Manifest V3) 扩展开发
XLSX (SheetJS) Excel 文件读写
Chrome Storage API 设置持久化

---

📝 版本历史

版本 更新内容

v2.8.1 优化数量识别阈值（501），修复悬浮窗加载，增加 IIFE 防止重复加载

v2.8 新增数量 > 501 不参与计算规则，优化价格计算逻辑

v2.7 修复纯数字被误识别为数量的问题

v2.6 新增动态倍率、悬浮窗拖拽、日志持久化、设置自动保存

v2.5 新增变种自动识别、智能修正、CC BY 4.0 协议

v2.0 支持多规格（变种）商品

v1.0 基础批量填写功能

---

🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建你的特性分支 (git checkout -b feature/AmazingFeature)
3. 提交修改 (git commit -m 'Add some AmazingFeature')
4. 推送到分支 (git push origin feature/AmazingFeature)
5. 提交 Pull Request

---

📄 许可证

CC BY 4.0 —— 署名后可自由修改、分发、商用。

```
© 2026 LanMay Studio · clang
```

---

📧 联系

· 作者：clang
· 工作室：LanMay Studio
· GitHub：clang3722/ShopBeeFiller

---

Made with ❤️ by LanMay Studio
