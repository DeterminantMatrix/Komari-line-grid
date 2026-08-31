# Line Grid — Komari / Lite 主题

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari 系列监控面板。当前仓库同时提供 `Lite-theme.json` 与 `komari-theme.json`，发布包可用于 Komari Lite 与旧 Komari。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## Lite 迁移说明

Lite 版本不再由主题自己维护第二套流量账期状态：

- `common:getNodesLatestStatus` 返回的 `net_total_up/down` 作为 Lite 当前账期的权威流量值。
- `public:queryMetrics` 仅用于历史小时/每日序列、图表和趋势分析，不再覆盖当前账期总量。
- 每节点重置日直接使用 Lite Client 的 `traffic_reset_day`。
- `traffic_reset_day = null` 表示跟随 Agent，`0` 表示关闭，`1~31` 表示每月对应日期。
- Lite 的账期边界由后端统一计算；Line Grid 不再使用主题级 `billingTimeZone` 改写账期边界。
- 旧 Line Grid 的 `trafficResetDay / trafficResetOverrides` 只用于一次性迁移，不再作为 Lite 的长期数据源。

Lite 原生重置日迁移/编辑页：

```text
/themes/line-grid/dist/admin-reset-editor.html
```

该页面需要 Lite 管理员会话，直接调用 `admin:listClients` / `admin:editClient`。检测到旧 Line Grid 账期设置时，可先转换到编辑表，确认后再写入 Lite 数据库。

### Lite deep-link / Dashboard 导航

`Lite-theme.json` 使用 Lite 要求的普通路径：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

Line Grid 自身仍保留原 hash router。`dist/js/lite.js` 会在 `app.js` 启动前把上述 Lite 路径桥接为 Line Grid 内部路由，因此不需要重写主题主路由。

Lite Dashboard 的丢包排行如果附带：

```text
?ping_task=<task_id>
```

兼容层会自动进入节点 Ping 页面，并在对应 Ping Task 控件出现后自动选中它。

## 主要功能

- 桌面端和移动端自适应节点列表、详情、网络与资源视图
- RPC2 / Metric Store 实时状态、Ping 历史和流量历史
- 节点搜索、异常筛选、流量耗尽预测和 Last Seen
- Low / Medium / High 三档地球渲染精度
- 节点地区、城市、经纬度、服务商、回程线路等扩展元数据
- 管理员回程线路编辑
- 财务信息按币种聚合和续费提醒
- GeoIP / ASN 可选增强，并限制为完整公网 IP 才允许外发查询

## 数据接口

主题主要使用：

- `common:getNodes`
- `common:getNodesLatestStatus`
- `common:getRecords`
- `common:getPublicInfo`
- `public:queryMetrics`
- `common:getMe`
- `admin:getClient`
- `admin:listClients`
- `admin:editClient`

## Lite 与旧 Komari 的账期差异

### Komari Lite

以 Lite 后端为权威：

```text
Lite trafficledger
  -> 当前账期校准流量
  -> net_total_up/down
  -> Line Grid 当前用量 / 配额 / 预测

Metric Store
  -> traffic.up / traffic.down 历史序列
  -> Line Grid 图表 / 日流量
```

### 旧 Komari

仍保留原有 Line Grid 兼容逻辑：

- `trafficResetDay`
- `trafficResetOverrides`
- `billingTimeZone`
- 基于 Metric Store 重建主题侧账期

因此仓库继续保留 `komari-theme.json`，但 Lite 会优先使用 `Lite-theme.json`。

## 安装

推荐使用 Release 中唯一的安装包：

```text
komari-line-grid-vX.Y.Z.zip
```

也可以本地构建：

```bash
./scripts/test.sh
./scripts/package.sh
```

ZIP 根目录：

```text
Lite-theme.json
komari-theme.json
preview.svg
dist/
  index.html
  admin-reset-editor.html
  css/
  js/
  metadata/
```

GitHub Actions 在 `v*` tag 上会自动创建/更新 Release，并只上传上述可安装 ZIP。GitHub 自动生成的 Source code zip/tar.gz 不属于 Release `assets[]`；不要再手工上传 `*-source.zip`，以免 Lite 远程主题导入误选第一个附件。

## 扩展元数据

可编辑：

```text
dist/metadata/nodes.json
```

支持：

- `provider_name` / `provider_url`
- `region_country` / `region_name` / `region_city`
- `longitude` / `latitude`
- `traffic_reset_day`
- `billing_timezone`
- `cpu_threads`
- `renewal_price_cny`
- `return_routes`

在 Lite 模式下，原生 Client 字段优先于同义主题元数据；`traffic_reset_day` 不应再通过 metadata 覆盖 Lite 后端配置。

## GeoIP / ASN

GeoIP / ASN 默认关闭。可选择：

- `ip.sb`
- `ipinfo.io`
- `ipwho.is`
- `ipapi.co`

只有完整且可公开路由的 IP 才允许发送给第三方 GeoIP 服务；被 Lite 隐藏、打码、私网、保留或无效的地址都会跳过外部查询。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

测试会验证：

- JavaScript 语法
- Komari/Lite adapter 语义
- Lite clean-path → hash-router deep-link 桥接
- `ping_task` 自动选择对应 Ping Task
- 双 manifest 一致性与 Lite navigation 合约
- Lite 原生重置日编辑器不依赖旧后台 DOM
- GeoIP 公网 IP 门禁
- 自包含 HTML 可重复构建
- ZIP 完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 与 Komari Lite 均为独立项目；本主题通过其公开 RPC2 / 主题机制运行，不包含服务端主程序代码。
