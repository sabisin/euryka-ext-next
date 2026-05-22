import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

interface Props {
  name?: string;
  color?: string;
  size?: number;
}

// Renders a Lucide icon by its string name (the API returns names like "Wand",
// "Brain", "Zap" etc.). Falls back to Zap when the name doesn't resolve.
export function IconWrapper({ name = "Zap", color, size = 20 }: Props) {
  const Icon = (Icons as unknown as Record<string, React.FC<LucideProps>>)[name];
  if (!Icon) {
    return <Icons.Zap width={size} height={size} style={{ color }} />;
  }
  return <Icon width={size} height={size} style={{ color }} />;
}
