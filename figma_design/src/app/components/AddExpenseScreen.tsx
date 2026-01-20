import { ArrowLeft, QrCode, Calendar } from 'lucide-react';
import { useState } from 'react';

interface AddExpenseScreenProps {
  onBack: () => void;
  onScanQR: () => void;
}

export function AddExpenseScreen({ onBack, onScanQR }: AddExpenseScreenProps) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('Food');
  const [date, setDate] = useState('Today');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Card');

  const categories = ['Food', 'Transport', 'Shopping', 'Bills', 'Other'];
  const paymentMethods = ['Cash', 'Card'];

  const handleSave = () => {
    // Save expense logic
    alert('Expense saved!');
    onBack();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 flex items-center justify-center text-foreground hover:bg-[color:var(--brand-lavender)] rounded-lg transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Add Expense</h1>
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
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full text-3xl font-bold text-right px-4 py-4 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-purple)]"
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
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-purple)]"
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
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-4 py-3 bg-card border border-border rounded-xl appearance-none focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-purple)]"
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
            className="w-full px-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-purple)]"
          />
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
                    ? 'bg-[color:var(--brand-purple)] text-white'
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
        <button
          onClick={onScanQR}
          className="w-full py-3 bg-[color:var(--brand-lavender)] text-[color:var(--brand-purple-dark)] rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-[color:var(--brand-lavender-dark)] transition-all"
        >
          <QrCode size={20} />
          Scan QR
        </button>
        <button
          onClick={handleSave}
          className="w-full py-3 bg-[color:var(--brand-purple)] text-white rounded-xl font-medium hover:bg-[color:var(--brand-purple-dark)] transition-all active:scale-98"
        >
          Save Expense
        </button>
      </div>
    </div>
  );
}
