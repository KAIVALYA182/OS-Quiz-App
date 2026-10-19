// frontend/src/api/scoreApi.js
import { request } from "./client";

/**
 * @param {string} quizId
 * @param {{ attemptId: string, answers: Array<{questionId: string, selectedOptionIndex: number}>, timeTakenSeconds?: number }} payload
 * @returns the scored result, including `review` (every question with the correct answer and explanation)
 */
export function submitQuizAnswers(quizId, payload) {
  return request(`/quiz/${quizId}/submit`, { method: "POST", body: JSON.stringify(payload) });
}
