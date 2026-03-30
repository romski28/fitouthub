-- Optional starter data load for questionnaire templates and starter questionnaire
-- Run this ONLY after applying prisma/add-questionnaire-system.sql
-- Keep this separate from schema migration by design.

-- NOTE:
-- This file is intentionally lightweight and idempotent.
-- The API also exposes POST /questionnaires/starter for creating the same baseline set.

DO $$
DECLARE
  starter_questionnaire_id TEXT;
BEGIN
  INSERT INTO "Questionnaire" (
    "id",
    "slug",
    "title",
    "audienceKey",
    "description",
    "welcomeTitle",
    "welcomeMessage",
    "thankYouTitle",
    "thankYouMessage",
    "joinCtaLabel",
    "joinCtaUrl",
    "status",
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'qnr_contractor_tradesman_starter',
    'contractor-tradesman-screening',
    'Contractors and tradesmen onboarding questionnaire',
    'contractor_tradesman',
    'Starter stakeholder questionnaire for contractors and tradesmen.',
    'Welcome to the contractor & tradesman questionnaire',
    'We are collecting a focused baseline profile so we can invite the right professionals with minimal back-and-forth.',
    'Thanks for sharing your details',
    'Your answers have been saved. We will use them to shape future invitations and onboarding.',
    'Explore joining FitOut Hub',
    '/professionals',
    'active',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("slug") DO UPDATE SET
    "title" = EXCLUDED."title",
    "audienceKey" = EXCLUDED."audienceKey",
    "description" = EXCLUDED."description",
    "welcomeTitle" = EXCLUDED."welcomeTitle",
    "welcomeMessage" = EXCLUDED."welcomeMessage",
    "thankYouTitle" = EXCLUDED."thankYouTitle",
    "thankYouMessage" = EXCLUDED."thankYouMessage",
    "joinCtaLabel" = EXCLUDED."joinCtaLabel",
    "joinCtaUrl" = EXCLUDED."joinCtaUrl",
    "status" = EXCLUDED."status",
    "updatedAt" = CURRENT_TIMESTAMP;

  SELECT "id"
  INTO starter_questionnaire_id
  FROM "Questionnaire"
  WHERE "slug" = 'contractor-tradesman-screening'
  LIMIT 1;

  INSERT INTO "QuestionnaireTemplate" (
    "id", "key", "label", "prompt", "type", "audienceKey", "isSystem", "createdAt", "updatedAt"
  )
  VALUES
    ('qtmpl_business_name', 'business_name', 'Business name', 'What is your business or trading name?', 'short_text', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_trade_selector', 'trade_selector', 'Primary trade', 'Which trade best describes your main work?', 'single_select', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_service_regions', 'service_regions', 'Coverage areas', 'Which areas do you currently cover?', 'long_text', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_years_experience', 'years_experience', 'Years of experience', 'How many years of relevant experience do you have?', 'number', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_insurance_check', 'insurance_check', 'Insurance check', 'Do you currently hold active public liability or equivalent insurance?', 'yes_no', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_team_size', 'team_size', 'Team size', 'How large is your usual delivery team?', 'single_select', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_project_size', 'project_size', 'Preferred project size', 'What project size are you most comfortable taking on?', 'multi_select', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('qtmpl_availability', 'availability', 'Availability', 'When could you usually start a new project?', 'short_text', 'contractor_tradesman', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "prompt" = EXCLUDED."prompt",
    "type" = EXCLUDED."type",
    "audienceKey" = EXCLUDED."audienceKey",
    "isSystem" = EXCLUDED."isSystem",
    "updatedAt" = CURRENT_TIMESTAMP;

  DELETE FROM "QuestionnaireTemplateOption"
  WHERE "templateId" IN (
    SELECT "id"
    FROM "QuestionnaireTemplate"
    WHERE "key" IN ('trade_selector', 'team_size', 'project_size')
  );

  INSERT INTO "QuestionnaireTemplateOption" (
    "id", "templateId", "value", "label", "sortOrder"
  )
  SELECT
    CONCAT('qtmpopt_', opt.template_key, '_', opt.value),
    t."id",
    opt.value,
    opt.label,
    opt.sort_order
  FROM (
    VALUES
      ('trade_selector', 'general_contractor', 'General contractor', 1),
      ('trade_selector', 'builder', 'Builder / fit-out contractor', 2),
      ('trade_selector', 'electrical', 'Electrical', 3),
      ('trade_selector', 'plumbing', 'Plumbing / drainage', 4),
      ('trade_selector', 'hvac', 'HVAC / ventilation', 5),
      ('trade_selector', 'joinery', 'Joinery / carpentry', 6),
      ('trade_selector', 'decorating', 'Painting / decorating', 7),
      ('trade_selector', 'other', 'Other specialist trade', 8),
      ('team_size', 'solo', 'Just me', 1),
      ('team_size', '2_5', '2 to 5 people', 2),
      ('team_size', '6_15', '6 to 15 people', 3),
      ('team_size', '16_plus', '16+ people', 4),
      ('project_size', 'minor_repairs', 'Minor repairs / quick jobs', 1),
      ('project_size', 'single_room', 'Single-room refurbishment', 2),
      ('project_size', 'full_home', 'Full-home renovation', 3),
      ('project_size', 'commercial_fitout', 'Commercial fit-out', 4)
  ) AS opt(template_key, value, label, sort_order)
  JOIN "QuestionnaireTemplate" t ON t."key" = opt.template_key
  ON CONFLICT ("templateId", "value") DO UPDATE SET
    "label" = EXCLUDED."label",
    "sortOrder" = EXCLUDED."sortOrder";

  INSERT INTO "QuestionnaireQuestion" (
    "id", "questionnaireId", "code", "title", "description", "type", "placeholder", "helpText", "isRequired", "sortOrder"
  )
  VALUES
    ('qq_business_name', starter_questionnaire_id, 'business_name', 'What is your business or trading name?', NULL, 'short_text', 'e.g. Harbour Build & Fitout Ltd', NULL, TRUE, 1),
    ('qq_primary_trade', starter_questionnaire_id, 'primary_trade', 'Which trade best describes your main work?', NULL, 'single_select', NULL, NULL, TRUE, 2),
    ('qq_coverage_areas', starter_questionnaire_id, 'coverage_areas', 'Which areas do you currently cover?', 'List districts, islands, or regions where you regularly work.', 'long_text', 'e.g. Hong Kong Island, Kowloon East, Tseung Kwan O', NULL, TRUE, 3),
    ('qq_experience_years', starter_questionnaire_id, 'experience_years', 'How many years of relevant experience do you have?', NULL, 'number', 'e.g. 12', NULL, TRUE, 4),
    ('qq_insurance_ready', starter_questionnaire_id, 'insurance_ready', 'Do you currently hold active public liability or equivalent insurance?', NULL, 'yes_no', NULL, 'This can be refined later with document upload steps.', TRUE, 5),
    ('qq_certifications', starter_questionnaire_id, 'certifications', 'Which licences, registrations, or certifications should clients know about?', NULL, 'long_text', 'List registrations, card numbers, or accreditations', NULL, FALSE, 6),
    ('qq_team_size', starter_questionnaire_id, 'team_size', 'How large is your usual delivery team?', NULL, 'single_select', NULL, NULL, TRUE, 7),
    ('qq_project_size', starter_questionnaire_id, 'project_size', 'What project size are you most comfortable taking on?', NULL, 'multi_select', NULL, NULL, TRUE, 8),
    ('qq_availability', starter_questionnaire_id, 'availability', 'When could you usually start a new project?', NULL, 'short_text', 'e.g. Within 2 weeks', NULL, TRUE, 9),
    ('qq_contact_email', starter_questionnaire_id, 'contact_email', 'What is the best email for project invitations?', NULL, 'email', 'name@company.com', NULL, TRUE, 10),
    ('qq_contact_phone', starter_questionnaire_id, 'contact_phone', 'What is the best mobile or WhatsApp number?', NULL, 'phone', '+852 ...', NULL, FALSE, 11),
    ('qq_why_fitouthub', starter_questionnaire_id, 'why_fitouthub', 'Anything else you would like FitOut Hub to know before we invite you onto the platform?', NULL, 'long_text', 'Share strengths, preferred work, or anything important', NULL, FALSE, 12)
  ON CONFLICT ("questionnaireId", "code") DO UPDATE SET
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "type" = EXCLUDED."type",
    "placeholder" = EXCLUDED."placeholder",
    "helpText" = EXCLUDED."helpText",
    "isRequired" = EXCLUDED."isRequired",
    "sortOrder" = EXCLUDED."sortOrder";

  DELETE FROM "QuestionnaireQuestionOption"
  WHERE "questionId" IN (
    SELECT "id"
    FROM "QuestionnaireQuestion"
    WHERE "questionnaireId" = starter_questionnaire_id
      AND "code" IN ('primary_trade', 'team_size', 'project_size')
  );

  INSERT INTO "QuestionnaireQuestionOption" (
    "id", "questionId", "value", "label", "sortOrder"
  )
  SELECT
    CONCAT('qqopt_', opt.question_code, '_', opt.value),
    q."id",
    opt.value,
    opt.label,
    opt.sort_order
  FROM (
    VALUES
      ('primary_trade', 'general_contractor', 'General contractor', 1),
      ('primary_trade', 'builder', 'Builder / fit-out contractor', 2),
      ('primary_trade', 'electrical', 'Electrical', 3),
      ('primary_trade', 'plumbing', 'Plumbing / drainage', 4),
      ('primary_trade', 'hvac', 'HVAC / ventilation', 5),
      ('primary_trade', 'joinery', 'Joinery / carpentry', 6),
      ('primary_trade', 'decorating', 'Painting / decorating', 7),
      ('primary_trade', 'other', 'Other specialist trade', 8),
      ('team_size', 'solo', 'Just me', 1),
      ('team_size', '2_5', '2 to 5 people', 2),
      ('team_size', '6_15', '6 to 15 people', 3),
      ('team_size', '16_plus', '16+ people', 4),
      ('project_size', 'minor_repairs', 'Minor repairs / quick jobs', 1),
      ('project_size', 'single_room', 'Single-room refurbishment', 2),
      ('project_size', 'full_home', 'Full-home renovation', 3),
      ('project_size', 'commercial_fitout', 'Commercial fit-out', 4)
  ) AS opt(question_code, value, label, sort_order)
  JOIN "QuestionnaireQuestion" q
    ON q."questionnaireId" = starter_questionnaire_id
   AND q."code" = opt.question_code
  ON CONFLICT ("questionId", "value") DO UPDATE SET
    "label" = EXCLUDED."label",
    "sortOrder" = EXCLUDED."sortOrder";

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'QuestionnaireTranslation'
  ) THEN
    INSERT INTO "QuestionnaireTranslation" (
      "id", "questionnaireId", "locale", "title", "description", "welcomeTitle", "welcomeMessage", "thankYouTitle", "thankYouMessage", "joinCtaLabel", "joinCtaUrl", "createdAt", "updatedAt"
    )
    VALUES (
      'qnrtr_contractors_zh_hk',
      starter_questionnaire_id,
      'zh-HK',
      '承建商及裝修技工入職問卷',
      '為承建商及裝修技工而設的基礎持份者問卷。',
      '歡迎填寫承建商及裝修技工問卷',
      '我們會先收集你的基本資料，以便用更少來回溝通，配對合適項目邀請。',
      '多謝你提供資料',
      '你的答案已儲存，我們會用於後續邀請及入駐流程。',
      '探索加入 FitOut Hub',
      '/professionals',
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT ("questionnaireId", "locale") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "welcomeTitle" = EXCLUDED."welcomeTitle",
      "welcomeMessage" = EXCLUDED."welcomeMessage",
      "thankYouTitle" = EXCLUDED."thankYouTitle",
      "thankYouMessage" = EXCLUDED."thankYouMessage",
      "joinCtaLabel" = EXCLUDED."joinCtaLabel",
      "joinCtaUrl" = EXCLUDED."joinCtaUrl",
      "updatedAt" = CURRENT_TIMESTAMP;

    INSERT INTO "QuestionnaireQuestionTranslation" (
      "id", "questionId", "locale", "title", "description", "placeholder", "helpText", "createdAt", "updatedAt"
    )
    SELECT
      CONCAT('qqtr_', item.code, '_zh_hk'),
      q."id",
      'zh-HK',
      item.title,
      item.description,
      item.placeholder,
      item.help_text,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM (
      VALUES
        ('business_name', '你的公司或商業名稱是甚麼？', NULL, '例如：Harbour Build & Fitout Ltd', NULL),
        ('primary_trade', '哪一個工種最能代表你的主要工作？', NULL, NULL, NULL),
        ('coverage_areas', '你目前主要服務哪些地區？', '請列出你經常施工的區域、島嶼或地區。', '例如：港島、九龍東、將軍澳', NULL),
        ('experience_years', '你有多少年相關經驗？', NULL, '例如：12', NULL),
        ('insurance_ready', '你目前是否持有有效的公眾責任保險或同等保障？', NULL, NULL, '此項日後可配合文件上載流程再細化。'),
        ('certifications', '你有哪些牌照、註冊或專業資格可供客戶參考？', NULL, '請列出註冊編號、卡號或認證', NULL),
        ('team_size', '你一般的施工團隊規模是？', NULL, NULL, NULL),
        ('project_size', '你最擅長承接哪類型項目規模？', NULL, NULL, NULL),
        ('availability', '你通常最快可於何時開始新項目？', NULL, '例如：兩星期內', NULL),
        ('contact_email', '哪個電郵最適合接收項目邀請？', NULL, 'name@company.com', NULL),
        ('contact_phone', '哪個手機或 WhatsApp 號碼最適合聯絡？', NULL, '+852 ...', NULL),
        ('why_fitouthub', '在邀請你加入平台前，還有甚麼想讓 FitOut Hub 知道？', NULL, '可分享你的強項、偏好項目或其他重要資訊', NULL)
    ) AS item(code, title, description, placeholder, help_text)
    JOIN "QuestionnaireQuestion" q
      ON q."questionnaireId" = starter_questionnaire_id
     AND q."code" = item.code
    ON CONFLICT ("questionId", "locale") DO UPDATE SET
      "title" = EXCLUDED."title",
      "description" = EXCLUDED."description",
      "placeholder" = EXCLUDED."placeholder",
      "helpText" = EXCLUDED."helpText",
      "updatedAt" = CURRENT_TIMESTAMP;

    INSERT INTO "QuestionnaireQuestionOptionTranslation" (
      "id", "optionId", "locale", "label", "createdAt", "updatedAt"
    )
    SELECT
      CONCAT('qqoptr_', item.question_code, '_', item.value, '_zh_hk'),
      o."id",
      'zh-HK',
      item.label,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM (
      VALUES
        ('primary_trade', 'general_contractor', '總承建商'),
        ('primary_trade', 'builder', '裝修／工程承建商'),
        ('primary_trade', 'electrical', '電工'),
        ('primary_trade', 'plumbing', '水喉／排水'),
        ('primary_trade', 'hvac', '冷暖通風（HVAC）'),
        ('primary_trade', 'joinery', '木工／細木'),
        ('primary_trade', 'decorating', '油漆／裝飾'),
        ('primary_trade', 'other', '其他專業工種'),
        ('team_size', 'solo', '個人作業'),
        ('team_size', '2_5', '2 至 5 人'),
        ('team_size', '6_15', '6 至 15 人'),
        ('team_size', '16_plus', '16 人以上'),
        ('project_size', 'minor_repairs', '小型維修／快修工程'),
        ('project_size', 'single_room', '單房翻新'),
        ('project_size', 'full_home', '全屋翻新'),
        ('project_size', 'commercial_fitout', '商業裝修')
    ) AS item(question_code, value, label)
    JOIN "QuestionnaireQuestion" q
      ON q."questionnaireId" = starter_questionnaire_id
     AND q."code" = item.question_code
    JOIN "QuestionnaireQuestionOption" o
      ON o."questionId" = q."id"
     AND o."value" = item.value
    ON CONFLICT ("optionId", "locale") DO UPDATE SET
      "label" = EXCLUDED."label",
      "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
END $$;
