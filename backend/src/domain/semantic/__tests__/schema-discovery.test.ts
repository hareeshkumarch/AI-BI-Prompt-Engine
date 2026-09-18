import { describe, expect, it } from "vitest";
import { demoSemanticModel } from "../demo-warehouse";
import { classifyColumn, deriveSemanticModel, type PhysicalColumn, type PhysicalTable } from "../schema-discovery";
import { dimensionsOf, drillTarget, geographyFieldsOf, measuresOf, searchFields, timeDimensionsOf } from "../semantic-model";

const column = (over: Partial<PhysicalColumn> & Pick<PhysicalColumn, "name" | "dataType">): PhysicalColumn => ({
  nullable: false,
  isPrimaryKey: false,
  description: "",
  distinctCount: 10,
  rowCount: 100,
  nullRate: 0,
  min: null,
  max: null,
  average: null,
  sampleValues: [],
  ...over,
});

const table = (columns: PhysicalColumn[], over: Partial<PhysicalTable> = {}): PhysicalTable => ({
  name: "t",
  rowCount: 100,
  columns,
  primaryKey: [],
  foreignKeys: [],
  ...over,
});

const classify = (col: PhysicalColumn, tbl = table([col])) => classifyColumn(col, tbl, "USD");

describe("classifyColumn", () => {
  it("types timestamps as time dimensions", () => {
    expect(classify(column({ name: "created_at", dataType: "timestamp" })).role).toBe("TIME_DIMENSION");
    expect(classify(column({ name: "order_day", dataType: "date" })).semanticType).toBe("date");
  });

  it("types currency-named numerics as currency measures that SUM by default", () => {
    const result = classify(column({ name: "total_amount", dataType: "numeric(12,2)" }));
    expect(result.role).toBe("MEASURE");
    expect(result.semanticType).toBe("currency");
    expect(result.defaultAggregation).toBe("sum");
    expect(result.format.currency).toBe("USD");
  });

  it("averages percentage measures rather than summing them", () => {
    const result = classify(column({ name: "conversion_rate", dataType: "numeric" }));
    expect(result.semanticType).toBe("percent");
    expect(result.defaultAggregation).toBe("avg");
  });

  it("recognizes geography columns and their level", () => {
    expect(classify(column({ name: "country", dataType: "varchar" })).role).toBe("GEOGRAPHY");
    expect(classify(column({ name: "billing_city", dataType: "varchar" })).geographyLevel).toBe("city");
  });

  it("treats keys and foreign keys as identifiers, never measures", () => {
    const pk = column({ name: "order_id", dataType: "bigint", isPrimaryKey: true });
    expect(classify(pk, table([pk], { primaryKey: ["order_id"] })).role).toBe("IDENTIFIER");
    const fk = column({ name: "customer_id", dataType: "bigint" });
    const withFk = table([fk], { foreignKeys: [{ fromColumn: "customer_id", toTable: "customers", toColumn: "customer_id" }] });
    expect(classify(fk, withFk).role).toBe("IDENTIFIER");
  });

  it("separates low-cardinality categories from free text", () => {
    expect(classify(column({ name: "segment", dataType: "varchar", distinctCount: 3 })).role).toBe("DIMENSION");
    expect(classify(column({ name: "company_name", dataType: "varchar", distinctCount: 98 })).role).toBe("TEXT");
    expect(classify(column({ name: "notes", dataType: "text", distinctCount: 4 })).role).toBe("TEXT");
  });

  it("types booleans", () => {
    expect(classify(column({ name: "is_active", dataType: "boolean" })).role).toBe("BOOLEAN");
  });
});

describe("deriveSemanticModel", () => {
  it("carries foreign keys through as relationships", () => {
    const model = deriveSemanticModel(
      [
        table([column({ name: "id", dataType: "bigint" }), column({ name: "customer_id", dataType: "bigint" })], {
          name: "orders",
          primaryKey: ["id"],
          foreignKeys: [{ fromColumn: "customer_id", toTable: "customers", toColumn: "customer_id" }],
        }),
      ],
      { id: "m", label: "M" },
    );
    expect(model.relationships).toEqual([
      { fromTable: "orders", fromColumn: "customer_id", toTable: "customers", toColumn: "customer_id", cardinality: "many_to_one" },
    ]);
  });

  it("hides fields on tables that cannot be joined to the base table", () => {
    const model = deriveSemanticModel(
      [
        table([column({ name: "order_id", dataType: "bigint" }), column({ name: "customer_id", dataType: "bigint" })], {
          name: "orders",
          primaryKey: ["order_id"],
          foreignKeys: [{ fromColumn: "customer_id", toTable: "customers", toColumn: "customer_id" }],
        }),
        table([column({ name: "segment", dataType: "varchar" })], { name: "customers" }),
        table([column({ name: "category", dataType: "varchar" })], { name: "products" }),
      ],
      { id: "m", label: "M", baseTable: "orders" },
    );
    expect(dimensionsOf(model).map((field) => field.name)).toContain("segment");
    expect(dimensionsOf(model).map((field) => field.name)).not.toContain("category");
    expect(model.fields.find((field) => field.name === "category")?.hidden).toBe(true);
  });

  it("builds a geography hierarchy when the levels are present", () => {
    const model = deriveSemanticModel(
      [table([
        column({ name: "country", dataType: "varchar" }),
        column({ name: "state", dataType: "varchar" }),
        column({ name: "city", dataType: "varchar" }),
      ])],
      { id: "m", label: "M" },
    );
    expect(model.hierarchies.find((item) => item.name === "geography")?.levels).toEqual(["country", "state", "city"]);
    expect(drillTarget(model, "country", "down")).toBe("state");
    expect(drillTarget(model, "city", "up")).toBe("state");
    expect(drillTarget(model, "city", "down")).toBeUndefined();
  });
});

describe("the demo warehouse model", () => {
  it("classifies the demo catalog into usable roles", () => {
    expect(measuresOf(demoSemanticModel).map((field) => field.name)).toContain("net_revenue");
    expect(measuresOf(demoSemanticModel).map((field) => field.name)).toContain("mrr");
    expect(timeDimensionsOf(demoSemanticModel).map((field) => field.name)).toContain("ordered_at");
    expect(dimensionsOf(demoSemanticModel).map((field) => field.name)).toContain("status");
    expect(measuresOf(demoSemanticModel).map((field) => field.name)).not.toContain("order_id");
    expect(geographyFieldsOf(demoSemanticModel)).toEqual([]);
  });

  it("finds fields by synonym and business name", () => {
    expect(searchFields(demoSemanticModel, "revenue").map((field) => field.name)).toContain("net_revenue");
    expect(searchFields(demoSemanticModel, "Company Name").map((field) => field.name)).toContain("company_name");
  });
});
