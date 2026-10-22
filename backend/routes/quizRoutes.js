// backend/routes/quizRoutes.js
const express = require("express");
const router = express.Router();
const { list, getOne, start } = require("../controllers/quizController");

// GET /api/quiz            -> all quizzes (id, title, topic, timing, questionCount)
// GET /api/quiz/:quizId    -> quiz metadata only; POST start assigns questions
router.get("/", list);
router.get("/:quizId", getOne);
router.post("/:quizId/start", start);

module.exports = router;
