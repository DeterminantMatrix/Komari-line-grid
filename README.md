# Line Grid — Lite Theme

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Lite 公共监控主题。

> **从 v0.5.1 开始，Line Grid 仅面向 Lite。** 原版 Komari 固定在 v0.4.3；v0.5.1+ 不再携带 Komari manifest、旧 adapter、旧流量重置机制或 Line Grid 自有三网回程数据模型。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## 版本分支

| 版本线 | 后端 | 状态 | 分支 |
| --- | --- | --- | --- |
| **v0.5.1+** | **Lite** | 当前开发线，Lite-only | [`release/v0.5.1`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/release/v0.5.1) |
| **v0.4.3** | 原版 Komari | Legacy，冻结维护 | [`release/v0.4.3`](https://github.com/DeterminantMatrix/Komari-line-grid/tree/release/v0.4.3) |

需要原版 Komari 兼容时，请固定使用 **v0.4.3 / `release/v0.4.3`**。v0.5.1 及以后版本不保证可在原版 Komari 上安装或运行。

## v0.5.1 架构

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
- Line Grid 不建立第二套流量重置配置，也不写入 Lite 节点配置。
- Line Grid 不维护原版 Komari 的兼容数据模型。
- Lite 已有的管理功能直接使用 Lite System UI，不在公共主题中复制管理界面。
- 主题只保留 Lite 公共接口没有、但对展示有价值的能力，例如 Globe、城市/坐标增强和紧凑可视化。

## 当前精简结果

v0.5.1 已移除：

- `komari-theme.json`
- 旧 `komari.js` adapter
- 原版 Komari 流量账期/重置兼容逻辑
- Line Grid 自有 `linegrid:return:*` tags 读取与写入
- Return 编辑器、Return 详情页和 Return 专用 CSS
- `admin:getClient / admin:editClient` 主题写入路径
- 生产环境 Demo 节点数据和 `?demo=1` 运行时
- 安装包中重复的 `dist/js`、`dist/css`、metadata 等已内联资源

旧 `/routes` 链接仅做兼容跳转到节点 Overview，不再恢复旧 Return 功能。

## Lite 流量架构

```text
Lite Client / trafficledger
  ├─ traffic_reset_day              重置策略
  ├─ effective_traffic_limit/type   当前有效额度/计费方式
  └─ calibrated net_total_up/down   当前账期权威流量

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
- Line Grid 根据 Lite 的 `traffic_reset_day` 计算显示用的“距重置 N 天”和账期范围；不写回 Lite，也不参与后台校准。

## Lite 节点顺序

Line Grid 跟随 Lite 的原生节点顺序：

```text
weight ASC → created_at ASC → uuid ASC
```

`common:getNodes` 返回 UUID map，因此主题仅从 Lite 字段恢复该顺序，不建立另一套默认排序体系。

## Lite 导航

`Lite-theme.json` 使用 Lite navigation contract：

```text
/node/{uuid}/overview
/network/node/{uuid}/ping
```

主题内部继续使用轻量 hash router，`lite.js` 只负责 clean-path 桥接和 `ping_task` 定位。

## 主要功能

- 桌面端和移动端节点列表、详情、网络与资源视图
- Lite RPC2 / Metric Store 实时状态、Ping 历史和流量历史
- Lite 当前账期流量、有效额度、重置倒计时和展示层预测
- 按 Lite 原生顺序展示节点
- 节点搜索、异常筛选和 Last Seen
- Low / Medium / High 三档 Globe 渲染精度
- 城市、经纬度、服务商和 GeoIP / ASN 可选增强
- 财务信息聚合和续费提醒

## 数据接口

主题运行时保持只读，主要使用：

```text
common:getNodes
common:getNodesLatestStatus
common:getRecords
common:getPublicInfo
public:queryMetrics
common:getMe
```

不再为了主题自身功能调用 `admin:getClient / admin:editClient`。

## 三网回程

三网回程完全以 Lite 原生 Return Route 为准。Lite 自己负责任务、当前状态、线路识别、ASN/Route Path、切线/恢复判断、事件历史和通知。

Line Grid v0.5.1 不再提供 Return 标签页，也不读取或写入 `linegrid:return:*`。需要配置或查看三网回程时使用 Lite System UI：

```text
/admin/return-route
```

如果未来 Lite 提供适合公共主题使用的只读 Return Route summary API，再考虑在 Line Grid 中增加纯展示视图。

## 扩展元数据

metadata 只保存 Lite 原生模型没有、且主题展示确实需要的信息：

```text
provider_name
provider_url
region_city
longitude
latitude
asn
asn_org
```

节点价格、到期、排序、账期、流量、重置日等均直接读取 Lite，不建立第二份配置。

## GeoIP / ASN

GeoIP / ASN 默认关闭。仅完整且可公开路由的节点 IP 才允许发送给第三方 GeoIP 服务；被 Lite 隐藏、打码、私网、文档网段、保留或无效的地址都会跳过外部查询。

## 安装包

v0.5.1 的 ZIP 只保留 Lite 安装所需的三个文件：

```text
Lite-theme.json
preview.svg
dist/
  index.html
```

`dist/index.html` 是自包含构建产物，CSS、JavaScript、metadata 和 grain 图片均已内联，不再在 ZIP 中重复携带源码资源。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

测试会验证：

- Lite RPC2 数据语义和有效流量额度
- Lite navigation / deep-link / `ping_task`
- Lite 原生 `weight → created_at → uuid` 节点顺序
- Lite 当前账期流量与重置显示
- Metric Store 历史数据
- GeoIP 公网 IP 门禁
- Traffic DOM 更新幂等，防止 MutationObserver 自激重绘
- 发布运行时不包含旧 Komari adapter、Return 写入链或 Demo 数据
- 自包含 HTML 可重复构建
- ZIP 只包含三个安装文件

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Lite 与原版 Komari 均为独立项目；Line Grid v0.5.1+ 仅以 Lite 的公开 RPC2 / 主题机制为目标运行环境。
