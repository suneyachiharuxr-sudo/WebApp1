import { useEffect, useState } from "react";
import "./Alert.css";

export default function Dashboard({ employeeNo }) {
    const [hasOverdue, setHasOverdue] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/rentals/overdue?employeeNo=${employeeNo}`);
                const data = await res.json();
                if (res.ok && Array.isArray(data)) {
                    setHasOverdue(data.length > 0);
                }
            } catch {
                // 通信エラーは無視
            }
        })();
    }, [employeeNo]);

    return (
        <div className="dashboard">
            {hasOverdue && (
                <div className="alert alert-danger">
                    ⚠ あなたには返却期限切れの貸出があります
                </div>
            )}
        </div>
    );
}
