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
        }
      } catch {
        throw redirect({ to: '/onboarding' });
      }
    }

    if (slug) {
      throw redirect({
        to: '/s/$studioSlug',
        params: { studioSlug: slug },
      });
    }

    throw redirect({ to: '/onboarding' });
  },
  component: () => null,
})
