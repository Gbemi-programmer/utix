export {
  allowedTransitions,
  applyTransition,
  createLifecycle,
  type ApplyTransitionOptions,
  type LifecycleDefinition,
  type LifecycleErrorCode,
  type LifecycleMachine,
  type LifecycleRecord,
  type LifecycleView,
  type TransitionContext,
  type TransitionOutcome,
  type TransitionRecord,
  type TransitionRule
} from "@/core/lifecycle/lifecycle";

export {
  exportEnvelopeMachine,
  labelsFor,
  LIFECYCLE_LABELS,
  notificationMachine,
  operationMachine,
  recordMachine,
  RECORD_MACHINES,
  stateView,
  transitionRecord,
  workerJobMachine,
  type CoreRecordKind,
  type StateView
} from "@/core/lifecycle/records";
