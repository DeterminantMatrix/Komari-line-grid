# Komari Line Grid （Komari 主题）

将 `selkk-lab/mmwx-theme-line-grid` 的视觉、布局和交互移植到 Komari Monitor，并使用 Komari 当前 RPC2 / Metric Store 数据接口。当前仓库包含可直接导入的 v0.4.3 构建产物。

<img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/c0a48171-4bc4-4d24-a261-1190163f85c0" /><img width="430" height="307" alt="image" src="https://github.com/user-attachments/assets/9f71965f-ebcd-426e-9701-5c9b44624ba2" />

## v0.4.3

v0.4.3 是工程与账期正确性版本。在 v0.4.2 的三档地球精度基础上，重点处理构建一致性、账期时区、第三方服务调用和自动验证：

- 后台可选择 `Billing Time Zone / 流量账期时区`，默认 `Asia/Shanghai`
- 账期起止、每日流量归档、周期流量筛选和“距重置”倒计时统一使用同一 IANA 时区
- 重置日仍支持 1～31；短月份会自动落到该月最后一天
- 构建流程改为 `src/index.html` + 模块资源生成自包含 `dist/index.html`，避免源码与发布页不同步
- `scripts/build-release.js --check` 可检测仓库中的发布页是否过期
- GitHub Actions 自动执行语法、适配器、账期时区、构建一致性和 ZIP 完整性测试
- 汇率数据在确认登录状态后才加载；访客页面不再为隐藏的财务信息发起无意义汇率请求
- GeoIP 可选择首选服务商，默认 `ip.sb`；“失败时尝试其他服务商”默认关闭
- 管理端节点流量重置编辑器使用版本化 URL，减少升级后 iframe 缓存旧页面的问题

## 主要功能

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
- `common:getRecords`：Ping 历史和 Metric Store 不可用时的流量历史回退
- `public:queryMetrics`：`traffic.up` / `traffic.down` 历史流量

不需要修改 Komari 主程序。

## 流量账期与时区

后台 `Line Grid 设置 → 流量账期` 中可以设置：

- 默认流量重置日：1～31
- 流量账期时区：默认 `Asia/Shanghai`
- 每节点独立流量重置日

账期时区采用 IANA 名称。它不是单纯的显示设置，而是用于：

- 计算当前账期 `period_start / period_end`
- 将 Metric Store 的流量点归到正确的自然日
- 重建 fallback 日流量
- 计算首页“距重置 N 天”

因此访问者本地时区不会再改变同一 VPS 的账期边界。

## 安装

推荐直接在 Komari 后台“导入远程主题”中输入仓库地址：

```text
https://github.com/DeterminantMatrix/Komari-line-grid
```

也可以本地打包：

```bash
./scripts/test.sh
./scripts/package.sh
```

打包文件会按 manifest 版本生成，例如：

```text
komari-line-grid-v0.4.3.zip
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

`dist/index.html` 是自包含发布页面；`dist/js/` 和 `dist/css/` 是维护源码。`src/index.html` 是发布页模板，`scripts/build-release.js` 会把模块和本地图片内联到最终 HTML。

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
- `billing_timezone`
- `cpu_threads`
- `renewal_price_cny`
- `return_routes`

也可在页面加载前注入 `window.LINE_GRID_METADATA` 覆盖 JSON 同名字段。

## GeoIP / ASN

GeoIP / ASN 默认关闭。开启后可选择首选公共 GeoIP 服务：

- `ip.sb`
- `ipinfo.io`
- `ipwho.is`
- `ipapi.co`

默认只请求首选服务。只有额外开启“GeoIP 失败时尝试其他服务商”，失败查询才会继续尝试其他提供商。

## 开发与验证

```bash
node scripts/build-release.js
node scripts/build-release.js --check
./scripts/test.sh
```

验证包括：

- JavaScript 语法检查
- Komari adapter 语义测试
- Billing Time Zone 边界和 31 日短月测试
- JSON 与主题元数据完整性
- 自包含 HTML 可重复构建检查
- 本地图片内联检查
- ZIP 发布包完整性

## 上游与许可

视觉、布局和交互设计移植自 `selkk-lab/mmwx-theme-line-grid`，上游使用 MIT License。本仓库保留上游版权与许可说明。

Komari 是独立项目，本主题只通过其公开 RPC2 / 主题机制运行，不包含 Komari 主程序代码。
