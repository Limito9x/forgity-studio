import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentStudioSlug, setCurrentStudio } from '@/features/studios/hooks/useCurrentStudio'
import { getStudios } from '@/gen/endpoints/studios/studios'

export const Route = createFileRoute('/_protected/_layout/')({
  beforeLoad: async () => {
    let slug = getCurrentStudioSlug();

    if (!slug) {
      try {
        const studios = await getStudios();
        if (studios && studios.length > 0) {
          const target = studios[0];
          setCurrentStudio(target);
          slug = target.slug;
        } else if (Array.isArray(studios) && studios.length === 0) {
          throw redirect({ to: '/onboarding' });
        }
      } catch (err) {
        // If it's a TanStack Router redirect, let it pass through
        if (err && typeof err === 'object' && 'to' in err) {
          throw err;
        }
        // If it's an API/network error, do not redirect to onboarding.
        // Protected layout will render ServerTroubleScreen.
        return;
      }
    }

    if (slug) {
      throw redirect({
        to: '/s/$studioSlug',
        params: { studioSlug: slug },
      });
    }
  },
  component: () => null,
})
