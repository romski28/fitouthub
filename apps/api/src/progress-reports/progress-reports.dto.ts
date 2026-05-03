export class PhotoEntryDto {
  url: string;
  note: string;
}

export class CreateProgressReportDto {
  projectId: string;
  milestoneId?: string;
  paymentMilestoneId?: string;
  paymentMilestoneStatus?: string;
  photoEntries: PhotoEntryDto[];
  narrativeSummary?: string;
  signOffRequested: boolean;
}
