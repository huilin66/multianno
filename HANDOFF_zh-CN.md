# MultiAnno 项目交接指南

本文档是 MultiAnno 的长期维护与工程交接基线，面向维护者、新开发者、PR 审查者和 AI 编程助手。除系统设计外，它还记录当前实现状态、实际运行和数据流程、近期变更、高风险区域以及新维护者的接手顺序。

本次交接代码核对时间：2026-07-28；文档重命名前基于 `main` 分支提交 `4ab02be`。

建议按以下顺序阅读：

1. 交接摘要
2. 项目定位与设计背景
3. 快速开始
4. 整体架构
5. 核心数据契约
6. 文件与目录说明
7. 开发约束与系统不变量
8. 当前风险与后续工作
9. PR 提交与验收流程
10. AI 协作指南

## 0. 交接摘要

### 0.1 当前基线

当前仓库是一个通过根目录单一脚本启动的本地 FastAPI + React 应用。编写本交接文档时工作区干净，主要标注流程已经可用；端到端自动化测试和正式发行打包仍不完整。

当前运行结构：

```text
python app.py
  -> FastAPI 后端：http://127.0.0.1:8090
  -> 健康检查：    http://127.0.0.1:8090/api/health
  -> Vite 前端：   http://127.0.0.1:5173
  -> 默认不会自动打开浏览器

python app.py --open-browser
  -> 两个服务均就绪后自动打开前端
```

当前持久化结构：

```text
project_meta.json
  -> 项目配置、图像文件夹、scene group、view、taxonomy

<workspace>/<stem>.json
  -> 每个 scene group 一份 MultiAnno 原生标注

导出目录
  -> 转换后的标注，以及可选图像、数据集划分文件、classes.txt 和报告
```

系统没有数据库、用户账号、云同步或后台任务服务，本地文件是唯一事实来源。

### 0.2 用户工作流与模块归属

完整标注工作流为：

1. 创建或加载项目。
2. 选择本地图像文件夹并推断文件名后缀。
3. 将不同文件夹绑定为 scene group，并配置 view。
4. 使用 crop 和 transform 将辅助 view 与主 view 对齐。
5. 定义类别与属性。
6. 在同步标注工作区逐个处理 scene group。
7. 在 Taxonomy 中检查类别分布和具体对象。
8. 导入既有标签，或导出仅标注/完整数据集。

| 工作流 | 前端入口 | 后端入口 | 持久化结果 |
| --- | --- | --- | --- |
| 创建/加载项目 | `CreateProject.tsx`、`LoadProject.tsx`、`DataPreload.tsx` | `project.py`、`filesystem.py` | `project_meta.json` |
| 视图对齐 | `ViewExtentCheck.tsx`、`projectUtils.ts` | project meta 保存接口 | `views[].crop`、`views[].transform` |
| 标注 | `SyncAnnotation.tsx`、annotation 子组件与 hooks | `annotation.py` | `<stem>.json` |
| Taxonomy/统计 | `TaxonomyDashboard.tsx` | `taxonomy.py` | project meta 和标注 JSON |
| 导入导出 | `DataImport.tsx`、`DataExport.tsx` | `exchange.py`、`format_converters.py` | 用户选择的目标目录 |
| AI 辅助 | `AIToolPanel.tsx`、`AISettingsModal.tsx` | `ai.py`、`ai_engine.py` | 预览 shape，确认后进入普通标注状态 |
| 本地可视化 | `LocalVisualization.tsx` | `vis.py`、`visualizer.py` | 渲染预览图或导出图 |

### 0.3 近期已完成变更

- Track ID 窗口已统一使用主界面大型弹窗的 95vw 宽度规则，并在窗口内部复用主界面的真实 CanvasView，因此三帧会加载实际图像和标注，而不是占位卡片。

- Track ID 窗口现在复用主界面右侧面板结构；View Layers 在该窗口中为只读，Track ID Editor 作为同一右侧面板中的独立板块显示。

- Track ID 标注窗口可从左上角“标注体系”菜单和 Object Editor 标题栏入口打开，当前包含单模态三帧画布、中心帧对象双击选择、底部帧导航、已有 Track ID 选择/赋值和序列占位；锁定、缺失帧标记、插值与 ReID 尚未接入。

以下行为已经进入当前基线，后续修改不得无意回退：

- 原生矩形框统一使用 `shape_type: "bbox"`；外部或旧版 `rectangle` 只在兼容边界归一化。
- 裁剪数据保存到 `view.crop`；`view.transform` 只保存缩放和偏移。
- 完整数据集导出遇到非空目标目录时，必须由前端二次确认覆盖，后端也会校验覆盖标志。
- 完整数据集默认包含无标注图像，前端可取消勾选。
- 完整数据和仅标注导出都使用 NDJSON 流向同一进度界面反馈进度。
- 仅标注导出会在用户选择的导出目录中生成 `classes.txt`。
- 导入/导出弹窗不会因误点外部区域关闭，只能显式关闭。
- Taxonomy 的 scene 行显示当前类别对象数；单击显示只读多视图预览，选择对象后缩放到对象，双击仍跳转标注工作区。
- crop 吸附加入滞回释放逻辑，吸附后可以继续拖离边界。
- Vision AI 支持 SAM-3 和 Ultralytics YOLO 适配器，包括 YOLOv8/v9/v10/11/12/26，以及自定义 `.pt`、`.onnx`、`.pth` 模型路径；类别文件由引擎读取。
- 基础模式不依赖 AI 包即可启动；RAW/DNG 也作为独立可选依赖组。

### 0.4 发版前最低验收

至少执行：

```bash
python -m compileall -q backend app.py

cd frontend
npm run lint
npm run build
```

然后使用一次性测试项目完成手动冒烟：

- 创建项目并重新打开。
- 保存 crop/transform，对应用重启后确认恢复。
- 绘制、编辑、删除 `bbox` 和 polygon，确认自动保存。
- 分别执行一次仅标注导出和完整数据集导出。
- 检查进度、`classes.txt`、无标注图像选项和覆盖二次确认。
- 打开 Taxonomy 预览，切换 view，并切换 Full 与单个对象 ID。
- 使用基础依赖启动一次；AI 功能在安装 AI 依赖的独立环境中验证。

目前没有覆盖上述流程的自动化端到端测试。类型检查和语法检查通过是发版必要条件，但不能替代手动验收。

### 0.5 下一位维护者建议优先级

建议按以下顺序推进：

1. 为导入导出转换及目标目录安全增加基于 fixture 的后端测试。
2. 为项目创建、对齐持久化、标注自动保存和导出进度增加浏览器冒烟测试。
3. 明确发版形态：源码启动器、由 FastAPI 托管构建后的前端，或桌面应用打包。
4. 在输出一致性测试完善后，合并 `exchange.py` 中旧版与流式导出的重复实现。
5. 对超大项目下的 Taxonomy 统计/预览和图像预取做性能基线。
6. 增加结构化日志和用户可理解的诊断信息，同时避免不必要地暴露本地路径。

## 1. 项目定位与设计背景

MultiAnno 是一个面向多视图、多模态影像的本地图像标注工具。它的核心目标不是做通用在线标注平台，而是服务于本地研究、数据整理和多源影像标注场景。

项目重点支持：

- 多个影像目录绑定为同一组 scene group。
- 主视图与增强视图同步浏览、对齐和裁剪。
- 多波段影像预览和渲染。
- 标注体系管理，包括类别、属性、统计和批量维护。
- 标注数据导入、导出和格式转换。
- 本地可视化多视图影像、标注和预测结果。
- 可选 AI 辅助标注，支持 SAM-3，以及基于 Ultralytics YOLO 的检测和分割模型。

### 设计取向

MultiAnno 是本地工具，因此优先考虑：

- 本地文件系统读写便利性。
- 多视图、多波段影像处理能力。
- 标注工作流的连续性。
- 对已有数据格式的兼容。
- 基础模式不依赖 AI/GPU 环境。

不优先考虑：

- 多用户在线协同。
- 云端权限体系。
- 大型数据库后端。
- 浏览器外的完整桌面打包体验。

## 2. 快速开始

### 2.1 环境要求

推荐环境：

- Python 3.10
- Node.js 18 或更高版本
- npm
- Conda 或 venv

基础模式只要求非 AI 后端依赖。AI 功能依赖 `torch`、`torchvision`、`ultralytics` 等额外包，应单独安装。

### 2.2 安装基础依赖

```bash
conda create -n multianno python=3.10
conda activate multianno

cd backend
pip install -r requirements.txt
cd ..

cd frontend
npm install
cd ..
```

### 2.3 安装 AI 依赖

AI 依赖是可选项。仅当需要 AI 辅助标注时安装。

```bash
cd backend
# 先根据 CUDA/CPU 环境安装匹配的 torch 和 torchvision
# 再安装其余 AI 依赖
pip install -r requirements-gpu.txt
cd ..
```

注意：`requirements-gpu.txt` 不保证自动安装正确的 PyTorch/CUDA 组合。请根据本机 CUDA 版本参考 PyTorch 官方说明安装。

### 2.4 启动

在项目根目录运行：

```bash
python app.py
```

启动器会：

- 检查基础后端依赖。
- 检查 `npm` 和 `frontend/node_modules`。
- 检查端口是否占用。
- 启动后端服务。
- 等待 `/api/health` 可访问。
- 启动前端 Vite 服务。
- 仅在提供 `--open-browser` 参数时打开浏览器。

默认地址：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8090`
- 后端健康检查：`http://127.0.0.1:8090/api/health`

停止服务：在启动终端按 `Ctrl+C`。

## 3. 整体架构

MultiAnno 采用前后端分离架构。

```text
app.py
  ├─ backend FastAPI, 127.0.0.1:8090
  └─ frontend Vite/React, 127.0.0.1:5173

frontend
  ├─ React UI
  ├─ Zustand 状态管理
  ├─ Canvas 标注与多视图交互
  └─ HTTP API client

backend
  ├─ FastAPI routers
  ├─ 本地文件系统访问
  ├─ 图像读取/预览/渲染
  ├─ 标注导入导出
  ├─ 统计与可视化
  └─ 可选 AI 模块
```

### 前端职责

前端负责：

- 用户界面和交互。
- 标注绘制、编辑、选择、撤销重做。
- 项目配置流程。
- 视图对齐交互。
- 前端状态管理。
- 调用后端 API。

前端不应该直接承担：

- 本地文件系统扫描。
- 大图像文件读取。
- TIFF/多波段影像解码。
- 数据集格式批量转换。
- 后端持久化写入。

### 后端职责

后端负责：

- 本地文件系统访问。
- 项目目录扫描。
- 图像预览生成。
- 标注 JSON 保存。
- 数据导入导出。
- 标注统计和修复。
- 本地可视化生成。
- AI 推理服务。

后端不应该承担：

- 前端 UI 状态。
- 当前工具选择状态。
- Canvas 层面的临时绘制状态。

## 4. 前端设计风格

MultiAnno 是工作型标注工具，不是营销站点。界面设计应保持：

- 信息密度适中。
- 工具栏清晰。
- 面板稳定，不因状态变化大幅跳动。
- 操作控件尽量可预测。
- 避免过度装饰。
- 优先服务重复标注和数据整理工作流。

### UI 风格原则

- 工具按钮优先使用图标加 tooltip。
- 工具状态要有明确激活态。
- 表单项要有清晰 label 和必要说明。
- 危险操作必须二次确认。
- 导出、批量删除、覆盖等操作必须给出明确后果。
- 不使用大面积营销式 hero、装饰卡片和纯视觉背景。

### 视觉约束

- 主工作区应优先留给图像和标注。
- 不要把页面级 section 设计成多层嵌套卡片。
- 按钮文字必须适配中英文。
- 小面板内不要使用过大的标题字号。
- 新增颜色应与现有主题协调。
- 暗色和亮色主题都要检查可读性。

## 5. 系统主要功能

### 5.1 项目创建与预加载

用户选择图像文件夹，系统分析文件、推断 stem、绑定视图，生成项目元数据。

相关模块：

- `frontend/src/components/modules/DataPreload.tsx`
- `frontend/src/components/modals/CreateProject.tsx`
- `frontend/src/components/modals/LoadProject.tsx`
- `backend/routers/project.py`

### 5.2 多视图对齐

用户通过 View Extent Check 调整增强视图与主视图之间的裁剪和几何变换。

关键概念：

- `view.crop` 表示百分比裁剪区域。
- `view.transform` 表示缩放和平移。
- `crop` 不应放在 `view.transform.crop`。

相关模块：

- `frontend/src/components/modules/ViewExtentCheck.tsx`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/store/useStore.ts`

### 5.3 同步标注工作区

主标注界面支持多视图图像、Canvas 标注、属性编辑、AI 面板和右侧属性面板。

相关模块：

- `frontend/src/components/modules/SyncAnnotation.tsx`
- `frontend/src/components/modules/annotation/CanvasView.tsx`
- `frontend/src/components/modules/annotation/LeftToolbar.tsx`
- `frontend/src/components/modules/annotation/RightPanel.tsx`
- `frontend/src/lib/canvasRenderer.ts`
- `frontend/src/lib/annotationUtils.ts`

### 5.4 标注体系与统计

支持类别、属性、统计图表、批量合并、删除、修复和同步。

相关模块：

- `frontend/src/components/modules/TaxonomyDashboard.tsx`
- `backend/routers/taxonomy.py`

### 5.5 数据导入导出

支持 MultiAnno、YOLO、COCO、VOC、mask 等格式的导入导出。

重要约束：

- 数据集导出如果目标目录非空，必须二次确认。
- 后端必须使用 `overwrite_target` 保护清空目录行为。

相关模块：

- `frontend/src/components/modules/DataImport.tsx`
- `frontend/src/components/modules/DataExport.tsx`
- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

### 5.6 本地可视化

支持按项目配置或本地目录加载多视图影像、标注和预测结果，生成预览或导出可视化图像。

相关模块：

- `frontend/src/components/modules/LocalVisualization.tsx`
- `backend/routers/vis.py`
- `backend/utils/visualizer.py`

### 5.7 AI 辅助标注

AI 是可选功能。基础模式不应依赖 `torch` 或 `ultralytics`。

相关模块：

- `frontend/src/components/modules/annotation/AIToolPanel.tsx`
- `frontend/src/components/modals/settings/AISettingsModal.tsx`
- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`

当 AI 依赖缺失时：

- 后端仍应正常启动。
- `/api/ai/vision/status` 应返回不可用状态。
- 其他 AI 操作应返回清晰错误，不影响非 AI 功能。

## 6. 核心数据契约

数据契约是 MultiAnno 最重要的稳定边界。任何 PR 如果修改数据结构，必须在 PR 描述中说明兼容策略。

主要定义位置：

- `frontend/src/config/contract.ts`
- `frontend/src/store/useStore.ts`
- `frontend/src/lib/projectUtils.ts`
- `backend/models.py`

### 6.1 project_meta.json

项目元数据描述工作空间、图像目录、视图配置、标注体系和 scene group。

核心结构：

```text
projectName
workspacePath
sceneGroups
folders
views
taxonomyClasses
taxonomyAttributes
```

### 6.2 folders

`folders` 表示参与项目的图像目录。

重要字段：

- `Id`
- `path`
- `suffix`
- `extension`
- `files in sceneGroups`
- `files Skipped`
- `files total`
- `image meta`

### 6.3 sceneGroups

`sceneGroups` 用于把多个目录中的同一场景文件关联起来。

推荐理解：

```text
sceneGroups[stem][folderPath] = fileName
```

其中：

- `stem` 是同一场景组的主键。
- `folderPath` 是某个图像目录。
- `fileName` 是该目录下对应的真实文件名。

### 6.4 views

`views` 表示主视图和增强视图的渲染、波段、对齐和裁剪配置。

核心字段：

- `id`
- `folder id`
- `bands`
- `renderMode`
- `isMain`
- `transform`
- `crop`
- `settings`

### 6.5 crop 与 transform

这是系统不变量。

`crop` 必须放在 view 顶层：

```json
{
  "crop": { "t": 0, "r": 100, "b": 100, "l": 0 }
}
```

`transform` 只放几何变换：

```json
{
  "transform": {
    "scaleX": 1,
    "scaleY": 1,
    "offsetX": 0,
    "offsetY": 0
  }
}
```

不要新增或写回：

```json
{
  "transform": {
    "crop": {}
  }
}
```

允许读取历史旧数据中的 `transform.crop` 作为 fallback，但新保存的数据必须写入 `view.crop`。

### 6.6 标注 JSON

每个场景组可以有对应标注 JSON。核心字段：

```text
version
flags
stem
projectName
imageDescription
imageNameMain
imageHeight
imageWidth
shapes
```

每个 shape 的核心字段：

```text
label
text
points
group_id
track_id
shape_type
flags
attributes
difficult
occluded
truncated
```

### 6.7 shape_type 命名规范

内部统一使用：

- `bbox`
- `polygon`
- `point`
- `line`
- `ellipse`
- `circle`
- `oriented_bbox`
- `cuboid`
- `keypoints`

重要规则：

- 矩形框统一命名为 `bbox`。
- 不应在 MultiAnno 内部新写出 `rectangle`。
- 允许兼容读取外部格式或历史数据中的 `rectangle`，读取后应规范化为 `bbox`。
- LabelMe 等外部格式如需 `rectangle`，应在专门转换层处理，不要污染内部契约。

### 6.8 坐标系

系统涉及多个坐标系：

- 主视图标注坐标系。
- 增强视图原始图像坐标系。
- 增强视图裁剪后坐标系。
- AI 推理输入坐标系。
- Canvas 屏幕显示坐标系。

修改 AI、视图对齐或 Canvas 渲染前，必须先确认坐标转换链路：

- `SyncAnnotation.tsx`
- `CanvasView.tsx`
- `canvasRenderer.ts`
- `ViewExtentCheck.tsx`

### 6.9 两阶段实例标注模型（设计基线）

为处理低帧率采集、遮挡、视角变化以及一段连续设施被分割成多个可见片段的问题，实例标注采用“两阶段”思路：

```text
阶段一：图像级标注
  可见几何 + 类别 + 属性 + 可选的局部 track_id
                    ↓
阶段二：空间一致性修正
  GPS/道路坐标/可选点云 → 合并、拆分、复核并生成 group_id
```

#### 阶段一：图像级标注

- 在每个 scene group 和多视图上下文中，标注当前图像里实际可见的 `bbox`、polygon、line 等几何，以及类别和属性。
- 可以使用 `track_id` 表示相邻场景中的局部连续轨迹，但不要求在这一阶段完成最终的全局实例身份。
- 几何应描述当前图像中的可见部分；不应为了保持身份而跨越遮挡区域绘制一个虚假的大框。
- sign、杆件等离散对象适合使用局部 track 作为候选关联；fence、护栏、墙体等连续设施允许先保留多个可见片段，后续再进行空间合并。
- 阶段一仍然遵循普通目标检测/属性标注流程，属性信息与实例关联信息相互独立。

第一阶段的核心交互约束已经确定如下；具体 UI、状态流转和 API 尚未实现，仍需在实现时补充细节和验证。

#### 第一阶段交互约束（已确认）

- ID 标注使用独立窗口，不直接改变普通标注主界面的工作模式。
- 第一版 ID 标注只选择一个模态，不同时展开多个模态。
- 固定显示三个时间槽：第 1 帧、第 2 帧、第 3 帧。第 2 帧是当前编辑帧，第 1、3 帧只读。
- 第 1、3 帧可以分别切换为“前一帧/后一帧”或“起始帧/终止帧”显示。
- 第 2 帧用于查找 scene group、选择对象、绘制和编辑 box。底部缩略图时间轴用于快速定位，不替代三个主画布的清晰显示。

键盘操作沿用主界面的习惯：

- `A/D`：切换当前编辑的 scene group。同步浏览时，三个时间槽随中心帧移动。
- `W/S`：在当前浏览模式下切换前后时间槽；在起止帧模式下对应切换/加载起始帧和终止帧。约定 `W` 向前/起始方向，`S` 向后/终止方向。
- 文本框、Track ID 输入框和其他可编辑控件获得焦点时，不应触发全局快捷键。

右侧面板尽量复用主标注界面的结构和交互：

- 保留 Object List、Object Editor、class、text、attributes 等基础内容。
- View Layers 改为只读，显示当前选中的单一模态，但不允许切换、添加或删除 view layer。
- 增加 Track ID Editor，用于选择已有 ID、创建/编辑 ID、管理 sequence、锁定起止对象、标记缺失帧，以及触发插值 + ReID。
- 当前 track、当前 sequence 和当前对象在切换 scene group 或浏览帧时不得无故重置；如果当前帧没有该对象，应保留 track 上下文并显示缺失状态。

单个 track 的操作流程：

1. 从 Track ID 列表选择已有 ID，或输入一个新的 Track ID。
2. 在第 2 帧选择对象，并将其设置为起始或终止候选。
3. 第 1、3 帧同步显示对应 scene group 和 box，但保持只读。
4. 用户双击高亮对象或点击锁定按钮后，正式锁定该端点。
5. 对另一个端点执行同样操作。
6. 可在任意其他 scene 中补充该 track 的观测 box，并将其作为关键帧。
7. 可以为同一个 Track ID 增加多个独立 sequence；每个 sequence 有自己的起始帧、终止帧、关键帧和缺失帧。
8. 用户触发插值 + ReID，生成的结果必须保留为待确认状态，不能覆盖已经人工确认的 box。

缺失标记属于某个 Track ID 的某个 sequence 和 scene，而不是全局删除对象。缺失帧不应自动生成空 box；插值也不应默认跨越缺失区间。`occluded`、`truncated` 和 track 缺失应保持为不同状态。

Track ID 支持实体和 part 的层级表达，例如：

```text
实体 ID：1
1-a：sign
1-b：pole
```

其中 `1` 是实体根 ID，`a/b` 是 part，`1-a` 和 `1-b` 是第一阶段的局部 Track ID。后续可以将多个 part 合并到同一个 `group_id`，也可以展开为 `1-1`、`1-2` 等数字后缀。字母到数字的转换必须是显式操作，并且不能因为删除或排序而自动重编号。

#### 稳定 shape ID 当前实现

- 每个 shape 使用持久化的 UUID `id`；新建、复制、拆分、AI 生成和导入的标注都会生成或保留稳定 ID。
- 标注保存接口和导入接口会再次校验缺失/重复 ID，避免只依赖前端状态。
- 旧 JSON 可以在设置中的 Data Update 选择“补全标注唯一 ID”进行扫描和二次确认；该操作按项目范围处理缺失及跨文件重复 ID。
- `track_id` 和后续 `group_id` 必须保留字符串语义，不能在编辑器或接口中强制转换为数字。
- 阶段二只增加 `group_id` 映射，不能破坏原有 `id`、`track_id`、sequence 和人工审核记录。

#### 阶段二：空间一致性修正

- 使用 GPS、道路/轨迹坐标和可选的点云或二维地图，对阶段一产生的局部轨迹和可见片段进行合并、拆分和人工复核。
- 生成或修正跨 scene、跨视图的全局 `group_id`，并检查重复关联、断裂关联和相互冲突的关联。
- 优先实现二维地图/俯视图中的空间校正；点云三维关联作为后续可选能力，因为当前点云配准可能存在误差。
- 空间修正默认不改写单张图像中的可见几何。若需要回写图像标注，必须是明确的用户操作，并保留可追溯的来源关系。

#### ID 语义

| ID | 语义 | 作用范围 |
| --- | --- | --- |
| `id` | 单个标注 shape 的唯一 ID | 一条图像标注记录 |
| `track_id` | 局部、连续场景中的轨迹 ID | 相邻 scene 或局部 tracklet |
| `group_id` | 现实中同一物理对象/设施的全局 ID | 跨 scene、跨视图的最终关联 |

对于 fence 这类连续设施，`group_id` 表示同一空间设施或设施段，不强制每张图像只有一个 shape；对于 sign 等离散对象，`group_id` 可以对应一个实际标志物。没有可靠跨图像身份时，可以只保存 `id`，不强行生成 `track_id` 或 `group_id`。

#### 空间关联层建议

每个 scene 的原生 JSON 继续保存图像级 shape。阶段二建议增加独立的空间关联层，而不是把跨图像身份塞入 `project_meta.json`。候选文件可以是 `<workspace>/annos/spatial_groups.json`；最终路径和具体结构需结合第一阶段交互设计确认。该层至少应能记录：

- `group_id`、类别和可选的设施类型。
- 来源引用，例如 `stem`、shape `id`、`track_id`。
- 二维地图几何，及后续可选的三维几何。
- GPS/道路坐标、关联置信度和人工复核状态。

#### 当前数据条件下的限制

- 0.5–1 FPS 时，常规逐帧 MOT/ReID 只能用于生成局部候选，不能作为全局身份的唯一依据。
- 点云配准不稳定时不能依赖精确像素投影或精确点重合，应使用容差范围、局部变换和人工修正。
- 最终用于目标检测训练的图像标签仍应是每张图像中的可见几何；`group_id` 是独立的跨图像关系，不应替代检测框。

## 7. 后端 API 分组

后端入口：

- `backend/main.py`

默认地址：

- `http://127.0.0.1:8090/api`

### `/api/health`

健康检查。启动器用于判断后端是否真正可用。

### `/api/fs`

本地文件系统访问。

主要职责：

- 文件夹浏览。
- 创建文件夹。
- 查询目录状态。

相关文件：

- `backend/routers/filesystem.py`

### `/api/project`

项目创建、扫描、预览、元数据读写。

相关文件：

- `backend/routers/project.py`

### `/api/annotations`

标注保存。

相关文件：

- `backend/routers/annotation.py`

### `/api/taxonomy`

类别、属性、统计、批处理。

相关文件：

- `backend/routers/taxonomy.py`

### `/api/exchange`

数据导入导出和格式转换。

相关文件：

- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

### `/api/vis`

本地可视化预览和导出。

相关文件：

- `backend/routers/vis.py`
- `backend/utils/visualizer.py`

### `/api/ai/vision`

AI 辅助标注。

相关文件：

- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`

AI 模块必须可选，不得阻止基础模式启动。

## 8. 文件与目录说明

### 根目录

| 路径 | 作用 |
| --- | --- |
| `app.py` | 一键启动器，负责依赖预检、端口检查、后端健康检查、前端启动和进程清理。 |
| `README.md` | 英文 README。 |
| `README_zh-CN.md` | 中文 README。 |
| `task_en.md` | 英文任务说明。 |
| `task_zh-CN.md` | 中文任务说明。 |
| `HANDOFF.md` | 英文项目交接与贡献指南。 |
| `HANDOFF_zh-CN.md` | 中文项目交接与贡献指南。 |
| `doc/` | 文档图片等静态资源。 |

### backend

| 路径 | 作用 |
| --- | --- |
| `backend/main.py` | FastAPI 应用入口和 router 注册。 |
| `backend/models.py` | Pydantic 请求模型。 |
| `backend/requirements.txt` | 基础后端依赖，不包含 AI/GPU 依赖。 |
| `backend/requirements-gpu.txt` | AI/GPU 额外依赖。 |
| `backend/requirements-raw.txt` | RAW/DNG 图像支持的可选依赖。 |
| `backend/routers/filesystem.py` | 文件系统浏览、创建文件夹、目录状态检查。 |
| `backend/routers/project.py` | 项目扫描、预览、元数据读写。 |
| `backend/routers/annotation.py` | 标注保存。 |
| `backend/routers/taxonomy.py` | 类别、属性、统计、修复和批量维护。 |
| `backend/routers/exchange.py` | 导入导出、数据集转换、split 文件生成。 |
| `backend/routers/vis.py` | 本地可视化 API。 |
| `backend/routers/ai.py` | AI API，必须支持依赖缺失时后端仍能启动。 |
| `backend/utils/format_converters.py` | 标注格式转换工具。 |
| `backend/utils/visualizer.py` | 本地可视化渲染逻辑。 |
| `backend/utils/ai_engine.py` | AI 推理引擎，依赖 torch/ultralytics。 |

### frontend

| 路径 | 作用 |
| --- | --- |
| `frontend/package.json` | 前端依赖和 npm scripts。 |
| `frontend/vite.config.ts` | Vite 配置，固定开发端口 5173。 |
| `frontend/src/main.tsx` | React 入口。 |
| `frontend/src/App.tsx` | 应用框架和模块挂载。 |
| `frontend/src/api/client.ts` | 前端 API client。 |
| `frontend/src/store/useStore.ts` | 全局 Zustand 状态。 |
| `frontend/src/store/useDialogStore.ts` | 全局确认弹窗状态。 |
| `frontend/src/store/useToastStore.ts` | Toast 状态。 |
| `frontend/src/config/contract.ts` | 前后端核心数据契约。 |
| `frontend/src/config/supportedFormats.ts` | 支持的任务、格式和 shape 映射。 |
| `frontend/src/config/colors.ts` | 颜色和 colormap 配置。 |
| `frontend/src/lib/projectUtils.ts` | project meta 读写和生成。 |
| `frontend/src/lib/annotationUtils.ts` | 标注加载/保存 payload 生成。 |
| `frontend/src/lib/canvasRenderer.ts` | Canvas 图像和标注绘制。 |
| `frontend/src/lib/cursors.ts` | 工具光标。 |
| `frontend/src/hooks/useAnnotationAutoSave.ts` | 标注自动保存。 |
| `frontend/src/hooks/useMetaAutoSave.ts` | 元数据自动保存。 |
| `frontend/src/hooks/useActionHistory.ts` | 撤销重做。 |
| `frontend/src/hooks/useBackendHealth.ts` | 后端健康状态。 |
| `frontend/src/locales/zh.json` | 中文文案。 |
| `frontend/src/locales/en.json` | 英文文案。 |

### frontend modules

| 路径 | 作用 |
| --- | --- |
| `DataPreload.tsx` | 数据预加载、文件夹和视图绑定。 |
| `ViewExtentCheck.tsx` | 多视图裁剪和对齐。 |
| `SyncAnnotation.tsx` | 主标注工作区。 |
| `DataImport.tsx` | 数据导入。 |
| `DataExport.tsx` | 数据导出。 |
| `TaxonomyDashboard.tsx` | 标注体系、统计和批量操作。 |
| `ProjectMetaDashboard.tsx` | 项目元数据查看。 |
| `LocalVisualization.tsx` | 本地可视化。 |

### annotation components

| 路径 | 作用 |
| --- | --- |
| `CanvasView.tsx` | 单个视图 Canvas 和叠加图层。 |
| `LeftToolbar.tsx` | 左侧工具栏。 |
| `RightPanel.tsx` | 右侧属性和设置面板。 |
| `AIToolPanel.tsx` | AI 标注面板。 |
| `ObjectEditorForm.tsx` | 标注对象编辑表单。 |
| `ClassFormPopover.tsx` | 类别快速编辑弹层。 |

### modals

| 路径 | 作用 |
| --- | --- |
| `FileExplorerDialog.tsx` | 本地文件/文件夹选择器。 |
| `CreateProject.tsx` | 创建项目弹窗。 |
| `LoadProject.tsx` | 加载项目弹窗。 |
| `GlobalConfirmDialog.tsx` | 全局确认弹窗。 |
| `settings/AISettingsModal.tsx` | AI 设置。 |
| `settings/ShortcutSettingsModal.tsx` | 快捷键设置。 |
| `settings/ViewLayoutSettingsModal.tsx` | 视图布局设置。 |

## 9. 开发约束与系统不变量

这些规则比局部实现更重要。任何 PR 都不应破坏。

### 9.1 基础模式不能依赖 AI

只安装 `backend/requirements.txt` 时，后端必须能启动。

AI 依赖缺失时：

- 不应影响项目创建。
- 不应影响标注。
- 不应影响导入导出。
- 不应影响本地可视化。
- AI 状态应显示不可用。

### 9.2 crop 只放在 view 顶层

新写出的 project meta 必须使用：

```text
view.crop
```

不要写：

```text
view.transform.crop
```

旧数据可兼容读取，但保存时应迁移到新契约。

### 9.3 bbox 命名必须统一

内部使用 `bbox`。不要在 MultiAnno 原生数据中写出 `rectangle`。

### 9.4 危险文件操作必须确认

以下操作必须有明确用户确认：

- 删除标注。
- 批量删除类别或属性。
- 数据集导出覆盖非空目录。
- 镜像同步清理目标目录。

后端也要有兜底保护，不能只依赖前端 UI。

### 9.5 前后端端口保持一致

当前约定：

- 后端：`127.0.0.1:8090`
- 前端：`127.0.0.1:5173`

如果修改端口，至少同步：

- `app.py`
- `frontend/vite.config.ts`
- `frontend/src/api/client.ts`
- README 或启动说明

### 9.6 数据格式修改必须兼容旧项目

如果改动：

- `project_meta.json`
- 标注 JSON
- shape 类型
- view 配置
- taxonomy 结构

必须说明：

- 旧数据如何读取。
- 新数据如何保存。
- 是否需要迁移。
- 是否影响导入导出。

### 9.7 不要做无关大重构

PR 应聚焦一个目标。不要把 bugfix、样式重构、格式化、依赖升级混在一起。

## 10. 本地开发与验证流程

### 10.1 启动开发环境

```bash
python app.py
```

### 10.2 前端检查

```bash
cd frontend
npm run lint
```

当前 `lint` 实际执行：

```bash
tsc --noEmit
```

### 10.3 后端语法检查

```bash
python -m compileall -q backend app.py
```

如果只改了部分文件，也可运行：

```bash
python -m py_compile backend/main.py backend/routers/exchange.py
```

### 10.4 手动验收建议

按改动范围选择：

- 项目创建：检查文件夹扫描、视图添加、project meta 保存。
- 视图对齐：检查 crop/transform 保存后重启恢复。
- 标注：检查绘制、编辑、切换 stem、自动保存。
- 导入导出：检查目标格式、类别顺序、shape 过滤。
- 本地可视化：检查预览图、融合图、导出图。
- AI：检查无 AI 依赖时基础启动，安装 AI 依赖时模型加载和推理。

## 11. PR 提交方式说明

### 11.1 分支命名建议

```text
fix/export-overwrite-confirm
fix/view-crop-contract
feat/local-visualization-layout
docs/handoff
refactor/annotation-payload
```

### 11.2 Commit message 建议

推荐格式：

```text
fix: prevent dataset export from deleting target dir without confirmation
feat: add optional AI dependency fallback
docs: update engineering handoff for contributors
refactor: normalize view crop contract
```

### 11.3 PR 描述模板

建议 PR 描述包含：

```md
## 修改内容
- 描述本次聚焦修改。

## 影响范围
- 前端：
- 后端：
- 数据格式：

## 是否涉及核心契约
- [ ] project_meta.json
- [ ] 标注 JSON
- [ ] shape_type
- [ ] view.crop / view.transform
- [ ] 导入导出格式
- [ ] AI 依赖

## 验证
- [ ] npm run lint
- [ ] python -m compileall -q backend app.py
- [ ] 手动验证：

## 兼容性说明
- 描述迁移或向后兼容影响。
```

### 11.4 Review 优先级

建议使用：

- P0：会导致数据丢失、无法启动、核心功能不可用、旧项目严重不兼容。
- P1：明显逻辑错误、重要体验问题、容易误操作、重要边界没兜住。
- P2：代码清理、文案优化、轻微视觉或结构优化。

## 12. PR 验收清单

提交前至少自查：

- 是否只改了与目标相关的文件。
- 是否影响基础模式启动。
- 是否影响 AI 可选性。
- 是否影响 project meta 兼约。
- 是否影响 `bbox` 命名规范。
- 是否影响导入导出结果。
- 是否引入新的硬编码路径或端口。
- 是否新增文案但漏了中英文 locale。
- 是否跑过必要检查。

对于高风险改动，建议附上前后对比说明。

## 13. AI 协作指南

本节面向 AI 编程助手，也适用于人类开发者快速定位。

### 13.1 开始修改前先读

通用任务先读：

- `HANDOFF_zh-CN.md`
- `HANDOFF.md`
- `README.md` 或 `README_zh-CN.md`
- 当前 issue 或分支附带的相关 review 文档
- 相关模块源码

涉及数据契约先读：

- `frontend/src/config/contract.ts`
- `frontend/src/store/useStore.ts`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/lib/annotationUtils.ts`
- `backend/models.py`

涉及导入导出先读：

- `frontend/src/components/modules/DataImport.tsx`
- `frontend/src/components/modules/DataExport.tsx`
- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

涉及 Canvas/标注先读：

- `frontend/src/components/modules/SyncAnnotation.tsx`
- `frontend/src/components/modules/annotation/CanvasView.tsx`
- `frontend/src/lib/canvasRenderer.ts`

涉及 AI 先读：

- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`
- `frontend/src/components/modules/annotation/AIToolPanel.tsx`
- `frontend/src/components/modals/settings/AISettingsModal.tsx`

### 13.2 AI 修改代码时必须遵守

- 不要把 AI 依赖变成基础依赖。
- 不要把 `crop` 写进 `transform`。
- 不要把内部 `bbox` 改回 `rectangle`。
- 不要移除危险操作确认。
- 不要大范围格式化无关文件。
- 不要修改用户已有的无关改动。
- 不要凭空新增依赖，除非必要且说明原因。
- 修改数据结构时必须写兼容旧数据的逻辑。

### 13.3 AI Review 输出约定

如果要求生成 review 文档，应写入任务指定的 Markdown 路径，并按优先级组织：

```text
P0：必须发版前修复
P1：建议发版前修复
P2：可后续优化
```

每个问题尽量包含：

- 文件路径。
- 相关代码位置。
- 问题原因。
- 可能后果。
- 建议修复方式。

## 14. 已知高风险模块

以下模块改动前应特别谨慎：

- `frontend/src/store/useStore.ts`
- `frontend/src/config/contract.ts`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/lib/annotationUtils.ts`
- `frontend/src/components/modules/SyncAnnotation.tsx`
- `frontend/src/components/modules/ViewExtentCheck.tsx`
- `frontend/src/components/modules/DataExport.tsx`
- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`
- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`

这些文件通常涉及核心数据、坐标转换、导入导出或启动兼容性。

## 15. 已知限制与 Roadmap

当前项目仍有一些适合后续贡献的方向：

- 更完整的端到端测试。
- 更稳定的发布版前端托管方式。
- 前端拆包优化：当前生产构建提示 JavaScript chunk 超过 500 kB；`projectUtils.ts` 同时被静态和动态导入，因此动态导入不会形成独立 chunk。
- 导入导出整理：`backend/routers/exchange.py` 中流式与旧同步实现并存；应在输出一致性测试完善后再合并。
- 更系统的 API 文档。
- 更完整的示例数据。
- 更清晰的 AI 安装指南。
- 大文件和超大图像的性能优化。
- 更完善的错误提示和日志系统。
- 导入导出格式的更多兼容性测试。
- UI 细节统一和可访问性优化。

## 16. 给新贡献者的建议

适合首次贡献的方向：

- README 和文档完善。
- 错误提示文案优化。
- 小范围 UI 对齐。
- 增加非破坏性的校验。
- 修复明确 review 文档中标出的 P1/P2 问题。

不建议首次贡献直接修改：

- 标注坐标转换。
- project meta 结构。
- 导入导出核心转换。
- AI engine 底层逻辑。
- 全局状态结构。

## 17. 维护原则

MultiAnno 的长期可维护性依赖几个原则：

- 数据契约稳定。
- 基础模式轻量可启动。
- AI 能力可选增强。
- 文件操作安全优先。
- 新功能遵守现有工作流。
- 文档和代码同步演进。

如果一个改动让系统更强但更难启动、更难理解或更容易丢数据，应优先重新设计。
