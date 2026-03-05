import { IsString, IsBoolean, IsOptional } from 'class-validator';

export type PolicyType = 'TERMS_AND_CONDITIONS' | 'SECURITY_STATEMENT' | 'CONTRACT_TEMPLATE';

export class CreatePolicyDto {
  @IsString()
  type: PolicyType;

  @IsString()
  version: string;

  @IsString()
  title: string;

  @IsString()
  content: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  createdBy?: string;
}
