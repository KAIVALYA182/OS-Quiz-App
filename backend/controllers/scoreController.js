const { submit } = require("../attempts");
const { wrap } = require("../auth");
const submitQuiz = wrap(async (req, res) => {
  const result = await submit(
    req.user.id,
    req.body.attemptId,
    req.body.answers,
    req.params.quizId,
  );
  res.json(result);
});
module.exports = { submitQuiz };
