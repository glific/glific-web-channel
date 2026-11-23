import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportRenderError } from '@/lib/monitoring';
import { BrandingUnavailable } from '@/components/branding/BrandingUnavailable';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('@/lib/monitoring', () => ({ reportRenderError: vi.fn() }));

const Crash = (): never => {
  throw new Error('render failed');
};

describe('<ErrorBoundary />', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary fallback={<BrandingUnavailable />}>
        <div>CHAT SCREEN</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('CHAT SCREEN')).toBeInTheDocument();
  });

  it('reports a render crash and shows the error page in its place', () => {
    // React logs the caught error to the console; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<BrandingUnavailable />}>
        <Crash />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('brandingUnavailable')).toBeInTheDocument();
    expect(reportRenderError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'render failed' }),
      expect.any(String)
    );
  });
});
