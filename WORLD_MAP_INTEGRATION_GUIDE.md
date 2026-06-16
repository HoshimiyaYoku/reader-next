# World Map 集成指南

## 🎯 目标

将 WorldMapView 组件集成到现有的 AiBookView 中，使用户可以在"地图" tab 中使用世界地图功能。

## 📋 集成步骤

### 步骤 1: 在 AiBookView 中导入组件

编辑 `frontend/src/views/AiBookView.vue`：

```vue
<script setup lang="ts">
// ... 现有导入 ...
import WorldMapView from '@/components/WorldMapView.vue'
// ... 其他代码 ...
</script>
```

### 步骤 2: 替换地图 tab 内容

找到第 150 行左右的地图部分：

```vue
<!-- 原代码（150-200 行左右）-->
<section v-else-if="activeTab === 'map'" class="map-panel">
  <div class="map-toolbar">
    <div class="map-title">
      <h2>世界地图</h2>
      <p>{{ displayBaseMemory?.map?.updatedAt ? formatTime(displayBaseMemory.map.updatedAt) : '未生成' }}</p>
    </div>
    <button class="secondary-btn" :disabled="aiStore.isBusy" @click="redrawMap">
      {{ aiStore.phase === 'map' ? '绘制中...' : '重绘地图' }}
    </button>
  </div>
  <!-- ... 原有地图内容 ... -->
</section>
```

替换为：

```vue
<!-- 新代码 -->
<section v-else-if="activeTab === 'map'" class="map-panel">
  <WorldMapView
    v-if="book"
    :book-url="book.bookUrl"
    :book-name="book.name"
  />
</section>
```

### 步骤 3: 验证集成

1. **启动后端**
   ```bash
   cd /Users/maple/Documents/reader
   cargo run
   ```

2. **启动前端**
   ```bash
   cd /Users/maple/Documents/reader/frontend
   npm run dev
   ```

3. **测试流程**
   - 打开浏览器访问 `http://localhost:5173`
   - 登录并选择任意书籍
   - 点击进入书籍详情页
   - 切换到"地图" tab
   - 应该看到"构建地图"按钮
   - 点击构建 → 查看 mock 数据
   - 点击"生成坐标" → 查看 SVG 画布

## 🔍 故障排查

### 问题 1: 找不到 WorldMapView 组件

**症状**: `Cannot find module '@/components/WorldMapView.vue'`

**解决**:
```bash
# 确认文件存在
ls -l frontend/src/components/WorldMapView.vue
ls -l frontend/src/components/WorldMapCanvas.vue
ls -l frontend/src/components/MapEntityPanel.vue
ls -l frontend/src/components/MapReviewPanel.vue
```

### 问题 2: API 404 错误

**症状**: `GET /reader3/worldMap 404 Not Found`

**解决**:
```bash
# 确认路由已注册
grep -n "worldMap" src/api/router.rs
# 重新编译后端
cargo build
```

### 问题 3: TypeScript 类型错误

**症状**: `Property 'worldMap' does not exist...`

**解决**:
```bash
# 确认类型文件存在
ls -l frontend/src/types/worldMap.ts
# 重启 TypeScript 服务器（VSCode 中按 Cmd+Shift+P → Restart TS Server）
```

### 问题 4: Pinia store 未注册

**症状**: `getActivePinia was called with no active Pinia`

**解决**: 确认 store 文件存在
```bash
ls -l frontend/src/stores/worldMapStore.ts
```

Pinia 会自动注册，无需手动导入到 main.ts。

## 📊 验证清单

- [ ] 后端编译成功 (`cargo check`)
- [ ] 前端启动成功 (`npm run dev`)
- [ ] 能进入书籍详情页
- [ ] 能切换到"地图" tab
- [ ] 能看到"构建地图"按钮
- [ ] 点击构建后能看到实体列表
- [ ] 能生成坐标
- [ ] SVG 画布能正常显示
- [ ] 能缩放和拖拽画布
- [ ] 能点击实体节点
- [ ] 审查清单能正常显示

## 🎨 样式调整（可选）

如果需要调整地图面板的样式，编辑 `AiBookView.vue` 的 `<style>` 部分：

```vue
<style scoped>
/* 移除原有 .map-panel 的样式约束 */
.map-panel {
  /* 让 WorldMapView 自己管理布局 */
  height: 100%;
  overflow: hidden;
}
</style>
```

## 🚀 完成后效果

1. **初始状态**: 显示"暂无地图数据，点击构建地图开始"
2. **构建后**: 左侧 SVG 画布 + 右侧实体列表
3. **生成坐标后**: 画布中显示实体节点和连线
4. **交互**:
   - 滚轮缩放
   - 拖拽平移
   - 点击节点高亮
   - 切换到审查 tab 查看待处理项

## 📸 截图位置建议

构建完成后，建议在以下位置截图保存到文档：

1. 构建地图按钮状态
2. 实体列表面板
3. SVG 画布（带节点和连线）
4. 审查清单面板
5. 统计信息栏

## ⏭️ 下一步

集成完成后，可以开始：

1. **真实数据对接**: 实现 `build_from_chapters` 替换 mock 数据
2. **AI Prompt 集成**: 调用 `prompts/world_map_spec_architect.md`
3. **增量更新**: 实现章节更新逻辑
4. **手动修正**: 添加编辑对话框
5. **地图图片**: 集成 AI 图片生成

---

**祝集成顺利！有问题随时查看 [WORLD_MAP_PHASE5_6_COMPLETE.md](./WORLD_MAP_PHASE5_6_COMPLETE.md)**
