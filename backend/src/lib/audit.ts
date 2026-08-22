import { prisma } from "./prisma";
import { Prisma, SecurityEventSeverity } from "../generated/prisma/client";

interface WriteAuditLogParams {
  actorId?: string;
  actorRole?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

/** Every security-relevant action — success, failure, or denial — writes one of these (README §12 req. 9). */
export async function writeAuditLog(params: WriteAuditLogParams): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ipAddress: params.ipAddress,
    },
  });
}

interface WriteSecurityEventParams {
  userId?: string;
  eventType: string;
  severity?: SecurityEventSeverity;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/** Anomalous/suspicious activity (lockouts, blocked logins, etc.) — reviewable on the admin security dashboard. */
export async function writeSecurityEvent(params: WriteSecurityEventParams): Promise<void> {
  await prisma.securityEvent.create({
    data: {
      userId: params.userId,
      eventType: params.eventType,
      severity: params.severity ?? SecurityEventSeverity.LOW,
      details: params.details as Prisma.InputJsonValue | undefined,
      ipAddress: params.ipAddress,
    },
  });
}
