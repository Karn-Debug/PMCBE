import { Router } from "express";
import multer from "multer";
import { HttpError } from "../utils/http-error.js";
import { authLimit } from "../middleware/rate-limit.middleware.js";
import * as auth from "../controllers/atelier-auth.controller.js";
import * as societies from "../controllers/atelier-society.controller.js";
import * as reports from "../controllers/atelier-feasibility.controller.js";
import registerRoutes from "./society-register.routes.js";
import {
  beginReset,
  finishReset,
} from "../controllers/atelier-reset.controller.js";
const router = Router();
const reportFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, fields: 0, files: 1 },
}).single("file");
router.post("/auth/login", authLimit, auth.login);
router.post("/auth/forgot-password", authLimit, beginReset);
router.post("/auth/reset-password", authLimit, finishReset);
router.post("/auth/logout", auth.logout);
router.use(auth.authenticate);
router.use(registerRoutes);
router.get("/auth/me", (_req, res) => res.json(res.locals.atelier));
router.get("/societies", societies.list);
router.post("/societies", societies.create);
router.patch("/societies", societies.update);
router.get("/societies/:id", societies.get);
const path = "/societies/:id/feasibility";
router.get(path, reports.list);
router.get(path + "/workbook", reports.download);
router.post(
  path,
  (req, res, next) =>
    reportFile(req, res, (error) =>
      next(
        error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE"
          ? new HttpError(
              413,
              "Choose an Excel workbook or PDF of 4 MB or less.",
            )
          : error,
      ),
    ),
  reports.upload,
);
router.get(path + "/:revision", reports.get);
router.patch(path + "/:revision/remarks", reports.remarks);
router.use((_req, res) =>
  res.status(404).json({ error: "Endpoint not found." }),
);
export default router;
