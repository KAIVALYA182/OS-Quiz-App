// backend/scripts/validateQuestions.js
// Checks data/questions.js for mistakes BEFORE it reaches the database, so a typo
// doesn't surface as a confusing SQL error halfway through a seed. No DB needed.
//
// Run with: npm run validate:questions

const fs = require("fs");
const path = require("path");
const bank = require("../data/questions");

const schemaSql = fs.readFileSync(path.join(__dirname, "../db/schema.sql"), "utf8");
const DIFFICULTIES = ["easy", "medium", "hard"];
const EXPECTED_PER_TOPIC = 5;

const problems = [];
const fail = (where, msg) => problems.push(`${where}: ${msg}`);

const seenTopics = new Set();
const seenQuestions = new Set();
const seenKeys = new Set();
const answerPositions = [0, 0, 0, 0, 0, 0];
let total = 0;

for (const entry of bank) {
  const { topic, questions } = entry;

  if (seenTopics.has(topic)) fail(topic, "duplicate topic block");
  seenTopics.add(topic);

  // The topic must be allowed by the CHECK constraint in schema.sql.
  if (!schemaSql.includes(`'${topic}'`)) fail(topic, "topic not listed in db/schema.sql CHECK constraint");

  if (questions.length !== EXPECTED_PER_TOPIC) {
    fail(topic, `has ${questions.length} questions, expected ${EXPECTED_PER_TOPIC}`);
  }

  questions.forEach((q, i) => {
    const where = `${topic} Q${i + 1}`;
    total += 1;
    if (!q.seedKey || seenKeys.has(q.seedKey)) fail(where, "missing or duplicate stable seedKey");
    seenKeys.add(q.seedKey);

    if (!q.questionText || !q.questionText.trim()) fail(where, "empty questionText");
    if (seenQuestions.has(q.questionText)) fail(where, "duplicate questionText");
    seenQuestions.add(q.questionText);

    if (!DIFFICULTIES.includes(q.difficulty)) fail(where, `bad difficulty "${q.difficulty}"`);
    if (!q.explanation || !q.explanation.trim()) fail(where, "missing explanation");

    if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 6) {
      fail(where, "options must be an array of 2-6 strings");
      return;
    }
    if (q.options.some((o) => typeof o !== "string" || !o.trim())) fail(where, "empty or non-string option");
    if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== q.options.length) {
      fail(where, "duplicate options");
    }
    if (!Number.isInteger(q.correctOptionIndex) || q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) {
      fail(where, `correctOptionIndex ${q.correctOptionIndex} is out of range`);
    } else {
      answerPositions[q.correctOptionIndex] += 1;
    }
  });
}

console.log(`Topics: ${seenTopics.size}   Questions: ${total}`);
console.log(
  "Correct-answer position spread:",
  answerPositions
    .slice(0, 4)
    .map((n, i) => `option ${i}: ${n}`)
    .join(", ")
);

if (problems.length) {
  console.error(`\n${problems.length} problem(s) found:`);
  problems.forEach((p) => console.error("  - " + p));
  process.exit(1);
}
console.log("\n✔ Question bank looks valid.");
