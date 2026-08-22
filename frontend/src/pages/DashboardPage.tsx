import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "../lib/api";
import * as walletApi from "../lib/auth";
import type { PaymentRequest, Recipient, WalletTransaction } from "../lib/auth";

const formatBalance = (balance: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 }).format(Number(balance));

function transactionLabel(transaction: WalletTransaction, currentUserEmail: string): string {
  if (transaction.type === "TOPUP") return "Virtual money added";
  const isOutgoing = transaction.fromWallet?.user.email === currentUserEmail;
  const counterparty = isOutgoing ? transaction.toWallet?.user.fullName : transaction.fromWallet?.user.fullName;
  return `${isOutgoing ? "Sent to" : "Received from"} ${counterparty ?? "wallet"}`;
}

export function DashboardPage() {
  const [balance, setBalance] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [role, setRole] = useState<"USER" | "MERCHANT" | "ADMIN" | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pendingTransfer, setPendingTransfer] = useState<{ recipient: Recipient; amount: string; description: string } | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; recipient: string; amount: string; description: string } | null>(null);
  const [submitting, setSubmitting] = useState<"topup" | "transfer" | null>(null);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequest[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [expiresInMinutes, setExpiresInMinutes] = useState("1440");
  const [pendingPayment, setPendingPayment] = useState<PaymentRequest | null>(null);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("ALL");
  const [adminMetrics, setAdminMetrics] = useState<walletApi.AdminMetrics | null>(null);

  async function refreshWallet() {
    try {
      const [{ wallet }, { items }, { recipients: availableRecipients }, { user }] = await Promise.all([
        walletApi.fetchWallet(), walletApi.fetchTransactions(), walletApi.fetchRecipients(), walletApi.fetchCurrentUser(),
      ]);
      setBalance(wallet.balance); setTransactions(items); setRecipients(availableRecipients); setCurrentUserEmail(user.email); setRole(user.role);
      if (user.role === "MERCHANT") {
        const { items: merchantRequests } = await walletApi.fetchMerchantPaymentRequests();
        setPaymentRequests(merchantRequests);
      } else {
        const { payments } = await walletApi.fetchAvailablePaymentRequests();
        setPaymentRequests(payments);
      }
      if (user.role === "ADMIN") setAdminMetrics(await walletApi.fetchAdminMetrics());
    } catch {
      setError("Unable to load your wallet.");
    }
  }

  useEffect(() => {
    // Defer the initial async fetch so the effect only synchronizes setup;
    // state updates happen after the request settles.
    const timer = window.setTimeout(() => void refreshWallet(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function handleTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setMessage(null); setSubmitting("topup");
    try {
      const result = await walletApi.addVirtualFunds(topUpAmount);
      setBalance(result.balance); setTopUpAmount(""); setMessage("Virtual money added to your wallet.");
      await refreshWallet();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to add virtual money."); }
    finally { setSubmitting(null); }
  }

  function prepareTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setMessage(null);
    const recipient = recipients.find((candidate) => candidate.email === recipientEmail);
    if (!recipient) { setError("Select an active recipient."); return; }
    setPendingTransfer({ recipient, amount: transferAmount, description });
  }

  async function confirmTransfer() {
    if (!pendingTransfer) return;
    setError(null); setSubmitting("transfer");
    try {
      const result = await walletApi.transferFunds(
        pendingTransfer.recipient.email, pendingTransfer.amount, pendingTransfer.description || undefined, crypto.randomUUID()
      );
      setBalance(result.balance); setRecipientEmail(""); setTransferAmount(""); setDescription(""); setPendingTransfer(null);
      setReceipt({ id: result.transactionId, recipient: pendingTransfer.recipient.fullName, amount: pendingTransfer.amount, description: pendingTransfer.description });
      await refreshWallet();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to send money."); }
    finally { setSubmitting(null); }
  }

  async function createPaymentRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null);
    try {
      await walletApi.createPaymentRequest(paymentAmount, paymentReference, Number(expiresInMinutes));
      setPaymentAmount(""); setPaymentReference(""); setMessage("Payment request created."); await refreshWallet();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to create the payment request."); }
  }

  async function confirmPayment() {
    if (!pendingPayment) return;
    setError(null);
    try {
      const result = await walletApi.payPaymentRequest(pendingPayment.id, crypto.randomUUID());
      setBalance(result.balance); setPendingPayment(null); setMessage("Merchant payment completed."); await refreshWallet();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to complete the payment."); }
  }

  function downloadReceipt(transaction: WalletTransaction) {
    const contents = ["SecurePay transaction receipt", `Transaction ID: ${transaction.id}`, `Amount: ${formatBalance(transaction.amount)}`, `Status: ${transaction.status}`, `Date: ${new Date(transaction.createdAt).toLocaleString("en-IN")}`, `Description: ${transaction.description ?? "—"}`].join("\n");
    const url = URL.createObjectURL(new Blob([contents], { type: "text/plain" }));
    const link = document.createElement("a"); link.href = url; link.download = `securepay-receipt-${transaction.id}.txt`; link.click(); URL.revokeObjectURL(url);
  }

  const visibleTransactions = transactions.filter((transaction) => {
    const query = transactionSearch.toLowerCase();
    return (transactionStatus === "ALL" || transaction.status === transactionStatus) && (!query || transaction.id.includes(query) || transaction.description?.toLowerCase().includes(query) || transactionLabel(transaction, currentUserEmail).toLowerCase().includes(query));
  });

  return (
    <section>
      <h1>Wallet Dashboard</h1>
      <div className="stat-card wallet-card">
        <span className="stat-label">Wallet Balance</span>
        <span className="stat-value">{balance === null ? "Loading…" : formatBalance(balance)}</span>
        <div className="wallet-actions"><a href="#add-money" className="button-link">Add Money</a><a href="#send-money" className="button-link button-secondary">Send Money</a></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      {receipt && <section className="receipt" aria-live="polite"><h2>Transfer receipt</h2><p><strong>{formatBalance(receipt.amount)}</strong> sent to {receipt.recipient}.</p><p>Transaction ID: <code>{receipt.id}</code></p>{receipt.description && <p>Description: {receipt.description}</p>}<button type="button" onClick={() => setReceipt(null)}>Dismiss</button></section>}
      {pendingTransfer && <section className="confirmation" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h2 id="confirm-title">Confirm transfer</h2><p>Send <strong>{formatBalance(pendingTransfer.amount)}</strong> to <strong>{pendingTransfer.recipient.fullName}</strong>?</p>{pendingTransfer.description && <p>Description: {pendingTransfer.description}</p>}<div className="wallet-actions"><button type="button" onClick={confirmTransfer} disabled={submitting !== null}>{submitting === "transfer" ? "Sending…" : "Confirm transfer"}</button><button type="button" className="button-secondary" onClick={() => setPendingTransfer(null)} disabled={submitting !== null}>Cancel</button></div></section>}
      <div className="dashboard-grid">
        <article className="panel" id="add-money"><h2>Add virtual money</h2><p>Top up by up to ₹100,000.00 per request.</p><form className="wallet-form" onSubmit={handleTopUp}><label htmlFor="topUpAmount">Amount (₹)</label><input id="topUpAmount" inputMode="decimal" placeholder="2000.00" required value={topUpAmount} onChange={(event) => setTopUpAmount(event.target.value)} /><button type="submit" disabled={submitting !== null}>{submitting === "topup" ? "Adding…" : "Add money"}</button></form></article>
        <article className="panel" id="send-money"><h2>Send money</h2><form className="wallet-form" onSubmit={prepareTransfer}><label htmlFor="recipientEmail">Recipient</label><select id="recipientEmail" required value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)}><option value="">Select a recipient</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.email}>{recipient.fullName} ({recipient.email})</option>)}</select><label htmlFor="transferAmount">Amount (₹)</label><input id="transferAmount" inputMode="decimal" placeholder="500.00" required value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} /><label htmlFor="description">Description (optional)</label><input id="description" maxLength={280} value={description} onChange={(event) => setDescription(event.target.value)} /><button type="submit" disabled={submitting !== null}>Review transfer</button></form></article>
      </div>
      {role === "MERCHANT" && <section className="merchant-panel"><h2>Merchant payment requests</h2><form className="wallet-form" onSubmit={createPaymentRequest}><label htmlFor="paymentAmount">Amount (₹)</label><input id="paymentAmount" inputMode="decimal" required value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /><label htmlFor="paymentReference">Reference</label><input id="paymentReference" maxLength={280} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /><label htmlFor="expiresInMinutes">Expires in (minutes)</label><input id="expiresInMinutes" type="number" min="5" max="10080" required value={expiresInMinutes} onChange={(event) => setExpiresInMinutes(event.target.value)} /><button type="submit">Create payment request</button></form><PaymentRequestList requests={paymentRequests} /></section>}
      {role !== "MERCHANT" && <section className="merchant-panel"><h2>Available merchant payments</h2><PaymentRequestList requests={paymentRequests} onPay={setPendingPayment} /></section>}
      {role === "ADMIN" && adminMetrics && <section className="security-center"><h2>Security Center</h2><div className="security-grid"><Metric label="Users" value={adminMetrics.users} /><Metric label="Merchants" value={adminMetrics.merchants} /><Metric label="Transactions" value={adminMetrics.transactions} /><Metric label="Failed logins" value={adminMetrics.failedLogins} /><Metric label="Security events" value={adminMetrics.securityEvents} /><Metric label="Audit logs" value={adminMetrics.auditLogs} /></div><p>Use the protected admin API to manage users and merchants, freeze accounts, monitor transactions, and review audit/security records.</p></section>}
      {pendingPayment && <section className="confirmation" role="dialog" aria-modal="true"><h2>Confirm merchant payment</h2><p>Pay <strong>{formatBalance(pendingPayment.amount)}</strong> to <strong>{pendingPayment.merchant?.businessName}</strong>?</p>{pendingPayment.reference && <p>Reference: {pendingPayment.reference}</p>}<div className="wallet-actions"><button type="button" onClick={confirmPayment}>Pay now</button><button type="button" className="button-secondary" onClick={() => setPendingPayment(null)}>Cancel</button></div></section>}
      <section className="transaction-history"><h2>Transaction history</h2><div className="transaction-controls"><input aria-label="Search transactions" placeholder="Search transactions" value={transactionSearch} onChange={(event) => setTransactionSearch(event.target.value)} /><select aria-label="Filter transaction status" value={transactionStatus} onChange={(event) => setTransactionStatus(event.target.value)}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option><option value="REVERSED">Reversed</option></select></div>{visibleTransactions.length === 0 ? <p>No matching transactions.</p> : <ul>{visibleTransactions.map((transaction) => <li key={transaction.id}><span>{transactionLabel(transaction, currentUserEmail)}</span><span>{formatBalance(transaction.amount)}</span><span>{transaction.status} · {new Date(transaction.createdAt).toLocaleString("en-IN")}</span>{transaction.description && <span>{transaction.description}</span>}<button type="button" onClick={() => downloadReceipt(transaction)}>Download receipt</button></li>)}</ul>}</section>
    </section>
  );
}

function PaymentRequestList({ requests, onPay }: { requests: PaymentRequest[]; onPay?: (payment: PaymentRequest) => void }) {
  if (requests.length === 0) return <p>No payment requests available.</p>;
  return <ul className="payment-list">{requests.map((payment) => <li key={payment.id}><span><strong>{payment.merchant?.businessName ?? "Payment request"}</strong> · {formatBalance(payment.amount)}</span><span>{payment.status} · Expires {new Date(payment.expiresAt).toLocaleString("en-IN")}</span>{payment.reference && <span>{payment.reference}</span>}{onPay && <button type="button" onClick={() => onPay(payment)}>Review payment</button>}</li>)}</ul>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }
