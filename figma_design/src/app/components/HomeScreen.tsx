import { Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from './LocaleContext';

interface HomeScreenProps {
  onAddExpense: () => void;
  onAddIncome: () => void;
  onViewAll: () => void;
  onOpenBudget: () => void;
  hideFab?: boolean;
}

export function HomeScreen({
  onAddExpense,
  onAddIncome,
  onViewAll,
  onOpenBudget,
  hideFab = false,
}: HomeScreenProps) {
  const { t, locale } = useLocale();
  const [showFabMenu, setShowFabMenu] = useState(false);
  const [nudgeKey, setNudgeKey] = useState(0);
  const scrollTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (scrollTimeout.current !== null) {
        window.clearTimeout(scrollTimeout.current);
      }
    };
  }, []);

  const [totals, setTotals] = useState({ income: 0, expense: 0, balance: 0 });
  const [budgetSummary, setBudgetSummary] = useState({
    limit: 0,
    spent: 0,
    remaining: 0,
  });
  const [budgetItems, setBudgetItems] = useState<
    { category: string; spent: number; limit: number }[]
  >([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetError, setBudgetError] = useState<string | null>(null);

  const [recentTransactions, setRecentTransactions] = useState<
    { id: number; category: string; name: string; amount: number; icon: string }[]
  >([]);
  const [recentError, setRecentError] = useState<string | null>(null);

  const categoryIcons: Record<string, string> = {
    food: '🍔',
    transport: '🚕',
    shopping: '🛍️',
    bills: '📄',
    health: '💊',
    education: '📚',
    entertainment: '🎮',
    travel: '✈️',
    subscriptions: '📺',
    income: '💰',
    salary: '💰',
    freelance: '🧑‍💻',
    investment: '📈',
    gift: '🎁',
    other: '🧾',
    qr_scan: '🧾',
    manual: '✍️',
  };

  const categoryLabels: Record<string, { en: string; uk: string }> = {
    food: { en: 'Food', uk: 'Їжа' },
    transport: { en: 'Transport', uk: 'Транспорт' },
    shopping: { en: 'Shopping', uk: 'Покупки' },
    bills: { en: 'Bills', uk: 'Комунальні' },
    health: { en: 'Health', uk: 'Здоровʼя' },
    education: { en: 'Education', uk: 'Освіта' },
    entertainment: { en: 'Entertainment', uk: 'Розваги' },
    travel: { en: 'Travel', uk: 'Подорожі' },
    subscriptions: { en: 'Subscriptions', uk: 'Підписки' },
    other: { en: 'Other', uk: 'Інше' },
  };

  const typeLabel = (type?: string) => {
    if (!type) return 'Other';
    if (type === 'qr_scan') return 'QR scan';
    if (type === 'manual') return 'Manual';
    if (type === 'income') return 'Income';
    return type;
  };

  useEffect(() => {
    const loadRecent = async () => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) {
        setRecentError('Open this Mini App inside Telegram.');
        return;
      }
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      params.set('limit', '5');
      params.set('offset', '0');

      try {
        const res = await fetch(`/api/expenses?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to load recent transactions.');
        }
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        const mapped = rows.map((tx: any) => {
          const isIncome = Boolean(tx.is_income) || tx.type === 'income';
          const amount = tx.amount ? Number(tx.amount) : 0;
          const rawCategory = (tx.category || typeLabel(tx.type)).toString();
          const category =
            rawCategory.length > 0
              ? rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1)
              : 'Other';
          const normalizedCategory = category.toLowerCase();
          const icon =
            categoryIcons[normalizedCategory] ||
            categoryIcons[tx.type] ||
            '🧾';
          return {
            id: tx.id,
            category: category,
            name: tx.merchant || tx.check_id || 'Receipt',
            amount: isIncome ? Math.abs(amount) : -Math.abs(amount),
            icon,
          };
        });
        setRecentTransactions(mapped);
        setRecentError(null);
      } catch (err) {
        setRecentError(err instanceof Error ? err.message : 'Failed to load recent transactions.');
      }
    };
    loadRecent();
  }, []);


  useEffect(() => {
    const loadTotals = async () => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) {
        return;
      }
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      params.set('month', 'all');
      try {
        const res = await fetch(`/api/transaction_totals?${params.toString()}`);
        if (!res.ok) {
          throw new Error('Failed to load totals.');
        }
        const data = await res.json();
        const incomeValue = Number(data.current_income ?? 0);
        const expenseValue = Number(data.current_expense ?? 0);
        setTotals({
          income: incomeValue,
          expense: expenseValue,
          balance: incomeValue - expenseValue,
        });
      } catch {
        setTotals((prev) => prev);
      }
    };
    loadTotals();
  }, []);

  useEffect(() => {
    const loadBudget = async () => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) {
        setBudgetError(t('open_in_telegram'));
        setBudgetLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));

      try {
        const [summaryRes, progressRes] = await Promise.all([
          fetch(`/api/budget_summary?${params.toString()}`),
          fetch(`/api/budget_progress?${params.toString()}`),
        ]);
        if (!summaryRes.ok || !progressRes.ok) {
          throw new Error('Failed to load budget.');
        }
        const summaryData = await summaryRes.json();
        const progressData = await progressRes.json();

        setBudgetSummary({
          limit: Number(summaryData.total_limit ?? 0),
          spent: Number(summaryData.total_spent ?? 0),
          remaining: Number(summaryData.remaining ?? 0),
        });

        const items = Array.isArray(progressData?.items) ? progressData.items : [];
        setBudgetItems(
          items.map((row: any) => ({
            category: row.category,
            spent: Number(row.spent ?? 0),
            limit: Number(row.limit ?? 0),
          })),
        );
        setBudgetError(null);
      } catch (err) {
        setBudgetError(err instanceof Error ? err.message : 'Failed to load budget.');
      } finally {
        setBudgetLoading(false);
      }
    };

    loadBudget();
  }, [t]);

  const topBudgetItems = useMemo(() => {
    return [...budgetItems]
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3);
  }, [budgetItems]);

  const budgetProgress = useMemo(() => {
    if (budgetSummary.limit <= 0) return 0;
    return Math.min(budgetSummary.spent / budgetSummary.limit, 1);
  }, [budgetSummary]);

  return (
    <div className="screen-pad relative flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm animate-in fade-in duration-300">
        <div className="screen-header-inner">
          <h1 className="text-lg font-semibold text-gray-900">
            {t('finance_tracker')}
          </h1>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 overflow-y-auto px-4 pt-4 pb-4"
        onScroll={() => {
          if (scrollTimeout.current !== null) {
            window.clearTimeout(scrollTimeout.current);
          }
          scrollTimeout.current = window.setTimeout(() => {
            setNudgeKey((key) => key + 1);
          }, 220);
        }}
      >
        {/* Balance Card */}
        <div
          className={`relative bg-white/70 backdrop-blur-xl rounded-3xl p-6 text-gray-900 mb-4 overflow-hidden ${
            totals.balance >= 0
              ? 'shadow-[0_0_45px_rgba(34,197,94,0.35),var(--surface-shadow-strong)]'
              : 'shadow-[0_0_45px_rgba(239,68,68,0.35),var(--surface-shadow-strong)]'
          }`}
        >
          <div className="absolute top-0 right-0 w-40 h-40 bg-[var(--accent-from)]/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-[var(--accent-to)]/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <p className="text-sm text-gray-600 mb-1">{t('total_balance')}</p>
            <h2 className="text-4xl font-bold mb-4 text-gray-900">
              {totals.balance.toLocaleString()} ₴
            </h2>
            <div className="flex gap-4">
              <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <TrendingUp size={16} className="text-green-600" />
                  <span>{t('income')}</span>
                </div>
                <p className="font-semibold mt-1 text-gray-900">
                  +{totals.income.toLocaleString()} ₴
                </p>
              </div>
              <div className="flex-1 bg-white/80 backdrop-blur-sm rounded-2xl p-3 border border-white/40">
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <TrendingDown size={16} className="text-red-500" />
                  <span>{t('expenses')}</span>
                </div>
                <p className="font-semibold mt-1 text-gray-900">
                  -{totals.expense.toLocaleString()} ₴
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Budget Progress */}
        <button
          type="button"
          onClick={onOpenBudget}
          className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] mb-4 border border-white/40 text-left w-full transition-all hover:bg-white/70"
        >
          <h3 className="font-semibold text-gray-900 mb-2">{t('budget_progress')}</h3>
          {budgetLoading && (
            <div className="text-sm text-gray-600">{t('loading')}</div>
          )}
          {!budgetLoading && budgetError && (
            <div className="text-sm text-gray-600">{budgetError}</div>
          )}
          {!budgetLoading && !budgetError && budgetSummary.limit <= 0 && topBudgetItems.length === 0 && (
            <div className="text-sm text-gray-600">{t('no_budget_data')}</div>
          )}
          {!budgetLoading && !budgetError && (budgetSummary.limit > 0 || topBudgetItems.length > 0) && (
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
                  <span>{t('spent')}</span>
                  <span>
                    {budgetSummary.spent.toLocaleString()} / {budgetSummary.limit.toLocaleString()} ₴
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/70 border border-white/40 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] transition-all"
                    style={{ width: `${budgetProgress * 100}%` }}
                  ></div>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {budgetSummary.remaining.toLocaleString()} ₴ {t('left')}
                </div>
              </div>
              <div className="space-y-2">
                {topBudgetItems.map((item) => {
                  const label = categoryLabels[item.category]?.[locale] ?? item.category;
                  const emoji = categoryIcons[item.category] ?? '🧾';
                  const ratio = item.limit > 0 ? Math.min(item.spent / item.limit, 1) : 0;
                  return (
                    <div
                      key={item.category}
                      className="bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/30"
                    >
                      <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{emoji}</span>
                          <span className="text-sm font-medium text-gray-900">{label}</span>
                        </div>
                        <span>
                          {item.spent.toLocaleString()} / {item.limit.toLocaleString()} ₴
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-white/70 border border-white/40 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)]"
                          style={{ width: `${ratio * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </button>

        {/* Recent Transactions */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-3">{t('recent_transactions')}</h3>
          <div className="space-y-3">
            {recentError && (
              <div className="text-sm text-gray-500">{recentError}</div>
            )}
            {!recentError && recentTransactions.length === 0 && (
              <div className="text-sm text-gray-500">{t('no_transactions')}</div>
            )}
            {recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/30 hover:bg-white/60 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center text-lg shadow-sm">
                    {transaction.icon}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {transaction.name}
                    </p>
                    <p className="text-sm text-gray-600">{transaction.category}</p>
                  </div>
                </div>
                <p
                  className={`font-semibold ${
                    transaction.amount > 0 ? 'text-green-600' : 'text-gray-900'
                  }`}
                >
                  {transaction.amount > 0 ? '+' : ''}
                  {transaction.amount.toLocaleString()} ₴
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center pb-6 pt-4">
          <button
            type="button"
            onClick={onViewAll}
            className="px-4 py-2 rounded-full text-sm font-medium bg-white/60 text-gray-700 hover:bg-white/80 transition-all border border-white/40 shadow-[var(--surface-shadow-sm)]"
          >
            {t('view_all')}
          </button>
        </div>
      </div>

      {/* Floating Add Button */}
      {!hideFab && (
        <div className="absolute bottom-24 right-0 z-50">
        {showFabMenu && (
          <div className="absolute bottom-16 right-4 flex flex-col gap-3 animate-in slide-in-from-bottom-4 fade-in">
            <button
              onClick={() => {
                setShowFabMenu(false);
                onAddIncome();
              }}
              className="flex items-center gap-3 bg-white/80 backdrop-blur-xl rounded-full pl-4 pr-5 py-3 shadow-[0_10px_40px_rgba(16,185,129,0.4)] border border-white/40 hover:bg-white/90 transition-all"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white shadow-lg">
                <Plus size={20} strokeWidth={3} />
              </div>
              <span className="font-medium text-gray-900 whitespace-nowrap">{t('add_income')}</span>
            </button>

            <button
              onClick={() => {
                setShowFabMenu(false);
                onAddExpense();
              }}
              className="flex items-center gap-3 bg-white/80 backdrop-blur-xl rounded-full pl-4 pr-5 py-3 shadow-[0_10px_40px_rgba(239,68,68,0.4)] border border-white/40 hover:bg-white/90 transition-all"
            >
              <div className="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white shadow-lg">
                <Minus size={20} strokeWidth={3} />
              </div>
              <span className="font-medium text-gray-900 whitespace-nowrap">{t('add_expense')}</span>
            </button>
          </div>
        )}

        <button
          key={nudgeKey}
          onClick={() => setShowFabMenu(!showFabMenu)}
          className={`group flex items-center transition-all duration-300 ${
            showFabMenu ? 'translate-x-0' : 'translate-x-9 hover:translate-x-0'
          } animate-fab-nudge`}
        >
          <div className="w-14 h-14 bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] rounded-l-2xl shadow-[var(--accent-glow-strong)] flex items-center justify-center border-y border-l border-white/20 transition-all">
            <Plus
              size={28}
              strokeWidth={2.5}
              className={`text-white transition-transform duration-300 ${
                showFabMenu ? 'rotate-45' : 'rotate-0'
              }`}
            />
          </div>
          {!showFabMenu && (
            <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-6 h-6 bg-white/60 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity border border-white/40">
              <div className="text-[var(--accent-from)] text-xs font-bold">→</div>
            </div>
          )}
        </button>

        {showFabMenu && (
          <div
            onClick={() => setShowFabMenu(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm -z-10 animate-in fade-in"
          />
        )}
        </div>
      )}
    </div>
  );
}
