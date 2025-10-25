# 🗄️ Quick MongoDB Atlas Setup (5 minutes)

## Step 1: Create MongoDB Atlas Account
1. Go to https://mongodb.com/atlas
2. Click "Try Free"
3. Sign up with email or Google

## Step 2: Create Database Cluster
1. Choose "Build a new app"
2. Select "I'm learning MongoDB"
3. Choose your preferred cloud provider (AWS recommended)
4. Select a region close to you
5. Choose **M0 Sandbox (Free)** tier
6. Click "Create Cluster"

## Step 3: Set Up Database Access
1. **Create Database User:**
   - Go to "Database Access" → "Add New Database User"
   - Authentication Method: "Password"
   - Username: `seiso-ai-user`
   - Password: Generate a strong password (save it!)
   - Database User Privileges: "Read and write to any database"
   - Click "Add User"

2. **Set Up Network Access:**
   - Go to "Network Access" → "Add IP Address"
   - Click "Allow Access from Anywhere" (0.0.0.0/0)
   - Click "Confirm"

## Step 4: Get Connection String
1. Go to "Database" → Click "Connect" on your cluster
2. Choose "Connect your application"
3. Driver: Node.js, Version: 4.1 or later
4. Copy the connection string

## Step 5: Update Connection String
Replace the placeholders in your connection string:

**From:**
```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**To:**
```
mongodb+srv://seiso-ai-user:your-password@cluster0.xxxxx.mongodb.net/ai-image-generator?retryWrites=true&w=majority
```

## Step 6: Test Connection
Update your `backend/.env` file with the new connection string and test:

```bash
cd backend
node server.js
```

You should see:
```
📡 Connecting to MongoDB...
[INFO] MongoDB connected successfully
```

## Step 7: Deploy to Railway
Once MongoDB is working, use the connection string in Railway:

1. Go to Railway dashboard
2. Create new project
3. Connect your GitHub repository
4. Set environment variables (use the ones from the script above)
5. Update `MONGODB_URI` with your actual connection string
6. Deploy!

## 🚨 Troubleshooting

**Connection Timeout:**
- Check network access settings (should allow 0.0.0.0/0)
- Verify username and password
- Check if cluster is running

**Authentication Failed:**
- Double-check username and password
- Ensure user has read/write permissions
- Check if user was created successfully

## ✅ Success!
Once you see "MongoDB connected successfully", you're ready to deploy!
