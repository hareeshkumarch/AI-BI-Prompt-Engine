import { Router } from "express";
import {
  CreateQueryRunBody,
  GetQueryRunParams,
  GetSchemaContextQueryParams,
  RepairQueryRunBody,
  RepairQueryRunParams,
} from "@workspace/api-zod";
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

router.get("/studio/runs", (_req, res) => {
  res.json(listRuns());
});

router.post("/studio/runs", async (req, res) => {
  const parsed = CreateQueryRunBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid query run input.", code: "INVALID_BODY" });
  const run = await executeRun(parsed.data);
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