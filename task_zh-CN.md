# MultiAnno 统一化任务清单
[English](task_en.md) | [简体中文](task_zh-CN.md)

## 一、项目文件功能总览

### 根目录
| 文件 | 功能 |
|------|------|
| `app.py` | 一键启动器：启动 FastAPI 后端(8090) + Vite 前端(5173)，自动打开浏览器 |
| `README.md` | 项目介绍、安装说明、快速开始 |

### backend/ — FastAPI 后端
| 文件 | 功能 |
|------|------|
| `backend/main.py` | FastAPI 入口，CORS 配置，注册 7 个路由模块 |
| `backend/models.py` | Pydantic 请求/响应模型（AI、导出、导入、标注、分类体系等） |
| `backend/requirements.txt` | CPU 模式依赖 |
| `backend/requirements-gpu.txt` | GPU 模式依赖（含 SAM 3） |
| `backend/routers/ai.py` | SAM 3 模型初始化、交互式推理、自动推理、状态查询 |
| `backend/routers/annotation.py` | 标注 CRUD、批量保存、统计信息 |
| `backend/routers/exchange.py` | 格式转换：YOLO/COCO/VOC ↔ MultiAnno JSON |
| `backend/routers/filesystem.py` | 文件浏览、创建文件夹、读取文件内容 |
| `backend/routers/project.py` | 项目元数据保存/加载、文件夹扫描分析、后缀推断 |
| `backend/routers/taxonomy.py` | 类别合并/删除、属性批量操作、数据修复 |
| `backend/routers/vis.py` | 可视化预览渲染、批量导出（Matplotlib） |
| `backend/utils/ai_engine.py` | SAM 3 模型封装（加载、推理、自动标注） |
| `backend/utils/format_converters.py` | YOLO/COCO/VOC/Mask ↔ MultiAnno 双向转换 |
| `backend/utils/visualizer.py` | 服务端 Matplotlib 渲染引擎 |

### frontend/src/ — React 19 前端

#### 入口与配置
| 文件 | 功能 |
|------|------|
| `main.tsx` | React DOM 挂载入口 |
| `App.tsx` | 根布局：顶部 Header（菜单/项目信息/设置/主题/语言切换）、Dialog 容器、主工作区 |
| `i18n.ts` | i18next 初始化，注册 en/zh 翻译资源 |
| `index.css` | Tailwind v4 基础样式、日/夜间模式 CSS 变量、自定义滚动条 |

#### API 层
| 文件 | 功能 |
|------|------|
| `api/client.ts` | 所有后端 API 调用的 fetch 封装（POST/GET），含流式导出、图片 prefetch |

#### 配置
| 文件 | 功能 |
|------|------|
| `config/colors.ts` | 颜色映射表（伪彩色方案）和分类体系调色板 |
| `config/contract.ts` | `ProjectMetaContract` TypeScript 类型定义 |
| `config/supportedFormats.ts` | 任务类型（检测/分割/变化检测）、格式详情、图形类型映射、图片扩展名映射 |

#### 状态管理
| 文件 | 功能 |
|------|------|
| `store/useStore.ts` | Zustand 全局状态（persist to localStorage）：项目、视图、标注、分类体系、设置、视口 |
| `store/useDialogStore.ts` | 全局确认对话框状态管理 |
| `store/useToastStore.ts` | Toast 通知状态管理（info/success/warning/error） |

#### Hooks
| 文件 | 功能 |
|------|------|
| `hooks/useActionHistory.ts` | 标注操作的撤销/重做栈 |
| `hooks/useAnnotationAutoSave.ts` | 标注防抖自动保存 |
| `hooks/useBackendHealth.ts` | 后端连接健康检查，断线自动重连（指数退避），Toast 通知 |
| `hooks/useMetaAutoSave.ts` | 项目元数据自动保存 |
| `hooks/useToolNames.ts` | 工具名称查找辅助 |

#### 工具库
| 文件 | 功能 |
|------|------|
| `lib/annotationUtils.ts` | 批量加载标注 JSON 文件 |
| `lib/canvasRenderer.ts` | HTML5 Canvas 渲染引擎（图像图层、标注图形、覆盖层特效） |
| `lib/cursors.ts` | 自定义光标样式（crosshair、grab、focus 等） |
| `lib/projectUtils.ts` | `generateProjectMetaConfig()` 生成导出用的项目元数据快照 |
| `lib/utils.ts` | `cn()` classname 合并工具 |

#### 国际化
| 文件 | 功能 |
|------|------|
| `locales/en.json` | 英文翻译资源 |
| `locales/zh.json` | 中文翻译资源 |

#### UI 基础组件
| 文件 | 功能 |
|------|------|
| `components/ui/alert.tsx` | 警告提示框 |
| `components/ui/button.tsx` | 按钮 |
| `components/ui/card.tsx` | 卡片容器 |
| `components/ui/checkbox.tsx` | 复选框 |
| `components/ui/dialog.tsx` | 模态对话框 |
| `components/ui/dropdown-menu.tsx` | 下拉菜单 |
| `components/ui/input.tsx` | 输入框 |
| `components/ui/label.tsx` | 标签文字 |
| `components/ui/legend.tsx` | 图例说明条（共享组件） |
| `components/ui/popover.tsx` | 弹出框 |
| `components/ui/scroll-area.tsx` | 自定义滚动区域 |
| `components/ui/select.tsx` | 下拉选择 |
| `components/ui/separator.tsx` | 分割线 |
| `components/ui/slider.tsx` | 滑块 |
| `components/ui/switch.tsx` | 开关 |
| `components/ui/tabs.tsx` | 标签页 |
| `components/ui/toast.tsx` | Toast 通知容器（slide-in 动画，右下角堆叠） |
| `components/ui/tooltip.tsx` | 工具提示 |

#### 弹窗组件
| 文件 | 功能 |
|------|------|
| `components/modals/CreateProject.tsx` | 新建项目弹窗（名称 + 元数据路径） |
| `components/modals/LoadProject.tsx` | 加载项目弹窗 |
| `components/modals/FileExplorerDialog.tsx` | 服务端文件浏览器弹窗（含面包屑导航、历史记录、新建文件夹） |
| `components/modals/GlobalConfirmDialog.tsx` | 全局确认对话框 |
| `components/modals/settings/AISettingsModal.tsx` | AI 模型设置（模型类型/路径/置信度） |
| `components/modals/settings/ShortcutSettingsModal.tsx` | 快捷键绑定设置 |
| `components/modals/settings/ViewLayoutSettingsModal.tsx` | 视图网格布局设置 |

#### 功能模块
| 文件 | 功能 |
|------|------|
| `components/modules/DataPreload.tsx` | **视图设置**：3 步流程（文件夹→视图→工作空间），含自动后缀推断、通道/色图配置 |
| `components/modules/ViewExtentCheck.tsx` | **视图对齐**：多视图配准（裁剪/缩放/偏移），含 Canvas 交互、AI 自动对齐入口 |
| `components/modules/SyncAnnotation.tsx` | **标注工作区**（核心）：多视图同步标注、AI 推理集成、撤销/重做、图层管理 |
| `components/modules/TaxonomyDashboard.tsx` | **标注体系管理**：类别/属性增删改、批量合并/删除、YAML/TXT 导入导出、统计图表 |
| `components/modules/ProjectMetaDashboard.tsx` | **项目元数据**：只读展示文件夹/视图配置，JSON 导出 |
| `components/modules/DataImport.tsx` | **数据导入**：3 步流程（任务格式→源数据→目标空间），支持 YOLO/COCO/MultiAnno/Mask |
| `components/modules/DataExport.tsx` | **数据导出**：6 步流程（任务→命名→图像→分割→图形→目标），含数据集分割 |
| `components/modules/LocalVisualization.tsx` | **本地可视化**：4 段式配置（数据源→GT→预测→导出），多图层对比渲染 |

#### 标注工作区子组件
| 文件 | 功能 |
|------|------|
| `components/modules/annotation/CanvasView.tsx` | 多图层 Canvas 渲染器：图像加载、标注绘制、覆盖层特效、AI 预览 |
| `components/modules/annotation/LeftToolbar.tsx` | 左侧工具栏：绘图工具（矩形/多边形/AI）、编辑工具（平移/选择/切割）、导航（撤销/重做/上下场景） |
| `components/modules/annotation/RightPanel.tsx` | 右侧属性面板：手风琴折叠（项目元数据/图层/分类体系/VLM/对象编辑器/对象列表/场景列表） |
| `components/modules/annotation/AIToolPanel.tsx` | AI 工具悬浮面板：Auto/Semi/VQA 三个 Tab，源数据选择、正负样本打点、结果确认 |
| `components/modules/annotation/ClassFormPopover.tsx` | 标注完成后的悬浮表单：类别选择、属性编辑、困难/遮挡标记 |
| `components/modules/annotation/ObjectEditorForm.tsx` | 选中对象的属性编辑器：标签、文本描述、Group/Track ID、flags |

---

## 二、待完成修改任务

### A. 布局与主题统一

#### A1. 统一模块弹窗为「左侧步骤导航 + 右侧内容面板」标准布局
当前三种布局范式并存：步骤导航式、分段侧边栏式、Tab 切换式。统一标准：
- **侧边栏宽度**：统一为 `w-[200px]`（当前 DataPreload/Import/Export 已统一，LocalVisualization 用 300px，TaxonomyDashboard 用 256px）
- **侧边栏背景**：统一为 `bg-muted/20`
- **边框颜色**：统一为 `border-border`（主题变量），替换硬编码的 `border-neutral-200 dark:border-neutral-800`
- **底部状态栏**：统一添加底部汇总栏

涉及文件：
- [LocalVisualization.tsx](frontend/src/components/modules/LocalVisualization.tsx) — 当前为分段式侧边栏，需重构为步骤导航
- [TaxonomyDashboard.tsx](frontend/src/components/modules/TaxonomyDashboard.tsx) — 当前为 Tab 切换 + 树形导航，需评估是否改为步骤导航

#### A2. 主题变量使用统一
多个文件使用 `bg-white dark:bg-neutral-900` 而非 `bg-background`，使用 `border-neutral-200 dark:border-neutral-800` 而非 `border-border`：
- TaxonomyDashboard、ProjectMetaDashboard、RightPanel、ViewExtentCheck 中大量硬编码颜色值，需替换为 Tailwind 主题变量

---

### B. 交互体验改进

#### B1. 替换硬编码 alert() 为 Toast 通知
Toast 通知系统已就绪（`useToastStore` + `ToastContainer`）。剩余约 25 处 `alert()` 调用需替换为 `toast.info/success/warning/error()`：

| 文件 | 数量 | 说明 |
|------|------|------|
| [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) | 8 | 中英混合 alert，部分含动态参数 |
| [TaxonomyDashboard.tsx](frontend/src/components/modules/TaxonomyDashboard.tsx) | 14 | 批量操作结果反馈 |
| [ViewExtentCheck.tsx](frontend/src/components/modules/ViewExtentCheck.tsx) | 3 | 对齐保存相关 |
| [DataExport.tsx](frontend/src/components/modules/DataExport.tsx) | 2 | 类别不匹配/文件读取失败 |

#### B2. 标注工作区 RightPanel 抽屉式重构
当前为手风琴折叠面板（SectionHeader + expand/collapse），与菜单模块的步骤导航风格不一致。改为：
- 整体采用收纳式抽屉（Drawer）风格，点击标签展开对应的抽屉面板
- 与左侧步骤导航风格形成视觉对应

涉及文件：[RightPanel.tsx](frontend/src/components/modules/annotation/RightPanel.tsx)

---

### C. Raw 图像数据处理

#### C1. 前端像素值查询工具
当前前端像素管线处理 8-bit 数据，但无法查看原始像素值。需在标注工作区增加像素查询能力：
- 鼠标悬停时显示当前位置的原始像素值（各波段）
- 支持多波段数据显示（如 RGB + NIR 等）
- 在状态栏或 tooltip 中显示，参考现有 `showPixelValue` 设置项

涉及文件：
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — 像素值读取
- [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) — 状态栏/顶部信息栏

#### C2. Raw 数据导出支持
当前导出流程将所有图像转为 8-bit JPEG/PNG。增加原始数据导出选项：
- 支持导出原始位深图像（16-bit、float32 等）
- 导出格式增加 .tif/.npy 选项
- 在 DataExport 步骤中增加 "Raw Data" 开关

涉及文件：
- [DataExport.tsx](frontend/src/components/modules/DataExport.tsx) — 导出 UI 步骤
- `backend/routers/exchange.py` — 导出后端逻辑
- `backend/utils/visualizer.py` — 图像读写

#### C3. 非 8-bit 数据前端渲染增强
当前后端将所有非 8-bit 数据线性拉伸到 8-bit 后传给前端。需增强前端渲染能力：
- 增加 stretch 模式选择（线性/百分位/自适应直方图等）
- 增加波段组合预设（如 NDVI、伪彩色等）
- 在 DataPreload 视图配置中增加渲染参数

涉及文件：
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — 前端像素管线
- [DataPreload.tsx](frontend/src/components/modules/DataPreload.tsx) — 视图配置 UI
- `backend/utils/visualizer.py` — 后端渲染参数扩展

---

### D. LocateAnything 辅助分割

#### D1. 集成 Grounding DINO 等开放词汇检测模型
当前 SAM3 text-prompted 分割（Auto Tab）依赖 SAM3 自带的语义能力，定位精度有限。集成专门的目标定位模型以增强辅助分割：
- 后端集成 Grounding DINO 或类似开放词汇检测模型
- 接收文本 prompt，返回检测框/掩码
- 与现有 SAM 交互式分割形成级联（Grounding → SAM refine）

涉及文件：
- `backend/utils/ai_engine.py` — 新增 Grounding 模型封装
- `backend/routers/ai.py` — 新增定位 API 端点
- `backend/models.py` — 请求/响应模型
- `backend/requirements-gpu.txt` — 依赖更新

#### D2. 前端定位结果交互
前端展示 Grounding 模型的检测结果：
- 在 AIToolPanel 中增加 "Locate" 功能入口
- 检测结果以候选框列表展示，支持置信度筛选
- 点击候选框后自动调用 SAM 进行精细分割
- 支持批量确认/拒绝检测结果

涉及文件：
- [AIToolPanel.tsx](frontend/src/components/modules/annotation/AIToolPanel.tsx) — 新增 Locate Tab 或增强 Auto Tab
- [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) — 结果处理与标注生成
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — 候选框/掩码预览渲染
- [client.ts](frontend/src/api/client.ts) — API 调用封装

#### D3. 级联推理流程
实现 Grounding 定位 → SAM 分割的自动化级联：
- 用户输入文本 prompt → Grounding 返回 N 个候选框
- 候选框自动作为 SAM box prompt 进行精细分割
- 支持单次文本查询的多目标输出（如 "car" → 图中所有车辆）
- 可配置置信度阈值和最大输出数

涉及文件：
- `backend/utils/ai_engine.py` — 级联推理编排
- `backend/routers/ai.py` — 级联 API 端点
- [AIToolPanel.tsx](frontend/src/components/modules/annotation/AIToolPanel.tsx) — 级联参数配置
