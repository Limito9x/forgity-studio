import { useParams, useRouterState } from '@tanstack/react-router';
import { useStudios } from './useStudios';
import { useEffect } from 'react';

const STORAGE_KEY_SLUG = 'automation_current_studio_slug';
const STORAGE_KEY_ID = 'automation_current_studio_id';

export function getCurrentStudioSlug(): string | null {
  return localStorage.getItem(STORAGE_KEY_SLUG);
}

export function getCurrentStudioId(): string | null {
  return localStorage.getItem(STORAGE_KEY_ID);
}

export function setCurrentStudio(studio: { id?: string; slug?: string; name?: string }) {
  if (studio.slug) localStorage.setItem(STORAGE_KEY_SLUG, studio.slug);
  if (studio.id) localStorage.setItem(STORAGE_KEY_ID, studio.id);
}

export function useCurrentStudio(options?: { enabled?: boolean }) {
  const params = useParams({ strict: false }) as { studioSlug?: string };
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const enabled = options?.enabled ?? true;

  // 1. Ưu tiên lấy slug từ route param (:studioSlug)
  // 2. Nếu route không có param, parse từ URL regex /s/:slug
  // 3. Fallback về localStorage
  let matchedSlug = params.studioSlug;
  if (!matchedSlug) {
    const match = pathname.match(/\/s\/([^/]+)/);
    if (match) matchedSlug = match[1];
  }
  const effectiveSlug = matchedSlug || getCurrentStudioSlug();

  const { data: studios, isLoading } = useStudios({ enabled });

  const safeStudios = Array.isArray(studios) ? studios : [];
  const studio =
    safeStudios.find((s) => s.slug === effectiveSlug) ??
    (safeStudios.length > 0 ? safeStudios[0] : undefined);

  useEffect(() => {
    if (studio) {
      setCurrentStudio(studio);
    }
  }, [studio]);

  return {
    studio,
    studioId: studio?.id,
    studioSlug: studio?.slug || effectiveSlug || '',
    studioName: studio?.name || '',
    studios: studios || [],
    isLoading,
  };
}
