// src/components/GlobalConfirmDialog.tsx
import React from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useDialogStore, handleDialogConfirm, handleDialogCancel } from '../../store/useDialogStore';
import { AlertTriangle, Info, CheckCircle2, AlertOctagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function GlobalConfirmDialog() {
  const { t } = useTranslation();
  const { isOpen, title, description, type, confirmText, cancelText, hideCancel } = useDialogStore();

  const typeConfig = {
    info: {
      icon: <Info className="w-6 h-6 text-blue-500" />,
      btnClass: 'bg-blue-600 hover:bg-blue-700 text-white',
    },
    success: {
      icon: <CheckCircle2 className="w-6 h-6 text-green-500" />,
      btnClass: 'bg-green-600 hover:bg-green-700 text-white',
    },
    warning: {
      icon: <AlertTriangle className="w-6 h-6 text-amber-500" />,
      btnClass: 'bg-amber-500 hover:bg-amber-600 text-white',
    },
    danger: {
      icon: <AlertOctagon className="w-6 h-6 text-red-500" />,
      btnClass: 'bg-red-600 hover:bg-red-700 text-white',
    },
  };

  const currentConfig = typeConfig[type || 'info'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogCancel()}>
      <DialogContent className="sm:max-w-[400px] bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800">
        <DialogHeader className="flex flex-row items-start gap-4 space-y-0 pt-2">
          <div className={`p-2 rounded-full flex-shrink-0 ${type === 'danger' ? 'bg-red-100 dark:bg-red-900/30' : type === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' : type === 'success' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
            {currentConfig.icon}
          </div>
          <div className="flex-1">
            <DialogTitle className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 leading-tight">
              {title}
            </DialogTitle>
            {description && (
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {description}
              </p>
            )}
          </div>
        </DialogHeader>

        <DialogFooter className="mt-6 flex gap-2 sm:justify-end">
          {!hideCancel && (
            <Button 
              variant="outline" 
              onClick={handleDialogCancel}
              className="text-neutral-600 dark:text-neutral-300"
            >
              {cancelText || t('common.cancel', 'Cancel')}
            </Button>
          )}
          <Button 
            className={currentConfig.btnClass}
            onClick={handleDialogConfirm}
            autoFocus
          >
            {confirmText || (hideCancel ? t('common.gotIt', 'Got it') : t('common.confirm', 'Confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}