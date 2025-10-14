import { RequestRecord, FilterOptions } from '../types';
import { DomainDetector, DomainInfo } from './DomainDetector';

export interface ApiInfo {
  title: string;
  description: string;
  version: string;
  serverUrl: string;
  contact?: {
    name?: string;
    email?: string;
    url?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

export interface GenerationOptions {
  includeStats: boolean;
  includeTimestamp: boolean;
  customTitle?: string;
  customDescription?: string;
  customVersion?: string;
  filterOptions?: FilterOptions;
}

export class AutoInfoGenerator {
  private static instance: AutoInfoGenerator;
  private domainDetector: DomainDetector;

  private constructor() {
    this.domainDetector = DomainDetector.getInstance();
  }

  public static getInstance(): AutoInfoGenerator {
    if (!AutoInfoGenerator.instance) {
      AutoInfoGenerator.instance = new AutoInfoGenerator();
    }
    return AutoInfoGenerator.instance;
  }

  /**
   * 生成完整的API信息
   */
  public generateApiInfo(
    records: RequestRecord[], 
    filterOptions?: FilterOptions,
    options: GenerationOptions = { includeStats: true, includeTimestamp: true }
  ): ApiInfo {
    const domains = this.domainDetector.detectDomains(records, filterOptions);
    const primaryDomain = domains.length > 0 ? domains[0] : null;
    const domainStats = this.domainDetector.getDomainStats(records, filterOptions);

    return {
      title: this.generateTitle(primaryDomain, domainStats, options),
      description: this.generateDescription(records, domainStats, options),
      version: this.generateVersion(options),
      serverUrl: this.generateServerUrl(primaryDomain, filterOptions),
      contact: this.generateContact(),
      license: this.generateLicense()
    };
  }

  /**
   * 为特定域名生成API信息
   */
  public generateApiInfoForDomain(
    domain: string,
    records: RequestRecord[],
    options: GenerationOptions = { includeStats: true, includeTimestamp: true }
  ): ApiInfo {
    const domainRecords = records.filter(record => {
      try {
        const url = new URL(record.url);
        return url.hostname === domain;
      } catch {
        return false;
      }
    });

    const domainInfo = this.domainDetector.getDomainInfo(domain);
    
    return {
      title: this.generateTitleForDomain(domain, options),
      description: this.generateDescriptionForDomain(domain, domainRecords, options),
      version: this.generateVersion(options),
      serverUrl: this.domainDetector.generateServerUrl(domain, domainInfo?.protocol),
      contact: this.generateContact(),
      license: this.generateLicense()
    };
  }

  /**
   * 生成API标题
   */
  private generateTitle(
    primaryDomain: DomainInfo | null, 
    domainStats: any,
    options: GenerationOptions
  ): string {
    if (options.customTitle) {
      return options.customTitle;
    }

    if (primaryDomain) {
      const cleanDomain = this.cleanDomainName(primaryDomain.domain);
      const baseName = this.extractServiceName(cleanDomain);
      
      if (domainStats.totalDomains > 1) {
        return `${baseName} API (${domainStats.totalDomains} services)`;
      } else {
        return `${baseName} API`;
      }
    }

    return 'Recorded API Specification';
  }

  /**
   * 为特定域名生成标题
   */
  private generateTitleForDomain(domain: string, options: GenerationOptions): string {
    // 如果选项中有自定义标题，使用自定义标题
    if (options.customTitle) {
      return options.customTitle;
    }
    
    // 否则使用检测到的域名
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return `${cleanDomain} API`;
  }

  /**
   * 生成API描述
   */
  private generateDescription(
    records: RequestRecord[], 
    domainStats: any,
    options: GenerationOptions
  ): string {
    if (options.customDescription) {
      return options.customDescription;
    }

    const parts: string[] = [];
    
    // 基础描述
    parts.push('API specification automatically generated from recorded HTTP requests.');

    if (options.includeStats) {
      // 统计信息
      const methods = new Set(records.map(r => r.method));
      const statusCodes = new Set(records.map(r => r.responseStatus));
      
      parts.push(`\n\n**Statistics:**`);
      parts.push(`- Total endpoints: ${records.length}`);
      parts.push(`- HTTP methods: ${Array.from(methods).join(', ')}`);
      parts.push(`- Response codes: ${Array.from(statusCodes).sort().join(', ')}`);
      
      if (domainStats.totalDomains > 1) {
        parts.push(`- Services: ${domainStats.totalDomains}`);
      }
    }

    if (options.includeTimestamp) {
      const now = new Date();
      parts.push(`\n\n*Generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}*`);
    }

    return parts.join('');
  }

  /**
   * 为特定域名生成描述
   */
  private generateDescriptionForDomain(
    domain: string,
    records: RequestRecord[],
    options: GenerationOptions
  ): string {
    if (options.customDescription) {
      return options.customDescription;
    }

    const parts: string[] = [];
    const cleanDomain = this.cleanDomainName(domain);
    const serviceName = this.extractServiceName(cleanDomain);
    
    parts.push(`API specification for ${serviceName} service, automatically generated from recorded HTTP requests.`);

    if (options.includeStats && records.length > 0) {
      const methods = new Set(records.map(r => r.method));
      const statusCodes = new Set(records.map(r => r.responseStatus));
      const paths = new Set(records.map(r => {
        try {
          return new URL(r.url).pathname;
        } catch {
          return '/';
        }
      }));
      
      parts.push(`\n\n**Statistics:**`);
      parts.push(`- Total endpoints: ${records.length}`);
      parts.push(`- Unique paths: ${paths.size}`);
      parts.push(`- HTTP methods: ${Array.from(methods).join(', ')}`);
      parts.push(`- Response codes: ${Array.from(statusCodes).sort().join(', ')}`);
    }

    if (options.includeTimestamp) {
      const now = new Date();
      parts.push(`\n\n*Generated on ${now.toLocaleDateString()} at ${now.toLocaleTimeString()}*`);
    }

    return parts.join('');
  }

  /**
   * 生成版本号
   */
  private generateVersion(options: GenerationOptions): string {
    if (options.customVersion) {
      return options.customVersion;
    }

    // 使用当前日期生成版本号
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    
    return `${year}.${month}.${day}`;
  }

  /**
   * 生成服务器URL
   */
  private generateServerUrl(primaryDomain: DomainInfo | null, filterOptions?: FilterOptions): string {
    // 优先使用过滤器中的域名
    if (filterOptions && filterOptions.domains && filterOptions.domains.length > 0) {
      const filterDomain = filterOptions.domains[0];
      const cleanDomain = filterDomain.startsWith('*.') ? filterDomain.substring(2) : filterDomain;
      return `https://${cleanDomain}`;
    }

    // 使用检测到的主域名
    if (primaryDomain) {
      return this.domainDetector.generateServerUrl(primaryDomain.domain, primaryDomain.protocol);
    }

    // 默认值
    return 'https://api.example.com';
  }

  /**
   * 生成联系信息
   */
  private generateContact(): { name: string; email: string } {
    return {
      name: 'API Team',
      email: 'api@example.com'
    };
  }

  /**
   * 生成许可证信息
   */
  private generateLicense(): { name: string; url: string } {
    return {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    };
  }

  /**
   * 清理域名（移除www等前缀）
   */
  private cleanDomainName(domain: string): string {
    return domain
      .replace(/^www\./, '')
      .replace(/^api\./, '')
      .replace(/^m\./, '');
  }

  /**
   * 从域名提取服务名称
   */
  private extractServiceName(domain: string): string {
    // 移除顶级域名
    const parts = domain.split('.');
    if (parts.length > 1) {
      // 取主域名部分
      const mainPart = parts[parts.length - 2];
      
      // 首字母大写
      return mainPart.charAt(0).toUpperCase() + mainPart.slice(1);
    }
    
    return domain.charAt(0).toUpperCase() + domain.slice(1);
  }

  /**
   * 生成文件名安全的字符串
   */
  public generateSafeFileName(domain: string, format: string, timestamp?: Date): string {
    const cleanDomain = domain
      .replace(/[^a-zA-Z0-9.-]/g, '-')  // 替换特殊字符为连字符
      .replace(/^-+|-+$/g, '')         // 移除开头和结尾的连字符
      .replace(/-+/g, '-');            // 合并多个连字符

    const time = timestamp || new Date();
    const timeStr = time.toISOString()
      .replace(/[:.]/g, '')
      .replace('T', '-')
      .substring(0, 15); // YYYYMMDD-HHMMSS

    return `api-${cleanDomain}-${timeStr}.${format}`;
  }

  /**
   * 验证生成的API信息
   */
  public validateApiInfo(apiInfo: ApiInfo): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!apiInfo.title || apiInfo.title.trim().length === 0) {
      errors.push('API title is required');
    }

    if (!apiInfo.version || apiInfo.version.trim().length === 0) {
      errors.push('API version is required');
    }

    if (!apiInfo.serverUrl || apiInfo.serverUrl.trim().length === 0) {
      errors.push('Server URL is required');
    } else {
      try {
        new URL(apiInfo.serverUrl);
      } catch {
        errors.push('Server URL is not valid');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default AutoInfoGenerator;