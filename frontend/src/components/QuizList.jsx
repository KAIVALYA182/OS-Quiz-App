// frontend/src/components/QuizList.jsx
// Home screen: the fixed-size timed mock, then random topic assignments.

import { useCallback, useEffect, useState } from "react";
import { listQuizzes } from "../api/quizApi";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2";

export default function QuizList({ onStart }) {
  const [quizzes, setQuizzes] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    setQuizzes(null);
    listQuizzes()
      .then(setQuizzes)
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-md border border-danger-line bg-danger-soft px-4 py-3 text-base text-danger"
      >
        {error}{" "}
        <button onClick={load} className="font-medium underline">
          Try again
        </button>
      </div>
    );
  }

  if (!quizzes) return <p className="text-base text-muted">Loading quizzes…</p>;

  if (quizzes.length === 0) {
    return (
      <p className="rounded-md border border-line bg-surface px-4 py-3 text-base text-muted">
        No quizzes are available yet. Please try again later.
      </p>
    );
  }

  const mockTests = quizzes.filter((q) => q.topic === "Mixed");
  const topicQuizzes = quizzes.filter((q) => q.topic !== "Mixed");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">
        OS Concepts Quiz
      </h1>
      <p className="mt-2 max-w-prose text-base leading-relaxed text-muted">
        Try a fresh random topic selection, or take the full timed mock test. When you
        finish, every answer is explained.
      </p>

      {mockTests.map((quiz) => (
        <button
          key={quiz.id}
          onClick={() => onStart(quiz.id)}
          className={`mt-8 block w-full rounded-lg bg-primary p-6 text-left text-on-primary transition-colors hover:bg-primary-hover ${focusRing}`}
        >
          <span className="font-mono text-xs uppercase tracking-wider text-on-primary-muted">
            Timed
          </span>
          <span className="mt-2 block text-xl font-semibold">{quiz.title}</span>
          <span className="mt-1 block text-base text-on-primary-muted">
            {quiz.questionCount} questions · {quiz.timeLimitMinutes} minute
            timer
          </span>
          <span className="mt-5 inline-block rounded-md bg-surface px-4 py-2 text-base font-medium text-ink">
            Start mock test
          </span>
        </button>
      ))}

      <h2 className="mt-10 text-base font-medium text-muted">
        Practice by topic
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {topicQuizzes.map((quiz, i) => (
          <button
            key={quiz.id}
            onClick={() => onStart(quiz.id)}
            className={`group flex flex-col rounded-lg border border-line bg-surface p-5 text-left transition-colors hover:border-primary ${focusRing}`}
          >
            <span className="font-mono text-xs text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="mt-2 text-base font-medium text-ink">
              {quiz.topic}
            </span>
            <span className="mt-1 text-base text-muted">
              {quiz.questionCount} random questions · {quiz.poolSize}-question pool
              {quiz.isTimed ? ` · ${quiz.timeLimitMinutes} min` : ""}
            </span>
            <span className="mt-4 text-base font-medium text-ink group-hover:underline">
              Start quiz →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
