import { Professional } from "../lib/types";

export const professionals: Professional[] = [
  {
    id: "contractor_001",
    fullName: "John Smith",
    type: "contractor",
    businessType: "sole_trader",
    status: "approved",
    rating: 4.5,
    serviceArea: ["Hong Kong Island", "Kowloon"],
    primaryTradeTitle: "Builder",
  },
  {
    id: "contractor_002",
    fullName: "Mary Wong",
    type: "contractor",
    businessType: "company",
    status: "approved",
    rating: 4.7,
    serviceArea: ["New Territories"],
    primaryTradeTitle: "Electrician",
  },
  {
    id: "reseller_0061",
    fullName: "Reseller 1",
    type: "reseller",
    businessType: "company",
    status: "pending",
    rating: 3.7,
    serviceArea: ["Hong Kong Island"],
    businessName: "Reseller 1",
    productCategories: ["Construction Materials", "Hardware & Fixtures"],
  },
];
