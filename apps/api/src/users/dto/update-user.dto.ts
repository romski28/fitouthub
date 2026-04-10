export class UpdateUserDto {
  email?: string;
  firstName?: string;
  surname?: string;
  mobile?: string;
  role?: 'client' | 'admin' | 'professional';
}
