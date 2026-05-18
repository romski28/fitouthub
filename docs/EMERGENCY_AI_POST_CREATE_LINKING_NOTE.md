# Emergency AI Post-Create Linking Note

## Context

In the emergency project workflow, the client can reach the confirmation screen before the background AI brief has completed.

The current lightweight fix is to block `Confirm & Send` until the AI brief has been received in the summary modal.

## Deferred Alternative

If this gate later proves too restrictive for client UX, the fallback approach is to allow emergency project creation immediately and reconcile the AI brief after the project has already been created.

## Proposed Approach

1. Add a dedicated backend project action to attach an AI intake to an existing project.
2. Make that action idempotent so duplicate attempts do not create side effects.
3. If an emergency project is created without an `aiIntakeId`, trigger a backend reconciliation step after creation.
4. Rebuild the AI prompt from stored project data such as trade, region, and notes.
5. When the AI brief returns, attach the intake to the project and update the fallback title only if it has not been manually changed.
6. Do not resend invites when the AI brief is attached later.

## Risks

- Race conditions between client-side AI completion and backend reconciliation.
- Duplicate AI generation cost if an existing intake is not reused.
- Project title drift if invites go out with the fallback emergency title and the title changes later.
- Fire-and-forget background work can be lost on process restart unless moved to a durable queue.
- Incorrect ownership checks could link the wrong AI intake to a project if validation is weak.

## Trigger To Revisit

Revisit this design only if the new confirm-button gate causes meaningful client friction or abandoned emergency sends.