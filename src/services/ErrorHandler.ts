import { Message, MessageType } from "../types";

export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  public static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * 处理一般错误
   */
  public handleError(error: Error, context: string): void {
    console.error(`[${context}] Error:`, error);
    // 可以添加日志记录或其他处理
  }

  /**
   * 处理用户友好的错误消息
   */
  public handleUserError(error: Error, context: string, userMessage?: string): string {
    const message = userMessage || error.message || '发生未知错误';
    console.error(`[${context}] User Error:`, error);
    
    // 显示用户友好的错误消息
    this.showUserMessage(message, 'error');
    
    return message;
  }

  /**
   * 显示用户消息
   */
  public showUserMessage(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info'): void {
    // 发送消息到popup显示
    try {
      chrome.runtime.sendMessage({
        type: 'SHOW_TOAST' as MessageType,
        data: { message, type }
      } as Message);
    } catch (e) {
      // 如果无法发送消息，直接console输出
      console.log(`[Toast] ${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * 处理异步操作错误
   */
  public async handleAsyncError<T>(
    operation: () => Promise<T>, 
    context: string, 
    fallbackValue?: T
  ): Promise<T | undefined> {
    try {
      return await operation();
    } catch (error) {
      this.handleError(error as Error, context);
      return fallbackValue;
    }
  }

  /**
   * 处理可恢复的错误
   */
  public async handleRecoverableError<T>(
    operation: () => Promise<T>,
    recovery: () => Promise<T>,
    context: string,
    maxRetries = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    // 尝试原始操作
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        console.warn(`[${context}] Attempt ${i + 1} failed:`, error);
        
        // 等待一段时间再重试
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    
    // 尝试恢复操作
    try {
      this.showUserMessage('正在尝试恢复操作...', 'warning');
      return await recovery();
    } catch (recoveryError) {
      // 恢复也失败了
      const errorMessage = `操作失败且无法恢复: ${lastError?.message || '未知错误'}`;
      this.handleUserError(new Error(errorMessage), context);
      throw new Error(errorMessage);
    }
  }
}

export default ErrorHandler;