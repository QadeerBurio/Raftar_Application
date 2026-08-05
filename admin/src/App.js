import React, { useState, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import Drivers from './pages/Drivers';
import Trips from './pages/Trips';
import Payments from './pages/Payments';
import Analytics from './pages/Analytics';
import Login from './pages/Login';
import PricingConfig from './pages/PricingConfig';

// Create a simple context instead of Redux
export const AppContext = createContext();

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#FFD700',
    },
    secondary: {
      main: '#121212',
    },
    background: {
      default: '#121212',
      paper: '#1E1E1E',
    },
  },
});

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('adminToken');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  const [appState, setAppState] = useState({
    users: [],
    drivers: [],
    trips: [],
    payments: [],
    analytics: {},
    loading: false,
    error: null
  });

  return (
    <AppContext.Provider value={{ state: appState, setState: setAppState }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="users" element={<Users />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="trips" element={<Trips />} />
              <Route path="payments" element={<Payments />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="pricing" element={<PricingConfig />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AppContext.Provider>
  );
}

export default App;