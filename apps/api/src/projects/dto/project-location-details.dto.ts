export class ProjectLocationDetailsDto {
  addressFull: string;
  buildingName?: string;
  district?: string;
  postalCode?: string;
  gpsCoordinates?: { lat: number; lng: number };
  unitNumber?: string;
  floorLevel?: string;
  propertyType?: string;
  propertySize?: string;
  propertyAge?: string;
  accessDetails?: string;
  existingConditions?: string;
  specialRequirements?: Array<string> | Record<string, unknown>;
  onSiteContactName?: string;
  onSiteContactPhone?: string;
  accessHoursType?: string;
  workingHoursWindow?: string;
  accessHoursDescription?: string;
  desiredStartDate?: string; // ISO date
  photoUrls?: string[];
}
