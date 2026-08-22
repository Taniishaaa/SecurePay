import { AccountStatus } from "../generated/prisma/client";

/** Safe to show once the caller has already proven who they are (post-auth or post-credential-check). */
export function accountStatusMessage(status: AccountStatus): string {
  switch (status) {
    case AccountStatus.PENDING_VERIFICATION:
      return "Your account is pending verification.";
    case AccountStatus.FROZEN:
      return "Your account has been frozen. Contact support.";
    case AccountStatus.SUSPENDED:
      return "Your account has been suspended.";
    case AccountStatus.CLOSED:
      return "This account has been closed.";
    case AccountStatus.ACTIVE:
      return "";
  }
}
