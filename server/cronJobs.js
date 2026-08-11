const cron = require('node-cron');
const Ride = require('./models/Ride');
const User = require('./models/User'); // if needed
const Driver = require('./models/Driver'); // if needed

const startCronJobs = (io) => {
  // Check every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const in15Minutes = new Date(now.getTime() + 15 * 60 * 1000);

      const rides = await Ride.find({
        type: { $in: ['intercity', 'carpool'] },
        status: { $in: ['scheduled', 'accepted'] },
        reminderSent: false,
        scheduledTime: { $gt: now, $lte: in15Minutes }
      }).populate('driverId');

      for (const ride of rides) {
        // Send to passenger
        io.to(`user-${ride.passengerId.toString()}`).emit('ride-reminder', {
          rideId: ride._id,
          message: `Reminder: Your ${ride.type} ride is scheduled to start in less than 15 minutes.`
        });

        // Send to driver if assigned
        if (ride.driverId) {
          const driverUserId = ride.driverId.userId ? ride.driverId.userId.toString() : ride.driverId.toString();
          io.to(`user-${driverUserId}`).emit('ride-reminder', {
            rideId: ride._id,
            message: `Reminder: Your ${ride.type} ride is scheduled to start in less than 15 minutes.`
          });
        }

        // Mark as sent
        ride.reminderSent = true;
        await ride.save();
        console.log(`Sent 15-minute reminder for ride ${ride._id}`);
      }
    } catch (error) {
      console.error('Error in cron job for ride reminders:', error);
    }
  });

  console.log('Cron jobs initialized.');
};

module.exports = startCronJobs;
