import { it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QuizAttempt from "../components/QuizAttempt";
vi.mock("../hooks/useStopwatch", () => ({
  useStopwatch: () => ({
    elapsed: 15,
    remaining: 45,
    getElapsedSeconds: () => 15,
  }),
}));
it("timer danger communicates its urgency in text as well as color", async () => {
  render(
    <QuizAttempt
      quizId="quiz-1"
      assignedQuiz={{
        id: "quiz-1",
        attemptId: "assigned",
        title: "Timed quiz",
        topic: "Mixed",
        isTimed: true,
        timeLimitMinutes: 1,
        questions: [
          {
            id: "q1",
            topic: "CPU Scheduling",
            difficulty: "easy",
            questionText: "Existing question?",
            options: ["A", "B", "C", "D"],
          },
        ],
      }}
      onFinished={vi.fn()}
      onExit={vi.fn()}
    />,
  );
  expect(await screen.findByText("Less than a minute remaining.")).toBeTruthy();
  expect(screen.getByRole("timer").textContent).toContain("00:45");
});
