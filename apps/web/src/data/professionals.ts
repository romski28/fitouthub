import { Professional } from "../lib/types";

export const professionals: Professional[] = [
  {
    id: "contractor_001",
    fullName: "John Smith",
    professionType: "contractor",
    email: "john@example.com",
    phone: "+852-9000-0001",
    status: "approved",
    rating: 4.5,
    serviceArea: "Hong Kong Island, Kowloon",
  },
  {
    id: "contractor_002",
    fullName: "Mary Wong",
    professionType: "contractor",
    email: "mary@example.com",
    phone: "+852-9000-0002",
    status: "approved",
    rating: 4.7,
    serviceArea: "New Territories",
  },
  {
    id: "reseller_0061",
    fullName: "Reseller 1",
    professionType: "reseller",
    email: "reseller@example.com",
    phone: "+852-9000-0003",
    status: "pending",
    rating: 3.7,
    businessName: "Reseller 1",
    serviceArea: "Hong Kong Island",
  },
];
