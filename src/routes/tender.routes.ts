import { Router } from "express";
import * as c from "../controllers/tender.controller.js";
import { managers } from "../middleware/auth.middleware.js";
const router = Router();
router.post("/tenders/:id/invitations", managers, c.invite);
router.post("/quotes/:id/award", managers, c.award);
export default router;
