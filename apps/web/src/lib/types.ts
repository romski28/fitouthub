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
  fullName?: string;
  type: "contractor" | "reseller";
  businessType: "sole_trader" | "company";
  status: "pending" | "approved" | "suspended" | "inactive";
  rating: number;
  serviceArea: string[];
  primaryTradeTitle?: string;
  businessName?: string;
  productCategories?: string[];
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
};
