import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";

const DEMO_ACCOUNTS = [
  { email: "alice@example.test", role: "USER" },
  { email: "bob@example.test", role: "USER" },
  { email: "charlie@example.test", role: "USER" },
  { email: "demostore@example.test", role: "MERCHANT" },
  { email: "admin@example.test", role: "ADMIN" },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error && <p className="form-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>

      <div className="demo-hint">
        <p>
          This is a shared public demo — there's no real registration. Log in as any seeded account below; every
          account uses the same published password.
        </p>
        <ul>
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <code>{account.email}</code> <span className="demo-role">({account.role})</span>
            </li>
          ))}
        </ul>
        
      </div>
    </section>
  );
}
