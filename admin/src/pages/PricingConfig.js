import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Tabs, Tab, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Button, TextField, Dialog, 
  DialogActions, DialogContent, DialogTitle, CircularProgress, Alert 
} from '@mui/material';
import api from '../services/api';

const PricingConfig = () => {
  const [tabValue, setTabValue] = useState(0);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Dialog state
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [editType, setEditType] = useState(''); // 'vehicleRates', 'cityTiers', etc.
  
  const fetchConfig = async () => {
    try {
      const response = await api.get('/pricing/config');
      setConfig(response.data);
      setLoading(false);
    } catch (err) {
      setError('Failed to load pricing config');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleEdit = (type, item, key = null) => {
    setEditType(type);
    if (type === 'vehicleRates') {
      setEditItem({ vehicle: key, ...item });
    } else if (type === 'cityTiers') {
      setEditItem({ city: key, multiplier: item });
    } else {
      setEditItem({ ...item });
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditItem(null);
  };

  const handleSave = async () => {
    try {
      await api.put('/pricing/config', {
        type: editType,
        data: editItem
      });
      fetchConfig();
      handleClose();
    } catch (err) {
      alert('Failed to save config');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setEditItem({ ...editItem, [name]: isNaN(Number(value)) ? value : Number(value) });
  };

  if (loading) return <CircularProgress />;
  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 4 }}>Pricing Management</Typography>
      
      <Paper sx={{ width: '100%' }}>
        <Tabs value={tabValue} onChange={handleTabChange}>
          <Tab label="Vehicle Rates" />
          <Tab label="City Tiers" />
          <Tab label="Intercity Rates" />
          <Tab label="Surge Config" />
          <Tab label="Peak Hours" />
        </Tabs>
      </Paper>

      <Box sx={{ mt: 3 }}>
        {tabValue === 0 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Vehicle</TableCell>
                  <TableCell>Base Fare</TableCell>
                  <TableCell>Rate / Km</TableCell>
                  <TableCell>Rate / Min</TableCell>
                  <TableCell>Floor Cost</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(config.vehicleRates).map(([vehicle, rates]) => (
                  <TableRow key={vehicle}>
                    <TableCell>{vehicle}</TableCell>
                    <TableCell>{rates.base}</TableCell>
                    <TableCell>{rates.ratePerKm}</TableCell>
                    <TableCell>{rates.ratePerMin}</TableCell>
                    <TableCell>{rates.floor}</TableCell>
                    <TableCell>
                      <Button variant="outlined" size="small" onClick={() => handleEdit('vehicleRates', rates, vehicle)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tabValue === 1 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>City</TableCell>
                  <TableCell>Multiplier</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.entries(config.cityTiers).map(([city, multiplier]) => (
                  <TableRow key={city}>
                    <TableCell>{city}</TableCell>
                    <TableCell>{multiplier}</TableCell>
                    <TableCell>
                      <Button variant="outlined" size="small" onClick={() => handleEdit('cityTiers', multiplier, city)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tabValue === 2 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Min Distance</TableCell>
                  <TableCell>Max Distance</TableCell>
                  <TableCell>Rate / Km</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.intercityRates.map((rate, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{rate.minDistance}</TableCell>
                    <TableCell>{rate.maxDistance || 'Infinity'}</TableCell>
                    <TableCell>{rate.ratePerKm}</TableCell>
                    <TableCell>
                      <Button variant="outlined" size="small" onClick={() => handleEdit('intercityRates', rate)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tabValue === 3 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Min Drivers</TableCell>
                  <TableCell>Max Drivers</TableCell>
                  <TableCell>Multiplier</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.surgeConfig.map((surge, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{surge.minDrivers}</TableCell>
                    <TableCell>{surge.maxDrivers || 'Any'}</TableCell>
                    <TableCell>{surge.multiplier}</TableCell>
                    <TableCell>
                      <Button variant="outlined" size="small" onClick={() => handleEdit('surgeConfig', surge)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {tabValue === 4 && (
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Start Hour</TableCell>
                  <TableCell>End Hour</TableCell>
                  <TableCell>Multiplier</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {config.peakHours.map((peak, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{peak.startHour}</TableCell>
                    <TableCell>{peak.endHour}</TableCell>
                    <TableCell>{peak.multiplier}</TableCell>
                    <TableCell>
                      <Button variant="outlined" size="small" onClick={() => handleEdit('peakHours', peak)}>
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>

      {/* Edit Dialog */}
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Edit Configuration</DialogTitle>
        <DialogContent>
          {editItem && Object.keys(editItem).map((key) => {
            if (key === '_id' || key === 'id' || key === '__v' || key === 'createdAt' || key === 'updatedAt') return null;
            return (
              <TextField
                key={key}
                margin="dense"
                name={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                type={typeof editItem[key] === 'number' ? 'number' : 'text'}
                fullWidth
                variant="outlined"
                value={editItem[key]}
                onChange={handleChange}
                disabled={key === 'vehicle' || key === 'city'} // Make ID fields disabled
              />
            )
          })}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PricingConfig;
