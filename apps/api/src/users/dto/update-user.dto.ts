export class UpdateUserDto {
  email?: string;
  firstName?: string;
  surname?: string;
  role?: 'client' | 'admin' | 'professional';
}
