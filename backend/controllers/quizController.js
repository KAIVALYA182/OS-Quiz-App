const { listQuizzes } = require("../db/queries");
const { pool } = require("../config/db");
const attempts = require("../attempts");
const { wrap } = require("../auth");
const list = wrap(async (req, res) => res.json(await listQuizzes()));
const getOne = wrap(async (req, res) => {
  const quiz = await attempts.loadQuiz(pool, req.params.quizId);
  res.json({
    ...quiz,
    questions: quiz.questions.map(
      ({ correctOptionIndex, explanation, ...q }) => q,
    ),
  });
});
const start = wrap(async (req, res) =>
  res.status(201).json(await attempts.start(req.user.id, req.params.quizId)),
);
module.exports = { list, getOne, start };
