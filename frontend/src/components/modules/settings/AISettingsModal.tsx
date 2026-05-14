// src/components/modules/AISettingsModal.tsx
import React, { useState, useEffect } from 'react';
import { useStore } from '../../../store/useStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Slider } from '../../ui/slider';
import { Loader2, FolderSearch, History, Check, X } from 'lucide-react';
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
    
    const newHistory = [trimmed, ...recentPaths.filter(p => p !== trimmed)].slice(0, 5);
    setRecentPaths(newHistory);
    localStorage.setItem('multiAnno_aiModelPaths', JSON.stringify(newHistory));
  };

  const handleSaveAndVerify = async () => {
    if (!localSettings.modelPath.trim()) {
      alert(t("aiSettings.alertSetAI"));
      return;
    }
    
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
        title: t("common.success"),
        description: t("aiSettings.alertSetAIDone"),
      });
      onClose();
    } catch (error: any) {
      await showDialog({
        type: 'danger',
        title: t("common.error"),
        description: t("aiSettings.alertSetAIFail") + error.message,
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCancel = () => {
    setLocalSettings(aiSettings);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent className="max-w-md sm:max-w-md p-0 border-border overflow-hidden">
          <DialogHeader className="p-4 border-b border-border shrink-0">
            <DialogTitle>{t("aiSettings.title")}</DialogTitle>
          </DialogHeader>

          <div className="p-5 space-y-5">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t("aiSettings.modelType")}
              </Label>
              <Select 
                value={localSettings.model} 
                onValueChange={(v) => setLocalSettings({ ...localSettings, model: v })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SAM-3">Segment Anything 3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t("aiSettings.modelPath")}
              </Label>
              <div className="relative">
                <Input 
                  className="h-9 text-xs pr-9 font-mono"
                  placeholder={t("aiSettings.infoModelPath")}
                  value={localSettings.modelPath}
                  onChange={(e) => setLocalSettings({ ...localSettings, modelPath: e.target.value })}
                />
                <button
                  onClick={() => setFileExplorerOpen(true)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <FolderSearch size={14} />
                </button>
              </div>
              
              {recentPaths.length > 0 && (
                <div className="pt-1">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 mb-1.5">
                    <History className="w-3 h-3" /> {t("aiSettings.infoHistoricalModelPath")}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {recentPaths.map((p, i) => (
                      <button
                        key={i} 
                        onClick={() => setLocalSettings({ ...localSettings, modelPath: p })}
                        className="text-[10px] bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary px-2 py-1 rounded transition-colors truncate max-w-[180px] border border-transparent hover:border-primary/30"
                        title={p}
                      >
                        {p.split('/').pop() || p.split('\\').pop()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("aiSettings.confidence")}
                </Label>
                <span className="text-xs font-mono font-bold">
                  {(localSettings.confidence ?? 0.25).toFixed(2)}
                </span>
              </div>
              <Slider 
                value={[(localSettings.confidence ?? 0.25) * 100]} 
                max={100} 
                step={1}
                onValueChange={(val) => setLocalSettings({ 
                  ...localSettings, 
                  confidence: (Array.isArray(val) ? val[0] : val) / 100 
                })}
                className="py-1"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0</span>
                <span>0.5</span>
                <span>1.0</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 p-4 border-t border-border shrink-0">
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="w-3.5 h-3.5 mr-1.5" />
              {t("common.cancel")}
            </Button>
            <Button 
              size="sm" 
              className="text-white" 
              onClick={handleSaveAndVerify} 
              disabled={isVerifying}
            >
              {isVerifying ? (
                <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> {t("common.loading")}</>
              ) : (
                <><Check className="w-3.5 h-3.5 mr-1.5" /> {t("common.confirm")}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FileExplorerDialog 
        open={fileExplorerOpen}
        initialPath={localSettings.modelPath || '/'}
        selectType="file" 
        onClose={() => setFileExplorerOpen(false)}
        onConfirm={(paths) => {
          if (paths.length > 0) {
            setLocalSettings({ ...localSettings, modelPath: paths[0] });
          }
          setFileExplorerOpen(false);
        }}
      />
    </>
  );
}