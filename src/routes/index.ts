import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { health } from "../controllers/health.controller.js";
import authRoutes from "./auth.routes.js";
import projectRoutes from "./project.routes.js";
import teamRoutes from "./team.routes.js";
import organizationRoutes from "./organization.routes.js";
import tendersetupRoutes from "./tender-setup.routes.js";
import recordRoutes from "./record.routes.js";
import fileRoutes from "./file.routes.js";
import portalRoutes from "./portal.routes.js";
import tenderRoutes from "./tender.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
const router = Router();
router.get("/health", health);
router.use("/auth", authRoutes);
router.use("/portal", portalRoutes);
router.use(authenticate);
router.use("/projects", projectRoutes);
router.use("/team", teamRoutes);
router.use("/organization", organizationRoutes);
router.use("/tender-setup", tendersetupRoutes);
router.use("/records", recordRoutes);
router.use("/files", fileRoutes);
router.use(tenderRoutes, dashboardRoutes);
router.use((_req, res) =>
  res.status(404).json({ error: "Endpoint not found" }),
);
export default router;
