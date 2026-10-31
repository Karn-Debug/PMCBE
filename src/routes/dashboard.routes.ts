import { Router } from "express";
import * as c from "../controllers/dashboard.controller.js";
const router = Router();
router.get("/dashboard", c.dashboard);
router.get("/activity", c.activity);
export default router;
