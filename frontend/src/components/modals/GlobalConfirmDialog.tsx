// src/components/GlobalConfirmDialog.tsx
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
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
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border border-border/80 bg-popover p-0 shadow-2xl sm:max-w-md">
        <div className="min-w-0 px-5 py-5 pr-12 sm:px-6 sm:py-5">
          <div className="flex items-start gap-4">
            <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-background ${config.iconBg}`}>
              <Icon className={`size-5 ${config.iconColor}`} />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <DialogTitle className="break-words text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="mt-2 max-w-none select-text whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/80 bg-muted/20 px-5 py-3 sm:px-6">
          {!hideCancel && (
            <Button variant="outline" size="sm" className="h-8 min-w-[72px] px-3" onClick={handleDialogCancel}>
              {cancelText || t('common.cancel')}
            </Button>
          )}
          <Button
            variant={config.btnVariant}
            size="sm"
            className={`h-8 min-w-[72px] px-3 ${config.btnClass || ''}`}
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
