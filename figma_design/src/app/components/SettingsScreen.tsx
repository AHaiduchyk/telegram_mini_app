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
    <div className="flex flex-col h-full bg-transparent pb-20">
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-xl px-4 py-4 border-b border-white/40 shadow-sm">
        <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4">
        {/* User Profile Card */}
        <div className="bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] mb-4 flex items-center gap-4 border border-white/40">
          <div className="w-16 h-16 bg-gradient-to-br from-[#706fd3] to-[#9c9bc6] rounded-full flex items-center justify-center text-2xl text-white shadow-lg shadow-[#706fd3]/30">
            👤
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Andrii</h3>
            <p className="text-sm text-gray-600">andrii@example.com</p>
          </div>
          <button className="text-[#706fd3] font-medium text-sm">Edit</button>
        </div>

        {/* Settings Sections */}
        {settingsSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3 px-1">
              {section.title}
            </h3>
            <div className="bg-white/60 backdrop-blur-xl rounded-3xl shadow-[0_10px_40px_rgba(112,111,211,0.15)] overflow-hidden border border-white/40">
              {section.items.map((item, itemIndex) => {
                const Icon = item.icon;
                return (
                  <button
                    key={itemIndex}
                    onClick={item.action}
                    className={`w-full flex items-center gap-3 p-4 hover:bg-white/60 transition-all backdrop-blur-sm ${
                      itemIndex !== section.items.length - 1
                        ? 'border-b border-white/30'
                        : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-50 rounded-xl flex items-center justify-center shadow-sm">
                      <Icon size={20} className="text-gray-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-600">{item.subtitle}</p>
                    </div>
                    {item.hasSwitch ? (
                      <div className="w-12 h-7 bg-gray-200 rounded-full relative transition-colors cursor-pointer">
                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-sm"></div>
                      </div>
                    ) : (
                      <ChevronRight size={20} className="text-gray-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Logout Button */}
        <button className="w-full bg-white/60 backdrop-blur-xl rounded-3xl p-4 shadow-[0_10px_40px_rgba(112,111,211,0.15)] flex items-center justify-center gap-2 text-red-500 font-medium hover:bg-white/80 transition-all border border-white/40">
          <LogOut size={20} />
          Log Out
        </button>

        {/* Version */}
        <p className="text-center text-sm text-gray-500 mt-6">
          Version 1.0.0
        </p>
      </div>
    </div>
  );
}
