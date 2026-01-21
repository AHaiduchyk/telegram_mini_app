import { TrendingUp, TrendingDown } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';

export function AnalyticsScreen() {
  const categoryData = [
    { name: 'Food', value: 2400, color: '#706fd3' },
    { name: 'Transport', value: 1800, color: '#9c9bc6' },
    { name: 'Shopping', value: 1500, color: '#c8c7e0' },
    { name: 'Bills', value: 1200, color: '#5956b8' },
    { name: 'Other', value: 500, color: '#e4e4f0' },
  ];

  const monthlyData = [
    { month: 'Jul', income: 11000, expenses: 6500 },
    { month: 'Aug', income: 11500, expenses: 7200 },
    { month: 'Sep', income: 12000, expenses: 6800 },
    { month: 'Oct', income: 11800, expenses: 7500 },
    { month: 'Nov', income: 12200, expenses: 7100 },
    { month: 'Dec', income: 12500, expenses: 7400 },
    { month: 'Jan', income: 12000, expenses: 7400 },
  ];

  const topCategories = [
    { name: 'Food', amount: 2400, percentage: 32, color: '#706fd3' },
    { name: 'Transport', amount: 1800, percentage: 24, color: '#9c9bc6' },
    { name: 'Shopping', amount: 1500, percentage: 20, color: '#c8c7e0' },
    { name: 'Bills', amount: 1200, percentage: 16, color: '#5956b8' },
    { name: 'Other', amount: 500, percentage: 8, color: '#e4e4f0' },
  ];

  const total = categoryData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-xl px-4 py-4 border-b border-white/40 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Analytics</h1>
        <p className="text-sm text-gray-600 mt-1">January 2026</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] border border-white/40">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp size={16} className="text-green-600" />
              </div>
              <span className="text-sm text-gray-600">Income</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">12,000 ₴</p>
            <p className="text-xs text-green-600 mt-1">+8% from last month</p>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] border border-white/40">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <TrendingDown size={16} className="text-red-500" />
              </div>
              <span className="text-sm text-gray-600">Expenses</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">7,400 ₴</p>
            <p className="text-xs text-red-500 mt-1">+4% from last month</p>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] mb-4 border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">Expenses by Category</h3>
          <div className="relative h-[220px] overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-gray-900">
                {total.toLocaleString()} ₴
              </p>
            </div>
          </div>
        </div>

        {/* Monthly Trend */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] mb-4 border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">Monthly Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="income"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="expenses"
                stroke="#706fd3"
                strokeWidth={2}
                dot={{ fill: '#706fd3', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              <span className="text-sm text-gray-600">Income</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#706fd3] rounded-full"></div>
              <span className="text-sm text-gray-600">Expenses</span>
            </div>
          </div>
        </div>

        {/* Top Categories */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">Top Categories</h3>
          <div className="space-y-4">
            {topCategories.map((category, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: category.color }}
                    ></div>
                    <span className="text-sm font-medium text-gray-900">
                      {category.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {category.percentage}%
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {category.amount.toLocaleString()} ₴
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-white/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${category.percentage}%`,
                      backgroundColor: category.color,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
