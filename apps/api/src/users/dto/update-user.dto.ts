export class UpdateUserDto {
  email?: string;
  firstName?: string;
  surname?: string;
  chineseName?: string | null;
  nickname?: string;
  mobile?: string;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
  role?: 'client' | 'admin' | 'professional' | 'mimo_boh' | 'surveyor' | 'landlord' | 'property_manager' | 'estate_agent' | 'project_delegate' | 'owner_occupier';
}
