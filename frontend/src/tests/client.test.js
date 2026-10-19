import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { request, clearSessionState } from "../api/client";
beforeEach(() => {
  clearSessionState();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
const response = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
it("uses credentialed cookies and CSRF headers for state-changing requests", async () => {
  fetch
    .mockResolvedValueOnce(response({ csrfToken: "csrf-value" }))
    .mockResolvedValueOnce(response({ ok: true }));
  await request("/auth/login", { method: "POST", body: "{}" });
  expect(fetch.mock.calls[0][1].credentials).toBe("include");
  expect(fetch.mock.calls[1][1].credentials).toBe("include");
  expect(fetch.mock.calls[1][1].headers["X-CSRF-Token"]).toBe("csrf-value");
});
it("rejects stale data when the authenticated account changes", async () => {
  let resolve;
  fetch.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const pending = request("/progress");
  clearSessionState();
  resolve(response({ private: "old-account-data" }));
  await expect(pending).rejects.toThrow("Account changed.");
});
it("401 on a protected request announces session expiry", async () => {
  const handler = vi.fn();
  window.addEventListener("session-expired", handler);
  fetch.mockResolvedValue(response({ error: "Authentication required." }, 401));
  await expect(request("/progress")).rejects.toThrow(
    "Authentication required.",
  );
  expect(handler).toHaveBeenCalledOnce();
  window.removeEventListener("session-expired", handler);
});
