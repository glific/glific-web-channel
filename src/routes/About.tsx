import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';

import { OrgHero } from '@/components/branding/OrgHero';
import { OrgProfile } from '@/components/branding/OrgProfile';
import { getBranding, hasOrgProfile } from '@/services/branding';

// The read-only business profile as a screen of its own, reached from the chat menu. The same
// content is available as a disclosure on the sign-in screen, where there is no chat to leave.
export const About = () => {
  const navigate = useNavigate();
  const { display_name: displayName, about } = getBranding();

  return (
    <div className="mx-auto flex min-h-[100svh] w-full max-w-md flex-col bg-background" data-testid="webChannelAbout">
      {/* No caption: the description belongs to the profile below, and repeating it in the band
          above would say the same thing twice on the one screen that exists to show it. */}
      <OrgHero
        subtitle={null}
        leading={
          <button
            type="button"
            aria-label="Back"
            data-testid="aboutBack"
            onClick={() => navigate(-1)}
            className="rounded-full p-1 text-primary-foreground/90 hover:bg-white/10"
          >
            <ChevronLeft className="size-6" />
          </button>
        }
      />

      <main className="flex flex-1 flex-col px-6 py-4">
        {hasOrgProfile(about) ? (
          <OrgProfile />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground" data-testid="aboutEmpty">
            {displayName} has not published their details yet.
          </p>
        )}

        <div className="flex-1" />
      </main>
    </div>
  );
};

export default About;
