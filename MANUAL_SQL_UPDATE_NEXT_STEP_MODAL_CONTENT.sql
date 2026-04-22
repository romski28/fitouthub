-- Manual schema/data update for DB-backed next-step modal content.
-- Run this directly against Postgres (no Supabase dependency).

BEGIN;

ALTER TABLE "NextStepConfig"
  ADD COLUMN IF NOT EXISTS "modalTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "modalBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalDetailsBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessTitle" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSuccessNextStepBody" TEXT,
  ADD COLUMN IF NOT EXISTS "modalImageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryButtonLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryButtonLabel" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryActionType" TEXT,
  ADD COLUMN IF NOT EXISTS "modalPrimaryActionTarget" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryActionType" TEXT,
  ADD COLUMN IF NOT EXISTS "modalSecondaryActionTarget" TEXT;

  -- Add new detailsTarget column for navigation hints
  ALTER TABLE "NextStepConfig"
    ADD COLUMN IF NOT EXISTS "detailsTarget" TEXT;
-- ============================================================================
-- FULL BACKFILL: Individual UPDATE statements for each next-step workflow action
-- ============================================================================

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Waiting for professional quotes',
  "modalBody" = 'Your project invitation has been sent to selected professionals. Once they review your project and submit quotes, you''ll be able to compare options and timelines.',
  "modalDetailsBody" = 'Each professional will examine your scope, budget, and timeline before providing a formal quote. This usually takes 1-3 business days depending on their availability.',
  "modalSuccessTitle" = 'Project posted successfully',
  "modalSuccessBody" = 'Your project is now visible to invited professionals. Check back soon for incoming quotes.',
  "modalSuccessNextStepBody" = 'When quotes arrive, you''ll review, compare, and select the professional that best fits your needs and budget.',
  "modalPrimaryButtonLabel" = 'Got it',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'close_modal',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CREATED' AND "role" = 'CLIENT' AND "actionKey" = 'WAIT_FOR_QUOTES' AND "modalTitle" IS NULL;

-- Backfill detailsTarget for key actions with tab navigation
UPDATE "NextStepConfig" SET "detailsTarget" = '{"tab":"quotes"}' 
  WHERE "actionKey" IN ('REVIEW_INCOMING_QUOTES', 'COMPARE_QUOTES', 'WAIT_FOR_UPDATED_QUOTES') AND "detailsTarget" IS NULL;

UPDATE "NextStepConfig" SET "detailsTarget" = '{"tab":"contracts"}' 
  WHERE "actionKey" IN ('REVIEW_CONTRACT', 'SIGN_CONTRACT', 'SUBMIT_CONTRACT') AND "detailsTarget" IS NULL;

UPDATE "NextStepConfig" SET "detailsTarget" = '{"tab":"milestones"}' 
  WHERE "actionKey" IN ('APPROVE_MILESTONE', 'AWAIT_MILESTONE_APPROVAL') AND "detailsTarget" IS NULL;

UPDATE "NextStepConfig" SET "detailsTarget" = '{"tab":"progress"}' 
  WHERE "actionKey" IN ('REVIEW_PROGRESS', 'SUBMIT_PROGRESS_UPDATE') AND "detailsTarget" IS NULL;

UPDATE "NextStepConfig" SET "detailsTarget" = '{"tab":"financials"}' 
  WHERE "actionKey" IN ('DEPOSIT_ESCROW_FUNDS', 'CONFIRM_NEXT_PHASE', 'PROCEED_TO_NEXT_PHASE') AND "detailsTarget" IS NULL;
UPDATE "NextStepConfig" SET
  "modalBody" = 'Search and select professionals you''d like to invite. Send them a personalized invitation with your project details. They''ll have time to review and respond with a quote.',
  "modalDetailsBody" = 'You can invite multiple professionals to create competition and get better pricing. Choose professionals with relevant experience and good reviews.',
  "modalSuccessTitle" = 'Invitations sent',
  "modalSuccessBody" = 'Your invitations have been delivered to the selected professionals.',
  "modalSuccessNextStepBody" = 'Expect quotes to arrive within 1-3 business days. You can send additional invitations if needed.',
  "modalPrimaryButtonLabel" = 'Find professionals',
  "modalSecondaryButtonLabel" = 'Cancel',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CREATED' AND "role" = 'CLIENT' AND "actionKey" = 'INVITE_PROFESSIONALS' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review project invitation',
  "modalBody" = 'You have been invited to quote on a renovation project. Review the scope, budget, and timeline. If interested, accept the invitation to move forward with the quoting process.',
  "modalDetailsBody" = 'Accepting means you''re committing to provide a detailed quote. You can review the full project requirements before deciding.',
  "modalSuccessTitle" = 'Invitation accepted',
  "modalSuccessBody" = 'You''ve accepted the project invitation and are now part of the bidding pool.',
  "modalSuccessNextStepBody" = 'Next, submit a detailed quote with your pricing and proposed timeline.',
  "modalPrimaryButtonLabel" = 'Accept',
  "modalSecondaryButtonLabel" = 'Decline',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CREATED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'REPLY_TO_INVITATION' AND "modalTitle" IS NULL;

-- BIDDING_ACTIVE stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review incoming quotes',
  "modalBody" = 'Quotes are arriving from interested professionals. Review each one carefully, comparing the proposed scope, timeline, pricing, and the professional''s qualifications and reviews.',
  "modalDetailsBody" = 'Look for alignment with your vision, realistic timelines, and pricing that matches the project scope. Feel free to request clarifications or additional information from any professional.',
  "modalSuccessTitle" = 'Quotes reviewed',
  "modalSuccessBody" = 'You''ve reviewed all submitted quotes.',
  "modalSuccessNextStepBody" = 'When ready, you can request site visits to allow professionals to verify scope firsthand, or proceed directly to comparing and selecting a professional.',
  "modalPrimaryButtonLabel" = 'View quotes',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_ACTIVE' AND "role" = 'CLIENT' AND "actionKey" = 'REVIEW_INCOMING_QUOTES' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Request site visits',
  "modalBody" = 'Invite professionals to visit your site so they can inspect the work area and verify project scope. This often results in more accurate quotes and reduces surprises later.',
  "modalDetailsBody" = 'Site visits are optional but recommended for renovation projects. Professionals may adjust their quotes based on what they see.',
  "modalSuccessTitle" = 'Invitations sent',
  "modalSuccessBody" = 'Site visit requests have been sent to the selected professionals.',
  "modalSuccessNextStepBody" = 'Professionals will respond to confirm their availability. Updated quotes often come after site visits.',
  "modalPrimaryButtonLabel" = 'Request visits',
  "modalSecondaryButtonLabel" = 'Skip for now',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_ACTIVE' AND "role" = 'CLIENT' AND "actionKey" = 'REQUEST_SITE_VISIT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Submit your quote',
  "modalBody" = 'Provide a detailed quote for this project. Include your pricing breakdown, proposed timeline, key milestones, and any assumptions or site visit requirements.',
  "modalDetailsBody" = 'A comprehensive quote with clear terms increases your chances of winning the project. Be specific about scope, materials, labor, and timeline.',
  "modalSuccessTitle" = 'Quote submitted',
  "modalSuccessBody" = 'Your quote has been delivered to the client.',
  "modalSuccessNextStepBody" = 'The client will review your quote with others and may contact you for clarifications. Be ready to respond.',
  "modalPrimaryButtonLabel" = 'Submit quote',
  "modalSecondaryButtonLabel" = 'Draft later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_ACTIVE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'SUBMIT_QUOTE' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Request site access',
  "modalBody" = 'Before finalizing your quote, request access to visit the client''s site. This allows you to inspect the work area and verify scope, materials, and structural conditions.',
  "modalDetailsBody" = 'Site visits help you provide more accurate quotes and demonstrate professionalism. Request a specific date/time that works for you.',
  "modalSuccessTitle" = 'Request sent',
  "modalSuccessBody" = 'Your site visit request has been sent to the client.',
  "modalSuccessNextStepBody" = 'Wait for the client to confirm the visit date and time. Update your quote afterward if needed.',
  "modalPrimaryButtonLabel" = 'Request access',
  "modalSecondaryButtonLabel" = 'Skip',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_ACTIVE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'REQUEST_SITE_ACCESS' AND "modalTitle" IS NULL;

-- SITE_VISIT_SCHEDULED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Confirm site visit details',
  "modalBody" = 'A professional is ready to visit your site. Confirm the proposed date and time, and provide clear access instructions.',
  "modalDetailsBody" = 'Make sure someone will be available at the site during the scheduled visit. Provide gate codes, parking info, and any other details the professional needs.',
  "modalSuccessTitle" = 'Visit confirmed',
  "modalSuccessBody" = 'Your site visit details have been confirmed with the professional.',
  "modalSuccessNextStepBody" = 'The professional will arrive at the scheduled time. Expect the visit to take 30-45 minutes.',
  "modalPrimaryButtonLabel" = 'Confirm',
  "modalSecondaryButtonLabel" = 'Reschedule',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'SITE_VISIT_SCHEDULED' AND "role" = 'CLIENT' AND "actionKey" = 'CONFIRM_SITE_VISIT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Prepare for site visit',
  "modalBody" = 'You''re scheduled to visit the client''s site. Bring measurement tools, take photos, note site conditions, and gather information needed for an accurate quote.',
  "modalDetailsBody" = 'Inspect structural conditions, materials, access routes, and any potential obstacles. This information will help you provide a realistic quote and timeline.',
  "modalSuccessTitle" = 'Site visit complete',
  "modalSuccessBody" = 'You''ve completed the site inspection.',
  "modalSuccessNextStepBody" = 'Use your findings to prepare or update your quote. Submit the revised quote to the client.',
  "modalPrimaryButtonLabel" = 'Got it',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'close_modal',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'SITE_VISIT_SCHEDULED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'ATTEND_SITE_VISIT' AND "modalTitle" IS NULL;

-- SITE_VISIT_COMPLETE stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Prepare revised quote',
  "modalBody" = 'Based on your site visit findings, prepare an updated quote that reflects the actual scope and conditions you observed.',
  "modalDetailsBody" = 'Adjust pricing, timeline, and scope based on site conditions. Include any special equipment, materials, or labor that you identified during the visit.',
  "modalSuccessTitle" = 'Revised quote submitted',
  "modalSuccessBody" = 'Your updated quote has been delivered to the client.',
  "modalSuccessNextStepBody" = 'The client will compare revised quotes and make a selection. Stay available for any questions.',
  "modalPrimaryButtonLabel" = 'Submit revised quote',
  "modalSecondaryButtonLabel" = 'Mark complete',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'SITE_VISIT_COMPLETE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'PREPARE_REVISED_QUOTE' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Wait for updated quotes',
  "modalBody" = 'Professionals are updating their quotes based on site visit findings. Check back as revised quotes arrive.',
  "modalDetailsBody" = 'Updated quotes often reflect more accurate pricing and timelines based on what professionals observed on-site.',
  "modalSuccessTitle" = 'Updated quotes received',
  "modalSuccessBody" = 'Revised quotes have arrived.',
  "modalSuccessNextStepBody" = 'Compare the updated quotes and select which professional best meets your needs and budget.',
  "modalPrimaryButtonLabel" = 'View updates',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'SITE_VISIT_COMPLETE' AND "role" = 'CLIENT' AND "actionKey" = 'WAIT_FOR_UPDATED_QUOTES' AND "modalTitle" IS NULL;

-- QUOTE_RECEIVED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Compare all quotes',
  "modalBody" = 'You now have all quotes. Carefully review pricing, scope, timeline, warranty, and professional experience. Compare each quote side-by-side.',
  "modalDetailsBody" = 'Consider not just price but also the professional''s qualifications, reviews, communication style, and proposed timeline. The lowest price isn''t always the best choice.',
  "modalSuccessTitle" = 'Comparison complete',
  "modalSuccessBody" = 'You''ve reviewed all available quotes.',
  "modalSuccessNextStepBody" = 'Select your preferred professional to move forward to the contract phase.',
  "modalPrimaryButtonLabel" = 'Compare quotes',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'QUOTE_RECEIVED' AND "role" = 'CLIENT' AND "actionKey" = 'COMPARE_QUOTES' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Waiting for client''s choice',
  "modalBody" = 'The client is currently comparing all submitted quotes. Your quote is under review.',
  "modalDetailsBody" = 'The client may contact you for clarifications or additional information. Be ready to respond promptly.',
  "modalSuccessTitle" = 'Client decision pending',
  "modalSuccessBody" = 'You''ve submitted your quote and are awaiting the client''s decision.',
  "modalSuccessNextStepBody" = 'If selected, you''ll move to the contract phase. If not selected, you''ll be notified.',
  "modalPrimaryButtonLabel" = 'Understand',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'close_modal',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'QUOTE_RECEIVED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'WAIT_FOR_DECISION' AND "modalTitle" IS NULL;

-- BIDDING_CLOSED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Select a professional',
  "modalBody" = 'Make your final selection. You''ve reviewed all quotes—choose the professional that best meets your needs, budget, and timeline.',
  "modalDetailsBody" = 'Once selected, you''ll enter the contract phase. The selected professional will draft a formal contract with terms, timeline, and payment schedule.',
  "modalSuccessTitle" = 'Professional selected',
  "modalSuccessBody" = '{professionalName} has been selected.',
  "modalSuccessNextStepBody" = 'Next, you will review and sign a formal contract with the selected professional.',
  "modalPrimaryButtonLabel" = 'Select',
  "modalSecondaryButtonLabel" = 'Review again',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_CLOSED' AND "role" = 'CLIENT' AND "actionKey" = 'SELECT_PROFESSIONAL' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Prepare formal contract',
  "modalBody" = 'If you were selected, draft a formal contract. If you were not selected, the bidding round has closed.',
  "modalDetailsBody" = 'A strong contract includes project scope, timeline, payment schedule, warranties, and dispute resolution terms. Use clear language to avoid misunderstandings.',
  "modalSuccessTitle" = 'Contract drafted',
  "modalSuccessBody" = 'Your contract has been prepared and is ready for delivery.',
  "modalSuccessNextStepBody" = 'The client will review your contract terms and provide feedback or sign.',
  "modalPrimaryButtonLabel" = 'Draft contract',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'BIDDING_CLOSED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'PREPARE_CONTRACT' AND "modalTitle" IS NULL;

-- CONTRACT_PHASE stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review the agreement',
  "modalBody" = 'Carefully review all agreement terms including scope, timeline, payment schedule, change order procedures, and warranty.',
  "modalDetailsBody" = 'Make sure the agreement accurately reflects everything you discussed. Fitout Hub admin coordinates formal amendment requests when needed.',
  "modalSuccessTitle" = 'Agreement reviewed',
  "modalSuccessBody" = 'You''ve reviewed the agreement terms.',
  "modalSuccessNextStepBody" = 'When satisfied with the terms, sign the agreement to proceed.',
  "modalPrimaryButtonLabel" = 'Review agreement',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'CLIENT' AND "actionKey" = 'REVIEW_CONTRACT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Sign the contract',
  "modalBody" = 'Sign the contract to formally commit to the project terms. This locks in the scope, timeline, and pricing.',
  "modalDetailsBody" = 'Your signature is a legally binding agreement. Ensure everything is correct before signing.',
  "modalSuccessTitle" = 'Contract signed',
  "modalSuccessBody" = 'Your contract has been signed.',
  "modalSuccessNextStepBody" = 'Next, deposit funds to escrow to unlock work authorization.',
  "modalPrimaryButtonLabel" = 'Sign now',
  "modalSecondaryButtonLabel" = 'Review again',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'CLIENT' AND "actionKey" = 'SIGN_CONTRACT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Deposit funds to escrow',
  "modalBody" = 'Both signatures are complete. Now deposit the full project amount to escrow. These funds are held securely and released according to the payment schedule as work is completed.',
  "modalDetailsBody" = 'Escrow protects both you and the professional. Funds are released only when milestones are approved, ensuring accountability and quality.',
  "modalSuccessTitle" = 'Escrow funded',
  "modalSuccessBody" = '{amount} has been deposited to escrow.',
  "modalSuccessNextStepBody" = 'The professional will confirm receipt and work can begin.',
  "modalPrimaryButtonLabel" = 'Deposit now',
  "modalSecondaryButtonLabel" = 'Review details',
  "modalPrimaryActionType" = 'confirm_transfer',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'CLIENT' AND "actionKey" = 'DEPOSIT_ESCROW_FUNDS' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review the agreement',
  "modalBody" = 'Review your drafted agreement terms, milestones, and payment schedule before sending to the client for signature.',
  "modalDetailsBody" = 'Ensure the agreement is complete and accurate. Once sent, the client reviews and signs before you complete your signature.',
  "modalSuccessTitle" = 'Agreement reviewed',
  "modalSuccessBody" = 'Your agreement is ready for client review and signature.',
  "modalSuccessNextStepBody" = 'After the client signs, you will sign to finalize and move to escrow funding.',
  "modalPrimaryButtonLabel" = 'Review agreement',
  "modalSecondaryButtonLabel" = 'Review first',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'SUBMIT_CONTRACT' AND "modalTitle" IS NULL;

-- Normalize professional pre-sign action label and modal copy for existing rows too.
UPDATE "NextStepConfig" SET
  "actionLabel" = 'Review agreement',
  "modalTitle" = 'Review the agreement',
  "modalBody" = 'Review your drafted agreement terms, milestones, and payment schedule before sending to the client for signature.',
  "modalDetailsBody" = 'Ensure the agreement is complete and accurate. Once sent, the client reviews and signs before you complete your signature.',
  "modalPrimaryButtonLabel" = 'Review agreement',
  "updatedAt" = NOW()
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'SUBMIT_CONTRACT';

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Sign the contract',
  "modalBody" = 'The client has reviewed your contract. Sign to confirm the terms, scope, timeline, and payment schedule.',
  "modalDetailsBody" = 'Your signature makes this a binding agreement. Ensure all terms are correct before signing.',
  "modalSuccessTitle" = 'Contract signed',
  "modalSuccessBody" = 'Your contract has been signed.',
  "modalSuccessNextStepBody" = 'Once the client deposits escrow funds, you can begin work.',
  "modalPrimaryButtonLabel" = 'Sign now',
  "modalSecondaryButtonLabel" = 'Review first',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CONTRACT_PHASE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'SIGN_CONTRACT' AND "modalTitle" IS NULL;

-- PRE_WORK stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Confirm start details',
  "modalBody" = 'Confirm the proposed project start date, team members, and any one-time preparations or access requirements.',
  "modalDetailsBody" = 'Make sure the timeline aligns with your schedule. Provide specific start date, time, and any special instructions or access needs.',
  "modalSuccessTitle" = 'Start date confirmed',
  "modalSuccessBody" = 'Your project start is confirmed.',
  "modalSuccessNextStepBody" = 'Work will begin as scheduled. The professional will arrive ready to get started.',
  "modalPrimaryButtonLabel" = 'Confirm date',
  "modalSecondaryButtonLabel" = 'Adjust dates',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PRE_WORK' AND "role" = 'CLIENT' AND "actionKey" = 'CONFIRM_START_DETAILS' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Confirm start date',
  "modalBody" = 'Finalize the project kickoff date, confirm your team availability, and prepare your schedule for the work ahead.',
  "modalDetailsBody" = 'Ensure your team is ready and that you have access to the project site on the start date.',
  "modalSuccessTitle" = 'Start date confirmed',
  "modalSuccessBody" = 'Your project kickoff is confirmed.',
  "modalSuccessNextStepBody" = 'Prepare your team and equipment. It''s time to start the work!',
  "modalPrimaryButtonLabel" = 'Confirm',
  "modalSecondaryButtonLabel" = 'Change date',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PRE_WORK' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'CONFIRM_START_DATE' AND "modalTitle" IS NULL;

-- WORK_IN_PROGRESS stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review work progress',
  "modalBody" = 'Check progress updates and evidence photos/videos submitted by the professional. Ensure work is on schedule and matches the contract scope.',
  "modalDetailsBody" = 'Review the quality of work, adherence to timeline, and any issues that need addressing. Provide feedback to keep the project on track.',
  "modalSuccessTitle" = 'Progress reviewed',
  "modalSuccessBody" = 'You''ve reviewed the work progress.',
  "modalSuccessNextStepBody" = 'Continue monitoring progress until the next milestone is ready for approval.',
  "modalPrimaryButtonLabel" = 'View progress',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'WORK_IN_PROGRESS' AND "role" = 'CLIENT' AND "actionKey" = 'REVIEW_PROGRESS' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Submit progress update',
  "modalBody" = 'Post regular updates on your work progress. Include photos, videos, and a summary of completed tasks and upcoming work.',
  "modalDetailsBody" = 'Frequent communication builds trust and keeps the client informed. Be transparent about any challenges or changes to the timeline.',
  "modalSuccessTitle" = 'Progress submitted',
  "modalSuccessBody" = 'Your progress update has been delivered to the client.',
  "modalSuccessNextStepBody" = 'Continue working toward the next milestone. Keep updates coming!',
  "modalPrimaryButtonLabel" = 'Submit update',
  "modalSecondaryButtonLabel" = 'Draft later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'WORK_IN_PROGRESS' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'SUBMIT_PROGRESS_UPDATE' AND "modalTitle" IS NULL;

-- MILESTONE_PENDING stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Approve milestone',
  "modalBody" = 'The professional has submitted evidence that a milestone is complete. Review the submitted work, photos, and documentation. If satisfied, approve to release/transfer payment.',
  "modalDetailsBody" = 'Carefully inspect the work quality, material quality, and adherence to specifications before approving. Request corrections if needed.',
  "modalSuccessTitle" = 'Milestone approved',
  "modalSuccessBody" = 'Milestone payment is being released.',
  "modalSuccessNextStepBody" = 'The professional can now proceed to the next phase.',
  "modalPrimaryButtonLabel" = 'Approve',
  "modalSecondaryButtonLabel" = 'Request changes',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'MILESTONE_PENDING' AND "role" = 'CLIENT' AND "actionKey" = 'APPROVE_MILESTONE' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Awaiting milestone approval',
  "modalBody" = 'You''ve submitted milestone evidence. The client is reviewing your work and documentation.',
  "modalDetailsBody" = 'Stay available to answer questions or provide additional documentation if requested.',
  "modalSuccessTitle" = 'Milestone awarded',
  "modalSuccessBody" = 'Your milestone has been approved!',
  "modalSuccessNextStepBody" = 'Payment is being released. Continue to the next phase.',
  "modalPrimaryButtonLabel" = 'Understood',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'close_modal',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'MILESTONE_PENDING' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'AWAIT_MILESTONE_APPROVAL' AND "modalTitle" IS NULL;

-- PAYMENT_RELEASED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Confirm next phase',
  "modalBody" = 'The current milestone is complete and payment has been released. Authorize the professional to proceed to the next phase of the project.',
  "modalDetailsBody" = 'Review the work quality before authorizing the next phase. Ensure everything matches the contract and your expectations.',
  "modalSuccessTitle" = 'Next phase authorized',
  "modalSuccessBody" = 'Work can now proceed to the next milestone.',
  "modalSuccessNextStepBody" = 'The professional will continue with the next phase. Expect updates as work progresses.',
  "modalPrimaryButtonLabel" = 'Proceed',
  "modalSecondaryButtonLabel" = 'Review first',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PAYMENT_RELEASED' AND "role" = 'CLIENT' AND "actionKey" = 'CONFIRM_NEXT_PHASE' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Proceed to next phase',
  "modalBody" = 'You''ve completed the current milestone and payment has been released. Prepare to start the next phase of the project.',
  "modalDetailsBody" = 'Review project scope for the next phase, prepare equipment and materials, and schedule your team.',
  "modalSuccessTitle" = 'Phase transition approved',
  "modalSuccessBody" = 'Moving to the next milestone.',
  "modalSuccessNextStepBody" = 'Begin work on the next phase and submit regular progress updates.',
  "modalPrimaryButtonLabel" = 'Continue',
  "modalSecondaryButtonLabel" = 'Review scope',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PAYMENT_RELEASED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'PROCEED_TO_NEXT_PHASE' AND "modalTitle" IS NULL;

-- NEAR_COMPLETION stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Schedule final inspection',
  "modalBody" = 'The professional reports that the project is nearing completion. Schedule a final walkthrough to inspect the finished work and verify everything meets your expectations.',
  "modalDetailsBody" = 'Bring a checklist of the original scope. Verify quality, finishes, and any final touch-ups or punch list items.',
  "modalSuccessTitle" = 'Inspection scheduled',
  "modalSuccessBody" = 'Your final inspection is scheduled.',
  "modalSuccessNextStepBody" = 'Conduct a thorough walkthrough and report any issues that need correction.',
  "modalPrimaryButtonLabel" = 'Schedule',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'NEAR_COMPLETION' AND "role" = 'CLIENT' AND "actionKey" = 'SCHEDULE_FINAL_INSPECTION' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Request final walkthrough',
  "modalBody" = 'Request that the client schedule a final walkthrough to inspect the completed project work and address any last-minute punch list items.',
  "modalDetailsBody" = 'A final inspection ensures both parties agree the work is complete and meets the contract specifications.',
  "modalSuccessTitle" = 'Request sent',
  "modalSuccessBody" = 'Your final walkthrough request has been sent.',
  "modalSuccessNextStepBody" = 'Wait for the client to confirm the time. Be prepared to address any touch-ups or corrections.',
  "modalPrimaryButtonLabel" = 'Request',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'NEAR_COMPLETION' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'REQUEST_FINAL_WALKTHROUGH' AND "modalTitle" IS NULL;

-- FINAL_INSPECTION stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Approve final work',
  "modalBody" = 'Conduct your final inspection. Review all completed work against the original scope and contract. If everything is satisfactory, approve to complete the project.',
  "modalDetailsBody" = 'Document any punch list items or corrections needed. Once approved, the project moves to completion.',
  "modalSuccessTitle" = 'Project approved',
  "modalSuccessBody" = 'The project has been approved as complete.',
  "modalSuccessNextStepBody" = 'Congratulations! Your project is complete. Final payment may be released. You''ll now enter the warranty period.',
  "modalPrimaryButtonLabel" = 'Approve',
  "modalSecondaryButtonLabel" = 'Request changes',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'FINAL_INSPECTION' AND "role" = 'CLIENT' AND "actionKey" = 'APPROVE_FINAL_WORK' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Address final items',
  "modalBody" = 'Complete any punch list items or corrections identified during the final walkthrough. Address these promptly to close out the project.',
  "modalDetailsBody" = 'Quick response to final requests demonstrates professionalism and builds long-term relationships.',
  "modalSuccessTitle" = 'Final items complete',
  "modalSuccessBody" = 'All punch list items have been addressed.',
  "modalSuccessNextStepBody" = 'The project is now complete. You''ll move to warranty period support.',
  "modalPrimaryButtonLabel" = 'Mark complete',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'FINAL_INSPECTION' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'ADDRESS_FINAL_ITEMS' AND "modalTitle" IS NULL;

-- COMPLETE stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Enter warranty period',
  "modalBody" = 'Congratulations! The project is complete. You''re now entering the warranty period. Monitor for any defects and reach out if issues arise.',
  "modalDetailsBody" = 'The professional remains available during the warranty period to address any work-related defects or issues.',
  "modalSuccessTitle" = 'Project complete',
  "modalSuccessBody" = 'Your project has successfully been completed.',
  "modalSuccessNextStepBody" = 'Contact the professional if any warranty issues arise. When ready, you can launch a new project.',
  "modalPrimaryButtonLabel" = 'Got it',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'close_modal',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'COMPLETE' AND "role" = 'CLIENT' AND "actionKey" = 'ENTER_WARRANTY_PERIOD' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Provide warranty details',
  "modalBody" = 'Share warranty terms, exclusions, and support contact information with the client. Be clear about your warranty coverage and response process.',
  "modalDetailsBody" = 'Good warranty communication prevents misunderstandings and builds trust for future projects.',
  "modalSuccessTitle" = 'Warranty terms shared',
  "modalSuccessBody" = 'You''ve provided warranty details to the client.',
  "modalSuccessNextStepBody" = 'Stay available to support any warranty requests during the coverage period.',
  "modalPrimaryButtonLabel" = 'Provide details',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'COMPLETE' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'PROVIDE_WARRANTY_DETAILS' AND "modalTitle" IS NULL;

-- WARRANTY_PERIOD stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Report a defect',
  "modalBody" = 'If you notice any defects or issues with the completed work that are covered under warranty, report them to the professional.',
  "modalDetailsBody" = 'Be specific about the issue, when you noticed it, and how it affects your home. Provide photos if possible.',
  "modalSuccessTitle" = 'Defect reported',
  "modalSuccessBody" = 'Your defect report has been delivered to the professional.',
  "modalSuccessNextStepBody" = 'The professional will respond with a timeline for corrections.',
  "modalPrimaryButtonLabel" = 'Report issue',
  "modalSecondaryButtonLabel" = 'Not now',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'WARRANTY_PERIOD' AND "role" = 'CLIENT' AND "actionKey" = 'REPORT_DEFECT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Review defect report',
  "modalBody" = 'The client has reported a warranty defect. Review the details and respond with your plan to correct it.',
  "modalDetailsBody" = 'Quick, professional response to warranty claims builds your reputation and client satisfaction.',
  "modalSuccessTitle" = 'Response submitted',
  "modalSuccessBody" = 'Your defect response has been sent to the client.',
  "modalSuccessNextStepBody" = 'Schedule and complete the warranty repair. Keep the client informed.',
  "modalPrimaryButtonLabel" = 'Review',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'WARRANTY_PERIOD' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'VIEW_DEFECT' AND "modalTitle" IS NULL;

-- PAUSED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Resume project',
  "modalBody" = 'Your project has been paused. When you''re ready to resume, authorize the professional to continue with the remaining work.',
  "modalDetailsBody" = 'Ensure schedule and budget still align with the paused plan. Discuss any changes before resuming.',
  "modalSuccessTitle" = 'Project resumed',
  "modalSuccessBody" = 'Your project is resuming.',
  "modalSuccessNextStepBody" = 'Work will continue on the agreed timeline.',
  "modalPrimaryButtonLabel" = 'Resume',
  "modalSecondaryButtonLabel" = 'Not yet',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PAUSED' AND "role" = 'CLIENT' AND "actionKey" = 'RESUME_PROJECT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Confirm resume plan',
  "modalBody" = 'The client is ready to resume the project. Confirm your team availability and the resumption timeline.',
  "modalDetailsBody" = 'Updated timeline and resource planning may be needed. Confirm everything before resuming work.',
  "modalSuccessTitle" = 'Resume confirmed',
  "modalSuccessBody" = 'Project resumption is confirmed.',
  "modalSuccessNextStepBody" = 'Prepare your team and resume work on the agreed date.',
  "modalPrimaryButtonLabel" = 'Confirm',
  "modalSecondaryButtonLabel" = 'Need more time',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'PAUSED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'CONFIRM_RESUME_PLAN' AND "modalTitle" IS NULL;

-- DISPUTED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Provide dispute details',
  "modalBody" = 'Describe the dispute in detail. Include what happened, when it occurred, evidence (photos, emails, messages), and what resolution you''re seeking.',
  "modalDetailsBody" = 'Detailed, factual information helps the resolution team understand the issue and propose a fair solution.',
  "modalSuccessTitle" = 'Dispute submitted',
  "modalSuccessBody" = 'Your dispute has been escalated to our resolution team.',
  "modalSuccessNextStepBody" = 'We will review and work with both parties to reach a fair resolution.',
  "modalPrimaryButtonLabel" = 'Submit dispute',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'DISPUTED' AND "role" = 'CLIENT' AND "actionKey" = 'PROVIDE_DISPUTE_DETAILS' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'Respond to dispute',
  "modalBody" = 'A dispute has been raised. Provide your response, context, and supporting evidence (photos, emails, communications).',
  "modalDetailsBody" = 'A thorough, professional response helps ensure a fair resolution. Stick to facts and avoid emotional language.',
  "modalSuccessTitle" = 'Response submitted',
  "modalSuccessBody" = 'Your dispute response has been submitted.',
  "modalSuccessNextStepBody" = 'We will review both sides and work toward resolution.',
  "modalPrimaryButtonLabel" = 'Respond',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'DISPUTED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'RESPOND_TO_DISPUTE' AND "modalTitle" IS NULL;

-- CLOSED stage
UPDATE "NextStepConfig" SET
  "modalTitle" = 'Start a new project',
  "modalBody" = 'Your previous project is now closed. Ready to start another renovation? Post a new project and invite professionals to quote.',
  "modalDetailsBody" = 'Leverage your experience from this project to set clearer expectations for the next one.',
  "modalSuccessTitle" = 'New project started',
  "modalSuccessBody" = 'Your new project is live.',
  "modalSuccessNextStepBody" = 'Invite professionals and begin the quoting process.',
  "modalPrimaryButtonLabel" = 'Start new project',
  "modalSecondaryButtonLabel" = 'Later',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CLOSED' AND "role" = 'CLIENT' AND "actionKey" = 'START_NEW_PROJECT' AND "modalTitle" IS NULL;

UPDATE "NextStepConfig" SET
  "modalTitle" = 'View archived project',
  "modalBody" = 'This project is now closed and archived. You can review project history, communications, and final documentation.',
  "modalDetailsBody" = 'Archives are useful for reference and future quote comparisons.',
  "modalSuccessTitle" = 'Archive accessed',
  "modalSuccessBody" = 'You''ve accessed the project archive.',
  "modalSuccessNextStepBody" = 'Feel free to reference this project for future work.',
  "modalPrimaryButtonLabel" = 'View archive',
  "modalSecondaryButtonLabel" = 'Back',
  "modalPrimaryActionType" = 'navigate_tab',
  "modalSecondaryActionType" = 'close_modal'
WHERE "projectStage" = 'CLOSED' AND "role" = 'PROFESSIONAL' AND "actionKey" = 'VIEW_ARCHIVE' AND "modalTitle" IS NULL;

-- Content-only row for the new materials-wallet modal.
-- isPrimary/isElective are false so it behaves as content storage only.
INSERT INTO "NextStepConfig" (
  "id",
  "projectStage",
  "role",
  "actionKey",
  "actionLabel",
  "description",
  "modalTitle",
  "modalBody",
  "modalDetailsBody",
  "modalSuccessTitle",
  "modalSuccessBody",
  "modalSuccessNextStepBody",
  "modalImageUrl",
  "modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel",
  "modalPrimaryActionType",
  "modalPrimaryActionTarget",
  "modalSecondaryActionType",
  "modalSecondaryActionTarget",
  "isPrimary",
  "isElective",
  "requiresAction",
  "displayOrder",
  "createdAt",
  "updatedAt"
)
VALUES (
  'manual-authorize-materials-wallet-content',
  'CONTRACT_PHASE',
  'CLIENT',
  'AUTHORIZE_MATERIALS_WALLET',
  'Transfer materials funds to professional wallet',
  'Escrow is funded. Transfer milestone 1 materials funds to the professional holding wallet.',
  'Transfer materials funds',
  'OK {clientName}, you need to move {amount} from your wallet to {professionalName}''s holding wallet.',
  'This amount is moved from {clientName}''s wallet to {professionalName}''s materials holding wallet. It is not withdrawable until you review and approve submitted purchase invoices.',
  'Funds have been transferred!',
  '{amount} has been moved to {professionalName}''s holding wallet.',
  'What''s next? We are working on it!',
  '/assets/images/chatbot-avatar-icon.webp',
  'OK',
  'Cancel',
  'confirm_transfer',
  NULL,
  'close_modal',
  NULL,
  false,
  false,
  false,
  999,
  NOW(),
  NOW()
)
ON CONFLICT ("projectStage", "role", "actionKey")
DO UPDATE SET
  "modalTitle" = EXCLUDED."modalTitle",
  "modalBody" = EXCLUDED."modalBody",
  "modalDetailsBody" = EXCLUDED."modalDetailsBody",
  "modalSuccessTitle" = EXCLUDED."modalSuccessTitle",
  "modalSuccessBody" = EXCLUDED."modalSuccessBody",
  "modalSuccessNextStepBody" = EXCLUDED."modalSuccessNextStepBody",
  "modalImageUrl" = EXCLUDED."modalImageUrl",
  "modalPrimaryButtonLabel" = EXCLUDED."modalPrimaryButtonLabel",
  "modalSecondaryButtonLabel" = EXCLUDED."modalSecondaryButtonLabel",
  "modalPrimaryActionType" = EXCLUDED."modalPrimaryActionType",
  "modalPrimaryActionTarget" = EXCLUDED."modalPrimaryActionTarget",
  "modalSecondaryActionType" = EXCLUDED."modalSecondaryActionType",
  "modalSecondaryActionTarget" = EXCLUDED."modalSecondaryActionTarget",
  "updatedAt" = NOW();

COMMIT;
