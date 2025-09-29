// src/UsersList.jsx
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import "./UsersList.css";
import Portal from "./Portal";

/* ==== 共通 ==== */
async function readJsonSafe(res) {
    const t = await res.text();
    if (!t) return {};
    try { return JSON.parse(t); } catch { return {}; }
}
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "");
const sex = (g) => (g === 0 ? "男性" : g === 1 ? "女性" : g === 2 ? "その他" : "");

export default function UsersList() {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    // ビュー切替
    const [deleteMode, setDeleteMode] = useState(false);
    const [showDetails, setShowDetails] = useState(false);

    // モーダル群
    const [showCreate, setShowCreate] = useState(false);
    const [editing, setEditing] = useState(null);           // Userオブジェクト
    const [confirmDel, setConfirmDel] = useState(null);     // employeeNo (論理削除)
    const [pwModal, setPwModal] = useState({ open: false, employeeNo: "", name: "" });

    // 横スクロール連動
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

    /* ===== API ===== */
    const fetchAll = async () => {
        setLoading(true); setErr("");
        try {
            const res = await fetch("/users/list");
            const data = await readJsonSafe(res);
            if (!res.ok) throw new Error(data?.message || `HTTP ${res.status}`);
            setRows(Array.isArray(data) ? data : []);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchAll(); }, []);

    const createUser = async (payload) => {
        const res = await fetch("/users/create", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(data?.message || "登録に失敗しました");
        return payload.employeeNo;
    };

    const updateUser = async (payload) => {
        const res = await fetch("/users/update", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(data?.message || "更新に失敗しました");
    };

    // 論理削除API（サーバは /users/soft-delete を実装済み想定）
    const softDeleteUser = async (employeeNo) => {
        const res = await fetch("/users/soft-delete", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeNo })
        });
        const data = await readJsonSafe(res);
        if (!res.ok) throw new Error(data?.message || "削除に失敗しました");
    };

    const checkAuthExists = async (employeeNo) => {
        const r = await fetch(`/auth/exists?employeeNo=${encodeURIComponent(employeeNo)}`);
        const j = await readJsonSafe(r);
        return !!j?.exists;
    };

    // 空行の colspan（編集列 + 削除モード列 + 基本10列 + 詳細5列 + PW列）
    const emptyColSpan = 1 + 8 + (showDetails ? 5 : 0) + 1;

    // 一覧から “パスワード設定”
    const openPasswordSetup = async (user) => {
        try {
            const exists = await checkAuthExists(user.employeeNo);
            if (exists) { alert("パスワードは設定済みです。"); return; }
            setPwModal({ open: true, employeeNo: user.employeeNo, name: user.name || user.employeeNo });
        } catch {
            alert("確認に失敗しました。ネットワークをご確認ください。");
        }
    };

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
                            <table className="users-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 48 }}></th> {/* アクション列は常に1列 */}
                                        <th className="w-emp">社員番号</th>
                                        <th className="w-name">氏名</th>
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
                                        <th className="w-pw">パスワード設定</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(r => {
                                        const retired = !!r.retireDate;
                                        return (
                                            <tr key={r.employeeNo} className={retired ? "row-retired" : ""}>
                                                <td className="cell-icon">
                                            <button
                                              className={`icon ${deleteMode ? "danger" : "edit"}`}
                                              title={deleteMode ? "削除（非表示）" : "編集"}
                                              onClick={() => deleteMode ? setConfirmDel(r.employeeNo) : setEditing(r)}
                                              aria-label={deleteMode ? "削除（非表示）" : "編集"}
                                            >
                                             {deleteMode ? "－" : "✎"}
                                            </button>
                                            </td>
                                                <td className="w-emp" title={r.employeeNo}>{r.employeeNo}</td>
                                                <td className="w-name" title={r.name || ""}>{r.name || ""}</td>
                                                <td className="w-kana" title={r.nameKana || ""}>{r.nameKana || ""}</td>
                                                <td className="w-tel" title={r.telNo || ""}>{r.telNo || ""}</td>
                                                <td className="w-mail" title={r.mailAddress || ""}>{r.mailAddress || ""}</td>
                                                <td className="w-pos" title={r.position || ""}>{r.position || ""}</td>
                                                <td className="w-auth" title={r.accountLevel || ""}>{r.accountLevel || ""}</td>
                                                <td className="w-udt">{fmtDate(r.updateDate)}</td>
                                                {showDetails && (
                                                    <>
                                                        <td className="w-dept" title={r.department || ""}>{r.department || ""}</td>
                                                        <td className="w-age">{r.age ?? ""}</td>
                                                        <td className="w-gen">{sex(r.gender)}</td>
                                                        <td className="w-ret">{fmtDate(r.retireDate)}</td>
                                                        <td className="w-reg">{fmtDate(r.registerDate)}</td>
                                                    </>
                                                )}
                                                <td className="w-pw">
                                                    <button className="btn" onClick={() => openPasswordSetup(r)}>
                                                        設定
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={emptyColSpan} className="empty">データがありません</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* ▼ 詳細ボタンをテーブルの上ではなく下に配置 */}
            <div className="fab-bottom-right">
                <button
                    className={`btn ${showDetails ? "active" : ""}`}
                    title="詳細列の表示/非表示"
                    onClick={() => setShowDetails(s => !s)}
                    aria-label="詳細列の表示/非表示"
                >…</button>
            </div>

            {/* 新規 */}
            {showCreate && (
                <UserModal
                    title="新規ユーザー登録"
                    onClose={() => setShowCreate(false)}
                    onSubmit={async (payload) => {
                        try {
                            const employeeNo = await createUser(payload);
                            setShowCreate(false);
                            await fetchAll();

                            // パスワード未設定なら案内
                            try {
                                const exists = await checkAuthExists(employeeNo);
                                if (!exists) {
                                    const go = window.confirm("このユーザーはパスワード未設定です。今すぐ設定しますか？");
                                    if (go) setPwModal({ open: true, employeeNo, name: payload.name || employeeNo });
                                }
                            } catch { /* 後から一覧で設定可 */ }
                        } catch (e) {
                            alert(e.message || "登録に失敗しました");
                        }
                    }}
                />
            )}

            {/* 編集 */}
            {editing && (
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
            )}

            {/* 論理削除 確認 */}
            {confirmDel && (
                <ConfirmDialog
                    title="このユーザーを削除します。よろしいですか？"
                    okText="はい"
                    cancelText="いいえ"
                    onOk={async () => {
                        try { await softDeleteUser(confirmDel); }
                        catch (e) { alert(e.message || "削除に失敗しました"); }
                        setConfirmDel(null);
                        await fetchAll();
                    }}
                    onCancel={() => setConfirmDel(null)}
                />
            )}

            {/* パスワード設定 */}
            {pwModal.open && (
                <Portal>
                    <div className="modal-backdrop">
                        <div className="modal">
                            <div className="modal-header">
                                パスワード登録（{pwModal.employeeNo} / {pwModal.name}）
                            </div>
                            <PasswordSetupInline
                                employeeNo={pwModal.employeeNo}
                                onClose={() => setPwModal({ open: false, employeeNo: "", name: "" })}
                                onDone={() => {
                                    alert("パスワードを登録しました。");
                                    setPwModal({ open: false, employeeNo: "", name: "" });
                                }}
                            />
                        </div>
                    </div>
                </Portal>
            )}
        </section>
    );
}

/* ====== 新規/編集 共通モーダル ====== */
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
        };
        await onSubmit(payload);
    };

    return (
        <Portal>
            <div className="modal-backdrop">
                <div className="modal">
                    <div className="modal-header">{title}</div>
                    <form className="modal-body" onSubmit={submit}>
                        <div className="grid">
                            <label>社員番号</label>
                            <input value={f.employeeNo} onChange={e => setF({ ...f, employeeNo: e.target.value })} disabled={isEdit} required />
                            <label>氏名</label>
                            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required />
                            <label>フリガナ</label>
                            <input value={f.nameKana} onChange={e => setF({ ...f, nameKana: e.target.value })} />
                            <label>所属部署</label>
                            <input value={f.department} onChange={e => setF({ ...f, department: e.target.value })} />
                            <label>電話番号</label>
                            <input value={f.telNo} onChange={e => setF({ ...f, telNo: e.target.value })} />
                            <label>メール</label>
                            <input type="email" value={f.mailAddress} onChange={e => setF({ ...f, mailAddress: e.target.value })} />
                            <label>年齢</label>
                            <input type="number" value={f.age} onChange={e => setF({ ...f, age: e.target.value })} />
                            <label>性別</label>
                            <select value={f.gender} onChange={e => setF({ ...f, gender: e.target.value })}>
                                <option value="">（未設定）</option>
                                <option value="0">男性</option>
                                <option value="1">女性</option>
                                <option value="2">その他</option>
                            </select>
                            <label>役職</label>
                            <input value={f.position} onChange={e => setF({ ...f, position: e.target.value })} />
                            <label>権限</label>
                            <input value={f.accountLevel} onChange={e => setF({ ...f, accountLevel: e.target.value })} />
                            <label>退職日</label>
                            <input type="date" value={f.retireDate} onChange={e => setF({ ...f, retireDate: e.target.value })} />
                        </div>
                        <div className="modal-actions">
                            <button type="submit" className="btn primary">{isEdit ? "変更" : "登録"}</button>
                            <button type="button" className="btn" onClick={onClose}>キャンセル</button>
                        </div>
                    </form>
                </div>
            </div>
        </Portal>
    );
}

/* ====== パスワード設定 ====== */
function PasswordSetupInline({ employeeNo, onClose, onDone }) {
    const [p1, setP1] = useState("");
    const [p2, setP2] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const validate = () => {
        if (p1.length < 8) return "8文字以上で入力してください。";
        if (!/[A-Za-z]/.test(p1) || !/[0-9]/.test(p1)) return "英字と数字を含めてください。";
        if (p1 !== p2) return "確認用パスワードが一致しません。";
        return "";
    };

    const submit = async (e) => {
        e.preventDefault();
        const v = validate();
        if (v) { setError(v); return; }
        setSubmitting(true); setError("");
        try {
            const res = await fetch("/auth/set-password", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeNo, password: p1 })
            });
            const data = await readJsonSafe(res);
            if (!res.ok) throw new Error(data?.message || "設定に失敗しました");
            onDone?.();
        } catch (e2) {
            setError(e2.message || "設定に失敗しました");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="modal-body" onSubmit={submit}>
            {error && <div className="error" style={{ marginBottom: 12 }}>{error}</div>}
            <div className="grid">
                <label>新しいパスワード</label>
                <input type="password" value={p1} onChange={e => setP1(e.target.value)}
                    placeholder="8文字以上・英字と数字" autoFocus required />
                <label>確認</label>
                <input type="password" value={p2} onChange={e => setP2(e.target.value)} required />
            </div>
            <div className="modal-actions">
                <button type="submit" className="btn primary" disabled={submitting}>
                    {submitting ? "設定中…" : "登録"}
                </button>
                <button type="button" className="btn" onClick={onClose} disabled={submitting}>キャンセル</button>
            </div>
        </form>
    );
}

/* ====== 確認ダイアログ ====== */
function ConfirmDialog({ title, okText = "OK", cancelText = "Cancel", onOk, onCancel }) {
    return (
        <Portal>
            <div className="modal-backdrop">
                <div className="confirm">
                    <div className="confirm-title">{title}</div>
                    <div className="confirm-actions">
                        <button className="btn primary" onClick={onOk}>{okText}</button>
                        <button className="btn" onClick={onCancel}>{cancelText}</button>
                    </div>
                </div>
            </div>
        </Portal>
    );
}
