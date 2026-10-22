// frontend/src/components/ReviewList.jsx
// After submitting: every question with the student's answer, the correct
// answer, and the explanation. Defaults to showing only the mistakes.
//
// Props: review = result.review from POST /api/quiz/:quizId/submit

import { useState } from "react";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

function statusOf(item) {
  if (item.isCorrect)
    return {
      label: "Correct",
      tone: "bg-success-soft text-success border-success-line",
    };
  if (item.selectedOptionIndex === -1)
    return {
      label: "Unanswered",
      tone: "bg-surface-muted text-ink border-line",
    };
  return {
    label: "Incorrect",
    tone: "bg-danger-soft text-danger border-danger-line",
  };
}

export default function ReviewList({ review = [] }) {
  const wrongCount = review.filter((r) => !r.isCorrect).length;
  const [filter, setFilter] = useState(wrongCount > 0 ? "incorrect" : "all");

  if (review.length === 0) return null;

  const items = review
    .map((item, i) => ({ ...item, number: i + 1 }))
    .filter((item) => filter === "all" || !item.isCorrect);

  const tabClass = (active) =>
    `rounded-md border px-3 py-1.5 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ${
      active
        ? "border-primary bg-primary text-on-primary"
        : "border-line bg-surface text-ink hover:border-primary"
    }`;

  return (
    <section aria-label="Answer review">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">Review your answers</h2>
        <div className="flex gap-2" role="group" aria-label="Filter answers">
          <button
            className={tabClass(filter === "incorrect")}
            aria-pressed={filter === "incorrect"}
            onClick={() => setFilter("incorrect")}
          >
            Needs review ({wrongCount})
          </button>
          <button
            className={tabClass(filter === "all")}
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All ({review.length})
          </button>
        </div>
      </div>

      {items.length === 0 && (
        <p className="mt-4 rounded-md border border-success-line bg-success-soft px-4 py-3 text-base text-success">
          Nothing to review — every answer was correct.
        </p>
      )}

      <ol className="mt-4 space-y-4">
        {items.map((item) => {
          const status = statusOf(item);
          return (
            <li
              key={item.questionId}
              className="rounded-lg border border-line bg-surface p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span className="font-mono">
                  Question {item.number} · {item.topic}
                </span>
                <span
                  className={`shrink-0 whitespace-nowrap rounded border px-2 py-0.5 font-medium ${status.tone}`}
                >
                  {status.label}
                </span>
              </div>

              <p className="mt-3 text-base font-medium leading-relaxed text-ink">
                {item.questionText}
              </p>

              <ul className="mt-4 space-y-2">
                {item.options.map((option, i) => {
                  const isCorrect = i === item.correctOptionIndex;
                  const isPicked = i === item.selectedOptionIndex;
                  const tone = isCorrect
                    ? "border-success-line bg-success-soft"
                    : isPicked
                      ? "border-danger-line bg-danger-soft"
                      : "border-line bg-surface";
                  return (
                    <li
                      key={i}
                      className={`flex flex-wrap items-start gap-3 rounded-md border px-3 py-3 ${tone}`}
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line bg-surface font-mono text-xs text-muted">
                        {LETTERS[i]}
                      </span>
                      <span className="min-w-0 flex-1 basis-3/4 text-base leading-relaxed text-ink">
                        {option}
                      </span>
                      {isCorrect && (
                        <span className="shrink-0 text-xs font-medium text-success">
                          Correct answer
                        </span>
                      )}
                      {isPicked && !isCorrect && (
                        <span className="shrink-0 text-xs font-medium text-danger">
                          Your answer
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {item.explanation && (
                <p className="mt-4 rounded-md bg-surface-muted px-3 py-2.5 text-base leading-relaxed text-ink">
                  <span className="font-medium text-ink">Why: </span>
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
