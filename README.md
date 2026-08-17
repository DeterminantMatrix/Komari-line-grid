# Komari Line Grid

将 `selkk-lab/mmwx-theme-line-grid` 的 line-grid 视觉与交互完整移植到 Komari 的独立主题。

本项目直接使用 Komari 当前 RPC2 数据接口，不需要修改 Komari 主程序：

- `common:getNodes`：节点静态信息
- `common:getNodesLatestStatus`：CPU / RAM / Disk / Load / 实时网络 / Uptime / Ping 摘要
- `common:getRecords`：Ping 历史数据
- `public:queryMetrics`：`traffic.up` / `traffic.down` 历史流量

## 已实现

- line-grid 暗色炭灰 / 亮色暖纸视觉
- 网格、纵列、横向表格三种节点布局
- 可拖动正射投影地球与节点定位
- UUID 稳定路由，不依赖节点数组下标
- 2 秒 RPC2 实时状态刷新
- 节点详情：Overview / Latency / Traffic / Return / System
- Komari Ping Task 延迟、丢包与 1h / 6h / 24h 历史曲线
- 近 7 日上下行流量、周期流量额度与全局资源概况
- 续费 / 到期展示
- 本月流量脉搏
- 可选扩展元数据层，用于 Komari 原生没有的服务商、城市、三网回程、人民币续费价等字段

## 安装

执行：

```bash
./scripts/package.sh
```

生成 `komari-line-grid.zip`。在 Komari 后台的主题管理页面上传 ZIP 并应用即可。

ZIP 根目录结构：

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

Komari 原生不提供 `provider_name`、三网回程等 line-grid 特有字段。可编辑：

```text
dist/metadata/nodes.json
```

按 Komari 节点 UUID 补充。完整示例见 `dist/metadata/nodes.json.example`。

支持字段：

```json
{
  "global": {
    "title": "可选站点标题",
    "show_globe": true
  },
  "nodes": {
    "NODE-UUID": {
      "provider_name": "服务商",
      "provider_url": "https://example.com",
      "region_country": "SG",
      "region_name": "新加坡",
      "region_city": "Singapore",
      "traffic_reset_day": 1,
      "cpu_threads": 2,
      "renewal_price_cny": 35,
      "return_routes": [
        { "carrier": "telecom", "region": "上海", "route_type": "CN2 GIA" },
        { "carrier": "unicom", "region": "上海", "route_type": "AS4837" },
        { "carrier": "mobile", "region": "广州", "route_type": "CMIN2" }
      ]
    }
  }
}
```

也可以在页面加载前注入 `window.LINE_GRID_METADATA`，它会覆盖同名 JSON 字段。

## 流量历史说明

主题通过 Komari Metric Store 的 `traffic.up` / `traffic.down` 生成近 7 日和当前计费周期流量。能展示多久取决于你的 Komari Metric Store / rollup 保留策略。

`traffic_reset_day` 默认是每月 1 日，可在扩展元数据中按节点修改为 1–28 日。

## 开发与验证

```bash
node --check dist/js/charts.js
node --check dist/js/komari-api.js
node --check dist/js/app.js
./scripts/test.sh
./scripts/package.sh
```

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 是独立项目，本主题通过其公开 RPC2 / 主题机制运行，不包含 Komari 主程序代码。
