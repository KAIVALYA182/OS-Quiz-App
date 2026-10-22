const { listQuizzes } = require("../db/queries");
const { pool } = require("../config/db");
const attempts = require("../attempts");
const { wrap } = require("../auth");
const list = wrap(async (req, res) => res.json(await listQuizzes()));
const getOne = wrap(async (req, res) => {
  const quiz = await attempts.loadQuiz(pool, req.params.quizId);
  // Catalogue detail never exposes the unassigned pool. Start an attempt to get questions.
  const { questions, ...metadata } = quiz;
  res.json({ ...metadata, poolSize: questions.length,
    questionCount: quiz.topic === "Mixed" ? questions.length : Math.min(20, questions.length),
    selectionMode: quiz.topic === "Mixed" ? "fixed" : "random" });
});
const start = wrap(async (req, res) =>
  res.status(201).json(await attempts.start(req.user.id, req.params.quizId)),
);
module.exports = { list, getOne, start };
