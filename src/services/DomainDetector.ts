import { RequestRecord, FilterOptions } from '../types';

export interface DomainInfo {
  domain: string;
  recordCount: number;
  isFiltered: boolean;
  priority: number;
  protocol: string;
  firstSeen: number;
  lastSeen: number;
}

export interface DomainStats {
  totalDomains: number;
  filteredDomains: number;
  topDomain: string | null;
  recordsByDomain: Map<string, number>;
}

export class DomainDetector {
  private static instance: DomainDetector;
  private domainCache: Map<string, DomainInfo> = new Map();
  private lastCacheUpdate: number = 0;
  private cacheValidityMs: number = 30000; // 30秒缓存有效期

  private constructor() {}

  public static getInstance(): DomainDetector {
    if (!DomainDetector.instance) {
      DomainDetector.instance = new DomainDetector();
    }
    return DomainDetector.instance;
  }

  /**
   * 检测和分析记录中的域名
   */
  public detectDomains(records: RequestRecord[], filterOptions?: FilterOptions): DomainInfo[] {
    // 先从记录中提取所有域名
    this.extractDomainsFromRecords(records, filterOptions);
    
    // 获取排序后的域名列表
    const sortedDomains = this.getSortedDomains();
    
    // 如果有首选域名（来自过滤器），将其移到前面
    if (filterOptions?.domains && filterOptions.domains.length > 0) {
      const preferredDomains = filterOptions.domains;
      sortedDomains.sort((a, b) => {
        const aIndex = preferredDomains.indexOf(a.domain);
        const bIndex = preferredDomains.indexOf(b.domain);
        
        // 如果a是首选域名，b不是，则a排在前面
        if (aIndex !== -1 && bIndex === -1) return -1;
        // 如果b是首选域名，a不是，则b排在前面
        if (bIndex !== -1 && aIndex === -1) return 1;
        // 如果都是或都不是首选域名，保持原有排序
        return aIndex !== -1 && bIndex !== -1 ? aIndex - bIndex : 0;
      });
    }

    return sortedDomains;
  }

  /**
   * 获取默认域名（优先级最高的域名）
   */
  public getDefaultDomain(records: RequestRecord[], filterOptions?: FilterOptions): string | null {
    const domains = this.detectDomains(records, filterOptions);
    return domains.length > 0 ? domains[0].domain : null;
  }

  /**
   * 获取域名统计信息
   */
  public getDomainStats(records: RequestRecord[], filterOptions?: FilterOptions): DomainStats {
    const domains = this.detectDomains(records, filterOptions);
    const recordsByDomain = new Map<string, number>();
    
    domains.forEach(domain => {
      recordsByDomain.set(domain.domain, domain.recordCount);
    });

    return {
      totalDomains: domains.length,
      filteredDomains: domains.filter(d => d.isFiltered).length,
      topDomain: domains.length > 0 ? domains[0].domain : null,
      recordsByDomain
    };
  }

  /**
   * 按域名分组记录
   */
  public groupRecordsByDomain(records: RequestRecord[]): Map<string, RequestRecord[]> {
    const groups = new Map<string, RequestRecord[]>();

    records.forEach(record => {
      try {
        const url = new URL(record.url);
        const domain = url.hostname;

        if (!groups.has(domain)) {
          groups.set(domain, []);
        }
        groups.get(domain)!.push(record);
      } catch (error) {
        // 对于无效URL，归类到"unknown"域名
        if (!groups.has('unknown')) {
          groups.set('unknown', []);
        }
        groups.get('unknown')!.push(record);
      }
    });

    return groups;
  }

  /**
   * 生成域名的服务器URL
   */
  public generateServerUrl(domain: string, protocol?: string): string {
    const finalProtocol = protocol || 'https';
    
    // 移除www前缀
    const cleanDomain = domain.replace(/^www\./, '');
    
    return `${finalProtocol}://${cleanDomain}`;
  }

  /**
   * 验证域名格式
   */
  public isValidDomain(domain: string): boolean {
    try {
      // 简单的域名格式验证
      const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
      return domainRegex.test(domain) && domain.length <= 253;
    } catch {
      return false;
    }
  }

  /**
   * 清除缓存
   */
  public clearCache(): void {
    this.domainCache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * 获取域名的详细信息
   */
  public getDomainInfo(domain: string): DomainInfo | null {
    return this.domainCache.get(domain) || null;
  }

  /**
   * 检查域名是否在过滤器中
   */
  private isDomainFiltered(domain: string, filterOptions?: FilterOptions): boolean {
    if (!filterOptions || !filterOptions.domains || filterOptions.domains.length === 0) {
      return false;
    }

    return filterOptions.domains.some(filterDomain => {
      // 支持通配符匹配
      if (filterDomain.startsWith('*.')) {
        const baseDomain = filterDomain.substring(2);
        return domain.endsWith(baseDomain);
      }
      return domain.includes(filterDomain);
    });
  }

  /**
   * 计算域名优先级
   */
  private calculateDomainPriority(
    domain: string, 
    stats: { count: number; firstSeen: number; lastSeen: number }, 
    isFiltered: boolean
  ): number {
    let priority = 0;

    // 过滤域名优先级最高
    if (isFiltered) {
      priority += 1000;
    }

    // 记录数量权重（最多500分）
    priority += Math.min(stats.count * 10, 500);

    // 最近活跃度权重（最多200分）
    const now = Date.now();
    const daysSinceLastSeen = (now - stats.lastSeen) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 200 - daysSinceLastSeen * 10);
    priority += recencyScore;

    // 域名长度权重（短域名优先，最多50分）
    const lengthScore = Math.max(0, 50 - domain.length);
    priority += lengthScore;

    // 常见域名后缀权重
    if (domain.endsWith('.com') || domain.endsWith('.org') || domain.endsWith('.net')) {
      priority += 20;
    }

    // 避免本地域名
    if (domain.includes('localhost') || domain.includes('127.0.0.1') || domain.includes('0.0.0.0')) {
      priority -= 100;
    }

    return Math.round(priority);
  }

  /**
   * 获取排序后的域名列表
   */
  private getSortedDomains(): DomainInfo[] {
    // 按记录数降序排列
    return [...this.domainCache.values()]
      .sort((a, b) => b.recordCount - a.recordCount);
  }

  /**
   * 从记录中提取所有域名
   */
  private extractDomainsFromRecords(records: RequestRecord[], filterOptions?: FilterOptions): void {
    const now = Date.now();
    
    // 检查缓存是否有效
    if (this.domainCache.size > 0 && (now - this.lastCacheUpdate) < this.cacheValidityMs) {
      return;
    }

    // 清空缓存并重新分析
    this.domainCache.clear();
    const domainStats = new Map<string, {
      count: number;
      firstSeen: number;
      lastSeen: number;
      protocol: string;
    }>();

    // 分析所有记录
    records.forEach(record => {
      try {
        const url = new URL(record.url);
        const domain = url.hostname;
        const protocol = url.protocol.replace(':', '');

        const existing = domainStats.get(domain);
        if (existing) {
          existing.count++;
          existing.lastSeen = Math.max(existing.lastSeen, record.timestamp);
          existing.firstSeen = Math.min(existing.firstSeen, record.timestamp);
        } else {
          domainStats.set(domain, {
            count: 1,
            firstSeen: record.timestamp,
            lastSeen: record.timestamp,
            protocol
          });
        }
      } catch (error) {
        console.warn('Failed to parse URL:', record.url, error);
      }
    });

    // 转换为DomainInfo对象
    domainStats.forEach((stats, domain) => {
      const isFiltered = this.isDomainFiltered(domain, filterOptions);
      const priority = this.calculateDomainPriority(domain, stats, isFiltered);

      const domainInfo: DomainInfo = {
        domain,
        recordCount: stats.count,
        isFiltered,
        priority,
        protocol: stats.protocol,
        firstSeen: stats.firstSeen,
        lastSeen: stats.lastSeen
      };

      this.domainCache.set(domain, domainInfo);
    });

    this.lastCacheUpdate = now;
  }
}

export default DomainDetector;