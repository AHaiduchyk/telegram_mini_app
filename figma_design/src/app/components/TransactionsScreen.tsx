import { Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function TransactionsScreen() {
  const pageSize = 10;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);

  const fetchExpenses = useCallback(
    async (offsetValue: number, replace: boolean) => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) {
        setError('Open this Mini App inside Telegram.');
        setLoading(false);
        setLoadingMore(false);
        return;
      }

      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      params.set('limit', String(pageSize));
      params.set('offset', String(offsetValue));

      try {
        const res = await fetch(`/api/expenses?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to load expenses.');
        }
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];

        setExpenses((prev) => (replace ? rows : [...prev, ...rows]));
        setLoadedCount((prev) => (replace ? rows.length : prev + rows.length));
        setHasMore(rows.length === pageSize);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load expenses.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError('Open this Mini App inside Telegram.');
      setLoading(false);
      return;
    }

    tg.ready?.();
    tg.expand?.();

    fetchExpenses(0, true);
  }, [fetchExpenses]);

  const typeLabel = (type?: string) => {
    if (!type) return 'Other';
    if (type === 'qr_scan') return 'QR scan';
    if (type === 'manual') return 'Manual';
    return type;
  };

  const typeIcon = (type?: string) => {
    if (type === 'manual') return '✍️';
    if (type === 'bank') return '🏦';
    return '🧾';
  };

  const categories = useMemo(() => {
    const unique = new Set<string>();
    expenses.forEach((exp) => unique.add(typeLabel(exp.type)));
    return ['All', ...Array.from(unique.values())];
  }, [expenses]);

  const transactionsByDate = useMemo(() => {
    const filtered = expenses
      .filter((exp) => {
        const haystack = `${exp.merchant || ''} ${exp.check_id || ''}`.toLowerCase();
        const matchesSearch = searchQuery
          ? haystack.includes(searchQuery.toLowerCase())
          : true;
        const matchesCategory =
          selectedCategory === 'All'
            ? true
            : typeLabel(exp.type) === selectedCategory;
        return matchesSearch && matchesCategory;
      })
      .sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

    const groups = new Map<string, { date: string; transactions: any[] }>();

    const getDateKey = (dt: Date) => {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };

    const formatDateLabel = (dt: Date) => {
      const today = new Date();
      const todayKey = getDateKey(today);
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      const yesterdayKey = getDateKey(yesterday);
      const key = getDateKey(dt);

      if (key === todayKey) return 'Today';
      if (key === yesterdayKey) return 'Yesterday';

      return dt.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      });
    };

    const parseReceiptDate = (value?: string) => {
      if (!value) return null;
      const raw = value.trim();
      if (/^\d{8}$/.test(raw)) {
        const year = Number(raw.slice(0, 4));
        const month = Number(raw.slice(4, 6));
        const day = Number(raw.slice(6, 8));
        return new Date(year, month - 1, day);
      }
      const parsed = new Date(raw);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    filtered.forEach((exp) => {
      const created = new Date(exp.created_at);
      const receiptDate =
        exp.type === 'qr_scan' ? parseReceiptDate(exp.receipt_date) : null;
      const effectiveDate = receiptDate ?? created;
      const dateKey = getDateKey(effectiveDate);
      const label = formatDateLabel(effectiveDate);
      const amountValue = exp.amount ? Number(exp.amount) : 0;
      const transactions = groups.get(dateKey)?.transactions ?? [];

      transactions.push({
        id: exp.id,
        name: exp.merchant || exp.check_id || 'Receipt',
        category: typeLabel(exp.type),
        amount: -Math.abs(amountValue),
        time: created.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        icon: typeIcon(exp.type),
      });

      groups.set(dateKey, { date: label, transactions });
    });

      return Array.from(groups.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([, value]) => value);
  }, [expenses, searchQuery, selectedCategory]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchExpenses(loadedCount, false);
  };

  return (
    <div className="flex flex-col h-full bg-background pb-20">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground mb-4">Transactions</h1>

        {/* Search Bar */}
        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={20}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search transactions..."
            className="w-full pl-10 pr-4 py-2.5 bg-[color:var(--brand-cream-strong)] border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-purple)]"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === category
                  ? 'bg-[color:var(--brand-purple)] text-white'
                  : 'bg-[color:var(--brand-lavender)] text-foreground hover:bg-[color:var(--brand-lavender-dark)]'
              }`}
            >
              {category}
            </button>
          ))}
        </div>
      </div>

      {/* Transactions List */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {loading && (
          <div className="text-center text-muted-foreground">Loading...</div>
        )}
        {!loading && error && (
          <div className="text-center text-muted-foreground">{error}</div>
        )}
        {!loading && !error && transactionsByDate.length === 0 && (
          <div className="text-center text-muted-foreground">
            No expenses yet.
          </div>
        )}
        {!loading && !error && transactionsByDate.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-foreground">{group.date}</h3>
              <div className="flex-1 h-px bg-border"></div>
            </div>

            <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
              {group.transactions.map((transaction, index) => (
                <div
                  key={transaction.id}
                  className={`flex items-center justify-between p-4 ${
                    index !== group.transactions.length - 1
                      ? 'border-b border-[color:var(--brand-lavender)]'
                      : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[color:var(--brand-lavender)] rounded-xl flex items-center justify-center text-xl">
                      {transaction.icon}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">
                        {transaction.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground">
                          {transaction.category}
                        </span>
                        <span className="text-xs text-muted-foreground/70">•</span>
                        <span className="text-xs text-muted-foreground">
                          {transaction.time}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p
                    className={`font-semibold text-lg ${
                      transaction.amount > 0
                        ? 'text-[color:var(--brand-green-dark)]'
                        : 'text-foreground'
                    }`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount.toLocaleString()} ₴
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {!loading && !error && hasMore && (
          <div className="flex justify-center pb-6">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-4 py-2 rounded-full text-sm font-medium bg-[color:var(--brand-lavender)] text-foreground hover:bg-[color:var(--brand-lavender-dark)] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
