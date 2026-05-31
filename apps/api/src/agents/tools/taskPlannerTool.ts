export type TaskPlanInput = {
  objective: string;
  riskLevel: string;
};

export function taskPlannerTool(input: TaskPlanInput): string[] {
  return [`Review objective: ${input.objective}`, `Confirm risk: ${input.riskLevel}`];
}
