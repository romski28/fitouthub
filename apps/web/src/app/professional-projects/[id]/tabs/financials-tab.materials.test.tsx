import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FinancialsTab } from './financials-tab';

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const makeJsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('FinancialsTab materials purchase', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/milestones/project-professional/')) {
          return Promise.resolve(makeJsonResponse([]));
        }

        if (url.includes('/financial/project/proj-1/summary')) {
          return Promise.resolve(
            makeJsonResponse({
              escrowConfirmed: 1200,
              transactions: [],
            }),
          );
        }

        if (url.includes('/financial/project/proj-1/milestones/m1/procurement-evidence')) {
          if (String(init?.method || 'GET').toUpperCase() === 'POST') {
            return Promise.resolve(makeJsonResponse({ success: true }));
          }
          return Promise.resolve(makeJsonResponse([]));
        }

        return Promise.resolve(makeJsonResponse({}));
      }),
    );
  });

  it('renders materials panel and submits a claim when escrow is ready', async () => {
    const user = userEvent.setup();

    render(
      <FinancialsTab
        tab="financials"
        projectStatus="awarded"
        projectBudget={12000}
        awardedAmount={10000}
        paymentPlan={{
          id: 'pp-1',
          projectScale: 'SCALE_1',
          escrowFundingPolicy: 'FULL_UPFRONT',
          status: 'active',
          currency: 'HKD',
          totalAmount: 10000,
          milestones: [
            {
              id: 'm1',
              sequence: 1,
              title: 'Milestone 1',
              type: 'deposit',
              status: 'escrow_funded',
              amount: 10000,
            },
          ],
        }}
        paymentPlanLoading={false}
        selectedPaymentMilestoneId=""
        onSelectPaymentMilestone={vi.fn()}
        paymentRequests={[]}
        projectFinancials={{
          projectBudget: 12000,
          awardedAmount: 10000,
          totalPaymentRequest: 0,
          totalPaid: 0,
          balance: 10000,
        }}
        paymentRequestLoading={false}
        paymentRequestError={null}
        onSubmitPaymentRequest={vi.fn(async () => {})}
        paymentRequestActionLoading={false}
        accessToken="token"
        projectId="proj-1"
        projectProfessionalId="pp-1"
        onRefreshPaymentPlan={vi.fn(async () => {})}
        onRequestMilestoneFunding={vi.fn(async () => {})}
        fundingRequestLoading={false}
        onOpenScheduleTab={vi.fn()}
        paymentRequestAmount=""
        onUpdatePaymentRequestAmount={vi.fn()}
        paymentRequestType="fixed"
        onUpdatePaymentRequestType={vi.fn()}
        paymentRequestNotes=""
        onUpdatePaymentRequestNotes={vi.fn()}
      />,
    );

    await screen.findByText('Project Materials Purchase');

    await user.type(screen.getByPlaceholderText('Claimed amount'), '500');
    await user.click(screen.getByRole('button', { name: 'Submit claim' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/financial/project/proj-1/milestones/m1/procurement-evidence'),
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });
  });

  it('shows wallet transfer button only when there is an approved materials claim', async () => {
    // Override fetch: procurement-evidence returns one approved claim; no wallet transfer tx
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/milestones/project-professional/')) {
          return Promise.resolve(makeJsonResponse([]));
        }
        if (url.includes('/financial/project/proj-1/summary')) {
          return Promise.resolve(makeJsonResponse({ escrowConfirmed: 1200, transactions: [] }));
        }
        if (url.includes('/financial/project/proj-1/milestones/m1/procurement-evidence')) {
          return Promise.resolve(
            makeJsonResponse([
              { id: 'ev-1', claimedAmount: 800, approvedAmount: 750, status: 'approved', notes: null, createdAt: new Date().toISOString() },
            ]),
          );
        }
        return Promise.resolve(makeJsonResponse({}));
      }),
    );

    render(
      <FinancialsTab
        tab="financials"
        projectStatus="awarded"
        awardedAmount={10000}
        paymentPlan={{
          id: 'pp-1',
          projectScale: 'SCALE_1',
          escrowFundingPolicy: 'FULL_UPFRONT',
          status: 'active',
          currency: 'HKD',
          totalAmount: 10000,
          milestones: [{ id: 'm1', sequence: 1, title: 'Milestone 1', type: 'deposit', status: 'escrow_funded', amount: 10000 }],
        }}
        paymentPlanLoading={false}
        selectedPaymentMilestoneId=""
        onSelectPaymentMilestone={vi.fn()}
        paymentRequests={[]}
        projectFinancials={{ totalPaymentRequest: 0, totalPaid: 0, balance: 10000 }}
        paymentRequestLoading={false}
        paymentRequestError={null}
        onSubmitPaymentRequest={vi.fn(async () => {})}
        paymentRequestActionLoading={false}
        accessToken="token"
        projectId="proj-1"
        projectProfessionalId="pp-1"
        onRefreshPaymentPlan={vi.fn(async () => {})}
        onRequestMilestoneFunding={vi.fn(async () => {})}
        fundingRequestLoading={false}
        onOpenScheduleTab={vi.fn()}
        paymentRequestAmount=""
        onUpdatePaymentRequestAmount={vi.fn()}
        paymentRequestType="fixed"
        onUpdatePaymentRequestType={vi.fn()}
        paymentRequestNotes=""
        onUpdatePaymentRequestNotes={vi.fn()}
      />,
    );

    // Transfer button should appear once approved claim is loaded
    await screen.findByRole('button', { name: 'Transfer to Drawable Wallet' });
    // Approved total label should show correct amount
    expect(screen.getByText(/Approved total:.*HK\$750/)).toBeTruthy();
  });

  it('hides wallet transfer button when there are no approved claims', async () => {
    // procurement-evidence returns a pending claim only
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/milestones/project-professional/')) return Promise.resolve(makeJsonResponse([]));
        if (url.includes('/financial/project/proj-1/summary')) {
          return Promise.resolve(makeJsonResponse({ escrowConfirmed: 1200, transactions: [] }));
        }
        if (url.includes('/financial/project/proj-1/milestones/m1/procurement-evidence')) {
          return Promise.resolve(
            makeJsonResponse([{ id: 'ev-2', claimedAmount: 800, approvedAmount: null, status: 'pending', notes: null, createdAt: new Date().toISOString() }]),
          );
        }
        return Promise.resolve(makeJsonResponse({}));
      }),
    );

    render(
      <FinancialsTab
        tab="financials"
        projectStatus="awarded"
        awardedAmount={10000}
        paymentPlan={{
          id: 'pp-1',
          projectScale: 'SCALE_1',
          escrowFundingPolicy: 'FULL_UPFRONT',
          status: 'active',
          currency: 'HKD',
          totalAmount: 10000,
          milestones: [{ id: 'm1', sequence: 1, title: 'Milestone 1', type: 'deposit', status: 'escrow_funded', amount: 10000 }],
        }}
        paymentPlanLoading={false}
        selectedPaymentMilestoneId=""
        onSelectPaymentMilestone={vi.fn()}
        paymentRequests={[]}
        projectFinancials={{ totalPaymentRequest: 0, totalPaid: 0, balance: 10000 }}
        paymentRequestLoading={false}
        paymentRequestError={null}
        onSubmitPaymentRequest={vi.fn(async () => {})}
        paymentRequestActionLoading={false}
        accessToken="token"
        projectId="proj-1"
        projectProfessionalId="pp-1"
        onRefreshPaymentPlan={vi.fn(async () => {})}
        onRequestMilestoneFunding={vi.fn(async () => {})}
        fundingRequestLoading={false}
        onOpenScheduleTab={vi.fn()}
        paymentRequestAmount=""
        onUpdatePaymentRequestAmount={vi.fn()}
        paymentRequestType="fixed"
        onUpdatePaymentRequestType={vi.fn()}
        paymentRequestNotes=""
        onUpdatePaymentRequestNotes={vi.fn()}
      />,
    );

    // Wait for the component to settle (claims loaded)
    await screen.findByText('Project Materials Purchase');
    // Transfer button must NOT be present (no approved claims)
    expect(screen.queryByRole('button', { name: 'Transfer to Drawable Wallet' })).toBeNull();
  });

  it('calls wallet transfer API with correct payload', async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/milestones/project-professional/')) return Promise.resolve(makeJsonResponse([]));
      if (url.includes('/financial/project/proj-1/summary')) {
        return Promise.resolve(makeJsonResponse({ escrowConfirmed: 1200, transactions: [] }));
      }
      if (url.includes('/financial/project/proj-1/milestones/m1/procurement-evidence')) {
        return Promise.resolve(
          makeJsonResponse([{ id: 'ev-1', claimedAmount: 800, approvedAmount: 750, status: 'approved', notes: null, createdAt: new Date().toISOString() }]),
        );
      }
      if (url.includes('/professional-wallet/transfer')) {
        return Promise.resolve(makeJsonResponse({ success: true }));
      }
      return Promise.resolve(makeJsonResponse({}));
    });
    vi.stubGlobal('fetch', mockFetch);

    render(
      <FinancialsTab
        tab="financials"
        projectStatus="awarded"
        awardedAmount={10000}
        paymentPlan={{
          id: 'pp-1',
          projectScale: 'SCALE_1',
          escrowFundingPolicy: 'FULL_UPFRONT',
          status: 'active',
          currency: 'HKD',
          totalAmount: 10000,
          milestones: [{ id: 'm1', sequence: 1, title: 'Milestone 1', type: 'deposit', status: 'escrow_funded', amount: 10000 }],
        }}
        paymentPlanLoading={false}
        selectedPaymentMilestoneId=""
        onSelectPaymentMilestone={vi.fn()}
        paymentRequests={[]}
        projectFinancials={{ totalPaymentRequest: 0, totalPaid: 0, balance: 10000 }}
        paymentRequestLoading={false}
        paymentRequestError={null}
        onSubmitPaymentRequest={vi.fn(async () => {})}
        paymentRequestActionLoading={false}
        accessToken="token"
        projectId="proj-1"
        projectProfessionalId="pp-1"
        onRefreshPaymentPlan={vi.fn(async () => {})}
        onRequestMilestoneFunding={vi.fn(async () => {})}
        fundingRequestLoading={false}
        onOpenScheduleTab={vi.fn()}
        paymentRequestAmount=""
        onUpdatePaymentRequestAmount={vi.fn()}
        paymentRequestType="fixed"
        onUpdatePaymentRequestType={vi.fn()}
        paymentRequestNotes=""
        onUpdatePaymentRequestNotes={vi.fn()}
      />,
    );

    const transferBtn = await screen.findByRole('button', { name: 'Transfer to Drawable Wallet' });
    await user.click(transferBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/professional-wallet/transfer'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"projectProfessionalId":"pp-1"'),
        }),
      );
    });
  });
});
