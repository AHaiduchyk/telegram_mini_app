import { useState } from 'react';
import { BottomNav } from '@/app/components/BottomNav';
import { HomeScreen } from '@/app/components/HomeScreen';
import { AddExpenseScreen } from '@/app/components/AddExpenseScreen';
import { ScanQRScreen } from '@/app/components/ScanQRScreen';
import { TransactionsScreen } from '@/app/components/TransactionsScreen';
import { AnalyticsScreen } from '@/app/components/AnalyticsScreen';
import { SettingsScreen } from '@/app/components/SettingsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [showScanQR, setShowScanQR] = useState(false);

  const renderScreen = () => {
    if (showScanQR) {
      return <ScanQRScreen onBack={() => setShowScanQR(false)} />;
    }

    if (showAddIncome) {
      return (
        <AddExpenseScreen
          onBack={() => setShowAddIncome(false)}
          onScanQR={() => {
            setShowAddIncome(false);
            setShowScanQR(true);
          }}
          isIncome={true}
        />
      );
    }

    if (showAddExpense) {
      return (
        <AddExpenseScreen
          onBack={() => setShowAddExpense(false)}
          onScanQR={() => {
            setShowAddExpense(false);
            setShowScanQR(true);
          }}
          isIncome={false}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            onAddExpense={() => setShowAddExpense(true)}
            onAddIncome={() => setShowAddIncome(true)}
          />
        );
      case 'transactions':
        return <TransactionsScreen />;
      case 'analytics':
        return <AnalyticsScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return (
          <HomeScreen
            onAddExpense={() => setShowAddExpense(true)}
            onAddIncome={() => setShowAddIncome(true)}
          />
        );
    }
  };

  return (
    <div className="h-screen w-full max-w-md mx-auto bg-gradient-to-br from-purple-50 via-indigo-50 to-pink-50 flex flex-col overflow-hidden">
      {renderScreen()}
      {!showAddExpense && !showScanQR && !showAddIncome && (
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}
