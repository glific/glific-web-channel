import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Logo } from '@/components/branding/Logo';
import { getBranding } from '@/services/branding';

interface OrgHeroProps {
  /** Rendered at the top-left of the band — a back control, when there is somewhere to go. */
  leading?: ReactNode;
  /** Replaces the org's description under the name, for screens that say something else. */
  subtitle?: ReactNode;
  logoSize?: number;
  className?: string;
}

// The band every contact-facing screen opens with: the org's colour, its mark, its name. One
// component rather than a shape each screen rebuilds — a hero that differs between sign-in and
// About reads as two different organisations.
export const OrgHero = ({ leading, subtitle, logoSize = 96, className }: OrgHeroProps) => {
  const { display_name: displayName, about } = getBranding();
  const caption = subtitle ?? about.description;

  return (
    <header
      className={cn('relative bg-primary px-6 pt-10 pb-8 text-center text-primary-foreground', className)}
      data-testid="orgHero"
    >
      {leading && <div className="absolute top-6 left-4">{leading}</div>}

      <Logo size={logoSize} className="mx-auto" />

      <h1 className="mt-4 text-xl font-bold" data-testid="orgName">
        {displayName}
      </h1>

      {caption && (
        <p className="mt-1 line-clamp-2 text-sm text-primary-foreground/80" data-testid="orgCaption">
          {caption}
        </p>
      )}
    </header>
  );
};
