import { RequestRecord, OpenAPIGenerateOptions, ExportResult } from '../types';

export class OpenAPIExporter {
  async exportToOpenAPI(records: RequestRecord[], options: OpenAPIGenerateOptions): Promise<ExportResult> {
    const openapiDoc = this.generateOpenAPIDocument(records, options);
    const yamlContent = this.toYAML(openapiDoc);
    return {
      format: 'yaml',
      content: yamlContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi.yaml`
    };
  }

  async exportToJSON(records: RequestRecord[], options: OpenAPIGenerateOptions): Promise<ExportResult> {
    const openapiDoc = this.generateOpenAPIDocument(records, options);
    const jsonContent = JSON.stringify(openapiDoc, null, 2);
    return {
      format: 'json',
      content: jsonContent,
      filename: `${this.sanitizeFilename(options.title)}-openapi.json`
    };
  }

  async exportRawData(records: RequestRecord[]): Promise<ExportResult> {
    const jsonContent = JSON.stringify(records, null, 2);
    return {
      format: 'json',
      content: jsonContent,
      filename: `api-records-${new Date().toISOString().slice(0, 10)}.json`
    };
  }

  // 合并两个 OAS3 文档为一个，移除所有 2.0 定义/引用
  mergeOpenAPI3(docA: any, docB: any): any {
    const isOAS3 = (d: any) => typeof d?.openapi === 'string' && d.openapi.startsWith('3.');
    const a = isOAS3(docA) ? docA : this.upgradeToOAS3OrIgnore(docA);
    const b = isOAS3(docB) ? docB : this.upgradeToOAS3OrIgnore(docB);
    const base = a || b || { openapi: '3.0.0', info: { title: 'Merged API', version: '1.0.0' } };

    const merged: any = {
      openapi: base.openapi || '3.0.0',
      info: a?.info || b?.info || { title: 'Merged API', version: '1.0.0' },
      servers: this.mergeUniqueArrays(a?.servers, b?.servers, (x: any) => x?.url),
      tags: this.mergeTags(a?.tags, b?.tags),
      paths: this.mergePaths(a?.paths, b?.paths),
      components: this.mergeComponents(a?.components, b?.components)
    };

    // 移除所有 Swagger 2.0 字段
    delete merged.swagger;
    delete merged.host;
    delete merged.basePath;
    delete merged.schemes;
    delete merged.definitions;

    return merged;
  }

  private generateOpenAPIDocument(records: RequestRecord[], options: OpenAPIGenerateOptions): any {
    const paths = this.generatePaths(records);
    const serverInfo = this.extractServerInfo(records, options.serverUrl);

    return {
      openapi: '3.0.0',
      info: {
        title: options.title,
        version: options.version,
        description: options.description || 'API documentation generated from recorded requests'
      },
      servers: [
        {
          url: serverInfo.url,
          description: 'API Server'
        }
      ],
      paths
    };
  }

  private generatePaths(records: RequestRecord[]): any {
    const pathsMap = new Map<string, Map<string, RequestRecord>>();

    records.forEach(record => {
      const path = this.extractPath(record.url);
      const method = record.method.toLowerCase();

      if (!pathsMap.has(path)) {
        pathsMap.set(path, new Map());
      }
      pathsMap.get(path)!.set(method, record);
    });

    const paths: any = {};
    pathsMap.forEach((methodMap, path) => {
      const pathItem: any = {};
      methodMap.forEach((record, method) => {
        pathItem[method] = this.generateOperation(record);
      });
      paths[path] = pathItem;
    });

    return paths;
  }

  private generateOperation(record: RequestRecord): any {
    return {
      summary: record.customTitle || `${record.method} ${this.extractPath(record.url)}`,
      description: `API endpoint recorded at ${new Date(record.timestamp).toISOString()}`,
      tags: this.generateOperationTags(record),
      responses: {
        [record.responseStatus]: {
          description: `Response with status ${record.responseStatus}`,
          content: {
            'application/json': {
              schema: {
                type: 'object'
              }
            }
          }
        }
      }
    };
  }

  private extractServerInfo(records: RequestRecord[], serverUrl?: string): { url: string } {
    if (serverUrl) {
      return { url: serverUrl };
    }

    if (records.length > 0) {
      const firstUrl = new URL(records[0].url);
      return { url: `${firstUrl.protocol}//${firstUrl.host}` };
    }

    return { url: 'https://api.example.com' };
  }

  // 与 v2 导出一致：优先使用自定义标签；若为域名/主机名/IPv4，则视为“未分组”
  private generateOperationTags(record: RequestRecord): string[] {
    const tags = record.customTags || [];

    // 提取并标准化主机名
    let hostname = '';
    try {
      hostname = new URL(record.url).hostname || '';
    } catch {
      hostname = '';
    }
    const normalizedHost = hostname.replace(/^www\./, '');

    const isIPv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
    const normalizeTagHost = (t: string) =>
      t.replace(/^https?:\/\//, '')
       .replace(/\/.*$/, '')
       .replace(/^www\./, '')
       .replace(/:\d+$/, '')
       .trim();

    const looksLikeDomainOrHost = (t: string) => {
      const n = normalizeTagHost(t);
      if (!n) return false;
      if (n === normalizedHost || n === hostname) return true;
      if (isIPv4(n)) return true;
      // 含点的字符串通常为域名样式
      if (n.includes('.')) return true;
      return false;
    };

    const valid = tags.filter(tag => !looksLikeDomainOrHost(tag));
    return valid.length > 0 ? valid : ['未分组'];
  }

  private extractPath(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return '/';
    }
  }

  private sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
  }

  private toYAML(obj: any): string {
    return this.objectToYAML(obj, 0);
  }

  private objectToYAML(obj: any, indent: number): string {
    const spaces = '  '.repeat(indent);

    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj === 'string') {
      return `"${obj.replace(/"/g, '\\"')}"`;
    }

    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '[]';
      return obj.map(item => `\n${spaces}- ${this.objectToYAML(item, indent + 1)}`).join('');
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj);
      if (entries.length === 0) return '{}';

      return entries.map(([key, value]) => {
        const yamlValue = this.objectToYAML(value, indent + 1);
        return `\n${spaces}${key}: ${yamlValue}`;
      }).join('');
    }

    return String(obj);
  }

  // ================= 合并工具集（全部 OAS3 内部使用） =================

  private mergeUniqueArrays(a?: any[], b?: any[], keyFn?: (x: any) => string | undefined) {
    const out: any[] = [];
    const seen = new Set<string>();
    const add = (arr?: any[]) => {
      (arr || []).forEach(item => {
        const key = keyFn ? (keyFn(item) || JSON.stringify(item)) : JSON.stringify(item);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(item);
        }
      });
    };
    add(a); add(b);
    return out;
  }

  private mergeTags(a?: any[], b?: any[]) {
    const byName = new Map<string, any>();
    (a || []).forEach(t => { if (t?.name) byName.set(t.name, t); });
    (b || []).forEach(t => { if (t?.name && !byName.has(t.name)) byName.set(t.name, t); });
    return Array.from(byName.values());
  }

  private mergePaths(a?: any, b?: any) {
    const out: any = { ...(a || {}) };
    const bPaths = b || {};
    Object.keys(bPaths).forEach(path => {
      if (!out[path]) {
        out[path] = bPaths[path];
      } else {
        const methods = bPaths[path];
        Object.keys(methods).forEach(m => {
          if (!out[path][m]) {
            out[path][m] = methods[m];
          } else {
            const opA = out[path][m];
            const opB = methods[m];
            opA.tags = this.mergeUniqueArrays(opA.tags, opB.tags, (x: any) => x);
            opA.parameters = this.mergeParameters(opA.parameters, opB.parameters);
            opA.responses = this.mergeResponsesNode(opA.responses, opB.responses);
            opA.summary = opA.summary || opB.summary;
            opA.description = opA.description || opB.description;
            if (opB.requestBody && !opA.requestBody) {
              opA.requestBody = opB.requestBody;
            }
          }
        });
      }
    });
    return out;
  }

  private mergeParameters(a?: any[], b?: any[]) {
    const out: any[] = [];
    const seen = new Set<string>();
    const keyOf = (p: any) => `${p.in}:${p.name}`;
    [...(a || []), ...(b || [])].forEach(p => {
      if (!p) return;
      const k = keyOf(p);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(p);
      }
    });
    return out;
  }

  private mergeResponsesNode(a?: any, b?: any) {
    const out: any = { ...(a || {}) };
    Object.entries(b || {}).forEach(([code, resp]) => {
      if (!out[code]) out[code] = resp;
    });
    return out;
  }

  private mergeComponents(a?: any, b?: any) {
    const out: any = {};
    const keys = new Set<string>([
      'schemas','responses','parameters','examples','requestBodies','headers',
      'securitySchemes','links','callbacks','pathItems'
    ]);
    keys.forEach(k => {
      out[k] = { ...(a?.[k] || {}) };
      const add = b?.[k] || {};
      Object.keys(add).forEach(name => {
        if (!out[k][name]) {
          out[k][name] = add[name];
        }
      });
    });
    return out;
  }

  // 将 2.0 文档尝试轻量升级为 3.0；复杂情况返回 undefined 忽略
  private upgradeToOAS3OrIgnore(doc: any): any | undefined {
    if (!doc || (doc.openapi && !doc.openapi.startsWith('3.'))) return undefined;
    if (!doc.swagger || doc.swagger !== '2.0') return undefined;
    const comp = { schemas: doc.definitions || {} };
    return {
      openapi: '3.0.0',
      info: doc.info || { title: 'Upgraded from 2.0', version: '1.0.0' },
      servers: doc.host ? [{ url: `https://${doc.host}${doc.basePath || ''}` }] : [],
      tags: doc.tags || [],
      paths: doc.paths || {},
      components: comp
    };
  }
}