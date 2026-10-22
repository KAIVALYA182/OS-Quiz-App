require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB } = require("./config/db");
const { configureAuth, requireAuth, wrap } = require("./auth");
const { listQuizzes } = require("./db/queries");
const attempts = require("./attempts");
function createApp() {
  const app = express();
  const origins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim());
  if (process.env.NODE_ENV === "production" && !process.env.CLIENT_ORIGIN)
    throw new Error("CLIENT_ORIGIN is required in production.");
  app.disable("x-powered-by");
  app.use("/api", (req, res, next) => {
    const origin = req.get("Origin");
    if (origin && !origins.includes(origin))
      return res.status(403).json({ error: "Origin not allowed." });
    next();
  });
  app.use(cors({ origin: origins, credentials: true }));
  app.use(express.json({ limit: "64kb" }));
  configureAuth(app);
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));
  app.use("/api", requireAuth);
  app.use("/api/quiz", require("./routes/quizRoutes"));
  app.use("/api/quiz", require("./routes/scoreRoutes"));
  app.get("/api/attempts/:id", wrap(async (req, res) =>
    res.json(await attempts.getAttempt(req.user.id, req.params.id)),
  ));
  app.get(
    "/api/progress",
    wrap(async (req, res) => res.json(await attempts.progress(req.user.id))),
  );
  app.get(
    "/api/results/:id",
    wrap(async (req, res) =>
      res.json(await attempts.result(req.user.id, req.params.id)),
    ),
  );
  app.get(
    "/api/learning",
    wrap(async (req, res) =>
      res.json({
        topics: await attempts.learning(req.user.id),
        suggestedQuiz:
          (await listQuizzes())
            .filter((q) => q.questionCount > 0)
            .sort(
              (a, b) =>
                Number(b.topic === "Operating System Basics") -
                Number(a.topic === "Operating System Basics"),
            )[0] || null,
      }),
    ),
  );
  app.post(
    "/api/practice",
    wrap(async (req, res) =>
      res.status(201).json(await attempts.start(req.user.id, null, true)),
    ),
  );
  app.get(
    "/api/leaderboard/:quizId",
    wrap(async (req, res) =>
      res.json(
        await attempts.leaderboard(
          req.user.id,
          req.params.quizId,
          Number(req.query.page || 1),
          req.query.version,
        ),
      ),
    ),
  );
  app.use((req, res) => res.status(404).json({ error: "Endpoint not found." }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const status =
      err.status || (err.type === "entity.parse.failed" ? 400 : 500);
    if (status >= 500) console.error("Request failed", err.code || err.name);
    res.status(status).json({
      error:
        status >= 500 ? "The request could not be completed." : err.message,
    });
  });
  return app;
}
module.exports = { createApp };
if (require.main === module) {
  const app = createApp();
  connectDB().then(() =>
    app.listen(process.env.PORT || 5000, () =>
      console.log("OS Quiz server started."),
    ),
  );
}
