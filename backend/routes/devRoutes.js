// Retired: shared test-account authentication is deliberately unavailable.
const router = require("express").Router();
router.all("*", (req, res) =>
  res.status(410).json({ error: "Use /api/auth/login or /api/auth/register." }),
);
module.exports = router;
