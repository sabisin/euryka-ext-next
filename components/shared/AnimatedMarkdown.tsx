import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { repairMarkdownForDisplay } from "../../lib/markdown";

interface Props {
  content: string;
}

export function AnimatedMarkdown({ content }: Props) {
  if (!content.trim()) {
    return <p className="text-sm text-muted-foreground">No content to display.</p>;
  }

  const repairedContent = repairMarkdownForDisplay(content);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="prose prose-sm max-w-none text-foreground/80"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{repairedContent}</ReactMarkdown>
    </motion.div>
  );
}
