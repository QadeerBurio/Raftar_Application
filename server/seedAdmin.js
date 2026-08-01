const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const adminEmail = 'admin@raftar.com';
    const adminPhone = '03000000000';
    
    // Check if admin already exists
    let admin = await User.findOne({ 
      $or: [{ email: adminEmail }, { phoneNumber: adminPhone }] 
    });

    if (admin) {
      console.log('Admin user already exists!');
      // Update password just in case
      admin.password = 'admin123';
      admin.role = 'admin';
      admin.email = adminEmail;
      await admin.save();
      console.log('Admin password reset to: admin123');
    } else {
      // Create new admin
      admin = new User({
        name: 'Super Admin',
        phoneNumber: adminPhone,
        email: adminEmail,
        password: 'admin123',
        role: 'admin',
        isVerified: true,
        isActive: true
      });
      await admin.save();
      console.log('Admin user created successfully!');
    }
    
    console.log('\n--- ADMIN CREDENTIALS ---');
    console.log(`Email: ${adminEmail}`);
    console.log(`Password: admin123`);
    console.log('-------------------------\n');

  } catch (error) {
    console.error('Error seeding admin:', error);
  } finally {
    process.exit(0);
  }
};

seedAdmin();
