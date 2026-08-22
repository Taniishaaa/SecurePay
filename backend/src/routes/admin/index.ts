import { Router } from "express";
import { asyncHandler } from "../../lib/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import { RoleName } from "../../generated/prisma/client";
import { adminUsersRouter } from "./users";
import { adminMerchantsRouter } from "./merchants";
import { adminTransactionsRouter } from "./transactions";
import { adminSecurityRouter } from "./security";

export const adminRouter = Router();

// Every route under /api/admin requires an authenticated ADMIN — deny by default.
adminRouter.use(asyncHandler(requireAuth), requireRole(RoleName.ADMIN));

adminRouter.use("/users", adminUsersRouter);
adminRouter.use("/merchants", adminMerchantsRouter);
adminRouter.use("/transactions", adminTransactionsRouter);
adminRouter.use("/", adminSecurityRouter);
