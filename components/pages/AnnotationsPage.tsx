import { AnnotationsList } from "../annotations/AnnotationsList";
import { AnnotationView } from "../annotations/AnnotationView";

interface AnnotationsPageProps {
  currentTabUrl: string | null;
  authToken: string;
  selectedMarkerId: string | null;
  onSelectMarker: (markerId: string | null) => void;
}

export function AnnotationsPage({
  currentTabUrl,
  authToken,
  selectedMarkerId,
  onSelectMarker,
}: AnnotationsPageProps) {
  return selectedMarkerId ? (
    <AnnotationView markerId={selectedMarkerId} onBack={() => onSelectMarker(null)} />
  ) : (
    <AnnotationsList
      currentTabUrl={currentTabUrl}
      authToken={authToken}
      onSelectMarker={onSelectMarker}
    />
  );
}
