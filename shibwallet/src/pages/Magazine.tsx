import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, RefreshCw, BookOpen, Newspaper } from 'lucide-react';
import { useWalletStore } from '../store/walletStore';
import { useNewsStore } from '../store/newsStore';

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

type Source = 'news' | 'magazine';
type Tab = 'all' | 'news' | 'magazine';

/** Pick the best image size for a given max width */
function getImageUrl(post: WPPost, maxWidth: number): string | undefined {
  const media = post._embedded?.['wp:featuredmedia']?.[0];
  if (!media) return undefined;
  const sizes = media.media_details?.sizes;
  if (sizes) {
    // Pick smallest size that's >= maxWidth, or the largest available
    const sorted = Object.values(sizes).sort((a, b) => a.width - b.width);
    const fit = sorted.find((s) => s.width >= maxWidth);
    if (fit) return fit.source_url;
    // Fallback to largest available (still smaller than full)
    if (sorted.length > 0) return sorted[sorted.length - 1].source_url;
  }
  return media.source_url;
}

const NEWS_API = 'https://news.shib.io/wp-json/wp/v2/posts';
const MAG_API = 'https://magazine.shib.io/wp-json/wp/v2/posts';
const PER_PAGE = 10;

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const Magazine: React.FC = () => {
  const navigate = useNavigate();
  const { isUnlocked } = useWalletStore();
  const store = useNewsStore();
  const [tab, setTab] = useState<Tab>('all');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [imgLoaded, setImgLoaded] = useState<Set<number>>(new Set());
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUnlocked) navigate('/lock', { replace: true });
  }, [isUnlocked, navigate]);

  const fetchPosts = useCallback(async (source: Source, page: number): Promise<WPPost[]> => {
    const api = source === 'news' ? NEWS_API : MAG_API;
    const resp = await fetch(`${api}?per_page=${PER_PAGE}&page=${page}&_embed`);
    if (!resp.ok) return [];
    const totalPages = parseInt(resp.headers.get('X-WP-TotalPages') || '1', 10);
    const posts: WPPost[] = await resp.json();
    if (source === 'news') store.setNewsHasMore(page < totalPages);
    else store.setMagHasMore(page < totalPages);
    return posts.map((p) => ({ ...p, _source: source }));
  }, [store]);

  const loadInitial = useCallback(async (force = false) => {
    if (!force && !store.needsRefresh()) return;
    setLoading(true);
    try {
      const [news, mag] = await Promise.all([
        fetchPosts('news', 1),
        fetchPosts('magazine', 1),
      ]);
      store.setNewsPosts(news);
      store.setMagPosts(mag);
      store.setNewsPage(1);
      store.setMagPage(1);
      store.markFetched();
    } catch {
      // Silently fail - show whatever we have
    } finally {
      setLoading(false);
    }
  }, [fetchPosts, store]);

  useEffect(() => {
    loadInitial();
    // Silently revalidate when the app returns from background so stale
    // cached articles get refreshed. `loadInitial` is gated on
    // `needsRefresh()` so this is a no-op when the cache is still fresh.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadInitial();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadInitial]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitial(true);
    setRefreshing(false);
  };

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      if ((tab === 'all' || tab === 'news') && store.newsHasMore) {
        const nextPage = store.newsPage + 1;
        const posts = await fetchPosts('news', nextPage);
        store.appendNewsPosts(posts);
        store.setNewsPage(nextPage);
      }
      if ((tab === 'all' || tab === 'magazine') && store.magHasMore) {
        const nextPage = store.magPage + 1;
        const posts = await fetchPosts('magazine', nextPage);
        store.appendMagPosts(posts);
        store.setMagPage(nextPage);
      }
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  };

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const hasMore = tab === 'news' ? store.newsHasMore : tab === 'magazine' ? store.magHasMore : store.newsHasMore || store.magHasMore;
    if (!hasMore || loadingMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, store.newsHasMore, store.magHasMore, loadingMore, store.newsPage, store.magPage]);

  const handleImgLoad = (id: number) => {
    setImgLoaded((prev) => new Set(prev).add(id));
  };

  // Merge and sort posts by date
  const visiblePosts = (() => {
    let posts: WPPost[] = [];
    if (tab === 'all') posts = [...store.newsPosts, ...store.magPosts];
    else if (tab === 'news') posts = store.newsPosts;
    else posts = store.magPosts;
    return posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  })();

  const featured = visiblePosts[0];
  const rest = visiblePosts.slice(1);
  const showInitialLoading = loading && store.newsPosts.length === 0 && store.magPosts.length === 0;

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'all', label: 'All', icon: RefreshCw },
    { key: 'news', label: 'Daily', icon: Newspaper },
    { key: 'magazine', label: 'Magazine', icon: BookOpen },
  ];

  if (!isUnlocked) return null;

  return (
        <div className="max-w-md mx-auto w-full px-5 pt-6 pb-40">
          {/* Title */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-[#FF6900] to-[#FFB800] bg-clip-text text-transparent">
                Shib News
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">Powered by The Shib Daily & Shib Magazine</p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center
                         text-gray-400 hover:text-white transition-all active:scale-90"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Source tabs */}
          <div className="flex gap-2 mb-5">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200
                             ${isActive
                               ? 'bg-gradient-to-r from-[#FF6900]/20 to-[#FFB800]/10 text-[#FF6900] border border-[#FF6900]/20'
                               : 'bg-white/[0.03] text-gray-400 border border-white/[0.06] hover:border-white/[0.12]'
                             }`}
                >
                  <Icon size={12} />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Loading skeleton - only on first load when cache is empty */}
          {showInitialLoading && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden animate-pulse">
                <div className="w-full h-48 bg-white/[0.06]" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-white/[0.06] rounded w-2/3" />
                  <div className="h-3 bg-white/[0.04] rounded w-full" />
                  <div className="h-3 bg-white/[0.04] rounded w-4/5" />
                </div>
              </div>
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse">
                  <div className="w-20 h-20 rounded-lg bg-white/[0.06] shrink-0" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3 bg-white/[0.06] rounded w-3/4" />
                    <div className="h-2.5 bg-white/[0.04] rounded w-full" />
                    <div className="h-2.5 bg-white/[0.04] rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Content */}
          {!showInitialLoading && (
            <div className="space-y-4">
              {/* Featured article */}
              {featured && (
                <button
                  onClick={() => navigate(`/wallet/browser?url=${encodeURIComponent(featured.link)}`)}
                  className="block w-full text-left group rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden
                             hover:border-[#FF6900]/20 transition-all duration-300"
                >
                  <div className="relative w-full h-48 bg-white/[0.04] overflow-hidden">
                    {getImageUrl(featured, 768) && (
                      <img
                        src={getImageUrl(featured, 768)}
                        alt=""
                        loading="eager"
                        decoding="async"
                        className={`w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105
                                   ${imgLoaded.has(featured.id) ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => handleImgLoad(featured.id)}
                      />
                    )}
                    <div className="absolute top-3 left-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide backdrop-blur-xl
                                       ${featured._source === 'magazine'
                                         ? 'bg-purple-500/80 text-white'
                                         : 'bg-[#FF6900]/80 text-white'
                                       }`}>
                        {featured._source === 'magazine' ? 'Magazine' : 'Daily'}
                      </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h2
                        className="text-base font-bold text-white leading-snug line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: featured.title.rendered }}
                      />
                    </div>
                  </div>
                  <div className="px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {featured._embedded?.author?.[0]?.avatar_urls?.['48'] && (
                        <img
                          src={featured._embedded.author[0].avatar_urls['48']}
                          alt=""
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span className="text-[11px] text-gray-400">
                        {featured._embedded?.author?.[0]?.name}
                      </span>
                      <span className="text-[10px] text-gray-600">
                        {timeAgo(featured.date)}
                      </span>
                    </div>
                    <ChevronRight size={12} className="text-gray-500" />
                  </div>
                </button>
              )}

              {/* Article list */}
              {rest.map((post, index) => (
                <button
                  key={`${post._source}-${post.id}`}
                  onClick={() => navigate(`/wallet/browser?url=${encodeURIComponent(post.link)}`)}
                  className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]
                             hover:border-[#FF6900]/20 transition-all duration-300 group w-full text-left"
                  style={{ animation: `slide-up-fade 0.35s ease-out ${index * 40}ms both` }}
                >
                  <div className="w-20 h-20 rounded-lg bg-white/[0.04] overflow-hidden shrink-0">
                    {getImageUrl(post, 300) && (
                      <img
                        src={getImageUrl(post, 300)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={`w-full h-full object-cover transition-opacity duration-300 group-hover:scale-105
                                   ${imgLoaded.has(post.id) ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => handleImgLoad(post.id)}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div>
                      <h3
                        className="text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-[#FF6900]/90 transition-colors"
                        dangerouslySetInnerHTML={{ __html: post.title.rendered }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide
                                       ${post._source === 'magazine'
                                         ? 'bg-purple-500/15 text-purple-400'
                                         : 'bg-[#FF6900]/10 text-[#FF6900]'
                                       }`}>
                        {post._source === 'magazine' ? 'Mag' : 'Daily'}
                      </span>
                      {post._embedded?.['wp:term']?.[0]?.[0] && (
                        <span className="text-[10px] text-gray-500 truncate">
                          {post._embedded['wp:term'][0][0].name}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-600 ml-auto shrink-0">
                        {timeAgo(post.date)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}

              {/* Load more / bottom states */}
              {loadingMore && (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-[#FF6900] border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loadingMore && visiblePosts.length > 0 && (
                (() => {
                  const hasMore = tab === 'news' ? store.newsHasMore : tab === 'magazine' ? store.magHasMore : store.newsHasMore || store.magHasMore;
                  return hasMore ? (
                    <button
                      onClick={loadMore}
                      className="w-full py-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-gray-400
                                 text-xs font-medium hover:border-[#FF6900]/20 hover:text-gray-300 transition-all"
                    >
                      Load more articles
                    </button>
                  ) : (
                    <p className="text-center text-[11px] text-gray-600 py-4">You're all caught up</p>
                  );
                })()
              )}

              {!showInitialLoading && visiblePosts.length === 0 && (
                <div className="text-center py-12">
                  <Newspaper size={32} className="mx-auto text-gray-600 mb-3" />
                  <p className="text-sm text-gray-400">No articles available</p>
                  <p className="text-xs text-gray-600 mt-1">Pull to refresh or try again later</p>
                </div>
              )}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-1" />
        </div>
  );
};

export default Magazine;
