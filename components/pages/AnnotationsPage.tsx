import { AnnotationsList } from "../annotations/AnnotationsList";
import { AnnotationView } from "../annotations/AnnotationView";

interface AnnotationsPageProps {
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string | null) => void;
}

export function AnnotationsPage({
  selectedMarkerId,
  onSelectMarker,
}: AnnotationsPageProps) {
  return selectedMarkerId ? (
    <AnnotationView markerId={selectedMarkerId} onBack={() => onSelectMarker(null)} />
  ) : (
    <AnnotationsList onSelectMarker={onSelectMarker} />
  );
}
