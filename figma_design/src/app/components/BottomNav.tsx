import { Home, PiggyBank, BarChart3, Settings } from 'lucide-react';
import { useLocale } from './LocaleContext';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { t } = useLocale();
  const tabs = [
    { id: 'home', label: t('home'), icon: Home },
    { id: 'budget', label: t('budget'), icon: PiggyBank },
    { id: 'analytics', label: t('analytics'), icon: BarChart3 },
    { id: 'settings', label: t('settings'), icon: Settings },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/70 backdrop-blur-xl border-t border-white/40 shadow-[var(--surface-shadow-top)] safe-bottom">
      <div className="max-w-md mx-auto flex justify-around items-center px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center px-4 py-2 rounded-2xl transition-all ${
                isActive
                  ? 'text-[var(--accent-from)] bg-[var(--accent-from)]/10 backdrop-blur-sm'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
              }`}
            >
              <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-xs mt-1 font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
