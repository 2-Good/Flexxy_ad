export interface ActiveRequest {
  requestId: string;
  conversationId: string;
  abortController: AbortController;
  startedAt: number;
}

export class ConversationManager {
  private activeByRequest = new Map<string, ActiveRequest>();
  private activeByConversation = new Map<string, string>(); // conversationId -> requestId
  private processedRequestIds = new Set<string>();
  private readonly maxProcessedIds = 500;

  /**
   * Registers a new incoming chat request.
   * Cancels any ongoing generation for the same conversation so quick successive messages don't collide.
   */
  public registerRequest(requestId: string, conversationId: string): { controller: AbortController; isDuplicate: boolean } {
    if (this.processedRequestIds.has(requestId) || this.activeByRequest.has(requestId)) {
      return { controller: new AbortController(), isDuplicate: true };
    }

    // Cancel existing in-flight request for this conversation if any
    const existingRequestId = this.activeByConversation.get(conversationId);
    if (existingRequestId) {
      const existing = this.activeByRequest.get(existingRequestId);
      if (existing) {
        existing.abortController.abort();
        this.activeByRequest.delete(existingRequestId);
      }
    }

    const abortController = new AbortController();
    const activeReq: ActiveRequest = {
      requestId,
      conversationId,
      abortController,
      startedAt: Date.now(),
    };

    this.activeByRequest.set(requestId, activeReq);
    this.activeByConversation.set(conversationId, requestId);

    // Track processed IDs for deduplication
    this.processedRequestIds.add(requestId);
    if (this.processedRequestIds.size > this.maxProcessedIds) {
      const first = this.processedRequestIds.values().next().value;
      if (first) this.processedRequestIds.delete(first);
    }

    return { controller: abortController, isDuplicate: false };
  }

  /**
   * Completes or cleans up an active request.
   */
  public finishRequest(requestId: string): void {
    const active = this.activeByRequest.get(requestId);
    if (active) {
      if (this.activeByConversation.get(active.conversationId) === requestId) {
        this.activeByConversation.delete(active.conversationId);
      }
      this.activeByRequest.delete(requestId);
    }
  }

  /**
   * Aborts an active request by requestId or conversationId.
   */
  public abortRequest(requestId: string): void {
    const active = this.activeByRequest.get(requestId);
    if (active) {
      active.abortController.abort();
      this.finishRequest(requestId);
    }
  }

  public isRequestActive(requestId: string): boolean {
    return this.activeByRequest.has(requestId);
  }
}

export const conversationManager = new ConversationManager();
