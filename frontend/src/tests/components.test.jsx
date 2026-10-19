import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import Auth from "../components/Auth";
import QuizAttempt from "../components/QuizAttempt";
import { Learning, Leaderboard } from "../components/PersonalPages";
import { request, clearSessionState } from "../api/client";
vi.mock("../api/client", () => ({
  request: vi.fn(),
  clearSessionState: vi.fn(),
}));
beforeEach(() => {
  request.mockReset();
  clearSessionState.mockClear();
});
it("checks the session before protected content renders", async () => {
  let resolve;
  request.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<App />);
  expect(screen.getByText("Checking your session…")).toBeTruthy();
  expect(screen.queryByText("My Progress")).toBeNull();
  await act(async () => resolve({ user: null }));
  expect(await screen.findByText("Welcome back")).toBeTruthy();
});
it("registration supports password visibility and catches mismatched confirmation inline", async () => {
  const user = userEvent.setup();
  render(<Auth onAuthenticated={vi.fn()} />);
  await user.click(screen.getByRole("button", { name: "Create an account" }));
  await user.type(screen.getByLabelText("Name"), "New Student");
  await user.type(screen.getByLabelText("Username"), "student");
  await user.type(screen.getByLabelText("Email"), "student@example.com");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "a secure password",
  );
  await user.type(
    screen.getByLabelText("Confirm password"),
    "another secure password",
  );
  expect(screen.getByLabelText("Password", { exact: true }).type).toBe(
    "password",
  );
  await user.click(screen.getByRole("button", { name: "Show passwords" }));
  expect(screen.getByLabelText("Password", { exact: true }).type).toBe("text");
  await user.click(
    screen.getByRole("button", { name: "Register", exact: true }),
  );
  expect(screen.getByRole("alert").textContent).toBe("Passwords do not match.");
  expect(request).not.toHaveBeenCalled();
});
it("login disables requests while waiting and displays the generic error", async () => {
  const user = userEvent.setup();
  let reject;
  request.mockImplementation(
    () =>
      new Promise((r, j) => {
        reject = j;
      }),
  );
  render(<Auth onAuthenticated={vi.fn()} />);
  await user.type(screen.getByLabelText("Username"), "student");
  await user.type(screen.getByLabelText("Password"), "wrong password");
  await user.click(screen.getByRole("button", { name: "Log in", exact: true }));
  expect(screen.getByRole("button", { name: "Please wait…" }).disabled).toBe(
    true,
  );
  await act(async () => reject(new Error("Invalid username or password")));
  expect(screen.getByRole("alert").textContent).toBe(
    "Invalid username or password",
  );
});
it("logout and account change ignore a previous accounts late progress response", async () => {
  const user = userEvent.setup();
  let resolveProgress;
  request.mockImplementation((path) => {
    if (path === "/auth/me")
      return Promise.resolve({ user: { id: "alice", name: "Alice" } });
    if (path === "/quiz") return Promise.resolve([]);
    if (path === "/progress")
      return new Promise((r) => {
        resolveProgress = r;
      });
    if (path === "/auth/logout") return Promise.resolve({ ok: true });
    if (path === "/auth/login")
      return Promise.resolve({ user: { id: "bob", name: "Bob" } });
    throw new Error(path);
  });
  render(<App />);
  await screen.findByText("Alice");
  await user.click(screen.getByRole("button", { name: "My Progress" }));
  await waitFor(() => expect(resolveProgress).toBeTypeOf("function"));
  await user.click(screen.getByRole("button", { name: "Logout" }));
  await screen.findByText("Welcome back");
  await user.type(screen.getByLabelText("Username"), "bob");
  await user.type(screen.getByLabelText("Password"), "valid password");
  await user.click(screen.getByRole("button", { name: "Log in", exact: true }));
  await screen.findByText("Bob");
  await act(async () =>
    resolveProgress({
      summary: { total: 99, average: 100, best: 100 },
      standard: { total: 99, average: 100, best: 100 },
      history: [
        {
          id: "private",
          title: "ALICE PRIVATE HISTORY",
          date: new Date().toISOString(),
        },
      ],
    }),
  );
  expect(screen.queryByText("ALICE PRIVATE HISTORY")).toBeNull();
  expect(screen.queryByText("Alice")).toBeNull();
  expect(clearSessionState).toHaveBeenCalledTimes(2);
});
it("session expiry returns to login and clears account state", async () => {
  request.mockImplementation((path) =>
    path === "/auth/me"
      ? Promise.resolve({ user: { id: "alice", name: "Alice" } })
      : Promise.resolve([]),
  );
  render(<App />);
  await screen.findByText("Alice");
  act(() => window.dispatchEvent(new Event("session-expired")));
  expect(await screen.findByText("Welcome back")).toBeTruthy();
  expect(screen.queryByText("Alice")).toBeNull();
  expect(clearSessionState).toHaveBeenCalled();
});
it("new learners get evidence-aware topics and an existing diagnostic recommendation", async () => {
  request.mockResolvedValue({
    suggestedQuiz: { id: "diagnostic", title: "Operating System Basics quiz" },
    topics: [
      {
        topic: "Operating System Basics",
        status: "Not enough data",
        answered: 0,
        correct: 0,
        incorrect: 0,
        accuracy: null,
        recentAccuracy: null,
        lastPractice: null,
      },
    ],
  });
  render(<Learning onPractice={vi.fn()} onQuizzes={vi.fn()} />);
  expect(
    await screen.findByText(/Start with Operating System Basics quiz/),
  ).toBeTruthy();
  expect(
    screen.getByText(/Operating System Basics · Not enough data/),
  ).toBeTruthy();
});
it("quiz submission sends only the server assignment and chosen answers", async () => {
  const user = userEvent.setup(),
    finished = vi.fn();
  request.mockImplementation((path) =>
    Promise.resolve(
      path.endsWith("/start")
        ? {
            id: "quiz-1",
            attemptId: "assigned-1",
            title: "Existing quiz",
            topic: "CPU Scheduling",
            isTimed: false,
            questions: [
              {
                id: "q1",
                topic: "CPU Scheduling",
                difficulty: "easy",
                questionText: "Existing question?",
                options: ["A", "B"],
              },
            ],
          }
        : { resultId: "saved", scorePercentage: 100, review: [] },
    ),
  );
  render(
    <QuizAttempt quizId="quiz-1" onFinished={finished} onExit={vi.fn()} />,
  );
  await screen.findByText("Existing question?");
  await user.click(screen.getByRole("radio", { name: "AA", exact: true }));
  await user.click(screen.getByRole("button", { name: "Submit quiz" }));
  await waitFor(() => expect(finished).toHaveBeenCalled());
  const submit = request.mock.calls.find(([path]) => path.endsWith("/submit"));
  const body = JSON.parse(submit[1].body);
  expect(body).toEqual({
    attemptId: "assigned-1",
    answers: [{ questionId: "q1", selectedOptionIndex: 0 }],
  });
});
it("leaderboard displays the current rank, public rows and empty pagination correctly", async () => {
  request.mockImplementation((path) =>
    Promise.resolve(
      path === "/quiz"
        ? [{ id: "quiz-1", title: "CPU Scheduling" }]
        : {
            rows: [
              { username: "alice", score: 80, rank: 1, isCurrentUser: true },
            ],
            currentUser: { rank: 1, score: 80 },
            total: 1,
            pageSize: 20,
          },
    ),
  );
  render(<Leaderboard />);
  expect(await screen.findByText("alice (you)")).toBeTruthy();
  expect(screen.getByText("Your rank: 1 · 80%")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next →" }).disabled).toBe(true);
});
