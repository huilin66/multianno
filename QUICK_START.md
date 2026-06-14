# MultiAnno Annotation Project Quick Start

[English](./QUICK_START.md) | [Simplified Chinese](./QUICK_START_zh-CN.md)

This guide is for annotation users. It explains how to start from a set of multi-view images, create a project, configure views, enter the annotation workspace, and export the final dataset.

If MultiAnno is not installed or running yet, read [README.md](./README.md) first. After installation, run this command from the project root:

```bash
python app.py
```

By default, the browser opens:

```text
http://127.0.0.1:5173
```

## 1. Recommended Workflow

A typical annotation project should follow this order:

1. Prepare image files and project folders.
2. Start MultiAnno.
3. Create a project.
4. Add image folders, configure views, and set the workspace in "View Settings".
5. Confirm crop and alignment for each view in "View Alignment".
6. Define classes and attributes in "Taxonomy Manager".
7. Annotate scenes one by one in the main workspace.
8. Check annotation counts, classes, shape types, and save status.
9. Export annotations or a full dataset in "Export Data".

Single-view projects can skip multi-view alignment. Projects that do not use AI can also skip all AI settings.

## 2. Prepare Data

### 2.1 Suggested Folder Structure

Create a dedicated folder for each annotation project, for example:

```text
my_project/
  images/
    rgb/
    nir/
    dsm/
  workspace/
  export/
  project_meta.json
```

Folder purposes:

- `images/`: original image folders. Avoid modifying them during annotation.
- `workspace/`: where MultiAnno saves annotation JSON files.
- `export/`: target folder for exported YOLO, COCO, VOC, MultiAnno, or other formats.
- `project_meta.json`: project metadata file that records views, alignment, workspace, and project configuration.

### 2.2 Multi-View Image Naming

MultiAnno groups files into the same scene by file name. For multi-view data, use the same scene ID and distinguish views with suffixes.

For example, one scene named `scene_0001` has three views:

```text
images/rgb/scene_0001_rgb.tif
images/nir/scene_0001_nir.tif
images/dsm/scene_0001_dsm.tif
```

In "View Settings", configure:

- RGB folder suffix: `_rgb`, extension: `.tif`
- NIR folder suffix: `_nir`, extension: `.tif`
- DSM folder suffix: `_dsm`, extension: `.tif`

The system will identify the shared stem as:

```text
scene_0001
```

Try to keep file counts, naming rules, and scene IDs consistent across all view folders. Inconsistent naming may prevent some files from forming complete multi-view scene groups.

## 3. Create a Project

1. Start MultiAnno.
2. Click "Create Project" in the top menu.
3. Enter a project name.
4. Select or enter the save path for `project_meta.json`.
5. Confirm to enter "View Settings".

If you already have a project metadata file, use "Load Project" to open `project_meta.json`. MultiAnno will restore views, workspace, classes, and existing annotations.

## 4. Configure Views

In "View Settings", complete the three steps: "Folders", "Views", and "Workspace".

### 4.1 Add Folders

1. Add one or more image folders in the "Folders" step.
2. Confirm the suffix and extension for each folder.
3. If auto-inference is correct, use the inferred result.
4. If auto-inference does not match your naming rule, manually edit the suffix and extension.

Common example:

```text
File name: scene_0001_rgb.tif
Suffix: _rgb
Extension: .tif
Stem: scene_0001
```

### 4.2 Add Views

1. Create a view for each folder in the "Views" step.
2. Select the source folder for each view.
3. Set channels, colormap, or RGB mapping.
4. Choose one main view.

The main view is the coordinate reference for annotations. In most projects, choose the clearest view or the view that best defines object boundaries, such as RGB or an orthophoto.

Other views are auxiliary views for synchronized browsing, comparison, and verification.

### 4.3 Set the Workspace

The workspace is where annotation JSON files are saved.

Use a separate folder when possible, for example:

```text
my_project/workspace/
```

Notes:

- If no custom workspace is set, MultiAnno may use the main view folder as the default save location.
- If the workspace already contains annotation JSON files, MultiAnno treats it as existing annotation data and may lock the path.
- Do not use the same folder for both workspace and export output.

After checking the configuration, click "Confirm & Start Alignment".

## 5. Complete View Alignment

If the project has only one view, MultiAnno will show that view alignment can be skipped and you can enter the annotation workspace directly.

If the project has multiple views, confirm the relationship between each auxiliary view and the main view in "View Alignment".

### 5.1 What to Check During Alignment

Alignment mainly verifies two kinds of parameters:

- Crop: which part of the auxiliary view participates in display and annotation linkage.
- Position and scale: how the auxiliary view fits the main view.

Recommended operation:

1. Switch to the auxiliary view you need to process.
2. Use "Crop" to adjust the valid region of the auxiliary view.
3. Use "Move/Zoom" to adjust position and scale.
4. Use opacity, horizontal swipe, or vertical swipe to compare with the main view.
5. If the image extent should match the main view, try "Fit Main View".
6. Click "Confirm Current View".
7. After all auxiliary views are confirmed, click "Finish All Alignment".

Alignment parameters are saved into project metadata. Reloading the project, using AI, and exporting data all depend on these parameters.

## 6. Set Up the Taxonomy

After entering the workspace, open "Taxonomy Manager" and define classes and attributes before large-scale annotation.

### 6.1 Classes

Classes describe object types, for example:

```text
building
road
tree
vehicle
```

Suggestions:

- Decide class names before formal annotation starts.
- Keep class names short, stable, and case-consistent.
- Assign visually distinct colors to different classes.

### 6.2 Attributes

Attributes record information beyond the class label, for example:

```text
occlusion: none / partial / heavy
quality: clear / blurry
source: manual / ai
```

If multiple classes share the same attribute, configure it as a global attribute. Start large-scale annotation after classes and attributes are ready.

## 7. Start Annotation

The main workspace usually contains:

- Central image canvas.
- Left annotation toolbar.
- Right panels for objects, classes, attributes, and views.
- Scene group or scene list.

### 7.1 Annotate One Scene

1. Select a scene/stem from the scene list.
2. Check that the main view and auxiliary views load correctly.
3. Select the target class.
4. Select an annotation tool, such as bbox, polygon, point, line, circle, or ellipse.
5. Draw the object on the main view.
6. Confirm class, attributes, and notes in the object information panel.
7. Save the object.
8. Move to the next scene after finishing the current one.

Annotation coordinates are based on the main view. Auxiliary views are used for synchronized checking and decision support, so you usually do not need to draw the same object separately on every view.

### 7.2 Useful Practices

- Use the select tool to edit existing objects.
- Use the object list on the right to locate, check, and update objects quickly.
- Mark difficult examples with `difficult` or add notes when needed.
- Use layer management to adjust auxiliary view visibility, opacity, or swipe comparison.
- Before switching scenes, check the save status in the top bar and make sure there is no save failure message.

### 7.3 AI-Assisted Annotation

AI is optional. If AI dependencies are not installed or no model is loaded, you can complete the project with manual annotation only.

If you need AI:

1. Open AI settings and load a model.
2. Select the target view in the AI panel.
3. Select the output type, such as polygon or bbox.
4. Generate candidates with full-auto mode, text prompts, point prompts, or box prompts.
5. Check whether the results are correct.
6. Confirm only high-quality results. Delete or manually fix incorrect results.

AI results should be reviewed by a human before entering the final dataset.

## 8. Review Annotation Quality

Do at least one quality check before export.

### 8.1 Project-Level Checks

Refresh statistics in "Taxonomy Manager" and check:

- Whether total object count is expected.
- Whether any class count is abnormal.
- Whether shape type distribution is abnormal.
- Whether there are unregistered classes or misspelled class names.
- Whether attribute values are missing or inconsistent.

### 8.2 Scene-Level Checks

Sample or review scenes one by one:

- Images load correctly.
- Annotations fit object boundaries.
- Classes are correct.
- Shape types such as bbox, polygon, point, and line match the task requirement.
- Auxiliary views are still aligned.
- There are no obvious missing, wrong, or duplicate annotations.

If you find many alignment problems, return to "View Alignment", confirm the parameters again, and then continue annotation or export.

## 9. Export Data

After annotation is complete, open "Export Data".

### 9.1 Select Export Mode

Common options:

- Export annotations only: export JSON, TXT, XML, or similar annotation files.
- Export full data: export annotations and images, suitable for training or delivery.

### 9.2 Select Task and Format

Choose a format based on downstream requirements:

- MultiAnno: keep the native MultiAnno annotation structure.
- YOLO: suitable for YOLO detection or segmentation training.
- COCO: suitable for COCO-style detection or segmentation tasks.
- VOC: suitable for Pascal VOC-style tasks.

Different formats support different shape types. Before export, confirm that selected classes and shape types match the downstream task.

### 9.3 Set Target Folder

Export to a separate folder, for example:

```text
my_project/export/yolo_dataset/
```

If the target folder already has content, MultiAnno will ask whether to overwrite it. Only confirm overwrite when the folder does not contain files you need to keep.

After export, check the target folder:

- Annotation files are generated.
- Images are copied or converted as expected.
- Class files are correct.
- train/val/test splits are expected.
- Counts in the export report look reasonable.

## 10. Continue an Existing Project

To continue annotation later:

1. Start MultiAnno.
2. Click "Load Project".
3. Select the existing `project_meta.json`.
4. Wait for MultiAnno to load annotations from the workspace.
5. Continue annotating scenes.

Avoid renaming images, moving image folders, or deleting workspace JSON files during a project. If you must adjust project files, back up the project folder first.

## 11. Common Issues

### 11.1 No Scenes After View Settings

This is usually caused by mismatched suffixes, extensions, or naming rules. Check whether files in each view folder can produce the same stem.

### 11.2 Auxiliary View Does Not Match the Main View

Return to "View Alignment" and adjust crop, scale, and offset. Make sure each auxiliary view has been confirmed with "Confirm Current View".

### 11.3 Annotations Seem Not Saved

Check the top save status and workspace path. Make sure the workspace directory is writable and not locked by another program.

### 11.4 Export Result Is Empty or Count Is Wrong

Check selected classes, shape types, and task format in export settings. You can also refresh statistics in "Taxonomy Manager" to confirm that annotations exist in the workspace.

### 11.5 AI Panel Is Unavailable

AI features require extra dependencies and models. Basic annotation mode does not require AI. If you only need manual annotation, you can ignore this state.

## 12. Pre-Annotation Checklist

Before formal annotation starts, confirm:

- Image folders are backed up or kept read-only.
- Multi-view file names can map to the same stem.
- The correct main view is selected.
- The workspace path is separate and writable.
- Multi-view projects have completed view alignment.
- Classes and attributes are defined.
- A few random scenes load correctly with all required views.

## 13. Pre-Export Checklist

Before export, confirm:

- There is no save failure message in the top bar.
- Taxonomy statistics have been refreshed.
- Class names have no spelling mistakes or duplicate variants.
- Important scenes have been sampled for quality.
- Export format, classes, and shape types are correct.
- The target folder can be overwritten, or a new empty folder has been selected.

