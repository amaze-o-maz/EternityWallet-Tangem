import { create } from 'zustand';
import type { TangemErrorCode } from '../lib/tangem';

/**
 * Tracks the live state of any in-progress Tangem NFC interaction so a
 * single React modal can render the correct visual without each call
 * site having to mount its own.
 */
export type TangemUiStatus = 'idle' | 'waiting' | 'success' | 'error';
export type TangemUiMode = 'connect' | 'sign';

export interface TangemUiState {
  status: TangemUiStatus;
  mode: TangemUiMode | null;
  message: string;
  errorCode?: TangemErrorCode;
}

interface TangemUiActions {
  set: (state: Partial<TangemUiState>) => void;
  reset: () => void;
}

export const useTangemUiStore = create<TangemUiState & TangemUiActions>((set) => ({
  status: 'idle',
  mode: null,
  message: '',
  errorCode: undefined,
  set: (state) => set(state),
  reset: () =>
    set({ status: 'idle', mode: null, message: '', errorCode: undefined }),
}));

export function setTangemUiState(state: Partial<TangemUiState>) {
  useTangemUiStore.getState().set(state);
}

export function resetTangemUiState() {
  useTangemUiStore.getState().reset();
}
