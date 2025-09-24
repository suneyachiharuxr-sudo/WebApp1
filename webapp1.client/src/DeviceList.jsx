import { useEffect, useState, useRef, useLayoutEffect } from "react";
import "./DeviceList.css";

export default function DeviceList() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [deleteMode, setDeleteMode] = useState(false);
    const [showDetails, setShowDetails] = useState(false); // 追加列の表示/非表示

    // モーダル制御
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState(null);        // { ...row }
    const [confirmDel, setConfirmDel] = useState(null);  // assetNo

    // ===== 上部横スクロールバー用 =====
    const tableWrapRef = useRef(null);   // 下の本体（.table-wrapper）
    const topScrollRef = useRef(null);   // 上の薄いバー
    const [hWidth, setHWidth] = useState(0);
    const [needX, setNeedX] = useState(false);

    useLayoutEffect(() => {
        const el = tableWrapRef.current;
        if (!el) return;

        const update = () => {
            setHWidth(el.scrollWidth);
            setNeedX(el.scrollWidth > el.clientWidth); // はみ出す時だけ上バーを表示
        };

        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        window.addEventListener("resize", update);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [rows, showDetails]);

    const onTopScroll = (e) => {
        const body = tableWrapRef.current;
        if (!body) return;
        body.scrollLeft = e.currentTarget.scrollLeft;
    };
    const onBodyScroll = (e) => {
        const top = topScrollRef.current;
        if (!top) return;
        top.scrollLeft = e.currentTarget.scrollLeft;
    };
    // ================================

    const fetchAll = async () => {
        setLoading(true);
        setErr("");
        try {
            const res = await fetch("/device/list");
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || "取得に失敗しました");
            setRows(data);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchAll(); }, []);

    const formatCap = (v) => {
        if (v == null || v === "") return "";
        const n = Number(v);
        if (Number.isNaN(n)) return String(v);
        return n >= 1000 ? `${(n / 1000)}TB` : `${n}GB`;
    };

    // --- CRUD ---
    const createDevice = async (payload) => {
        const res = await fetch("/device/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "登録に失敗しました");
    };

    const updateDevice = async (payload) => {
        const res = await fetch("/device/update", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "更新に失敗しました");
    };

    const deleteDevice = async (assetNo) => {
        const res = await fetch("/device/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetNo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "削除に失敗しました");
    };

    // --- UI ---
    return (
        <section className="devices-card">{/* 丸背景カードの幅コントロール */}
            <div className="device-page">
                <div className="page-title">機器一覧</div>

                <div className="toolbar two-sides">
                    {/* 左：＋／－ */}
                    <div className="left-group">
                        <button className="btn" title="新規" onClick={() => setShowCreate(true)}>＋</button>
                        <button
                            className={`btn ${deleteMode ? "active" : ""}`}
                            title="削除モード"
                            onClick={() => setDeleteMode(v => !v)}
                        >－</button>
                    </div>

                    {/* 右：⟳／… */}
                    <div className="right-group">
                        <button className="btn" title="再読込" onClick={fetchAll}>⟳</button>
                        <button
                            className={`btn ${showDetails ? "active" : ""}`}
                            title="詳細列の表示/非表示"
                            onClick={() => setShowDetails(s => !s)}
                        >…</button>
                    </div>
                </div>


                {/* ★ 追加：途中に出す横スクロールバー（必要な時だけ表示） */}
                {needX && (
                    <div className="hscroll-top" ref={topScrollRef} onScroll={onTopScroll}>
                        <div style={{ width: hWidth, height: 1 }} />
                    </div>
                )}

                {loading && <div className="msg">読み込み中…</div>}
                {err && <div className="error">{err}</div>}

                {!loading && !err && (
                    <div className="table-viewport">
                        {/* 詳細ONのときだけ横スクロール許可 */}
                        <div
                            className={`table-wrapper ${showDetails ? "with-x-scroll" : ""}`}
                            ref={tableWrapRef}
                            onScroll={onBodyScroll}
                        >
                            <table className="device-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 48 }}></th>
                                        {deleteMode && <th style={{ width: 44 }}></th>}
                                        {/* 初期の8列 */}
                                        <th className="w-asset">資産番号</th>
                                        <th className="w-maker">メーカー</th>
                                        <th className="w-os">OS</th>
                                        <th className="w-mem">メモリ</th>
                                        <th className="w-cap">容量</th>
                                        <th className="w-gpu">グラフィックボード</th>
                                        <th className="w-loc">保管場所</th>
                                        <th className="w-broken">故障</th>
                                        {/* 詳細（ON時のみ） */}
                                        {showDetails && (
                                            <>
                                                <th>リース開始日</th>
                                                <th>リース期限</th>
                                                <th>備考</th>
                                                <th>登録日</th>
                                                <th>更新日</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.assetNo}>
                                            <td className="cell-icon">
                                                <button className="icon edit" title="編集" onClick={() => setEditing(r)}>✎</button>
                                            </td>
                                            {deleteMode && (
                                                <td className="cell-icon">
                                                    <button className="icon danger" title="削除" onClick={() => setConfirmDel(r.assetNo)}>－</button>
                                                </td>
                                            )}
                                            <td className="w-asset" title={r.assetNo}>{r.assetNo}</td>
                                            <td className="w-maker" title={r.maker}>{r.maker}</td>
                                            <td className="w-os" title={r.os || ""}>{r.os || ""}</td>
                                            <td className="w-mem" title={r.memoryGb != null ? r.memoryGb + "GB" : ""}>
                                                {r.memoryGb != null ? r.memoryGb + "GB" : ""}
                                            </td>
                                            <td className="w-cap" title={formatCap(r.storageGb)}>{formatCap(r.storageGb)}</td>
                                            <td className="w-gpu" title={r.gpu || ""}>{r.gpu || ""}</td>
                                            <td className="w-loc" title={r.location || ""}>{r.location || ""}</td>
                                            <td className="w-broken">{r.brokenFlag ? "〇" : ""}</td>

                                            {showDetails && (
                                                <>
                                                    <td>{r.leaseStart ? r.leaseStart.slice(0, 10) : ""}</td>
                                                    <td>{r.leaseEnd ? r.leaseEnd.slice(0, 10) : ""}</td>
                                                    <td className="remarks" title={r.remarks || ""}>{r.remarks || ""}</td>
                                                    <td>{r.registerDate ? r.registerDate.slice(0, 10) : ""}</td>
                                                    <td>{r.updateDate ? r.updateDate.slice(0, 10) : ""}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ── モーダル ── */}
            {showCreate && (
                <DeviceModal
                    title="新規機器登録"
                    onClose={() => setShowCreate(false)}
                    onSubmit={async (payload) => {
                        await createDevice(payload);
                        setShowCreate(false);
                        await fetchAll();
                    }}
                />
            )}

            {editing && (
                <DeviceModal
                    title="機器情報編集"
                    initial={editing}
                    onClose={() => setEditing(null)}
                    onSubmit={async (payload) => {
                        await updateDevice(payload);
                        setEditing(null);
                        await fetchAll();
                    }}
                />
            )}

            {confirmDel && (
                <ConfirmDialog
                    title="本当に削除しますか？"
                    okText="はい"
                    cancelText="いいえ"
                    onOk={async () => {
                        await deleteDevice(confirmDel);
                        setConfirmDel(null);
                        await fetchAll();
                    }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}
        </section>
    );
}

/* ---------- モーダル（新規/編集 共通） ---------- */
function DeviceModal({ title, initial, onClose, onSubmit }) {
    const [f, setF] = useState(() => ({
        assetNo: initial?.assetNo || "",
        maker: initial?.maker || "",
        os: initial?.os || "",
        memoryGb: initial?.memoryGb ?? "",
        storageGb: initial?.storageGb ?? "",
        gpu: initial?.gpu || "",
        location: initial?.location || "",
        brokenFlag: !!initial?.brokenFlag,
        leaseStart: initial?.leaseStart?.slice?.(0, 10) || "",
        leaseEnd: initial?.leaseEnd?.slice?.(0, 10) || "",
        remarks: initial?.remarks || "",
    }));
    const isEdit = !!initial;

    const submit = async (e) => {
        e.preventDefault();
        const payload = {
            assetNo: f.assetNo.trim(),
            maker: f.maker.trim(),
            os: f.os.trim() || null,
            memoryGb: f.memoryGb === "" ? null : Number(f.memoryGb),
            storageGb: f.storageGb === "" ? null : Number(f.storageGb),
            gpu: f.gpu.trim() || null,
            location: f.location.trim() || null,
            brokenFlag: !!f.brokenFlag,
            leaseStart: f.leaseStart || null,
            leaseEnd: f.leaseEnd || null,
            remarks: f.remarks.trim() || null
        };
        await onSubmit(payload);
    };

    return (
        <div className="modal-backdrop">
            <div className="modal">
                <div className="modal-header">{title}</div>

                <form className="modal-body" onSubmit={submit}>
                    <div className="grid">
                        <label>資産番号</label>
                        <input value={f.assetNo} onChange={e => setF({ ...f, assetNo: e.target.value })} disabled={isEdit} required />

                        <label>メーカー</label>
                        <input value={f.maker} onChange={e => setF({ ...f, maker: e.target.value })} required />

                        <label>OS</label>
                        <input value={f.os} onChange={e => setF({ ...f, os: e.target.value })} />

                        <label>メモリ(GB)</label>
                        <input type="number" value={f.memoryGb} onChange={e => setF({ ...f, memoryGb: e.target.value })} />

                        <label>容量(GB)</label>
                        <input type="number" value={f.storageGb} onChange={e => setF({ ...f, storageGb: e.target.value })} />

                        <label>グラフィックボード</label>
                        <input value={f.gpu} onChange={e => setF({ ...f, gpu: e.target.value })} />

                        <label>保管場所</label>
                        <input value={f.location} onChange={e => setF({ ...f, location: e.target.value })} />

                        <label>故障</label>
                        <input type="checkbox" checked={f.brokenFlag} onChange={e => setF({ ...f, brokenFlag: e.target.checked })} />

                        <label>リース開始日</label>
                        <input type="date" value={f.leaseStart} onChange={e => setF({ ...f, leaseStart: e.target.value })} />

                        <label>リース期限</label>
                        <input type="date" value={f.leaseEnd} onChange={e => setF({ ...f, leaseEnd: e.target.value })} />

                        <label className="area-label">備考</label>
                        <textarea className="area" value={f.remarks} onChange={e => setF({ ...f, remarks: e.target.value })} />
                    </div>

                    <div className="modal-actions">
                        <button type="submit" className="btn primary">{isEdit ? "変更" : "登録"}</button>
                        <button type="button" className="btn" onClick={onClose}>キャンセル</button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ---------- 削除確認 ---------- */
function ConfirmDialog({ title, okText = "OK", cancelText = "Cancel", onOk, onCancel }) {
    return (
        <div className="modal-backdrop">
            <div className="confirm">
                <div className="confirm-title">{title}</div>
                <div className="confirm-actions">
                    <button className="btn primary" onClick={onOk}>{okText}</button>
                    <button className="btn" onClick={onCancel}>{cancelText}</button>
                </div>
            </div>
        </div>
    );
}
