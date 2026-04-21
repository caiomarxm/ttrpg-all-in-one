import { create } from 'zustand'

/** Ephemeral UI shell state (modals, tools, selections). Expand per bounded context later. */
type UiState = {
  /** Placeholder flag so the store is exercised in dev/build. */
  hydrated: boolean
  setHydrated: (value: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  hydrated: false,
  setHydrated: (value) => set({ hydrated: value }),
}))
