export enum ProfessionType {
  CONTRACTOR = 'contractor',
  COMPANY = 'company',
  RESELLER = 'reseller',
}

export class CreateProfessionalDto {
  profession_type: ProfessionType;
  full_name?: string;
  business_name?: string;
  email: string;
  phone: string;
  address?: string;
  primary_trade?: string;
  years_experience?: string;
  service_area?: string;
  additional_data?: Record<string, any>;
  userId?: string;
}

export class UpdateProfessionalDto {
  profession_type?: ProfessionType;
  full_name?: string;
  business_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  service_area?: string;
  additional_data?: Record<string, any>;
}
