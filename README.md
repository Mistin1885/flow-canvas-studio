# Flow Canvas Studio

可自行架設的多人流程工作台。所有通過 Access 的成員可建立及命名工作區與畫布，並把任一畫布完整複製到同一個或其他工作區。每張畫布自行定義節點、分類、群組和子流程。

## 在本機開啟

環境需要 Python 3.12（搭配 uv 或 venv 與 pip）、Node.js 22.12+ 或 24，以及 npm。首次安裝需要連上 PyPI 與 npm。

```bash
cd /path/to/flow-canvas-studio
./setup.sh
./start.sh --local
```

開啟 [本機工作台](http://127.0.0.1:8768/)。首次啟動會建立「團隊工作區」。建立一張畫布後，可在工作台的工具選單匯入既有 JSON。工作區列表中的複製按鈕會讓你選擇目的工作區及副本名稱。網址包含畫布 ID，可以分享給同一網站的其他成員。

## 共編

按「套用變更」、拖曳節點、修改連線或套用匯入後，網站會提交該動作涉及的變更。SQLite 在同一交易內檢查各項版本。不同節點可同時儲存，同一項目的舊版本會收到 HTTP 409。開啟編輯表單時，其他人的更新會等到表單關閉，保留正在輸入的內容。衝突時可下載自己的 JSON、另存成新畫布，或明確放棄自己的草稿以載入團隊版本。未獲確認的提交會盡量暫存在目前分頁的 sessionStorage。尚未按套用的表單仍在分頁記憶體內。

WebSocket 只通知同畫布的客戶端，收到已提交的版號後重新取得一致的畫布快照。斷線會自動重連並核對版號。前端沿用 DFx 的框線、子流程、拖曳、樣式、節點與連線編輯、閱讀設定及離線 HTML 匯出。React Flow 節點總覽使用 ELK 排版，點選節點可返回工作台定位。此版本沿用原工作台單畫布 300 個節點及 800 條一般連線的匯入限制。

## Cloudflare Access 與 GitHub

1. 在 Cloudflare Zero Trust 設定 GitHub 為身分提供者。在 GitHub 建立 OAuth App，callback URL 填入 `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`，將 Client ID 與 secret 填入 Cloudflare 的 GitHub IdP。
2. 建立 Self-hosted Access application，保護網站整個 hostname，包含 `/api/*`、靜態頁及 WebSocket。只啟用 GitHub，開啟 **Apply instant authentication**。
3. 建立 Allow policy，使用 **GitHub organization** 選擇指定的 organization，並在同一條 selector 指定 team。該應用程式的所有 Allow 規則都要符合預期的成員範圍。以指定 team 內、外各一個帳號確認放行與拒絕。
4. 複製 `.env.example` 為 `.env`，填入 team issuer、該 Access application 的 AUD 與對外 HTTPS origin。GitHub OAuth secret 由 Cloudflare 保存。
5. 在同台機器將 Cloudflare Tunnel 的應用路由指向 `http://127.0.0.1:8768`，以 `./start.sh` 啟動，並從公開 hostname 開啟。

網站沿用 Cloudflare 驗證過的 GitHub 身分，以 Access 提供的電子郵件顯示成員身分。已有效的 Access session 可直接進入。需要 GitHub 驗證時，瀏覽器會導回 GitHub 並沿用該網站的既有登入狀態。初次 OAuth 同意、MFA 與組織授權仍由 GitHub 控制。伺服器對 HTTP 與 WebSocket 都驗證 Access JWT 的簽章、issuer、audience 及期限。允許的 organization/team 由 Access policy 控制。

[GitHub IdP 設定](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/github/) · [Access application 與 Instant Auth](https://developers.cloudflare.com/learning-paths/clientless-access/access-application/create-access-app/) · [驗證 Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

## 資料位置與移機

預設資料庫位於 repo 同層的 `../flow-canvas-studio-data/studio.sqlite3`。可用 `FLOW_DATA_DIR` 指向其他本機磁碟目錄。程式碼、依賴與前端 build 均在 repo 內，工作區、畫布、節點、連線、自訂欄位和匯入的內嵌圖片均在資料庫內。外部 URL 仍由原網址提供。

| 表 | 儲存內容 |
| --- | --- |
| workspaces | 工作區 ID、名稱、建立時間 |
| canvases | 所屬工作區、畫布 ID、名稱、版號、最後編輯者與時間 |
| nodes | 畫布內唯一節點 ID、完整 JSON 及版本 |
| edges | 起點與終點的畫布內外鍵、完整 JSON 及版本。刪除節點會一起移除相關連線 |
| meta | 畫布層級欄位及各欄版本，含分類、群組、來源資料、框線連結與子流程 |

服務使用 SQLite WAL 與單一 Uvicorn worker，讓同一程序可以通知所有線上成員。結構版本記在 `PRAGMA user_version`。資料備份保留 IDs、版本及可攜 JSON 的自訂欄位。畫布的目錄名稱可以獨立於原始流程 JSON 的 title 修改。

**線上備份**可在服務運作時執行。若 `.env` 有自訂資料位置，在相同設定下執行備份。

```bash
cd /path/to/flow-canvas-studio
if [ -f .env ]; then set -a; . ./.env; set +a; fi
.venv/bin/python -m studio.backup "../studio-$(date +%Y%m%d-%H%M%S).sqlite3"
```

備份命令會透過 SQLite backup API 讀取一致快照、檢查資料完整性，再建立單一檔案。目標檔名必須尚未使用。線上直接複製單一 `studio.sqlite3` 可能遺漏仍在 WAL 的變更。

**移機**時，先暫停編輯並關閉舊服務，做最後一次備份。將 repo 與該備份分開複製到新主機。在新主機指定一個新的資料目錄，將備份放成 `studio.sqlite3`。也可停機後直接複製整個資料目錄，包含現存的 SQLite sidecar 檔。切勿把舊 WAL 和新快照混在一起。

```bash
# 在新主機的 repo 根目錄，restore_dir 必須是新的目錄
restore_dir="$PWD/../flow-canvas-studio-restored"
mkdir -m 700 "$restore_dir"
cp /path/to/backup.sqlite3 "$restore_dir/studio.sqlite3"
./setup.sh
FLOW_DATA_DIR="$restore_dir" ./start.sh --local
```

若 `.env` 已設定 `FLOW_DATA_DIR`，請將它改成同一個還原目錄。先確認工作區及畫布內容，再設定新主機的 Access 環境與 Tunnel 路由並使用 `./start.sh`。本機模式限 loopback，正式模式預設要求 Access。

## 驗證

```bash
if command -v uv >/dev/null; then uv pip install --python .venv/bin/python httpx; else .venv/bin/python -m pip install httpx; fi
.venv/bin/python -m unittest discover -s tests -v
(cd frontend && npm run build)
```

後端測試使用獨立暫存資料庫，涵蓋雙連線通知、寫入衝突、交易回滾、跨工作區複製、移機還原及 Access 身分驗證。若以 `FLOW_TEST_GRAPH` 指定 repo 外的測試用流程 JSON，還會比較匯入與匯出的完整 JSON。


雙瀏覽器驗證會建立臨時資料目錄及服務，在兩個獨立 Chromium context 內編輯同一節點，檢查衝突草稿可在重新整理後另存。先完成前端 build，再執行下列命令。

```bash
cd frontend
npx playwright install chromium
npm run test:browser
```

若主機已安裝 Chrome，可改用 `CHROME_BIN=/usr/bin/google-chrome npm run test:browser`。
