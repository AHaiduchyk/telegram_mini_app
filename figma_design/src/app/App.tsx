import { useEffect, useMemo, useRef, useState } from 'react';
import { BottomNav } from '@/app/components/BottomNav';
import { HomeScreen } from '@/app/components/HomeScreen';
import { AddExpenseScreen } from '@/app/components/AddExpenseScreen';
import { ScanQRScreen } from '@/app/components/ScanQRScreen';
import { BudgetScreen } from '@/app/components/BudgetScreen';
import { TransactionsScreen } from '@/app/components/TransactionsScreen';
import { AnalyticsScreen } from '@/app/components/AnalyticsScreen';
import { SettingsScreen } from '@/app/components/SettingsScreen';
import { AutoTransactionsScreen } from '@/app/components/AutoTransactionsScreen';
import { ThemeProvider } from '@/app/components/ThemeContext';
import { LocaleProvider } from '@/app/components/LocaleContext';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showTransactions, setShowTransactions] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showScanQR, setShowScanQR] = useState(false);
  const [showAutoTransactions, setShowAutoTransactions] = useState(false);
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [swipeWidth, setSwipeWidth] = useState(0);

  const tabs = ['home', 'budget', 'analytics', 'settings'] as const;
  const tabIndex = tabs.indexOf(activeTab as (typeof tabs)[number]);

  useEffect(() => {
    const updateWidth = () => {
      if (swipeRef.current) {
        setSwipeWidth(swipeRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  useEffect(() => {
    const tg = (window as any)?.Telegram?.WebApp || null;
    if (!tg) return;
    tg.ready?.();
    tg.expand?.();
    tg.requestFullscreen?.();
    tg.setHeaderColor?.('#000000');
    tg.setBackgroundColor?.('#000000');
    const applySafeTop = () => {
      const isIOS =
        tg.platform === 'ios' ||
        /iP(hone|ad|od)/.test(navigator.userAgent);
      const rawSafeTop =
        Number(tg.safeAreaInset?.top ?? tg.contentSafeAreaInset?.top ?? 0) || 0;
      const safeTop = rawSafeTop || (isIOS ? 44 : 0);
      const controlsHeight = isIOS ? 44 : 36;
      document.documentElement.style.setProperty('--tg-safe-top', `${safeTop}px`);
      document.documentElement.style.setProperty('--tg-controls-height', `${controlsHeight}px`);
    };
    applySafeTop();
    if (tg.onEvent) {
      tg.onEvent('viewportChanged', applySafeTop);
    }
    const payload = {
      init_data: tg.initData ?? null,
      init_data_unsafe: tg.initDataUnsafe ?? null,
      platform: tg.platform ?? null,
      app_version: tg.version ?? null,
      color_scheme: tg.colorScheme ?? null,
      user_agent: navigator.userAgent,
      timezone_offset: new Date().getTimezoneOffset(),
    };
    fetch('/api/user_profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
    return () => {
      if (tg.offEvent) {
        tg.offEvent('viewportChanged', applySafeTop);
      }
    };
  }, []);


  const hideHomeFab = activeTab !== 'home' || isTransitioning;

  const renderTab = (tab: (typeof tabs)[number]) => {
    switch (tab) {
      case 'home':
        return (
          <HomeScreen
            onAddExpense={() => setShowAddExpense(true)}
            onAddIncome={() => setShowAddIncome(true)}
            onViewAll={() => setShowTransactions(true)}
            onOpenBudget={() => {
              setShowTransactions(false);
              setActiveTab('budget');
            }}
            hideFab={hideHomeFab}
          />
        );
      case 'budget':
        return <BudgetScreen isActive={activeTab === 'budget'} />;
      case 'analytics':
        return <AnalyticsScreen />;
      case 'settings':
        return (
          <SettingsScreen
            onOpenAutoTransactions={() => setShowAutoTransactions(true)}
          />
        );
      default:
        return (
          <HomeScreen
            onAddExpense={() => setShowAddExpense(true)}
            onAddIncome={() => setShowAddIncome(true)}
            onViewAll={() => setShowTransactions(true)}
            onOpenBudget={() => {
              setShowTransactions(false);
              setActiveTab('budget');
            }}
            hideFab={hideHomeFab}
          />
        );
    }
  };

  const swipeStyle = useMemo(() => {
    const base = swipeWidth ? -tabIndex * swipeWidth : 0;
    return {
      transform: `translate3d(${base}px, 0, 0)`,
      transition: 'transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1)',
    };
  }, [swipeWidth, tabIndex]);

  useEffect(() => {
    if (showAddExpense || showAddIncome || showScanQR || showTransactions || showAutoTransactions) {
      return;
    }
    setIsTransitioning(true);
    const timer = window.setTimeout(() => {
      setIsTransitioning(false);
    }, 360);
    return () => window.clearTimeout(timer);
  }, [activeTab, showAddExpense, showAddIncome, showScanQR, showTransactions, showAutoTransactions]);

  return (
    <ThemeProvider>
      <LocaleProvider>
        <div
          className="h-screen w-full max-w-md mx-auto flex flex-col overflow-hidden"
          style={{ background: 'var(--app-bg)' }}
        >
          <div className="tg-statusbar" />
          <div className="tg-header-mask" />
          {showScanQR && <ScanQRScreen onBack={() => setShowScanQR(false)} />}
          {showAddIncome && (
            <AddExpenseScreen
              onBack={() => setShowAddIncome(false)}
              onScanQR={() => {
                setShowAddIncome(false);
                setShowScanQR(true);
              }}
              isIncome={true}
            />
          )}
          {showAddExpense && (
            <AddExpenseScreen
              onBack={() => setShowAddExpense(false)}
              onScanQR={() => {
                setShowAddExpense(false);
                setShowScanQR(true);
              }}
              isIncome={false}
            />
          )}
          {!showAddExpense && !showScanQR && !showAddIncome && !showTransactions && !showAutoTransactions && (
            <div
              ref={swipeRef}
              className="relative flex-1 overflow-hidden"
            >
              <div className="flex h-full w-full" style={swipeStyle}>
                {tabs.map((tab) => (
                  <div
                    key={tab}
                    className={`w-full shrink-0 ${tab === activeTab ? '' : 'pointer-events-none'}`}
                  >
                    {renderTab(tab)}
                  </div>
                ))}
              </div>
            </div>
          )}
          {!showAddExpense && !showScanQR && !showAddIncome && showTransactions && (
            <div className="relative flex-1 overflow-hidden">
              <TransactionsScreen isActive />
            </div>
          )}
          {!showAddExpense && !showScanQR && !showAddIncome && showAutoTransactions && (
            <div className="relative flex-1 overflow-hidden">
              <AutoTransactionsScreen onBack={() => setShowAutoTransactions(false)} />
            </div>
          )}
          {!showAddExpense && !showScanQR && !showAddIncome && !showAutoTransactions && (
            <BottomNav
              activeTab={activeTab}
              onTabChange={(tab) => {
                setShowTransactions(false);
                setShowAutoTransactions(false);
                setActiveTab(tab);
              }}
            />
          )}
        </div>
      </LocaleProvider>
    </ThemeProvider>
  );
}
