import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import PatientDashboard from './components/PatientDashboard';
import DoctorDashboard from './components/DoctorDashboard';

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userJson = localStorage.getItem('user');
    if (token && userJson) {
      try {
        const savedUser = JSON.parse(userJson);
        setUser(savedUser);
      } catch (error) {
        console.error('Failed to parse stored user', error);
      }
    }
  }, []);

  const handleLogin = (userData) => {
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <Router>
      <div>
        {user && (
          <nav className="bg-blue-500 text-white p-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold cursor-pointer hover:bg-blue-600 hover:px-2 hover:py-1 hover:rounded transition-colors">Healthcare Portal</h1>
              <p className="text-sm text-blue-100">Welcome, {user.name || 'User'} • {user.role === 'patient' ? 'Patient' : 'Doctor'}</p>
            </div>
            <button onClick={handleLogout} className="bg-red-500 p-2 rounded hover:bg-red-600">Logout</button>
          </nav>
        )}
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            user ? (
              user.role === 'patient' ? <PatientDashboard user={user} /> : <DoctorDashboard user={user} />
            ) : <Navigate to="/login" />
          } />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
