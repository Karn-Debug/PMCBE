import { Router } from "express";
import * as c from "../controllers/organization.controller.js";
import { managers } from "../middleware/auth.middleware.js";
const router = Router();
router.put("/", managers, c.update);
export default router;
