import { getTheme } from '@/services/theme';

// Renders the org's logo, or nothing when they have not set one — the display name alone is
// still valid branding, so there is no Glific mark to fall back to.
export const Logo = ({ className }: { className?: string }) => {
  const { logo_url: logoUrl, display_name: displayName } = getTheme();

  if (!logoUrl) return null;

  return <img src={logoUrl} alt={displayName} className={className} data-testid="orgLogo" />;
};
