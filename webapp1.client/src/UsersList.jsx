import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./UsersList.css";
import Portal from "./Portal"; // 最前面に出すためのポータル

export default function UsersList() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [deleteMode, setDeleteMode] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    // 作成/編集/削除
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState(null); // { ...row }
    const [confirmDel, setConfirmDel] = useState(null); // employeeNo

    // ===== 上部横スクロールバー =====
    const tableWrapRef = useRef(null);
    const topScrollRef = useRef(null);
    const [hWidth, setHWidth] = useState(0);
    const [needX, setNeedX] = useState(false);

    useLayoutEffect(() => {
        const el = tableWrapRef.current;
        if (!el) return;
        const update = () => {
            setHWidth(el.scrollWidth);
            setNeedX(el.scrollWidth > el.clientWidth);
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
        if (body) body.scrollLeft = e.currentTarget.scrollLeft;
    };
    const onBodyScroll = (e) => {
        const top = topScrollRef.current;
        if (top) top.scrollLeft = e.currentTarget.scrollLeft;
    };

    // ===== データ取得 =====
    const fetchAll = async () => {
        setLoading(true);
        setErr("");
        try {
            const res = await fetch("/users/list");
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || "取得に失敗しました");
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchAll(); }, []);

    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "");
    const sex = (g) => (g === 0 ? "男性" : g === 1 ? "女性" : g === 2 ? "その他" : "");

    // ===== API helpers =====
    const createUser = async (payload) => {
        const res = await fetch("/users/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "登録に失敗しました");
    };

    const updateUser = async (payload) => {
        const res = await fetch("/users/update", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "更新に失敗しました");
    };

    const deleteUser = async (employeeNo) => {
        const res = await fetch("/users/delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeNo }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "削除に失敗しました");
    };

    // 空行時の列数（編集列 + 削除列(任意) + 初期9列 + 詳細6列）
    const emptyColSpan = 1 + (deleteMode ? 1 : 0) + 9 + (showDetails ? 6 : 0);

    return (
        <section className="users-card">
            <div className="users-page">
                <div className="page-title">ユーザー一覧</div>

                <div className="toolbar two-sides">
                    <div className="left-group">
                        <button className="btn" title="新規" onClick={() => setShowCreate(true)}>＋</button>
                        <button
                            className={`btn ${deleteMode ? "active" : ""}`}
                            title="削除モード"
                            onClick={() => setDeleteMode(v => !v)}
                        >－</button>
                    </div>
                    <div className="right-group">
                        <button className="btn" title="再読込" onClick={fetchAll}>⟳</button>
                        <button
                            className={`btn ${showDetails ? "active" : ""}`}
                            title="詳細列の表示/非表示"
                            onClick={() => setShowDetails(s => !s)}
                        >…</button>
                    </div>
                </div>

                {needX && (
                    <div className="hscroll-top" ref={topScrollRef} onScroll={onTopScroll}>
                        <div style={{ width: hWidth, height: 1 }} />
                    </div>
                )}

                {loading && <div className="msg">読み込み中…</div>}
                {err && <div className="error">{err}</div>}

                {!loading && !err && (
                    <div className="table-viewport">
                        <div
                            className={`table-wrapper ${showDetails ? "with-x-scroll" : ""}`}
                            ref={tableWrapRef}
                            onScroll={onBodyScroll}
                        >
                            <table className={`users-table ${deleteMode ? "has-delete" : ""}`}>
                                <thead>
                                    <tr>
                                        <th className="sticky-col col-edit" style={{ width: 48 }}></th>
                                        {deleteMode && <th style={{ width: 44 }}></th>}
                                        <th className="w-emp sticky-col col-emp">社員番号</th>
                                        <th className="w-name sticky-col col-name">氏名</th>
                                        <th className="w-kana">フリガナ</th>
                                        <th className="w-tel">電話番号</th>
                                        <th className="w-mail">メール</th>
                                        <th className="w-pos">役職</th>
                                        <th className="w-auth">権限</th>
                                        <th className="w-udt">更新日</th>
                                        {showDetails && (
                                            <>
                                                <th className="w-dept">所属部署</th>
                                                <th className="w-age">年齢</th>
                                                <th className="w-gen">性別</th>
                                                <th className="w-ret">退職日</th>
                                                <th className="w-reg">登録日</th>
                                                
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => (
                                        <tr key={r.employeeNo}>
                                            <td className="cell-icon sticky-col col-edit">
                                                <button className="icon edit" title="編集" onClick={() => setEditing(r)}>✎</button>
                                            </td>
                                            {deleteMode && (
                                                <td className="cell-icon">
                                                    <button
                                                        className="icon danger"
                                                        title="削除"
                                                        onClick={() => setConfirmDel(r.employeeNo)}
                                                    >－</button>
                                                </td>
                                            )}
                                            <td className="w-emp sticky-col col-emp" title={r.employeeNo}>{r.employeeNo}</td>
                                            <td className="w-name sticky-col col-name" title={r.name || ""}>{r.name || ""}</td>
                                            <td className="w-kana" title={r.nameKana || ""}>{r.nameKana || ""}</td>
                                            <td className="w-tel" title={r.telNo || ""}>{r.telNo || ""}</td>
                                            <td className="w-mail" title={r.mailAddress || ""}>{r.mailAddress || ""}</td>
                                            <td className="w-pos" title={r.position || ""}>{r.position || ""}</td>
                                            <td className="w-auth" title={r.accountLevel || ""}>{r.accountLevel || ""}</td>
                                            {/* 更新日 */}
                                            <td className="w-udt">{fmtDate(r.updateDate)}</td>

                                            {showDetails && (
                                                <>
                                                    <td className="w-dept" title={r.department || ""}>{r.department || ""}</td>
                                                    <td className="w-age">{r.age ?? ""}</td>
                                                    <td className="w-gen">{sex(r.gender)}</td>
                                                    {/* 退職日 */}
                                                    <td className="w-ret">{fmtDate(r.retireDate)}</td>
                                                    <td className="w-reg">{fmtDate(r.registerDate)}</td>
                                                    <td className="w-del"></td>
                                                </>
                                            )}
                                        </tr>
                                    ))}

                                    {rows.length === 0 && (
                                        <tr>
                                            <td colSpan={emptyColSpan} className="empty">データがありません</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 新規作成（Portalで最前面に） ── */}
            {showCreate && (
                <Portal>
                    <UserModal
                        title="新規ユーザー登録"
                        onClose={() => setShowCreate(false)}
                        onSubmit={async (payload) => {
                            try {
                                await createUser(payload);
                                setShowCreate(false);
                                await fetchAll();
                            } catch (e) {
                                alert(e.message || "登録に失敗しました");
                            }
                        }}
                    />
                </Portal>
            )}

            {/* ── 編集（Portal）── */}
            {editing && (
                <Portal>
                    <UserModal
                        title="ユーザー情報編集"
                        initial={editing}
                        onClose={() => setEditing(null)}
                        onSubmit={async (payload) => {
                            try {
                                await updateUser(payload);
                                setEditing(null);
                                await fetchAll();
                            } catch (e) {
                                alert(e.message || "更新に失敗しました");
                            }
                        }}
                    />
                </Portal>
            )}

            {/* ── 削除確認（Portal）── */}
            {confirmDel && (
                <Portal>
                    <ConfirmDialog
                        title="本当に削除しますか？"
                        okText="はい"
                        cancelText="いいえ"
                        onOk={async () => {
                            try {
                                await deleteUser(confirmDel);
                            } catch (e) {
                                alert(e.message || "削除に失敗しました");
                            }
                            setConfirmDel(null);
                            await fetchAll();
                        }}
                        onCancel={() => setConfirmDel(null)}
                    />
                </Portal>
            )}
        </section>
    );
}

/* ------ モーダル（新規/編集 共通） ------ */
function UserModal({ title, initial, onClose, onSubmit }) {
    const [f, setF] = useState(() => ({
        employeeNo: initial?.employeeNo || "",
        name: initial?.name || "",
        nameKana: initial?.nameKana || "",
        department: initial?.department || "",
        telNo: initial?.telNo || "",
        mailAddress: initial?.mailAddress || "",
        age: initial?.age ?? "",
        gender: initial?.gender ?? "",
        position: initial?.position || "",
        accountLevel: initial?.accountLevel || "",
        retireDate: initial?.retireDate ? String(initial.retireDate).slice(0, 10) : "",
        deleteFlag: !!initial?.deleteFlag,
    }));
    const isEdit = !!initial;

    const submit = async (e) => {
        e.preventDefault();
        const payload = {
            employeeNo: f.employeeNo.trim(),
            name: f.name.trim(),
            nameKana: f.nameKana.trim() || null,
            department: f.department.trim() || null,
            telNo: f.telNo.trim() || null,
            mailAddress: f.mailAddress.trim() || null,
            age: f.age === "" ? null : Number(f.age),
            gender: f.gender === "" ? null : Number(f.gender),
            position: f.position.trim() || null,
            accountLevel: f.accountLevel.trim() || null,
            retireDate: f.retireDate || null,
            deleteFlag: !!f.deleteFlag,
        };
        await onSubmit(payload);
    };

    return (
        <div className="modal-backdrop">
            <div className="modal">
                <div className="modal-header">{title}</div>

                <form className="modal-body" onSubmit={submit}>
                    <div className="grid">
                        <label>社員番号</label>
                        <input
                            value={f.employeeNo}
                            onChange={(e) => setF({ ...f, employeeNo: e.target.value })}
                            disabled={isEdit}
                            required
                        />

                        <label>氏名</label>
                        <input
                            value={f.name}
                            onChange={(e) => setF({ ...f, name: e.target.value })}
                            required
                        />

                        <label>フリガナ</label>
                        <input
                            value={f.nameKana}
                            onChange={(e) => setF({ ...f, nameKana: e.target.value })}
                        />

                        <label>所属部署</label>
                        <input
                            value={f.department}
                            onChange={(e) => setF({ ...f, department: e.target.value })}
                        />

                        <label>電話番号</label>
                        <input
                            value={f.telNo}
                            onChange={(e) => setF({ ...f, telNo: e.target.value })}
                        />

                        <label>メール</label>
                        <input
                            type="email"
                            value={f.mailAddress}
                            onChange={(e) => setF({ ...f, mailAddress: e.target.value })}
                        />

                        <label>年齢</label>
                        <input
                            type="number"
                            value={f.age}
                            onChange={(e) => setF({ ...f, age: e.target.value })}
                        />

                        <label>性別</label>
                        <select
                            value={f.gender}
                            onChange={(e) => setF({ ...f, gender: e.target.value })}
                        >
                            <option value="">（未設定）</option>
                            <option value="0">男性</option>
                            <option value="1">女性</option>
                            <option value="2">その他</option>
                        </select>

                        <label>役職</label>
                        <input
                            value={f.position}
                            onChange={(e) => setF({ ...f, position: e.target.value })}
                        />

                        <label>権限</label>
                        <input
                            value={f.accountLevel}
                            onChange={(e) => setF({ ...f, accountLevel: e.target.value })}
                        />

                        <label>退職日</label>
                        <input
                            type="date"
                            value={f.retireDate}
                            onChange={(e) => setF({ ...f, retireDate: e.target.value })}
                        />

                        <label>論理削除</label>
                        <input
                            type="checkbox"
                            checked={f.deleteFlag}
                            onChange={(e) => setF({ ...f, deleteFlag: e.target.checked })}
                        />
                    </div>

                    <div className="modal-actions">
                        <button type="submit" className="btn primary">
                            {isEdit ? "変更" : "登録"}
                        </button>
                        <button type="button" className="btn" onClick={onClose}>
                            キャンセル
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ------ 削除確認 ------ */
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
