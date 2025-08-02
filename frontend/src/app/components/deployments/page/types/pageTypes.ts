// Use the deployment type from the backend
export type DeploymentType =
  | "chat"
  | "code"
  | "mcq"
  | "prompt"
  | "page"
  | "video";

export interface PageInfo {
  page_number: number;
  deployment_id: string;
  deployment_type: DeploymentType;
  has_chat: boolean;
}

export interface PageListResponse {
  main_deployment_id: string;
  page_count: number;
  pages: PageInfo[];
}

export interface PageDeploymentInfo {
  page_number: number;
  deployment_id: string;
  deployment_type: DeploymentType;
  has_chat: boolean;
  chat_url: string;
  parent_deployment_id: string;
}

export interface PageChatRequest {
  message: string;
  page_number: number;
  history: string[][];
  conversation_id?: number;
}

export interface PageInterfaceProps {
  deploymentId: string;
  deploymentName: string;
  onBack?: () => void;
}
