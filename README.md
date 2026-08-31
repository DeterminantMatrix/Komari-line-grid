# Line Grid

Line Grid 是 [nuomiiiii/Lite](https://github.com/nuomiiiii/Lite) 的第三方监控主题。v0.5.1 起仅支持 Lite；Komari 兼容版冻结在 `release/v0.4.3`。

## 功能

- List / Grid / Column 与 Overview / Latency / Traffic / System。
- 1H / 6H / 24H / 7D 延迟、多 Ping Task、真实时间轴、流量额度、资源概况。
- Globe、搜索、Last Seen、异常提示、费用/到期、移动端适配。
- GeoIP / ASN 可选增强。

## 安装

从 Release 下载 `komari-line-grid-vX.Y.Z.zip` 并在 Lite 中导入。包内仅有 `Lite-theme.json`、`preview.svg`、`dist/index.html`。

## 数据与隐私

节点、状态、账期和历史以 Lite RPC2 / Metric Store 为准；主题只读。访客 IP 遵循 Lite 权限；仅启用 GeoIP 后，完整公网 IP 才可外发查询。费用仅登录后显示。

## 开发

`./scripts/test.sh` · `./scripts/package.sh`

## 上游与许可

基于上游 [selkk-lab/mmwx-theme-line-grid](https://github.com/selkk-lab/mmwx-theme-line-grid) 移植与重构。运行环境：[nuomiiiii/Lite](https://github.com/nuomiiiii/Lite)。

本项目采用 [MIT License](./LICENSE)。
