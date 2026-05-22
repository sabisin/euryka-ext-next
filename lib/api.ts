import type {
  Brand,
  CreateLinkedInContactResult,
  CreateLinkedInContactResponse,
  ImageAnalysisResult,
  Project,
  Session,
  SessionsPage,
  Spark,
  SparkGroup,
  SparkResult,
  UploadUrlResponse,
  Workspace,
} from "./types";

const BASE_URL = import.meta.env.WXT_BASE_URL as string;

async function request<T>(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw res;
  return res.json() as Promise<T>;
}

export async function fetchUser(token: string): Promise<{ workspaces: Workspace[] }> {
  return request("/api/user", token);
}

// API returns sparks already grouped: { sparks: [{ title, description, sparks: [] }, …] }
export async function fetchSparks(token: string): Promise<{ sparks: SparkGroup[] }> {
  return request("/api/sparks/extension", token);
}

export async function fetchBrands(
  token: string,
  wsId: string,
  count = 233
): Promise<{ brands: Brand[] }> {
  return request(`/api/ws/${wsId}/brands`, token, {
    method: "POST",
    body: JSON.stringify({ count }),
  });
}

export async function fetchProjects(
  token: string,
  wsId: string,
  count = 233
): Promise<{ projects: Project[] }> {
  return request(`/api/ws/${wsId}/projects`, token, {
    method: "POST",
    body: JSON.stringify({ count }),
  });
}

export async function fetchSessions(
  token: string,
  wsId: string,
  lastVisibleId?: string
): Promise<SessionsPage> {
  return request(`/api/ws/${wsId}/extension/sessions`, token, {
    method: "POST",
    body: JSON.stringify({ lastVisibleId: lastVisibleId ?? "" }),
  });
}

export async function runSpark(
  token: string,
  wsId: string,
  sparkId: string,
  context: {
    pageUrl?: string;
    pageContent?: string;
    selectedText?: string;
    brandId?: string;
    projectId?: string;
  }
): Promise<SparkResult> {
  // Body shape matches the original extension: page is a nested object with
  // url + content, selected text is "text", and brand/project are strings
  // (empty string when unset, not undefined).
  return request(`/api/ws/${wsId}/extension/sparks/${sparkId}`, token, {
    method: "POST",
    body: JSON.stringify({
      page: {
        url: context.pageUrl ?? "",
        content: context.pageContent ?? "",
      },
      text: context.selectedText ?? "",
      brandId: context.brandId ?? "",
      projectId: context.projectId ?? "",
    }),
  });
}

export async function analyseImage(
  token: string,
  wsId: string,
  payload: {
    image: string;
    page?: string;
    pageContent?: string;
    brandId?: string;
    projectId?: string;
  }
): Promise<ImageAnalysisResult> {
  // Body shape: image is a nested object {url}, page (optional) is {url, content}.
  const body: Record<string, unknown> = {
    image: { url: payload.image },
  };
  if (payload.page) {
    body.page = {
      url: payload.page,
      ...(payload.pageContent ? { content: payload.pageContent } : {}),
    };
  }
  if (payload.brandId) body.brandId = payload.brandId;
  if (payload.projectId) body.projectId = payload.projectId;

  return request(`/api/ws/${wsId}/extension/sparks/image`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function generateUploadUrl(
  token: string,
  wsId: string,
  fileName: string
): Promise<UploadUrlResponse> {
  return request(`/api/ws/${wsId}/extension/uploads`, token, {
    method: "POST",
    body: JSON.stringify({ fileName }),
  });
}

export async function uploadToGcs(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) throw new Error("GCS upload failed");
}

export async function createLinkedInContact(
  token: string,
  wsId: string,
  payload: {
    linkedinUrl: string;
    brandId?: string;
    projectId?: string;
    name?: string;
  },
): Promise<CreateLinkedInContactResult> {
  const body: Record<string, unknown> = { linkedinUrl: payload.linkedinUrl };
  if (payload.brandId) body.brandId = payload.brandId;
  if (payload.projectId) body.projectId = payload.projectId;
  if (payload.name) body.name = payload.name;

  const res = await fetch(`${BASE_URL}/api/ws/${encodeURIComponent(wsId)}/extension/sparks/linkedIn`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text().catch(() => "");
  const responseBody = responseText ? parseJson<CreateLinkedInContactResponse>(responseText) : undefined;

  if (!res.ok || !responseBody?.url) {
    return {
      ok: false,
      status: res.status,
      errorText: responseText || res.statusText,
    };
  }

  return {
    ok: true,
    status: res.status,
    contact: responseBody,
  };
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

export type WorkspaceData = {
  workspaces: Workspace[];
  brands: Brand[];
  projects: Project[];
};

export async function fetchWorkspaceData(
  token: string,
  wsId: string
): Promise<WorkspaceData> {
  const [userRes, brandsRes, projectsRes] = await Promise.all([
    fetchUser(token),
    fetchBrands(token, wsId),
    fetchProjects(token, wsId),
  ]);
  return {
    workspaces: userRes.workspaces,
    brands: brandsRes.brands,
    projects: projectsRes.projects,
  };
}
