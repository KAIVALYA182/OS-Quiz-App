// frontend/src/components/QuizAttempt.jsx
// The screen where a student actually takes a quiz: one question at a time,
// a question navigator, a countdown (timed quizzes) or stopwatch (untimed),
// keyboard shortcuts, and submission.
//
// Props:
//   quizId      which quiz to load
//   assignedQuiz optional server-assigned personalised practice
//   onFinished  (result, quiz) => void   called with the scored result
//   onExit      () => void               called when the student quits

import { useCallback, useEffect, useRef, useState } from "react";
import { getQuiz } from "../api/quizApi";
import { submitQuizAnswers } from "../api/scoreApi";
import { useStopwatch } from "../hooks/useStopwatch";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2";
const secondaryButton = `rounded-md border border-control bg-surface px-4 py-2 text-base font-medium text-ink transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-control ${focusRing}`;
const primaryButton = `rounded-md bg-primary px-4 py-2.5 text-base font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;

function formatClock(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuizAttempt({
  quizId,
  assignedQuiz,
  onFinished,
  onExit,
}) {
  const [quiz, setQuiz] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({}); // questionId -> selected option index
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const submittingRef = useRef(false);
  const stopwatchRef = useRef({ getElapsedSeconds: () => 0 });

  const limitSeconds =
    quiz?.isTimed && quiz.timeLimitMinutes ? quiz.timeLimitMinutes * 60 : null;

  // The submit function is called from a timer (on expiry), so it reads the
  // newest state through a ref instead of capturing stale values.
  const latest = useRef({});
  latest.current = { quiz, answers, limitSeconds, onFinished };

  // Reuse the in-flight assignment during StrictMode effect replays and re-renders.
  // Only an explicit retry or a different quiz starts another assignment.
  const assignmentRequest = useRef(null);
  // ------------------------------------------------------------- load quiz
  useEffect(() => {
    let cancelled = false;
    setQuiz(null);
    setLoadError(null);
    if (!assignedQuiz && (assignmentRequest.current?.quizId !== quizId ||
        assignmentRequest.current?.reloadKey !== reloadKey)) {
      assignmentRequest.current = { quizId, reloadKey, promise: getQuiz(quizId) };
    }
    (assignedQuiz ? Promise.resolve(assignedQuiz) : assignmentRequest.current.promise)
      .then((q) => {
        if (!cancelled) setQuiz(q);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, reloadKey, assignedQuiz]);

  // ---------------------------------------------------------------- submit
  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    const { quiz, answers, limitSeconds, onFinished } = latest.current;
    if (!quiz) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setConfirming(false);

    try {
      const result = await submitQuizAnswers(quiz.id, {
        attemptId: quiz.attemptId,
        // Unanswered questions are simply left out; the server scores them as incorrect.
        answers: Object.entries(answers).map(
          ([questionId, selectedOptionIndex]) => ({
            questionId,
            selectedOptionIndex,
          }),
        ),
      });
      onFinished(result, quiz);
    } catch (err) {
      setSubmitError(err.message);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, []);

  const { elapsed, remaining, getElapsedSeconds } = useStopwatch({
    running: Boolean(quiz),
    limitSeconds,
    onExpire: submit,
  });
  stopwatchRef.current = { getElapsedSeconds };

  // --------------------------------------------------------------- answers
  const select = useCallback((questionId, optionIndex) => {
    if (submittingRef.current) return;
    setAnswers((prev) => ({ ...prev, [questionId]: optionIndex }));
  }, []);

  // Warn before the tab is closed or reloaded mid-quiz.
  useEffect(() => {
    if (!quiz) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [quiz]);

  // Keyboard: 1-4 or A-D picks an answer, left/right arrows change question.
  useEffect(() => {
    if (!quiz || quiz.questions.length === 0) return undefined;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || submittingRef.current) return;
      const question = quiz.questions[current];

      if (e.key === "ArrowRight") {
        setCurrent((c) => Math.min(c + 1, quiz.questions.length - 1));
      } else if (e.key === "ArrowLeft") {
        setCurrent((c) => Math.max(c - 1, 0));
      } else if (e.key.length === 1) {
        const digit = parseInt(e.key, 10);
        const index = Number.isInteger(digit)
          ? digit - 1
          : "abcdef".indexOf(e.key.toLowerCase());
        if (index >= 0 && index < question.options.length)
          select(question.id, index);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quiz, current, select]);

  // ---------------------------------------------------------------- render
  if (loadError) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-base text-danger"
      >
        {loadError}{" "}
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="font-medium underline"
        >
          Try again
        </button>{" "}
        ·{" "}
        <button onClick={onExit} className="font-medium underline">
          Back to quizzes
        </button>
      </div>
    );
  }

  if (!quiz) return <p className="text-base text-muted">Loading quiz…</p>;

  const total = quiz.questions.length;
  if (total === 0) {
    return (
      <p className="rounded-md border border-control bg-surface px-4 py-3 text-base text-muted">
        This quiz has no questions yet.{" "}
        <button onClick={onExit} className="font-medium underline">
          Back to quizzes
        </button>
      </p>
    );
  }

  const question = quiz.questions[current];
  const answeredCount = Object.keys(answers).length;
  const unanswered = total - answeredCount;
  const isLast = current === total - 1;

  const timerTone =
    remaining === null
      ? "border-control bg-surface text-ink"
      : remaining <= 60
        ? "border-danger-line bg-danger-soft text-danger"
        : remaining <= 300
          ? "border-warning-line bg-warning-soft text-warning"
          : "border-control bg-surface text-ink";

  const handleExit = () => {
    if (
      answeredCount > 0 &&
      !window.confirm("Leave this quiz? Your answers so far will be lost.")
    )
      return;
    onExit();
  };

  const goToFirstUnanswered = () => {
    const index = quiz.questions.findIndex((q) => answers[q.id] === undefined);
    if (index >= 0) setCurrent(index);
    setConfirming(false);
  };

  return (
    <div>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48">
          <button
            onClick={handleExit}
            className={`text-base text-muted hover:text-ink ${focusRing}`}
          >
            ← Quit
          </button>
          <p className="mt-3 text-xs uppercase tracking-wider text-muted">
            {quiz.topic === "Mixed" ? "Mixed topics" : quiz.topic}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{quiz.title}</h1>
        </div>
        <div
          role="timer"
          className={`shrink-0 rounded-md border px-3 py-1.5 font-mono text-base tabular-nums ${timerTone}`}
        >
          <span className="mr-2 text-xs uppercase tracking-wide">
            {remaining === null ? "Elapsed" : "Left"}
          </span>
          {formatClock(remaining === null ? elapsed : remaining)}
        </div>
      </header>

      {remaining !== null && remaining > 0 && remaining <= 300 && (
        <p
          role="status"
          className={`mt-4 rounded-md border px-4 py-3 ${remaining <= 60 ? "bg-danger-soft text-danger border-danger-line" : "bg-warning-soft text-warning border-warning-line"}`}
        >
          {remaining <= 60
            ? "Less than a minute remaining."
            : "Five minutes or less remaining."}
        </p>
      )}
      <div className="mt-5">
        <p className="font-mono text-xs text-muted">
          {answeredCount}/{total} answered
        </p>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-track">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${(answeredCount / total) * 100}%` }}
          />
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-control bg-surface p-6 sm:p-8">
        <div className="flex items-center justify-between gap-3 text-xs text-muted">
          <span className="font-mono">
            Question {current + 1} of {total}
            {quiz.topic === "Mixed" ? ` · ${question.topic}` : ""}
          </span>
          <span className="capitalize">{question.difficulty}</span>
        </div>

        <h2 className="mt-4 text-lg font-medium leading-relaxed text-ink">
          {question.questionText}
        </h2>

        <div
          role="radiogroup"
          aria-label="Answer options"
          className="mt-6 space-y-2.5"
        >
          {question.options.map((option, i) => {
            const selected = answers[question.id] === i;
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => select(question.id, i)}
                className={`flex w-full items-start gap-3 rounded-md border px-4 py-3 text-left transition-colors ${focusRing} ${
                  selected
                    ? "border-primary bg-surface-muted"
                    : "border-control bg-surface hover:border-primary"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border font-mono text-xs ${
                    selected
                      ? "border-primary bg-primary text-on-primary"
                      : "border-control text-muted"
                  }`}
                >
                  {LETTERS[i]}
                </span>
                <span className="flex-1 text-base leading-relaxed text-ink">
                  {option}
                </span>
                {selected && (
                  <span
                    className="text-primary font-semibold"
                    aria-hidden="true"
                  >
                    ✓<span className="sr-only"> Selected</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          disabled={current === 0}
          onClick={() => setCurrent((c) => c - 1)}
          className={secondaryButton}
        >
          ← Previous
        </button>
        <button
          disabled={isLast}
          onClick={() => setCurrent((c) => c + 1)}
          className={secondaryButton}
        >
          Next →
        </button>
      </div>

      <nav aria-label="Question navigator" className="mt-8">
        <p className="text-xs uppercase tracking-wider text-muted">
          Jump to question
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {quiz.questions.map((q, i) => {
            const done = answers[q.id] !== undefined;
            return (
              <button
                key={q.id}
                onClick={() => setCurrent(i)}
                aria-label={`Question ${i + 1}, ${done ? "answered" : "not answered"}`}
                aria-current={i === current ? "step" : undefined}
                className={`h-11 w-11 rounded border font-mono text-xs transition-colors ${focusRing} ${
                  done
                    ? "border-primary bg-primary text-on-primary"
                    : "border-control bg-surface text-muted hover:border-primary"
                } ${i === current ? "ring-2 ring-focus ring-offset-2" : ""}`}
              >
                {i + 1}
                {done && (
                  <span className="ml-0.5" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {remaining === 0 && (
        <p
          role="status"
          className="mt-6 rounded-md border border-warning-line bg-warning-soft px-4 py-3 text-base text-warning"
        >
          Time's up. Submitting your answers…
        </p>
      )}

      {submitError && (
        <div
          role="alert"
          className="mt-6 rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-base text-danger"
        >
          Couldn't submit: {submitError}{" "}
          <button onClick={submit} className="font-medium underline">
            Try again
          </button>
        </div>
      )}

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm submission"
          className="mt-6 rounded-md border border-warning-line bg-warning-soft p-4"
        >
          <p className="text-base text-warning">
            You have {unanswered} unanswered{" "}
            {unanswered === 1 ? "question" : "questions"}. Unanswered questions
            count as incorrect.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={goToFirstUnanswered} className={secondaryButton}>
              Review unanswered
            </button>
            <button onClick={submit} className={primaryButton}>
              Submit anyway
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => (unanswered > 0 ? setConfirming(true) : submit())}
          disabled={submitting}
          className={`mt-6 w-full ${primaryButton}`}
        >
          {submitting ? "Submitting…" : "Submit quiz"}
        </button>
      )}

      <p className="mt-4 text-center text-xs text-muted">
        Shortcuts: <span className="font-mono">1–4</span> or{" "}
        <span className="font-mono">A–D</span> to answer,{" "}
        <span className="font-mono">←</span>{" "}
        <span className="font-mono">→</span> to move
      </p>
    </div>
  );
}
