# Railway Deployment Limits

## Request Body Size Limits

Railway's reverse proxy has a default **10MB limit** for request bodies. This can cause 413 (Payload Too Large) errors when uploading large video files.

### Current Configuration

- Express body parser limit: **200MB** (configured in `backend/server.js`)
- Railway reverse proxy limit: **10MB** (default, may need configuration)

### Solutions

#### Option 1: Configure Railway Proxy Settings (Recommended)

If Railway allows proxy configuration, you may need to set:
- `client_max_body_size 200m;` (if using nginx)
- Or configure Railway's proxy settings in the Railway dashboard

#### Option 2: Use Direct fal.ai Uploads

Upload files directly to fal.ai from the frontend to bypass the backend entirely:

```javascript
// Upload directly to fal.ai storage
const response = await fetch('https://fal.ai/files', {
  method: 'POST',
  headers: {
    'Authorization': `Key ${FAL_API_KEY}`,
    'Content-Type': 'multipart/form-data',
  },
  body: formData
});
```

#### Option 3: Chunk Large Files

Split large files into smaller chunks and upload them separately, then reassemble on the server.

### Checking Railway Configuration

1. Check Railway dashboard for proxy/nginx configuration options
2. Look for environment variables related to request size limits
3. Check Railway documentation for reverse proxy settings

### Error Handling

The application will show a 413 error if the request body exceeds Railway's limit. The error message will indicate:
- "HTTP error! status: 413"
- This means the request was blocked by Railway's proxy before reaching Express

### Temporary Workaround

For now, users should:
- Use smaller video files (<10MB)
- Or wait for Railway proxy configuration to be updated

