// frontend/src/components/ReviewList.jsx
// After submitting: every question with the student's answer, the correct
// answer, and the explanation. Defaults to showing only the mistakes.
//
// Props: review = result.review from POST /api/quiz/:quizId/submit

import { useState } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function statusOf(item) {
  if (item.isCorrect) return { label: "Correct", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" };
  if (item.selectedOptionIndex === -1) return { label: "Unanswered", tone: "bg-slate-100 text-slate-700 border-slate-200" };
  return { label: "Incorrect", tone: "bg-rose-50 text-rose-800 border-rose-200" };
}

export default function ReviewList({ review = [] }) {
  const wrongCount = review.filter((r) => !r.isCorrect).length;
  const [filter, setFilter] = useState(wrongCount > 0 ? "incorrect" : "all");

  if (review.length === 0) return null;

  const items = review
    .map((item, i) => ({ ...item, number: i + 1 }))
    .filter((item) => filter === "all" || !item.isCorrect);

  const tabClass = (active) =>
    `rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2 ${
      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-slate-500"
    }`;

  return (
    <section aria-label="Answer review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Review your answers</h2>
        <div className="flex gap-2" role="group" aria-label="Filter answers">
          <button className={tabClass(filter === "incorrect")} aria-pressed={filter === "incorrect"} onClick={() => setFilter("incorrect")}>
            Needs review ({wrongCount})
          </button>
          <button className={tabClass(filter === "all")} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All ({review.length})
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Nothing to review — every answer was correct.
        </p>
      )}

      <ol className="mt-4 space-y-4">
        {items.map((item) => {
          const status = statusOf(item);
          return (
            <li key={item.questionId} className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                <span className="font-mono">
                  Question {item.number} · {item.topic}
                </span>
                <span className={`rounded border px-2 py-0.5 font-medium ${status.tone}`}>{status.label}</span>
              </div>

              <p className="mt-3 text-[15px] font-medium leading-relaxed text-slate-900">{item.questionText}</p>

              <ul className="mt-4 space-y-2">
                {item.options.map((option, i) => {
                  const isCorrect = i === item.correctOptionIndex;
                  const isPicked = i === item.selectedOptionIndex;
                  const tone = isCorrect
                    ? "border-emerald-300 bg-emerald-50"
                    : isPicked
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-white";
                  return (
                    <li key={i} className={`flex items-start gap-3 rounded-md border px-3 py-2 ${tone}`}>
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-slate-300 bg-white font-mono text-xs text-slate-600">
                        {LETTERS[i]}
                      </span>
                      <span className="flex-1 text-sm leading-relaxed text-slate-800">{option}</span>
                      {isCorrect && <span className="shrink-0 text-xs font-medium text-emerald-800">Correct answer</span>}
                      {isPicked && !isCorrect && <span className="shrink-0 text-xs font-medium text-rose-800">Your answer</span>}
                    </li>
                  );
                })}
              </ul>

              {item.explanation && (
                <p className="mt-4 rounded-md bg-slate-50 px-3 py-2.5 text-sm leading-relaxed text-slate-700">
                  <span className="font-medium text-slate-900">Why: </span>
                  {item.explanation}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
