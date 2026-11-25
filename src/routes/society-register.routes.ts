import { Router, type RequestHandler } from "express";
import multer from "multer";
import { HttpError } from "../utils/http-error.js";
import {
  findSociety,
  societyNumber,
} from "../services/atelier-society.service.js";
import { importRegister } from "../services/register-import.service.js";
import * as c from "../controllers/society-register.controller.js";

const router = Router();
const limit = 4 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: limit, files: 8, fields: 1, fieldSize: 128 * 1024 },
});
function multipart(handler: RequestHandler): RequestHandler {
  return (req, res, next) =>
    handler(req, res, (error: unknown) => {
      if (error instanceof multer.MulterError)
        return next(
          new HttpError(
            400,
            error.code === "LIMIT_FILE_SIZE"
              ? "Choose files up to 4 MB."
              : "Invalid upload fields or too many files.",
          ),
        );
      if (error) return next(error);
      if (
        Array.isArray(req.files) &&
        req.files.reduce((n, f) => n + f.size, 0) > limit
      )
        return next(
          new HttpError(
            413,
            "Meeting attachments must total 4 MB or less per save.",
          ),
        );
      next();
    });
}
const one = multipart(upload.single("file")),
  many = multipart(upload.array("attachments", 8));
const scope: RequestHandler = async (req, res, next) => {
  const society = await findSociety(
    res.locals.atelier.workspaceId,
    societyNumber(req.params.id),
  );
  res.locals.societyNumber = society.number;
  next();
};
const ingest: RequestHandler = async (req, res) => {
  if (!req.file)
    throw new HttpError(400, "Choose an Excel workbook or PDF list.");
  res.json(
    await importRegister(
      res.locals.atelier,
      res.locals.societyNumber,
      req.file,
    ),
  );
};
router.get("/registers", c.portfolio);
router.post("/societies/import", one, ingest);
const premises = Router();
premises
  .get("/", c.listPremises)
  .post("/", c.savePremises)
  .post("/import", one, ingest);
premises
  .route("/:recordId")
  .get(c.getPremises)
  .put(c.savePremises)
  .delete(c.removePremises);
router.use("/societies/:id/premises", scope, premises);
const documents = Router();
documents.get("/", c.listDocuments).post("/", one, c.saveDocument);
documents
  .route("/:recordId")
  .get(c.getDocument)
  .put(one, c.saveDocument)
  .delete(c.removeDocument);
documents.get("/:recordId/file", c.documentFile);
router.use("/societies/:id/documents", scope, documents);
const meetings = Router();
meetings.get("/", c.listMeetings).post("/", many, c.saveMeeting);
meetings
  .route("/:recordId")
  .get(c.getMeeting)
  .put(many, c.saveMeeting)
  .delete(c.removeMeeting);
meetings.get("/:recordId/files/:fileId", c.meetingFile);
router.use("/societies/:id/meetings", scope, meetings);
export default router;
