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
  Alert as MuiAlert
} from '@mui/material';
import {
  CheckCircle,
  Cancel,
  Visibility,
  Block,
  Check,
  Close,
} from '@mui/icons-material';
import { api } from '../services/api';

const Drivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalDrivers, setTotalDrivers] = useState(0);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogType, setDialogType] = useState('');
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [fullscreenImage, setFullscreenImage] = useState(null);
  
  const [rejectDialog, setRejectDialog] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [toast, setToast] = useState({ open: false, message: '', severity: 'success' });

  useEffect(() => {
    fetchDrivers();
  }, [page, rowsPerPage, statusFilter, vehicleFilter]);

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const params = { page: page + 1, limit: rowsPerPage };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (vehicleFilter !== 'all') params.vehicleType = vehicleFilter;
      const response = await api.get('/admin/drivers', { params });
      
      console.log(`API URL: /admin/drivers, Params:`, params);
      console.log(`Response:`, response.data);
      if (params.status === 'pending') {
        console.log(`Fetched ${response.data.drivers.length} drivers with status pending`);
      }
      
      setDrivers(response.data.drivers);
      setTotalDrivers(response.data.total);
    } catch (error) {
      console.error('Error fetching drivers:', error);
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

  const handleViewDriver = (driver) => {
    setSelectedDriver(driver);
    setDialogType('view');
    setOpenDialog(true);
  };

  const handleApproveDriver = async (driverId) => {
    try {
      await api.put(`/admin/drivers/${driverId}/approve`);
      setToast({ open: true, message: 'Driver approved successfully', severity: 'success' });
      fetchDrivers();
    } catch (error) {
      console.error('Error approving driver:', error);
      setToast({ open: true, message: 'Error approving driver', severity: 'error' });
    }
  };

  const handleRejectClick = (driverId) => {
    setRejectDialog(driverId);
    setRejectReason('');
  };

  const submitRejectDriver = async () => {
    if (!rejectReason.trim()) {
      setToast({ open: true, message: 'Please provide a rejection reason', severity: 'warning' });
      return;
    }
    try {
      await api.put(`/admin/drivers/${rejectDialog}/reject`, { reason: rejectReason });
      setToast({ open: true, message: 'Driver rejected successfully', severity: 'success' });
      setRejectDialog(null);
      setRejectReason('');
      fetchDrivers();
    } catch (error) {
      console.error('Error rejecting driver:', error);
      setToast({ open: true, message: 'Error rejecting driver', severity: 'error' });
    }
  };

  const handleSuspendDriver = async (driverId) => {
    try {
      await api.put(`/admin/drivers/${driverId}/suspend`);
      fetchDrivers();
    } catch (error) {
      console.error('Error suspending driver:', error);
    }
  };

  const getStatusChip = (status) => {
    const statusMap = {
      pending: { color: 'warning', label: 'Pending' },
      approved: { color: 'success', label: 'Approved' },
      rejected: { color: 'error', label: 'Rejected' },
      suspended: { color: 'error', label: 'Suspended' },
      active: { color: 'success', label: 'Active' },
    };
    const config = statusMap[status] || statusMap.pending;
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  const renderDocument = (url, label) => {
    if (!url) return <Typography variant="caption" sx={{ color: '#666', mr: 2 }}>No {label}</Typography>;
    return (
      <Box sx={{ mr: 2, mb: 2, textAlign: 'center' }}>
        <Typography variant="caption" sx={{ color: '#888', display: 'block', mb: 1 }}>{label}</Typography>
        <Box 
          component="img" 
          src={url} 
          alt={label}
          sx={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 1, cursor: 'pointer', border: '1px solid #4ECDC4' }}
          onClick={() => setFullscreenImage(url)}
        />
      </Box>
    );
  };

  if (loading && drivers.length === 0) {
    return (
      <Box sx={{ width: '100%', mt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#FFD700' }}>
        Driver Management
      </Typography>

      <Tabs 
        value={statusFilter} 
        onChange={(e, v) => { setStatusFilter(v); setPage(0); }} 
        sx={{ mb: 2, borderBottom: 1, borderColor: '#333' }}
        TabIndicatorProps={{ style: { backgroundColor: '#FFD700' } }}
      >
        <Tab value="all" label="All Statuses" sx={{ color: statusFilter === 'all' ? '#FFD700' : '#888' }} />
        <Tab value="pending" label="Pending Verification" sx={{ color: statusFilter === 'pending' ? '#FFD700' : '#888' }} />
        <Tab value="approved" label="Approved" sx={{ color: statusFilter === 'approved' ? '#FFD700' : '#888' }} />
        <Tab value="rejected" label="Rejected" sx={{ color: statusFilter === 'rejected' ? '#FFD700' : '#888' }} />
      </Tabs>

      <Tabs 
        value={vehicleFilter} 
        onChange={(e, v) => { setVehicleFilter(v); setPage(0); }} 
        sx={{ mb: 3, borderBottom: 1, borderColor: '#333' }}
        TabIndicatorProps={{ style: { backgroundColor: '#4ECDC4' } }}
      >
        <Tab value="all" label="Total Drivers" sx={{ color: vehicleFilter === 'all' ? '#4ECDC4' : '#888' }} />
        <Tab value="car" label="Car Drivers" sx={{ color: vehicleFilter === 'car' ? '#4ECDC4' : '#888' }} />
        <Tab value="bike" label="Bike Drivers" sx={{ color: vehicleFilter === 'bike' ? '#4ECDC4' : '#888' }} />
        <Tab value="rickshaw" label="Rickshaw Drivers" sx={{ color: vehicleFilter === 'rickshaw' ? '#4ECDC4' : '#888' }} />
        <Tab value="ac_car" label="AC Car Drivers" sx={{ color: vehicleFilter === 'ac_car' ? '#4ECDC4' : '#888' }} />
        <Tab value="luxury_car" label="Luxury Car" sx={{ color: vehicleFilter === 'luxury_car' ? '#4ECDC4' : '#888' }} />
      </Tabs>

      <TableContainer component={Paper} sx={{ backgroundColor: '#1E1E1E' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ color: '#FFD700' }}>Driver</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Phone</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Vehicle</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Status</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Rides</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Rating</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Earnings</TableCell>
              <TableCell sx={{ color: '#FFD700' }}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {drivers.map((driver) => (
              <TableRow key={driver._id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Avatar src={driver.userId?.profilePhoto} sx={{ mr: 2 }} />
                    <Box>
                      <Typography sx={{ color: '#FFF' }}>
                        {driver.userId?.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#888' }}>
                        {driver.userId?.email}
                      </Typography>
                    </Box>
                  </Box>
                </TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  {driver.userId?.phoneNumber}
                </TableCell>
                <TableCell>
                  <Typography sx={{ color: '#FFF' }}>
                    {driver.vehicleDetails?.type}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#888' }}>
                    {driver.vehicleDetails?.plateNumber}
                  </Typography>
                </TableCell>
                <TableCell>{getStatusChip(driver.status)}</TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  {driver.stats?.totalRides || 0}
                </TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  {driver.stats?.rating?.toFixed(1) || 'N/A'}
                </TableCell>
                <TableCell sx={{ color: '#FFF' }}>
                  Rs. {driver.stats?.totalEarnings?.toLocaleString() || 0}
                </TableCell>
                <TableCell>
                  <Tooltip title="View Details">
                    <IconButton
                      size="small"
                      onClick={() => handleViewDriver(driver)}
                      sx={{ color: '#FFD700' }}
                    >
                      <Visibility />
                    </IconButton>
                  </Tooltip>
                  {driver.status === 'pending' && (
                    <>
                      <Tooltip title="Approve">
                        <IconButton
                          size="small"
                          onClick={() => handleApproveDriver(driver._id)}
                          sx={{ color: '#4ECDC4' }}
                        >
                          <Check />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <IconButton
                          size="small"
                          onClick={() => handleRejectClick(driver._id)}
                          sx={{ color: '#FF6B6B' }}
                        >
                          <Close />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                  {driver.status === 'active' && (
                    <Tooltip title="Suspend">
                      <IconButton
                        size="small"
                        onClick={() => handleSuspendDriver(driver._id)}
                        sx={{ color: '#FF6B6B' }}
                      >
                        <Block />
                      </IconButton>
                    </Tooltip>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {drivers.length === 0 && !loading && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ color: '#888', py: 3 }}>
                  No drivers found for this status.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={totalDrivers}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          sx={{
            color: '#FFF',
            '& .MuiTablePagination-selectIcon': {
              color: '#FFF',
            },
          }}
        />
      </TableContainer>

      {/* Driver Details Dialog */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { backgroundColor: '#1E1E1E', color: '#FFF' }
        }}
      >
        <DialogTitle sx={{ color: '#FFD700' }}>
          Driver Details
        </DialogTitle>
        <DialogContent>
          {selectedDriver && (
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Avatar
                  src={selectedDriver.userId?.profilePhoto}
                  sx={{ width: 80, height: 80, mr: 3 }}
                />
                <Box>
                  <Typography variant="h6" sx={{ color: '#FFF' }}>
                    {selectedDriver.userId?.name}
                  </Typography>
                  <Typography sx={{ color: '#888' }}>
                    {selectedDriver.userId?.phoneNumber}
                  </Typography>
                  <Typography sx={{ color: '#888' }}>
                    {selectedDriver.userId?.email}
                  </Typography>
                </Box>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" sx={{ color: '#888' }}>
                    Vehicle Type
                  </Typography>
                  <Typography sx={{ color: '#FFF' }}>
                    {selectedDriver.vehicleDetails?.type}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" sx={{ color: '#888' }}>
                    Plate Number
                  </Typography>
                  <Typography sx={{ color: '#FFF' }}>
                    {selectedDriver.vehicleDetails?.plateNumber}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" sx={{ color: '#888' }}>
                    Model
                  </Typography>
                  <Typography sx={{ color: '#FFF' }}>
                    {selectedDriver.vehicleDetails?.model} ({selectedDriver.vehicleDetails?.year})
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" sx={{ color: '#888' }}>
                    Color
                  </Typography>
                  <Typography sx={{ color: '#FFF' }}>
                    {selectedDriver.vehicleDetails?.color || 'N/A'}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" sx={{ color: '#888' }}>
                    Status
                  </Typography>
                  {getStatusChip(selectedDriver.status)}
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="subtitle2" sx={{ color: '#888', mb: 1 }}>
                    Documents & Identity
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap' }}>
                    {renderDocument(selectedDriver.documents?.cnicFront, 'CNIC Front')}
                    {renderDocument(selectedDriver.documents?.cnicBack, 'CNIC Back')}
                    {renderDocument(selectedDriver.documents?.drivingLicense, 'License')}
                    {renderDocument(selectedDriver.documents?.vehicleRegistration, 'Registration')}
                    {renderDocument(selectedDriver.documents?.selfie, 'Selfie')}
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)} sx={{ color: '#FFD700' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {/* Fullscreen Image Dialog */}
      <Dialog 
        open={!!fullscreenImage} 
        onClose={() => setFullscreenImage(null)} 
        maxWidth="lg"
        PaperProps={{ sx: { bgcolor: 'transparent', boxShadow: 'none', overflow: 'hidden' } }}
      >
        <Box 
          component="img" 
          src={fullscreenImage} 
          sx={{ width: '100%', maxHeight: '90vh', objectFit: 'contain' }} 
        />
        <IconButton 
          onClick={() => setFullscreenImage(null)}
          sx={{ position: 'absolute', top: 10, right: 10, color: '#FFF', bgcolor: 'rgba(0,0,0,0.5)' }}
        >
          <Close />
        </IconButton>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog 
        open={!!rejectDialog} 
        onClose={() => setRejectDialog(null)}
        PaperProps={{ sx: { bgcolor: '#1E1E1E', color: '#FFF', minWidth: 400 } }}
      >
        <DialogTitle sx={{ color: '#FF6B6B' }}>Reject Driver</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#888', mb: 2, mt: 1 }}>
            Please provide a reason for rejecting this driver application. This will be shown to the driver.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Rejection Reason"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
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
          <Button onClick={() => setRejectDialog(null)} sx={{ color: '#888' }}>
            Cancel
          </Button>
          <Button onClick={submitRejectDriver} variant="contained" sx={{ bgcolor: '#FF6B6B', '&:hover': { bgcolor: '#E55A5A' } }}>
            Confirm Rejection
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

export default Drivers;