const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { Pool } = require("pg");
const http = require("supertest");
// Never read the project's configured database. All database work uses a fresh local cluster.
test("isolated PostgreSQL integration", { timeout: 180000 }, async (t) => {
  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "osquiz-test-"));
  const port = await new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "quiz_test",
    password: "disposable-test-only",
    port,
    persistent: false,
    onLog: () => {},
    onError: () => {},
  });
  let pool;
  try {
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("quiz_integration");
    process.env.DATABASE_URL = `postgresql://quiz_test:disposable-test-only@localhost:${port}/quiz_integration`;
    process.env.DATABASE_SSL = "false";
    process.env.SESSION_SECRET =
      "isolated-integration-test-secret-32-characters";
    process.env.NODE_ENV = "test";
    process.env.CLIENT_ORIGIN = "http://localhost:5173";
    delete process.env.TRUST_PROXY_HOPS;
    pool = require("../config/db").pool;
    const { migrate } = require("../scripts/migrate");
    const { seed } = require("../scripts/seed");
    const bank = require("../data/questions");
    const schema = fs.readFileSync(
      path.join(__dirname, "../db/schema.sql"),
      "utf8",
    );
    const base = schema.slice(
      0,
      schema.indexOf("-- Run through scripts/migrate.js"),
    );
    await pool.query(base);
    const legacy = (
      await pool.query(
        "insert into users(name,email,password_hash) values('Legacy','test.student@example.com','seed-placeholder-hash') returning *",
      )
    ).rows[0];
    await t.test(
      "migration preserves legacy IDs and credentials and is repeatable",
      async () => {
        await migrate();
        await migrate();
        const row = (
          await pool.query("select * from users where id=$1", [legacy.id])
        ).rows[0];
        assert.equal(row.password_hash, legacy.password_hash);
        assert.equal(row.email, legacy.email);
        assert.equal(row.created_at.getTime(), legacy.created_at.getTime());
        assert.equal(row.auth_enabled, false);
        assert.match(row.username, /^legacy_/);
      },
    );
    const snapshot = async () =>
      (
        await pool.query(
          `select jsonb_build_object('users',(select jsonb_agg(u order by id) from users u),'questions',(select jsonb_agg(q order by id) from questions q),'quizzes',(select jsonb_agg(z order by id) from quizzes z),'links',(select jsonb_agg(l order by quiz_id,position) from quiz_questions l),'results',(select jsonb_agg(r order by id) from results r),'answers',(select jsonb_agg(a order by result_id,question_id) from result_answers a)) as data`,
        )
      ).rows[0].data;
    await t.test(
      "empty seeding, repeat seeding, edited content and concurrent runs preserve data",
      async () => {
        const first = await seed();
        assert.equal(first.questionsInserted, 50);
        assert.equal(first.quizzesInserted, 11);
        await pool.query(
          "update questions set explanation='Teacher edit',options=array['edited A','edited B','edited C','edited D'],correct_option_index=0 where seed_key='os-question-001'",
        );
        const before = await snapshot();
        const counts = await seed();
        assert.equal(counts.questionsReused, 50);
        assert.deepEqual(await snapshot(), before);
        await Promise.all([seed(), seed()]);
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "unambiguous legacy adoption preserves IDs; ambiguous adoption rolls back",
      async () => {
        await pool.query(
          "update questions set seed_key=null where seed_key='os-question-002'",
        );
        const before = (
          await pool.query("select id from questions where question_text=$1", [
            bank[0].questions[1].questionText,
          ])
        ).rows[0].id;
        await seed();
        assert.equal(
          (
            await pool.query(
              "select id from questions where seed_key='os-question-002'",
            )
          ).rows[0].id,
          before,
        );
        await pool.query(
          "update questions set seed_key=null where seed_key='os-question-002'",
        );
        const duplicate = (
          await pool.query(
            `insert into questions(topic,difficulty,question_text,options,correct_option_index,explanation) select topic,difficulty,question_text,options,correct_option_index,explanation from questions where id=$1 returning id`,
            [before],
          )
        ).rows[0].id;
        const state = await snapshot();
        await assert.rejects(seed(), /Ambiguous/);
        assert.deepEqual(await snapshot(), state);
        // Remove only a disposable test fixture, never application data.
        await pool.query("delete from questions where id=$1", [duplicate]);
        await seed();
      },
    );
    await t.test(
      "legacy edits and quiz settings survive adoption; missing links append without moving positions",
      async () => {
        await pool.query(
          "update questions set seed_key=null,question_text='Edited legacy question',topic='Memory Management' where seed_key='os-question-003'",
        );
        const id = (
          await pool.query(
            "select id from questions where question_text='Edited legacy question'",
          )
        ).rows[0].id;
        await seed();
        assert.equal(
          (
            await pool.query(
              "select id from questions where seed_key='os-question-003'",
            )
          ).rows[0].id,
          id,
        );
        assert.equal((await pool.query('select topic from questions where id=$1',[id])).rows[0].topic,'Memory Management');
        // Restore this fixture topic for the subsequent fixed-evidence assertions.
        await pool.query("update questions set topic='Operating System Basics' where id=$1",[id]);
        await pool.query(
          "update quizzes set seed_key=null,title='Teacher edited quiz',is_timed=true,time_limit_minutes=15 where seed_key='topic:Operating System Basics'",
        );
        await seed();
        const quiz = (
          await pool.query(
            "select * from quizzes where seed_key='topic:Operating System Basics'",
          )
        ).rows[0];
        assert.equal(quiz.title, "Teacher edited quiz");
        assert.equal(quiz.time_limit_minutes, 15);
        await pool.query(
          "delete from quiz_questions where quiz_id=$1 and question_id=$2",
          [quiz.id, id],
        );
        const before = (
          await pool.query(
            "select * from quiz_questions where quiz_id=$1 order by position",
            [quiz.id],
          )
        ).rows;
        await seed();
        const after = (
          await pool.query(
            "select * from quiz_questions where quiz_id=$1 order by position",
            [quiz.id],
          )
        ).rows;
        assert.equal(after.length, 5);
        assert.deepEqual(after.slice(0, 4), before);
        assert.equal(after[4].question_id, id);
        const missing = bank[0].questions.pop();
        try {
          const state = await snapshot();
          await seed();
          assert.deepEqual(await snapshot(), state);
        } finally {
          bank[0].questions.push(missing);
        }
      },
    );
    await t.test(
      "failed seed writes roll back and normalized legacy collisions stop migration",
      async () => {
        const duplicateKey = bank[1].questions[0].seedKey;
        bank[1].questions[0].seedKey = bank[0].questions[0].seedKey;
        const state = await snapshot();
        try {
          await assert.rejects(seed(), /unique/);
          assert.deepEqual(await snapshot(), state);
        } finally {
          bank[1].questions[0].seedKey = duplicateKey;
        }
        const valid = {
          ...bank[0].questions[0],
          seedKey: "rollback-valid",
          questionText: "Rollback fixture valid",
        };
        const invalid = {
          ...valid,
          seedKey: "rollback-invalid",
          questionText: "Rollback fixture invalid",
          difficulty: "invalid",
        };
        bank[0].questions.push(valid, invalid);
        try {
          await assert.rejects(seed());
          assert.deepEqual(await snapshot(), state);
        } finally {
          bank[0].questions.splice(-2);
        }

        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query("create schema collision_fixture");
          await c.query("set local search_path=collision_fixture,public");
          await c.query(base);
          await c.query(
            "insert into users(name,email,password_hash) values('A','DUP@example.com','placeholder'),('B',' dup@example.com ','placeholder')",
          );
          await c.query("commit");
          const isolated = new Pool({
            connectionString: process.env.DATABASE_URL,
            options: "-c search_path=collision_fixture,public",
          });
          try {
            await assert.rejects(
              migrate(isolated),
              /duplicate normalized emails/,
            );
            assert.equal(
              (await isolated.query("select count(*)::int as n from users"))
                .rows[0].n,
              2,
            );
            assert.equal(
              (
                await isolated.query(
                  "select count(*)::int as n from information_schema.columns where table_schema='collision_fixture' and table_name='users' and column_name='username'",
                )
              ).rows[0].n,
              0,
            );
          } finally {
            await isolated.end();
          }
        } finally {
          c.release();
        }
      },
    );
    const { createApp } = require("../server");
    let app = createApp();
    const a = http.agent(app),
      b = http.agent(app),
      anonymous = http.agent(app);
    const csrf = async (agent) =>
      (await agent.get("/api/auth/csrf")).body.csrfToken;
    let tokenA, tokenB, userA, userB, quiz, attempt, result;
    const registration = (username, email) => ({
      name: "Student " + username,
      username,
      email,
      password: " strong password 123 ",
      confirmPassword: " strong password 123 ",
    });
    await t.test(
      "authentication validation, role rejection, CSRF and normalized uniqueness",
      async () => {
        assert.equal(
          (
            await a
              .post("/api/auth/register")
              .send(registration("alice", "a@example.com"))
          ).status,
          403,
        );
        tokenA = await csrf(a);
        assert.equal(
          (
            await a
              .post("/api/auth/register")
              .set("X-CSRF-Token", tokenA)
              .send({
                ...registration("alice", "a@example.com"),
                role: "admin",
              })
          ).status,
          400,
        );
        assert.equal(
          (
            await a
              .post("/api/auth/register")
              .set("X-CSRF-Token", tokenA)
              .send({
                ...registration("alice", "a@example.com"),
                confirmPassword: "wrong",
              })
          ).status,
          400,
        );
        const reg = await a
          .post("/api/auth/register")
          .set("X-CSRF-Token", tokenA)
          .send(registration(" Alice ", " A@Example.com "));
        assert.equal(reg.status, 201);
        userA = reg.body.user;
        tokenA = reg.body.csrfToken;
        assert.equal(userA.username, "alice");
        assert.equal(reg.body.password_hash, undefined);
        tokenB = await csrf(b);
        assert.equal(
          (
            await b
              .post("/api/auth/register")
              .set("X-CSRF-Token", tokenB)
              .send(registration("ALICE", "other@example.com"))
          ).status,
          409,
        );
        assert.equal(
          (
            await b
              .post("/api/auth/register")
              .set("X-CSRF-Token", tokenB)
              .send(registration("bob", "a@EXAMPLE.com"))
          ).status,
          409,
        );
        const regB = await b
          .post("/api/auth/register")
          .set("X-CSRF-Token", tokenB)
          .send(registration("bob", "b@example.com"));
        assert.equal(regB.status, 201);
        userB = regB.body.user;
        tokenB = regB.body.csrfToken;
        const db = (
          await pool.query("select * from users where id=$1", [userA.id])
        ).rows[0];
        assert.equal(db.role, "student");
        assert.match(db.password_hash, /^\$argon2id\$/);
        assert.notEqual(db.password_hash, " strong password 123 ");
      },
    );
    await t.test(
      "protected APIs return 401 and invalid origins are rejected",
      async () => {
        for (const url of [
          "/api/quiz",
          "/api/progress",
          "/api/learning",
          "/api/leaderboard/invalid",
          "/api/results/invalid",
        ])
          assert.equal((await anonymous.get(url)).status, 401, url);
        assert.equal(
          (await anonymous.post("/api/quiz/no/submit").send({})).status,
          401,
        );
        assert.equal(
          (await a.get("/api/quiz").set("Origin", "https://untrusted.example"))
            .status,
          403,
        );
        const r = await a
          .get("/api/quiz")
          .set("Origin", "http://localhost:5173");
        assert.equal(r.headers["access-control-allow-credentials"], "true");
        quiz = r.body.find((q) => q.topic === "Operating System Basics");
      },
    );
    await t.test(
      "new-user learning and persisted assignment hide answers",
      async () => {
        assert.ok(
          (await b.get("/api/learning")).body.topics.every(
            (t) => t.status === "Not enough data",
          ),
        );
        const r = await a
          .post(`/api/quiz/${quiz.id}/start`)
          .set("X-CSRF-Token", tokenA)
          .send({});
        assert.equal(r.status, 201);
        attempt = r.body;
        assert.equal(attempt.questions[0].correctOptionIndex, undefined);
        assert.equal(attempt.questions[0].explanation, undefined);
        const bad = await a
          .post(`/api/quiz/${quiz.id}/submit`)
          .set("X-CSRF-Token", tokenA)
          .send({
            attemptId: attempt.attemptId,
            answers: [
              { questionId: attempt.questions[0].id, selectedOptionIndex: 999 },
            ],
          });
        assert.equal(bad.status, 400);
        const forged = await b
          .post(`/api/quiz/${quiz.id}/submit`)
          .set("X-CSRF-Token", tokenB)
          .send({ attemptId: attempt.attemptId, answers: [] });
        assert.equal(forged.status, 404);
      },
    );
    await t.test(
      "submission derives ownership, scores and duration; retries are idempotent",
      async () => {
        const payload = {
          attemptId: attempt.attemptId,
          userId: userB.id,
          scorePercentage: 100,
          attemptType: "practice",
          timeTakenSeconds: 999999,
          answers: [],
        };
        const responses = await Promise.all([
          a
            .post(`/api/quiz/${quiz.id}/submit`)
            .set("X-CSRF-Token", tokenA)
            .send(payload),
          a
            .post(`/api/quiz/${quiz.id}/submit`)
            .set("X-CSRF-Token", tokenA)
            .send(payload),
        ]);
        for (const r of responses) assert.equal(r.status, 200);
        assert.equal(responses[0].body.resultId, responses[1].body.resultId);
        result = responses[0].body;
        assert.equal(result.scorePercentage, 0);
        assert.equal(result.attemptType, "standard");
        assert.ok(result.timeTakenSeconds < 100);
        assert.equal(
          (
            await pool.query("select user_id from results where id=$1", [
              result.resultId,
            ])
          ).rows[0].user_id,
          userA.id,
        );
        const before = await snapshot();
        await seed();
        assert.deepEqual(await snapshot(), before);
      },
    );
    await t.test(
      "progress, review and topic evidence are isolated and calculated from persisted answers",
      async () => {
        const p = (await a.get("/api/progress")).body;
        assert.equal(p.summary.total, 1);
        assert.equal(p.summary.average, 0);
        assert.equal((await b.get("/api/progress")).body.summary.total, 0);
        assert.equal(
          (await b.get("/api/results/" + result.resultId)).status,
          404,
        );
        assert.equal(
          (await a.get("/api/results/" + result.resultId)).body.review.length,
          5,
        );
        const t = (await a.get("/api/learning")).body.topics.find(
          (t) => t.topic === quiz.topic,
        );
        assert.equal(t.answered, 5);
        assert.equal(t.incorrect, 5);
        assert.equal(t.recentAccuracy, 0);
        assert.equal(t.status, "Needs revision");
      },
    );
    await t.test(
      "practice is server-selected, unique, persisted, scored and excluded from leaderboard",
      async () => {
        const p = await a
          .post("/api/practice")
          .set("X-CSRF-Token", tokenA)
          .send({ attemptType: "standard", userId: userB.id });
        assert.equal(p.status, 201);
        assert.equal(p.body.attemptType, "practice");
        assert.equal(
          new Set(p.body.questions.map((q) => q.id)).size,
          p.body.questions.length,
        );
        const r = await a
          .post(`/api/quiz/${p.body.id}/submit`)
          .set("X-CSRF-Token", tokenA)
          .send({
            attemptId: p.body.attemptId,
            answers: [],
            attemptType: "standard",
            scorePercentage: 100,
          });
        assert.equal(r.status, 200);
        assert.equal(r.body.attemptType, "practice");
        const progress = (await a.get("/api/progress")).body;
        assert.equal(progress.summary.total, 2);
        assert.equal(progress.standard.total, 1);
        assert.equal(
          (await a.get(`/api/leaderboard/${quiz.id}`)).body.total,
          1,
        );
        assert.ok(
          (await a.get("/api/learning")).body.topics.reduce(
            (n, t) => n + t.answered,
            0,
          ) > 5,
        );
      },
    );
    const complete = async (agent, token, correct) => {
      const attempt = (
        await agent
          .post(`/api/quiz/${quiz.id}/start`)
          .set("X-CSRF-Token", token)
          .send({})
      ).body;
      const assigned = (
        await pool.query("select snapshot from attempts where id=$1", [
          attempt.attemptId,
        ])
      ).rows[0].snapshot;
      const answers = assigned.questions.map((q) => ({
        questionId: q.id,
        selectedOptionIndex: correct
          ? q.correctOptionIndex
          : (q.correctOptionIndex + 1) % q.options.length,
      }));
      return agent
        .post(`/api/quiz/${quiz.id}/submit`)
        .set("X-CSRF-Token", token)
        .send({ attemptId: attempt.attemptId, answers });
    };
    await t.test(
      "best attempts, ties, own rank and privacy; changed quiz versions do not mix",
      async () => {
        await complete(a, tokenA, true);
        await complete(a, tokenA, false);
        await complete(b, tokenB, true);
        const rank = await a.get(`/api/leaderboard/${quiz.id}`);
        assert.equal(rank.status, 200);
        assert.equal(rank.body.total, 2);
        assert.deepEqual(
          rank.body.rows.map((r) => r.rank),
          [1, 1],
        );
        assert.equal(rank.body.currentUser.rank, 1);
        assert.equal(rank.body.rows[0].username, "alice");
        assert.equal(rank.body.rows[0].isCurrentUser, true);
        assert.equal(rank.body.rows[0].email, undefined);
        assert.equal(rank.body.rows[0].id, undefined);
        assert.equal(
          (await a.get(`/api/leaderboard/${quiz.id}?page=2`)).body.rows.length,
          0,
        );
        assert.equal(
          (await a.get(`/api/leaderboard/${quiz.id}?page=0`)).status,
          400,
        );
        await pool.query(
          "update quizzes set title=title||' updated' where id=$1",
          [quiz.id],
        );
        assert.equal(
          (await a.get(`/api/leaderboard/${quiz.id}`)).body.total,
          0,
        );
        await pool.query(
          "update quizzes set title=replace(title,' updated','') where id=$1",
          [quiz.id],
        );
      },
    );
    await t.test(
      "leaderboard pagination, shared-account exclusion and stable own rank",
      async () => {
        const service = require("../attempts");
        for (let i = 0; i < 22; i++) {
          const u = (
            await pool.query(
              "insert into users(name,username,email,password_hash,auth_enabled,leaderboard_enabled) values('Fixture',$1,$2,'disabled-test-fixture',true,true) returning id",
              [
                "fixture_" + String(i).padStart(2, "0"),
                `fixture_${i}@example.com`,
              ],
            )
          ).rows[0];
          const a = await service.start(u.id, quiz.id);
          await service.submit(u.id, a.attemptId, [], quiz.id);
        }
        const shared = await service.start(legacy.id, quiz.id);
        await service.submit(legacy.id, shared.attemptId, [], quiz.id);
        const first = (await a.get(`/api/leaderboard/${quiz.id}?page=1`)).body,
          second = (await a.get(`/api/leaderboard/${quiz.id}?page=2`)).body;
        assert.equal(first.total, 24);
        assert.equal(first.rows.length, 20);
        assert.equal(second.rows.length, 4);
        assert.equal(second.currentUser.rank, 1);
        assert.ok(second.rows.every((r) => r.rank === 3));
        assert.equal(
          new Set([...first.rows, ...second.rows].map((r) => r.username)).size,
          24,
        );
      },
    );
    await t.test(
      "session refresh and backend recreation preserve authentication, logout invalidates",
      async () => {
        assert.equal((await a.get("/api/auth/me")).status, 200);
        const login = http.agent(app),
          token = await csrf(login);
        const bad = await login
          .post("/api/auth/login")
          .set("X-CSRF-Token", token)
          .send({ username: "alice", password: "wrong" });
        assert.equal(bad.status, 401);
        assert.equal(bad.body.error, "Invalid username or password");
        const good = await login
          .post("/api/auth/login")
          .set("X-CSRF-Token", token)
          .send({ username: " ALICE ", password: " strong password 123 " });
        assert.equal(good.status, 200);
        const cookie = good.headers["set-cookie"][0].split(";")[0];
        assert.match(good.headers["set-cookie"][0], /HttpOnly/);
        assert.match(good.headers["set-cookie"][0], /SameSite=Lax/);
        const restarted = createApp();
        assert.equal(
          (await http(restarted).get("/api/auth/me").set("Cookie", cookie))
            .status,
          200,
        );
        const { fork } = require("node:child_process");
        async function boot() {
          const child = fork(
            path.join(__dirname, "fixtures/session-server.js"),
            [],
            { env: process.env, stdio: ["ignore", "ignore", "ignore", "ipc"] },
          );
          const port = await new Promise((resolve, reject) => {
            child.once("message", (m) => resolve(m.port));
            child.once("error", reject);
            child.once("exit", (code) =>
              reject(new Error("Child server exited " + code)),
            );
          });
          return { child, port };
        }
        for (let restart = 0; restart < 2; restart++) {
          const { child, port } = await boot();
          try {
            const r = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
              headers: { Cookie: cookie },
            });
            assert.equal(r.status, 200);
            assert.equal((await r.json()).user.id, userA.id);
          } finally {
            child.kill("SIGTERM");
            await new Promise((resolve) => child.once("exit", resolve));
          }
        }

        assert.equal(
          (
            await login
              .post("/api/auth/logout")
              .set("X-CSRF-Token", good.body.csrfToken)
              .send({})
          ).status,
          200,
        );
        assert.equal(
          (await http(restarted).get("/api/auth/me").set("Cookie", cookie))
            .status,
          401,
        );
        const l = http.agent(app),
          lcsrf = await csrf(l);
        assert.equal(
          (
            await l
              .post("/api/auth/login")
              .set("X-CSRF-Token", lcsrf)
              .send({
                username: "legacy_" + legacy.id.replaceAll("-", ""),
                password: "seed-placeholder-hash",
              })
          ).status,
          401,
        );
      },
    );
    await t.test("rate limiting blocks excessive login attempts", async () => {
      const agent = http.agent(app),
        token = await csrf(agent);
      let response;
      for (let i = 0; i < 105; i++) {
        response = await agent
          .post("/api/auth/login")
          .set("X-CSRF-Token", token)
          .send({ username: "missing", password: "invalid" });
        if (response.status === 429) break;
      }
      assert.equal(response.status, 429);
    });
    await t.test(
      "small question banks produce a valid one-question practice assignment",
      async () => {
        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query("create schema small_bank");
          await c.query("set local search_path=small_bank,public");
          await c.query(schema);
          await c.query(
            "insert into users(name,email,username,password_hash) values('Small','small@example.com','small','disabled')",
          );
          const u = (await c.query("select id from users")).rows[0].id;
          await c.query(
            "insert into questions(topic,question_text,options,correct_option_index) values('Operating System Basics','Only question',array['A','B'],0)",
          );
          await c.query(
            "insert into quizzes(title,topic) values('Diagnostic','Operating System Basics')",
          );
          await c.query("commit");
          // Separate pool confines search_path for this fixture without touching public data.
          const tiny = new Pool({
            connectionString: process.env.DATABASE_URL,
            options: "-c search_path=small_bank,public",
          });
          const original = pool.connect.bind(pool),
            query = pool.query.bind(pool);
          pool.connect = tiny.connect.bind(tiny);
          pool.query = tiny.query.bind(tiny);
          try {
            const p = await require("../attempts").start(u, null, true);
            assert.equal(p.questions.length, 1);
          } finally {
            pool.connect = original;
            pool.query = query;
            await tiny.end();
          }
        } catch (e) {
          await c.query("rollback");
          throw e;
        } finally {
          c.release();
        }
      },
    );
  } finally {
    if (pool) await pool.end();
    await pg.stop();
  }
});
