// backend/utils/feedbackGenerator.js
// Turns a raw score + topic breakdown into a message a student can act on.
// Kept separate from scoringEngine.js so the "what does this score mean"
// wording can change freely without touching the scoring math.

function generateFeedback(scorePercentage, topicBreakdown) {
  let headline;
  if (scorePercentage >= 90) headline = "Excellent work — you've got a strong grip on this material.";
  else if (scorePercentage >= 75) headline = "Solid performance. A little more practice and this is mastered.";
  else if (scorePercentage >= 50) headline = "You're on the right track, but a few concepts need another pass.";
  else headline = "This topic needs more review before it sticks — that's normal, keep going.";

  // Flag any topic where the student got under 60% right, so long as there
  // were enough questions on that topic to make the ratio meaningful.
  const weakTopics = topicBreakdown
    .filter((t) => t.total >= 2 && t.correct / t.total < 0.6)
    .map((t) => t.topic);

  let detail = "";
  if (weakTopics.length === 1) {
    detail = `Focus your next review session on ${weakTopics[0]}.`;
  } else if (weakTopics.length > 1) {
    detail = `Focus your next review session on: ${weakTopics.join(", ")}.`;
  } else if (scorePercentage < 100) {
    detail = "No single topic stood out as weak — review your missed questions individually.";
  }

  return detail ? `${headline} ${detail}` : headline;
}

module.exports = { generateFeedback };
