// backend/utils/scoringEngine.js
// Pure functions only — no DB calls, no req/res. Easy to unit test in
// isolation and reused by both the API route and (if you add it later) any
// CLI or test script.

/**
 * @param {Array} questions - question rows (must include id, topic and correctOptionIndex)
 * @param {Array} submittedAnswers - [{ questionId, selectedOptionIndex }]
 * @returns {{
 *   answers: Array,
 *   totalQuestions: number,
 *   correctCount: number,
 *   scorePercentage: number,
 *   topicBreakdown: Array<{topic: string, correct: number, total: number}>
 * }}
 */
function calculateScore(questions, submittedAnswers) {
  const answerMap = new Map(
    submittedAnswers.map((a) => [String(a.questionId), a.selectedOptionIndex])
  );

  const topicTally = new Map(); // topic -> { correct, total }
  const answers = [];
  let correctCount = 0;

  for (const question of questions) {
    const qId = String(question.id);
    const selectedOptionIndex = answerMap.has(qId) ? answerMap.get(qId) : -1;
    const isCorrect = selectedOptionIndex === question.correctOptionIndex;

    if (isCorrect) correctCount += 1;

    answers.push({ questionId: question.id, selectedOptionIndex, isCorrect });

    const tally = topicTally.get(question.topic) || { correct: 0, total: 0 };
    tally.total += 1;
    if (isCorrect) tally.correct += 1;
    topicTally.set(question.topic, tally);
  }

  const totalQuestions = questions.length;
  const scorePercentage = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  const topicBreakdown = Array.from(topicTally.entries()).map(([topic, tally]) => ({
    topic,
    correct: tally.correct,
    total: tally.total,
  }));

  return { answers, totalQuestions, correctCount, scorePercentage, topicBreakdown };
}

module.exports = { calculateScore };
