'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from '@/config/api';
import ChatImageUploader from '@/components/chat-image-uploader';

type CertificationType = {
  id: string;
  code: string;
  name: string;
  regulator?: string | null;
  appliesTo?: 'INDIVIDUAL' | 'BUSINESS' | null;
  description?: string | null;
};

type CertificationTrade = {
  id: string;
  title: string;
  professionType?: string | null;
};

type TradeCertificationRequirement = {
  id: string;
  certificationTypeId: string;
  requirementLevel: 'MANDATORY' | 'OPTIONAL' | 'RECOMMENDED';
  notes?: string | null;
  trade: CertificationTrade;
  certificationType: CertificationType;
};

type ProfessionalCertification = {
  id: string;
  createdAt?: string;
  certificationTypeId: string;
  tradeId?: string | null;
  holderType: 'INDIVIDUAL' | 'BUSINESS';
  registrationNumber?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  documentStorageKey?: string | null;
  documentUrl?: string | null;
  verificationStatus: 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  verificationNotes?: string | null;
  certificationType: CertificationType;
  trade?: CertificationTrade | null;
};

type ProfessionalCertificationManagerProps = {
  accessToken: string;
  selectedTradeTitles: string[];
  professionalType?: string | null;
};

type CertificationFormState = {
  certificationTypeId: string;
  tradeId: string;
  holderType: 'INDIVIDUAL' | 'BUSINESS';
  registrationNumber: string;
  issuedAt: string;
  expiresAt: string;
  existingDocumentStorageKey: string;
  existingDocumentUrl: string;
};

const emptyForm: CertificationFormState = {
  certificationTypeId: '',
  tradeId: '',
  holderType: 'INDIVIDUAL',
  registrationNumber: '',
  issuedAt: '',
  expiresAt: '',
  existingDocumentStorageKey: '',
  existingDocumentUrl: '',
};

const BUSINESS_SCOPE_TRADE_ID = '__BUSINESS__';

const statusToneMap: Record<ProfessionalCertification['verificationStatus'], string> = {
  SUBMITTED: 'bg-amber-100 text-amber-800 ring-amber-200',
  VERIFIED: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-800 ring-rose-200',
  EXPIRED: 'bg-slate-200 text-slate-700 ring-slate-300',
};

const formatDateInputValue = (value?: string | null) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

export function ProfessionalCertificationManager({
  accessToken,
  selectedTradeTitles,
  professionalType,
}: ProfessionalCertificationManagerProps) {
  const [certificationTypes, setCertificationTypes] = useState<CertificationType[]>([]);
  const [requirements, setRequirements] = useState<TradeCertificationRequirement[]>([]);
  const [certifications, setCertifications] = useState<ProfessionalCertification[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CertificationFormState>(emptyForm);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploaderClearKey, setUploaderClearKey] = useState(0);
  const hasLoadedRef = useRef(false);

  const selectedTradeSet = useMemo(
    () => new Set(selectedTradeTitles.map((title) => title.trim().toLowerCase()).filter(Boolean)),
    [selectedTradeTitles],
  );

  const relevantRequirements = useMemo(
    () => requirements.filter((requirement) => selectedTradeSet.has(requirement.trade.title.trim().toLowerCase())),
    [requirements, selectedTradeSet],
  );

  const availableTradeOptions = useMemo(() => {
    const map = new Map<string, CertificationTrade>();
    relevantRequirements.forEach((requirement) => {
      map.set(requirement.trade.id, requirement.trade);
    });
    return Array.from(map.values()).sort((left, right) => left.title.localeCompare(right.title));
  }, [relevantRequirements]);

  const isBusinessProfile = useMemo(() => {
    const normalized = String(professionalType || '').trim().toLowerCase();
    return normalized === 'company' || normalized === 'reseller';
  }, [professionalType]);

  const defaultHolderType = useMemo<CertificationFormState['holderType']>(() => {
    return isBusinessProfile ? 'BUSINESS' : 'INDIVIDUAL';
  }, [isBusinessProfile]);

  const filteredCertificationTypes = useMemo(() => {
    if (form.tradeId === BUSINESS_SCOPE_TRADE_ID) {
      return certificationTypes.filter((type) => type.appliesTo === 'BUSINESS');
    }

    const allowedIds = new Set(
      relevantRequirements
        .filter((requirement) => !form.tradeId || requirement.trade.id === form.tradeId)
        .map((requirement) => requirement.certificationTypeId),
    );

    if (allowedIds.size === 0) {
      return certificationTypes;
    }

    return certificationTypes.filter((type) => allowedIds.has(type.id));
  }, [certificationTypes, form.tradeId, relevantRequirements]);

  const missingMandatoryRequirements = useMemo(() => {
    const uploadedTypeIds = new Set(
      certifications
        .filter((certification) => certification.verificationStatus !== 'REJECTED')
        .map((certification) => certification.certificationTypeId),
    );

    return relevantRequirements.filter(
      (requirement) =>
        requirement.requirementLevel === 'MANDATORY' &&
        !uploadedTypeIds.has(requirement.certificationTypeId),
    );
  }, [certifications, relevantRequirements]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (!hasLoadedRef.current) {
          setLoading(true);
        }
        setError(null);

        const [typesRes, requirementsRes, certificationsRes] = await Promise.all([
          fetch(`${API_BASE_URL}/professional/certification-types`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE_URL}/professional/certification-requirements`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`${API_BASE_URL}/professional/certifications`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (!typesRes.ok) throw new Error(await typesRes.text());
        if (!requirementsRes.ok) throw new Error(await requirementsRes.text());
        if (!certificationsRes.ok) throw new Error(await certificationsRes.text());

        const [typesPayload, requirementsPayload, certificationsPayload] = await Promise.all([
          typesRes.json(),
          requirementsRes.json(),
          certificationsRes.json(),
        ]);

        if (cancelled) return;
        setCertificationTypes(Array.isArray(typesPayload) ? typesPayload : []);
        setRequirements(Array.isArray(requirementsPayload) ? requirementsPayload : []);
        setCertifications(Array.isArray(certificationsPayload) ? certificationsPayload : []);
        hasLoadedRef.current = true;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load certifications');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (isBusinessProfile) {
      setForm((current) => {
        const nextHolderType = current.holderType === 'BUSINESS' ? current.holderType : 'BUSINESS';
        const nextTradeId = current.tradeId || BUSINESS_SCOPE_TRADE_ID;
        if (nextHolderType === current.holderType && nextTradeId === current.tradeId) return current;
        return {
          ...current,
          holderType: nextHolderType,
          tradeId: nextTradeId,
          certificationTypeId:
            current.tradeId === nextTradeId && current.holderType === nextHolderType
              ? current.certificationTypeId
              : '',
        };
      });
      return;
    }

    if (form.tradeId || availableTradeOptions.length !== 1) return;
    setForm((current) => ({ ...current, tradeId: availableTradeOptions[0].id }));
  }, [availableTradeOptions, form.tradeId, isBusinessProfile]);

  useEffect(() => {
    setForm((current) => {
      if (editingId) return current;
      if (current.holderType === defaultHolderType) return current;
      return {
        ...current,
        holderType: defaultHolderType,
      };
    });
  }, [defaultHolderType, editingId]);

  useEffect(() => {
    if (!form.certificationTypeId) return;
    if (filteredCertificationTypes.some((type) => type.id === form.certificationTypeId)) return;
    setForm((current) => ({ ...current, certificationTypeId: '' }));
  }, [filteredCertificationTypes, form.certificationTypeId]);

  const resetForm = () => {
    setForm({
      ...emptyForm,
      holderType: defaultHolderType,
      tradeId: isBusinessProfile ? BUSINESS_SCOPE_TRADE_ID : '',
    });
    setEditingId(null);
    setPendingFiles([]);
    setUploaderClearKey((current) => current + 1);
    setError(null);
  };

  const uploadFiles = async (files: File[]) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const res = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/uploads`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const payload = await res.json();
    return Array.isArray(payload?.keys)
      ? payload.keys.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      let documentStorageKey = form.existingDocumentStorageKey || undefined;
      if (pendingFiles.length > 0) {
        const uploadedKeys = await uploadFiles(pendingFiles);
        documentStorageKey = uploadedKeys[0];
      }

      const payload = {
        certificationTypeId: form.certificationTypeId,
        tradeId: form.tradeId && form.tradeId !== BUSINESS_SCOPE_TRADE_ID ? form.tradeId : undefined,
        holderType: form.holderType,
        registrationNumber: form.registrationNumber,
        issuedAt: form.issuedAt || undefined,
        expiresAt: form.expiresAt || undefined,
        documentStorageKey,
      };

      const endpoint = editingId
        ? `${API_BASE_URL}/professional/certifications/${editingId}`
        : `${API_BASE_URL}/professional/certifications`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      const record = await res.json();
      setCertifications((current) => {
        const next = editingId
          ? current.map((item) => (item.id === record.id ? record : item))
          : [record, ...current];
        return next.sort(
          (left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime(),
        );
      });
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save certification');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (certification: ProfessionalCertification) => {
    setEditingId(certification.id);
    setForm({
      certificationTypeId: certification.certificationTypeId,
      tradeId:
        certification.tradeId || certification.holderType === 'BUSINESS'
          ? certification.tradeId || BUSINESS_SCOPE_TRADE_ID
          : '',
      holderType: certification.holderType,
      registrationNumber: certification.registrationNumber || '',
      issuedAt: formatDateInputValue(certification.issuedAt),
      expiresAt: formatDateInputValue(certification.expiresAt),
      existingDocumentStorageKey: certification.documentStorageKey || '',
      existingDocumentUrl: certification.documentUrl || '',
    });
    setPendingFiles([]);
    setUploaderClearKey((current) => current + 1);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/professional/certifications/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setCertifications((current) => current.filter((item) => item.id !== id));
      if (editingId === id) {
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete certification');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-4 py-4 text-sm text-slate-700 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
        Loading certifications...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[32px] border border-[rgba(120,53,15,0.12)] bg-[rgba(239,231,207,0.76)] px-5 py-5 shadow-[0_20px_60px_rgba(81,55,32,0.06)] backdrop-blur-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Certifications</h2>
            <p className="text-sm text-slate-600">
              Store trade compliance records separately from your portfolio so regulated work can be reviewed properly.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              We are storing certification images now. Registry verification can be layered in later.
            </p>
          </div>
          <div className="rounded-lg border border-[rgba(120,53,15,0.08)] bg-[rgba(255,250,240,0.78)] px-3 py-2 text-xs text-slate-700 shadow-sm backdrop-blur-sm">
            {certifications.length} certification record{certifications.length === 1 ? '' : 's'} on file
          </div>
        </div>

        {missingMandatoryRequirements.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200/80 bg-[rgba(255,247,214,0.82)] px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Recommended next uploads for your selected trades</p>
            <ul className="mt-2 space-y-1 text-sm text-amber-900">
              {missingMandatoryRequirements.map((requirement) => (
                <li key={requirement.id}>
                  {requirement.trade.title}: {requirement.certificationType.name}
                  {requirement.certificationType.regulator ? ` (${requirement.certificationType.regulator})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-[rgba(255,242,242,0.9)] px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-[28px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.72)] px-4 py-4 shadow-sm backdrop-blur-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-slate-800">Trade to certify</label>
              <select
                value={form.tradeId}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    tradeId: e.target.value,
                    holderType: e.target.value === BUSINESS_SCOPE_TRADE_ID ? 'BUSINESS' : current.holderType,
                    certificationTypeId: '',
                  }))
                }
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
              >
                {isBusinessProfile ? <option value={BUSINESS_SCOPE_TRADE_ID}>Business (company-wide)</option> : <option value="">Select trade</option>}
                {availableTradeOptions.map((trade) => (
                  <option key={trade.id} value={trade.id}>{trade.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Certification</label>
              <select
                value={form.certificationTypeId}
                onChange={(e) => setForm((current) => ({ ...current, certificationTypeId: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
                required
              >
                <option value="">Select certification</option>
                {filteredCertificationTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}{type.regulator ? ` (${type.regulator})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Holder type</label>
              <select
                value={form.holderType}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    holderType: e.target.value === 'BUSINESS' ? 'BUSINESS' : 'INDIVIDUAL',
                  }))
                }
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
              >
                <option value="INDIVIDUAL">Individual</option>
                <option value="BUSINESS">Business</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Registration number</label>
              <input
                type="text"
                value={form.registrationNumber}
                onChange={(e) => setForm((current) => ({ ...current, registrationNumber: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Issue date</label>
              <input
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm((current) => ({ ...current, issuedAt: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-800">Expiry date</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm((current) => ({ ...current, expiresAt: e.target.value }))}
                className="mt-1 w-full rounded-md border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.82)] px-3 py-2 text-sm text-slate-900 backdrop-blur-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">Certification image</label>
            <div className="mt-1 rounded-xl border border-[rgba(120,53,15,0.12)] bg-[rgba(255,251,242,0.74)] p-3 space-y-3">
              <ChatImageUploader
                onFilesSelected={setPendingFiles}
                maxImages={1}
                disabled={saving}
                clearKey={uploaderClearKey}
              />
              {form.existingDocumentUrl && pendingFiles.length === 0 ? (
                <div className="flex items-center gap-3 rounded-lg border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.78)] px-3 py-3">
                  <img
                    src={form.existingDocumentUrl}
                    alt="Certification document"
                    className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                  />
                  <div className="text-sm text-slate-600">Current certification image on file.</div>
                </div>
              ) : null}
              <p className="text-xs text-slate-500">
                Upload a clear image of the certificate card or official document. One image per certification record for now.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-slate-500">
              {editingId ? 'Editing existing certification record' : 'Add a certification record for professional vetting'}
            </div>
            <div className="flex gap-2">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingId ? 'Update certification' : 'Add certification'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {certifications.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[rgba(120,53,15,0.16)] bg-[rgba(255,250,240,0.78)] px-4 py-5 text-sm text-slate-700">
              No certifications added yet.
            </div>
          ) : (
            certifications.map((certification) => (
              <div key={certification.id} className="rounded-[24px] border border-[rgba(120,53,15,0.12)] bg-[rgba(255,250,240,0.76)] px-4 py-4 shadow-sm backdrop-blur-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{certification.certificationType.name}</h3>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${statusToneMap[certification.verificationStatus]}`}>
                        {certification.verificationStatus}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <span>Number: {certification.registrationNumber || 'Not set'}</span>
                      <span>Holder: {certification.holderType === 'BUSINESS' ? 'Business' : 'Individual'}</span>
                      {certification.trade?.title ? <span>Trade: {certification.trade.title}</span> : certification.holderType === 'BUSINESS' ? <span>Trade: Business (company-wide)</span> : null}
                      {certification.certificationType.regulator ? <span>Regulator: {certification.certificationType.regulator}</span> : null}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Issued: {formatDateInputValue(certification.issuedAt) || 'Not set'}</span>
                      <span>Expires: {formatDateInputValue(certification.expiresAt) || 'Not set'}</span>
                    </div>
                    {certification.verificationNotes ? (
                      <p className="text-sm text-slate-600">{certification.verificationNotes}</p>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-2">
                    {certification.documentUrl ? (
                      <img
                        src={certification.documentUrl}
                        alt={certification.certificationType.name}
                        className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
                      />
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(certification)}
                        className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(certification.id)}
                        disabled={deletingId === certification.id}
                        className="rounded-md bg-rose-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-800 disabled:opacity-60"
                      >
                        {deletingId === certification.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}