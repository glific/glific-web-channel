import { cn } from '@/lib/utils';
import { getBranding } from '@/services/branding';

interface LogoProps {
  /** Diameter in pixels. Also set as width/height so the circle reserves its space. */
  size: number;
  className?: string;
}

// Two letters, so the circle reads as a mark rather than as a truncated word. A single-word name
// gives its first two letters, which is why "Glific" shows "gl" rather than "g".
const initialsFor = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toLowerCase();
  return (words[0][0] + words[1][0]).toLowerCase();
};

// Renders the org's logo in a white circle, or its initials when no logo has been set — the
// display name alone is still valid branding, so there is no Glific mark to fall back to.
//
// Always the same circular frame, whatever the org uploaded, so two orgs' screens stay
// consistent. `object-contain` rather than `object-cover` because NGO logos are usually
// landscape: covering would crop the sides off a wordmark.
export const Logo = ({ size, className }: LogoProps) => {
  const { logo_url: logoUrl, display_name: displayName } = getBranding();

  const frame = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm', className);

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
