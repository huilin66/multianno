// src/components/GlobalConfirmDialog.tsx
import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { useDialogStore, handleDialogConfirm, handleDialogCancel } from '../../store/useDialogStore';
import { AlertTriangle, Info, BadgeCheck, AlertOctagon, Check, X as XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TypeStyle {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  accentClass: string;
  btnVariant: 'default' | 'destructive';
  btnClass: string;
}

const formatClockTime = (value: string | undefined, language: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleTimeString(language.startsWith('zh') ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
};

const formatDuration = (durationMs: number | undefined, startTime?: string, endTime?: string) => {
  const inferredDuration = durationMs ?? (
    startTime && endTime
      ? new Date(endTime).getTime() - new Date(startTime).getTime()
      : undefined
  );
  if (inferredDuration === undefined || !Number.isFinite(inferredDuration)) return '—';
  if (inferredDuration < 1000) return `${Math.max(0, Math.round(inferredDuration))} ms`;
  if (inferredDuration < 60000) return `${(inferredDuration / 1000).toFixed(1)} s`;
  return `${(inferredDuration / 60000).toFixed(1)} min`;
};

const typeConfig: Record<string, TypeStyle> = {
  info: {
    icon: Info,
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    accentClass: 'bg-primary',
    btnVariant: 'default',
    btnClass: '',
  },
  success: {
    icon: BadgeCheck,
    iconBg: 'bg-primary/10 dark:bg-primary/20',
    iconColor: 'text-primary',
    accentClass: 'bg-primary',
    btnVariant: 'default',
    btnClass: 'bg-primary text-primary-foreground hover:bg-primary/90',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    accentClass: 'bg-amber-500',
    btnVariant: 'default',
    btnClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  danger: {
    icon: AlertOctagon,
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    accentClass: 'bg-red-500',
    btnVariant: 'destructive',
    btnClass: '',
  },
};

export function GlobalConfirmDialog() {
  const { t, i18n } = useTranslation();
  const { isOpen, title, description, type, result, confirmText, cancelText, hideCancel } = useDialogStore();
  const config = typeConfig[type || 'info'];
  const Icon = config.icon;
  const isResultDialog = Boolean(result);
  const resultTitle = type === 'success'
    ? t('common.operationSucceeded')
    : type === 'danger'
      ? t('common.operationFailed')
      : title;
  const resultNote = result?.note;
  const ResultStatusIcon = type === 'danger' ? XIcon : Check;
  const resultStatusClass = type === 'danger'
    ? 'text-red-600 dark:text-red-400'
    : 'text-primary';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleDialogCancel()}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md gap-0 overflow-hidden rounded-xl border border-border/80 bg-popover p-0 shadow-2xl sm:max-w-md">
        <div aria-hidden="true" className={`h-1 w-full ${config.accentClass}`} />
        <div className="min-w-0 px-5 py-4 pr-12 sm:px-6 sm:py-4">
          {isResultDialog && result ? (
            <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 text-[13px] leading-5">
              <span className="flex items-center" aria-label={t('common.status')}>
                <ResultStatusIcon className={`size-5 stroke-[2.5] ${resultStatusClass}`} />
              </span>
              <DialogTitle className="break-words pt-0.5 text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground">
                {resultTitle}
              </DialogTitle>

              <span className="font-medium text-muted-foreground">{t('common.operation')}:</span>
              <span className="min-w-0 break-words text-foreground">{result.operation}</span>

              <span className="font-medium text-muted-foreground">{t('common.time')}:</span>
              <span className="min-w-0 break-words text-foreground">
                {formatDuration(result.durationMs, result.startTime, result.endTime)}{' '}
                <span className="text-muted-foreground">
                  [{formatClockTime(result.startTime, i18n.language)} - {formatClockTime(result.endTime, i18n.language)}]
                </span>
              </span>

              <span className="font-medium text-muted-foreground">{t('common.details')}:</span>
              {result.details && result.details.length > 0 ? (
                <ul className="min-w-0 space-y-1 text-foreground">
                  {result.details.map((detail, index) => (
                    <li key={`${detail.label}-${index}`} className="break-words [overflow-wrap:anywhere]">
                      <span className="font-medium">{detail.label}:</span>{' '}{detail.value}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}

              {resultNote && (
                <>
                  <span className="font-medium text-muted-foreground">{t('common.note')}:</span>
                  <p className="min-w-0 whitespace-pre-wrap break-words text-muted-foreground [overflow-wrap:anywhere]">
                    {resultNote}
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-start gap-4">
              <div className={`mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ring-4 ring-background ${config.iconBg}`}>
                <Icon className={`size-5 ${config.iconColor}`} />
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <DialogTitle className="break-words text-[15px] font-semibold leading-5 tracking-[-0.01em] text-foreground">
                  {title}
                </DialogTitle>
                {description ? (
                  <DialogDescription className="mt-2 max-w-none select-text whitespace-pre-wrap text-[13px] leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                    {description}
                  </DialogDescription>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/80 bg-muted/20 px-5 py-2 sm:px-6">
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
