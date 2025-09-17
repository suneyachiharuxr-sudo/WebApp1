// src/RentalsList.jsx
import { useEffect, useMemo, useState } from "react";
import "./RentalsList.css";

/* ===== 共通: 空レスでも落ちない JSON パーサ ===== */
async function readJsonSafe(res) {
    const text = await res.text(); // 空でもOK
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

/**
 * 貸出状況一覧
 * - /rentals/list を表示
 * - 資産番号クリックで機器詳細モーダル
 * - モーダルから /rentals/rent /rentals/return を実行
 */
export default function RentalsList() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const [openAsset, setOpenAsset] = useState(null);

    const fetchAll = async () => {
        setLoading(true);
        setErr("");
        try {
            const res = await fetch("/rentals/list");
            const data = await readJsonSafe(res);
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");

    return (
        <section className="rentals-card">
            <div className="rentals-head">
                <h2 className="rentals-title">貸出状況一覧</h2>
                <button
                    className="btn ghost icon"
                    onClick={fetchAll}
                    aria-label="再読み込み"
                    title="再読み込み"
                >
                    <span className="icon-refresh">⟳</span>
                    <span className="sr-only">再読み込み</span>
                </button>
            </div>

            {loading && <div className="msg">読み込み中…</div>}
            {err && <div className="error">{err}</div>}

            {!loading && !err && (
                <div className="r-table-viewport">
                    <table className="r-table">
                        <thead>
                            <tr>
                                <th style={{ width: 70 }}>No</th>
                                <th>資産番号</th>
                                <th>メーカー</th>
                                <th>OS</th>
                                <th>保管場所</th>
                                <th>社員番号</th>
                                <th>社員氏名</th>
                                <th>貸出日</th>
                                <th>返却日</th>
                                <th>返却締切日</th>
                                <th>状態</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r, i) => (
                                <tr key={`${r.assetNo}-${i}`}>
                                    <td>{r.no ?? i + 1}</td>
                                    <td className="cell-link">
                                        <button className="link" onClick={() => setOpenAsset(r)}>
                                            {r.assetNo}
                                        </button>
                                    </td>
                                    <td>{r.maker || ""}</td>
                                    <td>{r.os || ""}</td>
                                    <td>{r.location || ""}</td>
                                    <td>{r.employeeNo || ""}</td>
                                    <td>{r.employeeName || ""}</td>
                                    <td>{fmt(r.rentalDate)}</td>
                                    <td>{fmt(r.returnDate)}</td>
                                    <td>{fmt(r.dueDate)}</td>
                                    <td>
                                        <span className={`badge ${r.isFree ? "free" : "busy"}`}>
                                            {r.isFree ? "空き" : "貸出中"}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="empty">
                                        データがありません
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {openAsset && (
                <DeviceRentDialog
                    row={openAsset}
                    onClose={() => setOpenAsset(null)}
                    onChanged={async () => {
                        await fetchAll();
                        setOpenAsset(null);
                    }}
                />
            )}
        </section>
    );
}

/* ========= モーダル ========= */
function DeviceRentDialog({ row, onClose, onChanged }) {
    const [detail, setDetail] = useState(null);
    const [latestRow, setLatestRow] = useState(row); // 一覧の行→開いたら最新に更新
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const asset = row.assetNo;

    // ログイン情報から社員番号
    const auth = useMemo(() => {
        try {
            return JSON.parse(localStorage.getItem("auth") || "{}");
        } catch {
            return {};
        }
    }, []);
    const currentEmployeeNo = auth?.employeeNo;

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErr("");
            try {
                // 1) 機器詳細
                const resDev = await fetch(`/device/${encodeURIComponent(asset)}`);
                const dev = await readJsonSafe(resDev);
                if (!resDev.ok)
                    throw new Error(dev?.message || "機器情報の取得に失敗しました");
                setDetail(dev);

                // 2) 最新状況（開いてから状態が変わっていないか確認）
                const resList = await fetch("/rentals/list");
                const list = await readJsonSafe(resList);
                if (!resList.ok)
                    throw new Error(list?.message || "最新の貸出状況取得に失敗しました");
                const fresh = (Array.isArray(list) ? list : []).find(
                    (x) => x.assetNo === asset
                );
                if (fresh) setLatestRow(fresh);
            } catch (e) {
                setErr(e.message || "サーバーに接続できません");
            } finally {
                setLoading(false);
            }
        })();
    }, [asset]);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");
    const cap = (n) => (n == null ? "" : n >= 1024 ? `${n / 1024}TB` : `${n}GB`);

    const busy = !latestRow?.isFree;
    const borrowerEmpNo = latestRow?.employeeNo || null;

    // ★ 借りている本人だけ返却可
    const canReturn = busy && borrowerEmpNo && currentEmployeeNo && borrowerEmpNo === currentEmployeeNo;

    const checkout = async () => {
        if (busy) {
            alert("この資産は未返却の貸出が存在します");
            return;
        }
        if (!currentEmployeeNo) {
            alert("ログイン情報が見つかりません");
            return;
        }
        if (!window.confirm("この機器を貸出します。よろしいですか？")) return;

        try {
            const res = await fetch("/rentals/rent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetNo: asset, employeeNo: currentEmployeeNo }),
            });
            const data = await readJsonSafe(res);
            if (!res.ok)
                throw new Error(data?.message || `貸出に失敗しました (HTTP ${res.status})`);
            alert("貸出しました");
            onChanged?.();
        } catch (e) {
            alert(e.message || "貸出に失敗しました");
        }
    };

    const doReturn = async () => {
        if (!canReturn) {
            alert("返却できるのは借りている本人のみです。");
            return;
        }
        if (!window.confirm("返却します。よろしいですか？")) return;
        try {
            const res = await fetch("/rentals/return", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetNo: asset, employeeNo: currentEmployeeNo }), // ← 追加
            });
            const data = await readJsonSafe(res);
            if (!res.ok) {
                // サーバー側は本人以外なら 403 を返す実装
                if (res.status === 403) {
                    throw new Error("借りている本人のみ返却できます。");
                }
                throw new Error(data?.message || `返却に失敗しました (HTTP ${res.status})`);
            }
            alert("返却しました");
            onChanged?.();
        } catch (e) {
            alert(e.message || "返却に失敗しました");
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="rent-modal">
                <div className="rent-modal__header">
                    <div>機器情報</div>
                    <button className="btn ghost" onClick={onClose}>
                        ×
                    </button>
                </div>

                <div className="rent-modal__body">
                    {loading && <div className="msg">読み込み中…</div>}
                    {err && <div className="error">{err}</div>}

                    {!loading && !err && (
                        <>
                            {latestRow && row && latestRow.isFree !== row.isFree && (
                                <div className="warn">
                                    表示中に状態が更新されました：現在は
                                    <b>{latestRow.isFree ? "空き" : "貸出中"}</b>です
                                </div>
                            )}

                            <div className="kv">
                                <div className="k">資産番号</div>
                                <div className="v">{asset}</div>
                                <div className="k">メーカー</div>
                                <div className="v">{detail?.maker || row.maker || ""}</div>
                                <div className="k">OS</div>
                                <div className="v">{detail?.os ?? row.os ?? ""}</div>
                                <div className="k">メモリ</div>
                                <div className="v">
                                    {detail?.memoryGb != null ? `${detail.memoryGb}GB` : ""}
                                </div>
                                <div className="k">容量</div>
                                <div className="v">{cap(detail?.storageGb)}</div>
                                <div className="k">GPU</div>
                                <div className="v">{detail?.gpu || ""}</div>
                                <div className="k">故障</div>
                                <div className="v">{detail?.brokenFlag ? "〇" : ""}</div>
                                <div className="k">備考</div>
                                <div className="v">{detail?.remarks || ""}</div>
                                <div className="k">登録日</div>
                                <div className="v">{fmt(detail?.registerDate)}</div>
                            </div>

                            <hr className="sep" />

                            <div className="kv">
                                <div className="k">状態</div>
                                <div className="v">
                                    <span className={`badge ${busy ? "busy" : "free"}`}>
                                        {busy ? "貸出中" : "空き"}
                                    </span>
                                </div>
                                <div className="k">現在の借用者</div>
                                <div className="v">
                                    {borrowerEmpNo ? `${borrowerEmpNo}${latestRow?.employeeName ? ` / ${latestRow.employeeName}` : ""}` : ""}
                                </div>
                                <div className="k">貸出日</div>
                                <div className="v">{fmt(latestRow?.rentalDate)}</div>
                                <div className="k">返却締切日</div>
                                <div className="v">{fmt(latestRow?.dueDate)}</div>
                            </div>

                            {busy && !canReturn && (
                                <div className="warn" style={{ marginTop: 12 }}>
                                    他のユーザーが借りています。返却操作は借用者本人のみ可能です。
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="rent-modal__foot">
                    {!busy ? (
                        <button className="btn primary" onClick={checkout}>
                            貸出
                        </button>
                    ) : canReturn ? (
                        <button className="btn danger" onClick={doReturn}>
                            返却
                        </button>
                    ) : null /* 借用者以外はボタン非表示（キャンセルだけ） */}
                    <button className="btn" onClick={onClose}>
                        キャンセル
                    </button>
                </div>
            </div>
        </div>
    );
}
