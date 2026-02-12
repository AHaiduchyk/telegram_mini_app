import { ChevronRight, User, Bell, Palette, Globe, HelpCircle, LogOut, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from './ThemeContext';
import { useLocale } from './LocaleContext';

type SettingsScreenProps = {
  onOpenAutoTransactions: () => void;
};

export function SettingsScreen({ onOpenAutoTransactions }: SettingsScreenProps) {
  const { theme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [userName, setUserName] = useState(t('telegram_user'));
  const [userHandle, setUserHandle] = useState('');
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const [premiumUntil, setPremiumUntil] = useState<string | null>(null);

  const tg = useMemo(() => (window as any)?.Telegram?.WebApp || null, []);

  useEffect(() => {
    if (!tg) return;
    const user = tg.initDataUnsafe?.user;
    if (!user) return;
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
    setUserName(fullName || user.username || t('telegram_user'));
    setUserHandle(user.username ? `@${user.username}` : '');
    setUserPhoto(user.photo_url || null);
  }, [tg, t]);

  useEffect(() => {
    if (!tg) return;
    const loadProfile = async () => {
      const params = new URLSearchParams();
      if (tg.initData) params.set('init_data', tg.initData);
      if (tg.initDataUnsafe) params.set('init_data_unsafe', JSON.stringify(tg.initDataUnsafe));
      try {
        const res = await fetch(`/api/user_profile?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        setIsPremium(Boolean(data.is_premium));
        setPremiumUntil(data.premium_until ?? null);
      } catch {}
    };
    loadProfile();
  }, [tg]);

  const showPopup = (title: string, message: string) => {
    if (tg?.showPopup) {
      tg.showPopup({
        title,
        message,
        buttons: [{ id: 'ok', type: 'ok', text: 'OK' }],
      });
      return;
    }
    window.alert(`${title}\n${message}`);
  };

  const handleProfile = () => {
    if (userHandle && tg?.openTelegramLink) {
      tg.openTelegramLink(`https://t.me/${userHandle.replace('@', '')}`);
      return;
    }
    showPopup(t('profile'), t('coming_soon'));
  };

  const handleNotifications = () => {
    showPopup(t('notifications'), t('coming_soon'));
  };

  const handlePrivacy = () => {
    showPopup(t('privacy_security'), t('coming_soon'));
  };

  const handleHelp = () => {
    showPopup(t('help_support'), t('coming_soon'));
  };

  const handlePremium = () => {
    if (isPremium) return;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink('https://t.me/');
      return;
    }
    showPopup(t('premium'), t('premium_upgrade'));
  };

  const handleLogout = () => {
    if (tg?.showPopup) {
      tg.showPopup({
        title: t('log_out'),
        message: t('close_app_prompt'),
        buttons: [
          { id: 'cancel', type: 'cancel', text: t('cancel') },
          { id: 'logout', type: 'destructive', text: t('log_out') },
        ],
      }, (buttonId: string) => {
        if (buttonId === 'logout') {
          tg.close();
        }
      });
      return;
    }
    if (window.confirm(t('close_app_prompt'))) {
      window.close();
    }
  };

  const openAutoTransactions = async () => {
    if (!isPremium) {
      showPopup(t('premium_only_title'), t('premium_only'));
      return;
    }
    onOpenAutoTransactions();
  };

  const settingsSections = [
    {
      title: t('account'),
      items: [
        {
          icon: User,
          label: t('premium'),
          subtitle: isPremium
            ? `${t('premium_expires')}: ${premiumUntil ? new Date(premiumUntil).toLocaleDateString() : '—'}`
            : t('premium_upgrade'),
          action: handlePremium,
          disabled: isPremium,
        },
        {
          icon: RefreshCw,
          label: t('automatic_transactions'),
          subtitle: t('manage_automatic'),
          action: openAutoTransactions,
          disabled: !isPremium,
        },
        { icon: Bell, label: t('notifications'), subtitle: 'Manage notification preferences', action: handleNotifications },
      ],
    },
    {
      title: t('preferences'),
      items: [
        { icon: Palette, label: t('theme'), subtitle: theme === 'dark' ? t('dark') : t('light') },
        { icon: Globe, label: t('language'), subtitle: locale === 'uk' ? 'Українська' : 'English' },
      ],
    },
    {
      title: t('support'),
      items: [
        { icon: HelpCircle, label: t('help_support'), subtitle: 'Get help or contact us', action: handleHelp },
      ],
    },
  ];

  return (
    <div className="screen-pad flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="screen-header safe-top-header bg-white/60 backdrop-blur-xl border-b border-white/40 shadow-sm animate-in fade-in duration-300">
        <div className="screen-header-inner">
          <h1 className="text-lg font-semibold text-gray-900">{t('settings_title')}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* User Profile Card */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] mb-4 flex items-center gap-4 border border-white/40">
          {userPhoto ? (
            <div className="w-16 h-16 rounded-full overflow-hidden shadow-lg shadow-[color:var(--accent-from)]/30">
              <img src={userPhoto} alt={userName} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="w-16 h-16 bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] rounded-full flex items-center justify-center text-2xl text-white shadow-lg shadow-[color:var(--accent-from)]/30">
              👤
            </div>
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{userName}</h3>
            <p className="text-sm text-gray-600">{userHandle || t('telegram_user')}</p>
          </div>
        </div>

        {/* Settings Sections */}
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 px-1">
              {section.title}
            </h3>
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-[var(--surface-shadow)] overflow-hidden border border-white/40">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                const RowTag = item.action ? 'button' : 'div';
                const isDisabled = Boolean((item as any).disabled);
                return (
                  <RowTag
                    key={itemIndex}
                    onClick={item.action}
                    className={`w-full flex items-center gap-3 p-4 transition-all backdrop-blur-sm ${
                      item.action ? 'hover:bg-white/60' : ''
                    } ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''} ${
                      itemIndex !== section.items.length - 1 ? 'border-b border-white/30' : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center shadow-sm">
                      <Icon size={20} className="text-gray-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-600">{item.subtitle}</p>
                    </div>
                    {item.label === t('theme') ? (
                      <div className="flex items-center gap-1 rounded-full bg-white/40 p-1 border border-white/30 opacity-60">
                        <button
                          type="button"
                          disabled
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                            theme === 'light'
                              ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {t('light')}
                        </button>
                        <button
                          type="button"
                          disabled
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                            theme === 'dark'
                              ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          {t('dark')}
                        </button>
                      </div>
                    ) : item.label === t('language') ? (
                      <div className="flex items-center gap-1 rounded-full bg-white/40 p-1 border border-white/30">
                        <button
                          type="button"
                          onClick={() => setLocale('en')}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                            locale === 'en'
                              ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          EN
                        </button>
                        <button
                          type="button"
                          onClick={() => setLocale('uk')}
                          className={`px-3 py-1 text-xs font-medium rounded-full transition-all ${
                            locale === 'uk'
                              ? 'bg-gradient-to-br from-[var(--accent-from)] to-[var(--accent-to)] text-white shadow-sm'
                              : 'text-gray-600 hover:text-gray-900'
                          }`}
                        >
                          UK
                        </button>
                      </div>
                    ) : (
                      <ChevronRight size={20} className="text-gray-400" />
                    )}
                  </RowTag>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[var(--surface-shadow)] flex items-center justify-center gap-2 text-red-500 font-medium hover:bg-white/80 transition-all border border-white/40"
        >
          <LogOut size={20} />
          {t('log_out')}
        </button>

        {/* Version */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Version 0.1.0-mvp
        </p>
      </div>

    </div>
  );
}
