import { OpenAPIV3 } from 'openapi-types';
import * as yaml from 'js-yaml';
import { 
  RequestRecord, 
  OpenAPIGenerateOptions, 
  ExportResult 
} from '../types';

export class OpenAPIExporter {
  
  async exportToOpenAPI(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): Promise<ExportResult> {
    const openApiDoc = this.generateOpenAPIDocument(records, options);
    
    // 转换为YAML格式
    const yamlContent = yaml.dump(openApiDoc, {
      indent: 2,
      lineWidth: 120,
      noRefs: true
    });

    return {
      format: 'yaml',
      content: yamlContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi.yaml`
    };
  }

  async exportToJSON(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): Promise<ExportResult> {
    const openApiDoc = this.generateOpenAPIDocument(records, options);
    
    const jsonContent = JSON.stringify(openApiDoc, null, 2);

    return {
      format: 'json',
      content: jsonContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi.json`
    };
  }

  async exportRawData(records: RequestRecord[]): Promise<ExportResult> {
    const rawData = {
      exportTime: new Date().toISOString(),
      totalRecords: records.length,
      records: records
    };

    const jsonContent = JSON.stringify(rawData, null, 2);

    return {
      format: 'json',
      content: jsonContent,
      filename: `api-records-${new Date().toISOString().split('T')[0]}.json`
    };
  }

  private generateOpenAPIDocument(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): OpenAPIV3.Document {
    const paths = this.generatePaths(records, options);
    const servers = this.generateServers(records, options.serverUrl);
    const components = this.generateComponents(records, options);

    const document: OpenAPIV3.Document = {
      openapi: '3.0.3',
      info: {
        title: options.title,
        version: options.version,
        description: options.description || `API documentation generated from recorded requests on ${new Date().toLocaleDateString()}`
      },
      servers,
      paths,
      components
    };

    return document;
  }

  private generatePaths(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): OpenAPIV3.PathsObject {
    const pathsMap = new Map<string, Map<string, RequestRecord[]>>();

    // 按路径和方法分组请求
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

    const paths: OpenAPIV3.PathsObject = {};

    // 为每个路径生成OpenAPI规范
    pathsMap.forEach((methodMap, pathPattern) => {
      const pathItem: OpenAPIV3.PathItemObject = {};

      methodMap.forEach((records, method) => {
        (pathItem as any)[method] = this.generateOperation(records, method, options);
      });

      paths[pathPattern] = pathItem;
    });

    return paths;
  }

  private generateOperation(
    records: RequestRecord[], 
    method: string, 
    options: OpenAPIGenerateOptions
  ): OpenAPIV3.OperationObject {
    // 使用最完整的记录作为参考
    const primaryRecord = this.selectPrimaryRecord(records);
    
    const operation: OpenAPIV3.OperationObject = {
      summary: this.generateOperationSummary(primaryRecord, method),
      description: this.generateOperationDescription(records),
      parameters: this.generateParameters(records),
      responses: this.generateResponses(records, options)
    };

    // 添加请求体（如果有）
    const requestBody = this.generateRequestBody(records, options);
    if (requestBody) {
      operation.requestBody = requestBody;
    }

    // 添加标签
    const tags = this.generateTags(primaryRecord);
    if (tags.length > 0) {
      operation.tags = tags;
    }

    return operation;
  }

  private selectPrimaryRecord(records: RequestRecord[]): RequestRecord {
    // 选择最新的成功响应，或者参数最多的记录
    return records.reduce((best, current) => {
      // 优先选择成功响应
      if (current.responseStatus >= 200 && current.responseStatus < 300) {
        if (best.responseStatus < 200 || best.responseStatus >= 300) {
          return current;
        }
        // 都是成功响应，选择更新的
        return current.timestamp > best.timestamp ? current : best;
      }
      
      // 都不是成功响应，选择参数更多的
      const currentParams = this.countParameters(current);
      const bestParams = this.countParameters(best);
      
      return currentParams > bestParams ? current : best;
    });
  }

  private countParameters(record: RequestRecord): number {
    let count = 0;
    
    try {
      const url = new URL(record.url);
      count += url.searchParams.size;
    } catch {}

    if (record.requestBody && typeof record.requestBody === 'object') {
      count += Object.keys(record.requestBody).length;
    }

    return count;
  }

  private generateOperationSummary(record: RequestRecord, method: string): string {
    const path = this.extractPath(record.url);
    const pathSegments = path.split('/').filter(Boolean);
    
    if (pathSegments.length === 0) {
      return `${method.toUpperCase()} root`;
    }

    const lastSegment = pathSegments[pathSegments.length - 1];
    const resource = lastSegment.replace(/[{}]/g, '');
    
    const actionMap: Record<string, string> = {
      'get': 'Get',
      'post': 'Create',
      'put': 'Update',
      'patch': 'Update',
      'delete': 'Delete',
      'options': 'Options for'
    };

    const action = actionMap[method] || method.toUpperCase();
    return `${action} ${resource}`;
  }

  private generateOperationDescription(records: RequestRecord[]): string {
    const statusCodes = [...new Set(records.map(r => r.responseStatus))].sort();
    const timestamps = records.map(r => new Date(r.timestamp));
    const firstSeen = new Date(Math.min(...timestamps.map(t => t.getTime())));
    const lastSeen = new Date(Math.max(...timestamps.map(t => t.getTime())));

    let description = `This endpoint was recorded from ${records.length} request(s). `;
    description += `First seen: ${firstSeen.toLocaleString()}, `;
    description += `Last seen: ${lastSeen.toLocaleString()}. `;
    description += `Response status codes observed: ${statusCodes.join(', ')}.`;

    return description;
  }

  private generateParameters(records: RequestRecord[]): OpenAPIV3.ParameterObject[] {
    const parametersMap = new Map<string, OpenAPIV3.ParameterObject>();

    records.forEach(record => {
      try {
        const url = new URL(record.url);
        
        // 路径参数
        const pathParams = this.extractPathParameters(url.pathname);
        pathParams.forEach(param => {
          if (!parametersMap.has(`path:${param.name}`)) {
            parametersMap.set(`path:${param.name}`, {
              name: param.name,
              in: 'path',
              required: true,
              schema: { type: 'string' },
              description: `Path parameter extracted from ${url.pathname}`
            });
          }
        });

        // 查询参数
        url.searchParams.forEach((value, key) => {
          if (!parametersMap.has(`query:${key}`)) {
            parametersMap.set(`query:${key}`, {
              name: key,
              in: 'query',
              required: false,
              schema: this.inferSchemaFromValue(value),
              description: `Query parameter observed in requests`
            });
          }
        });

        // 头参数（排除标准头）
        Object.entries(record.headers).forEach(([key, _value]) => {
          if (this.isCustomHeader(key) && !parametersMap.has(`header:${key}`)) {
            parametersMap.set(`header:${key}`, {
              name: key,
              in: 'header',
              required: false,
              schema: { type: 'string' },
              description: `Custom header observed in requests`
            });
          }
        });

      } catch (error) {
        console.warn('Error parsing URL for parameters:', record.url, error);
      }
    });

    return Array.from(parametersMap.values());
  }

  private extractPathParameters(pathname: string): Array<{name: string, pattern: string}> {
    const params: Array<{name: string, pattern: string}> = [];
    const segments = pathname.split('/');

    segments.forEach((segment, _index) => {
      // 检测数字ID
      if (/^\d+$/.test(segment)) {
        params.push({
          name: `id${params.length > 0 ? params.length + 1 : ''}`,
          pattern: segment
        });
      }
      // 检测UUID
      else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
        params.push({
          name: `uuid${params.length > 0 ? params.length + 1 : ''}`,
          pattern: segment
        });
      }
    });

    return params;
  }

  private isCustomHeader(headerName: string): boolean {
    const standardHeaders = new Set([
      'accept', 'accept-encoding', 'accept-language', 'authorization',
      'cache-control', 'connection', 'content-length', 'content-type',
      'cookie', 'host', 'origin', 'referer', 'user-agent'
    ]);
    
    return !standardHeaders.has(headerName.toLowerCase()) && 
           !headerName.toLowerCase().startsWith('sec-');
  }

  private generateRequestBody(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): OpenAPIV3.RequestBodyObject | undefined {
    const recordsWithBody = records.filter(r => r.requestBody);
    if (recordsWithBody.length === 0) return undefined;

    const contentTypes = new Set<string>();
    const schemas = new Map<string, any>();

    recordsWithBody.forEach(record => {
      const contentType = record.headers['content-type'] || 'application/json';
      contentTypes.add(contentType.split(';')[0]); // 去除charset等参数

      if (!schemas.has(contentType) && record.requestBody) {
        const schema = this.generateSchemaFromData(record.requestBody, options);
        schemas.set(contentType, schema);
      }
    });

    const content: Record<string, OpenAPIV3.MediaTypeObject> = {};

    contentTypes.forEach(contentType => {
      const schema = schemas.get(contentType);
      if (schema) {
        content[contentType] = {
          schema,
          ...(options.includeExamples && {
            example: recordsWithBody[0].requestBody
          })
        };
      }
    });

    return {
      description: 'Request body based on recorded requests',
      content,
      required: true
    };
  }

  private generateResponses(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): OpenAPIV3.ResponsesObject {
    const responsesMap = new Map<number, RequestRecord[]>();

    // 按状态码分组
    records.forEach(record => {
      const status = record.responseStatus;
      if (!responsesMap.has(status)) {
        responsesMap.set(status, []);
      }
      responsesMap.get(status)!.push(record);
    });

    const responses: OpenAPIV3.ResponsesObject = {};

    responsesMap.forEach((statusRecords, statusCode) => {
      // const primaryRecord = statusRecords[0];
      const description = this.getStatusDescription(statusCode);

      const response: OpenAPIV3.ResponseObject = {
        description
      };

      // 生成响应头
      const headers = this.generateResponseHeaders(statusRecords);
      if (Object.keys(headers).length > 0) {
        response.headers = headers;
      }

      // 生成响应内容
      const content = this.generateResponseContent(statusRecords, options);
      if (Object.keys(content).length > 0) {
        response.content = content;
      }

      responses[statusCode.toString()] = response;
    });

    return responses;
  }

  private generateResponseHeaders(records: RequestRecord[]): Record<string, OpenAPIV3.HeaderObject> {
    const headersMap = new Map<string, Set<string>>();

    records.forEach(record => {
      Object.entries(record.responseHeaders).forEach(([key, value]) => {
        if (this.isImportantResponseHeader(key)) {
          if (!headersMap.has(key)) {
            headersMap.set(key, new Set());
          }
          headersMap.get(key)!.add(value);
        }
      });
    });

    const headers: Record<string, OpenAPIV3.HeaderObject> = {};

    headersMap.forEach((_values, headerName) => {
      headers[headerName] = {
        description: `Response header observed in ${records.length} response(s)`,
        schema: { type: 'string' }
      };
    });

    return headers;
  }

  private isImportantResponseHeader(headerName: string): boolean {
    const importantHeaders = new Set([
      'content-type', 'cache-control', 'etag', 'last-modified',
      'location', 'set-cookie', 'x-rate-limit-remaining',
      'x-total-count', 'x-pagination-page'
    ]);
    
    return importantHeaders.has(headerName.toLowerCase()) || 
           headerName.toLowerCase().startsWith('x-');
  }

  private generateResponseContent(
    records: RequestRecord[], 
    options: OpenAPIGenerateOptions
  ): Record<string, OpenAPIV3.MediaTypeObject> {
    const contentMap = new Map<string, any[]>();

    records.forEach(record => {
      if (record.responseBody) {
        const contentType = record.responseHeaders['content-type'] || 'application/json';
        const baseContentType = contentType.split(';')[0];
        
        if (!contentMap.has(baseContentType)) {
          contentMap.set(baseContentType, []);
        }
        contentMap.get(baseContentType)!.push(record.responseBody);
      }
    });

    const content: Record<string, OpenAPIV3.MediaTypeObject> = {};

    contentMap.forEach((bodies, contentType) => {
      const schema = this.generateSchemaFromMultipleData(bodies, options);
      
      content[contentType] = {
        schema,
        ...(options.includeExamples && bodies.length > 0 && {
          example: bodies[0]
        })
      };
    });

    return content;
  }

  private generateSchemaFromData(data: any, options: OpenAPIGenerateOptions): OpenAPIV3.SchemaObject {
    if (data === null || data === undefined) {
      return { type: 'string', nullable: true };
    }

    if (Array.isArray(data)) {
      return {
        type: 'array',
        items: data.length > 0 
          ? this.generateSchemaFromData(data[0], options)
          : { type: 'string' }
      };
    }

    if (typeof data === 'object') {
      const properties: Record<string, OpenAPIV3.SchemaObject> = {};
      const required: string[] = [];

      Object.entries(data).forEach(([key, value]) => {
        properties[key] = this.generateSchemaFromData(value, options);
        if (value !== null && value !== undefined) {
          required.push(key);
        }
      });

      return {
        type: 'object',
        properties,
        ...(required.length > 0 && { required })
      };
    }

    return this.inferSchemaFromValue(data);
  }

  private generateSchemaFromMultipleData(dataArray: any[], options: OpenAPIGenerateOptions): OpenAPIV3.SchemaObject {
    if (dataArray.length === 0) {
      return { type: 'string' };
    }

    if (dataArray.length === 1) {
      return this.generateSchemaFromData(dataArray[0], options);
    }

    // 合并多个数据的Schema
    const schemas = dataArray.map(data => this.generateSchemaFromData(data, options));
    return this.mergeSchemas(schemas);
  }

  private mergeSchemas(schemas: OpenAPIV3.SchemaObject[]): OpenAPIV3.SchemaObject {
    if (schemas.length === 0) return { type: 'string' };
    if (schemas.length === 1) return schemas[0];

    // 简化处理：如果所有schema类型相同，合并它们
    const types = new Set(schemas.map(s => s.type));
    
    if (types.size === 1) {
      const type = Array.from(types)[0];
      
      if (type === 'object') {
        return this.mergeObjectSchemas(schemas as OpenAPIV3.SchemaObject[]);
      }
      
      return schemas[0];
    }

    // 类型不同，使用oneOf
    return { oneOf: schemas };
  }

  private mergeObjectSchemas(schemas: OpenAPIV3.SchemaObject[]): OpenAPIV3.SchemaObject {
    const allProperties = new Map<string, OpenAPIV3.SchemaObject[]>();
    const allRequired = new Set<string>();

    schemas.forEach(schema => {
      if (schema.properties) {
        Object.entries(schema.properties).forEach(([key, prop]) => {
          if (!allProperties.has(key)) {
            allProperties.set(key, []);
          }
          allProperties.get(key)!.push(prop as OpenAPIV3.SchemaObject);
        });
      }

      if (schema.required) {
        schema.required.forEach(key => allRequired.add(key));
      }
    });

    const mergedProperties: Record<string, OpenAPIV3.SchemaObject> = {};
    
    allProperties.forEach((propSchemas, key) => {
      mergedProperties[key] = this.mergeSchemas(propSchemas);
    });

    return {
      type: 'object',
      properties: mergedProperties,
      required: Array.from(allRequired)
    };
  }

  private inferSchemaFromValue(value: any): OpenAPIV3.SchemaObject {
    if (typeof value === 'string') {
      // 尝试检测特殊格式
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        return { type: 'string', format: 'date-time' };
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return { type: 'string', format: 'date' };
      }
      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
        return { type: 'string', format: 'email' };
      }
      if (/^https?:\/\//.test(value)) {
        return { type: 'string', format: 'uri' };
      }
      
      return { type: 'string' };
    }

    if (typeof value === 'number') {
      return Number.isInteger(value) 
        ? { type: 'integer' }
        : { type: 'number' };
    }

    if (typeof value === 'boolean') {
      return { type: 'boolean' };
    }

    return { type: 'string' };
  }

  private generateServers(records: RequestRecord[], serverUrl?: string): OpenAPIV3.ServerObject[] {
    if (serverUrl && serverUrl !== 'auto') {
      return [{ url: serverUrl }];
    }

    // 从记录中提取服务器URL
    const serverUrls = new Set<string>();
    
    records.forEach(record => {
      try {
        const url = new URL(record.url);
        const serverBase = `${url.protocol}//${url.host}`;
        serverUrls.add(serverBase);
      } catch {
        // 忽略无效URL
      }
    });

    return Array.from(serverUrls).map(url => ({ url }));
  }

  private generateComponents(_records: RequestRecord[], _options: OpenAPIGenerateOptions): OpenAPIV3.ComponentsObject {
    // 可以在这里添加通用的组件定义，如安全方案、通用Schema等
    return {};
  }

  private generateTags(record: RequestRecord): string[] {
    const tags: string[] = [];
    
    try {
      const url = new URL(record.url);
      const pathSegments = url.pathname.split('/').filter(Boolean);
      
      if (pathSegments.length > 0) {
        // 使用第一个路径段作为标签
        const firstSegment = pathSegments[0];
        if (firstSegment !== 'api' && firstSegment !== 'v1' && firstSegment !== 'v2') {
          tags.push(firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1));
        } else if (pathSegments.length > 1) {
          const secondSegment = pathSegments[1];
          tags.push(secondSegment.charAt(0).toUpperCase() + secondSegment.slice(1));
        }
      }
    } catch {
      // 忽略URL解析错误
    }

    return tags;
  }

  private getStatusDescription(statusCode: number): string {
    const descriptions: Record<number, string> = {
      200: 'Successful response',
      201: 'Resource created successfully',
      204: 'No content',
      400: 'Bad request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Resource not found',
      405: 'Method not allowed',
      422: 'Validation error',
      500: 'Internal server error',
      502: 'Bad gateway',
      503: 'Service unavailable'
    };

    return descriptions[statusCode] || `HTTP ${statusCode}`;
  }

  private parameterizePath(url: string): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;
      
      // 参数化数字ID
      pathname = pathname.replace(/\/\d+/g, '/{id}');
      
      // 参数化UUID
      pathname = pathname.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/{uuid}');
      
      return pathname;
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

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }
}