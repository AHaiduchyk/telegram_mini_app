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
  const [showScanQR, setShowScanQR] = useState(false);

  const renderScreen = () => {
    if (showScanQR) {
      return <ScanQRScreen onBack={() => setShowScanQR(false)} />;
    }

    if (showAddExpense) {
      return (
        <AddExpenseScreen
          onBack={() => setShowAddExpense(false)}
          onScanQR={() => {
            setShowScanQR(true);
          }}
        />
      );
    }

    switch (activeTab) {
      case 'home':
        return <HomeScreen onAddExpense={() => setShowAddExpense(true)} />;
      case 'transactions':
        return <TransactionsScreen />;
      case 'analytics':
        return <AnalyticsScreen />;
      case 'settings':
        return <SettingsScreen />;
      default:
        return <HomeScreen onAddExpense={() => setShowAddExpense(true)} />;
    }
  };

  return (
    <div className="h-screen w-full max-w-md mx-auto bg-white flex flex-col overflow-hidden">
      {renderScreen()}
      {!showAddExpense && !showScanQR && (
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      )}
    </div>
  );
}
