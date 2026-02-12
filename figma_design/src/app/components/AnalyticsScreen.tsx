import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEffect, useMemo, useState } from 'react';
import { useLocale } from './LocaleContext';

export function AnalyticsScreen() {
  const { t } = useLocale();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [categoryMode, setCategoryMode] = useState<'expense' | 'income'>('expense');
  const [totals, setTotals] = useState({
    currentIncome: 0,
    currentExpense: 0,
    previousIncome: 0,
    previousExpense: 0,
  });
  const [categoryData, setCategoryData] = useState<Array<{ name: string; value: number }>>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<Array<{ month: string; income: number; expenses: number }>>([]);
  const [monthOptions, setMonthOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [selectedLabel, setSelectedLabel] = useState('All time');
  const [hasData, setHasData] = useState(true);
  const [chartView, setChartView] = useState<'pie' | 'bar'>('pie');

  const defaultCategoryPalette = [
    '#706fd3',
    '#9c9bc6',
    '#c8c7e0',
    '#5956b8',
    '#e4e4f0',
    '#7c78e0',
    '#a9a6d8',
  ];

  const getCategoryPalette = () => {
    if (typeof window === 'undefined') return defaultCategoryPalette;
    const styles = getComputedStyle(document.documentElement);
    const vars = [
      '--category-1',
      '--category-2',
      '--category-3',
      '--category-4',
      '--category-5',
      '--category-6',
      '--category-7',
    ];
    const palette = vars.map((v) => styles.getPropertyValue(v).trim()).filter(Boolean);
    return palette.length ? palette : defaultCategoryPalette;
  };

  const hashString = (value: string) => {
    let hash = 0;
    for (let i = 0; i < value.length; i += 1) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const hexToRgb = (hex: string) => {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  };

  const rgbToHex = (r: number, g: number, b: number) => {
    const toHex = (value: number) => value.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const rgbToHsl = (r: number, g: number, b: number) => {
    const rNorm = r / 255;
    const gNorm = g / 255;
    const bNorm = b / 255;
    const max = Math.max(rNorm, gNorm, bNorm);
    const min = Math.min(rNorm, gNorm, bNorm);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case rNorm:
          h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
          break;
        case gNorm:
          h = (bNorm - rNorm) / d + 2;
          break;
        case bNorm:
          h = (rNorm - gNorm) / d + 4;
          break;
        default:
          h = 0;
      }
      h /= 6;
    }
    return { h, s, l };
  };

  const hslToRgb = (h: number, s: number, l: number) => {
    if (s === 0) {
      const gray = Math.round(l * 255);
      return { r: gray, g: gray, b: gray };
    }
    const hue2rgb = (p: number, q: number, t: number) => {
      let tMod = t;
      if (tMod < 0) tMod += 1;
      if (tMod > 1) tMod -= 1;
      if (tMod < 1 / 6) return p + (q - p) * 6 * tMod;
      if (tMod < 1 / 2) return q;
      if (tMod < 2 / 3) return p + (q - p) * (2 / 3 - tMod) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const r = hue2rgb(p, q, h + 1 / 3);
    const g = hue2rgb(p, q, h);
    const b = hue2rgb(p, q, h - 1 / 3);
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };

  const adjustLightness = (hex: string, delta: number) => {
    const { r, g, b } = hexToRgb(hex);
    const { h, s, l } = rgbToHsl(r, g, b);
    const nextL = Math.min(0.92, Math.max(0.18, l + delta));
    const rgb = hslToRgb(h, s, nextL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  };

  const getCategoryColor = (name: string) => {
    const hash = hashString(name);
    const palette = getCategoryPalette();
    const base = palette[hash % palette.length];
    const shade = [-0.08, 0, 0.08][hash % 3];
    return adjustLightness(base, shade);
  };

  const parseAmount = (value: string | null) => {
    if (!value) return 0;
    const normalized = value.replace(',', '.');
    const parsed = Number(normalized);
    return Number.isNaN(parsed) ? 0 : parsed;
  };

  const fetchAnalytics = async (tg: any, monthKey: string, mode: 'expense' | 'income') => {
    const params = new URLSearchParams();
    if (tg.initData) params.set('init_data', tg.initData);
    if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
    params.set('month', monthKey);
    params.set('mode', mode);
    params.set('months', '7');

    const res = await fetch(`/api/analytics?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to load analytics.');
    const data = await res.json();

    setTotals({
      currentIncome: parseAmount(data.totals?.current_income ?? null),
      currentExpense: parseAmount(data.totals?.current_expense ?? null),
      previousIncome: parseAmount(data.totals?.previous_income ?? null),
      previousExpense: parseAmount(data.totals?.previous_expense ?? null),
    });
    const categories = Array.isArray(data.categories) ? data.categories : [];
    setCategoryData(
      categories.map((row: any) => ({
        name: row.name,
        value: parseAmount(row.value ?? null),
      })),
    );
    const trend = Array.isArray(data.trend) ? data.trend : [];
    setMonthlyTrend(
      trend.map((row: any) => ({
        month: row.month,
        income: parseAmount(row.income ?? null),
        expenses: parseAmount(row.expenses ?? null),
      })),
    );
    const months = Array.isArray(data.months) ? data.months : [];
    setMonthOptions(months);
    if (!selectedMonth && data.default_month) {
      setSelectedMonth(data.default_month);
    }
    const label = months.find((option: any) => option.value === (selectedMonth ?? data.default_month))?.label;
    setSelectedLabel(label || (data.has_data ? 'All time' : 'All time'));
    setHasData(Boolean(data.has_data));
    setStatusMessage(data.has_data ? null : 'No transactions yet.');
  };

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setLoading(false);
      setStatusMessage('Open this Mini App inside Telegram.');
      return;
    }

    const fetchData = async () => {
      try {
        const monthKey = selectedMonth ?? 'current';
        await fetchAnalytics(tg, monthKey, categoryMode);
      } catch {
        setStatusMessage('Failed to load transactions.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedMonth, categoryMode]);

  const currentTotals = useMemo(() => {
    return { incomeTotal: totals.currentIncome, expenseTotal: totals.currentExpense };
  }, [totals]);

  const lastMonthTotals = useMemo(() => {
    return { incomeTotal: totals.previousIncome, expenseTotal: totals.previousExpense };
  }, [totals]);

  const categoryDataWithColor = useMemo(() => {
    return categoryData.map((entry) => ({
      ...entry,
      color: getCategoryColor(entry.name),
    }));
  }, [categoryData]);

  const total = categoryDataWithColor.reduce((sum, item) => sum + item.value, 0);

  const topCategories = useMemo(() => {
    return [...categoryDataWithColor]
      .sort((a, b) => b.value - a.value)
      .map((cat) => ({
        name: cat.name,
        amount: cat.value,
        percentage: total > 0 ? Math.round((cat.value / total) * 100) : 0,
        color: cat.color,
      }));
  }, [categoryDataWithColor, total]);

  const monthlyData = monthlyTrend;

  const calcDelta = (current: number, previous: number) => {
    if (previous <= 0) return null;
    return Math.round(((current - previous) / previous) * 100);
  };

  const incomeDelta = calcDelta(currentTotals.incomeTotal, lastMonthTotals.incomeTotal);
  const expenseDelta = calcDelta(currentTotals.expenseTotal, lastMonthTotals.expenseTotal);
  const deltaLabel = 'from previous month';
  const hasPreviousMonth = selectedMonth !== 'all';
  const hasIncomeDelta = hasPreviousMonth && incomeDelta !== null;
  const hasExpenseDelta = hasPreviousMonth && expenseDelta !== null;

  const incomeDeltaTone = hasIncomeDelta && incomeDelta !== null && incomeDelta > 0 ? 'up' : 'down';
  const expenseDeltaTone = hasExpenseDelta && expenseDelta !== null && expenseDelta > 0 ? 'up' : 'down';

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
  const lerp = (from: number, to: number, t: number) => Math.round(from + (to - from) * t);
  const mixColor = (from: [number, number, number], to: [number, number, number], t: number) => {
    return `rgb(${lerp(from[0], to[0], t)}, ${lerp(from[1], to[1], t)}, ${lerp(from[2], to[2], t)})`;
  };
  const deltaColor = (delta: number | null, positive: [[number, number, number], [number, number, number]], negative: [[number, number, number], [number, number, number]]) => {
    if (delta === null) return 'rgb(107, 114, 128)';
    const intensity = clamp(Math.abs(delta) / 100, 0.5, 1);
    const [light, dark] = delta >= 0 ? positive : negative;
    return mixColor(light, dark, intensity);
  };

  const handlePieClick = (_: any, index: number) => {
    setActiveIndex(index);
  };

  const handleChartToggle = () => {
    setActiveIndex(null);
    setChartView((prev) => (prev === 'pie' ? 'bar' : 'pie'));
  };

  useEffect(() => {
    setActiveIndex(null);
  }, [categoryDataWithColor]);

  useEffect(() => {
    setActiveIndex(null);
  }, [categoryMode]);

  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <g>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius * 1.05}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
      </g>
    );
  };

  const activeAmount =
    activeIndex !== null ? categoryDataWithColor[activeIndex]?.value ?? 0 : null;

  return (
    <div className="screen-pad flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm animate-in fade-in duration-300">
        <div className="screen-header-inner">
          <div className="flex items-center justify-between gap-3">
            <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('analytics')}</h1>
              <p className="text-sm text-gray-600 mt-1">{selectedLabel}</p>
              {statusMessage && (
                <p className="text-xs text-gray-500 mt-1">{statusMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2"></div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        <div
          className="flex gap-2 overflow-x-auto pb-3 -mx-4 px-4 scrollbar-hide"
          style={{
            WebkitMaskImage: 'linear-gradient(to bottom, #000 85%, transparent)',
            maskImage: 'linear-gradient(to bottom, #000 85%, transparent)',
          }}
        >
          {monthOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedMonth(option.value)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all backdrop-blur-xl border shadow-[var(--surface-shadow-sm)] ${
                selectedMonth === option.value
                  ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white border-white/20'
                  : 'bg-white/60 text-gray-700 border-white/40 hover:bg-white/80'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setCategoryMode('income')}
            className={`rounded-3xl p-4 text-left transition-all backdrop-blur-xl border ${
              categoryMode === 'income'
                ? 'bg-white/80 border-white/60 shadow-[var(--surface-shadow-strong)] ring-2 ring-[color:var(--accent-from)]/40'
                : 'bg-white/60 border-white/40 shadow-[var(--surface-shadow)] hover:bg-white/70'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp size={16} className="text-green-600" />
              </div>
              <span className="text-sm text-gray-600">{t('income')}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {currentTotals.incomeTotal.toLocaleString()} ₴
            </p>
            <div className="mt-2">
              {hasPreviousMonth && incomeDelta === null ? (
                <span className="text-xs text-gray-500">No data for previous month</span>
              ) : hasPreviousMonth ? (
                <span
                  className="text-xs"
                  style={{
                    color: deltaColor(
                      incomeDelta,
                      [
                        [183, 255, 208],
                        [0, 179, 60],
                      ],
                      [
                        [255, 209, 209],
                        [217, 4, 41],
                      ],
                    ),
                  }}
                >
                  {`${incomeDelta > 0 ? '+' : ''}${incomeDelta}% ${deltaLabel}`}
                </span>
              ) : (
                <span className="text-xs text-gray-500">All time total</span>
              )}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategoryMode('expense')}
            className={`rounded-3xl p-4 text-left transition-all backdrop-blur-xl border ${
              categoryMode === 'expense'
                ? 'bg-white/80 border-white/60 shadow-[var(--surface-shadow-strong)] ring-2 ring-[color:var(--accent-from)]/40'
                : 'bg-white/60 border-white/40 shadow-[var(--surface-shadow)] hover:bg-white/70'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <TrendingDown size={16} className="text-red-500" />
              </div>
              <span className="text-sm text-gray-600">{t('expenses')}</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {currentTotals.expenseTotal.toLocaleString()} ₴
            </p>
            <div className="mt-2">
              {hasPreviousMonth && expenseDelta === null ? (
                <span className="text-xs text-gray-500">No data for previous month</span>
              ) : hasPreviousMonth ? (
                <span
                  className="text-xs"
                  style={{
                    color: deltaColor(
                      expenseDelta,
                      [
                        [255, 209, 209],
                        [217, 4, 41],
                      ],
                      [
                        [183, 255, 208],
                        [0, 179, 60],
                      ],
                    ),
                  }}
                >
                  {`${expenseDelta > 0 ? '+' : ''}${expenseDelta}% ${deltaLabel}`}
                </span>
              ) : (
                <span className="text-xs text-gray-500">All time total</span>
              )}
            </div>
          </button>
        </div>

        {/* Category Chart */}
        <div
          className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] mb-4 border border-white/40"
          onClick={handleChartToggle}
        >
          <h3 className="font-semibold text-gray-900 mb-4">
            {categoryMode === 'income' ? `${t('income')} by Category` : `${t('expenses')} by Category`}
          </h3>
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-center mb-2"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className={`${chartView === 'bar' ? 'w-full h-48' : 'w-48 h-48'} [&_*]:outline-none [&_*]:!outline-none`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  {chartView === 'pie' ? (
                    <PieChart>
                      <Pie
                        data={categoryDataWithColor}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        activeIndex={activeIndex ?? undefined}
                        activeShape={renderActiveShape}
                        onClick={handlePieClick}
                        animationDuration={450}
                        animationEasing="ease-out"
                        isAnimationActive
                        style={{ cursor: 'pointer', outline: 'none' }}
                      >
                        {categoryDataWithColor.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            style={{ outline: 'none' }}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  ) : (
                    <BarChart
                      data={categoryDataWithColor}
                      margin={{ top: 12, right: 12, left: 0, bottom: 12 }}
                      barCategoryGap="24%"
                    >
                      <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={false}
                        interval={0}
                      />
                      <Bar dataKey="value" radius={[10, 10, 6, 6]} barSize={18}>
                        {categoryDataWithColor.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="rgba(0,0,0,0.08)"
                            strokeWidth={1}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
            <div className="text-center mb-2">
              <p className="text-sm text-gray-600">
                {activeIndex !== null
                  ? categoryDataWithColor[activeIndex]?.name ?? 'Total'
                  : categoryMode === 'income'
                    ? `Total ${t('income')}`
                    : `Total ${t('expenses')}`}
              </p>
              <p className="text-2xl font-bold text-gray-900">
                {(activeIndex !== null ? activeAmount ?? 0 : total).toLocaleString()} ₴
              </p>
            </div>
            <div className="grid gap-2">
              {topCategories.map((category) => {
                const idx = categoryDataWithColor.findIndex((item) => item.name === category.name);
                const isActive = idx === activeIndex;
                return (
                  <button
                    key={category.name}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (idx < 0) {
                        setActiveIndex(null);
                        return;
                      }
                      setActiveIndex(isActive ? null : idx);
                    }}
                    className="flex items-center justify-between bg-white/40 backdrop-blur-sm rounded-2xl px-3 py-2 text-left transition-all border border-white/30 hover:bg-white/70"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: category.color }}
                      ></div>
                      <span className="text-sm font-medium text-gray-900">{category.name}</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {isActive ? `${category.amount.toLocaleString()} ₴` : `${category.percentage}%`}
                    </div>
                  </button>
                );
              })}
              {!loading && topCategories.length === 0 && (
                <div className="text-sm text-gray-500">
                  {categoryMode === 'income' ? 'No income this month.' : 'No expenses this month.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top Categories */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">
            Top Categories
          </h3>
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

        {/* Monthly Trend */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] mt-4 border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">{t('monthly_trend')}</h3>
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
                stroke="var(--accent-from)"
                strokeWidth={2}
                dot={{ fill: 'var(--accent-from)', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 mt-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#10b981] rounded-full"></div>
              <span className="text-sm text-gray-600">{t('income')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[var(--accent-from)] rounded-full"></div>
              <span className="text-sm text-gray-600">{t('expenses')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
