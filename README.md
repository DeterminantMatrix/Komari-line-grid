# Line Grid — Lite Theme

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Lite 公共监控主题。

> **从 v0.5.1 开始，Line Grid 仅面向 Lite。** 不再以兼容原版 Komari 为设计目标，也不会继续维护 Komari 专用数据模型、流量重置、回程标签或旧 adapter。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## 版本分支

| 版本线 | 后端 | 状态 | 分支 |
| --- | --- | --- | --- |
| **v0.5.1+** | **Lite** | 当前开发线，Lite-only | [`release/v0.5.1`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/release/v0.5.1) |
| **v0.4.3** | 原版 Komari | Legacy，冻结维护 | [`release/v0.4.3`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/release/v0.4.3) |

需要原版 Komari 兼容时，请固定使用 **v0.4.3 / `release/v0.4.3`**。v0.5.1 及以后版本不保证可在原版 Komari 上安装或运行。

## v0.5.1 架构原则

Line Grid 在 Lite 上定位为一个尽可能轻的 **只读展示层**：

```text
Lite
  ├─ Client / trafficledger     节点、额度、流量、重置策略
  ├─ Metric Store               Ping / 流量历史
  ├─ Return Route               三网回程探测与状态
  ├─ Billing / Cost Center      成本与到期信息
  └─ System UI                  管理功能
          │
          ▼
Line Grid Public Theme
  └─ 读取 + 展示 + 轻量展示层计算
```

原则：

- Lite 是节点、流量、账期、额度、排序和管理状态的唯一真相源。
- Line Grid 不再建立第二套流量重置配置。
- Line Grid 不再维护原版 Komari 的兼容数据模型。
- Lite 已有的管理功能优先直接使用 Lite，而不是在主题内重复实现。
- 主题保留 Lite 原生公开接口缺少、但对展示有价值的能力，例如 Globe、城市/坐标增强和紧凑可视化。

## Lite 流量架构

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

- `common:getNodesLatestStatus` 的 `net_total_up/down` 作为当前账期权威流量。
- 节点额度使用 Lite 的 `effective_traffic_limit / effective_traffic_type`。
- `public:queryMetrics` 仅用于历史流量和趋势展示，不覆盖当前账期总量。
- 重置配置、流量校准和日账本统一由 Lite 后台管理。
- Line Grid 可以根据 Lite 提供的重置日显示“距重置 N 天”和账期范围，但不写回 Lite。

## Lite 节点顺序

Line Grid 跟随 Lite 的原生节点顺序：

```text
weight ASC → created_at ASC → uuid ASC
```

`common:getNodes` 返回 UUID map，因此主题只负责从 Lite 字段恢复该顺序，不建立自己的默认排序体系。

## Lite 导航

`Lite-theme.json` 使用 Lite 的普通路径：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

主题内部可以继续使用轻量路由，但外部入口遵循 Lite navigation contract。

## 主要功能

- 桌面端和移动端节点列表、详情、网络与资源视图
- Lite RPC2 / Metric Store 实时状态、Ping 历史和流量历史
- Lite 当前账期流量、有效额度和重置倒计时
- 按 Lite 原生顺序展示节点
- 节点搜索、异常筛选和 Last Seen
- Low / Medium / High 三档 Globe 渲染精度
- 城市、经纬度、服务商和 GeoIP / ASN 可选增强
- 财务信息聚合和续费提醒

## 主要数据接口

v0.5.1 以 Lite 公共数据接口为核心：

```text
common:getNodes
common:getNodesLatestStatus
common:getRecords
common:getPublicInfo
public:queryMetrics
```

管理员功能原则上交给 Lite System UI，不再为了主题自身的数据模型长期依赖 `admin:getClient / admin:editClient`。

## 三网回程

Lite 已经拥有独立的 Return Route 系统，包括任务、当前状态、线路识别、ASN/Route Path、切线/恢复判断、事件历史和通知。

v0.5.1 不再把 Line Grid 自己的 `linegrid:return:*` tags 视为长期数据源。三网回程以 Lite 原生能力为准，主题侧不再维护第二套 Return 数据与编辑器。

## IP 与隐私

Line Grid 不再对 Lite 返回的节点 IP 做第二次打码，而是遵循 Lite 后端的权限结果：

- 管理员登录状态：显示 Lite 返回的完整 IPv4 / IPv6。
- 未登录状态：只显示 Lite 后端允许公开的脱敏地址；主题不会尝试绕过后端权限恢复完整 IP。
- GeoIP / ASN 外部查询仍只允许完整、有效、可公开路由的 IP；打码、私网、保留和无效地址全部跳过第三方查询。

当前 Lite 上游在开启“向访客发送 IP”时会对 IPv4 进行后端脱敏，因此访客能看到的具体网段粒度由 Lite 决定，而不是由主题决定。

## 扩展元数据

扩展 metadata 只应保存 Lite 原生模型没有、且主题展示确实需要的信息，例如：

```text
provider_name
provider_url
region_city
longitude
latitude
```

以下信息应优先直接读取 Lite，不再建立第二份配置：

```text
traffic_reset_day
billing_timezone
offline_server_position
price / billing_cycle / currency
return_routes
```

## GeoIP / ASN

GeoIP / ASN 默认关闭。仅完整且可公开路由的节点 IP 才允许发送给第三方 GeoIP 服务；被 Lite 隐藏、打码、私网、文档网段、保留或无效的地址必须跳过外部查询。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

v0.5.1 的测试目标：

- Lite RPC2 数据语义
- Lite navigation / deep-link
- Lite 原生节点顺序
- Lite 当前账期流量与重置显示
- Metric Store 历史数据
- GeoIP 公网 IP 门禁
- 权限感知的 IP 展示
- Globe 重绘与自动旋转参数
- Traffic 单日 / 少量历史柱状图布局
- 自包含 HTML 可重复构建
- Lite 安装包完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Lite 与原版 Komari 均为独立项目；Line Grid v0.5.1+ 仅以 Lite 的公开 RPC2 / 主题机制为目标运行环境。
