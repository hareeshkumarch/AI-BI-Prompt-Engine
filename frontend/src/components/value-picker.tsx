import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Search } from 'lucide-react';
import { getFilterValues } from '@workspace/api-client-react';
import type { FilterSet, FilterValue } from '@workspace/api-client-react';
import { useDebouncedValue } from '@/components/studio-ui';

const PANEL_WIDTH = 256;

export function ValuePicker({
  field,
  label,
  selected,
  scope,
  multiple,
  onChange,
}: {
  field: string;
  label: string;
  selected: (string | number | boolean)[];
  scope: FilterSet | null;
  multiple: boolean;
  onChange: (values: (string | number | boolean)[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [search, setSearch] = useState('');
  const [values, setValues] = useState<FilterValue[]>([]);
  const [loading, setLoading] = useState(false);
  const [cascadedFrom, setCascadedFrom] = useState<string[]>([]);
  const term = useDebouncedValue(search.trim(), 250);
  const anchor = useRef<HTMLButtonElement>(null);
  const scopeKey = useMemo(() => JSON.stringify(scope ?? {}), [scope]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const controller = new AbortController();
    setLoading(true);

    getFilterValues(
      { field, search: term || undefined, limit: 50, filters: JSON.parse(scopeKey) as FilterSet },
      { signal: controller.signal },
    )
      .then((result) => {
        if (!live) return;
        setValues(result.values);
        setCascadedFrom(result.cascadedFrom);
      })
      .catch(() => { if (live) setValues([]); })
      .finally(() => { if (live) setLoading(false); });

    return () => { live = false; controller.abort(); };
  }, [open, field, term, scopeKey]);

  const toggleOpen = () => {
    const rect = anchor.current?.getBoundingClientRect();
    if (!open && rect) setAlignRight(rect.left + PANEL_WIDTH > document.documentElement.clientWidth - 12);
    setOpen((value) => !value);
  };

  const toggle = (value: string) => {
    if (!multiple) {
      onChange([value]);
      setOpen(false);
      return;
    }
    onChange(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const summary = selected.length === 0
    ? 'Choose…'
    : selected.length === 1
      ? String(selected[0])
      : `${selected.length} selected`;

  return (
    <div className="relative">
      <button
        ref={anchor}
        type="button"
        onClick={toggleOpen}
        aria-expanded={open}
        aria-label={`Values for ${label}`}
        className="flex min-w-[140px] max-w-[220px] items-center gap-1.5 rounded-sm border border-input bg-card px-2 py-1 text-left text-[11px] outline-none transition-colors hover:border-primary/40 focus:border-primary"
        data-testid={`value-picker-${field}`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected.length === 0 ? 'text-muted-foreground' : ''}`}>{summary}</span>
        <ChevronDown size={11} className={`shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <button type="button" className="fixed inset-0 z-40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className={`absolute top-full z-50 mt-1 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-sm border border-border bg-popover shadow-lg ${alignRight ? 'right-0' : 'left-0'}`} data-testid={`value-list-${field}`}>
            <label className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
              <Search size={12} className="shrink-0 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}…`}
                className="w-full bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70"
                data-testid={`value-search-${field}`}
              />
              {loading && <Loader2 size={11} className="shrink-0 animate-spin text-primary" />}
            </label>

            {cascadedFrom.length > 0 && (
              <p className="border-b border-border bg-muted/30 px-2 py-1 text-[9px] text-muted-foreground">
                Narrowed by {cascadedFrom.join(', ')}
              </p>
            )}

            <div className="max-h-52 overflow-y-auto py-0.5">
              {values.length === 0 && !loading && <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">No values.</p>}
              {values.map((item) => {
                const picked = selected.includes(item.value);
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => toggle(item.value)}
                    className={`flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] transition-colors hover:bg-primary/5 ${picked ? 'text-primary' : ''}`}
                    data-testid={`value-option-${field}-${item.value}`}
                  >
                    <span className={`grid size-3 shrink-0 place-items-center rounded-[2px] border ${picked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                      {picked && <Check size={9} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.value}</span>
                    {item.count > 0 && <span className="mono shrink-0 text-[9px] text-muted-foreground">{item.count.toLocaleString()}</span>}
                  </button>
                );
              })}
            </div>

            {multiple && selected.length > 0 && (
              <button type="button" onClick={() => onChange([])} className="w-full border-t border-border px-2 py-1.5 text-[10px] font-semibold text-muted-foreground hover:text-destructive" data-testid={`value-clear-${field}`}>
                Clear {selected.length}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
