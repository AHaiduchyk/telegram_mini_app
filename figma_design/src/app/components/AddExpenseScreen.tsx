import { ArrowLeft, QrCode, Calendar } from 'lucide-react';
import { useState } from 'react';

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
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(isIncome ? 'Salary' : 'Food');
  const [date, setDate] = useState('Today');
  const [customDate, setCustomDate] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Card');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const categories = isIncome
    ? ['Salary', 'Freelance', 'Investment', 'Gift', 'Other']
    : ['Food', 'Transport', 'Shopping', 'Bills', 'Other'];
  const paymentMethods = ['Cash', 'Card'];

  const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/$/, '') ?? '';

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
    const numericAmount = Number(amount);
    if (!amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError('Open this Mini App inside Telegram.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      init_data: tg.initData ?? null,
      init_data_unsafe: tg.initDataUnsafe ?? null,
      amount,
      type: isIncome ? 'income' : 'manual',
      category: category.toLowerCase(),
      note: note || null,
      payment_method: paymentMethod,
      receipt_date: getReceiptDate(),
    };

    try {
      const res = await fetch(`${apiBase}/api/expense`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Failed to save expense.');
      }

      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense.');
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
          <h1 className="text-lg font-semibold text-foreground">Add Transaction</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-6 pb-4">
        {/* Amount Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Amount
          </label>
          <div className="relative">
            <input
              type="text"
              inputMode="decimal"
              pattern="^\\d+(\\.\\d{0,2})?$"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-full text-3xl font-bold text-right px-4 pr-12 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#706fd3]"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-3xl font-bold text-muted-foreground">
              ₴
            </span>
          </div>
        </div>

        {/* Category Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Category
          </label>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-[#706fd3]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
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
            Date
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
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-[#706fd3]"
            >
              <option value="Today">Today</option>
              <option value="Yesterday">Yesterday</option>
              <option value="Custom">Custom date...</option>
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
              <label className="block text-xs font-medium text-muted-foreground mb-2">
                Select date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#706fd3]"
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
            Note
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter a note..."
            className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#706fd3]"
          />
          {error && (
            <p className="text-sm text-red-600 mt-2">{error}</p>
          )}
        </div>

        {/* Payment Method */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            Payment Method
          </label>
          <div className="flex gap-3">
            {paymentMethods.map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                  paymentMethod === method
                    ? 'bg-[#706fd3] text-white'
                    : 'bg-card text-foreground border border-border'
                }`}
              >
                {method}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Actions */}
      <div className="bg-card px-4 py-4 border-t border-border space-y-3">
        {!isIncome && (
          <button
            onClick={onScanQR}
            className="w-full py-3 bg-muted text-foreground rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-muted/80 transition-all"
          >
            <QrCode size={20} />
            Scan QR
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 bg-[#706fd3] text-white rounded-xl font-medium hover:bg-[#5956b8] transition-all active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Transaction'}
        </button>
      </div>
    </div>
  );
}
