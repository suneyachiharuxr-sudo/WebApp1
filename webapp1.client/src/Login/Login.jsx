/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import './Login.css';

const Login = ({ onLoginSuccess }) => {
    const [id, setId] = useState('');
    const [password, setPassword] = useState('');
    const [errors, setErrors] = useState({});
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrors({});
        setLoading(true);
        try {
            const res = await fetch('/auth/login', { // Viteのproxyを使うなら相対パス
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeeNo: id, password })
            });
            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                // 親（App）へ通知。employeeNo を渡す
                onLoginSuccess?.(data.employeeNo ?? id);
            } else {
                setErrors({ general: data.message || 'ログインに失敗しました' });
            }
        } catch {
            setErrors({ general: 'サーバーに接続できません' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-box">
            <h1>Login</h1>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label>ID</label>
                    <input type="text" value={id} onChange={(e) => setId(e.target.value)} />
                </div>
                <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {errors.general && <div className="error general">{errors.general}</div>}
                <button type="submit" disabled={loading}>{loading ? '送信中...' : 'Login'}</button>
            </form>
        </div>
    );
};

export default Login;
