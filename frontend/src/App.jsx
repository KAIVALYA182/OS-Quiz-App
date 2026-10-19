import { useEffect, useRef, useState } from "react";
import { request, clearSessionState } from "./api/client";
import Auth from "./components/Auth";
import QuizList from "./components/QuizList";
import QuizAttempt from "./components/QuizAttempt";
import ScoreFeedback from "./components/ScoreFeedback";
import ReviewList from "./components/ReviewList";
import { Progress, Learning, Leaderboard } from "./components/PersonalPages";
export default function App() {
  const [user, setUser] = useState(null),
    [checking, setChecking] = useState(true),
    [screen, setScreen] = useState({ name: "home" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const epoch = useRef(0);
  function changeAccount(u) {
    epoch.current++;
    clearSessionState();
    setUser(u);
    setScreen({ name: "home" });
    setError("");
    setBusy(false);
  }
  useEffect(() => {
    let active = true;
    request("/auth/me")
      .then((r) => {
        if (active) setUser(r.user);
      })
      .catch((e) => {
        if (active && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    const expired = () => changeAccount(null);
    window.addEventListener("session-expired", expired);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);
  async function action(fn) {
    const current = epoch.current;
    setBusy(true);
    setError("");
    try {
      await fn(current);
    } catch (e) {
      if (current === epoch.current) setError(e.message);
    } finally {
      if (current === epoch.current) setBusy(false);
    }
  }
  const home = () => {
    setError("");
    setScreen({ name: "home" });
  };
  const accountEpoch = epoch.current;
  const start = (id) =>
    setScreen({ name: "quiz", quizId: id, key: Date.now() });
  let content;
  if (checking) content = <p>Checking your session…</p>;
  else if (!user) content = <Auth onAuthenticated={changeAccount} />;
  else if (screen.name === "quiz")
    content = (
      <QuizAttempt
        key={screen.key}
        quizId={screen.quizId}
        assignedQuiz={screen.assignedQuiz}
        onExit={home}
        onFinished={(result, quiz) => {
          if (accountEpoch === epoch.current)
            setScreen({ name: "result", result, quizTitle: quiz.title });
        }}
      />
    );
  else if (screen.name === "result")
    content = (
      <>
        <p className="mb-3 text-sm text-slate-500">
          {screen.quizTitle} · {screen.result.attemptType}
        </p>
        <ScoreFeedback result={screen.result} onRetry={home} />
        <div className="mt-10">
          <ReviewList review={screen.result.review} />
        </div>
      </>
    );
  else if (screen.name === "progress")
    content = (
      <Progress
        onReview={(id, title) =>
          action(async (current) => {
            const result = await request("/results/" + id);
            if (current === epoch.current)
              setScreen({ name: "result", result, quizTitle: title });
          })
        }
      />
    );
  else if (screen.name === "learning")
    content = (
      <Learning
        onStart={start}
        onQuizzes={home}
        onPractice={() =>
          action(async (current) => {
            const quiz = await request("/practice", {
              method: "POST",
              body: "{}",
            });
            if (current === epoch.current)
              setScreen({
                name: "quiz",
                quizId: quiz.id,
                assignedQuiz: quiz,
                key: quiz.attemptId,
              });
          })
        }
      />
    );
  else if (screen.name === "leaderboard") content = <Leaderboard />;
  else content = <QuizList onStart={start} />;
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <button className="font-mono text-sm font-medium" onClick={home}>
              ■ os-quiz
            </button>
            {user && (
              <span className="text-sm text-slate-500">{user.name}</span>
            )}
          </div>
          {user && (
            <nav
              aria-label="Main navigation"
              className="mt-3 flex flex-wrap gap-4 text-sm"
            >
              {[
                ["home", "Quizzes"],
                ["progress", "My Progress"],
                ["learning", "Personalised Learning"],
                ["leaderboard", "Leaderboard"],
              ].map(([name, label]) => (
                <button
                  disabled={busy}
                  aria-current={screen.name === name ? "page" : undefined}
                  className={
                    screen.name === name ? "font-semibold underline" : ""
                  }
                  key={name}
                  onClick={() => {
                    setError("");
                    setScreen({ name });
                  }}
                >
                  {label}
                </button>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await request("/auth/logout", {
                      method: "POST",
                      body: "{}",
                    });
                    changeAccount(null);
                  })
                }
              >
                Logout
              </button>
            </nav>
          )}
        </div>
      </header>
      <main
        key={user?.id || "anonymous"}
        className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6"
      >
        {error && (
          <p
            role="alert"
            className="mb-4 rounded border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="mb-3 text-sm">
            Loading…
          </p>
        )}
        {content}
      </main>
    </div>
  );
}
