# Line Grid — Lite Theme

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Lite 公共监控主题。

> **当前版本：v0.5.6。** 从 v0.5.1 开始，Line Grid 仅面向 Lite；原版 Komari 兼容线冻结在 v0.4.3。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## 版本线

| 版本 | 后端 | 状态 | 分支 |
| --- | --- | --- | --- |
| **v0.5.6** | **Lite** | 当前稳定线，Lite-only | [`main`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/main) |
| **v0.4.3** | 原版 Komari | Legacy，冻结维护 | [`release/v0.4.3`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/release/v0.4.3) |

需要原版 Komari 兼容时，请固定使用 **v0.4.3 / `release/v0.4.3`**。v0.5.1 及以后版本不保证可在原版 Komari 上安装或运行。

## v0.5.6 架构原则

Line Grid 在 Lite 上定位为尽可能轻的 **只读展示层**：

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
- Line Grid 不再建立第二套流量重置配置，也不写回 Lite 客户端配置。
- Line Grid 不再维护原版 Komari 的兼容数据模型、Return tags 或旧 adapter。
- Lite 已有的管理功能优先直接使用 Lite System UI。
- 主题只保留公共展示层真正有价值的能力，例如 Globe、城市/坐标增强、异常摘要、费用聚合和紧凑可视化。

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
- Line Grid 可根据 Lite 提供的重置日显示“距重置 N 天”和账期范围，但不写回 Lite。

## 节点顺序与导航

Line Grid 跟随 Lite 原生节点顺序：

```text
weight ASC → created_at ASC → uuid ASC
```

`Lite-theme.json` 使用 Lite 普通路径：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

并支持 Lite Dashboard 的 `ping_task` deep link。

## 主要功能

- 桌面端与移动端节点 List / Grid / Column 视图
- Overview / Latency / Traffic / System 节点详情
- Lite RPC2 实时状态和 Metric Store Ping / 流量历史
- 1h / 6h / 24h / 7D 延迟范围与多 Ping Task 合并
- Lite 当前账期流量、有效额度、重置倒计时与流量预测
- 节点搜索、Last Seen 与异常筛选
- 异常原因提示：离线、高延迟、高丢包、高资源、高流量、临期/过期
- Low / Medium / High 三档 Globe 渲染精度
- 城市、经纬度、服务商和可选 GeoIP / ASN 增强
- 费用中心：月均总计、年化预算、剩余价值、到期风险、原始账单与续费明细
- 移动端节点详情和各视图信息密度统一优化

## 主要数据接口

v0.5.6 只读取 Lite 公共接口：

```text
common:getNodes
common:getNodesLatestStatus
common:getPublicInfo
common:getRecords
public:queryMetrics
common:getMe
```

管理员功能交给 Lite System UI；主题运行时不依赖 `admin:getClient / admin:editClient`。

## Return Route

Lite 已拥有独立 Return Route 系统，包括任务、当前状态、线路识别、ASN / Route Path、切线/恢复判断、事件历史和通知。

v0.5.6 不再维护 Line Grid 自己的 `linegrid:return:*` tags、Return 页面或编辑器。三网回程以 Lite 原生能力为准。

## IP 与隐私

Line Grid 遵循 Lite 后端返回的权限结果：

- 登录状态下显示 Lite 允许返回的完整 IPv4 / IPv6。
- 未登录状态只显示 Lite 后端允许公开的脱敏地址。
- 主题不会尝试绕过 Lite 权限恢复完整 IP。
- GeoIP / ASN 默认关闭；仅完整、有效、可公开路由的 IP 才允许发送给所选第三方 GeoIP 服务。
- 打码、私网、文档网段、保留或无效地址全部跳过第三方查询。

## 扩展元数据

扩展 metadata 只保存 Lite 原生模型没有、且主题展示确实需要的信息，例如：

```text
provider_name
provider_url
region_city
longitude
latitude
```

以下信息优先直接读取 Lite，不建立第二份配置：

```text
traffic_reset_day
billing_timezone
offline_server_position
price / billing_cycle / currency
return_routes
```

## 发布包

v0.5.6 的安装包保持最小化，仅包含：

```text
Lite-theme.json
preview.svg
dist/index.html
```

`dist/index.html` 为自包含发布页，构建阶段会内联 CSS、JavaScript、metadata 和本地图像资源。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

v0.5.6 的自动验证覆盖：

- Lite RPC2 数据语义与原生节点顺序
- navigation / deep-link / Ping Task
- 当前账期流量、额度、重置显示和 Metric Store 历史
- GeoIP 公网 IP 门禁与权限感知 IP 展示
- Globe 重绘和自动旋转参数
- 延迟多时间范围与多线路图表
- Traffic 7 日布局、System 硬件信息和费用中心
- 异常节点提示与移动端详情布局
- 最终运行时死代码清理
- 自包含 HTML 可重复构建与最小安装包完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Lite 与原版 Komari 均为独立项目；Line Grid v0.5.1+ 仅以 Lite 的公开 RPC2 / 主题机制为目标运行环境。
