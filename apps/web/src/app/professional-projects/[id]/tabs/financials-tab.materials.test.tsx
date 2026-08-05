import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FinancialsTab } from './financials-tab';

// Mock the heavy ProjectFinancialsCard — we test its behavior separately
vi.mock('@/components/project-financials-card', () => ({
  default: ({ projectId, role }: { projectId: string; role: string }) => (
    <div data-testid="financials-card" data-role={role} data-project-id={projectId}>
      ProjectFinancialsCard
    </div>
  ),
}));

// Mock PaymentRequestModal
vi.mock('@/components/next-steps/payment-request-modal', () => ({
  PaymentRequestModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? (
      <div data-testid="payment-request-modal">
        <button data-testid="close-modal" onClick={onClose}>Close</button>
      </div>
    ) : null,
}));

describe('FinancialsTab (pro refactored)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const baseProps = {
    projectStatus: 'awarded',
    awardedAmount: 10000,
    accessToken: 'token',
    projectId: 'proj-1',
    projectProfessionalId: 'pp-1',
    onNavigateTab: vi.fn(),
  };

  it('renders the ProjectFinancialsCard when awarded', () => {
    render(<FinancialsTab {...baseProps} />);
    expect(screen.getByTestId('financials-card')).toBeTruthy();
    expect(screen.getByTestId('financials-card').getAttribute('data-role')).toBe('professional');
  });

  it('shows "not awarded" message when project is not awarded', () => {
    render(<FinancialsTab {...baseProps} projectStatus="quoted" />);
    expect(screen.getByText(/Financials will be available once your quote is awarded/)).toBeTruthy();
    expect(screen.queryByTestId('financials-card')).toBeNull();
  });

  it('shows login prompt when no access token', () => {
    render(<FinancialsTab {...baseProps} accessToken={null} />);
    expect(screen.getByText(/Please log in/)).toBeTruthy();
  });

  it('shows login prompt when no project id', () => {
    render(<FinancialsTab {...baseProps} projectId={undefined} />);
    expect(screen.getByText(/Please log in/)).toBeTruthy();
  });

  it('opens PaymentRequestModal when "Request additional works" is clicked', () => {
    render(<FinancialsTab {...baseProps} />);
    expect(screen.queryByTestId('payment-request-modal')).toBeNull();

    fireEvent.click(screen.getByText('+ Request additional works payment'));
    expect(screen.getByTestId('payment-request-modal')).toBeTruthy();
  });

  it('closes PaymentRequestModal when onClose is called', () => {
    render(<FinancialsTab {...baseProps} />);

    fireEvent.click(screen.getByText('+ Request additional works payment'));
    expect(screen.getByTestId('payment-request-modal')).toBeTruthy();

    fireEvent.click(screen.getByTestId('close-modal'));
    expect(screen.queryByTestId('payment-request-modal')).toBeNull();
  });
});