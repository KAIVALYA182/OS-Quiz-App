// backend/routes/scoreRoutes.js
const express = require("express");
const router = express.Router();
const { submitQuiz } = require("../controllers/scoreController");

// POST /api/quiz/:quizId/submit
// body: { attemptId, answers: [{ questionId, selectedOptionIndex }] }
router.post("/:quizId/submit", submitQuiz);

module.exports = router;
