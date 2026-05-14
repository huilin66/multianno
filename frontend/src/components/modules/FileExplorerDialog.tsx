import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Folder, ChevronRight, CheckSquare, Square, FolderUp, File, Info, FolderPlus, Home, Check, X, Redo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../../api/client';
import { exploreDirectory, createFolder } from '../../api/client';

interface ExplorerItem {
  name: string;
  path: string;
  type: 'dir' | 'file';
  tag?: 'drive' | 'history';
}

interface FileExplorerDialogProps {
  open: boolean;
  initialPath: string;
  onClose: () => void;
  onConfirm: (selectedPaths: string[]) => void;
  selectType?: 'dir' | 'file' | 'save';
  defaultSaveName?: string;
}

export function FileExplorerDialog({
  open,
  initialPath,
  onClose,
  onConfirm,
  selectType = 'dir',
  defaultSaveName = 'project_meta.json',
}: FileExplorerDialogProps) {
  const { t } = useTranslation();

  const [currentPath, setCurrentPath] = useState('');
  const [homePath, setHomePath] = useState('');
  const [items, setItems] = useState<ExplorerItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  const [saveFileName, setSaveFileName] = useState(defaultSaveName);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchDirectory = useCallback(async (targetPath: string) => {
    setLoading(true);
    setIsCreatingFolder(false);
    setNewFolderName('');

    try {
      const data = await exploreDirectory(targetPath);
      setItems(data.items);
      setCurrentPath(data.current_path);
    } catch (error: any) {
      console.error(error);
      alert(`${t('common.error')}: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [t]);

  const navigateTo = useCallback((path: string) => {
    if (!path) return;
    setCurrentPath(path);
    fetchDirectory(path);
  }, [fetchDirectory]);

  useEffect(() => {
    if (!open) return;

    setSelectedPaths(new Set());
    if (defaultSaveName) setSaveFileName(defaultSaveName);

    let staticHome = (initialPath || '').replace(/\\/g, '/');
    if (staticHome.includes('.') && !staticHome.endsWith('/')) {
      const lastIdx = staticHome.lastIndexOf('/');
      staticHome = lastIdx > 0 ? staticHome.substring(0, lastIdx) : staticHome;
      if (/^[a-zA-Z]:$/.test(staticHome)) staticHome += '/';
    }
    setHomePath(staticHome);

    let startPath = staticHome;
    const savedHistory = localStorage.getItem('multiAnno_recentPaths');
    if (savedHistory) {
      try {
        const historyArray = JSON.parse(savedHistory);
        if (historyArray.length > 0) {
          let lastPath = historyArray[0].replace(/\\/g, '/');
          if (lastPath.endsWith('/') && lastPath.length > 1) lastPath = lastPath.slice(0, -1);
          const lastIndex = lastPath.lastIndexOf('/');
          if (lastIndex > 0) {
            startPath = lastPath.substring(0, lastIndex);
            if (/^[a-zA-Z]:$/.test(startPath)) startPath += '/';
          } else if (lastIndex === 0) {
            startPath = '/';
          }
        }
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    navigateTo(startPath);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (path: string) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  const handleNavigateUp = () => {
    if (!currentPath || currentPath === '/') {
      navigateTo('');
      return;
    }
    let normalized = currentPath.replace(/\\/g, '/');
    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }
    const lastSlashIndex = normalized.lastIndexOf('/');
    if (lastSlashIndex > 0) {
      let nextPath = normalized.slice(0, lastSlashIndex);
      if (/^[a-zA-Z]:$/.test(nextPath)) nextPath += '/';
      navigateTo(nextPath);
    } else if (lastSlashIndex === 0) {
      navigateTo('/');
    } else {
      navigateTo('');
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    setCreating(true);
    try {
      await createFolder(currentPath, newFolderName);
      setIsCreatingFolder(false);
      setNewFolderName('');
      navigateTo(currentPath);
    } catch (error: any) {
      console.error(error);
      alert(`${t('common.error')}: ${error.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = () => {
    let finalPaths: string[] = [];
    let pathToRecord = currentPath;

    if (selectType === 'save') {
      const separator = currentPath.includes('\\') ? '\\' : '/';
      const cleanPath = currentPath.endsWith(separator) ? currentPath : currentPath + separator;
      finalPaths = [cleanPath + saveFileName];
    } else {
      finalPaths = Array.from(selectedPaths);
      if (selectType === 'dir' && finalPaths.length > 0) {
        pathToRecord = finalPaths[0];
      }
    }

    if (pathToRecord && pathToRecord !== '/' && pathToRecord !== '') {
      try {
        const historyKey = 'multiAnno_recentPaths';
        const savedHistory = localStorage.getItem(historyKey);
        let historyArray: string[] = savedHistory ? JSON.parse(savedHistory) : [];
        historyArray = historyArray.filter(p => p !== pathToRecord);
        historyArray.unshift(pathToRecord);
        historyArray = historyArray.slice(0, 5);
        localStorage.setItem(historyKey, JSON.stringify(historyArray));
      } catch (e) {
        console.error('Failed to save history', e);
      }
    }

    onConfirm(finalPaths);
  };

  const canSelectItem = (item: ExplorerItem) => {
    if (selectType === 'dir') return item.type === 'dir';
    if (selectType === 'file') return item.type === 'file';
    return true;
  };

  const isConfirmDisabled = () => {
    if (selectType === 'save') {
      return !currentPath || !saveFileName.trim();
    }
    return selectedPaths.size === 0;
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-3xl sm:max-w-3xl p-0 border-border overflow-hidden">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <DialogTitle>{t('fileExplorer.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-3">
          <Button variant="outline" size="icon" onClick={handleNavigateUp} disabled={loading} className="h-9 w-9 shrink-0" title={t('fileExplorer.parentFolder')}>
            <FolderUp className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => navigateTo(homePath)}
            title={t('fileExplorer.home')}
          >
            <Home size={16} />
          </Button>
          <Input
            value={currentPath}
            onChange={(e) => setCurrentPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigateTo(currentPath)}
            className="flex-1 font-mono text-xs bg-background"
            placeholder={currentPath === '' ? t('fileExplorer.placeholderRoot') : t('fileExplorer.placeholderPath')}
          />
          <Button onClick={() => navigateTo(currentPath)} disabled={loading} variant="secondary" size="icon" className="h-9 w-9" title={t('fileExplorer.go')}>
            <Redo2 className="w-4 h-4 rotate-180" />
          </Button>
          <Button
            onClick={() => setIsCreatingFolder(true)}
            disabled={loading || !currentPath || currentPath === '/'}
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            title={t('fileExplorer.createNewFolder')}
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
        </div>

        <div className="px-4 pb-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
            <Info className="w-3 h-3" />
            {t('fileExplorer.tip')}
          </span>
        </div>

        <div className="h-[45vh] border-y border-border bg-muted/30 overflow-y-auto p-2 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{t('fileExplorer.reading')}</span>
            </div>
          ) : (
            <div className="space-y-0.5">
              {isCreatingFolder && (
                <div className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/20">
                  <FolderPlus className="w-4 h-4 text-primary shrink-0" />
                  <Input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateFolder();
                      if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); }
                    }}
                    disabled={creating}
                    placeholder={t('fileExplorer.newFolderName')}
                    className="flex-1 h-8 text-xs"
                  />
                  <Button size="sm" variant="ghost" onClick={handleCreateFolder} disabled={creating || !newFolderName.trim()}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); }} disabled={creating}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {currentPath && currentPath !== '/' && (
                <div
                  className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted transition-colors"
                  onDoubleClick={handleNavigateUp}
                >
                  <div className="w-8" />
                  <Folder className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-sm font-bold">..</span>
                </div>
              )}

              {items.length === 0 && !isCreatingFolder && (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-xs">
                  {t('fileExplorer.empty')}
                </div>
              )}

              {items.map((item) => {
                const isSelected = selectedPaths.has(item.path);
                const isDir = item.type === 'dir';
                const canSelect = canSelectItem(item);

                let displayName = item.name;
                if (item.tag === 'drive') displayName = `${t('fileExplorer.localDrive')} (${item.name})`;
                else if (item.tag === 'history') displayName = `${t('fileExplorer.historyRecord')} (${item.name})`;

                return (
                  <div
                    key={item.path}
                    className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-muted border border-transparent'
                    }`}
                  >
                    <div
                      className="w-8 flex justify-center shrink-0"
                      onClick={(e) => { e.stopPropagation(); if (canSelect) toggleSelect(item.path); }}
                    >
                      {canSelect ? (
                        isSelected
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </div>

                    <div
                      className={`flex items-center gap-2 flex-1 min-w-0 ${!canSelect ? 'opacity-50' : ''}`}
                      onDoubleClick={() => { if (isDir) navigateTo(item.path); }}
                    >
                      {isDir
                        ? <Folder className="w-4 h-4 text-amber-500 shrink-0" />
                        : <File className="w-4 h-4 text-muted-foreground shrink-0" />
                      }
                      <span className="text-sm truncate">{displayName}</span>
                    </div>

                    {isDir && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => navigateTo(item.path)}
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selectType === 'save' && (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider whitespace-nowrap">
              {t('fileExplorer.fileName')}
            </Label>
            <Input
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              className="h-8 text-xs font-mono"
              placeholder="project_meta.json"
            />
          </div>
        )}

        <div className="flex items-center justify-between p-4">
          <span className="text-xs text-muted-foreground">
            {selectType !== 'save' && t('fileExplorer.selectedCount', { count: selectedPaths.size })}
          </span>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" className="text-white" onClick={handleConfirm} disabled={isConfirmDisabled()}>
              {t('fileExplorer.confirm')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}