import { FilterOptions, RequestRecord } from '../types';

export class RequestFilter {
  // 只保留必要的静态资源扩展名，用于严格过滤
  private obviousStaticExtensions = new Set([
    'jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'ico', 'bmp',
    'css', 'js', 'woff', 'woff2', 'ttf', 'eot',
    'mp4', 'mp3', 'avi', 'mov', 'pdf'
  ]);

  shouldRecord(
    details: chrome.webRequest.WebRequestBodyDetails, 
    options: FilterOptions
  ): boolean {
    const url = new URL(details.url);

    // 基础安全检查 - 第一优先级
    if (this.isChromeExtensionRequest(details.url) || 
        this.isDataOrBlobUrl(details.url)) {
      return false;
    }

    // 域名过滤 - 如果指定了域名，只录制指定域名
    if (options.domains.length > 0) {
      const matchesDomain = options.domains.some(domain => 
        this.matchesDomain(url.hostname, domain)
      );
      if (!matchesDomain) return false;
    }

    // 放宽的静态资源过滤 - 只过滤明显的静态文件
    if (options.excludeStatic && this.isObviousStaticResource(details.url)) {
      return false;
    }

    // 放宽 AJAX 过滤 - 只在特定情况下才过滤
    if (options.ajaxOnly && this.isObviousNonApiRequest(details)) {
      return false;
    }

    return true;
  }

  shouldSaveRecord(record: RequestRecord, options: FilterOptions): boolean {
    // 无响应状态的请求不保存
    if (!record.responseStatus) {
      return false;
    }

    // 检查状态码过滤 - 只在指定了状态码时才过滤
    if (options.statusCodes.length > 0) {
      if (!options.statusCodes.includes(record.responseStatus)) {
        return false;
      }
    }

    // 检查响应时间
    if (record.responseTime < options.minResponseTime) {
      return false;
    }

    // 过滤预检请求（CORS）
    if (this.isPreflightRequest(record)) {
      return false;
    }

    // 过滤明显的非 API 请求（在最终阶段）
    if (this.isObviousNonApiResponse(record)) {
      return false;
    }

    return true;
  }

  private matchesDomain(hostname: string, pattern: string): boolean {
    // 支持通配符匹配
    if (pattern.startsWith('*.')) {
      const domain = pattern.substring(2);
      return hostname === domain || hostname.endsWith('.' + domain);
    }
    
    // 精确匹配
    return hostname === pattern;
  }

  // 只过滤明显的静态资源
  private isObviousStaticResource(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();
      
      // 检查文件扩展名
      const extension = this.getFileExtension(pathname);
      if (extension && this.obviousStaticExtensions.has(extension)) {
        return true;
      }

      // 过滤明显的静态资源路径
      const obviousStaticPatterns = [
        /\/favicon\.ico$/i,
        /\/robots\.txt$/i,
        /\/_next\/static\//i,
        /\/static\/.*\.(css|js)$/i
      ];
      
      return obviousStaticPatterns.some(pattern => 
        pattern.test(url) || pattern.test(pathname)
      );
    } catch {
      return false;
    }
  }

  private getFileExtension(pathname: string): string | null {
    const lastDot = pathname.lastIndexOf('.');
    const lastSlash = pathname.lastIndexOf('/');
    
    if (lastDot > lastSlash && lastDot !== -1) {
      return pathname.substring(lastDot + 1).split('?')[0];
    }
    
    return null;
  }

  // 放宽的 AJAX 检查 - 只过滤明显的非 API 请求
  private isObviousNonApiRequest(details: chrome.webRequest.WebRequestBodyDetails): boolean {
    // 主文档请求（页面导航）
    if (details.type === 'main_frame') {
      return true;
    }
    
    // 子框架请求
    if (details.type === 'sub_frame') {
      return true;
    }
    
    // 图片请求
    if (details.type === 'image') {
      return true;
    }
    
    // 显式的样式表和脚本请求
    if (details.type === 'stylesheet' || details.type === 'script') {
      return true;
    }
    
    return false;
  }

  private isChromeExtensionRequest(url: string): boolean {
    return url.startsWith('chrome-extension://') || 
           url.startsWith('moz-extension://') ||
           url.startsWith('webkit-extension://');
  }

  private isDataOrBlobUrl(url: string): boolean {
    return url.startsWith('data:') || url.startsWith('blob:');
  }

  private isPreflightRequest(record: RequestRecord): boolean {
    return record.method === 'OPTIONS' && 
           record.responseStatus === 200 &&
           !!record.responseHeaders['access-control-allow-origin'];
  }

  // 判断是否为明显的非 API 响应
  private isObviousNonApiResponse(record: RequestRecord): boolean {
    const contentType = record.responseHeaders['content-type'] || '';
    
    // HTML 页面
    if (contentType.includes('text/html')) {
      return true;
    }
    
    // CSS 文件
    if (contentType.includes('text/css')) {
      return true;
    }
    
    // JavaScript 文件（不是 JSONP）
    if (contentType.includes('text/javascript') || 
        contentType.includes('application/javascript')) {
      // 检查是否可能是 JSONP
      if (!record.url.includes('callback=') && !record.url.includes('jsonp=')) {
        return true;
      }
    }
    
    // 图片文件
    if (contentType.includes('image/')) {
      return true;
    }
    
    // 其他媒体文件
    if (contentType.includes('video/') || 
        contentType.includes('audio/') || 
        contentType.includes('application/pdf')) {
      return true;
    }
    
    return false;
  }

  // 去重相关方法
  generateUrlSignature(url: string): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // 参数化数字和UUID
      pathname = pathname.replace(/\/\d+/g, '/{id}');
      pathname = pathname.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
      
      // 构建签名
      const queryKeys = Array.from(urlObj.searchParams.keys()).sort().join(',');
      
      return `${urlObj.hostname}${pathname}?${queryKeys}`;
    } catch {
      return url;
    }
  }

  isDuplicateRequest(record: RequestRecord, existingRecords: RequestRecord[]): boolean {
    const signature = this.generateUrlSignature(record.url);
    
    return existingRecords.some(existing => {
      if (existing.method !== record.method) return false;
      
      const existingSignature = this.generateUrlSignature(existing.url);
      return signature === existingSignature;
    });
  }

  // 合并重复请求的参数
  mergeRequestParameters(records: RequestRecord[]): RequestRecord {
    if (records.length === 0) throw new Error('No records to merge');
    if (records.length === 1) return records[0];

    // 选择最完整的记录作为基础
    const baseRecord = records.reduce((prev, current) => {
      const prevParamCount = this.getParameterCount(prev);
      const currentParamCount = this.getParameterCount(current);
      return currentParamCount > prevParamCount ? current : prev;
    });

    return {
      ...baseRecord,
      timestamp: Math.max(...records.map(r => r.timestamp)) // 使用最新时间戳
    };
  }

  private getParameterCount(record: RequestRecord): number {
    let count = 0;
    
    try {
      const url = new URL(record.url);
      count += url.searchParams.size;
    } catch {}

    if (record.requestBody) {
      if (typeof record.requestBody === 'object') {
        count += Object.keys(record.requestBody).length;
      }
    }

    return count;
  }
}