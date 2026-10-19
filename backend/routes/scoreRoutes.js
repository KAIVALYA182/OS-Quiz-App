// backend/routes/scoreRoutes.js
const express = require("express");
const router = express.Router();
const { submitQuiz } = require("../controllers/scoreController");

// POST /api/quiz/:quizId/submit
// body: { userId, answers: [{ questionId, selectedOptionIndex }], timeTakenSeconds? }
router.post("/:quizId/submit", submitQuiz);

module.exports = router;
