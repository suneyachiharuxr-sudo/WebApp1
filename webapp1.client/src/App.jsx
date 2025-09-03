import React, { useState } from 'react';
import Login from './Login/Login.jsx';
import Dashboard from './Dashboard.jsx';
import './App.css';

const App = () => {
    const [currentPage, setCurrentPage] = useState('login');

    const handleLoginSuccess = (employeeNo) => {
        localStorage.setItem('auth', JSON.stringify({ employeeNo, loginAt: Date.now() }));
        setCurrentPage('dashboard');
    };

    const handleLogout = () => {
        localStorage.removeItem('auth');
        setCurrentPage('login');
    };

    return (
        <div className={`app ${currentPage === 'login' ? 'center' : ''}`}>
            {currentPage === 'login' && <Login onLoginSuccess={handleLoginSuccess} />}
            {currentPage === 'dashboard' && <Dashboard onLogout={handleLogout} />}
        </div>
    );
};

export default App;
