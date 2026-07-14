import { useCallback, useEffect, useRef } from "react";
import type { Annotation } from "../lib/annotations-api";
import {
  getAnnotationAnchorViewportPoint,
  type ResolvedAnnotationAnchor,
} from "../lib/annotation-anchors";

const MARKER_SIZE = 32;
const COMPOSER_WIDTH = 320;
const COMPOSER_ESTIMATED_HEIGHT = 280;
const COMPOSER_MARKER_GAP = 4;
const COMPOSER_EDGE_GAP = 12;
const COMPOSER_SELECTOR = "[data-annotation-composer]";

type MarkerElement = HTMLDivElement;
type FallbackPoint = { x: number; y: number };

export function useAnnotationMarkerPositioning(
  annotations: Annotation[],
  anchors: ReadonlyMap<string, ResolvedAnnotationAnchor | null>
) {
  const fallbackPointsRef = useRef(
    new Map<string, FallbackPoint>(
      annotations.map((annotation) => [
        annotation.id,
        { x: annotation.selector.x, y: annotation.selector.y },
      ])
    )
  );
  const anchorsRef = useRef(anchors);
  const markerElementsRef = useRef(new Map<string, MarkerElement>());
  const animationFrameRef = useRef<number | null>(null);

  fallbackPointsRef.current = new Map(
    annotations.map((annotation) => [
      annotation.id,
      { x: annotation.selector.x, y: annotation.selector.y },
    ])
  );
  anchorsRef.current = anchors;

  const updateMarkerPositions = useCallback(() => {
    animationFrameRef.current = null;
    const positions: Array<{
      marker: MarkerElement;
      left: number;
      top: number;
    }> = [];

    for (const [annotationId, marker] of markerElementsRef.current) {
      const fallbackPoint = fallbackPointsRef.current.get(annotationId);
      if (!fallbackPoint) continue;

      const anchor = anchorsRef.current.get(annotationId);
      const point = anchor ? getAnnotationAnchorViewportPoint(anchor) : null;
      const anchorX = point?.x ?? fallbackPoint.x - window.scrollX;
      const anchorY = point?.y ?? fallbackPoint.y - window.scrollY;
      const left = anchorX - MARKER_SIZE / 2;
      const top = anchorY - MARKER_SIZE / 2;

      positions.push({ marker, left, top });
    }

    for (const { marker, left, top } of positions) {
      marker.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      positionComposer(marker, left, top);
    }
  }, []);

  const scheduleMarkerPositions = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(updateMarkerPositions);
  }, [updateMarkerPositions]);

  const setMarkerElement = useCallback(
    (element: MarkerElement | null) => {
      if (!element) return;
      const annotationId = element.dataset.annotationId;
      if (!annotationId) return;

      markerElementsRef.current.set(annotationId, element);
      scheduleMarkerPositions();
      return () => {
        markerElementsRef.current.delete(annotationId);
      };
    },
    [scheduleMarkerPositions]
  );

  useEffect(() => {
    document.addEventListener("scroll", scheduleMarkerPositions, {
      capture: true,
      passive: true,
    });
    window.addEventListener("scroll", scheduleMarkerPositions, { passive: true });
    window.addEventListener("resize", scheduleMarkerPositions);

    return () => {
      document.removeEventListener("scroll", scheduleMarkerPositions, true);
      window.removeEventListener("scroll", scheduleMarkerPositions);
      window.removeEventListener("resize", scheduleMarkerPositions);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [scheduleMarkerPositions]);

  // React data changes may add a marker or composer without changing the root
  // marker ref, so schedule a read/write pass after every layer render.
  useEffect(() => {
    scheduleMarkerPositions();
  });

  return setMarkerElement;
}

function positionComposer(marker: MarkerElement, markerLeft: number, markerTop: number) {
  const composer = marker.querySelector<HTMLElement>(COMPOSER_SELECTOR);
  if (!composer) return;

  const opensLeft =
    markerLeft + MARKER_SIZE + COMPOSER_MARKER_GAP + COMPOSER_WIDTH + COMPOSER_EDGE_GAP >
    window.innerWidth;
  const opensUp =
    markerTop + COMPOSER_ESTIMATED_HEIGHT + COMPOSER_EDGE_GAP > window.innerHeight;

  composer.style.left = opensLeft ? "auto" : `${MARKER_SIZE + COMPOSER_MARKER_GAP}px`;
  composer.style.right = opensLeft ? `${MARKER_SIZE + COMPOSER_MARKER_GAP}px` : "auto";
  composer.style.top = opensUp ? "auto" : "0";
  composer.style.bottom = opensUp ? "0" : "auto";
}
