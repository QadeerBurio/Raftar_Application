import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TextField,
  InputAdornment,
  Chip,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress,
  Avatar,
  Rating
} from '@mui/material';
import {
  Search,
  Block,
  CheckCircle,
  MoreVert,
  Delete,
  Refresh
} from '@mui/icons-material';
import api from '../services/api';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState('');
  
  // Dialog state
  const [selectedUser, setSelectedUser] = useState(null);
  const [actionDialog, setActionDialog] = useState(false);
  const [actionType, setActionType] = useState(''); // 'block', 'unblock', 'delete'

  useEffect(() => {
    fetchUsers();
  }, [page, rowsPerPage]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 0) {
        fetchUsers();
      } else {
        setPage(0); // Will trigger the other useEffect
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/users', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: search || undefined,
          role: 'passenger'
        }
      });
      if (response.data.success) {
        setUsers(response.data.users);
        setTotalUsers(response.data.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleActionClick = (user, type) => {
    setSelectedUser(user);
    setActionType(type);
    setActionDialog(true);
  };

  const executeAction = async () => {
    try {
      let endpoint = '';
      let method = 'post';
      
      if (actionType === 'block') {
        endpoint = `/admin/users/${selectedUser._id}/block`;
      } else if (actionType === 'unblock') {
        endpoint = `/admin/users/${selectedUser._id}/unblock`;
      } else if (actionType === 'delete') {
        endpoint = `/admin/users/${selectedUser._id}`;
        method = 'delete';
      }

      await api[method](endpoint);
      setActionDialog(false);
      fetchUsers();
    } catch (error) {
      console.error(`Error executing ${actionType}:`, error);
    }
  };

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: '#FFD700' }}>
          Passengers Management
        </Typography>
        <Button 
          variant="contained" 
          startIcon={<Refresh />} 
          onClick={fetchUsers}
          sx={{ backgroundColor: '#1E1E1E', color: '#FFF', '&:hover': { backgroundColor: '#2A2A2A' } }}
        >
          Refresh
        </Button>
      </Box>

      <Paper sx={{ width: '100%', mb: 2, backgroundColor: '#1E1E1E' }}>
        <Box sx={{ p: 2 }}>
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Search by name, email, or phone number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search sx={{ color: '#888' }} />
                </InputAdornment>
              ),
              sx: { color: '#FFF', backgroundColor: '#2A2A2A' }
            }}
          />
        </Box>

        {loading && <LinearProgress sx={{ backgroundColor: '#333', '& .MuiLinearProgress-bar': { backgroundColor: '#FFD700' } }} />}

        <TableContainer>
          <Table sx={{ minWidth: 750 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#888' }}>Passenger</TableCell>
                <TableCell sx={{ color: '#888' }}>Contact Info</TableCell>
                <TableCell sx={{ color: '#888' }}>Statistics</TableCell>
                <TableCell sx={{ color: '#888' }}>Status</TableCell>
                <TableCell sx={{ color: '#888' }} align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {!loading && users.map((row) => (
                <TableRow hover key={row._id}>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar src={row.profileImage} sx={{ mr: 2, bgcolor: '#FFD700', color: '#000' }}>
                        {row.name ? row.name.charAt(0) : '?'}
                      </Avatar>
                      <Typography sx={{ color: '#FFF' }}>{row.name || 'N/A'}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ color: '#FFF' }}>{row.phoneNumber || 'N/A'}</Typography>
                    <Typography variant="caption" sx={{ color: '#888' }}>{row.email || 'No email'}</Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                        <Rating 
                          value={row.stats?.rating || 0} 
                          readOnly 
                          size="small" 
                          precision={0.5} 
                        />
                        <Typography variant="caption" sx={{ color: '#888', ml: 1 }}>
                          ({row.stats?.totalRatings || 0})
                        </Typography>
                      </Box>
                      <Typography variant="caption" sx={{ color: '#4ECDC4' }}>
                        Rides: {row.stats?.totalRides || 0}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={row.isActive !== false ? 'Active' : 'Blocked'} 
                      size="small"
                      color={row.isActive !== false ? 'success' : 'error'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    {row.isActive !== false ? (
                      <IconButton 
                        color="error" 
                        onClick={() => handleActionClick(row, 'block')}
                        title="Block User"
                      >
                        <Block />
                      </IconButton>
                    ) : (
                      <IconButton 
                        color="success" 
                        onClick={() => handleActionClick(row, 'unblock')}
                        title="Unblock User"
                      >
                        <CheckCircle />
                      </IconButton>
                    )}
                    <IconButton 
                      color="error" 
                      onClick={() => handleActionClick(row, 'delete')}
                      title="Delete User"
                    >
                      <Delete />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!loading && users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ color: '#888', py: 5 }}>
                    No users found matching your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={totalUsers}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{ color: '#FFF' }}
        />
      </Paper>

      {/* Action Dialog */}
      <Dialog open={actionDialog} onClose={() => setActionDialog(false)} PaperProps={{ sx: { backgroundColor: '#1E1E1E', color: '#FFF' } }}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to {actionType} {selectedUser?.name}?
            {actionType === 'delete' && ' This action cannot be undone.'}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(false)} sx={{ color: '#888' }}>Cancel</Button>
          <Button 
            onClick={executeAction} 
            color={actionType === 'unblock' ? 'success' : 'error'}
            variant="contained"
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
