import { Router } from "express";
import * as c from "../controllers/record.controller.js";
import { upload } from "../controllers/file.controller.js";
import { uploadMiddleware } from "../middleware/upload.middleware.js";
import { managers, writers } from "../middleware/auth.middleware.js";
const router = Router();
router.get("/:module", c.list);
router.get("/:module/:id", c.detail);
router.post("/:module", writers, c.create);
router.put("/:module/:id", writers, c.update);
router.post("/:module/:id/archive", managers, c.archive);
router.post("/:module/:id/restore", managers, c.restore);
router.post("/:module/:id/comments", writers, c.comment);
router.post("/:module/:id/payments", managers, c.payment);
router.post(
  "/:module/:id/files",
  writers,
  uploadMiddleware.single("file"),
  upload,
);
export default router;
