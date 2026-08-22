import { Link } from "react-router-dom";

export function RegisterPage() {
  return (
    <section className="auth-card">
      <h1>Registration isn't available</h1>
      <p>
        SecurePay is a shared public demo with no real-time registration — every account is pre-seeded so everyone
        testing the app starts from the same known state. There's nothing real behind any of it: fake emails, no
        real phone numbers, and no real money.
      </p>
      <p>
        Use one of the seeded demo accounts instead — they're listed on the <Link to="/login">login page</Link>,
        along with the single published demo password.
      </p>
    </section>
  );
}
