// src/components/GlobalConfirmDialog.tsx
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useDialogStore, handleDialogConfirm, handleDialogCancel } from '../../store/useDialogStore';
import { AlertTriangle, Info, CheckCircle2, AlertOctagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const typeConfig = {
  info: {
    icon: Info,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-500',
    btnClass: 'text-white',
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-500',
    btnClass: 'text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-500',
    btnClass: 'text-white',
  },
  danger: {
    icon: AlertOctagon,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-500',
    btnClass: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  },
};

export function GlobalConfirmDialog() {
  const { t } = useTranslation();
  const { isOpen, title, description, type, confirmText, cancelText, hideCancel } = useDialogStore();
  const config = typeConfig[type || 'info'];
  const Icon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogCancel()}>
      <DialogContent className="max-w-sm sm:max-w-sm p-0 border-border overflow-hidden">
        <DialogHeader className="p-4 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-full shrink-0 ${config.iconBg}`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description && (
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center justify-end gap-3 p-4">
          {!hideCancel && (
            <Button variant="outline" size="sm" onClick={handleDialogCancel}>
              {cancelText || t('common.cancel')}
            </Button>
          )}
          <Button
            size="sm"
            className={config.btnClass}
            onClick={handleDialogConfirm}
            autoFocus
          >
            {confirmText || (hideCancel ? t('common.gotIt') : t('common.confirm'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}