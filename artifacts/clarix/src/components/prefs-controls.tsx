import { Check, Languages, Monitor, Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePrefs, type ThemePref } from '@/lib/session';

export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const { language, setLanguage } = usePrefs();
  const next = language === 'ar' ? 'en' : 'ar';
  const label = next === 'ar' ? t('prefs.arabic') : t('prefs.english');
  return (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      onClick={() => setLanguage(next)}
      aria-label={`${t('prefs.language')}: ${label}`}
      title={t('prefs.language')}
      data-testid="button-language"
      className="min-h-11 min-w-11 gap-2"
    >
      <Languages className="size-4" aria-hidden="true" />
      {!compact && (
        <span lang={next} style={next === 'ar' ? { fontFamily: "'IBM Plex Sans Arabic', sans-serif" } : undefined}>
          {label}
        </span>
      )}
    </Button>
  );
}

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenu() {
  const { t } = useTranslation();
  const { theme, resolvedTheme, setTheme } = usePrefs();
  const Current = resolvedTheme === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label={`${t('prefs.theme')}: ${t(`prefs.${theme}`)}`} data-testid="button-theme">
          <Current className="size-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">{t('prefs.theme')}</DropdownMenuLabel>
        {(['light', 'dark', 'system'] as ThemePref[]).map((opt) => {
          const Icon = themeIcons[opt];
          return (
            <DropdownMenuItem
              key={opt}
              onSelect={() => setTheme(opt)}
              data-testid={`option-theme-${opt}`}
              className="gap-2"
              aria-checked={theme === opt}
              role="menuitemradio"
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="flex-1">{t(`prefs.${opt}`)}</span>
              {theme === opt && <Check className="size-4 text-primary" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
