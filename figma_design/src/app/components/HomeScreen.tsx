import { Plus, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, ResponsiveContainer, Cell } from 'recharts';

interface HomeScreenProps {
  onAddExpense: () => void;
}

export function HomeScreen({ onAddExpense }: HomeScreenProps) {
  const balance = 24560;
  const income = 12000;
  const expenses = 7400;

  const categoryData = [
    { name: 'Food', amount: 2400, color: 'var(--brand-purple)' },
    { name: 'Transport', amount: 1800, color: 'var(--brand-green)' },
    { name: 'Shopping', amount: 1500, color: 'var(--brand-gold)' },
    { name: 'Bills', amount: 1200, color: 'var(--brand-lavender-dark)' },
    { name: 'Other', amount: 500, color: 'var(--brand-lavender)' },
  ];

  const recentTransactions = [
    { id: 1, category: 'Food', name: 'Food', amount: -240, icon: '🍔' },
    { id: 2, category: 'Transport', name: 'Taxi', amount: -180, icon: '🚕' },
    { id: 3, category: 'Income', name: 'Salary', amount: 12000, icon: '💰' },
    { id: 4, category: 'Food', name: 'Coffee', amount: -95, icon: '☕' },
    { id: 5, category: 'Bills', name: 'Bills', amount: -1200, icon: '📄' },
  ];

  return (
    <div className="flex flex-col h-full bg-background pb-20">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[color:var(--brand-lavender)] rounded-full flex items-center justify-center text-lg">
              👤
            </div>
            <div>
              <h1 className="font-semibold text-foreground">Finance Tracker</h1>
              <p className="text-sm text-muted-foreground">Hello, Andrii</p>
            </div>
          </div>
          <button className="w-10 h-10 flex items-center justify-center text-muted-foreground">
            💬
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-[color:var(--brand-purple)] via-[color:var(--brand-purple-dark)] to-[color:var(--brand-green)] rounded-2xl p-6 text-white shadow-lg mb-4">
          <p className="text-sm opacity-90 mb-1">Total Balance</p>
          <h2 className="text-4xl font-bold mb-4">{balance.toLocaleString()} ₴</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-1 text-sm opacity-90">
                <TrendingUp size={16} />
                <span>Income</span>
              </div>
              <p className="font-semibold">+{income.toLocaleString()} ₴</p>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-1 text-sm opacity-90">
                <TrendingDown size={16} />
                <span>Expenses</span>
              </div>
              <p className="font-semibold">-{expenses.toLocaleString()} ₴</p>
            </div>
          </div>
        </div>

        {/* Spending by Categories */}
        <div className="bg-card rounded-2xl p-4 shadow-sm mb-4">
          <h3 className="font-semibold text-foreground mb-3">Spending by Categories</h3>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={categoryData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="bg-card rounded-2xl p-4 shadow-sm">
          <h3 className="font-semibold text-foreground mb-3">Recent Transactions</h3>
          <div className="space-y-3">
            {recentTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[color:var(--brand-lavender)] rounded-lg flex items-center justify-center text-lg">
                    {transaction.icon}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {transaction.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{transaction.category}</p>
                  </div>
                </div>
                <p
                  className={`font-semibold ${
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
      </div>

      {/* Floating Add Button */}
      <button
        onClick={onAddExpense}
        className="fixed bottom-24 right-4 w-14 h-14 bg-[color:var(--brand-purple)] hover:bg-[color:var(--brand-purple-dark)] text-white rounded-full shadow-lg flex items-center justify-center transition-all active:scale-95"
      >
        <Plus size={28} strokeWidth={2.5} />
      </button>
    </div>
  );
}
