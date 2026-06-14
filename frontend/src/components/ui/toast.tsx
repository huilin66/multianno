import React from 'react';
import { useToastStore } from '../../store/useToastStore';
import { X, Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const iconMap = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
};

const colorMap = {
  info: 'border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  success: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  error: 'border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const Icon = iconMap[toast.type];
        return (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2 px-4 py-3 rounded-lg border shadow-lg text-sm max-w-sm animate-in slide-in-from-right-full duration-300',
              colorMap[toast.type]
            )}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity -mr-0.5 -mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
