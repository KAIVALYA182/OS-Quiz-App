// backend/db/queries.js
// Quiz catalog queries. Assigned-attempt transactions live in ../attempts.js.

const { pool } = require("../config/db");

// ---------------------------------------------------------------- quizzes

/**
 * Every quiz with its question count, in the order the seed created them
 * (topic quizzes in curriculum order, the full mock test last).
 */
async function listQuizzes() {
  const { rows } = await pool.query(
    `select z.id,
            z.title,
            z.topic,
            z.is_timed as "isTimed",
            z.time_limit_minutes as "timeLimitMinutes",
            count(qq.question_id)::int as "questionCount"
       from quizzes z
       left join quiz_questions qq on qq.quiz_id = z.id
      group by z.id
      order by z.created_at, z.title`
  );
  return rows.map((q) => ({
    ...q,
    poolSize: q.questionCount,
    questionCount: q.topic === "Mixed" ? q.questionCount : Math.min(20, q.questionCount),
    selectionMode: q.topic === "Mixed" ? "fixed" : "random",
  }));
}

module.exports={listQuizzes};
