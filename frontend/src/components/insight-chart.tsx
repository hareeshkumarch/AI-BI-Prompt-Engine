import { useMemo, useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList,
  Legend, Line, LineChart, Pie, PieChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis,
  Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, Treemap,
  XAxis, YAxis, ZAxis, type TooltipProps,
} from 'recharts';
import type { ChartEncoding, QueryResult } from '@workspace/api-client-react';

const SERIES_SLOTS = 8;
const RAMP_STEPS = 5;
const LABEL_KEY = '__label';
const CHART_MARGIN = { top: 8, right: 12, bottom: 0, left: 0 };

const GRID = 'var(--viz-grid)';
const LABEL = 'var(--viz-label)';
const SURFACE = 'var(--viz-surface)';

const seriesColor = (index: number) => `var(--series-${(index % SERIES_SLOTS) + 1})`;
const rampStep = (position: number) =>
  Math.min(RAMP_STEPS, Math.max(1, Math.round(position * (RAMP_STEPS - 1)) + 1));
const rampColor = (position: number) => `var(--ramp-${rampStep(position)})`;
const rampInk = (position: number) => `var(--ramp-${rampStep(position)}-ink)`;

const humanize = (value: string) => value.replaceAll('_', ' ');

const compact = (value: number) =>
  Math.abs(value) >= 1000
    ? new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
    : String(Number(value.toFixed(2)));

const numberOf = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

type Shaped = { data: Record<string, unknown>[]; keys: string[] };

export function shape(encoding: ChartEncoding, result: QueryResult): Shaped {
  const xField = encoding.x?.field ?? '';

  if (encoding.series) {
    const seriesField = encoding.series.field;
    const measure = encoding.y[0]?.field ?? '';
    const keys: string[] = [];
    const buckets = new Map<string, Record<string, unknown>>();
    for (const row of result.rows) {
      const label = String(row[xField] ?? '');
      const key = String(row[seriesField] ?? '');
      if (!keys.includes(key)) keys.push(key);
      const bucket = buckets.get(label) ?? { [LABEL_KEY]: label };
      bucket[key] = numberOf(row[measure]);
      buckets.set(label, bucket);
    }
    return { data: [...buckets.values()], keys };
  }

  const keys = encoding.y.map((ref) => ref.field);
  const data = result.rows.map((row) => ({
    [LABEL_KEY]: String(row[xField] ?? ''),
    ...Object.fromEntries(keys.map((key) => [key, numberOf(row[key])])),
  }));
  return { data, keys };
}

export function normalize({ data, keys }: Shaped): Shaped {
  return {
    keys,
    data: data.map((row) => {
      const total = keys.reduce((sum, key) => sum + numberOf(row[key]), 0) || 1;
      return { ...row, ...Object.fromEntries(keys.map((key) => [key, (numberOf(row[key]) / total) * 100])) };
    }),
  };
}

export function bin(values: number[], buckets = 10) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / buckets || 1;
  const counts = Array.from({ length: buckets }, (_, index) => ({
    [LABEL_KEY]: `${compact(min + width * index)}–${compact(min + width * (index + 1))}`,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(buckets - 1, Math.floor((value - min) / width));
    counts[index]!.count += 1;
  }
  return counts;
}

function ChartTooltip({ active, payload, label, suffix = '' }: TooltipProps<number, string> & { suffix?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-sm border border-border bg-popover px-3 py-2 shadow-md">
      {label !== undefined && label !== '' && (
        <p className="text-[11px] font-semibold text-popover-foreground">{String(label)}</p>
      )}
      {payload.map((entry) => (
        <p key={String(entry.name)} className="mono mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-block size-2 rounded-[2px]" style={{ background: String(entry.color) }} />
          {humanize(String(entry.name ?? ''))}: {Number(entry.value ?? 0).toLocaleString()}{suffix}
        </p>
      ))}
    </div>
  );
}

const gridAxes = (categoryLabel: string, valueFormatter: (value: number) => string, horizontal: boolean, normalized = false) =>
  horizontal
    ? [
        <CartesianGrid key="grid" stroke={GRID} strokeDasharray="0" horizontal={false} />,
        <XAxis key="x" type="number" tickFormatter={valueFormatter} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={false} domain={normalized ? [0, 100] : undefined} ticks={normalized ? [0, 25, 50, 75, 100] : undefined} />,
        <YAxis key="y" type="category" dataKey={LABEL_KEY} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} width={108} interval={0} />,
      ]
    : [
        <CartesianGrid key="grid" stroke={GRID} strokeDasharray="0" vertical={false} />,
        <XAxis key="x" dataKey={LABEL_KEY} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={8} name={categoryLabel} />,
        <YAxis key="y" tickFormatter={valueFormatter} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={false} width={46} domain={normalized ? [0, 100] : undefined} ticks={normalized ? [0, 25, 50, 75, 100] : undefined} />,
      ];

const legend = (keys: string[]) =>
  keys.length > 1
    ? [<Legend key="legend" verticalAlign="bottom" height={24} iconType="square" iconSize={9} formatter={(value: string) => <span className="text-[10px] text-muted-foreground">{humanize(value)}</span>} />]
    : [];

export function InsightChart({ encoding, result, height = 224 }: { encoding: ChartEncoding; result: QueryResult; height?: number }) {
  const shaped = useMemo(() => shape(encoding, result), [encoding, result]);
  const { chartType, stack } = encoding;

  if (result.rows.length === 0) {
    return <div className="grid place-items-center text-xs text-muted-foreground" style={{ height }}>No rows to visualize.</div>;
  }

  if (chartType === 'kpi') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 text-center sm:flex-row sm:gap-10" style={{ height }} data-testid="insight-kpi">
        {encoding.y.map((ref) => (
          <div key={ref.field}>
            <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">{humanize(ref.field)}</p>
            <p className="font-display text-4xl font-extrabold tracking-[-.05em] text-foreground">{numberOf(result.rows[0]?.[ref.field]).toLocaleString()}</p>
          </div>
        ))}
      </div>
    );
  }

  if (chartType === 'table') {
    return <div className="grid place-items-center px-4 text-center text-xs text-muted-foreground" style={{ height }}>This result reads as a table — see the result preview.</div>;
  }

  const categoryLabel = humanize(encoding.x?.field ?? '');
  const normalized = stack === 'normalized';
  const view = normalized ? normalize(shaped) : shaped;
  const valueFormatter = normalized ? (value: number) => `${Math.round(value)}%` : compact;
  const tooltip = <Tooltip key="tip" content={<ChartTooltip suffix={normalized ? '%' : ''} />} cursor={{ stroke: GRID, fill: 'hsl(var(--muted) / .45)' }} />;

  const frame = (chart: React.ReactElement) => (
    <div style={{ height }} className="w-full" data-testid={`insight-chart-${chartType}`} aria-label={`${chartType} of ${encoding.y.map((ref) => humanize(ref.field)).join(', ')} by ${categoryLabel}`}>
      <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
    </div>
  );

  if (chartType === 'histogram') {
    const bins = bin(result.rows.map((row) => numberOf(row[encoding.x?.field ?? ''])));
    return frame(
      <BarChart data={bins} margin={CHART_MARGIN} barCategoryGap="8%">
        {gridAxes(categoryLabel, compact, false)}
        {tooltip}
        <Bar dataKey="count" fill={seriesColor(0)} radius={[4, 4, 0, 0]} />
      </BarChart>,
    );
  }

  if (chartType === 'scatter' || chartType === 'bubble') {
    const xField = encoding.x?.field ?? '';
    const yField = encoding.y[0]?.field ?? '';
    const sizeField = encoding.size?.field;
    const points = result.rows.map((row) => ({
      x: numberOf(row[xField]),
      y: numberOf(row[yField]),
      z: sizeField ? numberOf(row[sizeField]) : 1,
    }));
    return frame(
      <ScatterChart margin={{ ...CHART_MARGIN, bottom: 8 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="0" />
        <XAxis type="number" dataKey="x" name={humanize(xField)} tickFormatter={compact} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis type="number" dataKey="y" name={humanize(yField)} tickFormatter={compact} tick={{ fill: LABEL, fontSize: 10 }} tickLine={false} axisLine={false} width={46} />
        {sizeField && <ZAxis type="number" dataKey="z" range={[40, 420]} name={humanize(sizeField)} />}
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: GRID, strokeDasharray: '0' }} />
        <Scatter data={points} fill={seriesColor(0)} fillOpacity={0.75} stroke={SURFACE} strokeWidth={2} />
      </ScatterChart>,
    );
  }

  if (chartType === 'pie' || chartType === 'donut') {
    const measure = encoding.y[0]?.field ?? '';
    const slices = result.rows.map((row) => ({ name: String(row[encoding.x?.field ?? ''] ?? ''), value: numberOf(row[measure]) }));
    return frame(
      <PieChart margin={CHART_MARGIN}>
        <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="46%" startAngle={90} endAngle={-270} innerRadius={chartType === 'donut' ? '48%' : 0} outerRadius="76%" paddingAngle={1} stroke={SURFACE} strokeWidth={2} isAnimationActive={false}>
          {slices.map((slice, index) => <Cell key={slice.name} fill={seriesColor(index)} />)}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        {legend(slices.map((slice) => slice.name))}
      </PieChart>,
    );
  }

  if (chartType === 'treemap') {
    const measure = encoding.y[0]?.field ?? '';
    const tiles = result.rows.map((row) => ({ name: String(row[encoding.x?.field ?? ''] ?? ''), size: numberOf(row[measure]) }));
    const peak = Math.max(...tiles.map((tile) => tile.size), 1);
    return frame(
      <Treemap data={tiles} dataKey="size" stroke={SURFACE} isAnimationActive={false} content={<TreemapTile peak={peak} />}>
        <Tooltip content={<ChartTooltip />} />
      </Treemap>,
    );
  }

  if (chartType === 'funnel') {
    const measure = encoding.y[0]?.field ?? '';
    const stages = result.rows.map((row, index) => ({
      name: humanize(String(row[encoding.x?.field ?? ''] ?? '')),
      value: numberOf(row[measure]),
      fill: rampColor(1 - index / Math.max(1, result.rows.length - 1)),
    }));
    return frame(
      <FunnelChart margin={{ top: 8, right: 108, bottom: 8, left: 8 }}>
        <Tooltip content={<ChartTooltip />} />
        <Funnel dataKey="value" data={stages} isAnimationActive={false} stroke={SURFACE} strokeWidth={2}>
          <LabelList position="right" dataKey="name" fill={LABEL} stroke="none" style={{ fontSize: 10 }} />
        </Funnel>
      </FunnelChart>,
    );
  }

  if (chartType === 'radar') {
    return frame(
      <RadarChart data={view.data} margin={CHART_MARGIN}>
        <PolarGrid stroke={GRID} />
        <PolarAngleAxis dataKey={LABEL_KEY} tick={{ fill: LABEL, fontSize: 10 }} />
        <PolarRadiusAxis tick={false} axisLine={false} />
        <Tooltip content={<ChartTooltip />} />
        {view.keys.map((key, index) => (
          <Radar key={key} dataKey={key} name={key} stroke={seriesColor(index)} strokeWidth={2} fill={seriesColor(index)} fillOpacity={0.14} />
        ))}
        {legend(view.keys)}
      </RadarChart>,
    );
  }

  if (chartType === 'heatmap') {
    return <HeatmapGrid encoding={encoding} result={result} height={height} />;
  }

  if (chartType === 'line' || chartType === 'multi_line') {
    return frame(
      <LineChart data={view.data} margin={CHART_MARGIN}>
        {gridAxes(categoryLabel, valueFormatter, false, normalized)}
        {tooltip}
        {view.keys.map((key, index) => (
          <Line key={key} type="monotone" dataKey={key} name={key} stroke={seriesColor(index)} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }} />
        ))}
        {legend(view.keys)}
      </LineChart>,
    );
  }

  if (chartType === 'area' || chartType === 'stacked_area') {
    return frame(
      <AreaChart data={view.data} margin={CHART_MARGIN}>
        {gridAxes(categoryLabel, valueFormatter, false, normalized)}
        {tooltip}
        {view.keys.map((key, index) => (
          <Area key={key} type="monotone" dataKey={key} name={key} stackId={stack === 'none' ? undefined : 'stack'} stroke={seriesColor(index)} strokeWidth={2} fill={seriesColor(index)} fillOpacity={view.keys.length > 1 ? 0.55 : 0.12} activeDot={{ r: 4, strokeWidth: 2, stroke: SURFACE }} />
        ))}
        {legend(view.keys)}
      </AreaChart>,
    );
  }

  const horizontal = encoding.orientation === 'horizontal';
  const stackId = stack === 'none' ? undefined : 'stack';
  return frame(
    <BarChart data={view.data} layout={horizontal ? 'vertical' : 'horizontal'} margin={CHART_MARGIN} barCategoryGap="22%">
      {gridAxes(categoryLabel, valueFormatter, horizontal, normalized)}
      {tooltip}
      {view.keys.map((key, index) => (
        <Bar key={key} dataKey={key} name={key} stackId={stackId} fill={seriesColor(index)} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
      ))}
      {legend(view.keys)}
    </BarChart>,
  );
}

type TileProps = { x?: number; y?: number; width?: number; height?: number; name?: string; size?: number; peak: number };

function TreemapTile({ x = 0, y = 0, width = 0, height = 0, name = '', size = 0, peak }: TileProps) {
  const readable = width > 56 && height > 26;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={3} fill={rampColor(size / peak)} stroke={SURFACE} strokeWidth={2} />
      {readable && (
        <text x={x + 8} y={y + 18} fill={rampInk(size / peak)} fontSize={10} className="mono">
          {name.length > 16 ? `${name.slice(0, 15)}…` : name}
        </text>
      )}
    </g>
  );
}

function HeatmapGrid({ encoding, result, height }: { encoding: ChartEncoding; result: QueryResult; height: number }) {
  const xField = encoding.x?.field ?? '';
  const yField = encoding.series?.field ?? '';
  const measure = encoding.y[0]?.field ?? '';
  const columns = [...new Set(result.rows.map((row) => String(row[xField] ?? '')))];
  const rows = [...new Set(result.rows.map((row) => String(row[yField] ?? '')))];
  const lookup = new Map(result.rows.map((row) => [`${row[xField]}|${row[yField]}`, numberOf(row[measure])]));
  const peak = Math.max(...[...lookup.values()], 1);

  return (
    <div className="overflow-auto" style={{ maxHeight: height }} data-testid="insight-chart-heatmap" aria-label={`${humanize(measure)} by ${humanize(xField)} and ${humanize(yField)}`}>
      <table className="w-full border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {columns.map((column) => <th key={column} className="pb-1 mono text-[9px] font-normal text-muted-foreground">{column}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th className="pr-2 text-right mono text-[9px] font-normal text-muted-foreground">{row}</th>
              {columns.map((column) => {
                const value = lookup.get(`${column}|${row}`);
                return (
                  <td key={column} className="h-7 rounded-[3px] text-center mono text-[9px]" style={{ background: value === undefined ? 'hsl(var(--muted))' : rampColor(value / peak), color: value === undefined ? 'hsl(var(--muted-foreground))' : rampInk(value / peak) }} title={`${column} · ${row}: ${value?.toLocaleString() ?? 'no data'}`}>
                    {value === undefined ? '' : compact(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartSwitcher({ options, active, onSelect }: { options: ChartEncoding[]; active: string; onSelect: (encoding: ChartEncoding) => void }) {
  if (options.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chart type">
      {options.map((option) => (
        <button
          key={option.chartType}
          type="button"
          onClick={() => onSelect(option)}
          title={option.rationale}
          aria-pressed={option.chartType === active}
          className={`rounded-sm border px-2 py-1 text-[10px] font-medium transition-colors ${option.chartType === active ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground'}`}
          data-testid={`button-chart-${option.chartType}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function useChartSelection(encoding: ChartEncoding, alternatives: ChartEncoding[]) {
  const options = useMemo(() => {
    const seen = new Set<string>();
    return [encoding, ...alternatives].filter((item) => !seen.has(item.chartType) && seen.add(item.chartType));
  }, [encoding, alternatives]);
  const [selected, setSelected] = useState<ChartEncoding | null>(null);
  const active = options.find((option) => option.chartType === selected?.chartType) ?? options[0]!;
  return { options, active, select: setSelected };
}
