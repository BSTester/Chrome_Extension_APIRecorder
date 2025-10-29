import { CustomTag, RequestRecord } from '../types';

export interface GroupState {
  activeGroupId: string | null;
  groups: CustomTag[];
  recordGroupMapping: Map<string, string>; // recordId -> groupId
  ungroupedExpanded: boolean; // 未分组的展开状态
}

export class GroupManager {
  private static instance: GroupManager;
  private state: GroupState = {
    activeGroupId: null,
    groups: [],
    recordGroupMapping: new Map(),
    ungroupedExpanded: true // 默认展开
  };

  private constructor() {
    this.loadState();
  }

  public static getInstance(): GroupManager {
    if (!GroupManager.instance) {
      GroupManager.instance = new GroupManager();
    }
    return GroupManager.instance;
  }

  /**
   * 加载分组状态
   */
  public async loadState(): Promise<void> {
    try {
      // 检查是否在Chrome扩展环境中
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Not running in Chrome extension environment');
        return;
      }
      
      const result = await chrome.storage.local.get(['customTags', 'activeGroupId', 'ungroupedExpanded']);
      if (result.customTags) {
        // 按 order 排序，order 值小的在前面（新分组在最上面）
        this.state.groups = result.customTags.sort((a: CustomTag, b: CustomTag) => {
          const orderA = a.order ?? 0;
          const orderB = b.order ?? 0;
          return orderA - orderB;
        });
      }
      if (result.activeGroupId) {
        this.state.activeGroupId = result.activeGroupId;
        // 更新分组的激活状态
        this.state.groups.forEach(group => {
          group.isActive = group.id === result.activeGroupId;
        });
      }
      if (result.ungroupedExpanded !== undefined) {
        this.state.ungroupedExpanded = result.ungroupedExpanded;
      }
    } catch (error) {
      console.error('Failed to load group state:', error);
    }
  }

  /**
   * 保存分组状态
   */
  private async saveState(): Promise<void> {
    try {
      // 检查是否在Chrome扩展环境中
      if (typeof chrome === 'undefined' || !chrome.storage) {
        console.warn('Not running in Chrome extension environment');
        return;
      }
      
      await chrome.storage.local.set({
        customTags: this.state.groups,
        activeGroupId: this.state.activeGroupId,
        ungroupedExpanded: this.state.ungroupedExpanded
      });
    } catch (error) {
      console.error('Failed to save group state:', error);
      throw error;
    }
  }

  /**
   * 获取所有分组
   */
  public getGroups(): CustomTag[] {
    return [...this.state.groups];
  }

  /**
   * 获取激活的分组
   */
  public getActiveGroup(): CustomTag | null {
    if (!this.state.activeGroupId) return null;
    return this.state.groups.find(group => group.id === this.state.activeGroupId) || null;
  }

  /**
   * 获取激活分组ID
   */
  public getActiveGroupId(): string | null {
    return this.state.activeGroupId;
  }

  /**
   * 创建新分组
   */
  public async createGroup(name: string, description?: string): Promise<CustomTag> {
    if (!name.trim()) {
      throw new Error('分组名称不能为空');
    }

    // 检查名称是否已存在
    if (this.state.groups.some(group => group.name === name.trim())) {
      throw new Error('分组名称已存在');
    }

    const tagColors = [
      '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
      '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
    ];

    // 获取最小的 order 值，新分组将显示在最上面
    const minOrder = this.state.groups.length > 0 ? Math.min(...this.state.groups.map(group => group.order || 0)) : 0;

    const newGroup: CustomTag = {
      id: `tag_${Date.now()}`,
      name: name.trim(),
      color: tagColors[this.state.groups.length % tagColors.length],
      description: description || '',
      createdAt: Date.now(),
      requestIds: [],
      isExpanded: true,
      isActive: false,
      order: minOrder - 1 // 新分组的 order 更小，显示在最上面
    };

    // 新分组插入到数组开头
    this.state.groups.unshift(newGroup);
    await this.saveState();

    // 自动设为激活状态
    await this.setActiveGroup(newGroup.id);

    return newGroup;
  }

  /**
   * 删除分组
   */
  public async deleteGroup(groupId: string): Promise<void> {
    const groupIndex = this.state.groups.findIndex(group => group.id === groupId);
    if (groupIndex === -1) {
      throw new Error('分组不存在');
    }

    // 如果删除的是激活分组，清除激活状态
    if (this.state.activeGroupId === groupId) {
      this.state.activeGroupId = null;
    }

    // 移除分组
    this.state.groups.splice(groupIndex, 1);
    
    // 清理记录映射
    for (const [recordId, mappedGroupId] of this.state.recordGroupMapping.entries()) {
      if (mappedGroupId === groupId) {
        this.state.recordGroupMapping.delete(recordId);
      }
    }

    await this.saveState();

    // 通知background script删除相关记录
    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_TAG_AND_RECORDS',
        data: { tagId: groupId }
      });
    } catch (error) {
      console.error('Failed to notify background script:', error);
    }
  }

  /**
   * 更新分组信息
   */
  public async updateGroup(groupId: string, updates: Partial<CustomTag>): Promise<void> {
    const groupIndex = this.state.groups.findIndex(group => group.id === groupId);
    if (groupIndex === -1) {
      throw new Error('分组不存在');
    }

    const oldGroupName = this.state.groups[groupIndex].name;

    // 如果更新名称，检查是否重复
    if (updates.name && updates.name !== oldGroupName) {
      if (this.state.groups.some(group => group.name === updates.name && group.id !== groupId)) {
        throw new Error('分组名称已存在');
      }
    }

    this.state.groups[groupIndex] = {
      ...this.state.groups[groupIndex],
      ...updates
    };

    await this.saveState();

    // 如果更新了分组名称，通知background script更新相关记录的customTags
    if (updates.name && updates.name !== oldGroupName) {
      try {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_TAG_NAME',
          data: { 
            oldTagName: oldGroupName, 
            newTagName: updates.name 
          }
        });
      } catch (error) {
        console.error('Failed to notify background script:', error);
      }
    }
  }

  /**
   * 设置激活分组
   */
  public async setActiveGroup(groupId: string | null): Promise<void> {
    if (groupId && !this.state.groups.find(group => group.id === groupId)) {
      throw new Error('分组不存在');
    }

    this.state.activeGroupId = groupId;
    
    // 更新分组的激活状态
    this.state.groups.forEach(group => {
      group.isActive = group.id === groupId;
    });

    await this.saveState();

    // 通知background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        await chrome.runtime.sendMessage({
          type: 'SET_ACTIVE_TAG',
          data: { tagId: groupId }
        });
      }
    } catch (error) {
      console.error('Failed to notify background script:', error);
    }
  }

  /**
   * 将记录分配到激活分组
   */
  public async assignRecordToActiveGroup(recordId: string): Promise<void> {
    if (!this.state.activeGroupId) {
      return; // 没有激活分组，不做处理
    }

    this.state.recordGroupMapping.set(recordId, this.state.activeGroupId);
    
    // 这里不需要保存到chrome.storage，因为记录的分组信息会在记录本身中保存
  }

  /**
   * 获取记录所属的分组
   */
  public getRecordGroup(recordId: string): CustomTag | null {
    const groupId = this.state.recordGroupMapping.get(recordId);
    if (!groupId) return null;
    
    return this.state.groups.find(group => group.id === groupId) || null;
  }

  /**
   * 按分组组织记录
   */
  public organizeRecordsByGroups(records: RequestRecord[]): Array<{
    group: CustomTag | null;
    records: RequestRecord[];
    isExpanded: boolean;
  }> {
    const groups: Array<{
      group: CustomTag | null;
      records: RequestRecord[];
      isExpanded: boolean;
    }> = [];
    
    const processedRecords = new Set<string>();

    // 先处理所有自定义分组
    this.state.groups.forEach(group => {
      const groupRecords = records.filter(record => {
        // 优先通过 recordGroupMapping 来匹配记录和分组
        const recordGroupId = this.state.recordGroupMapping.get(record.id);
        if (recordGroupId === group.id) {
          return true;
        }
        
        // 如果没有recordGroupMapping，则通过customTags来匹配（兼容录制接口）
        if (record.customTags && record.customTags.includes(group.name)) {
          // 自动建立recordGroupMapping映射关系
          this.state.recordGroupMapping.set(record.id, group.id);
          return true;
        }
        
        return false;
      });
      
      groups.push({
        group,
        records: groupRecords,
        isExpanded: group.isExpanded !== false // 默认展开
      });
      
      groupRecords.forEach(record => processedRecords.add(record.id));
    });

    // 处理未分组的记录
    const untaggedRecords = records.filter(record => 
      !processedRecords.has(record.id)
    );
    
    // 始终添加"未分组"分组，即使没有记录
    groups.push({
      group: null,
      records: untaggedRecords,
      isExpanded: this.state.ungroupedExpanded // 使用状态中的展开状态
    });

    return groups;
  }

  /**
   * 切换分组展开状态
   */
  public async toggleGroupExpanded(groupId: string | null): Promise<void> {
    if (groupId === null) {
      // 切换“未分组”的展开/折叠；当展开未分组时收起其他分组，当折叠时保持其他分组状态不变
      const newState = !this.state.ungroupedExpanded;
      this.state.ungroupedExpanded = newState;
      if (newState) {
        this.state.groups.forEach(g => { g.isExpanded = false; });
      }
      await this.saveState();
      return;
    }

    // 切换指定分组的展开/折叠；当展开某分组时收起未分组与其它分组，当折叠时仅折叠该分组
    const group = this.state.groups.find(g => g.id === groupId);
    if (!group) return;

    const willExpand = !group.isExpanded;
    if (willExpand) {
      this.state.ungroupedExpanded = false;
      this.state.groups.forEach(g => { g.isExpanded = g.id === groupId; });
    } else {
      group.isExpanded = false;
    }
    await this.saveState();
  }

  /**
   * 获取分组统计信息
   */
  public getGroupStats(records: RequestRecord[]): {
    totalGroups: number;
    activeGroupName: string | null;
    recordsInGroups: number;
    untaggedRecords: number;
  } {
    const activeGroup = this.getActiveGroup();
    const organizedGroups = this.organizeRecordsByGroups(records);
    
    let recordsInGroups = 0;
    let untaggedRecords = 0;
    
    organizedGroups.forEach(({ group, records }) => {
      if (group) {
        recordsInGroups += records.length;
      } else {
        untaggedRecords += records.length;
      }
    });

    return {
      totalGroups: this.state.groups.length,
      activeGroupName: activeGroup?.name || null,
      recordsInGroups,
      untaggedRecords
    };
  }
}

export default GroupManager;