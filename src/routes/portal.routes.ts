import { Router } from "express";
import * as c from "../controllers/tender.controller.js";
import { authLimit } from "../middleware/rate-limit.middleware.js";
const router = Router();
router.use(authLimit);
router.get("/:token", c.portal);
router.post("/:token", c.submit);
export default router;
