import { useEffect, useRef, useState } from "react";
import {
  getAnnotationAnchorFingerprint,
  isAnnotationAnchorConnected,
  resolveAnnotationAnchor,
  type ResolvedAnnotationAnchor,
} from "../lib/annotation-anchors";
import type { Annotation } from "../lib/annotations-api";

interface RegistryEntry {
  annotation: Annotation;
  fingerprint: string;
  anchor: ResolvedAnnotationAnchor | null;
}

interface AnnotationAnchorRegistry {
  anchors: ReadonlyMap<string, ResolvedAnnotationAnchor | null>;
  visibility: ReadonlyMap<string, boolean>;
}

export function useAnnotationAnchors(
  annotations: Annotation[],
  targetUrl: string
): AnnotationAnchorRegistry {
  const entriesRef = useRef(new Map<string, RegistryEntry>());
  const targetUrlRef = useRef(targetUrl);
  const visibilityRef = useRef(new Map<string, boolean>());
  const [anchors, setAnchors] = useState<Map<string, ResolvedAnnotationAnchor | null>>(
    () => new Map()
  );
  const [visibility, setVisibility] = useState<Map<string, boolean>>(() => new Map());

  useEffect(() => {
    if (targetUrlRef.current !== targetUrl) {
      targetUrlRef.current = targetUrl;
      entriesRef.current.clear();
      visibilityRef.current.clear();
    }

    const nextEntries = new Map<string, RegistryEntry>();
    for (const annotation of annotations) {
      const fingerprint = getAnnotationAnchorFingerprint(annotation);
      const cached = entriesRef.current.get(annotation.id);
      const canReuse =
        cached?.fingerprint === fingerprint &&
        cached.anchor !== null &&
        isAnnotationAnchorConnected(cached.anchor);
      nextEntries.set(annotation.id, {
        annotation,
        fingerprint,
        anchor: canReuse ? cached.anchor : resolveAnnotationAnchor(annotation),
      });
    }
    entriesRef.current = nextEntries;

    const annotationIdsByElement = new Map<Element, Set<string>>();
    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            (observations) => {
              const nextVisibility = new Map(visibilityRef.current);
              let changed = false;

              for (const observation of observations) {
                const isVisible =
                  observation.isIntersecting && observation.intersectionRatio > 0;
                for (const annotationId of annotationIdsByElement.get(observation.target) ?? []) {
                  if (nextVisibility.get(annotationId) === isVisible) continue;
                  nextVisibility.set(annotationId, isVisible);
                  changed = true;
                }
              }

              if (changed) {
                visibilityRef.current = nextVisibility;
                setVisibility(nextVisibility);
              }
            },
            { root: null, threshold: 0 }
          )
        : null;

    const unbindAnchor = (annotationId: string, anchor: ResolvedAnnotationAnchor | null) => {
      if (!anchor) return;
      const annotationIds = annotationIdsByElement.get(anchor.element);
      if (!annotationIds) return;
      annotationIds.delete(annotationId);
      if (annotationIds.size > 0) return;
      annotationIdsByElement.delete(anchor.element);
      observer?.unobserve(anchor.element);
    };

    const bindAnchor = (annotationId: string, anchor: ResolvedAnnotationAnchor | null) => {
      if (!anchor) return;
      const existingIds = annotationIdsByElement.get(anchor.element);
      if (existingIds) {
        existingIds.add(annotationId);
        return;
      }
      annotationIdsByElement.set(anchor.element, new Set([annotationId]));
      observer?.observe(anchor.element);
    };

    const initialVisibility = new Map<string, boolean>();
    for (const [annotationId, entry] of nextEntries) {
      bindAnchor(annotationId, entry.anchor);
      initialVisibility.set(
        annotationId,
        entry.anchor && observer
          ? (visibilityRef.current.get(annotationId) ?? false)
          : true
      );
    }
    visibilityRef.current = initialVisibility;
    setVisibility(initialVisibility);
    setAnchors(toAnchorMap(nextEntries));

    let animationFrame: number | null = null;
    const rebindDisconnectedAnchors = () => {
      animationFrame = null;
      const nextVisibility = new Map(visibilityRef.current);
      let changed = false;

      for (const [annotationId, entry] of entriesRef.current) {
        if (!entry.anchor || isAnnotationAnchorConnected(entry.anchor)) continue;

        unbindAnchor(annotationId, entry.anchor);
        entry.anchor = resolveAnnotationAnchor(entry.annotation);
        bindAnchor(annotationId, entry.anchor);
        nextVisibility.set(annotationId, !(entry.anchor && observer));
        changed = true;
      }

      if (!changed) return;
      visibilityRef.current = nextVisibility;
      setVisibility(nextVisibility);
      setAnchors(toAnchorMap(entriesRef.current));
    };

    const mutationObserver = new MutationObserver(() => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(rebindDisconnectedAnchors);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer?.disconnect();
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
    };
  }, [annotations, targetUrl]);

  return { anchors, visibility };
}

function toAnchorMap(
  entries: ReadonlyMap<string, RegistryEntry>
): Map<string, ResolvedAnnotationAnchor | null> {
  return new Map(Array.from(entries, ([annotationId, entry]) => [annotationId, entry.anchor]));
}
