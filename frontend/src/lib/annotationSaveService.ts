import { saveAnnotation } from '../api/client';
import { useStore } from '../store/useStore';
import { generateAnnotationPayload } from './annotationUtils';

type StoreState = ReturnType<typeof useStore.getState>;
type AnnotationSavePayload = Parameters<typeof saveAnnotation>[0];

// 所有标注写入共用一个队列，避免导出读取磁盘时仍有保存请求在路上。
let pendingSaves: Promise<unknown> = Promise.resolve();

const getSaveDirectory = (state: StoreState) =>
  state.workspacePath ||
  state.folders.find((folder: any) => folder.id === state.views.find((view: any) => view.isMain)?.folderId)?.path ||
  state.folders[0]?.path ||
  '';

const getMainImagePath = (state: StoreState, stem: string) => {
  const mainFolder = state.folders.find(
    (folder: any) => folder.id === state.views.find((view: any) => view.isMain)?.folderId,
  ) || state.folders[0];

  if (!mainFolder?.path) return undefined;

  const extension = mainFolder.extension
    ? (String(mainFolder.extension).startsWith('.')
      ? String(mainFolder.extension)
      : `.${mainFolder.extension}`)
    : '';
  const imageName = state.sceneGroups?.[stem]?.[mainFolder.path]
    || `${stem}${mainFolder.suffix || ''}${extension}`;

  if (!imageName) return undefined;
  return `${String(mainFolder.path).replace(/[\\/]+$/, '')}/${imageName}`;
};

const enqueueAnnotationSave = (payload: AnnotationSavePayload) => {
  const saveTask = pendingSaves
    .catch(() => undefined)
    .then(() => saveAnnotation(payload));

  pendingSaves = saveTask;
  return saveTask;
};

export const waitForPendingAnnotationSaves = async () => {
  await pendingSaves;
};

const shapesMatch = (left: any[], right: any[]) => JSON.stringify(left) === JSON.stringify(right);

const getDirtyStems = (state: StoreState) => {
  const explicitDirtyStems = Array.isArray(state.dirtyAnnotationStems)
    ? state.dirtyAnnotationStems.filter(Boolean)
    : [];
  // Keep compatibility with older callers that only set the legacy boolean.
  if (explicitDirtyStems.length > 0) return Array.from(new Set(explicitDirtyStems));
  return state.isAnnotationDirty && state.currentStem ? [state.currentStem] : [];
};

const getAnnotationProjectIdentity = (state: StoreState) => JSON.stringify({
  meta: state.projectMetaPath || '',
  workspace: state.workspacePath || '',
  saveDir: getSaveDirectory(state),
  name: state.projectName || '',
});

const buildAnnotationSavePayload = (state: StoreState, stem: string): AnnotationSavePayload => {
  const saveDir = getSaveDirectory(state);
  if (!saveDir) {
    throw new Error('Annotation save directory is not configured.');
  }

  return {
    save_dir: saveDir,
    file_name: `${stem}.json`,
    content: generateAnnotationPayload(state, stem),
    image_path: getMainImagePath(state, stem),
    image_raw_profile: state.folders.find(
      (folder: any) => folder.id === state.views.find((view: any) => view.isMain)?.folderId,
    )?.rawProfile,
  };
};

const saveAnnotationStems = async (state: StoreState, stems: string[]) => {
  const projectIdentity = getAnnotationProjectIdentity(state);
  const payloads = stems.map((stem) => ({
    stem,
    payload: buildAnnotationSavePayload(state, stem),
  }));

  // Enqueue all snapshots from the same immutable state. This means browsing
  // to another scene while the requests are in flight cannot redirect a save
  // to the newly active scene.
  await Promise.all(payloads.map(({ payload }) => enqueueAnnotationSave(payload)));
  await waitForPendingAnnotationSaves();

  const latestState = useStore.getState();
  // A project can be switched while a queued request is still writing. Never
  // clear dirty flags belonging to the new project based on the old snapshot.
  if (getAnnotationProjectIdentity(latestState) !== projectIdentity) return;
  payloads.forEach(({ stem, payload }) => {
    const latestPayload = generateAnnotationPayload(latestState, stem);
    if (shapesMatch(latestPayload.shapes, payload.content.shapes)) {
      latestState.clearAnnotationDirty(stem);
    }
  });
};

/**
 * Save all dirty scenes. Keep this name for existing toolbar/export callers,
 * but no longer limit a manual save to whichever scene happens to be active.
 */
export const saveCurrentAnnotations = async () => {
  const state = useStore.getState();
  const dirtyStems = getDirtyStems(state);
  if (dirtyStems.length === 0) {
    await waitForPendingAnnotationSaves();
    return;
  }

  await saveAnnotationStems(state, dirtyStems);
};

/**
 * Save every dirty scene from one immutable store snapshot.
 * Track ID editing changes the active scene repeatedly, so saving only the
 * current scene is not sufficient when the window is closed or exported.
 */
export const saveDirtyAnnotations = async () => {
  const state = useStore.getState();
  const dirtyStems = getDirtyStems(state);
  if (dirtyStems.length === 0) {
    await waitForPendingAnnotationSaves();
    return;
  }

  await saveAnnotationStems(state, dirtyStems);
};
