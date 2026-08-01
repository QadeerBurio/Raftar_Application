import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Avatar,
  Toolbar
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  DirectionsCar as DirectionsCarIcon,
  TripOrigin as TripOriginIcon,
  Payments as PaymentsIcon,
  BarChart as BarChartIcon,
  Logout as LogoutIcon
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const Sidebar = ({ drawerWidth, mobileOpen, handleDrawerToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('adminUser') || '{}');

  const menuItems = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },
    { text: 'Passengers', icon: <PeopleIcon />, path: '/users' },
    { text: 'Drivers', icon: <DirectionsCarIcon />, path: '/drivers' },
    { text: 'Trips', icon: <TripOriginIcon />, path: '/trips' },
    { text: 'Payments', icon: <PaymentsIcon />, path: '/payments' },
    { text: 'Analytics', icon: <BarChartIcon />, path: '/analytics' },
  ];

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/login');
  };

  const drawer = (
    <>
      <Toolbar sx={{ justifyContent: 'center', py: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Avatar
            src={user.profilePhoto}
            sx={{
              width: 60,
              height: 60,
              mx: 'auto',
              mb: 1,
              bgcolor: '#FFD700'
            }}
          >
            <Typography variant="h5" sx={{ color: '#121212' }}>R</Typography>
          </Avatar>
          <Typography variant="h6" sx={{ color: '#FFD700' }}>
            Raftar Admin
          </Typography>
          <Typography variant="caption" sx={{ color: '#888' }}>
            {user.name || 'Admin'}
          </Typography>
        </Box>
      </Toolbar>
      <Divider sx={{ bgcolor: '#333' }} />
      <List>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.text}
            onClick={() => navigate(item.path)}
            sx={{
              my: 0.5,
              mx: 1,
              borderRadius: 1,
              bgcolor: location.pathname === item.path ? '#2A2A2A' : 'transparent',
              '&:hover': {
                bgcolor: '#2A2A2A',
              },
            }}
          >
            <ListItemIcon
              sx={{
                color: location.pathname === item.path ? '#FFD700' : '#888',
              }}
            >
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.text}
              sx={{
                '& .MuiListItemText-primary': {
                  color: location.pathname === item.path ? '#FFF' : '#888',
                },
              }}
            />
          </ListItem>
        ))}
      </List>
      <Divider sx={{ bgcolor: '#333' }} />
      <List>
        <ListItem button onClick={handleLogout} sx={{ my: 0.5, mx: 1, borderRadius: 1 }}>
          <ListItemIcon sx={{ color: '#FF6B6B' }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText
            primary="Logout"
            sx={{
              '& .MuiListItemText-primary': {
                color: '#FF6B6B',
              },
            }}
          />
        </ListItem>
      </List>
    </>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
    >
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true,
        }}
        sx={{
          display: { xs: 'block', sm: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            backgroundColor: '#1E1E1E',
          },
        }}
      >
        {drawer}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', sm: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: drawerWidth,
            backgroundColor: '#1E1E1E',
          },
        }}
        open
      >
        {drawer}
      </Drawer>
    </Box>
  );
};

export default Sidebar;