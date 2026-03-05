import { IsString, IsBoolean, IsOptional } from 'class-validator';

export class UpdatePolicyDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  content?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
