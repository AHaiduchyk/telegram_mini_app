import { Home, History, BarChart3, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const tabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'transactions', label: 'History', icon: History },
    { id: 'analytics', label: 'Stats', icon: BarChart3 },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-bottom">
      <div className="max-w-md mx-auto flex justify-around items-center px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center px-4 py-2 rounded-lg transition-all ${
                isActive
                  ? 'text-[color:var(--brand-purple)]'
                  : 'text-muted-foreground hover:text-[color:var(--brand-purple-dark)]'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-xs mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
