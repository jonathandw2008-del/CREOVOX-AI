import { create } from 'zustand'
import { copyToClipboard } from '@/utils/helpers'

export type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  message: string
  kind: ToastKind
}

interface ToastState {
  toasts: Toast[]
  push: (message: string, kind?: ToastKind) => void
  dismiss: (id: number) => void
}

let counter = 0

export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, kind = 'success') => {
    const id = ++counter
    set({ toasts: [...get().toasts.slice(-2), { id, message, kind }] })
    setTimeout(() => get().dismiss(id), 3200)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}))

/** Imperative helper usable outside React components. */
export const toast = (message: string, kind?: ToastKind) => useToast.getState().push(message, kind)

export async function copyWithToast(text: string, label: string) {
  const ok = await copyToClipboard(text)
  toast(ok ? `${label} copied` : 'Copy failed — select the text and copy manually', ok ? 'success' : 'error')
}
