import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { CreateQuestionnaireDto } from './dto/create-questionnaire.dto';
import { CreateQuestionnaireInviteDto } from './dto/create-questionnaire-invite.dto';
import { SaveQuestionnaireAnswerDto } from './dto/save-questionnaire-answer.dto';

const STARTER_AUDIENCE = 'contractor_tradesman';
const STARTER_SLUG = 'contractor-tradesman-research';
const DEFAULT_LOCALE = 'en';

type QuestionnaireQuestionTypeValue =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'matrix_rating'
  | 'yes_no'
  | 'number'
  | 'email'
  | 'phone'
  | 'date';

type QuestionDefinition = {
  code: string;
  title: string;
  description?: string;
  type: QuestionnaireQuestionTypeValue;
  placeholder?: string;
  helpText?: string;
  isRequired?: boolean;
  sortOrder: number;
  settings?: Record<string, unknown> | null;
  options?: Array<{
    value: string;
    label: string;
    sortOrder?: number;
  }>;
};

type StarterTemplateDefinition = {
  key: string;
  label: string;
  prompt: string;
  type: QuestionnaireQuestionTypeValue;
  placeholder?: string;
  options?: Array<{
    value: string;
    label: string;
    sortOrder?: number;
  }>;
};

const STARTER_QUESTIONS: QuestionDefinition[] = [
  {
    code: 'primary_trade',
    title: 'What is your primary trade?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 1,
    options: [
      { value: 'general_renovation_fitout', label: 'General renovation / fit-out', sortOrder: 1 },
      { value: 'plumbing', label: 'Plumbing', sortOrder: 2 },
      { value: 'electrical', label: 'Electrical', sortOrder: 3 },
      { value: 'painting', label: 'Painting', sortOrder: 4 },
      { value: 'tiling_flooring', label: 'Tiling / flooring', sortOrder: 5 },
      { value: 'carpentry_joinery', label: 'Carpentry / joinery', sortOrder: 6 },
      { value: 'air_conditioning', label: 'Air conditioning', sortOrder: 7 },
      { value: 'plastering_ceiling', label: 'Plastering / ceiling', sortOrder: 8 },
      { value: 'multiple_trades_general_contractor', label: 'Multiple trades (general contractor)', sortOrder: 9 },
      { value: 'other', label: 'Other (please specify)', sortOrder: 10 },
    ],
  },
  {
    code: 'experience_years_hk',
    title: 'How long have you been working in your trade in Hong Kong?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 2,
    options: [
      { value: 'lt_2_years', label: 'Less than 2 years', sortOrder: 1 },
      { value: '2_5_years', label: '2–5 years', sortOrder: 2 },
      { value: '6_10_years', label: '6–10 years', sortOrder: 3 },
      { value: '11_20_years', label: '11–20 years', sortOrder: 4 },
      { value: 'gt_20_years', label: 'More than 20 years', sortOrder: 5 },
    ],
  },
  {
    code: 'team_size',
    title: 'How many workers (including yourself) are in your team?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 3,
    options: [
      { value: 'sole_trader', label: 'Just me (sole trader)', sortOrder: 1 },
      { value: '2_3_people', label: '2–3 people', sortOrder: 2 },
      { value: '4_10_people', label: '4–10 people', sortOrder: 3 },
      { value: '11_20_people', label: '11–20 people', sortOrder: 4 },
      { value: 'gt_20_people', label: 'More than 20', sortOrder: 5 },
    ],
  },
  {
    code: 'jobs_per_month',
    title: 'Approximately how many jobs do you complete per month?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 4,
    options: [
      { value: '1_3_jobs', label: '1–3 jobs', sortOrder: 1 },
      { value: '4_8_jobs', label: '4–8 jobs', sortOrder: 2 },
      { value: '9_15_jobs', label: '9–15 jobs', sortOrder: 3 },
      { value: 'gt_15_jobs', label: 'More than 15 jobs', sortOrder: 4 },
    ],
  },
  {
    code: 'avg_job_value',
    title: 'What is the average value of a single job you complete?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 5,
    options: [
      { value: 'lt_2000', label: 'Under HKD 2,000', sortOrder: 1 },
      { value: '2000_5000', label: 'HKD 2,000–5,000', sortOrder: 2 },
      { value: '5001_15000', label: 'HKD 5,001–15,000', sortOrder: 3 },
      { value: '15001_50000', label: 'HKD 15,001–50,000', sortOrder: 4 },
      { value: '50001_150000', label: 'HKD 50,001–150,000', sortOrder: 5 },
      { value: 'gt_150000', label: 'Over HKD 150,000', sortOrder: 6 },
    ],
  },
  {
    code: 'lead_sources',
    title: 'How do you currently get most of your jobs / leads? (Select all that apply)',
    type: 'multi_select',
    isRequired: true,
    sortOrder: 6,
    options: [
      { value: 'personal_referrals_word_of_mouth', label: 'Personal referrals / word of mouth', sortOrder: 1 },
      { value: 'repeat_customers', label: 'Repeat customers', sortOrder: 2 },
      { value: 'facebook_groups_marketplace', label: 'Facebook groups or Marketplace', sortOrder: 3 },
      { value: 'building_management_property_agent_referrals', label: 'Building management / property agent referrals', sortOrder: 4 },
      { value: 'online_platforms', label: 'Online platforms (please specify)', sortOrder: 5 },
      { value: 'cold_calls_flyers', label: 'Cold calls / flyers', sortOrder: 6 },
      { value: 'existing_platform_i_list_on', label: 'Existing platform I list on (please specify)', sortOrder: 7 },
      { value: 'other', label: 'Other', sortOrder: 8 },
    ],
  },
  {
    code: 'lead_generation_satisfaction',
    title: 'How satisfied are you with your current lead generation methods?',
    description:
      '1 = Very dissatisfied, 2 = Dissatisfied, 3 = Neutral, 4 = Satisfied, 5 = Very satisfied',
    type: 'single_select',
    isRequired: true,
    sortOrder: 7,
    options: [
      { value: '1', label: '1 — Very dissatisfied', sortOrder: 1 },
      { value: '2', label: '2 — Dissatisfied', sortOrder: 2 },
      { value: '3', label: '3 — Neutral', sortOrder: 3 },
      { value: '4', label: '4 — Satisfied', sortOrder: 4 },
      { value: '5', label: '5 — Very satisfied', sortOrder: 5 },
    ],
  },
  {
    code: 'pain_points',
    title: 'How significant are the following business pain points for you?',
    description: 'Rate each 1 (not a problem) to 5 (major problem).',
    type: 'matrix_rating',
    isRequired: true,
    sortOrder: 8,
    settings: {
      rows: [
        { key: 'unpredictable_lead_flow', label: 'Unpredictable lead flow', labelZhHk: '工作來源不穩定' },
        { key: 'customers_who_ghost', label: 'Customers who ghost', labelZhHk: '報價後客戶「消失」' },
        { key: 'late_disputed_payment', label: 'Late / disputed payment', labelZhHk: '付款延遲或糾紛' },
        { key: 'scope_creep', label: 'Scope creep', labelZhHk: '客戶不斷加工但不加錢' },
        { key: 'quoting_waste', label: 'Quoting waste', labelZhHk: '浪費時間報價但工程告吹' },
        { key: 'race_to_bottom_on_price', label: 'Race to bottom on price', labelZhHk: '被低質素競爭者壓低價格' },
        { key: 'building_online_reputation', label: 'Building online reputation', labelZhHk: '難以建立網上口碑' },
        { key: 'cash_flow_issues', label: 'Cash flow issues', labelZhHk: '工程之間的現金流問題' },
      ],
    },
  },
  {
    code: 'digital_tools',
    title: 'What digital tools do you currently use for your business? (Select all that apply)',
    type: 'multi_select',
    isRequired: true,
    sortOrder: 9,
    options: [
      { value: 'whatsapp', label: 'WhatsApp (for client communication)', sortOrder: 1 },
      { value: 'facebook_instagram', label: 'Facebook / Instagram (marketing)', sortOrder: 2 },
      { value: 'spreadsheet', label: 'Spreadsheet (Excel / Google Sheets)', sortOrder: 3 },
      { value: 'accounting_software', label: 'Accounting software', sortOrder: 4 },
      { value: 'project_management_app', label: 'Project management app', sortOrder: 5 },
      { value: 'no_digital_tools', label: "I don't use digital tools", sortOrder: 6 },
      { value: 'other', label: 'Other', sortOrder: 7 },
    ],
  },
  {
    code: 'acceptable_commission_rate',
    title:
      'If a platform provided you with pre-qualified, genuine job leads and held payment securely until the job was done, what commission rate would be acceptable?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 10,
    options: [
      { value: 'none', label: 'I would not pay any commission', sortOrder: 1 },
      { value: 'up_to_5', label: 'Up to 5% per job', sortOrder: 2 },
      { value: '6_10', label: '6–10% per job', sortOrder: 3 },
      { value: '11_15', label: '11–15% per job', sortOrder: 4 },
      {
        value: 'depends_on_job_size',
        label: 'It depends on the job size — willing to negotiate',
        sortOrder: 5,
      },
    ],
  },
  {
    code: 'subscription_willingness',
    title:
      'Would you be willing to pay a monthly subscription fee (e.g. HKD 200–400/month) for guaranteed access to leads and platform tools?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 11,
    options: [
      { value: 'yes_200_or_less', label: 'Yes, HKD 200 or less', sortOrder: 1 },
      { value: 'yes_200_400', label: 'Yes, HKD 200–400', sortOrder: 2 },
      {
        value: 'yes_gt_400_if_quality_high',
        label: 'Yes, more than HKD 400 if the leads are high quality',
        sortOrder: 3,
      },
      {
        value: 'no_commission_only',
        label: 'No, I prefer commission-only (no subscription)',
        sortOrder: 4,
      },
      { value: 'no_neither_model', label: "No, I wouldn't pay either model", sortOrder: 5 },
    ],
  },
  {
    code: 'feature_importance',
    title: 'How important are the following platform features to you?',
    description: 'Rate each 1 (not important) to 5 (essential).',
    type: 'matrix_rating',
    isRequired: true,
    sortOrder: 12,
    settings: {
      rows: [
        { key: 'escrow_payment', label: 'Escrow payment', labelZhHk: '代管付款保障' },
        { key: 'reviews_verified_history', label: 'Reviews + verified history', labelZhHk: '顯示評價及經核實工程紀錄' },
        { key: 'standardised_quote_template', label: 'Standardised quote template', labelZhHk: '標準工程說明／報價範本' },
        { key: 'job_tracking', label: 'Job tracking', labelZhHk: '應用程式內工程追蹤' },
        { key: 'materials_discounts', label: 'Materials discounts', labelZhHk: '以優惠價獲取建築材料' },
        { key: 'dispute_resolution', label: 'Dispute resolution', labelZhHk: '獨立仲裁糾紛解決' },
        { key: 'trade_matched_leads', label: 'Trade-matched leads', labelZhHk: '按你的工種配對工程' },
      ],
    },
  },
  {
    code: 'biggest_platform_concerns',
    title: 'What is your biggest concern about joining a platform like FitOut Hub? (Select all that apply)',
    type: 'multi_select',
    isRequired: true,
    sortOrder: 13,
    options: [
      { value: 'commission_cost_too_high', label: 'Commission cost is too high', sortOrder: 1 },
      {
        value: 'bad_unfair_customer_reviews',
        label: 'Worried about bad / unfair customer reviews',
        sortOrder: 2,
      },
      {
        value: 'privacy_contact_info_shared',
        label: "Privacy — don't want personal contact info shared",
        sortOrder: 3,
      },
      {
        value: 'not_enough_homeowners_use_it',
        label: 'Not enough homeowners will actually use it',
        sortOrder: 4,
      },
      {
        value: 'existing_platform_already_works',
        label: 'Another platform I already use works well enough',
        sortOrder: 5,
      },
      {
        value: 'not_comfortable_with_digital_platforms',
        label: "I'm not comfortable with digital platforms",
        sortOrder: 6,
      },
      { value: 'other', label: 'Other (please specify)', sortOrder: 7 },
    ],
  },
  {
    code: 'verified_contractor_interest',
    title: 'Would you be interested in joining FitOut Hub as a verified contractor when it launches?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 14,
    options: [
      { value: 'yes_definitely', label: 'Yes, definitely', sortOrder: 1 },
      { value: 'probably_yes', label: 'Probably yes', sortOrder: 2 },
      { value: 'undecided', label: 'Undecided', sortOrder: 3 },
      { value: 'probably_not', label: 'Probably not', sortOrder: 4 },
      { value: 'definitely_not', label: 'Definitely not', sortOrder: 5 },
    ],
  },
  {
    code: 'most_useful_single_thing',
    title: 'What single thing would make FitOut Hub most useful for your business?',
    type: 'long_text',
    isRequired: true,
    sortOrder: 15,
  },
  {
    code: 'follow_up_contact_optional',
    title:
      '[Optional] Leave your name and WhatsApp for a 15-minute follow-up call — early joiners get 3 months free listing.',
    type: 'long_text',
    placeholder: 'Name + WhatsApp',
    isRequired: false,
    sortOrder: 16,
  },
];

const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    key: 'primary_trade',
    label: 'Primary trade',
    prompt: 'What is your primary trade?',
    type: 'single_select',
    options: [
      { value: 'general_renovation_fitout', label: 'General renovation / fit-out', sortOrder: 1 },
      { value: 'plumbing', label: 'Plumbing', sortOrder: 2 },
      { value: 'electrical', label: 'Electrical', sortOrder: 3 },
      { value: 'painting', label: 'Painting', sortOrder: 4 },
      { value: 'tiling_flooring', label: 'Tiling / flooring', sortOrder: 5 },
      { value: 'carpentry_joinery', label: 'Carpentry / joinery', sortOrder: 6 },
      { value: 'air_conditioning', label: 'Air conditioning', sortOrder: 7 },
      { value: 'plastering_ceiling', label: 'Plastering / ceiling', sortOrder: 8 },
      { value: 'multiple_trades_general_contractor', label: 'Multiple trades (general contractor)', sortOrder: 9 },
      { value: 'other', label: 'Other (please specify)', sortOrder: 10 },
    ],
  },
  {
    key: 'experience_years_hk',
    label: 'Trade experience in HK',
    prompt: 'How long have you been working in your trade in Hong Kong?',
    type: 'single_select',
    options: [
      { value: 'lt_2_years', label: 'Less than 2 years', sortOrder: 1 },
      { value: '2_5_years', label: '2–5 years', sortOrder: 2 },
      { value: '6_10_years', label: '6–10 years', sortOrder: 3 },
      { value: '11_20_years', label: '11–20 years', sortOrder: 4 },
      { value: 'gt_20_years', label: 'More than 20 years', sortOrder: 5 },
    ],
  },
  {
    key: 'pain_points',
    label: 'Business pain points (matrix)',
    prompt: 'How significant are the following business pain points for you?',
    type: 'matrix_rating',
  },
  {
    key: 'feature_importance',
    label: 'Platform feature importance (matrix)',
    prompt: 'How important are the following platform features to you?',
    type: 'matrix_rating',
  },
  {
    key: 'verified_contractor_interest',
    label: 'Verified contractor interest',
    prompt: 'Would you be interested in joining FitOut Hub as a verified contractor when it launches?',
    type: 'single_select',
    options: [
      { value: 'yes_definitely', label: 'Yes, definitely', sortOrder: 1 },
      { value: 'probably_yes', label: 'Probably yes', sortOrder: 2 },
      { value: 'undecided', label: 'Undecided', sortOrder: 3 },
      { value: 'probably_not', label: 'Probably not', sortOrder: 4 },
      { value: 'definitely_not', label: 'Definitely not', sortOrder: 5 },
    ],
  },
];

@Injectable()
export class QuestionnairesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async listQuestionnaires() {
    const items = await this.prisma.questionnaire.findMany({
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        _count: {
          select: {
            questions: true,
            invites: true,
            submissions: true,
          },
        },
      },
    });

    return items;
  }

  async listTemplates() {
    return this.prisma.questionnaireTemplate.findMany({
      orderBy: [{ isSystem: 'desc' }, { label: 'asc' }],
      include: {
        options: {
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
    });
  }

  async getQuestionnaire(id: string) {
    const item = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: {
        questions: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            options: {
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
        },
        invites: {
          orderBy: [{ createdAt: 'desc' }],
          take: 50,
          include: {
            submission: {
              include: {
                answers: true,
              },
            },
          },
        },
        submissions: {
          orderBy: [{ startedAt: 'desc' }],
          take: 25,
          include: {
            invite: true,
            answers: {
              include: {
                question: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Questionnaire not found');
    }

    return item;
  }

  async previewQuestionnaire(id: string, locale?: string) {
    const item = await this.prisma.questionnaire.findUnique({
      where: { id },
      include: {
        translations: {
          orderBy: [{ locale: 'asc' }],
        },
        questions: {
          orderBy: [{ sortOrder: 'asc' }],
          include: {
            translations: {
              orderBy: [{ locale: 'asc' }],
            },
            options: {
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                translations: {
                  orderBy: [{ locale: 'asc' }],
                },
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException('Questionnaire not found');
    }

    const resolvedLocale = this.normaliseLocale(locale);
    const availableLocales = new Set<string>([DEFAULT_LOCALE]);

    for (const translation of item.translations || []) {
      availableLocales.add(this.normaliseLocale(translation.locale));
    }

    for (const question of item.questions || []) {
      for (const translation of question.translations || []) {
        availableLocales.add(this.normaliseLocale(translation.locale));
      }
      for (const option of question.options || []) {
        for (const translation of option.translations || []) {
          availableLocales.add(this.normaliseLocale(translation.locale));
        }
      }
    }

    const questionnaireTranslation = this.pickTranslation(
      item.translations,
      resolvedLocale,
    );

    return {
      id: item.id,
      slug: item.slug,
      status: item.status,
      locale: resolvedLocale,
      fallbackLocale: DEFAULT_LOCALE,
      availableLocales: Array.from(availableLocales.values()).sort(),
      title:
        this.pickTranslatedField(questionnaireTranslation, 'title', item.title) ||
        item.title,
      description: this.pickTranslatedField(
        questionnaireTranslation,
        'description',
        item.description,
      ),
      welcomeTitle: this.pickTranslatedField(
        questionnaireTranslation,
        'welcomeTitle',
        item.welcomeTitle,
      ),
      welcomeMessage: this.pickTranslatedField(
        questionnaireTranslation,
        'welcomeMessage',
        item.welcomeMessage,
      ),
      thankYouTitle: this.pickTranslatedField(
        questionnaireTranslation,
        'thankYouTitle',
        item.thankYouTitle,
      ),
      thankYouMessage: this.pickTranslatedField(
        questionnaireTranslation,
        'thankYouMessage',
        item.thankYouMessage,
      ),
      joinCtaLabel: this.pickTranslatedField(
        questionnaireTranslation,
        'joinCtaLabel',
        item.joinCtaLabel,
      ),
      joinCtaUrl: this.pickTranslatedField(
        questionnaireTranslation,
        'joinCtaUrl',
        item.joinCtaUrl,
      ),
      questions: item.questions.map((question) => {
        const questionTranslation = this.pickTranslation(
          question.translations,
          resolvedLocale,
        );

        return {
          id: question.id,
          code: question.code,
          title:
            this.pickTranslatedField(questionTranslation, 'title', question.title) ||
            question.title,
          description: this.pickTranslatedField(
            questionTranslation,
            'description',
            question.description,
          ),
          type: question.type,
          settings: question.settings,
          placeholder: this.pickTranslatedField(
            questionTranslation,
            'placeholder',
            question.placeholder,
          ),
          helpText: this.pickTranslatedField(
            questionTranslation,
            'helpText',
            question.helpText,
          ),
          isRequired: question.isRequired,
          sortOrder: question.sortOrder,
          options: question.options.map((option) => {
            const optionTranslation = this.pickTranslation(
              option.translations,
              resolvedLocale,
            );

            return {
              id: option.id,
              value: option.value,
              sortOrder: option.sortOrder,
              label:
                this.pickTranslatedField(optionTranslation, 'label', option.label) ||
                option.label,
            };
          }),
        };
      }),
    };
  }

  async listResponses(questionnaireId: string, locale?: string) {
    const resolvedLocale = this.normaliseLocale(locale);

    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      include: {
        questions: {
          include: {
            translations: true,
            options: {
              include: {
                translations: true,
              },
              orderBy: [{ sortOrder: 'asc' }],
            },
          },
          orderBy: [{ sortOrder: 'asc' }],
        },
      },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire not found');
    }

    const questionLookup = new Map(
      questionnaire.questions.map((question) => {
        const translation = this.pickTranslation(
          question.translations,
          resolvedLocale,
        );

        const localizedTitle =
          this.pickTranslatedField(translation, 'title', question.title) ||
          question.title;

        const optionLabelByValue = new Map(
          question.options.map((option) => {
            const optionTranslation = this.pickTranslation(
              option.translations,
              resolvedLocale,
            );
            const localizedLabel =
              this.pickTranslatedField(optionTranslation, 'label', option.label) ||
              option.label;

            return [option.value, localizedLabel] as const;
          }),
        );

        return [
          question.id,
          {
            code: question.code,
            type: question.type,
            title: localizedTitle,
            optionLabelByValue,
          },
        ] as const;
      }),
    );

    const rows = await this.prisma.questionnaireSubmission.findMany({
      where: { questionnaireId },
      orderBy: [{ startedAt: 'desc' }],
      include: {
        invite: true,
        answers: {
          include: {
            question: true,
          },
          orderBy: [{ answeredAt: 'asc' }],
        },
      },
    });

    return rows.map((row) => ({
      ...row,
      locale: resolvedLocale,
      answers: row.answers.map((answer) => {
        const questionMeta = questionLookup.get(answer.questionId);
        const displayValue = this.localizeAnswerDisplay(
          questionMeta?.type,
          answer.value,
          questionMeta?.optionLabelByValue,
        );

        return {
          ...answer,
          question: {
            ...answer.question,
            code: questionMeta?.code || answer.question.code,
            title: questionMeta?.title || answer.question.title,
          },
          displayValue,
        };
      }),
    }));
  }

  async createQuestionnaire(dto: CreateQuestionnaireDto, adminUserId: string) {
    const title = (dto.title || '').trim();
    const audienceKey = (dto.audienceKey || '').trim();
    if (!title) {
      throw new BadRequestException('Questionnaire title is required');
    }
    if (!audienceKey) {
      throw new BadRequestException('Audience key is required');
    }

    const slug = this.normaliseSlug(dto.slug || title);
    const existing = await this.prisma.questionnaire.findUnique({ where: { slug } });
    if (existing) {
      throw new BadRequestException('A questionnaire with this slug already exists');
    }

    const created = await this.prisma.questionnaire.create({
      data: {
        slug,
        title,
        audienceKey,
        description: this.asOptionalString(dto.description),
        welcomeTitle: this.asOptionalString(dto.welcomeTitle),
        welcomeMessage: this.asOptionalString(dto.welcomeMessage),
        thankYouTitle: this.asOptionalString(dto.thankYouTitle),
        thankYouMessage: this.asOptionalString(dto.thankYouMessage),
        joinCtaLabel: this.asOptionalString(dto.joinCtaLabel),
        joinCtaUrl: this.asOptionalString(dto.joinCtaUrl),
        status: dto.status || 'draft',
        createdBy: adminUserId,
        questions: dto.questions?.length
          ? {
              create: dto.questions
                .slice()
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((question) => ({
                  code: question.code.trim(),
                  title: question.title.trim(),
                  description: this.asOptionalString(question.description),
                  type: question.type,
                  placeholder: this.asOptionalString(question.placeholder),
                  helpText: this.asOptionalString(question.helpText),
                  isRequired: question.isRequired !== false,
                  sortOrder: question.sortOrder,
                  settings:
                    question.settings === undefined
                      ? undefined
                      : this.toNullableJson(question.settings),
                  options: question.options?.length
                    ? {
                        create: question.options.map((option, index) => ({
                          value: option.value.trim(),
                          label: option.label.trim(),
                          sortOrder: option.sortOrder ?? index + 1,
                        })),
                      }
                    : undefined,
                })),
            }
          : undefined,
      },
    });

    return this.getQuestionnaire(created.id);
  }

  async ensureStarterQuestionnaire(adminUserId: string) {
    await this.ensureStarterTemplates();

    const existing = await this.prisma.questionnaire.findUnique({
      where: { slug: STARTER_SLUG },
      select: { id: true },
    });

    if (existing) {
      return this.getQuestionnaire(existing.id);
    }

    const created = await this.prisma.questionnaire.create({
      data: {
        slug: STARTER_SLUG,
        title: 'FitOut Hub — Contractor & Tradesman Research',
        audienceKey: STARTER_AUDIENCE,
        description:
          'Bilingual contractor and tradesman research survey focused on lead quality, pain points, monetisation preference, and platform fit.',
        welcomeTitle: 'Welcome to the contractor & tradesman research survey',
        welcomeMessage:
          'This short survey helps us design FitOut Hub around real contractor and tradesman needs in Hong Kong.',
        thankYouTitle: 'Thank you for your feedback',
        thankYouMessage:
          'Your responses have been saved and will help shape product priorities and launch design.',
        joinCtaLabel: 'Explore joining FitOut Hub',
        joinCtaUrl: '/professionals',
        status: 'active',
        createdBy: adminUserId,
        questions: {
          create: STARTER_QUESTIONS.map((question) => ({
            code: question.code,
            title: question.title,
            description: this.asOptionalString(question.description),
            type: question.type,
            placeholder: this.asOptionalString(question.placeholder),
            helpText: this.asOptionalString(question.helpText),
            isRequired: question.isRequired !== false,
            sortOrder: question.sortOrder,
            settings:
              question.settings === undefined
                ? undefined
                : this.toNullableJson(question.settings),
            options: question.options?.length
              ? {
                  create: question.options.map((option, index) => ({
                    value: option.value,
                    label: option.label,
                    sortOrder: option.sortOrder ?? index + 1,
                  })),
                }
              : undefined,
          })),
        },
      },
      select: { id: true },
    });

    return this.getQuestionnaire(created.id);
  }

  async createInvite(
    questionnaireId: string,
    dto: CreateQuestionnaireInviteDto,
    adminUserId: string,
  ) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire not found');
    }

    if (questionnaire.status === 'archived') {
      throw new BadRequestException('Archived questionnaires cannot send invites');
    }

    const email = (dto.email || '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Invite email is required');
    }

    const expiresAt =
      typeof dto.expiresInDays === 'number' && dto.expiresInDays > 0
        ? new Date(Date.now() + dto.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    const invite = await this.prisma.questionnaireInvite.create({
      data: {
        questionnaireId,
        email,
        recipientName: this.asOptionalString(dto.recipientName),
        roleLabel: this.asOptionalString(dto.roleLabel),
        companyName: this.asOptionalString(dto.companyName),
        projectId: this.asOptionalString(dto.projectId),
        professionalId: this.asOptionalString(dto.professionalId),
        invitedBy: adminUserId,
        expiresAt,
        customMessage: this.asOptionalString(dto.customMessage),
        metadata: {
          source: 'admin_questionnaire_invite',
        },
      },
    });

    const inviteUrl = `${this.getWebBaseUrl()}/questionnaires/${invite.token}`;

    await this.emailService.sendQuestionnaireInvitation({
      to: invite.email,
      recipientName: invite.recipientName || undefined,
      questionnaireTitle: questionnaire.title,
      inviteUrl,
      welcomeSummary: questionnaire.description || questionnaire.welcomeMessage || undefined,
      expiresAt: invite.expiresAt || undefined,
      customMessage: invite.customMessage || undefined,
    });

    return {
      invite,
      inviteUrl,
    };
  }

  async getPublicQuestionnaire(token: string, locale?: string) {
    const invite = await this.getInviteForPublic(token);
    return this.toPublicQuestionnaire(invite, locale);
  }

  async startPublicQuestionnaire(token: string) {
    const invite = await this.getInviteForPublic(token);

    const submission = invite.submission
      ? invite.submission
      : await this.prisma.questionnaireSubmission.create({
          data: {
            questionnaireId: invite.questionnaireId,
            inviteId: invite.id,
            respondentEmail: invite.email,
            respondentName: invite.recipientName || null,
            status: 'in_progress',
          },
          include: {
            answers: true,
          },
        });

    if (!invite.firstOpenedAt || invite.status === 'pending') {
      await this.prisma.questionnaireInvite.update({
        where: { id: invite.id },
        data: {
          firstOpenedAt: invite.firstOpenedAt || new Date(),
          status: 'opened',
        },
      });
    }

    return {
      success: true,
      submissionId: submission.id,
      startedAt: submission.startedAt,
    };
  }

  async savePublicAnswer(token: string, dto: SaveQuestionnaireAnswerDto) {
    const invite = await this.getInviteForPublic(token);

    const question = invite.questionnaire.questions.find(
      (item) => item.id === dto.questionId,
    );

    if (!question) {
      throw new NotFoundException('Question not found for this questionnaire');
    }

    const submission = invite.submission
      ? invite.submission
      : await this.prisma.questionnaireSubmission.create({
          data: {
            questionnaireId: invite.questionnaireId,
            inviteId: invite.id,
            respondentEmail: invite.email,
            respondentName: invite.recipientName || null,
            status: 'in_progress',
          },
          include: {
            answers: true,
          },
        });

    const value = this.normaliseAnswer(question, dto.value);
    const prismaValue = this.toNullableJson(value);

    await this.prisma.questionnaireAnswer.upsert({
      where: {
        submissionId_questionId: {
          submissionId: submission.id,
          questionId: question.id,
        },
      },
      update: {
        value: prismaValue,
        answeredAt: new Date(),
      },
      create: {
        submissionId: submission.id,
        questionId: question.id,
        value: prismaValue,
      },
    });

    if (!invite.firstOpenedAt || invite.status === 'pending') {
      await this.prisma.questionnaireInvite.update({
        where: { id: invite.id },
        data: {
          firstOpenedAt: invite.firstOpenedAt || new Date(),
          status: 'opened',
        },
      });
    }

    return { success: true };
  }

  async completePublicQuestionnaire(token: string, respondentName?: string) {
    const invite = await this.getInviteForPublic(token);

    const submission = invite.submission
      ? await this.prisma.questionnaireSubmission.findUnique({
          where: { id: invite.submission.id },
          include: {
            answers: true,
          },
        })
      : null;

    if (!submission) {
      throw new BadRequestException('Start the questionnaire before submitting it');
    }

    const answeredQuestionIds = new Set(submission.answers.map((answer) => answer.questionId));
    const missingRequired = invite.questionnaire.questions.filter(
      (question) => question.isRequired && !answeredQuestionIds.has(question.id),
    );

    if (missingRequired.length > 0) {
      throw new BadRequestException('Please answer all required questions before submitting');
    }

    await Promise.all([
      this.prisma.questionnaireSubmission.update({
        where: { id: submission.id },
        data: {
          status: 'completed',
          respondentName: this.asOptionalString(respondentName) || submission.respondentName,
          completedAt: new Date(),
        },
      }),
      this.prisma.questionnaireInvite.update({
        where: { id: invite.id },
        data: {
          status: 'submitted',
          submittedAt: new Date(),
          firstOpenedAt: invite.firstOpenedAt || new Date(),
        },
      }),
    ]);

    return { success: true };
  }

  private async ensureStarterTemplates() {
    for (const template of STARTER_TEMPLATES) {
      await this.prisma.questionnaireTemplate.upsert({
        where: { key: template.key },
        update: {
          label: template.label,
          prompt: template.prompt,
          type: template.type,
          placeholder: this.asOptionalString(template.placeholder),
          audienceKey: STARTER_AUDIENCE,
          isSystem: true,
          options: {
            deleteMany: {},
            create: (template.options || []).map((option, index) => ({
              value: option.value,
              label: option.label,
              sortOrder: option.sortOrder ?? index + 1,
            })),
          },
        },
        create: {
          key: template.key,
          label: template.label,
          prompt: template.prompt,
          type: template.type,
          placeholder: this.asOptionalString(template.placeholder),
          audienceKey: STARTER_AUDIENCE,
          isSystem: true,
          options: {
            create: (template.options || []).map((option, index) => ({
              value: option.value,
              label: option.label,
              sortOrder: option.sortOrder ?? index + 1,
            })),
          },
        },
      });
    }
  }

  private async getInviteForPublic(token: string) {
    const invite = await this.prisma.questionnaireInvite.findUnique({
      where: { token },
      include: {
        questionnaire: {
          include: {
            translations: {
              orderBy: [{ locale: 'asc' }],
            },
            questions: {
              orderBy: [{ sortOrder: 'asc' }],
              include: {
                translations: {
                  orderBy: [{ locale: 'asc' }],
                },
                options: {
                  orderBy: [{ sortOrder: 'asc' }],
                  include: {
                    translations: {
                      orderBy: [{ locale: 'asc' }],
                    },
                  },
                },
              },
            },
          },
        },
        submission: {
          include: {
            answers: true,
          },
        },
      },
    });

    if (!invite) {
      throw new NotFoundException('Questionnaire link not found');
    }

    if (invite.status === 'cancelled') {
      throw new BadRequestException('This questionnaire link is no longer available');
    }

    if (invite.expiresAt && new Date() > invite.expiresAt) {
      if (invite.status !== 'expired' && invite.status !== 'submitted') {
        await this.prisma.questionnaireInvite.update({
          where: { id: invite.id },
          data: { status: 'expired' },
        });
      }
      throw new BadRequestException('This questionnaire link has expired');
    }

    if (invite.questionnaire.status === 'archived') {
      throw new BadRequestException('This questionnaire is no longer accepting responses');
    }

    return invite;
  }

  private toPublicQuestionnaire(
    invite: Awaited<ReturnType<QuestionnairesService['getInviteForPublic']>>,
    locale?: string,
  ) {
    const resolvedLocale = this.normaliseLocale(locale);
    const answers = Object.fromEntries(
      (invite.submission?.answers || []).map((answer) => [answer.questionId, answer.value]),
    );

    const availableLocales = new Set<string>([DEFAULT_LOCALE]);
    for (const translation of invite.questionnaire.translations || []) {
      availableLocales.add(this.normaliseLocale(translation.locale));
    }
    for (const question of invite.questionnaire.questions || []) {
      for (const translation of question.translations || []) {
        availableLocales.add(this.normaliseLocale(translation.locale));
      }
      for (const option of question.options || []) {
        for (const translation of option.translations || []) {
          availableLocales.add(this.normaliseLocale(translation.locale));
        }
      }
    }

    const questionnaireTranslation = this.pickTranslation(
      invite.questionnaire.translations,
      resolvedLocale,
    );

    return {
      invite: {
        id: invite.id,
        email: invite.email,
        recipientName: invite.recipientName,
        roleLabel: invite.roleLabel,
        companyName: invite.companyName,
        status: invite.status,
        expiresAt: invite.expiresAt,
        firstOpenedAt: invite.firstOpenedAt,
        submittedAt: invite.submittedAt,
      },
      questionnaire: {
        id: invite.questionnaire.id,
        slug: invite.questionnaire.slug,
        locale: resolvedLocale,
        fallbackLocale: DEFAULT_LOCALE,
        availableLocales: Array.from(availableLocales.values()).sort(),
        title:
          this.pickTranslatedField(
            questionnaireTranslation,
            'title',
            invite.questionnaire.title,
          ) || invite.questionnaire.title,
        description: this.pickTranslatedField(
          questionnaireTranslation,
          'description',
          invite.questionnaire.description,
        ),
        welcomeTitle: this.pickTranslatedField(
          questionnaireTranslation,
          'welcomeTitle',
          invite.questionnaire.welcomeTitle,
        ),
        welcomeMessage: this.pickTranslatedField(
          questionnaireTranslation,
          'welcomeMessage',
          invite.questionnaire.welcomeMessage,
        ),
        thankYouTitle: this.pickTranslatedField(
          questionnaireTranslation,
          'thankYouTitle',
          invite.questionnaire.thankYouTitle,
        ),
        thankYouMessage: this.pickTranslatedField(
          questionnaireTranslation,
          'thankYouMessage',
          invite.questionnaire.thankYouMessage,
        ),
        joinCtaLabel: this.pickTranslatedField(
          questionnaireTranslation,
          'joinCtaLabel',
          invite.questionnaire.joinCtaLabel,
        ),
        joinCtaUrl: this.pickTranslatedField(
          questionnaireTranslation,
          'joinCtaUrl',
          invite.questionnaire.joinCtaUrl,
        ),
        questions: invite.questionnaire.questions.map((question) => ({
          ...(() => {
            const questionTranslation = this.pickTranslation(
              question.translations,
              resolvedLocale,
            );
            return {
              title:
                this.pickTranslatedField(
                  questionTranslation,
                  'title',
                  question.title,
                ) || question.title,
              description: this.pickTranslatedField(
                questionTranslation,
                'description',
                question.description,
              ),
              placeholder: this.pickTranslatedField(
                questionTranslation,
                'placeholder',
                question.placeholder,
              ),
              helpText: this.pickTranslatedField(
                questionTranslation,
                'helpText',
                question.helpText,
              ),
            };
          })(),
          id: question.id,
          code: question.code,
          type: question.type,
          isRequired: question.isRequired,
          sortOrder: question.sortOrder,
          settings: question.settings,
          options: question.options.map((option) => {
            const optionTranslation = this.pickTranslation(
              option.translations,
              resolvedLocale,
            );
            return {
              id: option.id,
              questionId: option.questionId,
              value: option.value,
              sortOrder: option.sortOrder,
              label:
                this.pickTranslatedField(optionTranslation, 'label', option.label) ||
                option.label,
            };
          }),
        })),
      },
      submission: invite.submission
        ? {
            id: invite.submission.id,
            status: invite.submission.status,
            startedAt: invite.submission.startedAt,
            completedAt: invite.submission.completedAt,
            respondentName: invite.submission.respondentName,
            answers,
          }
        : null,
    };
  }

  private normaliseLocale(locale?: string | null) {
    if (!locale || typeof locale !== 'string') {
      return DEFAULT_LOCALE;
    }

    const normalized = locale.trim().replace('_', '-').toLowerCase();
    return normalized || DEFAULT_LOCALE;
  }

  private pickTranslation<T extends { locale: string }>(
    translations: T[] | null | undefined,
    locale: string,
  ): T | null {
    const rows = Array.isArray(translations) ? translations : [];
    if (!rows.length) {
      return null;
    }

    const normalizedLocale = this.normaliseLocale(locale);
    const exact = rows.find(
      (item) => this.normaliseLocale(item.locale) === normalizedLocale,
    );

    if (exact) {
      return exact;
    }

    const fallback = rows.find(
      (item) => this.normaliseLocale(item.locale) === DEFAULT_LOCALE,
    );

    return fallback || null;
  }

  private pickTranslatedField<T extends Record<string, unknown>>(
    translation: T | null,
    key: keyof T,
    fallback: string | null | undefined,
  ) {
    const value = translation?.[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    return fallback ?? null;
  }

  private normaliseSlug(input: string) {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  private asOptionalString(value?: string | null) {
    const trimmed = (value || '').trim();
    return trimmed.length ? trimmed : null;
  }

  private toNullableJson(
    value: unknown,
  ): Prisma.InputJsonValue | Prisma.NullTypes.JsonNull {
    if (value === null || value === undefined) {
      return Prisma.JsonNull;
    }
    return value as Prisma.InputJsonValue;
  }

  private getWebBaseUrl() {
    return (
      process.env.WEB_BASE_URL ||
      process.env.FRONTEND_BASE_URL ||
      process.env.APP_WEB_URL ||
      'https://fitouthub-web.vercel.app'
    ).replace(/\/+$/, '');
  }

  private normaliseAnswer(question: any, value: unknown) {
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      if (question.isRequired) {
        throw new BadRequestException('This question requires an answer');
      }
      return null;
    }

    switch (question.type) {
      case 'short_text':
      case 'long_text':
      case 'phone':
      case 'date': {
        return String(value).trim();
      }
      case 'email': {
        const email = String(value).trim().toLowerCase();
        if (!/.+@.+\..+/.test(email)) {
          throw new BadRequestException('Enter a valid email address');
        }
        return email;
      }
      case 'number': {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new BadRequestException('Enter a valid number');
        }
        return parsed;
      }
      case 'yes_no': {
        if (typeof value === 'boolean') return value;
        const normalized = String(value).trim().toLowerCase();
        if (['yes', 'true', '1'].includes(normalized)) return true;
        if (['no', 'false', '0'].includes(normalized)) return false;
        throw new BadRequestException('Choose yes or no');
      }
      case 'single_select': {
        const selected = String(value).trim();
        const allowed = new Set((question.options || []).map((option: any) => option.value));
        if (allowed.size > 0 && !allowed.has(selected)) {
          throw new BadRequestException('Choose a valid option');
        }
        return selected;
      }
      case 'multi_select': {
        const raw = Array.isArray(value) ? value : [value];
        const selected = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
        if (question.isRequired && selected.length === 0) {
          throw new BadRequestException('Choose at least one option');
        }
        const allowed = new Set((question.options || []).map((option: any) => option.value));
        if (allowed.size > 0 && selected.some((item) => !allowed.has(item))) {
          throw new BadRequestException('Choose valid options');
        }
        return selected;
      }
      case 'matrix_rating': {
        const rows =
          Array.isArray(question?.settings?.rows) && question.settings.rows.length > 0
            ? question.settings.rows
            : [];

        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          throw new BadRequestException('Enter valid matrix ratings');
        }

        const raw = value as Record<string, unknown>;
        const normalized: Record<string, number> = {};

        for (const row of rows) {
          const rowKey = String((row as any)?.key || '').trim();
          if (!rowKey) continue;
          const rowValue = raw[rowKey];

          if (rowValue === null || rowValue === undefined || rowValue === '') {
            if (question.isRequired) {
              throw new BadRequestException('Please rate all required items');
            }
            continue;
          }

          const parsed = Number(rowValue);
          if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) {
            throw new BadRequestException('Matrix ratings must be between 1 and 5');
          }

          normalized[rowKey] = parsed;
        }

        if (question.isRequired) {
          const rowKeys = rows
            .map((row: any) => String(row?.key || '').trim())
            .filter(Boolean);
          const missing = rowKeys.some((key) => normalized[key] === undefined);
          if (missing) {
            throw new BadRequestException('Please rate all required items');
          }
        }

        return normalized;
      }
      default:
        return value;
    }
  }

  private localizeAnswerDisplay(
    questionType: string | undefined,
    value: unknown,
    optionLabelByValue?: Map<string, string>,
  ) {
    if (value === null || value === undefined) {
      return null;
    }

    if (questionType === 'single_select') {
      const normalized = String(value);
      return optionLabelByValue?.get(normalized) || normalized;
    }

    if (questionType === 'multi_select') {
      const raw = Array.isArray(value) ? value : [value];
      return raw.map((item) => {
        const normalized = String(item);
        return optionLabelByValue?.get(normalized) || normalized;
      });
    }

    return value;
  }
}
