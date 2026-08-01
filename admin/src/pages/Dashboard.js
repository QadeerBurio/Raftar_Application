import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Box,
  LinearProgress,
} from '@mui/material';
import {
  DirectionsCar,
  People,
  AttachMoney,
  TrendingUp,
  PersonAdd,
  CarRental,
  ShoppingCart,
  Warning
} from '@mui/icons-material';
import { Line, Pie, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement,
} from 'chart.js';
import api from '../services/api';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  BarElement
);

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalDrivers: 0,
    totalEarnings: 0,
    activeRides: 0,
    newUsers: 0,
    pendingDrivers: 0,
    totalTrips: 0,
    cancellationRate: 0,
    averageRating: 0,
  });
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState({
    earningsData: { labels: [], datasets: [] },
    rideTypesData: { labels: [], datasets: [] },
    hoursData: { labels: [], datasets: [] },
  });

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const response = await api.get('/admin/dashboard');
      const data = response.data.stats || {};
      
      setStats({
        totalUsers: data.users?.total || 0,
        totalDrivers: data.drivers?.total || 0,
        totalEarnings: data.revenue?.total || 0,
        activeRides: data.rides?.active || 0,
        newUsers: data.users?.newToday || 0,
        pendingDrivers: data.drivers?.pending || 0,
        totalTrips: data.rides?.total || 0,
        cancellationRate: 0,
        averageRating: data.averageRating || 0,
      });

      // Safely build chart data
      const byType = data.revenue?.byType || [];
      const rideTypesData = {
        labels: byType.map(t => t._id || 'Unknown'),
        datasets: [{
          data: byType.map(t => t.count || 0),
          backgroundColor: ['#FF6B6B', '#4ECDC4', '#FFD700', '#A29BFE', '#FD79A8'],
        }]
      };

      const heatmap = data.heatmap || [];
      const hourlyCounts = new Array(24).fill(0);
      heatmap.forEach(h => {
        if (h._id && h._id.hour !== undefined) {
          hourlyCounts[h._id.hour] += h.count;
        }
      });
      const hoursData = {
        labels: Array.from({length: 24}, (_, i) => `${i}:00`),
        datasets: [{
          label: 'Rides by Hour',
          data: hourlyCounts,
          backgroundColor: '#4ECDC4',
        }]
      };

      const earningsData = {
        labels: ['Current Total'],
        datasets: [{
          label: 'Earnings',
          data: [data.revenue?.total || 0],
          borderColor: '#FFD700',
          tension: 0.4
        }]
      };

      setChartData({
        earningsData,
        rideTypesData,
        hoursData
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ width: '100%', mt: 4 }}>
        <LinearProgress />
      </Box>
    );
  }

  const statCards = [
    {
      title: 'Total Users',
      value: stats.totalUsers,
      icon: <People sx={{ fontSize: 40 }} />,
      color: '#FFD700',
      change: '+12%',
    },
    {
      title: 'Total Drivers',
      value: stats.totalDrivers,
      icon: <DirectionsCar sx={{ fontSize: 40 }} />,
      color: '#FF6B6B',
      change: '+8%',
    },
    {
      title: 'Total Earnings',
      value: `Rs. ${stats.totalEarnings.toLocaleString()}`,
      icon: <AttachMoney sx={{ fontSize: 40 }} />,
      color: '#4ECDC4',
      change: '+15%',
    },
    {
      title: 'Active Rides',
      value: stats.activeRides,
      icon: <TrendingUp sx={{ fontSize: 40 }} />,
      color: '#45B7D1',
      change: '+5%',
    },
    {
      title: 'New Users Today',
      value: stats.newUsers,
      icon: <PersonAdd sx={{ fontSize: 40 }} />,
      color: '#96CEB4',
      change: '+3%',
    },
    {
      title: 'Pending Drivers',
      value: stats.pendingDrivers,
      icon: <CarRental sx={{ fontSize: 40 }} />,
      color: '#FF9F43',
      change: '-2%',
    },
    {
      title: 'Total Trips',
      value: stats.totalTrips,
      icon: <ShoppingCart sx={{ fontSize: 40 }} />,
      color: '#A29BFE',
      change: '+10%',
    },
    {
      title: 'Average Rating',
      value: `${stats.averageRating} / 5.0`,
      icon: <Warning sx={{ fontSize: 40 }} />,
      color: '#FD79A8',
      change: '+0.1',
    },
  ];

  return (
    <Box sx={{ flexGrow: 1, p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#FFD700', mb: 4 }}>
        Dashboard Overview
      </Typography>

      <Grid container spacing={3}>
        {statCards.map((card, index) => (
          <Grid item xs={12} sm={6} md={3} key={index}>
            <Card
              sx={{
                height: '100%',
                backgroundColor: '#1E1E1E',
                '&:hover': {
                  transform: 'translateY(-5px)',
                  transition: 'transform 0.3s ease-in-out',
                },
              }}
            >
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Box>
                    <Typography color="textSecondary" gutterBottom>
                      {card.title}
                    </Typography>
                    <Typography variant="h4" sx={{ color: '#FFF' }}>
                      {card.value}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        color: card.change.startsWith('+') ? '#4ECDC4' : '#FF6B6B',
                      }}
                    >
                      {card.change} from last month
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      backgroundColor: `${card.color}20`,
                      borderRadius: '50%',
                      padding: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {React.cloneElement(card.icon, { sx: { color: card.color } })}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 3, backgroundColor: '#1E1E1E' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#FFF' }}>
              Earnings Overview
            </Typography>
            <Line
              data={chartData.earningsData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    labels: { color: '#FFF' }
                  }
                },
                scales: {
                  y: {
                    ticks: { color: '#FFF' }
                  },
                  x: {
                    ticks: { color: '#FFF' }
                  }
                }
              }}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 3, backgroundColor: '#1E1E1E' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#FFF' }}>
              Ride Types
            </Typography>
            <Pie
              data={chartData.rideTypesData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    labels: { color: '#FFF' }
                  }
                }
              }}
            />
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3, backgroundColor: '#1E1E1E' }}>
            <Typography variant="h6" gutterBottom sx={{ color: '#FFF' }}>
              Peak Hours Activity
            </Typography>
            <Bar
              data={chartData.hoursData}
              options={{
                responsive: true,
                plugins: {
                  legend: {
                    labels: { color: '#FFF' }
                  }
                },
                scales: {
                  y: {
                    ticks: { color: '#FFF' }
                  },
                  x: {
                    ticks: { color: '#FFF' }
                  }
                }
              }}
            />
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Dashboard;