export class RespondSiteAccessRequestDto {
  status:
    | 'approved_no_visit'
    | 'approved_visit_scheduled'
    | 'denied';
  visitScheduledFor?: string; // ISO date
  visitScheduledAt?: string; // ISO datetime
  reasonDenied?: string;
  addressFull?: string;
  unitNumber?: string;
  floorLevel?: string;
  accessDetails?: string;
  onSiteContactName?: string;
  onSiteContactPhone?: string;
}
