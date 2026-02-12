import { X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './LocaleContext';

interface Transaction {
  id: number;
  name: string;
  category: string;
  amount: number;
  time: string;
  icon: string;
}

type TransactionsScreenProps = {
  isActive?: boolean;
};

export function TransactionsScreen({ isActive = true }: TransactionsScreenProps) {
  const { t, formatLocale } = useLocale();
  const pageSize = 10;
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const tapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const tapMovedRef = useRef(false);

  const openTransaction = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
  };

  const fetchExpenses = useCallback(
    async (offsetValue: number, replace: boolean) => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) {
        setError(t('open_in_telegram'));
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

  const buildAuthParams = () => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError(t('open_in_telegram'));
      return null;
    }
    const params = new URLSearchParams();
    if (tg.initData) params.set('init_data', tg.initData);
    if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
    return params;
  };

  const refreshTransactions = useCallback(() => {
    setLoading(true);
    setLoadedCount(0);
    fetchExpenses(0, true);
  }, [fetchExpenses]);

  const handlePointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    tapRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
    tapMovedRef.current = false;
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!tapRef.current) return;
    const dx = Math.abs(event.clientX - tapRef.current.x);
    const dy = Math.abs(event.clientY - tapRef.current.y);
    if (dx > 8 || dy > 8) {
      tapMovedRef.current = true;
    }
  };

  const handlePointerUp = (transaction: Transaction) => {
    if (!tapRef.current) return;
    const elapsed = Date.now() - tapRef.current.time;
    const shouldOpen = !tapMovedRef.current && elapsed < 400;
    tapRef.current = null;
    tapMovedRef.current = false;
    if (shouldOpen) {
      openTransaction(transaction);
    }
  };

  const handlePointerCancel = () => {
    tapRef.current = null;
    tapMovedRef.current = false;
  };

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

  useEffect(() => {
    if (!selectedTransaction) return;
    setIsEditing(false);
    setEditAmount(Math.abs(selectedTransaction.amount).toString());
    setEditCategory(selectedTransaction.category || '');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedTransaction(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTransaction]);

  useEffect(() => {
    if (!isActive) {
      setSelectedTransaction(null);
    }
  }, [isActive]);

  const typeLabel = (type?: string) => {
    if (!type) return 'Other';
    if (type === 'qr_scan') return 'QR scan';
    if (type === 'manual') return 'Manual';
    if (type === 'income') return 'Income';
    if (type === 'subscription') return t('automatic_transaction');
    return type;
  };

  const typeIcon = (type?: string) => {
    if (type === 'manual') return '✍️';
    if (type === 'bank') return '🏦';
    if (type === 'income') return '💰';
    if (type === 'subscription') return '📺';
    return '🧾';
  };

  const categories = useMemo(() => {
    const values = new Set<string>();
    expenses.forEach((exp) => {
      if (exp?.category) {
        values.add(exp.category);
      }
      values.add(typeLabel(exp.type));
    });

    const base = [
      { key: 'all', label: t('all') },
      { key: 'income', label: t('income') },
      { key: 'expense', label: t('expense') },
    ];

    const dynamic = Array.from(values.values()).map((value) => ({
      key: value,
      label: value,
    }));

    return [...base, ...dynamic];
  }, [expenses, t]);

  const editableCategories = useMemo(
    () => [
      'food',
      'transport',
      'shopping',
      'bills',
      'health',
      'education',
      'entertainment',
      'travel',
      'subscriptions',
      'other',
      'salary',
      'freelance',
      'investment',
      'gift',
    ],
    [],
  );

  const transactionsByDate = useMemo(() => {
    const filtered = expenses
      .filter((exp) => {
        const normalizedCategory = exp?.category ?? '';
        const isIncome = Boolean(exp.is_income) || exp.type === 'income';
        const matchesCategory =
          selectedCategory === 'all'
            ? true
            : selectedCategory === 'income'
              ? isIncome
              : selectedCategory === 'expense'
                ? !isIncome
                : typeLabel(exp.type) === selectedCategory || normalizedCategory === selectedCategory;
        return matchesCategory;
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

      if (key === todayKey) return t('today');
      if (key === yesterdayKey) return t('yesterday');

      return dt.toLocaleDateString(formatLocale, {
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
      const isIncome = Boolean(exp.is_income) || exp.type === 'income';
      const transactions = groups.get(dateKey)?.transactions ?? [];

      transactions.push({
        id: exp.id,
        name: exp.merchant || exp.check_id || 'Receipt',
        category: exp.category || typeLabel(exp.type),
        amount: isIncome ? Math.abs(amountValue) : -Math.abs(amountValue),
        time: created.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' }),
        icon: typeIcon(exp.type),
      });

      groups.set(dateKey, { date: label, transactions });
    });

      return Array.from(groups.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([, value]) => value);
  }, [expenses, selectedCategory, t, formatLocale]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchExpenses(loadedCount, false);
  };

  const handleDeleteTransaction = async () => {
    if (!selectedTransaction) return;
    if (!confirm('Delete this transaction?')) return;

    const params = buildAuthParams();
    if (!params) return;

    try {
      const res = await fetch(`/api/transactions/${selectedTransaction.id}?${params.toString()}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error('Failed to delete transaction.');
      }
      setSelectedTransaction(null);
      refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  };

  const handleEditTransaction = async () => {
    if (!selectedTransaction) return;
    const amountValue = editAmount.trim();
    if (!amountValue || Number.isNaN(Number(amountValue))) {
      setError('Invalid amount.');
      return;
    }

    const params = buildAuthParams();
    if (!params) return;

    const source = expenses.find((exp) => exp.id === selectedTransaction.id);
    if (!source) {
      setError('Transaction not found.');
      return;
    }

    try {
      const res = await fetch(`/api/transactions/${selectedTransaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_data: params.get('init_data'),
          init_data_unsafe: params.get('init_data_unsafe')
            ? JSON.parse(params.get('init_data_unsafe') as string)
            : undefined,
          amount: amountValue,
          check_id: source.check_id ?? null,
          url: source.url ?? null,
          receipt_date: source.receipt_date ?? null,
          check_xml: source.check_xml ?? null,
          merchant: source.merchant ?? null,
          type: source.type ?? null,
          is_income: source.is_income ?? null,
          category: editCategory.trim() || (source.category ?? null),
          note: source.note ?? null,
          payment_method: source.payment_method ?? null,
        }),
      });
      if (!res.ok) {
        throw new Error('Failed to update transaction.');
      }
      setSelectedTransaction(null);
      setIsEditing(false);
      refreshTransactions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update transaction.');
    }
  };

  return (
    <div className="screen-pad flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm animate-in fade-in duration-300">
        <div className="screen-header-inner">
          <h1 className="text-lg font-semibold text-gray-900">{t('transactions')}</h1>
        </div>
      </div>

      {/* Transactions List */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <div
          className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, #000 85%, transparent)',
            maskImage: 'linear-gradient(to bottom, #000 85%, transparent)',
          }}
        >
          {categories.map((category) => (
            <button
              key={category.key}
              onClick={() => setSelectedCategory(category.key)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all backdrop-blur-xl border shadow-[var(--surface-shadow-sm)] ${
                selectedCategory === category.key
                  ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white border-white/20'
                  : 'bg-white/60 text-gray-700 border-white/40 hover:bg-white/80'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
        {loading && (
          <div className="text-center text-gray-500">Loading...</div>
        )}
        {!loading && error && (
          <div className="text-center text-gray-500">{error}</div>
        )}
        {!loading && !error && transactionsByDate.length === 0 && (
          <div className="text-center text-gray-500">
            {t('no_transactions')}
          </div>
        )}
        {!loading && !error && transactionsByDate.map((group, groupIndex) => (
          <div key={groupIndex} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-gray-700">{group.date}</h3>
              <div className="flex-1 h-px bg-white/60"></div>
            </div>

            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-[var(--surface-shadow)] overflow-hidden border border-white/40 animate-in fade-in duration-300">
              {group.transactions.map((transaction, index) => (
                <button
                  key={transaction.id}
                  type="button"
                  onClick={() => openTransaction(transaction)}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => handlePointerUp(transaction)}
                  onPointerCancel={handlePointerCancel}
                  className={`flex w-full items-center justify-between p-4 text-left hover:bg-white/20 transition-all duration-300 cursor-pointer select-none ${
                    index !== group.transactions.length - 1
                      ? 'border-b border-white/30'
                      : ''
                  }`}
                  style={{ touchAction: 'manipulation' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center text-xl shadow-sm">
                      {transaction.icon}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {transaction.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-600">
                          {transaction.category}
                        </span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-xs text-gray-600">
                          {transaction.time}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p
                    className={`font-semibold text-lg ${
                      transaction.amount > 0
                        ? 'text-green-600'
                        : 'text-gray-900'
                    }`}
                  >
                    {transaction.amount > 0 ? '+' : ''}
                    {transaction.amount.toLocaleString()} ₴
                  </p>
                </button>
              ))}
            </div>
          </div>
        ))}
        {!loading && !error && hasMore && (
          <div className="flex justify-center pb-6">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-4 py-2 rounded-full text-sm font-medium bg-white/60 text-gray-700 hover:bg-white/80 transition-all disabled:opacity-60 disabled:cursor-not-allowed border border-white/40 shadow-[var(--surface-shadow-sm)]"
            >
              {loadingMore ? t('loading') : t('load_more')}
            </button>
          </div>
        )}
      </div>

      {selectedTransaction && typeof document !== 'undefined'
          ? createPortal(
            <div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-300"
              onClick={() => setSelectedTransaction(null)}
            >
              <div
                className="bg-white/80 backdrop-blur-xl w-full h-[88vh] sm:h-auto sm:w-96 sm:max-h-[80vh] overflow-y-auto shadow-[var(--surface-shadow-strong)] border border-white/40 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300 rounded-t-3xl sm:rounded-3xl mt-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between p-4 border-b border-white/40">
                  <h2 className="text-lg font-semibold text-gray-900">Transaction Details</h2>
                  <button
                    onClick={() => setSelectedTransaction(null)}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-white/60 hover:bg-white/80 transition-all"
                  >
                    <X size={18} className="text-gray-600" />
                  </button>
                </div>

                <div
                  className="p-6 space-y-6 pb-12"
                  style={{ scrollPaddingBottom: '140px' }}
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-4xl shadow-lg">
                      {selectedTransaction.icon}
                    </div>
                    <div className="text-center">
                      <p
                        className={`text-3xl font-bold ${
                          selectedTransaction.amount > 0 ? 'text-green-600' : 'text-gray-900'
                        }`}
                      >
                        {selectedTransaction.amount > 0 ? '+' : ''}
                        {selectedTransaction.amount.toLocaleString()} ₴
                      </p>
                      <p className="text-gray-600 mt-1">{selectedTransaction.name}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                      <span className="text-gray-600">Category</span>
                      <span className="font-medium text-gray-900">{selectedTransaction.category}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                      <span className="text-gray-600">Time</span>
                      <span className="font-medium text-gray-900">{selectedTransaction.time}</span>
                    </div>
                    <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                      <span className="text-gray-600">Type</span>
                      <span
                        className={`font-medium ${
                          selectedTransaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {selectedTransaction.amount > 0 ? 'Income' : 'Expense'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                      <span className="text-gray-600">Transaction ID</span>
                      <span className="font-medium text-gray-900 font-mono text-sm">
                        #{selectedTransaction.id.toString().padStart(6, '0')}
                      </span>
                    </div>
                    {isEditing && (
                      <div className="bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30 space-y-2">
                        <span className="text-gray-600 text-sm">Amount</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          enterKeyHint="done"
                          value={editAmount}
                          onChange={(e) => setEditAmount(e.target.value)}
                          onFocus={(e) => {
                            e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                              handleEditTransaction();
                            }
                          }}
                          className="w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)] caret-[color:var(--accent-from)]"
                          style={{ fontSize: 16 }}
                          autoFocus
                        />
                        <div className="pt-2">
                          <span className="text-gray-600 text-sm">Category</span>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="mt-2 w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)]"
                            style={{ fontSize: 16 }}
                          >
                            {editableCategories.length === 0 ? (
                              <option value={editCategory || ''}>
                                {editCategory || 'Uncategorized'}
                              </option>
                            ) : (
                              editableCategories.map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="sticky bottom-0 -mx-6 mt-4 bg-transparent px-6 py-4">
                    <div className="flex gap-3">
                      {isEditing ? (
                        <>
                          <button
                            onClick={handleEditTransaction}
                            className="flex-1 bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white py-3 rounded-2xl font-medium shadow-[var(--accent-glow-strong)] hover:shadow-[var(--accent-glow)] transition-all"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="flex-1 bg-white/60 backdrop-blur-xl text-gray-700 py-3 rounded-2xl font-medium border border-white/40 hover:bg-white/80 transition-all"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setIsEditing(true)}
                            className="flex-1 bg-white/70 backdrop-blur-sm text-gray-900 py-3 rounded-2xl font-medium border border-white/40 hover:bg-white/80 transition-all"
                          >
                            Edit
                          </button>
                          <button
                            onClick={handleDeleteTransaction}
                            className="flex-1 bg-white/70 backdrop-blur-sm text-red-600 py-3 rounded-2xl font-medium border border-white/40 hover:bg-white/80 transition-all"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
