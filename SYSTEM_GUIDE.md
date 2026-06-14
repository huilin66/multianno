# MultiAnno System Guide

This document is written for new contributors, PR reviewers, and AI coding agents. It explains the system design, module boundaries, data contracts, contribution workflow, and invariants that must not be broken.

Recommended reading order:

1. Project Purpose and Design Background
2. Quick Start
3. Architecture Overview
4. Core Data Contracts
5. File and Directory Map
6. Development Invariants
7. PR Workflow and Review Checklist
8. AI Collaboration Guide

## 1. Project Purpose and Design Background

MultiAnno is a local image annotation tool for multi-view and multi-modal imagery. It is designed for research and dataset preparation workflows where several image sources belong to the same scene group.

The project focuses on:

- Binding multiple image folders into synchronized scene groups.
- Viewing, aligning, cropping, and comparing multiple views.
- Previewing and rendering multi-band imagery.
- Managing annotation classes, attributes, statistics, and batch cleanup.
- Importing and exporting annotations in common dataset formats.
- Visualizing multi-view images, annotations, and model predictions locally.
- Providing optional AI-assisted annotation with SAM/SAM3-style models.

### Design Direction

MultiAnno is a local-first tool. It prioritizes:

- Convenient local filesystem access.
- Multi-view and multi-band image processing.
- Continuity of annotation workflows.
- Compatibility with existing annotation formats.
- A lightweight basic mode that does not require AI or GPU dependencies.

It does not currently prioritize:

- Multi-user online collaboration.
- Cloud authentication or permission systems.
- A large database backend.
- A fully packaged desktop application.

## 2. Quick Start

### 2.1 Environment

Recommended:

- Python 3.10
- Node.js 18 or later
- npm
- Conda or venv

Basic mode requires only non-AI backend dependencies. AI features require extra packages such as `torch`, `torchvision`, and `ultralytics`.

### 2.2 Install Basic Dependencies

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

### 2.3 Install AI Dependencies

AI support is optional. Install it only if you need AI-assisted annotation.

```bash
cd backend
# Install torch and torchvision for your CUDA/CPU environment first.
# Then install the remaining AI dependencies.
pip install -r requirements-gpu.txt
cd ..
```

Note: `requirements-gpu.txt` does not guarantee the correct PyTorch/CUDA combination for your machine. Follow the official PyTorch installation instructions.

### 2.4 Start the App

Run from the repository root:

```bash
python app.py
```

The launcher will:

- Check basic backend dependencies.
- Check `npm` and `frontend/node_modules`.
- Check required ports.
- Start the backend.
- Wait for `/api/health`.
- Start the frontend Vite server.
- Open the browser.

Default addresses:

- Frontend: `http://127.0.0.1:5173`
- Backend: `http://127.0.0.1:8090`
- Backend health check: `http://127.0.0.1:8090/api/health`

Press `Ctrl+C` in the launcher terminal to stop both services.

## 3. Architecture Overview

MultiAnno uses a frontend/backend architecture.

```text
app.py
  - backend FastAPI, 127.0.0.1:8090
  - frontend Vite/React, 127.0.0.1:5173

frontend
  - React UI
  - Zustand state management
  - Canvas annotation and multi-view interaction
  - HTTP API client

backend
  - FastAPI routers
  - Local filesystem access
  - Image reading, preview, and rendering
  - Annotation import/export
  - Statistics and visualization
  - Optional AI module
```

### Frontend Responsibilities

The frontend owns:

- UI and interaction.
- Annotation drawing, editing, selection, undo, and redo.
- Project configuration workflow.
- View alignment interaction.
- Client-side state management.
- Backend API calls.

The frontend should not directly own:

- Local filesystem scanning.
- Large image decoding.
- TIFF or multi-band image parsing.
- Batch dataset conversion.
- Persistent backend writes.

### Backend Responsibilities

The backend owns:

- Local filesystem access.
- Project folder scanning.
- Image preview generation.
- Annotation JSON writes.
- Dataset import and export.
- Annotation statistics and repair.
- Local visualization.
- AI inference service.

The backend should not own:

- UI state.
- Active drawing tool state.
- Temporary canvas drawing state.

## 4. Frontend Design Style

MultiAnno is a work-focused annotation tool, not a marketing website.

The UI should remain:

- Information-dense but readable.
- Stable during repeated annotation work.
- Clear in active tool states.
- Predictable in form and panel behavior.
- Free from excessive decoration.
- Optimized for image and annotation workspace area.

### UI Principles

- Prefer icon buttons with tooltips for tools.
- Make active states visually explicit.
- Use clear labels for form controls.
- Confirm destructive actions.
- Explain the consequence of export, deletion, overwrite, and cleanup operations.
- Avoid decorative page sections that compete with the annotation workspace.

### Visual Constraints

- Keep the main workspace reserved for images and annotations.
- Avoid nested card-heavy layouts.
- Ensure labels fit in both English and Chinese.
- Use compact headings inside side panels.
- Check contrast in both light and dark themes.

## 5. Main Features

### 5.1 Project Creation and Data Preload

Users select image folders, analyze files, infer stems, bind views, and generate project metadata.

Relevant files:

- `frontend/src/components/modules/DataPreload.tsx`
- `frontend/src/components/modals/CreateProject.tsx`
- `frontend/src/components/modals/LoadProject.tsx`
- `backend/routers/project.py`

### 5.2 Multi-View Alignment

Users align augmented views with the main view by adjusting crop and geometric transform.

Key concepts:

- `view.crop` stores percentage crop bounds.
- `view.transform` stores scale and offset.
- `crop` must not be written to `view.transform.crop`.

Relevant files:

- `frontend/src/components/modules/ViewExtentCheck.tsx`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/store/useStore.ts`

### 5.3 Synchronized Annotation Workspace

The main workspace supports multi-view images, canvas annotation, object editing, attributes, AI panel, and right-side settings.

Relevant files:

- `frontend/src/components/modules/SyncAnnotation.tsx`
- `frontend/src/components/modules/annotation/CanvasView.tsx`
- `frontend/src/components/modules/annotation/LeftToolbar.tsx`
- `frontend/src/components/modules/annotation/RightPanel.tsx`
- `frontend/src/lib/canvasRenderer.ts`
- `frontend/src/lib/annotationUtils.ts`

### 5.4 Taxonomy and Statistics

Supports class management, attributes, statistics, batch merge, delete, repair, and synchronization.

Relevant files:

- `frontend/src/components/modules/TaxonomyDashboard.tsx`
- `backend/routers/taxonomy.py`

### 5.5 Import and Export

Supports MultiAnno, YOLO, COCO, VOC, masks, and related conversion workflows.

Important constraints:

- Dataset export must confirm before overwriting a non-empty target directory.
- Backend destructive target cleanup must be protected by `overwrite_target`.

Relevant files:

- `frontend/src/components/modules/DataImport.tsx`
- `frontend/src/components/modules/DataExport.tsx`
- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

### 5.6 Local Visualization

Supports project-based or local-folder-based preview of multi-view images, annotations, and prediction results.

Relevant files:

- `frontend/src/components/modules/LocalVisualization.tsx`
- `backend/routers/vis.py`
- `backend/utils/visualizer.py`

### 5.7 AI-Assisted Annotation

AI is optional. Basic mode must not require `torch` or `ultralytics`.

Relevant files:

- `frontend/src/components/modules/annotation/AIToolPanel.tsx`
- `frontend/src/components/modals/settings/AISettingsModal.tsx`
- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`

If AI dependencies are missing:

- The backend must still start.
- `/api/ai/vision/status` should report unavailable status.
- AI endpoints should return clear errors without affecting non-AI features.

## 6. Core Data Contracts

Data contracts are the most important stability boundary in MultiAnno. If a PR changes data structures, it must explain compatibility.

Primary files:

- `frontend/src/config/contract.ts`
- `frontend/src/store/useStore.ts`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/lib/annotationUtils.ts`
- `backend/models.py`

### 6.1 project_meta.json

Project metadata describes workspace paths, image folders, views, taxonomy, and scene groups.

Core fields:

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

`folders` represents image folders in a project.

Important fields:

- `Id`
- `path`
- `suffix`
- `extension`
- `files in sceneGroups`
- `files Skipped`
- `files total`
- `image meta`

### 6.3 sceneGroups

`sceneGroups` links files from different folders into the same scene.

```text
sceneGroups[stem][folderPath] = fileName
```

- `stem` is the scene group key.
- `folderPath` is an image folder.
- `fileName` is the exact file under that folder.

### 6.4 views

`views` describes main and augmented views.

Important fields:

- `id`
- `folder id`
- `bands`
- `renderMode`
- `isMain`
- `transform`
- `crop`
- `settings`

### 6.5 crop and transform

This is a system invariant.

`crop` lives on the view object:

```json
{
  "crop": { "t": 0, "r": 100, "b": 100, "l": 0 }
}
```

`transform` only stores geometry:

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

Do not write:

```json
{
  "transform": {
    "crop": {}
  }
}
```

Legacy `transform.crop` may be read as fallback, but newly saved data must use `view.crop`.

### 6.6 Annotation JSON

Each scene may have a corresponding annotation JSON.

Core fields:

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

Shape fields:

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

### 6.7 shape_type Naming

Internal names:

- `bbox`
- `polygon`
- `point`
- `line`
- `ellipse`
- `circle`
- `oriented_bbox`
- `cuboid`
- `keypoints`

Rules:

- Bounding boxes are named `bbox`.
- Do not write `rectangle` in native MultiAnno data.
- Legacy or external `rectangle` may be read and normalized to `bbox`.
- Format-specific names should stay in conversion layers only.

### 6.8 Coordinate Systems

MultiAnno uses several coordinate systems:

- Main view annotation coordinates.
- Augmented view raw image coordinates.
- Augmented view cropped coordinates.
- AI inference input coordinates.
- Canvas screen coordinates.

Before changing AI, alignment, or canvas rendering, inspect:

- `SyncAnnotation.tsx`
- `CanvasView.tsx`
- `canvasRenderer.ts`
- `ViewExtentCheck.tsx`

## 7. Backend API Groups

Backend entry:

- `backend/main.py`

Default base URL:

- `http://127.0.0.1:8090/api`

### `/api/health`

Health check endpoint used by the launcher.

### `/api/fs`

Local filesystem access.

Relevant file:

- `backend/routers/filesystem.py`

### `/api/project`

Project scanning, preview, metadata load/save.

Relevant file:

- `backend/routers/project.py`

### `/api/annotations`

Annotation save endpoint.

Relevant file:

- `backend/routers/annotation.py`

### `/api/taxonomy`

Class, attribute, statistics, repair, and batch maintenance.

Relevant file:

- `backend/routers/taxonomy.py`

### `/api/exchange`

Import/export and format conversion.

Relevant files:

- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

### `/api/vis`

Local visualization preview and export.

Relevant files:

- `backend/routers/vis.py`
- `backend/utils/visualizer.py`

### `/api/ai/vision`

Optional AI-assisted annotation.

Relevant files:

- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`

AI must remain optional.

## 8. File and Directory Map

### Root

| Path | Purpose |
| --- | --- |
| `app.py` | Launcher with dependency checks, port checks, health checks, frontend startup, and process cleanup. |
| `README.md` | English README. |
| `README_zh-CN.md` | Chinese README. |
| `task_en.md` | English task description. |
| `task_zh-CN.md` | Chinese task description. |
| `SYSTEM_GUIDE.md` | English system guide. |
| `SYSTEM_GUIDE_zh-CN.md` | Chinese system guide. |
| `demo/` | Demos, review notes, helper files, and sample assets. |
| `doc/` | Static documentation assets. |

### Backend

| Path | Purpose |
| --- | --- |
| `backend/main.py` | FastAPI app entry and router registration. |
| `backend/models.py` | Pydantic request models. |
| `backend/requirements.txt` | Basic backend dependencies, excluding AI/GPU dependencies. |
| `backend/requirements-gpu.txt` | Optional AI/GPU dependencies. |
| `backend/routers/filesystem.py` | File browser, mkdir, directory status. |
| `backend/routers/project.py` | Project scan, preview, metadata load/save. |
| `backend/routers/annotation.py` | Annotation save. |
| `backend/routers/taxonomy.py` | Taxonomy, attributes, stats, repair, batch maintenance. |
| `backend/routers/exchange.py` | Import/export, dataset conversion, split files. |
| `backend/routers/vis.py` | Local visualization API. |
| `backend/routers/ai.py` | AI API with optional dependency fallback. |
| `backend/utils/format_converters.py` | Annotation format conversion utilities. |
| `backend/utils/visualizer.py` | Local visualization rendering. |
| `backend/utils/ai_engine.py` | AI inference engine. Depends on torch/ultralytics. |

### Frontend

| Path | Purpose |
| --- | --- |
| `frontend/package.json` | Frontend dependencies and npm scripts. |
| `frontend/vite.config.ts` | Vite config with fixed dev port 5173. |
| `frontend/src/main.tsx` | React entry. |
| `frontend/src/App.tsx` | Application shell. |
| `frontend/src/api/client.ts` | Backend API client. |
| `frontend/src/store/useStore.ts` | Global Zustand store. |
| `frontend/src/store/useDialogStore.ts` | Global confirm dialog store. |
| `frontend/src/store/useToastStore.ts` | Toast store. |
| `frontend/src/config/contract.ts` | Core frontend/backend data contracts. |
| `frontend/src/config/supportedFormats.ts` | Supported tasks, formats, and shape mappings. |
| `frontend/src/config/colors.ts` | Colors and colormap settings. |
| `frontend/src/lib/projectUtils.ts` | Project meta load/save generation. |
| `frontend/src/lib/annotationUtils.ts` | Annotation load/save payload helpers. |
| `frontend/src/lib/canvasRenderer.ts` | Canvas rendering. |
| `frontend/src/hooks/` | Autosave, backend health, history, and helper hooks. |
| `frontend/src/locales/` | English and Chinese UI strings. |

### Frontend Modules

| Path | Purpose |
| --- | --- |
| `DataPreload.tsx` | Data preload, folder binding, view binding. |
| `ViewExtentCheck.tsx` | Multi-view crop and alignment. |
| `SyncAnnotation.tsx` | Main annotation workspace. |
| `DataImport.tsx` | Data import. |
| `DataExport.tsx` | Data export. |
| `TaxonomyDashboard.tsx` | Taxonomy, stats, batch operations. |
| `ProjectMetaDashboard.tsx` | Project metadata viewer. |
| `LocalVisualization.tsx` | Local visualization workflow. |

## 9. Development Invariants

These rules are more important than local implementation details.

### 9.1 Basic Mode Must Not Depend on AI

The backend must start after installing only `backend/requirements.txt`.

Missing AI dependencies must not break:

- Project creation.
- Annotation.
- Import/export.
- Local visualization.
- Statistics.

### 9.2 crop Lives on view

New project metadata must use:

```text
view.crop
```

Do not write:

```text
view.transform.crop
```

### 9.3 bbox Naming Is Canonical

Use `bbox` internally. Do not write `rectangle` in native MultiAnno data.

### 9.4 Destructive File Operations Require Confirmation

The following operations require clear confirmation:

- Delete annotations.
- Batch delete classes or attributes.
- Export dataset over a non-empty target directory.
- Mirror cleanup.

Backend code must also enforce safety. Do not rely only on frontend UI.

### 9.5 Ports Must Stay in Sync

Current convention:

- Backend: `127.0.0.1:8090`
- Frontend: `127.0.0.1:5173`

If changed, update:

- `app.py`
- `frontend/vite.config.ts`
- `frontend/src/api/client.ts`
- README files

### 9.6 Data Format Changes Need Compatibility

If changing project metadata, annotation JSON, shape naming, view config, or taxonomy structure, explain:

- How old data is read.
- How new data is saved.
- Whether migration is needed.
- Whether import/export is affected.

### 9.7 Avoid Unrelated Large Refactors

Keep each PR focused. Do not mix bug fixes, formatting, UI rewrites, dependency upgrades, and unrelated cleanup.

## 10. Local Development and Validation

### 10.1 Start

```bash
python app.py
```

### 10.2 Frontend Check

```bash
cd frontend
npm run lint
```

This currently runs:

```bash
tsc --noEmit
```

### 10.3 Backend Syntax Check

```bash
python -m compileall -q backend app.py
```

For targeted checks:

```bash
python -m py_compile backend/main.py backend/routers/exchange.py
```

### 10.4 Manual Validation

Choose validation based on the change:

- Project creation: folder scan, view add, project meta save.
- View alignment: crop/transform save and reload.
- Annotation: draw, edit, switch stem, autosave.
- Import/export: format, class order, shape filter.
- Local visualization: preview, merge, export.
- AI: basic startup without AI deps, model load and inference with AI deps.

## 11. PR Workflow

### 11.1 Branch Names

Examples:

```text
fix/export-overwrite-confirm
fix/view-crop-contract
feat/local-visualization-layout
docs/system-guide
refactor/annotation-payload
```

### 11.2 Commit Messages

Examples:

```text
fix: prevent dataset export from deleting target dir without confirmation
feat: add optional AI dependency fallback
docs: add system guide for contributors
refactor: normalize view crop contract
```

### 11.3 PR Template

```md
## Changes
- 

## Impact
- Frontend:
- Backend:
- Data format:

## Core Contracts
- [ ] project_meta.json
- [ ] Annotation JSON
- [ ] shape_type
- [ ] view.crop / view.transform
- [ ] Import/export formats
- [ ] AI dependencies

## Validation
- [ ] npm run lint
- [ ] python -m compileall -q backend app.py
- [ ] Manual validation:

## Compatibility
- 
```

### 11.4 Review Severity

- P0: data loss, startup failure, broken core workflow, severe compatibility break.
- P1: important logic bug, unsafe workflow, major UX issue, missing guard.
- P2: cleanup, wording, minor UI polish, low-risk structure improvement.

## 12. PR Acceptance Checklist

Before submitting:

- The PR is focused.
- Basic mode still starts.
- AI remains optional.
- Project metadata contract is preserved.
- `bbox` naming is preserved.
- Import/export behavior is checked if relevant.
- No new hardcoded local path was added.
- Port changes are synchronized if any.
- New UI text has both English and Chinese locale entries.
- Required checks were run.

## 13. AI Collaboration Guide

This section is for AI coding agents and human contributors who need quick orientation.

### 13.1 Read First

General tasks:

- `SYSTEM_GUIDE.md`
- `README.md` or `README_zh-CN.md`
- Relevant review notes in `demo/`
- Relevant source modules

Data contract tasks:

- `frontend/src/config/contract.ts`
- `frontend/src/store/useStore.ts`
- `frontend/src/lib/projectUtils.ts`
- `frontend/src/lib/annotationUtils.ts`
- `backend/models.py`

Import/export tasks:

- `frontend/src/components/modules/DataImport.tsx`
- `frontend/src/components/modules/DataExport.tsx`
- `backend/routers/exchange.py`
- `backend/utils/format_converters.py`

Canvas/annotation tasks:

- `frontend/src/components/modules/SyncAnnotation.tsx`
- `frontend/src/components/modules/annotation/CanvasView.tsx`
- `frontend/src/lib/canvasRenderer.ts`

AI tasks:

- `backend/routers/ai.py`
- `backend/utils/ai_engine.py`
- `frontend/src/components/modules/annotation/AIToolPanel.tsx`
- `frontend/src/components/modals/settings/AISettingsModal.tsx`

### 13.2 AI Must Follow

- Do not make AI dependencies mandatory for basic mode.
- Do not write `crop` into `transform`.
- Do not rename internal `bbox` back to `rectangle`.
- Do not remove destructive-operation confirmations.
- Do not format unrelated files.
- Do not overwrite unrelated user changes.
- Do not add dependencies without explaining why.
- Add compatibility logic when changing data structures.

### 13.3 AI Review Output

Review notes should go to `demo/*_gpt.md` and use:

```text
P0: must fix before release
P1: should fix before release
P2: can improve later
```

Each finding should include:

- File path.
- Relevant code location.
- Cause.
- Consequence.
- Suggested fix.

## 14. High-Risk Modules

Be careful before changing:

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

These files often affect data contracts, coordinate transforms, import/export, startup compatibility, or AI optionality.

## 15. Known Limits and Roadmap

Future contribution areas:

- End-to-end tests.
- More stable release-mode frontend hosting.
- More complete API documentation.
- Better sample datasets.
- Clearer AI installation guide.
- Large image performance improvements.
- Better error messages and logging.
- More import/export compatibility tests.
- UI polish and accessibility.

## 16. Suggestions for New Contributors

Good first contributions:

- Documentation improvements.
- Error message improvements.
- Small UI alignment fixes.
- Non-destructive validation improvements.
- P1/P2 issues from review notes.

Avoid as a first contribution:

- Annotation coordinate transforms.
- Project metadata structure.
- Core import/export conversion.
- AI engine internals.
- Global state structure.

## 17. Maintenance Principles

Long-term maintainability depends on:

- Stable data contracts.
- Lightweight basic startup.
- Optional AI enhancement.
- Safe file operations.
- Features that fit existing workflows.
- Documentation that evolves with code.

If a change makes the system more powerful but harder to start, harder to understand, or easier to lose data with, redesign it first.
