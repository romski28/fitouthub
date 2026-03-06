export class ProfessionalRegisterDto {
  email: string;
  password: string;
  phone?: string;
  professionType?: string;
  fullName?: string;
  businessName?: string;
  preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
  allowPartnerOffers?: boolean;
  allowPlatformUpdates?: boolean;
  requireOtpVerification?: boolean;
}
