# Chat Shared Component Migration Plan

Status: Required follow-up
Owner: Web Platform
Date: 2026-05-21

## Goal
Create one shared chat message rendering component used by all chat surfaces to eliminate duplicated logic and reduce future bug risk.

Current duplicated surfaces:
- apps/web/src/components/floating-chat.tsx
- apps/web/src/components/project-chat.tsx
- apps/web/src/app/admin/messaging/page.tsx

Supporting logic already in place:
- apps/web/src/components/chat-event-card.tsx
- apps/web/src/lib/chat-event-parser.ts

## Scope
In scope:
- Shared message list and message bubble rendering
- Structured event rendering via parseChatEvent + ChatEventCard
- Attachments rendering
- Sender label rendering and timestamp rendering
- Theme/surface support for light and dark contexts

Out of scope:
- Reworking transport/API fetching logic
- Reworking composer UX (input/send area)
- Replacing business rules for message permissions

## Effort and Risk
Estimated effort: 1.5 to 3.5 dev days
- Component extraction: 0.5 to 1.5 days
- Integration into 3 surfaces: 0.5 to 1 day
- Regression fixes and QA: 0.5 to 1 day

Risk level:
- Functional risk: Low
- UI regression risk: Medium
- Performance risk: Low to Medium
- Schedule risk: Medium (if done as big-bang), Low (if phased)

## Target Architecture
Create a shared rendering module:
- apps/web/src/components/chat/shared/chat-message-list.tsx
- apps/web/src/components/chat/shared/chat-message-bubble.tsx
- apps/web/src/components/chat/shared/chat-message-types.ts

Keep small adapters at each surface:
- Map local message shape to a normalized view model
- Keep fetching and state management local to each surface

## Proposed Shared Types
```ts
export type ChatSurfaceTheme = 'light' | 'dark' | 'auto';

export type NormalizedAttachment = {
  id?: string;
  url: string;
  filename?: string;
  mimeType?: string;
};

export type NormalizedChatMessage = {
  id: string;
  content: string | null;
  createdAt: string | Date;
  senderType: 'foh' | 'professional' | 'client' | 'user' | 'system';
  senderLabel?: string;
  attachments?: NormalizedAttachment[];
};

export type ChatMessageListProps = {
  messages: NormalizedChatMessage[];
  currentSenderType?: 'foh' | 'professional' | 'client' | 'user';
  theme?: ChatSurfaceTheme;
  className?: string;
  showSenderLabel?: boolean;
  showTimestamp?: boolean;
  parseEvents?: boolean;
};
```

## Rendering Rules
1. Parse structured events only when content starts with [[event]].
2. If parsed event exists, render ChatEventCard.
3. In light surfaces, wrap ChatEventCard in a dark container for readability.
4. For non-event text, preserve whitespace with pre-wrap.
5. Render attachments only for non-event messages.
6. Keep sender label and timestamp hidden for event cards unless explicitly needed.

## Phase Plan (Safe PR Series)

### PR 1: Introduce shared presentational components only
Deliverables:
- Add shared types + shared list/bubble components
- No replacement of existing surfaces yet
- Story-like local examples or minimal test harness in existing pages

Acceptance criteria:
- Builds cleanly
- New component can render plain text, event card, and attachments from mock props

Rollback:
- Remove new shared folder only

### PR 2: Migrate floating chat to shared renderer
Deliverables:
- Replace in-surface map/bubble rendering in floating-chat.tsx with shared component
- Keep existing fetch/send logic unchanged

Acceptance criteria:
- Message order unchanged
- Event cards render exactly as before
- Attachments and timestamps match previous behavior

Rollback:
- Revert floating chat adapter only

### PR 3: Migrate project chat to shared renderer
Deliverables:
- Replace in-surface rendering in project-chat.tsx with shared component

Acceptance criteria:
- Professional/client labels still correct
- Existing project chat behavior unchanged

Rollback:
- Revert project chat adapter only

### PR 4: Migrate admin messaging to shared renderer
Deliverables:
- Replace admin message panes rendering loop with shared component + admin adapter
- Preserve light-surface dark wrapper behavior for event cards

Acceptance criteria:
- No raw [[event]] JSON visible
- Event cards readable in admin panel
- No attachment rendering regressions

Rollback:
- Revert admin adapter and keep current known-good inline logic

### PR 5: Cleanup and hardening
Deliverables:
- Remove dead duplicated helper code
- Add tests and visual regression coverage
- Add docs for shared component usage

Acceptance criteria:
- No duplicate bubble rendering logic in migrated surfaces
- Test suite covers event parsing + attachments + sender labels

## Test Checklist
Functional:
- Plain text message rendering
- Structured generic event rendering
- Quote submitted/accepted event rendering
- Attachment thumbnail and link rendering
- Sender labels for foh/professional/client/user

Visual:
- Light background readability for event cards
- Dark background readability for event cards
- Mobile width wrapping for long content

Behavioral:
- No duplicate fetch side effects introduced by refactor
- No key/index rendering warnings

## Risk Controls
- Keep behavior adapters local per surface
- Do not change API contracts during refactor
- Migrate one surface per PR
- Use quick rollback path per PR
- Test each surface with real seed data before merge

## Definition of Done
- All three chat surfaces use the shared renderer
- Event rendering behavior is consistent across surfaces
- No raw structured payloads are shown to users
- Existing chat UX parity is maintained
- Documentation updated for future contributors

## Recommended Execution Window
Best done after current urgent fixes are stable and merged.
Preferred sequence: PR 1 -> PR 2 -> PR 3 -> PR 4 -> PR 5 over 2 to 4 days.
