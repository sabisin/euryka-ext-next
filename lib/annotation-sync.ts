export function isSameAnnotationTarget(tabUrl: string | undefined, targetUrl: string): boolean {
  if (!tabUrl) return false;
  try {
    return new URL(tabUrl).href === new URL(targetUrl).href;
  } catch {
    return tabUrl === targetUrl;
  }
}

export function upsertAnnotationById<T extends { id: string }>(
  annotations: T[],
  nextAnnotation: T
): T[] {
  const existingIndex = annotations.findIndex((annotation) => annotation.id === nextAnnotation.id);

  if (existingIndex === -1) return [...annotations, nextAnnotation];

  return annotations.flatMap((annotation, index) => {
    if (annotation.id !== nextAnnotation.id) return [annotation];
    return index === existingIndex ? [nextAnnotation] : [];
  });
}
