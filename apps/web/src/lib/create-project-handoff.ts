import type { ProjectFormData } from '@/components/project-form';
import type { CanonicalLocation } from '@/components/location-select';
import type { Professional } from '@/lib/types';

export interface CreateProjectDraftHandoff {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Array<Professional & { requestedTrades?: string[] }>;
  aiIntakeId?: string;
  followUpQuestions?: string[];
  aiOptions?: { label: string; value: string }[];
  safetyNotes?: string[];
  riskNotes?: string[];
  riskLevel?: string | null;
}

export interface ProjectDescriptionHandoff {
  title?: string;
  description?: string;
  projectScale?: 'SCALE_1' | 'SCALE_2' | 'SCALE_3';
  isEmergency?: boolean;
  profession?: string;
  location?: CanonicalLocation;
  tradesRequired?: string[];
  followUpQuestions?: string[];
  aiOptions?: { label: string; value: string }[];
  safetyNotes?: string[];
  riskNotes?: string[];
  riskLevel?: string | null;
}

let draftCache: CreateProjectDraftHandoff | null = null;
let descriptionCache: ProjectDescriptionHandoff | null = null;

export function setCreateProjectDraftHandoff(value: CreateProjectDraftHandoff | null) {
  draftCache = value;
}

export function getCreateProjectDraftHandoff() {
  return draftCache;
}

export function clearCreateProjectDraftHandoff() {
  draftCache = null;
}

export function setProjectDescriptionHandoff(value: ProjectDescriptionHandoff | null) {
  descriptionCache = value;
}

export function getProjectDescriptionHandoff() {
  return descriptionCache;
}

export function clearProjectDescriptionHandoff() {
  descriptionCache = null;
}
