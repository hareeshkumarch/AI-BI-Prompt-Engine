import { Router } from "express";
import {
  CreateQueryRunBody,
  GetQueryRunParams,
  GetSchemaContextQueryParams,
  RepairQueryRunBody,
  GetFilterValuesBody,
  RunExploreQueryBody,
} from "@workspace/api-zod";
import { describeModel, ExploreError, runExploreQuery } from "../domain/semantic/explore-service";
import { getFilterValues } from "../domain/semantic/filter-values-service";
import { executionErrorStatus } from "../domain/execution/query-service";
import { QueryExecutionError } from "../domain/execution/types";
import { QueryCompileError } from "../domain/semantic/query-plan";
import {
  executeRun,
  getConnections,
  getContext,
  getOverview,
  getRun,
  listRuns,
  repairRun,
} from "../domain/prompt-engine/orchestrator";

const router = Router();

router.get("/studio/overview", (_req, res) => {
  res.json(getOverview());
});

router.get("/studio/connections", (_req, res) => {
  res.json(getConnections());
});

router.get("/studio/schema-context", (req, res) => {
  const parsed = GetSchemaContextQueryParams.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid schema context parameters.", code: "INVALID_QUERY" });
  const { search, table } = parsed.data;
  return res.json(getContext("", "postgresql", table, search));
});

router.get("/studio/model", (_req, res) => {
  res.json(describeModel());
});

router.post("/studio/query", async (req, res) => {
  const parsed = RunExploreQueryBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query selection.", code: "INVALID_BODY" });

  const controller = new AbortController();
  req.on("close", () => { if (!res.writableEnded) controller.abort(); });

  try {
    const result = await runExploreQuery(parsed.data as never, { signal: controller.signal });
    return res.json(result);
  } catch (error) {
    if (error instanceof ExploreError) {
      return res.status(400).json({ error: error.message, code: error.code, issues: error.issues });
    }
    if (error instanceof QueryCompileError) {
      return res.status(400).json({ error: error.message, code: error.code });
    }
    if (error instanceof QueryExecutionError) {
      return res.status(executionErrorStatus(error)).json({ error: error.message, code: error.code });
    }
    throw error;
  }
});

router.post("/studio/filter-values", async (req, res) => {
  const parsed = GetFilterValuesBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid filter values request.", code: "INVALID_BODY" });

  const controller = new AbortController();
  req.on("close", () => { if (!res.writableEnded) controller.abort(); });

  try {
    return res.json(await getFilterValues(parsed.data as never, { signal: controller.signal }));
  } catch (error) {
    if (error instanceof ExploreError) return res.status(400).json({ error: error.message, code: error.code });
    if (error instanceof QueryCompileError) return res.status(400).json({ error: error.message, code: error.code });
    if (error instanceof QueryExecutionError) return res.status(executionErrorStatus(error)).json({ error: error.message, code: error.code });
    throw error;
  }
});

router.get("/studio/runs", (_req, res) => {
  res.json(listRuns());
});

router.post("/studio/runs", async (req, res) => {
  const parsed = CreateQueryRunBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query run input.", code: "INVALID_BODY" });
  const controller = new AbortController();
  req.on("close", () => { if (!res.writableEnded) controller.abort(); });
  const run = await executeRun(parsed.data, parsed.data.question, undefined, controller.signal);
  return res.status(201).json(run);
});

router.get("/studio/runs/:runId", (req, res) => {
  const parsed = GetQueryRunParams.safeParse(req.params);
  if (!parsed.success) return res.status(400).json({ error: "Invalid run id.", code: "INVALID_PARAMS" });
  const run = getRun(parsed.data.runId);
  if (!run) return res.status(404).json({ error: "Run not found.", code: "NOT_FOUND" });
  return res.json(run);
});

router.post("/studio/runs/:runId/repair", async (req, res) => {
  const params = GetQueryRunParams.safeParse(req.params);
  const body = RepairQueryRunBody.safeParse(req.body);
  if (!params.success || !body.success) return res.status(400).json({ error: "Invalid repair request.", code: "INVALID_BODY" });
  const run = await repairRun(params.data.runId, body.data);
  if (!run) return res.status(404).json({ error: "Run not found.", code: "NOT_FOUND" });
  return res.json(run);
});

export default router;