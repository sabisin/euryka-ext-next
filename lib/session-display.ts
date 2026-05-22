import type { Session, SparkCache } from "./types";

const IMAGE_ANALYSIS_TITLE = "Image Analysis";
const FALLBACK_COLOR = "#6366f1";

export function getSessionSpark(session: Session, sparkCache?: SparkCache) {
  const sparkId = session.sparkId ?? session.spark?.id;
  const cachedSpark = sparkId ? sparkCache?.[sparkId] : undefined;
  if (!session.spark) return cachedSpark;
  return {
    ...cachedSpark,
    ...session.spark,
  };
}

export function getSessionImageUrl(session: Session) {
  return session.imageUrl ?? session.image?.url;
}

export function getSessionDisplay(session: Session, sparkCache?: SparkCache) {
  const spark = getSessionSpark(session, sparkCache);
  const imageUrl = getSessionImageUrl(session);
  const title = session.sparkTitle ?? spark?.title ?? IMAGE_ANALYSIS_TITLE;
  const icon = session.sparkIcon ?? spark?.icon;
  const color = session.sparkColor ?? spark?.color ?? FALLBACK_COLOR;
  const isImageAnalysis = title === IMAGE_ANALYSIS_TITLE && !spark;
  const isImageSession = isImageAnalysis && !!imageUrl;

  return {
    title,
    icon,
    color,
    imageUrl,
    isImageAnalysis,
    isImageSession,
  };
}
