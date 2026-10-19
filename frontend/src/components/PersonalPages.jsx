import { useEffect, useState } from "react";
import { request } from "../api/client";
export function useData(path) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    request(path)
      .then((data) => {
        if (active) setState({ data });
      })
      .catch((e) => {
        if (active) setState({ error: e.message });
      });
    return () => {
      active = false;
    };
  }, [path]);
  return state;
}
const Notice = ({ state }) =>
  state.error ? (
    <p role="alert" className="text-rose-700">
      {state.error}
    </p>
  ) : state.loading ? (
    <p>Loading…</p>
  ) : null;
export function Progress({ onReview }) {
  const state = useData("/progress");
  if (!state.data) return <Notice state={state} />;
  const { summary, standard, history } = state.data;
  return (
    <div>
      <h1 className="text-2xl font-semibold">My Progress</h1>
      <div className="my-5 grid grid-cols-3 gap-2">
        {[
          ["Completed", summary.total],
          ["Average", summary.average + "%"],
          ["Best", summary.best + "%"],
        ].map(([label, value]) => (
          <div key={label} className="rounded border bg-white p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-mono text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        Standard quizzes: {standard.total} attempts · {standard.average}%
        average · {standard.best}% best. Personalised practice is excluded from
        rankings.
      </p>
      {!history.length && (
        <p className="mt-5">
          Complete your first quiz to start tracking progress.
        </p>
      )}
      <ul className="mt-5 space-y-3">
        {history.map((r) => (
          <li key={r.id} className="rounded border bg-white p-4">
            <button
              className="text-left font-medium underline"
              onClick={() => onReview(r.id, r.title)}
            >
              {r.type === "practice" ? "Personalised practice" : r.title}
            </button>
            <p className="mt-1 text-sm text-slate-500">
              {new Date(r.date).toLocaleString()} · {r.type} · {r.score}% (
              {r.correct}/{r.total}) · {r.seconds ?? "Unknown"} seconds
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function Learning({ onPractice, onQuizzes, onStart }) {
  const state = useData("/learning");
  if (!state.data) return <Notice state={state} />;
  const suggestedQuiz = state.data.suggestedQuiz;
  const topics = state.data.topics,
    weak = topics
      .filter((t) => t.status === "Needs revision")
      .sort((a, b) => a.recentAccuracy - b.recentAccuracy),
    hasData = topics.some((t) => t.answered);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Personalised Learning</h1>
      <p className="mt-3 text-slate-600">
        {weak.length
          ? `Recommended because your recent accuracy in ${weak[0].topic} is ${weak[0].recentAccuracy}%.`
          : hasData
            ? "Keep building evidence with mixed revision."
            : suggestedQuiz
              ? `Not enough data yet. Start with ${suggestedQuiz.title} as a diagnostic.`
              : "Not enough data yet. Choose an available quiz to start learning."}
      </p>
      {!hasData && suggestedQuiz && onStart && (
        <button
          onClick={() => onStart(suggestedQuiz.id)}
          className="mt-4 rounded border bg-white p-3"
        >
          Start recommended diagnostic
        </button>
      )}
      <div className="my-5 flex flex-wrap gap-3">
        <button
          onClick={onPractice}
          className="rounded bg-slate-900 p-3 text-white"
        >
          Practice Weak Topics
        </button>
        <button onClick={onQuizzes} className="rounded border p-3">
          Choose a quiz
        </button>
      </div>
      <p className="text-xs text-slate-500">
        Every completed answer counts, including repeated attempts and
        unanswered questions (incorrect). Recent accuracy uses the latest 10
        answers per topic. At least 3 answers are needed to classify a topic:
        below 60% needs revision, at least 80% is strong. Practice prioritises
        weak topics, last incorrect answers and least recent practice, with
        mixed revision.
      </p>
      <ul className="mt-5 space-y-3">
        {topics.map((t) => (
          <li key={t.topic} className="rounded border bg-white p-4">
            <h2 className="font-medium">
              {t.topic} · {t.status}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {t.answered} answered · {t.correct} correct · {t.incorrect}{" "}
              incorrect · Accuracy: {t.accuracy ?? "—"}% · Recent:{" "}
              {t.recentAccuracy ?? "—"}%
            </p>
            <p className="text-xs text-slate-500">
              Last practice:{" "}
              {t.lastPractice
                ? new Date(t.lastPractice).toLocaleString()
                : "Never"}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
export function Leaderboard() {
  const quizzes = useData("/quiz"),
    [quiz, setQuiz] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    if (quizzes.data?.length) setQuiz(quizzes.data[0].id);
  }, [quizzes.data]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="my-3 text-sm text-slate-600">
        Each standard quiz ranks your best completed percentage. Equal
        percentages share a rank. Only the current quiz version counts.
        Personalised practice and legacy shared accounts are excluded; repeat
        attempts do not add points.
      </p>
      {!quizzes.data ? (
        <Notice state={quizzes} />
      ) : !quizzes.data.length ? (
        <p>No quizzes available.</p>
      ) : (
        <>
          <label className="text-sm">
            Quiz
            <select
              className="my-3 block w-full rounded border bg-white p-3"
              value={quiz}
              onChange={(e) => {
                setQuiz(e.target.value);
                setPage(1);
              }}
            >
              {quizzes.data.map((q) => (
                <option value={q.id} key={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </label>
          {quiz && <Rankings quiz={quiz} page={page} setPage={setPage} />}
        </>
      )}
    </div>
  );
}
function Rankings({ quiz, page, setPage }) {
  const state = useData(`/leaderboard/${quiz}?page=${page}`);
  if (!state.data) return <Notice state={state} />;
  const { rows, currentUser, total, pageSize } = state.data;
  return (
    <>
      <p className="my-3 text-sm">
        {currentUser
          ? `Your rank: ${currentUser.rank} · ${currentUser.score}%`
          : "Complete this quiz to earn a rank."}
      </p>
      {!rows.length ? (
        <p>No eligible scores yet.</p>
      ) : (
        <table className="w-full border bg-white text-left text-sm">
          <thead>
            <tr>
              {["Rank", "Username", "Best score"].map((x) => (
                <th className="p-3" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.username}
                className={r.isCurrentUser ? "bg-slate-200 font-semibold" : ""}
              >
                <td className="p-3">{r.rank}</td>
                <td className="p-3 break-all">
                  {r.username}
                  {r.isCurrentUser ? " (you)" : ""}
                </td>
                <td className="p-3">{r.score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-4 flex justify-between">
        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className="disabled:opacity-40"
        >
          ← Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <button
          disabled={page * pageSize >= total}
          onClick={() => setPage(page + 1)}
          className="disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </>
  );
}
