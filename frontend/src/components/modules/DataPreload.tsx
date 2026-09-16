// src/components/modules/DataPreload.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Alert } from '../ui/alert';
import { Legend } from '../ui/legend';
import { FileExplorerDialog } from '../modals/FileExplorerDialog';
import { COLOR_MAPS, BAND_COLORS, BAND_UNSELECTED_STYLE } from '../../config/colors';
import { SUPPORTED_IMAGE_EXTENSIONS } from '../../config/supportedFormats';
import { generateProjectMetaConfig } from '../../lib/projectUtils';
import { loadAllProjectAnnotations } from '../../lib/annotationUtils';
import { saveProjectMeta, analyzeWorkspaceFolders, checkWorkspaceJson, inferSuffix } from '../../api/client';
import { showDialog } from '../../store/useDialogStore';
import {
  FolderOpen, Plus, Trash2, Info, UploadCloud, History,
  ChevronRight, RotateCcw, Search
} from 'lucide-react';

interface DataPreloadProps {
  onClose: () => void;
  isCreatingProject?: boolean;
}

const getParentDirectory = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return '';

  const normalized = trimmed.replace(/[\\/]+$/, '');
  const lastSeparator = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'));
  if (lastSeparator < 0) return '';
  if (lastSeparator === 0) return normalized.slice(0, 1);
  if (lastSeparator === 2 && /^[a-zA-Z]:[\\/]$/.test(normalized.slice(0, 3))) {
    return normalized.slice(0, 3);
  }
  return normalized.slice(0, lastSeparator);
};

const joinPath = (directory: string, name: string) => {
  const trimmedDirectory = directory.trim();
  if (!trimmedDirectory) return name;

  const separator = trimmedDirectory.includes('\\') && !trimmedDirectory.includes('/') ? '\\' : '/';
  const normalizedDirectory = trimmedDirectory.replace(/[\\/]+$/, '');
  return normalizedDirectory ? `${normalizedDirectory}${separator}${name}` : `${separator}${name}`;
};

const getProjectMetaFileName = (projectName: string) => {
  const safeName = projectName
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/[. ]+$/, '');
  return `${safeName || 'multianno_project1'}_meta.json`;
};

const normalizeComparablePath = (path: string) => path.trim().replace(/[\\/]+$/, '').toLowerCase();

export function DataPreload({ onClose, isCreatingProject = false }: DataPreloadProps) {
  const { t } = useTranslation();
  const {
    projectName, projectMetaPath, setProjectName, setProjectMetaPath,
    folders, views, addFolder, removeFolder, clearFolders, updateFolder,
    addView, removeView, updateView, clearViews,
    setActiveModule, editorSettings
  } = useStore();

  const [activeStep, setActiveStep] = useState('folders');
  const [placeholders, setPlaceholders] = useState<{ id: string; path: string; suffix: string }[]>([]);
  const [explorerOpen, setExplorerOpen] = useState(false);
  const [activePlaceholderId, setActivePlaceholderId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [recentPaths, setRecentPaths] = useState<string[]>([]);
  const [explorerMode, setExplorerMode] = useState<'dir' | 'file'>('dir');
  const [inferredData, setInferredData] = useState<Record<string, { suffix: string; extension: string; sample: string }>>({});
  const [newFolderPath, setNewFolderPath] = useState('');

  const [workspacePath, setWorkspacePath] = useState('');
  const [isWorkspaceCustom, setIsWorkspaceCustom] = useState(false);
  const [workspaceExplorerOpen, setWorkspaceExplorerOpen] = useState(false);
  const [isWorkspaceConfirming, setIsWorkspaceConfirming] = useState(false);
  const [workspaceHasJson, setWorkspaceHasJson] = useState(false);
  const [isWorkspaceLocked, setIsWorkspaceLocked] = useState(false);
  const [isCheckingWorkspace, setIsCheckingWorkspace] = useState(false);
  const [isLoadingWorkspaceAnnotations, setIsLoadingWorkspaceAnnotations] = useState(false);
  const [workspaceLoadProgress, setWorkspaceLoadProgress] = useState({ current: 0, total: 0 });
  const [projectNameDraft, setProjectNameDraft] = useState(() => projectName || t('createProject.defaultName'));
  const [projectMetaSaveDir, setProjectMetaSaveDir] = useState('');
  const [metaSaveDirExplorerOpen, setMetaSaveDirExplorerOpen] = useState(false);

  const [isGlobalConfirming, setIsGlobalConfirming] = useState(false);

  const maxViews = editorSettings.maxViews || 9;
  const workspaceStorePath = useStore(s => s.workspacePath);
  const setWorkspaceStorePath = useStore(s => s.setWorkspacePath);

  const mainViewFolder = useMemo(() => {
    const mainView = views.find(v => v.isMain);
    return folders.find(f => f.id === mainView?.folderId);
  }, [views, folders]);

  const firstImageFolder = folders[0];
  const defaultMetaSaveDir = useMemo(
    () => getParentDirectory(firstImageFolder?.path || ''),
    [firstImageFolder?.path],
  );
  const defaultWorkspacePath = useMemo(
    () => defaultMetaSaveDir ? joinPath(defaultMetaSaveDir, 'annos') : '',
    [defaultMetaSaveDir],
  );
  const finalProjectMetaPath = useMemo(() => {
    if (!isCreatingProject) return projectMetaPath || '';
    const saveDir = projectMetaSaveDir.trim() || defaultMetaSaveDir;
    if (!saveDir || !projectNameDraft.trim()) return '';
    return joinPath(saveDir, getProjectMetaFileName(projectNameDraft));
  }, [defaultMetaSaveDir, isCreatingProject, projectMetaPath, projectMetaSaveDir, projectNameDraft]);

  const workspaceStatus = isWorkspaceCustom ? 'defined' : 'default';

  const originalPaths = useRef<Record<string, string>>({});
  const autoMetaSaveDirRef = useRef('');
  const workspaceCheckIdRef = useRef(0);

  const checkWorkspaceForJson = useCallback(async (path: string, lockIfFound = false): Promise<boolean> => {
    const normalizedPath = path.trim();
    const checkId = ++workspaceCheckIdRef.current;

    if (!normalizedPath) {
      setWorkspaceHasJson(false);
      if (lockIfFound) setIsWorkspaceLocked(false);
      return false;
    }

    setIsCheckingWorkspace(true);
    try {
      const data = await checkWorkspaceJson(normalizedPath);
      if (checkId !== workspaceCheckIdRef.current) return false;

      const hasJson = Boolean(data?.hasJson);
      setWorkspaceHasJson(hasJson);
      if (lockIfFound) setIsWorkspaceLocked(hasJson);
      return hasJson;
    } catch {
      if (checkId !== workspaceCheckIdRef.current) return false;
      setWorkspaceHasJson(false);
      if (lockIfFound) setIsWorkspaceLocked(false);
      return false;
    } finally {
      if (checkId === workspaceCheckIdRef.current) setIsCheckingWorkspace(false);
    }
  }, []);

  // ==========================================
  // 初始化
  // ==========================================
  useEffect(() => {
    if (workspaceStorePath?.trim()) {
      setWorkspacePath(workspaceStorePath);
      setIsWorkspaceCustom(normalizeComparablePath(workspaceStorePath) !== normalizeComparablePath(defaultWorkspacePath));
      void checkWorkspaceForJson(workspaceStorePath, true);
    } else if (defaultWorkspacePath) {
      setWorkspacePath(defaultWorkspacePath);
      setIsWorkspaceCustom(false);
      void checkWorkspaceForJson(defaultWorkspacePath, true);
    } else {
      setWorkspacePath('');
      setIsWorkspaceCustom(false);
      setWorkspaceHasJson(false);
      setIsWorkspaceLocked(false);
    }
  }, [checkWorkspaceForJson, defaultWorkspacePath, workspaceStorePath]);

  useEffect(() => {
    if (isCreatingProject) {
      setActiveStep('folders');
      setProjectNameDraft(t('createProject.defaultName'));
      setProjectMetaSaveDir('');
      autoMetaSaveDirRef.current = '';
    } else {
      setProjectNameDraft(projectName || '');
      setProjectMetaSaveDir(projectMetaPath ? getParentDirectory(projectMetaPath) : '');
      autoMetaSaveDirRef.current = '';
    }
  }, [isCreatingProject]);

  useEffect(() => {
    if (!isCreatingProject) return;
    setProjectMetaSaveDir((current) => (
      !current || current === autoMetaSaveDirRef.current ? defaultMetaSaveDir : current
    ));
    autoMetaSaveDirRef.current = defaultMetaSaveDir;
  }, [defaultMetaSaveDir, isCreatingProject]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('multiAnno_recentPaths');
    if (savedHistory) {
      try { setRecentPaths(JSON.parse(savedHistory)); }
      catch (e) { console.error("Failed to parse history", e); }
    }
  }, []);

  useEffect(() => {
    folders.forEach(f => {
      if (!originalPaths.current[f.id]) {
        originalPaths.current[f.id] = f.path;
      }
    });
  }, [folders]);

  // ==========================================
  // 步骤定义
  // ==========================================
  const steps = useMemo(() => {
    const baseSteps = [
    { id: 'folders', label: t('dataPreload.steps.folders'), required: true },
    { id: 'views', label: t('dataPreload.steps.views'), required: true },
    { id: 'workspace', label: t('dataPreload.steps.workspace'), required: true },
    ];
    return isCreatingProject
      ? [...baseSteps, { id: 'project', label: t('dataPreload.steps.project'), required: true }]
      : baseSteps;
  }, [isCreatingProject, t]);

  const getStepStatus = (stepId: string): 'current' | 'done' | 'pending' => {
    if (activeStep === stepId) return 'current';
    switch (stepId) {
      case 'folders': return folders.length > 0 ? 'done' : 'pending';
      case 'views': return views.length > 0 ? 'done' : 'pending';
      case 'workspace': return workspaceHasJson || isWorkspaceCustom || !!defaultWorkspacePath ? 'done' : 'pending';
      case 'project': return finalProjectMetaPath ? 'done' : 'pending';
      default: return 'pending';
    }
  };

  // ==========================================
  // Folder 操作
  // ==========================================
  const savePathsToHistory = (paths: string[]) => {
    setRecentPaths(prev => {
      let newHistory = [...prev];
      paths.forEach(path => {
        const trimmed = path.trim().replace(/\\/g, '/');
        if (trimmed) {
          newHistory = newHistory.filter(p => p !== trimmed);
          newHistory.unshift(trimmed);
        }
      });
      const updated = newHistory.slice(0, 5);
      localStorage.setItem('multiAnno_recentPaths', JSON.stringify(updated));
      return updated;
    });
  };

  const isPlainRawExtension = (extension?: string) => {
    if (!extension) return false;
    return extension.replace(/^\./, '').toLowerCase() === 'raw';
  };

  const parsePlainRawProfile = (value: string) => {
    const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const width = Number.parseInt(parts[0], 10);
    const height = Number.parseInt(parts[1], 10);
    const bit = Number.parseInt(parts[2] || '16', 10);
    const pattern = (parts[3] || 'RGGB').toUpperCase();
    const packing = (parts[4] || 'u16').toLowerCase();
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    if (!Number.isFinite(bit) || bit <= 0) return null;
    if (!['RGGB', 'BGGR', 'GRBG', 'GBRG'].includes(pattern)) return null;
    if (!['u16', 'u8', 'mipi10', 'mipi12'].includes(packing)) return null;
    return { kind: 'plain_raw', width, height, bit, pattern, packing };
  };

  const requestPlainRawProfile = () => {
    const lastProfile = localStorage.getItem('multiAnno_plainRawProfile') || '';
    const input = window.prompt(
      'Plain .raw profile, optional. For camera RAW supported by rawpy, leave blank. For sensor RAW, enter: width,height,bit,bayer,packing',
      lastProfile
    );
    if (!input || !input.trim()) return undefined;
    const profile = parsePlainRawProfile(input);
    if (!profile) {
      alert('Invalid RAW profile. Example: 4096,3072,10,RGGB,mipi10');
      return null;
    }
    localStorage.setItem('multiAnno_plainRawProfile', input.trim());
    return profile;
  };

  const handleAddFolder = async (path: string) => {
    if (!path.trim()) return;
    setIsConfirming(true);
    try {
      await handleAutoAnalyze({ id: Math.random().toString(36).slice(2, 11), path: path.trim(), suffix: '' });
      setNewFolderPath('');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleFolderSelectConfirm = (selectedPaths: string[]) => {
    setExplorerOpen(false);
    if (selectedPaths.length > 0) {
      if (activePlaceholderId) {
        updateFolder(activePlaceholderId, { path: selectedPaths[0] });
      } else {
        handleAddFolder(selectedPaths[0]);
      }
    }
  };

  const handleAddFromHistory = (path: string) => {
    handleAddFolder(path);
  };

  const handleAutoAnalyze = async (item: { id: string; path: string; suffix: string }) => {
    if (!item.path.trim()) return;
    setIsConfirming(true);
    try {
      const existingFolders = folders.map(f => ({
        path: f.path,
        suffix: f.suffix || '',
        rawProfile: f.rawProfile,
      }));
      const allFolders = [...existingFolders, { path: item.path.trim(), suffix: item.suffix.trim() }];

      const inferenceResult = await inferSuffix(allFolders);
      const infNew = inferenceResult.results?.find((r: any) => r.folder_index === allFolders.length - 1) || {};

      let cleanSuffix = item.suffix || infNew.suffix || '';
      let detectedExt = infNew.extension || '';
      const KNOWN_EXTS = [...SUPPORTED_IMAGE_EXTENSIONS].sort((a, b) => b.length - a.length);
      for (const ext of KNOWN_EXTS) {
        if (cleanSuffix.toLowerCase().endsWith(ext.toLowerCase())) {
          cleanSuffix = cleanSuffix.slice(0, -ext.length);
          detectedExt = ext;
          break;
        }
      }

      let rawProfile: any = undefined;
      if (isPlainRawExtension(detectedExt)) {
        const profile = requestPlainRawProfile();
        if (profile === null) return;
        rawProfile = profile;
      }

      const analysisPayload = allFolders.map((f, i) => {
        const inf = inferenceResult.results?.find((r: any) => r.folder_index === i);
        const suffix = i === allFolders.length - 1 ? cleanSuffix : (inf?.suffix || f.suffix || '');
        return {
          path: f.path,
          suffix,
          rawProfile: i === allFolders.length - 1 ? rawProfile : (f as any).rawProfile,
        };
      });
      const result = await analyzeWorkspaceFolders(analysisPayload);
      const backendData = result.data;

      if (!backendData || backendData.length === 0) {
        alert(t('dataPreload.alerts.noImagesFound'));
        return;
      }

      const newFolderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const newFolderMeta = backendData.find((m: any) =>
        m.folderPath === item.path.trim() || m.folderPath === allFolders[allFolders.length - 1].path
      ) || backendData[backendData.length - 1];

      addFolder({
        id: newFolderId,
        path: newFolderMeta.folderPath || item.path,
        suffix: cleanSuffix,
        extension: detectedExt || newFolderMeta.dtype || 'tif',
        rawProfile,
        files: [],
        metadata: {
          width: newFolderMeta.width || 1024,
          height: newFolderMeta.height || 1024,
          bands: newFolderMeta.bands || 3,
          fileType: detectedExt || newFolderMeta.dtype || 'TIFF',
          dataType: "Remote Sensing Imagery",
          sceneGroupsLoaded: newFolderMeta.group_success || 0,
          sceneGroupsSkipped: newFolderMeta.group_fail || 0
        },
      });

      const currentViews = useStore.getState().views;
      const totalBands = Number(newFolderMeta.bands || 3);
      addView({
        id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        folderId: newFolderId,
        bands: totalBands >= 3 ? [1, 2, 3] : [1],
        isMain: !currentViews.some((view) => view.isMain),
        opacity: 1,
        colormap: 'gray',
        crop: { t: 0, r: 100, b: 100, l: 0 },
        transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 },
      });

      backendData.forEach((meta: any) => {
        const existingFolder = folders.find(f => f.path === meta.folderPath);
        if (existingFolder) {
          updateFolder(existingFolder.id, {
            metadata: {
              ...existingFolder.metadata,
              width: meta.width || existingFolder.metadata.width,
              height: meta.height || existingFolder.metadata.height,
              bands: meta.bands || existingFolder.metadata.bands,
              sceneGroupsLoaded: meta.group_success || 0,
              sceneGroupsSkipped: meta.group_fail || 0,
            }
          });
        }
      });

      const newInferred: Record<string, any> = {};
      const pathToId: Record<string, string> = {};
      folders.forEach(f => { pathToId[f.path] = f.id; });
      pathToId[item.path.trim()] = newFolderId;

      inferenceResult.results?.forEach((r: any) => {
        const targetPath = allFolders[r.folder_index]?.path;
        const targetId = pathToId[targetPath];
        if (targetId) {
          newInferred[targetId] = {
            suffix: r.suffix || '',
            extension: r.extension || '',
            sample: r.sample_file || '',
          };
        }
      });
      setInferredData(prev => ({ ...prev, ...newInferred }));

      inferenceResult.results?.forEach((r: any) => {
        if (r.folder_index !== allFolders.length - 1) {
          const targetPath = allFolders[r.folder_index]?.path;
          const existingFolder = folders.find(f => f.path === targetPath);
          if (existingFolder && !existingFolder.suffix && r.suffix) {
            updateFolder(existingFolder.id, {
              suffix: r.suffix || '',
              extension: r.extension || existingFolder.extension,
            });
          }
        }
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
        useStore.getState().setSceneGroups(result.sceneGroups);
      }

      setPlaceholders(prev => prev.filter(p => p.id !== item.id));
      savePathsToHistory([item.path]);
    } catch (error) {
      console.error("Auto analyze error:", error);
      alert(t('dataPreload.alerts.backendFailed'));
    } finally {
      setIsConfirming(false);
    }
  };

  const reAnalyzeFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder?.path) return;
    setIsConfirming(true);
    try {
      const allFolders = folders.map(f => ({
        path: f.path,
        suffix: f.suffix || '',
        rawProfile: f.rawProfile,
      }));
      const result = await analyzeWorkspaceFolders(allFolders);

      result.data?.forEach((meta: any) => {
        const existingFolder = folders.find(f => f.path === meta.folderPath);
        if (existingFolder) {
          updateFolder(existingFolder.id, {
            metadata: {
              ...existingFolder.metadata,
              width: meta.width || existingFolder.metadata.width,
              height: meta.height || existingFolder.metadata.height,
              bands: meta.bands || existingFolder.metadata.bands,
              sceneGroupsLoaded: meta.group_success || 0,
              sceneGroupsSkipped: meta.group_fail || 0,
            }
          });
        }
      });

      if (result.commonStems && result.commonStems.length > 0) {
        useStore.getState().setStems(result.commonStems);
        useStore.getState().setCurrentStem(result.commonStems[0]);
        useStore.getState().setSceneGroups(result.sceneGroups);
      }
    } catch (error) {
      console.error("Re-analyze error:", error);
    } finally {
      setIsConfirming(false);
    }
  };

  // ==========================================
  // Workspace 操作
  // ==========================================
  const handleWorkspaceConfirm = async () => {
    const finalPath = isWorkspaceCustom ? workspacePath.trim() : defaultWorkspacePath;
    if (!finalPath) return;
    setIsWorkspaceConfirming(true);
    setWorkspaceStorePath(finalPath);
    await checkWorkspaceForJson(finalPath, false);
    setIsWorkspaceConfirming(false);
  };

  const handleWorkspaceReset = () => {
    setWorkspacePath(defaultWorkspacePath);
    setIsWorkspaceCustom(false);
    setIsWorkspaceLocked(false);
    void checkWorkspaceForJson(defaultWorkspacePath, false);
  };

  const handleWorkspaceSelectConfirm = (paths: string[]) => {
    if (paths.length > 0) {
      const selectedPath = paths[0];
      setWorkspacePath(selectedPath);
      setIsWorkspaceCustom(normalizeComparablePath(selectedPath) !== normalizeComparablePath(defaultWorkspacePath));
      setIsWorkspaceLocked(false);
      void checkWorkspaceForJson(selectedPath, false);
    }
    setWorkspaceExplorerOpen(false);
  };

  // ==========================================
  // Views 操作
  // ==========================================
  const handleAddView = () => {
    if (views.length >= maxViews) return;
    addView({
      id: Math.random().toString(36).slice(2, 11),
      folderId: '',
      bands: [1, 2, 3],
      isMain: views.length === 0,
      opacity: 1,
      crop: { t: 0, r: 100, b: 100, l: 0 },
      transform: { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 }
    });
  };

  const handleResetViews = () => {
    if (window.confirm(t('dataPreload.alerts.resetViews'))) clearViews();
  };

  // ==========================================
  // 全局操作
  // ==========================================
  const loadExistingWorkspaceAnnotations = async (saveDir: string) => {
    const stemsToLoad = useStore.getState().stems;
    if (stemsToLoad.length === 0) return null;

    setIsLoadingWorkspaceAnnotations(true);
    setWorkspaceLoadProgress({ current: 0, total: stemsToLoad.length });
    useStore.setState({
      annotations: [],
      hiddenAnnotations: [],
      activeAnnotationId: null,
      pendingAnnotationFocus: null,
      isAnnotationDirty: false,
      statsCacheValid: false,
    });

    try {
      const result = await loadAllProjectAnnotations(
        stemsToLoad,
        saveDir,
        (current, total) => setWorkspaceLoadProgress({ current, total }),
        10,
      );
      if (!result) return null;

      const loadedAnnotations = useStore.getState().annotations;
      const labelCount = new Set(
        loadedAnnotations
          .map((annotation) => annotation.label.trim())
          .filter((label) => label.length > 0),
      ).size;

      return { ...result, labelCount };
    } finally {
      setIsLoadingWorkspaceAnnotations(false);
    }
  };

  const handleGlobalConfirm = async () => {
    if (folders.length === 0) { alert(t('dataPreload.alerts.noFoldersConfigured')); return; }
    if (!mainViewFolder) { alert(t('dataPreload.alerts.noMainView')); return; }

    let metaPath = projectMetaPath;
    if (isCreatingProject) {
      const finalName = projectNameDraft.trim();
      const finalSaveDir = (projectMetaSaveDir.trim() || defaultMetaSaveDir).trim();
      if (!finalName || !finalSaveDir) {
        alert(t('dataPreload.alerts.missingProjectDetails'));
        return;
      }

      metaPath = joinPath(finalSaveDir, getProjectMetaFileName(finalName));
      setProjectName(finalName);
      setProjectMetaPath(metaPath);
    }

    setIsGlobalConfirming(true);
    try {
      const finalPath = isWorkspaceCustom ? workspacePath.trim() : defaultWorkspacePath;
      const shouldEnterAnnotationDirectly = views.length === 1;
      let hasExistingAnnotations = false;

      if (finalPath) {
        hasExistingAnnotations = await checkWorkspaceForJson(finalPath, false);
      }

      const informationItems = [
        t(shouldEnterAnnotationDirectly
          ? 'dataPreload.information.singleView'
          : 'dataPreload.information.multiView'),
        hasExistingAnnotations ? t('dataPreload.information.annotationExists') : '',
      ].filter(Boolean);
      let shouldLoadExistingAnnotations = false;

      if (informationItems.length > 0) {
        const shouldProceed = await showDialog({
          type: shouldEnterAnnotationDirectly || hasExistingAnnotations ? 'warning' : 'info',
          title: t('dataPreload.information.title'),
          description: informationItems.join('\n\n'),
          confirmText: hasExistingAnnotations
            ? t(shouldEnterAnnotationDirectly
              ? 'dataPreload.singleView.confirmWithAnnotations'
              : 'dataPreload.multiView.confirmWithAnnotations')
            : t(shouldEnterAnnotationDirectly
              ? 'dataPreload.singleView.confirm'
              : 'dataPreload.multiView.confirm'),
          cancelText: shouldEnterAnnotationDirectly
            ? t('dataPreload.singleView.cancel')
            : t(hasExistingAnnotations
              ? 'dataPreload.workspace.loadExistingCancel'
              : 'dataPreload.multiView.cancel'),
          hideCancel: false,
        });

        if (!shouldProceed && (shouldEnterAnnotationDirectly || !hasExistingAnnotations)) return;
        shouldLoadExistingAnnotations = shouldProceed && hasExistingAnnotations;
      }

      let loadedWorkspaceStats: Awaited<ReturnType<typeof loadExistingWorkspaceAnnotations>> = null;
      if (finalPath && shouldLoadExistingAnnotations) {
        loadedWorkspaceStats = await loadExistingWorkspaceAnnotations(finalPath);
      }

      if (finalPath) setWorkspaceStorePath(finalPath);
      const projectMeta = generateProjectMetaConfig(useStore.getState());
      if (metaPath) await saveProjectMeta({ file_path: metaPath, content: projectMeta });

      if (loadedWorkspaceStats) {
        await showDialog({
          type: 'success',
          title: t('dataPreload.workspace.loadSuccessTitle'),
          description: t('dataPreload.workspace.loadSuccessDescription', {
            images: loadedWorkspaceStats.loadedSceneCount,
            labels: loadedWorkspaceStats.labelCount,
            objects: loadedWorkspaceStats.annotationCount,
          }),
          confirmText: t('common.confirm'),
          hideCancel: true,
        });
      }

      setActiveModule(shouldEnterAnnotationDirectly ? 'workspace' : 'extent');
    } catch (err) {
      console.error("Failed:", err);
      alert(t('dataPreload.alerts.saveFailed'));
    } finally {
      setIsGlobalConfirming(false);
    }
  };

  const handleExit = () => {
    if (window.confirm(t('dataPreload.alerts.confirmExit'))) {
      onClose();
    }
  };

  const renderProjectSetup = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="mb-4 text-[10px] text-muted-foreground">
          {t('dataPreload.project.description')}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-project-name" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('dataPreload.project.name')}
            </Label>
            <Input
              id="new-project-name"
              value={projectNameDraft}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              placeholder={t('createProject.defaultName')}
              className="h-8 text-xs"
              disabled={isGlobalConfirming}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="project-meta-save-dir" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {t('dataPreload.project.metaSaveDir')}
            </Label>
            <div className="relative">
              <Input
                id="project-meta-save-dir"
                value={projectMetaSaveDir}
                onChange={(e) => setProjectMetaSaveDir(e.target.value)}
                placeholder={defaultMetaSaveDir || t('dataPreload.project.metaSaveDirPlaceholder')}
                className="h-8 pr-9 font-mono text-[11px]"
                disabled={isGlobalConfirming}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-7 -translate-y-1/2"
                onClick={() => setMetaSaveDirExplorerOpen(true)}
                disabled={isGlobalConfirming}
                title={t('dataPreload.project.selectMetaSaveDir')}
              >
                <FolderOpen />
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-[10px]">
          <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <div className="min-w-0">
            <span className="text-muted-foreground">{t('dataPreload.project.metaPathPreview')}: </span>
            <span className="break-all font-mono text-foreground" title={finalProjectMetaPath}>
              {finalProjectMetaPath || t('dataPreload.project.metaPathNotReady')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  // ==========================================
  // 渲染
  // ==========================================
  const renderStepContent = () => {
    switch (activeStep) {
      case 'folders':
        return (
          <div className="space-y-5">
            {recentPaths.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 rounded-lg border border-dashed">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <History className="w-3 h-3" /> {t('dataPreload.folders.recent')}
                </span>
                {recentPaths.map((path) => {
                  const maxLen = 30;
                  const displayPath = path.length > maxLen ? '...' + path.slice(-maxLen) : path;
                  return (
                    <button key={path} onClick={() => handleAddFromHistory(path)}
                      className="text-[10px] bg-secondary hover:bg-secondary/80 px-2 py-1 rounded border truncate max-w-[200px]"
                      title={path}>+ {displayPath}</button>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Input
                value={newFolderPath}
                onChange={(e) => setNewFolderPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFolder(newFolderPath)}
                placeholder={t('dataPreload.folders.pathPlaceholder')}
                className="font-mono text-xs h-9 pr-9"
                disabled={isConfirming}
              />
              <button
                onClick={() => { setExplorerMode('dir'); setExplorerOpen(true); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled={isConfirming}
              >
                <FolderOpen size={14} />
              </button>
            </div>

            {folders.map((folder: any) => {
              const inf = inferredData[folder.id] || { suffix: '', extension: '', sample: '' };
              const suffixChanged = folder.suffix !== inf.suffix;
              const extChanged = folder.extension !== inf.extension;

              return (
                <div key={folder.id} className="p-4 border rounded-lg bg-muted/20 space-y-3">
                  <div className="relative">
                    <Input
                      value={folder.path}
                      onChange={(e) => updateFolder(folder.id, { path: e.target.value })}
                      onBlur={() => reAnalyzeFolder(folder.id)}
                      className="font-mono text-xs h-8 pr-9"
                    />
                    <button
                      onClick={() => { setActivePlaceholderId(folder.id); setExplorerMode('dir'); setExplorerOpen(true); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <FolderOpen size={14} />
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-[10px] text-muted-foreground shrink-0">{t('dataPreload.folders.suffix')}:</Label>
                      <Input value={folder.suffix || ''}
                        onChange={(e) => updateFolder(folder.id, { suffix: e.target.value })}
                        onBlur={() => reAnalyzeFolder(folder.id)}
                        className="h-7 text-[11px] font-mono w-24" />
                      <span className="text-muted-foreground text-[10px]">.</span>
                      <Label className="text-[10px] text-muted-foreground shrink-0">{t('dataPreload.folders.ext')}:</Label>
                      <Input value={folder.extension || ''}
                        onChange={(e) => updateFolder(folder.id, { extension: e.target.value })}
                        onBlur={() => reAnalyzeFolder(folder.id)}
                        className="h-7 text-[11px] font-mono w-16" />
                      <Button variant="ghost" size="icon" className="text-destructive h-7 w-7 shrink-0 ml-auto"
                        onClick={() => removeFolder(folder.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    {inf.sample ? (
                      <div className="flex items-center gap-2 text-[9px]">
                        <Search size={10} className="text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">
                          {t('dataPreload.folders.autoInferred')}
                          {inf.suffix && <span> {t('dataPreload.folders.inferredSuffix')}: <span className="font-mono text-amber-500">{inf.suffix || '(empty)'}</span></span>}
                          {inf.extension && <span>{t('dataPreload.folders.inferredExt')}: <span className="font-mono text-primary">{inf.extension}</span></span>}
                          {' '}{t('dataPreload.folders.inferredFrom')}{' '}
                          <span className="font-mono text-foreground/70">
                            {inf.sample.split('/').pop() || inf.sample.split('\\').pop()}
                          </span>
                        </span>
                        {(suffixChanged || extChanged) && (
                          <button
                            onClick={() => updateFolder(folder.id, { suffix: inf.suffix, extension: inf.extension })}
                            className="text-primary hover:underline ml-1"
                          >
                            {t('dataPreload.folders.restoreAuto')}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="text-[9px] text-muted-foreground/50">{t('dataPreload.folders.noInferenceData')}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground border-t border-border pt-2">
                    <span>📐 {folder.metadata.width}×{folder.metadata.height}</span>
                    <span>🎨 {folder.metadata.bands} bands</span>
                    <span>📄 {folder.metadata.fileType}</span>
                    {folder.rawProfile?.kind === 'plain_raw' && (
                      <span>
                        RAW {folder.rawProfile.width}×{folder.rawProfile.height} {folder.rawProfile.bit || folder.rawProfile.bitDepth}bit {folder.rawProfile.pattern || folder.rawProfile.bayer}
                      </span>
                    )}
                    <span className="text-green-600">✓ {folder.metadata.sceneGroupsLoaded} loaded</span>
                    {folder.metadata.sceneGroupsSkipped > 0 && (
                      <span className="text-destructive">✗ {folder.metadata.sceneGroupsSkipped} skipped</span>
                    )}
                  </div>
                </div>
              );
            })}

            {folders.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">{t('dataPreload.folders.emptyHint')}</p>
              </div>
            )}
          </div>
        );

      case 'views':
        return (
          <div className="space-y-4">
            {views.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                {t('dataPreload.views.emptyHint')}
              </div>
            ) : (
              views.map((view, index) => {
                const selectedFolder = folders.find(f => f.id === view.folderId);
                const totalBands = selectedFolder?.metadata?.bands || 0;
                const isNotUint8 = selectedFolder?.metadata?.fileType && !selectedFolder.metadata.fileType.toLowerCase().includes('uint8');

                return (
                  <div key={view.id} className="p-4 border rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full ${view.isMain ? 'bg-primary text-white' : 'bg-background border'}`}>
                        {view.isMain ? t('view.mainView') : `${t('view.augView')} ${index}`}
                      </span>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => removeView(view.id)} disabled={view.isMain && views.length > 1}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-3">
                      <Label className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">{t('dataPreload.views.sourceFolder')}</Label>
                      <Select value={view.folderId} onValueChange={(val) => {
                        const sf = folders.find(f => f.id === val);
                        const numBands = sf?.metadata?.bands || 3;
                        updateView(view.id, { folderId: val, bands: numBands >= 3 ? [1, 2, 3] : [1], colormap: 'gray' });
                      }}>
                        <SelectTrigger className="h-8 text-xs flex-1" title={selectedFolder?.path}>
                          <SelectValue placeholder={t('dataPreload.views.selectFolder')}>
                            {(() => {
                              const sf = folders.find(f => f.id === view.folderId);
                              if (!sf) return t('dataPreload.views.selectFolder');
                              const path = sf.path;
                              const maxLen = 70;
                              return path.length > maxLen ? '...' + path.slice(-maxLen) : path;
                            })()}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {folders.map(f => (
                            <SelectItem key={f.id} value={f.id} className="text-xs" title={f.path}>{f.path}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {view.folderId && (
                      <div className="space-y-2">
                        {isNotUint8 && (
                          <Alert variant="warning" className="py-1.5 px-3 text-[10px]">
                            <Info className="w-3 h-3" />{t('dataPreload.views.nonUint8')}: {selectedFolder?.metadata.fileType}
                          </Alert>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <Label className="text-[10px] text-muted-foreground uppercase">{t('dataPreload.views.channels')}</Label>
                            <div className="flex flex-wrap gap-1">
                              {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => {
                                const isSelected = view.bands.includes(b);
                                return (
                                  <button key={b} onClick={() => {
                                    let active = [...view.bands];
                                    if (active.includes(b)) active = active.filter(x => x !== b);
                                    else active.push(b);
                                    updateView(view.id, { bands: active });
                                  }}
                                    className={`w-7 h-7 text-[10px] font-bold rounded border transition-colors ${
                                      isSelected ? BAND_COLORS[(b - 1) % BAND_COLORS.length] + " border-2" : BAND_UNSELECTED_STYLE
                                    }`}>{b}</button>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            {view.bands.length === 1 && (
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-muted-foreground">{t('dataPreload.views.colormap')}</Label>
                                <Select value={view.colormap || 'gray'} onValueChange={(val) => updateView(view.id, { colormap: val })}>
                                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {COLOR_MAPS.map(cm => (
                                      <SelectItem key={cm.name} value={cm.name} className="text-xs">
                                        <div className="flex items-center gap-2">
                                          <div className={`w-8 h-3 rounded bg-gradient-to-r ${cm.css}`} />
                                          {cm.label}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            {view.bands.length === 3 && (
                              <div className="space-y-1.5">
                                <Label className="text-[10px] text-muted-foreground">{t('dataPreload.views.rgbMapping')}</Label>
                                <div className="flex gap-1.5">
                                  {['R', 'G', 'B'].map((ch, idx) => (
                                    <React.Fragment key={ch}>
                                      <Select value={view.bands[idx]?.toString()}
                                        onValueChange={(val) => {
                                          const newBands = [...view.bands];
                                          newBands[idx] = parseInt(val);
                                          updateView(view.id, { bands: newBands });
                                        }}>
                                        <SelectTrigger className="h-8 text-xs w-full">
                                          <span className={`font-bold text-[10px] ${ch === 'R' ? 'text-red-500' : ch === 'G' ? 'text-green-500' : 'text-blue-500'}`}>{ch}</span>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {Array.from({ length: totalBands }, (_, i) => i + 1).map(b => (
                                            <SelectItem key={b} value={b.toString()} className="text-xs">Band {b}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        );

      case 'workspace':
        return (
          <div className="space-y-5">
            <Label className="text-xs text-muted-foreground">{t('dataPreload.workspace.description')}</Label>

            {isWorkspaceLocked && workspaceHasJson && !isCheckingWorkspace ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-amber-700">
                  <Info className="w-4 h-4" />
                  <span className="text-xs font-medium">{t('dataPreload.workspace.locked')}</span>
                </div>
                <div className="text-xs font-mono truncate">{workspacePath || defaultWorkspacePath}</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="relative">
                  <Input value={isWorkspaceCustom ? workspacePath : defaultWorkspacePath}
                    placeholder={defaultWorkspacePath || 'default'}
                    onChange={e => {
                      const nextPath = e.target.value;
                      setWorkspacePath(nextPath);
                      setIsWorkspaceCustom(normalizeComparablePath(nextPath) !== normalizeComparablePath(defaultWorkspacePath));
                      setWorkspaceHasJson(false);
                      setIsWorkspaceLocked(false);
                    }}
                    onBlur={e => {
                      const nextPath = e.currentTarget.value.trim();
                      if (nextPath) void checkWorkspaceForJson(nextPath, false);
                    }}
                    className="h-9 text-xs pr-9 font-mono" disabled={isWorkspaceConfirming || isCheckingWorkspace || isLoadingWorkspaceAnnotations} />
                  <button onClick={() => setWorkspaceExplorerOpen(true)} disabled={isWorkspaceConfirming || isCheckingWorkspace || isLoadingWorkspaceAnnotations}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <FolderOpen size={14} />
                  </button>
                </div>
                {workspaceHasJson && !isCheckingWorkspace && (
                  <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <Info className="size-3.5" />
                    <span>{t('dataPreload.workspace.existingWarning')}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground">
                  {t('dataPreload.workspace.default')}: <span className="font-mono">{defaultWorkspacePath || t('dataPreload.workspace.notSet')}</span>
                </div>
              </div>
            )}
          </div>
        );

      case 'project':
        return renderProjectSetup();

      default:
        return null;
    }
  };

  // ==========================================
  // 主渲染
  // ==========================================
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-1 min-h-0">
        <div className="w-[200px] shrink-0 border-r border-border bg-muted/20 flex flex-col">
          <div className="flex-1 overflow-y-auto p-3">
            {steps.map((step) => {
              const status = getStepStatus(step.id);
              return (
                <button key={step.id} onClick={() => setActiveStep(step.id)}
                  className={`w-full flex items-stretch text-left transition-all mb-0.5 rounded-lg overflow-hidden ${
                    status === 'current' ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}>
                  <div className={`w-1 shrink-0 rounded-full my-1.5 ml-1 transition-colors ${
                    status === 'done' ? 'bg-emerald-400' : status === 'current' ? 'bg-primary' : 'bg-muted-foreground/25'
                  }`} />
                  <div className={`flex-1 py-2.5 px-3 min-w-0 text-xs truncate transition-colors ${
                    status === 'current' ? 'text-primary font-semibold' : status === 'done' ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}>
                    <span className="flex items-center gap-2">{step.label}</span>
                  </div>
                  {status === 'current' && <ChevronRight className="w-3 h-3 text-primary shrink-0 my-auto mr-2" />}
                </button>
              );
            })}
          </div>
          <Legend items={[
            { color: 'bg-emerald-400', label: t('dataPreload.legend.configured') },
            { color: 'bg-primary', label: t('dataPreload.legend.current') },
            { color: 'bg-muted-foreground/25', label: t('dataPreload.legend.pending') },
          ]} />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-bold">{steps.find(s => s.id === activeStep)?.label}</h3>
                <div className="flex items-center gap-2">
                  {activeStep === 'views' && (
                    <Button onClick={handleAddView} variant="outline" size="sm" disabled={views.length >= maxViews}>
                      <Plus className="w-3.5 h-3.5 mr-1.5" />{t('dataPreload.views.addView')}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm"
                    disabled={(activeStep === 'folders' && folders.length === 0) || (activeStep === 'views' && views.length === 0)}
                    onClick={() => {
                      if (activeStep === 'folders') { clearFolders(); setInferredData({}); }
                      else if (activeStep === 'views') clearViews();
                      else if (activeStep === 'workspace') handleWorkspaceReset();
                      else if (activeStep === 'project') {
                        setProjectNameDraft(t('createProject.defaultName'));
                        setProjectMetaSaveDir(defaultMetaSaveDir);
                      }
                    }}>
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />{t('common.reset')}
                  </Button>
                </div>
              </div>

              <div key={activeStep}>
                {renderStepContent()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部全局按钮 */}
      <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.folders')}:</span>
            <span className="font-semibold">{folders.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.views')}:</span>
            <span className="font-semibold">{views.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{t('dataPreload.steps.workspace')}:</span>
            <span className={`font-semibold ${
              workspaceStatus === 'default' 
                ? 'text-gray-500 dark:text-gray-400' 
                : 'text-blue-600 dark:text-blue-400'
            }`}>
              {workspaceStatus === 'default' ? 'default' : 'defined'}
            </span>
          </div>
          {isLoadingWorkspaceAnnotations && workspaceLoadProgress.total > 0 && (
            <span className="text-xs text-muted-foreground">
              {t('dataPreload.workspace.loadingAnnotations')} {workspaceLoadProgress.current}/{workspaceLoadProgress.total}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleExit} disabled={isGlobalConfirming}>
            {t('common.exit')}
          </Button>
          <Button size="sm" className="text-white font-semibold"
            onClick={handleGlobalConfirm}
            disabled={folders.length === 0 || isGlobalConfirming}>
            {isGlobalConfirming ? (
              <>{t('common.processing')}</>
            ) : (
              <>{t(views.length === 1 ? 'dataPreload.confirmAndStartAnnotation' : 'dataPreload.confirmAndAlign')}</>
            )}
          </Button>
        </div>
      </div>

      <FileExplorerDialog 
        open={explorerOpen}
        initialPath={activePlaceholderId ? placeholders.find(p => p.id === activePlaceholderId)?.path || '' : ''}
        onClose={() => setExplorerOpen(false)}
        onConfirm={handleFolderSelectConfirm}
        selectType={explorerMode}
      />
      <FileExplorerDialog 
        open={workspaceExplorerOpen}
        initialPath={workspacePath || defaultWorkspacePath || ''}
        onClose={() => setWorkspaceExplorerOpen(false)}
        onConfirm={handleWorkspaceSelectConfirm}
        selectType="dir"
      />
      <FileExplorerDialog
        open={metaSaveDirExplorerOpen}
        initialPath={projectMetaSaveDir || defaultMetaSaveDir || '/'}
        onClose={() => setMetaSaveDirExplorerOpen(false)}
        onConfirm={(paths) => {
          if (paths.length > 0) setProjectMetaSaveDir(paths[0]);
          setMetaSaveDirExplorerOpen(false);
        }}
        selectType="dir"
      />
    </div>
  );
}
