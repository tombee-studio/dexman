# Dexman — Glitch vs Patch

PCブラウザから4人で遊ぶ2対2オンラインゲーム。Glitchはバグを広げ、Patchはバグを除去します。

- ゲームURL： https://dexman.onrender.com （Renderの設定変更後、画面と対戦を同一URLで配信）
- ホスティング：Render Freeの既存サービス1台
- フロント： `dexman/web` — React／Vite／Phaser 3.90
- サーバー： `dexman/server` — Node.js 22／Colyseus

## 遊び方

名前を入力してルームを作成、招待URLまたはコードを共有します。4人がスキルを選び準備完了にすると、Glitch／Patchに2人ずつ自動で割り当て、3秒後に開始します。フィールドをクリックしてキーボード操作を開始してください。

| 操作 | キー |
|---|---|
| 移動 | 矢印キー／WASD |
| キューブ設置 | Space |
| 選択したスキル | Shift |

キューブは2秒後に十字方向へ爆発。Glitchはバグを生成、Patchは除去します。敵の爆風に当たると1秒スタンし、その後2秒はスタン無効。ブロックを壊すと30％の確率で強化アイテムが出ます。Dash・Guard・Pushから1つ選べます。

Glitchはバグ占有率60％以上を5秒維持すると勝利。Patchは全除去で勝利。3分経過時は30％以上でGlitch、未満でPatchが勝ちます。結果画面からホストが再戦待機へ戻せます。途中参加は観戦（最大4人）となります。

## 開発と検証

Node.js 22.13以上（22系）を使用します。リポジトリ内のdexmanディレクトリで実行してください。

```text
cd dexman
npm ci --include=dev
npm run build
npm run typecheck
npm test
npm start
```

http://localhost:2567 で画面と対戦サーバーの両方を利用できます。別ターミナルで `cd dexman/server` → `node --import tsx game-smoke.ts` を実行すると、4人＋観戦者の通信を検証します。

画面の開発プレビューはdexmanディレクトリから `npm run dev --workspace dexman-web`。開発時は既定で http://127.0.0.1:2567 のゲームサーバーへ接続します。本番ビルドでは画面と同じオリジンに接続します。別の接続先を指定する場合だけ `VITE_GAME_SERVER` をビルド・起動時に設定します。

`server/game.ts` の公開型・設定を変更したら `npm run sync:protocol --workspace dexman-web` を実行してください。依存バージョンは `dexman/package-lock.json` を一括管理の基準にします。

## 運用

Render Freeは無通信時にスリープします。画面は起動を最長約95秒待ちます。再起動・デプロイでメモリ上のルームは失われ、進行中の試合は中断されます。戦績は保存しません。ホスティング無料枠の上限・課金設定を確認し、有料プランへの変更は行いません。

詳細：[ゲーム仕様](GAME_SPEC.md)、[技術構成](TECH_DESIGN.md)、[Render設定](RENDER_DEPLOY.md)。