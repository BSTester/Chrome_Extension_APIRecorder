import { RequestRecord } from '../types';
import { DomainDetector, DomainInfo } from './DomainDetector';
import { AutoInfoGenerator, ApiInfo } from './AutoInfoGenerator';
import GroupManager from './GroupManager';


export interface ExportConfig {
  format: 'json' | 'yaml';
  scope: 'all' | 'selected';
  multiDomain: boolean;
  autoFillInfo: boolean;
  domains: DomainInfo[];
  includeExamples: boolean;
  groupByTags: boolean;
}

export interface ExportFile {
  filename: string;
  content: string;
  domain: string;
  recordCount: number;
  size: number;
  apiInfo: ApiInfo;
}

export interface ExportResult {
  success: boolean;
  files: ExportFile[];
  totalSize: number;
  errors?: string[];
  downloadUrl?: string; // ZIP文件的下载URL（如果多个文件）
}

export class MultiFileExporter {
  private static instance: MultiFileExporter;
  private domainDetector: DomainDetector;
  private autoInfoGenerator: AutoInfoGenerator;

  private constructor() {
    this.domainDetector = DomainDetector.getInstance();
    this.autoInfoGenerator = AutoInfoGenerator.getInstance();
  }

  public static getInstance(): MultiFileExporter {
    if (!MultiFileExporter.instance) {
      MultiFileExporter.instance = new MultiFileExporter();
    }
    return MultiFileExporter.instance;
  }

  /**
   * 合并为单一 OpenAPI 3 文件
   * 将各域的 OAS3 文档合并为一个，完全符合 OAS3，且默认无标签时归为“未分组”
   */
  public async exportMergedOpenAPI(
    records: RequestRecord[],
    config: ExportConfig
  ): Promise<ExportResult> {
    try {
      const recordsToExport = config.scope === 'selected'
        ? records.filter(r => config.domains.some(d => this.getRecordDomain(r) === d.domain))
        : records;

      if (recordsToExport.length === 0) {
        return { success: false, files: [], totalSize: 0, errors: ['没有可导出的记录'] };
      }

      const domainGroups = this.domainDetector.groupRecordsByDomain(recordsToExport);

      // 逐域生成 OAS3 文档并合并
      const { OpenAPIExporter } = await import('../exporters/openapi-exporter');
      const exporter = new OpenAPIExporter();
      let mergedDoc: any | null = null;

      for (const [domain, domainRecords] of domainGroups.entries()) {
        const apiInfo = this.autoInfoGenerator.generateApiInfoForDomain(domain, domainRecords);
        const doc = this.generateOpenAPIDocForDomain(domain, domainRecords, apiInfo, config);
        mergedDoc = mergedDoc ? exporter.mergeOpenAPI3(mergedDoc, doc) : doc;
      }

      // 输出单一文件
      const content = config.format === 'json'
        ? JSON.stringify(mergedDoc, null, 2)
        : this.convertToYAML(mergedDoc);

      // 生成 {主域名}-{YYYYMMDD_HHmmss}.ext
      const domains: string[] = [];
      try {
        recordsToExport.forEach(r => {
          try { domains.push(new URL(r.url).hostname); } catch {}
        });
      } catch {}
      const domainCount = new Map<string, number>();
      domains.forEach(d => {
        const key = (d || 'unknown').replace(/^www\./, '');
        domainCount.set(key, (domainCount.get(key) || 0) + 1);
      });
      const mainDomain = Array.from(domainCount.entries()).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'api';
      const ts = new Date();
      const pad = (n:number)=>String(n).padStart(2,'0');
      const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
      const ext = config.format === 'json' ? 'json' : 'yaml';
      const filename = `${mainDomain}-${stamp}.${ext}`;

      const file = {
        filename,
        content,
        domain: 'merged',
        recordCount: recordsToExport.length,
        size: new Blob([content]).size,
        apiInfo: this.autoInfoGenerator.generateApiInfo(recordsToExport, undefined)
      };

      return { success: true, files: [file], totalSize: file.size };
    } catch (error) {
      return { success: false, files: [], totalSize: 0, errors: [`导出失败: ${(error as Error).message}`] };
    }
  }

  /**
   * 按域名导出多个文件
   */
  public async exportByDomains(
    records: RequestRecord[], 
    config: ExportConfig
  ): Promise<ExportResult> {
    try {
      const recordsToExport = config.scope === 'selected' 
        ? records.filter(r => config.domains.some(d => this.getRecordDomain(r) === d.domain))
        : records;

      if (recordsToExport.length === 0) {
        return {
          success: false,
          files: [],
          totalSize: 0,
          errors: ['没有可导出的记录']
        };
      }

      // 按域名分组记录
      const domainGroups = this.domainDetector.groupRecordsByDomain(recordsToExport);
      const files: ExportFile[] = [];
      const errors: string[] = [];
      let totalSize = 0;

      // 为每个域名生成文件
      for (const [domain, domainRecords] of domainGroups.entries()) {
        try {
          const file = await this.generateFileForDomain(domain, domainRecords, config);
          files.push(file);
          totalSize += file.size;
        } catch (error) {
          errors.push(`生成域名 ${domain} 的文件失败: ${(error as Error).message}`);
        }
      }

      if (files.length === 0) {
        return {
          success: false,
          files: [],
          totalSize: 0,
          errors: errors.length > 0 ? errors : ['生成文件失败']
        };
      }

      // 如果有多个文件，创建ZIP包
      let downloadUrl: string | undefined;
      if (files.length > 1) {
        downloadUrl = await this.createZipDownload(files);
      }

      return {
        success: true,
        files,
        totalSize,
        errors: errors.length > 0 ? errors : undefined,
        downloadUrl
      };

    } catch (error) {
      return {
        success: false,
        files: [],
        totalSize: 0,
        errors: [`导出失败: ${(error as Error).message}`]
      };
    }
  }

  /**
   * 为单个域名生成文件
   */
  private async generateFileForDomain(
    domain: string,
    records: RequestRecord[],
    config: ExportConfig
  ): Promise<ExportFile> {
    // 生成API信息
    const apiInfo = this.autoInfoGenerator.generateApiInfoForDomain(domain, records);
    
    // 生成OpenAPI文档
    const openApiDoc = this.generateOpenAPIDocForDomain(domain, records, apiInfo, config);
    
    // 转换为指定格式
    const content = config.format === 'json' 
      ? JSON.stringify(openApiDoc, null, 2)
      : this.convertToYAML(openApiDoc);
    
    // 生成文件名
    const filename = this.autoInfoGenerator.generateSafeFileName(domain, config.format);
    
    return {
      filename,
      content,
      domain,
      recordCount: records.length,
      size: new Blob([content]).size,
      apiInfo
    };
  }

  /**
   * 为特定域名生成OpenAPI文档
   */
  private generateOpenAPIDocForDomain(
    domain: string,
    records: RequestRecord[],
    apiInfo: ApiInfo,
    config: ExportConfig
  ): any {
    const paths: any = {};
    const tags = new Set<string>();
    
    // 处理记录
    records.forEach(record => {
      try {
        const url = new URL(record.url);
        const path = url.pathname;
        const method = record.method.toLowerCase();
        
        // 生成 tags：当按分组导出时，使用与GroupManager一致的分组匹配逻辑
        let recordTags: string[] = [];
        if (config.groupByTags) {
          // 优先通过recordGroupMapping匹配分组
          const groupManager = GroupManager.getInstance();
          const recordGroup = groupManager.getRecordGroup(record.id);
          
          if (recordGroup) {
            recordTags = [recordGroup.name];
            tags.add(recordGroup.name);
          } else if (record.customTags && record.customTags.length > 0) {
            // 如果没有recordGroupMapping，则通过customTags来匹配（兼容录制接口）
            recordTags = record.customTags;
            record.customTags.forEach(tag => tags.add(tag));
          } else {
            recordTags = ['未分组'];
            tags.add('未分组');
          }
        } else {
          const domainTag = domain.replace('www.', '');
          recordTags = [domainTag];
          tags.add(domainTag);
        }
        
        if (recordTags.length === 0) {
          recordTags = ['未分组'];
          tags.add('未分组');
        }
        
        if (!paths[path]) {
          paths[path] = {};
        }
        
        // 构建操作对象
        const operation: any = {
          tags: recordTags,
          summary: `${method.toUpperCase()} ${path}`,
          operationId: `${method}${path.replace(/[^a-zA-Z0-9]/g, '')}_${Date.now()}`,
          responses: {
            [record.responseStatus]: {
              description: this.getResponseDescription(record.responseStatus),
              content: {
                'application/json': {
                  example: {}
                }
              }
            }
          }
        };
        
        // 添加请求参数
        if (record.requestParameters) {
          this.addParametersToOperation(operation, record.requestParameters, config);
        }
        
        paths[path][method] = operation;
        
      } catch (error) {
        console.warn('Failed to process record:', record.url, error);
      }
    });
    
    // 生成标签描述
    const tagDescriptions = this.generateTagDescriptions(tags, records, config);
    
    return {
      openapi: '3.0.0',
      info: {
        title: apiInfo.title,
        version: apiInfo.version,
        description: apiInfo.description,
        contact: apiInfo.contact,
        license: apiInfo.license
      },
      servers: [
        {
          url: apiInfo.serverUrl,
          description: `${domain} API Server`
        }
      ],
      tags: tagDescriptions,
      paths
    };
  }

  /**
   * 添加参数到操作对象
   */
  private addParametersToOperation(operation: any, params: any, config: ExportConfig): void {
    operation.parameters = [];
    
    // Query参数
    if (params.query && Object.keys(params.query).length > 0) {
      Object.entries(params.query).forEach(([name, value]) => {
        operation.parameters.push({
          name,
          in: 'query',
          required: false,
          schema: { type: 'string' },
          example: config.includeExamples ? value : undefined
        });
      });
    }
    
    // Path参数
    if (params.path && params.path.length > 0) {
      params.path.forEach((param: any) => {
        operation.parameters.push({
          name: param.name,
          in: 'path',
          required: true,
          schema: { type: param.type === 'id' ? 'integer' : 'string' },
          example: config.includeExamples ? param.value : undefined
        });
      });
    }
    
    // Headers - 使用所有请求头信息
    const allHeaders = params.allHeaders || params.headers || {};
    console.log('MultiFileExporter - 请求头处理:', {
      paramsHeaders: params.headers,
      paramsAllHeaders: params.allHeaders,
      finalHeaders: allHeaders,
      headerCount: Object.keys(allHeaders).length
    });
    
    if (allHeaders && Object.keys(allHeaders).length > 0) {
      Object.entries(allHeaders).forEach(([name, value]) => {
        console.log('添加请求头参数:', { name, value });
        operation.parameters.push({
          name,
          in: 'header',
          required: false,
          schema: { type: 'string' },
          example: config.includeExamples ? value : undefined,
          description: `请求头：${name}`
        });
      });
    }
    
    // 请求体
    if (params.body || params.json || params.form) {
      operation.requestBody = {
        content: {}
      };
      
      if (params.json) {
        operation.requestBody.content['application/json'] = {
          schema: this.generateSchemaFromData(params.json),
          example: config.includeExamples ? params.json : undefined
        };
      } else if (params.form) {
        operation.requestBody.content['application/x-www-form-urlencoded'] = {
          schema: {
            type: 'object',
            properties: Object.fromEntries(
              Object.entries(params.form).map(([key, value]) => [
                key,
                { 
                  type: 'string', 
                  example: config.includeExamples ? value : undefined 
                }
              ])
            )
          }
        };
      } else if (params.body) {
        operation.requestBody.content['application/json'] = {
          schema: this.generateSchemaFromData(params.body),
          example: config.includeExamples ? params.body : undefined
        };
      }
    }
  }

  /**
   * 从数据生成Schema
   */
  private generateSchemaFromData(data: any): any {
    if (data === null || data === undefined) {
      return { type: 'string' };
    }
    
    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 ? this.generateSchemaFromData(data[0]) : { type: 'string' }
      };
    }
    
    if (typeof data === 'object') {
      const properties: any = {};
      Object.entries(data).forEach(([key, value]) => {
        properties[key] = this.generateSchemaFromData(value);
      });
      return {
        type: 'object',
        properties
      };
    }
    
    if (typeof data === 'number') {
      return { type: Number.isInteger(data) ? 'integer' : 'number' };
    }
    
    if (typeof data === 'boolean') {
      return { type: 'boolean' };
    }
    
    return { type: 'string' };
  }

  /**
   * 转换为YAML格式
   */
  private convertToYAML(obj: any): string {
    function yamlStringify(value: any, indent = 0): string {
      const spaces = ' '.repeat(indent);
      
      if (value === null || value === undefined) {
        return 'null';
      }
      
      if (typeof value === 'string') {
        if (value.includes(':') || value.includes('\n') || value.includes('#')) {
          return `"${value.replace(/"/g, '\\"')}"`;
        }
        return value;
      }
      
      if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
      }
      
      if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        return '\n' + value.map(item => 
          `${spaces}- ${yamlStringify(item, indent + 2).replace(/^\s+/, '')}`
        ).join('\n');
      }
      
      if (typeof value === 'object') {
        const entries = Object.entries(value);
        if (entries.length === 0) return '{}';
        
        return '\n' + entries.map(([key, val]) => {
          const yamlValue = yamlStringify(val, indent + 2);
          if (yamlValue.startsWith('\n')) {
            return `${spaces}${key}:${yamlValue}`;
          } else {
            return `${spaces}${key}: ${yamlValue}`;
          }
        }).join('\n');
      }
      
      return String(value);
    }
    
    return yamlStringify(obj).trim();
  }

  /**
   * 创建ZIP下载
   */
  private async createZipDownload(files: ExportFile[]): Promise<string> {
    // 这里需要使用JSZip库来创建ZIP文件
    // 由于项目中可能没有JSZip，我们先返回一个占位符
    // 在实际实现中，需要添加JSZip依赖
    
    try {
      // 创建一个包含所有文件的Blob
      const zipContent = files.map(file => 
        `=== ${file.filename} ===\n${file.content}\n\n`
      ).join('');
      
      const blob = new Blob([zipContent], { type: 'text/plain' });
      return URL.createObjectURL(blob);
    } catch (error) {
      throw new Error(`创建ZIP文件失败: ${(error as Error).message}`);
    }
  }

  /**
   * 下载单个文件
   */
  public downloadFile(file: ExportFile): void {
    const blob = new Blob([file.content], {
      type: file.filename.endsWith('.json') ? 'application/json' : 'text/yaml'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 下载所有文件
   */
  public async downloadAllFiles(files: ExportFile[]): Promise<void> {
    if (files.length === 1) {
      this.downloadFile(files[0]);
    } else {
      // 逐个下载文件
      for (const file of files) {
        this.downloadFile(file);
        // 添加小延迟避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  /**
   * 获取记录的域名
   */
  private getRecordDomain(record: RequestRecord): string {
    try {
      const url = new URL(record.url);
      return url.hostname;
    } catch {
      return 'unknown';
    }
  }

  /**
   * 获取响应状态描述
   */
  private getResponseDescription(status: number): string {
    const descriptions: Record<number, string> = {
      200: 'Success',
      201: 'Created',
      204: 'No Content',
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      500: 'Internal Server Error'
    };
    
    return descriptions[status] || `HTTP ${status}`;
  }

  /**
   * 生成标签描述
   */
  private generateTagDescriptions(tags: Set<string>, records: RequestRecord[], config: ExportConfig): any[] {
    const tagStats = new Map<string, { count: number, methods: Set<string>, description?: string }>();
    
    // 初始化统计信息
    tags.forEach(tag => {
      tagStats.set(tag, { count: 0, methods: new Set() });
    });
    
    // 统计每个标签的记录数和方法
    records.forEach(record => {
      let recordTags: string[] = [];
      
      if (config.groupByTags && record.customTags && record.customTags.length > 0) {
        recordTags = record.customTags;
      } else if (!config.groupByTags) {
        try {
          const url = new URL(record.url);
          const domainTag = url.hostname.replace('www.', '');
          recordTags = [domainTag];
        } catch {
          recordTags = ['default'];
        }
      } else {
        recordTags = ['default'];
      }
      
      recordTags.forEach(tag => {
        if (tagStats.has(tag)) {
          const stats = tagStats.get(tag)!;
          stats.count++;
          stats.methods.add(record.method);
        }
      });
    });
    
    // 生成标签描述
    return Array.from(tags).map(tag => {
      const stats = tagStats.get(tag)!;
      const methodList = Array.from(stats.methods).join(', ');
      const description = `${tag} group endpoints (${stats.count} endpoints, methods: ${methodList})`;
      
      return {
        name: tag,
        description: description
      };
    });
  }

  /**
   * 生成标签描述（用于OpenAPI导出器）
   */
  public static generateTagDefinitions(records: RequestRecord[]): any[] {
    const tags = new Set<string>();
    const tagStats = new Map<string, { count: number, methods: Set<string> }>();
    
    // 收集所有标签并统计
    records.forEach(record => {
      // 如果记录有自定义标签，使用这些标签
      if (record.customTags && record.customTags.length > 0) {
        record.customTags.forEach(tag => {
          tags.add(tag);
          if (!tagStats.has(tag)) {
            tagStats.set(tag, { count: 0, methods: new Set() });
          }
          const stats = tagStats.get(tag)!;
          stats.count++;
          stats.methods.add(record.method);
        });
      } else {
        // 否则使用默认标签
        const defaultTag = 'default';
        tags.add(defaultTag);
        if (!tagStats.has(defaultTag)) {
          tagStats.set(defaultTag, { count: 0, methods: new Set() });
        }
        const stats = tagStats.get(defaultTag)!;
        stats.count++;
        stats.methods.add(record.method);
      }
    });
    
    // 生成标签定义
    return Array.from(tags).map(tag => {
      const stats = tagStats.get(tag)!;
      const methodList = Array.from(stats.methods).join(', ');
      return {
        name: tag,
        description: `Endpoints: ${stats.count}, Methods: ${methodList}`
      };
    });
  }

  /**
   * 验证导出配置
   */
  public validateConfig(config: ExportConfig): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.format || !['json', 'yaml'].includes(config.format)) {
      errors.push('导出格式必须是 json 或 yaml');
    }

    if (!config.scope || !['all', 'selected'].includes(config.scope)) {
      errors.push('导出范围必须是 all 或 selected');
    }

    if (config.scope === 'selected' && (!config.domains || config.domains.length === 0)) {
      errors.push('选择导出时必须指定域名');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export default MultiFileExporter;