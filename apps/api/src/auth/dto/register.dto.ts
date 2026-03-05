export class RegisterDto {
  nickname: string; // username for login
  email: string;
  password: string;
  firstName: string;
  surname: string;
  chineseName?: string;
  mobile?: string;
  preferredContactMethod?: 'EMAIL' | 'WHATSAPP' | 'SMS' | 'WECHAT';
  requireOtpVerification?: boolean;
  role?: 'client' | 'professional' | 'reseller' | 'admin'; // defaults to 'client'
}
