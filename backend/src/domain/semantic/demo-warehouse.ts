import { schemaCatalog } from "../prompt-engine/catalog";
import type { SchemaTable } from "../prompt-engine/types";
import { deriveSemanticModel, type PhysicalTable } from "./schema-discovery";
import type { SemanticModel } from "./semantic-model";

function toPhysicalTable(table: SchemaTable): PhysicalTable {
  const foreignKeys = table.foreignKeys.map((key) => ({
    fromColumn: key.fromColumn,
    toTable: key.toTable,
    toColumn: key.toColumn,
  }));
  const foreignColumns = new Set(foreignKeys.map((key) => key.fromColumn));
  const primaryKey = table.columns
    .filter((column) => column.semanticType === "key" && !foreignColumns.has(column.name))
    .slice(0, 1)
    .map((column) => column.name);

  return {
    name: table.name,
    rowCount: table.rowCount,
    primaryKey,
    foreignKeys,
    columns: table.columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      nullable: column.nullable,
      isPrimaryKey: primaryKey.includes(column.name),
      description: column.description,
      distinctCount: column.metrics.cardinality,
      rowCount: table.rowCount,
      nullRate: column.metrics.nullRate,
      min: column.metrics.min,
      max: column.metrics.max,
      average: null,
      sampleValues: column.metrics.sampleValues,
    })),
  };
}

export const demoPhysicalTables: PhysicalTable[] = schemaCatalog.map(toPhysicalTable);

export const demoSemanticModel: SemanticModel = {
  ...deriveSemanticModel(demoPhysicalTables, {
    id: "northstar",
    label: "Northstar revenue warehouse",
    description: "Orders, customers, products, subscriptions and product events.",
    baseTable: "orders",
    defaultCurrency: "USD",
  }),
  metrics: [
    {
      name: "average_order_value",
      label: "Average order value",
      description: "Net revenue divided by order count.",
      expression: `SUM("orders"."net_revenue") / NULLIF(COUNT("orders"."order_id"), 0)`,
      dependsOn: ["net_revenue", "order_id"],
      format: { kind: "currency", decimals: 2, compact: false, currency: "USD", unit: null },
      synonyms: ["aov", "average order value"],
    },
  ],
};
