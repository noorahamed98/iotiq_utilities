module.exports = {
  apps: [{
    name: 'iotiq-backend-dev',
    script: './src/index.js',  // Or your entry point
    instances: 1,
    exec_mode: 'fork',
    watch: true,  // Auto-restart on file changes
    watch_delay: 1000,
    ignore_watch: [
      'node_modules',
      'logs',
      '.git',
      '*.log'
    ],
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      MONGO_URI: 'mongodb://localhost:27017/iotiq_dev',  // Use dev database
      AWS_IOT_ENDPOINT: 'your-iot-endpoint.iot.region.amazonaws.com',
      AWS_REGION: 'ap-south-1',
      LOG_LEVEL: 'debug'  // Verbose logging for testing
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};