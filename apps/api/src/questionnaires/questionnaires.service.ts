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
const STARTER_SLUG = 'contractor-tradesman-screening';
const DEFAULT_LOCALE = 'en';

type QuestionnaireQuestionTypeValue =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
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
    code: 'business_name',
    title: 'What is your business or trading name?',
    type: 'short_text',
    placeholder: 'e.g. Harbour Build & Fitout Ltd',
    isRequired: true,
    sortOrder: 1,
  },
  {
    code: 'primary_trade',
    title: 'Which trade best describes your main work?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 2,
    options: [
      { value: 'general_contractor', label: 'General contractor', sortOrder: 1 },
      { value: 'builder', label: 'Builder / fit-out contractor', sortOrder: 2 },
      { value: 'electrical', label: 'Electrical', sortOrder: 3 },
      { value: 'plumbing', label: 'Plumbing / drainage', sortOrder: 4 },
      { value: 'hvac', label: 'HVAC / ventilation', sortOrder: 5 },
      { value: 'joinery', label: 'Joinery / carpentry', sortOrder: 6 },
      { value: 'decorating', label: 'Painting / decorating', sortOrder: 7 },
      { value: 'other', label: 'Other specialist trade', sortOrder: 8 },
    ],
  },
  {
    code: 'coverage_areas',
    title: 'Which areas do you currently cover?',
    description: 'List districts, islands, or regions where you regularly work.',
    type: 'long_text',
    placeholder: 'e.g. Hong Kong Island, Kowloon East, Tseung Kwan O',
    isRequired: true,
    sortOrder: 3,
  },
  {
    code: 'experience_years',
    title: 'How many years of relevant experience do you have?',
    type: 'number',
    placeholder: 'e.g. 12',
    isRequired: true,
    sortOrder: 4,
  },
  {
    code: 'insurance_ready',
    title: 'Do you currently hold active public liability or equivalent insurance?',
    type: 'yes_no',
    helpText: 'This can be refined later with document upload steps.',
    isRequired: true,
    sortOrder: 5,
  },
  {
    code: 'certifications',
    title: 'Which licences, registrations, or certifications should clients know about?',
    type: 'long_text',
    placeholder: 'List registrations, card numbers, or accreditations',
    isRequired: false,
    sortOrder: 6,
  },
  {
    code: 'team_size',
    title: 'How large is your usual delivery team?',
    type: 'single_select',
    isRequired: true,
    sortOrder: 7,
    options: [
      { value: 'solo', label: 'Just me', sortOrder: 1 },
      { value: '2_5', label: '2 to 5 people', sortOrder: 2 },
      { value: '6_15', label: '6 to 15 people', sortOrder: 3 },
      { value: '16_plus', label: '16+ people', sortOrder: 4 },
    ],
  },
  {
    code: 'project_size',
    title: 'What project size are you most comfortable taking on?',
    type: 'multi_select',
    isRequired: true,
    sortOrder: 8,
    options: [
      { value: 'minor_repairs', label: 'Minor repairs / quick jobs', sortOrder: 1 },
      { value: 'single_room', label: 'Single-room refurbishment', sortOrder: 2 },
      { value: 'full_home', label: 'Full-home renovation', sortOrder: 3 },
      { value: 'commercial_fitout', label: 'Commercial fit-out', sortOrder: 4 },
    ],
  },
  {
    code: 'availability',
    title: 'When could you usually start a new project?',
    type: 'short_text',
    placeholder: 'e.g. Within 2 weeks',
    isRequired: true,
    sortOrder: 9,
  },
  {
    code: 'contact_email',
    title: 'What is the best email for project invitations?',
    type: 'email',
    placeholder: 'name@company.com',
    isRequired: true,
    sortOrder: 10,
  },
  {
    code: 'contact_phone',
    title: 'What is the best mobile or WhatsApp number?',
    type: 'phone',
    placeholder: '+852 ...',
    isRequired: false,
    sortOrder: 11,
  },
  {
    code: 'why_fitouthub',
    title: 'Anything else you would like FitOut Hub to know before we invite you onto the platform?',
    type: 'long_text',
    placeholder: 'Share strengths, preferred work, or anything important',
    isRequired: false,
    sortOrder: 12,
  },
];

const STARTER_TEMPLATES: StarterTemplateDefinition[] = [
  {
    key: 'business_name',
    label: 'Business name',
    prompt: 'What is your business or trading name?',
    type: 'short_text',
    placeholder: 'Business name',
  },
  {
    key: 'trade_selector',
    label: 'Primary trade',
    prompt: 'Which trade best describes your main work?',
    type: 'single_select',
    options: [
      { value: 'general_contractor', label: 'General contractor', sortOrder: 1 },
      { value: 'builder', label: 'Builder / fit-out contractor', sortOrder: 2 },
      { value: 'electrical', label: 'Electrical', sortOrder: 3 },
      { value: 'plumbing', label: 'Plumbing / drainage', sortOrder: 4 },
      { value: 'hvac', label: 'HVAC / ventilation', sortOrder: 5 },
      { value: 'joinery', label: 'Joinery / carpentry', sortOrder: 6 },
      { value: 'decorating', label: 'Painting / decorating', sortOrder: 7 },
      { value: 'other', label: 'Other specialist trade', sortOrder: 8 },
    ],
  },
  {
    key: 'service_regions',
    label: 'Coverage areas',
    prompt: 'Which areas do you currently cover?',
    type: 'long_text',
    placeholder: 'Regions, districts, and service coverage',
  },
  {
    key: 'years_experience',
    label: 'Years of experience',
    prompt: 'How many years of relevant experience do you have?',
    type: 'number',
    placeholder: 'Years of experience',
  },
  {
    key: 'insurance_check',
    label: 'Insurance check',
    prompt: 'Do you currently hold active public liability or equivalent insurance?',
    type: 'yes_no',
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

  async listResponses(questionnaireId: string) {
    const questionnaire = await this.prisma.questionnaire.findUnique({
      where: { id: questionnaireId },
      select: { id: true },
    });

    if (!questionnaire) {
      throw new NotFoundException('Questionnaire not found');
    }

    return this.prisma.questionnaireSubmission.findMany({
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
        title: 'Contractors and tradesmen onboarding questionnaire',
        audienceKey: STARTER_AUDIENCE,
        description:
          'Starter stakeholder questionnaire for contractors and tradesmen. This is the first live example and can later be replaced with your PDF-derived final wording.',
        welcomeTitle: 'Welcome to the contractor & tradesman questionnaire',
        welcomeMessage:
          'We are collecting a focused baseline profile so we can invite the right contractors and specialist trades into the right renovation projects with minimal back-and-forth.',
        thankYouTitle: 'Thanks for sharing your details',
        thankYouMessage:
          'Your answers have been saved. We will use them to shape future invitations, onboarding, and marketplace matching.',
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
      default:
        return value;
    }
  }
}
