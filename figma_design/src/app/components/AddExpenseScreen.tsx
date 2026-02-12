import { ArrowLeft, QrCode, Calendar } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useLocale } from './LocaleContext';

interface AddExpenseScreenProps {
  onBack: () => void;
  onScanQR: () => void;
  isIncome?: boolean;
}

export function AddExpenseScreen({
  onBack,
  onScanQR,
  isIncome = false,
}: AddExpenseScreenProps) {
  const { t, locale } = useLocale();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(isIncome ? 'salary' : 'food');
  const [date, setDate] = useState('Today');
  const [customDate, setCustomDate] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSubscriptionPrompt, setShowSubscriptionPrompt] = useState(false);
  const [subscriptionPeriod, setSubscriptionPeriod] = useState<'monthly' | 'weekly' | 'yearly'>('monthly');
  const [isPremium, setIsPremium] = useState(false);

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
  const categories = isIncome ? incomeCategories : expenseCategories;
  const paymentMethods = [
    { value: 'Cash', label: t('cash') },
    { value: 'Card', label: t('card') },
  ];

  const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/$/, '') ?? '';
  const scanDisabled = !isPremium;

  const showPremiumOnly = () => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (tg?.showPopup) {
      tg.showPopup({
        title: t('premium_only_title'),
        message: t('premium_only'),
        buttons: [{ id: 'ok', type: 'ok', text: 'OK' }],
      });
      return;
    }
    window.alert(t('premium_only'));
  };

  useEffect(() => {
    const loadProfile = async () => {
      const tg = (window as any)?.Telegram?.WebApp || null;
      if (!tg) return;
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      try {
        const res = await fetch(`${apiBase}/api/user_profile?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setIsPremium(Boolean(data.is_premium));
      } catch {}
    };
    loadProfile();
  }, [apiBase]);

  const normalizeAmount = (value: string) => {
    let cleaned = value.replace(/,/g, '.').replace(/[^\d.]/g, '');
    if (!cleaned) return '';
    const parts = cleaned.split('.');
    cleaned = parts[0];
    if (parts.length > 1) {
      cleaned += `.${parts.slice(1).join('')}`;
    }
    const [intPart, decPart] = cleaned.split('.');
    if (decPart !== undefined) {
      return `${intPart}.${decPart.slice(0, 2)}`;
    }
    return intPart;
  };

  const handleAmountChange = (value: string) => {
    setAmount(normalizeAmount(value));
  };

  const formatISODate = (value: Date) => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getReceiptDate = () => {
    const today = new Date();
    if (date === 'Today') return formatISODate(today);
    if (date === 'Yesterday') {
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      return formatISODate(yesterday);
    }
    if (date === 'Custom' && customDate) return customDate;
    return null;
  };

  const handleSave = async () => {
    const needsAutoPrompt = isIncome || (!isIncome && category === 'subscriptions');
    if (!isPremium && needsAutoPrompt && !isIncome) {
      showPremiumOnly();
      return;
    }
    if (needsAutoPrompt && isPremium && !showSubscriptionPrompt) {
      setShowSubscriptionPrompt(true);
      return;
    }
    await submitSave(needsAutoPrompt && isPremium, subscriptionPeriod);
  };

  const submitSave = async (createSubscription: boolean, period: 'monthly' | 'weekly' | 'yearly') => {
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError(t('amount_error'));
      return;
    }

    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError(t('open_in_telegram'));
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      init_data: tg.initData ?? null,
      init_data_unsafe: tg.initDataUnsafe ?? null,
      amount,
      type: isIncome ? 'income' : 'manual',
      category,
      note: note || null,
      payment_method: paymentMethod,
      receipt_date: getReceiptDate(),
      create_subscription: createSubscription,
      subscription_period: period,
    };

    try {
      const res = await fetch(`${apiBase}/api/expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(t('save_failed'));
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-foreground hover:bg-muted rounded-lg transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-foreground">{t('add_transaction')}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('amount')}
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              pattern="^\\d+(\\.\\d{0,2})?$"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-full text-3xl font-bold text-right px-4 pr-12 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)]"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-muted-foreground">
              ₴
            </span>
          </div>
        </div>

        {/* Category Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('category')}
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)]"
            >
              {categories.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.emoji} {cat.label[locale]}
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                width="12"
                height="8"
                viewBox="0 0 12 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 1.5L6 6.5L11 1.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('date')}
          </label>
          <div className="relative">
            <select
              value={date}
              onChange={(e) => {
                const value = e.target.value;
                setDate(value);
                if (value === 'Custom' && !customDate) {
                  setCustomDate(formatISODate(new Date()));
                }
              }}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)]"
            >
              <option value="Today">{t('today')}</option>
              <option value="Yesterday">{t('yesterday')}</option>
              <option value="Custom">{t('select_date')}...</option>
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
              <svg
                width="12"
                height="8"
                viewBox="0 0 12 8"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M1 1.5L6 6.5L11 1.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
          {date === 'Custom' && (
            <div className="mt-3">
              <div className="relative w-full">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="block w-full min-w-0 box-border px-4 pr-10 py-3 bg-card border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)] appearance-none"
                />
                <Calendar
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Note Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('note')}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('enter_note')}
            className="w-full px-4 py-3 bg-card border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)]"
          />
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </div>

        {/* Payment Method */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            {t('payment_method')}
          </label>
          <div className="flex gap-3">
            {paymentMethods.map((method) => (
              <button
                key={method.value}
                onClick={() => setPaymentMethod(method.value)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  paymentMethod === method.value
                    ? 'bg-[var(--accent-from)] text-white'
                    : 'bg-card text-foreground border border-border'
                }`}
              >
                {method.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="bg-card px-4 py-4 border-t border-border space-y-3">
        {!isIncome && (
          <button
            onClick={() => {
              if (scanDisabled) {
                showPremiumOnly();
                return;
              }
              onScanQR();
            }}
            aria-disabled={scanDisabled}
            className={`w-full py-3 bg-muted text-foreground rounded-xl font-medium flex items-center justify-center gap-2 transition-all ${
              scanDisabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-muted/80'
            }`}
          >
            <QrCode size={20} />
            {t('scan_qr')}
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-[var(--accent-from)] text-white rounded-xl font-medium hover:bg-[var(--accent-to)] transition-all active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? t('saving') : t('save_transaction')}
        </button>
      </div>

      {showSubscriptionPrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white/95 backdrop-blur-xl rounded-t-3xl sm:rounded-3xl w-full sm:w-96 p-5 border border-white/40 shadow-[var(--surface-shadow-strong)]">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('subscription_title')}</h3>
            <p className="text-sm text-gray-600 mb-4">{t('subscription_prompt')}</p>
            <div className="flex gap-2 mb-4">
              {(['monthly', 'weekly', 'yearly'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setSubscriptionPeriod(period)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-all ${
                    subscriptionPeriod === period
                      ? 'bg-[var(--accent-from)] text-white border-white/20'
                      : 'bg-white/80 text-gray-700 border-white/40 hover:bg-white/90'
                  }`}
                >
                  {t(`subscription_${period}`)}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={async () => {
                  setShowSubscriptionPrompt(false);
                  await submitSave(true, subscriptionPeriod);
                }}
                className="flex-1 py-3 rounded-2xl bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white font-medium shadow-[var(--accent-glow)]"
              >
                {t('yes_auto')}
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowSubscriptionPrompt(false);
                  await submitSave(false, subscriptionPeriod);
                }}
                className="flex-1 py-3 rounded-2xl bg-white/70 text-gray-700 font-medium border border-white/40"
              >
                {t('no_once')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
