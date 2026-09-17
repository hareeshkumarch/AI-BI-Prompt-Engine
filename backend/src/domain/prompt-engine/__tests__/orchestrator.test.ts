import { describe, expect, it } from "vitest";
import { executeRun, getOverview, getRun, listRuns, repairRun } from "../orchestrator";
import type { QueryRunInput } from "../types";

const baseInput: QueryRunInput = {
  question: "Revenue by month",
  connectionId: "warehouse-demo",
  mode: "analyst",
};

describe("executeRun", () => {
  it("completes a bounded run and synthesizes an insight", async () => {
    const run = await executeRun(baseInput);
    expect(run.status).toBe("completed");
    expect(run.sql).toMatch(/limit\s+\d+/i);
    expect(run.insight?.chartType).toBe("line");
    expect(run.result?.rowCount).toBeGreaterThan(0);
    expect(run.stages.find((stage) => stage.id === "validate")?.status).toBe("completed");
    expect(getRun(run.id)).toEqual(run);
  });

  it("skips synthesis in sql_only mode", async () => {
    const run = await executeRun({ ...baseInput, mode: "sql_only" });
    expect(run.insight).toBeNull();
    expect(run.stages.find((stage) => stage.id === "synthesize")?.status).toBe("skipped");
  });

  it("asks for clarification when the question has no resolvable metric", async () => {
    const run = await executeRun({ ...baseInput, question: "What about the thing?" });
    expect(run.status).toBe("clarification_needed");
    expect(run.clarification).toBeTruthy();
    expect(run.sql).toBe("");
    expect(run.stages.slice(2).every((stage) => stage.status === "skipped")).toBe(true);
  });

  it("generates and executes against the connected engine's dialect", async () => {
    const run = await executeRun(baseInput);
    expect(run.dialect).toBe("duckdb");
    expect(run.sql).toContain("DATE_TRUNC");
    expect(run.status).toBe("completed");
  });

  it("returns real aggregated rows rather than a canned fixture", async () => {
    const run = await executeRun({ ...baseInput, question: "Top customers by spend" });
    expect(run.status).toBe("completed");
    expect(run.result?.rowCount).toBe(5);
    expect(run.result?.columns).toEqual(["company_name", "total_spend"]);
    expect(new Set(run.result?.rows.map((row) => row["company_name"])).size).toBe(5);
    expect(run.stages.find((item) => item.id === "execute")?.detail).toMatch(/Aggregated on duckdb/);
  });

});

describe("repairRun", () => {
  it("replaces the original run in place instead of storing a duplicate", async () => {
    const original = await executeRun(baseInput);
    const before = listRuns().length;

    const repaired = await repairRun(original.id, { instruction: "Use the last complete month." });

    expect(repaired?.id).toBe(original.id);
    expect(listRuns()).toHaveLength(before);
    expect(repaired?.question).toContain("Use the last complete month.");
    expect(repaired?.stages.find((stage) => stage.id === "repair")?.status).toBe("completed");
    expect(getRun(original.id)?.question).toBe(repaired?.question);
  });

  it("returns undefined for an unknown run", async () => {
    expect(await repairRun("missing", { instruction: "anything" })).toBeUndefined();
  });
});

describe("getOverview", () => {
  it("summarizes the catalog and recorded runs", async () => {
    await executeRun(baseInput);
    const overview = getOverview();
    expect(overview.tableCount).toBeGreaterThan(0);
    expect(overview.columnCount).toBeGreaterThan(overview.tableCount);
    expect(overview.queryCount).toBe(listRuns().length);
    expect(overview.recentRuns.length).toBeLessThanOrEqual(4);
    expect(overview.successRate).toBeGreaterThan(0);
  });
});
