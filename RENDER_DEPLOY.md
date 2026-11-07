# Dexman ゲームサーバーのRender Free公開

リポジトリ：https://github.com/tombee-studio/dexman

## 現在の実装範囲

4人のルーム、自動チーム分け、移動、キューブ・誘爆、バグ生成／除去、3種のスキル、スタン・強化、勝敗・再戦、途中参加の観戦を実装。フロントは `dexman/web`、サーバーは `dexman/server`。公開URLは https://dexman.onrender.com 。

## Renderで設定する値

Renderの「New → Web Service」で指定リポジトリを接続する。通常のWeb Service作成でも、ルートのrender.yamlを使うBlueprintでも設定できる。

| 項目 | 値 |
|---|---|
| Name | dexman-server |
| Runtime | Node |
| Root Directory | dexman/server |
| Build Command | npm ci |
| Start Command | npm start |
| Instance Type | Free |
| Health Check Path | /health |
| NODE_VERSION | 22.22.0 |

DBやディスクなどの追加サービスは作成しない。画面は別途GPT Sitesへ公開する。

無料インスタンスでも帯域・ビルド枠の超過は別扱い。0円で止めたい場合は支払い方法を登録していないことを確認する。既に登録済みなら、課金設定を確認してから公開する。有料プランへは変更しない。

## 公開後の確認

1. Renderのログで起動エラーがないことを確認する。
2. Renderが発行したURLの `/health` を開き、`ok: true`、`stage: "game"`、`protocol: 2` のJSONが返ることを確認する。
3. Node.js 22以上の環境で `dexman/server` に移動し、`npm ci`、`npm test` を実行する。
4. PowerShellでは `$env:SERVER_URL = 'https://実際のサービス名.onrender.com'` を設定して `node --import tsx game-smoke.ts` を実行する。サーバー名は実際のRender応答からコピーする。
5. 4クライアントの参加、同じ2対2割り当て、切断キャンセル、再参加後のカウントダウンを確認する。

スリープ復帰には約1分かかるため、最初にhealthへアクセスしてから接続テストを行う。再起動するとメモリ上のルームは失われる。

Render連携からの公開にはアカウント接続が必要。パスワードやAPIキーをチャットに貼る必要はない。

参照：[無料枠](https://render.com/docs/free)、[Node.js公開手順](https://render.com/docs/deploy-node-express-app)、[Blueprint](https://render.com/docs/blueprint-spec)。
