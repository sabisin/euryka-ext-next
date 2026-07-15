import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { analyseImage as apiAnalyseImage } from "../lib/api";
import { getValidToken, runWithTokenRetry } from "../lib/auth";
import { debugLog } from "../lib/debug";
import { uploadFileWithRetry } from "../lib/image-utils";
import { describeMarkdownContent, repairFlattenedMarkdown } from "../lib/markdown-diagnostics";
import { sendMessage } from "../lib/messaging";
import { LINKEDIN_PROSPECTOR_SPARK, buildFallbackProspect } from "../lib/prospector";
import { pageTextStorage, pageUrlStorage, selectedTextStorage } from "../lib/storage";
import type {
  DragImageResult,
  LinkedInProspectData,
  Spark,
  UserPrefs,
  Workspace,
} from "../lib/types";
import { useUIStore } from "../store/ui";

const DEFAULT_USER_PREFS: UserPrefs = {
  showFloatingButton: true,
  actionButtonY: 0.6,
  lastUsedSpark: null,
  lastFive: [],
};

const logWorkspace = debugLog("[Euryka workspace]");
const logSparkResult = debugLog("[Euryka spark result]");

type RunSpark = (input: {
  sparkId: string;
  pageUrl?: string;
  pageContent?: string;
  selectedText?: string;
  brandId?: string;
  projectId?: string;
  workspaceId?: string;
}) => Promise<{ content: string; id: string; page?: { url?: string } }>;

type UseSparkControllerOptions = {
  tabId: number | null;
  currentTabUrl: string | null;
  selectedWorkspaceId: string | null;
  selectedBrandId: string | null;
  selectedProjectId: string | null;
  workspaces: Workspace[];
  runSpark: RunSpark;
  setPrefs: (value: UserPrefs | ((previous: UserPrefs) => UserPrefs)) => Promise<void>;
  stopChat: () => void;
  clearSparkRecommendation: () => void;
};

export function useSparkController({
  tabId,
  currentTabUrl,
  selectedWorkspaceId,
  selectedBrandId,
  selectedProjectId,
  workspaces,
  runSpark,
  setPrefs,
  stopChat,
  clearSparkRecommendation,
}: UseSparkControllerOptions) {
  const [prospectorResult, setProspectorResult] = useState<LinkedInProspectData | null>(null);
  const actions = useUIStore(
    useShallow((state) => ({
      setWorkspace: state.setWorkspace,
      setSelectedImageUrl: state.setSelectedImageUrl,
      setShowSparkResult: state.setShowSparkResult,
      setShowChatResult: state.setShowChatResult,
      setIsDragging: state.setIsDragging,
      setLoadingSpark: state.setLoadingSpark,
      setLoadingImage: state.setLoadingImage,
      setImageResult: state.setImageResult,
    }))
  );

  const handleUseSpark = async (spark: Spark) => {
    stopChat();
    clearSparkRecommendation();
    actions.setShowChatResult(false);
    setProspectorResult(null);
    const workspaceId = selectedWorkspaceId ?? workspaces[0]?.id ?? null;
    if (!selectedWorkspaceId && workspaceId) actions.setWorkspace(workspaceId);
    if (!workspaceId) {
      logWorkspace("cannot run spark without workspace", {
        sparkId: spark.id,
        selectedWorkspaceId,
        workspaceCount: workspaces.length,
      });
      return;
    }

    actions.setLoadingSpark(true);
    actions.setShowSparkResult(true, "", undefined, spark);
    let pageUrl = "";
    let pageText = "";
    let selectedText = "";

    if (tabId !== null) {
      const [activeUrl, extractedText, currentSelection] = await Promise.all([
        sendMessage("getTabUrl", { tabId }).catch(() => null),
        sendMessage("extractText", undefined, tabId).catch(() => null),
        sendMessage("getSelectedText", undefined, tabId).catch(() => null),
      ]);
      pageUrl = activeUrl?.url || currentTabUrl || "";
      pageText = extractedText?.text || "";
      selectedText = currentSelection?.text || "";

      if (!pageText || !selectedText) {
        const [storedUrl, storedText, storedSelection] = await Promise.all([
          pageUrlStorage.getValue(),
          pageTextStorage.getValue(),
          selectedTextStorage.getValue(),
        ]);
        if (storedUrl && storedUrl === pageUrl) {
          pageText ||= storedText;
          selectedText ||= storedSelection;
        }
      }
    }

    try {
      const result = await runSpark({
        sparkId: spark.id,
        pageUrl,
        pageContent: pageText,
        selectedText,
        brandId: selectedBrandId ?? undefined,
        projectId: selectedProjectId ?? undefined,
        workspaceId,
      });
      logSparkResult("received API content", {
        sparkId: spark.id,
        sparkTitle: spark.title,
        sessionId: result.id,
        ...describeMarkdownContent(result.content),
      });
      const normalizedResult = repairFlattenedMarkdown(result.content);
      if (normalizedResult.repaired) {
        logSparkResult("repaired flattened markdown", {
          sparkId: spark.id,
          sparkTitle: spark.title,
          ...describeMarkdownContent(normalizedResult.content),
        });
      }
      actions.setShowSparkResult(
        true,
        normalizedResult.content,
        result.id,
        spark,
        result.page?.url ?? pageUrl
      );
      await setPrefs((previous) => ({
        ...DEFAULT_USER_PREFS,
        ...previous,
        lastUsedSpark: spark,
        lastFive: [spark.id, ...(previous?.lastFive ?? []).filter((id) => id !== spark.id)].slice(
          0,
          5
        ),
      }));
    } catch {
      actions.setShowSparkResult(
        true,
        "We couldn't complete the request. Please retry shortly.",
        undefined,
        spark
      );
    } finally {
      actions.setLoadingSpark(false);
    }
  };

  const handleRunProspector = async () => {
    stopChat();
    actions.setShowChatResult(false);
    const initialProspect = buildFallbackProspect(currentTabUrl ?? "", []);
    actions.setLoadingSpark(true);
    setProspectorResult(initialProspect);
    actions.setShowSparkResult(
      true,
      "prospector",
      undefined,
      LINKEDIN_PROSPECTOR_SPARK,
      currentTabUrl ?? undefined
    );

    try {
      const prospect =
        tabId !== null
          ? await sendMessage("getLinkedInProspectData", undefined, tabId)
          : buildFallbackProspect(currentTabUrl ?? "", [
              "Failed to read the current LinkedIn page.",
            ]);
      setProspectorResult(prospect);
      actions.setShowSparkResult(
        true,
        "prospector",
        undefined,
        LINKEDIN_PROSPECTOR_SPARK,
        prospect.pageUrl || currentTabUrl || undefined
      );
    } catch {
      const fallback = buildFallbackProspect(currentTabUrl ?? "", [
        "We couldn't inspect the current LinkedIn page or related entities. Please retry shortly.",
      ]);
      setProspectorResult(fallback);
      actions.setShowSparkResult(
        true,
        "prospector",
        undefined,
        LINKEDIN_PROSPECTOR_SPARK,
        fallback.pageUrl || currentTabUrl || undefined
      );
    } finally {
      actions.setLoadingSpark(false);
    }
  };

  const handleAnalyseImage = async (dragResult: DragImageResult, pageUrlOverride?: string) => {
    if (!selectedWorkspaceId) return;
    stopChat();
    actions.setLoadingImage(true);
    actions.setImageResult(null);

    let pageUrl = pageUrlOverride ?? "";
    let pageText = "";
    if (tabId !== null) {
      const [tabUrl, extracted] = await Promise.all([
        pageUrlOverride
          ? Promise.resolve(null)
          : sendMessage("getTabUrl", { tabId }).catch(() => null),
        sendMessage("extractText", undefined, tabId).catch(() => null),
      ]);
      pageUrl = pageUrlOverride ?? tabUrl?.url ?? "";
      pageText = extracted?.text ?? "";
    }

    try {
      let imageUrl = dragResult.url;
      if (dragResult.source === "filesystem" && dragResult.file) {
        const token = await getValidToken();
        if (!token) throw new Error("Not authenticated");
        const uploaded = await uploadFileWithRetry(token, selectedWorkspaceId, dragResult.file);
        imageUrl = uploaded.imageUrl;
      }

      actions.setSelectedImageUrl(imageUrl);
      const result = await runWithTokenRetry((token) =>
        apiAnalyseImage(token, selectedWorkspaceId, {
          image: imageUrl,
          page: pageUrl,
          pageContent: pageText,
          brandId: selectedBrandId ?? undefined,
          projectId: selectedProjectId ?? undefined,
        })
      );
      actions.setImageResult(result.content, result.id);
    } catch {
      actions.setImageResult(null);
    } finally {
      actions.setLoadingImage(false);
      actions.setIsDragging(false);
    }
  };

  return {
    prospectorResult,
    setProspectorResult,
    handleUseSpark,
    handleRunProspector,
    handleAnalyseImage,
  };
}
