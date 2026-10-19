// backend/scripts/testScoring.js
// Quick sanity check for the scoring engine + feedback generator, with no
// DB or server required. Run with: node scripts/testScoring.js

const { calculateScore } = require("../utils/scoringEngine");
const { generateFeedback } = require("../utils/feedbackGenerator");

const mockQuestions = [
  { id: "q1", topic: "Deadlocks", correctOptionIndex: 2 },
  { id: "q2", topic: "Deadlocks", correctOptionIndex: 0 },
  { id: "q3", topic: "CPU Scheduling", correctOptionIndex: 1 },
  { id: "q4", topic: "CPU Scheduling", correctOptionIndex: 3 },
];

const mockAnswers = [
  { questionId: "q1", selectedOptionIndex: 2 }, // correct
  { questionId: "q2", selectedOptionIndex: 1 }, // wrong
  { questionId: "q3", selectedOptionIndex: 1 }, // correct
  { questionId: "q4", selectedOptionIndex: 3 }, // correct
  // note: 4 answered out of 4 questions
];

const result = calculateScore(mockQuestions, mockAnswers);
const feedback = generateFeedback(result.scorePercentage, result.topicBreakdown);

console.log("Scoring result:", JSON.stringify(result, null, 2));
console.log("\nFeedback message:", feedback);

// Expect: 3/4 correct = 75%, Deadlocks 1/2, CPU Scheduling 2/2
const expectedPercentage = 75;
console.log(
  result.scorePercentage === expectedPercentage
    ? `\n✔ PASS — got ${result.scorePercentage}% as expected`
    : `\n✘ FAIL — expected ${expectedPercentage}%, got ${result.scorePercentage}%`
);
