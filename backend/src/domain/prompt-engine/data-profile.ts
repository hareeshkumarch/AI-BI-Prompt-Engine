export type FieldType =
  | "temporal"
  | "quantitative"
  | "nominal"
  | "ordinal"
  | "boolean"
  | "identifier";

export type FieldRole = "dimension" | "measure" | "key";

export type TemporalGrain = "year" | "quarter" | "month" | "week" | "day" | "hour" | "minute";

export type Monotonicity = "increasing" | "decreasing" | "none";

export type FieldProfile = {
  name: string;
  type: FieldType;
  role: FieldRole;
  nullRate: number;
  distinctCount: number;
  cardinalityRatio: number;
  continuous: boolean;
  monotonic: Monotonicity;
  min: number | null;
  max: number | null;
  sum: number | null;
  temporalGrain: TemporalGrain | null;
  sampleValues: string[];
};

export type DataProfile = {
  rowCount: number;
  fields: FieldProfile[];
  measures: string[];
  dimensions: string[];
  temporal: string[];
  signature: string;
};

const TEMPORAL_PATTERNS: { grain: TemporalGrain; test: RegExp }[] = [
  { grain: "minute", test: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/ },
  { grain: "hour", test: /^\d{4}-\d{2}-\d{2}[T ]\d{2}$/ },
  { grain: "day", test: /^\d{4}-\d{2}-\d{2}$/ },
  { grain: "week", test: /^\d{4}-W\d{1,2}$/i },
  { grain: "quarter", test: /^\d{4}[-\s]?Q[1-4]$/i },
  { grain: "month", test: /^\d{4}-\d{2}$/ },
];

const ORDINAL_VOCABULARIES = [
  ["xs", "s", "m", "l", "xl", "xxl"],
  ["small", "medium", "large"],
  ["low", "medium", "high", "critical"],
  ["free", "starter", "pro", "business", "enterprise"],
  ["bronze", "silver", "gold", "platinum"],
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"],
  ["q1", "q2", "q3", "q4"],
];

const KEY_NAME = /(^|_)(id|ids|key|keys|uuid|guid|code|sku|hash)$/i;
const YEAR_NAME = /(^|_)(year|yr|fy)(_|$)/i;
const ORDINAL_NAME = /(^|_)(tier|bucket|stage|step|grade|level|band|rank|phase|cohort|segment_size)(_|$)/i;
const TIME_PART_NAME = /(^|_)(hour|hr|minute|min|weekday|dayofweek|dow|daypart|month_num|quarter_num|week_num)(_|$)/i;

const isBlank = (value: unknown) => value === null || value === undefined || value === "";

function isBooleanLike(value: unknown) {
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  return /^(true|false|yes|no|y|n)$/i.test(value.trim());
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function temporalGrainOf(value: unknown): TemporalGrain | null {
  if (value instanceof Date) return "day";
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return TEMPORAL_PATTERNS.find((pattern) => pattern.test.test(trimmed))?.grain ?? null;
}

function detectMonotonicity(values: (number | null)[]): Monotonicity {
  const ordered = values.filter((value): value is number => value !== null);
  if (ordered.length < 3) return "none";
  let increasing = true;
  let decreasing = true;
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index]! < ordered[index - 1]!) increasing = false;
    if (ordered[index]! > ordered[index - 1]!) decreasing = false;
  }
  if (increasing && !decreasing) return "increasing";
  if (decreasing && !increasing) return "decreasing";
  return "none";
}

function matchesOrdinalVocabulary(values: string[]) {
  const lowered = values.map((value) => value.trim().toLowerCase());
  return ORDINAL_VOCABULARIES.some((vocabulary) => lowered.every((value) => vocabulary.includes(value)));
}

function classify(name: string, present: unknown[], cardinalityRatio: number) {
  if (present.length === 0) return { type: "nominal" as FieldType, temporalGrain: null };

  if (present.every(isBooleanLike)) return { type: "boolean" as FieldType, temporalGrain: null };

  const grains = present.map(temporalGrainOf);
  if (grains.every((grain) => grain !== null)) {
    const finest = TEMPORAL_PATTERNS.find((pattern) => grains.includes(pattern.grain))?.grain ?? "day";
    return { type: "temporal" as FieldType, temporalGrain: finest };
  }

  const numbers = present.map(toNumber);
  if (numbers.every((value) => value !== null)) {
    const allYears = numbers.every((value) => Number.isInteger(value) && value! >= 1900 && value! <= 2200);
    if (YEAR_NAME.test(name) && allYears) return { type: "temporal" as FieldType, temporalGrain: "year" as TemporalGrain };
    if (KEY_NAME.test(name) && cardinalityRatio > 0.9) return { type: "identifier" as FieldType, temporalGrain: null };
    if (TIME_PART_NAME.test(name)) return { type: "ordinal" as FieldType, temporalGrain: null };
    return { type: "quantitative" as FieldType, temporalGrain: null };
  }

  const strings = present.map((value) => String(value));
  if (KEY_NAME.test(name) && cardinalityRatio > 0.9) return { type: "identifier" as FieldType, temporalGrain: null };
  if (ORDINAL_NAME.test(name) || matchesOrdinalVocabulary(strings)) {
    return { type: "ordinal" as FieldType, temporalGrain: null };
  }
  return { type: "nominal" as FieldType, temporalGrain: null };
}

function roleOf(type: FieldType): FieldRole {
  if (type === "quantitative") return "measure";
  if (type === "identifier") return "key";
  return "dimension";
}

export function profileField(name: string, rows: Record<string, unknown>[]): FieldProfile {
  const raw = rows.map((row) => row[name]);
  const present = raw.filter((value) => !isBlank(value));
  const distinct = new Set(present.map((value) => (value instanceof Date ? value.toISOString() : String(value))));
  const cardinalityRatio = present.length > 0 ? distinct.size / present.length : 0;
  const { type, temporalGrain } = classify(name, present, cardinalityRatio);

  const numbers = type === "quantitative" ? raw.map(toNumber) : [];
  const finite = numbers.filter((value): value is number => value !== null);

  return {
    name,
    type,
    role: roleOf(type),
    nullRate: rows.length > 0 ? (rows.length - present.length) / rows.length : 0,
    distinctCount: distinct.size,
    cardinalityRatio: Number(cardinalityRatio.toFixed(4)),
    continuous: type === "quantitative" && distinct.size > Math.max(10, present.length * 0.6),
    monotonic: type === "quantitative" ? detectMonotonicity(numbers) : "none",
    min: finite.length > 0 ? Math.min(...finite) : null,
    max: finite.length > 0 ? Math.max(...finite) : null,
    sum: finite.length > 0 ? finite.reduce((total, value) => total + value, 0) : null,
    temporalGrain,
    sampleValues: [...distinct].slice(0, 3),
  };
}

function signatureOf(fields: FieldProfile[]) {
  const counts = new Map<string, number>();
  const short: Record<FieldType, string> = {
    temporal: "T",
    quantitative: "Q",
    nominal: "N",
    ordinal: "O",
    boolean: "B",
    identifier: "K",
  };
  for (const field of fields) counts.set(short[field.type], (counts.get(short[field.type]) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([symbol, count]) => `${symbol}${count}`)
    .join("·");
}

export function profileResult(columns: string[], rows: Record<string, unknown>[]): DataProfile {
  const fields = columns.map((column) => profileField(column, rows));
  return {
    rowCount: rows.length,
    fields,
    measures: fields.filter((field) => field.role === "measure").map((field) => field.name),
    dimensions: fields.filter((field) => field.role === "dimension" && field.type !== "temporal").map((field) => field.name),
    temporal: fields.filter((field) => field.type === "temporal").map((field) => field.name),
    signature: signatureOf(fields),
  };
}
