// frontend/src/components/ScoreFeedback.jsx
//
// Displays the result returned by POST /api/quiz/:quizId/submit.
// Design intent: a "readout" panel rather than a generic gradient score
// card — a monospace numeral for the score (this is an OS course, a little
// systems/terminal flavor fits) and thin per-topic bars instead of a pie
// chart, so a student can scan straight to their weakest topic.
//
// Usage:
//   <ScoreFeedback result={resultFromApi} onRetry={() => ...} />

import React from "react";

function topicBarColor(correct, total) {
  const ratio = total === 0 ? 0 : correct / total;
  if (ratio >= 0.75) return "bg-success-soft0";
  if (ratio >= 0.5) return "bg-warning-soft0";
  return "bg-danger-soft0";
}

export default function ScoreFeedback({ result, onRetry }) {
  if (!result) return null;

  const {
    scorePercentage,
    correctCount,
    totalQuestions,
    feedbackMessage,
    topicBreakdown = [],
  } = result;

  return (
    <div className="max-w-xl mx-auto rounded-lg border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-baseline justify-between border-b border-line pb-5">
        <div>
          <p className="text-base text-muted">Quiz result</p>
          <p className="mt-1 text-base text-muted">
            {correctCount} of {totalQuestions} correct
          </p>
        </div>
        <div className="text-right">
          <span className="font-mono text-4xl font-semibold tabular-nums text-ink">
            {scorePercentage}
          </span>
          <span className="font-mono text-lg text-muted">%</span>
        </div>
      </div>

      <p className="mt-5 text-base leading-relaxed text-ink">
        {feedbackMessage}
      </p>

      {topicBreakdown.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-base text-muted">By topic</p>
          {topicBreakdown.map((t) => (
            <div
              key={t.topic}
              className="grid grid-cols-[1fr_auto] items-center gap-3"
            >
              <div>
                <div className="flex items-center justify-between text-base text-ink">
                  <span>{t.topic}</span>
                  <span className="font-mono text-xs text-muted">
                    {t.correct}/{t.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className={`h-full ${topicBarColor(t.correct, t.total)}`}
                    style={{
                      width: `${t.total === 0 ? 0 : (t.correct / t.total) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-7 w-full rounded-md bg-primary py-2.5 text-base font-medium text-on-primary transition-colors hover:bg-primary-hover"
        >
          Try another quiz
        </button>
      )}
    </div>
  );
}
