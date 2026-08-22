import { apiFetch } from "./api";

export interface CurrentUser {
  id: string;
  email: string;
  fullName: string;
  role: "USER" | "MERCHANT" | "ADMIN";
  accountStatus: string;
  mfaEnabled: boolean;
}

export function fetchCurrentUser(): Promise<{ user: CurrentUser }> {
  return apiFetch("/auth/me");
}

export function login(email: string, password: string): Promise<{ user: CurrentUser }> {
  return apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout(): Promise<void> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ status: string; message: string }> {
  return apiFetch("/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export interface Wallet {
  id: string;
  balance: string;
  currency: string;
  status: "ACTIVE" | "FROZEN";
}

export interface TransactionParty {
  user: { fullName: string; email: string };
}

export interface WalletTransaction {
  id: string;
  fromWalletId: string | null;
  toWalletId: string | null;
  amount: string;
  currency: string;
  type: "TRANSFER" | "MERCHANT_PAYMENT" | "REFUND" | "TOPUP";
  status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
  description: string | null;
  createdAt: string;
  fromWallet: TransactionParty | null;
  toWallet: TransactionParty | null;
}

export interface Recipient {
  id: string;
  fullName: string;
  email: string;
}

export interface PaymentRequest {
  id: string;
  amount: string;
  status: "PENDING" | "COMPLETED" | "FAILED" | "REFUNDED";
  reference: string | null;
  expiresAt: string;
  transactionId: string | null;
  merchant?: { businessName: string };
}

export function fetchWallet(): Promise<{ wallet: Wallet }> {
  return apiFetch("/wallet");
}

export function addVirtualFunds(amount: string): Promise<{ transactionId: string; balance: string }> {
  return apiFetch("/wallet/top-up", { method: "POST", body: JSON.stringify({ amount }) });
}

export function fetchRecipients(): Promise<{ recipients: Recipient[] }> {
  return apiFetch("/transactions/recipients");
}

export function fetchTransactions(): Promise<{ items: WalletTransaction[]; total: number }> {
  return apiFetch("/transactions?page=1&pageSize=20");
}

export function transferFunds(
  recipientEmail: string,
  amount: string,
  description: string | undefined,
  idempotencyKey: string
): Promise<{ transactionId: string; balance: string; alreadyProcessed: boolean }> {
  return apiFetch("/transactions/transfer", {
    method: "POST",
    body: JSON.stringify({ recipientEmail, amount, description, idempotencyKey }),
  });
}

export function createPaymentRequest(amount: string, reference: string, expiresInMinutes: number): Promise<{ payment: PaymentRequest }> {
  return apiFetch("/merchant/payment-requests", { method: "POST", body: JSON.stringify({ amount, reference, expiresInMinutes }) });
}

export function fetchMerchantPaymentRequests(): Promise<{ items: PaymentRequest[] }> {
  return apiFetch("/merchant/payment-requests?page=1&pageSize=20");
}

export function fetchAvailablePaymentRequests(): Promise<{ payments: PaymentRequest[] }> {
  return apiFetch("/payments/requests");
}

export function payPaymentRequest(id: string, idempotencyKey: string): Promise<{ transactionId: string; balance: string; alreadyProcessed: boolean }> {
  return apiFetch(`/payments/${id}/pay`, { method: "POST", body: JSON.stringify({ idempotencyKey }) });
}

export interface AdminMetrics {
  users: number;
  merchants: number;
  transactions: number;
  failedLogins: number;
  securityEvents: number;
  auditLogs: number;
}

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const [users, merchants, transactions, failedLogins, securityEvents, auditLogs] = await Promise.all([
    apiFetch<{ total: number }>("/admin/users?page=1&pageSize=1"),
    apiFetch<{ total: number }>("/admin/merchants?page=1&pageSize=1"),
    apiFetch<{ total: number }>("/admin/transactions?page=1&pageSize=1"),
    apiFetch<{ total: number }>("/admin/login-attempts?success=false&page=1&pageSize=1"),
    apiFetch<{ total: number }>("/admin/security-events?page=1&pageSize=1"),
    apiFetch<{ total: number }>("/admin/audit-logs?page=1&pageSize=1"),
  ]);
  return { users: users.total, merchants: merchants.total, transactions: transactions.total, failedLogins: failedLogins.total, securityEvents: securityEvents.total, auditLogs: auditLogs.total };
}
