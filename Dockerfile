# Simple Dockerfile for Railway frontend deployment
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all source files
COPY . .

# Build the frontend
RUN npm run build

# Create a simple static server
RUN echo 'const http = require("http"); const fs = require("fs"); const path = require("path"); const PORT = process.env.PORT || 3000; const mimeTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpg", ".gif": "image/gif", ".svg": "image/svg+xml", ".ico": "image/x-icon" }; const server = http.createServer((req, res) => { let filePath = path.join(__dirname, "dist", req.url === "/" ? "index.html" : req.url); fs.access(filePath, fs.constants.F_OK, (err) => { if (err) { filePath = path.join(__dirname, "dist", "index.html"); } const ext = path.extname(filePath).toLowerCase(); const contentType = mimeTypes[ext] || "application/octet-stream"; fs.readFile(filePath, (err, data) => { if (err) { res.writeHead(404, { "Content-Type": "text/html" }); res.end("<h1>404 - File Not Found</h1>"); return; } res.writeHead(200, { "Content-Type": contentType }); res.end(data); }); }); }); server.listen(PORT, "0.0.0.0", () => { console.log(`Server running on port ${PORT}`); });' > server.js

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "server.js"]