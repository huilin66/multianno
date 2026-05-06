// src/components/modules/AISettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Slider } from '../../ui/slider';
import { CloudLightning, Loader2, Save, FolderSearch, History } from 'lucide-react';
import { updateAIConfig } from '../../../api/client';
import { FileExplorerDialog } from '../FileExplorerDialog'; 
import { useTranslation } from 'react-i18next';
import { showDialog } from '../../../store/useDialogStore';

interface AISettingsModalProps {
  open: boolean; 
  onClose: () => void; 
}

export function AISettingsModal({ open, onClose }: AISettingsModalProps) {
  const { t } = useTranslation();
  const aiSettings = useStore((s) => s.aiSettings);
  const setAISettings = useStore((s) => s.setAISettings);
  const [localSettings, setLocalSettings] = useState(aiSettings);
  const [isVerifying, setIsVerifying] = useState(false);
  const [fileExplorerOpen, setFileExplorerOpen] = useState(false);
  
  const [recentPaths, setRecentPaths] = useState<string[]>([]);

  useEffect(() => { 
    if (open) {
      setLocalSettings(aiSettings); 
      const savedHistory = localStorage.getItem('multiAnno_aiModelPaths');
      if (savedHistory) {
        try {
          setRecentPaths(JSON.parse(savedHistory));
        } catch (e) {
          console.error("Failed to parse AI history", e);
        }
      }
    }
  }, [open]);

  const savePathsToHistory = (path: string) => {
    const trimmed = path.trim().replace(/\\/g, '/');
    if (!trimmed) return;
    
    let newHistory = [...recentPaths];
    newHistory = newHistory.filter(p => p !== trimmed);
    newHistory.unshift(trimmed);
    newHistory = newHistory.slice(0, 5);

    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_aiModelPaths', JSON.stringify(newHistory));
  };

  const handleSaveAndVerify = async () => {
    if (!localSettings.modelPath.trim()) return alert(t("aiSettings.alsertSetAI"));
    
    setIsVerifying(true);
    try {
      await updateAIConfig({
        model_path: localSettings.modelPath,
        model_type: localSettings.model,
        confidence: localSettings.confidence
      });
      
      savePathsToHistory(localSettings.modelPath);
      setAISettings({ ...localSettings, isConfigured: true });

      await showDialog({
        type: 'success',
        title: t("common.success", "Success"),
        description: t("aiSettings.alsertSetAIDone"),
      });
      onClose();
    } catch (error: any) {
      await showDialog({
        type: 'danger',
        title: t("common.error", "Error"),
        description: t("aiSettings.alsertSetAIFail") + error.message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-white dark:bg-neutral-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudLightning className="w-5 h-5 text-blue-500" /> {t("aiSettings.title")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label className="text-xs text-neutral-500">{t("aiSettings.modelType")}</Label>
            <Select value={localSettings.model} onValueChange={(v) => setLocalSettings({ ...localSettings, model: v })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAM-3">Segment Anything 3</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-neutral-500">{t("aiSettings.modelPath")}</Label>
            <div className="flex gap-2">
              <input 
                className="flex-1 text-xs p-2 border rounded-md"
                placeholder={t("aiSettings.infoModelPath")}
                value={localSettings.modelPath}
                onChange={(e) => setLocalSettings({ ...localSettings, modelPath: e.target.value })}
              />
              <Button variant="outline" className="px-3" onClick={() => setFileExplorerOpen(true)}>
                <FolderSearch className="w-4 h-4" />
              </Button>
            </div>
            
            {recentPaths.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] text-neutral-400 flex items-center gap-1 mb-1">
                  <History className="w-3 h-3" /> {t("aiSettings.infoHistoricalModelPath")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {recentPaths.map((p: string, i: number) => (
                    <span 
                      key={i} onClick={() => setLocalSettings({ ...localSettings, modelPath: p })}
                      className="text-[10px] bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded cursor-pointer hover:bg-blue-100 text-neutral-600 truncate max-w-[200px] border border-transparent hover:border-blue-300"
                      title={p}
                    >
                      {p.split('/').pop() || p.split('\\').pop()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center">
              <Label className="text-xs text-neutral-500">{t("aiSettings.confidence")}</Label>
              <span className="text-xs">{(localSettings.confidence ?? 0.25).toFixed(2)}</span>
            </div>
            <Slider 
              value={[(localSettings.confidence ?? 0.25) * 100]} max={100} step={1}
              onValueChange={(val) => setLocalSettings({ ...localSettings, confidence: (Array.isArray(val) ? val[0] : val) / 100 })}
            />
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSaveAndVerify} disabled={isVerifying}>
            {isVerifying ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> {t("aiSettings.infoLoadingModelPath")}</> :
             <><Save className="w-4 h-4 mr-2" /> {t("aiSettings.loadModel")}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <FileExplorerDialog 
      open={fileExplorerOpen}
      initialPath="/"
      selectType="file" 
      onClose={() => setFileExplorerOpen(false)}
      onConfirm={(paths) => {
        if (paths.length > 0) setLocalSettings({ ...localSettings, modelPath: paths[0] });
        setFileExplorerOpen(false);
      }}
    />
    </>
  );
}
