const crypto = require("node:crypto");
const { pool } = require("./config/db");
const { calculateScore } = require("./utils/scoringEngine");
const { generateFeedback } = require("./utils/feedbackGenerator");
const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = (status, message) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
async function loadQuiz(db, id) {
  if (!uuid(id)) fail(404, "Quiz not found.");
  const z = (
    await db.query(
      'select id,title,topic,is_timed as "isTimed",time_limit_minutes as "timeLimitMinutes" from quizzes where id=$1',
      [id],
    )
  ).rows[0];
  if (!z) fail(404, "Quiz not found.");
  z.questions = (
    await db.query(
      `select q.id,q.topic,q.difficulty,q.question_text as "questionText",q.options,q.correct_option_index as "correctOptionIndex",q.explanation
 from quiz_questions qq join questions q on q.id=qq.question_id where qq.quiz_id=$1 order by qq.position,q.id`,
      [id],
    )
  ).rows;
  return z;
}
const versionOf = (z) =>
  crypto.createHash("sha256").update(JSON.stringify(z)).digest("hex");
const hide = (z) => ({
  ...z,
  questions: z.questions.map(({ correctOptionIndex, explanation, ...q }) => q),
});
async function learning(userId) {
  const rows = (
    await pool.query(
      `select coalesce(a.snapshot->>'topic',q.topic) as topic,a.is_correct,a.selected_option_index,r.created_at,q.id
 from result_answers a join results r on r.id=a.result_id join questions q on q.id=a.question_id
 where r.user_id=$1 order by r.created_at desc,r.id,q.id`,
      [userId],
    )
  ).rows;
  const topics = (
    await pool.query("select distinct topic from questions order by topic")
  ).rows.map((r) => r.topic);
  return topics.map((topic) => {
    const all = rows.filter((r) => r.topic === topic),
      recent = all.slice(0, 10);
    const correct = all.filter((r) => r.is_correct).length;
    const accuracy = all.length
      ? Math.round((correct / all.length) * 100)
      : null;
    const recentAccuracy = recent.length
      ? Math.round(
          (recent.filter((r) => r.is_correct).length / recent.length) * 100,
        )
      : null;
    return {
      topic,
      answered: all.length,
      correct,
      incorrect: all.length - correct,
      accuracy,
      recentAccuracy,
      lastPractice: all[0]?.created_at || null,
      status:
        all.length < 3
          ? "Not enough data"
          : recentAccuracy < 60
            ? "Needs revision"
            : recentAccuracy >= 80
              ? "Strong"
              : "Developing",
    };
  });
}
async function start(userId, quizId, practice = false) {
  const c = await pool.connect();
  try {
    await c.query("begin isolation level repeatable read");
    let z;
    if (!practice) z = await loadQuiz(c, quizId);
    else {
      // Use an existing quiz as the parent; practice has a separate immutable type.
      const first = (
        await c.query("select id from quizzes order by created_at,id limit 1")
      ).rows[0];
      if (!first) fail(409, "No quizzes are available yet.");
      z = await loadQuiz(c, first.id);
      const topics = await learning(userId);
      const bank = (
        await c.query(
          `select q.id,q.topic,q.difficulty,q.question_text as "questionText",q.options,q.correct_option_index as "correctOptionIndex",q.explanation,
    (select a.is_correct from result_answers a join results r on r.id=a.result_id where a.question_id=q.id and r.user_id=$1 order by r.created_at desc,r.id desc limit 1) as "lastCorrect",
    (select max(r.created_at) from result_answers a join results r on r.id=a.result_id where a.question_id=q.id and r.user_id=$1) as "lastSeen"
    from questions q order by q.id`,
          [userId],
        )
      ).rows;
      const stats = new Map(topics.map((t) => [t.topic, t]));
      const priority = (q) => {
        const t = stats.get(q.topic);
        return t.answered >= 3 ? (t.recentAccuracy ?? 50) : 65;
      };
      bank.sort(
        (a, b) =>
          priority(a) - priority(b) ||
          Number(a.lastCorrect !== false) - Number(b.lastCorrect !== false) ||
          new Date(a.lastSeen || 0) - new Date(b.lastSeen || 0) ||
          a.id.localeCompare(b.id),
      );
      const count = Math.min(10, bank.length),
        focused = bank.slice(0, Math.ceil(count * 0.8));
      // Reserve the remainder for mixed revision from other topics, then fill small banks.
      const focusedTopics = new Set(focused.map((q) => q.topic));
      const rest = bank.filter((q) => !focused.some((f) => f.id === q.id));
      rest.sort(
        (a, b) =>
          Number(focusedTopics.has(a.topic)) -
            Number(focusedTopics.has(b.topic)) ||
          new Date(a.lastSeen || 0) - new Date(b.lastSeen || 0) ||
          a.id.localeCompare(b.id),
      );
      z = {
        ...z,
        title: "Personalised practice",
        topic: "Mixed",
        isTimed: false,
        timeLimitMinutes: null,
        questions: [...focused, ...rest.slice(0, count - focused.length)].map(
          ({ lastCorrect, lastSeen, ...q }) => q,
        ),
      };
    }
    if (!z.questions.length) fail(409, "No questions are available.");
    const version = versionOf(z);
    const a = (
      await c.query(
        `insert into attempts(user_id,quiz_id,attempt_type,version,snapshot) values($1,$2,$3,$4,$5) returning id`,
        [
          userId,
          z.id,
          practice ? "practice" : "standard",
          version,
          JSON.stringify(z),
        ],
      )
    ).rows[0];
    await c.query("commit");
    return {
      ...hide(z),
      attemptId: a.id,
      attemptType: practice ? "practice" : "standard",
    };
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
async function submit(userId, attemptId, answers, quizId) {
  if (!uuid(attemptId)) fail(400, "A valid assigned attemptId is required.");
  const c = await pool.connect();
  try {
    await c.query("begin");
    const a = (
      await c.query(
        "select * from attempts where id=$1 and user_id=$2 for update",
        [attemptId, userId],
      )
    ).rows[0];
    if (!a || a.quiz_id !== quizId) fail(404, "Attempt not found.");
    if (a.response) {
      await c.query("commit");
      return a.response;
    }
    const z = a.snapshot;
    if (!Array.isArray(answers) || answers.length > z.questions.length)
      fail(400, "Invalid answers.");
    const byId = new Map(z.questions.map((q) => [q.id, q]));
    const seen = new Set();
    for (const answer of answers) {
      const q = byId.get(answer?.questionId);
      if (
        !q ||
        seen.has(q.id) ||
        !Number.isInteger(answer.selectedOptionIndex) ||
        answer.selectedOptionIndex < -1 ||
        answer.selectedOptionIndex >= q.options.length
      )
        fail(
          400,
          "Answers must be unique and belong to the assigned question set with valid options.",
        );
      seen.add(q.id);
    }
    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(a.started_at).getTime()) / 1000),
    );
    // Allow a small network grace period; late timed attempts cannot submit changed answers.
    if (z.isTimed && elapsed > z.timeLimitMinutes * 60 + 30)
      fail(409, "This timed attempt has expired. Start a new quiz.");
    const scored = calculateScore(z.questions, answers);
    const feedbackMessage = generateFeedback(
      scored.scorePercentage,
      scored.topicBreakdown,
    );
    const r = (
      await c.query(
        `insert into results(user_id,quiz_id,total_questions,correct_count,score_percentage,topic_breakdown,feedback_message,time_taken_seconds,attempt_id,attempt_type,version)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [
          userId,
          z.id,
          scored.totalQuestions,
          scored.correctCount,
          scored.scorePercentage,
          JSON.stringify(scored.topicBreakdown),
          feedbackMessage,
          elapsed,
          a.id,
          a.attempt_type,
          a.version,
        ],
      )
    ).rows[0];
    const review = [];
    for (const answer of scored.answers) {
      const q = byId.get(answer.questionId);
      const item = {
        questionId: q.id,
        topic: q.topic,
        questionText: q.questionText,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        explanation: q.explanation,
        selectedOptionIndex: answer.selectedOptionIndex,
        isCorrect: answer.isCorrect,
      };
      review.push(item);
      await c.query(
        "insert into result_answers(result_id,question_id,selected_option_index,is_correct,snapshot) values($1,$2,$3,$4,$5)",
        [
          r.id,
          q.id,
          answer.selectedOptionIndex,
          answer.isCorrect,
          JSON.stringify(q),
        ],
      );
    }
    const response = {
      resultId: r.id,
      totalQuestions: scored.totalQuestions,
      correctCount: scored.correctCount,
      scorePercentage: scored.scorePercentage,
      topicBreakdown: scored.topicBreakdown,
      feedbackMessage,
      review,
      attemptType: a.attempt_type,
      timeTakenSeconds: elapsed,
    };
    await c.query(
      "update attempts set completed_at=clock_timestamp(),response=$1 where id=$2",
      [JSON.stringify(response), a.id],
    );
    await c.query("commit");
    return response;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
async function progress(userId) {
  const history = (
    await pool.query(
      `select r.id,z.title,r.created_at as date,r.score_percentage as score,r.correct_count as correct,r.total_questions as total,r.time_taken_seconds as seconds,r.attempt_type as type
 from results r join quizzes z on z.id=r.quiz_id where user_id=$1 order by r.created_at desc,r.id`,
      [userId],
    )
  ).rows;
  const standard = history.filter((r) => r.type === "standard");
  const summary = (items) => ({
    total: items.length,
    average: items.length
      ? Math.round(items.reduce((n, r) => n + r.score, 0) / items.length)
      : 0,
    best: items.length ? Math.max(...items.map((r) => r.score)) : 0,
  });
  return { summary: summary(history), standard: summary(standard), history };
}
async function result(userId, id) {
  if (!uuid(id)) fail(404, "Result not found.");
  const r = (
    await pool.query(
      `select r.*,a.response from results r left join attempts a on a.id=r.attempt_id where r.id=$1 and r.user_id=$2`,
      [id, userId],
    )
  ).rows[0];
  if (!r) fail(404, "Result not found.");
  if (r.response) return r.response;
  const review = (
    await pool.query(
      `select a.question_id as "questionId",coalesce(a.snapshot->>'topic',q.topic) as topic,
 coalesce(a.snapshot->>'questionText',q.question_text) as "questionText",coalesce(a.snapshot->'options',to_jsonb(q.options)) as options,
 coalesce((a.snapshot->>'correctOptionIndex')::int,q.correct_option_index) as "correctOptionIndex",coalesce(a.snapshot->>'explanation',q.explanation) as explanation,
 a.selected_option_index as "selectedOptionIndex",a.is_correct as "isCorrect" from result_answers a join questions q on q.id=a.question_id where a.result_id=$1 order by a.question_id`,
      [id],
    )
  ).rows;
  return {
    resultId: id,
    scorePercentage: r.score_percentage,
    correctCount: r.correct_count,
    totalQuestions: r.total_questions,
    topicBreakdown: r.topic_breakdown,
    feedbackMessage: r.feedback_message,
    attemptType: r.attempt_type,
    review,
  };
}
async function leaderboard(userId, quizId, page) {
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    fail(400, "Invalid page.");
  const z = await loadQuiz(pool, quizId),
    version = versionOf(z);
  // Integer percentages match the scoring engine and define ties consistently.
  const ranked = `with best as (
 select u.id,u.username,max(r.score_percentage) as score from results r join users u on u.id=r.user_id
 join attempts a on a.id=r.attempt_id and a.user_id=r.user_id and a.quiz_id=r.quiz_id and a.version=r.version
 where r.quiz_id=$1 and r.version=$2 and r.attempt_type='standard' and a.attempt_type='standard' and a.completed_at is not null
 and u.role='student' and u.auth_enabled and u.leaderboard_enabled
 and normalize_identity(u.email)<>'test.student@example.com'
 group by u.id,u.username), ranked as (select *,rank() over(order by score desc)::int as rank from best)`;
  const rows = (
    await pool.query(
      ranked +
        ` select username,score,rank,(id=$3) as "isCurrentUser" from ranked order by score desc,lower(username),id limit 20 offset $4`,
      [quizId, version, userId, (page - 1) * 20],
    )
  ).rows;
  const mine =
    (
      await pool.query(
        ranked + " select username,score,rank from ranked where id=$3",
        [quizId, version, userId],
      )
    ).rows[0] || null;
  const total = (
    await pool.query(ranked + " select count(*)::int as count from ranked", [
      quizId,
      version,
    ])
  ).rows[0].count;
  return { rows, currentUser: mine, total, page, pageSize: 20, version };
}
module.exports = {
  start,
  submit,
  learning,
  progress,
  result,
  leaderboard,
  loadQuiz,
  versionOf,
  uuid,
};
