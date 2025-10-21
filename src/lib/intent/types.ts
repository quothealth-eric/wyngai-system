export interface IntentInput {
  text?: string;
  files?: File[];
  hints?: {
    userClickedUpload?: boolean;
    userClickedChat?: boolean;
  };
}

export interface IntentResult {
  mode: 'CHAT' | 'ANALYZER';
  confidence: number;
  reason: string;
  needsClarification?: boolean;
  clarificationOptions?: Array<{
    label: string;
    value: 'CHAT' | 'ANALYZER';
    description: string;
  }>;
}

export type IntentMode = 'CHAT' | 'ANALYZER'