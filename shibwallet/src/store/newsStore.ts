import { create } from 'zustand';

interface WPPost {
  id: number;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  date: string;
  _source: 'news' | 'magazine';
  _embedded?: {
    'wp:featuredmedia'?: { source_url: string; alt_text?: string }[];
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

export const useNewsStore = create<NewsState & NewsActions>((set, get) => ({
  newsPosts: [],
  magPosts: [],
  newsPage: 1,
  magPage: 1,
  newsHasMore: true,
  magHasMore: true,
  lastFetchedAt: null,

  setNewsPosts: (posts) => set({ newsPosts: posts }),
  appendNewsPosts: (posts) => set((s) => ({ newsPosts: [...s.newsPosts, ...posts] })),
  setMagPosts: (posts) => set({ magPosts: posts }),
  appendMagPosts: (posts) => set((s) => ({ magPosts: [...s.magPosts, ...posts] })),
  setNewsPage: (p) => set({ newsPage: p }),
  setMagPage: (p) => set({ magPage: p }),
  setNewsHasMore: (v) => set({ newsHasMore: v }),
  setMagHasMore: (v) => set({ magHasMore: v }),
  markFetched: () => set({ lastFetchedAt: Date.now() }),
  needsRefresh: () => {
    const { lastFetchedAt, newsPosts, magPosts } = get();
    if (!lastFetchedAt || (newsPosts.length === 0 && magPosts.length === 0)) return true;
    return Date.now() - lastFetchedAt > STALE_AFTER_MS;
  },
  clear: () => set({
    newsPosts: [],
    magPosts: [],
    newsPage: 1,
    magPage: 1,
    newsHasMore: true,
    magHasMore: true,
    lastFetchedAt: null,
  }),
}));
