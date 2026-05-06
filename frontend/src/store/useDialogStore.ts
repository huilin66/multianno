// src/store/useDialogStore.ts
import { create } from 'zustand';
import React from 'react';

export type DialogType = 'info' | 'success' | 'warning' | 'danger';

export interface DialogOptions {
  title: string;
  description?: React.ReactNode;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
}

interface DialogState extends DialogOptions {
  isOpen: boolean;
  openDialog: (options: DialogOptions) => void;
  closeDialog: () => void;
}


export const useDialogStore = create<DialogState>((set) => ({
  isOpen: false,
  title: '',
  description: '',
  type: 'info',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  hideCancel: false,
  openDialog: (options) => set({ ...options, isOpen: true }),
  closeDialog: () => set({ isOpen: false }),
}));

let resolveCallback: ((value: boolean) => void) | null = null;

export const showDialog = (options: DialogOptions): Promise<boolean> => {
  return new Promise((resolve) => {
    resolveCallback = resolve;
    const defaultOptions: Partial<DialogOptions> = {
      type: 'info',
      hideCancel: options.type === 'info' || options.type === 'success',
    };
    useDialogStore.getState().openDialog({ ...defaultOptions, ...options });
  });
};

export const handleDialogConfirm = () => {
  if (resolveCallback) resolveCallback(true);
  useDialogStore.getState().closeDialog();
  resolveCallback = null;
};

export const handleDialogCancel = () => {
  if (resolveCallback) resolveCallback(false);
  useDialogStore.getState().closeDialog();
  resolveCallback = null;
};