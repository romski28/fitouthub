-- FitOut Hub Contractor & Tradesman Research survey starter
-- Run after questionnaire schema SQL is applied.

-- Ensure matrix_rating enum value exists (safe: no-op if already present).
-- Must run as a plain statement outside any transaction block so it is
-- committed and visible before the data-insert block below uses it.
ALTER TYPE "QuestionnaireQuestionType" ADD VALUE IF NOT EXISTS 'matrix_rating';

DO $$
DECLARE
  survey_questionnaire_id TEXT;
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
    'qnr_contractor_tradesman_research',
    'contractor-tradesman-research',
    'FitOut Hub — Contractor & Tradesman Research',
    'contractor_tradesman',
    'Bilingual contractor and tradesman research survey focused on lead quality, pain points, monetisation preference, and platform fit.',
    'Welcome to the contractor & tradesman research survey',
    'This short survey helps us design FitOut Hub around real contractor and tradesman needs in Hong Kong.',
    'Thank you for your feedback',
    'Your responses have been saved and will help shape product priorities and launch design.',
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
  INTO survey_questionnaire_id
  FROM "Questionnaire"
  WHERE "slug" = 'contractor-tradesman-research'
  LIMIT 1;

  INSERT INTO "QuestionnaireQuestion" (
    "id", "questionnaireId", "code", "title", "description", "type", "placeholder", "helpText", "settings", "isRequired", "sortOrder"
  )
  VALUES
    ('qqr_primary_trade', survey_questionnaire_id, 'primary_trade', 'What is your primary trade?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 1),
    ('qqr_experience_years_hk', survey_questionnaire_id, 'experience_years_hk', 'How long have you been working in your trade in Hong Kong?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 2),
    ('qqr_team_size', survey_questionnaire_id, 'team_size', 'How many workers (including yourself) are in your team?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 3),
    ('qqr_jobs_per_month', survey_questionnaire_id, 'jobs_per_month', 'Approximately how many jobs do you complete per month?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 4),
    ('qqr_avg_job_value', survey_questionnaire_id, 'avg_job_value', 'What is the average value of a single job you complete?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 5),
    ('qqr_lead_sources', survey_questionnaire_id, 'lead_sources', 'How do you currently get most of your jobs / leads? (Select all that apply)', NULL, 'multi_select', NULL, NULL, NULL, TRUE, 6),
    ('qqr_lead_generation_satisfaction', survey_questionnaire_id, 'lead_generation_satisfaction', 'How satisfied are you with your current lead generation methods?', '1 = Very dissatisfied, 2 = Dissatisfied, 3 = Neutral, 4 = Satisfied, 5 = Very satisfied', 'single_select', NULL, NULL, NULL, TRUE, 7),
    ('qqr_pain_points', survey_questionnaire_id, 'pain_points', 'How significant are the following business pain points for you?', 'Rate each 1 (not a problem) to 5 (major problem).', 'matrix_rating', NULL, NULL,
      '{"rows":[{"key":"unpredictable_lead_flow","label":"Unpredictable lead flow / 工作來源不穩定"},{"key":"customers_who_ghost","label":"Customers who ghost / 報價後客戶消失"},{"key":"late_disputed_payment","label":"Late / disputed payment / 付款延遲或糾紛"},{"key":"scope_creep","label":"Scope creep / 客戶不斷加工但不加錢"},{"key":"quoting_waste","label":"Quoting waste / 浪費時間報價但工程告吹"},{"key":"race_to_bottom_on_price","label":"Race to bottom on price / 被低質素競爭者壓低價格"},{"key":"building_online_reputation","label":"Building online reputation / 難以建立網上口碑"},{"key":"cash_flow_issues","label":"Cash flow issues / 工程之間的現金流問題"}]}'::jsonb,
      TRUE, 8),
    ('qqr_digital_tools', survey_questionnaire_id, 'digital_tools', 'What digital tools do you currently use for your business? (Select all that apply)', NULL, 'multi_select', NULL, NULL, NULL, TRUE, 9),
    ('qqr_acceptable_commission_rate', survey_questionnaire_id, 'acceptable_commission_rate', 'If a platform provided you with pre-qualified, genuine job leads and held payment securely until the job was done, what commission rate would be acceptable?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 10),
    ('qqr_subscription_willingness', survey_questionnaire_id, 'subscription_willingness', 'Would you be willing to pay a monthly subscription fee (e.g. HKD 200–400/month) for guaranteed access to leads and platform tools?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 11),
    ('qqr_feature_importance', survey_questionnaire_id, 'feature_importance', 'How important are the following platform features to you?', 'Rate each 1 (not important) to 5 (essential).', 'matrix_rating', NULL, NULL,
      '{"rows":[{"key":"escrow_payment","label":"Escrow payment / 代管付款保障"},{"key":"reviews_verified_history","label":"Reviews + verified history / 顯示評價及經核實工程紀錄"},{"key":"standardised_quote_template","label":"Standardised quote template / 標準工程說明／報價範本"},{"key":"job_tracking","label":"Job tracking / 應用程式內工程追蹤"},{"key":"materials_discounts","label":"Materials discounts / 以優惠價獲取建築材料"},{"key":"dispute_resolution","label":"Dispute resolution / 獨立仲裁糾紛解決"},{"key":"trade_matched_leads","label":"Trade-matched leads / 按你的工種配對工程"}]}'::jsonb,
      TRUE, 12),
    ('qqr_biggest_platform_concerns', survey_questionnaire_id, 'biggest_platform_concerns', 'What is your biggest concern about joining a platform like FitOut Hub? (Select all that apply)', NULL, 'multi_select', NULL, NULL, NULL, TRUE, 13),
    ('qqr_verified_contractor_interest', survey_questionnaire_id, 'verified_contractor_interest', 'Would you be interested in joining FitOut Hub as a verified contractor when it launches?', NULL, 'single_select', NULL, NULL, NULL, TRUE, 14),
    ('qqr_most_useful_single_thing', survey_questionnaire_id, 'most_useful_single_thing', 'What single thing would make FitOut Hub most useful for your business?', NULL, 'long_text', NULL, NULL, NULL, TRUE, 15),
    ('qqr_follow_up_contact_optional', survey_questionnaire_id, 'follow_up_contact_optional', '[Optional] Leave your name and WhatsApp for a 15-minute follow-up call — early joiners get 3 months free listing.', NULL, 'long_text', 'Name + WhatsApp', NULL, NULL, FALSE, 16)
  ON CONFLICT ("questionnaireId", "code") DO UPDATE SET
    "title" = EXCLUDED."title",
    "description" = EXCLUDED."description",
    "type" = EXCLUDED."type",
    "placeholder" = EXCLUDED."placeholder",
    "helpText" = EXCLUDED."helpText",
    "settings" = EXCLUDED."settings",
    "isRequired" = EXCLUDED."isRequired",
    "sortOrder" = EXCLUDED."sortOrder";

  DELETE FROM "QuestionnaireQuestionOption"
  WHERE "questionId" IN (
    SELECT "id"
    FROM "QuestionnaireQuestion"
    WHERE "questionnaireId" = survey_questionnaire_id
      AND "code" IN (
        'primary_trade', 'experience_years_hk', 'team_size', 'jobs_per_month', 'avg_job_value',
        'lead_sources', 'lead_generation_satisfaction', 'digital_tools',
        'acceptable_commission_rate', 'subscription_willingness',
        'biggest_platform_concerns', 'verified_contractor_interest'
      )
  );

  INSERT INTO "QuestionnaireQuestionOption" (
    "id", "questionId", "value", "label", "sortOrder"
  )
  SELECT
    CONCAT('qqropt_', opt.question_code, '_', opt.value),
    q."id",
    opt.value,
    opt.label,
    opt.sort_order
  FROM (
    VALUES
      ('primary_trade', 'general_renovation_fitout', 'General renovation / fit-out', 1),
      ('primary_trade', 'plumbing', 'Plumbing', 2),
      ('primary_trade', 'electrical', 'Electrical', 3),
      ('primary_trade', 'painting', 'Painting', 4),
      ('primary_trade', 'tiling_flooring', 'Tiling / flooring', 5),
      ('primary_trade', 'carpentry_joinery', 'Carpentry / joinery', 6),
      ('primary_trade', 'air_conditioning', 'Air conditioning', 7),
      ('primary_trade', 'plastering_ceiling', 'Plastering / ceiling', 8),
      ('primary_trade', 'multiple_trades_general_contractor', 'Multiple trades (general contractor)', 9),
      ('primary_trade', 'other', 'Other (please specify)', 10),

      ('experience_years_hk', 'lt_2_years', 'Less than 2 years', 1),
      ('experience_years_hk', '2_5_years', '2–5 years', 2),
      ('experience_years_hk', '6_10_years', '6–10 years', 3),
      ('experience_years_hk', '11_20_years', '11–20 years', 4),
      ('experience_years_hk', 'gt_20_years', 'More than 20 years', 5),

      ('team_size', 'sole_trader', 'Just me (sole trader)', 1),
      ('team_size', '2_3_people', '2–3 people', 2),
      ('team_size', '4_10_people', '4–10 people', 3),
      ('team_size', '11_20_people', '11–20 people', 4),
      ('team_size', 'gt_20_people', 'More than 20', 5),

      ('jobs_per_month', '1_3_jobs', '1–3 jobs', 1),
      ('jobs_per_month', '4_8_jobs', '4–8 jobs', 2),
      ('jobs_per_month', '9_15_jobs', '9–15 jobs', 3),
      ('jobs_per_month', 'gt_15_jobs', 'More than 15 jobs', 4),

      ('avg_job_value', 'lt_2000', 'Under HKD 2,000', 1),
      ('avg_job_value', '2000_5000', 'HKD 2,000–5,000', 2),
      ('avg_job_value', '5001_15000', 'HKD 5,001–15,000', 3),
      ('avg_job_value', '15001_50000', 'HKD 15,001–50,000', 4),
      ('avg_job_value', '50001_150000', 'HKD 50,001–150,000', 5),
      ('avg_job_value', 'gt_150000', 'Over HKD 150,000', 6),

      ('lead_sources', 'personal_referrals_word_of_mouth', 'Personal referrals / word of mouth', 1),
      ('lead_sources', 'repeat_customers', 'Repeat customers', 2),
      ('lead_sources', 'facebook_groups_marketplace', 'Facebook groups or Marketplace', 3),
      ('lead_sources', 'building_management_property_agent_referrals', 'Building management / property agent referrals', 4),
      ('lead_sources', 'online_platforms', 'Online platforms (please specify)', 5),
      ('lead_sources', 'cold_calls_flyers', 'Cold calls / flyers', 6),
      ('lead_sources', 'existing_platform_i_list_on', 'Existing platform I list on (please specify)', 7),
      ('lead_sources', 'other', 'Other', 8),

      ('lead_generation_satisfaction', '1', '1 — Very dissatisfied', 1),
      ('lead_generation_satisfaction', '2', '2 — Dissatisfied', 2),
      ('lead_generation_satisfaction', '3', '3 — Neutral', 3),
      ('lead_generation_satisfaction', '4', '4 — Satisfied', 4),
      ('lead_generation_satisfaction', '5', '5 — Very satisfied', 5),

      ('digital_tools', 'whatsapp', 'WhatsApp (for client communication)', 1),
      ('digital_tools', 'facebook_instagram', 'Facebook / Instagram (marketing)', 2),
      ('digital_tools', 'spreadsheet', 'Spreadsheet (Excel / Google Sheets)', 3),
      ('digital_tools', 'accounting_software', 'Accounting software', 4),
      ('digital_tools', 'project_management_app', 'Project management app', 5),
      ('digital_tools', 'no_digital_tools', 'I don''t use digital tools', 6),
      ('digital_tools', 'other', 'Other', 7),

      ('acceptable_commission_rate', 'none', 'I would not pay any commission', 1),
      ('acceptable_commission_rate', 'up_to_5', 'Up to 5% per job', 2),
      ('acceptable_commission_rate', '6_10', '6–10% per job', 3),
      ('acceptable_commission_rate', '11_15', '11–15% per job', 4),
      ('acceptable_commission_rate', 'depends_on_job_size', 'It depends on the job size — willing to negotiate', 5),

      ('subscription_willingness', 'yes_200_or_less', 'Yes, HKD 200 or less', 1),
      ('subscription_willingness', 'yes_200_400', 'Yes, HKD 200–400', 2),
      ('subscription_willingness', 'yes_gt_400_if_quality_high', 'Yes, more than HKD 400 if the leads are high quality', 3),
      ('subscription_willingness', 'no_commission_only', 'No, I prefer commission-only (no subscription)', 4),
      ('subscription_willingness', 'no_neither_model', 'No, I wouldn''t pay either model', 5),

      ('biggest_platform_concerns', 'commission_cost_too_high', 'Commission cost is too high', 1),
      ('biggest_platform_concerns', 'bad_unfair_customer_reviews', 'Worried about bad / unfair customer reviews', 2),
      ('biggest_platform_concerns', 'privacy_contact_info_shared', 'Privacy — don''t want personal contact info shared', 3),
      ('biggest_platform_concerns', 'not_enough_homeowners_use_it', 'Not enough homeowners will actually use it', 4),
      ('biggest_platform_concerns', 'existing_platform_already_works', 'Another platform I already use works well enough', 5),
      ('biggest_platform_concerns', 'not_comfortable_with_digital_platforms', 'I''m not comfortable with digital platforms', 6),
      ('biggest_platform_concerns', 'other', 'Other (please specify)', 7),

      ('verified_contractor_interest', 'yes_definitely', 'Yes, definitely', 1),
      ('verified_contractor_interest', 'probably_yes', 'Probably yes', 2),
      ('verified_contractor_interest', 'undecided', 'Undecided', 3),
      ('verified_contractor_interest', 'probably_not', 'Probably not', 4),
      ('verified_contractor_interest', 'definitely_not', 'Definitely not', 5)
  ) AS opt(question_code, value, label, sort_order)
  JOIN "QuestionnaireQuestion" q
    ON q."questionnaireId" = survey_questionnaire_id
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
      'qnrtr_contractor_tradesman_research_zh_hk',
      survey_questionnaire_id,
      'zh-HK',
      'FitOut Hub — 承建商及裝修技工研究問卷',
      '雙語承建商及裝修技工研究問卷，重點了解客源質素、經營痛點、收費模式偏好及平台契合度。',
      '歡迎填寫承建商及裝修技工研究問卷',
      '此短問卷可協助我們按香港承建商及裝修技工的真實需要設計 FitOut Hub。',
      '多謝你的意見',
      '你的回覆已儲存，將用於產品優先排序及平台推出設計。',
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
      CONCAT('qqrtr_', item.code, '_zh_hk'),
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
        ('primary_trade', '你的主要工種是？', NULL, NULL, NULL),
        ('experience_years_hk', '你在香港從事此行業多少年？', NULL, NULL, NULL),
        ('team_size', '你的團隊有多少工人（包括你自己）？', NULL, NULL, NULL),
        ('jobs_per_month', '你每月大概完成多少個工程？', NULL, NULL, NULL),
        ('avg_job_value', '你每個工程的平均價值是？', NULL, NULL, NULL),
        ('lead_sources', '你目前主要如何獲得工作／客戶？（可選多項）', NULL, NULL, NULL),
        ('lead_generation_satisfaction', '你對現時獲取客源的方法有多滿意？', '1 = 非常不滿意，2 = 不滿意，3 = 一般，4 = 滿意，5 = 非常滿意', NULL, NULL),
        ('pain_points', '以下哪些經營痛點對你影響較大？', '請就每項評分：1（不是問題）至 5（重大問題）。', NULL, NULL),
        ('digital_tools', '你目前使用哪些數碼工具管理業務？（可選多項）', NULL, NULL, NULL),
        ('acceptable_commission_rate', '如果平台提供預先篩選的真實工作機會，並代管付款直至工程完成，你可接受的佣金是？', NULL, NULL, NULL),
        ('subscription_willingness', '你是否願意每月支付訂閱費（例如 HKD 200–400/月）以獲得工作機會及平台工具？', NULL, NULL, NULL),
        ('feature_importance', '以下平台功能對你有多重要？', '請就每項評分：1（不重要）至 5（非常重要）。', NULL, NULL),
        ('biggest_platform_concerns', '加入 FitOut Hub 這類平台，你最大的顧慮是？（可選多項）', NULL, NULL, NULL),
        ('verified_contractor_interest', 'FitOut Hub 推出時，你是否有興趣以認證承辦商身份加入？', NULL, NULL, NULL),
        ('most_useful_single_thing', '甚麼功能會讓 FitOut Hub 對你的業務最有幫助？', NULL, NULL, NULL),
        ('follow_up_contact_optional', '【可選】留下姓名及 WhatsApp 號碼，以接受 15 分鐘跟進訪問——早期加入者可免費上架 3 個月。', NULL, '姓名 + WhatsApp', NULL)
    ) AS item(code, title, description, placeholder, help_text)
    JOIN "QuestionnaireQuestion" q
      ON q."questionnaireId" = survey_questionnaire_id
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
      CONCAT('qqropttr_', item.question_code, '_', item.value, '_zh_hk'),
      o."id",
      'zh-HK',
      item.label,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM (
      VALUES
        ('primary_trade', 'general_renovation_fitout', '裝修工程'),
        ('primary_trade', 'plumbing', '水喉'),
        ('primary_trade', 'electrical', '電氣'),
        ('primary_trade', 'painting', '油漆'),
        ('primary_trade', 'tiling_flooring', '磁磚／地板'),
        ('primary_trade', 'carpentry_joinery', '木工'),
        ('primary_trade', 'air_conditioning', '冷氣'),
        ('primary_trade', 'plastering_ceiling', '批盪／天花'),
        ('primary_trade', 'multiple_trades_general_contractor', '多工種（總承建商）'),
        ('primary_trade', 'other', '其他（請註明）'),

        ('experience_years_hk', 'lt_2_years', '少於2年'),
        ('experience_years_hk', '2_5_years', '2–5年'),
        ('experience_years_hk', '6_10_years', '6–10年'),
        ('experience_years_hk', '11_20_years', '11–20年'),
        ('experience_years_hk', 'gt_20_years', '20年以上'),

        ('team_size', 'sole_trader', '只有我自己（獨立師傅）'),
        ('team_size', '2_3_people', '2–3人'),
        ('team_size', '4_10_people', '4–10人'),
        ('team_size', '11_20_people', '11–20人'),
        ('team_size', 'gt_20_people', '20人以上'),

        ('jobs_per_month', '1_3_jobs', '1–3個'),
        ('jobs_per_month', '4_8_jobs', '4–8個'),
        ('jobs_per_month', '9_15_jobs', '9–15個'),
        ('jobs_per_month', 'gt_15_jobs', '15個以上'),

        ('avg_job_value', 'lt_2000', 'HKD 2,000以下'),
        ('avg_job_value', '2000_5000', 'HKD 2,000–5,000'),
        ('avg_job_value', '5001_15000', 'HKD 5,001–15,000'),
        ('avg_job_value', '15001_50000', 'HKD 15,001–50,000'),
        ('avg_job_value', '50001_150000', 'HKD 50,001–150,000'),
        ('avg_job_value', 'gt_150000', 'HKD 150,000以上'),

        ('lead_sources', 'personal_referrals_word_of_mouth', '親友介紹'),
        ('lead_sources', 'repeat_customers', '回頭客'),
        ('lead_sources', 'facebook_groups_marketplace', 'Facebook 群組或 Marketplace'),
        ('lead_sources', 'building_management_property_agent_referrals', '大廈管理／地產代理介紹'),
        ('lead_sources', 'online_platforms', '網上平台（請註明）'),
        ('lead_sources', 'cold_calls_flyers', '冷打電話／傳單'),
        ('lead_sources', 'existing_platform_i_list_on', '現有上架平台（請註明）'),
        ('lead_sources', 'other', '其他'),

        ('lead_generation_satisfaction', '1', '1 — 非常不滿意'),
        ('lead_generation_satisfaction', '2', '2 — 不滿意'),
        ('lead_generation_satisfaction', '3', '3 — 一般'),
        ('lead_generation_satisfaction', '4', '4 — 滿意'),
        ('lead_generation_satisfaction', '5', '5 — 非常滿意'),

        ('digital_tools', 'whatsapp', 'WhatsApp（客戶溝通）'),
        ('digital_tools', 'facebook_instagram', 'Facebook / Instagram（宣傳）'),
        ('digital_tools', 'spreadsheet', '試算表（Excel / Google Sheets）'),
        ('digital_tools', 'accounting_software', '會計軟件'),
        ('digital_tools', 'project_management_app', '項目管理 App'),
        ('digital_tools', 'no_digital_tools', '我沒有使用數碼工具'),
        ('digital_tools', 'other', '其他'),

        ('acceptable_commission_rate', 'none', '不願意付佣金'),
        ('acceptable_commission_rate', 'up_to_5', '最多5%'),
        ('acceptable_commission_rate', '6_10', '6–10%'),
        ('acceptable_commission_rate', '11_15', '11–15%'),
        ('acceptable_commission_rate', 'depends_on_job_size', '視乎工程大小，願意商討'),

        ('subscription_willingness', 'yes_200_or_less', '願意，HKD 200或以下'),
        ('subscription_willingness', 'yes_200_400', '願意，HKD 200–400'),
        ('subscription_willingness', 'yes_gt_400_if_quality_high', '願意，若工作質素高可付更多'),
        ('subscription_willingness', 'no_commission_only', '不，傾向純佣金制'),
        ('subscription_willingness', 'no_neither_model', '不，兩種方式都不願意'),

        ('biggest_platform_concerns', 'commission_cost_too_high', '佣金成本太高'),
        ('biggest_platform_concerns', 'bad_unfair_customer_reviews', '擔心不公平的客戶評價'),
        ('biggest_platform_concerns', 'privacy_contact_info_shared', '私隱問題'),
        ('biggest_platform_concerns', 'not_enough_homeowners_use_it', '擔心業主使用率不足'),
        ('biggest_platform_concerns', 'existing_platform_already_works', '現有平台已足夠'),
        ('biggest_platform_concerns', 'not_comfortable_with_digital_platforms', '不習慣使用數碼平台'),
        ('biggest_platform_concerns', 'other', '其他（請註明）'),

        ('verified_contractor_interest', 'yes_definitely', '肯定有興趣'),
        ('verified_contractor_interest', 'probably_yes', '可能有興趣'),
        ('verified_contractor_interest', 'undecided', '未決定'),
        ('verified_contractor_interest', 'probably_not', '可能沒興趣'),
        ('verified_contractor_interest', 'definitely_not', '肯定沒興趣')
    ) AS item(question_code, value, label)
    JOIN "QuestionnaireQuestion" q
      ON q."questionnaireId" = survey_questionnaire_id
     AND q."code" = item.question_code
    JOIN "QuestionnaireQuestionOption" o
      ON o."questionId" = q."id"
     AND o."value" = item.value
    ON CONFLICT ("optionId", "locale") DO UPDATE SET
      "label" = EXCLUDED."label",
      "updatedAt" = CURRENT_TIMESTAMP;
  END IF;
END $$;
