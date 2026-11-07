# Dexman 技術構成

更新日：2026年11月7日
状態：フロントエンドもRenderへ移行。管理画面のRoot Directory／Build Commandの変更後に一体配信する。

## 採用構成

| 用途 | 技術 |
|---|---|
| フロント | React 19・TypeScript・Vite 8 |
| ゲーム描画 | Phaser 3.90.0 |
| 対戦サーバー | Node.js 22・Colyseus |
| 画面・素材配信 | Express 5 |
| 通信 | 同一オリジンのHTTP／WebSocket、本番はHTTPS／WSS |
| 公開先 | 既存のRender Freeサービス dexman |
| データ保存 | 対戦はメモリ上。戦績保存なし |
| 依存管理 | dexmanをルートとするnpmワークスペース |

Sites・Cloudflareの実行環境は使わない。React画面をViteで静的ファイルにビルドし、web/distをExpressから配信する。WebSocketとHTTPを同じポート・ドメインで扱うため、別のフロント用サービスやCORS設定は不要。

## ディレクトリ

```text
dexman/
  package.json       ワークスペース共通のbuild／start／test
  package-lock.json  一括インストール用の依存固定
  web/               React・Phaser、静的ビルド先dist/
  server/            ゲームルール・ルーム・Express
```

旧Sitesスターターの補助ファイルは履歴を保つため残すが、実際の画面エントリーはweb/index.htmlとmain.tsx。Viteと型チェックは実際に使うコードだけを対象にする。

## ゲームの同期

サーバーを唯一の判定元とし、移動・キューブ・誘爆・スキル・スタン・バグ生成／除去・勝敗を判定する。50msごとに処理し、対戦中は100msごとに状態を配信する。固定の実行ログイベントは別メッセージで送り、再参加時に直近50件を復元する。Phaser側は位置を補間して描画する。

数値はserver/game.tsのRULESにまとめる。型・設定のフロント側コピーはweb/scripts/sync-game-protocol.mjsで生成する。

## Render設定

Root Directory：dexman
Build Command：npm ci --include=dev && npm run build
Start Command：npm start
Health Check：/health
Node.js：22.22.0

ダッシュボードから作成した既存サービスはrender.yamlの変更だけでは設定が変わらない。管理画面から同じ値を適用する。Root Directoryの外のファイルは利用できないため、従来のdexman/serverのままではwebをビルドできない。[Render公式](https://render.com/docs/monorepo-support)

## 無料運用

有料プランへの変更・追加サーバー・独自ドメイン購入は行わない。Render Freeの通信量・ビルド時間などの上限はアカウント設定で確認する。スリープ復帰に時間がかかる場合がある。再起動・デプロイで進行中の試合は失われる。

## 検証

ゲーム本体は34件のルールテスト、4人＋観戦者の通信テスト、Chromeでの4画面操作・実際の3分経過・再戦を検証済み。今回の移行でもクリーンな一括インストール、型チェック、34件のルールテスト、本番用静的ビルド、ExpressでのHTML・素材配信、同一オリジンでのChrome 4画面対戦と観戦・スキル、WebSocket通信が成功。異なる物理PC間の体感遅延と大規模負荷は未検証。
## 連続移動とデバッグ

移動の衝突判定・時間積分はshared/movement.tsをサーバーとクライアントで共用する。サーバーは連続座標を50msごとに更新する。入力には順序番号を付け、古い入力は無視する。クライアントは未確認入力だけを再生して即時描画し、確定位置との差を滑らかに補正する。他プレイヤーはサーバー時刻を使った100msの補間を行い、通信が止まった際の予測を制限する。pingの往復時間から時刻差を推定し、描画は毎フレームの時計を使う。

プロトコルは3。更新後はブラウザを再読み込みする。初期版の250ms単位の座標ジャンプは廃止し、速度自体は4マス／秒を維持する。

デバッグ対戦は接続を偽装せず、サーバー内のCPUプレイヤー3人を実際のゲームルールで処理する。ホスト1人・観戦なしの場合だけ開始し、通常対戦の参加者を置き換えない。途中終了はCPU入り対戦のホストに限定する。

検証：34件のテスト、通常4人＋観戦者の実通信・Chrome操作、1人＋CPU3人での開始・終了・再実行が成功。受信を180ms遅らせたChromeテストで、応答前の移動開始、停止、壁との衝突、スキルを確認した。