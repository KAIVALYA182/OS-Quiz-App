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
    <p role="alert" className="text-danger">
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
          <div key={label} className="rounded border bg-surface p-2 sm:p-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="font-mono text-2xl">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-base text-muted">
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
          <li key={r.id} className="rounded border bg-surface p-4">
            <button
              className="text-left font-medium underline"
              onClick={() => onReview(r.id, r.title)}
            >
              {r.type === "practice" ? "Personalised practice" : r.title}
            </button>
            <p className="mt-1 text-base text-muted">
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
      <p className="mt-3 text-muted">
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
          className="mt-4 rounded border bg-surface p-3"
        >
          Start recommended diagnostic
        </button>
      )}
      <div className="my-5 flex flex-wrap gap-3">
        <button
          onClick={onPractice}
          className="rounded bg-primary p-3 text-on-primary"
        >
          Practice Weak Topics
        </button>
        <button onClick={onQuizzes} className="rounded border p-3">
          Choose a quiz
        </button>
      </div>
      <p className="text-xs text-muted">
        Every completed answer counts, including repeated attempts and
        unanswered questions (incorrect). Recent accuracy uses the latest 10
        answers per topic. At least 3 answers are needed to classify a topic:
        below 60% needs revision, at least 80% is strong. Practice prioritises
        weak topics, last incorrect answers and least recent practice, with
        mixed revision.
      </p>
      <ul className="mt-5 space-y-3">
        {topics.map((t) => (
          <li key={t.topic} className="rounded border bg-surface p-4">
            <h2 className="font-medium">
              {t.topic} · {t.status}
            </h2>
            <p className="mt-2 text-base text-muted">
              {t.answered} answered · {t.correct} correct · {t.incorrect}{" "}
              incorrect · Accuracy: {t.accuracy ?? "—"}% · Recent:{" "}
              {t.recentAccuracy ?? "—"}%
            </p>
            <p className="text-xs text-muted">
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
    [page, setPage] = useState(1),
    [version, setVersion] = useState("");
  useEffect(() => {
    if (quizzes.data?.length) setQuiz(quizzes.data[0].id);
  }, [quizzes.data]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Leaderboard</h1>
      <p className="my-3 text-base text-muted">
        Each standard quiz ranks your best completed percentage. Equal
        percentages share a rank. Ranks are kept separate for each question set.
        Random selections rank separately; the default is your latest completed
        selection from the current pool, or the latest available selection.
        Select a saved question set to view its rankings. Personalised
        practice and legacy shared accounts are excluded; repeat attempts do not
        add points.
      </p>
      {!quizzes.data ? (
        <Notice state={quizzes} />
      ) : !quizzes.data.length ? (
        <p>No quizzes available.</p>
      ) : (
        <>
          <label className="text-base">
            Quiz
            <select
              className="my-3 block w-full rounded border bg-surface p-3"
              value={quiz}
              onChange={(e) => {
                setQuiz(e.target.value);
                setPage(1);
                setVersion("");
              }}
            >
              {quizzes.data.map((q) => (
                <option value={q.id} key={q.id}>
                  {q.title}
                </option>
              ))}
            </select>
          </label>
          {quiz && (
            <Rankings
              quiz={quiz}
              page={page}
              setPage={setPage}
              version={version}
              setVersion={setVersion}
            />
          )}
        </>
      )}
    </div>
  );
}
function Rankings({ quiz, page, setPage, version, setVersion }) {
  const state = useData(
    `/leaderboard/${quiz}?page=${page}${version ? "&version=" + encodeURIComponent(version) : ""}`,
  );
  if (!state.data) return <Notice state={state} />;
  const { rows, currentUser, total, pageSize } = state.data;
  return (
    <>
      {state.data.versions?.length > 0 && (
        <label className="block my-3">
          Question set
          <select
            className="field mt-1"
            value={version || state.data.version}
            onChange={(e) => {
              setVersion(e.target.value);
              setPage(1);
            }}
          >
            {state.data.versions.map((v) => (
              <option value={v.version} key={v.version}>
                {v.sampled ? (v.current ? "Latest selection" : "Saved selection") : (v.current ? "Current" : "Earlier")} · {v.questionCount}{" "}
                questions · {v.title}
                {!v.current ? " · " + v.version.slice(0, 8) : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="my-3 text-base">
        {currentUser
          ? `Your rank: ${currentUser.rank} · ${currentUser.score}%`
          : "You have no rank for this question set. Different random selections rank separately."}
      </p>
      {!rows.length ? (
        <p>No eligible scores yet.</p>
      ) : (
        <table className="w-full border bg-surface text-left text-base">
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
                className={r.isCurrentUser ? "bg-track font-semibold" : ""}
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
