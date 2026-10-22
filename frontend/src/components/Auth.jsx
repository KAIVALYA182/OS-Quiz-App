import { useState } from "react";
import { request } from "../api/client";
export default function Auth({ onAuthenticated }) {
  const [register, setRegister] = useState(false),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    if (register && data.password !== data.confirmPassword) {
      setError("Passwords do not match.");
      setBusy(false);
      return;
    }
    try {
      const r = await request("/auth/" + (register ? "register" : "login"), {
        method: "POST",
        body: JSON.stringify(data),
      });
      onAuthenticated(r.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (name, label, type = "text", extra = {}) => (
    <label className="block text-base" key={name}>
      {label}
      <input
        className="field mt-2"
        required
        name={name}
        type={type}
        {...extra}
      />
    </label>
  );
  return (
    <section className="panel mx-auto max-w-md">
      <h1 className="text-2xl font-semibold">
        {register ? "Create your account" : "Welcome back"}
      </h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        {register &&
          field("name", "Name", "text", {
            maxLength: 100,
            autoComplete: "name",
          })}
        {field("username", "Username", "text", {
          autoComplete: "username",
          minLength: 3,
          maxLength: 30,
        })}
        {register &&
          field("email", "Email", "email", { autoComplete: "email" })}
        {field("password", "Password", show ? "text" : "password", {
          autoComplete: register ? "new-password" : "current-password",
          minLength: register ? 12 : undefined,
          maxLength: 128,
        })}
        {register &&
          field(
            "confirmPassword",
            "Confirm password",
            show ? "text" : "password",
            { autoComplete: "new-password" },
          )}
        <button
          type="button"
          className="text-base underline"
          onClick={() => setShow(!show)}
        >
          {show ? "Hide" : "Show"} passwords
        </button>
        {register && (
          <p className="text-xs text-muted">
            Use 12–128 characters. Password spaces are preserved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-base text-danger">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn-primary block w-full">
          {busy ? "Please wait…" : register ? "Register" : "Log in"}
        </button>
      </form>
      <button
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setError("");
        }}
        className="mt-4 text-base underline"
      >
        {register ? "Already registered? Log in" : "Create an account"}
      </button>
    </section>
  );
}
