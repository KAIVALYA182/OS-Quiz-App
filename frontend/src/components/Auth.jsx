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
    <label className="block text-sm" key={name}>
      {label}
      <input
        className="mt-1 block w-full rounded border border-slate-300 p-2"
        required
        name={name}
        type={type}
        {...extra}
      />
    </label>
  );
  return (
    <section className="mx-auto max-w-md rounded-lg border bg-white p-6">
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
          className="text-sm underline"
          onClick={() => setShow(!show)}
        >
          {show ? "Hide" : "Show"} passwords
        </button>
        {register && (
          <p className="text-xs text-slate-500">
            Use 12–128 characters. Password spaces are preserved.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
        <button
          disabled={busy}
          className="block w-full rounded bg-slate-900 p-3 text-white disabled:opacity-50"
        >
          {busy ? "Please wait…" : register ? "Register" : "Log in"}
        </button>
      </form>
      <button
        disabled={busy}
        onClick={() => {
          setRegister(!register);
          setError("");
        }}
        className="mt-4 text-sm underline"
      >
        {register ? "Already registered? Log in" : "Create an account"}
      </button>
    </section>
  );
}
