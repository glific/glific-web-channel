import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, it, expect, vi } from 'vitest';

import { About } from './About';

const { branding } = vi.hoisted(() => ({
  branding: {
    display_name: 'Test NGO',
    logo_url: null,
    primary_color: '#119656',
    primary_foreground: '#fafafa',
    secondary_color: '#eab308',
    about: {
      description: 'Test NGO runs after-school programmes.',
      address: 'Bengaluru, Karnataka',
      website: 'https://test.example.org',
      email: 'hello@test.example.org',
      hours: 'Mon-Fri, 10am-6pm IST',
    },
  },
}));

vi.mock('@/services/branding', () => ({
  getBranding: () => branding,
  hasOrgProfile: (about: Record<string, unknown>) => Object.values(about).some(Boolean),
}));

const renderAbout = () =>
  render(
    <MemoryRouter>
      <About />
    </MemoryRouter>
  );

describe('<About />', () => {
  it('renders the business profile the organisation configured', () => {
    renderAbout();

    expect(screen.getByTestId('orgName')).toHaveTextContent('Test NGO');
    expect(screen.getByTestId('orgDescription')).toHaveTextContent('after-school programmes');
    expect(screen.getByTestId('about-address')).toHaveTextContent('Bengaluru, Karnataka');
    expect(screen.getByTestId('about-hours')).toHaveTextContent('Mon-Fri, 10am-6pm IST');
  });

  // The description is the profile's first line; a caption repeating it in the band above would
  // say the same thing twice on the one screen that exists to show it.
  it('leaves the caption off the hero, where the description already follows it', () => {
    renderAbout();

    expect(screen.queryByTestId('orgCaption')).not.toBeInTheDocument();
  });

  it('makes the website and the email reachable, not just readable', () => {
    renderAbout();

    expect(screen.getByRole('link', { name: 'https://test.example.org' })).toHaveAttribute(
      'href',
      'https://test.example.org'
    );
    expect(screen.getByRole('link', { name: 'hello@test.example.org' })).toHaveAttribute(
      'href',
      'mailto:hello@test.example.org'
    );
  });

  it('says so plainly when the organisation has published nothing', () => {
    const emptied = { description: null, address: null, website: null, email: null, hours: null };
    Object.assign(branding, { about: emptied });

    renderAbout();

    expect(screen.getByTestId('aboutEmpty')).toHaveTextContent('Test NGO has not published their details yet.');
    expect(screen.queryByTestId('orgProfile')).not.toBeInTheDocument();
  });
});
