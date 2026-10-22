const bank = require("../data/questions");
const {
  validateBank,
  nearDuplicates,
} = require("../utils/questionBankValidation");
const { errors, counts, total } = validateBank(bank);
console.table(
  counts.map(({ answers, ...c }) => ({ ...c, "A/B/C/D": answers.join("/") })),
);
console.log(`Topics: ${counts.length}; questions: ${total}`);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Question structure, counts, difficulty mix, keys, normalized content and answer distribution validated.",
  );
const candidates = nearDuplicates(bank);
if (candidates.length) {
  console.log("Similarity candidates requiring editorial review:");
  console.table(candidates);
}
