export type CreateQuestionnaireQuestionDto = {
  code: string;
  title: string;
  description?: string;
  type:
    | 'short_text'
    | 'long_text'
    | 'single_select'
    | 'multi_select'
    | 'yes_no'
    | 'number'
    | 'email'
    | 'phone'
    | 'date';
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

export class CreateQuestionnaireDto {
  title!: string;
  slug?: string;
  audienceKey!: string;
  description?: string;
  welcomeTitle?: string;
  welcomeMessage?: string;
  thankYouTitle?: string;
  thankYouMessage?: string;
  joinCtaLabel?: string;
  joinCtaUrl?: string;
  status?: 'draft' | 'active' | 'archived';
  questions?: CreateQuestionnaireQuestionDto[];
}
