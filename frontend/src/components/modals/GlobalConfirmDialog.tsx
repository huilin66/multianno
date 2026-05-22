// src/components/GlobalConfirmDialog.tsx
import React from 'react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import { useDialogStore, handleDialogConfirm, handleDialogCancel } from '../../store/useDialogStore';
import { AlertTriangle, Info, CheckCircle2, AlertOctagon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TypeStyle {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  btnVariant: 'default' | 'destructive';
  btnClass: string;
}

const typeConfig: Record<string, TypeStyle> = {
  info: {
    icon: Info,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    btnVariant: 'default',
    btnClass: '',
  },
  success: {
    icon: CheckCircle2,
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    btnVariant: 'default',
    btnClass: 'bg-green-600 hover:bg-green-700 text-white',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    btnVariant: 'default',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    icon: AlertOctagon,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    btnVariant: 'destructive',
    btnClass: '',
  },
};

export function GlobalConfirmDialog() {
  const { t } = useTranslation();
  const { isOpen, title, description, type, confirmText, cancelText, hideCancel } = useDialogStore();
  const config = typeConfig[type || 'info'];
  const Icon = config.icon;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogCancel()}>
      <DialogContent className="max-w-sm sm:max-w-sm p-0 border-border overflow-hidden gap-0">
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={`p-2.5 rounded-full shrink-0 ${config.iconBg}`}>
              <Icon className={`w-5 h-5 ${config.iconColor}`} />
            </div>
            <div className="min-w-0 pt-0.5">
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              {description && (
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {description}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-3.5 bg-muted/30 border-t border-border">
          {!hideCancel && (
            <Button variant="outline" size="sm" onClick={handleDialogCancel}>
              {cancelText || t('common.cancel')}
            </Button>
          )}
          <Button
            variant={config.btnVariant}
            size="sm"
            className={config.btnClass || undefined}
            onClick={handleDialogConfirm}
            autoFocus
          >
            {confirmText || (hideCancel ? t('common.confirm') : t('common.confirm'))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}