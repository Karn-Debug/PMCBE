import { Router } from "express";
import * as c from "../controllers/team.controller.js";
import { authorize } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/", c.list);
router.post("/", authorize("OWNER"), c.create);
router.patch("/:id", authorize("OWNER"), c.update);
export default router;
