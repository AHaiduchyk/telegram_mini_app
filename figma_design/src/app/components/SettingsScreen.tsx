import { ChevronRight, User, Bell, Shield, Moon, Globe, HelpCircle, LogOut } from 'lucide-react';

export function SettingsScreen() {
  const settingsSections = [
    {
      title: 'Account',
      items: [
        { icon: User, label: 'Profile', subtitle: 'Update your personal info', action: () => {} },
        { icon: Bell, label: 'Notifications', subtitle: 'Manage notification preferences', action: () => {} },
        { icon: Shield, label: 'Privacy & Security', subtitle: 'Control your data', action: () => {} },
      ],
    },
    {
      title: 'Preferences',
      items: [
        { icon: Moon, label: 'Dark Mode', subtitle: 'Toggle dark theme', hasSwitch: true, action: () => {} },
        { icon: Globe, label: 'Language', subtitle: 'English', action: () => {} },
      ],
    },
    {
      title: 'Support',
      items: [
        { icon: HelpCircle, label: 'Help & Support', subtitle: 'Get help or contact us', action: () => {} },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-background pb-20">
      {/* Header */}
      <div className="bg-card px-4 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* User Profile Card */}
        <div className="bg-card rounded-2xl p-4 shadow-sm mb-4 flex items-center gap-4">
          <div className="w-16 h-16 bg-[color:var(--brand-purple)] rounded-full flex items-center justify-center text-2xl text-white">
            👤
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Andrii</h3>
            <p className="text-sm text-muted-foreground">andrii@example.com</p>
          </div>
          <button className="text-[color:var(--brand-purple)] font-medium text-sm">Edit</button>
        </div>

        {/* Settings Sections */}
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 px-1">
              {section.title}
            </h3>
            <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <button
                    key={itemIndex}
                    onClick={item.action}
                    className={`w-full flex items-center gap-3 p-4 hover:bg-[color:var(--brand-lavender)] transition-all ${
                      itemIndex !== section.items.length - 1
                        ? 'border-b border-[color:var(--brand-lavender)]'
                        : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-[color:var(--brand-lavender)] rounded-lg flex items-center justify-center">
                      <Icon size={20} className="text-[color:var(--brand-purple-dark)]" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.subtitle}</p>
                    </div>
                    {item.hasSwitch ? (
                      <div className="w-12 h-7 bg-[color:var(--brand-lavender-dark)] rounded-full relative transition-colors cursor-pointer">
                        <div className="absolute left-1 top-1 w-5 h-5 bg-card rounded-full transition-transform"></div>
                      </div>
                    ) : (
                      <ChevronRight size={20} className="text-muted-foreground" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <button className="w-full bg-card rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 text-[color:var(--brand-gold-dark)] font-medium hover:bg-[color:var(--brand-gold)]/10 transition-all">
          <LogOut size={20} />
          Log Out
        </button>

        {/* Version */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Version 1.0.0
        </p>
      </div>
    </div>
  );
}
