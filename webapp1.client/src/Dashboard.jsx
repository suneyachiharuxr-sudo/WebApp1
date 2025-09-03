import { useEffect, useMemo, useState } from 'react';
import './Dashboard.css';

/**
 * ダッシュボード画面（左：サイドバー固定、右：メインカード）
 * - /auth/me?employeeNo=... で氏名と貸出状況を取得
 * - 貸出中のときは機器・貸出日・締切日と「返却」ボタンを表示
 * - 返却押下で /auth/return にPOST → 再取得して画面更新
 */
export default function Dashboard({ onLogout }) {
    const auth = useMemo(() => {
        try { return JSON.parse(localStorage.getItem('auth') || '{}'); }
        catch { return {}; }
    }, []);

    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState('');

    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-');

    // ユーザー情報の取得
    useEffect(() => {
        const emp = auth?.employeeNo;
        if (!emp) return;
        (async () => {
            setLoading(true);
            setErr('');
            try {
                const res = await fetch(`/auth/me?employeeNo=${encodeURIComponent(emp)}`);
                const data = await res.json();
                if (!res.ok) throw new Error(data?.message || '取得に失敗しました');
                setMe(data);
            } catch (e) {
                setErr(e.message || 'サーバーに接続できません');
            } finally {
                setLoading(false);
            }
        })();
    }, [auth?.employeeNo]);

    // 返却処理
    const handleReturn = async () => {
        if (!me?.employeeNo) return;
        if (!window.confirm('返却処理を実行します。よろしいですか？')) return;

        try {
            const res = await fetch('/auth/return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeeNo: me.employeeNo })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.message || '返却に失敗しました');

            // 再取得して画面更新
            const r = await fetch(`/auth/me?employeeNo=${encodeURIComponent(me.employeeNo)}`);
            const next = await r.json();
            if (r.ok) setMe(next);
            alert('返却が完了しました');
        } catch (e) {
            alert(e.message || '返却に失敗しました');
        }
    };

    return (
        <div className="layout">
            {/* 左サイドバー：常にページ左端に固定 */}
            <aside className="sidebar">
                <div className="hello">こんにちは</div>
                <div className="username">{me?.name || 'USER名'}</div>

                <nav className="menu">
                    <button className="menu-btn">貸出状況</button>
                    <button className="menu-btn">機器一覧</button>
                    <button className="menu-btn">ユーザー一覧</button>
                </nav>

                <button className="logout" onClick={onLogout}>LOGOUT</button>
            </aside>

            {/* 右の大きいカード */}
            <main className="panel">
                {loading && <div>読み込み中...</div>}
                {err && <div className="error">{err}</div>}

                {!loading && !err && (
                    <>
                        <h1 className="emp-name">{me?.name || '社員氏名'}</h1>

                        {/* ステータス（貸出中=橙/なし=緑） */}
                        <div className="status-row">
                            <span className="label">貸出状態：</span>
                            <span className={`badge ${me?.rental?.status === '貸出中' ? 'bad' : 'good'}`}>
                                {me?.rental?.status === '貸出中' ? '貸出中' : 'なし'}
                            </span>
                        </div>

                        {/* 貸出中のみ、詳細＋返却ボタン */}
                        {me?.rental?.status === '貸出中' && (
                            <>
                                <div className="detail-row">貸出機器：<strong>{me.rental.assetNo || '-'}</strong></div>
                                <div className="detail-row">貸 出 日：{fmtDate(me.rental.rentalDate)}</div>
                                <div className="detail-row">締 切 日：{fmtDate(me.rental.dueDate)}</div>

                                <button className="return-btn" onClick={handleReturn}>返却</button>
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
