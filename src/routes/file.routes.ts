import { Router } from "express";
import * as c from "../controllers/file.controller.js";
const router = Router();
router.get("/:id/preview", c.preview);
router.get("/:id", c.download);
export default router;
