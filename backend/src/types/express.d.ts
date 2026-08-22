import type { RoleName } from "../generated/prisma/client";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      user?: {
        id: string;
        email: string;
        fullName: string;
        role: RoleName;
      };
      sessionId?: string;
    }
  }
}

export {};
