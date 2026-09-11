import { Clock, Globe, Mail, MapPin } from 'lucide-react';
import type { ComponentType } from 'react';

import { getBranding, type OrgAbout } from '@/services/branding';

interface Row {
  key: keyof OrgAbout;
  label: string;
  icon: ComponentType<{ className?: string }>;
  href?: (value: string) => string;
}

const ROWS: Row[] = [
  { key: 'address', label: 'Address', icon: MapPin },
  { key: 'website', label: 'Website', icon: Globe, href: (value) => value },
  { key: 'email', label: 'Contact', icon: Mail, href: (value) => `mailto:${value}` },
  { key: 'hours', label: 'Hours', icon: Clock },
];

// The read-only business profile, the web equivalent of the WhatsApp business profile. Shared
// between the About screen and the disclosure on the sign-in screen, so a contact reads the same
// thing wherever they open it.
export const OrgProfile = () => {
  const { about } = getBranding();
  const rows = ROWS.filter((row) => about[row.key]);

  return (
    <div className="flex flex-col" data-testid="orgProfile">
      {about.description && (
        <p className="px-1 pb-4 text-[0.95rem] leading-relaxed" data-testid="orgDescription">
          {about.description}
        </p>
      )}

      {rows.map(({ key, label, icon: Icon, href }) => {
        const value = about[key] as string;

        return (
          <div key={key} className="flex items-start gap-3 border-t border-border py-3.5" data-testid={`about-${key}`}>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-[0.7rem] font-semibold tracking-wider text-muted-foreground uppercase">{label}</div>
              {href ? (
                <a
                  href={href(value)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium break-words text-primary hover:underline"
                >
                  {value}
                </a>
              ) : (
                <div className="font-medium break-words">{value}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
