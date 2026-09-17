import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

const MODES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export function ThemeToggle({ tone = 'default' }: { tone?: 'default' | 'sidebar' }) {
  const { theme, setTheme } = useTheme();
  const active = theme ?? 'system';
  const base = tone === 'sidebar' ? 'border-sidebar-border' : 'border-border';

  return (
    <div className={`inline-flex items-center gap-0.5 rounded-sm border ${base} bg-card p-0.5`} role="radiogroup" aria-label="Colour theme">
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const selected = active === mode.value;
        return (
          <button
            key={mode.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${mode.label} theme`}
            title={`${mode.label} theme`}
            onClick={() => setTheme(mode.value)}
            className={`grid size-6 place-items-center rounded-[3px] transition-colors ${selected ? 'bg-primary/12 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            data-testid={`button-theme-${mode.value}`}
          >
            <Icon size={13} />
          </button>
        );
      })}
    </div>
  );
}
