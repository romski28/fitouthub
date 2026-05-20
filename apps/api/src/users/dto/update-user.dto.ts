export class UpdateUserDto {
  email?: string;
  firstName?: string;
  surname?: string;
  mobile?: string;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
  role?: 'client' | 'admin' | 'professional';
}
