import { cn } from '@/lib/utils';
import { getTheme } from '@/services/theme';

interface LogoProps {
  /** Diameter in pixels. Also set as width/height so the circle reserves its space. */
  size: number;
  className?: string;
}

// Renders the org's logo, or nothing when they have not set one — the display name alone is
// still valid branding, so there is no Glific mark to fall back to.
//
// Always a circle, at a fixed size, whatever the org uploaded. `object-contain` rather than
// `object-cover` because NGO logos are usually landscape: covering would crop the sides off a
// wordmark. The intrinsic width/height stop the card reflowing when the image lands.
export const Logo = ({ size, className }: LogoProps) => {
  const { logo_url: logoUrl, display_name: displayName } = getTheme();

  if (!logoUrl) return null;

  return (
    <img
      src={logoUrl}
      alt={displayName}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn('shrink-0 rounded-full border border-border bg-white object-contain p-1', className)}
      data-testid="orgLogo"
    />
  );
};
