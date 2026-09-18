import { Router, type IRouter, type Response } from "express";
import {
  AddDashboardPageBody,
  AddDashboardWidgetBody,
  CreateDashboardBody,
  ReorderDashboardWidgetsBody,
  UpdateDashboardBody,
  UpdateDashboardWidgetBody,
} from "@workspace/api-zod";
import {
  addPage,
  addWidget,
  createDashboard,
  deleteDashboard,
  deleteWidget,
  duplicateWidget,
  getDashboard,
  listDashboards,
  reorderWidgets,
  updateDashboard,
  updateWidget,
} from "../domain/dashboard/dashboard-service";
import { DashboardError } from "../domain/dashboard/types";

const router: IRouter = Router();

const fail = (res: Response, error: unknown) => {
  if (error instanceof DashboardError) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  throw error;
};

const invalid = (res: Response) => res.status(400).json({ error: "Invalid request body.", code: "INVALID_BODY" });

router.get("/dashboards", async (_req, res) => {
  res.json(await listDashboards());
});

router.post("/dashboards", async (req, res) => {
  const parsed = CreateDashboardBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  return res.status(201).json(await createDashboard(parsed.data));
});

router.get("/dashboards/:dashboardId", async (req, res) => {
  try {
    return res.json(await getDashboard(req.params.dashboardId!));
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/dashboards/:dashboardId", async (req, res) => {
  const parsed = UpdateDashboardBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    return res.json(await updateDashboard(req.params.dashboardId!, parsed.data));
  } catch (error) {
    return fail(res, error);
  }
});

router.delete("/dashboards/:dashboardId", async (req, res) => {
  try {
    await deleteDashboard(req.params.dashboardId!);
    return res.status(204).end();
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/dashboards/:dashboardId/pages", async (req, res) => {
  const parsed = AddDashboardPageBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    return res.json(await addPage(req.params.dashboardId!, parsed.data.name));
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/dashboards/:dashboardId/pages/:pageId/widgets", async (req, res) => {
  const parsed = AddDashboardWidgetBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    return res.json(await addWidget(req.params.dashboardId!, req.params.pageId!, parsed.data as never));
  } catch (error) {
    return fail(res, error);
  }
});

router.put("/dashboards/:dashboardId/pages/:pageId/widgets", async (req, res) => {
  const parsed = ReorderDashboardWidgetsBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    return res.json(await reorderWidgets(req.params.dashboardId!, req.params.pageId!, parsed.data.order));
  } catch (error) {
    return fail(res, error);
  }
});

router.patch("/dashboards/:dashboardId/pages/:pageId/widgets/:widgetId", async (req, res) => {
  const parsed = UpdateDashboardWidgetBody.safeParse(req.body);
  if (!parsed.success) return invalid(res);
  try {
    return res.json(
      await updateWidget(req.params.dashboardId!, req.params.pageId!, req.params.widgetId!, parsed.data as never),
    );
  } catch (error) {
    return fail(res, error);
  }
});

router.delete("/dashboards/:dashboardId/pages/:pageId/widgets/:widgetId", async (req, res) => {
  try {
    return res.json(await deleteWidget(req.params.dashboardId!, req.params.pageId!, req.params.widgetId!));
  } catch (error) {
    return fail(res, error);
  }
});

router.post("/dashboards/:dashboardId/pages/:pageId/widgets/:widgetId/duplicate", async (req, res) => {
  try {
    return res.json(await duplicateWidget(req.params.dashboardId!, req.params.pageId!, req.params.widgetId!));
  } catch (error) {
    return fail(res, error);
  }
});

export default router;
