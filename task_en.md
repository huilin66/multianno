# MultiAnno Task Checklist
[English](task_en.md) | [简体中文](task_zh-CN.md)

## Part 1: Project File Overview

### Root Directory
| File | Description |
|------|-------------|
| `app.py` | One-click launcher: starts FastAPI backend (8090) + Vite frontend (5173), auto-opens browser |
| `README.md` | Project introduction, installation guide, quick start |
| `README_zh-CN.md` | Chinese README |
| `task.md` | Task checklist (Chinese) |

### backend/ — FastAPI Backend
| File | Description |
|------|-------------|
| `backend/main.py` | FastAPI entry point, CORS config, registers 7 router modules |
| `backend/models.py` | Pydantic request/response models (AI, export, import, annotation, taxonomy, etc.) |
| `backend/requirements.txt` | CPU-only dependencies |
| `backend/requirements-gpu.txt` | GPU dependencies (includes SAM 3) |
| `backend/routers/ai.py` | SAM 3 model init, interactive inference, auto inference, status queries |
| `backend/routers/annotation.py` | Annotation CRUD, batch save, statistics |
| `backend/routers/exchange.py` | Format conversion: YOLO/COCO/VOC ↔ MultiAnno JSON |
| `backend/routers/filesystem.py` | File browsing, folder creation, file content reading |
| `backend/routers/project.py` | Project metadata save/load, folder scan analysis, suffix inference |
| `backend/routers/taxonomy.py` | Class merge/delete, attribute batch operations, data repair |
| `backend/routers/vis.py` | Visualization preview rendering, batch export (Matplotlib) |
| `backend/utils/ai_engine.py` | SAM 3 model wrapper (loading, inference, auto-annotation) |
| `backend/utils/format_converters.py` | YOLO/COCO/VOC/Mask ↔ MultiAnno bidirectional conversion |
| `backend/utils/visualizer.py` | Server-side Matplotlib rendering engine |

### frontend/src/ — React 19 Frontend

#### Entry & Config
| File | Description |
|------|-------------|
| `main.tsx` | React DOM mount entry |
| `App.tsx` | Root layout: top Header (menu/project info/settings/theme/language toggle), Dialog container, main workspace |
| `i18n.ts` | i18next init, registers en/zh translation resources |
| `index.css` | Tailwind v4 base styles, light/dark CSS variables, custom scrollbar |

#### API Layer
| File | Description |
|------|-------------|
| `api/client.ts` | Fetch wrapper for all backend API calls (POST/GET), including streaming export and image prefetch |

#### Configuration
| File | Description |
|------|-------------|
| `config/colors.ts` | Color mapping table (pseudo-color schemes) and taxonomy palette |
| `config/contract.ts` | `ProjectMetaContract` TypeScript type definitions |
| `config/supportedFormats.ts` | Task types (detection/segmentation/change detection), format details, shape type mapping, image extension mapping |

#### State Management
| File | Description |
|------|-------------|
| `store/useStore.ts` | Zustand global state (persist to localStorage): project, views, annotations, taxonomy, settings, viewport |
| `store/useDialogStore.ts` | Global confirm dialog state management |
| `store/useToastStore.ts` | Toast notification state management (info/success/warning/error) |

#### Hooks
| File | Description |
|------|-------------|
| `hooks/useActionHistory.ts` | Undo/redo stack for annotation operations |
| `hooks/useAnnotationAutoSave.ts` | Debounced annotation auto-save |
| `hooks/useBackendHealth.ts` | Backend health check, auto-reconnect with exponential backoff, Toast notifications |
| `hooks/useMetaAutoSave.ts` | Project metadata auto-save |
| `hooks/useToolNames.ts` | Tool name lookup helper |

#### Utility Libraries
| File | Description |
|------|-------------|
| `lib/annotationUtils.ts` | Batch loading annotation JSON files |
| `lib/canvasRenderer.ts` | HTML5 Canvas rendering engine (image layers, annotation shapes, overlay effects) |
| `lib/cursors.ts` | Custom cursor styles (crosshair, grab, focus, etc.) |
| `lib/projectUtils.ts` | `generateProjectMetaConfig()` generates project metadata snapshot for export |
| `lib/utils.ts` | `cn()` className merge utility |

#### Internationalization
| File | Description |
|------|-------------|
| `locales/en.json` | English translation resources |
| `locales/zh.json` | Chinese translation resources |

#### UI Base Components
| File | Description |
|------|-------------|
| `components/ui/alert.tsx` | Alert/banner component |
| `components/ui/button.tsx` | Button |
| `components/ui/card.tsx` | Card container |
| `components/ui/checkbox.tsx` | Checkbox |
| `components/ui/dialog.tsx` | Modal dialog |
| `components/ui/dropdown-menu.tsx` | Dropdown menu |
| `components/ui/input.tsx` | Text input |
| `components/ui/label.tsx` | Label text |
| `components/ui/legend.tsx` | Legend bar (shared component) |
| `components/ui/popover.tsx` | Popover |
| `components/ui/scroll-area.tsx` | Custom scroll area |
| `components/ui/select.tsx` | Dropdown select |
| `components/ui/separator.tsx` | Divider |
| `components/ui/slider.tsx` | Slider |
| `components/ui/switch.tsx` | Toggle switch |
| `components/ui/tabs.tsx` | Tabs |
| `components/ui/toast.tsx` | Toast notification container (slide-in animation, bottom-right stack) |
| `components/ui/tooltip.tsx` | Tooltip |

#### Modal Components
| File | Description |
|------|-------------|
| `components/modals/CreateProject.tsx` | New project modal (name + metadata path) |
| `components/modals/LoadProject.tsx` | Load project modal |
| `components/modals/FileExplorerDialog.tsx` | Server-side file browser dialog (breadcrumb nav, history, new folder) |
| `components/modals/GlobalConfirmDialog.tsx` | Global confirm dialog |
| `components/modals/settings/AISettingsModal.tsx` | AI model settings (model type/path/confidence) |
| `components/modals/settings/ShortcutSettingsModal.tsx` | Keyboard shortcut binding settings |
| `components/modals/settings/ViewLayoutSettingsModal.tsx` | View grid layout settings |

#### Feature Modules
| File | Description |
|------|-------------|
| `components/modules/DataPreload.tsx` | **View Setup**: 3-step wizard (folders → views → workspace), with auto suffix inference, channel/colormap config |
| `components/modules/ViewExtentCheck.tsx` | **View Alignment**: Multi-view registration (crop/scale/offset), with Canvas interaction, AI auto-align entry |
| `components/modules/SyncAnnotation.tsx` | **Annotation Workspace** (core): Multi-view sync annotation, AI inference integration, undo/redo, layer management |
| `components/modules/TaxonomyDashboard.tsx` | **Taxonomy Manager**: Class/attribute CRUD, batch merge/delete, YAML/TXT import/export, statistics charts |
| `components/modules/ProjectMetaDashboard.tsx` | **Project Metadata**: Read-only display of folder/view config, JSON export |
| `components/modules/DataImport.tsx` | **Data Import**: 3-step wizard (task format → source data → target workspace), supports YOLO/COCO/MultiAnno/Mask |
| `components/modules/DataExport.tsx` | **Data Export**: 6-step wizard (task → naming → images → split → shapes → target), with dataset splitting |
| `components/modules/LocalVisualization.tsx` | **Local Visualization**: 4-section config (data source → GT → predictions → export), multi-layer comparison rendering |

#### Annotation Workspace Sub-components
| File | Description |
|------|-------------|
| `components/modules/annotation/CanvasView.tsx` | Multi-layer Canvas renderer: image loading, annotation drawing, overlay effects, AI preview |
| `components/modules/annotation/LeftToolbar.tsx` | Left toolbar: drawing tools (rect/polygon/AI), edit tools (pan/select/cut), navigation (undo/redo/prev-next scene) |
| `components/modules/annotation/RightPanel.tsx` | Right panel: accordion sections (project meta/layers/taxonomy/VLM/object editor/object list/scene list) |
| `components/modules/annotation/AIToolPanel.tsx` | AI floating panel: Auto/Semi/VQA tabs, source selection, positive/negative point prompts, result confirmation |
| `components/modules/annotation/ClassFormPopover.tsx` | Post-annotation floating form: class selection, attribute editing, difficult/occluded flags |
| `components/modules/annotation/ObjectEditorForm.tsx` | Selected object attribute editor: label, text description, Group/Track ID, flags |

---

## Part 2: Pending Tasks

### A. Layout & Theme Unification

#### A1. Unify module dialogs to standard step-navigation sidebar layout
Three layout paradigms currently coexist: step-navigation, segmented sidebar, tab switching. Unify to a standard:
- **Sidebar width**: Unified to `w-[200px]` (DataPreload/Import/Export already standardized; LocalVisualization uses 300px; TaxonomyDashboard uses 256px)
- **Sidebar background**: Unified to `bg-muted/20`
- **Border color**: Unified to `border-border` (theme variable), replacing hardcoded `border-neutral-200 dark:border-neutral-800`
- **Bottom status bar**: Add a unified bottom summary bar

Files involved:
- [LocalVisualization.tsx](frontend/src/components/modules/LocalVisualization.tsx) — Currently segmented sidebar, needs refactoring to step navigation
- [TaxonomyDashboard.tsx](frontend/src/components/modules/TaxonomyDashboard.tsx) — Currently tab switching + tree nav, evaluate whether to convert to step navigation

#### A2. Unify theme variable usage
Multiple files use `bg-white dark:bg-neutral-900` instead of `bg-background`, and `border-neutral-200 dark:border-neutral-800` instead of `border-border`:
- TaxonomyDashboard, ProjectMetaDashboard, RightPanel, ViewExtentCheck contain many hardcoded color values to replace with Tailwind theme variables

---

### B. UX Improvements

#### B1. Replace hardcoded alert() with Toast notifications
Toast notification system is ready (`useToastStore` + `ToastContainer`). ~25 remaining `alert()` calls to replace with `toast.info/success/warning/error()`:

| File | Count | Notes |
|------|-------|-------|
| [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) | 8 | Mixed CN/EN alerts, some with dynamic params |
| [TaxonomyDashboard.tsx](frontend/src/components/modules/TaxonomyDashboard.tsx) | 14 | Batch operation result feedback |
| [ViewExtentCheck.tsx](frontend/src/components/modules/ViewExtentCheck.tsx) | 3 | Alignment save related |
| [DataExport.tsx](frontend/src/components/modules/DataExport.tsx) | 2 | Class mismatch / file read failure |

#### B2. RightPanel drawer-style redesign
Currently accordion folding panels (SectionHeader + expand/collapse), inconsistent with the step-navigation style of menu modules. Changes:
- Adopt a drawer-style design — click section label to expand the corresponding drawer panel
- Visually correspond with the left step-navigation style

Files involved: [RightPanel.tsx](frontend/src/components/modules/annotation/RightPanel.tsx)

---

### C. Raw Image Data Processing

#### C1. Frontend pixel value inspector tool
The frontend pixel pipeline processes 8-bit data but cannot display raw pixel values. Add pixel inspection capability in the annotation workspace:
- Show raw pixel values at cursor position (per band) on hover
- Support multi-band data display (e.g., RGB + NIR)
- Display in status bar or tooltip, referencing the existing `showPixelValue` setting

Files involved:
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — Pixel value reading
- [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) — Status bar / info bar

#### C2. Raw data export support
The current export pipeline converts all images to 8-bit JPEG/PNG. Add raw data export options:
- Support exporting images in original bit depth (16-bit, float32, etc.)
- Add .tif/.npy format options
- Add a "Raw Data" toggle in the DataExport step

Files involved:
- [DataExport.tsx](frontend/src/components/modules/DataExport.tsx) — Export UI step
- `backend/routers/exchange.py` — Export backend logic
- `backend/utils/visualizer.py` — Image I/O

#### C3. Enhanced non-8-bit data frontend rendering
The backend currently linear-stretches all non-8-bit data to 8-bit before sending to the frontend. Enhance frontend rendering:
- Add stretch mode selection (linear/percentile/adaptive histogram, etc.)
- Add band combination presets (e.g., NDVI, pseudo-color)
- Add rendering parameters to DataPreload view configuration

Files involved:
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — Frontend pixel pipeline
- [DataPreload.tsx](frontend/src/components/modules/DataPreload.tsx) — View config UI
- `backend/utils/visualizer.py` — Backend rendering parameter extension

---

### D. LocateAnything — Assisted Segmentation

#### D1. Integrate open-vocabulary detection models (e.g., Grounding DINO)
Current SAM3 text-prompted segmentation (Auto Tab) relies on SAM3's built-in semantic capability, which has limited localization accuracy. Integrate a dedicated object localization model:
- Backend integration of Grounding DINO or similar open-vocabulary detection model
- Accept text prompts, return detection boxes/masks
- Cascade with existing SAM interactive segmentation (Grounding → SAM refine)

Files involved:
- `backend/utils/ai_engine.py` — New Grounding model wrapper
- `backend/routers/ai.py` — New localization API endpoints
- `backend/models.py` — Request/response models
- `backend/requirements-gpu.txt` — Dependency updates

#### D2. Frontend localization result interaction
Display Grounding model detection results in the frontend:
- Add a "Locate" feature entry in AIToolPanel
- Display detection results as a candidate box list with confidence filtering
- Auto-trigger SAM fine segmentation on candidate box click
- Support batch confirm/reject of detection results

Files involved:
- [AIToolPanel.tsx](frontend/src/components/modules/annotation/AIToolPanel.tsx) — New Locate Tab or enhanced Auto Tab
- [SyncAnnotation.tsx](frontend/src/components/modules/SyncAnnotation.tsx) — Result processing and annotation generation
- [CanvasView.tsx](frontend/src/components/modules/annotation/CanvasView.tsx) — Candidate box/mask preview rendering
- [client.ts](frontend/src/api/client.ts) — API call wrappers

#### D3. Cascaded inference pipeline
Implement automated Grounding → SAM cascade:
- User inputs text prompt → Grounding returns N candidate boxes
- Candidate boxes auto-fed as SAM box prompts for fine segmentation
- Support multi-object output from a single text query (e.g., "car" → all vehicles in image)
- Configurable confidence threshold and max output count

Files involved:
- `backend/utils/ai_engine.py` — Cascade inference orchestration
- `backend/routers/ai.py` — Cascade API endpoint
- [AIToolPanel.tsx](frontend/src/components/modules/annotation/AIToolPanel.tsx) — Cascade parameter configuration
