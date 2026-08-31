# Line Grid — Komari / Lite 主题

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari 系列监控面板。当前仓库同时提供 `Lite-theme.json` 与 `komari-theme.json`；Lite 是当前主要适配目标，旧 manifest 仅用于安装兼容。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## Lite 流量架构

从 Lite 适配版开始，**Line Grid 不再拥有独立的流量重置机制**。主题不保存、不编辑、不迁移第二套重置配置，Lite 是流量账期与计费状态的唯一真相源。

```text
Lite Client / trafficledger
  ├─ traffic_reset_day              重置策略
  ├─ effective_traffic_limit/type   当前有效额度/计费方式
  ├─ calibrated net_total_up/down   当前账期权威流量
  └─ traffic calibration            账期与校准

Lite Metric Store
  └─ traffic.up / traffic.down      历史流量序列

Line Grid
  └─ 读取 + 展示 + 展示层预测
```

具体规则：

- `common:getNodesLatestStatus` 的 `net_total_up/down` 作为 Lite 当前账期的权威流量值。
- 节点额度使用 Lite 的 `effective_traffic_limit / effective_traffic_type`。
- `public:queryMetrics` 只用于历史流量、日流量图表和展示层趋势分析，不覆盖当前账期总量。
- Line Grid 不提供 `trafficResetDay`、`billingTimeZone`、`trafficResetOverrides`。
- Line Grid 不提供自定义重置日编辑器，也不迁移旧主题重置配置。
- Lite 原生 `traffic_reset_day` 可以被 Line Grid 读取，用于显示“距重置 N 天”和账期起止日期；这一计算只影响 UI，不参与流量统计、校准或后台配置。
- Lite 的账期规则使用 Asia/Shanghai；Line Grid 的显示窗口按相同规则镜像，并处理每月 29/30/31 日的月底截断。
- Traffic 页的额度耗尽预测属于展示层预测：以 Lite 当前用量、Lite 限额、Metric Store 历史流量和 Lite 重置日为输入，不写回 Lite，也不改变任何账期状态。
- 重置配置、流量校准和日账本始终统一在 Lite 后台管理。

Lite 后端原生提供流量管理接口，包括：

```text
/api/admin/client/{uuid}/traffic-calibration
/api/admin/client/{uuid}/traffic-daily
```

这些属于 Lite 管理能力，不由主题复制实现。

## Lite 节点顺序

Lite 后端的默认节点顺序是：

```text
weight ASC → created_at ASC → uuid ASC
```

`common:getNodes` 最终返回 UUID map，因此 JSON 对象本身不能可靠表达查询顺序。Line Grid 会读取 Lite 节点的 `weight / created_at / uuid` 重建这一原生顺序。

Lite manifest 的 `offlineServerPosition` 默认值为 `Keep`，所以默认不会因为节点离线而再次改变 Lite 后台顺序。用户主动选择 First / Last 时才进行额外位置调整。

## Lite deep-link / Dashboard 导航

`Lite-theme.json` 使用 Lite 要求的普通路径：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

Line Grid 自身仍保留 hash router。`dist/js/lite.js` 会在 `app.js` 启动前把上述 Lite 路径桥接为 Line Grid 内部路由。

Lite Dashboard 的丢包排行如果附带：

```text
?ping_task=<task_id>
```

兼容层会自动进入节点 Ping 页面并选择对应 Ping Task。

## 主要功能

- 桌面端和移动端自适应节点列表、详情、网络与资源视图
- RPC2 / Metric Store 实时状态、Ping 历史和流量历史
- Lite 当前账期流量、有效额度、重置倒计时与展示层预测
- 按 Lite 原生顺序展示节点
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
- `admin:editClient`（仅用于 Line Grid 的回程线路标签编辑，不用于流量重置）

## Lite 与旧 Komari

### Komari Lite

```text
Lite trafficledger
  -> 当前账期校准流量
  -> net_total_up/down
  -> Line Grid 当前用量

Lite effective traffic quota
  -> effective_traffic_limit/type
  -> Line Grid 配额展示

Lite traffic_reset_day
  -> Line Grid 重置日期/倒计时显示
  -> 不写回、不参与计费

Lite Metric Store
  -> traffic.up / traffic.down
  -> Line Grid 历史图表/展示层预测
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
- manifest 不包含主题级流量重置设置
- 发布包不包含自定义重置日编辑器
- Lite API 数据路径不调用旧主题 `billingWindow`
- Lite `traffic_reset_day` 的显示窗口、月底截断、关闭/null 语义
- Lite 原生 `weight → created_at → uuid` 节点顺序
- 默认 `offlineServerPosition=Keep`
- Traffic DOM 兼容写入保持幂等，MutationObserver 不监听 `characterData`，防止自激重绘
- Traffic 预测与重置倒计时不会被 Lite 兼容层隐藏
- GeoIP 公网 IP 门禁
- 自包含 HTML 可重复构建
- ZIP 完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 与 Komari Lite 均为独立项目；本主题通过其公开 RPC2 / 主题机制运行，不包含服务端主程序代码。
