import { create } from 'zustand';
import { reverseResolveShibName } from '../lib/sns';

interface SnsState {
  // address (lowercase) → display name ("mazrael.shib") or null (checked, no name)
  nameCache: Record<string, string | null>;
  // Addresses currently being resolved
  resolving: Set<string>;
}

interface SnsActions {
  resolveAndCache: (address: string) => Promise<void>;
  lookupName: (address: string) => string | null | undefined;
  batchResolve: (addresses: string[]) => void;
}

export const useSnsStore = create<SnsState & SnsActions>((set, get) => ({
  nameCache: {},
  resolving: new Set(),

  resolveAndCache: async (address: string) => {
    const key = address.toLowerCase();
    const state = get();

    // Already cached or currently resolving
    if (key in state.nameCache || state.resolving.has(key)) return;

    // Mark as resolving
    set((s) => ({
      resolving: new Set([...s.resolving, key]),
    }));

    try {
      const name = await reverseResolveShibName(address);
      set((s) => {
        const newResolving = new Set(s.resolving);
        newResolving.delete(key);
        return {
          nameCache: { ...s.nameCache, [key]: name },
          resolving: newResolving,
        };
      });
    } catch {
      set((s) => {
        const newResolving = new Set(s.resolving);
        newResolving.delete(key);
        return {
          nameCache: { ...s.nameCache, [key]: null },
          resolving: newResolving,
        };
      });
    }
  },

  lookupName: (address: string) => {
    const key = address.toLowerCase();
    const state = get();
    if (key in state.nameCache) return state.nameCache[key];
    return undefined; // Not yet resolved
  },

  batchResolve: (addresses: string[]) => {
    const state = get();
    for (const addr of addresses) {
      const key = addr.toLowerCase();
      if (!(key in state.nameCache) && !state.resolving.has(key)) {
        // Fire and forget - don't await, they'll update state individually
        state.resolveAndCache(addr);
      }
    }
  },
}));

/**
 * Hook: returns the .shib name for an address, or null if none.
 * Returns undefined while still resolving.
 * Automatically triggers resolution if not cached.
 */
export function useShibName(address: string | null | undefined): string | null | undefined {
  const resolveAndCache = useSnsStore((s) => s.resolveAndCache);
  const name = useSnsStore((s) => {
    if (!address) return null;
    const key = address.toLowerCase();
    if (key in s.nameCache) return s.nameCache[key];
    return undefined;
  });
  const isResolving = useSnsStore((s) => {
    if (!address) return false;
    return s.resolving.has(address.toLowerCase());
  });

  // Trigger resolution if needed (not cached and not resolving)
  if (address && name === undefined && !isResolving) {
    // Use setTimeout to avoid calling setState during render
    setTimeout(() => resolveAndCache(address), 0);
  }

  return address ? name : null;
}
