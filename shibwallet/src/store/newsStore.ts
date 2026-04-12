import { create } from 'zustand';

interface WPPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  date: string;
  _source: 'news' | 'magazine';
  _embedded?: {
    'wp:featuredmedia'?: {
      source_url: string;
      alt_text?: string;
      media_details?: {
        sizes?: Record<string, { source_url: string; width: number; height: number }>;
      };
    }[];
    author?: { name: string; avatar_urls?: Record<string, string> }[];
    'wp:term'?: { name: string; slug: string }[][];
  };
}

interface NewsState {
  newsPosts: WPPost[];
  magPosts: WPPost[];
  newsPage: number;
  magPage: number;
  newsHasMore: boolean;
  magHasMore: boolean;
  lastFetchedAt: number | null; // timestamp of last fetch
}

interface NewsActions {
  setNewsPosts: (posts: WPPost[]) => void;
  appendNewsPosts: (posts: WPPost[]) => void;
  setMagPosts: (posts: WPPost[]) => void;
  appendMagPosts: (posts: WPPost[]) => void;
  setNewsPage: (p: number) => void;
  setMagPage: (p: number) => void;
  setNewsHasMore: (v: boolean) => void;
  setMagHasMore: (v: boolean) => void;
  markFetched: () => void;
  needsRefresh: () => boolean;
  clear: () => void;
}

const STALE_AFTER_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_KEY = 'shibwallet_news_cache';
// Cap persisted posts so we don't blow the localStorage quota. Users can
// still scroll further — the store keeps everything in memory, we just
// don't persist more than this on disk.
const PERSIST_LIMIT = 30;

type PersistShape = Pick<
  NewsState,
  'newsPosts' | 'magPosts' | 'newsPage' | 'magPage' | 'newsHasMore' | 'magHasMore' | 'lastFetchedAt'
>;

function readCacheSync(): Partial<PersistShape> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as Partial<PersistShape>;
    return {
      newsPosts: Array.isArray(data.newsPosts) ? data.newsPosts : [],
      magPosts: Array.isArray(data.magPosts) ? data.magPosts : [],
      newsPage: data.newsPage ?? 1,
      magPage: data.magPage ?? 1,
      newsHasMore: data.newsHasMore ?? true,
      magHasMore: data.magHasMore ?? true,
      lastFetchedAt: data.lastFetchedAt ?? null,
    };
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveCacheDebounced(state: NewsState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const shape: PersistShape = {
        newsPosts: state.newsPosts.slice(0, PERSIST_LIMIT),
        magPosts: state.magPosts.slice(0, PERSIST_LIMIT),
        newsPage: state.newsPage,
        magPage: state.magPage,
        newsHasMore: state.newsHasMore,
        magHasMore: state.magHasMore,
        lastFetchedAt: state.lastFetchedAt,
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(shape));
    } catch {
      /* quota — ignore */
    }
  }, 300);
}

const INITIAL = readCacheSync();

export const useNewsStore = create<NewsState & NewsActions>((set, get) => ({
  newsPosts: INITIAL.newsPosts ?? [],
  magPosts: INITIAL.magPosts ?? [],
  newsPage: INITIAL.newsPage ?? 1,
  magPage: INITIAL.magPage ?? 1,
  newsHasMore: INITIAL.newsHasMore ?? true,
  magHasMore: INITIAL.magHasMore ?? true,
  lastFetchedAt: INITIAL.lastFetchedAt ?? null,

  setNewsPosts: (posts) => {
    set({ newsPosts: posts });
    saveCacheDebounced(get());
  },
  appendNewsPosts: (posts) => {
    set((s) => ({ newsPosts: [...s.newsPosts, ...posts] }));
    saveCacheDebounced(get());
  },
  setMagPosts: (posts) => {
    set({ magPosts: posts });
    saveCacheDebounced(get());
  },
  appendMagPosts: (posts) => {
    set((s) => ({ magPosts: [...s.magPosts, ...posts] }));
    saveCacheDebounced(get());
  },
  setNewsPage: (p) => {
    set({ newsPage: p });
    saveCacheDebounced(get());
  },
  setMagPage: (p) => {
    set({ magPage: p });
    saveCacheDebounced(get());
  },
  setNewsHasMore: (v) => {
    set({ newsHasMore: v });
    saveCacheDebounced(get());
  },
  setMagHasMore: (v) => {
    set({ magHasMore: v });
    saveCacheDebounced(get());
  },
  markFetched: () => {
    set({ lastFetchedAt: Date.now() });
    saveCacheDebounced(get());
  },
  needsRefresh: () => {
    const { lastFetchedAt, newsPosts, magPosts } = get();
    if (!lastFetchedAt || (newsPosts.length === 0 && magPosts.length === 0)) return true;
    return Date.now() - lastFetchedAt > STALE_AFTER_MS;
  },
  clear: () => {
    set({
      newsPosts: [],
      magPosts: [],
      newsPage: 1,
      magPage: 1,
      newsHasMore: true,
      magHasMore: true,
      lastFetchedAt: null,
    });
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch {
      /* ignore */
    }
  },
}));
