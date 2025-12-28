export type Tradesman = {
  id: string;
  title: string;
  category: string;
  description?: string;
  featured?: boolean;
  image?: string;
  jobs: string[];
};

export type Professional = {
  id: string;
  userId?: string | null;
  professionType: "contractor" | "company" | "reseller";
  email: string;
  phone: string;
  status: "pending" | "approved" | "suspended" | "inactive";
  rating: number;
  registrationDate?: string;
  fullName?: string | null;
  businessName?: string | null;
  serviceArea?: string | null;
  locationPrimary?: string | null;
  locationSecondary?: string | null;
  locationTertiary?: string | null;
  primaryTrade?: string | null;
  tradesOffered?: string[];
  suppliesOffered?: string[];
  additionalData?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

export type Project = {
  id: string;
  projectName: string;
  clientName: string;
  contractorName?: string;
  region: string;
  budget?: number | string;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  tradesRequired?: string[];
  startDate?: string;
  endDate?: string;
  isEmergency?: boolean;
};
