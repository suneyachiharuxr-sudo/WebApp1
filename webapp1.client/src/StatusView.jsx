import './StatusView.css';

export default function StatusView({ me, loading, err, onReturn }) {
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-');

    return (
        <section className="status-card">
            {loading && <div>�ǂݍ��ݒ�...</div>}
            {err && <div className="status-error">{err}</div>}
            {!loading && !err && (
                <>
                    <h1 className="status-title">{me?.name || '�Ј�����'}</h1>

                    <div className="status-row">
                        <span className="status-label">�ݏo��ԁF</span>
                        <span className={`status-badge ${me?.rental?.status === '�ݏo��' ? 'bad' : 'good'}`}>
                            {me?.rental?.status === '�ݏo��' ? '�ݏo��' : '�Ȃ�'}
                        </span>
                    </div>

                    {me?.rental?.status === '�ݏo��' && (
                        <>
                            <div className="status-detail">�ݏo�@��F<strong>{me.rental.assetNo || '-'}</strong></div>
                            <div className="status-detail">�� �o ���F{fmtDate(me.rental.rentalDate)}</div>
                            <div className="status-detail">���؂���F{fmtDate(me.rental.dueDate)}</div>
                            <button className="status-return" onClick={onReturn}>�ԋp</button>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
