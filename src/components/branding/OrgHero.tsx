import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Logo } from '@/components/branding/Logo';
import { getBranding } from '@/services/branding';

interface OrgHeroProps {
  /** Rendered at the top-left of the band — a back control, when there is somewhere to go. */
  leading?: ReactNode;
  /**
   * Replaces the org's description and website link under the name. Pass `null` for a hero with
   * no caption at all — omitting it is what falls back to the description and link.
   */
  subtitle?: ReactNode | null;
  logoSize?: number;
  className?: string;
}

// The website is typed in by an admin, so only a web address becomes a link: anything else, a
// `javascript:` URL included, is left out rather than handed to an href.
const websiteLink = (website: string | null): { href: string; label: string } | null => {
  if (!website) return null;

  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(website) ? website : `https://${website}`);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    return { href: url.href, label: `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/$/, '')}` };
  } catch {
    return null;
  }
};

// The band every contact-facing screen opens with: the org's colour, its mark, its name. One
// component rather than a shape each screen rebuilds — a hero that differs between sign-in and
// About reads as two different organisations.
export const OrgHero = ({ leading, subtitle, logoSize = 96, className }: OrgHeroProps) => {
  const { display_name: displayName, about } = getBranding();
  const caption = subtitle === undefined ? about.description : subtitle;
  const website = subtitle === undefined ? websiteLink(about.website) : null;

  return (
    <header
      className={cn('relative bg-brand px-6 pt-10 pb-8 text-center text-brand-foreground', className)}
      data-testid="orgHero"
    >
      {leading && <div className="absolute top-6 left-4">{leading}</div>}

      <Logo size={logoSize} className="mx-auto" />

      <h1 className="mt-4 text-xl font-bold" data-testid="orgName">
        {displayName}
      </h1>

      {caption && (
        <p className="mt-1 line-clamp-2 text-sm text-brand-foreground" data-testid="orgCaption">
          {caption}
        </p>
      )}

      {website && (
        <a
          href={website.href}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-foreground underline underline-offset-2"
          data-testid="orgWebsite"
        >
          Visit {website.label}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      )}
    </header>
  );
};
