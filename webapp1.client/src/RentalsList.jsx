// src/RentalsList.jsx
import { useEffect, useState } from "react";
import "./RentalsList.css";

/**
 * 貸出状況一覧
 * - /rental/list から左結合の結果を取得
 *   期待フィールド:
 *   no, assetNo, maker, os, location,
 *   employeeNo, employeeName, rentalDate, returnDate, dueDate
 * - 資産番号クリックで「機器貸出（詳細）」モーダルを開く
 */
export default function RentalsList() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    // モーダル
    const [openAsset, setOpenAsset] = useState(null); // { assetNo, ...row }

    const fetchAll = async () => {
        setLoading(true);
        setErr("");
        try {
            const res = await fetch("/rentals/list");
               if (!res.ok) {
                     const text = await res.text().catch(() => "");
                    throw new Error(text || `HTTP ${res.status}`);
                   }
              const data = await res.json();
            setRows(data || []);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const openDialog = (row) => setOpenAsset(row);
    const closeDialog = () => setOpenAsset(null);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");

    return (
        <section className="rentals-card">
            <div className="rentals-head">
                <h2 className="rentals-title">貸出状況一覧</h2>
                <button className="btn ghost" onClick={fetchAll}>⟳ 再読込</button>
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
                            {rows.map((r, i) => {
                                const empty = !r.employeeNo; // 社員番号NULLで空き判定
                                return (
                                    <tr key={`${r.assetNo}-${i}`}>
                                        <td>{r.no ?? i + 1}</td>
                                        <td className="cell-link">
                                            <button className="link" onClick={() => openDialog(r)}>
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
                                            <span className={`badge ${empty ? "free" : "busy"}`}>
                                                {empty ? "空き" : "貸出中"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={11} className="empty">データがありません</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {openAsset && (
                <DeviceRentDialog
                    row={openAsset}
                    onClose={closeDialog}
                    onChanged={async () => {
                        await fetchAll();
                        closeDialog();
                    }}
                />
            )}
        </section>
    );
}

/** 機器貸出ダイアログ
 * - 画面表示：MST_DEVICE詳細を表示（必要な拡張項目は /device/list の中から同資産番号を抽出）
 * - 貸出：/rental/checkout
 * - 返却：/rental/return
 */
function DeviceRentDialog({ row, onClose, onChanged }) {
    const [detail, setDetail] = useState(null); // MST_DEVICE詳細
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const asset = row.assetNo;

    useEffect(() => {
        (async () => {
            setLoading(true);
            setErr("");
            try {
                // 簡単実装：/device/list を引いて該当 asset を抽出
                const res = await fetch("/device/list");
                const list = await res.json();
                if (!res.ok) throw new Error(list?.message || "機器情報の取得に失敗しました");
                const found = (list || []).find((x) => x.assetNo === asset);
                setDetail(found || null);
            } catch (e) {
                setErr(e.message || "サーバーに接続できません");
            } finally {
                setLoading(false);
            }
        })();
    }, [asset]);

    const fmt = (d) => (d ? new Date(d).toLocaleDateString() : "");
    const cap = (n) =>
        n == null ? "" : n >= 1024 ? `${n / 1024}TB` : `${n}GB`;

    const checkout = async () => {
        if (!window.confirm("この機器を貸出します。よろしいですか？")) return;
        try {
            const res = await fetch("/rentals/rent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetNo: asset /* 社員番号はサーバ側でログインから解決する or 送る */ }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "貸出に失敗しました");
            alert("貸出しました");
            onChanged?.();
        } catch (e) {
            alert(e.message || "貸出に失敗しました");
        }
    };

    const doReturn = async () => {
        if (!window.confirm("返却します。よろしいですか？")) return;
        try {
            const res = await fetch("/rentals/return", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assetNo: asset }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "返却に失敗しました");
            alert("返却しました");
            onChanged?.();
        } catch (e) {
            alert(e.message || "返却に失敗しました");
        }
    };

    const busy = !!row.employeeNo; // 一覧の行基準で貸出中か判定

    return (
        <div className="modal-backdrop">
            <div className="rent-modal">
                <div className="rent-modal__header">
                    <div>機器情報</div>
                    <button className="btn ghost" onClick={onClose}>×</button>
                </div>

                <div className="rent-modal__body">
                    {loading && <div className="msg">読み込み中…</div>}
                    {err && <div className="error">{err}</div>}

                    {!loading && !err && (
                        <>
                            <div className="kv">
                                <div className="k">資産番号</div><div className="v">{asset}</div>
                                <div className="k">メーカー</div><div className="v">{detail?.maker || row.maker || ""}</div>
                                <div className="k">OS</div><div className="v">{detail?.os ?? row.os ?? ""}</div>
                                <div className="k">メモリ</div><div className="v">{detail?.memoryGb != null ? `${detail.memoryGb}GB` : ""}</div>
                                <div className="k">容量</div><div className="v">{cap(detail?.storageGb)}</div>
                                <div className="k">GPU</div><div className="v">{detail?.gpu || ""}</div>
                                <div className="k">故障</div><div className="v">{detail?.brokenFlag ? "〇" : ""}</div>
                                <div className="k">備考</div><div className="v">{detail?.remarks || ""}</div>
                                <div className="k">登録日</div><div className="v">{fmt(detail?.registerDate)}</div>
                            </div>

                            <hr className="sep" />

                            <div className="kv">
                                <div className="k">状態</div>
                                <div className="v">
                                    <span className={`badge ${busy ? "busy" : "free"}`}>{busy ? "貸出中" : "空き"}</span>
                                </div>
                                <div className="k">使用者</div><div className="v">{row.employeeName || ""}</div>
                                <div className="k">貸出日</div><div className="v">{fmt(row.rentalDate)}</div>
                                <div className="k">返却締切日</div><div className="v">{fmt(row.dueDate)}</div>
                            </div>
                        </>
                    )}
                </div>

                <div className="rent-modal__foot">
                    {!busy ? (
                        <button className="btn primary" onClick={checkout}>貸出</button>
                    ) : (
                        <button className="btn danger" onClick={doReturn}>返却</button>
                    )}
                    <button className="btn" onClick={onClose}>キャンセル</button>
                </div>
            </div>
        </div>
    );
}
