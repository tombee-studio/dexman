# Dexman フロント・対戦サーバーをRender Freeへまとめて公開

リポジトリ：https://github.com/tombee-studio/dexman
公開先：https://dexman.onrender.com

## 既存のdexmanサービスで変更する設定

新しいサービスを作成する必要はありません。RenderのdexmanサービスのSettingsから次を設定してください。Blueprint管理でないサービスでは、GitHub上のrender.yamlを書き換えるだけでは設定は更新されません。

| 項目 | 設定値 |
|---|---|
| Runtime | Node |
| Branch | main |
| Root Directory | dexman |
| Build Command | npm ci --include=dev && npm run build |
| Start Command | npm start |
| Instance Type | Free |
| Health Check Path | /health |
| NODE_VERSION | 22.22.0 |

Root Directoryを変更した際の確認画面でも、上記のBuild CommandとStart Commandを入力してください。保存後、Manual Deploy → Deploy latest commitで再デプロイします。

従来の `dexman/server` をRoot Directoryにしたままだと、Renderでは兄弟フォルダーの `web` が利用できず、画面のビルド・配信ができません。[Render公式のRoot Directory説明](https://render.com/docs/monorepo-support)

## 構成

- `dexman/package.json`：npmワークスペース。serverとwebを一括インストール。
- `web`：React・Vite・Phaser。npm run buildで静的なdistを生成。
- `server`：Node.js・Colyseus・Express。web/distの画面と素材を配信し、同じポートでWebSocket対戦も処理。
- 画面・招待URL・対戦通信はすべて同一のRender URL。
- 追加のDB・有料インスタンス・Sitesは不要。

## 公開後の確認

1. ログに `Frontend ready at /` と表示されることを確認。
2. `/health` のJSONで `ok: true`、`protocol: 3`、`frontend: true` を確認。
3. https://dexman.onrender.com を開き、Dexmanのロビーが表示されることを確認。
4. 1人でルームを作り「CPU3人でテスト」で開始・操作を確認。通常対戦は4人で準備完了後に開始。

`frontend: false` またはログに `Frontend missing` と出る場合は、Root DirectoryとBuild Commandを再確認してください。

## 無料枠

Instance TypeはFreeを維持します。通信量・ビルド時間などの無料枠上限は別途あります。無通信時はスリープし、最初のアクセスに時間がかかる場合があります。再デプロイで進行中の試合は失われます。

Render連携は未接続のため、現在の管理画面の設定はこの作業環境から変更できません。上記の設定変更はアカウント所有者が行ってください。パスワードやAPIキーをチャットに貼る必要はありません。