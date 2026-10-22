const EXPECTED_TOPICS = [
  "Operating System Basics",
  "Process Management",
  "CPU Scheduling",
  "Concurrency & Synchronization",
  "Deadlocks",
  "Memory Management",
  "Virtual Memory",
  "File Systems",
  "I/O Management",
  "Protection & Security",
];
const normalize = (text) =>
  String(text)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
function validateBank(bank) {
  const errors = [],
    counts = [],
    seenKeys = new Set(),
    seenText = new Set(),
    seenTemplates = new Set();
  const check = (ok, where, message) => {
    if (!ok) errors.push(`${where}: ${message}`);
  };
  check(
    JSON.stringify(bank.map((g) => g.topic)) ===
      JSON.stringify(EXPECTED_TOPICS),
    "Bank",
    "topic list/order must match the existing ten topics",
  );
  for (const group of bank) {
    const difficulties = { easy: 0, medium: 0, hard: 0 },
      positions = [0, 0, 0, 0];
    check(
      group.questions.length === 50,
      group.topic,
      "expected exactly 50 questions",
    );
    for (const q of group.questions) {
      const where = `${group.topic} / ${q.seedKey}`;
      check(
        typeof q.seedKey === "string" &&
          q.seedKey.length > 0 &&
          !seenKeys.has(q.seedKey),
        where,
        "missing or duplicate seed key",
      );
      seenKeys.add(q.seedKey);
      const text = normalize(q.questionText),
        template = text.replace(/\d+(?:\s\d+)*/g, "#");
      check(
        text.length >= 15 && !seenText.has(text),
        where,
        "empty or duplicate normalized question",
      );
      seenText.add(text);
      check(
        !seenTemplates.has(template),
        where,
        "duplicate question template with changed numbers",
      );
      seenTemplates.add(template);
      check(
        q.topic === undefined || q.topic === group.topic,
        where,
        "question topic disagrees with section",
      );
      check(
        ["easy", "medium", "hard"].includes(q.difficulty),
        where,
        "invalid difficulty",
      );
      difficulties[q.difficulty]++;
      check(
        typeof q.explanation === "string" && q.explanation.trim().length >= 25,
        where,
        "clear explanation required",
      );
      check(
        Array.isArray(q.options) && q.options.length === 4,
        where,
        "exactly four options required",
      );
      if (!Array.isArray(q.options)) continue;
      check(
        q.options.every((o) => typeof o === "string" && o.trim().length > 0) &&
          new Set(q.options.map(normalize)).size === 4,
        where,
        "four distinct nonempty options required",
      );
      check(
        Number.isInteger(q.correctOptionIndex) &&
          q.correctOptionIndex >= 0 &&
          q.correctOptionIndex < 4,
        where,
        "invalid correct answer index",
      );
      positions[q.correctOptionIndex]++;
    }
    check(
      difficulties.easy === 15 &&
        difficulties.medium === 25 &&
        difficulties.hard === 10,
      group.topic,
      "difficulty target must be 15 easy / 25 medium / 10 hard",
    );
    check(
      positions.every((n) => n >= 10 && n <= 15),
      group.topic,
      "correct positions must each occur 10–15 times",
    );
    counts.push({
      topic: group.topic,
      total: group.questions.length,
      ...difficulties,
      answers: positions,
    });
  }
  return { errors, counts, total: counts.reduce((n, c) => n + c.total, 0) };
}
// A review aid, not a claim that text similarity alone establishes equivalence.
function nearDuplicates(bank, threshold = 0.72) {
  const all = bank.flatMap((g) => g.questions),
    tokens = all.map(
      (q) =>
        new Set(
          normalize(q.questionText)
            .split(" ")
            .filter((w) => w.length > 3),
        ),
    );
  const candidates = [];
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const intersection = [...tokens[i]].filter((t) =>
          tokens[j].has(t),
        ).length,
        union = new Set([...tokens[i], ...tokens[j]]).size;
      const similarity = union ? intersection / union : 0;
      if (similarity >= threshold)
        candidates.push({
          first: all[i].seedKey,
          second: all[j].seedKey,
          similarity: Number(similarity.toFixed(3)),
        });
    }
  return candidates;
}
module.exports = { EXPECTED_TOPICS, validateBank, nearDuplicates };
