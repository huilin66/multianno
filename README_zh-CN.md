# MultiAnno
[English](README.md) | [简体中文](README_zh-CN.md)

**MultiAnno：一个面向多视图任务的 AI 辅助图像标注工具。**

> **特别说明：** 本项目的核心架构和代码库是在 **Google Gemini 3.1 Pro**、**DeepSeek v4 Pro** 和 **Claude Code** 的结对编程辅助下完成的。

---
![功能演示](./doc/pic/feature2.gif)

## 核心特性

### 多视图同步
MultiAnno 支持多波段、多模态影像（如 RGB、红外、深度图）的同步联动浏览。具备视口同步和十字准线同步功能，便于在不同视图之间进行比较标注。

### AI 辅助标注
集成 Segment Anything Model (SAM 3)，支持通过点和框提示生成多边形和掩码，减少手动描边的需求，提升标注效率。

### 模块化用户界面
基于 React 构建，MultiAnno 提供简洁、模块化的用户界面。包含暗色/亮色主题切换和整合式右侧属性面板，保持主工作区的整洁专注。

---

## 文档

- [标注项目快速开始（简体中文）](./QUICK_START_zh-CN.md)
- [Annotation Quick Start](./QUICK_START.md)
- [系统说明（简体中文）](./SYSTEM_GUIDE_zh-CN.md)
- [System Guide](./SYSTEM_GUIDE.md)

标注项目快速开始面向需要开始标注项目的用户。系统说明文档介绍了架构、数据契约、模块边界、开发约束和 PR 流程，适合贡献者和 AI 编程助手阅读。

---

## 安装

### 1. 克隆仓库
```bash
git clone https://github.com/huilin66/multianno.git
cd multianno
```

### 2. 安装前端
2.1 从 [Node.js 官网](https://nodejs.org/en/download) 安装 Node.js。

2.2 安装前端依赖。
```bash
cd frontend
npm install
cd ..
```

### 3. 安装后端
3.1 创建并激活 Conda 环境。
```bash
conda create -n multianno python=3.10
conda activate multianno
```

3.2 根据硬件选择安装后端依赖：

* **方案 A：仅 CPU（基础模式）**
    ```bash
    cd backend
    pip install -r requirements.txt
    cd ..
    ```
* **方案 B：GPU 推荐（完整 AI 模式，含 SAM 3）**
    首先从 [PyTorch 历史版本页面](https://pytorch.org/get-started/previous-versions/) 安装与 CUDA 环境匹配的 PyTorch 版本，然后安装其余依赖：
    ```bash
    cd backend
    pip install -r requirements-gpu.txt
    cd ..
    ```

---

## 快速开始

MultiAnno 提供一键启动器以简化启动流程。激活 Conda 环境后，在项目根目录运行：

```bash
python app.py
```

完整标注工作流请阅读 [标注项目快速开始](./QUICK_START_zh-CN.md)。

1. **创建新项目：**
   * 设置项目元数据路径。
   * 选择图像文件夹及对应视图。
   * 定义视图对齐关系。
2. **管理标注体系：** 定义标注类别和属性。
3. **标注：** 在同步的图像视图上绘制标注。
4. **导出：** 将标注导出为标准格式。
5. **可视化：** 在本地可视化标注和多视图结果。

---

## 开发计划

- [ ] 布局与主题统一
- [ ] Raw 图像数据处理
- [ ] LocateAnything — 辅助分割
- [ ] 使用文档

---

## 致谢
衷心感谢 Ultralytics、SAM 3 (Segment Anything 3) 和 X-AnyLabeling 的开发者和贡献者。

## 许可证
MultiAnno 基于 [AGPL-3.0 许可证](./LICENSE) 运作。作为一个完全免费的开源项目，本平台面向所有开发者和研究人员。我们希望它能作为实用基础设施，支持和推进您的日常标注工作流。

## 引用
如果您在研究中使用本软件，请按以下格式引用：
```bibtex
@misc{multianno,
  title={{MultiAnno: An AI-assisted image annotation tool for multi-view tasks}},
  author={Huilin ZHAO, Xing XU, Wenjing XUN},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/huilin66/multianno}}
}
```
