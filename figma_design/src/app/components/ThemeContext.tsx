import { createContext, useContext, useEffect, useState } from 'react';

type ThemeName = 'light' | 'dark';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>('light');

  const setTheme = (_next: ThemeName) => {
    setThemeState('light');
    window.localStorage.setItem('theme', 'light');
  };

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    window.localStorage.setItem('theme', 'light');
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
