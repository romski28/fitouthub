// Form schema types that match the JSON structures
export type FormField = {
  id: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'number' | 'url' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'checkbox_single' | 'file';
  required?: boolean;
  placeholder?: string;
  options?: string[];
  rows?: number;
  maxlength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  accept?: string;
  multiple?: boolean;
  help?: string;
  conditionalOn?: {
    field: string;
    value: string;
  };
};

export type FormSection = {
  id: string;
  title: string;
  fields: FormField[];
};

export type FormSchema = {
  formTitle: string;
  formDescription: string;
  sections: FormSection[];
};

// Contractor, Company, and Reseller form schemas
export const contractorFormSchema: FormSchema = {
  formTitle: 'Contractor Registration',
  formDescription: 'Register as a contractor on Fitout Hub',
  sections: [
    {
      id: 'personal_info',
      title: 'Personal Information',
      fields: [
        {
          id: 'full_name',
          label: 'Full Name',
          type: 'text',
          required: true,
          maxlength: 100,
          placeholder: 'Enter your full legal name',
        },
        {
          id: 'phone',
          label: 'Phone Number',
          type: 'tel',
          required: true,
          pattern: '^[+\\d\\s-]{7,}$',
          placeholder: '+852 1234 5678',
        },
        {
          id: 'email',
          label: 'Email Address',
          type: 'email',
          required: true,
          placeholder: 'your.email@example.com',
        },
        {
          id: 'address',
          label: 'Business Address',
          type: 'textarea',
          required: true,
          rows: 3,
          placeholder: 'Street address, district, region',
        },
        {
          id: 'id_verification',
          label: 'ID Verification',
          type: 'file',
          required: true,
          accept: 'image/*,.pdf',
          help: 'Upload HKID or passport (front and back)',
        },
      ],
    },
    {
      id: 'professional_details',
      title: 'Professional Details',
      fields: [
        {
          id: 'primary_trade',
          label: 'Primary Trade',
          type: 'select',
          required: true,
          options: [
            'Builder/General Contractor',
            'Renovator',
            'Project Manager',
            'Painting & Decorating',
            'Plasterer',
            'Tiler',
            'Flooring Specialist',
            'Roofer',
            'Landscaper',
            'Fencing',
            'Windows & Doors',
            'Electrician',
            'Plumber',
            'HVAC Technician',
            'Smart Home Installer',
            'Carpenter',
            'Bricklayer',
            'Steel Worker',
            'Insulation Specialist',
          ],
        },
        {
          id: 'years_experience',
          label: 'Years of Experience',
          type: 'number',
          required: true,
          min: 0,
          max: 50,
          placeholder: 'Enter number of years',
        },
        {
          id: 'certifications',
          label: 'Certifications & Licenses',
          type: 'file',
          required: false,
          accept: 'image/*,.pdf',
          multiple: true,
          help: 'Upload copies of relevant certifications (optional)',
        },
        {
          id: 'has_insurance',
          label: 'Do you have professional liability insurance?',
          type: 'radio',
          required: true,
          options: ['Yes', 'No'],
        },
        {
          id: 'service_area',
          label: 'Service Areas',
          type: 'checkbox',
          required: true,
          options: ['Hong Kong Island', 'Kowloon', 'New Territories', 'Lantau Island', 'Outlying Islands'],
          help: 'Select all areas you can service',
        },
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance & Agreement',
      fields: [
        {
          id: 'terms_agreed',
          label: "I agree to Fitout Hub's Terms of Service and Contractor Agreement",
          type: 'checkbox_single',
          required: true,
        },
      ],
    },
  ],
};

export const companyFormSchema: FormSchema = {
  formTitle: 'Company Registration',
  formDescription: 'Register your company as a contractor on Fitout Hub',
  sections: [
    {
      id: 'company_info',
      title: 'Company Information',
      fields: [
        {
          id: 'business_name',
          label: 'Business Name',
          type: 'text',
          required: true,
          maxlength: 150,
          placeholder: 'Enter registered company name',
        },
        {
          id: 'registration_number',
          label: 'Business Registration Number',
          type: 'text',
          required: true,
          maxlength: 50,
          placeholder: 'e.g., BR123456',
        },
        {
          id: 'contact_person_name',
          label: 'Primary Contact Person',
          type: 'text',
          required: true,
          maxlength: 100,
          placeholder: 'Full name of main contact',
        },
        {
          id: 'phone',
          label: 'Company Phone Number',
          type: 'tel',
          required: true,
          pattern: '^[+\\d\\s-]{7,}$',
          placeholder: '+852 1234 5678',
        },
        {
          id: 'email',
          label: 'Company Email Address',
          type: 'email',
          required: true,
          placeholder: 'info@yourcompany.com',
        },
        {
          id: 'address',
          label: 'Registered Business Address',
          type: 'textarea',
          required: true,
          rows: 3,
          placeholder: 'Street address, district, region',
        },
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance & Agreement',
      fields: [
        {
          id: 'terms_agreed',
          label: "I agree to Fitout Hub's Terms of Service and Contractor Agreement on behalf of the company",
          type: 'checkbox_single',
          required: true,
        },
      ],
    },
  ],
};

export const resellerFormSchema: FormSchema = {
  formTitle: 'Reseller Registration',
  formDescription: 'Register your business as a reseller on Fitout Hub',
  sections: [
    {
      id: 'business_info',
      title: 'Business Information',
      fields: [
        {
          id: 'business_name',
          label: 'Business Name',
          type: 'text',
          required: true,
          maxlength: 150,
          placeholder: 'Enter registered business name',
        },
        {
          id: 'registration_number',
          label: 'Business Registration Number',
          type: 'text',
          required: true,
          maxlength: 50,
          placeholder: 'e.g., BR987654',
        },
        {
          id: 'contact_person_name',
          label: 'Primary Contact Person',
          type: 'text',
          required: true,
          maxlength: 100,
          placeholder: 'Full name of main contact',
        },
        {
          id: 'phone',
          label: 'Business Phone Number',
          type: 'tel',
          required: true,
          pattern: '^[+\\d\\s-]{7,}$',
          placeholder: '+852 1234 5678',
        },
        {
          id: 'email',
          label: 'Business Email Address',
          type: 'email',
          required: true,
          placeholder: 'sales@yourcompany.com',
        },
        {
          id: 'address',
          label: 'Registered Business Address',
          type: 'textarea',
          required: true,
          rows: 3,
          placeholder: 'Street address, district, region',
        },
      ],
    },
    {
      id: 'product_categories',
      title: 'Products & Categories',
      fields: [
        {
          id: 'product_categories',
          label: 'Product Categories You Supply',
          type: 'checkbox',
          required: true,
          options: [
            'Construction Materials',
            'Hardware & Fixtures',
            'Appliances',
            'Furniture',
            'Decorative Items',
            'Lighting',
            'Flooring',
            'Plumbing Supplies',
            'Electrical Supplies',
            'Paint & Coatings',
            'Tools & Equipment',
            'Safety Equipment',
            'HVAC Equipment',
          ],
          help: 'Select all categories that apply to your business',
        },
      ],
    },
    {
      id: 'compliance',
      title: 'Compliance & Agreement',
      fields: [
        {
          id: 'terms_agreed',
          label: "I agree to Fitout Hub's Terms of Service and Reseller Agreement on behalf of the company",
          type: 'checkbox_single',
          required: true,
        },
      ],
    },
  ],
};
