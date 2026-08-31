# Line Grid

Line Grid 是 [nuomiiiii/Lite](https://github.com/nuomiiiii/Lite) 的第三方主题。v0.5.1 起仅支持 Lite；Komari 兼容版冻结在 `release/v0.4.3`。

## 功能

- List / Grid / Column；Overview / Latency / Traffic / System。
- 1H / 6H / 24H / 7D 延迟、多 Ping Task、流量、资源与费用概况。
- CPU / RAM / Disk 历史读取 Lite；Globe 城市定位、异常提示与移动端适配。
- Web / System 字体；GeoIP / ASN 可选增强。

## 安装与数据

从 Release 下载 `komari-line-grid-vX.Y.Z.zip` 在 Lite 导入。安装包仅含 `Lite-theme.json`、`preview.svg`、`dist/index.html`。

节点、状态、账期和历史以 Lite RPC2 / Metric Store 为准，主题不提供后端接口。GeoIP 默认关闭；费用仅登录后显示。

## 开发

源码仅在 `src/`。`./scripts/test.sh` 测试，`./scripts/package.sh` 打包。

## 上游与许可

基于 [selkk-lab/mmwx-theme-line-grid](https://github.com/selkk-lab/mmwx-theme-line-grid) 移植与重构；运行环境为 [nuomiiiii/Lite](https://github.com/nuomiiiii/Lite)。本项目采用 [MIT License](./LICENSE)。
