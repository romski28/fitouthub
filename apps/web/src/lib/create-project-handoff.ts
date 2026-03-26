import type { ProjectFormData } from '@/components/project-form';
import type { CanonicalLocation } from '@/components/location-select';
import type { Professional } from '@/lib/types';

export interface CreateProjectDraftHandoff {
  initialData?: Partial<ProjectFormData>;
  selectedProfessionals?: Professional[];
  aiIntakeId?: string;
}

export interface ProjectDescriptionHandoff {
  title?: string;
  description?: string;
  isEmergency?: boolean;
  profession?: string;
  location?: CanonicalLocation;
  tradesRequired?: string[];
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
