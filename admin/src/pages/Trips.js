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
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  LinearProgress,
  Avatar,
  Tooltip,
  Grid,
  Tabs,
  Tab,
  Snackbar,
  Alert as MuiAlert,
  InputAdornment
} from '@mui/material';
import {
  Visibility,
  Search,
  Cancel as CancelIcon
} from '@mui/icons-material';
import api from '../services/api';

const Trips = () => {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalTrips, setTotalTrips] = useState(0);
  const [search, setSearch] = useState('');
  
  const [statusFilter, setStatusFilter] = useState('all');
  
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  
  const [cancelDialog, setCancelDialog] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchTrips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 0) {
        fetchTrips();
      } else {
        setPage(0);
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const fetchTrips = async () => {
    try {
      setLoading(true);
      const params = { page: page + 1, limit: rowsPerPage };
      
      if (statusFilter === 'searching') params.status = 'searching';
      else if (statusFilter === 'ongoing') params.status = 'accepted,started'; // Note: Backend doesn't support comma-separated directly, but let's send it or handle it. Actually, just send the filter and if backend only takes 1 status, we might need a custom query or just use standard statuses. Wait, backend getTrips handles `if (status) query.status = status;`. So passing "accepted,started" won't match exactly. Let's just use exact statuses or map them.
      // Let's refine status Filter for backend compatibility
      // If the backend doesn't support multiple, we will fetch all and filter locally, or just use valid single statuses.
      
      if (statusFilter !== 'all' && statusFilter !== 'ongoing') {
        params.status = statusFilter;
      }
      
      if (search) params.search = search; // Pass search to backend (even if not currently supported, it's good practice)

      const response = await api.get('/admin/trips', { params });
      
      let fetchedTrips = response.data.rides || [];
      
      // If ongoing is selected, filter locally since backend expects a single string
      if (statusFilter === 'ongoing') {
        fetchedTrips = fetchedTrips.filter(t => ['accepted', 'started', 'scheduled'].includes(t.status));
      }
      
      // If backend doesn't support search, fallback to local filtering
      if (search && response.data.rides) {
        const lowerSearch = search.toLowerCase();
        fetchedTrips = fetchedTrips.filter(t => 
          (t._id && t._id.toLowerCase().includes(lowerSearch)) ||
          (t.passengerId?.name && t.passengerId.name.toLowerCase().includes(lowerSearch)) ||
          (t.driverId?.userId?.name && t.driverId.userId.name.toLowerCase().includes(lowerSearch))
        );
      }

      setTrips(fetchedTrips);
      setTotalTrips(response.data.pagination?.total || fetchedTrips.length);
    } catch (error) {
      console.error('Error fetching trips:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event, newPage) => setPage(newPage);
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleViewTrip = async (trip) => {
    try {
      const response = await api.get(`/admin/trips/${trip._id}`);
      setSelectedTrip(response.data.ride);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error fetching trip details:', error);
      // Fallback to basic trip data
      setSelectedTrip(trip);
      setOpenDialog(true);
    }
  };

  const handleCancelClick = (tripId) => {
    setCancelDialog(tripId);
    setCancelReason('');
  };

  const submitCancelTrip = async () => {
    if (!cancelReason.trim()) {
      setToast({ open: true, message: 'Please provide a cancellation reason', severity: 'warning' });
      return;
    }
    try {
      await api.put(`/admin/trips/${cancelDialog}/cancel`, { reason: cancelReason });
      setToast({ open: true, message: 'Trip cancelled successfully', severity: 'success' });
      setCancelDialog(null);
      setCancelReason('');
      fetchTrips();
    } catch (error) {
      console.error('Error cancelling trip:', error);
      setToast({ open: true, message: 'Error cancelling trip', severity: 'error' });
    }
  };

  const getStatusChip = (status) => {
    const statusMap = {
      searching: { color: 'warning', label: 'Searching' },
      scheduled: { color: 'info', label: 'Scheduled' },
      accepted: { color: 'primary', label: 'Accepted' },
      started: { color: 'info', label: 'In Progress' },
      completed: { color: 'success', label: 'Completed' },
      cancelled: { color: 'error', label: 'Cancelled' },
    };
    const config = statusMap[status] || { color: 'default', label: status };
    return <Chip label={config.label} color={config.color} size="small" />;
  };
  
  const getTypeChip = (type) => {
    const typeMap = {
      solo: { color: 'primary', label: 'Ride' },
      carpool: { color: 'secondary', label: 'Carpool' },
      parcel: { color: 'warning', label: 'Parcel' },
      intercity: { color: 'info', label: 'Intercity' },
    };
    const config = typeMap[type] || { color: 'default', label: type || 'solo' };
    return <Chip label={config.label} color={config.color} size="small" variant="outlined" />;
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#FFD700' }}>
        Trips Management
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 3 }}>
        <Tabs 
          value={statusFilter} 
          onChange={(e, v) => { setStatusFilter(v); setPage(0); }} 
          sx={{ borderBottom: 1, borderColor: '#333' }}
          TabIndicatorProps={{ style: { backgroundColor: '#FFD700' } }}
        >
          <Tab value="all" label="All Trips" sx={{ color: statusFilter === 'all' ? '#FFD700' : '#888' }} />
          <Tab value="searching" label="Searching" sx={{ color: statusFilter === 'searching' ? '#FFD700' : '#888' }} />
          <Tab value="ongoing" label="Ongoing" sx={{ color: statusFilter === 'ongoing' ? '#FFD700' : '#888' }} />
          <Tab value="completed" label="Completed" sx={{ color: statusFilter === 'completed' ? '#FFD700' : '#888' }} />
          <Tab value="cancelled" label="Cancelled" sx={{ color: statusFilter === 'cancelled' ? '#FFD700' : '#888' }} />
        </Tabs>

        <TextField
          fullWidth
          variant="outlined"
          placeholder="Search by Trip ID, passenger, or driver..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: '#888' }} />
              </InputAdornment>
            ),
            sx: { color: '#FFF', backgroundColor: '#1E1E1E' }
          }}
        />
      </Box>

      {loading && trips.length === 0 ? (
        <Box sx={{ width: '100%', mt: 4 }}>
          <LinearProgress sx={{ backgroundColor: '#333', '& .MuiLinearProgress-bar': { backgroundColor: '#FFD700' } }} />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ backgroundColor: '#1E1E1E' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ color: '#FFD700' }}>Trip ID</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Passenger</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Driver</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Type</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Pickup → Dropoff</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Fare (Cash)</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Status</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Date</TableCell>
                <TableCell sx={{ color: '#FFD700' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {trips.map((trip) => (
                <TableRow key={trip._id}>
                  <TableCell sx={{ color: '#FFF' }}>
                    {trip._id.substring(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Avatar src={trip.passengerId?.profilePhoto} sx={{ width: 30, height: 30, mr: 1 }} />
                      <Typography sx={{ color: '#FFF' }} variant="body2">
                        {trip.passengerId?.name || 'Unknown'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {trip.driverId ? (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <Avatar src={trip.driverId?.userId?.profilePhoto} sx={{ width: 30, height: 30, mr: 1 }} />
                        <Typography sx={{ color: '#FFF' }} variant="body2">
                          {trip.driverId?.userId?.name || 'Unknown'}
                        </Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ color: '#888' }} variant="body2">-</Typography>
                    )}
                  </TableCell>
                  <TableCell>{getTypeChip(trip.type || 'solo')}</TableCell>
                  <TableCell sx={{ maxWidth: 200 }}>
                    <Typography variant="caption" sx={{ color: '#4ECDC4', display: 'block' }} noWrap>
                      {trip.pickup?.address || 'N/A'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#FF6B6B', display: 'block' }} noWrap>
                      {trip.dropoff?.address || 'N/A'}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ color: '#FFF' }}>
                    Rs. {trip.fare?.accepted || trip.fare?.final || trip.fare?.offered || 0}
                  </TableCell>
                  <TableCell>{getStatusChip(trip.status)}</TableCell>
                  <TableCell sx={{ color: '#FFF' }}>
                    {new Date(trip.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="View Details">
                      <IconButton
                        size="small"
                        onClick={() => handleViewTrip(trip)}
                        sx={{ color: '#FFD700' }}
                      >
                        <Visibility />
                      </IconButton>
                    </Tooltip>
                    {['searching', 'scheduled', 'accepted', 'started'].includes(trip.status) && (
                      <Tooltip title="Cancel Trip">
                        <IconButton
                          size="small"
                          onClick={() => handleCancelClick(trip._id)}
                          sx={{ color: '#FF6B6B' }}
                        >
                          <CancelIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {trips.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ color: '#888', py: 5 }}>
                    No trips found matching criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50]}
            component="div"
            count={totalTrips}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            sx={{ color: '#FFF', '& .MuiTablePagination-selectIcon': { color: '#FFF' } }}
          />
        </TableContainer>
      )}

      {/* Trip Details Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { backgroundColor: '#1E1E1E', color: '#FFF' } }}
      >
        <DialogTitle sx={{ color: '#FFD700', borderBottom: '1px solid #333' }}>
          Trip Details - {selectedTrip?._id.toUpperCase()}
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          {selectedTrip && (
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" sx={{ color: '#888', mb: 1 }}>Passenger</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <Avatar src={selectedTrip.passengerId?.profilePhoto} sx={{ width: 50, height: 50, mr: 2 }} />
                  <Box>
                    <Typography sx={{ color: '#FFF' }}>{selectedTrip.passengerId?.name}</Typography>
                    <Typography variant="body2" sx={{ color: '#888' }}>{selectedTrip.passengerId?.phoneNumber}</Typography>
                  </Box>
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle2" sx={{ color: '#888', mb: 1 }}>Driver</Typography>
                {selectedTrip.driverId ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <Avatar src={selectedTrip.driverId?.userId?.profilePhoto} sx={{ width: 50, height: 50, mr: 2 }} />
                    <Box>
                      <Typography sx={{ color: '#FFF' }}>{selectedTrip.driverId?.userId?.name}</Typography>
                      <Typography variant="body2" sx={{ color: '#888' }}>{selectedTrip.driverId?.userId?.phoneNumber}</Typography>
                      <Typography variant="body2" sx={{ color: '#888' }}>{selectedTrip.driverId?.vehicleDetails?.type} - {selectedTrip.driverId?.vehicleDetails?.plateNumber}</Typography>
                    </Box>
                  </Box>
                ) : (
                  <Typography sx={{ color: '#FFF', fontStyle: 'italic' }}>No driver assigned</Typography>
                )}
              </Grid>
              
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: '#2A2A2A', border: '1px solid #444' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#888' }}>Pickup</Typography>
                      <Typography sx={{ color: '#4ECDC4' }}>{selectedTrip.pickup?.address}</Typography>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#888' }}>Dropoff</Typography>
                      <Typography sx={{ color: '#FF6B6B' }}>{selectedTrip.dropoff?.address}</Typography>
                    </Grid>
                  </Grid>
                </Paper>
              </Grid>

              <Grid item xs={6} sm={3}>
                <Typography variant="subtitle2" sx={{ color: '#888' }}>Status</Typography>
                <Box sx={{ mt: 1 }}>{getStatusChip(selectedTrip.status)}</Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="subtitle2" sx={{ color: '#888' }}>Type</Typography>
                <Box sx={{ mt: 1 }}>{getTypeChip(selectedTrip.type)}</Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="subtitle2" sx={{ color: '#888' }}>Fare (Cash)</Typography>
                <Typography variant="h6" sx={{ color: '#FFD700', mt: 0.5 }}>
                  Rs. {selectedTrip.fare?.accepted || selectedTrip.fare?.final || selectedTrip.fare?.offered || 0}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="subtitle2" sx={{ color: '#888' }}>Created</Typography>
                <Typography sx={{ color: '#FFF', mt: 1 }}>
                  {new Date(selectedTrip.createdAt).toLocaleString()}
                </Typography>
              </Grid>
              
              {selectedTrip.status === 'cancelled' && selectedTrip.metadata?.adminCancelReason && (
                <Grid item xs={12}>
                  <MuiAlert severity="error" sx={{ bgcolor: 'rgba(211, 47, 47, 0.1)', color: '#FF6B6B', mt: 1 }}>
                    Cancelled by Admin: {selectedTrip.metadata.adminCancelReason}
                  </MuiAlert>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid #333' }}>
          <Button onClick={() => setOpenDialog(false)} sx={{ color: '#FFD700' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      {/* Cancel Trip Dialog */}
      <Dialog 
        open={!!cancelDialog} 
        onClose={() => setCancelDialog(null)}
        PaperProps={{ sx: { bgcolor: '#1E1E1E', color: '#FFF', minWidth: 400 } }}
      >
        <DialogTitle sx={{ color: '#FF6B6B' }}>Cancel Trip</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#888', mb: 2, mt: 1 }}>
            Provide a reason for cancelling this trip. Both passenger and driver will be notified.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Cancellation Reason"
            fullWidth
            multiline
            rows={2}
            variant="outlined"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            sx={{ 
              input: { color: '#FFF' }, 
              textarea: { color: '#FFF' },
              label: { color: '#888' }, 
              '& .MuiOutlinedInput-root': { 
                fieldset: { borderColor: '#333' },
                '&:hover fieldset': { borderColor: '#555' },
                '&.Mui-focused fieldset': { borderColor: '#FF6B6B' }
              } 
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, pt: 0 }}>
          <Button onClick={() => setCancelDialog(null)} sx={{ color: '#888' }}>
            Back
          </Button>
          <Button onClick={submitCancelTrip} variant="contained" sx={{ bgcolor: '#FF6B6B', '&:hover': { bgcolor: '#E55A5A' } }}>
            Confirm Cancellation
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar 
        open={toast.open} 
        autoHideDuration={4000} 
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <MuiAlert severity={toast.severity} variant="filled" sx={{ width: '100%' }}>
          {toast.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
};

export default Trips;