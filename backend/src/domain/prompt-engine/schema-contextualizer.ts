import { schemaCatalog } from "./catalog";
import type { SchemaContext, SqlDialect } from "./types";

const tokenize = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export function contextualizeSchema(
  question: string,
  dialect: SqlDialect,
  requestedTable?: string,
  search?: string,
): SchemaContext {
  const terms = new Set([...tokenize(question), ...tokenize(search ?? ""), ...tokenize(requestedTable ?? "")]);
  const tables = schemaCatalog
    .map((table) => {
      const searchable = [
        table.name,
        ...table.columns.flatMap((column) => [column.name, column.description, ...column.metrics.sampleValues]),
      ].join(" ");
      const overlap = [...terms].filter((term) => searchable.toLowerCase().includes(term)).length;
      return { ...table, relevance: Math.min(0.99, table.relevance + overlap * 0.04) };
    })
    .sort((a, b) => b.relevance - a.relevance);

  const selected = requestedTable
    ? tables.filter((table) => table.name === requestedTable || table.foreignKeys.some((key) => key.toTable === requestedTable))
    : tables.filter((table) => table.relevance >= 0.68).slice(0, 4);

  const safeTables = selected.length > 0 ? selected : tables.slice(0, 3);
  const tokenEstimate = JSON.stringify(safeTables).length / 4;

  return {
    generatedAt: new Date().toISOString(),
    dialect,
    tokenEstimate: Math.round(tokenEstimate),
    totalTables: schemaCatalog.length,
    selectedTables: safeTables.length,
    tables: safeTables,
  };
}

export function schemaPrompt(context: SchemaContext) {
  return JSON.stringify(
    {
      dialect: context.dialect,
      tables: context.tables.map((table) => ({
        table: table.name,
        rows: table.rowCount,
        columns: table.columns.map((column) => ({
          name: column.name,
          type: column.dataType,
          semantic: column.semanticType,
          metrics: column.metrics,
        })),
        foreign_keys: table.foreignKeys,
      })),
    },
    null,
    2,
  );
}