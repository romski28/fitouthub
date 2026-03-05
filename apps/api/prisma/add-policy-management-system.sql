-- Migration: Add Policy Management System
-- Description: Creates Policy table with versioning and seeds initial documents
-- Run in Supabase SQL Editor

-- Create PolicyType enum
CREATE TYPE "PolicyType" AS ENUM (
  'TERMS_AND_CONDITIONS',
  'SECURITY_STATEMENT',
  'CONTRACT_TEMPLATE'
);

-- Create Policy table
CREATE TABLE "Policy" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  "type" "PolicyType" NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Policy_type_version_unique" UNIQUE ("type", "version")
);

-- Create indexes
CREATE INDEX "Policy_type_idx" ON "Policy"("type");
CREATE INDEX "Policy_isActive_idx" ON "Policy"("isActive");
CREATE INDEX "Policy_type_isActive_idx" ON "Policy"("type", "isActive");

-- Seed initial Terms and Conditions (v1.0)
INSERT INTO "Policy" ("id", "type", "version", "title", "content", "isActive", "createdBy", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::TEXT,
  'TERMS_AND_CONDITIONS',
  '1.0',
  'Terms and Conditions',
  'TERMS AND CONDITIONS

Last Updated: March 5, 2026

1. ACCEPTANCE OF TERMS
By accessing and using this platform (the "Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.

2. USE LICENSE
Permission is granted to temporarily download one copy of the materials (information or software) on the Service for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
- Modifying or copying the materials
- Using the materials for any commercial purpose or for any public display
- Attempting to decompile or reverse engineer any software contained on the Service
- Removing any copyright or other proprietary notations from the materials
- Transferring the materials to another person or "mirroring" the materials on any other server
- Violating any applicable laws or regulations

3. DISCLAIMER
The materials on the Service are provided on an ''as is'' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.

4. LIMITATIONS
In no event shall our company or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on the Service, even if we or our authorized representative has been notified orally or in writing of the possibility of such damage.

5. ACCURACY OF MATERIALS
The materials appearing on the Service could include technical, typographical, or photographic errors. We do not warrant that any of the materials on the Service are accurate, complete, or current. We may make changes to the materials contained on the Service at any time without notice.

6. MATERIALS AND CONTENT
We do not claim ownership of the materials you provide to the Service (including feedback and suggestions). However, by submitting materials to the Service, you grant us a worldwide, royalty-free, perpetual, irrevocable license to use, reproduce, adapt, publish, translate and distribute it in any media.

7. USER ACCOUNTS
When you create an account, you are responsible for maintaining the confidentiality of your account information and password and for restricting access to your computer. You accept responsibility for all activities that occur under your account. You agree to notify us immediately of any unauthorized use of your account.

8. PROFESSIONAL VERIFICATION
Professional users agree to provide accurate information during registration. We reserve the right to verify professional credentials and revoke access if information is found to be fraudulent or inaccurate.

9. PAYMENT AND BILLING
All payments must be made in accordance with the pricing and payment terms displayed on the Service. You agree to pay all charges incurred under your account. Billing disputes must be reported within 30 days of the charge.

10. INTELLECTUAL PROPERTY RIGHTS
All content on the Service, including text, graphics, logos, images, and software, is the property of our company or its content suppliers and is protected by international copyright laws. The compilation of all content on the Service is the exclusive property of our company.

11. LIMITATION OF LIABILITY
In no case shall the company, its directors, officers, employees, or agents be liable to you for any indirect, incidental, special, consequential, or punitive damages resulting from your use of or inability to use the materials or functionality of the Service.

12. MODIFICATIONS TO TERMS
We may revise these terms of service for the Service at any time without notice. By using this Service, you are agreeing to be bound by the then current version of these terms of service. You should periodically review these terms to ensure you remain informed of any updates.

13. GOVERNING LAW
These terms and conditions are governed by and construed in accordance with the laws of the jurisdiction where the Service is located, and you irrevocably submit to the exclusive jurisdiction of the courts located in that location.

14. DISPUTE RESOLUTION
Any disputes arising from this agreement shall first be resolved through good faith negotiation. If negotiation fails, disputes shall be resolved through binding arbitration in accordance with applicable laws.

15. TERMINATION
We reserve the right to terminate your access to the Service at any time, without notice, for conduct that we believe violates these terms or is harmful to our business, other users, or third parties.

16. CONTACT INFORMATION
If you have any questions about these Terms and Conditions, please contact us through the contact information provided on the Service.',
  true,
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed initial Security Statement (v1.0)
INSERT INTO "Policy" ("id", "type", "version", "title", "content", "isActive", "createdBy", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::TEXT,
  'SECURITY_STATEMENT',
  '1.0',
  'Security Statement',
  'SECURITY STATEMENT

Last Updated: March 5, 2026

COMMITMENT TO SECURITY

Our platform is committed to protecting the security and privacy of our users'' information. We implement comprehensive security measures to safeguard personal, financial, and professional data against unauthorized access, alteration, disclosure, or destruction.

DATA PROTECTION

- All data transmission is encrypted using industry-standard SSL/TLS protocols
- Passwords are securely hashed using modern cryptographic algorithms
- Sensitive information is stored in encrypted databases with access controls
- Regular security audits are conducted to identify and address vulnerabilities

AUTHENTICATION & ACCESS CONTROL

- We employ multi-factor authentication options for account security
- Role-based access controls ensure users only access appropriate information
- Session management includes automatic timeout to prevent unauthorized access
- Login attempts are monitored for suspicious activity

PRIVACY & CONFIDENTIALITY

- User data is collected only for specified, explicit, and legitimate purposes
- Personal information is not shared with third parties without explicit consent
- Professional credentials are verified and maintained confidentially
- Communications between users are protected and private

FINANCIAL SECURITY

- Payment processing is compliant with PCI-DSS standards
- All financial transactions are encrypted and logged
- Sensitive payment information is handled by certified payment processors
- Regular audits ensure compliance with financial security standards

INCIDENT RESPONSE

- We maintain an incident response plan to address security breaches
- Users are notified promptly of any security incidents affecting their data
- We work with cybersecurity experts to investigate and remediate incidents
- Continuous monitoring systems detect and alert to suspicious activities

PLATFORM INFRASTRUCTURE

- Our infrastructure is hosted on secure, certified cloud platforms
- Regular backups ensure data recovery in case of emergencies
- Redundant systems provide business continuity and high availability
- Network security includes firewalls, intrusion detection, and DDoS protection

USER RESPONSIBILITIES

- Users are responsible for maintaining the confidentiality of login credentials
- Strong, unique passwords are strongly recommended
- Users should not share account information with others
- Suspicious activity should be reported immediately to support

COMPLIANCE

- We comply with applicable data protection regulations and standards
- Regular penetration testing identifies security gaps
- Security training is provided to all staff members
- Vendor security assessments ensure third-party security compliance

SECURITY PRACTICES

Best Practices We Follow:
- Principle of least privilege for data access
- Secure coding practices and code reviews
- Regular security patches and updates
- Security awareness training for employees
- Incident response drills and simulations

REPORTING SECURITY ISSUES

If you discover a security vulnerability, please report it responsibly to our security team. We take all security concerns seriously and will investigate promptly. Please do not publicly disclose vulnerabilities before giving us an opportunity to address them.

SECURITY UPDATES

- Security updates are released regularly and should be applied promptly
- Critical vulnerabilities are addressed with priority
- Users are notified of significant security enhancements
- Security advisories are published as needed

FUTURE IMPROVEMENTS

We continuously evaluate and implement new security technologies and best practices to stay ahead of evolving threats. Our security posture is regularly reviewed and updated to maintain the highest standards.

For security concerns or questions, please contact our support team through the contact information provided on the platform.',
  true,
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Seed placeholder Contract Template (v1.0)
INSERT INTO "Policy" ("id", "type", "version", "title", "content", "isActive", "createdBy", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid()::TEXT,
  'CONTRACT_TEMPLATE',
  '1.0',
  'Service Contract Template',
  'SERVICE CONTRACT TEMPLATE

This is a placeholder for the contract template. This document will be dynamically populated with project-specific details when a contract is generated.

CONTRACT SECTIONS:
1. Parties to the Agreement
2. Scope of Work
3. Project Timeline and Milestones
4. Payment Terms
5. Change Order Process
6. Warranties and Guarantees
7. Insurance and Liability
8. Termination Clauses
9. Dispute Resolution
10. Signatures

This template will be customized with actual project details, milestone breakdowns, payment schedules, and signatures when contracts are generated for awarded projects.',
  true,
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Verify the Policy table was created
SELECT 
  table_name, 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'Policy'
ORDER BY ordinal_position;

-- Verify seeded data
SELECT 
  id,
  type,
  version,
  title,
  "isActive",
  "createdBy",
  "createdAt",
  LENGTH(content) as content_length
FROM "Policy"
ORDER BY type, version;
