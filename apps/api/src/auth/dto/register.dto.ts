export class RegisterDto {
  nickname: string; // username for login
  email: string;
  password: string;
  firstName: string;
  surname: string;
  chineseName?: string;
  mobile?: string;
  preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT' | 'APP_NOTIFICATIONS';
  preferredLanguage?: string;
  allowPartnerOffers?: boolean;
  allowPlatformUpdates?: boolean;
  requireOtpVerification?: boolean;
  role?: 'client' | 'professional' | 'reseller' | 'admin' | 'mimo_boh' | 'surveyor'; // defaults to 'client'
}
