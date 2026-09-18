import {
  CATEGORICAL_AGGREGATIONS,
  NUMERIC_AGGREGATIONS,
  currencyFormat,
  datetimeFormat,
  numberFormat,
  percentFormat,
  textFormat,
  type Aggregation,
  type FieldRole,
  type FormatRule,
  type GeographyLevel,
  type Relationship,
  type SemanticField,
  type SemanticModel,
  type SemanticType,
} from "./semantic-model";

export type PhysicalColumn = {
  name: string;
  dataType: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  description: string;
  distinctCount: number;
  rowCount: number;
  nullRate: number;
  min: number | null;
  max: number | null;
  average: number | null;
  sampleValues: string[];
};

export type PhysicalForeignKey = {
  fromColumn: string;
  toTable: string;
  toColumn: string;
};

export type PhysicalTable = {
  name: string;
  rowCount: number;
  columns: PhysicalColumn[];
  primaryKey: string[];
  foreignKeys: PhysicalForeignKey[];
};

export type ColumnClassification = {
  role: FieldRole;
  semanticType: SemanticType;
  defaultAggregation: Aggregation;
  allowedAggregations: Aggregation[];
  format: FormatRule;
  geographyLevel: GeographyLevel | null;
  highCardinality: boolean;
};

const NUMERIC_TYPE = /^(small|big|tiny)?(int|integer|serial|decimal|numeric|real|double|float|money|number)/i;
const TEMPORAL_TYPE = /^(timestamp|timestamptz|datetime|date|time)/i;
const BOOLEAN_TYPE = /^(bool|boolean|bit)$/i;

const CURRENCY_NAME = /(revenue|spend|amount|price|cost|mrr|arr|sales|profit|margin|value|balance|fee|charge)/i;
const PERCENT_NAME = /(rate|pct|percent|percentage|ratio|share)/i;
const DURATION_NAME = /(duration|elapsed|latency|_ms$|_seconds?$|_minutes?$)/i;
const KEY_NAME = /(^|_)(id|ids|key|keys|uuid|guid|code|sku|hash)$/i;
const TEXT_NAME = /(description|comment|notes?|body|message|summary|title|address)/i;

const GEOGRAPHY_NAMES: { pattern: RegExp; level: GeographyLevel }[] = [
  { pattern: /(^|_)(country|nation)(_|$)/i, level: "country" },
  { pattern: /(^|_)(state|province|region)(_|$)/i, level: "state" },
  { pattern: /(^|_)(city|town|municipality)(_|$)/i, level: "city" },
  { pattern: /(^|_)(zip|postal|postcode)(_|$)/i, level: "postal_code" },
  { pattern: /(^|_)(lat|latitude)(_|$)/i, level: "latitude" },
  { pattern: /(^|_)(lon|lng|long|longitude)(_|$)/i, level: "longitude" },
];

const HIGH_CARDINALITY_RATIO = 0.6;

const titleize = (name: string) =>
  name
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();

const synonymsFor = (name: string) => {
  const parts = name.split("_").filter(Boolean);
  const synonyms = new Set<string>([name, name.replaceAll("_", " ")]);
  if (parts.length > 1) synonyms.add(parts[parts.length - 1]!);
  return [...synonyms];
};

function geographyLevelOf(name: string) {
  return GEOGRAPHY_NAMES.find((entry) => entry.pattern.test(name))?.level ?? null;
}

export function classifyColumn(
  column: PhysicalColumn,
  table: PhysicalTable,
  defaultCurrency: string,
): ColumnClassification {
  const isKey =
    column.isPrimaryKey ||
    table.primaryKey.includes(column.name) ||
    table.foreignKeys.some((key) => key.fromColumn === column.name) ||
    (KEY_NAME.test(column.name) && column.distinctCount / Math.max(1, column.rowCount) > 0.9);
  const cardinalityRatio = column.distinctCount / Math.max(1, column.rowCount);
  const highCardinality = cardinalityRatio > HIGH_CARDINALITY_RATIO;

  if (TEMPORAL_TYPE.test(column.dataType)) {
    return {
      role: "TIME_DIMENSION",
      semanticType: /^date$/i.test(column.dataType) ? "date" : "datetime",
      defaultAggregation: "none",
      allowedAggregations: ["min", "max", "count", "count_distinct"],
      format: datetimeFormat(),
      geographyLevel: null,
      highCardinality,
    };
  }

  if (BOOLEAN_TYPE.test(column.dataType)) {
    return {
      role: "BOOLEAN",
      semanticType: "boolean",
      defaultAggregation: "none",
      allowedAggregations: CATEGORICAL_AGGREGATIONS,
      format: textFormat(),
      geographyLevel: null,
      highCardinality: false,
    };
  }

  if (isKey) {
    return {
      role: "IDENTIFIER",
      semanticType: "id",
      defaultAggregation: "none",
      allowedAggregations: ["count", "count_distinct"],
      format: textFormat(),
      geographyLevel: null,
      highCardinality,
    };
  }

  const geographyLevel = geographyLevelOf(column.name);
  if (geographyLevel) {
    return {
      role: "GEOGRAPHY",
      semanticType: "geography",
      defaultAggregation: "none",
      allowedAggregations: CATEGORICAL_AGGREGATIONS,
      format: textFormat(),
      geographyLevel,
      highCardinality,
    };
  }

  if (NUMERIC_TYPE.test(column.dataType)) {
    const semanticType: SemanticType = PERCENT_NAME.test(column.name)
      ? "percent"
      : CURRENCY_NAME.test(column.name)
        ? "currency"
        : DURATION_NAME.test(column.name)
          ? "duration"
          : /^(small|big|tiny)?(int|integer|serial)/i.test(column.dataType)
            ? "integer"
            : "number";
    return {
      role: "MEASURE",
      semanticType,
      defaultAggregation: semanticType === "percent" ? "avg" : "sum",
      allowedAggregations: NUMERIC_AGGREGATIONS,
      format:
        semanticType === "currency"
          ? currencyFormat(defaultCurrency)
          : semanticType === "percent"
            ? percentFormat()
            : numberFormat({ unit: semanticType === "duration" ? "ms" : null }),
      geographyLevel: null,
      highCardinality,
    };
  }

  if (TEXT_NAME.test(column.name) || highCardinality) {
    return {
      role: "TEXT",
      semanticType: "text",
      defaultAggregation: "none",
      allowedAggregations: ["count", "count_distinct"],
      format: textFormat(),
      geographyLevel: null,
      highCardinality,
    };
  }

  return {
    role: "DIMENSION",
    semanticType: "category",
    defaultAggregation: "none",
    allowedAggregations: CATEGORICAL_AGGREGATIONS,
    format: textFormat(),
    geographyLevel: null,
    highCardinality,
  };
}

function toField(column: PhysicalColumn, table: PhysicalTable, defaultCurrency: string): SemanticField {
  const classification = classifyColumn(column, table, defaultCurrency);
  return {
    name: column.name,
    label: titleize(column.name),
    description: column.description,
    table: table.name,
    column: column.name,
    role: classification.role,
    semanticType: classification.semanticType,
    defaultAggregation: classification.defaultAggregation,
    allowedAggregations: classification.allowedAggregations,
    format: classification.format,
    synonyms: synonymsFor(column.name),
    geographyLevel: classification.geographyLevel,
    sensitive: false,
    hidden: classification.role === "IDENTIFIER" && !table.primaryKey.includes(column.name),
  };
}

function relationshipsOf(tables: PhysicalTable[]): Relationship[] {
  return tables.flatMap((table) =>
    table.foreignKeys.map((key) => ({
      fromTable: table.name,
      fromColumn: key.fromColumn,
      toTable: key.toTable,
      toColumn: key.toColumn,
      cardinality: "many_to_one" as const,
    })),
  );
}

function reachableTables(baseTable: string, relationships: Relationship[]): Set<string> {
  const reached = new Set([baseTable]);
  let progress = true;
  while (progress) {
    progress = false;
    for (const relationship of relationships) {
      const forward = reached.has(relationship.fromTable) && !reached.has(relationship.toTable);
      const backward = reached.has(relationship.toTable) && !reached.has(relationship.fromTable);
      if (!forward && !backward) continue;
      reached.add(forward ? relationship.toTable : relationship.fromTable);
      progress = true;
    }
  }
  return reached;
}

const GEO_ORDER: GeographyLevel[] = ["country", "state", "city", "postal_code"];

function inferHierarchies(fields: SemanticField[]) {
  const hierarchies: SemanticModel["hierarchies"] = [];

  const geography = GEO_ORDER.map((level) => fields.find((field) => field.geographyLevel === level))
    .filter((field): field is SemanticField => !!field)
    .map((field) => field.name);
  if (geography.length > 1) {
    hierarchies.push({ name: "geography", label: "Geography", levels: geography });
  }

  for (const field of fields.filter((item) => item.role === "TIME_DIMENSION")) {
    hierarchies.push({
      name: `${field.name}_calendar`,
      label: `${field.label} calendar`,
      levels: [field.name],
    });
  }

  return hierarchies;
}

export function deriveSemanticModel(
  tables: PhysicalTable[],
  options: { id: string; label: string; description?: string; baseTable?: string; defaultCurrency?: string },
): SemanticModel {
  const currency = options.defaultCurrency ?? "USD";
  const baseTable = options.baseTable ?? tables[0]?.name ?? "";
  const relationships = relationshipsOf(tables);
  const reachable = reachableTables(baseTable, relationships);

  // A table with no join path to the base table can never be queried, so its columns stay out of sight.
  const fields = tables
    .flatMap((table) => table.columns.map((column) => toField(column, table, currency)))
    .map((field) => (reachable.has(field.table) ? field : { ...field, hidden: true }));

  const seen = new Set<string>();
  const unique = fields.filter((field) => {
    const key = field.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    id: options.id,
    label: options.label,
    description: options.description ?? "",
    baseTable,
    fields: unique,
    metrics: [],
    hierarchies: inferHierarchies(unique.filter((field) => !field.hidden)),
    relationships,
  };
}
