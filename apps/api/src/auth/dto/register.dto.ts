export class RegisterDto {
  nickname: string; // username for login
  email: string;
  password: string;
  firstName: string;
  surname: string;
  chineseName?: string;
  mobile?: string;
  role?: 'client' | 'professional' | 'reseller'; // defaults to 'client'
}
