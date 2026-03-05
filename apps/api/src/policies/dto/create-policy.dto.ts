export type PolicyType =
  | 'TERMS_AND_CONDITIONS'
  | 'SECURITY_STATEMENT'
  | 'CONTRACT_TEMPLATE';

export class CreatePolicyDto {
  type: PolicyType;
  version: string;
  title: string;
  content: string;
  isActive?: boolean;
  createdBy?: string;
}
