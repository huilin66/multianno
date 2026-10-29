// src/store/useDialogStore.ts
import { create } from 'zustand';

export type DialogType = 'info' | 'success' | 'warning' | 'danger';

export interface DialogResultDetail {
  label: string;
  value: string;
}

export interface DialogResult {
  operation: string;
  startTime?: string;
  endTime?: string;
  durationMs?: number;
  details?: DialogResultDetail[];
  note?: string;
}

export interface DialogOptions {
  title: string;
  description?: string;
  type?: DialogType;
  result?: DialogResult;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
}

interface DialogState extends DialogOptions {
  isOpen: boolean;
  openDialog: (options: DialogOptions) => void;
  closeDialog: () => void;
}

const defaultOptions: DialogOptions = {
  title: '',
  description: '',
  type: 'info',
  result: undefined,
  confirmText: '',
  cancelText: '',
  hideCancel: false,
};

export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  ...defaultOptions,
  openDialog: (options) => set({ ...defaultOptions, ...options, isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));

let resolveCallback: ((value: boolean) => void) | null = null;

export const showDialog = (options: DialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    resolveCallback = resolve;
    
    useDialogStore.getState().openDialog({
      ...defaultOptions,
      type: 'info',
      hideCancel: options.type === 'info' || options.type === 'success',
      ...options,
    });
  });
};

export const handleDialogConfirm = () => {
  resolveCallback?.(true);
  cleanup();
};

export const handleDialogCancel = () => {
  resolveCallback?.(false);
  cleanup();
};

const cleanup = () => {
  resolveCallback = null;
  useDialogStore.getState().closeDialog();
};
