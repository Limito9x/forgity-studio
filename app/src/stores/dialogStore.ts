import { create } from 'zustand';
import type { GlobalDialogRegistry } from '@/lib/dialog-registry';

interface DialogEntry {
  id: string
  isOpen: boolean
  data?: any
}

interface DialogStore {
  dialogs: Record<string, DialogEntry>
  openDialog: <K extends keyof GlobalDialogRegistry>(
    id: K,
    ...args: GlobalDialogRegistry[K] extends undefined ? [] : [data: GlobalDialogRegistry[K]]
  ) => void
  closeDialog: (id: string) => void
}

export const useDialogStore = create<DialogStore>((set) => ({
    dialogs: {},
    openDialog: (id: any, data?: any) =>
    set((s) => ({
      dialogs: {
        ...s.dialogs,
        [id]: { ...s.dialogs[id], id, isOpen: true, data },
      },
    })),
  closeDialog: (id) =>
    set((s) => ({
      dialogs: {
        ...s.dialogs,
        [id]: { ...s.dialogs[id], id, isOpen: false },
      },
    })),
}));
