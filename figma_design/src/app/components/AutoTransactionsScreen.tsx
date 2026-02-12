import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from './LocaleContext';

type AutoTransactionsScreenProps = {
  onBack: () => void;
};

export function AutoTransactionsScreen({ onBack }: AutoTransactionsScreenProps) {
  const { t, locale } = useLocale();
  const [items, setItems] = useState<any[]>([]);
  const [drafts, setDrafts] = useState<Record<number, any>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const incomeCategories = [
    { value: 'salary', label: { en: 'Salary', uk: 'Зарплата' }, emoji: '💰' },
    { value: 'freelance', label: { en: 'Freelance', uk: 'Фріланс' }, emoji: '🧑‍💻' },
    { value: 'investment', label: { en: 'Investment', uk: 'Інвестиції' }, emoji: '📈' },
    { value: 'gift', label: { en: 'Gift', uk: 'Подарунок' }, emoji: '🎁' },
    { value: 'other', label: { en: 'Other', uk: 'Інше' }, emoji: '🧾' },
  ];
  const expenseCategories = [
    { value: 'food', label: { en: 'Food', uk: 'Їжа' }, emoji: '🍔' },
    { value: 'transport', label: { en: 'Transport', uk: 'Транспорт' }, emoji: '🚕' },
    { value: 'shopping', label: { en: 'Shopping', uk: 'Покупки' }, emoji: '🛍️' },
    { value: 'bills', label: { en: 'Bills', uk: 'Комунальні' }, emoji: '📄' },
    { value: 'health', label: { en: 'Health', uk: 'Здоровʼя' }, emoji: '💊' },
    { value: 'education', label: { en: 'Education', uk: 'Освіта' }, emoji: '📚' },
    { value: 'entertainment', label: { en: 'Entertainment', uk: 'Розваги' }, emoji: '🎮' },
    { value: 'travel', label: { en: 'Travel', uk: 'Подорожі' }, emoji: '✈️' },
    { value: 'subscriptions', label: { en: 'Subscriptions', uk: 'Підписки' }, emoji: '📺' },
    { value: 'other', label: { en: 'Other', uk: 'Інше' }, emoji: '🧾' },
  ];

  const categoryLookup = new Map(
    [...incomeCategories, ...expenseCategories].map((item) => [item.value, item]),
  );

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError(t('open_in_telegram'));
      setLoading(false);
      return;
    }
    const params = new URLSearchParams();
    if (tg.initData) params.set('init_data', tg.initData);
    if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));

    const load = async () => {
      try {
        const res = await fetch(`/api/auto_transactions?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to load automatic transactions.');
        const data = await res.json();
        const rows = Array.isArray(data) ? data : [];
        setItems(rows);
        const map: Record<number, any> = {};
        rows.forEach((item: any) => {
          const startValue = item.next_run_date ? String(item.next_run_date).slice(0, 10) : '';
          map[item.id] = {
            name: item.name ?? '',
            amount: item.amount,
            category: item.category ?? 'subscriptions',
            is_income: Boolean(item.is_income),
            period: item.period ?? 'monthly',
            start_date: startValue,
            is_active: Boolean(item.is_active),
          };
        });
        setDrafts(map);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load automatic transactions.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [t]);

  const updateDraft = (id: number, patch: Record<string, any>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  };

  const saveItem = async (id: number) => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) return;
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    try {
      const res = await fetch(`/api/auto_transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          init_data: tg.initData ?? null,
          init_data_unsafe: tg.initDataUnsafe ?? null,
          name: draft.name ?? null,
          amount: draft.amount ?? null,
          category: draft.category ?? null,
          is_income: Boolean(draft.is_income),
          period: draft.period ?? null,
          start_date: draft.start_date ?? null,
          is_active: Boolean(draft.is_active),
        }),
      });
      if (!res.ok) throw new Error('Failed to save automatic transaction.');
      const updated = await res.json();
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save automatic transaction.');
    } finally {
      setSavingId(null);
    }
  };

  const deleteItem = async (id: number) => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) return;
    if (!window.confirm(t('delete') + '?')) return;
    setDeletingId(id);
    try {
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      const res = await fetch(`/api/auto_transactions/${id}?${params.toString()}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete automatic transaction.');
      setItems((prev) => prev.filter((item) => item.id !== id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete automatic transaction.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="screen-pad flex flex-col h-full bg-transparent pb-4">
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm">
        <div className="screen-header-inner">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/60 hover:bg-white/80 transition-all"
            >
              <ArrowLeft size={18} className="text-gray-700" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">{t('automatic_transactions')}</h1>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {loading && <div className="text-center text-gray-500">{t('loading')}</div>}
        {!loading && error && <div className="text-center text-gray-500">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="text-center text-gray-500">{t('no_transactions')}</div>
        )}
        <div className="space-y-4">
          {items.map((item) => {
            const draft = drafts[item.id] ?? item;
            const meta = categoryLookup.get(draft.category ?? item.category ?? 'other');
            const categoryLabel = meta?.label?.[locale] ?? (draft.category ?? item.category ?? 'Other');
            const categoryEmoji = meta?.emoji ?? '🧾';
            const titleText = draft.name?.trim() ? draft.name.trim() : categoryLabel;
            const isIncome = Boolean(draft.is_income);
            const categoryOptions = isIncome ? incomeCategories : expenseCategories;
            return (
              <div
                key={item.id}
                className="bg-white/70 border border-white/40 rounded-3xl p-4 shadow-[var(--surface-shadow-sm)]"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center text-lg shadow-sm">
                      {categoryEmoji}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{titleText}</div>
                      <div className="text-xs text-gray-500">{t('automatic_transaction')} #{item.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateDraft(item.id, { is_active: !draft.is_active })}
                      className={`text-xs px-3 py-1 rounded-full border ${
                        draft.is_active
                          ? 'bg-green-100 text-green-700 border-green-200'
                          : 'bg-gray-100 text-gray-500 border-gray-200'
                      }`}
                    >
                      {draft.is_active ? t('pause') : t('resume')}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteItem(item.id)}
                      disabled={deletingId === item.id}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 border border-white/40 text-gray-500 hover:text-red-500 disabled:opacity-60"
                      title={t('delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('subscription_name')}</label>
                    <input
                      type="text"
                      value={draft.name ?? ''}
                      onChange={(e) => updateDraft(item.id, { name: e.target.value })}
                      className="mt-1 w-full max-w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-base no-zoom-input"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('amount')}</label>
                    <input
                      type="text"
                      value={draft.amount ?? ''}
                      onChange={(e) => updateDraft(item.id, { amount: e.target.value })}
                      className="mt-1 w-full max-w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-base no-zoom-input"
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('type_label')}</label>
                    <div className="mt-1 flex items-center gap-1 rounded-full bg-white/70 p-1 border border-white/40">
                      <button
                        type="button"
                        onClick={() => {
                          const nextCategory = incomeCategories[0]?.value ?? 'other';
                          updateDraft(item.id, { is_income: true, category: nextCategory });
                        }}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-full transition-all ${
                          isIncome
                            ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {t('income')}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const nextCategory = expenseCategories[0]?.value ?? 'other';
                          updateDraft(item.id, { is_income: false, category: nextCategory });
                        }}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-full transition-all ${
                          !isIncome
                            ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                            : 'text-gray-600 hover:text-gray-900'
                        }`}
                      >
                        {t('expense')}
                      </button>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('category')}</label>
                    <select
                      value={draft.category ?? ''}
                      onChange={(e) => updateDraft(item.id, { category: e.target.value })}
                      className="mt-1 w-full max-w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-base no-zoom-input appearance-none"
                    >
                      {categoryOptions.map((cat) => {
                        const label = cat.label?.[locale] ?? cat.value;
                        return (
                          <option key={cat.value} value={cat.value}>
                            {cat.emoji} {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('frequency')}</label>
                    <select
                      value={draft.period ?? 'monthly'}
                      onChange={(e) => updateDraft(item.id, { period: e.target.value })}
                      className="mt-1 w-full max-w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-base no-zoom-input appearance-none"
                    >
                      <option value="monthly">{t('subscription_monthly')}</option>
                      <option value="weekly">{t('subscription_weekly')}</option>
                      <option value="yearly">{t('subscription_yearly')}</option>
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="text-xs text-gray-600">{t('start_date')}</label>
                    <input
                      type="date"
                      value={draft.start_date ?? ''}
                      onChange={(e) => updateDraft(item.id, { start_date: e.target.value })}
                      className="mt-1 w-full max-w-full px-3 py-2 rounded-xl border border-white/40 bg-white text-gray-900 text-base no-zoom-input appearance-none"
                    />
                  </div>
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => saveItem(item.id)}
                    disabled={savingId === item.id}
                    className="w-full py-2 rounded-xl bg-[var(--accent-from)] text-white text-sm font-medium disabled:opacity-60"
                  >
                    {savingId === item.id ? t('saving') : t('save')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
