# 🗄️ MongoDB Atlas Setup Guide

## Quick MongoDB Setup for Seiso AI

### 1. Create MongoDB Atlas Account

1. **Sign Up**
   - Go to https://mongodb.com/atlas
   - Click "Try Free"
   - Sign up with email or Google

2. **Create Organization**
   - Choose "Build a new app"
   - Select "I'm learning MongoDB" or "I'm building a new app"
   - Choose your preferred language (Node.js)

### 2. Create Database Cluster

1. **Choose Cloud Provider**
   - Select AWS, Google Cloud, or Azure
   - Choose a region close to your users

2. **Select Cluster Tier**
   - **Free Tier (M0)**: Perfect for development and small apps
   - **Paid Tiers**: For production with more resources

3. **Configure Cluster**
   - Cluster Name: `seiso-ai-cluster` (or any name you prefer)
   - Click "Create Cluster"

### 3. Set Up Database Access

1. **Create Database User**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Username: `seiso-ai-user` (or any username)
   - Password: Generate a strong password (save it!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

2. **Set Up Network Access**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For Railway deployment: Click "Allow Access from Anywhere" (0.0.0.0/0)
   - For development: Add your current IP address
   - Click "Confirm"

### 4. Get Connection String

1. **Connect to Cluster**
   - Go to "Database" in the left sidebar
   - Click "Connect" on your cluster
   - Choose "Connect your application"

2. **Copy Connection String**
   - Driver: Node.js
   - Version: 4.1 or later
   - Copy the connection string

3. **Update Connection String**
   Replace the placeholders in your connection string:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   
   With your actual values:
   ```
   mongodb+srv://seiso-ai-user:your-password@cluster0.xxxxx.mongodb.net/ai-image-generator?retryWrites=true&w=majority
   ```

### 5. Test Connection

1. **Update Backend Environment**
   - Open `backend/.env`
   - Update `MONGODB_URI` with your connection string
   - Save the file

2. **Test Locally**
   ```bash
   cd backend
   node server.js
   ```
   
   You should see:
   ```
   📡 Connecting to MongoDB...
   [INFO] MongoDB connected successfully
   ```

### 6. Environment Variables for Railway

Copy this to your Railway environment variables:

```bash
MONGODB_URI=mongodb+srv://seiso-ai-user:your-password@cluster0.xxxxx.mongodb.net/ai-image-generator?retryWrites=true&w=majority
```

### 7. Security Best Practices

1. **Use Strong Passwords**
   - Generate a random password for your database user
   - Store it securely (password manager)

2. **Network Access**
   - For production: Restrict IP access to Railway's IP ranges
   - For development: Use your specific IP address

3. **Regular Backups**
   - Enable automatic backups in Atlas
   - Test restore procedures

### 8. Monitoring

1. **Atlas Dashboard**
   - Monitor database performance
   - Check connection metrics
   - Set up alerts

2. **Application Monitoring**
   - Use the health check endpoint: `/api/health`
   - Monitor logs in Railway dashboard

## 🚨 Troubleshooting

### Common Issues:

1. **Connection Timeout**
   - Check network access settings
   - Verify IP address is whitelisted
   - Check firewall settings

2. **Authentication Failed**
   - Verify username and password
   - Check user permissions
   - Ensure user has read/write access

3. **DNS Resolution Error**
   - Check internet connection
   - Verify cluster is running
   - Try different DNS servers

### Getting Help:

- **MongoDB Atlas Documentation**: https://docs.atlas.mongodb.com/
- **Community Forum**: https://community.mongodb.com/
- **Support**: Available in Atlas dashboard

## ✅ Success!

Once you see "MongoDB connected successfully" in your logs, your database is ready for deployment!
