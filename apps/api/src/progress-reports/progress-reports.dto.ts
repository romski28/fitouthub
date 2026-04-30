export class PhotoEntryDto {
  url: string;
  note: string;
}

export class CreateProgressReportDto {
  projectId: string;
  milestoneId?: string;
  photoEntries: PhotoEntryDto[];
  narrativeSummary?: string;
  signOffRequested: boolean;
}
