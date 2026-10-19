// frontend/src/components/QuizList.jsx
// Home screen: the timed full mock test up top, then one practice quiz per topic.

import { useCallback, useEffect, useState } from "react";
import { listQuizzes } from "../api/quizApi";

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2";

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
      <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error}{" "}
        <button onClick={load} className="font-medium underline">
          Try again
        </button>
      </div>
    );
  }

  if (!quizzes) return <p className="text-sm text-slate-500">Loading quizzes…</p>;

  if (quizzes.length === 0) {
    return (
      <p className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
        No quizzes are available yet. Please try again later.
      </p>
    );
  }

  const mockTests = quizzes.filter((q) => q.topic === "Mixed");
  const topicQuizzes = quizzes.filter((q) => q.topic !== "Mixed");

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">OS Concepts Quiz</h1>
      <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-slate-600">
        Pick a topic for a short practice quiz, or take the full timed mock test. When you finish, every answer is
        explained.
      </p>

      {mockTests.map((quiz) => (
        <button
          key={quiz.id}
          onClick={() => onStart(quiz.id)}
          className={`mt-8 block w-full rounded-lg bg-slate-900 p-6 text-left text-white transition-colors hover:bg-slate-800 ${focusRing}`}
        >
          <span className="font-mono text-xs uppercase tracking-wider text-slate-400">Timed</span>
          <span className="mt-2 block text-xl font-semibold">{quiz.title}</span>
          <span className="mt-1 block text-sm text-slate-300">
            {quiz.questionCount} questions · {quiz.timeLimitMinutes} minute timer
          </span>
          <span className="mt-5 inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-900">
            Start mock test
          </span>
        </button>
      ))}

      <h2 className="mt-10 text-sm font-medium text-slate-500">Practice by topic</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {topicQuizzes.map((quiz, i) => (
          <button
            key={quiz.id}
            onClick={() => onStart(quiz.id)}
            className={`group flex flex-col rounded-lg border border-slate-200 bg-white p-5 text-left transition-colors hover:border-slate-400 ${focusRing}`}
          >
            <span className="font-mono text-xs text-slate-400">{String(i + 1).padStart(2, "0")}</span>
            <span className="mt-2 text-base font-medium text-slate-900">{quiz.topic}</span>
            <span className="mt-1 text-sm text-slate-500">
              {quiz.questionCount} questions
              {quiz.isTimed ? ` · ${quiz.timeLimitMinutes} min` : ""}
            </span>
            <span className="mt-4 text-sm font-medium text-slate-900 group-hover:underline">Start quiz →</span>
          </button>
        ))}
      </div>
    </div>
  );
}
