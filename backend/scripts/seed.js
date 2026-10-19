require("dotenv").config();
const { pool } = require("../config/db");
const bank = require("../data/questions");
async function seed(db = pool) {
  const c = await db.connect();
  const counts = {
    questionsInserted: 0,
    questionsReused: 0,
    quizzesInserted: 0,
    quizzesReused: 0,
    linksInserted: 0,
    usersInserted: 0,
    usersReused: 0,
  };
  async function adopt(table, key, where, values, insert, fields, fallback) {
    const keyed = await c.query(`select id from ${table} where seed_key=$1`, [
      key,
    ]);
    if (keyed.rowCount) {
      counts[table + "Reused"]++;
      return keyed.rows[0].id;
    }
    let candidates = await c.query(
      `select id,seed_key from ${table} where ${where}`,
      values,
    );
    if (!candidates.rowCount && fallback) candidates = await fallback();
    if (candidates.rowCount > 1 || candidates.rows.some((r) => r.seed_key))
      throw new Error(
        `Ambiguous seed adoption for ${key}; assign seed_key after reviewing ownership and content. No changes committed.`,
      );
    if (candidates.rowCount) {
      await c.query(`update ${table} set seed_key=$1 where id=$2`, [
        key,
        candidates.rows[0].id,
      ]);
      counts[table + "Reused"]++;
      return candidates.rows[0].id;
    }
    const row = await c.query(insert, [key, ...fields]);
    counts[table + "Inserted"]++;
    return row.rows[0].id;
  }
  async function quiz(key, title, topic, timed, minutes, ids) {
    const id = await adopt(
      "quizzes",
      key,
      "title=$1",
      [title],
      "insert into quizzes(seed_key,title,topic,is_timed,time_limit_minutes,created_at) values($1,$2,$3,$4,$5,clock_timestamp()) returning id",
      [title, topic, timed, minutes],
      async () => {
        const candidates = await c.query(
          `select z.id,z.seed_key from quizzes z where z.seed_key is null and
           (select array_agg(question_id order by question_id) from quiz_questions where quiz_id=z.id) =
           (select array_agg(v order by v) from unnest($1::uuid[]) v)`,
          [ids],
        );
        if (!candidates.rowCount) {
          const partial = await c.query(
            `select 1 from quizzes z join quiz_questions l on l.quiz_id=z.id
            where z.seed_key is null and l.question_id=any($1::uuid[]) limit 1`,
            [ids],
          );
          if (partial.rowCount)
            throw new Error(
              `Cannot safely adopt edited legacy quiz ${key}. Review partial memberships and assign seed_key explicitly; no changes committed.`,
            );
        }
        return candidates;
      },
    );
    for (const q of ids) {
      const r = await c.query(
        `insert into quiz_questions(quiz_id,question_id,position)
    select $1,$2,coalesce((select max(position)+1 from quiz_questions where quiz_id=$1),0)
    where not exists(select 1 from quiz_questions where quiz_id=$1 and question_id=$2)`,
        [id, q],
      );
      counts.linksInserted += r.rowCount;
    }
  }
  try {
    await c.query("begin");
    await c.query("select pg_advisory_xact_lock(187421,1)");
    const keys = bank.flatMap((group) => group.questions.map((q) => q.seedKey));
    if (keys.some((key) => !key) || new Set(keys).size !== keys.length)
      throw new Error("Question seed keys must be present and unique.");
    const user = await c.query(
      "select id from users where normalize_identity(email)=$1",
      ["test.student@example.com"],
    );
    if (user.rowCount > 1)
      throw new Error(
        "Ambiguous test student email; review normalized duplicates.",
      );
    if (user.rowCount) counts.usersReused++;
    else {
      await c.query(
        `insert into users(name,email,username,password_hash) values('Test Student','test.student@example.com','legacy_test_student','seed-placeholder-hash')`,
      );
      counts.usersInserted++;
    }
    const all = [];
    let globalPosition = 0;
    for (const group of bank) {
      const ids = [];
      for (const [position, q] of group.questions.entries()) {
        if (!q.seedKey) throw new Error("Question lacks a stable seedKey");
        // Exact text within a topic is an unambiguous legacy identity. Other fields may have been edited.
        const id = await adopt(
          "questions",
          q.seedKey,
          "topic=$1 and question_text=$2",
          [group.topic, q.questionText],
          "insert into questions(seed_key,topic,difficulty,question_text,options,correct_option_index,explanation) values($1,$2,$3,$4,$5,$6,$7) returning id",
          [
            group.topic,
            q.difficulty,
            q.questionText,
            q.options,
            q.correctOptionIndex,
            q.explanation,
          ],
          async () => {
            // Two agreeing independent memberships can identify an edited legacy question.
            const candidates = await c.query(
              `select distinct q.id,q.seed_key from questions q
       join quiz_questions t on t.question_id=q.id join quizzes tz on tz.id=t.quiz_id
       join quiz_questions m on m.question_id=q.id join quizzes mz on mz.id=m.quiz_id
       where tz.title=$1 and t.position=$2 and mz.title=$3 and m.position=$4`,
              [
                group.topic + " — Practice Quiz",
                position,
                "Full Mock Test — All Topics",
                globalPosition,
              ],
            );
            if (!candidates.rowCount) {
              const legacy = await c.query(
                `select 1 from questions q join quiz_questions l on l.question_id=q.id join quizzes z on z.id=l.quiz_id
        where q.seed_key is null and q.topic=$1 and z.title in ($2,$3) limit 1`,
                [
                  group.topic,
                  group.topic + " — Practice Quiz",
                  "Full Mock Test — All Topics",
                ],
              );
              if (legacy.rowCount)
                throw new Error(
                  `Cannot safely adopt edited legacy question ${q.seedKey}. Review and assign its seed_key explicitly; no changes committed.`,
                );
            }
            return candidates;
          },
        );
        globalPosition++;
        ids.push(id);
        all.push(id);
      }
      await quiz(
        "topic:" + group.topic,
        group.topic + " — Practice Quiz",
        group.topic,
        false,
        null,
        ids,
      );
    }
    await quiz(
      "full-mock",
      "Full Mock Test — All Topics",
      "Mixed",
      true,
      50,
      all,
    );
    await c.query("commit");
    return counts;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
module.exports = { seed };
if (require.main === module)
  seed()
    .then((c) => console.log("Seed complete:", c))
    .catch((e) => {
      console.error(
        "Seed failed:",
        e.code
          ? "Database constraint or migration error (" +
              e.code +
              "); no changes committed."
          : e.message,
      );
      process.exitCode = 1;
    })
    .finally(() => pool.end());
