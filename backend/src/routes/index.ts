import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studioRouter from "./studio";
import dashboardRouter from "./dashboards";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studioRouter);
router.use(dashboardRouter);

export default router;
