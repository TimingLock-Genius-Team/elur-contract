export const v4HookProductionSteps = [
  "generated",
  "verified",
  "deployed",
  "submitted",
  "verificationPublished",
  "registryAdvanced",
  "approved",
] as const;

export type V4HookProductionStep = (typeof v4HookProductionSteps)[number];
export type V4HookProductionStepStatus = "pending" | "pass" | "fail";

export type V4HookProductionPipelineState = {
  generationId: string;
  hookId: string;
  chainId: number;
  steps: Record<V4HookProductionStep, V4HookProductionStepStatus>;
};

export function nextV4HookProductionStep(
  state: V4HookProductionPipelineState,
): V4HookProductionStep | null {
  for (const step of v4HookProductionSteps) {
    if (state.steps[step] !== "pass") return step;
  }
  return null;
}

export function requireV4HookProductionStep(
  state: V4HookProductionPipelineState,
  step: V4HookProductionStep,
): void {
  const stepIndex = v4HookProductionSteps.indexOf(step);
  for (const prerequisite of v4HookProductionSteps.slice(0, stepIndex)) {
    const status = state.steps[prerequisite];
    if (status === "fail") {
      throw new Error(`Cannot execute ${step} because ${prerequisite} failed`);
    }
    if (status !== "pass") {
      throw new Error(`Cannot execute ${step} before ${prerequisite}`);
    }
  }
}
