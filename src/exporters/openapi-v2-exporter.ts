import * as yaml from 'js-yaml';
import { RequestRecord, OpenAPIV2GenerateOptions, ExportResult } from '../types';

// 简单的数据清理器
class DataSanitizer {
  static getConfigByLevel(level: string) {
    return {
      removeTokens: level !== 'none',
      maskPasswords: level !== 'none',
      removeSensitiveHeaders: level === 'strict'
    };
  }

  sanitizeValue(value: any): any {
    if (typeof value === 'string') {
      // 移除敏感信息模式
      return value.replace(/\b(?:token|password|secret|key)\s*[:=]\s*[^\s,}]+/gi, '[REDACTED]');
    }
    return value;
  }

  sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    
    if (typeof obj === 'object') {
      if (Array.isArray(obj)) {
        return obj.map(item => this.sanitizeObject(item));
      }
      
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    
    return this.sanitizeValue(obj);
  }

  sanitizeData(data: any, _config: any): any {
    return this.sanitizeObject(data);
  }
}

export class OpenAPIV2Exporter {
  private sanitizer: DataSanitizer;

  constructor() {
    this.sanitizer = new DataSanitizer();
  }

  async exportToYAML(records: RequestRecord[], options: OpenAPIV2GenerateOptions): Promise<ExportResult> {
    const openapiDoc = this.generateOpenAPIDocument(records, options);
    const yamlContent = yaml.dump(openapiDoc, { indent: 2, lineWidth: 120, noRefs: true });
    return {
      format: 'yaml',
      content: yamlContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi-v2.yaml`
    };
  }

  async exportToJSON(records: RequestRecord[], options: OpenAPIV2GenerateOptions): Promise<ExportResult> {
    const openapiDoc = this.generateOpenAPIDocument(records, options);
    const jsonContent = JSON.stringify(openapiDoc, null, 2);
    return {
      format: 'json',
      content: jsonContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi-v2.json`
    };
  }

  private generateOpenAPIDocument(records: RequestRecord[], options: OpenAPIV2GenerateOptions): any {
    const paths = this.generatePaths(records, options);
    const definitions = this.generateDefinitions(records, options);
    const serverInfo = this.extractServerInfo(records, options.serverUrl);
    const tags = this.generateTags(records);

    return {
      openapi: '2.0',
      info: {
        title: options.title,
        version: options.version,
        description: options.description || `API documentation generated from recorded requests`
      },
      host: serverInfo.host,
      basePath: serverInfo.basePath,
      schemes: serverInfo.schemes,
      produces: this.extractGlobalProduces(records),
      consumes: this.extractGlobalConsumes(records),
      paths,
      definitions,
      tags
    };
  }

  private generateTags(records: RequestRecord[]): any[] {
    const tagSet = new Set<string>();
    const tagDescriptions = new Map<string, { count: number, methods: Set<string> }>();
    
    // 收集所有标签
    records.forEach(record => {
      // 如果有自定义标签，使用自定义标签；否则使用"未分组"
      let tags: string[] = ['未分组'];
      
      if (record.customTags && record.customTags.length > 0) {
        // 过滤掉可能是域名的标签
        const validTags = record.customTags.filter(tag => {
          if (tag.includes('.') && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(tag)) {
            return false;
          }
          return true;
        });
        
        if (validTags.length > 0) {
          tags = validTags;
        }
      }
      
      tags.forEach(tag => {
        tagSet.add(tag);
        if (!tagDescriptions.has(tag)) {
          tagDescriptions.set(tag, { count: 0, methods: new Set() });
        }
        const desc = tagDescriptions.get(tag)!;
        desc.count++;
        desc.methods.add(record.method);
      });
    });

    // 生成标签定义
    return Array.from(tagSet).map(tag => {
      const desc = tagDescriptions.get(tag)!;
      const methodList = Array.from(desc.methods).join(', ');
      return {
        name: tag,
        description: `Endpoints: ${desc.count}, Methods: ${methodList}`
      };
    });
  }

  private generatePaths(records: RequestRecord[], options: OpenAPIV2GenerateOptions): any {
    const pathsMap = new Map<string, Map<string, RequestRecord[]>>();

    records.forEach(record => {
      const pathPattern = options.parameterizeUrls 
        ? this.parameterizePath(record.url)
        : this.extractPath(record.url);
      
      if (!pathsMap.has(pathPattern)) {
        pathsMap.set(pathPattern, new Map());
      }

      const methodMap = pathsMap.get(pathPattern)!;
      const method = record.method.toLowerCase();
      
      if (!methodMap.has(method)) {
        methodMap.set(method, []);
      }
      methodMap.get(method)!.push(record);
    });

    const paths: any = {};
    pathsMap.forEach((methodMap, pathPattern) => {
      const pathItem: any = {};
      methodMap.forEach((records, method) => {
        pathItem[method] = this.generateOperation(records, method, options);
      });
      paths[pathPattern] = pathItem;
    });

    return paths;
  }

  private generateOperation(records: RequestRecord[], method: string, options: OpenAPIV2GenerateOptions): any {
    const primaryRecord = this.selectPrimaryRecord(records);
    
    return {
      summary: this.generateOperationSummary(primaryRecord, method),
      description: this.generateOperationDescription(records),
      parameters: this.generateParameters(records, options),
      responses: this.generateResponses(records, options),
      tags: this.generateOperationTags(primaryRecord)
    };
  }

  private generateParameters(records: RequestRecord[], options: OpenAPIV2GenerateOptions): any[] {
    const parametersMap = new Map<string, any>();

    records.forEach(record => {
      try {
        const url = new URL(record.url);
        
        // Query parameters
        url.searchParams.forEach((value, key) => {
          const paramKey = `query:${key}`;
          if (!parametersMap.has(paramKey)) {
            parametersMap.set(paramKey, {
              name: key,
              in: 'query',
              required: false,
              type: this.inferType(value),
              description: 'Query parameter',
              ...(options.includeExamples && { example: this.parseValue(value) })
            });
          }
        });

        // Path parameters
        const pathParams = this.extractPathParameters(url.pathname);
        pathParams.forEach(param => {
          const key = `path:${param.name}`;
          if (!parametersMap.has(key)) {
            parametersMap.set(key, {
              name: param.name,
              in: 'path',
              required: true,
              type: param.type,
              description: 'Path parameter',
              ...(options.includeExamples && { example: param.example })
            });
          }
        });

        // Header parameters - 添加所有请求头信息
        const allHeaders = record.requestParameters?.allHeaders || record.headers;
        console.log('调试信息 - 处理请求头:', {
          url: record.url,
          method: record.method,
          recordHeaders: record.headers,
          requestParametersHeaders: record.requestParameters?.headers,
          allHeaders: record.requestParameters?.allHeaders,
          finalHeaders: allHeaders,
          allHeadersCount: Object.keys(allHeaders).length
        });
        
        Object.entries(allHeaders).forEach(([headerName, headerValue]) => {
          const paramKey = `header:${headerName}`;
          if (!parametersMap.has(paramKey)) {
            console.log('添加请求头参数:', { headerName, headerValue });
            parametersMap.set(paramKey, {
              name: headerName,
              in: 'header',
              required: false,
              type: 'string',
              description: `请求头: ${headerName}`,
              ...(options.includeExamples && { example: headerValue })
            });
          }
        });

        // Body parameter
        if (record.requestBody) {
          parametersMap.set('body:body', {
            name: 'body',
            in: 'body',
            required: true,
            schema: this.generateSchemaFromData(record.requestBody, options),
            description: 'Request body'
          });
        }

      } catch (error) {
        console.warn('Error parsing parameters:', error);
      }
    });

    return Array.from(parametersMap.values());
  }

  private generateResponses(records: RequestRecord[], options: OpenAPIV2GenerateOptions): any {
    const responsesMap = new Map<number, RequestRecord[]>();
    records.forEach(record => {
      const status = record.responseStatus;
      if (!responsesMap.has(status)) {
        responsesMap.set(status, []);
      }
      responsesMap.get(status)!.push(record);
    });

    const responses: any = {};
    responsesMap.forEach((statusRecords, statusCode) => {
      responses[statusCode.toString()] = {
        description: this.getStatusDescription(statusCode),
        schema: statusRecords[0].responseBody ? 
          this.generateSchemaFromData(statusRecords[0].responseBody, options) : undefined,
        ...(options.includeResponseExamples && statusRecords[0].responseBody && {
          examples: {
            'application/json': this.processExampleData(statusRecords[0].responseBody, options)
          }
        })
      };
    });

    return responses;
  }

  private generateDefinitions(records: RequestRecord[], options: OpenAPIV2GenerateOptions): any {
    const definitions: any = {};
    const processed = new Set<string>();

    records.forEach(record => {
      if (record.requestBody && typeof record.requestBody === 'object') {
        const schemaName = this.generateSchemaName(record.url, 'Request');
        if (!processed.has(schemaName)) {
          definitions[schemaName] = this.generateSchemaFromData(record.requestBody, options);
          processed.add(schemaName);
        }
      }

      if (record.responseBody && typeof record.responseBody === 'object') {
        const schemaName = this.generateSchemaName(record.url, 'Response');
        if (!processed.has(schemaName)) {
          definitions[schemaName] = this.generateSchemaFromData(record.responseBody, options);
          processed.add(schemaName);
        }
      }
    });

    return definitions;
  }

  private generateSchemaFromData(data: any, options: OpenAPIV2GenerateOptions): any {
    if (data === null || data === undefined) return { type: 'string' };
    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 ? this.generateSchemaFromData(data[0], options) : { type: 'string' }
      };
    }
    if (typeof data === 'object') {
      const properties: any = {};
      const required: string[] = [];

      Object.entries(data).forEach(([key, value]) => {
        properties[key] = this.generateSchemaFromData(value, options);
        if (value !== null && value !== undefined) {
          required.push(key);
        }
      });

      const schema: any = { type: 'object', properties };
      if (required.length > 0) schema.required = required;
      if (options.includeExamples) {
        schema.example = this.processExampleData(data, options);
      }
      return schema;
    }
    return this.inferSchemaFromValue(data);
  }

  // Helper methods
  private selectPrimaryRecord(records: RequestRecord[]): RequestRecord {
    return records.reduce((best, current) => 
      current.responseStatus >= 200 && current.responseStatus < 300 ? current : best);
  }

  private generateOperationSummary(record: RequestRecord, method: string): string {
    // 优先使用自定义标题
    if (record.customTitle) {
      return record.customTitle;
    }
    
    const path = this.extractPath(record.url);
    const segments = path.split('/').filter(Boolean);
    const resource = segments.length > 0 ? segments[segments.length - 1] : 'root';
    const actions: any = { get: 'Get', post: 'Create', put: 'Update', delete: 'Delete' };
    return `${actions[method] || method.toUpperCase()} ${resource}`;
  }

  private generateOperationDescription(records: RequestRecord[]): string {
    return `Recorded from ${records.length} request(s)`;
  }

  private generateOperationTags(record: RequestRecord): string[] {
    // 如果记录有自定义标签，则使用这些标签作为tags
    if (record.customTags && record.customTags.length > 0) {
      // 过滤掉可能是域名的标签（包含点号的）
      const validTags = record.customTags.filter(tag => {
        // 如果标签包含点号且看起来像域名，则过滤掉
        if (tag.includes('.') && /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(tag)) {
          return false;
        }
        return true;
      });
      
      // 如果过滤后还有有效标签，使用它们；否则返回"未分组"
      if (validTags.length > 0) {
        return validTags;
      }
    }
    
    // 未分组的接口统一使用"未分组"作为tag
    return ['未分组'];
  }

  private extractPathParameters(pathname: string): Array<{name: string, type: string, example: any}> {
    const params: Array<{name: string, type: string, example: any}> = [];
    const segments = pathname.split('/');

    segments.forEach((segment) => {
      if (/^\d+$/.test(segment)) {
        params.push({ name: `id${params.length + 1}`, type: 'integer', example: parseInt(segment) });
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        params.push({ name: `uuid${params.length + 1}`, type: 'string', example: segment });
      }
    });

    return params;
  }

  private extractServerInfo(records: RequestRecord[], serverUrl?: string): any {
    if (serverUrl && serverUrl !== 'auto') {
      try {
        const url = new URL(serverUrl);
        return {
          host: url.host,
          basePath: url.pathname === '/' ? undefined : url.pathname,
          schemes: [url.protocol.replace(':', '')]
        };
      } catch {}
    }

    const schemes = new Set<string>();
    const hosts = new Set<string>();
    
    records.forEach(record => {
      try {
        const url = new URL(record.url);
        schemes.add(url.protocol.replace(':', ''));
        hosts.add(url.host);
      } catch {}
    });

    return {
      host: Array.from(hosts)[0],
      schemes: Array.from(schemes)
    };
  }

  private extractGlobalProduces(records: RequestRecord[]): string[] {
    const produces = new Set<string>();
    records.forEach(record => {
      const contentType = record.responseHeaders['content-type'];
      if (contentType) produces.add(contentType.split(';')[0]);
    });
    return Array.from(produces);
  }

  private extractGlobalConsumes(records: RequestRecord[]): string[] {
    const consumes = new Set<string>();
    records.forEach(record => {
      const contentType = this.getHeaderValue(record.requestParameters?.allHeaders || record.headers, 'content-type');
      if (contentType) consumes.add(contentType.split(';')[0]);
    });
    return Array.from(consumes);
  }

  // 新增辅助方法：大小写不敏感的请求头值获取
  private getHeaderValue(headers: Record<string, string>, headerName: string): string | undefined {
    const lowerHeaderName = headerName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerHeaderName) {
        return value;
      }
    }
    return undefined;
  }

  private processExampleData(data: any, options: OpenAPIV2GenerateOptions): any {
    if (!options.sanitizeData) return data;
    const config = DataSanitizer.getConfigByLevel(options.sanitizationLevel);
    return this.sanitizer.sanitizeData(data, config);
  }

  private parameterizePath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname
        .replace(/\/\d+/g, '/{id}')
        .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
    } catch {
      return url;
    }
  }

  private extractPath(url: string): string {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }

  private generateSchemaName(url: string, suffix: string): string {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean);
      const name = segments.length > 0 ? segments[segments.length - 1] : 'Api';
      return `${name.charAt(0).toUpperCase()}${name.slice(1)}${suffix}`;
    } catch {
      return `Api${suffix}`;
    }
  }

  private inferType(value: string): string {
    if (/^\d+$/.test(value)) return 'integer';
    if (/^\d*\.\d+$/.test(value)) return 'number';
    if (/^(true|false)$/i.test(value)) return 'boolean';
    return 'string';
  }

  private parseValue(value: string): any {
    if (/^\d+$/.test(value)) return parseInt(value);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return value;
  }

  private inferSchemaFromValue(value: any): any {
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return { type: 'string', format: 'date-time' };
      }
      return { type: 'string' };
    }
    if (typeof value === 'number') {
      return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
    }
    if (typeof value === 'boolean') {
      return { type: 'boolean' };
    }
    return { type: 'string' };
  }

  private getStatusDescription(statusCode: number): string {
    const descriptions: any = {
      200: 'Successful response',
      201: 'Resource created',
      400: 'Bad request',
      401: 'Unauthorized',
      404: 'Not found',
      500: 'Server error'
    };
    return descriptions[statusCode] || `HTTP ${statusCode}`;
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').toLowerCase();
  }
}