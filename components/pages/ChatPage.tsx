import type { ComponentProps } from "react";
import { ChatResult } from "../sparks/ChatResult";

export type ChatPageProps = ComponentProps<typeof ChatResult>;

export function ChatPage(props: ChatPageProps) {
  return <ChatResult {...props} />;
}
