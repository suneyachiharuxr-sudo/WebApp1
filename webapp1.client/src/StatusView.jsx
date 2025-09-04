import './StatusView.css';

export default function StatusView({ me, loading, err, onReturn }) {
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-');

    return (
        <section className="status-card">
            {loading && <div>読み込み中...</div>}
            {err && <div className="status-error">{err}</div>}
            {!loading && !err && (
                <>
                    <h1 className="status-title">{me?.name || '社員氏名'}</h1>

                    <div className="status-row">
                        <span className="status-label">貸出状態：</span>
                        <span className={`status-badge ${me?.rental?.status === '貸出中' ? 'bad' : 'good'}`}>
                            {me?.rental?.status === '貸出中' ? '貸出中' : 'なし'}
                        </span>
                    </div>

                    {me?.rental?.status === '貸出中' && (
                        <>
                            <div className="status-detail">貸出機器：<strong>{me.rental.assetNo || '-'}</strong></div>
                            <div className="status-detail">貸 出 日：{fmtDate(me.rental.rentalDate)}</div>
                            <div className="status-detail">締切り日：{fmtDate(me.rental.dueDate)}</div>
                            <button className="status-return" onClick={onReturn}>返却</button>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
