import { useEffect, useMemo, useState } from "react";
import "./Dashboard.css";
import "./StatusView.css";

// 機器一覧を使う場合は path をあなたの構成に合わせてください
// 例: src/views/Devices/DeviceList.jsx
import RentalsList from "./RentalsList.jsx";
import DeviceList from "./DeviceList.jsx";


export default function Dashboard({ onLogout }) {
    //ログイン情報
    const auth = useMemo(() => {
        try { return JSON.parse(localStorage.getItem("auth") || "{}"); }
        catch { return {}; }
    }, []);
    const employeeNo = auth?.employeeNo;
    //画面状態
    const [view, setView] = useState("status"); // "status" | "devices"
    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : "-");
    //自分のレンタル状況を取得
    const loadMe = async () => {
        if (!employeeNo) return;
        setLoading(true);
        setErr("");
        try {
            const res = await fetch(`/auth/me?employeeNo=${encodeURIComponent(employeeNo)}`);
            if (!res.ok) {
                  const text = await res.text().catch(() => "");
                  throw new Error(text || "取得に失敗しました");
                }
            const data = await res.json();
            setMe(data);
        } catch (e) {
            setErr(e.message || "サーバーに接続できません");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadMe(); }, [employeeNo]);
    //返却
    const handleReturn = async () => {
        if (!me?.employeeNo) return;
        if (!window.confirm("返却処理を実行します。よろしいですか？")) return;
        try {
            const res = await fetch("/auth/return", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeNo: me.employeeNo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.message || "返却に失敗しました");
            await loadMe();
            alert("返却が完了しました");
        } catch (e) {
            alert(e.message || "返却に失敗しました");
        }
    };

    return (
        <div className="layout">
            {/* 左サイドバー（最初のグレー配色に戻す） */}
            <aside className="sidebar fixed">
                <div className="hello">こんにちは</div>
                <div className="username">{me?.name || "USER名"}</div>

                <nav className="menu">
                    <button
                        className={`menu-btn ${view === "rentals" ? "active" : ""}`}
                        onClick={() => setView("rentals")}
                    >
                        貸出状況
                    </button>
                    <button
                        className={`menu-btn ${view === "devices" ? "active" : ""}`}
                        onClick={() => setView("devices")}
                    >
                        機器一覧
                    </button>
                    <button className="menu-btn" disabled>ユーザー一覧</button>
                </nav>

                <button className="logout" onClick={onLogout}>LOGOUT</button>
            </aside>

            {/* 右側 */}
            {view === "status" && (
                <main className="panel flat">
                    <div className="status-card">
                        {loading ? (
                            <div className="status-loading">読み込み中...</div>
                        ) : err ? (
                            <div className="status-error">{err}</div>
                        ) : (
                            <>
                                <h1 className="status-title">{me?.name || "社員氏名"}</h1>

                                <div className="status-row">
                                    <span className="status-label">貸出状態：</span>
                                    <span className={`status-badge ${me?.rental?.status === "貸出中" ? "bad" : "good"}`}>
                                        {me?.rental?.status === "貸出中" ? "貸出中" : "なし"}
                                    </span>
                                </div>

                                {me?.rental?.status === "貸出中" && (
                                    <>
                                        <div className="status-detail">貸出機器：<strong>{me.rental.assetNo || "-"}</strong></div>
                                        <div className="status-detail">貸 出 日：{fmtDate(me.rental.rentalDate)}</div>
                                        <div className="status-detail">締 切 日：{fmtDate(me.rental.dueDate)}</div>
                                        <button className="status-return" onClick={handleReturn}>返却</button>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </main>
            )}

            {view === "rentals" && (
                  <main className="panel flat">
                        <RentalsList />     
                  </main>
            )}

            {view === "devices" && (
                // 機器一覧は内側カードを二重にしないため panel をフラットに
                <main className="panel flat">
                    <DeviceList />
                </main>
            )}
        </div>
    );
}
