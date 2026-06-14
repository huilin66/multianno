import { create } from 'zustand';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

let toastCounter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${++toastCounter}-${Date.now()}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    const duration = toast.duration ?? 4000;
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },
  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = {
  info: (message: string) => useToastStore.getState().addToast({ message, type: 'info' }),
  success: (message: string) => useToastStore.getState().addToast({ message, type: 'success' }),
  warning: (message: string) => useToastStore.getState().addToast({ message, type: 'warning', duration: 6000 }),
  error: (message: string) => useToastStore.getState().addToast({ message, type: 'error', duration: 8000 }),
};
