export type ProviderId = 'gemini' | 'openai' | 'groq' | 'openrouter' | 'ollama' | 'aetheria-local';

export type ErrorClassification =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'QUOTA_ERROR'
  | 'TEMPORARY_PROVIDER_ERROR'
  | 'NETWORK_ERROR'
  | 'MODEL_COMPATIBILITY_ERROR'
  | 'APPLICATION_ERROR'
  | 'UNKNOWN_ERROR';

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AttachmentPayload {
  name: string;
  type: string;
  size?: string;
  dataUrl?: string; // base64 if available
}

export interface ProviderCapabilities {
  streaming: boolean;
  vision: boolean;
  systemInstruction: boolean;
  maxContextTokens?: number;
  toolCalling?: boolean;
}

export interface HealthCheckResult {
  providerId: ProviderId;
  model: string;
  status: 'operational' | 'degraded' | 'failed' | 'scope_restricted' | 'untested';
  latencyMs: number;
  message: string;
  errorClassification?: ErrorClassification;
  capabilities: ProviderCapabilities;
  timestamp: number;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onMetadata?: (meta: {
    provider: ProviderId;
    model: string;
    latencyMs: number;
    fallbackTriggered?: boolean;
    originalProvider?: ProviderId;
    reason?: string;
    modelTier?: 'instant' | 'standard' | 'deep';
    complexityClassification?: string;
  }) => void;
  onError: (err: Error, classification: ErrorClassification) => void;
  onComplete: () => void;
}

export interface ChatStreamChunk {
  requestId: string;
  conversationId: string;
  type?: 'metadata' | 'token' | 'error' | 'done';
  text?: string;
  model?: string;
  provider?: string;
  error?: string;
  errorCode?: string;
  done?: boolean;
  fallbackTriggered?: boolean;
  latencyMs?: number;
}

export interface ModelLatencyMetric {
  model: string;
  avgLatencyMs: number;
  sampleCount: number;
  speedBadge: string;
  tier: 'instant' | 'standard' | 'deep';
  description: string;
}

export interface ChatRequestOptions {
  model?: string;
  temperature?: number;
  tone?: string;
  attachments?: AttachmentPayload[];
  customKey?: string;
  customEndpoint?: string;
  signal?: AbortSignal;
  modelRouting?: 'auto' | 'manual';
  speedTier?: 'instant' | 'standard' | 'deep';
}

export interface AetheriaAIProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly defaultModel: string;
  readonly supportedModels: string[];
  readonly capabilities: ProviderCapabilities;
  isConfigured: (customKey?: string) => boolean;
  testConnection: (customKey?: string, customEndpoint?: string, model?: string) => Promise<HealthCheckResult>;
  streamChat: (
    messages: ProviderMessage[],
    options: ChatRequestOptions,
    callbacks: StreamCallbacks
  ) => Promise<void>;
}

export interface GatewayTelemetryEvent {
  id: string;
  timestamp: number;
  provider: ProviderId;
  model: string;
  status: 'success' | 'fallback' | 'failed';
  latencyMs: number;
  tokensStreamed?: number;
  fallbackTo?: ProviderId;
  errorDetails?: string;
  errorClassification?: ErrorClassification;
}

export interface BenchmarkItemResult {
  providerId: ProviderId;
  providerName: string;
  model: string;
  status: 'operational' | 'degraded' | 'failed' | 'unconfigured';
  ttftMs: number;
  totalTimeMs: number;
  tokensCount: number;
  tokensPerSec: number;
  snippet: string;
  error?: string;
}

export interface BenchmarkReport {
  timestamp: number;
  probePrompt: string;
  results: BenchmarkItemResult[];
  fastestProvider: string;
  lowestTtftMs: number;
}
