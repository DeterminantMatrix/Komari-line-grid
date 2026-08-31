# Line Grid — Komari / Lite 主题

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari 系列监控面板。当前仓库同时提供 `Lite-theme.json` 与 `komari-theme.json`；Lite 是当前主要适配目标，旧 manifest 仅用于安装兼容。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## Lite 流量架构

从 Lite 适配版开始，**Line Grid 不再拥有流量重置机制**。主题不保存、不编辑、不迁移，也不在浏览器中重新计算账期。

Lite 是唯一真相源：

```text
Lite Client / trafficledger
  ├─ traffic_reset_day              重置策略
  ├─ effective_traffic_limit/type   当前有效额度/计费方式
  ├─ calibrated net_total_up/down   当前账期权威流量
  └─ Lite traffic calibration       账期边界与校准

Lite Metric Store
  └─ traffic.up / traffic.down      历史流量序列

Line Grid
  └─ 只读取并展示以上结果
```

具体规则：

- `common:getNodesLatestStatus` 的 `net_total_up/down` 作为 Lite 当前账期的权威流量值。
- 节点额度优先使用 Lite 的 `effective_traffic_limit / effective_traffic_type`。
- `public:queryMetrics` 只用于近几日历史流量和图表，不覆盖当前账期总量。
- Line Grid 不再提供 `trafficResetDay`、`billingTimeZone`、`trafficResetOverrides`。
- Line Grid 不再提供自定义“流量重置日编辑器”或旧设置迁移器。
- Line Grid 不再根据重置日在浏览器计算 `period_start / period_end`。
- Lite 模式不再显示主题自行推导的“距重置 N 天”和“预计可撑过本账期”等预测。
- 重置日、账期、流量校准和日账本统一在 Lite 自身后台管理。

Lite 后端原生提供流量校准与日流量接口，包括：

```text
/api/admin/client/{uuid}/traffic-calibration
/api/admin/client/{uuid}/traffic-daily
```

这些属于 Lite 管理能力，不由主题复制实现。

## Lite deep-link / Dashboard 导航

`Lite-theme.json` 使用 Lite 要求的普通路径：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

Line Grid 自身仍保留 hash router。`dist/js/lite.js` 会在 `app.js` 启动前把上述 Lite 路径桥接为 Line Grid 内部路由，因此不需要重写主题主路由。

Lite Dashboard 的丢包排行如果附带：

```text
?ping_task=<task_id>
```

兼容层会自动进入节点 Ping 页面，并在对应 Ping Task 控件出现后自动选中它。

## 主要功能

- 桌面端和移动端自适应节点列表、详情、网络与资源视图
- RPC2 / Metric Store 实时状态、Ping 历史和流量历史
- Lite 当前账期流量与有效额度展示
- 节点搜索、异常筛选和 Last Seen
- Low / Medium / High 三档地球渲染精度
- 节点地区、城市、经纬度、服务商、回程线路等扩展元数据
- 管理员回程线路编辑
- 财务信息按币种聚合和续费提醒
- GeoIP / ASN 可选增强，并限制为完整公网 IP 才允许外发查询

## 数据接口

主题主要使用：

- `common:getNodes`
- `common:getNodesLatestStatus`
- `common:getRecords`（Ping）
- `common:getPublicInfo`
- `public:queryMetrics`（历史流量）
- `common:getMe`
- `admin:getClient`
- `admin:editClient`（回程线路标签）

## Lite 与旧 Komari

### Komari Lite

Lite 后端完全负责流量生命周期：

```text
Lite trafficledger
  -> 当前账期校准流量
  -> net_total_up/down
  -> Line Grid 当前用量

Lite effective traffic quota
  -> effective_traffic_limit/type
  -> Line Grid 配额展示

Lite Metric Store
  -> traffic.up / traffic.down
  -> Line Grid 近几日历史图表
```

### 旧 Komari

仓库暂时保留 `komari-theme.json` 和旧 adapter，以避免安装兼容性被一次性打断；但 manifest 已不再暴露主题级流量重置配置。

旧 adapter 中与旧后端兼容有关的历史代码不会参与 Lite 运行时。后续如果彻底停止支持旧 Komari，可单独删除这部分兼容层，而不影响 Lite 数据模型。

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
- `cpu_threads`
- `renewal_price_cny`
- `return_routes`

Lite 的流量重置和账期字段不通过 metadata 覆盖。

## GeoIP / ASN

GeoIP / ASN 默认关闭。可选择：

- `ip.sb`
- `ipinfo.io`
- `ipwho.is`
- `ipapi.co`

只有完整且可公开路由的 IP 才允许发送给第三方 GeoIP 服务；被 Lite 隐藏、打码、私网、文档网段、保留或无效的地址都会跳过外部查询。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

测试会验证：

- JavaScript 语法
- Komari/Lite adapter 基础语义
- Lite clean-path → hash-router deep-link 桥接
- `ping_task` 自动选择对应 Ping Task
- 双 manifest 一致性与 Lite navigation 合约
- manifest 不再包含主题级流量重置设置
- 发布包不再包含自定义重置日编辑器
- Lite API 路径不再调用主题侧 `billingWindow`
- GeoIP 公网 IP 门禁
- 自包含 HTML 可重复构建
- ZIP 完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 与 Komari Lite 均为独立项目；本主题通过其公开 RPC2 / 主题机制运行，不包含服务端主程序代码。
