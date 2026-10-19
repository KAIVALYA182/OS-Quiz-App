// backend/routes/quizRoutes.js
const express = require("express");
const router = express.Router();
const { list, getOne } = require("../controllers/quizController");

// GET /api/quiz            -> all quizzes (id, title, topic, timing, questionCount)
// GET /api/quiz/:quizId    -> one quiz with its questions (no correct answers)
router.get("/", list);
router.get("/:quizId", getOne);

module.exports = router;
