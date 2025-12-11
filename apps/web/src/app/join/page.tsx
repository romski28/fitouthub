'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { ProfessionRegistrationModal } from '@/components/profession-registration-modal';
import { DynamicForm } from '@/components/dynamic-form';
import {
  contractorFormSchema,
  companyFormSchema,
  resellerFormSchema,
  type FormSchema,
} from '@/data/form-schemas';

type ProfessionType = 'contractor' | 'company' | 'reseller' | null;

export default function JoinPage() {
  const router = useRouter();
  const [step, setStep] = useState<'profession' | 'form'>('profession');
  const [selectedProfession, setSelectedProfession] = useState<ProfessionType>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const getFormSchema = (profession: ProfessionType): FormSchema | null => {
    switch (profession) {
      case 'contractor':
        return contractorFormSchema;
      case 'company':
        return companyFormSchema;
      case 'reseller':
        return resellerFormSchema;
      default:
        return null;
    }
  };

  const handleProfessionSelect = (profession: ProfessionType) => {
    setSelectedProfession(profession);
    setStep('form');
  };

  const handleFormSubmit = async (data: Record<string, string | string[] | boolean>) => {
    setIsSubmitting(true);
    try {
      // Always use localhost for client-side fetch
      const apiUrl = 'http://localhost:3001';

      // Helper function to extract first value from array or string
      const getValue = (value: string | string[] | boolean | undefined): string => {
        if (Array.isArray(value)) return value[0] || '';
        if (typeof value === 'string') return value;
        return '';
      };

      const payload = {
        profession_type: selectedProfession,
        email: getValue(data.email) || 'contact@example.com',
        phone: getValue(data.phone) || '+1-000-000-0000',
        full_name: getValue(data.full_name),
        business_name: getValue(data.business_name),
        service_area: getValue(data.service_area),
        additional_data: data,
      };

      console.log('Submitting to:', `${apiUrl}/professionals`);
      console.log('Payload:', payload);

      const response = await fetch(`${apiUrl}/professionals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error ${response.status}:`, errorText);
        throw new Error(`Failed to submit form: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('Professional registration successful:', result);

      toast.success('Registration submitted successfully! Redirecting...');
      setSubmitStatus('success');
      setTimeout(() => {
        router.push('/');
      }, 2000);
    } catch (error) {
      console.error('Submission error:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
      toast.error('Failed to submit registration. Please try again.');
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    console.log('handleReset called - redirecting to home');
    router.push('/');
  };

  const currentSchema = getFormSchema(selectedProfession);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold text-slate-900">Join Our Professional Network</h1>
          <p className="mt-4 text-lg text-slate-600">
            Register as a contractor, company, or reseller to grow your business
          </p>
        </div>

        {/* Desktop Form Layout */}
        <div className="hidden lg:block">
          {step === 'profession' ? (
            <ProfessionRegistrationModal
              isOpen={true}
              onSelect={handleProfessionSelect}
              onClose={handleReset}
            />
          ) : currentSchema ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
                  <DynamicForm
                    schema={currentSchema}
                    onSubmit={handleFormSubmit}
                    onCancel={handleReset}
                    isLoading={isSubmitting}
                  />
                </div>

                {submitStatus === 'success' && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-green-800 font-semibold">
                      ✓ Application submitted successfully!
                    </p>
                  </div>
                )}

                {submitStatus === 'error' && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-red-800 font-semibold">✗ Error submitting application</p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                  <h3 className="font-semibold text-slate-900 mb-4">Application Details</h3>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-slate-600">Type</p>
                      <p className="font-semibold text-slate-900 capitalize">
                        {selectedProfession?.replace('_', ' ')}
                      </p>
                    </div>
                    <button
                      onClick={handleReset}
                      className="w-full mt-4 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition text-sm font-medium"
                    >
                      Back to Selection
                    </button>
                  </div>
                </div>

                <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
                  <h3 className="font-semibold text-blue-900 mb-2 text-sm">Need Help?</h3>
                  <p className="text-xs text-blue-800">
                    Contact our support team for assistance with your registration
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Mobile Modal Layout */}
        <div className="lg:hidden">
          <ProfessionRegistrationModal
            isOpen={step === 'profession'}
            onSelect={handleProfessionSelect}
            onClose={handleReset}
          />

          {step === 'form' && currentSchema && (
            <div className="bg-white rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
              <button
                onClick={handleReset}
                className="mb-4 text-slate-600 hover:text-slate-900 font-medium text-sm"
              >
                ← Back
              </button>
              <DynamicForm
                schema={currentSchema}
                onSubmit={handleFormSubmit}
                onCancel={handleReset}
                isLoading={isSubmitting}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
