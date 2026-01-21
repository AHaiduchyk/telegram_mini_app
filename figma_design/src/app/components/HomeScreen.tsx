import { Minus, Plus, TrendingDown, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis } from 'recharts';

interface HomeScreenProps {
  onAddExpense: () => void;
  onAddIncome: () => void;
}

export function HomeScreen({ onAddExpense, onAddIncome }: HomeScreenProps) {
  const [showFabMenu, setShowFabMenu] = useState(false);

  const balance = 24560;
  const income = 12000;
  const expenses = 7400;

  const categoryData = [
    { name: 'Food', amount: 2400, color: '#706fd3' },
    { name: 'Transport', amount: 1800, color: '#9c9bc6' },
    { name: 'Shopping', amount: 1500, color: '#c8c7e0' },
    { name: 'Bills', amount: 1200, color: '#5956b8' },
    { name: 'Other', amount: 500, color: '#e4e4f0' },
  ];

  const recentTransactions = [
    { id: 1, category: 'Food', name: 'Food', amount: -240, icon: '🍔' },
    { id: 2, category: 'Transport', name: 'Taxi', amount: -180, icon: '🚕' },
    { id: 3, category: 'Income', name: 'Salary', amount: 12000, icon: '💰' },
    { id: 4, category: 'Food', name: 'Coffee', amount: -95, icon: '☕' },
    { id: 5, category: 'Bills', name: 'Bills', amount: -1200, icon: '📄' },
  ];

  return (
    <div className="flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-xl px-4 py-4 border-b border-white/40 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#706fd3] to-[#9c9bc6] rounded-full flex items-center justify-center text-lg shadow-lg shadow-[#706fd3]/30">
              👤
            </div>
            <div>
              <h1 className="font-semibold text-gray-900">Finance Tracker</h1>
              <p className="text-sm text-gray-600">Hello, Andrii</p>
            </div>
          </div>
          <button className="w-10 h-10 flex items-center justify-center text-gray-600 hover:bg-white/60 rounded-xl transition-all">
            💬
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* Balance Card */}
        <div className="relative bg-gradient-to-br from-[#706fd3]/90 to-[#5956b8]/90 backdrop-blur-2xl rounded-3xl p-6 text-white shadow-[0_20px_60px_rgba(112,111,211,0.4)] mb-4 border border-white/20 overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative">
            <p className="text-sm opacity-90 mb-1">Total Balance</p>
            <h2 className="text-4xl font-bold mb-4">{balance.toLocaleString()} ₴</h2>
            <div className="flex gap-4">
              <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp size={16} />
                  <span>Income</span>
                </div>
                <p className="font-semibold mt-1">+{income.toLocaleString()} ₴</p>
              </div>
              <div className="flex-1 bg-white/10 backdrop-blur-sm rounded-2xl p-3 border border-white/20">
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingDown size={16} />
                  <span>Expenses</span>
                </div>
                <p className="font-semibold mt-1">-{expenses.toLocaleString()} ₴</p>
              </div>
            </div>
          </div>
        </div>

        {/* Spending by Categories */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] mb-4 border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-3">Spending by Categories</h3>
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
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-3">Recent Transactions</h3>
          <div className="space-y-3">
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
      </div>

      {/* Floating Add Button */}
      <div className="fixed bottom-24 right-0 z-50">
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
              <span className="font-medium text-gray-900 whitespace-nowrap">Add Income</span>
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
              <span className="font-medium text-gray-900 whitespace-nowrap">Add Expense</span>
            </button>
          </div>
        )}

        <button
          onClick={() => setShowFabMenu(!showFabMenu)}
          className={`group flex items-center transition-all duration-300 ${
            showFabMenu ? 'translate-x-0 pr-4' : 'translate-x-9 hover:translate-x-0 pr-4'
          }`}
        >
          <div className="w-14 h-14 bg-gradient-to-br from-[#706fd3] to-[#5956b8] rounded-l-2xl shadow-[0_10px_40px_rgba(112,111,211,0.5)] flex items-center justify-center border-y border-l border-white/20 transition-all">
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
              <div className="text-[#706fd3] text-xs font-bold">→</div>
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
    </div>
  );
}
