# Komari Line Grid

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari Monitor，并使用 Komari 当前 RPC2 / Metric Store 数据接口。

## v0.2.0

v0.2 是一次前端重构，不再“参考 line-grid 重新实现”，而是回到上游的布局逻辑，仅替换数据层。主要变化：

- 恢复 line-grid 原版的三种节点布局、地球标签避让、地区侧栏和月度 ruler
- 2 秒实时刷新改为局部 DOM patch，不再整页重绘
- 离线且没有最新报告的节点显示 `—`，不再伪装成 CPU/RAM/Disk 0%
- 过滤 Komari 的异常/永久到期哨兵日期（例如 2100 年以后）
- 负数或无效续费价格不再当作正常金额展示
- Network 页默认使用“全部平均”，KPI 与曲线语义保持一致
- Resource 页按币种安全聚合月成本，混合币种不再伪造单一总额
- 移动端重新布局，列表不再强制 1080px 桌面宽度
- 页脚保留 `Powered by Komari Monitor`
- 支持在元数据中提供 `longitude` / `latitude`，精确定位地球节点

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

每次 `main` 更新都会运行验证、打包，并按 `komari-theme.json` 的版本创建/更新 GitHub Release，Release 附件为 `komari-line-grid.zip`。

也可以本地打包：

```bash
./scripts/package.sh
```

ZIP 根目录：

```text
komari-theme.json
dist/
  index.html
  css/app.css
  js/app.js
  js/charts.js
  js/komari-api.js
  metadata/nodes.json
```

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

可展示时长取决于 Komari Metric Store / rollup 的保留策略。`traffic_reset_day` 默认每月 1 日，可按节点设置 1–28 日。

如果 Metric Store 查询失败，主题会明确显示“暂不可用”，不会把缺失数据当作 `0 B`。

## 开发与验证

```bash
./scripts/test.sh
./scripts/package.sh
```

验证包括：

- JavaScript 语法检查
- RPC2 adapter mock 测试
- 离线缺数据语义
- 异常到期/负价格清洗
- 地球标签避让与增量刷新关键不变量
- JSON 与主题引用完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 是独立项目，本主题只通过其公开 RPC2 / 主题机制运行，不包含 Komari 主程序代码。
