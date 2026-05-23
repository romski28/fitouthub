# AI Wizard Mode System

## Goal
Add an explicit mode system at the AI intake stage so the product can choose the right questioning style and scoping path immediately after the user's first prompt.

Primary modes under discussion:
- Repair
- Refresh
- Design

This note captures the current product thinking so it is not lost before implementation.

## Why A Mode System Matters
The current AI wizard treats many prompts too similarly. That creates follow-up questions that feel flat, repetitive, and overly form-like.

The main problem is that these project types are not the same:
- a repair request needs diagnosis and urgency handling
- a refresh request needs finish and scope clarification
- a design request needs conversation, taste calibration, option shaping, and ambiguity reduction

If the system identifies the mode early, it can ask better questions, write a better brief, and map the right downstream trade and professional path.

## Proposed Modes

### Repair
Best for faults, defects, replacements, and urgent works.

AI behavior:
- practical
- diagnostic
- fast
- risk-aware

Question style:
- what is wrong
- what changed
- when it started
- urgency and safety
- whether like-for-like replacement is acceptable

Typical output:
- concise repair brief
- probable specialist trades
- urgency recommendation

### Refresh
Best for cosmetic improvements without deep redesign.

AI behavior:
- light-touch design
- quicker than full design discovery
- focused on finishes and adjacent scope

Question style:
- what is being updated
- what look is desired
- whether finishes are selected already
- whether client wants options or knows what they want
- what making-good works are expected around the main upgrade

Typical output:
- scoped improvement brief
- likely trade stack
- optional upgrade package ideas

### Design
Best for concept-led spaces where style, flow, mood, and nuanced use matter.

AI behavior:
- conversational
- exploratory
- synthesis-driven
- able to propose options, not just ask questions

Question style:
- what the room should feel like
- what is not working today
- how the space is used
- which style direction fits best
- what must stay unchanged
- whether the client wants design input before quoting

Typical output:
- client-friendly design brief
- professional-ready scope note
- option paths such as light refresh, redesign, or design-led upgrade

## Prompt Extension
Yes, the existing prompt contract can be extended to include mode selection.

Suggested additions to the AI response contract:
- `modeSuggested`: `repair | refresh | design`
- `modeConfidence`: number
- `modeReasoning`: short explanation of why the mode was chosen
- `modeAlternatives`: optional nearby modes if the prompt is ambiguous

Suggested persisted project handoff fields later:
- `initialData.aiFrom.modeSuggested`
- `initialData.aiFrom.modeConfirmed`
- `initialData.aiFrom.modeReasoning`

This would let the platform distinguish between:
- what the AI inferred
- what the user or admin later confirmed

## Admin UX Idea
Surface the mode in the same general UI zone as the trade chips.

Current idea:
- keep trade chips as they are
- add a blue mode chip nearby for admins
- show values like `Repair`, `Refresh`, or `Design`

Possible admin behavior later:
- click to override mode
- show AI reasoning in tooltip or side panel
- compare original mode suggestion vs admin-confirmed mode

This would help internal QA and improve trust in the AI classification layer.

## Better AI Behavior For Design Mode
For design-heavy prompts, the AI should act less like a form and more like a guided scoping partner.

It should do four things:
1. discover intent
2. surface hidden constraints
3. synthesize what it has learned
4. propose plausible scope directions

Examples of stronger design questions:
- What do you want the room to feel like when finished?
- What feels wrong about the space today?
- Are you trying to improve look, function, layout, or all three?
- What must stay exactly as it is?
- Do you want execution only, or ideas and concept input as well?

## Output Strategy By Mode

### Repair output
- concise issue summary
- risk note
- recommended specialist type
- immediate next actions

### Refresh output
- upgrade brief
- finish preferences
- scope boundaries
- likely trade bundle

### Design output
- design brief summary
- taste and mood direction
- unresolved decisions
- scope package options
- likely trade stack
- questions to settle before quoting

## Product Principle
The system should not ask the same style of question for all jobs.

Instead:
- detect likely mode from prompt
- let that mode change the AI questioning style
- let admins see and potentially override the mode
- persist the mode through the brief and project creation flow

## Near-Term Recommendation
Before building the full mode system:
- extend the AI response to return a suggested mode
- show the mode for admin users beside trade chips as a blue chip
- use mode internally to vary the follow-up question generator

This gives immediate value without requiring a full redesign of the wizard.

## Open Questions
- Should `design` imply a longer conversational path by default?
- Should `refresh` sometimes branch into `design` if the user asks for ideas?
- Should mode affect matching logic, or only questioning and brief generation?
- Should client-facing mode labels be hidden at first and shown only to admins?

## Summary
The mode system looks like the key control layer for better AI intake.

It can make the wizard:
- less generic
- more context-aware
- better at design conversations
- more useful for both clients and professionals