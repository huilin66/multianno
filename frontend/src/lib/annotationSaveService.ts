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

/** 保存当前场景的最新前端状态，并等待队列中更早的保存完成。 */
export const saveCurrentAnnotations = async () => {
  const state = useStore.getState();

  if (!state.currentStem || !state.isAnnotationDirty) {
    await waitForPendingAnnotationSaves();
    return;
  }

  const saveDir = getSaveDirectory(state);
  if (!saveDir) {
    throw new Error('Annotation save directory is not configured.');
  }

  const stem = state.currentStem;
  const payload = generateAnnotationPayload(state, stem);
  await enqueueAnnotationSave({
    save_dir: saveDir,
    file_name: `${stem}.json`,
    content: payload,
  });

  // 如果保存期间没有新的编辑，确认 dirty 状态；否则保留 dirty，
  // 让下一次自动保存继续写入更新后的内容。
  await waitForPendingAnnotationSaves();
  const latestState = useStore.getState();
  if (
    latestState.currentStem === stem &&
    shapesMatch(generateAnnotationPayload(latestState, stem).shapes, payload.shapes)
  ) {
    latestState.clearAnnotationDirty();
  }
};
