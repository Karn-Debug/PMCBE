import { Router } from "express";
import * as c from "../controllers/tender-setup.controller.js";
import { managers } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/", c.get);
router.put("/", managers, c.save);
export default router;
