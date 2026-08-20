# Komari Line Grid （Komari 主题）

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari Monitor，并使用 Komari 当前 RPC2 / Metric Store 数据接口。当前仓库包含可直接导入的 v0.4.2 构建产物。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## v0.4.2

v0.4.2 延续上游 line-grid 的布局节奏，并在 v0.4.0 的稳定性重构基础上补齐 Komari 场景下的数据、移动端和管理功能：

- 桌面端和移动端自适应布局，包含节点列表、详情、网络和资源视图
- 使用 RPC2 / Metric Store 展示实时状态、Ping 历史与流量账期
- 当前账期流量与节点 lifetime 网络计数分离，并按每台 VPS 的账期边界汇总历史
- 首页支持节点搜索、异常快速筛选、流量耗尽预测和离线节点 Last Seen
- 地球支持 Low / Medium / High 三档固定渲染精度，避免运行时自动切换造成闪烁
- 地球拖动、空闲旋转和页面不可见状态经过性能优化，实时刷新使用节点级增量更新
- 支持节点地区、城市、经纬度、服务商、回程线路等 UUID 元数据
- 管理端提供每节点流量重置日编辑器
- 节点列表支持排序、地区筛选、延迟等级和离线状态展示
- 财务信息按币种安全聚合，并支持账期重置日与续费提醒
- 离线且没有最新报告的节点显示 `—`，不再伪装成 CPU/RAM/Disk 0%
- 过滤 Komari 的异常/永久到期哨兵日期（例如 2100 年以后）
- 负数或无效续费价格不再当作正常金额展示
- 页脚保留 `Powered by Komari Monitor`

## Komari 数据接口

主题直接调用：

- `common:getNodes`：节点静态信息
- `common:getNodesLatestStatus`：实时 CPU / RAM / Disk / Load / 网络 / Uptime / Ping 摘要
- `common:getRecords`：Ping 历史
- `public:queryMetrics`：`traffic.up` / `traffic.down` 历史流量

不需要修改 Komari 主程序。

## 安装

推荐直接在 Komari 后台“导入远程主题”中输入仓库地址：

```text
https://github.com/DeterminantMatrix/Komari-line-grid
```

仓库的 `main` 分支包含最新静态资源；重新打包会生成 `komari-line-grid.zip`，可直接上传到 Komari 或作为主题发布附件。

也可以本地打包：

```bash
./scripts/package.sh
```

ZIP 根目录：

```text
komari-theme.json
preview.svg
dist/
  index.html
  css/app.css
  img/grain.png
  admin-reset-editor.html
  js/*.js
  metadata/nodes.json
```

`dist/index.html` 是自包含发布页面；`dist/js/` 中的拆分文件用于维护和调试，发布页面不依赖本地脚本路径。

## 扩展元数据

Komari 原生没有服务商、城市、三网回程等 line-grid 特有字段。可编辑：

```text
dist/metadata/nodes.json
```

按 Komari 节点 UUID 补充。完整示例见 `dist/metadata/nodes.json.example`。

支持：

- `provider_name` / `provider_url`
- `region_country` / `region_name` / `region_city`
- `longitude` / `latitude`
- `traffic_reset_day`
- `cpu_threads`
- `renewal_price_cny`
- `return_routes`

也可在页面加载前注入 `window.LINE_GRID_METADATA` 覆盖 JSON 同名字段。

## 流量历史

主题通过 Metric Store 的 `traffic.up` / `traffic.down` 生成：

- 当前计费周期使用量
- 近 7 日上下行
- 本月脉搏

可展示时长取决于 Komari Metric Store / rollup 的保留策略。`traffic_reset_day` 默认每月 1 日，可按节点设置 1–31 日；目标月份没有对应日期时按当月最后一天处理。

如果 Metric Store 查询失败，主题会明确显示“暂不可用”，不会把缺失数据当作 `0 B`。

## 开发与验证

```bash
./scripts/test.sh
./scripts/package.sh
```

验证包括：

- JavaScript 语法检查
- JSON 与主题元数据完整性
- 自包含 HTML 发布页检查
- ZIP 发布包文件完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 是独立项目，本主题只通过其公开 RPC2 / 主题机制运行，不包含 Komari 主程序代码。
