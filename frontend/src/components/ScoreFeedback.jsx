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
  if (ratio >= 0.75) return "bg-emerald-500";
  if (ratio >= 0.5) return "bg-amber-500";
  return "bg-rose-500";
}

export default function ScoreFeedback({ result, onRetry }) {
  if (!result) return null;

  const { scorePercentage, correctCount, totalQuestions, feedbackMessage, topicBreakdown = [] } = result;

  return (
    <div className="max-w-xl mx-auto rounded-lg border border-slate-200 bg-white p-6 sm:p-8">
      <div className="flex items-baseline justify-between border-b border-slate-100 pb-5">
        <div>
          <p className="text-sm text-slate-500">Quiz result</p>
          <p className="mt-1 text-sm text-slate-600">
            {correctCount} of {totalQuestions} correct
          </p>
        </div>
        <div className="text-right">
          <span className="font-mono text-4xl font-semibold tabular-nums text-slate-900">
            {scorePercentage}
          </span>
          <span className="font-mono text-lg text-slate-400">%</span>
        </div>
      </div>

      <p className="mt-5 text-[15px] leading-relaxed text-slate-700">{feedbackMessage}</p>

      {topicBreakdown.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">By topic</p>
          {topicBreakdown.map((t) => (
            <div key={t.topic} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <span>{t.topic}</span>
                  <span className="font-mono text-xs text-slate-500">
                    {t.correct}/{t.total}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full ${topicBarColor(t.correct, t.total)}`}
                    style={{ width: `${t.total === 0 ? 0 : (t.correct / t.total) * 100}%` }}
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
          className="mt-7 w-full rounded-md bg-slate-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          Try another quiz
        </button>
      )}
    </div>
  );
}
