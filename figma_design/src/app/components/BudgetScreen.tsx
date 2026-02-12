import { TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale } from './LocaleContext';

type BudgetScreenProps = {
  isActive?: boolean;
};

export function BudgetScreen({ isActive = true }: BudgetScreenProps) {
  const { t, formatLocale, locale } = useLocale();
  const now = new Date();
  const buildMonthKey = (dateValue: Date) =>
    `${dateValue.getFullYear()}-${String(dateValue.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthKey = buildMonthKey(now);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthKey);
  const isEditableMonth = selectedMonth === currentMonthKey;

  const monthLabel = useMemo(() => {
    if (selectedMonth === 'all') return 'All';
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    });
  }, [selectedMonth]);

  const monthOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      { value: 'all', label: 'All' },
    ];
    for (let i = 0; i < 6; i += 1) {
      const dateValue = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push({
        value: buildMonthKey(dateValue),
        label: dateValue.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
      });
    }
    return options;
  }, [now]);

  const categories = [
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
      let tNorm = t;
      if (tNorm < 0) tNorm += 1;
      if (tNorm > 1) tNorm -= 1;
      if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
      if (tNorm < 1 / 2) return q;
      if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
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
    const nextL = Math.min(0.92, Math.max(0.08, l + delta));
    const rgb = hslToRgb(h, s, nextL);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  };

  const blendColors = (a: string, b: string, t: number) => {
    const rgbA = hexToRgb(a);
    const rgbB = hexToRgb(b);
    const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
    return rgbToHex(mix(rgbA.r, rgbB.r), mix(rgbA.g, rgbB.g), mix(rgbA.b, rgbB.b));
  };

  const expandPalette = (base: string[], targetCount: number) => {
    const unique = new Set(base);
    if (unique.size >= targetCount) return Array.from(unique);

    const lightnessSteps = [0.08, -0.08, 0.14, -0.14];
    for (const step of lightnessSteps) {
      base.forEach((color) => unique.add(adjustLightness(color, step)));
      if (unique.size >= targetCount) return Array.from(unique);
    }

    for (let i = 0; i < base.length - 1; i += 1) {
      unique.add(blendColors(base[i], base[i + 1], 0.5));
      if (unique.size >= targetCount) return Array.from(unique);
      unique.add(blendColors(base[i], base[i + 1], 0.33));
      if (unique.size >= targetCount) return Array.from(unique);
      unique.add(blendColors(base[i], base[i + 1], 0.67));
      if (unique.size >= targetCount) return Array.from(unique);
    }

    let step = 0.18;
    while (unique.size < targetCount) {
      base.forEach((color) => unique.add(adjustLightness(color, step)));
      step += 0.06;
    }

    return Array.from(unique);
  };

  const [summary, setSummary] = useState({ limit: 0, spent: 0 });
  const [progressItems, setProgressItems] = useState<
    { category: string; spent: number; limit: number }[]
  >([]);
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});
  const [editingBudget, setEditingBudget] = useState<{
    category: string;
    label: string;
    emoji: string;
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildAuthParams = () => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) {
      setError(t('open_in_telegram'));
      return null;
    }
    const params = new URLSearchParams();
    if (tg.initData) params.set('init_data', tg.initData);
    if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
    return params;
  };

  const fetchBudgets = useCallback(async () => {
    const params = buildAuthParams();
    if (!params) return;
    if (selectedMonth !== 'all') {
      params.set('month', selectedMonth);
    }

    try {
      const [summaryRes, progressRes, budgetsRes] = await Promise.all([
        fetch(`/api/budget_summary?${params.toString()}`),
        fetch(`/api/budget_progress?${params.toString()}`),
        fetch(`/api/budgets?${params.toString()}`),
      ]);

      if (!summaryRes.ok || !progressRes.ok || !budgetsRes.ok) {
        throw new Error('Failed to load budget data.');
      }

      const summaryData = await summaryRes.json();
      const progressData = await progressRes.json();
      const budgetsData = await budgetsRes.json();

      setSummary({
        limit: Number(summaryData.total_limit ?? 0),
        spent: Number(summaryData.total_spent ?? 0),
      });

      const progressRows = Array.isArray(progressData?.items) ? progressData.items : [];
      setProgressItems(
        progressRows.map((row: any) => ({
          category: row.category,
          spent: Number(row.spent ?? 0),
          limit: Number(row.limit ?? 0),
        })),
      );

      const inputMap: Record<string, string> = {};
      if (Array.isArray(budgetsData)) {
        budgetsData.forEach((row: any) => {
          inputMap[row.category] = row.amount ?? '';
        });
      }
      categories.forEach((cat) => {
        if (inputMap[cat.value] === undefined) {
          inputMap[cat.value] = '';
        }
      });
      setBudgetInputs(inputMap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load budget data.');
    }
  }, [selectedMonth]);

  useEffect(() => {
    fetchBudgets();
  }, [fetchBudgets]);

  useEffect(() => {
    if (!isActive && editingBudget) {
      closeBudgetModal();
    }
  }, [isActive, editingBudget]);

  useEffect(() => {
    if (!isEditableMonth && editingBudget) {
      closeBudgetModal();
    }
  }, [isEditableMonth, editingBudget]);

  const progress = useMemo(() => {
    const ratio = summary.limit > 0 ? summary.spent / summary.limit : 0;
    return Math.min(Math.max(ratio, 0), 1);
  }, [summary.limit, summary.spent]);

  const remaining = Math.max(summary.limit - summary.spent, 0);
  const isOver = summary.spent > summary.limit;

  const progressDisplayItems = useMemo(() => {
    const byCategory = new Map(
      progressItems.map((row) => [row.category, row]),
    );

    const merged = categories.map((cat) => {
      const row = byCategory.get(cat.value);
      const limit = row?.limit ?? Number(budgetInputs[cat.value] || 0);
      const spent = row?.spent ?? 0;
      return { category: cat.value, spent, limit };
    });

    const extra = progressItems.filter(
      (row) => !categories.some((cat) => cat.value === row.category),
    );

    return [...merged, ...extra];
  }, [progressItems, budgetInputs, categories]);

  const categoryOrder = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    progressDisplayItems.forEach((item) => {
      if (!seen.has(item.category)) {
        seen.add(item.category);
        ordered.push(item.category);
      }
    });
    return ordered;
  }, [progressDisplayItems]);

  const categoryColors = useMemo(() => {
    const base = getCategoryPalette();
    const expanded = expandPalette(base, categoryOrder.length);
    const map = new Map<string, string>();
    categoryOrder.forEach((category, index) => {
      map.set(category, expanded[index]);
    });
    return map;
  }, [categoryOrder]);

  const normalizeBudgetValue = (value: string) => {
    const cleaned = value.replace(/,/g, '.').replace(/[^\d.]/g, '');
    const parts = cleaned.split('.');
    let normalized = parts[0];
    if (parts.length > 1) {
      normalized += `.${parts.slice(1).join('')}`;
    }
    const [intPart, decPart] = normalized.split('.');
    return decPart !== undefined ? `${intPart}.${decPart.slice(0, 2)}` : intPart;
  };

  const handleBudgetChange = (category: string, value: string) => {
    const finalValue = normalizeBudgetValue(value);
    setBudgetInputs((prev) => ({ ...prev, [category]: finalValue }));
    return finalValue;
  };

  const handleSaveSingle = async (category: string) => {
    const params = buildAuthParams();
    if (!params) return;
    setSavingCategory(category);
    setError(null);
    try {
      const payload = {
        init_data: params.get('init_data'),
        init_data_unsafe: params.get('init_data_unsafe')
          ? JSON.parse(params.get('init_data_unsafe') as string)
          : undefined,
        month: selectedMonth === 'all' ? buildMonthKey(now) : selectedMonth,
        category,
        amount: budgetInputs[category] || '0',
      };
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to save budget.');
      }
      await fetchBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budget.');
    } finally {
      setSavingCategory(null);
    }
  };

  const openBudgetModal = (category: string, label: string, emoji: string) => {
    if (!isActive || !isEditableMonth) return;
    setEditingBudget({ category, label, emoji });
    setEditValue(budgetInputs[category] ?? '');
  };

  const closeBudgetModal = () => {
    setEditingBudget(null);
    setEditValue('');
  };

  const handleSaveModal = async () => {
    if (!editingBudget) return;
    const params = buildAuthParams();
    if (!params) return;
    setSavingCategory(editingBudget.category);
    setError(null);
    try {
      const payload = {
        init_data: params.get('init_data'),
        init_data_unsafe: params.get('init_data_unsafe')
          ? JSON.parse(params.get('init_data_unsafe') as string)
          : undefined,
        month: selectedMonth === 'all' ? buildMonthKey(now) : selectedMonth,
        category: editingBudget.category,
        amount: editValue || '0',
      };
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error('Failed to save budget.');
      }
      closeBudgetModal();
      await fetchBudgets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save budget.');
    } finally {
      setSavingCategory(null);
    }
  };

  return (
    <div className="screen-pad flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm animate-in fade-in duration-300">
        <div className="screen-header-inner">
          <div className="flex items-center justify-between">
            <div>
          <h1 className="text-lg font-semibold text-gray-900">{t('budget')}</h1>
              <p className="text-sm text-gray-600 mt-1">{monthLabel}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-4">
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
        {/* Monthly Budget Card */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-5 shadow-[var(--surface-shadow)] border border-white/40">
          <div className="flex items-center justify-between mb-4">
            <div>
          <p className="text-sm text-gray-600">{t('month_budget')}</p>
              <p className="text-2xl font-semibold text-gray-900">
                {summary.limit.toLocaleString()} ₴
              </p>
            </div>
          </div>
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
              <span>{t('spent')}</span>
              <span>{summary.spent.toLocaleString()} ₴</span>
            </div>
            <div className="h-3 rounded-full bg-white/70 border border-white/40 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--accent-from)] to-[var(--accent-to)] transition-all"
                style={{ width: `${progress * 100}%` }}
              ></div>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              {isOver ? <TrendingUp size={14} className="text-red-500" /> : <TrendingDown size={14} className="text-green-600" />}
              <span>{isOver ? t('over_budget') : t('on_track')}</span>
            </div>
            <span className="font-medium text-gray-900">
              {remaining.toLocaleString()} ₴ {t('left')}
            </span>
          </div>
        </div>

        {/* Budget Progress */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] border border-white/40">
          <h3 className="font-semibold text-gray-900 mb-4">{t('budget_progress')}</h3>
          {error && (
            <div className="text-sm text-gray-500 mb-3">{error}</div>
          )}
          <div className="space-y-4">
            {progressDisplayItems.map((item) => {
              const ratio = item.limit > 0 ? Math.min(item.spent / item.limit, 1) : 0;
              const isOverCategory = item.spent > item.limit;
              const meta = categories.find((cat) => cat.value === item.category);
              const label = meta ? meta.label[locale] : item.category;
              const color = categoryColors.get(item.category) || 'var(--category-1)';
              const emoji = meta?.emoji ?? '🧾';
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() => openBudgetModal(item.category, label, emoji)}
                  className={`w-full text-left bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/30 transition-all ${
                    isEditableMonth ? 'hover:bg-white/60' : 'opacity-60 cursor-not-allowed'
                  }`}
                  disabled={!isEditableMonth}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{emoji}</span>
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                      ></span>
                      <span className="text-sm font-medium text-gray-900">{label}</span>
                    </div>
                    <span className="text-xs text-gray-600">
                      {item.spent.toLocaleString()} / {item.limit.toLocaleString()} ₴
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/70 border border-white/40 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${ratio * 100}%`,
                        background: isOverCategory
                          ? 'linear-gradient(90deg, #f87171, #ef4444)'
                          : `linear-gradient(90deg, ${color}, ${color})`,
                      }}
                    ></div>
                  </div>
                  {isOverCategory && (
                    <p className="text-xs text-red-500 mt-2">Over limit</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {editingBudget && isActive &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={closeBudgetModal}
          >
            <div
              className="bg-white/90 backdrop-blur-xl rounded-t-3xl sm:rounded-3xl w-full sm:w-96 p-5 border border-white/40 shadow-[var(--surface-shadow-strong)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{editingBudget.emoji}</span>
                  <div>
                    <p className="text-sm text-gray-600">{t('category')}</p>
                    <p className="text-lg font-semibold text-gray-900">{editingBudget.label}</p>
                  </div>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-2">
                  {t('amount')}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="done"
                    value={editValue}
                    onChange={(e) => {
                      const next = handleBudgetChange(editingBudget.category, e.target.value);
                      setEditValue(next);
                    }}
                    onFocus={(e) => {
                      e.currentTarget.scrollIntoView({ block: 'center', behavior: 'smooth' });
                    }}
                    onBlur={() => setEditValue(budgetInputs[editingBudget.category] ?? '')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full px-4 py-3 bg-white text-gray-900 text-base font-medium border border-white/40 rounded-2xl focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-from)] caret-[color:var(--accent-from)]"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600">
                    ₴
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSaveModal}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white font-medium shadow-[var(--accent-glow)]"
                  disabled={Boolean(savingCategory)}
                >
                  {savingCategory ? t('saving') : t('save_budgets')}
                </button>
                <button
                  type="button"
                  onClick={closeBudgetModal}
                  className="flex-1 py-3 rounded-2xl bg-white/70 text-gray-700 font-medium border border-white/40"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
