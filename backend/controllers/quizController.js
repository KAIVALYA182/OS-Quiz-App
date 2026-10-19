// backend/controllers/quizController.js
// Quiz Engine endpoints: list the available quizzes, and serve one quiz's
// questions to a student. The correct answers are deliberately never sent here;
// they only come back after submission (see scoreController).

const { listQuizzes } = require("../db/queries");
const { loadQuiz: loadAssignedQuiz } = require("../attempts");
const { pool } = require("../config/db");

async function list(req, res) {
  try {
    res.json(await listQuizzes());
  } catch (err) {
    console.error("listQuizzes error:", err);
    res.status(500).json({ error: "Could not load the quiz list." });
  }
}

async function getOne(req, res) {
  try {
    const quiz = await loadAssignedQuiz(pool, req.params.quizId);
    if (!quiz) return res.status(404).json({ error: "Quiz not found." });
    res.json({
      ...quiz,
      questions: quiz.questions.map(
        ({ correctOptionIndex, explanation, ...q }) => q,
      ),
    });
  } catch (err) {
    // 22P02 = the id isn't a valid UUID, which can't match any quiz.
    if (err.code === "22P02")
      return res.status(404).json({ error: "Quiz not found." });
    console.error("getQuiz error:", err);
    res.status(500).json({ error: "Could not load the quiz." });
  }
}

module.exports = { list, getOne };
