import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { OrgHero } from './OrgHero';
import { getBranding, type Branding } from '@/services/branding';

vi.mock('@/services/branding', () => ({ getBranding: vi.fn() }));

const brandingWith = (website: string | null) =>
  vi.mocked(getBranding).mockReturnValue({
    display_name: 'Kind Paws',
    logo_url: null,
    about: { description: 'Rescuing stray animals.', website, address: null, email: null, hours: null },
  } as Branding);

describe('<OrgHero />', () => {
  it('links to the organisation\'s website under its description', () => {
    brandingWith('https://www.kindpaws.org/');
    render(<OrgHero />);

    const link = screen.getByTestId('orgWebsite');
    expect(link).toHaveTextContent('Visit kindpaws.org');
    expect(link).toHaveAttribute('href', 'https://www.kindpaws.org/');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('treats a website saved without a scheme as https', () => {
    brandingWith('kindpaws.org');
    render(<OrgHero />);

    expect(screen.getByTestId('orgWebsite')).toHaveAttribute('href', 'https://kindpaws.org/');
  });

  it('never turns a non-web address into a link', () => {
    brandingWith('javascript:alert(1)');
    render(<OrgHero />);

    expect(screen.queryByTestId('orgWebsite')).not.toBeInTheDocument();
  });

  it('leaves the link out when the caption is replaced', () => {
    brandingWith('https://kindpaws.org');
    render(<OrgHero subtitle={null} />);

    expect(screen.queryByTestId('orgWebsite')).not.toBeInTheDocument();
  });
});
