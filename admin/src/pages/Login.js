import React, { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Container,
  Avatar,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await api.post('/auth/login', {
        email: credentials.email,
        password: credentials.password,
        role: 'admin'
      });

      localStorage.setItem('adminToken', response.data.token);
      localStorage.setItem('adminUser', JSON.stringify(response.data.user));
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: '#1E1E1E',
            width: '100%'
          }}
        >
          <Avatar sx={{ m: 1, bgcolor: '#FFD700', width: 60, height: 60 }}>
            <Typography variant="h4" sx={{ color: '#121212' }}>R</Typography>
          </Avatar>
          
          <Typography component="h1" variant="h5" sx={{ color: '#FFF', mt: 2 }}>
            Admin Login
          </Typography>
          
          <Typography variant="body2" sx={{ color: '#888', mb: 3 }}>
            Raftar Admin Dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ width: '100%', mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="email"
              label="Email Address"
              name="email"
              autoComplete="email"
              autoFocus
              value={credentials.email}
              onChange={handleChange}
              sx={{
                '& .MuiInputLabel-root': { color: '#888' },
                '& .MuiOutlinedInput-root': {
                  color: '#FFF',
                  '& fieldset': { borderColor: '#333' },
                  '&:hover fieldset': { borderColor: '#FFD700' },
                },
              }}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Password"
              type="password"
              id="password"
              autoComplete="current-password"
              value={credentials.password}
              onChange={handleChange}
              sx={{
                '& .MuiInputLabel-root': { color: '#888' },
                '& .MuiOutlinedInput-root': {
                  color: '#FFF',
                  '& fieldset': { borderColor: '#333' },
                  '&:hover fieldset': { borderColor: '#FFD700' },
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              disabled={loading}
              sx={{
                mt: 3,
                mb: 2,
                bgcolor: '#FFD700',
                color: '#121212',
                '&:hover': {
                  bgcolor: '#FFC700',
                },
                height: 48,
                fontWeight: 'bold'
              }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>
          </form>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;