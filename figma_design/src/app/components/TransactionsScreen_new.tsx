import { Search, SlidersHorizontal, Calendar, X } from 'lucide-react';
import { useState } from 'react';

interface Transaction {
  id: number;
  name: string;
  category: string;
  amount: number;
  time: string;
  icon: string;
}

export function TransactionsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

  const categories = ['All', 'Food', 'Transport', 'Shopping', 'Bills', 'Other', 'Income'];

  const transactionsByDate = [
    {
      date: 'Today',
      transactions: [
        { id: 1, name: 'Coffee Shop', category: 'Food', amount: -95, time: '14:30', icon: '☕' },
        { id: 2, name: 'Uber', category: 'Transport', amount: -180, time: '12:15', icon: '🚕' },
        { id: 3, name: 'Grocery Store', category: 'Food', amount: -240, time: '10:20', icon: '🛒' },
      ],
    },
    {
      date: 'Yesterday',
      transactions: [
        { id: 4, name: 'Salary', category: 'Income', amount: 12000, time: '09:00', icon: '💰' },
        { id: 5, name: 'Restaurant', category: 'Food', amount: -450, time: '19:45', icon: '🍽️' },
        { id: 6, name: 'Utilities', category: 'Bills', amount: -1200, time: '15:30', icon: '📄' },
      ],
    },
    {
      date: 'January 17',
      transactions: [
        { id: 7, name: 'Shopping Mall', category: 'Shopping', amount: -1500, time: '16:20', icon: '🛍️' },
        { id: 8, name: 'Gas Station', category: 'Transport', amount: -350, time: '08:15', icon: '⛽' },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-xl px-4 py-4 border-b border-white/40 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Transactions</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* Search */}
        <div className="mb-4">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transactions..."
              className="w-full px-4 py-3 pl-11 bg-white/60 backdrop-blur-xl border border-white/40 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#706fd3] shadow-[0_10px_40px_rgba(112,111,211,0.15)]"
            />
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all backdrop-blur-xl border shadow-[0_4px_20px_rgba(112,111,211,0.15)] ${
                selectedCategory === category
                  ? 'bg-gradient-to-br from-[#706fd3] to-[#5956b8] text-white border-white/20'
                  : 'bg-white/60 text-gray-700 border-white/40 hover:bg-white/80'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Transactions by Date */}
        <div className="space-y-4">
          {transactionsByDate.map((group) => (
            <div key={group.date}>
              <h3 className="text-sm font-semibold text-gray-600 mb-2 px-1">
                {group.date}
              </h3>
              <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] border border-white/40">
                <div className="space-y-3">
                  {group.transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      onClick={() => setSelectedTransaction(transaction)}
                      className="flex items-center justify-between bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/30 hover:bg-white/60 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center text-lg shadow-sm">
                          {transaction.icon}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {transaction.name}
                          </p>
                          <p className="text-sm text-gray-600">
                            {transaction.category}
                          </p>
                        </div>
                      </div>
                      <p
                        className={`font-semibold ${
                          transaction.amount > 0
                            ? 'text-green-600'
                            : 'text-gray-900'
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
          ))}
        </div>
      </div>

      {/* Transaction Details Modal */}
      {selectedTransaction && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center animate-in fade-in duration-300"
          onClick={() => setSelectedTransaction(null)}
        >
          <div 
            className="bg-white/80 backdrop-blur-xl rounded-t-3xl sm:rounded-3xl w-full sm:w-96 max-h-[80vh] overflow-y-auto shadow-[0_20px_60px_rgba(112,111,211,0.3)] border border-white/40 animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/40">
              <h2 className="text-lg font-semibold text-gray-900">Transaction Details</h2>
              <button
                onClick={() => setSelectedTransaction(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-white/60 hover:bg-white/80 transition-all"
              >
                <X size={18} className="text-gray-600" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Icon and Amount */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-4xl shadow-lg">
                  {selectedTransaction.icon}
                </div>
                <div className="text-center">
                  <p className={`text-3xl font-bold ${
                    selectedTransaction.amount > 0 ? 'text-green-600' : 'text-gray-900'
                  }`}>
                    {selectedTransaction.amount > 0 ? '+' : ''}
                    {selectedTransaction.amount.toLocaleString()} ₴
                  </p>
                  <p className="text-gray-600 mt-1">{selectedTransaction.name}</p>
                </div>
              </div>

              {/* Details */}
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
                  <span className={`font-medium ${
                    selectedTransaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {selectedTransaction.amount > 0 ? 'Income' : 'Expense'}
                  </span>
                </div>
                <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm rounded-2xl p-4 border border-white/30">
                  <span className="text-gray-600">Transaction ID</span>
                  <span className="font-medium text-gray-900 font-mono text-sm">#{selectedTransaction.id.toString().padStart(6, '0')}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button className="flex-1 bg-gradient-to-br from-[#706fd3] to-[#5956b8] text-white py-3 rounded-2xl font-medium shadow-[0_10px_30px_rgba(112,111,211,0.3)] hover:shadow-[0_15px_40px_rgba(112,111,211,0.4)] transition-all">
                  Edit
                </button>
                <button className="flex-1 bg-white/60 backdrop-blur-xl text-red-600 py-3 rounded-2xl font-medium border border-red-200 hover:bg-red-50 transition-all">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}