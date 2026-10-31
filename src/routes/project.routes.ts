import { Router } from "express";
import * as c from "../controllers/project.controller.js";
import { managers } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/", c.list);
router.post("/", managers, c.create);
router.put("/:id", managers, c.update);
export default router;
