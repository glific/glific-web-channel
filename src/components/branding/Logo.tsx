import { cn } from '@/lib/utils';
import { initialsFor } from '@/lib/initials';
import { getBranding } from '@/services/branding';

interface LogoProps {
  /** Diameter in pixels. Also set as width/height so the circle reserves its space. */
  size: number;
  className?: string;
}

// Renders the org's logo in a white square, or its initials when no logo has been set — the
// display name alone is still valid branding, so there is no Glific mark to fall back to.
//
// Always the same square frame, whatever the org uploaded, so two orgs' screens stay
// consistent. `object-contain` rather than `object-cover` because NGO logos are usually
// landscape: covering would crop the sides off a wordmark.
export const Logo = ({ size, className }: LogoProps) => {
  const { logo_url: logoUrl, display_name: displayName } = getBranding();

  const frame = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm', className);

  if (!logoUrl) {
    return (
      <div className={frame} style={{ width: size, height: size }} aria-label={displayName} data-testid="orgInitials">
        <span className="font-semibold text-primary" style={{ fontSize: size * 0.38 }}>
          {initialsFor(displayName)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={logoUrl}
      alt={displayName}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn(frame, 'object-contain p-1.5')}
      data-testid="orgLogo"
    />
  );
};
